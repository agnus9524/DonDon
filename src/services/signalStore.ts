// ============================================================
// 🧪 신호 스냅샷 저장소 — 자기최적화 1단계 "기록" (2026-09-30)
// ------------------------------------------------------------
// 무엇을 저장하나
//   PASS : 매수 조건을 모두 통과한 순간 (실제 주문 여부와 무관 — 실매매는 매매 일지에 따로 남는다)
//   NEAR : 기준 근처에서 탈락한 순간 (공통 차단 1개 이하 + 점수가 기준 −10점 이상 등)
//          → "기준을 낮췄다면 어땠을까"를 나중에 검증하려면 안 산 신호의 이후 움직임이 꼭 필요하다
// 각 신호마다
//   · 그 순간의 센서/수급/호가/점수 스냅샷
//   · 이후 가격 경로 (1·5·10·30초, 1·3·5·10·15·30분) + 최고/최저가
//   · 가상 매매 결과 — 신호 순간 가격에 샀다고 보고 당시 규칙(목표 순수익 도달 후 고점 2틱 하락 매도 / 손절)으로 시뮬레이션
// 저장소: IndexedDB(브라우저) + 지정한 PC 폴더에 날짜별 CSV 자동 저장
// ============================================================

import { signalPut, signalPutMany, signalsByDate, kvGet, kvSet, isIdbAvailable } from './localDb';

// WATCH (2026-10-06): 핵심 조건(체결강도 기준 이상 · VWAP 위)만 맞고 나머지가 여러 개 부족한 '관찰 신호'.
// 실제 주문과 무관하게 가상 매매 결과만 쌓는다 — 어느 조건을 풀면 성과가 어떻게 되는지 보기 위한 자료.
export type SignalKind = 'PASS' | 'NEAR' | 'WATCH';
const WATCH_THROTTLE_MS = 5 * 60000; // 관찰 신호는 종목당 5분에 1건
const WATCH_ROOM = 60;               // 추적 자리가 이만큼 안 남으면 관찰 신호는 받지 않는다(통과·근접 신호 보호)

export interface SignalRecord {
  id: string;
  dateKey: string;           // KST YYYY-MM-DD
  time: number;
  session: 'REGULAR' | 'AFTER';
  symbol: string;
  name: string;
  kind: SignalKind;
  grade: 'A' | 'B';
  verdict: string;
  blockReasons: string[];
  score: number;
  threshold: number;
  groups: { ex: number; pe: number; vw: number; su: number; ob: number };
  breakdown: string[];
  flags: { C: boolean; E: boolean; D: boolean; P: boolean; B: boolean; VA: boolean; peakBreakout: boolean; A: boolean; Q: boolean };
  // 수급
  price: number;
  execStrength?: number;
  execDelta4s?: number;       // 체결강도 − 최근 4초 평균
  ticks60s?: number;
  tradeValue5m?: number;
  volRatio?: number;          // 최근 거래량 증가분 ÷ 평소 증가분
  changePercent?: number;
  // 위치/추세
  rsi?: number;
  sma5?: number;
  sma20?: number;
  vwap?: number;
  vwapGapPct?: number;
  // (2026-10-06) 기록 전용 — 매수 판단에는 쓰지 않는다. 자료가 쌓이면 조건으로 쓸지 정한다.
  tier?: 'LARGE' | 'MID' | 'SMALL';   // 신호 당시 유동성 구분
  high3mGapPct?: number;              // 최근 3분 고점 대비 현재가가 내려와 있는 %(0에 가까울수록 고점 근처)
  rise3mPct?: number;                 // 최근 3분 상승률 %
  ticks60sPrev?: number;              // 30초 전 기준 60초 체결 건수(지금 값과 비교해 늘었는지 줄었는지)
  closePrice?: number;                // 그날 정규장 종가(장 마감 뒤 채움)
  closeNetPct?: number;               // 신호가에 사서 종가에 팔았을 때 순수익 %
  cvd?: number;
  // 호가
  cvdDelta?: number;
  bid1?: number;
  ask1?: number;
  spreadTicks?: number;
  bidVol?: number;
  askVol?: number;
  bidAskRatio?: number;
  askVolChange8sPct?: number; // 총매도잔량 8초 전 대비 변화율(%) — 음수면 매도벽 감소
  // 🐂🐻 (2026-10-02) Bull/Bear · OBI
  bullishRun1m?: number;      // 완성된 1분봉 연속 양봉 수
  bull?: number;
  bear?: number;
  obi?: number;
  bullReasons?: string[];
  bearReasons?: string[];
  // 규칙
  rule: { targetNet: number; stopNet: number; trailTicks: number };
  // 추적 결과
  status: 'OPEN' | 'DONE' | 'INCOMPLETE';
  path: Record<string, number>;  // '1s','5s',...,'30m' → 가격
  maxPrice: number;
  minPrice: number;
  maxAtSec: number;
  minAtSec: number;
  mfeNetPct: number;
  maeNetPct: number;
  hitTarget: boolean;
  hitTargetSec?: number;
  sim?: { exitReason: 'TRAIL' | 'STOP' | 'TIMEOUT'; exitPrice: number; netPct: number; sec: number };
  // 💰 (2026-10-04) 매도 규칙 비교용 가상 매매 — 같은 신호를 익절 목표·손절폭·트레일링 틱 조합별로 따로 시뮬레이션한다.
  //   키 = sellKey(목표 순수익, 손절 순손실, 트레일 틱). r: 청산 사유, n: 순수익(%), s: 보유(초)
  //   이 필드가 있는 신호(2026-10-04 이후 기록)만 매도 규칙 최적화 표본이 된다.
  sims?: Record<string, { r: 'TRAIL' | 'STOP' | 'TIMEOUT'; n: number; s: number }>;
  // 🧪 (2026-10-07) 기록 전용 — 완화된 매수 구조(B/B+) 후보 표시와 물타기 가상 매매. 실제 매수 판단에는 쓰지 않는다.
  //   B  = 체결강도 ≥100 · 60초 체결 ≥20 · 5분 거래대금 ≥3,000만 · VWAP 위 · 스프레드 ≤2틱 · Bull > Bear
  //   B+ = B + 체결강도 ≥120 · 60초 체결 ≥30
  bCand?: 'B' | 'B+';
  // 📏 (2026-10-07) 기록 전용 — 종목의 평소(최근 30분 중앙값) 매수/매도 잔량 비율과, 평소 대비로 다시 센 Bear
  bookRatioBasePct?: number;   // 평소 잔량 비율 %
  bookRatioRel?: number;       // 현재 비율 ÷ 평소 (1이면 평소와 같음, 0.5면 평소의 절반으로 약해짐)
  bearRel?: number;            // 호가 항목을 평소 대비로 바꿔 계산한 Bear
  avgRule?: { stepMult: number; maxSlots: number; gapSec: number };  // 신호 당시 물타기 설정
  //   물타기 가상 매매 상태 — slots: 슬롯 수, avg: 평단, peak: 마지막 매수 뒤 고점, lastAddSec: 마지막 추가 매수 시점(초)
  //   done: r = TRAIL(익절) / STOP(슬롯 소진 후 손절) / OPEN(30분 안에 청산 못 함), n = 평단 대비 순수익 %, s = 보유(초)
  avgSim?: { slots: number; avg: number; peak: number; lastAddSec: number; done?: { r: 'TRAIL' | 'STOP' | 'OPEN'; n: number; s: number } };
  tradeCaseId?: string;      // 🗂️ (2026-10-04) 이 신호가 속한 거래 케이스(tradeCaseStore)
  lastTickAt: number;
}

/** 매도 규칙 비교 격자 — 자기최적화가 고를 수 있는 값은 이 안에 있어야 한다 */
export const SELL_GRID = {
  target: [0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5],   // 익절 목표(트레일링 시작) 순수익 % — (2026-10-04) 유동성 구분별 기준(0.5/0.8/1.2)과 그 주변 값
  stop: [-0.5, -0.6, -0.8, -1.0, -1.2],   // 손절 순손실 % — (2026-10-04) 유동성 구분별 기준(−0.6/−0.8/−1.0)과 그 주변 값
  trail: [2, 3],                       // 고점 대비 하락 틱
};
export const sellKey = (targetNet: number, stopNet: number, trailTicks: number) => `${Number(targetNet)}|${-Math.abs(Number(stopNet))}|${Number(trailTicks)}`;

const OFFSETS: [string, number][] = [['1s', 1], ['5s', 5], ['10s', 10], ['30s', 30], ['1m', 60], ['3m', 180], ['5m', 300], ['10m', 600], ['15m', 900], ['30m', 1800]];
const TRACK_SEC = 1800;
const MAX_ACTIVE = 300;
const THROTTLE_MS = 60000;

// 비용 — 매수·매도 수수료 각 0.014%, 매도 제세금 0.20%
const FEE = 0.00014;
const TAX = 0.0020;
export const netPctOf = (entry: number, exit: number) => ((exit * (1 - FEE - TAX)) - entry * (1 + FEE)) / (entry * (1 + FEE)) * 100;
const tickOf = (p: number) => p >= 500000 ? 1000 : p >= 200000 ? 500 : p >= 50000 ? 100 : p >= 20000 ? 50 : p >= 5000 ? 10 : p >= 2000 ? 5 : 1;

export const kstDateKey = (t: number = Date.now()) => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);

const active = new Map<string, SignalRecord>();     // id → 추적 중인 신호
const lastRecordedAt: Record<string, number> = {};  // `${symbol}|${kind}` → 마지막 기록 시각
const dirty = new Set<string>();
const listeners = new Set<() => void>();
let todayCount = 0;
let todayKey = kstDateKey();

export function subscribeSignalStore(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* 무시 */ } });

export function getSignalStoreStatus() {
  if (kstDateKey() !== todayKey) { todayKey = kstDateKey(); todayCount = 0; }
  return { active: active.size, todayCount, idb: isIdbAvailable() };
}

/** 같은 종목·종류는 1분에 1건까지만 기록 */
/** 완화된 매수 구조 후보 판정(기록 전용) */
function bCandOf(r: { execStrength?: number; ticks60s?: number; tradeValue5m?: number; spreadTicks?: number; bull?: number; bear?: number; flags?: { VA?: boolean } }): 'B' | 'B+' | undefined {
  const es = Number(r.execStrength) || 0, tk = Number(r.ticks60s) || 0;
  const isB = es >= 100 && tk >= 20 && (Number(r.tradeValue5m) || 0) >= 30_000_000 && !!r.flags?.VA
    && typeof r.spreadTicks === 'number' && r.spreadTicks <= 2
    && typeof r.bull === 'number' && typeof r.bear === 'number' && r.bull > r.bear;
  if (!isB) return undefined;
  return es >= 120 && tk >= 30 ? 'B+' : 'B';
}

export function canRecordSignal(symbol: string, kind: SignalKind): boolean {
  const k = `${symbol}|${kind}`;
  return Date.now() - (lastRecordedAt[k] || 0) >= (kind === 'WATCH' ? WATCH_THROTTLE_MS : THROTTLE_MS);
}

export function recordSignal(input: Omit<SignalRecord, 'id' | 'dateKey' | 'status' | 'path' | 'maxPrice' | 'minPrice' | 'maxAtSec' | 'minAtSec' | 'mfeNetPct' | 'maeNetPct' | 'hitTarget' | 'lastTickAt'>): string | null {
  if (!(input.price > 0)) return null;
  if (!canRecordSignal(input.symbol, input.kind)) return null;
  if (input.kind === 'WATCH' && active.size >= MAX_ACTIVE - WATCH_ROOM) return null;
  lastRecordedAt[`${input.symbol}|${input.kind}`] = input.time;
  const rec: SignalRecord = {
    ...input,
    id: `${input.time.toString(36)}-${input.symbol}-${input.kind}-${Math.random().toString(36).slice(2, 6)}`,
    dateKey: kstDateKey(input.time),
    status: 'OPEN',
    path: {},
    maxPrice: input.price, minPrice: input.price, maxAtSec: 0, minAtSec: 0,
    mfeNetPct: Number(netPctOf(input.price, input.price).toFixed(3)),
    maeNetPct: Number(netPctOf(input.price, input.price).toFixed(3)),
    hitTarget: false,
    bCand: bCandOf(input),
    avgSim: input.avgRule ? { slots: 1, avg: input.price, peak: input.price, lastAddSec: 0 } : undefined,
    sims: {},
    lastTickAt: input.time,
  };
  if (active.size >= MAX_ACTIVE) {
    const oldest = [...active.values()].sort((a, b) => a.time - b.time)[0];
    if (oldest) finalize(oldest, 'INCOMPLETE');
  }
  active.set(rec.id, rec);
  if (kstDateKey() !== todayKey) { todayKey = kstDateKey(); todayCount = 0; }
  todayCount++;
  signalPut(rec).catch(() => { /* 저장 실패 — 메모리 추적은 계속 */ });
  notify();
  return rec.id;
}

/** 🗂️ 신호 기록에 거래 케이스 ID를 적는다 (기록 직후 호출) */
export function setSignalTradeCase(signalId: string, tradeCaseId: string) {
  const rec = active.get(signalId);
  if (!rec) return;
  rec.tradeCaseId = tradeCaseId;
  dirty.add(signalId);
}

/** 실시간 체결가마다 호출 — 해당 종목을 추적 중인 신호들의 경로·가상 매매를 갱신 */
export function onSignalTick(symbol: string, price: number, now: number = Date.now()) {
  if (!(price > 0) || active.size === 0) return;
  for (const rec of active.values()) {
    if (rec.symbol !== symbol) continue;
    const sec = (now - rec.time) / 1000;
    rec.lastTickAt = now;
    if (price > rec.maxPrice) { rec.maxPrice = price; rec.maxAtSec = Math.round(sec); }
    if (price < rec.minPrice) { rec.minPrice = price; rec.minAtSec = Math.round(sec); }
    for (const [label, off] of OFFSETS) {
      if (rec.path[label] === undefined && sec >= off) { rec.path[label] = price; dirty.add(rec.id); }
    }
    const net = netPctOf(rec.price, price);
    const maxNet = netPctOf(rec.price, rec.maxPrice);
    rec.mfeNetPct = Number(maxNet.toFixed(3));
    rec.maeNetPct = Number(netPctOf(rec.price, rec.minPrice).toFixed(3));
    if (!rec.hitTarget && maxNet >= rec.rule.targetNet) { rec.hitTarget = true; rec.hitTargetSec = Math.round(sec); dirty.add(rec.id); }
    if (!rec.sim) {
      if (rec.hitTarget && rec.maxPrice - price >= rec.rule.trailTicks * tickOf(rec.maxPrice)) {
        rec.sim = { exitReason: 'TRAIL', exitPrice: price, netPct: Number(net.toFixed(3)), sec: Math.round(sec) };
        dirty.add(rec.id);
      } else if (net <= rec.rule.stopNet) {
        rec.sim = { exitReason: 'STOP', exitPrice: price, netPct: Number(net.toFixed(3)), sec: Math.round(sec) };
        dirty.add(rec.id);
      }
    }
    // 💰 매도 규칙 조합별 가상 매매 — 실전과 같은 방식(고점 순수익이 목표에 닿은 뒤 고점에서 N틱 하락 → 매도 / 순손실이 손절선 이하 → 손절)
    if (rec.sims) {
      const peakDrop = rec.maxPrice - price;
      const tk = tickOf(rec.maxPrice);
      for (const t of SELL_GRID.target) for (const st of SELL_GRID.stop) for (const k of SELL_GRID.trail) {
        const key = sellKey(t, st, k);
        if (rec.sims[key]) continue;
        if (maxNet >= t && peakDrop >= k * tk) { rec.sims[key] = { r: 'TRAIL', n: Number(net.toFixed(3)), s: Math.round(sec) }; dirty.add(rec.id); }
        else if (net <= st) { rec.sims[key] = { r: 'STOP', n: Number(net.toFixed(3)), s: Math.round(sec) }; dirty.add(rec.id); }
      }
    }
    // 🧪 물타기 가상 매매 — 실전 규칙과 같은 순서: 평단 대비 순손실이 단계 폭(손절 기준 × 배수)에 닿으면 1슬롯 추가,
    //   슬롯을 다 쓴 뒤 같은 폭만큼 더 내리면 손절, 평단 대비 고점 순수익이 목표에 닿은 뒤 고점에서 N틱 내리면 익절.
    if (rec.avgSim && rec.avgRule && !rec.avgSim.done) {
      const a = rec.avgSim;
      const step = Math.abs(rec.rule.stopNet) * rec.avgRule.stepMult;
      if (price > a.peak) a.peak = price;
      const netA = netPctOf(a.avg, price);
      if (netPctOf(a.avg, a.peak) >= rec.rule.targetNet && a.peak - price >= rec.rule.trailTicks * tickOf(a.peak)) {
        a.done = { r: 'TRAIL', n: Number(netA.toFixed(3)), s: Math.round(sec) }; dirty.add(rec.id);
      } else if (netA <= -step) {
        if (a.slots >= rec.avgRule.maxSlots) { a.done = { r: 'STOP', n: Number(netA.toFixed(3)), s: Math.round(sec) }; dirty.add(rec.id); }
        else if (a.slots === 1 || sec - a.lastAddSec >= rec.avgRule.gapSec) {
          a.avg = (a.avg * a.slots + price) / (a.slots + 1); a.slots += 1; a.peak = price; a.lastAddSec = sec; dirty.add(rec.id);
        }
      }
    }
    if (sec >= TRACK_SEC) finalize(rec, 'DONE', price);
  }
}

function finalize(rec: SignalRecord, status: 'DONE' | 'INCOMPLETE', lastPrice?: number) {
  const p = lastPrice ?? rec.path['30m'] ?? rec.path['15m'] ?? rec.path['10m'] ?? rec.path['5m'] ?? rec.price;
  if (!rec.sim && status === 'DONE') {
    rec.sim = { exitReason: 'TIMEOUT', exitPrice: p, netPct: Number(netPctOf(rec.price, p).toFixed(3)), sec: TRACK_SEC };
  }
  if (rec.avgSim && !rec.avgSim.done && status === 'DONE') {
    rec.avgSim.done = { r: 'OPEN', n: Number(netPctOf(rec.avgSim.avg, p).toFixed(3)), s: TRACK_SEC };
  }
  if (rec.sims && status === 'DONE') {
    const n = Number(netPctOf(rec.price, p).toFixed(3));
    for (const t of SELL_GRID.target) for (const st of SELL_GRID.stop) for (const k of SELL_GRID.trail) {
      const key = sellKey(t, st, k);
      if (!rec.sims[key]) rec.sims[key] = { r: 'TIMEOUT', n, s: TRACK_SEC };
    }
  }
  rec.status = status;
  active.delete(rec.id);
  dirty.delete(rec.id);
  signalPut(rec).catch(() => { /* 무시 */ });
  notify();
}

/** 1분마다 호출 — 30분 지난 신호 마감, 바뀐 신호 중간 저장(새로고침 대비) */
export function sweepSignals(now: number = Date.now()) {
  for (const rec of [...active.values()]) {
    const sec = (now - rec.time) / 1000;
    if (sec >= TRACK_SEC + 60) {
      // 30분이 지났는데 틱이 안 와서 마감 못 한 경우(인벤토리에서 빠져 시세가 끊김 등)
      finalize(rec, rec.path['30m'] !== undefined ? 'DONE' : 'INCOMPLETE');
    }
  }
  if (dirty.size > 0) {
    const recs = [...dirty].map(id => active.get(id)).filter(Boolean) as SignalRecord[];
    dirty.clear();
    if (recs.length) signalPutMany(recs).catch(() => { /* 무시 */ });
  }
}

/** 앱 시작 시 — 오늘 추적 중이던(OPEN) 신호를 이어서 추적하거나, 30분 지난 것은 미완료로 마감 */
export async function restoreOpenSignals() {
  if (!isIdbAvailable()) return;
  try {
    const recs = await signalsByDate<SignalRecord>(kstDateKey());
    const now = Date.now();
    todayKey = kstDateKey();
    todayCount = recs.length;
    for (const r of recs) {
      if (r.status !== 'OPEN') continue;
      if ((now - r.time) / 1000 >= TRACK_SEC) { r.status = r.path['30m'] !== undefined ? 'DONE' : 'INCOMPLETE'; signalPut(r).catch(() => {}); }
      else active.set(r.id, r);
      lastRecordedAt[`${r.symbol}|${r.kind}`] = Math.max(lastRecordedAt[`${r.symbol}|${r.kind}`] || 0, r.time);
    }
    notify();
  } catch { /* 무시 */ }
}

// ------------------------------------------------------------
// 📄 CSV
// ------------------------------------------------------------
const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const b = (v: boolean | undefined) => (v === undefined ? '' : v ? 1 : 0);

export function signalsToCsv(list: SignalRecord[]): string {
  const header = [
    '시각', '종목코드', '종목명', '세션', '구분', '등급', '판정', '차단사유', '점수', '기준점수',
    '수급점수', '가격점수', '위치점수', '추세점수', '호가점수',
    'C', 'E', 'D', 'P', 'B', 'VWAP위', '전고점돌파직후', 'A(매도호가소진)', 'Q(거래량모멘텀)',
    '가격', '체결강도', '체결강도변화(4초)', '60초체결', '5분거래대금', '거래량배수', '등락률(%)',
    'RSI', 'SMA5', 'SMA20', 'VWAP', 'VWAP이격(%)', 'CVD',
    '매수1호가', '매도1호가', '스프레드(틱)', '매수잔량', '매도잔량', '매수/매도잔량(%)', '매도잔량8초변화(%)',
    '1분연속양봉', 'Bull', 'Bear', 'OBI', 'Bull항목', 'Bear항목',
    ...OFFSETS.map(([l]) => `가격_${l}`), ...OFFSETS.map(([l]) => `순수익_${l}(%)`),
    '최고가', '최고가(초)', '최저가', '최저가(초)', 'MFE순(%)', 'MAE순(%)', '목표도달', '목표도달(초)',
    '가상매도', '가상매도가', '가상순수익(%)', '가상보유(초)', '목표순수익', '손절순손실', '트레일틱', '추적상태', '점수항목', '케이스ID',
    '유동성구분', '3분고점대비(%)', '3분상승률(%)', '60초체결(30초전)', '종가', '종가보유순수익(%)',
    'B후보', '평소잔량비(%)', '잔량비/평소', 'Bear(평소대비)', '물타기가상', '물타기슬롯', '물타기평단', '물타기순수익(%)', '물타기손익(1슬롯금액대비%)', '물타기보유(초)',
  ];
  const rows = list.sort((x, y) => x.time - y.time).map(r => [
    new Date(r.time).toLocaleString('ko-KR', { hour12: false }), r.symbol, r.name, r.session === 'AFTER' ? '애프터' : '정규',
    r.kind === 'PASS' ? '통과' : r.kind === 'WATCH' ? '관찰' : '근접탈락', r.grade, r.verdict, (r.blockReasons || []).join(' | '), r.score, r.threshold,
    r.groups?.ex, r.groups?.pe, r.groups?.vw, r.groups?.su, r.groups?.ob,
    b(r.flags?.C), b(r.flags?.E), b(r.flags?.D), b(r.flags?.P), b(r.flags?.B), b(r.flags?.VA), b(r.flags?.peakBreakout), b(r.flags?.A), b(r.flags?.Q),
    r.price, r.execStrength ?? '', r.execDelta4s ?? '', r.ticks60s ?? '', r.tradeValue5m ?? '', r.volRatio ?? '', r.changePercent ?? '',
    r.rsi ?? '', r.sma5 ?? '', r.sma20 ?? '', r.vwap ?? '', r.vwapGapPct ?? '', r.cvd ?? '',
    r.bid1 ?? '', r.ask1 ?? '', r.spreadTicks ?? '', r.bidVol ?? '', r.askVol ?? '', r.bidAskRatio ?? '', r.askVolChange8sPct ?? '',
    r.bullishRun1m ?? '', r.bull ?? '', r.bear ?? '', r.obi ?? '', (r.bullReasons || []).join(' | '), (r.bearReasons || []).join(' | '),
    ...OFFSETS.map(([l]) => r.path?.[l] ?? ''),
    ...OFFSETS.map(([l]) => (r.path?.[l] !== undefined ? Number(netPctOf(r.price, r.path[l]).toFixed(3)) : '')),
    r.maxPrice, r.maxAtSec, r.minPrice, r.minAtSec, r.mfeNetPct, r.maeNetPct, b(r.hitTarget), r.hitTargetSec ?? '',
    r.sim ? ({ TRAIL: '트레일링', STOP: '손절', TIMEOUT: '30분 경과' } as const)[r.sim.exitReason] : '',
    r.sim?.exitPrice ?? '', r.sim?.netPct ?? '', r.sim?.sec ?? '',
    r.rule?.targetNet, r.rule?.stopNet, r.rule?.trailTicks,
    r.status === 'DONE' ? '완료' : r.status === 'OPEN' ? '추적중' : '미완료(시세 끊김)',
    (r.breakdown || []).join(' | '), r.tradeCaseId || '',
    r.tier ? ({ LARGE: '대형', MID: '중형', SMALL: '소형' } as const)[r.tier] : '', r.high3mGapPct ?? '', r.rise3mPct ?? '', r.ticks60sPrev ?? '',
    r.closePrice ?? '', r.closeNetPct ?? '',
    r.bCand ?? '', r.bookRatioBasePct ?? '', r.bookRatioRel ?? '', r.bearRel ?? '',
    r.avgSim ? (r.avgSim.done ? ({ TRAIL: '익절', STOP: '슬롯 소진 손절', OPEN: '30분 미청산' } as const)[r.avgSim.done.r] : '진행중') : '',
    r.avgSim?.slots ?? '', r.avgSim ? Math.round(r.avgSim.avg) : '',
    r.avgSim?.done?.n ?? '', r.avgSim?.done ? Number((r.avgSim.done.n * r.avgSim.slots).toFixed(3)) : '', r.avgSim?.done?.s ?? '',
  ]);
  return '﻿' + [header, ...rows].map(row => row.map(esc).join(',')).join('\n');
}

/**
 * 📌 (2026-10-06) 그날 신호 전부에 정규장 종가와 "신호가에 사서 종가까지 들고 있었을 때 순수익"을 적는다.
 * 몇 분 단위 가상 매매와 종가 보유를 매일 비교하기 위한 기록. 돌려주는 값은 채운 건수.
 */
export async function applyClosePrices(dateKey: string, closeBySymbol: Record<string, number>): Promise<number> {
  const list = await getSignalsForDate(dateKey);
  let n = 0;
  for (const r of list) {
    const c = Number(closeBySymbol[r.symbol]);
    if (!(c > 0) || !(r.price > 0)) continue;
    r.closePrice = c;
    r.closeNetPct = Number(netPctOf(r.price, c).toFixed(3));
    const live = active.get(r.id);
    if (live && live !== r) { live.closePrice = r.closePrice; live.closeNetPct = r.closeNetPct; }
    try { await signalPut(r); n++; } catch { /* 저장 실패는 건너뜀 */ }
  }
  if (n > 0) notify();
  return n;
}

export async function getSignalsForDate(dateKey: string): Promise<SignalRecord[]> {
  const stored = await signalsByDate<SignalRecord>(dateKey).catch(() => [] as SignalRecord[]);
  // 추적 중인 신호는 메모리 값이 최신
  const byId = new Map(stored.map(r => [r.id, r]));
  for (const r of active.values()) if (r.dateKey === dateKey) byId.set(r.id, r);
  return [...byId.values()];
}

// ------------------------------------------------------------
// 📁 PC 폴더에 CSV 자동 저장 (크롬·엣지 File System Access API)
// ------------------------------------------------------------
type DirHandle = any;
let dirHandle: DirHandle | null = null;
let lastSavedAt = 0;
let lastSaveError = '';

export const isFolderSaveSupported = () => typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';

export async function loadSavedFolder() {
  if (!isFolderSaveSupported()) return;
  try { dirHandle = (await kvGet('saveDirHandle')) || null; } catch { dirHandle = null; }
  notify();
}

export async function getFolderStatus(): Promise<{ supported: boolean; name?: string; permission: 'granted' | 'prompt' | 'denied' | 'none'; lastSavedAt: number; lastError: string }> {
  if (!isFolderSaveSupported()) return { supported: false, permission: 'none', lastSavedAt, lastError: lastSaveError };
  if (!dirHandle) return { supported: true, permission: 'none', lastSavedAt, lastError: lastSaveError };
  let permission: 'granted' | 'prompt' | 'denied' = 'prompt';
  try { permission = await dirHandle.queryPermission({ mode: 'readwrite' }); } catch { /* 무시 */ }
  return { supported: true, name: dirHandle.name, permission, lastSavedAt, lastError: lastSaveError };
}

/** 사용자가 버튼을 눌렀을 때만 호출 (브라우저 보안상 클릭이 필요) */
export async function pickSaveFolder(): Promise<boolean> {
  if (!isFolderSaveSupported()) return false;
  try {
    const h = await (window as any).showDirectoryPicker({ id: 'leo100b-data', mode: 'readwrite', startIn: 'desktop' });
    dirHandle = h;
    await kvSet('saveDirHandle', h);
    lastSaveError = '';
    notify();
    return true;
  } catch (e: any) {
    if (e?.name !== 'AbortError') { lastSaveError = `폴더 선택 실패: ${e?.message || e}`; notify(); }
    return false;
  }
}

/** 새로고침 뒤 권한이 '확인 필요'로 바뀐 경우 — 버튼 클릭으로 다시 허용 */
export async function requestFolderPermission(): Promise<boolean> {
  if (!dirHandle) return false;
  try { return (await dirHandle.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch { return false; } finally { notify(); }
}

async function writeFile(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const fh = await dirHandle.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(new Blob([text], { type }));
  await w.close();
}

/** (2026-09-30) JSON 파일 저장 — 자기최적화 전략 버전·최근 후보를 폴더에 함께 보관 (권한 있을 때만) */
export async function saveJsonToFolder(name: string, data: unknown): Promise<boolean> {
  if (!dirHandle) return false;
  try {
    if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
    await writeFile(name, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    return true;
  } catch (e: any) {
    lastSaveError = `저장 실패(${name}): ${e?.message || e}`;
    notify();
    return false;
  }
}

/** 임의의 CSV 파일을 저장 폴더에 덮어쓰기 저장 (권한이 있을 때만) */
/** (2026-10-07) 그림 등 이진 파일 저장 — 차트 PNG를 신호 엑셀과 같은 폴더에 둔다 (권한 있을 때만) */
export async function saveBlobToFolder(name: string, blob: Blob): Promise<boolean> {
  if (!dirHandle) return false;
  try {
    if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return true;
  } catch (e: any) {
    lastSaveError = `저장 실패(${name}): ${e?.message || e}`;
    notify();
    return false;
  }
}

export async function saveCsvToFolder(name: string, csv: string): Promise<boolean> {
  if (!dirHandle) return false;
  try {
    if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
    await writeFile(name, csv);
    return true;
  } catch (e: any) {
    lastSaveError = `저장 실패(${name}): ${e?.message || e}`;
    notify();
    return false;
  }
}

/** 오늘 신호 CSV + 오늘 매매 CSV를 폴더에 덮어쓰기 저장 (권한이 있을 때만) */
export async function saveDayCsv(tradesCsv: string, dateKey: string = kstDateKey()): Promise<boolean> {
  if (!dirHandle) return false;
  try {
    const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return false;
    const signals = await getSignalsForDate(dateKey);
    await writeFile(`leo100b_신호_${dateKey}.csv`, signalsToCsv(signals));
    await writeFile(`leo100b_매매_${dateKey}.csv`, tradesCsv);
    lastSavedAt = Date.now();
    lastSaveError = '';
    notify();
    return true;
  } catch (e: any) {
    lastSaveError = `저장 실패: ${e?.message || e}`;
    notify();
    return false;
  }
}
