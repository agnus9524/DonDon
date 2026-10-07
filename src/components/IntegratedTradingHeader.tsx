import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, ChevronRight, Sparkles, Activity, TrendingUp, TrendingDown, 
  Layers, Zap, Loader2, Flame, RefreshCw, X, Play, Square, Briefcase, Coins, ScrollText, BarChart3 
} from 'lucide-react';
import { Stock, ScalperTab, TradeLog } from '../types';
import { cn } from '../lib/utils';
import { SignalPerformanceModal } from './SignalPerformanceModal';
import { MAX_SCALPER_RECOMMENDATIONS } from '../services/kisService';

export interface IntegratedTradingHeaderProps {
  selectedStock: Stock | null;
  searchRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchSymbol: string;
  setSearchSymbol: (s: string) => void;
  searchSuggestions: any[];
  showSuggestions: boolean;
  setShowSuggestions: (show: boolean) => void;
  handleAddStock: (customSymbol?: string, recommendedStock?: Stock, customName?: string) => void;
  handleOpenScalperRecommendations: () => void;
  heldQty: number;
  displayBuyableQty: number;
  formatCurrency: (val: number, hideSymbol?: boolean, market?: string) => string;
  formatQuantity: (val: number) => string;
  scalperStrategyMode: string;
  setScalperStrategyMode: (mode: any) => void;
  selectedScalperStrategies?: ('PULLBACK' | 'BREAKOUT' | 'VWAP_SUPPORT' | 'VOLUME_PROFILE_CVD')[];
  setSelectedScalperStrategies?: (strategies: any) => void;
  handleToggleStrategy?: (strat: 'PULLBACK' | 'BREAKOUT' | 'VWAP_SUPPORT' | 'VOLUME_PROFILE_CVD') => void;
  handleSelectAllGreen?: () => void;
  activeStrategyDetection: {
    isPullback: boolean;
    isBreakout: boolean;
    isVwapSupport: boolean;
    isVolumeProfile: boolean;
    activeCount: number;
    isAllGreen: boolean;
  };
  displayScalperMessage: string;
  tradeQuantity: number;
  setTradeQuantity: (q: number) => void;
  maxSlots: number;
  setMaxSlots: (s: number) => void;
  scalpingTargetProfit: number;
  setScalpingTargetProfit: (p: number) => void;
  scalpingStopLoss: number;
  setScalpingStopLoss: (l: number) => void;
  isSmartScalperMode: boolean;
  setIsSmartScalperMode: (m: boolean) => void;
  minGapBetweenSlots: number;
  setMinGapBetweenSlots: (g: number) => void;
  entryPriceMode: string;
  setEntryPriceMode: (m: any) => void;
  scalpingSpeed: number;
  setScalpingSpeed: (s: number) => void;
  gapBuyPrice: number;
  gapSellPrice: number;
  isScalperRecLoading: boolean;
  tradeLogs: { symbol: string; time: string; reason: string; type: string; price: number }[];
  // 🎯 종목별 호가 신호 (A: 매도호가 소진 / D: 매수호가 우세) — App이 1초마다 liveOrderbooksRef에서 계산해 전달
  orderbookSignals?: Record<string, { askDepletion: boolean; bidDominant: boolean; bidAskRatio?: number }>;
  // 추천종목 가격구간 — 하한·상한 금액(원)
  recPriceMin: number;
  recPriceMax: number;
  setRecPriceRange: (min: number, max: number) => void;
  // (2026-09-30) 추천종목 시장 선택 — 'ALL'(둘 다 꺼짐) / 'KOSPI' / 'KOSDAQ'
  recMarketFilter?: 'ALL' | 'KOSPI' | 'KOSDAQ';
  setRecMarketFilter?: (m: 'ALL' | 'KOSPI' | 'KOSDAQ') => void;
  buyAmountOptions: readonly { value: number; label: string }[];
  targetInvestmentPerStock: number;
  setTargetInvestmentPerStock: (amount: number) => void;
  isRefreshingTop3: boolean;
  scalperTabs: ScalperTab[];
  activeTabId: string;
  marketType: 'KR' | 'US';
  handleSwitchTab: (id: string) => void;
  closeScalperTab: (id: string, e: React.MouseEvent) => void;
  openOrSwitchScalperTab: (symbol: string, name?: string) => void;
  stocks: Stock[];
  setStocks: React.Dispatch<React.SetStateAction<Stock[]>>;
  stocksCache: { KR: Stock[]; US: Stock[] };
  setStocksCache: React.Dispatch<React.SetStateAction<{ KR: Stock[]; US: Stock[] }>>;
  aiRecommendations: Stock[];
  getResolvedStockName: (symbol: string, stock?: any) => string;
  showNotification: (msg: string, type: 'success' | 'error' | 'info') => void;
  isGapBotActive: boolean;
  setIsGapBotActive: React.Dispatch<React.SetStateAction<boolean>>;
  setLastTradeType: (t: any) => void;
  holdings: Record<string, number>;
  avgPrices: Record<string, number>;
  setShowScalperRecModal: (open: boolean) => void;
  setShowGlobalTradeLogModal: (open: boolean) => void;
  onOpenStrategySettings?: () => void; // ⚙️ 매매 기준 설정 창 열기
  buyKindOf?: (symbol: string) => 'CLOSE' | 'TREND' | 'SCALP' | null; // 보유 종목의 매수 경로(마감/추세/스캘핑) — 카드에 ㉮·㉯·S 표시
  onOpenChart?: (symbol: string, name: string) => void; // 📊 종목 카드 더블클릭 → 일봉 차트
  handleRefreshScalperRecList: () => void;
  handleSyncKIS: () => void;
  setManualSellStock: (s: Stock) => void;
  setManualSellQty: (q: number) => void;
  setManualSellPrice: (p: number) => void;
  setManualSellModalOpen: (open: boolean) => void;
  INITIAL_STOCKS_KR: Stock[];
  maxInventoryPerMarket: number;
  // 💵 주문가능금액(원) — App의 orderableKrw(KIS 잔고 동기화 시 갱신)
  orderableKrw?: number;
  wsConnectionStatus: 'connecting' | 'open' | 'closed' | 'error' | 'idle' | 'kis_disconnected' | 'kis_reconnecting' | 'appkey_conflict';
  // ⚡ 실시간 슬롯 배정 결과 — 실시간(웹소켓)으로 받는 종목 목록, 전체 자리 수, 자리를 못 받은 보유 종목 수
  realtimeSymbols?: string[];
  // 🕘 현재 거래 세션 (정규장 / 정규장 마감 판단 / 종가 동시호가 / 휴장 / 애프터마켓 / 애프터 마감 판단 / 장 종료)
  tradingSessionInfo?: { label: string; tone: 'green' | 'amber' | 'slate' | 'violet'; tip: string };
  // 📋 현재 적용 중인 매매 규칙 (신호 성과 창 상단 표시용)
  tradingRules?: { group?: 'BUY' | 'SELL' | 'ETC'; label: string; value: string }[];
  realtimeCapacity?: number;
  realtimeOverflowCount?: number;
  // 🛟 슬롯3 방어 상태(종목별) — 카드에 대기 남은 시간/체결 표시
  rescueView?: Record<string, { phase: 'WAITING' | 'FILLED' | 'EXPIRED'; openedAt: number }>;
  rescueWaitMs?: number;
  handleClearAllInventory: () => void;
  updateTab: (symbol: string, updates: Partial<ScalperTab>) => void;
}

// 🎯 (2026-09-29) 익절·손절 드롭다운 선택지 — 0.1% 단위 (+0.15% 유지). 기본값은 App에서 익절 0.8% · 손절 -0.8%(2026-09-30)
// 값은 순수익(수수료 매수·매도 각 0.014% + 거래세 0.20% 뺀 값) 기준
const TARGET_PROFIT_OPTIONS: number[] = Array.from(new Set([
  ...Array.from({ length: 20 }, (_, i) => Number(((i + 1) * 0.1).toFixed(2))), // +0.1 ~ +2.0
  0.15,
])).sort((a, b) => a - b);
const STOP_LOSS_OPTIONS: number[] = Array.from({ length: 20 }, (_, i) => Number((-(i + 1) * 0.1).toFixed(2))); // -0.1 ~ -2.0
/** 순수익률(%) → 카드에 보이는 가격 기준 수익률(%) — 왕복 비용 약 0.23% 반영 */
const netToPricePct = (netPct: number) => ((1 + netPct / 100) * (1 + 0.00014) / (1 - 0.00014 - 0.002) - 1) * 100;

export const IntegratedTradingHeader: React.FC<IntegratedTradingHeaderProps> = ({
  selectedStock,
  searchRef,
  searchInputRef,
  searchSymbol,
  setSearchSymbol,
  searchSuggestions,
  showSuggestions,
  setShowSuggestions,
  handleAddStock,
  handleOpenScalperRecommendations,
  heldQty,
  displayBuyableQty,
  formatCurrency,
  formatQuantity,
  scalperStrategyMode,
  setScalperStrategyMode,
  selectedScalperStrategies = ['PULLBACK', 'BREAKOUT', 'VWAP_SUPPORT', 'VOLUME_PROFILE_CVD'],
  setSelectedScalperStrategies,
  handleToggleStrategy,
  handleSelectAllGreen,
  activeStrategyDetection,
  displayScalperMessage,
  tradeQuantity,
  setTradeQuantity,
  maxSlots,
  setMaxSlots,
  scalpingTargetProfit,
  setScalpingTargetProfit,
  scalpingStopLoss,
  setScalpingStopLoss,
  isSmartScalperMode,
  setIsSmartScalperMode,
  minGapBetweenSlots,
  setMinGapBetweenSlots,
  entryPriceMode,
  setEntryPriceMode,
  scalpingSpeed,
  setScalpingSpeed,
  gapBuyPrice,
  gapSellPrice,
  isScalperRecLoading,
  tradeLogs,
  orderbookSignals,
  recPriceMin,
  recPriceMax,
  setRecPriceRange,
  recMarketFilter = 'ALL',
  setRecMarketFilter,
  buyAmountOptions,
  targetInvestmentPerStock,
  setTargetInvestmentPerStock,
  isRefreshingTop3,
  scalperTabs,
  activeTabId,
  marketType,
  handleSwitchTab,
  closeScalperTab,
  openOrSwitchScalperTab,
  stocks,
  setStocks,
  stocksCache,
  setStocksCache,
  aiRecommendations,
  getResolvedStockName,
  showNotification,
  isGapBotActive,
  setIsGapBotActive,
  setLastTradeType,
  holdings,
  avgPrices,
  setShowScalperRecModal,
  setShowGlobalTradeLogModal,
  onOpenStrategySettings,
  onOpenChart,
  buyKindOf,
  handleRefreshScalperRecList,
  handleSyncKIS,
  setManualSellStock,
  setManualSellQty,
  setManualSellPrice,
  setManualSellModalOpen,
  INITIAL_STOCKS_KR,
  maxInventoryPerMarket,
  orderableKrw = 0,
  wsConnectionStatus,
  realtimeSymbols = [],
  tradingSessionInfo,
  tradingRules,
  realtimeCapacity = 20,
  realtimeOverflowCount = 0,
  rescueView = {},
  rescueWaitMs = 5 * 60 * 1000,
  handleClearAllInventory,
  updateTab,
}) => {
  // 📊 신호 성과 분석 모달 열림 상태
  const [showSignalPerf, setShowSignalPerf] = React.useState(false);
  // 💰 추천종목 가격구간 입력 — 입력 중엔 임시 문자열로 두고, 입력창을 벗어나거나 Enter를 누를 때 적용한다
  // 💰 (2026-10-01) 종목당 진입금액 직접 입력 — 입력 중 값(draft)과 확정 값을 분리
  const [amountDraft, setAmountDraft] = React.useState<string>(targetInvestmentPerStock.toLocaleString());
  React.useEffect(() => { setAmountDraft(targetInvestmentPerStock.toLocaleString()); }, [targetInvestmentPerStock]);
  // 🛡️ (2026-10-01) 예전엔 Enter/다른 곳 클릭 때만 적용돼서, 60,000을 입력해 둔 채로 두면 화면엔 60,000이 보여도
  // 실제 매수는 이전 금액(예: 10만원 → 9,120원 × 10주)으로 나갔다. 이제 입력을 멈추고 0.8초 뒤 자동 적용하고,
  // 적용 전이면 칸 테두리를 주황색 + "미적용"으로 표시한다.
  const amountTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftAmountValue = Number(amountDraft.replace(/,/g, ''));
  const amountPending = draftAmountValue !== targetInvestmentPerStock;
  const commitAmount = () => {
    if (amountTimerRef.current) { clearTimeout(amountTimerRef.current); amountTimerRef.current = null; }
    const v = Number(amountDraft.replace(/,/g, ''));
    if (Number.isFinite(v) && v >= 1000 && v <= 10_000_000) {
      if (v !== targetInvestmentPerStock) setTargetInvestmentPerStock(Math.round(v));
      else setAmountDraft(v.toLocaleString());
    } else {
      setAmountDraft(targetInvestmentPerStock.toLocaleString()); // 범위 밖/빈 값 — 이전 값으로 되돌림
    }
  };
  const [priceMinDraft, setPriceMinDraft] = React.useState<string>(String(recPriceMin));
  const [priceMaxDraft, setPriceMaxDraft] = React.useState<string>(String(recPriceMax));
  React.useEffect(() => { setPriceMinDraft(String(recPriceMin)); }, [recPriceMin]);
  React.useEffect(() => { setPriceMaxDraft(String(recPriceMax)); }, [recPriceMax]);
  const commitPriceRange = () => {
    const min = parseInt(priceMinDraft.replace(/[^0-9]/g, ''), 10);
    const max = parseInt(priceMaxDraft.replace(/[^0-9]/g, ''), 10);
    // 잘못된 값(비었음 / 0 / 하한 ≥ 상한)이면 적용하지 않고 이전 값으로 되돌린다
    if (!(min > 0) || !(max > 0) || min >= max) {
      setPriceMinDraft(String(recPriceMin));
      setPriceMaxDraft(String(recPriceMax));
      return;
    }
    if (min !== recPriceMin || max !== recPriceMax) setRecPriceRange(min, max);
  };
  // 검색 드롭다운 키보드(↑↓ + Enter) 네비게이션용 로컬 상태
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const suggestionItemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // 🎯 종목 카드 테두리 "센서 반짝임" 효과 — 이 종목의 센서(눌림목/돌파/VWAP 등) 활성화 개수가
  // 늘어난 순간, 카드 테두리에 청록색 링이 잠깐 반짝였다 사라지도록 한다. 기존 5가지 상태색
  // (관망=회색/매수시도=노랑/보유=초록/매도시도=주황/매도완료=빨강)과 안 겹치는 색을 골랐다.
  // React state/타이머 없이, activeCount가 늘어날 때마다 flashKey를 1씩 올려서 그 key로
  // 오버레이 엘리먼트를 remount시키면 CSS 애니메이션이 매번 처음부터 재생된다(useState로
  // "몇 ms 동안 켜둘지"를 관리할 필요가 없어 훨씬 단순하다).
  const prevActiveCountRef = React.useRef<Record<string, number>>({});
  const [flashKeys, setFlashKeys] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    let changed = false;
    const next = { ...flashKeys };
    for (const tab of scalperTabs) {
      const count = tab.sensors?.activeCount ?? 0;
      const prev = prevActiveCountRef.current[tab.symbol] ?? 0;
      if (count > prev) {
        next[tab.symbol] = (next[tab.symbol] || 0) + 1;
        changed = true;
      }
      prevActiveCountRef.current[tab.symbol] = count;
    }
    if (changed) setFlashKeys(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scalperTabs]);

  React.useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchSuggestions, showSuggestions]);

  React.useEffect(() => {
    if (highlightedIndex >= 0) {
      suggestionItemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const isUS = selectedStock ? (selectedStock.market === 'US' || /^[A-Za-z]/.test(selectedStock.symbol) || marketType === 'US') : false;
  const price = selectedStock?.price || 0;
  const changeVal = selectedStock?.change || 0;
  const changePct = selectedStock?.changePercent || 0;
  const isUp = changeVal >= 0;

  // Portfolio calculations
  const heldSymbols = Object.keys(holdings).filter(sym => (holdings[sym] || 0) > 0);
  let totalStockPurchase = 0;
  let totalStockEval = 0;

  heldSymbols.forEach(sym => {
    const qty = holdings[sym] || 0;
    const avgP = avgPrices[sym] || 0;
    const st = stocks.find(s => s.symbol === sym) || INITIAL_STOCKS_KR.find(s => s.symbol === sym);
    const currentP = st?.price || avgP;
    totalStockPurchase += (avgP * qty);
    totalStockEval += (currentP * qty);
  });

  const totalStockPnL = totalStockEval - totalStockPurchase;
  const totalStockPnLPct = totalStockPurchase > 0 ? (totalStockPnL / totalStockPurchase) * 100 : 0;

  return (
    <div className="relative z-[110] bg-gradient-to-br from-slate-900/95 via-slate-900/98 to-slate-950/95 border border-slate-700/60 p-3 sm:p-4 rounded-3xl shadow-2xl backdrop-blur-xl space-y-3">
      
      {/* ─────────────────────────────────────────────────────────────
          1행: 종목 검색/추가, 종목명/체결가, 그리고 6대 전략 센서 버튼
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 pb-2.5 border-b border-white/10">

      {/* 1번째 반응형 창 — SCALPER INVENTORY (종목명 검색창 포함) */}
        {/* 4. 스캘퍼 등록 종목 & 추천종목 찾기 (col-span-3) */}
        <div className="bg-black/30 p-2.5 rounded-2xl border border-sleek-border flex flex-col justify-between space-y-1.5 min-w-0 shadow-inner">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5 gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap w-full sm:w-auto">
              
          <div ref={searchRef} className="relative z-[100] w-full sm:flex-1 sm:min-w-[130px] sm:max-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input 
              ref={searchInputRef}
              type="text" 
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              onFocus={() => {
                if (searchSuggestions.length > 0) setShowSuggestions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (searchSuggestions.length === 0) return;
                  setShowSuggestions(true);
                  setHighlightedIndex(prev => (prev + 1) % searchSuggestions.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (searchSuggestions.length === 0) return;
                  setShowSuggestions(true);
                  setHighlightedIndex(prev => (prev - 1 + searchSuggestions.length) % searchSuggestions.length);
                  return;
                }
                if (e.key === 'Escape') {
                  setShowSuggestions(false);
                  setHighlightedIndex(-1);
                  return;
                }
                if (e.key !== 'Enter') return;

                // ↑↓로 하이라이트된 항목이 있으면 그것을 최우선으로 선택
                if (highlightedIndex >= 0 && highlightedIndex < searchSuggestions.length) {
                  const picked = searchSuggestions[highlightedIndex];
                  handleAddStock(picked.symbol, picked, picked.name);
                  setHighlightedIndex(-1);
                  return;
                }

                const exactMatch = searchSuggestions.find(
                  s =>
                    s.symbol.toLowerCase() ===
                    searchSymbol.trim().toLowerCase()
                );

                if (exactMatch) {
                  handleAddStock(
                    exactMatch.symbol,
                    exactMatch,
                    exactMatch.name
                  );
                  return;
                }

                if (searchSuggestions.length > 0) {
                  const first = searchSuggestions[0];

                  handleAddStock(
                    first.symbol,
                    first,
                    first.name
                  );
                  return;
                }

                handleAddStock();
              }}
              className="w-full bg-black/50 border border-white/15 focus:border-sleek-blue rounded-xl py-1.5 pl-7 pr-12 text-xs font-semibold text-white placeholder:text-slate-500 outline-none transition-all shadow-inner" 
              placeholder="종목코드/명"
            />
            <button
              type="button"
              onClick={() => handleAddStock()}
              className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 bg-sleek-blue hover:bg-blue-600 active:scale-95 text-white text-[11px] font-bold rounded-lg transition-all shadow-md cursor-pointer"
            >
              추가
            </button>
            
            {/* Search Suggestions Dropdown */}
            <AnimatePresence>
              {showSuggestions && searchSuggestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -4, scale: 0.98 }} 
                  animate={{ opacity: 1, y: 0, scale: 1 }} 
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-2 z-[200] w-[92vw] max-w-[384px] bg-slate-900/98 backdrop-blur-2xl border-2 border-sleek-blue/50 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] ring-2 ring-sleek-blue/30 overflow-hidden"
                >
                  <div className="px-4 py-2 bg-slate-950/90 border-b border-white/10 flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-sleek-blue">
                      <Search className="w-3.5 h-3.5" />
                      {searchSymbol.trim() ? `검색 결과 (${searchSuggestions.length}개)` : `최근 등록 + 전체 KOSPI 종목 (${searchSuggestions.length}개)`}
                    </span>
                    <span className="text-[11px] text-emerald-400 font-medium hidden sm:inline">클릭 또는 ↑↓ + Enter로 등록</span>
                  </div>

                  <div className="max-h-[340px] overflow-y-auto custom-scrollbar divide-y divide-white/5">
                    {searchSuggestions.map((s, idx) => {
                      const isAlreadyRegistered = scalperTabs.some(t => t.symbol === s.symbol);
                      const isHighlighted = idx === highlightedIndex;
                      return (
                      <button 
                        key={`${s.symbol}-${idx}`}
                        ref={(el) => { suggestionItemRefs.current[idx] = el; }}
                        type="button"
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddStock(s.symbol, s as any, s.name);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between p-3 transition-colors text-left cursor-pointer group",
                          isHighlighted ? "bg-sleek-blue/25" : "hover:bg-sleek-blue/20 active:bg-sleek-blue/30"
                        )}
                      >
                        <span className="text-sm font-extrabold text-white group-hover:text-sleek-blue transition-colors truncate min-w-0">
                          {s.name}
                        </span>
                        {isAlreadyRegistered && (
                          <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            등록됨
                          </span>
                        )}
                      </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
              {/* 추천종목 찾기 버튼 */}
              <button
                type="button"
                onClick={handleOpenScalperRecommendations}
                disabled={isScalperRecLoading || isRefreshingTop3}
                className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-600/90 to-teal-600/90 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/40 text-[11px] font-black font-mono flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.3)] active:scale-95 shrink-0 disabled:opacity-50"
                title={`한국투자증권 실시간 수급 및 거래량 데이터를 분석하여 스캘퍼 최적 추천종목 ${MAX_SCALPER_RECOMMENDATIONS}선을 확인합니다.`}
              >
                {(isScalperRecLoading || isRefreshingTop3) ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-200" />
                ) : (
                  <Flame className="w-3.5 h-3.5 text-amber-300 fill-amber-300 animate-pulse" />
                )}
                <span>{(isScalperRecLoading || isRefreshingTop3) ? "추천 분석중..." : "추천종목 찾기"}</span>
              </button>

              {/* 🏷️ (2026-09-30) 시장 선택 — 코스피/코스닥 중 하나만 켜면 그 시장 종목만 추천·자동채움.
                  켜진 버튼을 다시 누르면 꺼지고 전체(코스피+코스닥)로 돌아간다. */}
              <div className="shrink-0 flex items-center gap-1" title="켜진 시장의 종목만 추천종목 검색/자동채움 대상이 됩니다. 둘 다 꺼져 있으면 코스피+코스닥 전체.">
                {([['KOSPI', '코스피'], ['KOSDAQ', '코스닥']] as const).map(([mk, label]) => {
                  const active = recMarketFilter === mk;
                  return (
                    <button
                      key={mk}
                      type="button"
                      onClick={() => setRecMarketFilter?.(active ? 'ALL' : mk)}
                      aria-pressed={active}
                      className={`px-2 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer active:scale-95 ${
                        active
                          ? (mk === 'KOSPI'
                              ? 'bg-blue-600/80 text-white border-blue-400/70 shadow-[0_0_10px_rgba(59,130,246,0.4)]'
                              : 'bg-fuchsia-600/80 text-white border-fuchsia-400/70 shadow-[0_0_10px_rgba(217,70,239,0.4)]')
                          : 'bg-black/40 text-slate-400 border-white/10 hover:text-slate-200 hover:border-white/30'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* 💰 추천종목 가격구간 — 하한·상한 금액 직접 입력(2026-09-29, 기본 5,000원 ~ 10,000원).
                  입력한 구간의 종목만 추천종목 검색/자동채움 대상이 된다 (KIS 랭킹 API 단계에서부터 필터링). */}
              <div
                className="shrink-0 flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl px-2 py-0.5 hover:border-emerald-500/50"
                title="이 가격구간(하한 ~ 상한)에 있는 종목만 추천/자동채움 대상이 됩니다. 입력 후 Enter 또는 다른 곳 클릭 시 적용 — 하한이 상한보다 크거나 같으면 적용되지 않습니다."
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={priceMinDraft}
                  onChange={e => setPriceMinDraft(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={commitPriceRange}
                  onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                  className="w-14 bg-transparent text-right text-[11px] font-bold text-emerald-300 outline-none tabular-nums"
                  aria-label="추천종목 하한금액(원)"
                />
                <span className="text-[10px] text-slate-400">원 ~</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={priceMaxDraft}
                  onChange={e => setPriceMaxDraft(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={commitPriceRange}
                  onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                  className="w-14 bg-transparent text-right text-[11px] font-bold text-emerald-300 outline-none tabular-nums"
                  aria-label="추천종목 상한금액(원)"
                />
                <span className="text-[10px] text-slate-400">원</span>
              </div>

            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {(() => {
                // 📦 인벤토리 등록 현황 — 현재 시장(KR/US) 기준 등록 종목 수 / 최대 등록 가능 수 (예: 2/19)
                const registeredCount = scalperTabs.filter(t =>
                  marketType === 'US' ? /^[A-Za-z]/.test(t.symbol) : !/^[A-Za-z]/.test(t.symbol)
                ).length;
                const isFull = registeredCount >= maxInventoryPerMarket;
                return (
                  <span
                    className={cn(
                      "text-[10px] font-black font-mono px-2 py-0.5 rounded-full border shrink-0",
                      isFull ? "text-amber-300 bg-amber-500/10 border-amber-500/40" : "text-sky-300 bg-sky-500/10 border-sky-500/30"
                    )}
                    title={`인벤토리 등록 종목 ${registeredCount}개 / 최대 ${maxInventoryPerMarket}개`}
                  >
                    {registeredCount}/{maxInventoryPerMarket}
                  </span>
                );
              })()}
              {tradingSessionInfo && (
                <span
                  className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                    tradingSessionInfo.tone === 'green' && "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
                    tradingSessionInfo.tone === 'violet' && "text-violet-300 bg-violet-500/10 border-violet-500/30",
                    tradingSessionInfo.tone === 'amber' && "text-amber-300 bg-amber-500/10 border-amber-500/40",
                    tradingSessionInfo.tone === 'slate' && "text-slate-400 bg-white/5 border-white/10"
                  )}
                  title={tradingSessionInfo.tip}
                >
                  🕘 {tradingSessionInfo.label}
                </span>
              )}
              {(() => {
                // 🚦 KIS 연결 상태 4단계 — 🟢 정상 / 🟠 재연결 중 / 🔴 끊김 / 🟡 앱키 충돌
                const st = wsConnectionStatus;
                const view =
                  st === 'open' ? { label: 'KIS 정상', pill: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400 animate-pulse',
                      tip: '실시간 연결 정상 — 실시간 배정 종목은 체결 즉시, 나머지는 REST로 갱신됩니다' }
                  : (st === 'connecting' || st === 'kis_reconnecting') ? { label: 'KIS 재연결 중', pill: 'text-orange-400 bg-orange-500/10 border-orange-500/30', dot: 'bg-orange-400 animate-pulse',
                      tip: st === 'connecting' ? '서버와 연결(재연결) 중입니다 — 잠시 REST로 동작합니다' : '서버가 KIS 실시간 서버에 다시 연결하는 중입니다 (1→2→4→…→30초 간격으로 재시도)' }
                  : st === 'appkey_conflict' ? { label: '앱키 중복 사용', pill: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/40', dot: 'bg-yellow-300 animate-pulse',
                      tip: 'KIS가 OPSP8996(ALREADY IN USE appkey)로 거부했습니다 — 같은 앱키로 이미 다른 곳(재배포 중인 예전 서버, 로컬 개발 서버 등)이 연결돼 있습니다. 계정이 끊긴 것이 아니며, 서버가 자동으로 재시도합니다.' }
                  : st === 'idle' ? { label: '미연결', pill: 'text-slate-400 bg-white/5 border-white/10', dot: 'bg-slate-500',
                      tip: '실시간 미연결 — REST 폴링으로 동작 중' }
                  : { label: 'KIS 연결끊김', pill: 'text-rose-400 bg-rose-500/10 border-rose-500/30', dot: 'bg-rose-400',
                      tip: st === 'kis_disconnected' ? '서버와는 연결됐지만 서버 ↔ KIS 실시간 연결이 끊겼습니다 — REST 폴링으로 대체 동작 중'
                         : '서버와의 연결이 끊겼고 재시도도 멈췄습니다 — 새로고침해 주세요 (REST 폴링으로 대체 동작 중)' };
                return (
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0", view.pill)} title={view.tip}>
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", view.dot)} />
                    {view.label}
                  </span>
                );
              })()}
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('인벤토리에 등록된 종목을 전부 삭제할까요? 개별 삭제가 안 될 때 쓰는 확실한 초기화입니다.')) return;
                  handleClearAllInventory();
                }}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-all shrink-0"
                title="인벤토리 전체 초기화 (개별 삭제가 안 될 때 사용)"
              >
                전체초기화
              </button>
            </div>
          </div>

          {/* 💰 종목당 진입금액 — 실제 매수 시그널이 발생하는 순간 "이 금액 ÷ 그때의 주문가격"으로
              수량이 계산된다. 인벤토리 전체에 적용되는 전역 설정이라 카드마다 반복하지 않고
              목록 바로 위에 한 번만, 세로 공간을 아끼기 위해 한 줄로 배치한다. */}
          <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-black/20 border border-white/5 flex items-center gap-2 overflow-x-auto custom-scrollbar">
            <span className="text-[11px] font-black text-white shrink-0" title="매수 시그널 발생 시 현재가 기준 최대수량으로 진입">종목당 진입금액</span>
            {/* (2026-09-29) 버튼 나열 → 드롭다운. 오른쪽에 익절(목표)·손절 드롭다운 추가 — 모두 순수익(수수료·세금 뺀) 기준,
                괄호 안은 카드에 보이는 가격 기준 수익률(왕복 비용 약 0.23% 반영) */}
            {/* (2026-10-01) 드롭다운 → 직접 입력. Enter 또는 다른 곳 클릭 시 적용 (1,000원 ~ 10,000,000원) */}
            <div className={`h-6 px-1.5 rounded-md border bg-slate-900 flex items-center gap-0.5 shrink-0 ${amountPending ? 'border-amber-400' : 'border-blue-500/40 focus-within:border-blue-400'}`}
              title="매수 시그널 발생 시 이 금액 ÷ 주문가격만큼 매수. 1,000원 ~ 10,000,000원, Enter 또는 다른 곳 클릭 시 적용">
              <input
                type="text"
                inputMode="numeric"
                value={amountDraft}
                onChange={e => {
                  const next = e.target.value.replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                  setAmountDraft(next);
                  if (amountTimerRef.current) clearTimeout(amountTimerRef.current);
                  const v = Number(next.replace(/,/g, ''));
                  if (Number.isFinite(v) && v >= 1000 && v <= 10_000_000) {
                    amountTimerRef.current = setTimeout(() => { amountTimerRef.current = null; setTargetInvestmentPerStock(Math.round(v)); }, 800);
                  }
                }}
                onBlur={commitAmount}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setAmountDraft(targetInvestmentPerStock.toLocaleString()); (e.target as HTMLInputElement).blur(); } }}
                className="w-20 bg-transparent text-right text-blue-300 text-[11px] font-bold outline-none tabular-nums"
                aria-label="종목당 진입금액(원)"
              />
              <span className="text-[11px] text-blue-300/70 font-bold">원</span>
              {amountPending && <span className="text-[10px] text-amber-300 font-bold ml-0.5" title={`현재 실제 적용 금액: ${targetInvestmentPerStock.toLocaleString()}원`}>미적용</span>}
            </div>
            {/* (2026-10-04) 익절 드롭다운 삭제 — 익절 기준은 종목별로 진입 시점의 5분 거래대금에 따라 정한다(대형 0.5 / 중형 0.8 / 소형 1.2%, 전략 버전 값). */}
            {/* (2026-10-04) 손절 드롭다운 삭제 — 손절도 종목별로 진입 시점의 5분 거래대금에 따라 정한다(대형 −0.6 / 중형 −0.8 / 소형 −1.0%, 전략 버전 값). */}
            {/* 💰 보유 주식 총 평가금액/평가손익 — (구) "보유 주식 현황" 전체 패널은 삭제하고,
                그 안에 있던 합계 수치만 [전체 로그] 버튼 왼쪽으로 옮겨왔다. */}
            {/* 💵 주문가능금액 — 총 평가금액 왼쪽(2026-09-28 추가). 보유 종목이 없어도 항상 표시한다. */}
            {/* 📌 (2026-10-05) 보유 종목 줄 — 종목명 · 슬롯 · 평단 · 수익을 글자로만 표시. 매도 주문이 나가 있으면 보라색으로 깜빡인다. */}
            <div className="ml-auto flex items-center justify-end gap-1 flex-wrap min-w-0 font-mono">
              {scalperTabs
                .filter(tab => {
                  const isUS = /^[A-Z]/.test(tab.symbol);
                  if (marketType === 'US' ? !isUS : isUS) return false;
                  return (tab.holdingQty || 0) > 0
                    || (tab.gapInventory || []).some(sl => typeof sl === 'object' && (sl.quantity || 0) > 0)
                    || tab.lifecycleStatus === 'HOLDING' || tab.lifecycleStatus === 'SELL_READY' || tab.lifecycleStatus === 'SELLING';
                })
                .map(tab => {
                  const st = stocks.find(x => x.symbol === tab.symbol);
                  const name = (tab.name && tab.name !== tab.symbol) ? tab.name : getResolvedStockName(tab.symbol, st);
                  const price = (tab.price && tab.price > 0) ? tab.price : (st?.price || 0);
                  const slots = (tab.gapInventory || []).filter(sl => typeof sl === 'object' && sl.quantity > 0);
                  const kisQty = Number(holdings?.[tab.symbol] || 0);
                  const kisAvg = Number(avgPrices?.[tab.symbol] || 0);
                  const slotQty = slots.reduce((sum, sl) => sum + sl.quantity, 0);
                  const qty = kisQty > 0 && kisAvg > 0 ? kisQty : slotQty;
                  const avg = kisQty > 0 && kisAvg > 0 ? kisAvg : (slotQty > 0 ? slots.reduce((sum, sl) => sum + sl.price * sl.quantity, 0) / slotQty : 0);
                  const pnlPct = avg > 0 && price > 0 ? ((price - avg) / avg) * 100 : 0;
                  const pnlAmt = avg > 0 && price > 0 ? Math.round((price - avg) * qty) : 0;
                  const selling = tab.lifecycleStatus === 'SELL_READY' || tab.lifecycleStatus === 'SELLING';
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleSwitchTab(tab.id)}
                      className={cn(
                        "shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] cursor-pointer transition-colors",
                        selling
                          ? "border-fuchsia-500 bg-fuchsia-500/15 animate-pulse"
                          : "border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/20"
                      )}
                      title={`${name} — ${selling ? '매도 주문 중' : '보유 중'} · ${qty}주 · 평단 ${formatCurrency(avg)} · 평가손익(수수료·세금 전) ${pnlAmt.toLocaleString()}원`}
                    >
                      <span className="font-bold text-white">{name}</span>
                      {selling && <span className="font-black text-fuchsia-300">매도중</span>}
                      <span className="text-slate-400">슬롯 {Math.max(1, slots.length)}</span>
                      <span className="text-slate-200 tabular-nums">{avg > 0 ? formatCurrency(avg) : '-'}</span>
                      <span className={cn("font-black tabular-nums", pnlPct >= 0 ? "text-rose-400" : "text-sky-400")}>
                        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                      </span>
                    </button>
                  );
                })}
            </div>
            <div
              className="shrink-0 bg-black/30 px-2.5 py-1 rounded-lg border border-white/5 font-mono"
              title="KIS 계좌 주문가능현금(잔고 동기화·매수 직전 조회 시 갱신)"
            >
              <span className="text-[9px] text-slate-400 block font-sans">주문가능현금</span>
              <span className="font-bold text-amber-300 text-[11px]">{formatCurrency(orderableKrw)}</span>
            </div>
            {heldSymbols.length > 0 && (
              <div
                className="shrink-0 flex items-center gap-2.5 bg-black/30 px-2.5 py-1 rounded-lg border border-white/5 font-mono"
                title="보유 종목 실시간 총 평가금액 / 평가손익 합계"
              >
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">총 평가금액</span>
                  <span className="font-bold text-white text-[11px]">{formatCurrency(totalStockEval)}</span>
                </div>
                <div className="h-4 w-px bg-white/10" />
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">총 평가손익</span>
                  <span className={cn("font-bold text-[11px]", totalStockPnL >= 0 ? "text-rose-400" : "text-sky-400")}>
                    {totalStockPnL >= 0 ? "+" : ""}{formatCurrency(totalStockPnL)} ({totalStockPnLPct >= 0 ? "+" : ""}{totalStockPnLPct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowGlobalTradeLogModal(true)}
              className={cn(
                "shrink-0 flex items-center gap-1 h-6 px-2 rounded-md border border-white/10 bg-white/5 text-slate-300 text-[10px] font-bold hover:bg-white/10 hover:text-white transition-all cursor-pointer"
              )}
              title="전체 로그 — 전략센서 / 매수 / 매도 3개 탭으로 구분해서 확인"
            >
              <ScrollText className="w-3 h-3" />
              전체 로그
            </button>
            {onOpenStrategySettings && (
              <button
                type="button"
                onClick={onOpenStrategySettings}
                className="shrink-0 flex items-center gap-1 h-6 px-2 rounded-md border border-amber-300/30 bg-amber-400/10 text-amber-200 text-[10px] font-bold hover:bg-amber-400/20 hover:text-amber-100 transition-all cursor-pointer"
                title="매매 기준 설정 — 매수 차단·익절·손절·물타기·마감 매수·인벤토리 기준값을 직접 바꿉니다"
              >
                기준 설정
              </button>
            )}
            {/* 📊 신호 성과 분석 — 어떤 신호가 실제로 돈이 됐는지(수수료·세금 뺀 순손익 기준) */}
            <button
              type="button"
              onClick={() => setShowSignalPerf(true)}
              className="shrink-0 flex items-center gap-1 h-6 px-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] font-bold hover:bg-amber-500/20 hover:text-amber-200 transition-all cursor-pointer"
              title="신호 성과 분석 — 매수 순간 켜져 있던 신호별로 실제 순손익을 집계"
            >
              <BarChart3 className="w-3 h-3" />
              신호 성과
            </button>
            <SignalPerformanceModal isOpen={showSignalPerf} onClose={() => setShowSignalPerf(false)} rules={tradingRules} />
          </div>

          {(() => {
              // 📌 카드 정렬/배치 (2026-09-28 변경) — 넓은 화면(8열)에서는 왼쪽 5열 = 일반 종목(관망·매수시도중),
              // 6열 = 비움(구분 여백), 7~8열 = 매수완료(보유중·매도시도중) 종목으로 좌우 분리한다.
              // 좁은 화면에서는 보유 종목 묶음이 위, 일반 종목 묶음이 아래로 쌓인다.
              // 같은 그룹 안에서는 기존 등록 순서를 그대로 유지한다(안정 정렬), 일반 종목은 실시간 종목이 먼저.
              const realtimeSet = new Set(realtimeSymbols);
              const isHeld = (t: ScalperTab) =>
                (t.holdingQty || 0) > 0 ||
                (t.gapInventory || []).some(s => typeof s === 'object' && (s.quantity || 0) > 0) ||
                t.lifecycleStatus === 'HOLDING' || t.lifecycleStatus === 'SELL_READY' || t.lifecycleStatus === 'SELLING';
              const group = (t: ScalperTab) => (isHeld(t) ? 0 : realtimeSet.has(t.symbol) ? 1 : 2);
              const sortedTabs = scalperTabs
                .filter(tab => {
                  const isUS = /^[A-Z]/.test(tab.symbol);
                  return marketType === 'US' ? isUS : !isUS;
                })
                ; // (2026-10-05) 등록 순서 그대로 — 매수·매도 때 카드가 자리를 옮기지 않는다
              // (2026-09-28 재배치) 1~4열 일반 · 5열 비움 · 6열 매수완료(보유중) · 7열 비움 · 8열 매도시도중(매도주문 접수~체결 전)
              const isSelling = (t: ScalperTab) => t.lifecycleStatus === 'SELL_READY' || t.lifecycleStatus === 'SELLING';
              const sellingTabs = sortedTabs.filter(isSelling);
              const heldTabs = sortedTabs.filter(t => isHeld(t) && !isSelling(t));
              const otherTabs = sortedTabs.filter(t => !isHeld(t) && !isSelling(t));

              const renderCard = (tab: ScalperTab) => {
              const isSelected = tab.id === activeTabId;
              const tabStock = stocks.find(s => s.symbol === tab.symbol) || 
                               stocksCache.KR?.find(s => s.symbol === tab.symbol) ||
                               stocksCache.US?.find(s => s.symbol === tab.symbol) ||
                               INITIAL_STOCKS_KR.find(s => s.symbol === tab.symbol);
              const tabName = (tab.name && tab.name !== tab.symbol) ? tab.name : getResolvedStockName(tab.symbol, tabStock);
              // 가격은 반드시 symbol 기준 단일 출처(scalperInventory.market.currentPrice = tab.price)를 우선한다.
              // stocks 배열 조회(tabStock)는 아직 market 동기화가 반영되기 전 순간을 위한 보조 수단일 뿐이다.
              const tabPrice = (tab.price && tab.price > 0) ? tab.price : (tabStock?.price || 0);
              const isPriceLoading = tab.priceStatus === 'LOADING' && tabPrice <= 0;

              // 🎨 매매 상태(lifecycleStatus)에 따른 카드 테두리 색 — (2026-09-28) 테두리를 2px로 굵게 하고,
              // 서로 비슷해 헷갈리던 노랑(매수시도)/주황(매도시도)을 확실히 구분되는 색으로 바꿨다.
              //   관망중 = 회색 · 매수시도중 = 노랑 · 매수완료(보유중) = 초록 · 매도시도중 = 보라 · 매도완료 = 빨강(잠시 후 관망중으로 복귀)
              // 선택 여부(파란 링)와는 별개로 항상 표시해서 두 정보를 동시에 보여준다.
              const lifecycleBorderCls =
                tab.lifecycleStatus === 'HOLDING' ? "border-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.35)]"
                : (tab.lifecycleStatus === 'BUY_READY' || tab.lifecycleStatus === 'BUYING') ? "border-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.35)]"
                : (tab.lifecycleStatus === 'SELL_READY' || tab.lifecycleStatus === 'SELLING') ? "border-fuchsia-500 shadow-[0_0_6px_rgba(217,70,239,0.35)]"
                : tab.lifecycleStatus === 'COMPLETED' ? "border-rose-500"
                : "border-white/10"; // WATCHING 등 기본 — 회색 테두리

              return (
                <div
                  key={tab.id}
                  onClick={() => handleSwitchTab(tab.id)}
                  onDoubleClick={() => onOpenChart?.(tab.symbol, tabName)}
                  className={cn(
                    "relative px-1.5 py-1 rounded-lg border-2 flex flex-col gap-0.5 cursor-pointer transition-all w-full text-left min-w-0 font-mono select-none group",
                    lifecycleBorderCls,
                    isSelected
                      ? "bg-sleek-blue/25 text-white shadow-md font-black ring-1 ring-sleek-blue/60"
                      : "bg-black/50 hover:bg-white/10 text-slate-300 hover:text-white"
                  )}
                  title={`${tabName} (${tab.symbol}) — 더블클릭하면 일봉 차트`}
                >
                {/* 🎯 센서 반짝임 — key가 바뀔 때마다(활성 센서 개수가 늘어날 때마다) 이 엘리먼트가
                    remount되어 sensorFlash 애니메이션이 처음부터 재생된다. pointer-events-none이라
                    카드 클릭/버튼 동작을 방해하지 않는다. */}
                {(flashKeys[tab.symbol] || 0) > 0 && (
                  <div
                    key={`flash-${tab.symbol}-${flashKeys[tab.symbol]}`}
                    className="absolute inset-0 rounded-xl pointer-events-none sensor-flash-ring"
                  />
                )}
                {/* ✕ 닫기 버튼 — 카드 우측 상단 고정 */}
                <button
                  type="button"
                  onClick={(e) => closeScalperTab(tab.id, e)}
                  className="absolute top-0.5 right-0.5 z-10 p-0.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                  title={`${tabName} 탭 닫기`}
                >
                  <X className="w-3 h-3" />
                </button>

                <div className="flex flex-col gap-0.5 w-full">
                  {/* 1줄: 종목명(종목코드) → 현재 체결가 — 요청에 따라 이름 옆에 실시간 체결가를 바로 붙임 */}
                  <div className="flex items-center gap-1 min-w-0 w-full group-hover:pr-4">
                    {/* 🟢 상태 LED — 예전 'ON' 배지를 없애고 이 원형 LED 하나로 통합했다.
                        보유중(HOLDING)=호박색 / 스캘핑 작동중=녹색 / 대기=회색.
                        작동중일 때만 아주 약한 pulse(led-soft-pulse, index.css)를 준다. */}
                    <span
                      className={cn(
                        "inline-block w-2.5 h-2.5 rounded-full shrink-0 transition-colors",
                        tab.lifecycleStatus === 'HOLDING'
                          ? "bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.6)]"
                          : tab.isBotActive
                            ? "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.6)]"
                            : "bg-slate-600",
                        tab.isBotActive && "led-soft-pulse"
                      )}
                      title={
                        tab.lifecycleStatus === 'HOLDING'
                          ? (tab.isBotActive ? '보유 중 · 스캘핑 작동 중' : '보유 중 · 대기')
                          : (tab.isBotActive ? '스캘핑 작동 중' : '대기 중')
                      }
                    />
                    {/* 🏷️ (2026-10-07) 매수 경로 표시 — 보유 중일 때만: 마(마감 매수) · 추(추세 매수) · S(스캘핑) */}
                    {(() => {
                      const kind = buyKindOf?.(tab.symbol);
                      if (!kind) return null;
                      const m = kind === 'CLOSE' ? { t: '마', c: 'border-violet-300/70 bg-violet-500/25 text-violet-100', d: '마감 매수로 산 종목' }
                        : kind === 'TREND' ? { t: '추', c: 'border-cyan-300/70 bg-cyan-500/25 text-cyan-100', d: '추세 매수로 산 종목' }
                        : { t: 'S', c: 'border-amber-300/70 bg-amber-500/25 text-amber-100', d: '스캘핑 신호로 산 종목' };
                      return <span title={m.d} className={cn("inline-flex items-center justify-center w-[15px] h-[15px] rounded-full border text-[9px] leading-none font-black shrink-0 font-sans", m.c)}>{m.t}</span>;
                    })()}
                    <span className="font-bold text-xs truncate text-white min-w-0">{tabName}</span>
                    {/* 등락률 — 종목명 바로 오른쪽 (2026-10-05: 2줄을 없애고 1줄로 올림) */}
                    <span className={cn(
                      "text-[10px] font-bold shrink-0 tabular-nums",
                      (tab.changePercent || 0) >= 0 ? "text-rose-400" : "text-sky-400"
                    )}>
                      {(tab.changePercent || 0) >= 0 ? '+' : ''}{(tab.changePercent || 0).toFixed(2)}%
                    </span>
                    {isPriceLoading ? (
                      <span className="text-[11px] font-bold text-slate-400 animate-pulse shrink-0 ml-auto">연결 중...</span>
                    ) : (
                      <span className="font-black font-mono text-rose-500 tabular-nums text-xs shrink-0 ml-auto">
                        {formatCurrency(tabPrice)}
                      </span>
                    )}
                  </div>

                  {/* (구) 3줄 'ON' 배지 줄은 삭제 — 봇 상태는 1줄 종목명 앞 상태 LED로 통합해
                      카드 높이를 한 줄만큼 줄였다. (수량 드롭다운도 이전에 이미 삭제됨) */}
                </div>

                {/* 🎯 종목별 센서 LED — 동그라미 안 한 글자 코드. 센서마다 고유 색을 갖고, 켜지면(감지)
                    그 색으로 불이 들어오고 꺼지면 회색. 순서: P B C V E Q A D (가운데 정렬)
                    P 눌림목 · B 돌파 · C CVD(매수우위) · V VWAP 지지 · E 체결강도 130+ ·
                    Q 거래량 모멘텀 · A 매도호가 소진 · D 매수호가 우세
                    (R RSI는 2026-09-29 보유수량 줄 오른쪽 끝으로 이동) */}
                {(() => {
                  const cvdVal = ( (tabStock as any)?.cumulativeCvd ?? (tabStock as any)?.realCvd ?? 0 ) as number;
                  const execStrength = tabStock?.executionStrength;
                  const ob = orderbookSignals?.[tab.symbol];
                  const leds: { code: string; label: string; on: boolean; detail: string; onCls: string }[] = [
                    { code: 'P', label: '눌림목', on: tab.sensors?.pullback === true, detail: '',
                      onCls: 'bg-teal-500/25 text-teal-200 border-teal-400/70 shadow-[0_0_6px_rgba(45,212,191,0.55)]' },
                    { code: 'B', label: '돌파', on: tab.sensors?.breakout === true, detail: '',
                      onCls: 'bg-amber-500/25 text-amber-200 border-amber-400/70 shadow-[0_0_6px_rgba(251,191,36,0.55)]' },
                    { code: 'C', label: 'CVD', on: typeof cvdVal === 'number' && cvdVal > 0,
                      detail: typeof cvdVal === 'number' ? `누적 ${cvdVal.toLocaleString()} (${cvdVal > 0 ? '매수우위' : cvdVal < 0 ? '매도우위' : '균형'})` : '데이터 대기 중',
                      onCls: 'bg-rose-500/25 text-rose-200 border-rose-400/70 shadow-[0_0_6px_rgba(251,113,133,0.55)]' },
                    { code: 'V', label: 'VWAP 지지', on: tab.sensors?.vwap === true, detail: '',
                      onCls: 'bg-indigo-500/25 text-indigo-200 border-indigo-400/70 shadow-[0_0_6px_rgba(129,140,248,0.55)]' },
                    { code: 'E', label: '체결강도', on: typeof execStrength === 'number' && execStrength >= 130,
                      detail: typeof execStrength === 'number' && execStrength > 0 ? `${execStrength.toFixed(1)} (130 이상 점등)` : '데이터 대기 중',
                      onCls: 'bg-orange-500/25 text-orange-200 border-orange-400/70 shadow-[0_0_6px_rgba(251,146,60,0.55)]' },
                    { code: 'Q', label: '거래량', on: tab.sensors?.volumeMomentum === true, detail: '거래량 모멘텀',
                      onCls: 'bg-lime-500/25 text-lime-200 border-lime-400/70 shadow-[0_0_6px_rgba(163,230,53,0.55)]' },
                    { code: 'A', label: '매도호가 소진', on: ob?.askDepletion === true, detail: '매도잔량 급감(20초 내) 또는 매수/매도 총잔량 3배 이상',
                      onCls: 'bg-fuchsia-500/25 text-fuchsia-200 border-fuchsia-400/70 shadow-[0_0_6px_rgba(232,121,249,0.55)]' },
                    { code: 'D', label: '매수호가 우세', on: ob?.bidDominant === true,
                      detail: typeof ob?.bidAskRatio === 'number' ? `매수/매도 잔량 ${Math.round(ob.bidAskRatio)}% (130% 이상 점등)` : '호가 데이터 대기 중',
                      onCls: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/70 shadow-[0_0_6px_rgba(52,211,153,0.55)]' },
                  ];
                  // (2026-10-05) 2줄 카드 — 센서 8개 + 맨 오른쪽 R(RSI 값). RSI가 3자리(100)여도 줄이 바뀌지 않도록
                  // 원을 16px로 줄이고 값 칸 너비를 3자리로 고정했다(줄바꿈 없음).
                  const rsiVal = tab.sensors ? Math.round(tab.sensors.rsi) : undefined;
                  const rsiOn = rsiVal !== undefined && rsiVal >= 45 && rsiVal <= 70;
                  const ledCls = "w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-black leading-none shrink-0 transition-all";
                  return (
                    <div className="flex items-center gap-[2px] flex-nowrap w-full min-w-0 overflow-hidden">
                      {leds.map(led => (
                        <span
                          key={led.code}
                          className={cn(ledCls, led.on ? led.onCls : "bg-white/5 text-slate-600 border-white/10")}
                          title={`${tabName} — ${led.label} ${led.on ? '감지됨' : '대기 중'}${led.detail ? ` · ${led.detail}` : ''}`}
                        >
                          {led.code}
                        </span>
                      ))}
                      <span
                        className="ml-auto flex items-center gap-[2px] shrink-0"
                        title={`${tabName} — RSI ${rsiOn ? '감지됨' : '대기 중'} · ${rsiVal !== undefined ? `${rsiVal} (45~70 적정구간 점등)` : '데이터 대기 중'}`}
                      >
                        <span className={cn(ledCls, rsiOn ? 'bg-sky-500/25 text-sky-200 border-sky-400/70 shadow-[0_0_6px_rgba(56,189,248,0.55)]' : "bg-white/5 text-slate-600 border-white/10")}>R</span>
                        <span className={cn("w-[20px] text-right text-[10px] font-bold tabular-nums", rsiOn ? "text-sky-300" : "text-slate-400")}>
                          {rsiVal ?? '-'}
                        </span>
                      </span>
                    </div>
                  );
                })()}

                {/* (2026-10-05) 슬롯·평단·평가손익 줄은 카드에서 빼고 상단 '보유' 줄(주문가능현금 왼쪽)로 옮겼다 */}

                {/* 🛟 슬롯3 방어 상태 — 대기 중이면 남은 시간, 체결되면 표시 */}
                {(() => {
                  const rv = (rescueView as Record<string, { phase: string; openedAt: number }>)[tab.symbol];
                  if (!rv || rv.phase === 'EXPIRED') return null;
                  if (rv.phase === 'FILLED') {
                    return <div className="pl-3.5 text-[11px] font-bold text-sky-300">🛟 슬롯3 체결 — 새 평단 기준 관리</div>;
                  }
                  const left = Math.max(0, rescueWaitMs - (Date.now() - rv.openedAt));
                  const mm = Math.floor(left / 60000);
                  const ss = Math.floor((left % 60000) / 1000);
                  return (
                    <div className="pl-3.5 text-[11px] font-bold text-amber-300" title="손절선에 닿아 손절 대신 추가 매수 신호를 기다리는 중 — 시간이 지나도 신호가 없으면 손절, 처음 평단 대비 -1.2%면 즉시 손절">
                      🛟 슬롯3 대기 {mm}:{String(ss).padStart(2, '0')}
                    </div>
                  );
                })()}

                {/* 📜 (구) 종목별 개별 로그창은 인벤토리 카드에서 삭제 — 전략센서/매수/매도 로그는
                    상단 [전체 로그] 버튼(GlobalTradeLogModal)의 3개 탭에서 확인한다. */}
                </div>
              );
              };

              return (
                <div className="max-h-[960px] overflow-y-auto custom-scrollbar pr-0.5 py-0.5">
                  {/* (2026-10-05) 전체 폭 8열 — 매수완료·매도중 칸을 없애고 모든 종목을 등록 순서대로 한 격자에 둔다.
                      보유·매도중 종목은 카드 테두리 색(초록·보라)과 상단 '보유' 줄로 구분한다. */}
                  <div className="text-[11px] font-bold text-slate-400 px-0.5 pb-0.5">인벤토리 {sortedTabs.length}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1 items-start">
                    {sortedTabs.map(tab => renderCard(tab))}
                  </div>
                </div>
              );
          })()}
        </div>

      {/* 4번째 반응형 창 — START AI SCALPER */}
        {/* 5-1. START AI SCALPER 버튼 (왼쪽) */}
        <div className="w-full">
          <button 
            type="button"
            onClick={() => {
              // 🛡️ 예전에는 여기서 gapBuyPrice/gapSellPrice(하한가/상한가)가 0이면 시작을 막았는데,
              // 이 값들을 수동으로 설정하는 UI가 이미 없어졌고(고급설정 패널 삭제), 실제 매매
              // 엔진은 이 값이 없으면 calculateStockLimits()로 당일 상/하한가를 자동 계산하는
              // 폴백을 이미 갖고 있다. 그런데도 이 검증이 남아있어서, 값이 아직 채워지기 전
              // 타이밍에 START를 누르면 조용히 막히면서 "수량이 되돌아가고 비활성화되는" 것처럼
              // 보이는 원인이 되었다. 더 이상 필요 없는 검증이라 제거한다.
              if (!isGapBotActive) {
                setLastTradeType(null);
              }
              setIsGapBotActive(!isGapBotActive);
            }}
            title="현재 선택된 종목의 개별 스캘퍼 시작/정지"
            className={cn(
              "w-full py-2 px-3 rounded-xl font-black text-xs italic tracking-tight uppercase shadow-lg transition-all flex items-center justify-center gap-1.5 border cursor-pointer",
              isGapBotActive 
                ? "bg-gradient-to-br from-rose-600 to-red-800 text-white border-rose-500/50 hover:scale-[1.02] active:scale-95" 
                : "bg-gradient-to-br from-sleek-blue to-indigo-700 text-white border-sleek-blue/50 hover:scale-[1.02] active:scale-95"
            )}
          >
            {isGapBotActive ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current animate-pulse text-white" />
                <span>SCALPER STOP</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current text-white" />
                <span>START AI SCALPER</span>
              </>
            )}
          </button>
        </div>


      {/* ─────────────────────────────────────────────────────────────
          3행: 핵심 스캘퍼 5열 종합 제어 대시보드
          (1회거래수량/슬롯/순익, SMART SCALPER, 호가창, 종목관리/추천, START 버튼)
          ───────────────────────────────────────────────────────────── */}

      </div>
      {/* ─────────────────────────────────────────────────────────────
          (구) 4행: 보유 주식 현황창 — 삭제(2026-09-28). 총 평가금액/총 평가손익 합계는
          위쪽 [전체 로그] 버튼 왼쪽으로 이동했고, 종목별 상세는 위 스캘퍼 인벤토리 카드
          (보유중인 종목은 항상 카드 정렬 맨 앞쪽에 위치)와 [전체 로그]에서 계속 확인 가능하다.
          ───────────────────────────────────────────────────────────── */}
      {false && (
      <div className="bg-slate-950/60 border border-slate-700/80 rounded-2xl p-3.5 sm:p-4 shadow-xl space-y-3 relative overflow-hidden text-white backdrop-blur-md">

        {/* Header with Totals */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Briefcase className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white tracking-tight">보유 주식 현황</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {heldSymbols.length}개 종목 보유 중
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                실시간 체결 내역 및 KIS 연동 보유 주식 평가 현황
              </p>
            </div>
          </div>

          {heldSymbols.length > 0 && (
            <div className="flex items-center gap-3 bg-slate-900/80 px-3 py-1 rounded-2xl border border-slate-800 text-xs font-mono">
              <div>
                <span className="text-[9px] text-slate-400 block font-sans">총 평가금액</span>
                <span className="font-bold text-white text-xs sm:text-sm">{formatCurrency(totalStockEval)}</span>
              </div>
              <div className="h-5 w-px bg-slate-800" />
              <div>
                <span className="text-[9px] text-slate-400 block font-sans">총 평가손익</span>
                <span className={cn("font-bold flex items-center gap-0.5 text-xs sm:text-sm", totalStockPnL >= 0 ? "text-rose-400" : "text-sky-400")}>
                  {totalStockPnL >= 0 ? "+" : ""}{formatCurrency(totalStockPnL)} ({totalStockPnLPct >= 0 ? "+" : ""}{totalStockPnLPct.toFixed(2)}%)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Stock Cards / List or Empty State */}
        {heldSymbols.length === 0 ? (
          <div className="py-5 px-3 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800/80 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center">
              <Coins className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-300">현재 보유 중인 주식이 없습니다.</p>
              <p className="text-[10.5px] text-slate-500 mt-0.5">
                스캘퍼 자동 매매가 실행되거나 매수 시 실시간으로 표시됩니다.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowScalperRecModal(true);
                  handleRefreshScalperRecList();
                }}
                className="px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>추천종목 찾기</span>
              </button>
              <button
                type="button"
                onClick={handleSyncKIS}
                className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                <span>잔고 동기화</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 overflow-y-auto max-h-[280px] custom-scrollbar pr-1">
            {heldSymbols.map(sym => {
              const qty = holdings[sym] || 0;
              const avgP = avgPrices[sym] || 0;
              const st = stocks.find(s => s.symbol === sym) || INITIAL_STOCKS_KR.find(s => s.symbol === sym);
              const currentP = st?.price || avgP;
              const evalAmt = currentP * qty;
              const pnlAmt = (currentP - avgP) * qty;
              const pnlPct = avgP > 0 ? ((currentP - avgP) / avgP) * 100 : 0;
              const isProfit = pnlAmt >= 0;
              const displayName = getResolvedStockName(sym, st);

              return (
                <div 
                  key={sym} 
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 p-2.5 rounded-2xl flex flex-col justify-between gap-2 transition-all shadow-sm group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs sm:text-[13px] text-white truncate group-hover:text-blue-400 transition-colors">
                          {displayName}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                          {sym}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {qty.toLocaleString()}주 · 평단 {formatCurrency(avgP)}
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono">
                      <div className={cn("text-xs font-bold", isProfit ? "text-rose-400" : "text-sky-400")}>
                        {isProfit ? "+" : ""}{formatCurrency(pnlAmt)}
                      </div>
                      <div className={cn("text-[9.5px]", isProfit ? "text-rose-400/80" : "text-sky-400/80")}>
                        {isProfit ? "+" : ""}{pnlPct.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/60 font-mono text-[10.5px]">
                    <span className="text-slate-400">평가 {formatCurrency(evalAmt)}</span>
                    <div className="flex items-center gap-1 font-sans">
                      <button
                        type="button"
                        onClick={() => {
                          if (st) {
                            openOrSwitchScalperTab(st.symbol, st.name);
                          }
                        }}
                        className="px-2 py-0.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[10px] font-bold transition-all cursor-pointer"
                        title="스캘퍼 매매 탭으로 이동"
                      >
                        스캘퍼
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (st) {
                            setManualSellStock(st);
                            setManualSellQty(qty);
                            setManualSellPrice(currentP);
                            setManualSellModalOpen(true);
                          }
                        }}
                        className="px-2 py-0.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold transition-all cursor-pointer"
                        title="수동 지정가 매도"
                      >
                        매도
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

    </div>
  );
};
