/**
 * leo100b - Self Optimization Engine (자기최적화 2~3단계: 분석 · 후보 탐색 · 검증)
 * ============================================================
 * 원본 설계(사용자 제공)를 현재 leo100b 저장 구조에 맞게 연결한 버전 (2026-09-30)
 *
 * 데이터 출처 (별도 DB를 새로 만들지 않고 이미 쌓이는 데이터를 그대로 사용)
 *  - 신호 스냅샷 : IndexedDB `leo100b_db` → `signals` 스토어 (services/signalStore.ts가 기록)
 *                  PASS(매수 조건 통과) + NEAR(기준 근처 탈락), 이후 30분 가격 경로와 가상 매매 결과 포함
 *  - 실제 매매   : 매매 일지 (services/tradeJournal.ts, IndexedDB `kv/tradeJournal`)
 *  - 전략 버전   : IndexedDB `kv/selfOpt.strategies`, 최근 후보 `kv/selfOpt.lastProposal`
 *
 * 원본 대비 바꾼 점
 *  1) 결과 = 실제 매매가 있으면 실제 순수익, 없으면 신호의 "가상 매매" 순수익.
 *     원본은 실제로 산 신호만 평가해서 기준을 "조이는" 방향만 검증할 수 있었다 — 안 산(NEAR) 신호까지 평가해야
 *     기준을 "푸는" 후보도 검증된다.
 *  2) 기준 전략(DEFAULT_STRATEGY_PARAMETERS)을 현재 실전 설정과 똑같이 맞춤 (A 45 / B 55, 체결강도 130, 5분 1억 등).
 *  3) 후보 점수는 저장된 점수 항목(breakdown)을 새 가중치로 다시 매기고 그룹 상한까지 똑같이 적용해 계산.
 *  4) 같은 종목은 한 포지션이 끝나기 전 신호를 중복 매매로 세지 않음(종목당 1슬롯과 동일).
 *
 * 안전장치
 *  - 이 파일은 주문을 보내지 않고, 실전 매수 조건을 바꾸지 않는다.
 *  - autoApplyValidatedStrategy 기본 false. applyValidatedStrategy()는 "새 버전 기록"만 하고
 *    실전 적용은 별도 연결(사용자 승인)이 있어야 한다.
 *  - 최소 표본 300건, 시간순 70/30 분할(학습/검증), 한 번에 1개 설정만 변경, 검증 구간 악화 시 과최적화로 거절.
 * ============================================================
 */

import { signalsAll, kvGet, kvSet } from './localDb';
import { getJournal, type ClosedTrade } from './tradeJournal';
import { saveJsonToFolder, SELL_GRID, sellKey, netPctOf, type SignalRecord } from './signalStore';
import { getAllCases, type TradeCase } from './tradeCaseStore';
import { calculateBullBear, type BullBearParams, type BullBearInput } from './bullBear';

// 📁 (2026-09-30) 전략 버전·최근 후보를 CSV 저장 폴더(예: 바탕화면\leo100b_data)에도 JSON으로 함께 저장
export const STRATEGY_FILE = 'leo100b_전략버전.json';
export const PROPOSAL_FILE = 'leo100b_최근후보.json';

export type EntryGrade = 'A' | 'B';
export type SessionType = 'REGULAR' | 'AFTER';
export type StrategyStatus = 'ACTIVE' | 'CANDIDATE' | 'VALIDATED' | 'REJECTED';

export interface SelfOptimizationConfig {
  minSamplesForAnalysis: number;
  minSamplesForOptimization: number;
  minTrainSamples: number;
  minValidationSamples: number;
  minWinRate: number;
  minExpectedValuePct: number;
  maxAverageLossPct: number;
  maxDrawdownPct: number;
  minImprovementPct: number;
  validationSplit: number;
  maxParameterChangesPerVersion: number;
  autoApplyValidatedStrategy: boolean;
}

export const DEFAULT_SELF_OPTIMIZATION_CONFIG: SelfOptimizationConfig = {
  minSamplesForAnalysis: 100,
  minSamplesForOptimization: 300,
  minTrainSamples: 30,
  minValidationSamples: 15,
  minWinRate: 0.55,
  minExpectedValuePct: 0.05,
  maxAverageLossPct: 1.2,     // (2026-10-04) 소형 손절 −1.0%·손절 후보 −1.2%까지 평가할 수 있도록 0.9 → 1.2 // 이전:     // 현재 손절 순손실 -0.8% 기준 (원본 0.6은 현재 손절선보다 좁아 모든 후보가 거절됨)
  maxDrawdownPct: 8.0,
  minImprovementPct: 5.0,
  validationSplit: 0.30,
  maxParameterChangesPerVersion: 1,
  autoApplyValidatedStrategy: false,
};

// ------------------------------------------------------------
// 전략 파라미터 — 현재 실전 설정(2026-09-30 오후)과 동일
// ------------------------------------------------------------
export interface StrategyParameters {
  // 공통 차단
  minExecutionStrength: number;
  requireAboveVwap: boolean;
  blockPriorHighBreakout: boolean;
  maxBullishRun1m: number;       // (2026-10-02) 완성된 1분봉 연속 양봉이 이 개수 이상이면 매수 차단 (0 = 끔)
  minTradeValue5m: number;
  maxSpreadTicks: number;
  minTicks60s: number;
  blockD: boolean;
  // 등급
  aScoreThreshold: number;       // 눌림목 있음
  bScoreThreshold: number;       // 눌림목 없음
  bMinExecutionStrength: number; // B급 추가 체결강도 조건
  // 💧 (2026-10-06) 유동성 구분별 매수 장벽 — 소형은 minExecutionStrength · minTicks60s를 그대로 쓴다.
  //   대형·중형 값(110/120, 40/30)은 근거 자료가 아직 없는 가설값 — 구간별 자료가 쌓이면 다시 정한다.
  minExecStrengthLarge: number;  // 대형 매수 최소 체결강도
  minExecStrengthMid: number;    // 중형
  minTicks60sLarge: number;      // 대형 매수 최소 60초 체결
  minTicks60sMid: number;        // 중형
  watchExecGap: number;          // 추천·인벤토리 유지 기준 = 매수 체결강도 − 이 값
  watchTicksLarge: number;       // 추천·유지 60초(분당) 체결 — 대형
  watchTicksMid: number;         // 중형
  watchTicksSmall: number;       // 소형
  afterExtraScore: number;       // 애프터마켓 가산
  // 점수 (그룹: ex 체결/수급 · pe 가격이벤트 · vw 위치 · su 추세 · ob 호가)
  scoreCvdPoc: number;
  scoreExecutionStrength: number;
  scoreExecutionSurge: number;
  scoreVolume2x: number;
  scoreExecVolumePrice: number;
  scorePullback: number;
  scoreBreakout: number;
  scoreVwapBreakout: number;
  scorePriorHighBreakout: number;
  scoreAboveVwap: number;
  scoreSma5AboveSma20: number;
  scoreVwapExpansion: number;
  scoreRsi: number;
  scoreShortMaRise: number;
  scoreGoldenCross: number;
  scoreRealAskDepletion: number;
  scoreAskDepletion: number;
  scoreBidDominant: number;
  scoreAskDominant: number;
  capEx: number; capPe: number; capVw: number; capSu: number; capOb: number;
  // 🐂🐻 (2026-10-02) Bull/Bear · OBI · 포지션 평가 — services/bullBear.ts
  minBullScore: number;
  maxBearScoreForEntry: number;
  sellBearScore: number;
  obiBullThreshold1: number;
  obiBullThreshold2: number;
  obiBearThreshold: number;
  obiBullScore1: number;
  obiBullScore2: number;
  obiBearScore: number;
  maxHoldSeconds: number;
  timeStopSeconds: number;
  minProfitAfterTimeStop: number;
  trailingDrawdownPct: number;
  // 💰 (2026-10-04) 매도 규칙 — 자기최적화 대상에 포함. 값은 signalStore의 SELL_GRID 안에 있어야 비교 표본이 생긴다.
  sellTargetNetPct: number;      // 익절 목표(트레일링 시작) 순수익 %
  sellStopNetPct: number;        // 손절 순손실 % (음수)
  sellTrailTicks: number;        // 고점 대비 이 틱만큼 내려오면 매도(매수세 확인 후), +1틱이면 무조건 매도
  // 💧 (2026-10-04) 유동성 구분별 익절 목표 — 진입 시점의 5분 거래대금으로 대형/중형/소형을 나눈다.
  //   대형(tierLargeTradeValue5m 이상) → sellTargetLargePct / 중형(tierMidTradeValue5m 이상) → sellTargetNetPct / 소형 → sellTargetSmallPct
  sellTargetLargePct: number;
  sellTargetSmallPct: number;
  tierLargeTradeValue5m: number;
  tierMidTradeValue5m: number;
  // 🛑 (2026-10-04) 유동성 구분별 손절(순손실 %, 음수) — 대형 sellStopLargePct / 중형 sellStopNetPct / 소형 sellStopSmallPct
  sellStopLargePct: number;
  sellStopSmallPct: number;
  // ⚙️ (2026-10-07) 화면의 [매매 기준 설정]에서 바꿀 수 있도록 코드 상수에서 옮긴 값들
  pendingBuyTtlSec: number;        // 매수 주문 미체결 만료(초)
  bearHoldSec: number;             // Bear 초과로 차단된 뒤 매수하지 않는 시간(초)
  avgDownEnabled: boolean;         // 물타기(손절 보류) 사용
  avgDownStepMult: number;         // 물타기 단계 폭 = 손절 기준 × 이 값
  avgDownMaxSlots: number;         // 물타기 최대 슬롯
  avgDownMinGapSec: number;        // 추가 매수 사이 최소 간격(초)
  closeBuyEnabled: boolean;        // 마감 매수 판단 사용
  closeBuyQty: number;             // 마감 매수 수량(주)
  closeBuyMaDays: number;          // 마감 매수 이동평균 일수
  closeBuyMaLookback: number;      // 이 거래일 전의 이동평균보다 높아야 '상승'
  // (2026-10-07) 마감 매수 점수제 — 아래 5개 중 closeBuyMinChecks개 이상 맞아야 산다
  closeBuyMinChecks: number;       // 통과에 필요한 개수(0이면 점수제 끔)
  closeBuyDropMinPct: number;      // ② 하락 폭 최소(%) — 전일 대비 이만큼은 내려야 눌림으로 본다
  closeBuyDropMaxPct: number;      // ② 하락 폭 최대(%) — 이보다 크게 내리면 악재로 본다
  closeBuyVolDays: number;         // ① 오늘 거래량을 비교할 최근 일수 평균
  closeBuyBounceFromLowPct: number; // ④ 당일 저가 대비 이만큼(%) 위에 있으면 '돌아서는 중'
  closeBuyRecentUpPct: number;     // ⑤ 최근 5거래일 안에 하루 이만큼(%) 이상 오른 날이 있으면 '최근 강했던 종목'
  fillMinTradeValue5m: number;     // 인벤토리 편입 최소 5분 거래대금(원)
  evictLowTradeValue5m: number;    // 거래 식음 퇴출 기준 5분 거래대금(원)
  evictLowSec: number;             // 위 상태가 이 시간(초) 이어지면 퇴출
  distanceEvictFreeSlots: number;  // 빈 칸이 이 수 이하일 때만 '멀다' 퇴출을 한다
  // 📈 (2026-10-07) 추세 매수 — 1분 기록으로 '서서히 오르는 종목'을 감지하면 바로 매수
  trendBuyEnabled: boolean;
  trendWindowMin: number;          // 감지에 쓰는 구간(분)
  trendAboveVwapPct: number;       // 구간 중 VWAP 위에 있던 비율(%) 최소
  trendMaxVwapGapPct: number;      // 매수 시 VWAP 이격 최대(%) — 이미 너무 멀리 간 종목은 사지 않는다
  trendTrailPct: number;           // 고점 대비 이만큼(%) 내리면 매도
  trendMaxPositions: number;       // 동시에 들고 있는 추세 매수 종목 수 최대
  trendReentryMin: number;         // 매도 뒤 같은 종목 재매수 금지(분)
  carryOrderTtlSec: number;        // 추세·마감 매수 주문의 미체결 만료(초) — 스캘핑(pendingBuyTtlSec)보다 길게
  trendBuyQty: number;             // 추세 매수 수량(주) — 첫 매수와 추가 슬롯 모두
  trendBuyFromHHMM: number;        // 추세 매수 시작 시각(HHMM, 예: 1000 = 10시 00분)
  trendBuyToHHMM: number;          // 추세 매수 종료 시각(HHMM, 예: 1015) — 이 시각 전까지만 산다
  minStopTicks: number;          // 손절선이 평단에서 이 틱 수보다 가까우면 이 틱 수만큼 내려와야 손절(틱이 큰 가격대의 노이즈 손절 방지)
}

export type LiquidityTier = 'LARGE' | 'MID' | 'SMALL';
export const LIQUIDITY_TIER_LABEL: Record<LiquidityTier, string> = { LARGE: '대형', MID: '중형', SMALL: '소형' };
/** 5분 거래대금 → 유동성 구분. 값을 모르면(체결량 미검증 등) 중형으로 본다. */
export function liquidityTierOf(tradeValue5m: number | undefined, p: Pick<StrategyParameters, 'tierLargeTradeValue5m' | 'tierMidTradeValue5m'>): LiquidityTier {
  if (!(Number(tradeValue5m) > 0)) return 'MID';
  return (tradeValue5m as number) >= p.tierLargeTradeValue5m ? 'LARGE' : (tradeValue5m as number) >= p.tierMidTradeValue5m ? 'MID' : 'SMALL';
}
/** 유동성 구분별 익절 목표(트레일링 시작) 순수익 % */
/** 유동성 구분별 손절 순손실 % (음수) */
export function sellStopOfTier(tier: LiquidityTier, p: Pick<StrategyParameters, 'sellStopLargePct' | 'sellStopNetPct' | 'sellStopSmallPct'>): number {
  return -Math.abs(tier === 'LARGE' ? p.sellStopLargePct : tier === 'SMALL' ? p.sellStopSmallPct : p.sellStopNetPct);
}
/** 구분별 매수 최소 체결강도 */
export function minExecOfTier(tier: LiquidityTier, p: Pick<StrategyParameters, 'minExecutionStrength' | 'minExecStrengthLarge' | 'minExecStrengthMid'>): number {
  return tier === 'LARGE' ? p.minExecStrengthLarge : tier === 'MID' ? p.minExecStrengthMid : p.minExecutionStrength;
}
/** 구분별 매수 최소 60초 체결 건수 */
export function minTicksOfTier(tier: LiquidityTier, p: Pick<StrategyParameters, 'minTicks60s' | 'minTicks60sLarge' | 'minTicks60sMid'>): number {
  return tier === 'LARGE' ? p.minTicks60sLarge : tier === 'MID' ? p.minTicks60sMid : p.minTicks60s;
}
/** 추천·인벤토리 유지용 체결강도(매수 기준보다 느슨) */
export function watchExecOfTier(tier: LiquidityTier, p: Pick<StrategyParameters, 'minExecutionStrength' | 'minExecStrengthLarge' | 'minExecStrengthMid' | 'watchExecGap'>): number {
  return minExecOfTier(tier, p) - Math.max(0, Number(p.watchExecGap) || 0);
}
/** 추천·인벤토리 유지용 60초 체결 건수 */
export function watchTicksOfTier(tier: LiquidityTier, p: Pick<StrategyParameters, 'watchTicksLarge' | 'watchTicksMid' | 'watchTicksSmall'>): number {
  return tier === 'LARGE' ? p.watchTicksLarge : tier === 'MID' ? p.watchTicksMid : p.watchTicksSmall;
}
export function sellTargetOfTier(tier: LiquidityTier, p: Pick<StrategyParameters, 'sellTargetLargePct' | 'sellTargetNetPct' | 'sellTargetSmallPct'>): number {
  return tier === 'LARGE' ? p.sellTargetLargePct : tier === 'SMALL' ? p.sellTargetSmallPct : p.sellTargetNetPct;
}

/** 매도 규칙 파라미터 — 이 키들은 "신호별 가상 매매(sims)"로만 평가한다(실제 매매 결과는 당시 규칙의 결과라 비교에 쓸 수 없음) */
export const SELL_PARAM_KEYS: ReadonlyArray<keyof StrategyParameters> = ['sellTargetNetPct', 'sellStopNetPct', 'sellTrailTicks', 'sellTargetLargePct', 'sellTargetSmallPct', 'tierLargeTradeValue5m', 'tierMidTradeValue5m', 'sellStopLargePct', 'sellStopSmallPct'];

export const DEFAULT_STRATEGY_PARAMETERS: StrategyParameters = {
  minExecutionStrength: 130,
  requireAboveVwap: true,
  blockPriorHighBreakout: true,
  maxBullishRun1m: 0, // (2026-10-04) 사용자 요청으로 1분봉 연속 양봉 차단 삭제 — 항상 0(끔). 저장된 옛 전략 버전에 값이 남아 있어도 setLive에서 0으로 고정한다
  minTradeValue5m: 100_000_000,
  maxSpreadTicks: 2,   // (2026-10-07) 3 → 2 사용자 결정: 3틱으로 완화해도 매수가 늘지 않았고(이틀간 2건), 저가 종목은 3틱이 0.5%라 진입 비용이 크다
  minTicks60s: 20,     // (2026-10-06) 35 → 20: 같은 이유
  blockD: true,        // (2026-10-06 밤) 다시 차단 — 오전엔 풀었으나, 마감가 기준으로 D 차단 신호 11건 중 10건이 손실(평균 −0.99%)
  aScoreThreshold: 45,
  bScoreThreshold: 55,
  bMinExecutionStrength: 130,
  minExecStrengthLarge: 110,
  minExecStrengthMid: 120,
  minTicks60sLarge: 40,
  minTicks60sMid: 30,
  watchExecGap: 15,
  watchTicksLarge: 25,
  watchTicksMid: 20,
  watchTicksSmall: 15,
  afterExtraScore: 15,
  scoreCvdPoc: 10,
  scoreExecutionStrength: 15,
  scoreExecutionSurge: 6,
  scoreVolume2x: 5,
  scoreExecVolumePrice: 15,
  scorePullback: 12,
  scoreBreakout: 2,
  scoreVwapBreakout: 3,
  scorePriorHighBreakout: -3,
  scoreAboveVwap: 8,
  scoreSma5AboveSma20: 4,
  scoreVwapExpansion: 0,
  scoreRsi: 3,
  scoreShortMaRise: 4,
  scoreGoldenCross: 3,
  scoreRealAskDepletion: 10,
  scoreAskDepletion: 4,
  scoreBidDominant: 0,
  scoreAskDominant: -5,
  capEx: 35, capPe: 25, capVw: 15, capSu: 10, capOb: 15,
  minBullScore: 13, // (2026-10-04) 사용자 결정 15 → 13
  maxBearScoreForEntry: 4,
  sellBearScore: 12,
  obiBullThreshold1: 0.20,
  obiBullThreshold2: 0.50,
  obiBearThreshold: -0.20,
  obiBullScore1: 0,      // 제안 2 — 실거래 역방향(OBI≥0.2 평균 −0.49%)이라 0에서 시작, 자기최적화 후보로 검증
  obiBullScore2: 0,      // 제안 4
  obiBearScore: 0,       // 제안 5 — OBI≤−0.2는 실거래 평균 +0.02%로 오히려 양호
  maxHoldSeconds: 600,
  timeStopSeconds: 90,
  minProfitAfterTimeStop: 0.2,
  trailingDrawdownPct: 0.5,
  sellTargetNetPct: 0.8,        // 중형(5분 거래대금 5억~20억) · 거래대금을 모를 때
  sellStopNetPct: -0.8,
  sellTrailTicks: 2,
  sellTargetLargePct: 0.5,      // 대형(5분 거래대금 20억 이상)
  sellTargetSmallPct: 1.2,      // 소형(5분 거래대금 5억 미만) — 2026-10-06 오후 0.6으로 낮췄다가 같은 날 사용자 결정으로 1.2 복원
  tierLargeTradeValue5m: 2_000_000_000,
  tierMidTradeValue5m: 500_000_000,
  sellStopLargePct: -0.6,       // 대형 손절 (중형은 sellStopNetPct −0.8)
  sellStopSmallPct: -1.0,       // 소형 손절
  minStopTicks: 3,
  pendingBuyTtlSec: 15,
  bearHoldSec: 10,
  avgDownEnabled: true,
  avgDownStepMult: 1.5,
  avgDownMaxSlots: 5,
  avgDownMinGapSec: 30,
  closeBuyEnabled: true,
  closeBuyQty: 1,
  closeBuyMaDays: 50,
  closeBuyMaLookback: 5,
  closeBuyMinChecks: 3,
  closeBuyDropMinPct: 0.5,
  closeBuyDropMaxPct: 4,
  closeBuyVolDays: 5,
  closeBuyBounceFromLowPct: 1,
  closeBuyRecentUpPct: 5,
  fillMinTradeValue5m: 50_000_000,
  evictLowTradeValue5m: 50_000_000,
  evictLowSec: 180,
  distanceEvictFreeSlots: 5,
  trendBuyEnabled: true,
  trendWindowMin: 30,
  trendAboveVwapPct: 80,
  trendMaxVwapGapPct: 2,   // (2026-10-07) 3 → 2 사용자 결정: 신호 812건에서 VWAP 이격 2% 이상은 30분 보유 평균 −0.61%(승률 15%)
  trendTrailPct: 1.5,
  trendMaxPositions: 5,
  trendReentryMin: 30,
  carryOrderTtlSec: 60,
  trendBuyQty: 1,
  trendBuyFromHHMM: 1000,  // (2026-10-07 사용자 결정) 9~10시는 스캘핑 위주로 하며 추세를 파악하고, 10시부터 15분간만 추세 매수
  trendBuyToHHMM: 1010,   // (2026-10-07 23:20 사용자 결정) 10:00~10:10 동안 1분마다 판단
};

/** 저장된 신호 레코드 → Bull/Bear 입력 */
export function bullBearInputFromSignal(s: SignalRecord): BullBearInput {
  const has = (t: string) => (s.breakdown || []).some(x => x.startsWith(t));
  return {
    exec: s.execStrength, rsi: s.rsi, C: !!s.flags?.C, Q: !!s.flags?.Q, VA: s.flags ? !!s.flags.VA : undefined, realCvd: s.cvd, cvdDelta: s.cvdDelta, vwapGapPct: s.vwapGapPct,
    realAskDepletion: has('매도호가실제소진'), vwapExpansion: has('VWAP이격우상향'), goldenCross: has('골든크로스'),
    askDominant: has('매도호가우세'), spreadTicks: s.spreadTicks, bidVol: s.bidVol, askVol: s.askVol,
  };
}
export const bullBearOfSignal = (p: StrategyParameters, s: SignalRecord) => calculateBullBear(p as BullBearParams, bullBearInputFromSignal(s));

// 점수 항목 이름(breakdown) → 파라미터 키·그룹
const ITEM_MAP: Array<{ match: (name: string) => boolean; key: keyof StrategyParameters; group: 'ex' | 'pe' | 'vw' | 'su' | 'ob' }> = [
  { match: n => n === 'CVD/POC지지', key: 'scoreCvdPoc', group: 'ex' },
  { match: n => n === '체결강도130+', key: 'scoreExecutionStrength', group: 'ex' },
  { match: n => n === '체결강도급증', key: 'scoreExecutionSurge', group: 'ex' },
  { match: n => n === '거래량2배+', key: 'scoreVolume2x', group: 'ex' },
  { match: n => n === '체결강도+거래량+가격 동반상승', key: 'scoreExecVolumePrice', group: 'ex' },
  { match: n => n === '눌림목', key: 'scorePullback', group: 'pe' },
  { match: n => n === '돌파', key: 'scoreBreakout', group: 'pe' },
  { match: n => n === 'VWAP 돌파', key: 'scoreVwapBreakout', group: 'pe' },
  { match: n => n === '전고점돌파', key: 'scorePriorHighBreakout', group: 'pe' },
  { match: n => n === 'VWAP 위', key: 'scoreAboveVwap', group: 'vw' },
  { match: n => n === 'SMA5>SMA20', key: 'scoreSma5AboveSma20', group: 'vw' },
  { match: n => n === 'VWAP이격우상향', key: 'scoreVwapExpansion', group: 'vw' },
  { match: n => /^RSI\d+$/.test(n), key: 'scoreRsi', group: 'su' },
  { match: n => n === '단기이평동반상승', key: 'scoreShortMaRise', group: 'su' },
  { match: n => n === '골든크로스', key: 'scoreGoldenCross', group: 'su' },
  { match: n => n === '매도호가실제소진', key: 'scoreRealAskDepletion', group: 'ob' },
  { match: n => n === '매도호가소진', key: 'scoreAskDepletion', group: 'ob' },
  { match: n => n === '매수호가우세', key: 'scoreBidDominant', group: 'ob' },
  { match: n => n === '매도호가우세', key: 'scoreAskDominant', group: 'ob' },
];
const itemName = (s: string) => s.replace(/\(.*$/, '').trim();

export function rescore(breakdown: string[], p: StrategyParameters): number {
  const g = { ex: 0, pe: 0, vw: 0, su: 0, ob: 0 };
  for (const raw of breakdown || []) {
    if (raw.startsWith('[') || raw.startsWith('🚨') || raw.startsWith('진입등급')) continue;
    const n = itemName(raw);
    const m = ITEM_MAP.find(x => x.match(n));
    if (m) g[m.group] += Number(p[m.key]) || 0;
  }
  return Math.min(Math.max(0, g.ex), p.capEx) + Math.max(0, Math.min(g.pe, p.capPe)) + Math.min(Math.max(0, g.vw), p.capVw)
    + Math.min(Math.max(0, g.su), p.capSu) + Math.max(0, Math.min(g.ob, p.capOb));
}

// ------------------------------------------------------------
// 성과 통계
// ------------------------------------------------------------
export interface PerformanceStats {
  samples: number; wins: number; losses: number; winRate: number;
  averageNetPct: number; averageWinPct: number; averageLossPct: number; expectedValuePct: number;
  maxDrawdownPct: number; averageHoldSeconds: number; targetHitRate: number; stopRate: number;
  actualCount: number; simCount: number;
  // 📮 주문 체결률 (케이스가 있는 표본만) — orders = 체결 + 취소, evPerOrderPct = 체결률 × 체결된 거래의 평균 순수익(주문 1건당 기대값)
  orders: number; filled: number; fillRate: number; evPerOrderPct: number;
}

/**
 * 표본 종류 (2026-10-04 케이스 기준 연결)
 *   FILLED    : 주문이 체결되어 청산까지 끝난 거래 — 실제 순수익
 *   CANCELLED : 주문했지만 한 주도 체결되지 않고 취소 — 신호의 가상 매매 결과("체결됐다면")
 *   NO_ORDER  : 통과했지만 주문이 나가지 않음 — 가상 매매 결과
 *   NEAR      : 기준 근처 탈락 — 가상 매매 결과
 *   LEGACY    : 케이스가 없는 예전 기록 — "같은 종목, 3분 이내" 추정 연결(실제) 또는 가상 매매
 */
export type SampleCaseKind = 'FILLED' | 'CANCELLED' | 'NO_ORDER' | 'NEAR' | 'LEGACY';

export interface Sample {
  caseKind?: SampleCaseKind;
  signal: SignalRecord;
  netPct: number;
  holdSec: number;
  source: 'ACTUAL' | 'SIM';
  reachedTarget: boolean;
  stoppedOut: boolean;
  exitReason: string;
}

function emptyStats(): PerformanceStats {
  return { samples: 0, wins: 0, losses: 0, winRate: 0, averageNetPct: 0, averageWinPct: 0, averageLossPct: 0, expectedValuePct: 0, maxDrawdownPct: 0, averageHoldSeconds: 0, targetHitRate: 0, stopRate: 0, actualCount: 0, simCount: 0, orders: 0, filled: 0, fillRate: 0, evPerOrderPct: 0 };
}

export function calculateStats(list: Sample[]): PerformanceStats {
  if (list.length === 0) return emptyStats();
  const sorted = [...list].sort((a, b) => a.signal.time - b.signal.time);
  const wins = sorted.filter(s => s.netPct > 0);
  const losses = sorted.filter(s => s.netPct <= 0);
  let eq = 0, peak = 0, mdd = 0;
  for (const s of sorted) { eq += s.netPct; peak = Math.max(peak, eq); mdd = Math.max(mdd, peak - eq); }
  const avg = sorted.reduce((a, s) => a + s.netPct, 0) / sorted.length;
  return {
    samples: sorted.length, wins: wins.length, losses: losses.length, winRate: wins.length / sorted.length,
    averageNetPct: avg,
    averageWinPct: wins.length ? wins.reduce((a, s) => a + s.netPct, 0) / wins.length : 0,
    averageLossPct: losses.length ? losses.reduce((a, s) => a + s.netPct, 0) / losses.length : 0,
    expectedValuePct: avg,
    maxDrawdownPct: mdd,
    averageHoldSeconds: sorted.reduce((a, s) => a + s.holdSec, 0) / sorted.length,
    targetHitRate: sorted.filter(s => s.reachedTarget).length / sorted.length,
    stopRate: sorted.filter(s => s.stoppedOut).length / sorted.length,
    actualCount: sorted.filter(s => s.source === 'ACTUAL').length,
    simCount: sorted.filter(s => s.source === 'SIM').length,
    ...(() => {
      const filledList = sorted.filter(s => s.caseKind === 'FILLED');
      const orders = filledList.length + sorted.filter(s => s.caseKind === 'CANCELLED').length;
      const fillRate = orders ? filledList.length / orders : 0;
      const filledAvg = filledList.length ? filledList.reduce((a, s) => a + s.netPct, 0) / filledList.length : 0;
      return { orders, filled: filledList.length, fillRate, evPerOrderPct: fillRate * filledAvg };
    })(),
  };
}

// ------------------------------------------------------------
// 데이터 불러오기 — 신호 + 실제 매매 연결
// ------------------------------------------------------------
const LINK_WINDOW_MS = 3 * 60 * 1000; // 매수 체결 3분 전까지의 통과(PASS) 신호를 그 매매의 신호로 본다

export async function loadSamples(): Promise<{ samples: Sample[]; totalSignals: number; linkedTrades: number; openCases: number }> {
  const signals = (await signalsAll<SignalRecord>().catch(() => [] as SignalRecord[]))
    .filter(s => s && s.price > 0)
    .sort((a, b) => a.time - b.time);
  const closed: ClosedTrade[] = [...(getJournal().closed || [])];

  // 🗂️ (2026-10-04) 케이스 기준 연결 — 신호ID로 케이스를 바로 찾는다(추정 없음). 케이스가 없는 예전 기록만 아래 3분 추정을 쓴다.
  const cases: TradeCase[] = await getAllCases().catch(() => [] as TradeCase[]);
  const caseBySignal = new Map<string, TradeCase>();
  for (const c of cases) if (c.signalId) caseBySignal.set(c.signalId, c);

  // (예전 기록용) 실제 매매 ↔ PASS 신호 연결: 같은 종목, 매수 체결 전 3분 이내 가장 최근 PASS 신호. 케이스 ID가 있는 거래는 제외.
  const actualBySignal = new Map<string, ClosedTrade>();
  for (const t of closed) {
    if (t.tradeCaseId) continue;
    let best: SignalRecord | undefined;
    for (const s of signals) {
      if (s.kind !== 'PASS' || s.symbol !== t.symbol || caseBySignal.has(s.id)) continue;
      if (s.time <= t.entryTime && t.entryTime - s.time <= LINK_WINDOW_MS && !actualBySignal.has(s.id)) {
        if (!best || s.time > best.time) best = s;
      }
    }
    if (best) actualBySignal.set(best.id, t);
  }

  const simSample = (s: SignalRecord, caseKind: SampleCaseKind): Sample | null =>
    s.sim && (s.status === 'DONE' || s.status === 'INCOMPLETE')
      ? { caseKind, signal: s, netPct: s.sim.netPct, holdSec: s.sim.sec, source: 'SIM', reachedTarget: !!s.hitTarget, stoppedOut: s.sim.exitReason === 'STOP', exitReason: `SIM_${s.sim.exitReason}` }
      : null;

  const samples: Sample[] = [];
  let linkedTrades = 0;
  let openCases = 0;
  for (const s of signals) {
    const c = caseBySignal.get(s.id);
    if (c) {
      if (c.status === 'CLOSED' && c.netPct !== undefined) {
        const mfe = c.entryPrice && c.maxPrice ? netPctOf(c.entryPrice, c.maxPrice) : 0;
        samples.push({
          caseKind: 'FILLED', signal: s, netPct: c.netPct, holdSec: c.holdSec || 0, source: 'ACTUAL',
          reachedTarget: mfe >= (s.rule?.targetNet ?? 0.8), stoppedOut: /STOP/i.test(c.exitReason || ''), exitReason: c.exitReason || 'UNKNOWN',
        });
        linkedTrades++;
      } else if (c.status === 'OPEN' || c.status === 'ORDERED' || c.status === 'SIGNAL') {
        openCases++; // 아직 결과가 없는 진행 중 케이스 — 표본에 넣지 않는다
      } else if (c.status === 'CLOSED') {
        // 청산됐지만 순수익을 확인하지 못한 케이스(체결가 확인 실패 등) — 표본에서 제외
      } else {
        const sm = simSample(s, c.status === 'CANCELLED' ? 'CANCELLED' : c.status === 'NEAR' ? 'NEAR' : 'NO_ORDER');
        if (sm) samples.push(sm);
      }
      continue;
    }
    const t = actualBySignal.get(s.id);
    if (t) {
      samples.push({
        caseKind: 'LEGACY', signal: s, netPct: t.netPct, holdSec: t.holdSec, source: 'ACTUAL',
        reachedTarget: (t.mfePct ?? 0) >= (s.rule?.targetNet ?? 0.8),
        stoppedOut: /STOP/i.test(t.exitReason || ''), exitReason: t.exitReason,
      });
      linkedTrades++;
    } else {
      const sm = simSample(s, 'LEGACY');
      if (sm) samples.push(sm);
    }
  }
  return { samples, totalSignals: signals.length, linkedTrades, openCases };
}

// ------------------------------------------------------------
// 전략 재평가 — 저장된 신호에 후보 전략을 적용했을 때 어떤 신호를 샀을지
// ------------------------------------------------------------
export function acceptsSignal(p: StrategyParameters, s: SignalRecord): boolean {
  const exec = Number(s.execStrength);
  // 구분별 매수 장벽 — 기록에 구분이 있으면 그대로, 없으면 당시 5분 거래대금으로 정한다
  const sigTier: LiquidityTier = (s as any).tier || liquidityTierOf(typeof s.tradeValue5m === 'number' ? s.tradeValue5m : undefined, p);
  const tierMinExec = minExecOfTier(sigTier, p);
  if (Number.isFinite(exec) && exec < tierMinExec) return false;
  if (p.requireAboveVwap && s.flags && s.flags.VA === false) return false;
  if (p.blockPriorHighBreakout && s.flags?.peakBreakout) return false;
  if (p.blockD && s.flags?.D) return false;
  if (typeof s.spreadTicks === 'number' && s.spreadTicks > p.maxSpreadTicks) return false;
  if (typeof s.ticks60s === 'number' && s.ticks60s < minTicksOfTier(sigTier, p)) return false;
  if (typeof s.tradeValue5m === 'number' && s.tradeValue5m < p.minTradeValue5m) return false;
  // 기록 당시 다른 이유(추격위험·가격이벤트 없음·호가 없음)로 막힌 신호는 후보 전략으로도 통과시키지 않는다
  const hardOther = (s.blockReasons || []).some(r => /추격|가격이벤트|호가 없음/.test(r));
  if (hardOther) return false;
  const grade: EntryGrade = s.flags?.P ? 'A' : 'B';
  if (grade === 'B' && Number.isFinite(exec) && exec < tierMinExec + Math.max(0, p.bMinExecutionStrength - p.minExecutionStrength)) return false;
  const bb = bullBearOfSignal(p, s);
  if (bb.bull < p.minBullScore) return false;
  if (bb.bear > p.maxBearScoreForEntry) return false;
  const score = rescore(s.breakdown || [], p);
  const threshold = (grade === 'A' ? p.aScoreThreshold : p.bScoreThreshold) + (s.session === 'AFTER' ? p.afterExtraScore : 0);
  return score >= threshold;
}

/** 종목당 1슬롯 — 앞 신호의 포지션이 끝나기 전 같은 종목 신호는 건너뛴다 */
/** 매도 규칙(p의 목표·손절·트레일 틱)으로 이 신호를 가상 매매했을 때의 표본 — 해당 조합 기록이 없으면 null */
export function sellSimSample(p: StrategyParameters, sm: Sample): Sample | null {
  // 신호 순간의 5분 거래대금으로 유동성 구분을 정하고, 그 구분의 익절 목표로 가상 매매한 결과를 쓴다
  const tier = liquidityTierOf(sm.signal.tradeValue5m, p);
  const v = sm.signal.sims?.[sellKey(sellTargetOfTier(tier, p), sellStopOfTier(tier, p), p.sellTrailTicks)];
  if (!v) return null;
  return { caseKind: sm.caseKind, signal: sm.signal, netPct: v.n, holdSec: v.s, source: 'SIM', reachedTarget: v.r === 'TRAIL', stoppedOut: v.r === 'STOP', exitReason: `SIM_${v.r}` };
}

/**
 * 종목당 1슬롯 — 앞 신호의 포지션이 끝나기 전 같은 종목 신호는 건너뛴다.
 * sellSimOnly = true면 실제 매매 결과 대신 "p의 매도 규칙으로 가상 매매한 결과"만 쓴다(매도 규칙끼리 같은 조건으로 비교하기 위함).
 */
export function evaluateStrategy(p: StrategyParameters, samples: Sample[], sellSimOnly = false): PerformanceStats {
  const busyUntil: Record<string, number> = {};
  const taken: Sample[] = [];
  for (const raw of [...samples].sort((a, b) => a.signal.time - b.signal.time)) {
    const s = raw.signal;
    if ((busyUntil[s.symbol] || 0) > s.time) continue;
    if (!acceptsSignal(p, s)) continue;
    const sm = sellSimOnly ? sellSimSample(p, raw) : raw;
    if (!sm) continue;
    taken.push(sm);
    busyUntil[s.symbol] = s.time + Math.max(60, sm.holdSec) * 1000;
  }
  return calculateStats(taken);
}

// ------------------------------------------------------------
// 분석
// ------------------------------------------------------------
export interface SensorPerformance { key: string; label: string; trueCount: number; falseCount: number; trueStats: PerformanceStats; falseStats: PerformanceStats; liftPct: number }
export interface CombinationPerformance { key: string; stats: PerformanceStats }
export interface ThresholdSweep { param: keyof StrategyParameters; label: string; rows: Array<{ value: number; stats: PerformanceStats; isCurrent: boolean }> }
/** 조건별 체결률 — orders = 체결 + 취소(케이스가 있는 주문만), cancelledSimPct = 취소된 주문이 체결됐다면(가상) 평균 */
export interface FillBreakdownRow { label: string; orders: number; filled: number; fillRate: number; filledAvgPct: number; evPerOrderPct: number; cancelledSimPct: number }

const FILL_GROUPS: Array<{ label: string; test: (s: SignalRecord) => boolean }> = [
  { label: '전체 주문', test: () => true },
  { label: 'A급(눌림목)', test: s => !!s.flags?.P },
  { label: 'B급(눌림목 없음)', test: s => !s.flags?.P },
  { label: '체결강도 130~149', test: s => Number(s.execStrength) >= 130 && Number(s.execStrength) < 150 },
  { label: '체결강도 150~169', test: s => Number(s.execStrength) >= 150 && Number(s.execStrength) < 170 },
  { label: '체결강도 170 이상', test: s => Number(s.execStrength) >= 170 },
  { label: 'Bull 13~14', test: s => Number(s.bull) >= 13 && Number(s.bull) < 15 },
  { label: 'Bull 15~17', test: s => Number(s.bull) >= 15 && Number(s.bull) < 18 },
  { label: 'Bull 18 이상', test: s => Number(s.bull) >= 18 },
  { label: '스프레드 1틱 이하', test: s => typeof s.spreadTicks === 'number' && s.spreadTicks <= 1 },
  { label: '스프레드 2틱', test: s => s.spreadTicks === 2 },
];

export function buildFillBreakdown(samples: Sample[]): FillBreakdownRow[] {
  return FILL_GROUPS.map(g => {
    const filled = samples.filter(x => x.caseKind === 'FILLED' && g.test(x.signal));
    const cancelled = samples.filter(x => x.caseKind === 'CANCELLED' && g.test(x.signal));
    const orders = filled.length + cancelled.length;
    const fillRate = orders ? filled.length / orders : 0;
    const filledAvgPct = filled.length ? filled.reduce((a, x) => a + x.netPct, 0) / filled.length : 0;
    return {
      label: g.label, orders, filled: filled.length, fillRate, filledAvgPct, evPerOrderPct: fillRate * filledAvgPct,
      cancelledSimPct: cancelled.length ? cancelled.reduce((a, x) => a + x.netPct, 0) / cancelled.length : 0,
    };
  }).filter(r => r.orders > 0);
}

export interface OptimizationAnalysis {
  generatedAt: number;
  totalSignals: number;
  samples: number;
  linkedTrades: number;
  enoughData: boolean;
  overall: PerformanceStats;
  currentStrategy: PerformanceStats;
  byKind: Record<'PASS' | 'NEAR', PerformanceStats>;
  byGrade: Record<EntryGrade, PerformanceStats>;
  // 🗂️ (2026-10-04) 케이스 종류별 성과와 주문 체결률
  byCaseKind: Record<SampleCaseKind, PerformanceStats>;
  openCases: number;                 // 아직 결과가 없는 진행 중 케이스(표본 제외)
  fillBreakdown: FillBreakdownRow[]; // 조건별 체결률 · 주문 1건당 기대값
  sensors: SensorPerformance[];
  combinations: CombinationPerformance[];
  sweeps: ThresholdSweep[];
}

const SENSOR_DEFS: Array<{ key: string; label: string; get: (s: SignalRecord) => boolean | undefined }> = [
  { key: 'P', label: '눌림목', get: s => s.flags?.P },
  { key: 'C', label: 'CVD/POC', get: s => s.flags?.C },
  { key: 'E', label: '체결강도130+', get: s => s.flags?.E },
  { key: 'B', label: '돌파', get: s => s.flags?.B },
  { key: 'D', label: '매수호가우세', get: s => s.flags?.D },
  { key: 'A', label: '매도호가 소진', get: s => s.flags?.A },
  { key: 'Q', label: '거래량 모멘텀', get: s => s.flags?.Q },
  { key: 'VA', label: 'VWAP 위', get: s => s.flags?.VA },
  { key: 'VWAP_UP', label: 'VWAP 위', get: s => (s.vwapGapPct || 0) > 0 },
  { key: 'VWAP_STRONG', label: 'VWAP +1%', get: s => (s.vwapGapPct || 0) > 1 },
  { key: 'REAL_ASK', label: '매도호가 실제소진', get: s => (s.breakdown || []).some(b => b.startsWith('매도호가실제소진')) },
  { key: 'SURGE', label: '체결강도 급증', get: s => (s.breakdown || []).some(b => b.startsWith('체결강도급증')) },
  { key: 'EXPAND', label: 'VWAP 이격 우상향', get: s => (s.breakdown || []).some(b => b.startsWith('VWAP이격우상향')) },
  { key: 'CVD_DELTA', label: 'CVD 증가', get: s => (s.cvdDelta || 0) > 0 },
  { key: 'BULL_STRONG', label: 'Bull 강세', get: s => (s.bull || 0) >= 15 },
  { key: 'BEAR_STRONG', label: 'Bear 강세', get: s => (s.bear || 0) >= 5 },
  // 🔧 (2026-10-03) 기준값 1.5 / 0.8은 매수잔량 ÷ 매도잔량 비율 — 예전엔 −1~+1 범위인 obi와 비교해 항상 꺼짐/항상 켜짐이었다
  { key: 'OBI_STRONG', label: '호가 강세 (매수/매도 잔량 1.5배 이상)', get: s => (s.bidVol && s.askVol) ? s.bidVol / s.askVol >= 1.5 : undefined },
  { key: 'OBI_WEAK', label: '호가 약세 (매수/매도 잔량 0.8배 이하)', get: s => (s.bidVol && s.askVol) ? s.bidVol / s.askVol <= 0.8 : undefined },
];

const BB_DEFAULT = () => DEFAULT_STRATEGY_PARAMETERS;
SENSOR_DEFS.push(
  { key: 'BULL12', label: 'Bull 12점 이상', get: s => bullBearOfSignal(BB_DEFAULT(), s).bull >= 12 },
  { key: 'BULL14', label: 'Bull 14점 이상', get: s => bullBearOfSignal(BB_DEFAULT(), s).bull >= 14 },
  { key: 'BEAR3', label: 'Bear 3점 이상', get: s => bullBearOfSignal(BB_DEFAULT(), s).bear >= 3 },
  { key: 'OBI+', label: 'OBI ≥ +0.2 (매수잔량 우세)', get: s => (s.bidVol && s.askVol) ? bullBearOfSignal(BB_DEFAULT(), s).obi >= 0.2 : undefined },
  { key: 'OBI-', label: 'OBI ≤ −0.2 (매도잔량 우세)', get: s => (s.bidVol && s.askVol) ? bullBearOfSignal(BB_DEFAULT(), s).obi <= -0.2 : undefined },
);

const COMBO_DEFS: Array<{ key: string; test: (s: SignalRecord) => boolean }> = [
  { key: 'P+C+E', test: s => !!(s.flags?.P && s.flags?.C && s.flags?.E) },
  { key: 'P+E+VWAP위', test: s => !!(s.flags?.P && s.flags?.E && s.flags?.VA) },
  { key: 'C+E+매도호가 실제소진', test: s => !!(s.flags?.C && s.flags?.E) && (s.breakdown || []).some(b => b.startsWith('매도호가실제소진')) },
  { key: 'P+VWAP위+60초 35건+', test: s => !!(s.flags?.P && s.flags?.VA) && Number(s.ticks60s || 0) >= 35 },
  { key: '체결강도150++매도호가 소진', test: s => Number(s.execStrength || 0) >= 150 && !!s.flags?.A },
  { key: 'B급(눌림목 없음)+C+E', test: s => !s.flags?.P && !!(s.flags?.C && s.flags?.E) },
];

const SWEEPS: Array<{ param: keyof StrategyParameters; label: string; values: number[] }> = [
  { param: 'minExecutionStrength', label: '최소 체결강도', values: [120, 125, 130, 135, 140, 145, 150] },
  { param: 'minTradeValue5m', label: '5분 거래대금', values: [50_000_000, 100_000_000, 150_000_000, 200_000_000, 250_000_000, 300_000_000, 400_000_000] },
  { param: 'minTicks60s', label: '60초 체결', values: [15, 20, 25, 30, 35, 40] },
  { param: 'maxSpreadTicks', label: '최대 스프레드(틱)', values: [1, 2, 3, 4] },
  { param: 'aScoreThreshold', label: 'A급 기준점수', values: [35, 40, 45, 50, 55, 60] },
  { param: 'minBullScore', label: '최소 Bull 점수', values: [10, 12, 13, 15, 18, 20] },
  { param: 'maxBearScoreForEntry', label: '최대 Bear 점수(진입)', values: [0, 3, 5, 8, 99] },
  { param: 'bScoreThreshold', label: 'B급 기준점수', values: [45, 50, 55, 60, 65, 70] },
  // 💰 매도 규칙 — 신호별 가상 매매(2026-10-04 이후 기록)만으로 비교
  { param: 'sellTargetLargePct', label: '대형 익절 목표 순수익(%) · 가상 매매 기준', values: [...SELL_GRID.target] },
  { param: 'sellTargetNetPct', label: '중형 익절 목표 순수익(%) · 가상 매매 기준', values: [...SELL_GRID.target] },
  { param: 'sellTargetSmallPct', label: '소형 익절 목표 순수익(%) · 가상 매매 기준', values: [...SELL_GRID.target] },
  { param: 'tierLargeTradeValue5m', label: '대형 기준 5분 거래대금 · 가상 매매 기준', values: [1_000_000_000, 1_500_000_000, 2_000_000_000, 3_000_000_000] },
  { param: 'tierMidTradeValue5m', label: '중형 기준 5분 거래대금 · 가상 매매 기준', values: [300_000_000, 500_000_000, 700_000_000] },
  { param: 'sellStopLargePct', label: '대형 손절 순손실(%) · 가상 매매 기준', values: [...SELL_GRID.stop] },
  { param: 'sellStopNetPct', label: '중형 손절 순손실(%) · 가상 매매 기준', values: [...SELL_GRID.stop] },
  { param: 'sellStopSmallPct', label: '소형 손절 순손실(%) · 가상 매매 기준', values: [...SELL_GRID.stop] },
  { param: 'sellTrailTicks', label: '트레일링 하락 틱 · 가상 매매 기준', values: [...SELL_GRID.trail] },
];

// ------------------------------------------------------------
// 후보 / 버전
// ------------------------------------------------------------
export interface OptimizationProposal {
  id: string;
  createdAt: number;
  baseStrategyVersion: string;
  candidateStrategy: StrategyParameters;
  changedParameters: Array<{ key: keyof StrategyParameters; from: number | boolean; to: number | boolean }>;
  trainStats: PerformanceStats;
  validationStats: PerformanceStats;
  baselineTrainStats: PerformanceStats;
  baselineValidationStats: PerformanceStats;
  improvementPct: number;
  accepted: boolean;
  rejectionReasons: string[];
  status: StrategyStatus;
}

export interface StrategyVersion {
  version: string;
  createdAt: number;
  status: StrategyStatus;
  parameters: StrategyParameters;
  sourceProposalId?: string;
  notes?: string;
}

const CANDIDATE_VALUES: Array<{ key: keyof StrategyParameters; values: Array<number | boolean> }> = [
  { key: 'minExecutionStrength', values: [120, 125, 135, 140, 145] },
  { key: 'minTradeValue5m', values: [50_000_000, 150_000_000, 200_000_000, 250_000_000, 300_000_000, 400_000_000] },
  { key: 'maxSpreadTicks', values: [2, 4] },
  { key: 'minTicks60s', values: [15, 30, 35] },
  { key: 'aScoreThreshold', values: [40, 50, 55] },
  { key: 'bScoreThreshold', values: [50, 60, 65, 70] },
  { key: 'bMinExecutionStrength', values: [140, 150, 160] },
  { key: 'blockD', values: [false] },
  { key: 'scorePullback', values: [8, 14] },
  { key: 'scoreCvdPoc', values: [4, 6, 8, 10, 12] },
  { key: 'scoreExecutionStrength', values: [8, 10, 12, 15, 18] },
  { key: 'scoreVwapBreakout', values: [6, 8, 10, 12, 15] },
  { key: 'scoreRealAskDepletion', values: [8, 12, 15] },
  { key: 'minBullScore', values: [10, 12, 14, 15, 18] },
  { key: 'maxBearScoreForEntry', values: [3, 4, 5, 6] },
  { key: 'obiBullScore2', values: [4] },
  { key: 'obiBearScore', values: [5] },
  { key: 'scoreAskDominant', values: [0] },
  // 💰 매도 규칙 후보
  { key: 'sellTargetLargePct', values: [...SELL_GRID.target] },
  { key: 'sellTargetNetPct', values: [...SELL_GRID.target] },
  { key: 'sellTargetSmallPct', values: [...SELL_GRID.target] },
  { key: 'tierLargeTradeValue5m', values: [1_000_000_000, 1_500_000_000, 2_000_000_000, 3_000_000_000] },
  { key: 'tierMidTradeValue5m', values: [300_000_000, 500_000_000, 700_000_000] },
  { key: 'sellStopLargePct', values: [...SELL_GRID.stop] },
  { key: 'sellStopNetPct', values: [...SELL_GRID.stop] },
  { key: 'sellStopSmallPct', values: [...SELL_GRID.stop] },
  { key: 'sellTrailTicks', values: [...SELL_GRID.trail] },
];

// ------------------------------------------------------------
// 🔌 실전 연결 (2026-09-30 1번 방식: 승인 버튼) — 매매 엔진은 매 판단마다 getLiveParams()로 현재 전략 버전의 값을 읽는다.
//   [적용] 버튼(applyValidatedStrategy) / [되돌리기](rollbackToPrevious)만 이 값을 바꾼다. 자동 적용은 꺼져 있다.
// ------------------------------------------------------------
// ⚙️ (2026-10-07) 사용자 직접 설정 — 화면의 [매매 기준 설정]에서 바꾼 값. 전략 버전 값(baseParams) 위에 덮어쓴다.
//   브라우저(localStorage)에 저장되며, [기본값으로] 하면 지워져 전략 버전·코드 기본값을 다시 따른다.
const USER_OVERRIDE_KEY = 'leo100b_user_params_v1';
let userOverrides: Partial<StrategyParameters> = (() => {
  try { const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(USER_OVERRIDE_KEY) : null; const o = raw ? JSON.parse(raw) : {}; return o && typeof o === 'object' ? o : {}; } catch { return {}; }
})();
let baseParams: StrategyParameters = { ...DEFAULT_STRATEGY_PARAMETERS };
let liveParams: StrategyParameters = { ...baseParams, ...userOverrides, maxBullishRun1m: 0 };
const recomputeLive = () => { liveParams = { ...baseParams, ...userOverrides, maxBullishRun1m: 0 }; };
/** 사용자 설정을 뺀 값(전략 버전 + 코드 기본값) — 설정 창의 '기본값' 표시용 */
export const getBaseParams = (): StrategyParameters => baseParams;
export const getUserOverrides = (): Partial<StrategyParameters> => ({ ...userOverrides });
/** 사용자 설정을 통째로 바꾼다(빈 객체 = 전부 기본값으로). 바로 실전에 적용된다. */
export function setUserOverrides(next: Partial<StrategyParameters>, note = '매매 기준 설정 변경'): StrategyParameters {
  const cleaned: Record<string, unknown> = {};
  Object.keys(next || {}).forEach(k => {
    const v = (next as any)[k]; const b = (baseParams as any)[k];
    if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) return;
    if (b !== undefined && typeof v !== typeof b) return; // 형식이 다른 값은 버린다
    if (v !== b) cleaned[k] = v;                           // 기본값과 같으면 저장하지 않는다(나중에 기본값이 바뀌면 따라간다)
  });
  userOverrides = cleaned as Partial<StrategyParameters>;
  try { localStorage.setItem(USER_OVERRIDE_KEY, JSON.stringify(userOverrides)); } catch { /* 저장 실패는 매매와 무관 */ }
  recomputeLive();
  strategyListeners.forEach(fn => { try { fn(liveVersion, note, false); } catch { /* 무시 */ } });
  return liveParams;
}
let liveVersion = 'V1.0.0';
const strategyListeners = new Set<(version: string, note?: string, isStartup?: boolean) => void>();
export const getLiveParams = (): StrategyParameters => liveParams;
/**
 * 🔧 (2026-10-03) replayOptimizationApplier가 불러오는 함수 — 예전엔 정의가 없어 그 파일을 불러오는 순간 오류가 났다.
 * 실전 매수 기준(liveParams)을 메모리에서만 바꾼다: 전략 버전 기록에 남지 않고 새로고침하면 저장된 버전으로 돌아간다.
 * 오래 유지할 변경은 자기최적화의 [적용](applyValidatedStrategy)으로 버전에 남길 것.
 */
export function updateLiveParams(next: Partial<StrategyParameters>, note = '리플레이 최적화 임시 적용(저장 안 됨)'): StrategyParameters {
  baseParams = { ...baseParams, ...next };
  recomputeLive();
  strategyListeners.forEach(fn => { try { fn(liveVersion, note, false); } catch { /* 무시 */ } });
  return liveParams;
}
export const getLiveVersion = () => liveVersion;
export function subscribeStrategy(fn: (version: string, note?: string, isStartup?: boolean) => void) { strategyListeners.add(fn); return () => { strategyListeners.delete(fn); }; }
function setLive(v: StrategyVersion, notify: boolean, isStartup = false) {
  baseParams = { ...DEFAULT_STRATEGY_PARAMETERS, ...v.parameters };
  recomputeLive();
  liveVersion = v.version;
  if (notify) strategyListeners.forEach(fn => { try { fn(v.version, v.notes, isStartup); } catch { /* 무시 */ } });
}

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export class SelfOptimizationEngine {
  private config: SelfOptimizationConfig;
  private currentStrategy: StrategyVersion;
  private loaded: Promise<void>;

  constructor(config: Partial<SelfOptimizationConfig> = {}, initialStrategy: Partial<StrategyParameters> = {}) {
    this.config = { ...DEFAULT_SELF_OPTIMIZATION_CONFIG, ...config };
    this.currentStrategy = {
      version: 'V1.0.0', createdAt: Date.now(), status: 'ACTIVE',
      parameters: { ...DEFAULT_STRATEGY_PARAMETERS, ...initialStrategy },
      notes: '2026-09-30 실전 기준 전략 (A 45 / B 55 · 체결강도 130 · 5분 1억 · 스프레드 2틱 · 60초 35건 · D 차단)',
    };
    this.loaded = this.loadStrategies();
  }

  private async loadStrategies() {
    try {
      const list = (await kvGet<StrategyVersion[]>('selfOpt.strategies')) || [];
      const active = list.filter(s => s.status === 'ACTIVE').sort((a, b) => b.createdAt - a.createdAt)[0];
      // 🧭 (2026-10-04) 코드 수정 우선 — 코드의 기본값(DEFAULT_STRATEGY_PARAMETERS)이 지난 실행 때와 달라졌으면, 바뀐 항목을
      // 저장된 전략 위에 덮어써 새 버전으로 기록하고 실전에 적용한다. 예전엔 저장된 버전 값이 코드 값을 가려서 코드를 고쳐도
      // 반영되지 않았다. 코드 기본값 기록이 없는 첫 실행은 저장된 값과 다른 항목 전부를 코드 값으로 맞춘다.
      // 직전 버전은 기록에 남으므로 [이전 버전으로 되돌리기]로 복구할 수 있다.
      const prevDefaults = await kvGet<Partial<StrategyParameters>>('selfOpt.codeDefaults').catch(() => undefined);
      await kvSet('selfOpt.codeDefaults', { ...DEFAULT_STRATEGY_PARAMETERS }).catch(() => { /* 무시 */ });
      if (active) {
        const merged: StrategyParameters = { ...DEFAULT_STRATEGY_PARAMETERS, ...active.parameters };
        const changes: string[] = [];
        for (const k of Object.keys(DEFAULT_STRATEGY_PARAMETERS) as Array<keyof StrategyParameters>) {
          const codeVal = DEFAULT_STRATEGY_PARAMETERS[k];
          const codeChanged = prevDefaults ? prevDefaults[k] !== codeVal : true;
          if (codeChanged && merged[k] !== codeVal && active.parameters[k] !== undefined) {
            changes.push(`${String(k)} ${String(merged[k])}→${String(codeVal)}`);
            (merged as any)[k] = codeVal;
          }
        }
        if (changes.length > 0) {
          const [major, minor, patch] = active.version.replace(/^V/i, '').split('.').map(Number);
          const next: StrategyVersion = {
            version: `V${major || 1}.${minor || 0}.${(patch || 0) + 1}`, createdAt: Date.now(), status: 'ACTIVE',
            parameters: merged, notes: `코드 기본값 변경 반영: ${changes.join(', ')}`,
          };
          const nextList = [...list.map(s => (s.status === 'ACTIVE' ? { ...s, status: 'VALIDATED' as StrategyStatus } : s)), next];
          await kvSet('selfOpt.strategies', nextList);
          saveJsonToFolder(STRATEGY_FILE, nextList).catch(() => {});
          this.currentStrategy = next;
          setLive(next, true, true);
        } else {
          this.currentStrategy = { ...active, parameters: merged };
          setLive(this.currentStrategy, true, true);
        }
      }
      else { await kvSet('selfOpt.strategies', [this.currentStrategy]); saveJsonToFolder(STRATEGY_FILE, [this.currentStrategy]).catch(() => {}); }
    } catch { /* IndexedDB 불가 — 메모리 기준 전략 사용 */ }
  }

  getConfig() { return { ...this.config }; }

  /** 폴더 자동 저장 주기에 함께 호출 — 전략 버전·최근 후보를 폴더에 덮어쓰기 */
  async saveToFolder(): Promise<void> {
    const strategies = await this.getStrategies();
    await saveJsonToFolder(STRATEGY_FILE, strategies);
    const last = await this.getLastProposal();
    if (last) await saveJsonToFolder(PROPOSAL_FILE, last);
  }
  async getCurrentStrategy(): Promise<StrategyVersion> { await this.loaded; return clone(this.currentStrategy); }
  async getStrategies(): Promise<StrategyVersion[]> { await this.loaded; return (await kvGet<StrategyVersion[]>('selfOpt.strategies').catch(() => null)) || [clone(this.currentStrategy)]; }
  async getLastProposal(): Promise<OptimizationProposal | null> { return (await kvGet<OptimizationProposal>('selfOpt.lastProposal').catch(() => null)) || null; }

  async analyze(): Promise<OptimizationAnalysis> {
    await this.loaded;
    const { samples, totalSignals, linkedTrades, openCases } = await loadSamples();
    const p = this.currentStrategy.parameters;

    const sensors: SensorPerformance[] = [];
    for (const d of SENSOR_DEFS) {
      const on = samples.filter(x => d.get(x.signal) === true);
      const off = samples.filter(x => d.get(x.signal) === false);
      if (on.length < 5 && off.length < 5) continue;
      const ts = calculateStats(on), fs = calculateStats(off);
      sensors.push({ key: d.key, label: d.label, trueCount: on.length, falseCount: off.length, trueStats: ts, falseStats: fs, liftPct: ts.averageNetPct - fs.averageNetPct });
    }
    const combinations: CombinationPerformance[] = COMBO_DEFS
      .map(c => ({ key: c.key, stats: calculateStats(samples.filter(x => c.test(x.signal))) }))
      .filter(c => c.stats.samples >= 5)
      .sort((a, b) => b.stats.expectedValuePct - a.stats.expectedValuePct);
    const sweeps: ThresholdSweep[] = SWEEPS.map(sw => ({
      param: sw.param, label: sw.label,
      rows: sw.values.map(v => ({ value: v, stats: evaluateStrategy({ ...p, [sw.param]: v } as StrategyParameters, samples, SELL_PARAM_KEYS.includes(sw.param)), isCurrent: p[sw.param] === v })),
    }));

    return {
      generatedAt: Date.now(),
      totalSignals, samples: samples.length, linkedTrades,
      enoughData: samples.length >= this.config.minSamplesForAnalysis,
      overall: calculateStats(samples),
      currentStrategy: evaluateStrategy(p, samples),
      byKind: { PASS: calculateStats(samples.filter(x => x.signal.kind === 'PASS')), NEAR: calculateStats(samples.filter(x => x.signal.kind === 'NEAR')) },
      byGrade: { A: calculateStats(samples.filter(x => x.signal.flags?.P)), B: calculateStats(samples.filter(x => !x.signal.flags?.P)) },
      byCaseKind: {
        FILLED: calculateStats(samples.filter(x => x.caseKind === 'FILLED')),
        CANCELLED: calculateStats(samples.filter(x => x.caseKind === 'CANCELLED')),
        NO_ORDER: calculateStats(samples.filter(x => x.caseKind === 'NO_ORDER')),
        NEAR: calculateStats(samples.filter(x => x.caseKind === 'NEAR')),
        LEGACY: calculateStats(samples.filter(x => x.caseKind === 'LEGACY' || !x.caseKind)),
      },
      openCases,
      fillBreakdown: buildFillBreakdown(samples),
      sensors: sensors.sort((a, b) => b.liftPct - a.liftPct),
      combinations,
      sweeps,
    };
  }

  async proposeOptimization(): Promise<OptimizationProposal | null> {
    await this.loaded;
    const { samples } = await loadSamples();
    if (samples.length < this.config.minSamplesForOptimization) return null;

    const sorted = [...samples].sort((a, b) => a.signal.time - b.signal.time);
    const vCount = Math.max(1, Math.floor(sorted.length * this.config.validationSplit));
    const train = sorted.slice(0, sorted.length - vCount);
    const validation = sorted.slice(sorted.length - vCount);
    const base = this.currentStrategy.parameters;
    const baselineTrainStatsAll = evaluateStrategy(base, train);
    const baselineValidationStatsAll = evaluateStrategy(base, validation);
    if (baselineTrainStatsAll.samples < this.config.minTrainSamples || baselineValidationStatsAll.samples < this.config.minValidationSamples) return null;

    let best: OptimizationProposal | null = null;
    for (const c of CANDIDATE_VALUES) {
      for (const v of c.values) {
        if (base[c.key] === v) continue;
        const candidate = { ...clone(base), [c.key]: v } as StrategyParameters;
        const changedParameters = [{ key: c.key, from: base[c.key] as number | boolean, to: v }];
        if (changedParameters.length > this.config.maxParameterChangesPerVersion) continue;
        // 💰 매도 규칙 후보는 기준 전략·후보 모두 "가상 매매"로만 평가해 같은 조건에서 비교한다
        const isSellCandidate = SELL_PARAM_KEYS.includes(c.key);
        const trainStats = evaluateStrategy(candidate, train, isSellCandidate);
        const validationStats = evaluateStrategy(candidate, validation, isSellCandidate);
        if (trainStats.samples < this.config.minTrainSamples || validationStats.samples < this.config.minValidationSamples) continue;
        const baselineTrainStats = isSellCandidate ? evaluateStrategy(base, train, true) : baselineTrainStatsAll;
        const baselineValidationStats = isSellCandidate ? evaluateStrategy(base, validation, true) : baselineValidationStatsAll;
        if (isSellCandidate && (baselineTrainStats.samples < this.config.minTrainSamples || baselineValidationStats.samples < this.config.minValidationSamples)) continue;

        const b = baselineValidationStats.expectedValuePct;
        const improvement = b !== 0 ? ((validationStats.expectedValuePct - b) / Math.abs(b)) * 100 : validationStats.expectedValuePct > 0 ? 100 : 0;
        const reasons: string[] = [];
        if (validationStats.winRate < this.config.minWinRate) reasons.push(`검증 승률 부족: ${(validationStats.winRate * 100).toFixed(1)}%`);
        if (validationStats.expectedValuePct < this.config.minExpectedValuePct) reasons.push(`검증 기대값 부족: ${validationStats.expectedValuePct.toFixed(3)}%`);
        if (Math.abs(validationStats.averageLossPct) > this.config.maxAverageLossPct) reasons.push(`평균손실 초과: ${validationStats.averageLossPct.toFixed(3)}%`);
        if (validationStats.maxDrawdownPct > this.config.maxDrawdownPct) reasons.push(`검증 MDD 초과: ${validationStats.maxDrawdownPct.toFixed(2)}%`);
        if (improvement < this.config.minImprovementPct) reasons.push(`기존 전략 대비 개선폭 부족: ${improvement.toFixed(1)}%`);
        if (trainStats.expectedValuePct > baselineTrainStats.expectedValuePct && validationStats.expectedValuePct < b) reasons.push('학습구간 상승 / 검증구간 하락 — 과최적화 의심');
        // 📮 (2026-10-04) 체결률 반영 — 승률·기대값이 좋아 보여도 주문이 거의 체결되지 않는 조건이면 의미가 없다.
        // 검증 구간에 주문(체결+취소) 표본이 양쪽 모두 10건 이상일 때, 주문 1건당 기대값(체결률 × 체결 거래 평균)이 기준 전략보다 낮으면 탈락.
        if (!isSellCandidate && validationStats.orders >= 10 && baselineValidationStats.orders >= 10 && validationStats.evPerOrderPct < baselineValidationStats.evPerOrderPct) {
          reasons.push(`주문 1건당 기대값 하락: ${baselineValidationStats.evPerOrderPct.toFixed(3)}% → ${validationStats.evPerOrderPct.toFixed(3)}% (체결률 ${(baselineValidationStats.fillRate * 100).toFixed(0)}% → ${(validationStats.fillRate * 100).toFixed(0)}%)`);
        }
        if (trainStats.expectedValuePct < baselineTrainStats.expectedValuePct) reasons.push('학습구간에서도 기존보다 나쁨');

        const proposal: OptimizationProposal = {
          id: uid('PROP'), createdAt: Date.now(), baseStrategyVersion: this.currentStrategy.version,
          candidateStrategy: candidate, changedParameters,
          trainStats, validationStats, baselineTrainStats, baselineValidationStats,
          improvementPct: improvement, accepted: reasons.length === 0, rejectionReasons: reasons,
          status: reasons.length === 0 ? 'VALIDATED' : 'REJECTED',
        };
        const better = !best
          || (proposal.accepted && !best.accepted)
          || (proposal.accepted === best.accepted && proposal.validationStats.expectedValuePct > best.validationStats.expectedValuePct);
        if (better) best = proposal;
      }
    }
    if (best) {
      await kvSet('selfOpt.lastProposal', best).catch(() => { /* 무시 */ });
      saveJsonToFolder(PROPOSAL_FILE, best).catch(() => { /* 무시 */ });
    }
    return best;
  }

  /** 검증 통과 후보를 새 전략 "버전"으로 기록한다 — 실전 매수 조건은 바꾸지 않는다(별도 연결 필요) */
  async applyValidatedStrategy(proposal: OptimizationProposal, options: { force?: boolean; note?: string } = {}): Promise<StrategyVersion | null> {
    await this.loaded;
    if (!proposal.accepted && !options.force) return null;
    if (proposal.baseStrategyVersion !== this.currentStrategy.version) return null; // 다른 버전 기준으로 만든 후보는 적용 불가(다시 분석)
    const [major, minor, patch] = this.currentStrategy.version.replace(/^V/i, '').split('.').map(Number);
    const next: StrategyVersion = {
      version: `V${major}.${(minor || 0) + 1}.${patch || 0}`, createdAt: Date.now(), status: 'ACTIVE',
      parameters: clone(proposal.candidateStrategy), sourceProposalId: proposal.id,
      notes: options.note || `검증 통과 후보: ${proposal.changedParameters.map(c => `${String(c.key)} ${c.from}→${c.to}`).join(', ')} (검증 개선 ${proposal.improvementPct.toFixed(1)}%)`,
    };
    const list = (await this.getStrategies()).map(s => (s.status === 'ACTIVE' ? { ...s, status: 'VALIDATED' as StrategyStatus } : s));
    await kvSet('selfOpt.strategies', [...list, next]);
    saveJsonToFolder(STRATEGY_FILE, [...list, next]).catch(() => { /* 무시 */ });
    this.currentStrategy = next;
    setLive(next, true);
    return clone(next);
  }

  /** [되돌리기] — 현재 버전을 거절(REJECTED) 처리하고 직전 버전을 다시 실전 적용 */
  async rollbackToPrevious(): Promise<StrategyVersion | null> {
    await this.loaded;
    const list = await this.getStrategies();
    const prev = list
      .filter(s => s.version !== this.currentStrategy.version && s.status !== 'REJECTED' && s.createdAt < this.currentStrategy.createdAt)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!prev) return null;
    const restored: StrategyVersion = { ...prev, status: 'ACTIVE', notes: `${prev.notes || ''} (되돌리기로 복귀: ${this.currentStrategy.version} 취소)`.trim() };
    const next = list.map(s => s.version === this.currentStrategy.version ? { ...s, status: 'REJECTED' as StrategyStatus }
      : s.version === prev.version ? restored : s);
    await kvSet('selfOpt.strategies', next);
    saveJsonToFolder(STRATEGY_FILE, next).catch(() => { /* 무시 */ });
    this.currentStrategy = restored;
    setLive(restored, true);
    return clone(restored);
  }

  // 📅 (2026-10-04) 장 마감 후 자동 분석 — 분석과 후보 탐색만 하고 실전 적용은 하지 않는다([적용] 버튼으로만 반영).
  private lastRun: { at: number; analysis: OptimizationAnalysis; proposal: OptimizationProposal | null } | null = null;
  getLastRun() { return this.lastRun; }
  async runScheduledAnalysis(): Promise<{ at: number; analysis: OptimizationAnalysis; proposal: OptimizationProposal | null }> {
    const analysis = await this.analyze();
    const proposal = await this.proposeOptimization();
    this.lastRun = { at: Date.now(), analysis, proposal };
    return this.lastRun;
  }

  async autoOptimize(): Promise<{ proposal: OptimizationProposal | null; applied: StrategyVersion | null }> {
    const proposal = await this.proposeOptimization();
    if (!proposal || !proposal.accepted || !this.config.autoApplyValidatedStrategy) return { proposal, applied: null };
    return { proposal, applied: await this.applyValidatedStrategy(proposal) };
  }

  async getDashboardSummary() {
    const analysis = await this.analyze();
    const latestProposal = await this.proposeOptimization();
    return { strategy: clone(this.currentStrategy), analysis, latestProposal };
  }
}

/** 앱 전체에서 하나만 사용 — autoApplyValidatedStrategy false (데이터가 쌓여도 실전 조건은 자동으로 바뀌지 않음) */
export const selfOptimizationEngine = new SelfOptimizationEngine({ autoApplyValidatedStrategy: false });
