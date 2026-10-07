// ============================================================
// 🌇 마감 스냅샷 저장소 — 2026-10-07
// ------------------------------------------------------------
// 매일 15:10 · 15:15 · 15:19에 종목별 상태를 찍어 두고, 다음 거래일의 시가·고가·저가·종가를 붙인다.
// 목적: "마감까지 강했던 종목"과 "추세 속에서 오늘 눌린 종목" 중 어느 쪽이 다음 날 더 오르는지 같은 자료로 비교한다.
// 기록 전용 — 매매 판단에는 쓰지 않는다.
// 저장: IndexedDB(kv) `closeSnap.YYYY-MM-DD` + 지정 폴더에 `leo100b_마감후보_날짜.csv`
// ============================================================

import { kvGet, kvSet, isIdbAvailable } from './localDb';

export interface CloseSnapRow {
  date: string;            // 스냅샷 날짜(YYYY-MM-DD)
  sym: string;
  name: string;
  src: 'INV' | 'RANK';     // 인벤토리 종목(전체 값) / 순위 종목(가격·거래량만)
  // 가격·누적 거래량·체결강도 — 15:10 / 15:15 / 15:19
  p10?: number; v10?: number; es10?: number; ratio10?: number;
  p15?: number; v15?: number; es15?: number;
  p19?: number; v19?: number; es19?: number; ratio19?: number;
  hi?: number;             // 15:10~15:19 최고가
  chg19?: number;          // 15:19 전일 대비 등락률 %
  vwGap19?: number;        // 15:19 VWAP 이격 %
  tv5Now?: number;         // 15:19 최근 5분 거래대금
  tv5Prev?: number;        // 14:40~15:10 사이 5분 거래대금 평균(1분 기록 기준)
  score19?: number; bull19?: number; bear19?: number;
  held?: string;           // 15:19 보유 상태(마감/추세/스캘핑)
  closeDecision?: string;  // 그날 마감 매수 판단(매수/매수 안 함)
  closeNote?: string;      // 판단 근거
  // 일봉으로 계산(다음 날 채움)
  dayClose?: number;       // 스냅샷 날 종가
  ma50Up?: 0 | 1; aboveMa50?: 0 | 1; aboveMa20?: 0 | 1;
  volVs5d?: number;        // 스냅샷 날 거래량 ÷ 직전 5일 평균
  // 다음 거래일 결과
  nDate?: string; nOpen?: number; nHigh?: number; nLow?: number; nClose?: number;
}

const DATES_KEY = 'closeSnap.dates';
const keyOf = (date: string) => `closeSnap.${date}`;

export async function getCloseSnap(date: string): Promise<CloseSnapRow[]> {
  if (!isIdbAvailable()) return [];
  try { return (await kvGet<CloseSnapRow[]>(keyOf(date))) || []; } catch { return []; }
}
export async function getCloseSnapDates(): Promise<string[]> {
  if (!isIdbAvailable()) return [];
  try { return ((await kvGet<string[]>(DATES_KEY)) || []).filter(Boolean).sort(); } catch { return []; }
}
/** 종목 기준으로 덮어쓰기·합치기 */
export async function upsertCloseSnap(date: string, patches: (Partial<CloseSnapRow> & { sym: string })[]): Promise<CloseSnapRow[]> {
  const rows = await getCloseSnap(date);
  const bySym = new Map(rows.map(r => [r.sym, r]));
  for (const p of patches) {
    const cur = bySym.get(p.sym);
    if (cur) Object.assign(cur, p);
    else if (p.name && p.src) bySym.set(p.sym, { date, ...(p as any) });
  }
  const out = [...bySym.values()];
  if (!isIdbAvailable()) return out;
  try {
    await kvSet(keyOf(date), out);
    const dates = await getCloseSnapDates();
    if (!dates.includes(date)) { dates.push(date); dates.sort(); await kvSet(DATES_KEY, dates.slice(-60)); }
  } catch { /* 저장 실패는 매매와 무관 */ }
  return out;
}

const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const pct = (a?: number, b?: number) => (a && b && b > 0 ? Number((((a - b) / b) * 100).toFixed(3)) : '');
export function closeSnapToCsv(rows: CloseSnapRow[]): string {
  const header = [
    '날짜', '종목코드', '종목명', '구분', '가격_15:10', '가격_15:15', '가격_15:19', '10분최고가',
    '마감10분수익률(%)', '10분고점유지율', '10분거래량', '거래대금증가(배)', '체결강도_15:10', '체결강도_15:19', '체결강도변화',
    '잔량비_15:10(%)', '잔량비_15:19(%)', '전일대비_15:19(%)', 'VWAP이격_15:19(%)', '점수', 'Bull', 'Bear', '보유상태',
    '마감매수판단', '마감매수근거',
    '당일종가', '50일선상승', '50일선위', '20일선위', '거래량/5일평균',
    '다음거래일', '다음날시가', '다음날고가', '다음날저가', '다음날종가',
    '시가수익률(%)', '고가수익률(%)', '저가수익률(%)', '종가수익률(%)',
  ];
  const body = [...rows].sort((a, b) => (a.src === b.src ? a.name.localeCompare(b.name) : a.src === 'INV' ? -1 : 1)).map(r => {
    const base = r.p19 || r.p15 || r.p10; // 살 수 있었던 가격(15:19) 기준
    const cs2 = r.p10 && r.p19 && r.hi && r.hi > r.p10 ? Number(((r.p19 - r.p10) / (r.hi - r.p10)).toFixed(2)) : '';
    return [
      r.date, r.sym, r.name, r.src === 'INV' ? '인벤토리' : '순위',
      r.p10 ?? '', r.p15 ?? '', r.p19 ?? '', r.hi ?? '',
      pct(r.p19, r.p10), cs2, r.v10 !== undefined && r.v19 !== undefined ? Math.max(0, r.v19 - r.v10) : '',
      r.tv5Now && r.tv5Prev ? Number((r.tv5Now / r.tv5Prev).toFixed(2)) : '',
      r.es10 ?? '', r.es19 ?? '', r.es10 !== undefined && r.es19 !== undefined ? Number((r.es19 - r.es10).toFixed(1)) : '',
      r.ratio10 ?? '', r.ratio19 ?? '', r.chg19 ?? '', r.vwGap19 ?? '', r.score19 ?? '', r.bull19 ?? '', r.bear19 ?? '', r.held ?? '',
      r.closeDecision ?? '', r.closeNote ?? '',
      r.dayClose ?? '', r.ma50Up ?? '', r.aboveMa50 ?? '', r.aboveMa20 ?? '', r.volVs5d ?? '',
      r.nDate ?? '', r.nOpen ?? '', r.nHigh ?? '', r.nLow ?? '', r.nClose ?? '',
      pct(r.nOpen, base), pct(r.nHigh, base), pct(r.nLow, base), pct(r.nClose, base),
    ];
  });
  return '﻿' + [header, ...body].map(row => row.map(esc).join(',')).join('\n');
}
