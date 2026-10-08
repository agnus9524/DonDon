import axios from 'axios';
import { Stock } from '../types';
import { ALL_KRX_MASTER_STOCKS } from '../constants/kospiMaster';

// 🛡️ 매우 중요한 안전장치(2026-09-28) — 이 파일의 REST 호출 중 상당수(특히 checkOrderExecution이
// 쓰는 getDomesticOrderExecutions 등)는 axios 호출에 timeout이 지정되어 있지 않았다. axios는
// timeout 미지정 시 기본값이 0(무제한 대기)이라, 네트워크 끊김이나 KIS 서버 응답 지연이 생기면
// 해당 요청이 영원히 pending 상태로 멈출 수 있었다. 그런데 이 서비스의 REST 호출 대부분은
// queueRequest()/orderQueueRequest()/rankingQueueRequest() 같은 "완전 직렬(순서대로 하나씩만
// 실행)" 큐를 통과하는데, 그 큐 구현(.then() 체인)은 앞선 요청이 resolve/reject 둘 중 하나로
// "끝나야만" 다음 요청을 시작한다. 즉 timeout 없는 호출 단 하나가 응답을 영원히 못 받으면, 그
// 뒤에 줄 선 모든 요청(가격/호가/잔고동기화/체결확인 등)이 전부 함께 멈춰버린다 — "매도 버튼을
// 눌러도 '매도 주문 전송 중'이 무한히 돈다"는 증상이 바로 이 전역 데드락으로 설명된다(주문 전송
// 자체는 별도 큐라 나갔지만, 그 직후 체결 확인(checkOrderExecution)이 이 공유 큐에 걸려 영원히
// 응답을 못 받은 것). 개별 호출마다 timeout을 일일이 넣는 대신, 이 서비스가 쓰는 axios 인스턴스
// 전체에 기본 timeout을 걸어서 어떤 요청도 무한정 멈추지 않도록 한다. 이미 개별 timeout을 지정한
// 호출은 axios 특성상 그 값이 그대로 우선 적용되므로 영향받지 않는다.
axios.defaults.timeout = 10000;

// ============================================================
// 🔬 KIS 실시간 체결(H0STCNT0) 필드 검증기 — 필드 위치가 문서상 관례일 뿐 실측 확인이 안 돼 있어서,
// 들어오는 틱으로 "값끼리 앞뒤가 맞는지"를 스스로 검사한다. 검사를 통과한 필드만 매매 판단에 쓴다.
//   acmlVol(13)   누적거래량 — 같은 종목에서 줄어들지 않고, 체결량(12)보다 크거나 같아야 함
//   cntgVol(12)   체결량(틱당) — 0보다 크고 누적거래량보다 작거나 같아야 함
//   wavg(6)       가중평균주가(KIS가 계산한 당일 VWAP) — 당일 저가(9)~고가(8) 사이여야 함
//   range(8,9)    당일 고가/저가 — 현재가가 그 사이여야 함
//   cvd(19,20)    총매도/총매수 체결량 누적 — 줄어들지 않고, 합이 누적거래량을 크게 넘지 않아야 함
//   quote(10,11)  매도1/매수1호가 — 매수1 ≤ 매도1
// 검사 항목별로 100건 이상 모이고 통과율 95% 이상이면 "검증됨"으로 본다.
// ============================================================
type TickCheckKey = 'acmlVol' | 'cntgVol' | 'wavg' | 'range' | 'cvd' | 'quote';
const tickCheckStats: Record<TickCheckKey, { pass: number; total: number }> = {
  acmlVol: { pass: 0, total: 0 }, cntgVol: { pass: 0, total: 0 }, wavg: { pass: 0, total: 0 },
  range: { pass: 0, total: 0 }, cvd: { pass: 0, total: 0 }, quote: { pass: 0, total: 0 },
};
const tickCheckPrev: Record<string, { acml: number; sell: number; buy: number }> = {};
const TICK_CHECK_MIN_SAMPLES = 100;
const TICK_CHECK_PASS_RATE = 0.95;
const recordTickCheck = (key: TickCheckKey, ok: boolean) => {
  const st = tickCheckStats[key];
  if (st.total >= 5000) { st.pass = Math.round(st.pass / 2); st.total = Math.round(st.total / 2); } // 오래된 표본은 절반으로 줄여 최근 상태를 반영
  st.total++;
  if (ok) st.pass++;
};
/** 필드별 검증 상태 — verified: 표본 충분 + 통과율 95% 이상 */
export function getTickFieldCheck(): Record<TickCheckKey, { verified: boolean; passRate: number; samples: number }> {
  const out = {} as Record<TickCheckKey, { verified: boolean; passRate: number; samples: number }>;
  (Object.keys(tickCheckStats) as TickCheckKey[]).forEach(k => {
    const { pass, total } = tickCheckStats[k];
    const passRate = total > 0 ? pass / total : 0;
    out[k] = { verified: total >= TICK_CHECK_MIN_SAMPLES && passRate >= TICK_CHECK_PASS_RATE, passRate, samples: total };
  });
  return out;
}
const validateTickFields = (symbol: string, f: { price: number; wavg: number; high: number; low: number; ask1: number; bid1: number; cntg: number; acml: number; sell: number; buy: number }) => {
  const prev = tickCheckPrev[symbol];
  if (f.acml > 0) recordTickCheck('acmlVol', (!prev || f.acml >= prev.acml) && f.acml >= f.cntg);
  if (f.cntg >= 0 && f.acml > 0) recordTickCheck('cntgVol', f.cntg > 0 && f.cntg <= f.acml);
  if (f.high > 0 && f.low > 0) {
    recordTickCheck('range', f.price >= f.low && f.price <= f.high);
    if (f.wavg > 0) recordTickCheck('wavg', f.wavg >= f.low && f.wavg <= f.high);
  }
  if (f.sell >= 0 && f.buy >= 0 && (f.sell + f.buy) > 0) {
    const monotonic = !prev || (f.sell >= prev.sell && f.buy >= prev.buy);
    const bounded = f.acml <= 0 || (f.sell + f.buy) <= f.acml * 1.05 + 1;
    recordTickCheck('cvd', monotonic && bounded);
  }
  if (f.ask1 > 0 && f.bid1 > 0) recordTickCheck('quote', f.bid1 <= f.ask1);
  // 새 날/세션에 누적값이 초기화되면 이전값도 새로 시작
  tickCheckPrev[symbol] = { acml: f.acml, sell: f.sell, buy: f.buy };
};

// 로컬 마스터 목록 기반 시장 구분 — 순위 조회로 확인되지 않은 종목의 보조 수단(일부 오류 가능)
const MASTER_MARKET = new Map<string, 'KOSPI' | 'KOSDAQ'>(
  ALL_KRX_MASTER_STOCKS
    .filter(s => s.market === 'KOSPI' || s.market === 'KOSDAQ')
    .map(s => [s.symbol, s.market as 'KOSPI' | 'KOSDAQ'])
);
function lookupMasterMarket(symbol: string): 'KOSPI' | 'KOSDAQ' | undefined {
  return MASTER_MARKET.get(symbol);
}

/**
 * 한국투자증권 KIS API 연동 서비스
 */

// 스캘퍼 추천종목 개수 제한 — UI 라벨("실시간 초단타 스캘핑 최적 추천 10선")과 실제 반환 개수를
// 이 값 하나로 통일한다. 실시간 계산 추천, 기본(fallback) 추천, 백엔드 API 응답 전부 이 값으로 캡.
// 🎯 과제 1(멀티 앱키) — 활성화된 KIS 앱키 개수(계좌 #1~#4)에 따라 20종목 단위로 늘어난다
// (앱키 1개=20, 2개=40, 3개=60, 4개=80). App.tsx가 설정 화면의 계좌 #2~4 등록 상태가 바뀔 때마다
// setMaxScalperRecommendations()를 호출해서 갱신한다. export하는 바인딩이 살아있는 let이라
// (ESM live binding) 이 값을 참조하는 다른 파일들도 별도 import 없이 갱신된 값을 그대로 본다.
// 🎯 (2026-09-28 변경, 사용자 요청) 추천종목은 앱키 개수와 무관하게 19선으로 고정한다(인벤토리 19종목과 동일).
// 추천종목 검색은 REST(거래량/등락률 순위)만 사용하고 웹소켓은 전혀 쓰지 않는다.
const FIXED_SCALPER_RECOMMENDATIONS = 19;
export let MAX_SCALPER_RECOMMENDATIONS = FIXED_SCALPER_RECOMMENDATIONS;
// 🎯 (2026-10-04 변경, 사용자 요청) 계좌 #2까지 등록하면 추천종목도 19 × 2 = 38선으로 늘린다.
// 계좌 #3·#4는 "멀티 계좌 확장" 과제로 미뤄 두었으므로 지금은 2계좌까지만 반영한다.
export const MAX_ACTIVE_KIS_ACCOUNTS = 2;
export const SYMBOLS_PER_KIS_ACCOUNT = FIXED_SCALPER_RECOMMENDATIONS;
export function effectiveKisAccountCount(activeKisSlotCount: number): number {
  return Math.max(1, Math.min(MAX_ACTIVE_KIS_ACCOUNTS, Math.floor(activeKisSlotCount) || 1));
}
export function setMaxScalperRecommendations(activeKisSlotCount: number) {
  MAX_SCALPER_RECOMMENDATIONS = FIXED_SCALPER_RECOMMENDATIONS * effectiveKisAccountCount(activeKisSlotCount);
}

// ============================================================
// 🎯 추천종목 검색 시장 범위 설정
// ------------------------------------------------------------
// 코스닥을 완전히 없애는 게 아니라, 지금은 검색 범위를 코스피로 제한해두는 것이다.
// 나중에 필요하면 이 한 줄만 'KOSDAQ' 또는 'ALL'로 바꾸면 된다.
// FID_INPUT_ISCD 매핑(0000=전체/0001=코스피/1001=코스닥)은 KIS 거래량순위·등락률순위·
// 시가총액순위 API에서 공통으로 쓰이는 것으로 확인된 방식이다.
// ============================================================
export type MarketType = 'KOSPI' | 'KOSDAQ' | 'ALL';
export const SCALPER_MARKET: MarketType = 'ALL'; // 🎯 사용자 요청으로 코스피 전용 → 코스피+코스닥 전체로 확대
const MARKET_TYPE_TO_ISCD: Record<MarketType, string> = {
  ALL: '0000',
  KOSPI: '0001',
  KOSDAQ: '1001',
};

// ============================================================
// 🏷️ 종목별 시장 구분(코스피/코스닥) — KIS 순위 API를 코스피(0001)·코스닥(1001)으로 "따로" 조회해서
// 어느 쪽 결과에 나왔는지로 확정한다. 로컬 마스터 목록은 오류가 있어서(예: 시노펙스가 코스피로 적혀
// 있었음) 믿지 않는다. 한 번 확인된 값은 브라우저에 저장해 두고 재사용한다(상장 시장은 거의 안 바뀜).
// ============================================================
const MARKET_CACHE_KEY = 'leo100b.marketBySymbol.v1';
const marketBySymbol: Map<string, 'KOSPI' | 'KOSDAQ'> = (() => {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(MARKET_CACHE_KEY) : null;
    return new Map(Object.entries(raw ? JSON.parse(raw) : {})) as Map<string, 'KOSPI' | 'KOSDAQ'>;
  } catch { return new Map(); }
})();
let marketCacheSaveTimer: ReturnType<typeof setTimeout> | null = null;
function rememberMarket(symbol: string, market: 'KOSPI' | 'KOSDAQ') {
  if (!symbol || marketBySymbol.get(symbol) === market) return;
  marketBySymbol.set(symbol, market);
  if (marketCacheSaveTimer) return;
  marketCacheSaveTimer = setTimeout(() => {
    marketCacheSaveTimer = null;
    try { window.localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(Object.fromEntries(marketBySymbol))); } catch { /* 무시 */ }
  }, 1000);
}
/** KIS 순위 조회로 확인된 시장 구분. 아직 확인 안 된 종목이면 undefined */
export function getKnownMarket(symbol: string): 'KOSPI' | 'KOSDAQ' | undefined {
  return marketBySymbol.get(symbol);
}

interface KISConfig {
  appKey: string;
  appSecret: string;
  accountNo: string; // 계좌번호 8자리
  accountCode: string; // 상품코드 2자리 (보통 01)
  accountPw: string; // 계좌비밀번호 4자리
  htsId?: string; // 🎯 HTS ID(계정 아이디, 계좌번호와 다름) — 실시간 체결통보(H0STCNI0) 구독에 필요. 사용자 본인이 직접 입력해야 하며, 절대 하드코딩하면 안 됨(여러 사용자가 함께 쓰는 서버이므로)
  isConnected: boolean;
}

// 🏦 거래소 ID 구분코드 — 주문 시 EXCG_ID_DVSN_CD에 들어가는 값. 지금은 KRX 정규 스캘핑만
// 지원하므로 항상 'KRX'를 반환하지만, 추후 NXT 애프터마켓 전용 주문이나 SOR(스마트 주문 라우팅,
// 여러 거래소 중 최선을 자동으로 골라주는 방식) 통합매매를 지원할 때 이 함수 내부 로직만 확장하면
// 되도록 타입을 분리해뒀다. 무작정 문자열 'KRX'를 여기저기 하드코딩하지 않기 위함이다.
export type ExchangeId = 'KRX' | 'SOR' | 'NXT';

export function getExchangeIdForOrder(): ExchangeId {
  // 현재는 국내 KRX 정규 스캘핑만 지원한다. NXT/SOR을 실제로 쓰게 되면 여기서 시간대(애프터마켓
  // 여부)나 사용자 설정에 따라 분기하면 된다.
  return 'KRX';
}

export interface NormalizedPrice {
  current: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume: string;
  name?: string;
  executionStrength?: number; // KIS가 직접 계산해서 제공하는 실제 체결강도(cttr) — 매수체결량/매도체결량 기반, 호가잔량 비율이 아님
}

// 🔌 실시간 연결 상태 — 'open'/'connecting'/'closed'는 브라우저↔서버, 'kis_*'/'appkey_conflict'는 서버↔KIS
export type KisRealtimeStatus =
  | 'connecting'        // 브라우저 → 서버 연결 중
  | 'open'              // 정상 (서버와 KIS 모두 연결됨)
  | 'closed'            // 브라우저 ↔ 서버 연결이 예기치 않게 끊김 (App이 backoff로 재연결)
  | 'error'
  | 'kis_disconnected'  // 서버는 연결됐지만 서버 ↔ KIS가 끊김
  | 'kis_reconnecting'  // 서버가 KIS에 재연결 시도 중
  | 'appkey_conflict';  // OPSP8996 — 같은 앱키를 다른 곳이 사용 중

// 🎛️ 실시간 연결 핸들 — App이 이걸로 연결을 보관·종료한다. close()는 "수동 종료"로 표시한 뒤 닫아서
// 재연결이 일어나지 않게 한다.
export interface KisRealtimeHandle {
  socket: WebSocket;
  send: (msg: object) => boolean;
  close: () => void;
  isManuallyClosed: () => boolean;
}

class KISService {
  private config: KISConfig | null = null;
  private accessToken: string | null = null;
  private tokenExpireTime: number = 0;
  private tokenIssuedTime: number = 0;
  private pendingTokenPromise: Promise<string> | null = null;
  private onTokenUpdate: ((token: string, expiresAt: number, issuedAt: number) => void) | null = null;

  // 🔍 React state(kisConfig.isConnected)와 이 클래스 내부의 실제 config가 서로 다른 타이밍에
  // 준비될 수 있다 — 예를 들어 Firestore에서 저장된 설정을 비동기로 불러오는 동안, React
  // 상태는 아직 "연결 안 됨"이라 다른 경로가 가격 조회를 시도하지 않지만, 반대로 여러 effect가
  // "연결됨"으로 낙관적으로 판단하고 조회를 시도했는데 정작 이 내부 config는 아직 null일 수
  // 있다. 이 메서드로 실제 준비 상태를 외부에서 확인할 수 있게 한다.
  public isConfigReady(): boolean {
    return this.config !== null;
  }

  // 🩺 네트워크/API 상태 모니터링 — 스캘핑 중 API 실패/지연이 계속되면 매매를 멈추기 위한 최근 호출 기록
  private recentCallResults: { timestamp: number; success: boolean; latencyMs: number }[] = [];
  private readonly HEALTH_WINDOW_MS = 30000;
  // 🛡️ 4→8로 상향(2026-09-28) — 표본 4개는 너무 적어서, 예를 들어 웹소켓이 잠깐 끊겼다가 재연결되며
  // stale 종목이 한꺼번에 몰릴 때 REST 재조회 2건만 연달아 실패해도(4개 중 2개=50%) 바로 "불안정"
  // 판정이 났다. 표본을 늘려 순간적인 실패 몇 건으로는 쉽게 트립되지 않게 한다.
  private readonly HEALTH_MIN_SAMPLES = 8;
  private readonly HEALTH_FAILURE_RATE_THRESHOLD = 0.5;
  private readonly HEALTH_LATENCY_THRESHOLD_MS = 4000;

  private recordCallResult(success: boolean, latencyMs: number) {
    const now = Date.now();
    this.recentCallResults.push({ timestamp: now, success, latencyMs });
    if (this.recentCallResults.length > 200) {
      this.recentCallResults = this.recentCallResults.slice(-200);
    }
  }

  public getNetworkHealth(): { healthy: boolean; failureRate: number; avgLatencyMs: number; sampleCount: number; reason?: string } {
    const now = Date.now();
    const recent = this.recentCallResults.filter(r => now - r.timestamp <= this.HEALTH_WINDOW_MS);
    if (recent.length < this.HEALTH_MIN_SAMPLES) {
      return { healthy: true, failureRate: 0, avgLatencyMs: 0, sampleCount: recent.length };
    }
    const failures = recent.filter(r => !r.success).length;
    const failureRate = failures / recent.length;
    const avgLatencyMs = recent.reduce((a, r) => a + r.latencyMs, 0) / recent.length;
    const healthy = failureRate < this.HEALTH_FAILURE_RATE_THRESHOLD && avgLatencyMs < this.HEALTH_LATENCY_THRESHOLD_MS;
    let reason: string | undefined;
    if (!healthy) {
      reason = failureRate >= this.HEALTH_FAILURE_RATE_THRESHOLD
        ? `최근 API 호출 실패율 ${(failureRate * 100).toFixed(0)}% (${failures}/${recent.length}건 실패)`
        : `평균 응답 지연 ${(avgLatencyMs / 1000).toFixed(1)}초`;
    }
    return { healthy, failureRate, avgLatencyMs, sampleCount: recent.length, reason };
  }

  private get baseUrl() {
    return '/api/kis';
  }

  private get headers() {
    return {
      'custtype': 'P'
    };
  }

public generateRealtimeRecommendations(
  stocks: Stock[],
  detectStockStrategies: (stock: Stock) => any
): ScalperRecommendation[] {

  return stocks
  .filter(stock => {
const strat =
detectStockStrategies(stock);

// 4개 센서 전부 요구하면 조건이 너무 엄격해서 실제 시장에서 거의 항상 0개가 나온다
// (그 결과 항상 고정 fallback 데이터만 보이게 된다). 최소 1개 이상 센서가 감지되면
// 후보에 포함시키고, scalpingScore로 랭킹해서 상위 8개만 남긴다 — 다중 신호 종목은
// 자연히 점수가 높아 상위에 랭크된다.
return strat.activeCount >= 1;

})
    .map(stock => {

      const strat =
        detectStockStrategies(stock);

      let score = 0;

      if (strat.isPullback) score += 40;
      if (strat.isBreakout) score += 5;
      if (strat.isVwapSupport) score += 40;
      if (strat.isVolumeProfile) score += 40;

      if (strat.hasVolumeMomentum)
        score += 10;

      if (strat.activeCount === 4)
        score += 30;

      score = Math.min(score, 100);

      const grade: 'SSS' | 'SS' | 'S' | 'A+' =
        score >= 95 ? 'SSS' :
        score >= 85 ? 'SS' :
        score >= 70 ? 'S' :
        'A+';

      return {
        rank: 0,

        symbol: stock.symbol,
        name: stock.name,

        // 🏷️ 순위 조회로 확인된 시장 구분 → 없으면 로컬 마스터(오류 가능) → 그래도 없으면 미확인
        marketType: ((stock as any).marketType || getKnownMarket(stock.symbol) || lookupMasterMarket(stock.symbol)) as 'KOSPI' | 'KOSDAQ' | undefined,

        price: stock.price,
        recommendedPrice: stock.price, // 이 함수가 호출된 지금 이 순간의 가격을 스냅샷으로 고정 — 이후 절대 재할당하지 않음

        change: stock.change || 0,

        changePercent:
          stock.changePercent || 0,

        volume:
          stock.volume || '0',

        tradeAmount:
          // 🎯 실제 거래대금(KIS acml_tr_pbmn)이 있으면 억 단위 문자열로 표시, 없으면 기존처럼 '-'
          (stock as any).tradingValue !== undefined
            ? `${Math.round((stock as any).tradingValue / 100000000).toLocaleString()}억`
            : '-',

        volumeSurgeRate:
          strat.hasVolumeMomentum
            ? 200
            : 100,

        volumeIntensity:
          // 실제 체결강도(KIS가 계산해서 제공하는 cttr = 매수체결량/매도체결량 기반)가 있으면 그걸 쓰고,
          // 없으면 센서 개수로 인위적으로 부풀리지 않고 중립값(100)을 보여준다.
          // (이전에는 "100 + 센서개수*20"이라는 가짜 값을 체결강도인 것처럼 표시하고 있었다)
          stock.executionStrength !== undefined && stock.executionStrength > 0
            ? Math.round(stock.executionStrength)
            : 100,

        scalpingScore: score,

        grade,

        category: (
          strat.isVolumeProfile
            ? 'CVD_FLOW'
            : strat.isVwapSupport
            ? 'VWAP_SUPPORT'
            : strat.isBreakout
            ? 'MOMENTUM_BREAKOUT'
            : 'SUPPORT_REBOUND'
        ) as 'VOLUME_SURGE' | 'MOMENTUM_BREAKOUT' | 'SUPPORT_REBOUND' | 'VWAP_SUPPORT' | 'CVD_FLOW',

        targetPrice:
          Math.round(
            stock.price * 1.02
          ),

        stopLoss:
          Math.round(
            stock.price * 0.985
          ),

        expectedReturn:
          Number(
            (score / 30).toFixed(2)
          ),

        rsi:
          Number(strat.rsi || 50),

        reason:
          `${strat.activeCount}/4 전략 충족`,

        tags: [
          strat.isPullback && '#눌림목',
          strat.isBreakout && '#돌파',
          strat.isVwapSupport && '#VWAP',
          strat.isVolumeProfile && '#CVD'
        ].filter(Boolean) as string[],

        holdingTime:
          '3분 ~ 15분'
      };
    })
    .sort(
      (a, b) =>
        b.scalpingScore -
        a.scalpingScore
    )
    .slice(0, MAX_SCALPER_RECOMMENDATIONS)
    .map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));
}


  public init(config: KISConfig, savedToken?: string, savedExpiresAt?: number, savedIssuedAt?: number) {
    // Sanitize config by trimming strings to eliminate accidental trailing whitespace
    this.config = {
      ...config,
      appKey: (config.appKey || '').trim(),
      appSecret: (config.appSecret || '').trim(),
      accountNo: (config.accountNo || '').trim(),
      accountCode: (config.accountCode || '01').trim(),
      accountPw: (config.accountPw || '').trim()
    };
    
    // Add request interceptor to append the isRealServer header dynamically
    if (!(axios as any)._kisInterceptorAdded) {
      (axios as any)._kisInterceptorAdded = true;
      axios.interceptors.request.use((reqConfig: any) => {
        if (reqConfig.url?.includes('/api/kis') && this.config) {
          reqConfig.headers = reqConfig.headers || {};
          reqConfig.headers['x-is-real-server'] = 'true';
        }
        return reqConfig;
      });
    }

    const now = Date.now();
    const localToken = localStorage.getItem('sleek_kis_token') || undefined;
    const localExpires = Number(localStorage.getItem('sleek_kis_token_expires') || 0);
    const localIssued = Number(localStorage.getItem('sleek_kis_token_issued') || 0);

    const firestoreToken = savedToken;
    const firestoreExpires = Number(savedExpiresAt || 0);
    const firestoreIssued = Number(savedIssuedAt || 0);

    // Pick whichever valid token is newest and unexpired
    let chosenToken: string | null = null;
    let chosenExpires = 0;
    let chosenIssued = 0;

    if (firestoreToken && firestoreExpires > now) {
      chosenToken = firestoreToken;
      chosenExpires = firestoreExpires;
      chosenIssued = firestoreIssued || (firestoreExpires - 24 * 3600 * 1000);
    }

    if (localToken && localExpires > now && localExpires >= chosenExpires) {
      chosenToken = localToken;
      chosenExpires = localExpires;
      chosenIssued = localIssued || (localExpires - 24 * 3600 * 1000);
    }

    if (this.accessToken && this.tokenExpireTime > now && this.tokenExpireTime >= chosenExpires) {
      chosenToken = this.accessToken;
      chosenExpires = this.tokenExpireTime;
      chosenIssued = this.tokenIssuedTime;
    }

    if (chosenToken && chosenExpires > now) {
      this.accessToken = chosenToken;
      this.tokenExpireTime = chosenExpires;
      this.tokenIssuedTime = chosenIssued || (chosenExpires - 24 * 3600 * 1000);
      try {
        localStorage.setItem('sleek_kis_token', chosenToken);
        localStorage.setItem('sleek_kis_token_expires', String(chosenExpires));
        localStorage.setItem('sleek_kis_token_issued', String(this.tokenIssuedTime));
      } catch {}
    } else {
      if (!this.accessToken || this.tokenExpireTime <= now) {
        this.accessToken = null;
        this.tokenExpireTime = 0;
        this.tokenIssuedTime = 0;
      }
    }
  }

  public setTokenUpdateHandler(handler: (token: string, expiresAt: number, issuedAt: number) => void) {
    this.onTokenUpdate = handler;
  }

  public getTokenInfo() {
    const now = Date.now();
    
    // Check localStorage if memory is empty
    if (!this.accessToken) {
      const storedToken = localStorage.getItem('sleek_kis_token');
      const storedExpires = Number(localStorage.getItem('sleek_kis_token_expires') || 0);
      const storedIssued = Number(localStorage.getItem('sleek_kis_token_issued') || 0);
      if (storedToken && storedExpires > now) {
        this.accessToken = storedToken;
        this.tokenExpireTime = storedExpires;
        this.tokenIssuedTime = storedIssued || (storedExpires - 24 * 3600 * 1000);
      }
    }

    const hasToken = !!this.accessToken;
    const isExpired = !this.accessToken || now >= this.tokenExpireTime;
    const remainingMs = Math.max(0, this.tokenExpireTime - now);
    const totalRemainingSeconds = Math.floor(remainingMs / 1000);
    const totalRemainingMinutes = Math.floor(remainingMs / (60 * 1000));
    const remainingHours = Math.floor(remainingMs / (3600 * 1000));
    const remainingMinutes = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
    const remainingSeconds = Math.floor((remainingMs % (60 * 1000)) / 1000);
    const needsRenewal = isExpired || totalRemainingMinutes <= 15;

    // Formatting
    let formattedRemaining = "미발급";
    if (hasToken) {
      if (isExpired) {
        formattedRemaining = "만료됨 (재발급 필요)";
      } else if (remainingHours > 0) {
        formattedRemaining = `${remainingHours}시간 ${String(remainingMinutes).padStart(2, '0')}분`;
      } else if (remainingMinutes > 0) {
        formattedRemaining = `${remainingMinutes}분 ${String(remainingSeconds).padStart(2, '0')}초`;
      } else {
        formattedRemaining = `${remainingSeconds}초`;
      }
    }

    return {
      token: this.accessToken,
      hasToken,
      issuedAt: this.tokenIssuedTime,
      expiresAt: this.tokenExpireTime,
      isExpired,
      remainingMs,
      remainingHours,
      remainingMinutes,
      remainingSeconds,
      totalRemainingMinutes,
      totalRemainingSeconds,
      needsRenewal,
      formattedRemaining
    };
  }

  public async getAccessTokenPublic(): Promise<string> {
    return this.getAccessToken();
  }

  public async forceRefreshToken(): Promise<string> {
    this.accessToken = null;
    this.tokenExpireTime = 0;
    this.tokenIssuedTime = 0;
    localStorage.removeItem('sleek_kis_token');
    localStorage.removeItem('sleek_kis_token_expires');
    localStorage.removeItem('sleek_kis_token_issued');
    return this.getAccessToken();
  }

  public clear() {
    this.config = null;
    this.accessToken = null;
    this.tokenExpireTime = 0;
    this.tokenIssuedTime = 0;
    localStorage.removeItem('sleek_kis_token');
    localStorage.removeItem('sleek_kis_token_expires');
    localStorage.removeItem('sleek_kis_token_issued');
  }

  // ============================================================
  // 🎯 시세 전용 보조 계좌(계좌 #2) — 2026-10-04 추가
  // 계좌 #2의 앱키로는 "시세 조회 REST"만 보낸다: ① 계좌 #2가 맡은 종목(인벤토리 20번째 이후)의
  // 현재가·분봉 조회 ② 추천종목 검색(거래량·등락률 순위). 주문·잔고·체결 확인은 절대 이쪽으로
  // 보내지 않는다(항상 계좌 #1). 토큰·대기열을 계좌 #1과 따로 가져서 서로 밀어내지 않는다.
  // 계좌 #2 토큰 발급이 실패하면 5분 동안 계좌 #1로 되돌려 보내고(시세가 끊기지 않게) 다시 시도한다.
  // ============================================================
  private quoteAccount: { appKey: string; appSecret: string } | null = null;
  private quoteToken: string | null = null;
  private quoteTokenExpire = 0;
  private quoteTokenPending: Promise<string> | null = null;
  private quoteAccountBlockedUntil = 0;
  private quoteSymbols: Set<string> = new Set();
  private quoteChain: Promise<any> = Promise.resolve();
  private quoteLastAt = 0;
  private quoteRankingChain: Promise<any> = Promise.resolve();
  private quoteRankingLastAt = 0;
  private static quotePriceQueue: Promise<void> = Promise.resolve();
  private quoteStats = { primary: 0, secondary: 0, fallback: 0 };

  /** 계좌 #2 앱키 등록/해제 (null이면 해제 — 모든 시세 조회가 계좌 #1로 돌아간다) */
  public setQuoteAccount(acc: { appKey: string; appSecret: string } | null) {
    const appKey = (acc?.appKey || '').trim();
    const appSecret = (acc?.appSecret || '').trim();
    const next = appKey && appSecret ? { appKey, appSecret } : null;
    const same = (!next && !this.quoteAccount)
      || (!!next && !!this.quoteAccount && next.appKey === this.quoteAccount.appKey && next.appSecret === this.quoteAccount.appSecret);
    if (same) return;
    this.quoteAccount = next;
    this.quoteToken = null;
    this.quoteTokenExpire = 0;
    this.quoteTokenPending = null;
    this.quoteAccountBlockedUntil = 0;
  }
  /** 계좌 #2가 시세 조회를 맡을 종목 목록(인벤토리 20번째 이후) */
  public setQuoteAccountSymbols(symbols: string[]) {
    this.quoteSymbols = new Set(symbols);
  }
  public getQuoteAccountStatus() {
    return {
      enabled: !!this.quoteAccount,
      blocked: Date.now() < this.quoteAccountBlockedUntil,
      symbols: this.quoteSymbols.size,
      ...this.quoteStats,
    };
  }
  private usesQuoteAccount(target: string): boolean {
    if (!this.quoteAccount) return false;
    if (Date.now() < this.quoteAccountBlockedUntil) return false;
    return target === 'RANKING' || this.quoteSymbols.has(target);
  }
  private quoteTokenStorageKey(): string {
    return `sleek_kis_qtoken_${(this.quoteAccount?.appKey || '').slice(-8)}`;
  }
  private async getQuoteAccessToken(): Promise<string> {
    if (this.quoteToken && Date.now() < this.quoteTokenExpire) return this.quoteToken;
    try {
      const raw = localStorage.getItem(this.quoteTokenStorageKey());
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.token && Number(saved.expires) > Date.now()) {
          this.quoteToken = saved.token;
          this.quoteTokenExpire = Number(saved.expires);
          return saved.token;
        }
      }
    } catch { /* 저장소를 못 읽으면 새로 발급 */ }
    if (this.quoteTokenPending) return this.quoteTokenPending;
    const acc = this.quoteAccount;
    if (!acc) throw new Error('계좌 #2 앱키가 등록되지 않았습니다.');
    this.quoteTokenPending = (async () => {
      try {
        const res = await axios.post(`${this.baseUrl}/oauth2/tokenP`, {
          grant_type: 'client_credentials',
          appkey: acc.appKey,
          appsecret: acc.appSecret,
        }, { headers: { ...this.headers, 'Content-Type': 'application/json' } });
        const token = res.data?.access_token;
        if (!token) throw new Error(res.data?.error_description || res.data?.msg1 || '계좌 #2 토큰 발급 실패');
        const expiresInSec = Number(res.data.expires_in || 86400);
        const expires = Date.now() + (expiresInSec > 1800 ? expiresInSec - 1800 : expiresInSec) * 1000;
        if (this.quoteAccount === acc) {
          this.quoteToken = token;
          this.quoteTokenExpire = expires;
          try { localStorage.setItem(this.quoteTokenStorageKey(), JSON.stringify({ token, expires })); } catch { /* 무시 */ }
        }
        return token as string;
      } finally {
        this.quoteTokenPending = null;
      }
    })();
    return this.quoteTokenPending;
  }
  private quoteQueue<T>(kind: 'QUOTE' | 'RANKING', fn: () => Promise<T>): Promise<T> {
    const chain = kind === 'RANKING' ? this.quoteRankingChain : this.quoteChain;
    const next = chain.then(async () => {
      const last = kind === 'RANKING' ? this.quoteRankingLastAt : this.quoteLastAt;
      const wait = this.minRequestInterval - (Date.now() - last);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      if (kind === 'RANKING') this.quoteRankingLastAt = Date.now(); else this.quoteLastAt = Date.now();
      return await fn();
    });
    if (kind === 'RANKING') this.quoteRankingChain = next.catch(() => {}); else this.quoteChain = next.catch(() => {});
    return next;
  }
  /**
   * 시세 조회 한 건에 쓸 인증 정보와 대기열을 고른다.
   * target: 종목코드 또는 'RANKING'(추천종목 검색). 계좌 #2 담당이면 계좌 #2의 앱키·토큰·대기열,
   * 아니면(또는 계좌 #2가 준비되지 않았으면) 기존 계좌 #1 것을 그대로 돌려준다.
   */
  private async quoteAuth(target: string): Promise<{ token: string; appKey: string; appSecret: string; secondary: boolean; run: <T>(fn: () => Promise<T>) => Promise<T> }> {
    const isRanking = target === 'RANKING';
    if (this.usesQuoteAccount(target)) {
      try {
        const token = await this.getQuoteAccessToken();
        const acc = this.quoteAccount!;
        this.quoteStats.secondary++;
        return {
          token, appKey: acc.appKey, appSecret: acc.appSecret, secondary: true,
          run: <T>(fn: () => Promise<T>) => this.quoteQueue<T>(isRanking ? 'RANKING' : 'QUOTE', fn),
        };
      } catch (e: any) {
        this.quoteAccountBlockedUntil = Date.now() + 5 * 60 * 1000;
        this.quoteStats.fallback++;
        console.warn('[KIS 계좌 #2 시세] 토큰 발급 실패 — 5분간 계좌 #1로 조회합니다:', e?.message || e);
      }
    }
    const token = await this.getAccessToken();
    this.quoteStats.primary++;
    return {
      token, appKey: this.config!.appKey, appSecret: this.config!.appSecret, secondary: false,
      run: <T>(fn: () => Promise<T>) => (isRanking ? this.rankingQueueRequest<T>(fn) : this.queueRequest<T>(fn)),
    };
  }

  private async getAccessToken() {
    // 24-hour token validity check: Reuse existing token if still valid
    if (this.accessToken && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    // Check localStorage in case another tab or component saved it
    const storedToken = localStorage.getItem('sleek_kis_token');
    const storedExpires = Number(localStorage.getItem('sleek_kis_token_expires') || 0);
    const storedIssued = Number(localStorage.getItem('sleek_kis_token_issued') || 0);
    if (storedToken && storedExpires && Date.now() < storedExpires) {
      this.accessToken = storedToken;
      this.tokenExpireTime = storedExpires;
      this.tokenIssuedTime = storedIssued || (storedExpires - 24 * 3600 * 1000);
      return this.accessToken;
    }

    if (this.pendingTokenPromise) {
      return this.pendingTokenPromise;
    }

    if (!this.config) throw new Error("KIS 설정 정보(AppKey / AppSecret)가 초기화되지 않았습니다.");

    this.pendingTokenPromise = (async () => {
      try {
        const cleanAppKey = (this.config!.appKey || '').trim();
        const cleanAppSecret = (this.config!.appSecret || '').trim();

        if (!cleanAppKey || !cleanAppSecret) {
          throw new Error("App Key 또는 App Secret이 비어있습니다. KIS 연동 설정에서 확인 후 재입력해주세요.");
        }

        const endpoint = '/oauth2/tokenP';
        const payload = {
          grant_type: 'client_credentials',
          appkey: cleanAppKey,
          appsecret: cleanAppSecret
        };

        const res = await axios.post(`${this.baseUrl}${endpoint}`, payload, { 
          headers: {
            ...this.headers,
            'Content-Type': 'application/json'
          } 
        });
        
        // Handle potential KIS error responses or missing access token
        if (!res.data || !res.data.access_token) {
          const rawErr = res.data?.error_description 
            || res.data?.msg1 
            || res.data?.error_code 
            || res.data?.msg_cd 
            || '접근 토큰 발급 실패';

          let friendlyMsg = rawErr;
          if (rawErr.includes('EGW00201') || rawErr.includes('APPKEY')) {
            friendlyMsg = "유효하지 않은 AppKey/AppSecret입니다. (공백 또는 오타 확인 필요)";
          } else if (rawErr.includes('EGW00002')) {
            friendlyMsg = "AppKey 또는 AppSecret 정보가 일치하지 않습니다.";
          }

          throw new Error(friendlyMsg);
        }

        const newAccessToken = res.data.access_token;
        const now = Date.now();
        const expiresInSec = Number(res.data.expires_in || 86400); // 24 hours
        // Set expiry buffer to 23.5 hours for full 24h cycle
        const newExpireTime = now + (expiresInSec > 1800 ? expiresInSec - 1800 : expiresInSec) * 1000;
        const issuedAt = now;
        
        this.accessToken = newAccessToken;
        this.tokenExpireTime = newExpireTime;
        this.tokenIssuedTime = issuedAt;

        // Persist for 24-hour cross-session reuse
        localStorage.setItem('sleek_kis_token', newAccessToken);
        localStorage.setItem('sleek_kis_token_expires', String(newExpireTime));
        localStorage.setItem('sleek_kis_token_issued', String(issuedAt));

        if (this.onTokenUpdate) {
          this.onTokenUpdate(newAccessToken, newExpireTime, issuedAt);
        }
        
        return this.accessToken;
      } catch (error: any) {
        this.accessToken = null;
        this.tokenExpireTime = 0;
        this.tokenIssuedTime = 0;
        localStorage.removeItem('sleek_kis_token');
        localStorage.removeItem('sleek_kis_token_expires');
        localStorage.removeItem('sleek_kis_token_issued');

        const dataErr = error.response?.data;
        const kisDetail = dataErr?.error_description 
          || dataErr?.msg1 
          || dataErr?.error_code 
          || error.message;

        let userFriendlyReason = kisDetail;
        if (kisDetail.includes('EGW00201') || kisDetail.includes('APPKEY')) {
          userFriendlyReason = "유효하지 않은 AppKey/AppSecret입니다. 한국투자증권 KIS Developers에서 발급된 키인지 확인해주세요.";
        } else if (kisDetail.includes('400') || kisDetail.includes('401')) {
          userFriendlyReason = "인증 실패: AppKey/AppSecret 복사 시 앞뒤 공백이 포함되었거나 실전투자 계좌 키가 아닐 수 있습니다.";
        }

        throw new Error(userFriendlyReason.startsWith('[토큰 발급 오류]') ? userFriendlyReason : `[토큰 발급 오류] ${userFriendlyReason}`);
      } finally {
        this.pendingTokenPromise = null;
      }
    })();

    return this.pendingTokenPromise;
  }

  private async getHashKey(body: any) {
  if (!this.config) {
    throw new Error("KIS Config not initialized");
  }

  try {
    // 🎯 주문 전용 큐 사용 — 시장데이터 조회가 밀려있어도 해시키 발급은 영향받지 않는다
    const res = await this.orderQueueRequest<any>(() =>
      axios.post(
        `${this.baseUrl}/uapi/hashkey`,
        body,
        {
          headers: {
            'content-type': 'application/json',
            'appkey': this.config!.appKey,
            'appsecret': this.config!.appSecret
          }
        }
      )
    );

    const hash = res.data?.HASH;

    if (!hash) {
      console.error('[KIS HASHKEY FAILED]', res.data);
      throw new Error(
        `KIS Hashkey 발급 실패: ${res.data?.msg1 || 'HASH 없음'}`
      );
    }

    return hash;

  } catch (error: any) {
    console.error(
      '[KIS HASHKEY ERROR]',
      error?.response?.data || error?.message || error
    );

    throw new Error(
      `KIS Hashkey 발급 오류: ${
        error?.response?.data?.msg1 ||
        error?.message ||
        '알 수 없는 오류'
      }`
    );
  }
}

  // --- Unified / Router Methods (Main Interface) ---
  // Currently prioritized for Domestic Stocks as requested.

  public async getBalance() {
    // Current API points to Domestic Balance as requested
    return this.getDomesticBalance();
  }

  private static priceQueue: Promise<void> = Promise.resolve();
  private static inFlightPriceRequests: Map<string, Promise<NormalizedPrice | null>> = new Map();
  private static priceCache: Map<string, { data: NormalizedPrice | null; timestamp: number }> = new Map();
  private static readonly PRICE_CACHE_TTL_MS = 800; // 이 시간 안의 재요청은 API를 다시 부르지 않고 캐시값을 준다

  public async getPrice(symbol: string): Promise<NormalizedPrice | null> {
    // 1) 캐시: 방금 전에 조회한 값이면 그걸 그대로 반환 (API 호출 없음)
    const cached = KISService.priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < KISService.PRICE_CACHE_TTL_MS) {
      return cached.data;
    }

    // 2) 같은 종목에 대한 요청이 이미 진행 중이면, 새로 큐에 넣지 않고 그 결과를 같이 기다린다.
    //    (예: 스캘퍼 엔진 + 선택종목 폴링 + UI가 거의 동시에 같은 종목 가격을 원하는 경우)
    const inFlight = KISService.inFlightPriceRequests.get(symbol);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = (async (): Promise<NormalizedPrice | null> => {
      // Serialize and throttle requests to prevent 429
      const delay = async () => {
        // 🛡️ 전역 429 쿨다운 중이면(다른 종목 조회에서 이미 429를 만난 직후) 그 시각까지 같이 기다린다
        const cooldownRemaining = this.globalRateLimitCooldownUntil - Date.now();
        if (cooldownRemaining > 0) {
          await new Promise(r => setTimeout(r, cooldownRemaining));
        }
        await new Promise(r => setTimeout(r, 600));
      };
      const release = await new Promise<() => void>(resolve => {
        const next = () => resolve(() => {});
        // 계좌 #2 담당 종목은 계좌 #2 전용 줄에 세운다(계좌 #1 줄과 서로 기다리지 않는다)
        if (this.usesQuoteAccount(symbol)) {
          KISService.quotePriceQueue = KISService.quotePriceQueue.then(async () => {
            next();
            await delay();
          });
        } else {
          KISService.priceQueue = KISService.priceQueue.then(async () => {
            next();
            await delay();
          });
        }
      });

      try {
        const result = await this._getPriceInternal(symbol);
        KISService.priceCache.set(symbol, { data: result, timestamp: Date.now() });
        return result;
      } finally {
        release();
      }
    })();

    KISService.inFlightPriceRequests.set(symbol, requestPromise);
    try {
      return await requestPromise;
    } finally {
      KISService.inFlightPriceRequests.delete(symbol);
    }
  }

  private async _getPriceInternal(symbol: string): Promise<NormalizedPrice | null> {
    // Determine if KR or US (approximate)
    const isKR = /^\d{6}$/.test(symbol);
    const callStartedAt = Date.now();
    try {
     const data =
await this.getDomesticPrice(symbol);
          if (data && data.stck_prpr) {
            this.recordCallResult(true, Date.now() - callStartedAt);
            const isFalling = data.prdy_vrss_sign === '4' || data.prdy_vrss_sign === '5';
            const rawChange = Math.abs(Number(data.prdy_vrss || 0));
            const change = isFalling ? -rawChange : rawChange;
            const rawPercent = Math.abs(Number(data.prdy_ctrt || 0));
            const changePercent = isFalling ? -rawPercent : rawPercent;
            const current = Number(data.stck_prpr || 0);
            const prevClose = Number(data.stck_sdpr || (current - change));

            return {
              current,
              prevClose: prevClose > 0 ? prevClose : (current - change),
              change,
              changePercent,
              volume: Number(data.acml_vol || 0).toLocaleString(),
              name: data.hts_kor_isnm || undefined,
              executionStrength: data.cttr !== undefined ? Number(data.cttr) : undefined
            };
          }
          this.recordCallResult(false, Date.now() - callStartedAt);
    } catch (e) {
      this.recordCallResult(false, Date.now() - callStartedAt);
      console.warn(`[KIS Service] Failed to fetch price for ${symbol}:`, e);
    }
    return null;
  }

  public async getHoldings() {
    // Return domestic holdings as part of the current API prioritize domestic
    const domesticData = await this.getDomesticBalance();
    // Wrap to match overseas holdings structure for compatibility if needed
    return domesticData;
  }

 public async order(
  symbol: string,
  side: 'BUY' | 'SELL',
  price: string,
  qty: string,
  ordDvsn?: string
) {

  return this.orderDomestic(
    symbol,
    side,
    price,
    qty,
    ordDvsn
  );

}

  // --- Domestic (Korean) Stock ---

  public async getInvestmentAssetStatus() {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output1: [], output2: [] };
    try {
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/trading/inquire-account-balance';
      
      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': 'CTRP6548R',
        'custtype': 'P',
      };

      const params = {
        CANO: this.config.accountNo,
        ACNT_PRDT_CD: this.config.accountCode,
        INQR_DVSN_1: '',
        BSPR_BF_DT_APLY_YN: '',
        CANO_PWD: this.config.accountPw || ''
      };

      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Investment Asset Status Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '1', msg1: error?.response?.data?.msg1 || error?.message || 'Investment asset status exception', output1: [], output2: [] };
    }
  }

  public async getIntegratedMarginStatus() {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output1: [], output2: [] };
    try {
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/trading/intgr-margin';
      
      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': 'TTTC0869R',
        'custtype': 'P',
      };

      const params = {
        CANO: this.config.accountNo,
        ACNT_PRDT_CD: this.config.accountCode,
        CMA_EVLU_AMT_ICLD_YN: 'N',
        WCRC_FRCR_DVSN_CD: '01',
        FWEX_CTRT_FRCR_DVSN_CD: '01'
      };

      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Integrated Margin Status Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '1', msg1: error?.response?.data?.msg1 || error?.message || 'Integrated margin status exception', output1: [], output2: [] };
    }
  }

  public async getDomesticBalance() {
    if (!this.config) throw new Error("KIS Config not initialized");
    const token = await this.getAccessToken();
    const endpoint = '/uapi/domestic-stock/v1/trading/inquire-balance';
    
    const trId = 'TTTC8434R';
    
    const headers: any = {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
      'appkey': this.config.appKey,
      'appsecret': this.config.appSecret,
      'tr-id': trId,
      'tr-cont': '',
      'custtype': 'P',
    };

    const params = {
      CANO: this.config.accountNo,
      ACNT_PRDT_CD: this.config.accountCode,
      AFHR_FLPR_YN: 'N',
      OFL_YN: '',
      INQR_DVSN: '02',
      UNPR_DVSN: '01',
      FUND_STTL_ICLD_YN: 'N',
      FNCG_AMT_AUTO_RDPT_YN: 'N',
      PRCS_DVSN: '00',
      CTX_AREA_FK100: '',
      CTX_AREA_NK100: '',
      CANO_PWD: this.config.accountPw || ''
    };

    try {
      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      if (res.data.rt_cd && res.data.rt_cd !== '0') {
        const isTrIdError = res.data.msg_cd === 'EGW00310' || res.data.msg1?.includes('EGW00310');
        if (isTrIdError) {
           headers['tr-id'] = 'TTTC8432R';
           const retryRes = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
           if (retryRes.data.rt_cd === '0') return retryRes.data;
        }
        console.warn(`[KIS Service] Domestic Balance Error: ${res.data.msg1} (${res.data.msg_cd})`);
        return { rt_cd: '1', msg1: res.data.msg1 || 'Domestic balance failed', output1: [], output2: [] };
      }
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Domestic Balance Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '1', msg1: error?.response?.data?.msg1 || error?.message || 'Domestic balance exception', output1: [], output2: [] };
    }
  }

  public async getDomesticBuyableAmount(symbol: string = '005930', price: string = '0', ordDvsn: string = '01') {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output: { max_ord_psbl_qty: '0', ord_psbl_cash: '0', ord_psbl_amt: '0', nrcy_ord_psbl_amt: '0' } };
    const querySymbol = (symbol && /^\d{6}$/.test(symbol)) ? symbol : '005930';
    try {
      await this.throttleRequest();
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/trading/inquire-psbl-order';
     const trId = 'TTTC8908R';
      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': trId,
        'custtype': 'P',
      };

      const numericPrice = Number(price);
      // If limit order (00) but price is 0 or empty, query as market order (01) to fetch account orderable cash successfully
      const effectiveOrdDvsn = (ordDvsn === '00' && (!numericPrice || numericPrice <= 0)) ? '01' : ordDvsn;
      const effectivePrice = (effectiveOrdDvsn === '00' && numericPrice > 0) ? price : '0';

      const params = {
        CANO: this.config.accountNo,
        ACNT_PRDT_CD: this.config.accountCode,
        PDNO: querySymbol,
        ORD_UNPR: effectivePrice,
        ORD_DVSN: effectiveOrdDvsn,
        CMA_EVLU_AMT_ICLD_YN: 'Y',
        OVRS_ICLD_YN: 'N',
        CANO_PWD: this.config.accountPw || ''
      };

      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      if (res.data.rt_cd && res.data.rt_cd !== '0') {
        console.warn(`[KIS Service] Domestic Buyable Amount Error: ${res.data.msg1} (${res.data.msg_cd})`);
        return { rt_cd: res.data.rt_cd || '1', msg1: res.data.msg1 || 'Domestic buyable error', output: { max_ord_psbl_qty: '0', ord_psbl_cash: '0', ord_psbl_amt: '0', nrcy_ord_psbl_amt: '0', nrcy_buy_qty: '0', ord_psbl_qty: '0' } };
      }
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Domestic Buyable Amount Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '1', msg1: error?.message || 'Domestic buyable exception', output: { max_ord_psbl_qty: '0', ord_psbl_cash: '0', ord_psbl_amt: '0', nrcy_ord_psbl_amt: '0', nrcy_buy_qty: '0', ord_psbl_qty: '0' } };
    }
  }

  public async getDomesticOrderableCash(targetSymbol?: string) {
    if (!this.config) return { orderableKrw: 0, ord_psbl_cash: 0, ord_psbl_amt: 0, nrcy_ord_psbl_amt: 0, rt_cd: '1', msg1: "KIS Config not initialized" };
    try {
      const sym = (targetSymbol && /^\d{6}$/.test(targetSymbol)) ? targetSymbol : '005930';
      const buyableRes = await this.getDomesticBuyableAmount(sym, '0', '01');
      if (buyableRes && buyableRes.rt_cd === '0' && buyableRes.output) {
        const out = buyableRes.output;
        // KIS exact API fields: ord_psbl_cash (주문가능현금), nrcy_ord_psbl_amt (비대면주문가능금액), ord_psbl_amt (주문가능금액)
        const ord_psbl_cash = Number(out.ord_psbl_cash || 0);
        const nrcy_ord_psbl_amt = Number(out.nrcy_ord_psbl_amt || 0);
        const ord_psbl_amt = Number(out.ord_psbl_amt || 0);
        
        // Exact real-time orderable KRW priority: ord_psbl_cash > nrcy_ord_psbl_amt > ord_psbl_amt
        const exactCash = ord_psbl_cash > 0 ? ord_psbl_cash : (nrcy_ord_psbl_amt > 0 ? nrcy_ord_psbl_amt : ord_psbl_amt);
        return {
          orderableKrw: exactCash,
          ord_psbl_cash,
          ord_psbl_amt,
          nrcy_ord_psbl_amt,
          rt_cd: '0',
          msg1: 'OK'
        };
      }
      return { orderableKrw: 0, ord_psbl_cash: 0, ord_psbl_amt: 0, nrcy_ord_psbl_amt: 0, rt_cd: buyableRes?.rt_cd || '1', msg1: buyableRes?.msg1 || 'No data' };
    } catch (e: any) {
      return { orderableKrw: 0, ord_psbl_cash: 0, ord_psbl_amt: 0, nrcy_ord_psbl_amt: 0, rt_cd: '1', msg1: e.message };
    }
  }

  public async getOverseasBuyableAmount(symbol: string, price: string = '0', ovrsExchCd: string = 'NASD'): Promise<any> {
    return { rt_cd: '0', msg1: '', output: { max_ord_psbl_qty: '0', frcr_ord_psbl_amt1: '0', ord_psbl_frcr_amt: '0', frcr_ord_psbl_amt: '0', ovrs_ord_psbl_amt: '0', nrcy_buy_qty: '0', ord_psbl_qty: '0', max_buy_qty: '0', max_ord_qty: '0' } };
  }

  public async getExchangeRate(): Promise<{ fx_rt: string }[]> {
    return [{ fx_rt: '1350.00' }];
  }

  public async getDomesticSellableQuantity(symbol: string) {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output: { ord_psbl_qty: '0', nrc_psbl_qty: '0' } };
    if (!symbol || !/^\d{6}$/.test(symbol)) return { rt_cd: '0', output: { ord_psbl_qty: '0', nrc_psbl_qty: '0' } };
    try {
      await this.throttleRequest();
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/trading/inquire-psbl-sell';
      
      const trId = 'TTTC8408R';

      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': trId,
        'custtype': 'P',
      };

      const params = {
        CANO: this.config.accountNo,
        ACNT_PRDT_CD: this.config.accountCode,
        PDNO: symbol,
        CANO_PWD: this.config.accountPw || ''
      };

      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Domestic Sellable Quantity Exception safely caught:", error?.response?.data || error?.message);
      return {
  rt_cd: '1',
  msg1: error?.message || 'API Error',
  output: {
    ord_psbl_qty: '0'
  }
};
    }
  }

  public async getPeriodTradeProfit(startDate: string, endDate: string, symbol: string = '', sortDvsn: string = '02') {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output1: [], output2: [] };
    try {
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/trading/inquire-period-trade-profit';

      const trId = 'TTTC8715R';

      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': trId,
        'tr_id': trId,
        'custtype': 'P',
      };

      const params = {
        CANO: this.config.accountNo,
        ACNT_PRDT_CD: this.config.accountCode,
        SORT_DVSN: sortDvsn,
        PDNO: symbol || '',
        INQR_STRT_DT: startDate,
        INQR_END_DT: endDate,
        CTX_AREA_NK100: '',
        CBLC_DVSN: '00',
        CTX_AREA_FK100: ''
      };

      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params, timeout: 8000 }));
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Period Trade Profit Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '0', output1: [], output2: [] };
    }
  }

  public async getDomesticPeriodRealizedPnL(startDate: string, endDate: string, symbol: string = '') {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output1: [], output2: {} };
    try {
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/trading/inquire-period-profit';

      // 🛡️ 실제 KIS 공식 API 목록(api.xlsx) 대조 결과, TTTC8494R은 이 엔드포인트(inquire-period-profit)가
      // 아니라 inquire-balance-rlz-pl(주식잔고조회_실현손익)용 TR_ID였다. inquire-period-profit
      // (기간별손익일별합산조회)의 정확한 TR_ID는 TTTC8708R이다. TR_ID와 엔드포인트가 서로 안 맞는
      // 조합으로 호출되고 있어서 정상적인 응답을 못 받고 있었을 가능성이 높다.
      const trId = 'TTTC8708R';

      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': trId,
        'tr_id': trId,
        'custtype': 'P',
      };

      const params = {
        CANO: this.config.accountNo,
        ACNT_PRDT_CD: this.config.accountCode,
        INQR_STRT_DT: startDate,
        INQR_END_DT: endDate,
        SLL_BUY_DVSN_CD: '00',
        INQR_DVSN: '00',
        PDNO: symbol || '',
        CCLD_DVSN: '00',
        ORD_GNO_BRNO: '',
        ODNO: '',
        INQR_DVSN_3: '00',
        INQR_DVSN_1: '00',
        INQR_DVSN_2: '00',
        COST_ICLD_YN: 'N',
        PRCS_DVSN: '00', // 00: 가결제포함 (당일/최근 체결 매매 전체 포함)
        CTX_AREA_FK100: '',
        CTX_AREA_NK100: '',
        CANO_PWD: this.config.accountPw || ''
      };

      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params, timeout: 8000 }));
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Period Realized PnL Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '0', output1: [], output2: {} };
    }
  }

  /**
   * 주식일별주문체결조회 (TTTC0081R, 3개월 이내) — 주문별 주문수량·체결수량·미체결잔량·평균체결가.
   * 🔴 (2026-09-29) 매우 중요한 수정 — 예전 코드는 엔드포인트 경로가 `inquire-daily-ccnl`(오타)이고, 요청 파라미터도
   * 공식 규격과 달랐다(SND_CD/SMRT_OTSN_YN/ODER_FG_CD/PRCS_DVSN — 공식은 SLL_BUY_DVSN_CD/CCLD_DVSN/INQR_DVSN_3 등).
   * 그 결과 KIS가 오류를 돌려줬고, 예외 처리에서 "성공(rt_cd '0') + 빈 목록"으로 바꿔 반환해서 아무도 몰랐다 →
   * checkOrderExecution()이 **어떤 주문도 찾지 못해**(found:false) 체결 확인·미체결 감시·취소 전 상태 확인·
   * 새로고침 후 미체결 매도 복구·외부 매도 체결가 조회가 전부 동작하지 않았다(손절 전 기존 매도 취소가 "상태 확인
   * 불가"로 막혀 손절이 보류되는 원인 포함). KIS 공식 샘플(examples_llm/domestic_stock/inquire_daily_ccld)로 확인한
   * 경로·파라미터로 교체하고, 한 번에 최대 100건이라 연속조회(커서)로 이어 받는다. 실패는 rt_cd '1'로 알린다.
   * @param ccldDvsn '00' 전체 / '01' 체결 / '02' 미체결 (예전 인자 이름 oderFg와 같은 코드 체계)
   * @param odno 특정 주문번호만 조회(선택)
   */
  public async getDomesticOrderExecutions(startDate: string, endDate: string, ccldDvsn: '00' | '01' | '02' = '00', _unused: '00' | '01' | '02' = '00', odno: string = '') {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output1: [], output2: [] };
    try {
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/trading/inquire-daily-ccld';
      const trId = 'TTTC0081R';

      let collected: any[] = [];
      let output2: any = undefined;
      let ctxFk100 = '';
      let ctxNk100 = '';
      let trCont = '';
      const MAX_PAGES = 10; // 100건 × 10 = 1,000건 — 하루 주문·정정·취소 건수로 충분

      for (let page = 0; page < MAX_PAGES; page++) {
        const headers = {
          'content-type': 'application/json',
          'authorization': `Bearer ${token}`,
          'appkey': this.config.appKey,
          'appsecret': this.config.appSecret,
          'tr-id': trId,
          'tr_id': trId,
          'custtype': 'P',
          'tr_cont': trCont,
        };
        const params = {
          CANO: this.config.accountNo,
          ACNT_PRDT_CD: this.config.accountCode,
          INQR_STRT_DT: startDate,
          INQR_END_DT: endDate,
          SLL_BUY_DVSN_CD: '00',   // 00 전체 / 01 매도 / 02 매수
          PDNO: '',
          CCLD_DVSN: ccldDvsn,     // 00 전체 / 01 체결 / 02 미체결
          INQR_DVSN: '00',         // 00 역순(최근 주문부터) / 01 정순
          INQR_DVSN_3: '00',       // 00 전체
          ORD_GNO_BRNO: '',
          ODNO: odno || '',
          INQR_DVSN_1: '',
          CTX_AREA_FK100: ctxFk100,
          CTX_AREA_NK100: ctxNk100,
          EXCG_ID_DVSN_CD: getExchangeIdForOrder(),
        };

        const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
        const body = res?.data;
        if (!body || body.rt_cd !== '0') {
          if (page === 0) {
            console.warn('[KIS 주문체결조회 실패]', body?.msg_cd, body?.msg1);
            return { rt_cd: '1', msg1: body?.msg1 || '주문체결조회 실패', output1: [], output2: [] };
          }
          break; // 다음 페이지 실패 — 받은 데까지 사용
        }
        const rows = Array.isArray(body.output1) ? body.output1 : [];
        collected = collected.concat(rows);
        if (output2 === undefined) output2 = body.output2;

        // 연속조회: 응답 헤더(tr_cont)는 서버 프록시가 전달하지 않으므로 본문의 커서로 판단한다.
        const nextFk = typeof body.ctx_area_fk100 === 'string' ? body.ctx_area_fk100 : '';
        const nextNk = typeof body.ctx_area_nk100 === 'string' ? body.ctx_area_nk100 : '';
        if (rows.length < 100 || !nextNk.trim() || (nextFk === ctxFk100 && nextNk === ctxNk100)) break;
        ctxFk100 = nextFk;
        ctxNk100 = nextNk;
        trCont = 'N';
      }

      return { rt_cd: '0', msg1: 'OK', output1: collected, output2: output2 ?? [] };
    } catch (error: any) {
      console.warn("[KIS Service] Domestic Order Executions Exception:", error?.response?.data || error?.message);
      return { rt_cd: '1', msg1: error?.message || '주문체결조회 예외', output1: [], output2: [] };
    }
  }

  public async cancelOrder(symbol: string, orgNo: string, ordNo: string, qty: string, ordDvsn: string = '00') {
    return this.cancelDomesticOrder(
  orgNo,
  ordNo,
  qty,
  ordDvsn
);
  }

  // 🎯 브라우저 새로고침 후 복구용 — 오늘 접수된 주문 중 "미체결 매도"만 조회한다. 새로고침으로
  // pendingSellOrders(React state)가 초기화돼도, 이 함수로 KIS 실계좌에 실제로 걸려있는 미체결
  // 매도주문을 다시 파악해서 중복 매도 방지 로직이 계속 정상 작동하게 만들 수 있다.
  public async getUnfilledSellOrders(): Promise<Array<{ odno: string; symbol: string; orderPrice: number; unfilledQty: number; orderQty: number }>> {
    if (!this.config) return [];
    try {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()).replace(/-/g, ''); // KST 기준 오늘(예전 UTC 기준은 00~09시에 전날이 됨)
      // ODER_FG_CD: '02' = 미체결만 조회 (KIS 문서 기준 00:전체 01:체결 02:미체결)
      const res = await this.getDomesticOrderExecutions(todayStr, todayStr, '02');
      if (!res || res.rt_cd !== '0' || !Array.isArray(res.output1)) return [];

      const result: Array<{ odno: string; symbol: string; orderPrice: number; unfilledQty: number; orderQty: number }> = [];
      for (const item of res.output1) {
        // 🛡️ 매도/매수 구분 필드명이 KIS 응답에서 대소문자·표기가 섞여 나올 수 있어 여러 후보를
        // 다 확인한다 — 확실하지 않으면(필드 자체를 못 찾으면) 안전하게 건너뛴다(매수를 매도로
        // 착각해서 잘못 처리하는 것보다, 그 항목을 놓치는 게 훨씬 안전하다).
        const sellBuyCode = (item.sll_buy_dvsn_cd ?? item.SLL_BUY_DVSN_CD ?? '').toString().trim();
        const isSell = sellBuyCode === '01'; // KIS 표준: 01=매도, 02=매수
        if (!isSell) continue;

        const rmndQty = Number(item.rmn_qty ?? item.RMN_QTY ?? item.rmnd_qty ?? item.RMND_QTY ?? 0); // (2026-10-06) 올바른 필드명은 rmn_qty
        if (!(rmndQty > 0)) continue; // 미체결 수량이 없으면(전량체결/취소됨) 대상 아님

        const odno = (item.odno ?? item.ODNO ?? '').toString().trim();
        const symbol = (item.pdno ?? item.PDNO ?? '').toString().trim();
        const orderPrice = Number(item.ord_unpr ?? item.ORD_UNPR ?? 0);
        const orderQty = Number(item.ord_qty ?? item.ORD_QTY ?? 0);
        if (!odno || !symbol) continue;

        result.push({ odno, symbol, orderPrice, unfilledQty: rmndQty, orderQty });
      }
      return result;
    } catch (error: any) {
      console.warn("[KIS Service] getUnfilledSellOrders Exception safely caught:", error?.response?.data || error?.message);
      return [];
    }
  }

  // 🆕 정정취소가능주문조회(2026-09-28) — KIS가 "지금 이 순간 실제로 취소/정정 가능한 주문"만
  // 콕 집어서 내려주는 전용 조회다(APBK0927 "정정취소 가능수량이 없습니다"의 그 "가능수량"을
  // 직접 알려주는 API). 기존 getUnfilledSellOrders()는 "당일 체결내역조회"에서 미체결 잔량
  // (rmnd_qty)을 간접 추정하는 방식이었는데, 이 API는 psbl_qty(정정취소가능수량)를 KIS가
  // 직접 계산해서 내려주므로 더 정확하다. App.tsx에서 이 결과를 로컬 pendingSellOrders와
  // 대조해서, 로컬이 놓치고 있는 매도 대기 주문("고아 주문")을 찾아 복구하는 용도로 쓴다.
  public async getPsblRvsecnclOrders(): Promise<Array<{
    odno: string; orgNo: string; symbol: string; orderPrice: number; orderQty: number;
    cancelablePsblQty: number; isSell: boolean; ordTmd: string;
  }>> {
    if (!this.config) return [];
    try {
      const token = await this.getAccessToken();
      // 🔴 (2026-09-29) 경로 수정 — 예전 '/inquire-psbl-rvsecncl-lst'는 존재하지 않는 경로라 항상 실패(빈 목록)했다.
      // KIS 공식 샘플(examples_llm/domestic_stock/inquire_psbl_rvsecncl) 기준 경로로 교체.
      const endpoint = '/uapi/domestic-stock/v1/trading/inquire-psbl-rvsecncl';
      const trId = 'TTTC0084R';

      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': trId,
        'tr_id': trId,
        'custtype': 'P',
      };

      const params = {
        CANO: this.config.accountNo,
        ACNT_PRDT_CD: this.config.accountCode,
        CTX_AREA_FK100: '',
        CTX_AREA_NK100: '',
        INQR_DVSN_1: '0', // 0: 전체(조회순서 구분 없음)
        INQR_DVSN_2: '0', // 0: 전체(매도+매수 둘 다 받아서 App.tsx에서 매도만 골라 씀)
      };

      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      const data = res.data;
      if (!data || data.rt_cd !== '0' || !Array.isArray(data.output)) return [];

      const result: Array<{ odno: string; orgNo: string; symbol: string; orderPrice: number; orderQty: number; cancelablePsblQty: number; isSell: boolean; ordTmd: string; }> = [];
      for (const item of data.output) {
        const odno = (item.odno ?? item.ODNO ?? '').toString().trim();
        if (!odno) continue;
        const orgNo = (item.ord_gno_brno ?? item.ORD_GNO_BRNO ?? '').toString().trim();
        const symbol = (item.pdno ?? item.PDNO ?? '').toString().trim();
        const orderPrice = Number(item.ord_unpr ?? item.ORD_UNPR ?? 0);
        const orderQty = Number(item.ord_qty ?? item.ORD_QTY ?? 0);
        const cancelablePsblQty = Number(item.psbl_qty ?? item.PSBL_QTY ?? 0);
        const sellBuyCode = (item.sll_buy_dvsn_cd ?? item.SLL_BUY_DVSN_CD ?? '').toString().trim();
        const isSell = sellBuyCode === '01'; // KIS 표준: 01=매도, 02=매수
        const ordTmd = (item.ord_tmd ?? item.ORD_TMD ?? '').toString().trim();
        if (!symbol) continue;
        result.push({ odno, orgNo, symbol, orderPrice, orderQty, cancelablePsblQty, isSell, ordTmd });
      }
      return result;
    } catch (error: any) {
      console.warn("[KIS Service] getPsblRvsecnclOrders Exception safely caught:", error?.response?.data || error?.message);
      return [];
    }
  }

  // 🆕 오늘 체결된 "매도" 내역을 종목 기준으로 합산 조회(2026-09-28 추가) — KIS의 당일 체결내역은
  // 프로그램(OpenAPI)으로 낸 주문이든 KIS 앱/HTS에서 직접 낸 주문이든 같은 계좌 활동이라 전부
  // 섞여서 나온다. 신호 성과 분석(매매 일지)이 "우리 프로그램이 낸 매도만" 기록하고 있어서,
  // 사용자가 KIS 앱에서 직접 매도한 청산 거래는 통계에 전혀 반영되지 않던 문제를 고치는 데 쓴다 —
  // 앱 밖에서 종목이 전량 매도된 것을 감지했을 때, 이 함수로 그 실제 체결가/체결수량을 가져와서
  // 매매 일지에 청산 거래로 기록한다(정확한 체결가를 모른 채 현재가로 대충 기록하는 것보다 안전).
  public async getTodayFilledSellSummary(symbol: string): Promise<{ totalQty: number; avgPrice: number; lastFillTime: string } | null> {
    if (!this.config) return null;
    try {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()).replace(/-/g, ''); // KST 기준 오늘(예전 UTC 기준은 00~09시에 전날이 됨)
      // ODER_FG_CD: '01' = 체결만 조회 (00:전체 01:체결 02:미체결)
      const res = await this.getDomesticOrderExecutions(todayStr, todayStr, '01');
      if (!res || res.rt_cd !== '0' || !Array.isArray(res.output1)) return null;

      let totalQty = 0;
      let weightedSum = 0;
      let lastFillTime = '';
      for (const item of res.output1) {
        const itemSymbol = (item.pdno ?? item.PDNO ?? '').toString().trim();
        if (itemSymbol !== symbol) continue;
        const sellBuyCode = (item.sll_buy_dvsn_cd ?? item.SLL_BUY_DVSN_CD ?? '').toString().trim();
        if (sellBuyCode !== '01') continue; // 01=매도만

        const ccldQty = Number(item.tot_ccld_qty ?? item.TOT_CCLD_QTY ?? 0);
        if (!(ccldQty > 0)) continue;
        const ccldPrice = Number(item.avg_prvs ?? item.AVG_PRVS ?? item.ord_unpr ?? item.ORD_UNPR ?? 0);
        if (!(ccldPrice > 0)) continue;

        totalQty += ccldQty;
        weightedSum += ccldQty * ccldPrice;
        const tmd = (item.ord_tmd ?? item.ORD_TMD ?? '').toString().trim();
        if (tmd && tmd > lastFillTime) lastFillTime = tmd;
      }

      if (totalQty <= 0) return null;
      return { totalQty, avgPrice: weightedSum / totalQty, lastFillTime };
    } catch (error: any) {
      console.warn("[KIS Service] getTodayFilledSellSummary Exception safely caught:", error?.response?.data || error?.message);
      return null;
    }
  }

  private _todayExecCache: { at: number; day: string; data: any } | null = null;
  public async checkOrderExecution(odno: string) {
    if (!this.config) throw new Error("KIS Config not initialized");
    if (!odno) return { found: false, isFullyFilled: false, isPartiallyFilled: false, isUnfilled: true, price: 0 };
    
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()).replace(/-/g, ''); // KST 기준 오늘(예전 UTC 기준은 00~09시에 전날이 됨)
    const cleanOdno = odno.toString().trim().replace(/^0+/, '');
    const paddedOdno = odno.toString().trim().padStart(10, '0');

    try {
      // 주문번호로 먼저 좁혀 조회하고(빠르고 100건 제한과 무관), 못 찾으면 오늘 전체 목록에서 다시 찾는다.
      let res: any = await this.getDomesticOrderExecutions(todayStr, todayStr, '00', '00', paddedOdno);
      const matchOdno = (item: any) => {
        const itemOdno = (item.odno || item.ODNO || '').toString().trim();
        return itemOdno === odno || itemOdno === paddedOdno || itemOdno.replace(/^0+/, '') === cleanOdno;
      };
      if (!(res && res.rt_cd === '0' && Array.isArray(res.output1) && res.output1.some(matchOdno))) {
        // 오늘 전체 목록은 여러 주문 확인이 겹칠 때 REST 호출이 몰리지 않도록 1.2초간 공유한다
        const cached = this._todayExecCache;
        if (cached && cached.day === todayStr && Date.now() - cached.at < 1200) {
          res = cached.data;
        } else {
          res = await this.getDomesticOrderExecutions(todayStr, todayStr);
          if (res && res.rt_cd === '0') this._todayExecCache = { at: Date.now(), day: todayStr, data: res };
        }
      }
      if (res && res.rt_cd !== '0') {
        return { found: false, isFullyFilled: false, isPartiallyFilled: false, isUnfilled: true, price: 0, error: res.msg1 || 'query failed' };
      }
      if (res && res.rt_cd === '0' && res.output1 && Array.isArray(res.output1)) {
        const order = res.output1.find((item: any) => {
          const itemOdno = (item.odno || item.ODNO || '').toString().trim();
          const cleanItemOdno = itemOdno.replace(/^0+/, '');
          return itemOdno === odno || itemOdno === paddedOdno || cleanItemOdno === cleanOdno;
        });
        if (order) {
          const ordQty = Number(order.ord_qty || order.ORD_QTY || 0);
          const ccldQty = Number(order.tot_ccld_qty || order.TOT_CCLD_QTY || 0);
          // 🛠️ (2026-10-06) 미체결 잔량 필드는 rmn_qty다. 예전엔 없는 이름(rmnd_qty)을 읽어서 잔량이 항상 0으로 나왔고,
          // 살아 있는 미체결 주문을 "KIS에서 이미 종료된 주문"으로 보고 감시 목록에서 지웠다 → 그 종목에 매수 주문이
          // 계속 다시 나가고 30초 만료 취소도 되지 않았다. 필드가 없으면 주문수량 − 체결 − 취소확인 − 거부로 계산한다.
          const rawRmn = order.rmn_qty ?? order.RMN_QTY ?? order.rmnd_qty ?? order.RMND_QTY;
          const cnclQty = Number(order.cncl_cfrm_qty ?? order.CNCL_CFRM_QTY ?? 0) || 0;
          const rjctQty = Number(order.rjct_qty ?? order.RJCT_QTY ?? 0) || 0;
          const cancelled = String(order.cncl_yn ?? order.CNCL_YN ?? '').toUpperCase() === 'Y';
          const hasRmnField = rawRmn !== undefined && rawRmn !== null && String(rawRmn).trim() !== '';
          const rmndQty = hasRmnField
            ? Math.max(0, Number(rawRmn) || 0)
            : (cancelled ? 0 : Math.max(0, ordQty - ccldQty - cnclQty - rjctQty));
          // 주문이 끝났다고 확실히 말할 수 있는지 — 잔량 필드를 실제로 받았거나, 취소·거부가 확인됐거나, 전량 체결
          const closedConfirmed = hasRmnField || cancelled || cnclQty > 0 || rjctQty > 0 || (ordQty > 0 && ccldQty >= ordQty);
          const prpr = Number(order.avg_prvs || order.AVG_PRVS || order.ord_unpr || order.ORD_UNPR || 0);
          
          // 🛡️ 외부 검토(2026-09-28) 반영 — 예전엔 isUnfilled를 ccldQty === 0만으로 판단해서,
          // "100주 주문 중 0주 체결 후 취소 완료"된(이미 죽은) 주문도 isUnfilled: true로 잘못
          // 나왔다(체결 0주라는 사실만 보고 아직 살아있는 미체결 주문처럼 보인 것). 실제 주문의
          // 생사 여부는 미체결 잔량(rmndQty)이 남아있는지로 판단해야 정확하다.
          return {
            found: true,
            ordQty,
            ccldQty,
            rmndQty,
            closedConfirmed,
            isFullyFilled: ordQty > 0 && rmndQty <= 0 && ccldQty >= ordQty,
            isPartiallyFilled: ccldQty > 0 && rmndQty > 0,
            isUnfilled: rmndQty > 0,
            price: prpr
          };
        }
      }
      return { found: false, isFullyFilled: false, isPartiallyFilled: false, isUnfilled: true, price: 0 };
    } catch (e) {
      console.error("[KIS Service] checkOrderExecution error:", e);
      return { found: false, isFullyFilled: false, isPartiallyFilled: false, isUnfilled: true, price: 0, error: e };
    }
  }

  public async orderDomestic(
  symbol: string,
  side: 'BUY' | 'SELL',
  price: string,
  qty: string,
  ordDvsn: string = '00'
) {
  if (!this.config) {
    throw new Error("KIS Config not initialized");
  }

  const token = await this.getAccessToken();
  const endpoint = '/uapi/domestic-stock/v1/trading/order-cash';

  // 🛡️ 실제 주문 API 직전 이중 안전장치 — App.tsx의 executeTrade에서 이미 검증하지만, 앞으로
  // 새로운 호출 경로가 생기더라도 여기서 마지막으로 한번 더 막는다. 특히 매도는 가격이 0이면
  // KIS가 "ORD_UNPR: 0"인 지정가 주문을 그대로 받아들여 이상 동작할 위험이 있다.
  const numericPrice = Number(price);
  const numericQty = Number(qty);

  if (!Number.isFinite(numericQty) || numericQty <= 0) {
    throw new Error(`KIS ${side} 주문 실패: 잘못된 수량 (${qty})`);
  }

  if (side === 'SELL') {
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      throw new Error(`KIS SELL 주문 실패: 잘못된 매도가 (${price})`);
    }
  }

  const body: any = {
    CANO: this.config.accountNo,
    ACNT_PRDT_CD: this.config.accountCode,
    PDNO: symbol,
    ORD_DVSN: ordDvsn,
    ORD_QTY: qty,
    ORD_UNPR: ordDvsn === '01' ? '0' : price,
    EXCG_ID_DVSN_CD: getExchangeIdForOrder(),
    CNDT_PRIC: '',
  };

  // 🛡️ SLL_TYPE('01') 필드 제거 — 일반 현금 매도 주문에서 이 필드를 임의로 추가하는 게 오히려
  // 매도 실패의 원인일 가능성이 있어, KIS 표준 현금주문 예제 형태(이 필드를 안 보내는 형태)로
  // 되돌려서 테스트한다. 정확히 어떤 상황에 이 값이 필요한지 KIS 공식 문서로 확정 못 했으므로,
  // 지금은 안전하게 생략한다.

  console.log('[KIS ORDER STEP 1 - 주문 준비]', {
    symbol,
    side,
    qty,
    price,
    ordDvsn,
    exchange: body.EXCG_ID_DVSN_CD
  });

  // ------------------------------------------------------------
  // STEP 2. Hashkey 발급
  // 중요:
  // orderDomestic 전체를 queueRequest로 감싸지 않는다.
  // getHashKey 자체가 queueRequest를 사용하기 때문이다.
  // ------------------------------------------------------------
  const hashkey = await this.getHashKey(body);

  if (!hashkey) {
    console.error('[KIS ORDER STEP 2 FAILED - HASHKEY 없음]', {
      symbol,
      side,
      body
    });

    throw new Error('KIS Hashkey 발급 실패 — 주문을 전송하지 않았습니다.');
  }

  console.log('[KIS ORDER STEP 2 - HASHKEY 발급 완료]', {
    symbol,
    side,
    hashkeyReceived: true
  });

  // ------------------------------------------------------------
  // STEP 3. 실전 주문 TR-ID
  // ------------------------------------------------------------
  const trId =
    side === 'BUY'
      ? 'TTTC0012U'
      : 'TTTC0011U';

  const headers = {
    'content-type': 'application/json',
    'authorization': `Bearer ${token}`,
    'appkey': this.config.appKey,
    'appsecret': this.config.appSecret,
    'tr-id': trId,
    'hashkey': hashkey,
    'custtype': 'P',
  };

  console.log('[KIS ORDER STEP 3 - 실제 주문 API 전송]', {
    symbol,
    side,
    trId,
    qty,
    price,
    ordDvsn
  });

  // ------------------------------------------------------------
  // STEP 4. 실제 주문 API — 주문 전용 큐 사용 (해시키 발급과 동일한 큐).
  // 시장데이터 큐(가격/호가/랭킹/잔고 등)와 완전히 분리되어, 추천종목 검색이나 REST 백업
  // 조회가 아무리 밀려있어도 이 단계는 영향받지 않는다.
  // ------------------------------------------------------------
  const res = await this.orderQueueRequest<any>(() =>
    axios.post(
      `${this.baseUrl}${endpoint}`,
      body,
      { headers }
    )
  );

  const data = res.data;

  console.log('[KIS ORDER STEP 4 - RAW 응답]', {
    symbol,
    side,
    trId,
    httpStatus: res.status,
    rt_cd: data?.rt_cd,
    msg_cd: data?.msg_cd,
    msg1: data?.msg1,
    output: data?.output,
    output1: data?.output1
  });

  // ------------------------------------------------------------
  // STEP 5. KIS API 자체 실패
  // ------------------------------------------------------------
  if (data?.rt_cd !== '0') {
    const msg = data?.msg1 || 'KIS 주문 실패';
    const code = data?.msg_cd || '';

    console.error('[KIS ORDER FAILED]', {
      symbol,
      side,
      trId,
      rt_cd: data?.rt_cd,
      msg_cd: code,
      msg1: msg
    });

    throw new Error(`국내 주문 실패: ${msg} (${code})`);
  }

  // ------------------------------------------------------------
  // STEP 6. 반드시 주문번호 확인
  // ------------------------------------------------------------
  const rawOdno =
    data?.output?.ODNO ??
    data?.output?.odno ??
    data?.output1?.ODNO ??
    data?.output1?.odno;

  const odno = rawOdno
    ? String(rawOdno).trim()
    : '';

  if (!odno) {
    console.error('[KIS ORDER ACCEPT UNKNOWN - ODNO 없음]', {
      symbol,
      side,
      trId,
      response: data
    });

    throw new Error(
      `KIS API는 성공 응답을 반환했지만 주문번호(ODNO)가 없습니다. 실제 주문 접수 여부를 확인할 수 없습니다.`
    );
  }

  console.log('[KIS ORDER ACCEPTED - 실제 주문접수 확인]', {
    symbol,
    side,
    trId,
    ODNO: odno,
    ORD_TMD: data?.output?.ORD_TMD || data?.output?.ord_tmd
  });

  return data;
}

  public async cancelDomesticOrder(orgNo: string, ordNo: string, qty: string, ordDvsn: string = '00') {
    return this.reviseDomestic(orgNo, ordNo, qty, "0", '02', ordDvsn);
  }

  public async reviseDomestic(orgNo: string, ordNo: string, qty: string, price: string, dvsn: '01' | '02' = '01', ordDvsn: string = '00') {
    if (!this.config) throw new Error("KIS Config not initialized");
    const token = await this.getAccessToken();
    const endpoint = '/uapi/domestic-stock/v1/trading/order-rvsecncl';
    
    // KIS OpenAPI specifications for order revision / cancellation:
    // 1. ORGN_ODNO (Original Order No): MUST be 10 digits string padded with leading zeros
    const formattedOrdNo = ordNo ? ordNo.toString().trim().padStart(10, '0') : '';
    
    // 2. KRX_FWDG_ORD_ORGNO: Exchange order organization no (5 chars, or empty string if not applicable)
    const formattedOrgNo = orgNo ? orgNo.toString().trim() : '';

    // 3. QTY_ALL_ORD_YN & ORD_QTY:
    // When cancelling full remaining quantity (dvsn === '02'), QTY_ALL_ORD_YN = 'Y' and ORD_QTY = '0' per KIS spec.
    const isCancel = dvsn === '02';
    const allOrdYn = isCancel ? 'Y' : (qty && qty !== '0' ? 'N' : 'Y');
    const orderQty = (isCancel || allOrdYn === 'Y') ? '0' : (qty || '0');

    const body = {
      CANO: this.config.accountNo,
      ACNT_PRDT_CD: this.config.accountCode,
      KRX_FWDG_ORD_ORGNO: formattedOrgNo,
      ORGN_ODNO: formattedOrdNo,
      ORD_DVSN: ordDvsn,
      RVSE_CNCL_DVSN_CD: dvsn, // '01': 정정, '02': 취소
      ORD_QTY: orderQty,
      ORD_UNPR: isCancel ? '0' : (price || '0'),
      QTY_ALL_ORD_YN: allOrdYn,
      CNDT_PRIC: '',
      EXCG_ID_DVSN_CD: getExchangeIdForOrder()
    };

    const hashkey = await this.getHashKey(body);

    // 🔄 사용자 확인 결과 TTTC0013U(api.xlsx 문서 대조값)로는 실제 취소/정정이 안 되고 있어서,
    // 이전에 쓰던 TTTC0803U로 되돌린다.
    const trId = 'TTTC0803U';

    const headers = {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
      'appkey': this.config.appKey,
      'appsecret': this.config.appSecret,
      'tr-id': trId,
      'hashkey': hashkey,
      'custtype': 'P',
    };

    // 🎯 정정취소도 주문 전용 큐 사용 — 손절/익절 취소는 매수/매도만큼 시급하므로 시장데이터
    // 큐에 밀려서 지연되면 안 된다.
    const res = await this.orderQueueRequest<any>(() => axios.post(`${this.baseUrl}${endpoint}`, body, { headers }));
    if (res.data.rt_cd && res.data.rt_cd !== '0') {
      console.warn(`[KIS Service] Revise/Cancel Order Result (${res.data.rt_cd}): ${res.data.msg1} (${res.data.msg_cd})`);
    }
    return res.data;
  }

  public async cancelOverseasOrder(orgNo: string, ordNo: string, symbol: string, qty: string) {
    return { rt_cd: "0", msg1: "Deleted", output: {} };
  }

  /**
   * 국내주식 거래량 순위 조회 — 코스피/코스닥 전체 시장에서 지금 거래량이 많은 종목을
   * 실시간으로 가져온다. "추천종목 찾기"가 미리 등록해둔 예시 종목이 아니라 실제 시장을
   * 분석하도록 하기 위한 후보군 소스다.
   */
  public async getVolumeRanking(marketDivCode: 'J' | 'Q' = 'J', count: number = 40, priceFilter?: { minPrice?: number; maxPrice?: number; minVolume?: number }, marketFilter: 'ALL' | 'KOSPI' | 'KOSDAQ' = 'ALL'): Promise<{ symbol: string; name: string; price: number; changePercent: number; volume: string; volumeIncreaseRate?: number; avgVolume?: number; tradingValue?: number; marketType?: 'KOSPI' | 'KOSDAQ' }[]> {
    // 🏷️ 전체 시장이면 코스피·코스닥을 따로 조회해서 시장 구분을 붙인 뒤 거래량 순으로 합친다
    const effMarket: MarketType = (marketFilter === 'KOSPI' || marketFilter === 'KOSDAQ') ? marketFilter : SCALPER_MARKET; // (2026-09-30) 추천종목 시장 선택 버튼
    if (effMarket === 'ALL') {
      const kospi = await this.getVolumeRankingFor(MARKET_TYPE_TO_ISCD.KOSPI, marketDivCode, count, priceFilter);
      const kosdaq = await this.getVolumeRankingFor(MARKET_TYPE_TO_ISCD.KOSDAQ, marketDivCode, count, priceFilter);
      const tagged = [
        ...kospi.map(r => ({ ...r, marketType: 'KOSPI' as const })),
        ...kosdaq.map(r => ({ ...r, marketType: 'KOSDAQ' as const })),
      ];
      tagged.forEach(r => rememberMarket(r.symbol, r.marketType));
      const volNum = (v: string) => Number(String(v || '0').replace(/,/g, '')) || 0;
      return tagged.sort((a, b) => volNum(b.volume) - volNum(a.volume)).slice(0, count);
    }
    const single = await this.getVolumeRankingFor(MARKET_TYPE_TO_ISCD[effMarket], marketDivCode, count, priceFilter);
    const mk = effMarket as 'KOSPI' | 'KOSDAQ';
    return single.map(r => { rememberMarket(r.symbol, mk); return { ...r, marketType: mk }; });
  }

  private async getVolumeRankingFor(iscd: string, marketDivCode: 'J' | 'Q' = 'J', count: number = 40, priceFilter?: { minPrice?: number; maxPrice?: number; minVolume?: number }): Promise<{ symbol: string; name: string; price: number; changePercent: number; volume: string; volumeIncreaseRate?: number; avgVolume?: number; tradingValue?: number }[]> {
    if (!this.config) return [];
    // 🛡️ 매우 중요한 수정(2026-09-28, START AI SCALPER 자동 정지 버그) — 예전엔 여기서도
    // recordCallResult()로 소요시간을 기록해서, App.tsx의 "네트워크/API 과부하 시 자동 정지"
    // 안전장치(getNetworkHealth(), 평균 응답지연 4초 초과 시 전체 봇 강제 STOP)가 이 숫자를 같이 봤다.
    // 그런데 이 함수는 최대 5페이지를 rankingQueueRequest 큐를 통해 "순차적으로" 이어받는
    // 합산 소요시간을 기록하고 있었다 — 단일 API 왕복시간이 아니라 여러 건의 합이라 정상적인
    // 상황에서도 4초를 넘기기 매우 쉬웠다(추천종목 찾기 한 번에 최대 12건의 이런 호출이 발생).
    // 즉 "추천종목 찾기"가 조금만 오래 걸려도 실제 시세/주문 API는 멀쩡한데 이 평균이 튀어서
    // 스캘퍼 전체가 강제로 꺼지는 오진(false positive)이 반복됐다 — 실제 매매 가능 여부와
    // 무관한 이 통계 조회를 더 이상 헬스체크에 반영하지 않는다(가격조회/주문 경로는 계속 기록됨).
    try {
      const qa = await this.quoteAuth('RANKING');
      const token = qa.token;
      const endpoint = '/uapi/domestic-stock/v1/quotations/volume-rank';
      const trId = 'FHPST01710000';

      const baseParams: Record<string, string> = {
        FID_COND_MRKT_DIV_CODE: marketDivCode, // J: 상품유형 구분(주식/ETF/ETN 등) — 코스피/코스닥 구분은 아래 FID_INPUT_ISCD가 담당
        FID_COND_SCR_DIV_CODE: '20171',
        FID_INPUT_ISCD: iscd, // 0001=코스피 / 1001=코스닥 (시장 구분 확정을 위해 따로 조회)
        FID_DIV_CLS_CODE: '0',       // 0: 전체
        FID_BLNG_CLS_CODE: '3',      // (2026-09-30) 0 평균거래량 → 3 거래금액순 — 스캘핑은 "지금 돈이 도는" 종목이 우선 (KIS: 0 평균거래량·1 거래증가율·2 평균거래회전율·3 거래금액순·4 평균거래금액회전율)
        FID_TRGT_CLS_CODE: '111111111',
        // 🛡️ 위험/관리종목 제외 — 코스나인 같은 관리종목이 "오늘 거래량이 튀었다"는 이유만으로
        // 후보에 오르는 걸 API 단계에서부터 막는다. 9자리 각 자릿수가 순서대로 투자위험/투자경고/
        // 투자주의/신용주문불가/증거금100%/정리매매/관리종목/불성실공시/우선주를 나타내며, 1이면
        // 해당 종류를 제외한다는 것이 KIS 문서에서 흔히 알려진 관례다.
        // 🎯 사용자 요청으로 3번째 자리(투자주의)만 0으로 바꿔서 통과시킨다 — 투자주의는 "단기간
        // 급등에 대한 가벼운 경고" 수준이라 실시간으로 지켜보며 먹고 빠지는 전략이 성립할 수
        // 있다고 판단해서다. 반면 투자위험/투자경고/관리종목/정리매매(상장폐지 임박)처럼 거래정지·
        // 단일가매매 전환 위험이 훨씬 큰 카테고리는 계속 제외한다. 정확한 자릿수 순서는 100%
        // 확정된 공식 문서를 본 게 아니므로, 아래 진단 로그(_volumeRankingFieldsLogged)의
        // mrkt_warn_cls_code/invt_caful_yn 등 실제 응답 필드로 반드시 재검증해야 한다.
        FID_TRGT_EXLS_CLS_CODE: '110111111',
        // 🔍 가격범위/최소거래량 필터를 API 단에서 적용할 수 있게 옵션화했다 — 기본값(옵션 없음)은
        // 예전처럼 전체 가격대·거래량을 다 받아오고, 필요할 때만 특정 가격대(예: 저가주 스캘핑)로
        // 좁혀서 불필요한 데이터를 애초에 받지 않을 수 있다.
        FID_INPUT_PRICE_1: priceFilter?.minPrice ? String(priceFilter.minPrice) : '',
        FID_INPUT_PRICE_2: priceFilter?.maxPrice ? String(priceFilter.maxPrice) : '',
        FID_VOL_CNT: priceFilter?.minVolume ? String(priceFilter.minVolume) : '',
        FID_INPUT_DATE_1: '',
      };

      // 🛡️ 매우 중요한 수정: 예전엔 count(예: 80)를 요청해도 KIS가 한 번에 최대 30건까지만
      // 응답을 줘서, 실제로는 항상 30개로 잘려있었다(대한광통신 같은 종목이 31위 밖이면 아예
      // 볼 방법이 없었음). KIS의 연속조회(페이지네이션) 방식으로 필요한 개수에 도달하거나 더
      // 이상 페이지가 없을 때까지 이어서 조회한다. 응답 헤더의 tr_cont가 'F'/'M'이면 다음 페이지가
      // 있다는 뜻이고, 이때 응답 바디의 ctx_area_fk100/ctx_area_nk100(커서)을 다음 요청에 그대로
      // 실어 보내면 이어지는 순위를 받을 수 있다 — KIS의 여러 목록형 API가 공통으로 쓰는 방식이다.
      let collected: any[] = [];
      let ctxFk100 = '';
      let ctxNk100 = '';
      let trCont = ''; // 최초 요청은 빈 문자열
      const MAX_PAGES = 5; // 안전장치 — 30개씩 최대 5페이지(150개)면 충분하고, 무한루프/과다호출 방지

      for (let page = 0; page < MAX_PAGES && collected.length < count; page++) {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'authorization': `Bearer ${token}`,
          'appkey': qa.appKey,
          'appsecret': qa.appSecret,
          'tr-id': trId,
          'custtype': 'P',
          'tr_cont': trCont,
        };
        const params = { ...baseParams, CTX_AREA_FK100: ctxFk100, CTX_AREA_NK100: ctxNk100 };

        const res = await qa.run<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));

        if (!res.data || !Array.isArray(res.data.output)) break;

        // 🔍 실제 응답에 어떤 필드가 오는지 최초 1건만 콘솔에 남긴다 — 평균거래량/거래증가율/
        // 거래금액의 정확한 필드명을 다음번에 실사용 로그로 확정하기 위함.
        if (res.data.output.length > 0 && !this._volumeRankingFieldsLogged) {
          this._volumeRankingFieldsLogged = true;
          console.log('[KIS 거래량순위 원본 필드 샘플]', res.data.output[0]);
        }

        collected = collected.concat(res.data.output);

        // 🛡️ 다음 페이지 존재 여부 확인 — 예전엔 응답 헤더 tr_cont가 정확히 'F'/'M'일 때만
        // 다음 페이지를 시도했는데, 실제로는 이 API가 tr_cont를 빈 문자열로 줘서 매번 1페이지에서
        // 멈추고 있었다. 이제 tr_cont 값과 무관하게, 커서(ctx_area_fk100)가 실제로 비어있지 않은
        // 값으로 왔으면 일단 다음 페이지를 시도한다 — 단, 커서가 직전과 완전히 똑같으면(진짜 끝에
        // 도달해 KIS가 같은 값을 계속 돌려주는 경우) 무한루프를 막기 위해 중단한다.
        const responseTrCont = String(res.headers?.['tr_cont'] || '');
        const nextFk100 = res.data.ctx_area_fk100;
        const nextNk100 = res.data.ctx_area_nk100;
        const hasNextCursor = typeof nextFk100 === 'string' && nextFk100.trim().length > 0;
        if (!hasNextCursor || nextFk100 === ctxFk100) {
          break; // 더 이상 페이지 없음(또는 같은 커서 반복 = 끝)
        }
        ctxFk100 = nextFk100;
        ctxNk100 = nextNk100 || '';
        trCont = 'N'; // 연속조회 요청 시 KIS 표준 값
      }

      if (collected.length > 0) {
        return collected.slice(0, count).map((item: any) => ({
          symbol: item.mksc_shrn_iscd || item.stck_shrn_iscd || '',
          name: item.hts_kor_isnm || '',
          price: Number(item.stck_prpr || 0),
          changePercent: Number(item.prdy_ctrt || 0) * (item.prdy_vrss_sign === '4' || item.prdy_vrss_sign === '5' ? -1 : 1),
          volume: Number(item.acml_vol || 0).toLocaleString(),
          // 🔍 KIS 거래량순위 API는 평균거래량/거래증가율/거래금액 같은 세부 지표도 함께 내려줄 수
          // 있는데, 그동안 5개 기본 필드만 뽑고 나머지는 버려지고 있었다. 정확한 필드명이 100%
          // 확정되지 않아 알려진 후보 필드명을 여러 개 시도한다 — 값이 없으면 undefined로 남아
          // 기존 로직에 전혀 영향을 주지 않는다. (실사용 로그로 정확한 필드명 확인 후 캘리브레이션 필요)
          volumeIncreaseRate: item.vol_inrt !== undefined ? Number(item.vol_inrt) : (item.prdy_vol_inrt !== undefined ? Number(item.prdy_vol_inrt) : undefined),
          avgVolume: item.avrg_vol !== undefined ? Number(item.avrg_vol) : undefined,
          tradingValue: item.acml_tr_pbmn !== undefined ? Number(item.acml_tr_pbmn) : undefined,
        })).filter((s: any) => s.symbol && s.price > 0);
      }
      return [];
    } catch (error: any) {
      console.warn("[KIS Service] Volume Ranking fetch failed:", error?.response?.data || error?.message);
      return [];
    }
  }

  /**
   * 국내주식 등락률 순위 조회 — 지금 시장에서 가격이 강하게 움직이고 있는(모멘텀이 강한) 종목을
   * 실시간으로 가져온다. 거래량순위와 결합하면 "거래량도 많고 방향성도 뚜렷한" 스캘핑에 더
   * 적합한 종목을 골라낼 수 있다.
   */
  public async getFluctuationRanking(marketDivCode: 'J' | 'Q' = 'J', direction: 'UP' | 'DOWN' = 'UP', count: number = 40, priceFilter?: { minPrice?: number; maxPrice?: number; minVolume?: number }, marketFilter: 'ALL' | 'KOSPI' | 'KOSDAQ' = 'ALL'): Promise<{ symbol: string; name: string; price: number; changePercent: number; volume: string; marketType?: 'KOSPI' | 'KOSDAQ' }[]> {
    // 🏷️ 전체 시장이면 코스피·코스닥을 따로 조회해서 시장 구분을 붙인 뒤 등락률 순으로 합친다
    const effMarket: MarketType = (marketFilter === 'KOSPI' || marketFilter === 'KOSDAQ') ? marketFilter : SCALPER_MARKET; // (2026-09-30) 추천종목 시장 선택 버튼
    if (effMarket === 'ALL') {
      const kospi = await this.getFluctuationRankingFor(MARKET_TYPE_TO_ISCD.KOSPI, marketDivCode, direction, count, priceFilter);
      const kosdaq = await this.getFluctuationRankingFor(MARKET_TYPE_TO_ISCD.KOSDAQ, marketDivCode, direction, count, priceFilter);
      const tagged = [
        ...kospi.map(r => ({ ...r, marketType: 'KOSPI' as const })),
        ...kosdaq.map(r => ({ ...r, marketType: 'KOSDAQ' as const })),
      ];
      tagged.forEach(r => rememberMarket(r.symbol, r.marketType));
      return tagged
        .sort((a, b) => direction === 'UP' ? (b.changePercent - a.changePercent) : (a.changePercent - b.changePercent))
        .slice(0, count);
    }
    const single = await this.getFluctuationRankingFor(MARKET_TYPE_TO_ISCD[effMarket], marketDivCode, direction, count, priceFilter);
    const mk = effMarket as 'KOSPI' | 'KOSDAQ';
    return single.map(r => { rememberMarket(r.symbol, mk); return { ...r, marketType: mk }; });
  }

  private async getFluctuationRankingFor(iscd: string, marketDivCode: 'J' | 'Q' = 'J', direction: 'UP' | 'DOWN' = 'UP', count: number = 40, priceFilter?: { minPrice?: number; maxPrice?: number; minVolume?: number }): Promise<{ symbol: string; name: string; price: number; changePercent: number; volume: string }[]> {
    if (!this.config) return [];
    // 🛡️ getVolumeRankingFor와 동일한 이유(2026-09-28) — 최대 5페이지 합산 소요시간을 더 이상
    // 헬스체크(getNetworkHealth) 표본으로 기록하지 않는다. START AI SCALPER 자동 정지 오진 수정 참고.
    try {
      const qa = await this.quoteAuth('RANKING');
      const token = qa.token;
      const endpoint = '/uapi/domestic-stock/v1/ranking/fluctuation';
      const trId = 'FHPST01700000';

      const baseParams: Record<string, string> = {
        fid_cond_mrkt_div_code: marketDivCode, // J: 상품유형 구분(주식/ETF/ETN 등) — 코스피/코스닥 구분은 아래 fid_input_iscd가 담당
        fid_cond_scr_div_code: '20170',
        fid_input_iscd: iscd, // 0001=코스피 / 1001=코스닥 (시장 구분 확정을 위해 따로 조회)
        fid_rank_sort_cls_code: direction === 'UP' ? '0' : '1', // 0: 상승률 순, 1: 하락률 순
        fid_input_cnt_1: '0',
        fid_prc_cls_code: '0',
        // 🔍 가격범위/최소거래량 필터를 API 단에서 적용할 수 있게 옵션화 — 거래량순위와 동일한 이유
        fid_input_price_1: priceFilter?.minPrice ? String(priceFilter.minPrice) : '',
        fid_input_price_2: priceFilter?.maxPrice ? String(priceFilter.maxPrice) : '',
        fid_vol_cnt: priceFilter?.minVolume ? String(priceFilter.minVolume) : '',
        fid_trgt_cls_code: '0',
        // 🛡️ 위험/관리종목 제외 — 거래량순위와 동일한 이유. 사용자 요청으로 3번째 자리(투자주의)만
        // 0으로 바꿔서 통과시키고, 나머지(투자위험/투자경고/관리종목 등)는 계속 제외한다.
        fid_trgt_exls_cls_code: '110111111',
        fid_div_cls_code: '0',
        fid_rsfl_rate1: '',
        fid_rsfl_rate2: '',
      };

      // 🛡️ 거래량순위와 동일한 이유로 연속조회 구현 — KIS가 한 번에 최대 30건까지만 줘서, 예전엔
      // count(예: 70)를 요청해도 실제로는 항상 30개로 잘려있었다.
      let collected: any[] = [];
      let ctxFk100 = '';
      let ctxNk100 = '';
      let trCont = '';
      const MAX_PAGES = 5;

      for (let page = 0; page < MAX_PAGES && collected.length < count; page++) {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'authorization': `Bearer ${token}`,
          'appkey': qa.appKey,
          'appsecret': qa.appSecret,
          'tr-id': trId,
          'custtype': 'P',
          'tr_cont': trCont,
        };
        const params = { ...baseParams, ctx_area_fk100: ctxFk100, ctx_area_nk100: ctxNk100 };

        const res = await qa.run<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));

        if (!res.data || !Array.isArray(res.data.output)) break;

        collected = collected.concat(res.data.output);

        const responseTrCont = String(res.headers?.['tr_cont'] || '');
        const nextFk100 = res.data.ctx_area_fk100;
        const nextNk100 = res.data.ctx_area_nk100;
        const hasNextCursor = typeof nextFk100 === 'string' && nextFk100.trim().length > 0;
        if (!hasNextCursor || nextFk100 === ctxFk100) {
          break;
        }
        ctxFk100 = nextFk100;
        ctxNk100 = nextNk100 || '';
        trCont = 'N';
      }

      if (collected.length > 0) {
        return collected.slice(0, count).map((item: any) => ({
          symbol: item.stck_shrn_iscd || item.mksc_shrn_iscd || '',
          name: item.hts_kor_isnm || '',
          price: Number(item.stck_prpr || 0),
          changePercent: Number(item.prdy_ctrt || 0) * (direction === 'DOWN' ? -1 : 1),
          volume: Number(item.acml_vol || 0).toLocaleString()
        })).filter((s: any) => s.symbol && s.price > 0);
      }
      return [];
    } catch (error: any) {
      console.warn("[KIS Service] Fluctuation Ranking fetch failed:", error?.response?.data || error?.message);
      return [];
    }
  }

  public async getDomesticDailyPrice(symbol: string, periodCode: 'D' | 'W' | 'M' = 'D') {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output: [] };
    try {
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/quotations/inquire-daily-price';
      
      const trId = 'FHKST01010400';
      
      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': trId,
        'custtype': 'P',
      };

      const params = {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: symbol,
        FID_PERIOD_DIV_CODE: periodCode,
        FID_ORG_ADJ_PRC: '0000000001',
      };

      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Domestic Daily Price Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '0', output: [] };
    }
  }

  private lastRequestTime = 0;
  private minRequestInterval = 500; // Minimum 500ms interval between API calls to prevent Rate Limit (EGW00201 / 429)
  private globalRateLimitCooldownUntil = 0; // 🛡️ 429가 뜨면 이 시각까지 전체 가격 조회를 잠시 미룬다 (한 종목만 재시도해서는 부족함)

  // 🎯 주문 전용 큐 — 시장데이터(가격/호가/랭킹/잔고 등) 조회는 기존 requestQueueChain을 그대로
  // 쓰고, 해시키 발급과 실제 주문 전송만 이 별도 체인을 쓴다. 이렇게 분리하지 않으면, 추천종목
  // 검색이나 REST 백업 조회가 한꺼번에 몰릴 때 그 뒤에 줄 선 실제 주문이 지연될 수 있다 —
  // "인벤토리 실시간성과 추천종목 탐색은 같은 우선순위로 처리하면 안 된다"는 원칙을 주문에도
  // 적용한 것. globalRateLimitCooldownUntil(KIS 서버 자체의 전역 429 제한)은 공유한다 — 이건
  // 어느 큐에서 발생했든 KIS 서버가 전체 계정에 거는 제한이라 분리할 수 없는 값이기 때문이다.
  private lastOrderRequestTime = 0;
  private orderRequestQueueChain: Promise<any> = Promise.resolve();
  private _volumeRankingFieldsLogged = false; // 🔍 거래량순위 API 원본 필드 샘플을 최초 1회만 로그로 남기기 위한 플래그

  // 🎯 추천종목(거래량순위/등락률순위) 전용 큐 — 시장데이터 큐(requestQueueChain)와 분리한다.
  // 문제: 등록종목이 많아질수록(과제 1로 최대 80종목까지 늘어남) refreshStalePrices/orderbook
  // 폴링/잔고 동기화 같은 REST 백업 요청이 requestQueueChain에 쌓이고, 추천종목 검색(코스피/코스닥
  // ×거래량/등락률×가격구간 3분할 = 최대 12건의 순차 요청)이 그 뒤에 줄을 서면서 App.tsx의
  // 30초 타임아웃(ranking_timeout)에 걸리는 경우가 있었다. 주문(orderQueueRequest)을 시장데이터
  // 큐와 분리한 것과 동일한 이유로, 추천종목 조회도 독립된 체인으로 분리해서 서로 밀어내지
  // 않게 한다. globalRateLimitCooldownUntil(KIS 서버가 계정 전체에 거는 429 제한)은 그대로 공유한다.
  private lastRankingRequestTime = 0;
  private rankingRequestQueueChain: Promise<any> = Promise.resolve();

  /** 지수 백오프 지연시간 계산: 1차 2초, 2차 4초, 3차 8초, 4차 15초, 5차 30초 (상한 고정) */
  private getBackoffDelay(attempt: number): number {
    const delays = [2000, 4000, 8000, 15000, 30000];
    return delays[Math.min(attempt - 1, delays.length - 1)];
  }
  private requestQueueChain: Promise<any> = Promise.resolve();

  public async queueRequest<T>(fn: () => Promise<T>): Promise<T> {
    const nextInQueue = this.requestQueueChain.then(async () => {
      // 🛡️ 다른 경로(getPrice 등)에서 이미 429를 만나 전역 쿨다운 중이면 같이 기다린다
      const cooldownRemaining = this.globalRateLimitCooldownUntil - Date.now();
      if (cooldownRemaining > 0) {
        await new Promise(resolve => setTimeout(resolve, cooldownRemaining));
      }
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < this.minRequestInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLast));
      }
      this.lastRequestTime = Date.now();
      return await this.executeWithBackoff(fn);
    });

    this.requestQueueChain = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  // 🎯 주문 전용 큐 — 시장데이터 큐(requestQueueChain)와 완전히 독립된 체인을 쓴다. 추천종목
  // 검색이나 REST 백업 조회가 아무리 밀려있어도, 이 큐는 그 대기열을 전혀 거치지 않으므로
  // 해시키 발급과 실제 주문 전송이 즉시 처리된다. 다만 KIS 서버 자체가 거는 전역 429 쿨다운은
  // 공유해야 한다 — 이건 계정 전체에 걸리는 제한이라 큐를 나눈다고 피할 수 있는 게 아니다.
  public async orderQueueRequest<T>(fn: () => Promise<T>): Promise<T> {
    const nextInQueue = this.orderRequestQueueChain.then(async () => {
      const cooldownRemaining = this.globalRateLimitCooldownUntil - Date.now();
      if (cooldownRemaining > 0) {
        await new Promise(resolve => setTimeout(resolve, cooldownRemaining));
      }
      const now = Date.now();
      const timeSinceLast = now - this.lastOrderRequestTime;
      if (timeSinceLast < this.minRequestInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLast));
      }
      this.lastOrderRequestTime = Date.now();
      return await this.executeWithBackoff(fn);
    });

    this.orderRequestQueueChain = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  // 🎯 추천종목 순위 조회 전용 큐 — orderQueueRequest와 같은 이유로 requestQueueChain과 분리한다.
  public async rankingQueueRequest<T>(fn: () => Promise<T>): Promise<T> {
    const nextInQueue = this.rankingRequestQueueChain.then(async () => {
      const cooldownRemaining = this.globalRateLimitCooldownUntil - Date.now();
      if (cooldownRemaining > 0) {
        await new Promise(resolve => setTimeout(resolve, cooldownRemaining));
      }
      const now = Date.now();
      const timeSinceLast = now - this.lastRankingRequestTime;
      if (timeSinceLast < this.minRequestInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLast));
      }
      this.lastRankingRequestTime = Date.now();
      return await this.executeWithBackoff(fn);
    });

    this.rankingRequestQueueChain = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  private async executeWithBackoff<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        return await fn();
      } catch (error: any) {
        const status = error?.response?.status;
        const dataStr = typeof error?.response?.data === 'object' ? JSON.stringify(error?.response?.data) : String(error?.response?.data || error?.message || '');
        
        const isRateLimit = status === 429 || 
          dataStr.includes('429') || 
          dataStr.includes('Too many requests') || 
          dataStr.includes('EGW00201') || 
          dataStr.includes('Edge rate limit') ||
          dataStr.includes('초당 거래건수') ||
          dataStr.includes('Protection triggered');

        if (isRateLimit && attempt < maxRetries) {
          const backoffMs = this.getBackoffDelay(attempt); // 2s, 4s, 8s, 15s, 30s로 통일
          this.globalRateLimitCooldownUntil = Date.now() + backoffMs; // getPrice 큐도 이 쿨다운을 같이 존중하게 됨
          console.warn(`[KIS Edge Rate Limit 429] Retrying attempt ${attempt}/${maxRetries} after ${backoffMs}ms backoff... (전체 쿨다운 적용)`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        } else {
          throw error;
        }
      }
    }
    throw new Error("KIS API 요청 제한(429 Rate Limit) 초과: 재시도 횟수를 초과하였습니다.");
  }

  private async throttleRequest() {
    return this.queueRequest(async () => {});
  }

  public async getDomesticPrice(symbol: string, marketCode: string = 'J') {
    if (!this.config) throw new Error("KIS Config not initialized");
    if (!symbol || !/^\d{6}$/.test(symbol)) {
      return null;
    }
    const qa = await this.quoteAuth(symbol);
    const token = qa.token;
    const endpoint = '/uapi/domestic-stock/v1/quotations/inquire-price';
    
    // Official KIS TR-ID for domestic price inquiry (FHKST01010100 is valid for both Real and Virtual accounts)
    const trId = 'FHKST01010100';

    const headers = {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
      'appkey': qa.appKey,
      'appsecret': qa.appSecret,
      'tr-id': trId,
      'custtype': 'P',
    };

    const params = {
      FID_COND_MRKT_DIV_CODE: marketCode,
      FID_INPUT_ISCD: symbol
    };

    try {
      // 🛡️ 매우 중요한 수정: 예전엔 여기서 자체적으로 "직전 요청 이후 충분히 지났는지"를
      // this.lastRequestTime과 비교해서 체크했는데, 이건 진짜 직렬 큐가 아니라 그냥 타임스탬프
      // 비교라서 경쟁조건이 있었다 — 여러 종목이 Promise.all로 동시에 이 함수를 호출하면
      // (syncAllPrices가 정확히 이렇게 한다), 전부 거의 동시에 this.lastRequestTime을 읽어서
      // "기다릴 필요 없다"고 착각하고 한꺼번에 요청을 쏠 수 있었다. 이제 실제 axios 호출을
      // queueRequest(진짜 직렬 .then() 체인, 순서와 최소간격을 확실히 보장)로 감싸서, 동시에
      // 몇 개를 호출하든 실제로는 하나씩 순서대로 처리되게 한다.
      // 🛡️ 또한 예전엔 429/서버오류 시 최대 5번, 2s→4s→8s→15s→30s로 누적 최악 59초까지
      // 재시도하며 물고 늘어졌다 — 그동안 이 직렬 큐 전체가 이 한 종목 때문에 막혀서 다른 모든
      // 종목의 조회까지 함께 지연됐다. 이제 재시도하지 않고 실패 시 즉시 포기한다(아래 참고) —
      // 이 종목은 다음 syncAllPrices 사이클에 자연스럽게 다시 시도된다.
      const res = await qa.run<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      
      if (res.data.rt_cd === '0' && res.data.output) {
        return res.data.output;
      }

      // If not zero code, check if it's a rate limit error or temporary 500 error
      const lastError = res.data.msg1 || res.data.message || res.data.msg_cd || 'Unknown Error';

      const isRateLimitOrServerError =
        typeof lastError === 'string' && (
          lastError.includes('초당') ||
          lastError.includes('초과') ||
          lastError.includes('500') ||
          lastError.includes('대기') ||
          lastError.includes('오류') ||
          res.data.msg_cd === 'EGW00201' ||
          res.data.msg_cd === 'KIS_PROXY_NOTICE'
        );

      // 🛡️ 매우 중요한 수정: 예전엔 429/서버오류 시 이 함수 안에서 최대 5번, 2s→4s→8s→15s→30s로
      // 누적 최악 59초까지 재시도하며 물고 늘어졌다. 이 대기 시간 동안 queueRequest(직렬 큐)
      // 전체가 이 한 종목 때문에 막혀서, 뒤에 줄 선 다른 모든 종목의 조회까지 함께 지연됐다.
      // 이제 재시도하지 않고 즉시 포기한다 — 짧은 전역 쿨다운(2초)만 설정해서 바로 다음 요청들이
      // 무의미하게 또 429를 맞는 것만 방지하고, 이 종목 자체는 다음 syncAllPrices 사이클(수십 초
      // 후)에 자연스럽게 다시 시도되도록 맡긴다.
      if (isRateLimitOrServerError) {
        this.globalRateLimitCooldownUntil = Date.now() + 2000;
        console.warn(`[KIS Rate Limit] ${symbol}: ${lastError} — 재시도하지 않고 즉시 건너뜁니다 (다음 주기에 재시도)`);
      } else {
        console.warn(`[KIS Service] Domestic Price fetch failed for ${symbol}: ${lastError}`);
      }
      return null;
    } catch (error: any) {
      const lastError = error.response?.data?.msg1 || error.message;
      const status = error.response?.status;
      if (status === 500 || status === 429 || (typeof lastError === 'string' && (lastError.includes('초당') || lastError.includes('초과') || lastError.includes('500') || lastError.includes('status code 500')))) {
        this.globalRateLimitCooldownUntil = Date.now() + 2000;
        console.warn(`[KIS HTTP ${status || 'Error'}] ${symbol}: ${lastError} — 재시도하지 않고 즉시 건너뜁니다 (다음 주기에 재시도)`);
      } else {
        console.warn(`[KIS Service] Domestic Price (${trId}) failed for ${symbol}:`, error);
      }
      return null;
    }
  }

  /**
   * (2026-10-07) 일봉 종가 목록 — 최신 날짜가 앞. 50일 이동평균 계산용(최대 100개).
   * 국내주식기간별시세(일/주/월/년) FHKST03010100 · 수정주가 기준.
   */
  public async getDomesticDailyCloses(symbol: string): Promise<{ date: string; close: number; open: number; high: number; low: number; volume: number }[]> {
    if (!this.config) return [];
    try {
      const qa = await this.quoteAuth(symbol);
      const endpoint = '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice';
      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${qa.token}`,
        'appkey': qa.appKey,
        'appsecret': qa.appSecret,
        'tr-id': 'FHKST03010100',
        'custtype': 'P'
      };
      const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d).replace(/-/g, '');
      const params = {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: symbol,
        FID_INPUT_DATE_1: ymd(new Date(Date.now() - 150 * 24 * 3600 * 1000)),
        FID_INPUT_DATE_2: ymd(new Date()),
        FID_PERIOD_DIV_CODE: 'D',
        FID_ORG_ADJ_PRC: '0',
      };
      const res = await qa.run<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      const rows: any[] = Array.isArray(res.data?.output2) ? res.data.output2 : [];
      return rows
        .map(r => ({ date: String(r?.stck_bsop_date || ''), close: Number(r?.stck_clpr || 0), open: Number(r?.stck_oprc || 0), high: Number(r?.stck_hgpr || 0), low: Number(r?.stck_lwpr || 0), volume: Number(r?.acml_vol || 0) }))
        .filter(r => r.date && r.close > 0)
        .sort((x, y) => (x.date < y.date ? 1 : -1));
    } catch (error: any) {
      console.warn('[KIS Service] Daily closes exception safely caught:', error?.response?.data || error?.message);
      return [];
    }
  }

  public async getDomesticMinuteChart(symbol: string, time: string = '') {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output2: [] };
    try {
      const qa = await this.quoteAuth(symbol);
      const token = qa.token;
      const endpoint = '/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice';

      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': qa.appKey,
        'appsecret': qa.appSecret,
        'tr-id': 'FHKST03010200', // Domestic Minute Chart
        'custtype': 'P'
      };

      const params = {
        FID_ETC_CLS_CODE: '',
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: symbol,
        FID_TERM_GUBUN_CODE: '1', // 1: Minute
        FID_INPUT_HOUR_1: time // e.g. "153000" or empty for current
      };

      const res = await qa.run<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Domestic Minute Chart Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '0', output2: [] };
    }
  }

 public async getDomesticOvertimePrice(symbol: string, marketCode: string = 'J') {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output: {} };
    try {
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/quotations/inquire-overtime-price';
      
      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': 'FHPST02300000',
        'custtype': 'P'
      };

      const params = {
        FID_COND_MRKT_DIV_CODE: marketCode,
        FID_INPUT_ISCD: symbol
      };

      // 🛡️ 다른 시세 조회와 같은 대기열(최소 간격·429 전역 쿨다운·재시도)을 거치게 한다 — 예전엔 이 호출만 대기열 밖이었다
      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Domestic Overtime Price Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '0', output: {} };
    }
  }

  // ============================================================
  // 🎯 추천종목 상세 조회 (2026-10-04) — 추천 후보 한 종목의 "실제 값"을 받아온다.
  // 현재가 조회(당일 평균가=VWAP, 고가·저가, 거래대금)와 체결 조회(당일 체결강도)를 서로 다른 줄에서
  // 동시에 보낸다. 계좌 #2가 등록돼 있으면 계좌 #2 앱키로, 아니면 계좌 #1 앱키로 나간다.
  // 실패한 항목은 undefined로 두고 호출한 쪽이 "미조회"로 처리한다(추정값으로 채우지 않는다).
  // ============================================================
  private recDetailChain: Promise<any> = Promise.resolve();
  private recDetailLastAt = 0;
  private recDetailQueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.recDetailChain.then(async () => {
      const cooldown = this.globalRateLimitCooldownUntil - Date.now();
      if (cooldown > 0) await new Promise(resolve => setTimeout(resolve, cooldown));
      const wait = this.minRequestInterval - (Date.now() - this.recDetailLastAt);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      this.recDetailLastAt = Date.now();
      return await fn();
    });
    this.recDetailChain = next.catch(() => {});
    return next;
  }
  /**
   * 체결 조회가 돌려준 최근 체결 목록(최대 30건)으로 "지금" 거래가 살아 있는지 잰다 (2026-10-06).
   * 당일 거래대금 평균으로는 아침에만 거래되고 식은 종목을 가려낼 수 없어서, 최근 체결의 시간 간격으로
   * 분당 체결 건수와 5분 환산 거래대금을 구한다. 시각·수량 항목이 없으면 아무것도 돌려주지 않는다.
   */
  private recentActivityOf(rows: any): { recentTicksPerMin?: number; recentTradeValue5m?: number } {
    if (!Array.isArray(rows) || rows.length < 5) return {};
    const toSec = (h: any): number | null => {
      const t = String(h ?? '').trim();
      if (!/^\d{6}$/.test(t)) return null;
      return Number(t.slice(0, 2)) * 3600 + Number(t.slice(2, 4)) * 60 + Number(t.slice(4, 6));
    };
    const first = toSec(rows[0]?.stck_cntg_hour);                 // 가장 최근 체결
    const last = toSec(rows[rows.length - 1]?.stck_cntg_hour);    // 목록에서 가장 오래된 체결
    if (first === null || last === null) return {};
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const nowSec = kst.getUTCHours() * 3600 + kst.getUTCMinutes() * 60 + kst.getUTCSeconds();
    // 마지막 체결 뒤로 흐른 시간도 포함한다(한참 전에 멈춘 종목이 활발해 보이지 않게). 장 마감 뒤에는 목록 안의 간격만 쓴다.
    const sinceLast = nowSec >= first && nowSec <= 15 * 3600 + 30 * 60 ? nowSec - first : 0;
    const spanSec = Math.max(5, first - last + sinceLast);
    let value = 0;
    for (const r of rows) {
      const p = Number(r?.stck_prpr), v = Number(r?.cntg_vol);
      if (p > 0 && v > 0) value += p * v;
    }
    const out: { recentTicksPerMin?: number; recentTradeValue5m?: number } = { recentTicksPerMin: Math.round((rows.length / spanSec) * 60 * 10) / 10 };
    if (value > 0) out.recentTradeValue5m = Math.round((value / spanSec) * 300);
    return out;
  }

  public async getRecommendationDetail(symbol: string): Promise<RecommendationDetail | null> {
    if (!this.config || !/^\d{6}$/.test(symbol)) return null;
    try {
      const qa = await this.quoteAuth('RANKING');
      const baseHeaders = {
        'content-type': 'application/json',
        'authorization': `Bearer ${qa.token}`,
        'appkey': qa.appKey,
        'appsecret': qa.appSecret,
        'custtype': 'P',
      };
      const params = { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: symbol };
      const pricePromise = qa.run<any>(() => axios.get(`${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price`, {
        headers: { ...baseHeaders, 'tr-id': 'FHKST01010100' }, params,
      })).then(r => (r.data?.rt_cd === '0' ? r.data.output : null)).catch(() => null);
      const ccnlPromise = this.recDetailQueue<any>(() => axios.get(`${this.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-ccnl`, {
        headers: { ...baseHeaders, 'tr-id': 'FHKST01010300' }, params,
      })).then(r => (r.data?.rt_cd === '0' && Array.isArray(r.data.output) ? r.data.output : null)).catch(() => null);
      const [po, co] = await Promise.all([pricePromise, ccnlPromise]);
      if (!po && !co) return null;
      const num = (v: any): number | undefined => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      const isFalling = po?.prdy_vrss_sign === '4' || po?.prdy_vrss_sign === '5';
      const pct = po ? Math.abs(Number(po.prdy_ctrt || 0)) * (isFalling ? -1 : 1) : undefined;
      return {
        price: num(po?.stck_prpr) ?? num(co?.[0]?.stck_prpr),
        vwap: num(po?.wghn_avrg_stck_prc),
        high: num(po?.stck_hgpr),
        low: num(po?.stck_lwpr),
        tradingValue: num(po?.acml_tr_pbmn),
        changePercent: pct,
        execStrength: num(co?.[0]?.tday_rltv),
        ...this.recentActivityOf(co),
      };
    } catch (e: any) {
      console.warn('[추천 상세 조회 실패]', symbol, e?.message || e);
      return null;
    }
  }

  public async getDomesticExecutionInfo(symbol: string, marketCode: string = 'J') {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output: [] };
    try {
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/quotations/inquire-ccnl';
      
      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': 'FHKST01010300',
        'custtype': 'P'
      };

      const params = {
        FID_COND_MRKT_DIV_CODE: marketCode,
        FID_INPUT_ISCD: symbol
      };

      // 🛡️ 다른 시세 조회와 같은 대기열(최소 간격·429 전역 쿨다운·재시도)을 거치게 한다 — 예전엔 이 호출만 대기열 밖이었다
      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Domestic Execution Info Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '0', output: [] };
    }
  }

  public async getDomesticOrderbook(symbol: string, marketCode: string = 'J') {
    if (!this.config) return { rt_cd: '1', msg1: "KIS Config not initialized", output1: {}, output2: {} };
    try {
      const token = await this.getAccessToken();
      const endpoint = '/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn';
      
      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'tr-id': 'FHKST01010200',
        'custtype': 'P'
      };

      const params = {
        FID_COND_MRKT_DIV_CODE: marketCode,
        FID_INPUT_ISCD: symbol
      };

      // 🛡️ 다른 시세 조회와 같은 대기열(최소 간격·429 전역 쿨다운·재시도)을 거치게 한다 — 예전엔 이 호출만 대기열 밖이었다
      const res = await this.queueRequest<any>(() => axios.get(`${this.baseUrl}${endpoint}`, { headers, params }));
      return res.data;
    } catch (error: any) {
      console.warn("[KIS Service] Domestic Orderbook Exception safely caught:", error?.response?.data || error?.message);
      return { rt_cd: '0', output1: {}, output2: {} };
    }
  }

  public async fetchLiveOrderbook(symbol: string): Promise<any> {
    const isKR = /^\d{6}$/.test(symbol);
    if (!isKR) return null;

    // 1. Try KIS API if configured
    if (this.config) {
      try {
        const data = await this.getDomesticOrderbook(symbol);
        const o1 = data?.output1;
        if (o1 && o1.askp1 && o1.bidp1) {
          const askLevels = [
            Number(o1.askp4 || 0),
            Number(o1.askp3 || 0),
            Number(o1.askp2 || 0),
            Number(o1.askp1 || 0)
          ].filter(p => p > 0);

          const askVolumes = [
            Number(o1.askp_rsqn4 || 0),
            Number(o1.askp_rsqn3 || 0),
            Number(o1.askp_rsqn2 || 0),
            Number(o1.askp_rsqn1 || 0)
          ];

          const bidLevels = [
            Number(o1.bidp1 || 0),
            Number(o1.bidp2 || 0),
            Number(o1.bidp3 || 0),
            Number(o1.bidp4 || 0)
          ].filter(p => p > 0);

          const bidVolumes = [
            Number(o1.bidp_rsqn1 || 0),
            Number(o1.bidp_rsqn2 || 0),
            Number(o1.bidp_rsqn3 || 0),
            Number(o1.bidp_rsqn4 || 0)
          ];

          if (askLevels.length > 0 && bidLevels.length > 0) {
            const totalAsk = Number(o1.total_askp_rsqn || askVolumes.reduce((a, b) => a + b, 0));
            const totalBid = Number(o1.total_bidp_rsqn || bidVolumes.reduce((a, b) => a + b, 0));
            const sum = (totalAsk + totalBid) || 1;
            const maxLevelVol = Math.max(...askVolumes, ...bidVolumes, 1);

            return {
              symbol,
              isRealData: true,
              askLevels,
              askVolumes,
              bidLevels,
              bidVolumes,
              totalAskVolume: totalAsk,
              totalBidVolume: totalBid,
              askPctVal: ((totalAsk / sum) * 100).toFixed(1),
              bidPctVal: ((totalBid / sum) * 100).toFixed(1),
              maxLevelVol
            };
          }
        }
      } catch (e) {
        console.warn("[KIS Service] Fetch Orderbook via KIS failed, falling back:", e);
      }
    }

    // 2. Fallback to /api/stocks/orderbook
    try {
      const resp = await axios.get(`/api/stocks/orderbook?symbol=${encodeURIComponent(symbol)}`, { timeout: 3500 });
      if (resp.data && resp.data.isRealData) {
        return resp.data;
      }
    } catch {
      // ignore
    }

    return null;
  }
  
/**
 * KIS 실시간 체결(H0STCNT0) 웹소켓 연결.
 * ------------------------------------------------------------
 * onTick으로 전달되는 값은 아래 형태로 정규화된다(원본이 JSON이든 KIS 표준 파이프구분(|) 텍스트든
 * 동일하게 처리):
 *   { symbol, price, change, changePercent, volume, executionStrength?, time }
 * 파싱에 실패한 메시지는 조용히 무시한다(트레이딩 로직에 잘못된 값이 들어가는 것을 막기 위함).
 * 연결이 끊기면 최대 5회까지 지수 백오프로 자동 재연결을 시도한다.
 */
public async connectWebSocket(
  symbols: string[],
  onTick: (data: { symbol: string; price: number; change: number; changePercent: number; volume: string; executionStrength?: number; time: string; buyVolume?: number; sellVolume?: number; wavgPrice?: number; highPrice?: number; lowPrice?: number; askPrice1?: number; bidPrice1?: number; cntgVolume?: number; acmlVolume?: number }) => void,
  onStatusChange?: (status: KisRealtimeStatus) => void,
  onOrderbook?: (data: { symbol: string; totalBidVolume: number; totalAskVolume: number; bidPrice1: number; askPrice1: number }) => void,
  onExecutionNotice?: (data: { symbol: string; orderNo: string; executedQty: number; executedPrice: number; isSell: boolean; isRejected: boolean; isExecuted: boolean; orderQty: number }) => void,
  htsId?: string,
  onRealtimeRejected?: (symbol: string, reason: string) => void, // 서버가 실시간 등록을 거부한 종목(등록 한도 초과 등)
  // 🎯 과제 1(멀티 앱키) — [KIS 연동 설정]에서 등록한 계좌 #2~4의 앱키/앱시크릿. 오직 서버가 실시간
  // 시세 수집용 웹소켓 세션을 추가로 여는 데만 쓰이며, 절대 주문에는 쓰이지 않는다(주문은 항상
  // 계좌 #1). 연결될 때마다(최초 연결·재연결 모두) 서버에 다시 전달해야 하므로 onopen에서 보낸다.
  extraKisAccounts?: { slot: 2 | 3 | 4; appKey: string; appSecret: string }[]
): Promise<KisRealtimeHandle> {
  // 🎯 플랫폼 이전 대응: 예전엔 Cloud Run의 실제 도메인이 그대로 하드코딩되어 있어서, 서버를
  // 다른 곳(Railway 등)으로 옮길 때마다 이 값을 수동으로 바꿔야 했다. 프론트엔드와 백엔드가
  // 항상 같은 도메인에서 함께 서빙되는 구조이므로, 지금 페이지의 실제 주소(window.location)를
  // 기준으로 매번 자동으로 계산한다 — 이러면 어느 플랫폼에 배포하든 코드를 안 건드려도 된다.
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws/kis`;
  // 🛡️ 매우 중요한 수정: 예전엔 여기서 getWebsocketApprovalKey()로 클라이언트(브라우저) 자신의
  // 승인키를 KIS에 직접 새로 발급받아 서버로 전송했는데, 서버(server.ts)는 이 'approval' 타입
  // 메시지를 처리하는 코드가 전혀 없어서 완전히 무시했다 — 즉 발급받은 결과 자체는 아무 데도
  // 안 쓰이는 죽은 코드였다. 하지만 그 "발급 요청" 자체는 실제로 KIS에 도달해서, 서버가 힘들게
  // 캐싱해둔 진짜 승인키를 그때마다 무효화시켰다 — 브라우저를 새로고침하거나 재연결할 때마다
  // 반복돼서, 지금까지 겪어온 "invalid approval" 문제의 실제 근본 원인이었다. 서버가 이미
  // 자체적으로 승인키를 관리하니 클라이언트는 이걸 발급받을 필요가 전혀 없어서 완전히 제거한다.

  // 🛡️ 재연결은 여기서 하지 않는다 — 연결의 생명주기(언제 열고/닫고/다시 열지)는 App이 관리한다.
  // 예전엔 여기 onclose에서 스스로 재연결해서, App이 cleanup으로 close()한 소켓까지 "장애"로 보고
  // 되살렸고, 그렇게 생긴 새 소켓을 App은 전혀 몰라서 유령 소켓이 남았다.
  let manuallyClosed = false;

  const parseTick = (raw: string): { symbol: string; price: number; change: number; changePercent: number; volume: string; executionStrength?: number; time: string; buyVolume?: number; sellVolume?: number; wavgPrice?: number; highPrice?: number; lowPrice?: number; askPrice1?: number; bidPrice1?: number; cntgVolume?: number; acmlVolume?: number } | null => {
    try {
      // 1) JSON 형식 시도 (프록시가 이미 가공해서 보내는 경우)
      if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
        const obj = JSON.parse(raw);
        const symbol = obj.symbol || obj.mksc_shrn_iscd || obj.MKSC_SHRN_ISCD;
        const price = Number(obj.price ?? obj.stck_prpr ?? obj.STCK_PRPR ?? 0);
        if (!symbol || price <= 0) return null;
        return {
          symbol,
          price,
          change: Number(obj.change ?? obj.prdy_vrss ?? obj.PRDY_VRSS ?? 0),
          changePercent: Number(obj.changePercent ?? obj.prdy_ctrt ?? obj.PRDY_CTRT ?? 0),
          volume: String(obj.volume ?? obj.acml_vol ?? obj.ACML_VOL ?? '0'),
          executionStrength: obj.cttr !== undefined ? Number(obj.cttr) : (obj.CTTR !== undefined ? Number(obj.CTTR) : undefined),
          time: String(obj.time ?? obj.stck_cntg_hour ?? obj.STCK_CNTG_HOUR ?? '')
        };
      }

      // 2) KIS 표준 실시간 텍스트 형식: "0|H0STCNT0|001|종목코드^체결시간^현재가^..." (필드는 ^로 구분)
      // 🌙 (2026-09-28 추가) H0STOUP0(시간외 실시간체결가, 16:00~18:00 전용)도 여기서 함께 처리한다 —
      // KIS 공식 파이썬 샘플(examples_llm/domestic_stock/overtime_ccnl_krx)로 필드 순서를 확인한 결과
      // H0STCNT0와 완전히 동일한 스키마(종목코드/체결시간/현재가/.../체결강도(18)/총매도(19)/총매수(20) 등)라서
      // 별도 파싱 로직 없이 그대로 재사용할 수 있다.
      if (raw.includes('|')) {
        const parts = raw.split('|');
        if (parts.length < 4 || (parts[1] !== 'H0STCNT0' && parts[1] !== 'H0STOUP0')) return null;
        const fields = parts[3].split('^');
        // KIS H0STCNT0/H0STOUP0 표준 필드 순서(0-index): 0=종목코드 1=체결시간 2=현재가 3=전일대비부호 4=전일대비
        // 5=전일대비율 ... 12=누적거래량 ... 18=체결강도(cttr) ... 19=총매도체결량(SELN_CNTG_SMTN)
        // 20=총매수체결량(SHNU_CNTG_SMTN) — 문서상 알려진 위치이며, 실측 시 어긋나면 undefined 처리됨
        const symbol = fields[0];
        const price = Number(fields[2] || 0);
        if (!symbol || price <= 0) return null;
        const cttrRaw = Number(fields[18]);
        // 🔍 진짜 CVD(매수체결량-매도체결량 누적) 계산용 — 1회성 진단 로그로 실제 값 확인 가능하게 함
        if (!(KISService as any)._cvdFieldLogged) {
          (KISService as any)._cvdFieldLogged = true;
          console.log('[KIS H0STCNT0 CVD 필드 진단 — 1회성]', { 전체필드: fields, index19_추정매도체결량: fields[19], index20_추정매수체결량: fields[20] });
        }
        const sellVolRaw = Number(fields[19]);
        const buyVolRaw = Number(fields[20]);
        // 🔬 추가 필드 — 6=가중평균주가(VWAP) 8=고가 9=저가 10=매도1호가 11=매수1호가 12=체결량 13=누적거래량
        const num = (i: number) => { const v = Number(fields[i]); return isNaN(v) ? 0 : v; };
        const extra = {
          wavg: num(6), high: num(8), low: num(9), ask1: num(10), bid1: num(11), cntg: num(12), acml: num(13),
        };
        validateTickFields(symbol, { price, ...extra, sell: isNaN(sellVolRaw) ? -1 : sellVolRaw, buy: isNaN(buyVolRaw) ? -1 : buyVolRaw });
        return {
          symbol,
          price,
          change: Number(fields[4] || 0),
          changePercent: Number(fields[5] || 0),
          volume: fields[12] || '0',
          executionStrength: !isNaN(cttrRaw) && cttrRaw > 0 && cttrRaw < 1000 ? cttrRaw : undefined,
          time: fields[1] || '',
          buyVolume: !isNaN(buyVolRaw) && buyVolRaw >= 0 ? buyVolRaw : undefined,
          sellVolume: !isNaN(sellVolRaw) && sellVolRaw >= 0 ? sellVolRaw : undefined,
          wavgPrice: extra.wavg > 0 ? extra.wavg : undefined,
          highPrice: extra.high > 0 ? extra.high : undefined,
          lowPrice: extra.low > 0 ? extra.low : undefined,
          askPrice1: extra.ask1 > 0 ? extra.ask1 : undefined,
          bidPrice1: extra.bid1 > 0 ? extra.bid1 : undefined,
          cntgVolume: extra.cntg > 0 ? extra.cntg : undefined,
          acmlVolume: extra.acml > 0 ? extra.acml : undefined,
        };
      }
    } catch {
      // 파싱 실패는 조용히 무시 — 이 틱 하나만 건너뛴다
    }
    return null;
  };

  // 🎯 실시간 호가(H0STASP0) 파싱 — H0STCNT0(체결가)와 같은 파이프/캐럿 구분 텍스트 형식이다.
  // 정확한 필드 인덱스는 KIS 문서상 일반적으로 알려진 관례를 따랐다: 매도호가1(index 3),
  // 매수호가1(index 13), 총매도호가잔량(index 43), 총매수호가잔량(index 44). 실측 응답이 이
  // 인덱스와 어긋나면 재조정이 필요할 수 있다 — 그 경우에도 파싱 실패는 조용히 무시되어
  // 트레이딩 로직에 잘못된 값이 들어가지 않는다.
  const parseOrderbook = (raw: string): { symbol: string; totalBidVolume: number; totalAskVolume: number; bidPrice1: number; askPrice1: number } | null => {
    try {
      if (!raw.includes('|')) return null;
      const parts = raw.split('|');
      if (parts.length < 4 || parts[1] !== 'H0STASP0') return null;
      const fields = parts[3].split('^');
      const symbol = fields[0];
      if (!symbol) return null;
      const askPrice1 = Number(fields[3] || 0);
      const bidPrice1 = Number(fields[13] || 0);
      const totalAskVolume = Number(fields[43] || 0);
      const totalBidVolume = Number(fields[44] || 0);
      if (totalAskVolume <= 0 && totalBidVolume <= 0) return null;
      return { symbol, totalBidVolume, totalAskVolume, bidPrice1, askPrice1 };
    } catch {
      return null;
    }
    };

  const parseExecutionNotice = (raw: string): { symbol: string; orderNo: string; executedQty: number; executedPrice: number; isSell: boolean; isRejected: boolean; isExecuted: boolean; orderQty: number } | null => {
    try {
      if (!raw.includes('|')) return null;
      const parts = raw.split('|');
      if (parts.length < 4 || parts[1] !== 'H0STCNI0') return null;
      const fields = parts[3].split('^');
      // 🔍 정확한 필드 순서는 KIS 공식 문서 기준으로 알려진 표준 구조를 따랐다 — 실측 검증을 위해
      // 1회성 진단 로그를 남긴다: 0=고객ID 1=계좌번호 2=주문번호 3=원주문번호 4=매도매수구분
      // 8=종목코드 9=체결수량 10=체결단가 12=거부여부 13=체결여부(2=체결) 16=주문수량
      if (!(KISService as any)._execNoticeFieldLogged) {
        (KISService as any)._execNoticeFieldLogged = true;
        console.log('[KIS H0STCNI0 체결통보 필드 진단 — 1회성]', { 전체필드: fields });
      }
      const symbol = fields[8];
      const orderNo = fields[2];
      if (!symbol || !orderNo) return null;
      const sellBuyCls = fields[4]; // '01'=매도, '02'=매수 (또는 '1'/'2')
      const isSell = sellBuyCls === '01' || sellBuyCls === '1';
      const rfusYn = fields[12]; // 거부여부
      const isRejected = rfusYn === '1';
      const cntgYn = fields[13]; // 체결여부: '2'=체결
      const isExecuted = cntgYn === '2';
      return {
        symbol,
        orderNo,
        executedQty: Number(fields[9] || 0),
        executedPrice: Number(fields[10] || 0),
        isSell,
        isRejected,
        isExecuted,
        orderQty: Number(fields[16] || 0)
      };
    } catch {
      return null;
    }
  };

  // 🎯 체결통보 구독에 필요한 이 사용자 본인의 자격증명 — 클래스 필드를 화살표 함수 클로저 안에서
  // 안전하게 참조하기 위해 지역 변수로 캡처해둔다.
  const userAppKey = this.config?.appKey;
  const userAppSecret = this.config?.appSecret;

  const connect = (): WebSocket => {
    onStatusChange?.('connecting');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (manuallyClosed) return; // 연결 중에 이미 수동 종료됨 — 곧 닫히므로 구독하지 않는다
      onStatusChange?.('open');
      console.log('[WS 연결 성공]', { 구독요청종목수: symbols.length, 종목목록: symbols });
      for (const symbol of symbols) {
        ws.send(JSON.stringify({ type: 'subscribe', symbol }));
      }
      // 🎯 체결통보는 htsId를 사용자가 직접 입력했을 때만 시도한다 — 반드시 이 사용자 자신의
      // appKey/appSecret과 함께 보내서, 서버가 이 사용자 전용의 별도 KIS 연결을 만들게 한다.
      if (htsId && userAppKey && userAppSecret) {
        ws.send(JSON.stringify({ type: 'subscribe_execution', htsId, appKey: userAppKey, appSecret: userAppSecret }));
      }
      // 🎯 과제 1(멀티 앱키) — 계좌 #2~4가 등록돼 있으면 서버에 앱키/앱시크릿을 전달해서 추가
      // 실시간 시세 세션을 열게 한다. 재연결 때도 서버 메모리가 초기화됐을 수 있으므로 매번 다시 보낸다.
      const validExtraAccounts = (extraKisAccounts || []).filter(a => a.appKey && a.appSecret);
      if (validExtraAccounts.length > 0) {
        ws.send(JSON.stringify({ type: 'configure_kis_accounts', accounts: validExtraAccounts }));
      }
    };

    // 🔇 틱 단위 원문 로그는 기본 끔 — 연결이 안정화돼서 더 이상 필요 없고, 초당 수십 건의
    // console.log는 브라우저 메인 스레드 부하가 된다. 진단이 필요하면 브라우저 콘솔에서
    // localStorage.setItem('WS_DEBUG','1') 후 새로고침하면 다시 켜진다(끄기: removeItem).
    let wsDebug = false;
    try { wsDebug = typeof window !== 'undefined' && window.localStorage?.getItem('WS_DEBUG') === '1'; } catch { wsDebug = false; }

    ws.onmessage = (event) => {
      if (manuallyClosed) return; // 수동 종료된 연결의 잔여 메시지는 무시
      const raw = String(event.data);
      // 🔍 진단 1단계: 원시 메시지 자체가 도착하는지 확인 — 이게 하나도 안 찍히면 웹소켓 수신
      // 자체가 멈춘 것이고, 이건 찍히는데 [WS TICK 정상]이 없으면 parseTick()이 거부하고 있다는
      // 뜻이다. 스팸 방지로 200ms에 한 번만 찍는다(내용 확인이 목적이라 매번 찍을 필요는 없음).
      if (wsDebug && (!(KISService as any)._lastRawLogAt || Date.now() - (KISService as any)._lastRawLogAt >= 200)) {
        (KISService as any)._lastRawLogAt = Date.now();
        console.log('[WS RAW]', raw.slice(0, 200));
      }
      // 🛡️ 매우 중요한 추가: 서버가 보내는 "KIS 실제 연결 상태" 메시지를 먼저 확인한다 —
      // 프록시 서버와의 연결(ws.onopen)과 프록시가 KIS와 실제로 연결됐는지는 완전히 별개다.
      // 이 메시지가 없으면 프록시가 KIS와 끊긴 상태에서도 클라이언트는 "연결됨"으로 착각할 수 있다.
      try {
        if (raw.trim().startsWith('{')) {
          const obj = JSON.parse(raw);
          if (obj.type === 'kis_ws_status') {
            // 서버 ↔ KIS 링크 상태 (브라우저 ↔ 서버 연결과는 별개)
            const mapped: KisRealtimeStatus =
              obj.status === 'connected' ? 'open'
              : obj.status === 'reconnecting' ? 'kis_reconnecting'
              : obj.status === 'appkey_conflict' ? 'appkey_conflict'
              : 'kis_disconnected';
            if (!manuallyClosed) onStatusChange?.(mapped);
            return;
          }
          if (obj.type === 'realtime_rejected' && obj.symbol) {
            if (!manuallyClosed) onRealtimeRejected?.(String(obj.symbol), String(obj.reason || ''));
            return;
          }
        }
      } catch { /* JSON 파싱 실패 시 일반 tick/orderbook 파싱으로 넘어감 */ }
      const tick = parseTick(raw);
      if (tick) onTick(tick);
      const orderbook = parseOrderbook(raw);
      if (orderbook && onOrderbook) onOrderbook(orderbook);
      const executionNotice = parseExecutionNotice(raw);
      if (executionNotice && onExecutionNotice) onExecutionNotice(executionNotice);
    };

    ws.onerror = () => {
      // 에러 뒤에는 항상 onclose가 이어진다 — 상태 보고는 onclose 한 곳에서만 한다
    };

    ws.onclose = () => {
      // 수동 종료(App cleanup)는 정상 종료 — 상태도 올리지 않고, 재연결 판단은 App 몫이다.
      if (manuallyClosed) return;
      onStatusChange?.('closed');
    };

    return ws;
  };

  const socket = connect();
  const handle: KisRealtimeHandle = {
    socket,
    send: (msg: object) => {
      if (manuallyClosed || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(msg));
      return true;
    },
    close: () => {
      if (manuallyClosed) return;
      manuallyClosed = true;
      // 연결 중(CONNECTING)에 바로 close()하면 브라우저 경고가 뜨므로 열린 뒤 닫는다
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else if (socket.readyState === WebSocket.CONNECTING) socket.addEventListener('open', () => socket.close(), { once: true });
    },
    isManuallyClosed: () => manuallyClosed,
  };
  return handle;
}



  public async revokeToken() {
    if (!this.config || !this.accessToken) return;
    const endpoint = '/oauth2/revokeP';
    
    const payload = {
      appkey: this.config.appKey,
      appsecret: this.config.appSecret,
      token: this.accessToken
    };

    try {
      const res = await axios.post(`${this.baseUrl}${endpoint}`, payload, {
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        }
      });
      
      this.accessToken = null;
      this.tokenExpireTime = 0;
      return res.data;
    } catch (error) {
      console.error("Token Revoke Error:", error);
      throw error;
    }
  }

  public async refreshAccessToken() {
    this.accessToken = null;
    this.tokenExpireTime = 0;
    return await this.getAccessToken();
  }

  public getTokenStatus() {
    if (!this.accessToken) return 'missing';
    if (Date.now() >= this.tokenExpireTime) return 'expired';
    return {
      status: 'valid',
      expiresAt: this.tokenExpireTime
    };
  }

  
 public async getScalperRecommendations(): Promise<ScalperRecommendation[]> {
    try {
      const res = await axios.get('/api/stocks/scalper-recommendations', { timeout: 3500 });
      if (res.data && Array.isArray(res.data.recommendations) && res.data.recommendations.length > 0) {
        // 백엔드가 recommendedPrice를 내려주지 않는 경우, 응답을 받은 이 순간의 price를 스냅샷으로 고정한다.
        // 한 번 고정된 recommendedPrice는 이후 어떤 동기화 로직으로도 재할당되어서는 안 된다.
        return res.data.recommendations.slice(0, MAX_SCALPER_RECOMMENDATIONS).map((r: ScalperRecommendation) => ({
          ...r,
          recommendedPrice: r.recommendedPrice ?? r.price
        }));
      }
    } catch (error) {
      console.warn("KIS getScalperRecommendations API error, using safe fallback:", error);
    }

    return this.getDefaultScalperRecommendations();
  }

  public getDefaultScalperRecommendations(): ScalperRecommendation[] {
    const rawList: Omit<ScalperRecommendation, 'recommendedPrice'>[] = [
      {
        rank: 1,
        symbol: '000660',
        name: 'SK하이닉스',
        marketType: 'KOSPI',
        price: 198000,
        change: 7500,
        changePercent: 3.94,
        volume: '8.8M',
        tradeAmount: '1조 7,424억원',
        volumeSurgeRate: 340,
        volumeIntensity: 185,
        scalpingScore: 98,
        grade: 'SSS' as const,
        category: 'VOLUME_SURGE' as const,
        targetPrice: 204500,
        stopLoss: 195000,
        expectedReturn: 3.28,
        rsi: 64.5,
        reason: '[KOSPI] HBM 공급 확대 및 CVD 실시간 대량 순매수 유입. 호가창 매수 받침이 탄탄하여 초단기 스캘핑 돌파 매매 최적 구간.',
        tags: ['#KOSPI', '#CVD수급집중', '#거래량폭증+340%', '#체결강도185%'],
        theme: 'AI 반도체 HBM 대장주',
        holdingTime: '3분 ~ 10분 (초단타)'
      },
      {
        rank: 2,
        symbol: '012450',
        name: '한화에어로스페이스',
        marketType: 'KOSPI',
        price: 338000,
        change: 15500,
        changePercent: 4.81,
        volume: '1.9M',
        tradeAmount: '6,422억원',
        volumeSurgeRate: 290,
        volumeIntensity: 172,
        scalpingScore: 97,
        grade: 'SSS' as const,
        category: 'MOMENTUM_BREAKOUT' as const,
        targetPrice: 348000,
        stopLoss: 333000,
        expectedReturn: 2.96,
        rsi: 66.8,
        reason: '[KOSPI] 방산 해외 수주 모멘텀으로 직전 고점 강한 양봉 돌파. 5분봉 골든크로스 발생 타점.',
        tags: ['#KOSPI', '#모멘텀돌파', '#K-방산', '#체결강도172%'],
        theme: 'K-방산 우주항공 대장',
        holdingTime: '5분 ~ 15분 (초단타)'
      },
      {
        rank: 3,
        symbol: '005930',
        name: '삼성전자',
        marketType: 'KOSPI',
        price: 77600,
        change: 1800,
        changePercent: 2.37,
        volume: '15.2M',
        tradeAmount: '1조 1,795억원',
        volumeSurgeRate: 210,
        volumeIntensity: 155,
        scalpingScore: 96,
        grade: 'SS' as const,
        category: 'VWAP_SUPPORT' as const,
        targetPrice: 79800,
        stopLoss: 76400,
        expectedReturn: 2.83,
        rsi: 58.4,
        reason: '[KOSPI] 당일 VWAP(기관·외인 거래량 가중평균가) 상단 안정적 지지 확인 후 우상향 추세 필터 통과.',
        tags: ['#KOSPI', '#VWAP지지', '#코스피대장', '#기관평단위'],
        theme: '종합 반도체 대장',
        holdingTime: '5분 ~ 20분 (단기)'
      },
      {
        rank: 4,
        symbol: '267260',
        name: 'HD현대일렉트릭',
        marketType: 'KOSPI',
        price: 348000,
        change: 13000,
        changePercent: 3.88,
        volume: '1.2M',
        tradeAmount: '4,176억원',
        volumeSurgeRate: 260,
        volumeIntensity: 168,
        scalpingScore: 96,
        grade: 'SS' as const,
        category: 'VOLUME_SURGE' as const,
        targetPrice: 358000,
        stopLoss: 343000,
        expectedReturn: 2.87,
        rsi: 62.1,
        reason: '[KOSPI] 북미 초고압 변압기 수주 지속 및 CVD 누적 순매수 자금 유입. 강력한 수급 확인.',
        tags: ['#KOSPI', '#CVD수급집중', '#전력인프라', '#거래량급증'],
        theme: 'AI 전력망 변압기',
        holdingTime: '3분 ~ 12분 (초단타)'
      },
      {
        rank: 5,
        symbol: '064350',
        name: '현대로템',
        marketType: 'KOSPI',
        price: 57200,
        change: 2200,
        changePercent: 4.00,
        volume: '3.5M',
        tradeAmount: '2,002억원',
        volumeSurgeRate: 240,
        volumeIntensity: 160,
        scalpingScore: 95,
        grade: 'SS' as const,
        category: 'MOMENTUM_BREAKOUT' as const,
        targetPrice: 58800,
        stopLoss: 56300,
        expectedReturn: 2.80,
        rsi: 63.4,
        reason: '[KOSPI] K2 전차 수출 기대감으로 당일 전고점 돌파. 체결강도 160% 매수세 집중.',
        tags: ['#KOSPI', '#모멘텀돌파', '#K2전차수출', '#외인순매수'],
        theme: 'K-방산 전차 수출',
        holdingTime: '5분 ~ 15분 (초단타)'
      },
      {
        rank: 6,
        symbol: '042700',
        name: '한미반도체',
        marketType: 'KOSPI',
        price: 118500,
        change: 4500,
        changePercent: 3.95,
        volume: '1.4M',
        tradeAmount: '1,659억원',
        volumeSurgeRate: 215,
        volumeIntensity: 158,
        scalpingScore: 94,
        grade: 'SS' as const,
        category: 'SUPPORT_REBOUND' as const,
        targetPrice: 122000,
        stopLoss: 116500,
        expectedReturn: 2.95,
        rsi: 59.2,
        reason: '[KOSPI] 5분봉 20선 지지선 눌림목 반등 타점 포착. 저위험 고수익 손익비 우수 구간.',
        tags: ['#KOSPI', '#눌림목반등', '#TC본더', '#손익비최상'],
        theme: 'AI 반도체 장비',
        holdingTime: '3분 ~ 15분 (초단타)'
      },
      {
        rank: 7,
        symbol: '034020',
        name: '두산에너빌리티',
        marketType: 'KOSPI',
        price: 21800,
        change: 850,
        changePercent: 4.06,
        volume: '8.2M',
        tradeAmount: '1,787억원',
        volumeSurgeRate: 220,
        volumeIntensity: 155,
        scalpingScore: 93,
        grade: 'S' as const,
        category: 'VWAP_SUPPORT' as const,
        targetPrice: 22500,
        stopLoss: 21400,
        expectedReturn: 3.21,
        rsi: 61.0,
        reason: '[KOSPI] 체코 원전 및 SMR 수주 모멘텀. VWAP 지지선 상단에서 안정적 반등 진행.',
        tags: ['#KOSPI', '#VWAP지지', '#체코원전', '#원전주도'],
        theme: '원전 & 가스터빈',
        holdingTime: '3분 ~ 15분 (초단타)'
      },
      {
        rank: 8,
        symbol: '068270',
        name: '셀트리온',
        marketType: 'KOSPI',
        price: 198500,
        change: 5500,
        changePercent: 2.85,
        volume: '950K',
        tradeAmount: '1,885억원',
        volumeSurgeRate: 190,
        volumeIntensity: 152,
        scalpingScore: 92,
        grade: 'S' as const,
        category: 'SUPPORT_REBOUND' as const,
        targetPrice: 204500,
        stopLoss: 195500,
        expectedReturn: 3.02,
        rsi: 57.8,
        reason: '[KOSPI] 코스피 바이오 대장주. 주요 매물대 지지 후 눌림목 양봉 반등 시그널 확인.',
        tags: ['#KOSPI', '#눌림목반등', '#짐펜트라', '#바이오대장'],
        theme: '바이오 시밀러 대장',
        holdingTime: '5분 ~ 20분 (단기)'
      },
      {
        rank: 9,
        symbol: '001440',
        name: '대한전선',
        marketType: 'KOSPI',
        price: 13800,
        change: 550,
        changePercent: 4.15,
        volume: '6.5M',
        tradeAmount: '897억원',
        volumeSurgeRate: 230,
        volumeIntensity: 162,
        scalpingScore: 92,
        grade: 'S' as const,
        category: 'VOLUME_SURGE' as const,
        targetPrice: 14250,
        stopLoss: 13550,
        expectedReturn: 3.26,
        rsi: 61.2,
        reason: '[KOSPI] 초고압 해저케이블 글로벌 수주 모멘텀. CVD 자금 유입 및 호가창 매수세 우위.',
        tags: ['#KOSPI', '#CVD수급', '#해저케이블', '#전력망'],
        theme: '초고압 전력 케이블',
        holdingTime: '3분 ~ 15분 (초단타)'
      },
      {
        rank: 11,
        symbol: '088350',
        name: '한화생명',
        marketType: 'KOSPI',
        price: 3250,
        change: 95,
        changePercent: 3.01,
        volume: '4.2M',
        tradeAmount: '136억원',
        volumeSurgeRate: 185,
        volumeIntensity: 148,
        scalpingScore: 90,
        grade: 'S' as const,
        category: 'SUPPORT_REBOUND' as const,
        targetPrice: 3350,
        stopLoss: 3190,
        expectedReturn: 3.08,
        rsi: 56.0,
        reason: '[KOSPI] 저PBR 밸류업 프로그램 수급 유입. 바닥권 지지선 확인 후 눌림목 반등 타점.',
        tags: ['#KOSPI', '#저PBR', '#1만원이하', '#눌림목반등'],
        theme: '금융 & 밸류업',
        holdingTime: '5분 ~ 20분 (단기)'
      },
      {
        rank: 12,
        symbol: '003230',
        name: '삼양식품',
        marketType: 'KOSPI',
        price: 565000,
        change: 18000,
        changePercent: 3.29,
        volume: '320K',
        tradeAmount: '1,808억원',
        volumeSurgeRate: 180,
        volumeIntensity: 145,
        scalpingScore: 91,
        grade: 'S' as const,
        category: 'MOMENTUM_BREAKOUT' as const,
        targetPrice: 580000,
        stopLoss: 556000,
        expectedReturn: 2.65,
        rsi: 59.5,
        reason: '[KOSPI] K-푸드 불닭볶음면 글로벌 수출 호조세 지속. 전고점 모멘텀 돌파 타점.',
        tags: ['#KOSPI', '#모멘텀돌파', '#K-푸드수출', '#신고가패턴'],
        theme: '음식료 수출 대장',
        holdingTime: '5분 ~ 15분 (초단타)'
      },
      {
        rank: 13,
        symbol: '005380',
        name: '현대차',
        marketType: 'KOSPI',
        price: 246000,
        change: 6000,
        changePercent: 2.50,
        volume: '1.1M',
        tradeAmount: '2,706억원',
        volumeSurgeRate: 175,
        volumeIntensity: 148,
        scalpingScore: 90,
        grade: 'S' as const,
        category: 'VWAP_SUPPORT' as const,
        targetPrice: 253000,
        stopLoss: 242000,
        expectedReturn: 2.85,
        rsi: 56.5,
        reason: '[KOSPI] 밸류업 프로그램 및 호실적 기반 기관 매수세. VWAP 지지선 상단 안착.',
        tags: ['#KOSPI', '#VWAP지지', '#밸류업', '#자동차대장'],
        theme: '자동차 & 미래 모빌리티',
        holdingTime: '5분 ~ 20분 (단기)'
      }
    ];
    // recommendedPrice는 이 목록이 생성되는 이 순간의 price를 그대로 스냅샷으로 고정한다.
    // 이후 화면단에서 price(현재가)가 실시간으로 바뀌어도 recommendedPrice는 절대 갱신되지 않는다.
    return rawList.slice(0, MAX_SCALPER_RECOMMENDATIONS).map(r => ({ ...r, recommendedPrice: r.price }));
  }

}

export interface ScalperRecommendation {
  rank: number;
  symbol: string;
  name: string;
  marketType?: 'KOSPI' | 'KOSDAQ';
  price: number;               // 화면 표시용 "현재가" — 실시간으로 계속 동기화됨
  recommendedPrice: number;    // 추천 당시 가격 스냅샷 — 생성 이후 절대 갱신되지 않음
  change: number;
  changePercent: number;
  volume: string;
  tradeAmount: string;
  volumeSurgeRate: number;
  volumeIntensity: number;
  scalpingScore: number;
  grade: 'SSS' | 'SS' | 'S' | 'A+';
  category: 'VOLUME_SURGE' | 'MOMENTUM_BREAKOUT' | 'SUPPORT_REBOUND' | 'VWAP_SUPPORT' | 'CVD_FLOW';
  targetPrice: number;
  stopLoss: number;
  expectedReturn: number;
  rsi: number;
  reason: string;
  // 🔍 이 데이터가 어디서 왔는지, 얼마나 최신인지 구분하기 위한 필드 — 사용자가 "실제 데이터인지
  // 확인하고 싶다"고 요청해서 추가함
  dataSource?: 'RANKING_API' | 'TRACKED_POOL'; // RANKING_API: 방금 KIS 순위 API를 직접 호출한 결과(항상 신선함) / TRACKED_POOL: 이미 추적 중이던 종목에서 가져온 결과(마지막 갱신 시점에 따라 오래됐을 수 있음)
  dataAgeSeconds?: number; // 이 가격 데이터가 마지막으로 갱신된 후 몇 초가 지났는지
  tags: string[];
  theme?: string;
  holdingTime?: string;
  // 🎯 (2026-10-04) 매수 필수조건 기준 추천 점수 — 실제 조회값으로만 계산한다
  hasDetail?: boolean;          // 상세 조회(현재가·체결강도)를 실제로 받은 종목인지
  gatesPassed?: number;         // 통과한 매수 필수조건 수 (체결강도 · VWAP 위 · 5분 거래대금)
  gatesTotal?: number;          // 판정할 수 있었던 필수조건 수
  execStrength?: number;        // 당일 체결강도 (조회 못 했으면 없음)
  vwapGapPct?: number;          // 현재가의 당일 평균가(VWAP) 대비 %
  pullbackPct?: number;         // 당일 고가 대비 내려온 %
  est5mTradeValue?: number;     // 5분 거래대금 — 실시간 값 > 최근 체결 환산 > 당일 평균 추정 순
  recentTicksPerMin?: number;   // 최근 분당 체결 건수(조회한 종목만)
  liquidityTier?: 'LARGE' | 'MID' | 'SMALL';
  targetNetPct?: number;        // 유동성 구분별 익절 기준(순수익 %)
  stopNetPct?: number;          // 유동성 구분별 손절 기준(순수익 %)
}

/** 추천 후보 상세 조회 결과 — 받지 못한 값은 undefined */
export interface RecommendationDetail {
  price?: number;
  vwap?: number;
  high?: number;
  low?: number;
  tradingValue?: number;
  changePercent?: number;
  execStrength?: number;
  recentTicksPerMin?: number;    // 최근 체결 목록 기준 분당 체결 건수
  recentTradeValue5m?: number;   // 최근 체결 목록 기준 5분 환산 거래대금
}

export const kisService = new KISService();
