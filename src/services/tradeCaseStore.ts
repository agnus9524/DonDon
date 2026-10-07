// ============================================================
// 🗂️ TradeCase 저장소 (2026-10-04)
// ------------------------------------------------------------
// 거래 한 건의 전체 과정(신호 → 주문 → 체결 → 보유 → 청산)을 tradeCaseId 하나로 묶는다.
// 기존 저장소는 그대로 두고, 이 케이스가 그것들을 가리키는 "연결 고리" 역할을 한다.
//   · 신호 기록(signalStore)  : SignalRecord.tradeCaseId  ↔  TradeCase.signalId
//   · 매매 일지(tradeJournal) : OpenLot/ClosedTrade.tradeCaseId
//   · 틱 아카이브             : ID를 넣지 않는다 — 종목 + 시각(entryTime~exitTime)으로 조회
// 케이스에는 다른 저장소에 없는 것만 직접 담는다: 주문번호, 미주문·취소 사유, 보유 구간 스냅샷.
//
// 상태
//   NEAR      : 기준 근처에서 탈락한 신호 (주문 없음 — "샀다면"은 신호의 가상 매매로 본다)
//   SIGNAL    : 통과 신호가 막 생김 — 주문을 기다리는 중(60초 안에 주문이 없으면 NO_ORDER)
//   NO_ORDER  : 통과했지만 주문이 나가지 않음 (슬롯 가득 참, 예수금 부족, 쿨다운 등)
//   ORDERED   : 매수 주문 접수 — 체결 대기
//   CANCELLED : 한 주도 체결되지 않고 취소됨 (만료 / 신호 소멸 / 급락 / 상승 이탈 / KIS에서 종료)
//   OPEN      : 체결되어 보유 중 (일부만 체결됐으면 partial = true)
//   CLOSED    : 전량 청산
//
// 저장: IndexedDB kv — 날짜별 키 `tradeCases:YYYY-MM-DD` (케이스가 만들어진 날 기준)
// ============================================================

import { kvGet, kvSet, isIdbAvailable } from './localDb';
import { kstDateKey, netPctOf, getSignalsForDate, type SignalRecord } from './signalStore';

export type TradeCaseStatus = 'NEAR' | 'SIGNAL' | 'NO_ORDER' | 'ORDERED' | 'CANCELLED' | 'OPEN' | 'CLOSED';
export type BuyCancelKind = 'EXPIRED' | 'SIGNAL_LOST' | 'DROP' | 'RISE' | 'KIS_CLOSED';

/** 보유 구간 스냅샷 — sec 0은 체결 순간 */
export interface CaseSnapshot {
  sec: number;
  price: number;
  netPct: number;        // 체결가 대비 순수익(%)
  exec?: number;         // 체결강도
  cvd?: number;          // 누적 매수 − 누적 매도 체결량
  cvdDelta?: number;     // 약 10초 전 대비 CVD 변화
  vwapGapPct?: number;   // VWAP 대비 이격(%)
  bidVol?: number;       // 총매수호가잔량
  askVol?: number;       // 총매도호가잔량
}

export interface TradeCase {
  tradeCaseId: string;
  dateKey: string;
  symbol: string;
  name: string;
  status: TradeCaseStatus;
  createdAt: number;
  // 신호
  signalId?: string;
  signalKind?: 'PASS' | 'NEAR';
  // 🏷️ (2026-10-07) 매수 경로 — 추세 매수·마감 매수처럼 스캘핑 신호 없이 나간 주문을 구분한다. 비어 있으면 스캘핑.
  route?: string;
  routeNote?: string;
  signalTime?: number;
  signalPrice?: number;
  noOrderReason?: string;
  // 매수 주문
  buyOrderId?: string;
  buyOrderPrice?: number;
  buyOrderQty?: number;
  buyOrderTime?: number;
  cancelKind?: BuyCancelKind;
  cancelReason?: string;
  cancelTime?: number;
  // 체결
  filledQty: number;
  entryPrice?: number;   // 체결 평균가
  entryTime?: number;    // 첫 체결 시각
  partial?: boolean;
  // 💧 익절 기준 — 진입 시점의 5분 거래대금으로 정한 유동성 구분과 그때 적용한 익절 목표(트레일링 시작 순수익 %)
  liquidityTier?: 'LARGE' | 'MID' | 'SMALL';
  targetNetPct?: number;
  stopNetPct?: number;
  tradeValue5mAtEntry?: number;
  // 보유
  maxPrice?: number;
  minPrice?: number;
  snapshots: CaseSnapshot[];
  // 매도 (취소 후 재주문이 있을 수 있어 목록)
  sellOrders: { orderId: string; time: number; price: number; reason?: string }[];
  soldQty: number;
  exitPrice?: number;    // 청산 평균가
  exitTime?: number;
  exitReason?: string;
  netPct?: number;       // 순수익(%) — 매매 일지의 청산 거래 기준, 수량 가중
  netPnl?: number;       // 순손익(원)
  holdSec?: number;
}

export const HOLD_SNAPSHOT_OFFSETS = [10, 30, 60, 180, 300];
const SIGNAL_WAIT_MS = 60000;    // 통과 신호가 주문으로 이어지길 기다리는 시간
const KEY = (dateKey: string) => `tradeCases:${dateKey}`;
const INDEX_KEY = 'tradeCases:index';

const byDate = new Map<string, Map<string, TradeCase>>();   // 메모리에 올라온 날짜들
const live = new Map<string, TradeCase>();                  // 진행 중(SIGNAL/ORDERED/OPEN) 케이스
const byOrderId = new Map<string, string>();                // 매수 주문번호 → tradeCaseId
const dirtyDates = new Set<string>();
const listeners = new Set<() => void>();
let knownDates: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotProvider: ((symbol: string, price: number) => Partial<CaseSnapshot>) | null = null;

export function subscribeTradeCases(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* 무시 */ } });

/** 보유 구간 스냅샷에 넣을 현재 값(체결강도·CVD·VWAP 이격·호가 잔량)을 주는 함수 — App이 등록한다 */
export function setCaseSnapshotProvider(fn: (symbol: string, price: number) => Partial<CaseSnapshot>) { snapshotProvider = fn; }

const newId = (symbol: string, t: number) => `TC-${t.toString(36)}-${symbol}-${Math.random().toString(36).slice(2, 6)}`;

function touch(c: TradeCase) {
  let m = byDate.get(c.dateKey);
  if (!m) { m = new Map(); byDate.set(c.dateKey, m); }
  m.set(c.tradeCaseId, c);
  if (c.status === 'SIGNAL' || c.status === 'ORDERED' || c.status === 'OPEN') live.set(c.tradeCaseId, c);
  else live.delete(c.tradeCaseId);
  dirtyDates.add(c.dateKey);
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; void flushTradeCases(); }, 3000);
  notify();
}

function create(symbol: string, name: string, status: TradeCaseStatus, t: number): TradeCase {
  return { tradeCaseId: newId(symbol, t), dateKey: kstDateKey(t), symbol, name: name || symbol, status, createdAt: t, filledQty: 0, snapshots: [], sellOrders: [], soldQty: 0 };
}

/** 그 종목의 진행 중 케이스(가장 최근) */
function liveOf(symbol: string, statuses: TradeCaseStatus[]): TradeCase | undefined {
  let best: TradeCase | undefined;
  for (const c of live.values()) {
    if (c.symbol !== symbol || !statuses.includes(c.status)) continue;
    if (!best || c.createdAt > best.createdAt) best = c;
  }
  return best;
}

function snapshot(c: TradeCase, sec: number, price: number): CaseSnapshot {
  const extra = (() => { try { return snapshotProvider ? snapshotProvider(c.symbol, price) : {}; } catch { return {}; } })();
  return { ...extra, sec, price, netPct: c.entryPrice ? Number(netPctOf(c.entryPrice, price).toFixed(3)) : 0 };
}

// ------------------------------------------------------------
// 이벤트 — App이 각 지점에서 호출한다. 실패해도 매매에는 영향이 없어야 하므로 호출부에서 try/catch로 감싼다.
// ------------------------------------------------------------

/** 신호 기록 직후. 반환한 tradeCaseId를 신호 기록에도 적는다. */
export function onCaseSignal(sig: { id: string; kind: 'PASS' | 'NEAR'; symbol: string; name: string; time: number; price: number }): string {
  const busy = sig.kind === 'PASS' ? liveOf(sig.symbol, ['ORDERED', 'OPEN']) : undefined;
  const status: TradeCaseStatus = sig.kind === 'NEAR' ? 'NEAR' : busy ? 'NO_ORDER' : 'SIGNAL';
  const c = create(sig.symbol, sig.name, status, sig.time);
  c.signalId = sig.id; c.signalKind = sig.kind; c.signalTime = sig.time; c.signalPrice = sig.price;
  if (busy) c.noOrderReason = busy.status === 'OPEN' ? '이미 보유 중' : '이미 매수 주문 대기 중';
  touch(c);
  return c.tradeCaseId;
}

/** 통과했는데 주문이 나가지 않은 이유를 적어 둔다(주문이 나가면 무시된다) */
export function noteCaseNoOrder(symbol: string, reason: string) {
  const c = liveOf(symbol, ['SIGNAL']);
  if (!c || c.noOrderReason === reason) return;
  c.noOrderReason = reason;
  touch(c);
}

/** 매수 주문이 KIS에 접수됨 */
// 🏷️ 곧 나갈 매수 주문의 경로(추세·마감)와 근거를 미리 적어 둔다 — 주문 접수·체결 때 케이스에 옮겨 적는다(60초 안에)
const pendingRoute: Record<string, { route: string; note: string; at: number }> = {};
export function noteCaseRoute(symbol: string, route: string, note: string) { pendingRoute[symbol] = { route, note, at: Date.now() }; }
function applyRoute(c: TradeCase) {
  const pr = pendingRoute[c.symbol];
  if (!pr) return;
  if (Date.now() - pr.at <= 60000 && !c.route) { c.route = pr.route; c.routeNote = pr.note; }
  delete pendingRoute[c.symbol];
}

export function onCaseBuyOrder(symbol: string, name: string, o: { orderId: string; price: number; qty: number; time: number }): string {
  if (byOrderId.has(o.orderId)) return byOrderId.get(o.orderId)!;
  let c = liveOf(symbol, ['SIGNAL']);
  if (c && o.time - c.createdAt > 90000) c = undefined; // 오래된 신호에는 붙이지 않는다
  if (!c) c = create(symbol, name, 'ORDERED', o.time);    // 신호 기록 없이 나간 주문(신호는 종목당 1분에 1건만 기록됨)
  c.status = 'ORDERED';
  c.noOrderReason = undefined;
  applyRoute(c);
  c.buyOrderId = o.orderId; c.buyOrderPrice = o.price; c.buyOrderQty = o.qty; c.buyOrderTime = o.time;
  byOrderId.set(o.orderId, c.tradeCaseId);
  touch(c);
  return c.tradeCaseId;
}

/** 매수 주문이 취소·종료됨. 이미 일부 체결됐으면 보유(OPEN)로 남고 취소 사유만 적는다. */
export function onCaseBuyCancelled(orderId: string, kind: BuyCancelKind, reason: string, t: number = Date.now()) {
  const id = byOrderId.get(orderId);
  const c = id ? live.get(id) : undefined;
  if (!c) return;
  if (c.buyOrderQty && c.filledQty >= c.buyOrderQty) return; // 전량 체결된 주문 — 취소가 아님
  c.cancelKind = kind; c.cancelReason = reason; c.cancelTime = t;
  if (c.filledQty > 0) c.partial = true; else c.status = 'CANCELLED';
  touch(c);
}

/** 매수 체결. 반환한 tradeCaseId를 매매 일지의 로트에 적는다. */
export function onCaseBuyFill(symbol: string, name: string, price: number, qty: number, t: number = Date.now()): string {
  let c = liveOf(symbol, ['ORDERED', 'OPEN']);
  if (!c) c = create(symbol, name, 'OPEN', t); // 프로그램이 모르던 주문의 체결(수동·복구 주문 등)
  applyRoute(c);
  const prevQty = c.filledQty;
  c.filledQty = prevQty + qty;
  c.entryPrice = prevQty > 0 && c.entryPrice ? (c.entryPrice * prevQty + price * qty) / c.filledQty : price;
  if (!c.entryTime) {
    c.entryTime = t;
    c.maxPrice = price; c.minPrice = price;
  }
  c.status = 'OPEN';
  c.partial = !!c.buyOrderQty && c.filledQty < c.buyOrderQty;
  if (!c.snapshots.some(s => s.sec === 0)) c.snapshots.push(snapshot(c, 0, price));
  touch(c);
  return c.tradeCaseId;
}

/** 이 포지션에 적용한 익절 기준(유동성 구분·목표 순수익)을 케이스에 적는다 */
export function setCaseExitPlan(symbol: string, plan: { tier: 'LARGE' | 'MID' | 'SMALL'; targetNetPct: number; stopNetPct?: number; tradeValue5m?: number }) {
  const c = liveOf(symbol, ['OPEN']);
  if (!c) return;
  c.liquidityTier = plan.tier; c.targetNetPct = plan.targetNetPct; c.stopNetPct = plan.stopNetPct; c.tradeValue5mAtEntry = plan.tradeValue5m;
  touch(c);
}

/** 매도 주문이 KIS에 접수됨 */
export function onCaseSellOrder(symbol: string, o: { orderId: string; price: number; time: number; reason?: string }) {
  const c = liveOf(symbol, ['OPEN']);
  if (!c || c.sellOrders.some(s => s.orderId === o.orderId)) return;
  c.sellOrders.push(o);
  touch(c);
}

/** 매도 체결. closed = 이 체결로 매매 일지가 만든 청산 거래, positionClosed = 이 종목 보유가 0이 됐는지 */
export function onCaseSellFill(symbol: string, price: number, qty: number, exitReason: string | undefined,
  closed: { qty: number; netPct: number; netPnl: number }[], positionClosed: boolean, t: number = Date.now()): string | undefined {
  const c = liveOf(symbol, ['OPEN']);
  if (!c) return undefined;
  const prevSold = c.soldQty;
  c.soldQty = prevSold + qty;
  c.exitPrice = prevSold > 0 && c.exitPrice ? (c.exitPrice * prevSold + price * qty) / c.soldQty : price;
  const cq = closed.reduce((a, x) => a + x.qty, 0);
  if (cq > 0) {
    const prevNetQty = c.netPct !== undefined ? prevSold : 0;
    const addPct = closed.reduce((a, x) => a + x.netPct * x.qty, 0);
    c.netPct = Number((((c.netPct || 0) * prevNetQty + addPct) / (prevNetQty + cq)).toFixed(3));
    c.netPnl = Math.round((c.netPnl || 0) + closed.reduce((a, x) => a + x.netPnl, 0));
  }
  if (exitReason) c.exitReason = exitReason;
  if (positionClosed || (c.filledQty > 0 && c.soldQty >= c.filledQty)) {
    c.status = 'CLOSED';
    c.exitTime = t;
    c.holdSec = c.entryTime ? Math.max(0, Math.round((t - c.entryTime) / 1000)) : undefined;
  }
  touch(c);
  return c.tradeCaseId;
}

/** 체결가를 확인하지 못한 채 포지션이 사라진 경우(외부 매도 반영 실패 등) */
export function closeCaseUnknown(symbol: string, reason: string, t: number = Date.now()) {
  const c = liveOf(symbol, ['OPEN']);
  if (!c) return;
  c.status = 'CLOSED'; c.exitTime = t; c.exitReason = reason;
  c.holdSec = c.entryTime ? Math.max(0, Math.round((t - c.entryTime) / 1000)) : undefined;
  touch(c);
}

/** 실시간 체결가마다 — 보유 중 최고·최저가와 10초·30초·1분·3분·5분 스냅샷 */
export function onCaseTick(symbol: string, price: number, now: number = Date.now()) {
  if (live.size === 0 || !(price > 0)) return;
  for (const c of live.values()) {
    if (c.symbol !== symbol || c.status !== 'OPEN' || !c.entryTime) continue;
    if (c.maxPrice === undefined || price > c.maxPrice) c.maxPrice = price;
    if (c.minPrice === undefined || price < c.minPrice) c.minPrice = price;
    const sec = (now - c.entryTime) / 1000;
    for (const off of HOLD_SNAPSHOT_OFFSETS) {
      if (sec >= off && sec < off + 30 && !c.snapshots.some(s => s.sec === off)) {
        c.snapshots.push(snapshot(c, off, price));
        dirtyDates.add(c.dateKey);
      }
    }
  }
}

/** 1분마다 — 주문으로 이어지지 않은 통과 신호를 NO_ORDER로 마감하고 저장 */
export function sweepTradeCases(now: number = Date.now()) {
  for (const c of [...live.values()]) {
    if (c.status === 'SIGNAL' && now - c.createdAt >= SIGNAL_WAIT_MS) {
      c.status = 'NO_ORDER';
      if (!c.noOrderReason) c.noOrderReason = '주문 없음(사유 기록 없음)';
      touch(c);
    }
  }
  void flushTradeCases();
}

export async function flushTradeCases() {
  if (!isIdbAvailable() || dirtyDates.size === 0) return;
  const dates = [...dirtyDates];
  dirtyDates.clear();
  for (const d of dates) {
    const m = byDate.get(d);
    if (!m) continue;
    try { await kvSet(KEY(d), [...m.values()]); } catch { dirtyDates.add(d); }
    if (!knownDates.includes(d)) {
      knownDates = [...knownDates, d].sort();
      kvSet(INDEX_KEY, knownDates).catch(() => { /* 무시 */ });
    }
  }
}

/** 앱 시작 시 — 최근 3일치를 불러와 진행 중이던 케이스(주문 대기·보유)를 이어서 추적 */
export async function initTradeCases() {
  if (!isIdbAvailable()) return;
  try {
    knownDates = ((await kvGet<string[]>(INDEX_KEY)) || []).sort();
    const today = kstDateKey();
    const toLoad = [...new Set([...knownDates.slice(-3), today])];
    const now = Date.now();
    for (const d of toLoad) {
      const list = (await kvGet<TradeCase[]>(KEY(d))) || [];
      const m = byDate.get(d) || new Map<string, TradeCase>();
      for (const c of list) {
        if (m.has(c.tradeCaseId)) continue; // 시작 직후 이미 만들어진 케이스가 우선
        if (c.status === 'SIGNAL' && now - c.createdAt >= SIGNAL_WAIT_MS) { c.status = 'NO_ORDER'; c.noOrderReason = c.noOrderReason || '주문 없음(앱 재시작)'; dirtyDates.add(d); }
        m.set(c.tradeCaseId, c);
        if (c.status === 'SIGNAL' || c.status === 'ORDERED' || c.status === 'OPEN') {
          live.set(c.tradeCaseId, c);
          if (c.buyOrderId) byOrderId.set(c.buyOrderId, c.tradeCaseId);
        }
      }
      byDate.set(d, m);
    }
    notify();
  } catch { /* 무시 — 메모리에서만 추적 */ }
}

/** 보유가 없는데 OPEN으로 남은 케이스 정리(앱이 꺼진 사이 청산된 경우 등). heldQty: 종목별 현재 보유수량 */
export function reconcileOpenCases(heldQty: (symbol: string) => number, hasPendingBuy: (symbol: string) => boolean, now: number = Date.now()) {
  for (const c of [...live.values()]) {
    if (c.status === 'OPEN' && !(heldQty(c.symbol) > 0) && now - (c.entryTime || c.createdAt) > 60000) {
      c.status = 'CLOSED'; c.exitTime = now; c.exitReason = c.exitReason || 'UNKNOWN(청산 기록 없음)';
      c.holdSec = c.entryTime ? Math.max(0, Math.round((now - c.entryTime) / 1000)) : undefined;
      touch(c);
    } else if (c.status === 'ORDERED' && !hasPendingBuy(c.symbol) && !(heldQty(c.symbol) > 0) && now - (c.buyOrderTime || c.createdAt) > 120000) {
      c.status = 'CANCELLED'; c.cancelKind = 'KIS_CLOSED'; c.cancelReason = '대기 주문 없음(종료 사유 기록 없음)'; c.cancelTime = now;
      touch(c);
    }
  }
}

export async function getCasesForDate(dateKey: string): Promise<TradeCase[]> {
  let m = byDate.get(dateKey);
  if (!m && isIdbAvailable()) {
    const list = (await kvGet<TradeCase[]>(KEY(dateKey)).catch(() => undefined)) || [];
    m = new Map(list.map(c => [c.tradeCaseId, c]));
  }
  return [...(m?.values() || [])].sort((a, b) => a.createdAt - b.createdAt);
}

/** 저장된 모든 날짜의 케이스 (자기최적화 표본용) */
export async function getAllCases(): Promise<TradeCase[]> {
  const out: TradeCase[] = [];
  for (const d of getCaseDates()) out.push(...(await getCasesForDate(d)));
  return out;
}

/**
 * 매매 일지와 케이스의 청산 수량이 맞는지 확인 (연결 검증).
 * 일부 체결 후 나눠 판 거래는 일지에 여러 줄, 케이스는 1건이라 "건수"가 아니라 케이스별 "수량"으로 비교한다.
 */
export async function checkCaseJournalConsistency(dateKey: string, closedTrades: { tradeCaseId?: string; qty: number; symbol: string; exitTime: number }[]) {
  const trades = closedTrades.filter(t => kstDateKey(t.exitTime) === dateKey);
  const journalQtyByCase = new Map<string, number>();
  let journalNoCaseQty = 0;
  for (const t of trades) {
    if (!t.tradeCaseId) { journalNoCaseQty += t.qty; continue; }
    journalQtyByCase.set(t.tradeCaseId, (journalQtyByCase.get(t.tradeCaseId) || 0) + t.qty);
  }
  // 그날 청산된 케이스 (케이스는 만들어진 날 기준으로 저장되므로 전체에서 청산 시각으로 고른다)
  const cases = (await getAllCases()).filter(c => c.soldQty > 0 && c.exitTime !== undefined && kstDateKey(c.exitTime) === dateKey);
  const caseQtyById = new Map(cases.map(c => [c.tradeCaseId, c.soldQty]));
  const mismatches: string[] = [];
  for (const [id, q] of journalQtyByCase) {
    const cq = caseQtyById.get(id);
    if (cq === undefined) mismatches.push(`${id}: 일지 ${q}주 / 케이스 없음`);
    else if (Math.abs(cq - q) > 0.0001) mismatches.push(`${id}: 일지 ${q}주 / 케이스 ${cq}주`);
  }
  for (const c of cases) if (!journalQtyByCase.has(c.tradeCaseId)) mismatches.push(`${c.tradeCaseId}(${c.symbol}): 케이스 ${c.soldQty}주 / 일지 없음`);
  return {
    journalTrades: trades.length,
    journalQty: trades.reduce((a, t) => a + t.qty, 0),
    caseCount: cases.length,
    caseQty: cases.reduce((a, c) => a + c.soldQty, 0),
    journalNoCaseQty,
    mismatches,
    ok: mismatches.length === 0 && journalNoCaseQty === 0,
  };
}

export function getCaseDates(): string[] { return [...new Set([...knownDates, ...byDate.keys()])].sort(); }
export function getTradeCaseStatus() { return { live: live.size, today: byDate.get(kstDateKey())?.size || 0 }; }

// ------------------------------------------------------------
// 📊 조회용 — 케이스 + 신호 기록을 한 줄로 편다 (저장하지 않고 조회할 때 만든다)
// ------------------------------------------------------------
export interface CaseRow {
  c: TradeCase;
  s?: SignalRecord;
  /** 결과 순수익(%) — 청산됐으면 실제 값, 아니면 신호의 가상 매매 값 */
  resultNetPct?: number;
  resultSource: 'ACTUAL' | 'SIM' | 'NONE';
  fillDelaySec?: number;   // 주문 → 첫 체결
  mfePct?: number;         // 보유 중 최고 순수익(%)
  maePct?: number;         // 보유 중 최저 순수익(%)
}

export async function getCaseRows(dateKey: string): Promise<CaseRow[]> {
  const [cases, signals] = await Promise.all([getCasesForDate(dateKey), getSignalsForDate(dateKey).catch(() => [] as SignalRecord[])]);
  const sigById = new Map(signals.map(s => [s.id, s]));
  return cases.map(c => {
    const s = c.signalId ? sigById.get(c.signalId) : undefined;
    const actual = c.status === 'CLOSED' && c.netPct !== undefined;
    return {
      c, s,
      resultNetPct: actual ? c.netPct : s?.sim?.netPct,
      resultSource: actual ? 'ACTUAL' : s?.sim ? 'SIM' : 'NONE',
      fillDelaySec: c.entryTime && c.buyOrderTime ? Math.max(0, Math.round((c.entryTime - c.buyOrderTime) / 100) / 10) : undefined,
      mfePct: c.entryPrice && c.maxPrice ? Number(netPctOf(c.entryPrice, c.maxPrice).toFixed(3)) : undefined,
      maePct: c.entryPrice && c.minPrice ? Number(netPctOf(c.entryPrice, c.minPrice).toFixed(3)) : undefined,
    };
  });
}

/** 조건에 맞는 케이스의 건수·승률·평균 순수익 — 실제 청산(ACTUAL)과 가상(SIM)을 따로 센다 */
export function caseStats(rows: CaseRow[], filter: (r: CaseRow) => boolean = () => true) {
  const pick = (src: 'ACTUAL' | 'SIM') => {
    const list = rows.filter(r => r.resultSource === src && r.resultNetPct !== undefined && filter(r));
    const n = list.length;
    const wins = list.filter(r => (r.resultNetPct as number) > 0).length;
    const avg = n ? list.reduce((a, r) => a + (r.resultNetPct as number), 0) / n : 0;
    return { count: n, winRate: n ? Number(((wins / n) * 100).toFixed(1)) : 0, avgNetPct: Number(avg.toFixed(3)) };
  };
  return { actual: pick('ACTUAL'), sim: pick('SIM') };
}

const STATUS_LABEL: Record<TradeCaseStatus, string> = { NEAR: '근접탈락', SIGNAL: '주문대기', NO_ORDER: '미주문', ORDERED: '체결대기', CANCELLED: '주문취소', OPEN: '보유중', CLOSED: '청산' };
const CANCEL_LABEL: Record<BuyCancelKind, string> = { EXPIRED: '30초 만료', SIGNAL_LOST: '신호 소멸', DROP: '급락 이탈', RISE: '상승 이탈', KIS_CLOSED: 'KIS에서 종료' };

export function caseRowsToCsv(rows: CaseRow[]): string {
  const esc = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const tm = (t?: number) => (t ? new Date(t).toLocaleString('ko-KR', { hour12: false }) : '');
  const snapCols = [0, ...HOLD_SNAPSHOT_OFFSETS];
  const header = [
    '케이스ID', '생성시각', '종목코드', '종목명', '상태', '미주문·취소 사유', '일부체결', '매수경로', '매수근거',
    '신호ID', '신호구분', '등급', '점수', '기준점수', 'Bull', 'Bear', '체결강도', 'VWAP이격(%)', 'CVD', 'CVD변화', '스프레드(틱)', '매수/매도잔량(%)', '60초체결', '5분거래대금', '신호가',
    '주문번호', '주문시각', '주문가', '주문수량', '체결시각', '체결까지(초)', '체결가', '체결수량', '유동성구분', '익절기준(%)', '손절기준(%)', '진입 5분거래대금',
    '매도주문수', '청산시각', '청산가', '청산사유', '순수익(%)', '순손익(원)', '보유(초)', '보유중최고(%)', '보유중최저(%)',
    '결과(%)', '결과구분', '신호 가상매매(%)', '신호 가상청산',
    ...snapCols.flatMap(o => [`${o}초_순수익(%)`, `${o}초_체결강도`, `${o}초_CVD변화`, `${o}초_VWAP이격(%)`, `${o}초_매수/매도잔량(%)`]),
    '점수항목',
  ];
  const lines = rows.map(({ c, s, resultNetPct, resultSource, fillDelaySec, mfePct, maePct }) => {
    const snap = (o: number) => c.snapshots.find(x => x.sec === o);
    return [
      c.tradeCaseId, tm(c.createdAt), c.symbol, c.name, STATUS_LABEL[c.status],
      c.status === 'NO_ORDER' ? (c.noOrderReason || '') : c.cancelKind ? `${CANCEL_LABEL[c.cancelKind]}${c.cancelReason ? ` — ${c.cancelReason}` : ''}` : '',
      c.partial ? 1 : '',
      c.route || (c.buyOrderId || c.entryTime ? (c.signalId ? '스캘핑' : '스캘핑(신호 기록 없음)') : ''), c.routeNote || '',
      c.signalId || '', s ? (s.kind === 'PASS' ? '통과' : '근접탈락') : '', s?.grade ?? '', s?.score ?? '', s?.threshold ?? '', s?.bull ?? '', s?.bear ?? '',
      s?.execStrength ?? '', s?.vwapGapPct ?? '', s?.cvd ?? '', s?.cvdDelta ?? '', s?.spreadTicks ?? '', s?.bidAskRatio ?? '', s?.ticks60s ?? '', s?.tradeValue5m ?? '', c.signalPrice ?? '',
      c.buyOrderId || '', tm(c.buyOrderTime), c.buyOrderPrice ?? '', c.buyOrderQty ?? '', tm(c.entryTime), fillDelaySec ?? '', c.entryPrice !== undefined ? Math.round(c.entryPrice) : '', c.filledQty || '',
      c.liquidityTier ? ({ LARGE: '대형', MID: '중형', SMALL: '소형' } as const)[c.liquidityTier] : '', c.targetNetPct ?? '', c.stopNetPct ?? '', c.tradeValue5mAtEntry ?? '',
      c.sellOrders.length || '', tm(c.exitTime), c.exitPrice !== undefined ? Math.round(c.exitPrice) : '', c.exitReason || '', c.netPct ?? '', c.netPnl ?? '', c.holdSec ?? '', mfePct ?? '', maePct ?? '',
      resultNetPct ?? '', resultSource === 'ACTUAL' ? '실제' : resultSource === 'SIM' ? '가상' : '',
      s?.sim?.netPct ?? '', s?.sim ? ({ TRAIL: '트레일링', STOP: '손절', TIMEOUT: '30분 경과' } as const)[s.sim.exitReason] : '',
      ...snapCols.flatMap(o => {
        const x = snap(o);
        return [x?.netPct ?? '', x?.exec ?? '', x?.cvdDelta ?? '', x?.vwapGapPct ?? '', x && x.bidVol && x.askVol ? Math.round((x.bidVol / x.askVol) * 100) : ''];
      }),
      (s?.breakdown || []).join(' | '),
    ];
  });
  return '﻿' + [header, ...lines].map(r => r.map(esc).join(',')).join('\n');
}
