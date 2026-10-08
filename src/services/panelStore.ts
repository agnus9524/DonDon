// ============================================================
// 📈 전 종목 1분 기록(패널) 저장소 — 2026-10-07
// ------------------------------------------------------------
// 인벤토리의 모든 종목을 1분마다 한 줄씩 남긴다(신호가 났든 안 났든).
//   · 나중에 어떤 규칙이든 과거 자료에 대입해 볼 수 있게 하는 것이 목적 — 새 아이디어마다 코드를 고치고 며칠 기다리지 않도록.
//   · 추세 감지(서서히 오르는 종목)도 이 기록의 최근 30분을 읽어 판단한다.
// 저장: IndexedDB(kv)에 날짜·시간대별 묶음(`panel.YYYY-MM-DD.HH`) + 지정한 PC 폴더에 `leo100b_1분기록_날짜.csv`
// ============================================================

import { kvGet, kvSet, kvDelete, isIdbAvailable } from './localDb';

export interface PanelRow {
  t: number;            // 기록 시각(ms)
  sym: string;
  name: string;
  p: number;            // 현재가
  lo: number;           // 최근 1분 저가
  hi: number;           // 최근 1분 고가
  vwap?: number;
  vwGap?: number;       // VWAP 이격 %
  chg?: number;         // 전일 대비 등락률 %
  es?: number;          // 체결강도
  ticks60?: number;     // 60초 체결 건수
  tv5?: number;         // 5분 거래대금(원)
  spread?: number;      // 스프레드(틱)
  bidVol?: number;
  askVol?: number;
  ratio?: number;       // 매수/매도 잔량 %
  score?: number;       // 매수 점수(엔진 최근 값)
  bull?: number;
  bear?: number;
  tier?: string;        // 대형/중형/소형
  held?: number;        // 보유 수량
  trend?: 0 | 1;        // 추세 감지 여부
  trendNote?: string;   // 감지 근거 또는 탈락 이유
}

const kstDateKeyOf = (t: number) => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstHourOf = (t: number) => new Date(t + 9 * 3600 * 1000).toISOString().slice(11, 13);
const DATES_KEY = 'panel.dates';
const KEEP_DAYS = 14;
const MEM_ROWS_PER_SYMBOL = 120; // 종목별 최근 2시간

const mem = new Map<string, PanelRow[]>();                 // 종목 → 최근 행
const chunk: { key: string; rows: PanelRow[] } = { key: '', rows: [] }; // 지금 쓰는 시간대 묶음
let restored = false;

/** 1분 기록 한 묶음 추가(한 번의 기록 시점에 모든 종목 행을 함께 넘긴다) */
export async function addPanelRows(rows: PanelRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (const r of rows) {
    const arr = mem.get(r.sym) || [];
    arr.push(r);
    if (arr.length > MEM_ROWS_PER_SYMBOL) arr.splice(0, arr.length - MEM_ROWS_PER_SYMBOL);
    mem.set(r.sym, arr);
  }
  if (!isIdbAvailable()) return;
  const t = rows[0].t;
  const date = kstDateKeyOf(t);
  const key = `panel.${date}.${kstHourOf(t)}`;
  try {
    if (chunk.key !== key) {
      chunk.key = key;
      chunk.rows = (await kvGet<PanelRow[]>(key)) || [];
      await noteDate(date);
    }
    chunk.rows.push(...rows);
    await kvSet(key, chunk.rows);
  } catch { /* 저장 실패는 매매와 무관 */ }
}

async function noteDate(date: string) {
  try {
    const dates = ((await kvGet<string[]>(DATES_KEY)) || []).filter(Boolean);
    if (dates.includes(date)) return;
    dates.push(date); dates.sort();
    // 오래된 날짜 정리
    while (dates.length > KEEP_DAYS) {
      const old = dates.shift() as string;
      for (let h = 0; h < 24; h++) { try { await kvDelete(`panel.${old}.${String(h).padStart(2, '0')}`); } catch { /* 무시 */ } }
    }
    await kvSet(DATES_KEY, dates);
  } catch { /* 무시 */ }
}

/** 하루치 전체 행(시간순) */
export async function getPanelRows(dateKey: string): Promise<PanelRow[]> {
  if (!isIdbAvailable()) return [];
  const out: PanelRow[] = [];
  for (let h = 0; h < 24; h++) {
    try { const rows = await kvGet<PanelRow[]>(`panel.${dateKey}.${String(h).padStart(2, '0')}`); if (rows && rows.length) out.push(...rows); } catch { /* 무시 */ }
  }
  return out.sort((a, b) => a.t - b.t || a.sym.localeCompare(b.sym));
}

/** 앱 시작 시 — 오늘 기록을 메모리로 다시 올린다(새로고침 뒤에도 추세 감지가 이어지도록) */
export async function restorePanel(): Promise<void> {
  if (restored) return;
  restored = true;
  try {
    const rows = await getPanelRows(kstDateKeyOf(Date.now()));
    const cutoff = Date.now() - 2 * 3600 * 1000;
    for (const r of rows) {
      if (r.t < cutoff) continue;
      const arr = mem.get(r.sym) || [];
      arr.push(r); mem.set(r.sym, arr);
    }
  } catch { /* 무시 */ }
}

/** 한 종목의 최근 N분 행(시간순) */
export function getRecentPanel(symbol: string, minutes: number, now: number = Date.now()): PanelRow[] {
  const arr = mem.get(symbol) || [];
  const from = now - minutes * 60000 - 20000;
  return arr.filter(r => r.t >= from);
}

export interface TrendRule { windowMin: number; aboveVwapPct: number }
/**
 * 📈 추세 감지 — "서서히 오르는 종목"
 *   ① 최근 windowMin분 표본의 aboveVwapPct% 이상이 VWAP 위
 *   ② VWAP 자체가 오르는 중 (지금 > 구간 중간 > 구간 처음)
 *   ③ 5분 단위 저점이 계속 높아짐 (최근 4개 구간의 저점이 내려간 적 없고, 마지막이 처음보다 높음)
 */
export function detectTrend(rows: PanelRow[], rule: TrendRule, now: number = Date.now()): { ok: boolean; note: string } {
  const need = Math.floor(rule.windowMin * 0.8);
  const withVwap = rows.filter(r => r.p > 0 && Number(r.vwap) > 0);
  if (withVwap.length < need) return { ok: false, note: `표본 ${withVwap.length}/${need}분` };
  const above = withVwap.filter(r => r.p >= (r.vwap as number)).length / withVwap.length * 100;
  if (above < rule.aboveVwapPct) return { ok: false, note: `VWAP 위 ${above.toFixed(0)}% < ${rule.aboveVwapPct}%` };
  const first = withVwap[0], mid = withVwap[Math.floor(withVwap.length / 2)], last = withVwap[withVwap.length - 1];
  const v0 = first.vwap as number, v1 = mid.vwap as number, v2 = last.vwap as number;
  if (!(v2 > v1 && v1 > v0)) return { ok: false, note: 'VWAP 상승 아님' };
  // 5분 구간 저점
  const buckets: number[] = [];
  const nb = Math.max(4, Math.round(rule.windowMin / 5));
  for (let i = nb - 1; i >= 0; i--) {
    const to = now - i * 5 * 60000, from = to - 5 * 60000;
    const lows = rows.filter(r => r.t > from && r.t <= to + 1000).map(r => r.lo > 0 ? r.lo : r.p).filter(x => x > 0);
    buckets.push(lows.length ? Math.min(...lows) : NaN);
  }
  const lastFour = buckets.slice(-4);
  if (lastFour.some(x => !Number.isFinite(x))) return { ok: false, note: '5분 저점 표본 부족' };
  for (let i = 1; i < lastFour.length; i++) if (lastFour[i] < lastFour[i - 1]) return { ok: false, note: '5분 저점이 낮아짐' };
  if (!(lastFour[3] > lastFour[0])) return { ok: false, note: '5분 저점 제자리' };
  const risePct = first.p > 0 ? ((last.p - first.p) / first.p) * 100 : 0;
  return { ok: true, note: `VWAP 위 ${above.toFixed(0)}% · VWAP ${Math.round(v0)}→${Math.round(v2)} · 5분 저점 ${lastFour.join('→')} · ${rule.windowMin}분 ${risePct >= 0 ? '+' : ''}${risePct.toFixed(2)}%` };
}

const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function panelToCsv(rows: PanelRow[]): string {
  const header = ['시각', '종목코드', '종목명', '현재가', '1분저가', '1분고가', 'VWAP', 'VWAP이격(%)', '등락률(%)', '체결강도', '60초체결', '5분거래대금',
    '스프레드(틱)', '매수잔량', '매도잔량', '매수/매도잔량(%)', '점수', 'Bull', 'Bear', '유동성구분', '보유수량', '추세감지', '추세근거'];
  const body = rows.map(r => [
    new Date(r.t).toLocaleString('ko-KR', { hour12: false }), r.sym, r.name, r.p, r.lo, r.hi, r.vwap ?? '', r.vwGap ?? '', r.chg ?? '', r.es ?? '', r.ticks60 ?? '', r.tv5 ?? '',
    r.spread ?? '', r.bidVol ?? '', r.askVol ?? '', r.ratio ?? '', r.score ?? '', r.bull ?? '', r.bear ?? '', r.tier ?? '', r.held ?? '', r.trend ?? '', r.trendNote ?? '',
  ]);
  return '﻿' + [header, ...body].map(row => row.map(esc).join(',')).join('\n');
}
