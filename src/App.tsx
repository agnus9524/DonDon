/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown,
  BarChart3, 
  Activity, 
  Wallet, 
  Search, 
  ArrowUpRight, 
  ArrowDownRight, 
  Bell, 
  User, 
  CircleDollarSign,
  Briefcase,
  Zap,
  Clock,
  Play,
  Square,
  Bot,
  Newspaper,
  ChevronRight,
  ChevronDown,
  Loader2,
  Settings,
  Users,
  ShieldCheck,
  Calendar,
  RefreshCw,
  Edit2,
  Key,
  Lock,
  Plus,
  Copy,
  Check,
  CheckCircle2,
  PauseCircle,
  Info,
  Globe,
  Landmark,
  Sparkles,
  MousePointer2,
  CreditCard,
  Download,
  FileSpreadsheet,
  X,
  ArrowDown,
  Target,
  LineChart,
  BrainCircuit,
  Compass,
  Trophy,
  Eye,
  EyeOff,
  Layers,
  Percent,
  ShieldAlert,
  Trash2,
  PieChart,
  Calculator,
  Coins,
  HelpCircle,
  BookOpen,
  LogOut,
  Flame
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar,
  Cell,
  AreaChart,
  Area,
  ReferenceLine,
  ReferenceDot,
  Label,
  ComposedChart,
  Line
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import axios from 'axios';
import { kisService, type ScalperRecommendation, MAX_SCALPER_RECOMMENDATIONS, setMaxScalperRecommendations, effectiveKisAccountCount, type KisRealtimeHandle, type RecommendationDetail, type KisRealtimeStatus, getTickFieldCheck, getKnownMarket } from './services/kisService';
import { applyClosePrices, saveBlobToFolder, getSignalsForDate, recordSignal, canRecordSignal, onSignalTick, sweepSignals, restoreOpenSignals, loadSavedFolder, saveDayCsv, kstDateKey, setSignalTradeCase, saveCsvToFolder, type SignalKind } from './services/signalStore';
// 🗂️ (2026-10-04) 거래 케이스 — 신호 → 주문 → 체결 → 보유 → 청산을 tradeCaseId 하나로 묶는다
import { noteCaseRoute, initTradeCases, setCaseSnapshotProvider, onCaseSignal, noteCaseNoOrder, onCaseBuyOrder, onCaseBuyCancelled, onCaseBuyFill, onCaseSellOrder, onCaseSellFill, setCaseExitPlan, closeCaseUnknown, onCaseTick, sweepTradeCases, reconcileOpenCases, getCaseRows, caseRowsToCsv, checkCaseJournalConsistency } from './services/tradeCaseStore';
import { initJournalStorage, getJournal, exportClosedTradesCsv } from './services/tradeJournal';
import { selfOptimizationEngine, getLiveParams, liquidityTierOf, minExecOfTier, minTicksOfTier, watchExecOfTier, watchTicksOfTier, sellTargetOfTier, sellStopOfTier, LIQUIDITY_TIER_LABEL, type LiquidityTier, getLiveVersion, subscribeStrategy } from './services/selfOptimizationEngine';
import { calculateBullBear, evaluatePosition, type BullBearParams } from './services/bullBear';
import { archiveTick, deleteOldTicks, countTicks } from './services/tickArchiveService';
import { recordBuyFill, recordSellFill, recordCloseDecision, updateCloseDecision, recordMissedSignal, updateMissedSignal, recordOrderOutcome, hasOpenLots, getOpenLotQty, dropOpenLots, recordShadowExit, getOldestOpenLotTime, type EntrySignals } from './services/tradeJournal';
import { generateGapDownReport } from './services/geminiService';
import ScalperGuide from './components/ScalperGuide';
import ScalperRecommendationsModal from './components/ScalperRecommendationsModal';
import { GlobalTradeLogModal } from './components/GlobalTradeLogModal';
import { StrategySettingsModal } from './components/StrategySettingsModal';
import { DailyChartModal } from './components/DailyChartModal';
import { buildChartSvg, svgToPngBlob } from './services/chartImage';
import { getCloseSnap, getCloseSnapDates, upsertCloseSnap, closeSnapToCsv, type CloseSnapRow } from './services/closeSnapStore';
import { addPanelRows, getPanelRows, getRecentPanel, detectTrend, panelToCsv, restorePanel, type PanelRow } from './services/panelStore';
import { KisConfigModal } from './components/KisConfigModal';
import { LiveNewsAlerts } from './components/LiveNewsAlerts';
import { AdminPanelModal } from './components/AdminPanelModal';
import { KisStartupVerification, type StepItem } from './components/KisStartupVerification';
import { IntegratedTradingHeader } from './components/IntegratedTradingHeader';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  signInAnonymously,
  checkLicense, 
  getAllLicenses, 
  updateLicense,
  deleteLicense,
  deleteAuthKeyDoc,
  generateAuthKey,
  activateLicenseWithKey,
  getAllAuthKeys,
  loginWithKey,
  saveUserKISConfig,
  saveUserKisExtraAccounts,
  getUserSettings,
  saveUserHoldings,
  saveUserKISToken,
  db
} from './services/firebaseService';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { StrategyPanel } from './components/StrategyPanel';
// 📼 (2026-10-04) 틱 리플레이 — 저장된 틱 아카이브를 재생해 대시보드로 보여준다
import { POPULAR_STOCKS, type StockSuggestion } from './constants/stockList';
import { KOSPI_STOCKS, ALL_KRX_MASTER_STOCKS, searchKrMasterStocks, type MasterStock } from './constants/kospiMaster';


// --- Types & Mock Data ---

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}


// ============================================================
// 🔄 종목별 매매 라이프사이클 상태 머신
// WATCHING → BUY_READY → BUYING → HOLDING → SELL_READY → SELLING → COMPLETED(→WATCHING) / ERROR
// ============================================================
export type ScalperLifecycleStatus =
  | 'WATCHING'    // 추천/등록 완료, 전략 센서 감시 중
  | 'BUY_READY'   // 전략센서 조건 충족, 매수 주문 준비
  | 'BUYING'      // 매수 주문 전송/체결 대기
  | 'HOLDING'     // 매수 체결 완료, 보유 중
  | 'SELL_READY'  // 매도 조건 발생, 매도 주문 준비
  | 'SELLING'     // 매도 주문 전송/체결 대기
  | 'COMPLETED'   // 매도 체결 완료 (이후 다시 WATCHING으로 순환)
  | 'ERROR';      // 주문/체결 처리 중 오류 발생

// 파생 뷰(=기존 엔진 루프/컴포넌트가 그대로 참조하는 flat 형태). 저장 자체는 ScalperInventoryItem.
export interface ScalperTab {
  id: string; // symbol e.g., '073240' or '001520'
  symbol: string;
  name: string;
  price?: number;
  isBotActive: boolean;
  gapBuyPrice: number;
  gapSellPrice: number;
  tradeQuantity: number;
  maxSlots: number;
  gapInventory: { id: string; price: number; quantity: number; symbol?: string }[];
  gapTradingProfit: number;
  gapTradeCount: number;
  lastTradeType: 'BUY' | 'SELL' | null;
  scalperMessage: string;
  entryPriceMode: 'CURRENT' | 'BID1' | 'BID2' | 'BID3' | 'BID4';
  autoCancelThreshold: number;
  tradeLogs?: TradeLog[];
  lifecycleStatus?: ScalperLifecycleStatus;
  priceStatus?: 'LOADING' | 'LIVE';
  holdingQty?: number;
  orderableQty?: number;
  changePercent?: number;
  sensors?: {
    pullback: boolean;
    breakout: boolean;
    vwap: boolean;
    cvd: boolean;
    shortTermMomentum: boolean;
    volumeMomentum: boolean;
    rsi: number;
    activeCount: number;
    lastUpdatedAt: number;
  };
}

// ============================================================
// 🏗️ SCALPER INVENTORY — 종목 하나당 하나의 레코드, 관심사별로 완전히 분리된 네임스페이스
// ------------------------------------------------------------
// "추천 당시 스냅샷"과 "지금 이 순간의 데이터"는 절대 같은 필드에 있으면 안 된다는 원칙에 따라
// recommendation(불변 스냅샷) / market·account·sensors·status(계속 갱신되는 실시간 데이터)를
// 최상위가 아닌 네임스페이스 단위로 분리한다. 각 실시간 네임스페이스는 자기 lastUpdatedAt을 가져서
// "이 값이 언제 마지막으로 갱신됐는지"를 항상 알 수 있다.
//
// ScalperTab은 이 구조를 기존 엔진 루프/컴포넌트가 쓰는 flat 필드명으로 펼친 "읽기 전용 파생 뷰"다
// (아래 useMemo 참고). 저장은 여기(ScalperInventoryItem)에서만 하고, 절대 ScalperTab에 직접 쓰지 않는다.
// ============================================================

export interface ScalperPosition {
  id: string;
  price: number;
  quantity: number;
  symbol?: string;
}

export interface ScalperInventoryItem {
  id: string;            // = symbol
  symbol: string;
  name: string;
  registeredAt: number;

  // 추천 당시 스냅샷 — 등록 이후 절대 갱신되지 않는다
  recommendation: {
    score: number;
    grade: string;
    price: number;
    reason: string;
    tags: string[];
    category: string; // 눌림목/돌파/VWAP/CVD 등
  };

  // 실시간 시장 데이터 — 시세 폴링이 갱신
  market: {
    currentPrice: number;
    prevClose: number;
    change: number;
    changePercent: number;
    volume: string;
    priceStatus: 'LOADING' | 'LIVE'; // KIS로부터 실제 현재가를 한 번이라도 받으면 LIVE로 전환, 그 전까지는 LOADING
    lastUpdatedAt: number;
  };

  // 계좌/포지션 데이터 — 체결/KIS 동기화가 갱신
  account: {
    holdingQty: number;
    orderableQty: number;
    avgPrice: number;
    evaluationAmount: number;
    positions: ScalperPosition[]; // 실시간 보유 포지션 슬롯
    realizedProfit: number;
    tradeCount: number;
    lastTradeType: 'BUY' | 'SELL' | null;
    lastUpdatedAt: number;
  };

  // 전략 센서 — 스캘핑 엔진 루프가 매 틱마다 갱신
  sensors: {
    pullback: boolean;
    breakout: boolean;
    vwap: boolean;
    cvd: boolean; // 🚧 향후 진짜 CVD(매수체결량-매도체결량 누적) 구현 전까지는 UI에 노출하지 않음
    shortTermMomentum: boolean; // 단기 모멘텀 — SMA5 > SMA20 (구 'CVD' 배지가 담당하던 자리를 대체)
    volumeMomentum: boolean;
    rsi: number;
    activeCount: number;
    lastUpdatedAt: number;
  };

  // 전략 설정(봇 파라미터) — 사용자가 조정, 시세/체결로는 절대 갱신되지 않음
  strategy: {
    isBotActive: boolean;
    gapBuyPrice: number;
    gapSellPrice: number;
    tradeQuantity: number;
    maxSlots: number;
    entryPriceMode: 'CURRENT' | 'BID1' | 'BID2' | 'BID3' | 'BID4';
    autoCancelThreshold: number;
  };

  // 시스템(매매 라이프사이클) 상태
  status: {
    state: ScalperLifecycleStatus;
    message: string;
    lastUpdatedAt: number;
  };

  tradeLogs: TradeLog[];
}

const createInventoryItem = (params: {
  symbol: string;
  name: string;
  price: number; // 현재가 스냅샷 — market.currentPrice의 초기값으로만 사용
  recommendedPrice?: number; // 추천 당시 고정 가격. 미지정 시(수동 등록 등)에만 price로 대체
  recommendation?: { score?: number; grade?: string; reason?: string; tags?: string[]; category?: string };
  strategy?: Partial<ScalperInventoryItem['strategy']>;
  initialLifecycleStatus?: ScalperLifecycleStatus;
}): ScalperInventoryItem => {
  const now = Date.now();
  return {
    id: params.symbol,
    symbol: params.symbol,
    name: params.name,
    registeredAt: now,
    recommendation: {
      score: params.recommendation?.score ?? 0,
      grade: params.recommendation?.grade ?? '-',
      price: params.recommendedPrice ?? params.price, // 추천 당시 가격 스냅샷 — 이후 절대 재할당되지 않음
      reason: params.recommendation?.reason ?? '수동 등록',
      tags: params.recommendation?.tags ?? [],
      category: params.recommendation?.category ?? '수동 등록'
    },
    market: {
      currentPrice: params.price,
      prevClose: params.price,
      change: 0,
      changePercent: 0,
      volume: '0',
      priceStatus: 'LOADING',
      lastUpdatedAt: now
    },
    account: {
      holdingQty: 0,
      orderableQty: 0,
      avgPrice: 0,
      evaluationAmount: 0,
      positions: [],
      realizedProfit: 0,
      tradeCount: 0,
      lastTradeType: null,
      lastUpdatedAt: now
    },
    sensors: {
      pullback: false,
      breakout: false,
      vwap: false,
      cvd: false,
      shortTermMomentum: false,
      volumeMomentum: false,
      rsi: 50,
      activeCount: 0,
      lastUpdatedAt: now
    },
    strategy: {
      isBotActive: params.strategy?.isBotActive ?? true, // 🤖 등록되면 기본적으로 즉시 매매 시작 (완전자동 관리 취지)
      gapBuyPrice: params.strategy?.gapBuyPrice ?? 0,
      gapSellPrice: params.strategy?.gapSellPrice ?? 0,
      tradeQuantity: params.strategy?.tradeQuantity ?? 1,
      maxSlots: params.strategy?.maxSlots ?? 10,
      entryPriceMode: params.strategy?.entryPriceMode ?? 'BID1',
      autoCancelThreshold: params.strategy?.autoCancelThreshold ?? 0.2
    },
    status: {
      state: params.initialLifecycleStatus ?? 'WATCHING',
      message: '대기 중...',
      lastUpdatedAt: now
    },
    tradeLogs: []
  };
};

interface Stock {
  symbol: string;
  name: string;
  price: number;
  basePrice?: number;
  change: number;
  changePercent: number;
  volume: string;
  history: { time: string; price: number; timestamp?: number }[];
  market: 'KR' | 'US';
  isAI?: boolean;
  momentum?: number; // 0-100 score
  sentiment?: number; // -1 to 1 score
  pattern?: string; // e.g. "Double Bottom", "Cup and Handle"
  executionStrength?: number; // 실제 체결강도(KIS cttr) — 매수체결량/매도체결량 기반. 호가잔량 비율이 아님
  realCvd?: number; // 🎯 진짜 CVD — 매수체결량 누적 - 매도체결량 누적(H0STCNT0 필드 기반, 정확한 인덱스는 진단 로그로 검증 필요)
  cumulativeCvd?: number;
  cvdDelta?: number;
  tradingValue?: number; // 🎯 실제 거래대금(KIS acml_tr_pbmn) — 있으면 추천 카드에서 하드코딩 대신 이 값을 그대로 표시
  isPlaceholderData?: boolean; // ⚠️ 하드코딩된 가짜/플레이스홀더 데이터 여부 — true면 가격/등락률/history가 전부 임의값이며 실제 KIS 시세가 아님. 실시간 조회(getPrice 등)로 실제 데이터를 받으면 반드시 false/undefined로 갱신되어야 함
  isRealTime?: boolean; // 실제 KIS(웹소켓 틱 또는 REST)로부터 받은 실시간 데이터인지 여부
  lastUpdated?: string; // 마지막으로 실시간 갱신된 시각(표시용)
}

// 🕘 한국 정규장(평일 09:00~15:30 KST) 여부 판단.
// 서버/브라우저가 어느 타임존에서 돌아가든 항상 정확한 한국시간 기준으로 판단하기 위해
// Intl.DateTimeFormat으로 KST 요일/시/분을 직접 계산한다 (new Date().getHours() 등은 로컬
// 타임존에 좌우되어 배포 환경에 따라 틀릴 수 있다).
// 🕘 한국 정규장(평일 09:00~15:30 KST) + 2026-09-14부터 신설되는 KRX 애프터마켓(16:00~20:00) 여부 판단.
// 서버/브라우저가 어느 타임존에서 돌아가든 항상 정확한 한국시간 기준으로 판단하기 위해
// Intl.DateTimeFormat으로 KST 요일/시/분/날짜를 직접 계산한다.
//
// [2026.09.08 공지 반영] KRX 거래시간 확대 및 NXT 제도 변경(9/14 시행):
//   - 정규장: 09:00~15:20, 종가단일가 15:20~15:30 (기존과 동일, 안 바뀜)
//   - 15:30~16:00: 장후 시간외종가 구간 — 이 시간엔 실질적인 스캘핑 거래가 의미 없어 휴장으로 취급
//   - 16:00~20:00: KRX 애프터마켓 신설(9/14부터) — NXT는 기존에도 있었으나 KRX는 이번에 새로 생김
//   - ⚠️ 주의: KRX는 정규장 마감 후 미체결 주문이 자동 취소된다. 즉 정규장에서 애프터마켓으로
//     넘어갈 때 이전 미체결 주문은 이미 사라진 것으로 간주해야 하고, 애프터마켓에서 다시 새로
//     주문을 넣어야 한다 (이 시점의 매매 로직/슬롯 관리는 별도로 세션 전환을 인지해야 할 수 있음).
const KRX_AFTERMARKET_LAUNCH_KST = '2026-09-14'; // 이 날짜(포함) 이후부터 애프터마켓 거래 허용

// 🕗 데이터 수집(가격 이력 축적) 전용 시간 판단 — KRX 공지에 따르면 08:20~09:00은 "시가 단일가"
// 구간으로 실제 호가/가격 데이터가 존재한다. 다만 이건 연속거래가 아니라 단일가 방식이라 실제
// 매수/매도 판단에 쓰기엔 부적합하므로, isKoreanMarketOpen()(실제 매매 판단용, 09:00부터 시작)은
// 그대로 두고, 이 함수는 오직 "가격 이력을 미리 쌓아서 09:00 정각에 RSI/VWAP 등이 바로 유의미한
// 값을 낼 수 있게" 하는 데이터 수집 목적으로만 쓴다. 08:30부터 시작 — 시가단일가(08:20)가 어느
// 정도 안정된 이후 시점을 잡아, 너무 이른 호가 데이터의 노이즈를 피한다.
// ⚠️ KIS가 이 시간대에 실제로 유효한 시세를 주는지는 100% 확정할 수 없다 — 혹시 데이터가 없거나
// 0원으로 오면 기존 안전장치(가격 0 이하 무시 등)가 그대로 작동해 무해하게 넘어간다.
const isKoreanDataCollectionActive = (): boolean => {
  const kstFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23'
  });
  const parts = kstFormatter.formatToParts(new Date());
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);

  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const minutesNow = hour * 60 + minute;
  const preMarketOpen = 8 * 60 + 30; // 08:30 — 시가단일가(08:20) 안정화 이후 시점
  if (minutesNow >= preMarketOpen) {
    return isKoreanMarketOpen() || minutesNow < 9 * 60; // 09:00 이전(프리마켓 구간)이거나, 정규장/애프터마켓 시간이면 true
  }
  return false;
};

const isKoreanMarketOpen = (): boolean => {
  const kstFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23'
  });
  const parts = kstFormatter.formatToParts(new Date());
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);

  if (weekday === 'Sat' || weekday === 'Sun') return false; // 주말은 휴장 (공휴일까지는 별도 캘린더가 없어 반영하지 못함)

  const minutesNow = hour * 60 + minute;

  // 정규장 (09:00 ~ 15:30, 종가단일가 포함) — 기존과 동일
  const regularOpen = 9 * 60;
  const regularClose = 15 * 60 + 30;
  const isRegularSession = minutesNow >= regularOpen && minutesNow <= regularClose;
  if (isRegularSession) return true;

  // KRX 애프터마켓 (16:00 ~ 20:00) — 2026-09-14부터 신설. 그 전까지는 이 시간대에 거래하지 않는다.
  const afterMarketOpen = 16 * 60;
  const afterMarketClose = 20 * 60;
  const isAfterMarketSession = minutesNow >= afterMarketOpen && minutesNow <= afterMarketClose;
  if (!isAfterMarketSession) return false;

  const kstDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }); // en-CA → YYYY-MM-DD
  const todayKst = kstDateFormatter.format(new Date());
  return todayKst >= KRX_AFTERMARKET_LAUNCH_KST;
};

// 🛡️ 정규장과 애프터마켓을 구분해서 판단하는 헬퍼 — isKoreanMarketOpen()은 "지금 거래 가능한
// 시간인가"만 알려주고 어느 세션인지는 구분 안 해준다. 애프터마켓(2026-09-14부터 신설)은 지정가/
// 최우선지정가/최유리지정가만 가능하고 정규장과 다른 ORD_DVSN(41~47)이 필요한 것으로 확인되어,
// 주문 전송 시 세션을 구분해야 한다.
const isKrxAfterMarketSession = (): boolean => {
  const kstFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23'
  });
  const parts = kstFormatter.formatToParts(new Date());
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);

  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const minutesNow = hour * 60 + minute;
  const afterMarketOpen = 16 * 60;
  const afterMarketClose = 20 * 60;
  if (minutesNow < afterMarketOpen || minutesNow > afterMarketClose) return false;

  const kstDateFormatter2 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
  const todayKst2 = kstDateFormatter2.format(new Date());
  return todayKst2 >= KRX_AFTERMARKET_LAUNCH_KST;
};

// ============================================================
// 🕘 거래 세션 상태 (KST, 평일 기준 — 공휴일 달력은 없음)
//   09:00~15:15  REGULAR_SCALP           정규장 스캘핑 (신규 매수 ✅)
//   15:15~15:20  REGULAR_CLOSE_DECISION  정규장 마감 판단: 신규 매수 ❌, 보유 종목마다 애프터로 들고 갈지 판단 → 매도 대상은 즉시 매도
//   15:20~15:30  CLOSING_AUCTION         종가 동시호가: 신규 매수 ❌ (이 구간 주문은 15:30 종가로 한꺼번에 체결)
//   15:30~16:00  BREAK                   휴장 (NXT 미지원)
//   16:00~19:50  AFTER_SCALP             애프터마켓 스캘핑 (신규 매수 ✅)
//   19:50~20:00  AFTER_CLOSE_DECISION    애프터 마감 판단: 신규 매수 ❌, 다음 날로 들고 갈지 판단 → 매도 대상은 즉시 매도
//   그 외         PRE_OPEN / CLOSED
// ============================================================
const CLOSE_DECISION_SELL_ENABLED = false; // (2026-09-30) 마감 매도 판단 삭제 — true로 바꾸면 복구
type TradingSession = 'PRE_OPEN' | 'REGULAR_SCALP' | 'REGULAR_CLOSE_DECISION' | 'CLOSING_AUCTION' | 'BREAK' | 'AFTER_SCALP' | 'AFTER_CLOSE_DECISION' | 'CLOSED';

const getKstClock = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()); // YYYY-MM-DD
  return { weekday, minutes: hour * 60 + minute, dateKey };
};

const isAfterMarketAvailableToday = (): boolean => getKstClock().dateKey >= KRX_AFTERMARKET_LAUNCH_KST;

// ⚡ 틱 처리처럼 초당 수십 번 불리는 곳용 — Intl 없이 KST 분/날짜 번호만 계산
const fastKstMinutes = () => Math.floor(((Date.now() / 60000) + 540) % 1440);
const fastKstDayNo = () => Math.floor((Date.now() + 9 * 3600000) / 86400000);

let tradingSessionCache: { t: number; v: TradingSession } | null = null;
const getTradingSession = (): TradingSession => {
  // 매매 엔진이 종목마다 부르므로 1초 동안은 같은 결과를 재사용한다 (Intl 날짜 계산 비용 절약)
  if (tradingSessionCache && Date.now() - tradingSessionCache.t < 1000) return tradingSessionCache.v;
  const v = computeTradingSession();
  tradingSessionCache = { t: Date.now(), v };
  return v;
};
const computeTradingSession = (): TradingSession => {
  const { weekday, minutes } = getKstClock();
  if (weekday === 'Sat' || weekday === 'Sun') return 'CLOSED';
  const afterOk = isAfterMarketAvailableToday();
  if (minutes < 9 * 60) return 'PRE_OPEN';
  if (minutes < 15 * 60 + 15) return 'REGULAR_SCALP'; // (2026-09-30) 마감 판단 시작 15:10 → 15:15 (사용자 요청)
  if (minutes < 15 * 60 + 20) return 'REGULAR_CLOSE_DECISION';
  if (minutes < 15 * 60 + 30) return 'CLOSING_AUCTION';
  if (!afterOk) return 'CLOSED';
  if (minutes < 16 * 60) return 'BREAK';
  if (minutes < 19 * 60 + 50) return 'AFTER_SCALP';
  if (minutes < 20 * 60) return 'AFTER_CLOSE_DECISION';
  return 'CLOSED';
};

// ============================================================
// 🌙 2단계: 애프터마켓(16:00~19:50) 전용 진입 조건 — 참여자가 적어 정규장 조건이 그대로 통한다는 보장이
// 없으므로 진입 장벽을 높인다. 기준값은 초안이며 [신호 성과] → ⑥ 세션별 성과로 검증 후 조정한다.
// ============================================================
// 📉 이익 실현: 보유 중 최고가 대비 몇 틱 내려오면 팔지 (고점 순수익이 목표에 도달한 뒤에만 적용)
const TRAILING_DROP_TICKS = 2;
// 🪜 (2026-09-30) 트레일링 2틱에서 바로 팔지 않고 매수세를 확인 — 매수세가 살아있으면 최대 이 틱까지 허용(도달 시 무조건 매도)
const TRAILING_MAX_DROP_TICKS = 3;

// 🧺 (2026-09-29) 종목당 최대 슬롯(분할 매수 횟수) — 예전 기본 10개라 같은 종목을 1주씩 8번 사는 등 한 종목에 몰렸다(샘씨엔에스).
// ⏱️ (2026-10-04) 미체결 매수 주문 만료 — 주문 후 이 시간 안에 체결되지 않으면 취소한다(늦게 몰아서 체결되는 것 방지)
// PENDING_BUY_TTL_MS → 설정값(getLiveParams) // (2026-10-07) 30초 → 15초 — 현재가 −1틱 주문은 가격이 내려와야 체결되므로 오래 둘수록 '밀릴 때만' 체결된다
// BEAR_HOLD_MS → 설정값(getLiveParams) // (2026-10-07) Bear 초과로 차단된 뒤 이 시간 동안은 매수하지 않는다(순간 흔들림으로 통과하는 것 방지)
const TIER_SEED_MS = 2 * 60 * 1000; // (2026-10-07) 추천 때 추정한 유동성 구분은 처음 2분만 쓴다
// 💧 (2026-10-07) 물타기 — 사용자 결정: 손절을 보류하고, 평단 대비 순손실이 '손절 기준 × 1.5'에 닿을 때마다 슬롯을 하나씩 더 연다(최대 5슬롯).
//   소형 −1.5% · 중형 −1.2% · 대형 −0.9% (손절 기준 −1.0 / −0.8 / −0.6의 1.5배). 오를 때는 추가 매수하지 않는다.
//   5슬롯을 다 쓴 뒤 새 평단에서 같은 폭만큼 더 내려가면 전량 손절한다(끝없이 물리지 않도록 둔 마지막 안전장치).
// AVG_DOWN_ENABLED → 설정값(getLiveParams) 
// AVG_DOWN_MAX_SLOTS → 설정값(getLiveParams) 
// AVG_DOWN_STEP_MULT → 설정값(getLiveParams) 
// AVG_DOWN_MIN_GAP_MS → 설정값(getLiveParams) // 추가 매수 사이 최소 간격
// CLOSE_BUY_ENABLED → 설정값(getLiveParams) // (2026-10-07) 새 기준으로 다시 켬 — 50일선 상승 추세 종목이 전일 대비 하락했을 때 1주 매수
// CLOSE_BUY_QTY → 설정값(getLiveParams) // 마감 매수 수량(주)
// CLOSE_BUY_MA_DAYS → 설정값(getLiveParams) // 이동평균 일수
// CLOSE_BUY_MA_LOOKBACK → 설정값(getLiveParams) // 이 거래일 전의 이동평균보다 높아야 '상승'
// 주문 응답을 받지 못했거나 주문번호 없이 응답이 온 뒤, 그 종목의 새 매수를 쉬는 시간(그 사이 KIS 미체결 주문과 대조)
const BUY_UNKNOWN_COOLDOWN_MS = 30000;
const MAX_SLOTS_PER_STOCK = 1; // (2026-09-30) 사용자 요청: 슬롯1만 사용(슬롯2 삭제). 이력: 10 → 2 → 1
// 🛟 (2026-09-30) 슬롯3 방어(물타기 1회) — 사용자 설계.
//   슬롯1·2는 기존대로 매수. 평단 기준 손절선(-0.6%)에 닿으면 바로 손절하지 않고 "슬롯3 대기"로 전환해 5분 동안 매수 신호를 기다린다.
//   신호가 오면 슬롯3을 기존 로직대로(점수·체결강도·2호가) 1회 매수 → 새 평단 기준 +목표면 트레일링, -손절%면 손절.
//   안전장치: ① 처음 평단(슬롯3 전) 대비 순손실 -1.2%면 언제든 무조건 손절 ② 5분 안에 신호가 없으면 손절
//   ③ 현재가가 ①의 손절선에서 0.3% 이내로 가까우면 슬롯3을 사지 않음(사자마자 손절되는 것 방지).
const RESCUE_SLOT_ENABLED = false; // (2026-09-30) 사용자 요청으로 슬롯3 방어·5분 대기 삭제 — 손절선 도달 시 무조건 손절
const RESCUE_WAIT_MS = 5 * 60 * 1000;
const RESCUE_HARD_STOP_NET_PCT = -1.2;     // 처음 평단 대비 순손실(%) — 수수료·세금 뺀 값
const RESCUE_SKIP_NEAR_HARD_PCT = 0.3;     // 하드 손절선에서 이만큼(%p) 이내면 슬롯3 매수 안 함
// 💪 (2026-09-29) 매수 최소 체결강도 — 첫 실거래 데이터에서 이긴 거래는 체결강도 136~155, 손절 난 거래는 73이었다(표본 적음, 추후 재검토).
// 💧 (2026-09-30) 유동성 기준 — 9/29~30 실거래 86건: 5분 거래대금 1억 미만 39건 -3,828원 / 3억~10억 18건 +1,445원,
//   스프레드 3틱 이상 평균 -0.44%, 60초 체결 하위 1/3 평균 -0.54%
const REC_MIN_TRADING_VALUE = 1_000_000_000;   // 추천 검색: 당일 거래대금 10억 원 이상
const BUY_MIN_TRADE_VALUE_5M = 100_000_000;    // 매수 필수: 최근 5분 거래대금 1억 원 이상 (2026-09-30 3억 → 1억: 필수조건 통과 종목 안에서는 3억 기준이 승자를 걸러냄)
const BUY_MAX_SPREAD_TICKS = 3;                // 매수 필수: 매수1~매도1 호가 간격 2틱 이하
const BUY_MIN_TICKS_60S = 20;                  // 매수 필수: 최근 60초 실시간 체결 35건 이상
const EVICT_LOW_TRADE_VALUE_5M = 100_000_000;  // 퇴출: 5분 거래대금 1억 원 미만이면 필수조건 1개 부족으로 계산
const MIN_BUY_EXEC_STRENGTH = 130;
// 🅰️🅱️ (2026-09-30) 진입 등급 — A: 눌림목 있음(기준 점수 그대로) / B: 눌림목 없음(기준 +10점). 애프터는 각 +15.
const GRADE_B_EXTRA_SCORE = 10; // (2026-09-30) 100 → 130: 필수조건(체결강도130+). 130 미만 매수는 실거래 평균 -0.49%
const AFTER_BUY_SCORE_THRESHOLD = 60; // (2026-09-30) 만점 100 체계로 40 → 60          // 정규장 30점 → 애프터 40점 (만점 70) — 2026-09-29 한때 50으로 올렸다가 기존값으로 복원
const AFTER_MIN_TICKS_60S = 15;                // 최근 60초 실시간 체결 횟수
const AFTER_MIN_TRADE_VALUE_5M = 30_000_000;   // 최근 5분 거래대금 3,000만원
const AFTER_MAX_SPREAD_TICKS = 2;              // 매수1~매도1호가 간격 2틱 이하
const AFTER_POSITION_SIZE_RATIO = 0.5;         // 투자 금액 절반

// 자동 신규 매수(추가 매수 포함)는 스캘핑 구간에서만 — 마감 판단/동시호가/휴장에는 매수하지 않는다
const isNewAutoBuyAllowed = (session: TradingSession = getTradingSession()) =>
  session === 'REGULAR_SCALP' || session === 'AFTER_SCALP';

const TRADING_SESSION_INFO: Record<TradingSession, { label: string; tone: 'green' | 'amber' | 'slate' | 'violet'; tip: string }> = {
  PRE_OPEN: { label: '장 시작 전', tone: 'slate', tip: '09:00 정규장 시작 전 — 매매하지 않습니다' },
  REGULAR_SCALP: { label: '정규장', tone: 'green', tip: '09:00~15:15 정규장 스캘핑 — 신규 매수 가능' },
  REGULAR_CLOSE_DECISION: { label: '정규장 마감 구간', tone: 'amber', tip: '15:15~15:20 — 신규 매수 중지. 보유 종목은 평소처럼 손절·트레일링·신호 매도로 관리합니다(마감 매도 판단 없음)' },
  CLOSING_AUCTION: { label: '종가 동시호가', tone: 'amber', tip: '15:20~15:30 — 신규 매수 중지. 이 구간 주문은 15:30 종가로 한꺼번에 체결됩니다' },
  BREAK: { label: '휴장 (애프터 대기)', tone: 'slate', tip: '15:30~16:00 — 매매하지 않습니다 (NXT 미지원)' },
  AFTER_SCALP: { label: '애프터마켓', tone: 'violet', tip: '16:00~19:50 애프터마켓 스캘핑 — 신규 매수 가능' },
  AFTER_CLOSE_DECISION: { label: '애프터 마감 구간', tone: 'amber', tip: '19:50~20:00 — 신규 매수 중지. 보유 종목은 평소처럼 손절·트레일링·신호 매도로 관리합니다(마감 매도 판단 없음)' },
  CLOSED: { label: '장 종료', tone: 'slate', tip: '거래 시간이 아닙니다' },
};

// Utility function to get tick size by market and price
const getTickSize = (price: number, market: 'KR' | 'US' = 'KR'): number => {
  if (market === 'US') return 0.01;
  if (price >= 500000) return 1000;
  if (price >= 200000) return 500;
  if (price >= 50000) return 100;
  if (price >= 20000) return 50;
  if (price >= 5000) return 10;
  if (price >= 2000) return 5;
  return 1; // 2,000원 미만 (1,000원 미만 동전주 포함) 호가단위 1원
};

// 2026년 국내 상장주식 및 해외주식 수수료·제세금 상수 (실제 거래 및 스크린샷 역산 공식 기준)
const KR_BROKER_FEE_RATE = 0.00014; // 매매 수수료율 (편도 약 0.014%, 왕복 ~0.028%)
const KR_TAX_RATE = 0.0020;          // 2026년 국내 상장주식 매도 제세금 (증권거래세 + 농어촌특별세 = 0.20%)

const US_BROKER_FEE_RATE = 0.0007;  // 해외 매매 수수료율 (편도 약 0.07%)
const US_TAX_RATE = 0.0000278;      // 미국 SEC Fee (매도 시 0.00278%)

/**
 * 실현 및 평가 순수익(원/달러) 계산 함수
 * 순수익 = 매도금액 - 매수금액 - 매수수수료 - 매도수수료 - 매도제세금
 */
const calculateNetProfitAmount = (
  buyPrice: number,
  sellPrice: number,
  quantity: number = 1,
  market: 'KR' | 'US' = 'KR'
) => {
  if (buyPrice <= 0 || sellPrice <= 0 || quantity <= 0) {
    return { netProfit: 0, grossProfit: 0, buyFee: 0, sellFee: 0, sellTax: 0, totalCost: 0 };
  }

  const isKR = market === 'KR';
  const feeRate = isKR ? KR_BROKER_FEE_RATE : US_BROKER_FEE_RATE;
  const taxRate = isKR ? KR_TAX_RATE : US_TAX_RATE;

  const buyAmount = buyPrice * quantity;
  const sellAmount = sellPrice * quantity;
  const grossProfit = sellAmount - buyAmount;

  const buyFee = isKR ? Math.floor(buyAmount * feeRate) : Number((buyAmount * feeRate).toFixed(4));
  const sellFee = isKR ? Math.floor(sellAmount * feeRate) : Number((sellAmount * feeRate).toFixed(4));
  const sellTax = isKR ? Math.floor(sellAmount * taxRate) : Number((sellAmount * taxRate).toFixed(4));

  const totalCost = buyFee + sellFee + sellTax;
  const netProfit = grossProfit - totalCost;

  return {
    netProfit: isKR ? Math.round(netProfit) : Number(netProfit.toFixed(2)),
    grossProfit: isKR ? Math.round(grossProfit) : Number(grossProfit.toFixed(2)),
    buyFee,
    sellFee,
    sellTax,
    totalCost: isKR ? Math.round(totalCost) : Number(totalCost.toFixed(2))
  };
};

/**
 * 제세금과 수수료를 제외한 순수익률(Net Profit %) 계산 함수
 * 순수익률 = (순수익 / 매수원금) * 100
 */
const calculateNetProfitPercent = (
  buyPrice: number,
  currentOrSellPrice: number,
  market: 'KR' | 'US' = 'KR'
): number => {
  if (buyPrice <= 0 || currentOrSellPrice <= 0) return 0;
  const { netProfit } = calculateNetProfitAmount(buyPrice, currentOrSellPrice, 1, market);
  const buyAmount = buyPrice;
  return Number(((netProfit / buyAmount) * 100).toFixed(2));
};

/**
 * 목표 순수익률(Target Net Profit %)을 온전히 달성하기 위한 목표 매도가격 계산 함수
 * 제세금(0.20%) 및 왕복 수수료(0.028%)를 완벽히 커버하고, 호가단위 올림 처리하여 실제 손에 남는 순수익률 >= targetProfitPct 보장
 */
const calcTargetSellPriceByNetProfit = (
  basePrice: number,
  targetNetProfitPct: number,
  market: 'KR' | 'US' = 'KR'
): number => {
  if (basePrice <= 0) return 0;

  const isUS = market === 'US';
  const feeRate = isUS ? US_BROKER_FEE_RATE : KR_BROKER_FEE_RATE;
  const taxRate = isUS ? US_TAX_RATE : KR_TAX_RATE;
  const tickSize = getTickSize(basePrice, market);

  const targetRatio = targetNetProfitPct / 100;
  // 순수익 공식: P_sell * (1 - feeRate - taxRate) - P_buy * (1 + feeRate) >= P_buy * targetRatio
  // P_sell >= P_buy * (1 + feeRate + targetRatio) / (1 - feeRate - taxRate)
  const numerator = 1 + feeRate + targetRatio;
  const denominator = 1 - feeRate - taxRate;
  const rawTarget = basePrice * (numerator / denominator);

  // 호가 단위 올림(Ceil)을 적용하여 세금과 수수료를 공제하고도 순수익률 >= targetNetProfitPct를 확실히 보장
  let rounded = isUS
    ? Number((Math.ceil(rawTarget * 100) / 100).toFixed(2))
    : Math.ceil(rawTarget / tickSize) * tickSize;

  if (rounded <= basePrice) {
    rounded = isUS ? Number((basePrice + 0.01).toFixed(2)) : basePrice + tickSize;
  }

  return rounded;
};

// ============================================================
// 🎯 추천종목 점수 (2026-10-04) — "곧 매수 필수조건에 들어올 종목" 순으로 매긴다.
// 순위 조회로 모은 후보 중 상위 REC_DETAIL_LIMIT 종목만 현재가·체결강도를 실제로 조회해서,
// 매매 엔진의 필수조건(체결강도 · VWAP 위 · 5분 거래대금)과 같은 축으로 점수를 낸다.
// 조회하지 못한 값은 추정으로 채우지 않고 점수 0 · 화면 "–"로 둔다.
//   거래대금 35 · 체결강도 25 · VWAP 위치 25 · 고점 대비 눌림 15 = 100점 (2026-10-06 배점 변경)
// ============================================================
const REC_DETAIL_LIMIT = 30;          // 실제 값을 조회할 후보 수
const REC_DETAIL_BUDGET_MS = 25000;   // 상세 조회에 쓰는 최대 시간 — 넘으면 받은 것까지만 쓴다

/** 순수익 pct가 되는 매도가 (익절은 호가 올림, 손절은 호가 내림 — 매수가 위로 끌어올리지 않는다) */
const priceAtNetPct = (basePrice: number, netPct: number): number => {
  if (!(basePrice > 0)) return 0;
  const raw = basePrice * (1 + KR_BROKER_FEE_RATE + netPct / 100) / (1 - KR_BROKER_FEE_RATE - KR_TAX_RATE);
  const tick = getTickSize(raw, 'KR');
  return netPct >= 0 ? Math.ceil(raw / tick) * tick : Math.floor(raw / tick) * tick;
};

/** 장 시작(09:00) 뒤 지난 분 — 5분 거래대금 추정용. 장 시작 전·마감 뒤에는 하루 전체(390분)로 본다 */
const recElapsedMarketMinutes = (): number => {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const elapsed = kst.getUTCHours() * 60 + kst.getUTCMinutes() - 9 * 60;
  if (elapsed < 0 || elapsed > 390) return 390;
  return Math.max(5, elapsed);
};

const buildScalperRecommendation = (
  v: { symbol: string; name: string; price: number; changePercent: number; volume: any; tradingValue?: number; marketType?: 'KOSPI' | 'KOSDAQ' },
  detail: RecommendationDetail | null,
  opts?: { tradeValue5m?: number },
): ScalperRecommendation => {
  const LP = getLiveParams();
  const price = detail?.price ?? v.price;
  const changePercent = detail?.changePercent ?? v.changePercent;
  const tradingValue = detail?.tradingValue ?? (Number(v.tradingValue) > 0 ? Number(v.tradingValue) : undefined);
  // 5분 거래대금 — 실시간 값(등록 종목) > 최근 체결 목록 환산(조회 종목) > 당일 평균 추정 순으로 쓴다
  const est5mSource: 'LIVE' | 'RECENT' | 'DAY' | undefined = opts?.tradeValue5m !== undefined ? 'LIVE'
    : detail?.recentTradeValue5m !== undefined ? 'RECENT'
    : tradingValue !== undefined ? 'DAY' : undefined;
  const est5m = est5mSource === 'LIVE' ? opts!.tradeValue5m
    : est5mSource === 'RECENT' ? detail!.recentTradeValue5m
    : est5mSource === 'DAY' ? tradingValue! / recElapsedMarketMinutes() * 5 : undefined;
  const ticksPerMin = detail?.recentTicksPerMin;
  const es = detail?.execStrength;
  const vwapGapPct = detail?.vwap && price > 0 ? ((price - detail.vwap) / detail.vwap) * 100 : undefined;
  const pullbackPct = detail?.high && price > 0 ? Math.max(0, ((detail.high - price) / detail.high) * 100) : undefined;
  const hasDetail = es !== undefined || vwapGapPct !== undefined;

  // (2026-10-06) 구분별 기준 — 추천은 매수 기준보다 느슨하게(매수 체결강도 − watchExecGap) 받는다
  const recTier = liquidityTierOf(est5m, LP);
  const minEs = minExecOfTier(recTier, LP);
  const watchEs = watchExecOfTier(recTier, LP);
  // (2026-10-06) 배점 변경 — 체결강도 35→25 · VWAP 30→25 · 눌림 20→15 · 거래대금 15→35. 체결강도 배점이 가장 커서
  // "아침에 강했지만 지금은 거래가 식은 종목"이 들어왔다(오후 관찰 신호의 5분 거래대금 중앙값 0.19억 · 분당 체결 7건).
  const esScore = es === undefined ? 0 : es >= minEs ? 25 : es >= watchEs ? 18 : es >= watchEs - 15 ? ((es - (watchEs - 15)) / 15) * 12 : 0;
  const vwScore = vwapGapPct === undefined ? 0
    : vwapGapPct >= 0 && vwapGapPct <= 1 ? 25
    : vwapGapPct > 1 && vwapGapPct <= 2.5 ? 25 - ((vwapGapPct - 1) / 1.5) * 17
    : vwapGapPct > 2.5 ? 4
    : vwapGapPct >= -0.3 ? 10 : 0;
  const pbScore = pullbackPct === undefined ? 0
    : pullbackPct >= 0.3 && pullbackPct <= 2 ? 15
    : pullbackPct < 0.3 ? 9
    : pullbackPct <= 4 ? 6 : 0;
  const lqScore = est5m === undefined ? 0
    : est5m >= LP.tierLargeTradeValue5m ? 35
    : est5m >= LP.tierMidTradeValue5m ? 30
    : est5m >= 2 * EVICT_LOW_TRADE_VALUE_5M ? 22
    : est5m >= EVICT_LOW_TRADE_VALUE_5M ? 12 : 0;
  const score = Math.round(esScore + vwScore + pbScore + lqScore);

  const gates: { name: string; ok: boolean }[] = [];
  if (es !== undefined) gates.push({ name: `체결강도 ${watchEs}(매수 ${minEs})`, ok: es >= watchEs });
  if (vwapGapPct !== undefined) gates.push({ name: 'VWAP 위', ok: vwapGapPct >= 0 });
  if (est5m !== undefined) gates.push({ name: '5분 거래대금', ok: est5m >= EVICT_LOW_TRADE_VALUE_5M });
  const gatesPassed = gates.filter(g => g.ok).length;
  const missing = gates.filter(g => !g.ok).map(g => g.name);

  const tier = recTier;
  const targetNetPct = sellTargetOfTier(tier, LP);
  const stopNetPct = sellStopOfTier(tier, LP);
  const eok = (n: number) => `${(n / 100000000).toFixed(n >= 1000000000 ? 0 : 1)}억`;

  const tags: string[] = [];
  if (es !== undefined) tags.push(`체결강도 ${es.toFixed(0)}`);
  if (vwapGapPct !== undefined) tags.push(`VWAP ${vwapGapPct >= 0 ? '+' : ''}${vwapGapPct.toFixed(2)}%`);
  if (pullbackPct !== undefined) tags.push(`고점 대비 -${pullbackPct.toFixed(2)}%`);
  if (est5m !== undefined) tags.push(`5분 약 ${eok(est5m)}${est5mSource === 'LIVE' ? '' : est5mSource === 'RECENT' ? '(최근 체결 환산)' : '(당일 평균 추정)'}`);
  if (ticksPerMin !== undefined) tags.push(`분당 체결 ${ticksPerMin >= 10 ? Math.round(ticksPerMin) : ticksPerMin}건`);
  tags.push(`${LIQUIDITY_TIER_LABEL[tier]} 기준`);

  return {
    rank: 0,
    symbol: v.symbol,
    name: v.name,
    marketType: v.marketType || getKnownMarket(v.symbol),
    price,
    recommendedPrice: price,
    change: changePercent !== 0 ? Math.round(price - price / (1 + changePercent / 100)) : 0,
    changePercent,
    volume: v.volume || '0',
    tradeAmount: tradingValue !== undefined ? `${Math.round(tradingValue / 100000000).toLocaleString()}억` : '-',
    volumeSurgeRate: 0,
    volumeIntensity: es !== undefined ? Math.round(es) : 0,
    scalpingScore: score,
    grade: gatesPassed >= 3 ? 'SSS' : gatesPassed === 2 ? 'SS' : gatesPassed === 1 ? 'S' : 'A+',
    category: 'VOLUME_SURGE',
    targetPrice: priceAtNetPct(price, targetNetPct),
    stopLoss: priceAtNetPct(price, stopNetPct),
    expectedReturn: targetNetPct,
    rsi: 0,
    reason: hasDetail
      ? `필수조건 ${gatesPassed}/${gates.length} 충족${missing.length > 0 ? ` — 부족: ${missing.join(', ')}` : ''}`
      : '상세 미조회 — 순위 자료만 있음 (상위 30종목만 조회)',
    tags,
    holdingTime: '',
    hasDetail,
    gatesPassed,
    gatesTotal: gates.length,
    execStrength: es,
    vwapGapPct,
    pullbackPct,
    est5mTradeValue: est5m,
    recentTicksPerMin: ticksPerMin,
    liquidityTier: tier,
    targetNetPct,
    stopNetPct,
  };
};


interface PendingBuyOrder {
  id: string;
  orgNo?: string;
  symbol: string;
  orderPrice: number;
  quantity: number;
  originalQuantity?: number;
  createdAt: number;
  slotId?: string;
  ordDvsn?: string;
}

interface PendingSellOrder {
  id: string; // KIS odno, or watch ID
  orgNo?: string; // KIS KRX_FWDG_ORD_ORGNO
  symbol: string;
  orderPrice: number;
  quantity: number;
  createdAt: number;
  type?: 'LIMIT_SELL' | 'TARGET_WATCH' | 'SCALPER_EXIT';
  reason?: string;
  exitReason?: ExitReason; // 매도 사유(구조화) — 미체결 상태로 대기하다 나중에 체결될 때도 사유를 잃지 않도록 저장
  buyPrice?: number; // Added to calculate profit upon fill
  slotId?: string; // Track which slot this order is for
  ordDvsn?: string;
}

// ⚠️⚠️⚠️ 삭제됨 — 하드코딩된 미국 주식 가짜 데이터 ⚠️⚠️⚠️
// 예전엔 여기에 SNDL/RIG/LCID/DNA/SOUN/SOFI/BBAI/IONQ/NVDA/TSLA/AAPL 등 미국 종목의 고정
// 가격/등락률/거래량과, Math.random()으로 생성한 가짜 40분 차트 히스토리가 하드코딩되어
// 있었다. 실제 KIS 데이터가 전혀 아니었고, 이 스캘퍼는 국내(KOSPI/KOSDAQ) 전용이므로 완전히
// 삭제했다. 아래 참조 지점들(US 시장 관련 폴백/캐시 초기값)은 전부 빈 배열로도 안전하게
// 동작하도록 확인했다 — find()는 undefined를, forEach()는 아무 일도 하지 않는다.
const INITIAL_STOCKS: Stock[] = [];

// 매도 사유를 구조화된 값으로 남겨서 GLOBAL TRADE LOGS에서 "왜 팔았는지"를 정확히 필터링/확인할 수 있게 한다.
export type ExitReason =
  | 'TAKE_PROFIT'      // 목표 수익률 도달
  | 'STOP_LOSS'        // 기계적 손절
  | 'TRAILING_STOP'    // 고점 대비 하락(트레일링 스탑)
  | 'AI_SELL'          // 스마트 매도 (예전 기록 호환용으로 유지)
  | 'SIGNAL_REVERSAL'  // 전략 센서 반전 시그널 (RSI 과열, 매도세 흡수, 데드크로스 등)
  | 'TIME_EXIT'        // 보유시간 초과 등 시간 기반 청산
  | 'MANUAL'           // 사용자 수동 매도
  | 'CLOSE_REGULAR'    // 15:15 정규장 마감 판단으로 매도 (애프터로 들고 가지 않음)
  | 'CLOSE_AFTER';     // 19:50 애프터마켓 마감 판단으로 매도 (다음 날로 들고 가지 않음)

interface TradeLog {
  time: string;
  symbol: string;
  type: 'BUY' | 'SELL' | '매수' | '매도';
  price: number;
  amount: number;
  reason: string;
  id?: string;          // GLOBAL TRADE LOGS 필터 UI의 React key 용도
  timestamp?: number;   // 정렬/필터링용 원본 타임스탬프
  symbolName?: string;  // 종목명 (필터 버튼 라벨 등에 사용)
  exitReason?: ExitReason; // 매도 사유 (구조화된 값 — SELL 로그에만 존재)
  entryReason?: string;    // 매수 진입 시그널 요약 (BUY 로그에만 존재)
  pnlPercent?: number;     // 매도 시점의 손익률(%) — SELL 로그에만 존재
}

interface NewsItem {
  title: string;
  summary: string;
  source: string;
  time: string;
  url?: string;
}

// 스캘퍼 인벤토리에 시장(KR/US)별로 등록 가능한 최대 종목 수.
// kisService.MAX_SCALPER_RECOMMENDATIONS(추천종목 표시 개수)와는 서로 다른 목적의 값이므로
// 의도적으로 별도 상수로 관리한다 — 두 값을 억지로 같은 숫자로 맞추지 않는다.
// ------------------------------------------------------------------
// 20종목 기준 계산: getPrice()는 앱 전체가 공유하는 시세 조회 대기열을 쓰고, 호출 사이 최소 간격은
// 500ms다(kisService.minRequestInterval — 시세 대기열 초당 최대 2건, 주문 대기열도 별도로 초당 최대 2건.
// KIS 실전 REST 한도 초당 18건 대비 충분한 여유).
// refreshStalePrices(등록종목 전체, 주기 T) + syncSelectedPrice(2초마다 1건) + syncLiveOrderbook(5초마다 1건)이
// 전부 같은 대기열을 나눠 쓰므로, 한 주기(T) 안에 처리해야 할 호출 수는:
//   20(전체종목) + T/2000(선택종목) + T/5000(호가) 건
// 이걸 500ms×건수로 처리하는 시간이 T보다 작아야 밀리지 않는다: (20 + T/2000 + T/5000)×0.5초 ≤ T
// → 10 + 0.35T ≤ T → T ≥ 약 15.4초. 여유를 두어 25초로 설정했다 (아래 refreshStalePrices 주기 참고).
// 🔇 틱 단위 진단 로그([WS TICK 정상]) 스위치 — 기본 끔. 켜려면 브라우저 콘솔에서
// localStorage.setItem('WS_DEBUG','1') 후 새로고침 (kisService의 [WS RAW] 로그와 같은 스위치).
const WS_DEBUG_ENABLED = (() => {
  try { return typeof window !== 'undefined' && window.localStorage?.getItem('WS_DEBUG') === '1'; } catch { return false; }
})();

// 📒 매매 일지가 "실제 체결"로 인정하는 로그 접두어 — 차단/실패/주문접수 로그는 제외
// 매매 일지 세션 구분 — 15:30 이전 체결은 정규장, 그 이후는 애프터마켓
const currentJournalSession = (): 'REGULAR' | 'AFTER' => (getKstClock().minutes >= 15 * 60 + 30 ? 'AFTER' : 'REGULAR');
// 🛡️ (2026-09-28 신호 성과 점검) '[실제체결]'(미체결 매수 감시에서 나중에 체결된 매수)과 '[취소 중 체결]'(취소하려던
// 매수가 그 사이 체결된 경우)이 빠져 있어서, 9초 안에 바로 체결되지 않은 매수는 매매 일지에 "보유 로트"로 전혀
// 기록되지 않았다 → 그 종목을 팔아도 짝이 되는 로트가 없어 "짝 없는 매도"로만 쌓이고 청산 거래가 0건으로 남았다.
const JOURNAL_FILL_PREFIXES = ['[실제체결 완료]', '[일부체결]', '[실제체결]', '[취소 중 체결]', '[KIS 지정가 매도 체결]', '[KIS 지정가 매도 일부체결]', '[체결완료]'];

// (아래 설명은 이전 구조 기준 — 2026-09-28부터는 INVENTORY_LIMIT=19 고정)
// 🎯 인벤토리 = 실시간 20종목 × 활성 앱키 개수. 앱키 1개 = KIS 연결 1개 = 실시간 등록 약 41건 =
// 20종목(체결가+호가) + 체결통보 1건. 실시간이 아닌 종목은 매매 엔진이 매매하지 않으므로(틱 신선도
// 안전장치), 인벤토리를 실시간으로 받을 수 있는 수만큼만 둔다.
// 🎯 과제 1(멀티 앱키) — [KIS 연동 설정]에서 계좌 #2~4를 등록한 만큼 이 값이 늘어난다(최대 80).
// 모듈 스코프의 여러 헬퍼 함수가 이 값을 그대로 참조하므로 const가 아닌 let으로 두고, App 컴포넌트가
// activeKisSlotCount가 바뀔 때마다 갱신한다(아래 useEffect 참고).
// 🎯 (2026-09-28 변경, 사용자 요청) 인벤토리를 19종목으로 고정 — 앱키 개수와 무관하게 19종목.
// 앱키 1개 = 실시간 등록 41건 중 19종목×2(체결가+호가)=38건 + 체결통보(H0STCNI0) 1건 = 39건 →
// 2건이 여유로 남는다(애프터마켓 시간외체결가 H0STOUP0 등에 사용, 아래 OVERTIME_WS_SPARE 참고).
// 인벤토리 전 종목이 항상 실시간(웹소켓)으로 감시되며, 웹소켓은 인벤토리 + 체결통보 전용이다.
// 🎯 (2026-10-04 변경, 사용자 요청) 계좌 1개당 19종목 — 계좌 #2를 등록하면 19 × 2 = 38종목.
// 1~19번째 종목은 계좌 #1, 20~38번째 종목은 계좌 #2가 실시간·시세 조회를 맡는다(주문은 항상 계좌 #1).
// 계좌 #3·#4는 "멀티 계좌 확장" 과제로 미뤄 두었으므로 지금은 2계좌까지만 반영한다.
const INVENTORY_LIMIT = 19; // 계좌 1개당 종목 수
// 계좌 #2~4 설정은 로그인 뒤에 늦게 불러와지므로, 직전에 쓰던 계좌 수를 기억해 두었다가 시작할 때
// 바로 그 한도로 인벤토리를 복원한다(그렇지 않으면 새로고침 때마다 20번째 이후 종목이 잘려 나간다).
const KIS_ACCOUNT_COUNT_KEY = 'leo100b_kis_account_count_v1';
const readSavedKisAccountCount = (): number => {
  try { return effectiveKisAccountCount(Number(localStorage.getItem(KIS_ACCOUNT_COUNT_KEY) || 1)); } catch { return 1; }
};
let MAX_INVENTORY_PER_MARKET = INVENTORY_LIMIT * readSavedKisAccountCount();
// 앱키 1개 기준 실시간 등록 여유분(41 - 19×2 - 체결통보 1) — 시간외체결가(H0STOUP0) 추가 구독 한도
const OVERTIME_WS_SPARE = 2;

// 🔄 인벤토리 자동 교체 규칙 (autoManageInventory, 15초 주기) — 2026-09-30 "매수까지의 거리" 기준으로 재설계
//   거리 = 못 채운 필수조건 수(체결강도130+·눌림목·VWAP 위) × 15 + max(0, 45 − 매수점수)
//   [A 임박] 필수조건 모두 + 35점 이상 → 유지   [B 근접] 5분 안에 A 못 되면 퇴출
//   [C 멀다] 1분 평균 필수조건 2개 이상 부족 → 퇴출   [D 매우 멀다] VWAP −0.5% 아래 + 체결강도 80 미만 30초 → 퇴출
//   [순위 교체] 꽉 차 있으면 1분마다 가장 먼 1종목을 새 추천종목으로 교체(후보 있을 때만)
//   [보호] 보유 중 / 주문 진행 중 / 편입 후 2분 미만   [편입] 사이클당 최대 3종목
//   [금지] 퇴출 종목 15분간 재편입 안 함, 정규장 15:15~ 신규 편입 중지
const INVENTORY_MIN_RESIDENCE_MS = 10 * 60 * 1000; // (2026-09-30) 3분 → 2분 → 10분
const INVENTORY_REENTRY_COOLDOWN_MS = 10 * 60 * 1000; // (2026-09-30) 30분 → 15분 → 10분

// 🌱 초기 시드 종목 — 앱을 처음 켰을 때(저장된 선택 종목이 없을 때) 화면·종목 목록이 비지 않도록 넣어두는 1종목.
// 매매 대상이 아니며(인벤토리에 등록되지 않는 한 주문·REST 조회 대상 아님), 이름 조회의 마지막 대체값으로도 쓰인다.
// (2026-09-29) 동양(001520) → 대한광통신(010170)으로 변경. 예전엔 가짜 가격·Math.random() 차트를 넣어 실제 시세처럼
// 보였으나, 이제 가격 0(= 화면에서 "연결 중")으로 두고 실제 시세(웹소켓/REST)가 들어오면 채워진다.
const INITIAL_STOCKS_KR: Stock[] = [
  {
    symbol: '010170',
    name: '대한광통신',
    price: 0,
    change: 0,
    changePercent: 0,
    volume: '0',
    history: [],
    market: 'KR',
    isAI: true,
    isPlaceholderData: true
  },
];

// Flag Components
const SouthKoreaFlag = () => (
  <svg width="18" height="12" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg" className="rounded-[1px] shadow-sm flex-shrink-0">
    <rect width="18" height="12" fill="white" />
    <circle cx="9" cy="6" r="3" fill="#CD2E3A" />
    <mask id="taeguk-mask" maskUnits="userSpaceOnUse" x="6" y="3" width="6" height="6">
      <circle cx="9" cy="6" r="3" fill="white" />
    </mask>
    <g mask="url(#taeguk-mask)" transform="rotate(-33 9 6)">
      <path d="M6 6C6 4.34315 7.34315 3 9 3C10.6569 3 12 4.34315 12 6H6Z" fill="#CD2E3A" />
      <path d="M6 6C6 7.65685 7.34315 9 9 9C10.6569 9 12 7.65685 12 6H6Z" fill="#0047A0" />
      <circle cx="7.5" cy="6" r="1.5" fill="#0047A0" />
      <circle cx="10.5" cy="6" r="1.5" fill="#CD2E3A" />
    </g>
    <g stroke="black" strokeWidth="0.8" strokeLinecap="round">
      <path d="M2.5 2.5L4 4" />
      <path d="M14 8L15.5 9.5" />
      <path d="M2.5 9.5L4 8" />
      <path d="M14 4L15.5 2.5" />
    </g>
  </svg>
);

const USAFlag = () => (
  <svg width="18" height="12" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg" className="rounded-[1px] shadow-sm flex-shrink-0">
    <rect width="18" height="12" fill="white" />
    <rect width="18" height="1" fill="#B22234" />
    <rect y="2" width="18" height="1" fill="#B22234" />
    <rect y="4" width="18" height="1" fill="#B22234" />
    <rect y="6" width="18" height="1" fill="#B22234" />
    <rect y="8" width="18" height="1" fill="#B22234" />
    <rect y="10" width="18" height="1" fill="#B22234" />
    <rect width="8" height="6.6" fill="#3C3B6E" />
    <circle cx="2" cy="1.5" r="0.3" fill="white" />
    <circle cx="4" cy="1.5" r="0.3" fill="white" />
    <circle cx="6" cy="1.5" r="0.3" fill="white" />
    <circle cx="2" cy="3.3" r="0.3" fill="white" />
    <circle cx="4" cy="3.3" r="0.3" fill="white" />
    <circle cx="6" cy="3.3" r="0.3" fill="white" />
    <circle cx="2" cy="5.1" r="0.3" fill="white" />
    <circle cx="4" cy="5.1" r="0.3" fill="white" />
    <circle cx="6" cy="5.1" r="0.3" fill="white" />
  </svg>
);

export function calculateStockLimits(price: number, changePercent: number = 0, isUS: boolean, basePriceInput?: number) {
  if (!price || price <= 0 || isNaN(price)) {
    return { upperLimit: isUS ? 13.00 : 1300, lowerLimit: isUS ? 7.00 : 700, basePrice: price || 0 };
  }
  const cp = (typeof changePercent === 'number' && !isNaN(changePercent)) ? changePercent : 0;
  let basePrice = basePriceInput;
  if (!basePrice || basePrice <= 0 || isNaN(basePrice)) {
    basePrice = cp !== -100 ? price / (1 + cp / 100) : price;
  }
  if (!basePrice || basePrice <= 0 || !isFinite(basePrice)) {
    basePrice = price;
  }

  if (isUS) {
    const upperLimit = Number((basePrice * 1.30).toFixed(2));
    const lowerLimit = Math.max(0.01, Number((basePrice * 0.70).toFixed(2)));
    return { upperLimit, lowerLimit, basePrice: Number(basePrice.toFixed(2)) };
  } else {
    const upperLimit = Math.round(basePrice * 1.30);
    const lowerLimit = Math.round(basePrice * 0.70);
    return { upperLimit, lowerLimit, basePrice: Math.round(basePrice) };
  }
}

export default function App() {
  const [marketType, setMarketType] = useState<'KR' | 'US'>('KR');
// Forced to KR always
  const holdingsViewTab = 'KR';
  const syncInProgressRef = React.useRef(false);

// ============================================================
// 🔒 실시간 데이터 세션 보호
// 로그인 중에만 시세/센서/호가 조회가 실행되도록 한다.
// 로그아웃하면 세션 번호를 증가시켜 진행 중인 비동기 작업도 이후 결과를 반영하지 못하도록 차단한다.
// ============================================================
const liveDataSessionRef = React.useRef(0);

  const [lastSelectedKR, setLastSelectedKR] = useState(() => {
    return localStorage.getItem('sleek_last_symbol_KR') || '010170';
  });
  const [lastSelectedUS, setLastSelectedUS] = useState(() => {
    return localStorage.getItem('sleek_last_symbol_US') || 'NVDA';
  });
  const [displayCurrency, setDisplayCurrency] = useState<'KRW' | 'USD'>(() => {
    const lastMarket = localStorage.getItem('sleek_last_market');
    return lastMarket === 'US' ? 'USD' : 'KRW';
  });
  const [exchangeRate, setExchangeRate] = useState(1350);
  const [stocks, setStocks] = useState<Stock[]>(() => {
    const lastMarket = (localStorage.getItem('sleek_last_market') as 'KR' | 'US') || 'KR';
    const lastUS = localStorage.getItem('sleek_last_symbol_US') || 'NVDA';
    const lastKR = localStorage.getItem('sleek_last_symbol_KR') || '010170';
    const base = lastMarket === 'US' ? INITIAL_STOCKS : INITIAL_STOCKS_KR;
    const targetSym = lastMarket === 'US' ? lastUS : lastKR;
    if (!base.some(s => s.symbol === targetSym)) {
      const extra = POPULAR_STOCKS.find(s => s.symbol === targetSym) || {
        symbol: targetSym,
        name: targetSym,
        price: lastMarket === 'US' ? 10 : 1000,
        change: 0,
        changePercent: 0,
        volume: '0',
        history: [],
        market: lastMarket
      };
      return [extra as Stock, ...base];
    }
    return base;
  });
  const [selectedSymbol, setSelectedSymbol] = useState(() => {
    const lastMarket = localStorage.getItem('sleek_last_market') || 'KR';
    if (lastMarket === 'US') {
      return localStorage.getItem('sleek_last_symbol_US') || 'NVDA';
    }
    return localStorage.getItem('sleek_last_symbol_KR') || '010170';
  });
  // 🛡️ refreshStalePrices/syncSelectedPrice/syncLiveOrderbook을 감싸는 effect가 종목을 클릭할 때마다
  // (selectedSymbol이 바뀔 때마다) 통째로 재시작되면, 등록된 전체 종목을 25초마다 갱신해야 할
  // refreshStalePrices의 타이머가 클릭할 때마다 리셋되어 버려서 한 번도 제대로 실행되지 못하는 문제가
  // 있었다 — "선택 안 한 종목은 가격이 안 바뀐다"는 증상의 진짜 근본 원인이었을 가능성이 높다.
  // ref로 참조하면 effect의 dependency array에서 selectedSymbol을 뺄 수 있어 이 문제가 해결된다.
  const selectedSymbolRef = React.useRef(selectedSymbol);
  useEffect(() => { selectedSymbolRef.current = selectedSymbol; }, [selectedSymbol]);
  const [balance, setBalance] = useState(0); // User's money (will be synced via KIS)
  // 🛡️ balance가 바뀔 때마다(계좌 동기화 등) 메인 매매 엔진 루프의 effect가 재시작되지 않도록
  // ref로도 추적한다 — 루프 안에서는 항상 최신값을 ref로 읽고, effect의 dependency에서는 뺀다.
  const balanceRef = React.useRef(balance);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  const [principal, setPrincipal] = useState(0); // Investment principal (will be synced via KIS)
  // 💰 KIS가 직접 계산해서 주는 총자산(tot_evlu_amt = 예수금 + 보유종목 평가금액) — 로컬에서
  // balance + holdings×현재가로 재계산하는 대신, 이 값이 있으면 그대로 신뢰한다. KIS 응답이
  // 곧 SSOT(Single Source Of Truth)라는 원칙에 맞춘 것 — 로컬 계산은 holdings/현재가 동기화
  // 타이밍이 어긋나면 미세하게 다른 값이 나올 수 있지만, 이 값은 그럴 위험이 없다.
  const [kisTotalAssetValue, setKisTotalAssetValue] = useState<number>(0);
  const orderableKrwRef = React.useRef(0); // 매매 엔진용 최신 매수가능금액 (아래 state와 동기화)
  const [orderableKrw, setOrderableKrw] = useState<number>(() => {
    const saved = localStorage.getItem('sleek_orderable_krw');
    if (saved === '154000' || saved === '980543') {
      try { localStorage.removeItem('sleek_orderable_krw'); } catch {}
      return 0;
    }
    return saved !== null && !isNaN(Number(saved)) ? Number(saved) : 0;
  });
  orderableKrwRef.current = orderableKrw;
  // 🔍 주문가능원화 원본 필드값 진단용 — 어느 필드가 최종값을 결정했는지 화면에서 바로 비교할 수 있게 함
  const [orderableKrwDebug, setOrderableKrwDebug] = useState<{
    ord_psbl_cash: number;
    nrcy_ord_psbl_amt: number;
    ord_psbl_amt: number;
    dncl_amt: number;
    dnca_tot_amt: number;
    prvs_rcdl_excc_amt: number;
    queriedSymbol: string;
    usedField: string;
  } | null>(null);
  const [orderableUsd, setOrderableUsd] = useState<number>(() => {
    const saved = localStorage.getItem('sleek_orderable_usd');
    if (saved === '34.68') {
      try { localStorage.removeItem('sleek_orderable_usd'); } catch {}
      return 0;
    }
    return (saved !== null && !isNaN(Number(saved)) && Number(saved) !== 34.68) ? Number(saved) : 0;
  });
  const [kisTotalRealizedPnL, setKisTotalRealizedPnL] = useState<number | null>(null);
  
  useEffect(() => {
    localStorage.setItem('sleek_orderable_krw', String(orderableKrw));
  }, [orderableKrw]);

  useEffect(() => {
    if (orderableUsd !== 34.68) {
      localStorage.setItem('sleek_orderable_usd', String(orderableUsd));
    }
  }, [orderableUsd]);
  const [holdings, setHoldings] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('sleek_holdings') || '{}'); } catch { return {}; }
  });
  // 🛡️ holdings가 바뀔 때마다 메인 매매 엔진 루프가 재시작되지 않도록 ref로도 추적
  const holdingsRef = React.useRef(holdings);
  useEffect(() => { holdingsRef.current = holdings; }, [holdings]);

  // Track recently traded symbols to prevent race conditions during KIS balance polling lag
  const recentLocalTradesRef = React.useRef<Record<string, { timestamp: number; quantity: number; avgPrice: number }>>({});

  useEffect(() => {
    try {
      localStorage.setItem('sleek_holdings', JSON.stringify(holdings));
    } catch (e) {
      console.error("Failed to persist holdings", e);
    }
  }, [holdings]);
  const [avgPrices, setAvgPrices] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('sleek_avg_prices') || '{}'); } catch { return {}; }
  });
  // 🛡️ 매매 엔진(1초 반복)은 한 번 켜지면 하루 종일 다시 만들어지지 않아서, state를 직접 읽으면 "엔진이 켜진
  // 순간의 값"에 고정된다. 평균 매수가는 반드시 이 ref로 최신값을 읽는다(예전엔 엔진 시작 후 새로 산 종목의
  // 평균가가 0으로 보여 손절·트레일링 등 매도 판단 전체가 건너뛰어질 수 있었다).
  const avgPricesRef = React.useRef(avgPrices);
  avgPricesRef.current = avgPrices;

  useEffect(() => {
    try {
      localStorage.setItem('sleek_avg_prices', JSON.stringify(avgPrices));
    } catch (e) {
      console.error("Failed to persist avgPrices", e);
    }
  }, [avgPrices]);

  useEffect(() => {
    localStorage.setItem('sleek_last_market', marketType);
  }, [marketType]);

  useEffect(() => {
    localStorage.setItem('sleek_last_symbol', selectedSymbol);
    const isUS = /^[A-Z]/.test(selectedSymbol);
    if (marketType === 'KR' && !isUS) {
      setLastSelectedKR(selectedSymbol);
      localStorage.setItem('sleek_last_symbol_KR', selectedSymbol);
    } else if (marketType === 'US' && isUS) {
      setLastSelectedUS(selectedSymbol);
      localStorage.setItem('sleek_last_symbol_US', selectedSymbol);
    }
  }, [selectedSymbol, marketType]);
  const [sellableHoldings, setSellableHoldings] = useState<Record<string, number>>({});
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [time, setTime] = useState(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
  const [botStatus, setBotStatus] = useState<string>("대기 중...");

  // Authentication & Subscription State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Admin Panel State
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [allLicenses, setAllLicenses] = useState<any[]>([]);
  const [allAuthKeys, setAllAuthKeys] = useState<any[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminTab, setAdminTab] = useState<'users' | 'keys'>('users');

  // Key Activation State

  // Market Cache to persist added stocks
  const [stocksCache, setStocksCache] = useState<Record<'US' | 'KR', Stock[]>>({
    US: INITIAL_STOCKS,
    KR: INITIAL_STOCKS_KR
  });

  const [customStockNames, setCustomStockNames] = useState<Record<string, string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sleek_custom_stock_names') || '{}');
      const initialMap: Record<string, string> = { ...saved };
      INITIAL_STOCKS_KR.forEach(s => { initialMap[s.symbol] = s.name; });
      return initialMap;
    } catch {
      const initialMap: Record<string, string> = {};
      INITIAL_STOCKS_KR.forEach(s => { initialMap[s.symbol] = s.name; });
      return initialMap;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sleek_custom_stock_names', JSON.stringify(customStockNames));
    } catch (e) {
      console.error("Failed to persist customStockNames", e);
    }
  }, [customStockNames]);

  const getResolvedStockName = useCallback((symbol: string, stockObj?: { name?: string }) => {
    if (!symbol) return '';

    let resolved = symbol;

    if (customStockNames[symbol] && customStockNames[symbol] !== symbol) resolved = customStockNames[symbol];
    else if (stockObj?.name && stockObj.name !== symbol) resolved = stockObj.name;
    else {
      const foundInStocks = stocks.find(s => s.symbol === symbol);
      if (foundInStocks?.name && foundInStocks.name !== symbol) resolved = foundInStocks.name;
      else {
        const foundInCacheKR = stocksCache?.KR?.find(s => s.symbol === symbol);
        if (foundInCacheKR?.name && foundInCacheKR.name !== symbol) resolved = foundInCacheKR.name;
        else {
          const foundInCacheUS = stocksCache?.US?.find(s => s.symbol === symbol);
          if (foundInCacheUS?.name && foundInCacheUS.name !== symbol) resolved = foundInCacheUS.name;
          else {
            const foundInTabs = scalperTabsRef.current?.find(t => t.symbol === symbol);
            if (foundInTabs?.name && foundInTabs.name !== symbol) resolved = foundInTabs.name;
            else {
              const pop = POPULAR_STOCKS.find(s => s.symbol === symbol);
              if (pop?.name) resolved = pop.name;
              else {
                const foundInInitKR = INITIAL_STOCKS_KR.find(s => s.symbol === symbol);
                if (foundInInitKR?.name && foundInInitKR.name !== symbol) resolved = foundInInitKR.name;
              }
            }
          }
        }
      }
    }

    if (/^\d+$/.test(symbol) && resolved !== symbol) {
      resolved = resolved.replace(/\s*\([A-Za-z0-9\s,.-]+\)\s*$/, '').trim();
      resolved = resolved.replace(/\s+[A-Za-z]+(\s+[A-Za-z]+)*\s*$/, '').trim();
    }
    
    return resolved;
  }, [customStockNames, stocks, stocksCache]);

  // Use a ref to always have the latest stocks for intervals
  const stocksRef = React.useRef<Stock[]>(stocks);
  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);

  // Stock Search State
  const [searchSymbol, setSearchSymbol] = useState("");
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<StockSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // GLOBAL TRADE LOGS 필터 — 'ALL'이면 등록된 모든 종목의 로그를 보여주고, 특정 symbol이면 그 종목만 필터링
  const [searchCursorOffset, setSearchCursorOffset] = useState(0);
  const [aiRecommendations, setAiRecommendations] = useState<Stock[]>([]);
  const [isGettingRecommendations, setIsGettingRecommendations] = useState(false);
  const [showScalperRecModal, setShowScalperRecModal] = useState<boolean>(false);
  const [showGlobalTradeLogModal, setShowGlobalTradeLogModal] = useState<boolean>(false);
  const [showStrategySettings, setShowStrategySettings] = useState<boolean>(false); // ⚙️ 매매 기준 설정 창
  const [chartTarget, setChartTarget] = useState<{ symbol: string; name: string } | null>(null); // 📊 일봉 차트 창(종목 카드 더블클릭)
  const [scalperRecommendations, setScalperRecommendations] = useState<ScalperRecommendation[]>(() => kisService.getDefaultScalperRecommendations());
  const [isScalperRecLoading, setIsScalperRecLoading] = useState<boolean>(false);
  const searchRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const textMeasurerRef = React.useRef<HTMLSpanElement>(null);
  const isFirstMarketType = React.useRef(true);

  // KIS Configuration State
  const [kisConfig, setKisConfig] = useState({
    appKey: '',
    appSecret: '',
    accountNo: '',
    accountCode: '01',
    accountPw: '',
    htsId: '', // 🎯 HTS ID(계정 아이디, 계좌번호와 다름) — 실시간 체결통보 구독에 필요. 사용자 본인이 직접 입력
    isConnected: false,
    domesticOrderType: '00', // '00' (지정가 - Limit), '01' (시장가 - Market)
  });
  // 🚀 (2026-09-29) 시작 점검용 — 실행 중인 점검이 항상 "최신" 설정을 보도록(콜백에 갇힌 옛 값 방지)
  const kisConfigRef = React.useRef(kisConfig);
  kisConfigRef.current = kisConfig;
  // 로그인 후 사용자 설정(KIS 계좌 등)을 서버에서 다 불러왔는지 — 시작 점검이 이걸 기다린다
  const userSettingsLoadedRef = React.useRef(false);

  // 🎯 과제 1(멀티 앱키) — 계좌 #2~#4. 실시간 시세 수집 전용(주문은 절대 안 나감, 항상 계좌 #1로만
  // 나감). 앱키/앱시크릿이 비어있으면 자동으로 비활성(서버가 그 슬롯의 세션을 열지 않음).
  const [kisExtraAccounts, setKisExtraAccounts] = useState<{ slot: 2 | 3 | 4; appKey: string; appSecret: string }[]>([
    { slot: 2, appKey: '', appSecret: '' },
    { slot: 3, appKey: '', appSecret: '' },
    { slot: 4, appKey: '', appSecret: '' },
  ]);
  // 실제로 앱키+시크릿이 채워진(=활성화된) 추가 계좌만 서버로 보낸다
  // 계좌 #2~4 설정을 실제로 불러왔는지(또는 사용자가 직접 바꿨는지) — 그 전에는 저장된 계좌 수를 쓴다
  const [extraAccountsLoaded, setExtraAccountsLoaded] = useState(false);
  const activeKisExtraAccounts = kisExtraAccounts.filter(a => a.appKey.trim() && a.appSecret.trim());
  // 활성 슬롯 총 개수(계좌 #1 포함) — 실시간 인벤토리 한도·추천종목 개수 산정에 쓰인다
  const activeKisSlotCount = 1 + activeKisExtraAccounts.length;

  // 🎯 (2026-09-28 변경, 사용자 요청) 추천종목 10선 · 인벤토리 19종목 고정 — 앱키 개수로 늘리지 않는다.
  // 🎯 (2026-10-04 변경) 계좌 #2를 등록하면 인벤토리·추천종목이 38종목으로 늘어난다(계좌당 19종목, 최대 2계좌).
  // 설정을 불러오기 전(계좌 수가 아직 1로 보이는 동안)에는 직전에 쓰던 계좌 수를 그대로 쓴다.
  const kisAccountCountForLimit = extraAccountsLoaded
    ? effectiveKisAccountCount(activeKisSlotCount)
    : Math.max(effectiveKisAccountCount(activeKisSlotCount), readSavedKisAccountCount());
  MAX_INVENTORY_PER_MARKET = INVENTORY_LIMIT * kisAccountCountForLimit;
  setMaxScalperRecommendations(kisAccountCountForLimit);
  useEffect(() => {
    if (!extraAccountsLoaded) return;
    try { localStorage.setItem(KIS_ACCOUNT_COUNT_KEY, String(kisAccountCountForLimit)); } catch { /* 무시 */ }
  }, [kisAccountCountForLimit, extraAccountsLoaded]);

  // 🎯 계좌 #2 앱키를 시세 조회 전용으로 등록한다(현재가·분봉 조회, 추천종목 검색). 주문은 계좌 #1만.
  const quoteAccount2 = activeKisExtraAccounts.find(a => a.slot === 2) || null;
  const quoteAccount2Key = quoteAccount2 ? `${quoteAccount2.appKey}|${quoteAccount2.appSecret}` : '';
  useEffect(() => {
    kisService.setQuoteAccount(quoteAccount2 ? { appKey: quoteAccount2.appKey, appSecret: quoteAccount2.appSecret } : null);
  }, [quoteAccount2Key]);


  // Helper to get active config
  const getActiveKisConfig = (config: any) => {
    return {
      ...config,
      accountNo: config.accountNo.split('-')[0],
      accountCode: config.accountNo.split('-')[1] || config.accountCode || '01',
      isConnected: config.isConnected
    };
  };

  const formatCurrency = (val: number, forceKRW: boolean = false, customMarket?: 'KR' | 'US') => {
    if (val === undefined || val === null || isNaN(val)) return '-';
    const isUS = customMarket ? customMarket === 'US' : (!forceKRW && marketType === 'US');
    if (isUS) {
      return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${Math.round(val).toLocaleString()}원`;
  };

  const formatQuantity = (val: number) => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return Number(val).toLocaleString();
  };

  // 🛡️ 예전엔 선택된 종목 하나만의 호가를 담는 단일 상태(useState)였는데, 매수 점수제
  // (매도호가소진/매수호가우세)가 이 값을 참조하다 보니 선택 안 한 종목은 이 두 조건(+20점)을
  // 절대 받을 수 없는 구조적 문제가 있었다. 이제 종목별로 각자의 호가를 저장하는 Record로
  // 바꾼다 — ref로 관리해서 갱신될 때마다 불필요한 리렌더를 만들지 않는다.
  const liveOrderbooksRef = React.useRef<Record<string, any>>({});
  // 🕐 종목별 마지막 웹소켓 호가(H0STASP0) 수신 시각(2026-09-28 추가) — syncLiveOrderbook()의
  // REST 호가 조회(fetchLiveOrderbook)를 lastWsTickAtRef(체결가)와 같은 방식으로 "진짜로 오래
  // 안 갱신된 종목만" 백업하도록 만드는 데 쓴다. 실시간 배정 종목은 이미 이 웹소켓 호가로
  // liveOrderbooksRef가 계속 갱신되고 있어서, 그 위에 무조건 5초마다 REST 호가 조회까지 도는 것은
  // 불필요한 REST 호출이었다(외부 검토에서도 지적됨).
  const lastWsOrderbookTickAtRef = React.useRef<Record<string, number>>({});

  // ============================================================
  // 📐 3단계: 틱 기반 시장 통계 (종목별)
  //   · 정규장 VWAP: KIS가 계산해 보내는 가중평균주가(6번 필드)를 검증 후 사용, 안 되면 틱(가격×체결량)으로 직접 계산
  //   · 애프터 VWAP: 16:00 이후 틱만으로 직접 계산 (가격×체결량 합 ÷ 체결량 합)
  //   · 최근 60초 체결 횟수 / 최근 5분 거래대금(가격×체결량) — 애프터마켓 진입 필터용
  //   기존 센서의 'VWAP'(최근 가격 단순평균)은 매수 점수 규칙이 바뀌지 않도록 그대로 두고, 이 값은
  //   애프터마켓 진입 필터와 마감 보유 판단에서 쓴다.
  // ============================================================
  type TickMarketStats = {
    dayNo: number;
    kisWavg: number;                  // KIS 가중평균주가(정규장 VWAP) — 검증 전에도 저장만 해둠
    regPv: number; regV: number;      // 정규장 직접 계산용 Σ가격×체결량, Σ체결량
    aftPv: number; aftV: number;      // 애프터마켓 직접 계산용
    recent: { t: number; value: number; p?: number }[]; // 최근 5분 틱 (거래대금 = 가격×체결량, p = 체결가)
    firstAt?: number; // 이 종목 체결을 처음 받은 시각(5분 거래대금 환산용)
  };
  const tickMarketStatsRef = React.useRef<Record<string, TickMarketStats>>({});
  const tickFieldCheckRef = React.useRef<{ acmlVol: boolean; cntgVol: boolean; wavg: boolean; cvd: boolean }>({ acmlVol: false, cntgVol: false, wavg: false, cvd: false });

  // 🕯️ (2026-10-02) 1분봉(실시간 체결가로 직접 생성) — 연속 양봉 매수 차단용. 종목별 최근 12개만 보관.
  const candles1mRef = React.useRef<Record<string, { m: number; o: number; c: number }[]>>({});
  /** 방금 "완성된" 1분봉부터 거꾸로 세어 연속 양봉(종가 > 시가) 개수. 체결 없는 분이 끼면 거기서 끊는다. 진행 중인 봉은 세지 않는다. */
  const getConsecutiveBullish1mCandles = (symbol: string): number => {
    const list = candles1mRef.current[symbol];
    if (!list || list.length === 0) return 0;
    let expect = Math.floor(Date.now() / 60000) - 1;
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const cd = list[i];
      if (cd.m > expect) continue;          // 진행 중인 봉
      if (cd.m !== expect || !(cd.c > cd.o)) break;
      n++; expect--;
    }
    return n;
  };
  const updateTickMarketStats = (tick: { symbol: string; price: number; cntgVolume?: number; wavgPrice?: number }) => {
    try { onSignalTick(tick.symbol, tick.price); } catch { /* 신호 추적 실패는 매매와 무관 */ }
    try { onCaseTick(tick.symbol, tick.price); } catch { /* 케이스 기록 실패는 매매와 무관 */ }
    if (tick.price > 0) {
      const mi = Math.floor(Date.now() / 60000);
      const list = candles1mRef.current[tick.symbol] || (candles1mRef.current[tick.symbol] = []);
      const last = list[list.length - 1];
      if (last && last.m === mi) last.c = tick.price;
      else { list.push({ m: mi, o: tick.price, c: tick.price }); if (list.length > 12) list.shift(); }
    }
    const ext = positionExtremesRef.current[tick.symbol];
    if (ext && tick.price > 0) {
      if (tick.price > ext.max) ext.max = tick.price;
      if (tick.price < ext.min) ext.min = tick.price;
    }
    const now = Date.now();
    const dayNo = fastKstDayNo();
    let st = tickMarketStatsRef.current[tick.symbol];
    if (!st || st.dayNo !== dayNo) {
      st = { dayNo, kisWavg: 0, regPv: 0, regV: 0, aftPv: 0, aftV: 0, recent: [], firstAt: Date.now() };
      tickMarketStatsRef.current[tick.symbol] = st;
    }
    const mins = fastKstMinutes();
    const vol = tick.cntgVolume && tick.cntgVolume > 0 ? tick.cntgVolume : 0;
    if (mins < 15 * 60 + 30) {
      if (tick.wavgPrice && tick.wavgPrice > 0) st.kisWavg = tick.wavgPrice;
      if (vol > 0) { st.regPv += tick.price * vol; st.regV += vol; }
    } else if (mins >= 16 * 60) {
      if (vol > 0) { st.aftPv += tick.price * vol; st.aftV += vol; }
    }
    st.recent.push({ t: now, value: vol > 0 ? tick.price * vol : 0, p: tick.price });
    // 5분보다 오래된 틱 정리 (앞쪽부터)
    let drop = 0;
    while (drop < st.recent.length && now - st.recent[drop].t > 300000) drop++;
    if (drop > 0) st.recent.splice(0, drop);
    if (st.recent.length > 3000) st.recent.splice(0, st.recent.length - 3000);
  };

  /** 종목의 진짜 VWAP (정규장 / 애프터) — 데이터가 없으면 0 */
  const getTrueVwaps = (symbol: string): { regular: number; after: number; regularSource: 'KIS' | 'CALC' | 'NONE' } => {
    const st = tickMarketStatsRef.current[symbol];
    if (!st || st.dayNo !== fastKstDayNo()) return { regular: 0, after: 0, regularSource: 'NONE' };
    const calcReg = st.regV > 0 ? st.regPv / st.regV : 0;
    const useKis = tickFieldCheckRef.current.wavg && st.kisWavg > 0;
    const regular = useKis ? st.kisWavg : (tickFieldCheckRef.current.cntgVol ? calcReg : 0);
    const after = tickFieldCheckRef.current.cntgVol && st.aftV > 0 ? st.aftPv / st.aftV : 0;
    return { regular, after, regularSource: useKis ? 'KIS' : regular > 0 ? 'CALC' : 'NONE' };
  };

const getCurrentTrueVwap = (
  symbol: string,
  fallbackPrice: number
): number => {

  const tv = getTrueVwaps(symbol);

  if (tv.regular > 0) {
    return tv.regular;
  }

  if (tv.after > 0) {
    return tv.after;
  }

  return fallbackPrice;
};


  
  /** 최근 60초 체결 횟수, 최근 5분 거래대금(원) */
  const getTickActivity = (symbol: string): { ticks60s: number; tradeValue5m: number } => {
    const st = tickMarketStatsRef.current[symbol];
    if (!st) return { ticks60s: 0, tradeValue5m: 0 };
    const now = Date.now();
    let ticks60s = 0; let tradeValue5m = 0;
    for (let i = st.recent.length - 1; i >= 0; i--) {
      const e = st.recent[i];
      if (now - e.t > 300000) break;
      tradeValue5m += e.value;
      if (now - e.t <= 60000) ticks60s++;
    }
    return { ticks60s, tradeValue5m };
  };

  /** (기록 전용) 최근 3분 고점 대비 위치·3분 상승률·30초 전 기준 60초 체결 건수 */
  const getRecentPriceStats = (symbol: string, price: number): { high3mGapPct?: number; rise3mPct?: number; ticks60sPrev?: number } => {
    const st = tickMarketStatsRef.current[symbol];
    if (!st || !st.recent || st.recent.length === 0 || !(price > 0)) return {};
    const now = Date.now();
    let high = 0; let firstP = 0; let prevTicks = 0;
    for (let i = st.recent.length - 1; i >= 0; i--) {
      const e = st.recent[i];
      const age = now - e.t;
      if (age > 180000) break;
      if (e.p && e.p > 0) { if (e.p > high) high = e.p; firstP = e.p; }
      if (age > 30000 && age <= 90000) prevTicks++;
    }
    return {
      high3mGapPct: high > 0 ? Number((Math.max(0, (high - price) / high) * 100).toFixed(3)) : undefined,
      rise3mPct: firstP > 0 ? Number((((price - firstP) / firstP) * 100).toFixed(3)) : undefined,
      ticks60sPrev: prevTicks,
    };
  };

  // 💧 (2026-10-06) 유동성 구분을 종목별로 "미리 정하고 유지"한다 — 추천·퇴출·매수·매도가 같은 구분을 쓰도록.
  //   인벤토리에 들어올 때(추천의 구분 또는 첫 판단 때의 5분 거래대금) 정하고, 10분마다 다시 보되
  //   경계를 20% 이상 넘었을 때만 바꾼다(4.9억 ↔ 5.1억처럼 경계에서 오락가락하지 않게).
  const tierStateRef = React.useRef<Record<string, { tier: LiquidityTier; at: number; seed?: boolean }>>({});
  const getStableTier = (symbol: string): LiquidityTier => {
    const LPt = getLiveParams();
    const cur = tierStateRef.current[symbol];
    const now = Date.now();
    // (2026-10-07) 추천 때 추정한 구분(seed)은 2분만 쓴다 — 순간 체결이 몰린 추정값이라 얇은 종목이 '대형·중형'으로 붙는 일이 있었다.
    if (cur && now - cur.at < (cur.seed ? TIER_SEED_MS : 10 * 60 * 1000)) return cur.tier;
    const est = tickFieldCheckRef.current.cntgVol ? getTradeValue5mEst(symbol) : { value: 0, spanSec: 0 };
    if (!(est.spanSec >= 60)) return cur ? cur.tier : liquidityTierOf(undefined, LPt); // 아직 자료가 부족하면 기존 구분(없으면 기본값) 유지
    const tv = est.value;
    let next: LiquidityTier = liquidityTierOf(tv, LPt);
    if (cur && !cur.seed && next !== cur.tier) { // seed는 실제 5분 거래대금으로 그대로 교체(완충 없음)
      const big = LPt.tierLargeTradeValue5m, mid = LPt.tierMidTradeValue5m;
      const rank = (t: LiquidityTier) => (t === 'LARGE' ? 2 : t === 'MID' ? 1 : 0);
      const up = rank(next) > rank(cur.tier);
      // 올라갈 때는 넘은 경계의 120% 이상, 내려갈 때는 80% 미만이어야 바꾼다
      const boundary = up ? (cur.tier === 'SMALL' ? mid : big) : (cur.tier === 'LARGE' ? big : mid);
      const crossed = up ? tv >= boundary * 1.2 : tv < boundary * 0.8;
      if (!crossed) next = cur.tier;
      else if (up && cur.tier === 'SMALL' && next === 'LARGE' && tv < big * 1.2) next = 'MID';
      else if (!up && cur.tier === 'LARGE' && next === 'SMALL' && tv >= mid * 0.8) next = 'MID';
    }
    tierStateRef.current[symbol] = { tier: next, at: now };
    return next;
  };

  /** 최근 5분 거래대금 추정 — 편입 직후처럼 수집된 체결이 5분이 안 되면 수집 구간(최소 60초)을 5분으로 환산한다 */
  const getTradeValue5mEst = (symbol: string): { value: number; spanSec: number } => {
    const st = tickMarketStatsRef.current[symbol];
    if (!st || !st.recent || st.recent.length === 0) return { value: 0, spanSec: 0 };
    const now = Date.now();
    let value = 0; let oldest = now;
    for (let i = st.recent.length - 1; i >= 0; i--) {
      const e = st.recent[i];
      if (now - e.t > 300000) break;
      value += e.value; oldest = e.t;
    }
    const firstSeen = st.firstAt || st.recent[0]?.t || oldest; // 조용한 구간 때문에 앞쪽 틱이 정리된 경우는 환산하지 않도록 최초 수신 시각 기준
    const spanMs = Math.min(300000, now - firstSeen);
    if (spanMs >= 270000) return { value, spanSec: 300 };
    if (spanMs < 60000) return { value: value * 5, spanSec: Math.round(spanMs / 1000) }; // 1분 미만 — 1분치로 보고 5배(과대평가 쪽)
    return { value: value * (300000 / spanMs), spanSec: Math.round(spanMs / 1000) };
  };

  /** 🌙 애프터마켓 진입 필터 — 하나라도 걸리면 매수하지 않는다 */
  const checkAfterEntryGate = (stock: Stock): { ok: boolean; reasons: string[] } => {
    const reasons: string[] = [];
    const sym = stock.symbol;
    const price = stock.price || 0;
    const act = getTickActivity(sym);
    // ① 거래대금 (최근 5분, 가격×체결량)
    if (!tickFieldCheckRef.current.cntgVol) reasons.push('체결량 필드 미검증 → 거래대금 확인 불가');
    else if (act.tradeValue5m < AFTER_MIN_TRADE_VALUE_5M) reasons.push(`5분 거래대금 ${Math.round(act.tradeValue5m / 10000).toLocaleString()}만원 < ${(AFTER_MIN_TRADE_VALUE_5M / 10000).toLocaleString()}만원`);
    // ② 체결 빈도 (최근 60초 실시간 체결 횟수)
    if (act.ticks60s < AFTER_MIN_TICKS_60S) reasons.push(`60초 체결 ${act.ticks60s}회 < ${AFTER_MIN_TICKS_60S}회`);
    // ③ 호가 스프레드
    const ob = liveOrderbooksRef.current[sym];
    const bid1 = Number(ob?.bidPrice1 || 0);
    const ask1 = Number(ob?.askPrice1 || 0);
    if (!(bid1 > 0 && ask1 > 0)) reasons.push('실시간 호가 없음');
    else {
      const tick = getTickSize(price || bid1, 'KR');
      const spreadTicks = Math.round((ask1 - bid1) / tick);
      if (spreadTicks > AFTER_MAX_SPREAD_TICKS) reasons.push(`스프레드 ${spreadTicks}틱 > ${AFTER_MAX_SPREAD_TICKS}틱`);
    }
    // ④ CVD — 필드가 검증되고 매수 체결 우위일 때만 (거래량·체결 빈도 조건은 ①②에서 함께 요구됨)
    const cvd = (stock as any).realCvd;
    if (!tickFieldCheckRef.current.cvd) reasons.push('CVD 필드 미검증');
    else if (typeof cvd !== 'number') reasons.push('CVD 데이터 없음');
    else if (cvd <= 0) reasons.push('CVD 매도 우위');
    // ⑤ VWAP — 정규장 VWAP과 애프터 VWAP 둘 다 위
    const tv = getTrueVwaps(sym);
    if (!(tv.regular > 0 && tv.after > 0)) reasons.push('VWAP 데이터 부족(정규/애프터)');
    else if (!(price > tv.regular && price > tv.after)) reasons.push(`VWAP 아래 (정규 ${Math.round(tv.regular).toLocaleString()} / 애프터 ${Math.round(tv.after).toLocaleString()})`);
    return { ok: reasons.length === 0, reasons };
  };
  const afterGateLogAtRef = React.useRef<Record<string, number>>({});

  // ============================================================
  // 💧 (2026-10-04) 종목별 익절 기준 — 진입 시점의 5분 거래대금으로 유동성 구분(대형/중형/소형)을 정하고,
  // 그 구분의 익절 목표(트레일링 시작 순수익 %)를 포지션이 끝날 때까지 고정해서 쓴다.
  //   대형(20억 이상) +0.5% / 중형(5억~20억) +0.8% / 소형(5억 미만) +1.2% — 값은 전략 버전(자기최적화 대상)에서 읽는다.
  // 보유 중에 거래대금이 변해도 기준이 흔들리지 않도록 진입 때 한 번만 정하고, 새로고침해도 유지되게 저장한다.
  // 체결량 필드가 검증되지 않아 거래대금을 모르면 중형으로 본다.
  // ============================================================
  type ExitPlan = { tier: LiquidityTier; targetPct: number; stopPct: number; tradeValue5m?: number; at: number };
  const EXIT_PLAN_KEY = 'sleek_exit_plans_v1';
  const exitPlanRef = React.useRef<Record<string, ExitPlan>>((() => {
    try { const raw = localStorage.getItem(EXIT_PLAN_KEY); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  })());
  const persistExitPlans = () => { try { localStorage.setItem(EXIT_PLAN_KEY, JSON.stringify(exitPlanRef.current)); } catch { /* 무시 */ } };
  /** 지금 이 종목에 새로 들어간다면 적용될 익절 기준 (저장하지 않음) */
  const computeExitPlan = (symbol: string): ExitPlan => {
    const LPx = getLiveParams();
    const tv = tickFieldCheckRef.current.cntgVol ? Math.round(getTradeValue5mEst(symbol).value) : undefined;
    const tier = getStableTier(symbol); // (2026-10-06) 미리 정해 둔 구분을 쓴다 — 매수 기준과 익절·손절이 같은 구분
    return { tier, targetPct: sellTargetOfTier(tier, LPx), stopPct: sellStopOfTier(tier, LPx), tradeValue5m: tv, at: Date.now() };
  };
  /** 보유 포지션의 익절 기준 — 없으면 지금 값으로 정해서 저장하고 로그·케이스에 남긴다 */
  const ensureExitPlan = (symbol: string): ExitPlan => {
    const existing = exitPlanRef.current[symbol];
    if (existing && Number.isFinite(existing.targetPct) && existing.targetPct > 0) {
      // 손절 기준이 없는 예전 저장값은 같은 구분의 손절로 채운다
      if (!(Number(existing.stopPct) < 0)) { existing.stopPct = sellStopOfTier(existing.tier, getLiveParams()); persistExitPlans(); }
      return existing;
    }
    const plan = computeExitPlan(symbol);
    exitPlanRef.current[symbol] = plan;
    persistExitPlans();
    try { setCaseExitPlan(symbol, { tier: plan.tier, targetNetPct: plan.targetPct, stopNetPct: plan.stopPct, tradeValue5m: plan.tradeValue5m }); } catch { /* 무시 */ }
    addLogRef.current?.(symbol, '매수', 0, 0, `[익절·손절 기준] ${LIQUIDITY_TIER_LABEL[plan.tier]}(5분 거래대금 ${plan.tradeValue5m !== undefined ? `${(plan.tradeValue5m / 1e8).toFixed(1)}억` : '확인 불가 → 중형으로 처리'}) → 고점 순수익 +${plan.targetPct}%부터 트레일링 · 순손실 ${plan.stopPct}% 손절`);
    return plan;
  };
  const clearExitPlan = (symbol: string) => {
    if (!exitPlanRef.current[symbol]) return;
    delete exitPlanRef.current[symbol];
    persistExitPlans();
  };

  // 🔬 필드 검증 결과를 30초마다 반영하고, 처음 확정됐을 때 한 번 로그로 남긴다
  const tickFieldReportedRef = React.useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      const c = getTickFieldCheck();
      tickFieldCheckRef.current = { acmlVol: c.acmlVol.verified, cntgVol: c.cntgVol.verified, wavg: c.wavg.verified, cvd: c.cvd.verified };
      const enough = (Object.values(c) as { samples: number }[]).every(v => v.samples >= 100);
      if (enough && !tickFieldReportedRef.current) {
        tickFieldReportedRef.current = true;
        const label: Record<string, string> = { acmlVol: '누적거래량(13)', cntgVol: '체결량(12)', wavg: '가중평균주가(6)', range: '고가/저가(8,9)', cvd: 'CVD 매도/매수 체결량(19,20)', quote: '매도1/매수1호가(10,11)' };
        const summary = Object.entries(c).map(([k, v]) => `${label[k] || k} ${v.verified ? '✅' : '❌'} ${(v.passRate * 100).toFixed(1)}%`).join(' · ');
        console.log('[KIS 실시간 필드 검증 결과]', c);
        addLogRef.current?.('SYSTEM', '매수', 0, 0, `[필드 검증] ${summary} — ✅만 매매 판단에 사용`);
      }
    }, 30000);
    return () => clearInterval(t);
  }, []);
  const addLogRef = React.useRef<((...args: any[]) => void) | null>(null);
  const showNotificationRef = React.useRef<((message: string, type?: 'success' | 'error' | 'info') => void) | null>(null); // 먼저 선언된 effect가 알림을 띄울 때 사용
  // 🎯 인벤토리 카드의 A(매도호가 소진)/D(매수호가 우세) LED 표시용 — liveOrderbooksRef는 ref라 화면이
  // 다시 그려지지 않으므로, 아래 1초 주기 effect가 값이 실제로 바뀐 경우에만 이 state를 갱신한다.
  // 📒 매매 일지 — 매수 주문 직전에 찍어둔 신호 스냅샷(종목별). 체결 로그가 들어오면 로트에 붙이고 지운다.
  const pendingEntrySignalsRef = React.useRef<Record<string, EntrySignals>>({});
  // 📒 매도 판단 순간의 상황 (판단 가격·발동 규칙·고점) — 매도 체결 로그가 들어오면 일지에 붙이고 지운다
  // 👻 가상 매도(로그 전용) — 같은 포지션(종목_평단)·같은 단계는 한 번만 기록 / CVD 10초 전 값·하락 여부
  const shadowLoggedRef = React.useRef<Record<string, boolean>>({});
  const trailingHoldLoggedRef = React.useRef<Record<string, string>>({}); // 트레일링 보류 로그를 고점당 1회만
  // 🛟 슬롯3 방어 상태(종목별) — 새로고침해도 대기 시간·처음 평단이 유지되도록 localStorage에 저장
  const rescueRef = React.useRef<Record<string, { phase: 'WAITING' | 'FILLED' | 'EXPIRED'; openedAt: number; baseAvg: number; baseQty: number; baseSlots: number; filledAt?: number }>>((() => {
    if (!RESCUE_SLOT_ENABLED) { try { localStorage.removeItem('sleek_rescue_slot_v1'); } catch { /* 무시 */ } return {}; } // 방어 꺼짐 — 남은 대기 상태 폐기
    try { const raw = localStorage.getItem('sleek_rescue_slot_v1'); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  })());
  const [rescueView, setRescueView] = useState<Record<string, { phase: 'WAITING' | 'FILLED' | 'EXPIRED'; openedAt: number }>>(() => {
    const view: Record<string, { phase: 'WAITING' | 'FILLED' | 'EXPIRED'; openedAt: number }> = {};
    Object.keys(rescueRef.current).forEach(k => { const v = rescueRef.current[k]; view[k] = { phase: v.phase, openedAt: v.openedAt }; });
    return view;
  });
  const persistRescue = () => {
    try { localStorage.setItem('sleek_rescue_slot_v1', JSON.stringify(rescueRef.current)); } catch { /* 무시 */ }
    const view: Record<string, { phase: 'WAITING' | 'FILLED' | 'EXPIRED'; openedAt: number }> = {};
    Object.keys(rescueRef.current).forEach(k => { const v = rescueRef.current[k]; view[k] = { phase: v.phase, openedAt: v.openedAt }; });
    setRescueView(view);
  };
  const shadowCvdRef = React.useRef<Record<string, { v: number; t: number }>>({});
  const shadowCvdFallingRef = React.useRef<Record<string, boolean>>({});
  const pendingExitContextRef = React.useRef<Record<string, { at: number; triggerPrice: number; rule?: string; peakPrice?: number; dropTicks?: number }>>({});
  // 📈 보유 중 최고가/최저가 (MFE/MAE) — 첫 매수 체결 때 만들고, 틱마다 갱신, 보유 로트가 모두 청산되면 지운다
  const positionExtremesRef = React.useRef<Record<string, { max: number; min: number }>>({});
  // ⏱️ 사후 확인 예약 — 막힌 신호 3분/10분 뒤 가격, 마감 매도 판단 30분 뒤 가격
  const followUpsRef = React.useRef<{ due: number; kind: 'missed3' | 'missed10' | 'decision30'; id: string; symbol: string; basePrice: number }[]>([]);
  // 👻 트레일링 3틱 가상 비교(로그 전용, 2026-09-28) — 실제 매도는 2틱 트레일링 그대로. 2틱으로 팔린 뒤에도
  // 그 종목의 실시간 가격을 계속 보면서 "3틱이었다면 언제·얼마에 팔렸을지"를 추적해 가상 매도 기록으로 남긴다.
  // 새로고침하면 추적 중이던 것은 사라진다(기록되지 않을 뿐, 실제 매매에는 영향 없음).
  const trail3TrackersRef = React.useRef<Record<string, {
    symbol: string; name: string; avg: number; peak: number; startedAt: number;
    base2Price: number; base2NetPct: number; isUS: boolean;
  }>>({});
  // 🟡 (2026-09-29 과제2) 매수 준비/매수 중 상태 정리용 — 상태가 마지막으로 바뀐 시각 / 엔진이 매수 조건 충족을 마지막으로 확인한 시각
  const lifecycleChangedAtRef = React.useRef<Record<string, number>>({});
  const buyReadyAssertedAtRef = React.useRef<Record<string, number>>({});
  const TRAIL3_TICKS = 3;
  const TRAIL3_MAX_TRACK_MS = 30 * 60 * 1000; // 30분 안에 3틱 하락이 안 나오면 마지막 가격으로 마감
  React.useEffect(() => {
    const iv = setInterval(() => {
      const trackers = trail3TrackersRef.current;
      const keys = Object.keys(trackers);
      if (keys.length === 0) return;
      const now = Date.now();
      for (const key of keys) {
        const t = trackers[key];
        const st = stocksRef.current.find(x => x.symbol === t.symbol);
        const price = Number(st?.price) || 0;
        if (!(price > 0)) {
          if (now - t.startedAt > TRAIL3_MAX_TRACK_MS) delete trackers[key];
          continue;
        }
        if (price > t.peak) t.peak = price;
        const tick = getTickSize(t.peak, t.isUS ? 'US' : 'KR');
        const drop = tick > 0 ? Math.floor((t.peak - price) / tick + 1e-9) : 0;
        const timedOut = now - t.startedAt > TRAIL3_MAX_TRACK_MS;
        if (drop >= TRAIL3_TICKS || timedOut) {
          const net = calculateNetProfitPercent(t.avg, price, t.isUS ? 'US' : 'KR');
          const heldSec = Math.round((now - t.startedAt) / 1000);
          try {
            recordShadowExit({
              time: now, symbol: t.symbol, name: t.name, kind: 'TRAIL3', level: timedOut ? '3틱(30분 만료)' : '3틱',
              detail: timedOut
                ? `2틱 매도(${t.base2Price.toLocaleString()}) 후 30분간 3틱 하락 없음 · 최고 ${t.peak.toLocaleString()} → 마지막 ${price.toLocaleString()} 기준`
                : `2틱 매도(${t.base2Price.toLocaleString()}) ${heldSec}초 뒤 · 고점 ${t.peak.toLocaleString()} → ${drop}틱 하락 ${price.toLocaleString()}`,
              price, netPct: Number(net.toFixed(3)), entryPrice: t.avg,
              actualNetPct: Number(t.base2NetPct.toFixed(3)), actualExitTime: t.startedAt, actualExitReason: 'TRAILING_STOP(2틱 판단가)',
            });
          } catch { /* 기록 실패는 매매와 무관 */ }
          delete trackers[key];
        }
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  // 🟡 (2026-09-29 과제2 매수 순서 점검) "매수 준비/매수 중" 상태에 멈춘 카드 정리.
  // 예전엔 매수가 차단·실패·미체결 취소·체결 없이 종료되어도 카드 상태가 BUY_READY/BUYING(노란 테두리)에 그대로 남았다.
  // 이 상태는 "주문 진행 중"으로 취급돼 인벤토리 교체(퇴출) 대상에서 영구히 제외되고 실시간 우선순위도 차지해서,
  // 19칸 인벤토리가 실제로는 아무 주문도 없는 종목에 막히는 원인이 됐다. 이제 3초마다 확인해서
  //  - 보유 중이면 → HOLDING
  //  - 미체결 매수·전송 중 주문이 없고, 매수 조건 충족 확인이 10초 이상 없으면(BUY_READY) / 상태가 10초 이상 그대로면(BUYING) → WATCHING
  const rescueZeroSinceRef = React.useRef<Record<string, number>>({});
  React.useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      // 🛟 (2026-09-30) 보유 0주인데 남은 슬롯3 방어 상태 정리 — 예전엔 매매 엔진 안에서만 지웠는데, 엔진은 미보유 종목이
      // 실시간 틱이 뜸하면(또는 봇이 꺼져 있으면) 건너뛰어서, 포지션이 끝났는데도 카드에 "슬롯3 대기 0:00"이 계속 남았다
      // (쏠리드 사례). 게다가 남은 상태가 다음 신규 진입에 옛 평단 기준 방어·손절을 물려줄 위험이 있었다.
      // KIS 잔고로 0주가 확인되고, 진행 중 주문이 없는 상태가 5초 이상 이어지면 지운다.
      {
        let changed = false;
        for (const sym of Object.keys(rescueRef.current)) {
          const busy = (holdingsRef.current[sym] || 0) > 0
            || pendingBuyOrdersRef.current.some(o => o.symbol === sym) || pendingSellOrdersRef.current.some(o => o.symbol === sym)
            || pendingTradeKeysRef.current.has(`${sym}_BUY`) || pendingTradeKeysRef.current.has(`${sym}_SELL`);
          if (!kisHoldingsConfirmedRef.current || busy) { delete rescueZeroSinceRef.current[sym]; continue; }
          const since = rescueZeroSinceRef.current[sym] || (rescueZeroSinceRef.current[sym] = now);
          if (now - since < 5000) continue;
          delete rescueRef.current[sym];
          delete rescueZeroSinceRef.current[sym];
          changed = true;
          addLogRef.current?.(sym, '매도', 0, 0, '[슬롯3 방어 정리] 보유 0주 확인 — 대기 상태 해제');
        }
        if (changed) persistRescue();
      }
      for (const t of scalperTabsRef.current) {
        const st = t.lifecycleStatus;
        const sym = t.symbol;
        // 🟢 (2026-09-29) 보유 중인데 "관망"(WATCHING)으로 표시되는 카드 정리 — 잔고 동기화로 들어온 보유분(체결 확인 경로를
        // 거치지 않음)이나, 일부만 매도된 뒤 "매도완료 → 5초 뒤 관망"으로 넘어간 경우 보유 중인데도 초록 테두리가 없었다.
        // 매매 판단(손절·트레일링)은 상태가 아니라 보유수량 기준이라 영향은 없었지만, 화면 표시를 실제와 맞춘다.
        if (kisHoldingsConfirmedRef.current && (st === 'WATCHING' || !st) && (holdingsRef.current[sym] || 0) > 0) {
          const busy = pendingBuyOrdersRef.current.some(o => o.symbol === sym) || pendingSellOrdersRef.current.some(o => o.symbol === sym)
            || pendingTradeKeysRef.current.has(`${sym}_BUY`) || pendingTradeKeysRef.current.has(`${sym}_SELL`);
          if (!busy && now - (lifecycleChangedAtRef.current[sym] || 0) > 3000) {
            transitionLifecycleStatus(sym, 'HOLDING', `보유 ${holdingsRef.current[sym]}주 확인`);
          }
          continue;
        }
        // 🟢 반대로 보유수량 0인데 "보유중"으로 남은 카드(새로고침 전 상태가 저장돼 있다가 복원된 경우 등) → 관망으로
        if (kisHoldingsConfirmedRef.current && st === 'HOLDING' && !((holdingsRef.current[sym] || 0) > 0)) {
          const busy = pendingSellOrdersRef.current.some(o => o.symbol === sym) || pendingTradeKeysRef.current.has(`${sym}_SELL`)
            || pendingBuyOrdersRef.current.some(o => o.symbol === sym) || pendingTradeKeysRef.current.has(`${sym}_BUY`);
          if (!busy && now - (lifecycleChangedAtRef.current[sym] || 0) > 5000) {
            transitionLifecycleStatus(sym, 'WATCHING', '보유 0주 확인(KIS 잔고) — 관망으로 복귀');
          }
          continue;
        }
        // 🔴 (2026-09-29) 매도 쪽도 같은 정리 — 매도 주문이 체결·취소·거부로 끝났거나 KIS 앱에서 직접 판 뒤에도
        // 카드가 "매도중"(SELL_READY/SELLING)에 남던 문제. 진행 중인 매도 주문(미체결·전송 중)이 없고 상태가
        // 10초 이상 그대로면 → 보유 중이면 HOLDING, 아니면 WATCHING.
        if (st === 'SELL_READY' || st === 'SELLING') {
          const hasPendingSell = pendingSellOrdersRef.current.some(o => o.symbol === sym);
          const sellInFlight = pendingTradeKeysRef.current.has(`${sym}_SELL`);
          if (hasPendingSell || sellInFlight) continue;
          if (now - (lifecycleChangedAtRef.current[sym] || 0) <= 10000) continue;
          if ((holdingsRef.current[sym] || 0) > 0) transitionLifecycleStatus(sym, 'HOLDING', '진행 중인 매도 주문 없음 · 보유 유지');
          else transitionLifecycleStatus(sym, 'WATCHING', '매도 완료(보유 0) · 진행 중인 매도 주문 없음');
          continue;
        }
        if (st !== 'BUY_READY' && st !== 'BUYING') continue;
        const hasPendingBuy = pendingBuyOrdersRef.current.some(o => o.symbol === sym);
        const inFlight = buyingLockPricesRef.current.some(p => p.symbol === sym) || pendingTradeKeysRef.current.has(`${sym}_BUY`);
        if (hasPendingBuy || inFlight) continue;
        const stale = st === 'BUY_READY'
          ? now - (buyReadyAssertedAtRef.current[sym] || 0) > 10000
          : now - (lifecycleChangedAtRef.current[sym] || 0) > 10000;
        if (!stale) continue; // 엔진이 아직 매수 조건 충족을 확인 중이거나 방금 바뀐 상태 — 그대로 둔다(상태 왕복 로그 방지)
        if ((holdingsRef.current[sym] || 0) > 0) {
          transitionLifecycleStatus(sym, 'HOLDING', st === 'BUY_READY' ? '추가 매수 조건 해제 · 보유 유지' : '추가 매수 주문 종료 · 보유 유지');
        } else {
          transitionLifecycleStatus(sym, 'WATCHING', st === 'BUY_READY' ? '매수 조건 해제 · 진행 중인 매수 주문 없음' : '매수 주문 종료(미체결 취소·실패·차단) · 보유 없음');
        }
      }
    }, 3000);
    return () => clearInterval(iv);
  }, []);
  const missedThrottleRef = React.useRef<Record<string, number>>({});
  const noteMissedSignal = (symbol: string, name: string, category: string, detail: string, price: number) => {
    if (!(price > 0) || symbol === 'SYSTEM') return;
    const now = Date.now();
    if (now - (missedThrottleRef.current[symbol] || 0) < 60000) return; // 같은 종목은 1분에 한 번만
    missedThrottleRef.current[symbol] = now;
    const id = recordMissedSignal({ time: now, symbol, name, category, detail, price });
    followUpsRef.current.push({ due: now + 3 * 60000, kind: 'missed3', id, symbol, basePrice: price });
    followUpsRef.current.push({ due: now + 10 * 60000, kind: 'missed10', id, symbol, basePrice: price });
  };
  const [orderbookSignals, setOrderbookSignals] = useState<Record<string, { askDepletion: boolean; bidDominant: boolean; bidAskRatio?: number }>>({});
  const orderbookCursorRef = React.useRef<number>(0);
  const [showKisModal, setShowKisModal] = useState(false);
  const [isAppInitialized, setIsAppInitialized] = useState(false);

  // KIS Token Validity & Real-time Countdown State
  const [tokenInfo, setTokenInfo] = useState(() => kisService.getTokenInfo());
  const [isForceRefreshingToken, setIsForceRefreshingToken] = useState(false);

  useEffect(() => {
    // Initial fetch
    setTokenInfo(kisService.getTokenInfo());

    const timer = setInterval(() => {
      setTokenInfo(kisService.getTokenInfo());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRefreshToken = async () => {
    if (isForceRefreshingToken) return;
    setIsForceRefreshingToken(true);
    try {
      await kisService.forceRefreshToken();
      const updated = kisService.getTokenInfo();
      setTokenInfo(updated);
      showNotification(`KIS 보안 토큰이 성공적으로 갱신되었습니다. (유효: ${updated.formattedRemaining})`, "success");
    } catch (err: any) {
      console.error("Token refresh error:", err);
      showNotification(`토큰 갱신 실패: ${err.message || 'API 키 설정을 확인해주세요.'}`, "error");
    } finally {
      setIsForceRefreshingToken(false);
    }
  };
  // 🚀 시작 점검 단계 (2026-09-29 재작성) — 예전 5단계 중 실제로 확인하던 건 계좌 잔고 동기화 하나뿐이고, 나머지는
  // 잠깐 기다렸다가 미리 써둔 "완료" 문구(KOSPI 지수·10호가·10분할 슬롯 등)를 띄웠다. 이제 실제로 하는 일만 보여준다.
  const [startupSteps, setStartupSteps] = useState<StepItem[]>([
    { id: 'auth-check', title: '1. KIS 연결 설정 확인', desc: '앱키·계좌번호가 등록돼 있는지와 서버 연결 상태를 확인합니다.', status: 'pending' },
    { id: 'market-feed', title: '2. 인벤토리 종목 시세 수신', desc: '인벤토리 종목의 현재가가 들어왔는지 확인합니다. (시작 후에도 실시간으로 계속 갱신)', status: 'pending' },
    { id: 'order-recover', title: '3. 미체결 주문 복구', desc: '새로고침 전에 이미 접수돼 있던 미체결 매도주문을 KIS에서 불러와 이어서 관리합니다.', status: 'pending' },
    { id: 'balance-check', title: '4. 계좌 잔고 · 주문가능금액', desc: 'KIS 실계좌의 보유 종목과 주문가능금액을 불러옵니다.', status: 'pending' },
    { id: 'rules-check', title: '5. 매매 규칙 확인', desc: '지금 적용되는 진입금액·목표·손절 값입니다. (화면에서 언제든 변경 가능)', status: 'pending' },
  ]);
  const [initSyncState, setInitSyncState] = useState<{
    status: 'idle' | 'syncing' | 'ready' | 'error';
    progress: number;
    currentStep: string;
    completedSteps: string[];
    errorMsg?: string;
  }>({
    status: 'idle',
    progress: 0,
    currentStep: '한국투자증권 연결 대기 중...',
    completedSteps: []
  });
  const [userLicenseData, setUserLicenseData] = useState<any>(null);
  const timeframes = ['1m', '5m', '15m', '30m', '60m', '120m', '240m'];

  // Gap Trading States
  const [isFetchingMarketPrices, setIsFetchingMarketPrices] = useState<boolean>(false);
  const [isSyncingKIS, setIsSyncingKIS] = useState<boolean>(false);
  const [gapBuyPrice, setGapBuyPrice] = useState<number>(0);
  const [gapSellPrice, setGapSellPrice] = useState<number>(0);
  const [tradeQuantity, setTradeQuantity] = useState<number>(0);
  const [isGapBotActive, setIsGapBotActive] = useState<boolean>(false);
  const [kisBuyableQty, setKisBuyableQty] = useState<number | null>(null);
  const buyableReqSeqRef = React.useRef<number>(0);
  const [gapTradingProfit, setGapTradingProfit] = useState<number>(0);
  const [gapTradeCount, setGapTradeCount] = useState<number>(0);
  const [lastTradeType, setLastTradeType] = useState<'BUY' | 'SELL' | null>(null);
  const [gapInventory, setGapInventory] = useState<{id: string, price: number, quantity: number, symbol?: string}[]>([]);

  // Multi-Tab Scalper Trading State
  const buildInitialScalperTabs = (): ScalperTab[] => {
    let saved: ScalperTab[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem('sleek_scalper_tabs') || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        saved = parsed;
      }
    } catch (e) {
      console.error("Failed to parse saved scalperTabs", e);
    }

    // 저장된 인벤토리가 없으면(첫 설치, 또는 사용자가 전부 삭제한 뒤 새로고침) 빈 배열로 시작한다.
    // 과거에는 여기서 KR/US 기본 종목(이구산업 등)을 자동으로 채워 넣었으나, 이는 "빈 인벤토리를
    // 몰래 복구하지 않는다"는 원칙을 위반하므로 완전히 제거했다. 사용자는 검색창에서 직접 등록한다.
    if (saved.length === 0) {
      return [];
    }

    // Sanitize any previously contaminated slots, ensure isBotActive is strictly false on load
    saved = saved.map(t => ({
      ...t,
      isBotActive: false, // 프로그램 로딩 시 모든 탭은 항상 정지(OFF) 상태로 안전하게 시작
      scalperMessage: "대기 중...",
      maxSlots: t.maxSlots || 10,
      gapInventory: (t.gapInventory || [])
        .filter(s => {
          if (!s) return false;
          if (typeof s === 'object' && s.symbol && s.symbol !== t.symbol) return false;
          return true;
        })
        .map(s => (typeof s === 'object' ? { ...s, symbol: t.symbol } : { id: `SLOT-${Date.now()}`, price: s, quantity: 1, symbol: t.symbol })),
      tradeLogs: (t.tradeLogs || []).filter(l => !l.symbol || l.symbol === t.symbol || l.symbol === 'SYSTEM')
    }));

    // 저장된 그대로 반환한다 — 특정 시장(KR/US)에 종목이 하나도 없어도 강제로 채워 넣지 않는다.
    // 🛡️ 다만 MAX_INVENTORY_PER_MARKET 제한은 복원 시에도 반드시 지켜야 한다 — 예전엔 이 제한이
    // 새로 자동채움할 때만 적용되고 저장된 데이터를 복원할 때는 체크가 없어서, 과거에 등록했다가
    // 안 지운 종목이 많으면 설정한 한도(예: 6개)를 넘어서 그대로 복원되는 문제가 있었다.
    // 🛡️ 한도(20)로 자를 때 보유 종목이 잘려나가면 안 된다 — 보유 종목(저장된 보유수량/슬롯 기준)을 먼저 남긴다.
    let savedHoldings: Record<string, number> = {};
    try { savedHoldings = JSON.parse(localStorage.getItem('sleek_holdings') || '{}') || {}; } catch { savedHoldings = {}; }
    const heldFirst = (list: ScalperTab[]) => list
      .map((t, idx) => ({ t, idx, held: (savedHoldings[t.symbol] || 0) > 0 || (t.gapInventory || []).some(s => typeof s === 'object' && (s.quantity || 0) > 0) }))
      .sort((a, b) => Number(b.held) - Number(a.held) || a.idx - b.idx)
      .map(x => x.t);
    const usTabs = heldFirst(saved.filter(t => /^[A-Z]/.test(t.symbol))).slice(0, MAX_INVENTORY_PER_MARKET);
    const krTabs = heldFirst(saved.filter(t => !/^[A-Z]/.test(t.symbol))).slice(0, MAX_INVENTORY_PER_MARKET);
    return [...krTabs, ...usTabs];
  };

  // 병합된 ScalperTab[] 시드 데이터를 "등록 레지스트리"와 "실시간 모니터" 두 저장소로 분리
  // 저장된 구버전(flat) 데이터를 신규 중첩 구조로 마이그레이션
  const migrateLegacyTabsToInventory = (tabs: ScalperTab[]): ScalperInventoryItem[] => {
    const now = Date.now();
    return tabs.map(t => ({
      id: t.id,
      symbol: t.symbol,
      name: t.name,
      registeredAt: now,
      recommendation: {
        score: 0,
        grade: '-',
        price: t.gapBuyPrice || t.price || 0,
        reason: '기존 등록',
        tags: [],
        category: '기존 등록'
      },
      market: {
        currentPrice: t.price || t.gapBuyPrice || 0,
        prevClose: t.price || t.gapBuyPrice || 0,
        change: 0,
        changePercent: 0,
        volume: '0',
        priceStatus: 'LOADING', // 저장된 값이라도 재접속 시에는 실제 KIS 조회로 재검증하기 전까지 LOADING
        lastUpdatedAt: now
      },
      account: {
        holdingQty: (t.gapInventory || []).reduce((acc, s) => acc + (s.quantity || 0), 0),
        orderableQty: 0,
        avgPrice: 0,
        evaluationAmount: 0,
        positions: t.gapInventory || [],
        realizedProfit: t.gapTradingProfit || 0,
        tradeCount: t.gapTradeCount || 0,
        lastTradeType: t.lastTradeType || null,
        lastUpdatedAt: now
      },
      sensors: {
        pullback: false, breakout: false, vwap: false, cvd: false, shortTermMomentum: false, volumeMomentum: false,
        rsi: 50, activeCount: 0, lastUpdatedAt: now
      },
      strategy: {
        isBotActive: t.isBotActive,
        gapBuyPrice: t.gapBuyPrice,
        gapSellPrice: t.gapSellPrice,
        tradeQuantity: t.tradeQuantity,
        maxSlots: t.maxSlots,
        entryPriceMode: t.entryPriceMode,
        autoCancelThreshold: t.autoCancelThreshold
      },
      status: {
        // 재접속 시 이미 보유 포지션이 있으면 HOLDING부터, 없으면 WATCHING부터 시작
        state: (t.gapInventory && t.gapInventory.length > 0) ? 'HOLDING' : 'WATCHING',
        message: t.scalperMessage || "대기 중...",
        lastUpdatedAt: now
      },
      tradeLogs: t.tradeLogs || []
    }));
  };

  // 🏗️ 저장소: 종목별 등록/실시간 정보를 담은 단일 레지스트리.
  // 관심사(recommendation/market/account/sensors/strategy/status)는 네임스페이스로 분리되어 있어
  // "추천 당시 스냅샷"과 "지금 이 순간의 데이터"가 섞일 수 없는 구조다.
  const [scalperInventory, setScalperInventory] = useState<ScalperInventoryItem[]>(
    () => migrateLegacyTabsToInventory(buildInitialScalperTabs())
  );
  // 🎯 웹소켓 틱 핸들러가 참조할 최신 인벤토리 스냅샷 — stocks 배열 존재 여부와 무관하게, 인벤토리
  // 자체의 데이터(이름/현재가 등)를 직접 기반으로 삼기 위함. state 대신 ref를 쓰는 이유는 틱마다
  // 클로저 안에서 최신값을 즉시 읽어야 하는데(리렌더를 기다릴 수 없음) effect 의존성 배열 재구성
  // 없이도 항상 최신을 보장하기 위함이다.
  const scalperInventoryRef = React.useRef(scalperInventory);
  useEffect(() => { scalperInventoryRef.current = scalperInventory; }, [scalperInventory]);

  // symbol 하나에 대해 (기존 flat ScalperTab 필드명 기준) 부분 업데이트를 수행하는 공용 헬퍼.
  // 필드 이름을 보고 자동으로 올바른 네임스페이스에만 쓴다. 기존 엔진 루프 호출부는 수정할 필요가 없다.
  const updateTab = React.useCallback((symbol: string, updates: Partial<ScalperTab>) => {
    setScalperInventory(prev => prev.map(item => {
      if (item.symbol !== symbol) return item;
      const now = Date.now();
      let next = item;
      const touch = <K extends keyof ScalperInventoryItem>(key: K, patch: Partial<ScalperInventoryItem[K]>) => {
        next = { ...next, [key]: { ...(next[key] as any), ...(patch as any) } };
      };
      (Object.keys(updates) as (keyof ScalperTab)[]).forEach(key => {
        const val = (updates as any)[key];
        switch (key) {
          case 'name': next = { ...next, name: val }; break;
          case 'isBotActive': touch('strategy', { isBotActive: val }); break;
          case 'gapBuyPrice': touch('strategy', { gapBuyPrice: val }); break;
          case 'gapSellPrice': touch('strategy', { gapSellPrice: val }); break;
          case 'tradeQuantity': touch('strategy', { tradeQuantity: val }); break;
          case 'maxSlots': touch('strategy', { maxSlots: val }); break;
          case 'entryPriceMode': touch('strategy', { entryPriceMode: val }); break;
          case 'autoCancelThreshold': touch('strategy', { autoCancelThreshold: val }); break;
          case 'gapInventory': {
            const positions: ScalperPosition[] = val || [];
            touch('account', { positions, holdingQty: positions.reduce((acc, s) => acc + (s.quantity || 0), 0), lastUpdatedAt: now });
            break;
          }
          case 'gapTradingProfit': touch('account', { realizedProfit: val, lastUpdatedAt: now }); break;
          case 'gapTradeCount': touch('account', { tradeCount: val, lastUpdatedAt: now }); break;
          case 'lastTradeType': touch('account', { lastTradeType: val, lastUpdatedAt: now }); break;
          case 'scalperMessage': touch('status', { message: val, lastUpdatedAt: now }); break;
          case 'lifecycleStatus': touch('status', { state: val, lastUpdatedAt: now }); break;
          case 'tradeLogs': next = { ...next, tradeLogs: val }; break;
          case 'price': break; // 파생 뷰 전용, 저장하지 않음
          default: break;
        }
      });
      return next;
    }));
  }, []);

  // ============================================================
  // 🔄 매매 라이프사이클 상태 전이 헬퍼
  // WATCHING → BUY_READY → BUYING → HOLDING → SELL_READY → SELLING → COMPLETED(→ WATCHING) / ERROR
  // 모든 상태 변경은 예외 없이 TRADE LOGS에 기록된다.
  // ============================================================
  const LIFECYCLE_STATUS_LABEL: Record<ScalperLifecycleStatus, string> = {
    WATCHING: 'WATCHING(감시중)',
    BUY_READY: 'BUY_READY(매수준비)',
    BUYING: 'BUYING(매수주문)',
    HOLDING: 'HOLDING(보유중)',
    SELL_READY: 'SELL_READY(매도준비)',
    SELLING: 'SELLING(매도주문)',
    COMPLETED: 'COMPLETED(매도완료)',
    ERROR: 'ERROR(오류)'
  };

  // 매수 계열 상태는 '매수' 로그로, 매도 계열은 '매도' 로그로, ERROR는 직전 방향을 따라간다
  const LIFECYCLE_LOG_TYPE: Record<ScalperLifecycleStatus, '매수' | '매도'> = {
    WATCHING: '매수', BUY_READY: '매수', BUYING: '매수', HOLDING: '매수',
    SELL_READY: '매도', SELLING: '매도', COMPLETED: '매도', ERROR: '매도'
  };

  const transitionLifecycleStatus = React.useCallback((symbol: string, next: ScalperLifecycleStatus, reason: string) => {
    const current = scalperTabsRef.current.find(t => t.symbol === symbol)?.lifecycleStatus || 'WATCHING';
    if (current === next) return; // 동일 상태로의 중복 전이는 무시 (로그 도배 방지)

    updateTab(symbol, { lifecycleStatus: next });
    lifecycleChangedAtRef.current[symbol] = Date.now();

    const currentPrice = stocksRef.current.find(s => s.symbol === symbol)?.price || 0;
    addLog(
      symbol,
      LIFECYCLE_LOG_TYPE[next],
      currentPrice,
      0,
      `[상태변경] ${LIFECYCLE_STATUS_LABEL[current]} → ${LIFECYCLE_STATUS_LABEL[next]} — ${reason}`
    );

    // COMPLETED는 종착점이 아니라 다음 매매 사이클을 위해 다시 WATCHING으로 순환한다 (이 전이도 로그에 남는다).
    // 🎨 매도완료(빨강 테두리) 상태를 5초간 눈에 띄게 유지한 후 관망중(회색)으로 돌아간다 —
    // 예전엔 0ms(사실상 즉시)라서 사용자가 매도완료 순간을 눈으로 확인할 틈이 없었다.
    if (next === 'COMPLETED') {
      setTimeout(() => {
        transitionLifecycleStatus(symbol, 'WATCHING', '다음 매매 사이클 대기');
      }, 5000);
    }
  }, [updateTab]);

  // 🔗 소비 측(엔진 루프/컴포넌트) 호환을 위한 파생(join) 뷰.
  // scalperInventory는 관심사별 네임스페이스로 분리 저장되며,
  // scalperTabs는 오직 "읽기 전용 평탄화 결과"로만 존재한다 (절대 setScalperTabs로 직접 쓰지 않음).
  const scalperTabs: ScalperTab[] = React.useMemo(() => {
    return scalperInventory.map(item => ({
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      price: item.market.currentPrice,
      isBotActive: item.strategy.isBotActive,
      gapBuyPrice: item.strategy.gapBuyPrice,
      gapSellPrice: item.strategy.gapSellPrice,
      tradeQuantity: item.strategy.tradeQuantity,
      maxSlots: item.strategy.maxSlots,
      entryPriceMode: item.strategy.entryPriceMode,
      autoCancelThreshold: item.strategy.autoCancelThreshold,
      gapInventory: item.account.positions,
      gapTradingProfit: item.account.realizedProfit,
      gapTradeCount: item.account.tradeCount,
      lastTradeType: item.account.lastTradeType,
      scalperMessage: item.status.message,
      tradeLogs: item.tradeLogs,
      lifecycleStatus: item.status.state,
      priceStatus: item.market.priceStatus,
      holdingQty: item.account.holdingQty,
      orderableQty: item.account.orderableQty,
      changePercent: item.market.changePercent,
      sensors: item.sensors
    }));
  }, [scalperInventory]);
  const [wsConnectionStatus, setWsConnectionStatus] = useState<KisRealtimeStatus | 'idle'>('idle');
  // 🔄 REST 폴링 effect(refreshStalePrices/syncSelectedPrice)는 이 상태를 의존성 배열에 넣지 않고
  // ref로만 읽는다 — state를 의존성에 넣으면 웹소켓 상태가 바뀔 때마다(연결/재연결/끊김) 그
  // effect 전체가 재시작되면서 "즉시 전체조회"가 다시 실행되어 오히려 순간 폭주를 만들 수 있다.
  const wsConnectionStatusRef = React.useRef(wsConnectionStatus);
  // 🕐 종목별 마지막 웹소켓 tick 수신 시각 — refreshStalePrices가 "오래 갱신 안 된 종목"을 골라
  // REST로 보완할 때 이 값을 기준으로 판단한다.
  const lastWsTickAtRef = React.useRef<Record<string, number>>({});

  // ============================================================
  // 🛡️ 매매 워밍업/안정화 게이트
  // ------------------------------------------------------------
  // 앱 로딩 직후 잘못된 가격/history/센서로 매수하는 것을 방지한다.
  //
  // 흐름: 앱 로딩 → KIS 연결 → WebSocket 실제 tick 수신 → 종목별 최소 tick 확보
  //      → 최근 tick 정상 여부 확인 → 매매 허용
  // ============================================================
  const [isTradingArmed, setIsTradingArmed] = useState(false); // 앱 전체가 매매 가능한 상태인지
  const wsTickCountRef = React.useRef<Record<string, number>>({}); // 종목별 실제 WebSocket tick 수신 횟수
  const tradingWarmupStartedAtRef = React.useRef<number>(0); // 앱 시작 후 워밍업 시작 시각
  const tradingWarmupCompletedRef = React.useRef(false); // 워밍업 완료 여부
  const pendingMarketOpenRef = React.useRef(false); // 장 시작을 감지했지만 아직 워밍업이 안 끝나 자동시작을 미룬 상태
  const MIN_WARMUP_TICKS = 10; // 종목당 최소 이만큼의 실제 WS tick을 받아야 안정화된 것으로 본다
  const MAX_WS_TICK_AGE_MS = 1500; // 최근 실제 WebSocket tick이 이 시간보다 오래되면 매매하지 않는다
  const MIN_TRADING_WARMUP_MS = 5000; // 앱 초기화 후 최소 이 시간 동안은 매매하지 않는다
  // 🛡️ 틱 수신과 화면 렌더링을 분리하기 위한 임시 저장소 — 매 틱마다 여기 즉시 쓰고, 별도의
  // 100ms 배치 effect가 이걸 한 번에 stocks/scalperInventory에 반영한다.
  const liveTickRef = React.useRef<Record<string, {
    price: number;
    change: number;
    changePercent: number;
    volume: string;
    executionStrength?: number;
    buyVolume?: number;
    sellVolume?: number;
    timestamp: number;
  }>>({});
  const cumulativeCvdRef = React.useRef<Record<string, number>>({});
  // 🔧 (2026-10-03) 진짜 CVD 계산용 — KIS 체결 데이터의 총매수·총매도 체결량(19·20번 필드)은 "당일 누적값"이다.
  //   · CVD = 누적 매수 − 누적 매도 (그 자체가 누적값이라 다시 더하면 안 된다)
  //   · cvdDelta = 약 10초 전 CVD 대비 변화량 (cvdHistRef에 최근 15초 이력 보관)
  //   · 틱 1건의 매수/매도 체결량 = 직전 누적값과의 차이 (lastCumBuySellRef, 틱 아카이브용)
  const cvdHistRef = React.useRef<Record<string, { t: number; v: number }[]>>({});
  const lastCumBuySellRef = React.useRef<Record<string, { buy: number; sell: number }>>({});
  const lastTickLogRef = React.useRef<Record<string, number>>({}); // [WS TICK] 진단 로그를 종목별로 각각 1초에 한 번만 찍기 위한 타임스탬프 — 예전엔 전체가 하나의 타이머를 공유해서, 한 종목의 로그가 다른 종목들의 로그까지 억제하는 문제가 있었음
  // 🎯 틱 기반 종목별 센서 즉시 계산에 쓰는 경량 이력 — React state(stocks[].history, 100ms 배치로만
  // 갱신됨)와 별개로, 틱이 오는 즉시(ref라 렌더링 없음) 갱신해서 "이 틱까지 포함한" 최신 이력으로
  // 센서를 계산할 수 있게 한다. 최대 600개 유지(5분 전고점 계산과 동일한 기준).
  const liveHistoryRef = React.useRef<Record<string, { time: string; price: number; timestamp: number }[]>>({});
  // 🎯 종목별 마지막 센서 계산 시각 — 매 틱마다 무조건 재계산하면 활발한 종목(초당 수십 틱)에서
  // CPU 부담이 커질 수 있어, 종목당 최소 200ms 간격으로 스로틀한다. 그래도 기존 1초 전체 순회
  // 방식보다는 훨씬 반응성이 좋고, 그 종목만 계산하니 다른 종목에 영향도 없다.
  const lastSensorCalcRef = React.useRef<Record<string, number>>({});
  useEffect(() => { wsConnectionStatusRef.current = wsConnectionStatus; }, [wsConnectionStatus]);

  // ============================================================
  // 🛡️ 앱 초기화 후 매매 워밍업
  // ------------------------------------------------------------
  // 로딩 → KIS 연결 → WebSocket 실제 시세 확인 → 종목별 워밍업 → 센서 활성화 → 매매 허가 → 매수
  // 순서를 강제한다. 봇이 켜진 종목만 워밍업 대상으로 삼는다 — 거래가 거의 없는 종목 하나
  // 때문에 전체 매매가 영원히 시작 안 되는 걸 막기 위함이다.
  // ============================================================
  useEffect(() => {
    if (!isAppInitialized) {
      setIsTradingArmed(false);
      tradingWarmupCompletedRef.current = false;
      tradingWarmupStartedAtRef.current = 0;
      return;
    }

    if (tradingWarmupCompletedRef.current) return;

    tradingWarmupStartedAtRef.current = Date.now();

    setIsTradingArmed(false);

    const warmupInterval = setInterval(() => {
      const now = Date.now();

      const elapsed = now - tradingWarmupStartedAtRef.current;
      if (elapsed < MIN_TRADING_WARMUP_MS) return;

      if (!kisConfig.isConnected) {
        return;
      }

      const inventorySymbols = [...new Set(
        scalperTabsRef.current
          .filter(t => t.isBotActive)
          .map(t => t.symbol)
          .filter(symbol => typeof symbol === 'string' && /^[0-9]{6}$/.test(symbol))
      )];

      if (inventorySymbols.length === 0) {
        return;
      }

      const status = inventorySymbols.map(symbol => {
        const tickCount = wsTickCountRef.current[symbol] || 0;
        const lastTick = lastWsTickAtRef.current[symbol] || 0;
        const tickAge = lastTick > 0 ? now - lastTick : Infinity;
        const hasEnoughTicks = tickCount >= MIN_WARMUP_TICKS;
        const hasFreshTick = tickAge <= MAX_WS_TICK_AGE_MS;
        return { symbol, tickCount, tickAge, hasEnoughTicks, hasFreshTick };
      });

      // 🛡️ 매우 중요한 수정: 예전엔 인벤토리의 "모든" 종목이 다 안정화돼야만(every) 전체 매매를
      // 허용했다. 인벤토리가 커질수록(예: 72종목) 그중 유동성이 낮아 틱이 뜸한 종목이 단 하나만
      // 있어도 이 조건을 영원히 못 채워서, 나머지 71개 종목이 전부 정상이어도 전체 매매가 하루
      // 종일 단 한 번도 시작을 못 하는 심각한 문제가 있었다. 종목별 워밍업 상태는 이미 매수
      // 판단 직전(개별 종목 루프)에서도 따로 체크하고 있으므로(그 종목만 개별적으로 건너뜀),
      // 이 전역 게이트는 "적어도 일부 종목은 확실히 안정화됐다"만 확인하면 충분하다 — 전부
      // 안정화될 때까지 기다리지 않는다.
      const stableCount = status.filter(item => item.hasEnoughTicks && item.hasFreshTick).length;
      if (stableCount === 0) return;

      tradingWarmupCompletedRef.current = true;
      setIsTradingArmed(true);
      clearInterval(warmupInterval);

      setScalperMessage('실시간 데이터 안정화 완료 — 자동매매 감시 시작');

      if (pendingMarketOpenRef.current && isKoreanMarketOpen()) {
        setScalperInventory(prev => prev.map(item => ({ ...item, strategy: { ...item.strategy, isBotActive: true } })));
        setIsGapBotActive(true);
        pendingMarketOpenRef.current = false;
        showNotification('[자동 시작] 실시간 데이터 안정화 완료 — 스캘핑 시작', 'success');
      }
    }, 500);

    return () => clearInterval(warmupInterval);
  }, [isAppInitialized, kisConfig.isConnected]);

  // 🛡️ liveTickRef → stocks/scalperInventory 배치 반영 (100ms 주기) — 틱 수신 자체는 위에서
  // ref에만 즉시 쓰고 렌더링을 유발하지 않으니, 실제 화면/매매판단용 상태 반영은 여기서 한 번에
  // 처리한다. history는 여전히 최대 600개까지 유지한다 — 5분 전고점(돌파 판정)을 계산하려면
  // 실제 timestamp 기준으로 5분치 샘플이 필요하기 때문에, 이 부분은 줄이지 않는다. 다만 이제
  // 이 계산 자체가 틱마다(초당 수십 회)가 아니라 100ms에 한 번만 일어나므로 부담이 크게 준다.
  useEffect(() => {
    const batchInterval = setInterval(() => {
      const pending = liveTickRef.current;
      const symbols = Object.keys(pending);
      if (symbols.length === 0) return;
      liveTickRef.current = {}; // 이번 배치에서 처리할 것만 꺼내고 즉시 비움 — 다음 100ms엔 새로 쌓인 것만 처리

      const nowLabel = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // 🔧 (2026-10-03) 진짜 CVD — 총매수·총매도 체결량은 당일 누적값이므로 "누적 매수 − 누적 매도"가 곧 CVD다.
      // 예전엔 이 값을 틱당 체결량으로 보고 틱마다 다시 더해서(이중 누적) CVD가 실제와 무관하게 부풀었고, cvdDelta에는
      // 변화량이 아니라 CVD 자체가 들어갔다. 변화량은 약 10초 전 값과 비교한다(틱 1건 단위는 너무 흔들려 판단에 쓸 수 없음).
      // setStocks 안에서 계산하면 React가 그 함수를 두 번 부를 때 값이 달라질 수 있어 밖에서 한 번만 계산한다.
      const cvdNowBySymbol: Record<string, { cvd: number; delta: number }> = {};
      {
        const nowCvd = Date.now();
        for (const sym of symbols) {
          const tk = pending[sym];
          if (!tk || tk.buyVolume === undefined || tk.sellVolume === undefined) continue;
          const cvd = tk.buyVolume - tk.sellVolume;
          let hist = cvdHistRef.current[sym] || [];
          // 1분 넘게 끊겼거나 날짜가 바뀌어 누적값이 초기화된 경우 이력을 새로 시작
          if (hist.length > 0 && nowCvd - hist[hist.length - 1].t > 60000) hist = [];
          hist = hist.filter(h => nowCvd - h.t <= 15000);
          const past = [...hist].reverse().find(h => nowCvd - h.t >= 10000) || hist[0];
          cvdNowBySymbol[sym] = { cvd, delta: past ? cvd - past.v : 0 };
          hist.push({ t: nowCvd, v: cvd });
          cvdHistRef.current[sym] = hist;
          cumulativeCvdRef.current[sym] = cvd;
        }
      }

      setStocks(prev => prev.map(s => {
        const tick = pending[s.symbol];
        if (!tick) return s;
        const oldHistory = Array.isArray(s.history) ? s.history : [];
        const newHistory = [...oldHistory.slice(-599), { time: nowLabel, price: tick.price, timestamp: tick.timestamp }];
        const cvdNow = cvdNowBySymbol[s.symbol];
        const cumulativeCvd = cvdNow ? cvdNow.cvd : (s.cumulativeCvd ?? s.realCvd ?? 0);
        const cvdDelta = cvdNow ? cvdNow.delta : (s.cvdDelta || 0);
        return {
          ...s,
          price: tick.price,
          change: tick.change,
          changePercent: tick.changePercent,
          volume: tick.volume,
          executionStrength: tick.executionStrength !== undefined ? tick.executionStrength : s.executionStrength,
          realCvd: cumulativeCvd,
          cumulativeCvd,
          cvdDelta,
          isRealTime: true,
          history: newHistory,
          lastUpdated: nowLabel
        };
      }));

      setScalperInventory(prev => prev.map(item => {
        const tick = pending[item.symbol];
        if (!tick || tick.price <= 0) return item;
        return {
          ...item,
          market: {
            ...item.market,
            currentPrice: tick.price,
            changePercent: tick.changePercent || 0,
            priceStatus: 'LIVE',
            lastUpdatedAt: Date.now()
          }
        };
      }));
    }, 100);

    return () => clearInterval(batchInterval);
  }, []);
  const registeredSymbolsKeyRaw = scalperTabs.map(t => t.symbol).sort().join(',');
  // 🛡️ 종목이 하나 등록/삭제될 때마다 이 키가 바뀌어서 웹소켓 전체가 끊겼다 재연결되고 있었다.
  // 특히 자동 슬롯 채움이 여러 종목을 연속으로 등록할 때, 종목마다 웹소켓이 재연결되면서
  // 그 짧은 순간(재연결 중)에 다른 API 호출이 타임아웃과 겹치면 스캘핑이 흔들리는 원인이 됐다.
  // 변경이 3초간 잠잠해진 뒤에만 실제로 재연결하도록 디바운스한다.
  const [registeredSymbolsKey, setRegisteredSymbolsKey] = useState(registeredSymbolsKeyRaw);
  useEffect(() => {
    const timer = setTimeout(() => setRegisteredSymbolsKey(registeredSymbolsKeyRaw), 3000);
    return () => clearTimeout(timer);
  }, [registeredSymbolsKeyRaw]);

  // 🎯 diff 기반 구독 관리를 위한 ref들 — wsHandleRef는 여러 effect가 같은 연결을 공유해서
  // 메시지를 보낼 수 있게 하고, prevSubscribedSymbolsRef는 "마지막으로 서버에 구독 요청한
  // 종목이 무엇이었는지"를 기억해서, 다음번엔 실제로 바뀐 종목(diff)만 구독/해제하기 위함이다.
  // 🎛️ 실시간 연결 핸들 — 연결의 생명주기(열기/닫기/재연결)는 전부 App이 이 핸들로 관리한다.
  // kisService는 더 이상 스스로 재연결하지 않는다(예전엔 cleanup의 close()를 장애로 보고 되살려서
  // App이 모르는 유령 소켓이 생겼다).
  const wsHandleRef = React.useRef<KisRealtimeHandle | null>(null);
  const prevSubscribedSymbolsRef = React.useRef<Set<string>>(new Set());

  // ⚡ 실시간 슬롯 배정 — 앱키 1개 = KIS 연결 1개 = 실시간 등록 약 41건 = 20종목(체결가+호가) + 체결통보 1건.
  // 72종목 인벤토리 중 어떤 20종목을 실시간으로 받을지는 아래 "우선순위 배정기"가 5초마다 정한다.
  // 나머지 종목은 REST 백업(refreshStalePrices)으로 갱신된다.
  const [realtimeSymbols, setRealtimeSymbols] = useState<string[]>([]);
  const realtimeSymbolsRef = React.useRef<string[]>([]);
  const realtimePromotedAtRef = React.useRef<Record<string, number>>({}); // 실시간으로 올라간 시각 — 최소 유지시간 판단용
  const realtimeRejectedAtRef = React.useRef<Record<string, number>>({}); // 서버가 등록을 거부한 시각 — 잠시 재시도하지 않음
  const [realtimeOverflowCount, setRealtimeOverflowCount] = useState(0); // 실시간 자리를 못 받은 보유 종목 수(경고용)

  useEffect(() => {
  // ============================================================
  // 🔒 실시간 데이터 시작 순서 보호
  //
  // 순서:
  // 1. Firebase 로그인
  // 2. KIS 초기화
  // 3. 계좌/인벤토리 초기 동기화
  // 4. isAppInitialized = true
  // 5. 그 다음 WebSocket 연결
  //
  // 초기화 전에 WebSocket을 열면 인벤토리가 확정되기 전에
  // 구독이 시작되어 재연결/재구독이 반복될 수 있다.
  // ============================================================
  if (!currentUser) {
    setWsConnectionStatus('idle');
    return;
  }

  if (!isAppInitialized) {
    setWsConnectionStatus('idle');
    return;
  }

  if (!kisConfig.isConnected) {
    setWsConnectionStatus('idle');
    return;
  }

  if (!kisService.isConfigReady()) {
    setWsConnectionStatus('idle');
    return;
  }

  const symbols = scalperTabsRef.current
    .map(t => t.symbol)
    .filter(Boolean);

  if (symbols.length === 0) {
    setWsConnectionStatus('idle');
    return;
  }

  let cancelled = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  // 🔁 브라우저 ↔ 서버 재연결 backoff: 1 → 2 → 4 → 8 → 16 → 30초 + ±20% jitter, 최대 10회.
  // (서버 ↔ KIS 재연결과 OPSP8996 앱키 충돌은 서버가 따로 처리하고 상태만 알려준다)
  const WS_BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
  const MAX_WS_RECONNECT_ATTEMPTS = 10;

  const scheduleReconnect = (reason: string) => {
    if (cancelled || reconnectTimer) return;
    if (reconnectAttempt >= MAX_WS_RECONNECT_ATTEMPTS) {
      console.warn('[WS 재연결 중단] 최대 재시도 횟수 초과 — 새로고침이 필요합니다', { reason });
      setWsConnectionStatus('closed');
      return;
    }
    const step = WS_BACKOFF_STEPS_MS[Math.min(reconnectAttempt, WS_BACKOFF_STEPS_MS.length - 1)];
    reconnectAttempt++;
    const delay = Math.round(step * (0.8 + Math.random() * 0.4));
    console.log('[WS 재연결 예약]', { reason, 대기ms: delay, 시도: reconnectAttempt });
    setWsConnectionStatus('connecting');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openConnection();
    }, delay);
  };

  const openConnection = () => {
    if (cancelled) return;
    // 🛡️ 이전 핸들이 남아 있으면 확실히 "수동 종료"로 닫는다 — 같은 브라우저에 연결이 둘 생기지 않게.
    wsHandleRef.current?.close();
    wsHandleRef.current = null;

    // 🎯 연결(재연결 포함) 시점의 "현재" 실시간 배정 목록으로 구독한다 — 예전엔 처음 연결할 때의
    // 목록으로 재구독해서, 그 뒤에 추가/삭제한 종목이 재연결 후 틀어졌다.
    const connectSymbols = [...realtimeSymbolsRef.current];
    prevSubscribedSymbolsRef.current = new Set(connectSymbols);
    console.log('[WS 연결] 실시간 배정 종목 구독', { 종목수: connectSymbols.length });

    kisService
      .connectWebSocket(
        connectSymbols,
        tick => {
          // 🛡️ 매우 중요한 성능 개선: 예전엔 틱 하나가 들어올 때마다 setStocks/setScalperInventory를
          // 즉시 호출해서, 초당 수십 틱이 오면 그만큼 전체 React 리렌더링이 반복됐다(각 렌더마다
          // stocks 배열 전체를 map하고 history를 최대 600개까지 복사). 이제 틱은 liveTickRef에만
          // 즉시 저장하고, 실제 화면 반영(및 그 안의 history 계산)은 아래 별도 useEffect가 100ms
          // 주기로 한 번에 처리한다 — "틱 수신"과 "화면 갱신"을 분리해서 메인 스레드 부담을 크게
          // 줄인다. 매매 판단에 쓰이는 stocks 값 자체는 최대 100ms 지연일 뿐이라 스캘핑 판단에
          // 실질적인 영향은 없다.
          // 📐 3단계: 진짜 VWAP(정규/애프터) · 최근 60초 체결 빈도 · 최근 5분 거래대금 — 매 틱 가벼운 산술만 한다
          updateTickMarketStats(tick);
          // 🔬 필드 검증기가 13번 필드를 "누적거래량"으로 확인하면 그 값을 쓴다 (기존 12번은 틱당 체결량으로 추정됨)
          const verifiedVolume = (tick.acmlVolume && tickFieldCheckRef.current.acmlVol) ? String(tick.acmlVolume) : tick.volume;
          liveTickRef.current[tick.symbol] = {
            price: tick.price,
            change: tick.change,
            changePercent: tick.changePercent,
            volume: verifiedVolume,
            executionStrength: tick.executionStrength,
            buyVolume: tick.buyVolume,
            sellVolume: tick.sellVolume,
            timestamp: Date.now()
          };
    try {

  // 🔧 (2026-10-03) 틱 아카이브에는 "이 틱 1건의" 매수/매도 체결량을 저장한다. KIS가 주는 값은 당일 누적이라
  // 직전 누적값과의 차이로 구한다(리플레이가 이 값을 더해 CVD·VWAP을 다시 만든다). 예전엔 누적값을 그대로 저장했다.
  if (tick.buyVolume !== undefined && tick.sellVolume !== undefined) {
    const prevCum = lastCumBuySellRef.current[tick.symbol];
    lastCumBuySellRef.current[tick.symbol] = { buy: tick.buyVolume, sell: tick.sellVolume };
    // 첫 틱(직전 값 없음)이나 누적값이 초기화된 틱(새 날)은 체결량 0으로 기록
    const tickBuyVol = prevCum && tick.buyVolume >= prevCum.buy ? tick.buyVolume - prevCum.buy : 0;
    const tickSellVol = prevCum && tick.sellVolume >= prevCum.sell ? tick.sellVolume - prevCum.sell : 0;

    archiveTick({
      symbol: tick.symbol,
      timestamp: Date.now(),
      price: tick.price,
      buyVolume: tickBuyVol,
      sellVolume: tickSellVol,
      executionStrength: tick.executionStrength,
      cumulativeCvd: tick.buyVolume - tick.sellVolume,
      vwap: getCurrentTrueVwap(tick.symbol, tick.price),
      // 🗂️ (2026-10-04) 호가 총잔량도 함께 저장(10초 이내 수신분만) — 보유 구간의 호가 변화를 나중에 다시 볼 수 있도록
      ...(Date.now() - (lastWsOrderbookTickAtRef.current[tick.symbol] || 0) <= 10000 ? {
        bidVolume: Number(liveOrderbooksRef.current[tick.symbol]?.totalBidVolume || 0) || undefined,
        askVolume: Number(liveOrderbooksRef.current[tick.symbol]?.totalAskVolume || 0) || undefined,
      } : {}),
    });
  }

} catch (err) {

  console.warn(
    '[TickArchive 저장 실패]',
    err
  );

}

          // 🔍 진단 로그는 종목별로 각각 1초에 한 번만 — 예전엔 전체가 하나의 타이머를 공유해서
          // 한 종목의 로그가 다른 종목들의 로그를 억제했다. 실제 데이터 처리(liveTickRef 저장)는
          // 로그와 무관하게 항상 정상적으로 일어난다 — 이건 순수하게 콘솔 출력 빈도만의 문제였다.
          const nowForLog = Date.now();
          if (WS_DEBUG_ENABLED && nowForLog - (lastTickLogRef.current[tick.symbol] || 0) >= 1000) {
            console.log('[WS TICK 정상]', tick.symbol, tick.price, new Date().toLocaleTimeString('ko-KR'));
            lastTickLogRef.current[tick.symbol] = nowForLog;
          }

          // 🕐 이 종목이 방금 웹소켓으로 갱신됐다는 걸 기록 — refreshStalePrices가 "오래 갱신 안 된
          // 종목"만 REST로 보완할 때 이 시각을 기준으로 판단한다. 가벼운 연산이라 즉시 처리해도 무방.
          lastWsTickAtRef.current[tick.symbol] = Date.now();
          // 🛡️ 실제 WebSocket tick만 워밍업 카운트에 포함한다. REST 가격 조회(refreshStalePrices)는
          // 여기 안 들어오므로 이 카운터는 순수하게 "이 종목의 실제 KIS 체결 데이터가 몇 번
          // 들어왔는가"만 나타낸다.
          wsTickCountRef.current[tick.symbol] = (wsTickCountRef.current[tick.symbol] || 0) + 1;

          // 🎯 틱 기반 종목별 즉시 센서 계산 — 예전엔 "3초(→1초)마다 등록된 전체 종목을 순회"하는
          // 방식이라, 가격은 틱 단위로 움직여도 센서(눌림목/VWAP/단기모멘텀/돌파/RSI)는 최대 1초
          // 지연되어 "체결가는 사는데 센서는 멈춘 것처럼" 보일 수 있었다. 이제 틱이 트리거해서
          // "이 틱을 받은 종목 하나만" 즉시 재계산한다 — 다른 종목들은 건드리지 않아 효율적이다.
          // 다만 매 틱마다 무조건 계산하면 활발한 종목(초당 수십 틱)에서 부담이 커질 수 있어
          // 종목당 최소 200ms 간격으로 스로틀한다. 기존 1초 전체 순회는 안전망으로 그대로 둔다
          // (틱이 뜸한 저유동성 종목이나, 이 로직이 놓친 경우를 보완).
          const nowForSensor = Date.now();
          if (nowForSensor - (lastSensorCalcRef.current[tick.symbol] || 0) >= 200) {
            lastSensorCalcRef.current[tick.symbol] = nowForSensor;

            const nowLabelForHistory = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            // 🛡️ 매우 중요한 수정: 예전엔 stocksRef.current에서 못 찾으면(=stocks 배열에 그 종목이
            // 없으면) history 폴백도, 아래 baseStock도 전부 실패해서 그 종목은 센서 계산 자체가
            // 통째로 스킵되고 있었다 — 실제로 인벤토리 12종목 중 일부가 stocks 배열에 없는 경우가
            // 확인됐다(등록/초기화 타이밍에 따라 발생 가능). 이제 stocks 존재 여부를 필수조건으로
            // 두지 않는다 — 인벤토리 아이템 자체(scalperInventoryRef)가 이미 이름/현재가 등 기본
            // 정보를 갖고 있으므로, stocks는 있으면 보강(enrichment)에만 쓰고 없어도 문제없다.
            const oldLiveHistory = liveHistoryRef.current[tick.symbol]
              || stocksRef.current.find(s => s.symbol === tick.symbol)?.history
              || [];
            const newLiveHistory = [...oldLiveHistory.slice(-599), { time: nowLabelForHistory, price: tick.price, timestamp: nowForSensor }];
            liveHistoryRef.current[tick.symbol] = newLiveHistory;

            const inventoryItem = scalperInventoryRef.current.find(item => item.symbol === tick.symbol);
            const baseStock = stocksRef.current.find(s => s.symbol === tick.symbol);
            // 인벤토리에 등록된 종목이 아니면(추천풀 등) 이 로직 자체가 불필요 — 인벤토리 우선이라는
            // 원칙에 맞춰, 인벤토리에 없는 종목은 여기서 처리하지 않는다(REST 백업이 담당).
            if (inventoryItem) {
              const isUS = /^[A-Za-z]/.test(tick.symbol);
              // 이 틱까지 반영한 최신 정보로 임시 Stock 객체를 만들어서 전략을 계산한다 — stocks에
              // 있으면 그 정보(이름 등)로 보강하고, 없으면 인벤토리 자체 정보만으로 구성한다.
              const liveStockForStrategy: Stock = {
                symbol: tick.symbol,
                name: baseStock?.name || inventoryItem.name,
                price: tick.price,
                change: tick.change,
                changePercent: tick.changePercent,
                volume: tick.volume,
                executionStrength: tick.executionStrength !== undefined ? tick.executionStrength : baseStock?.executionStrength,
                history: newLiveHistory,
                market: baseStock?.market || (isUS ? 'US' : 'KR'),
              };
              const strat = detectStockStrategiesRef.current(liveStockForStrategy);
              const roundedRsi = Math.round(strat.rsi);

              setScalperInventory(prev => {
                const idx = prev.findIndex(item => item.symbol === tick.symbol);
                if (idx === -1) return prev; // 이 종목이 인벤토리에 없으면(추천풀 등) 건드리지 않음
                const item = prev[idx];
                const cur = item.sensors;
                // 센서 값 자체가 안 바뀌었으면(그리고 RSI도 정수 단위로 안 바뀌었으면) 불필요한
                // 리렌더링을 피한다 — 다만 lastUpdatedAt은 갱신해서 "살아있다"는 걸 반영한다.
                const sensorsUnchanged =
                  cur.pullback === strat.isPullback &&
                  cur.breakout === strat.isBreakout &&
                  cur.vwap === strat.isVwapSupport &&
                  cur.cvd === strat.isVolumeProfile &&
                  cur.shortTermMomentum === strat.momentumPositive &&
                  cur.volumeMomentum === strat.hasVolumeMomentum &&
                  cur.rsi === roundedRsi &&
                  cur.activeCount === strat.activeCount;
                if (sensorsUnchanged) return prev;

                const next = [...prev];
                next[idx] = {
                  ...item,
                  sensors: {
                    pullback: strat.isPullback,
                    breakout: strat.isBreakout,
                    vwap: strat.isVwapSupport,
                    cvd: strat.isVolumeProfile,
                    shortTermMomentum: strat.momentumPositive,
                    volumeMomentum: strat.hasVolumeMomentum,
                    rsi: roundedRsi,
                    activeCount: strat.activeCount,
                    lastUpdatedAt: nowForSensor
                  }
                };
                return next;
              });
            }
          }
        },
        status => {
          if (cancelled) return;
          setWsConnectionStatus(status);
          if (status === 'open') reconnectAttempt = 0;
          // 브라우저 ↔ 서버 연결이 예기치 않게 끊겼을 때만 App이 재연결한다(수동 종료는 콜백 자체가 안 옴)
          if (status === 'closed') scheduleReconnect('브라우저↔서버 연결 끊김');
        },
        orderbook => {
          // 🎯 실시간 호가(H0STASP0) — REST 라운드로빈(5초에 1종목)보다 훨씬 빠르게 종목별 호가를
          // 갱신한다. liveOrderbooksRef는 이미 종목별 Record 구조라 그대로 재사용 가능하다.
          liveOrderbooksRef.current[orderbook.symbol] = {
            symbol: orderbook.symbol,
            totalBidVolume: orderbook.totalBidVolume,
            totalAskVolume: orderbook.totalAskVolume,
            bidPrice1: orderbook.bidPrice1,
            askPrice1: orderbook.askPrice1,
          };
          lastWsOrderbookTickAtRef.current[orderbook.symbol] = Date.now();
        },
        executionNotice => {
          // 🔍 H0STCNI0(실시간 체결통보) — 우선은 실제로 데이터가 들어오는지 확인하는 진단 단계다.
          // 필드 인덱스(특히 종목코드/체결여부 위치)를 100% 확신할 수 없어서, 기존 REST 폴링
          // (checkOrderExecution) 기반 체결확인은 그대로 두고 병행한다 — 이 로그로 실제 값이
          // 맞는지 확인한 뒤에야 REST를 대체하거나 보완하는 다음 단계로 넘어가는 게 안전하다.
          console.log('[체결통보 수신]', executionNotice);
        },
        kisConfig.htsId, // 🛡️ 사용자 본인이 직접 입력한 HTS ID가 있을 때만 체결통보 구독 시도 — 비어있으면 아무 일도 안 일어남
        (symbol, reason) => {
          // 서버가 실시간 등록을 거부(등록 한도 초과 등) — 잠시(60초) 이 종목은 실시간 후보에서 빼고 REST로 둔다
          console.warn('[실시간 등록 거부]', symbol, reason);
          realtimeRejectedAtRef.current[symbol] = Date.now();
          prevSubscribedSymbolsRef.current.delete(symbol);
        },
        // 🎯 과제 1(멀티 앱키) — 계좌 #2~4(실시간 시세 전용). 연결/재연결될 때마다 서버로 다시 전달된다.
        activeKisExtraAccounts.map(a => ({ slot: a.slot, appKey: a.appKey, appSecret: a.appSecret }))
      )
      .then(handle => {
        if (cancelled) {
          handle.close();
          return;
        }
        wsHandleRef.current = handle; // 🎯 diff effect가 같은 연결에 subscribe/unsubscribe 메시지를 보낼 수 있도록 공유
      })
      .catch(err => {
        console.error("[KIS WS ERROR]", err);
        if (cancelled) return;
        setWsConnectionStatus('error');
        scheduleReconnect('연결 생성 실패');
      });
  };

  openConnection();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsHandleRef.current?.close(); // 수동 종료 — kisService가 재연결하지 않는다
      wsHandleRef.current = null;
    };
  }, [currentUser,
  isAppInitialized,
  kisConfig.isConnected,
  kisConfig.htsId]);

  // 🎯 과제 1(멀티 앱키) — 계좌 #2~4 설정이 바뀌면 굳이 전체 연결을 다시 맺지 않고, 이미 열려있는
  // 연결에 새 설정만 다시 전송한다(서버는 값이 같으면 아무것도 하지 않고, 다르면 그 슬롯만 새로
  // 연결한다). 최초 연결 시점의 설정은 위 connectWebSocket 호출 인자로 이미 전달된다.
  const extraKisAccountsKey = JSON.stringify(activeKisExtraAccounts.map(a => [a.slot, a.appKey, a.appSecret]));
  useEffect(() => {
    if (!kisConfig.isConnected || activeKisExtraAccounts.length === 0) return;
    wsHandleRef.current?.send({
      type: 'configure_kis_accounts',
      accounts: activeKisExtraAccounts.map(a => ({ slot: a.slot, appKey: a.appKey, appSecret: a.appSecret })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraKisAccountsKey, kisConfig.isConnected]);

  // 🛡️ 매우 중요한 변경: registeredSymbolsKey를 이 dependency 배열에서 뺐다 — 예전엔 종목이
  // 하나만 바뀌어도 이 effect 전체가 재실행되어(cleanup으로 기존 연결을 끊고) 처음부터 완전히
  // 새 연결을 맺었다. 60종목 목표에서는 종목 하나 바뀔 때마다 60개 전부(체결가+호가 120건)를
  // 다시 구독하는 셈이라 매우 비효율적이고, 재연결되는 몇 초 동안 실시간 데이터 공백도 생겼다.
  // 이제 연결 자체는 로그인/앱초기화/KIS연동상태/HTS ID가 바뀔 때만 재수립되고, 종목 목록
  // 변경은 바로 아래의 별도 effect가 "diff(바뀐 종목만)" 방식으로 처리한다.

  // ============================================================
  // ⚡ 실시간 슬롯 우선순위 배정기 (5초 주기)
  // ------------------------------------------------------------
  // 앱키 1개로는 실시간 등록이 약 41건뿐이라, 72종목 중 20종목만 실시간(체결가+호가)으로 받는다.
  //   1순위: 보유 중 / 매도 대기 중 — 손절·익절이 돌려면 실시간 필수. 절대 밀려나지 않는다.
  //   2순위: 매수 주문 중(매수시도 ~ 체결 전)
  //   3순위: 봇 ON 종목 중 "후보 점수"가 높은 순
  //   4순위: 봇 OFF 종목 (자리가 남을 때만)
  // 후보 점수는 REST 데이터만으로도 공정하게 계산되는 신호만 쓴다(호가 A·D, 체결강도 급증처럼
  // 실시간이 있어야만 나오는 신호는 제외 — 그렇지 않으면 REST 종목은 영영 올라올 수 없다).
  //   P 눌림목 3 · B 돌파 3 · V VWAP 2 · C CVD(가격이력 기반) 2 · E 체결강도≥130 2 · Q 거래량 1 · R RSI45~70 1
  // 잦은 교체 방지: 올라간 종목은 최소 30초 유지, 교체는 후보 점수가 2점 이상 높을 때만.
  // ============================================================
  // 🎯 (2026-09-28 변경) 인벤토리 19종목 전부를 실시간으로 받는다 — 실시간 배정 한도 = 인벤토리 한도.
  // (예전: 활성 앱키 개수 × 20종목. 이제 인벤토리가 19종목 고정이라 앱키 1개로 전 종목이 실시간이다.)
  const REALTIME_SLOT_CAPACITY = MAX_INVENTORY_PER_MARKET; // 계좌 1개 19종목, 계좌 #2 등록 시 38종목
  const REALTIME_MIN_HOLD_MS = 30000;
  const REALTIME_SWAP_MARGIN = 2;
  const REALTIME_REJECT_COOLDOWN_MS = 60000;

  useEffect(() => {
    if (!isAppInitialized) return;

    const computeCandidateScore = (t: ScalperTab): number => {
      const sn = t.sensors;
      const stock = stocksRef.current.find(st => st.symbol === t.symbol);
      let score = 0;
      if (sn?.pullback) score += 3;
      if (sn?.breakout) score += 3;
      if (sn?.vwap) score += 2;
      if (sn?.cvd) score += 2;
      if ((stock?.executionStrength || 0) >= 130) score += 2;
      if (sn?.volumeMomentum) score += 1;
      if (sn && sn.rsi >= 45 && sn.rsi <= 70) score += 1;
      return score;
    };

    const allocate = () => {
      const now = Date.now();
      const tabs = scalperTabsRef.current.filter(t => /^\d{6}$/.test(t.symbol || '')); // 국내 종목만 KIS 실시간 대상
      const current = new Set<string>(realtimeSymbolsRef.current);

      const isHolding = (t: ScalperTab) =>
        (t.holdingQty || 0) > 0 ||
        (t.gapInventory || []).some(s => typeof s === 'object' && (s.quantity || 0) > 0) ||
        t.lifecycleStatus === 'HOLDING' || t.lifecycleStatus === 'SELL_READY' || t.lifecycleStatus === 'SELLING';
      const isOrdering = (t: ScalperTab) => t.lifecycleStatus === 'BUY_READY' || t.lifecycleStatus === 'BUYING';

      // 1·2순위 — 이미 실시간인 종목을 앞에 둬서, 자리가 모자랄 때도 기존 실시간이 유지되게 한다
      const byIncumbent = (a: ScalperTab, b: ScalperTab) => Number(current.has(b.symbol)) - Number(current.has(a.symbol));
      const holdings = tabs.filter(isHolding).sort(byIncumbent);
      const ordering = tabs.filter(t => !isHolding(t) && isOrdering(t)).sort(byIncumbent);
      const mandatory = [...holdings, ...ordering].map(t => t.symbol);

      let desired: string[];
      let overflow = 0;
      if (mandatory.length >= REALTIME_SLOT_CAPACITY) {
        desired = mandatory.slice(0, REALTIME_SLOT_CAPACITY);
        overflow = Math.max(0, holdings.length - REALTIME_SLOT_CAPACITY);
      } else {
        const mandatorySet = new Set(mandatory);
        const ranked = tabs
          .map((t, idx) => ({ t, idx }))
          .filter(({ t }) => !mandatorySet.has(t.symbol))
          .filter(({ t }) => {
            const rejectedAt = realtimeRejectedAtRef.current[t.symbol];
            return !(rejectedAt && now - rejectedAt < REALTIME_REJECT_COOLDOWN_MS);
          })
          .map(({ t, idx }) => {
            const incumbent = current.has(t.symbol);
            const promotedAt = realtimePromotedAtRef.current[t.symbol] || 0;
            const locked = incumbent && now - promotedAt < REALTIME_MIN_HOLD_MS;
            const eff =
              (locked ? 1000 : 0) +                     // 최소 유지시간 중이면 밀려나지 않음
              (t.isBotActive ? 100 : 0) +               // 3순위(봇 ON) > 4순위(봇 OFF)
              computeCandidateScore(t) +
              (incumbent ? REALTIME_SWAP_MARGIN : 0);   // 교체 문턱 — 2점 이상 높아야 자리를 뺏는다
            return { symbol: t.symbol, eff, idx };
          })
          .sort((a, b) => b.eff - a.eff || a.idx - b.idx);
        desired = [...mandatory, ...ranked.slice(0, REALTIME_SLOT_CAPACITY - mandatory.length).map(r => r.symbol)];
      }

      setRealtimeOverflowCount(prev => (prev === overflow ? prev : overflow));

      const desiredSet = new Set(desired);
      const same = desiredSet.size === current.size && desired.every(sym => current.has(sym));
      if (same) return;

      const promoted = desired.filter(sym => !current.has(sym));
      const demoted = [...current].filter(sym => !desiredSet.has(sym));
      promoted.forEach(sym => { realtimePromotedAtRef.current[sym] = now; });
      demoted.forEach(sym => {
        delete realtimePromotedAtRef.current[sym];
        // 다시 실시간으로 올라오면 워밍업(실시간 틱 10개)부터 새로 받게 하고, REST 백업이 즉시 이 종목을 챙기게 한다
        wsTickCountRef.current[sym] = 0;
        lastWsTickAtRef.current[sym] = 0;
      });
      if (promoted.length || demoted.length) {
        console.log('[실시간 슬롯 재배정]', { 실시간: desired.length, 승격: promoted, 강등: demoted });
      }
      realtimeSymbolsRef.current = desired;
      setRealtimeSymbols(desired);
    };

    allocate();
    const timer = setInterval(allocate, 5000);
    return () => clearInterval(timer);
  }, [isAppInitialized, registeredSymbolsKey, REALTIME_SLOT_CAPACITY]);

  // ============================================================
  // 🎯 diff 기반 구독 관리 — 연결을 재시작하지 않고, 실시간 배정 목록에서 실제로 바뀐 종목만
  // 구독/해제 요청을 보낸다. 자리를 먼저 비워야 KIS 등록 한도(41건)에 걸리지 않으므로
  // 해제(unsubscribe)를 먼저, 구독(subscribe)을 나중에 보낸다.
  // ============================================================
  const realtimeSymbolsKey = realtimeSymbols.join(',');
  useEffect(() => {
    const handle = wsHandleRef.current;
    if (!handle || handle.socket.readyState !== WebSocket.OPEN) return; // 연결 전이면 아무 것도 안 함 — 연결되는 순간 그 시점의 배정 목록으로 구독됨

    const currentSymbols = new Set<string>(realtimeSymbolsRef.current);
    const prevSymbols = prevSubscribedSymbolsRef.current;

    const added: string[] = [];
    const removed: string[] = [];
    currentSymbols.forEach(sym => { if (!prevSymbols.has(sym)) added.push(sym); });
    prevSymbols.forEach(sym => { if (!currentSymbols.has(sym)) removed.push(sym); });

    if (added.length === 0 && removed.length === 0) return;

    console.log('[WS 구독 diff]', { 추가: added, 제거: removed });

    removed.forEach(symbol => { handle.send({ type: 'unsubscribe', symbol }); });
    added.forEach(symbol => { handle.send({ type: 'subscribe', symbol }); });

    prevSubscribedSymbolsRef.current = currentSymbols;
  }, [realtimeSymbolsKey, wsConnectionStatus]);

  // ============================================================
  // 🔄 인벤토리에 등록된 "모든" 종목이 stocks 배열에 존재하도록 보장한다.
  // ------------------------------------------------------------
  // stocks에 없는 종목은 refreshStalePrices()(10초 주기 전체 동기화)나 market/account 동기화
  // effect가 아예 그 존재를 인지하지 못해서 갱신 대상에서 빠진다. 그 결과 "선택된 1개 종목만
  // 실시간 가격이 반영되고, 나머지 등록 종목은 로딩 시점의(어쩌면 0원이거나 다른 값인) 스냅샷에
  // 계속 갇혀있는" 증상이 생긴다. 새로 나타난 종목은 fallback 값으로만 채우지 않고, 그 자리에서
  // 바로 KIS 실제가를 조회해서 정확한 값으로 채운다.
  // ============================================================
  // ============================================================
// 🔄 인벤토리에 등록된 모든 종목을 stocks 배열에 보장
//
// 중요:
// 초기 KIS 동기화가 끝나기 전에 실행하면
// stocks / scalperTabs / WebSocket의 초기화 순서가 서로 꼬인다.
//
// 따라서:
// KIS 초기화 → 계좌 동기화 → 인벤토리 확정 → App 초기화 완료
// 이후에만 여기서 누락 종목을 보정한다.
// ============================================================
  // 🛡️ 매우 중요한 복원: 이 useEffect는 예전에 파일 손상으로 시작부(선언, isConfigReady 체크,
  // missing 변수 선언)가 통째로 사라지고 몸통만 위의 다른 useEffect 뒤에 잘못 붙어있었다.
  // 등록된 인벤토리 종목 중 아직 stocks 배열에 없는 종목을 찾아서 초기 시드값을 채우고, 실제
  // 가격을 곧바로 조회해서 보정하는 역할이다.
  useEffect(() => {
    if (!currentUser) return;
    if (!isAppInitialized) return;
    if (!kisConfig.isConnected) return;
    if (!kisService.isConfigReady()) { console.log('[인벤토리 시딩 중단] config 준비 안 됨'); return; }
    const missing = scalperTabs.filter(t => !stocksRef.current.some(s => s.symbol === t.symbol));
    if (missing.length === 0) return;
    console.log('[인벤토리 시딩 진행]', { 누락종목: missing.map(t => t.symbol) });

    setStocks(prev => {
      const existing = new Set(prev.map(s => s.symbol));
      const additions: Stock[] = missing
        .filter(t => !existing.has(t.symbol))
        .map(t => {
          const isUS = /^[A-Za-z]/.test(t.symbol);
         
          return {
            symbol: t.symbol,
            name: t.name,
            price: 0,
            change: 0,
            changePercent: 0,
            volume: '0',
            history: [],
            market: isUS ? 'US' : 'KR',
            isAI: false
          };
        });
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });

  }, [currentUser, isAppInitialized, kisConfig.isConnected, scalperTabs]);
  // recommendation(추천 스냅샷)·strategy(봇 설정) 네임스페이스는 여기서 절대 건드리지 않는다.
  // 🛡️ 외부(KIS 앱 등) 매도 감지 시 매매 일지 반영 작업이 같은 종목에 대해 중복 실행되지 않도록 막는 락
  const externalSellReconcileInFlightRef = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    const externallyClosedSymbols: { symbol: string; name: string }[] = [];
    setScalperInventory(prev => {
      let changed = false;
      const next = prev.map(item => {
        const live = stocks.find(s => s.symbol === item.symbol);
        const holdingQty = holdings[item.symbol] || 0;
        const avgPrice = avgPrices[item.symbol] || 0;
        const currentPrice = (live && live.price > 0) ? live.price : item.market.currentPrice;
        const evaluationAmount = Number((holdingQty * currentPrice).toFixed(2));

        // 주문가능수량: 선택된 종목은 KIS 실계좌 조회값(kisBuyableQty) 우선, 그 외는 예수금/현재가 기반 추정치
        const isThisSelected = selectedSymbol === item.symbol;
        const orderableQty = (isThisSelected && kisBuyableQty !== null)
          ? kisBuyableQty
          : Math.max(0, Math.floor(balance / (currentPrice || 1)));

        const marketChanged = !!live && live.price > 0 && (
          item.market.priceStatus === 'LOADING' ||
          item.market.currentPrice !== live.price ||
          item.market.change !== (live.change || 0) ||
          item.market.changePercent !== (live.changePercent || 0) ||
          item.market.volume !== (live.volume || '0')
        );

        // 🛡️ 외부(KIS 앱 등)에서 매도되어 실제 보유수량(holdings, handleSyncKIS가 20초마다 KIS
        // 잔고조회로 갱신)이 0이 됐는데도, 카드 UI의 보유중 표시(초록 테두리·호박색 LED·정렬 그룹)는
        // status.state(lifecycleStatus)만 보고 판단해서 전혀 안 바뀌던 버그 수정(2026-09-28, 사용자
        // 지적) — 예전엔 이 effect가 account.holdingQty 숫자만 0으로 갱신하고 status.state와
        // account.positions(슬롯 배열)는 전혀 건드리지 않아서, 숫자는 0으로 바뀌어도 카드 자체는
        // 새로고침(=페이지 재시작 시 스캘퍼 탭을 처음부터 다시 만드는 로직)을 하기 전까지 영원히
        // "보유중" 상태로 멈춰 있었다. 이제 확정된 보유수량이 0이면 여기서 WATCHING으로 되돌리고
        // 슬롯 배열도 함께 비운다. 다만 이 종목에 대해 우리 프로그램이 직접 낸 매도 주문이 아직
        // 체결 확인 전이라 일시적으로 0으로 보일 수 있는 SELL_READY/SELLING은, 로컬
        // pendingSellOrders에 그 종목 주문이 없을 때만(=우리 봇이 낸 매도가 아니라 외부에서 먼저
        // 팔린 것으로 확인될 때만) 되돌린다 — 우리 봇이 낸 매도 주문의 정상적인 체결 확인 흐름을
        // 방해하지 않기 위함. BUY_READY/BUYING(매수 주문 진행 중)은 원래도 보유수량이 0인 게
        // 정상이므로 건드리지 않는다.
        const hasOwnPendingSellOrder = pendingSellOrdersRef.current.some(o => o.symbol === item.symbol);
        const shouldClearHeldStatus =
          holdingQty <= 0 &&
          (item.account.positions || []).length > 0 &&
          (
            item.status.state === 'HOLDING' ||
            ((item.status.state === 'SELL_READY' || item.status.state === 'SELLING') && !hasOwnPendingSellOrder)
          );

        if (shouldClearHeldStatus) {
          externallyClosedSymbols.push({ symbol: item.symbol, name: item.name });
        }

        const accountChanged =
          item.account.holdingQty !== holdingQty ||
          item.account.avgPrice !== avgPrice ||
          item.account.evaluationAmount !== evaluationAmount ||
          item.account.orderableQty !== orderableQty ||
          shouldClearHeldStatus;

        if (!marketChanged && !accountChanged) return item;
        changed = true;
        return {
          ...item,
          market: marketChanged && live ? {
            ...item.market,
            currentPrice: live.price,
            change: live.change || 0,
            changePercent: live.changePercent || 0,
            volume: live.volume || '0',
            priceStatus: 'LIVE',
            lastUpdatedAt: Date.now()
          } : item.market,
          account: accountChanged ? {
            ...item.account,
            holdingQty,
            avgPrice,
            evaluationAmount,
            orderableQty,
            positions: shouldClearHeldStatus ? [] : item.account.positions,
            lastUpdatedAt: Date.now()
          } : item.account,
          status: shouldClearHeldStatus ? {
            ...item.status,
            state: 'WATCHING',
            message: '[외부 매도 감지] 보유수량 0 확인 — 관망 상태로 복귀',
            lastUpdatedAt: Date.now()
          } : item.status
        };
      });
      return changed ? next : prev;
    });

    if (externallyClosedSymbols.length > 0) {
      externallyClosedSymbols.forEach(({ symbol }) => {
        addLog(symbol, '매도', 0, 0, '[외부 매도 감지] KIS 앱 등 외부 경로에서 매도되어 실제 보유수량 0 확인 — 보유중 표시 자동 해제');
      });

      // 🛡️ 신호 성과 분석(매매 일지)에도 반영(2026-09-28, 사용자 요청) — 예전엔 우리 프로그램이
      // 직접 낸 매도(executeTrade)만 recordSellFill()로 기록되고, KIS 앱 등에서 직접 판 청산은
      // 매매 일지에 전혀 안 남아서 "청산 거래 0건"으로 계속 표시됐다. 여기서 그 종목의 오늘
      // 체결내역(getTodayFilledSellSummary — 프로그램/KIS 앱 구분 없이 계좌 전체의 실제 체결을
      // 가져옴)을 조회해서, 실제 체결가/수량으로 열린 매수 로트를 청산 거래로 기록한다.
      // 🛡️ 이 reconciliation은 이 tick에서 status.state를 이미 WATCHING으로 되돌려버리므로
      // (위 setScalperInventory에서), 다음 tick부터는 shouldClearHeldStatus 조건 자체가 다시
      // 참이 되지 않아 effect가 이 종목을 다시 시도해주지 않는다 — 그래서 "다음 사이클에 재시도"를
      // 기대할 수 없고, 여기서 자체적으로 몇 차례 재시도한 뒤(KIS 체결내역 반영 지연 대비) 그래도
      // 못 찾으면 잘못된 가격으로 기록하는 대신 로트만 정리한다(dropOpenLots) — 다만 이 경우
      // 신호 성과 통계에는 반영되지 못한다.
      externallyClosedSymbols.forEach(({ symbol, name }) => {
        if (externalSellReconcileInFlightRef.current.has(symbol)) return;
        if (!hasOpenLots(symbol)) return; // 애초에 매매 일지가 이 종목을 보유 중으로 알고 있지 않으면 할 일 없음
        externalSellReconcileInFlightRef.current.add(symbol);
        (async () => {
          try {
            const qtyToClose = getOpenLotQty(symbol);
            if (qtyToClose <= 0) return;

            let summary: { totalQty: number; avgPrice: number; lastFillTime: string } | null = null;
            for (let attempt = 0; attempt < 4 && !summary; attempt++) {
              if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
              summary = await kisService.getTodayFilledSellSummary(symbol);
            }

            if (summary && summary.avgPrice > 0 && summary.totalQty > 0) {
              const isUSSym = /^[A-Za-z]/.test(symbol) && !/^\d+$/.test(symbol);
              const producedExternal = recordSellFill(
                symbol,
                name || symbol,
                summary.avgPrice,
                qtyToClose,
                'MANUAL',
                (bp, sp, q) => calculateNetProfitAmount(bp, sp, q, isUSSym ? 'US' : 'KR'),
                currentJournalSession()
              );
              try { onCaseSellFill(symbol, summary.avgPrice, qtyToClose, 'MANUAL', producedExternal, !hasOpenLots(symbol)); } catch { /* 무시 */ }
              addLog(symbol, '매도', summary.avgPrice, qtyToClose, `[외부 매도 반영] KIS 체결내역 기준 실제 체결가(${summary.avgPrice.toLocaleString()}원)로 청산 거래 ${qtyToClose}주 기록 — 신호 성과 분석에 반영됨`);
            } else {
              dropOpenLots(symbol);
              try { closeCaseUnknown(symbol, 'MANUAL(체결가 확인 실패)'); } catch { /* 무시 */ }
              addLog(symbol, '매도', 0, 0, '[외부 매도 반영 실패] KIS 체결내역에서 실제 체결가를 찾지 못해 청산 거래로 기록하지 못함 — 보유 로트만 정리(신호 성과 통계에는 반영 안 됨)');
            }
          } catch (e) {
            console.warn('[외부 매도 반영] 실패(무시):', e);
          } finally {
            externalSellReconcileInFlightRef.current.delete(symbol);
          }
        })();
      });
    }
  }, [stocks, holdings, avgPrices, selectedSymbol, kisBuyableQty, balance]);

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const lastMarket = (localStorage.getItem('sleek_last_market') as 'KR' | 'US') || 'KR';
    const lastUS = localStorage.getItem('sleek_last_symbol_US') || 'NVDA';
    const lastKR = localStorage.getItem('sleek_last_symbol_KR') || '010170';
    return lastMarket === 'US' ? lastUS : lastKR;
  });

  // Manual Limit Sell States
  const [manualSellModalOpen, setManualSellModalOpen] = useState<boolean>(false);
  const [manualSellStock, setManualSellStock] = useState<Stock | null>(null);
  const [manualSellPrice, setManualSellPrice] = useState<number>(0);
  const [manualSellQty, setManualSellQty] = useState<number>(1);
  const [isSubmittingManualSell, setIsSubmittingManualSell] = useState<boolean>(false);

  const scalperTabsRef = React.useRef<ScalperTab[]>(scalperTabs);
  // 🎯 인벤토리 20번째 이후 국내 종목의 시세 조회(현재가·분봉)는 계좌 #2 앱키로 보낸다
  const quoteAccount2SymbolsKey = scalperTabs
    .filter(t => /^\d{6}$/.test(t.symbol || ''))
    .slice(INVENTORY_LIMIT)
    .map(t => t.symbol)
    .join(',');
  useEffect(() => {
    kisService.setQuoteAccountSymbols(quoteAccount2SymbolsKey ? quoteAccount2SymbolsKey.split(',') : []);
  }, [quoteAccount2SymbolsKey]);

  useEffect(() => {
    scalperTabsRef.current = scalperTabs;
    try {
      // Persist tabs but ensure isBotActive is stored as false to prevent auto-start on fresh reloads
      const safeTabsToPersist = scalperTabs.map(t => ({
        ...t,
        isBotActive: false,
        scalperMessage: "대기 중..."
      }));
      localStorage.setItem('sleek_scalper_tabs', JSON.stringify(safeTabsToPersist));
    } catch (e) {
      console.error("Failed to persist scalperTabs", e);
    }
  }, [scalperTabs]);

  // 프로그램 초기 로딩 시 모든 스캘퍼 봇이 반드시 정지(STOP) 상태로 시작되도록 보장
  useEffect(() => {
    setIsGapBotActive(false);
    setScalperInventory(prev => prev.map(item => ({
      ...item,
      strategy: { ...item.strategy, isBotActive: false },
      status: { ...item.status, message: "대기 중...", lastUpdatedAt: Date.now() }
    })));
  }, []);

  const activeTabIdRef = React.useRef<string>(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const handleSwitchTab = (tabId: string) => {
   
    if (tabId === activeTabIdRef.current) return;
    const targetTab = scalperTabsRef.current.find(t => t.id === tabId);
    if (!targetTab) return;

    // 1. Save current active tab's properties into scalperInventory/monitors before switching
    const prevTabId = activeTabIdRef.current;
    if (prevTabId) {
      const prevTabSymbol = scalperTabsRef.current.find(t => t.id === prevTabId)?.symbol;
      updateTab(prevTabId, {
        isBotActive: isGapBotActiveRef.current,
        gapBuyPrice: gapBuyPriceRef.current,
        gapSellPrice: gapSellPriceRef.current,
        tradeQuantity: tradeQuantityRef.current,
        maxSlots: maxSlotsRef.current || 3,
        // 🛡️ 종목코드(symbol)는 탭ID(prevTabId)와 비교 대상이 다르다 — 실제 이 탭이 나타내는
        // 종목코드(prevTabSymbol)와 비교해야 한다. 이게 어긋나 있으면 다른 종목의 슬롯이 이
        // 탭에 잘못 저장되고, 다음 탭 전환 때 그 슬롯의 symbol이 새 탭 것으로 덮어써지면서
        // "엉뚱한 종목 이름 아래 다른 종목의 매수가"가 표시되는 원인이 된다.
        gapInventory: (gapInventoryRef.current || []).filter(s => !s.symbol || s.symbol === prevTabSymbol),
        gapTradingProfit: gapTradingProfitRef.current,
        gapTradeCount: gapTradeCountRef.current,
        lastTradeType: lastTradeTypeRef.current,
        scalperMessage: scalperMessageRef.current,
        entryPriceMode: entryPriceModeRef.current,
        autoCancelThreshold: autoCancelThresholdRef.current
        // tradeLogs는 전역 GLOBAL TRADE LOGS이므로 여기서 다루지 않는다 (addLog가 종목별 로그를 직접 기록함)
      });
    }

    // 2. Set new active tab and sync refs immediately
    activeTabIdRef.current = tabId;
    setActiveTabId(tabId);
    setSelectedSymbol(targetTab.symbol);
    setIsGapBotActive(targetTab.isBotActive);
    setGapBuyPrice(targetTab.gapBuyPrice);
    setGapSellPrice(targetTab.gapSellPrice);
    setTradeQuantity(targetTab.tradeQuantity);
    setMaxSlots(targetTab.maxSlots || 3);

    // Ensure the stock exists in stocks and stocksCache so it never reverts to default stock
    const isTargetUS = /^[A-Za-z]/.test(targetTab.symbol);
    const resolvedName = (targetTab.name && targetTab.name !== targetTab.symbol) ? targetTab.name : getResolvedStockName(targetTab.symbol);
    setStocks(prev => {
      if (prev.some(s => s.symbol === targetTab.symbol)) {
        return prev.map(s => s.symbol === targetTab.symbol && (!s.name || s.name === s.symbol) ? { ...s, name: resolvedName } : s);
      }
      const tabStockObj: Stock = {
        symbol: targetTab.symbol,
        name: resolvedName,
        price: targetTab.gapBuyPrice || (isTargetUS ? 10 : 1000),
        change: 0,
        changePercent: 0,
        volume: '0',
        history: [{ time: '09:00', price: targetTab.gapBuyPrice || (isTargetUS ? 10 : 1000) }],
        market: isTargetUS ? 'US' : 'KR',
        isAI: false
      };
      return [tabStockObj, ...prev];
    });

    const nextInv = (targetTab.gapInventory || [])
  .filter(
    slot =>
      slot &&
      typeof slot === 'object' &&
      'id' in slot
  )
  // 🛡️ 여기서 symbol을 검증 없이 targetTab.symbol로 덮어쓰면, 저장 단계 필터를 어떻게든
  // 통과해 섞여 들어온 다른 종목의 슬롯까지 "이 종목 것"으로 재라벨링해버려서 문제가
  // 사라지지 않고 계속 반복된다. 자기 자신의 심볼이거나(정상) 심볼이 아예 없는(구버전 데이터)
  // 슬롯만 통과시키고, 명백히 다른 종목 것이면 여기서 제외한다.
  .filter(slot => !slot.symbol || slot.symbol === targetTab.symbol)
  .map(slot => ({
    id: String(slot.id),
    price: Number(slot.price || 0),
    quantity: Number(slot.quantity || 0),
    symbol: targetTab.symbol
  }));

setGapInventory(nextInv);
    gapInventoryRef.current = nextInv;

    setGapTradingProfit(targetTab.gapTradingProfit || 0);
    setGapTradeCount(targetTab.gapTradeCount || 0);
    setLastTradeType(targetTab.lastTradeType || null);
    setScalperMessage(targetTab.scalperMessage || "대기 중...");
    // (2026-09-29) 진입 호가는 전역 설정 하나로 통일 — 탭을 선택할 때 그 탭에 저장된 옛 값(BID2)으로 전역 값을 되돌리지 않는다
    // setEntryPriceMode(targetTab.entryPriceMode || 'BID2');
    setAutoCancelThreshold(targetTab.autoCancelThreshold || 0.2);
    // tradeLogs(전역 GLOBAL TRADE LOGS)는 탭을 전환해도 그대로 유지된다 — 여기서 덮어쓰지 않는다.
    // 선택 종목만의 로그는 화면에서 scalperTabs의 해당 항목(tradeLogs) 또는 GLOBAL 필터로 조회한다.
  };

  const openOrSwitchScalperTab = (
    symbol: string,
    customName?: string,
    customPrice?: number,
    recommendationSource?: ScalperRecommendation
  ) => {
    // 🛡️ 해외 종목 등록 원천 차단 — 이 앱은 국내(KOSPI/KOSDAQ) 스캘핑 전용이다. 검색/추천/직접입력 등
    // 어느 경로로 들어오든, 종목코드가 국내 표준 형식(숫자 6자리)이 아니면 여기서 무조건 막는다.
    // (엔비디아 같은 해외 종목이 인벤토리에 등록되는 것 자체가 설계상 있어서는 안 되는 오류)
    if (!/^\d{6}$/.test(symbol)) {
      showNotification(`[등록 차단] ${customName || symbol}은(는) 해외 종목이라 등록할 수 없습니다. 이 앱은 국내 종목 전용입니다.`, 'error');
      return;
    }

    const existing = scalperTabsRef.current.find(t => t.symbol === symbol || t.id === symbol);
    if (existing) {
      handleSwitchTab(existing.id);
      return;
    }

    // Save current active tab's properties before creating new tab
    const prevTabId = activeTabIdRef.current;
    if (prevTabId) {
      const prevTabSymbol = scalperTabsRef.current.find(t => t.id === prevTabId)?.symbol;
      updateTab(prevTabId, {
        isBotActive: isGapBotActiveRef.current,
        gapBuyPrice: gapBuyPriceRef.current,
        gapSellPrice: gapSellPriceRef.current,
        tradeQuantity: tradeQuantityRef.current,
        maxSlots: maxSlotsRef.current || 3,
        // 🛡️ 종목코드는 탭ID(prevTabId)가 아니라 실제 이 탭의 종목코드(prevTabSymbol)와 비교해야 한다
        gapInventory: (gapInventoryRef.current || []).filter(s => !s.symbol || s.symbol === prevTabSymbol),
        gapTradingProfit: gapTradingProfitRef.current,
        gapTradeCount: gapTradeCountRef.current,
        lastTradeType: lastTradeTypeRef.current,
        scalperMessage: scalperMessageRef.current,
        entryPriceMode: entryPriceModeRef.current,
        autoCancelThreshold: autoCancelThresholdRef.current
        // tradeLogs는 전역 GLOBAL TRADE LOGS이므로 여기서 다루지 않는다 (addLog가 종목별 로그를 직접 기록함)
      });
    }

    const stock = stocksRef.current.find(s => s.symbol === symbol) ||
                  INITIAL_STOCKS_KR.find(s => s.symbol === symbol);
    const isUS = stock?.market === 'US' || /^[A-Za-z]/.test(symbol) || marketType === 'US';

    // 🛡️ customName이 비어있거나 종목코드와 똑같으면(호출부에서 이름 해석에 실패했다는 뜻) 그대로
    // 믿지 않고 재보정한다 — 여러 등록 경로 중 어디서 들어오든 "코드가 이름으로 표시"되는 걸 막는
    // 마지막 안전망이다.
    const safeCustomName = (customName && customName.trim().length > 0 && customName !== symbol) ? customName : undefined;
    const name = safeCustomName || stock?.name || getResolvedStockName(symbol) || symbol;
    const price =
  customPrice && customPrice > 0
    ? customPrice
    : stock?.price && stock.price > 0
    ? stock.price
    : 1000;
    if (price <= 0) {
  console.warn(
    '[TAB OPEN BLOCKED]',
    {
      symbol,
      customPrice,
      stockPrice: stock?.price
    }
  );
  return;
}
    // 🛡️ 인벤토리가 가득 찼을 때 밀어낼 종목 결정 — 보유 중이거나 주문 진행 중인 종목은 절대 밀어내지 않는다.
    // 밀어낼 수 있는 종목이 하나도 없으면 등록 자체를 하지 않는다.
    const isProtectedTab = (t: ScalperTab) =>
      (t.holdingQty || 0) > 0 ||
      (t.gapInventory || []).some(s => typeof s === 'object' && (s.quantity || 0) > 0) ||
      ['BUY_READY', 'BUYING', 'HOLDING', 'SELL_READY', 'SELLING'].includes(t.lifecycleStatus || '');
    const sameMarketNow = scalperTabsRef.current.filter(t => isUS ? /^[A-Z]/.test(t.symbol) : !/^[A-Z]/.test(t.symbol));
    let evictedSymbol: string | null = null;
    if (!sameMarketNow.some(t => t.symbol === symbol) && sameMarketNow.length >= MAX_INVENTORY_PER_MARKET) {
      const evictable = sameMarketNow.filter(t => !isProtectedTab(t) && t.id !== prevTabId);
      // 봇 OFF 종목을 먼저, 그다음 가장 뒤(오래된) 종목부터
      const pick = [...evictable].reverse().find(t => !t.isBotActive) || evictable[evictable.length - 1];
      if (!pick) {
        showNotification(`[등록 불가] 인벤토리 ${MAX_INVENTORY_PER_MARKET}종목이 모두 보유/주문 중이라 ${customName || symbol}을(를) 추가할 자리가 없습니다.`, 'error');
        return;
      }
      evictedSymbol = pick.symbol;
    }

    const limits = calculateStockLimits(price, stock?.changePercent || 0, isUS, stock?.basePrice);

    if (customName && customName !== symbol) {
      setCustomStockNames(prev => ({ ...prev, [symbol]: customName }));
    }

    const newStockObj: Stock = {
      symbol,
      name,
      price,
      change: stock?.change || 0,
      changePercent: stock?.changePercent || 0,
      volume: stock?.volume || '0',
      history: stock?.history && stock.history.length > 0 ? stock.history : Array.from({ length: 40 }, (_, i) => ({ time: `${i}:00`, price })),
      market: isUS ? 'US' : 'KR',
      isAI: !!stock?.isAI
    };

    setStocks(prev => {
      if (prev.some(s => s.symbol === symbol)) {
        return prev.map(s => s.symbol === symbol ? { ...s, name } : s);
      }
      return [newStockObj, ...prev];
    });

    setStocksCache(prev => ({
      ...prev,
      [isUS ? 'US' : 'KR']: [
        newStockObj,
        ...(prev[isUS ? 'US' : 'KR'] || []).filter(s => s.symbol !== symbol)
      ]
    }));

    const newInventoryItem: ScalperInventoryItem = createInventoryItem({
      symbol,
      name: newStockObj.name || symbol,
      price: newStockObj.price || 0,
      recommendedPrice: recommendationSource?.recommendedPrice, // 추천 당시 가격 — 없으면 createInventoryItem이 price로 대체
      recommendation: recommendationSource ? {
        score: recommendationSource.scalpingScore,
        grade: recommendationSource.grade,
        reason: recommendationSource.reason,
        tags: recommendationSource.tags,
        category: recommendationSource.category
      } : { reason: '수동 등록', category: '수동 등록' },
      strategy: {
        gapBuyPrice: limits.lowerLimit,
        gapSellPrice: limits.upperLimit,
        // 🛡️ 매우 중요한 원칙: 수량은 등록 시점이 아니라 오직 실제 매수 시그널이 발생하는 그
        // 순간에만 계산되어야 한다 — 등록 시점의 가격은 이미 오래된 값일 수 있고, 실제 매수는
        // 그 이후 시그널이 뜬 시점의 최신 가격을 기준으로 이뤄지기 때문이다. 등록 시점에 미리
        // 계산해두면 그 값이 실제 매수 판단과 무관하게 굳어버릴 위험이 있어 항상 0으로 시작한다.
        tradeQuantity: 0
      }
    });

    // (한도 초과 시 밀어낼 종목은 위에서 보유/주문 중 종목을 보호하며 이미 결정했다 — evictedSymbol)

    setScalperInventory(prev => {
      const sameMarket = prev.filter(t => isUS ? /^[A-Z]/.test(t.symbol) : !/^[A-Z]/.test(t.symbol));
      const diffMarket = prev.filter(t => isUS ? !/^[A-Z]/.test(t.symbol) : /^[A-Z]/.test(t.symbol));
      const updatedSame = evictedSymbol
        ? sameMarket.filter(t => t.symbol !== evictedSymbol)
        : sameMarket;
      return isUS ? [...diffMarket, newInventoryItem, ...updatedSame] : [newInventoryItem, ...updatedSame, ...diffMarket];
    });

    addLog(symbol, '매수', newInventoryItem.recommendation.price, 0, `[상태변경] 등록 → ${LIFECYCLE_STATUS_LABEL.WATCHING} — 인벤토리 등록 완료, 전략 센서 감시 시작`);

    // 합성(가짜) history 대신 실제 KIS 분봉 데이터로 즉시 교체 — 전략 센서 신뢰도 확보
    seedRealHistory(symbol).then(realHistory => {
      if (realHistory && realHistory.length > 0) {
        setStocks(prev => prev.map(s => s.symbol === symbol ? { ...s, history: realHistory } : s));
      }
    });

    activeTabIdRef.current = symbol;
    setActiveTabId(symbol);
    setSelectedSymbol(symbol);
    // 🛡️ 여기서 무조건 false로 고정하면, createInventoryItem이 기본적으로 true로 만들어도
    // 방금 만든 종목이 "선택된 탭"이 되는 순간 엔진은 이 GLOBAL 값을 참조하므로 실제로는
    // 시작되지 않는 문제가 있었다. 실제로 생성된 항목의 isBotActive 값과 동기화한다.
    isGapBotActiveRef.current = newInventoryItem.strategy.isBotActive;
    setIsGapBotActive(newInventoryItem.strategy.isBotActive);
    setGapBuyPrice(newInventoryItem.strategy.gapBuyPrice);
    setGapSellPrice(newInventoryItem.strategy.gapSellPrice);
    setGapInventory([]);
    gapInventoryRef.current = [];
    setGapTradingProfit(0);
    setGapTradeCount(0);
    setLastTradeType(null);
    setScalperMessage("대기 중...");
    // tradeLogs(전역 GLOBAL TRADE LOGS)는 새 종목을 등록해도 비우지 않는다 — 다른 종목들의 로그가 유지되어야 한다.
  };

  const closeScalperTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // 🛡️ 예전에는 "마지막 남은 종목 1개는 삭제 금지" 제한이 있었는데, 이것 때문에 사용자가
    // 특정 종목을 지우려 해도 그게 마지막 하나면 X 버튼이 조용히 아무 반응도 안 하는 문제가
    // 있었다. 빈 인벤토리 상태는 이미 안전하게 처리되므로(자동으로 다른 종목을 채워 넣지 않음)
    // 이 제한을 없애고 몇 개가 남아있든 항상 삭제되도록 한다.

    const targetTab = scalperTabs.find(t => t.id === tabId);
    const targetIsUS = targetTab ? /^[A-Z]/.test(targetTab.symbol) : marketType === 'US';

    const remaining = scalperTabs.filter(t => t.id !== tabId);
    setScalperInventory(prev => prev.filter(t => t.id !== tabId));

    if (activeTabId === tabId) {
      // Find remaining tabs that belong to the SAME market as current active market
      const sameMarketTabs = remaining.filter(t => {
        const isUS = /^[A-Z]/.test(t.symbol);
        return marketType === 'US' ? isUS : !isUS;
      });

      if (sameMarketTabs.length > 0) {
        // Switch to adjacent/last tab in the same market
        const nextTab = sameMarketTabs[sameMarketTabs.length - 1];
        handleSwitchTab(nextTab.id);
      } else if (remaining.length > 0) {
        // 현재 시장(KR/US)에는 남은 탭이 없지만 다른 시장에 탭이 있다면 그쪽으로 전환한다.
        // (기본 종목을 몰래 새로 등록하지 않는다 — "등록만 하고 매매는 시작하지 않는다"는 원칙을 위반하게 됨)
        const otherMarketTab = remaining[remaining.length - 1];
        setMarketType(/^[A-Z]/.test(otherMarketTab.symbol) ? 'US' : 'KR');
        handleSwitchTab(otherMarketTab.id);
      } else {
        // 등록된 종목이 완전히 하나도 없는 상태 — 어떤 종목도 자동으로 다시 채워 넣지 않는다.
        activeTabIdRef.current = '';
        setActiveTabId('');
        setSelectedSymbol('');
      }
    }
  };

  // 🛡️ 인벤토리 전체 초기화 — 개별 종목 삭제가 어떤 이유로든 안 될 때를 위한 확실한 대안.
  // scalperInventory를 통째로 비우고, 선택 상태도 함께 초기화한다.
  const handleClearAllInventory = () => {
    setScalperInventory([]);
    activeTabIdRef.current = '';
    setActiveTabId('');
    setSelectedSymbol('');
    try { localStorage.setItem('sleek_scalper_tabs', JSON.stringify([])); } catch (e) {}
    showNotification('인벤토리를 전체 초기화했습니다.', 'info');
  };

  // 🌅 (2026-09-29) 하루 첫 실행 시 인벤토리 초기화 — 전날 추천으로 들어와 있던 종목들을 그대로 두면, 옛 상태(보유중/매도중
  // 표시·슬롯·고점 기억 등)가 섞여 새로고침 직후 오판 위험이 있다. 그날 처음 프로그램이 켜지면, KIS 실잔고로 보유수량이
  // 확정된 뒤 **보유 중이거나 진행 중인 주문이 있는 종목만 남기고** 나머지는 모두 비운다(빈 자리는 추천종목 자동 채움이 다시 채움).
  // 같은 날 새로고침할 때는 동작하지 않는다(날짜는 브라우저에 기록, KST 기준).
  useEffect(() => {
    if (!isAppInitialized) return;
    const DAY_KEY = 'sleek_inventory_daily_reset_v1';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    let done = false;
    try { done = localStorage.getItem(DAY_KEY) === today; } catch (e) {}
    if (done) return;
    const iv = setInterval(() => {
      if (!kisHoldingsConfirmedRef.current) return; // KIS 실잔고 확정 전엔 무엇이 보유 종목인지 모름 — 기다린다
      clearInterval(iv);
      try { localStorage.setItem(DAY_KEY, today); } catch (e) {}
      const keep = (sym: string) =>
        (holdingsRef.current[sym] || 0) > 0 ||
        pendingBuyOrdersRef.current.some(o => o.symbol === sym) ||
        pendingSellOrdersRef.current.some(o => o.symbol === sym) ||
        pendingTradeKeysRef.current.has(`${sym}_BUY`) || pendingTradeKeysRef.current.has(`${sym}_SELL`);
      const removed: string[] = [];
      setScalperInventory(prev => {
        const next = prev.filter(item => {
          if (keep(item.symbol)) return true;
          removed.push(item.name || item.symbol);
          return false;
        });
        return next.length === prev.length ? prev : next;
      });
      setTimeout(() => {
        if (removed.length > 0) {
          if (!scalperTabsRef.current.some(t => t.id === activeTabIdRef.current)) {
            activeTabIdRef.current = '';
            setActiveTabId('');
          }
          addLog('SYSTEM', '매수', 0, 0, `[하루 첫 실행 인벤토리 초기화] 보유·주문 중이 아닌 ${removed.length}종목 정리 — ${removed.slice(0, 19).join(', ')} (빈 자리는 추천종목 자동 채움으로 다시 채워짐)`);
          showNotification(`오늘 첫 실행 — 보유 종목만 남기고 인벤토리 ${removed.length}종목을 정리했습니다.`, 'info');
        }
      }, 0);
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAppInitialized]);


  const [pendingBuyOrders, setPendingBuyOrders] = useState<PendingBuyOrder[]>([]);
  const pendingBuyOrdersRef = React.useRef<PendingBuyOrder[]>([]);
  const [pendingSellOrders, setPendingSellOrders] = useState<PendingSellOrder[]>([]);
  const pendingSellOrdersRef = React.useRef<PendingSellOrder[]>([]);
  // 🛡️ 동일 주문번호(order.id)에 대한 cancelOrder() 중복 호출 방지 락.
  // pendingBuyOrders/pendingSellOrders 감시 effect들은 stocks(웹소켓 틱마다 갱신)를 의존성에 포함하고
  // 있어서 초당 여러 번 재실행될 수 있는데, 이전 cancelOrder() 호출이 KIS 응답을 기다리는 동안
  // pendingXxxOrders state가 아직 갱신되지 않은 채로 effect가 다시 실행되면 같은 주문에 대해
  // cancelOrder()가 중복으로 나가버린다(APBK0927 "정정취소 가능수량이 없습니다" 반복 발생의 원인).
  // 주문번호는 매수/매도 어느 쪽이든 KIS가 발급하는 고유 식별자이므로 하나의 Set으로 공유한다.
  const cancelInFlightRef = React.useRef<Set<string>>(new Set());
  // 🔎 KIS에 살아있는데 로컬이 모르는 매도 대기 주문(고아 주문) 즉시 점검 함수 — 20초 주기 점검 effect가 채워 둔다
  const runOrphanSellCheckRef = React.useRef<(() => Promise<void> | void) | null>(null);
  // 🔒 (2026-10-04) 대기 매수 중복 방지
  //   handledBuyOrderIdsRef : 이번 실행에서 프로그램이 직접 내고 주문번호를 받은 매수 주문 — 주문 처리 흐름이 직접 관리하므로
  //                           KIS 대조(고아 주문 복구)가 다시 등록하지 않는다(같은 체결을 두 번 반영하는 것 방지).
  //   buyUnknownCooldownRef : 주문 응답 불명(지연·주문번호 없음) 뒤 종목별 매수 휴지 만료 시각
  const handledBuyOrderIdsRef = React.useRef<Set<string>>(new Set());
  const buyUnknownCooldownRef = React.useRef<Record<string, number>>({});
  //   orderReconcileReadyRef : KIS 미체결 주문과의 첫 대조가 끝났는지 — 끝나기 전에는 새 매수를 내지 않는다.
  //                            (새로고침 직후 대기 매수 목록이 비어 있는 몇 초 사이에 같은 종목에 또 주문하는 것 방지)
  const orderReconcileReadyRef = React.useRef(false);
  // 🛡️ 미체결 매수/매도 감시 effect는 stocks(웹소켓 틱마다 갱신)를 의존성에 포함하고 있어서
  // 초당 여러 번 재실행되는데, 그때마다 대기 중인 주문 하나하나에 대해 kisService.checkOrderExecution()
  // (체결내역 조회 REST 호출)을 매번 다시 날리고 있었다. 체결 확인은 500ms~2초 간격이면 충분한데
  // 초당 수 회씩 중복 조회를 큐에 쌓아버리니, 정작 그 요청들이 공유하는 시장데이터 큐
  // (kisService의 requestQueueChain — 잔고 동기화/호가 폴링/가격 백업도 함께 쓴다)가 붐벼서
  // 실제 체결(매수/매도 직후 반영)이 오히려 늦게 확인되는 역효과가 있었다. 주문번호별로 마지막
  // 조회 시각을 기록해두고, 최소 간격 안에는 재조회하지 않고 그대로 넘어간다.
  const lastOrderCheckAtRef = React.useRef<Record<string, number>>({});
  const ORDER_CHECK_INTERVAL_MS = 1500;

  // 🛡️ 매도 주문 취소 안전 헬퍼 — 외부 검토(2026-09-28) 반영.
  // 기존엔 cancelOrder()가 실패해도(.catch(() => {})로 무시하거나, rt_cd !== '0'이어도)
  // pendingSellOrders에서 그냥 제거하고 넘어갔다. 취소가 실제로 안 됐는데도 로컬에서만
  // "정리됨" 처리하면, 그 뒤(특히 손절 강제취소 경로)에서 "기존 매도주문이 없어졌다"고 착각하고
  // 새 매도 주문을 하나 더 내버릴 위험이 있다 — 실제로는 KIS에 옛 매도 주문이 여전히 살아있는데
  // 그 위에 새 매도 주문이 겹치는 것이다.
  // 이 함수는 (1) 취소 전에 KIS 실제 미체결 잔량(rmndQty)을 먼저 확인해서, 이미 종료된
  // 주문이면 cancelOrder() 자체를 호출하지 않고, (2) 취소가 실패하면(APBK0927 등) 즉시 한 번
  // 더 상태를 재확인해서 진짜로 살아있는 주문인지 판별한다. 호출한 쪽은 반환값이
  // 'CANCELLED' | 'ALREADY_CLOSED'일 때만 로컬 pendingSellOrders에서 그 주문을 제거해야 하고,
  // 'REJECTED' | 'UNKNOWN'이면 절대 제거하지 말고(=주문이 여전히 살아있을 수 있음) 그대로 둬야 한다.
  const cancelPendingSellOrderSafely = async (
    order: PendingSellOrder
  ): Promise<'CANCELLED' | 'ALREADY_CLOSED' | 'REJECTED' | 'UNKNOWN'> => {
    const orderId = String(order.id || '').trim();

    if (!orderId || orderId.startsWith('SLOT-')) {
      return 'UNKNOWN';
    }

    // 같은 주문에 대한 동시 취소 요청 차단 (기존 cancelInFlightRef 락 재사용)
    if (cancelInFlightRef.current.has(orderId)) {
      return 'UNKNOWN';
    }
    cancelInFlightRef.current.add(orderId);

    try {
      // 1. 취소 전에 KIS 실제 주문 상태를 먼저 확인 — 이미 체결/취소되어 미체결 잔량이
      //    없으면 굳이 취소 API를 호출하지 않는다.
      const status = await kisService.checkOrderExecution(orderId);

      if (!status?.found) {
        console.warn(`[매도 취소 보류] 주문번호 ${orderId}의 KIS 상태를 확인하지 못했습니다.`);
        return 'UNKNOWN';
      }

      const remainingQty = Number(status.rmndQty || 0);
      if (remainingQty <= 0) {
        return 'ALREADY_CLOSED';
      }

      // 2. 실제 미체결 잔량이 있을 때만 취소 요청
      const cancelRes = await kisService.cancelOrder(
        order.symbol,
        order.orgNo || '',
        orderId,
        remainingQty.toString(),
        order.ordDvsn || kisConfig.domesticOrderType || '00'
      );

      if (cancelRes?.rt_cd === '0') {
        return 'CANCELLED';
      }

      const msgCd = String(cancelRes?.msg_cd || '');
      const msg1 = String(cancelRes?.msg1 || '');

      // 3. 취소가 실패했으면(APBK0927 등) 즉시 한 번 더 상태를 재확인한다 — 취소 요청과
      //    체결/취소가 거의 동시에 벌어졌을 수 있으므로, 재조회로 진짜 상태를 가려낸다.
      const recheck = await kisService.checkOrderExecution(orderId);
      const recheckRemainingQty = Number(recheck?.rmndQty || 0);

      if (recheckRemainingQty <= 0) {
        return 'ALREADY_CLOSED';
      }

      console.warn(`[매도 취소 실패] 주문번호 ${orderId}: ${msg1} (${msgCd}) — 잔량 ${recheckRemainingQty}주 그대로 유지`);
      return 'REJECTED';
    } catch (error: any) {
      console.error(`[매도 취소 예외] 주문번호 ${orderId}:`, error);
      return 'UNKNOWN';
    } finally {
      cancelInFlightRef.current.delete(orderId);
    }
  };

  // 📒 (2026-09-28 신호 성과 점검) 취소하려던 매도 주문이 "이미 종료(ALREADY_CLOSED)"로 확인된 경우,
  // 그 종료가 취소가 아니라 "체결"이었을 수 있다. 예전엔 이때 체결 로그를 남기지 않아서 매매 일지에
  // 청산 거래로 기록되지 않았다(나중에 외부 매도 감지가 '수동 매도'로 뭉뚱그려 기록하거나, 아예 누락).
  // 여기서 실제 체결수량을 한 번 확인해 새로 체결된 만큼을 원래 매도 사유와 함께 기록한다.
  const recordFillOfClosedSellOrder = async (order: PendingSellOrder) => {
    try {
      const st = await kisService.checkOrderExecution(order.id);
      const cumulative = Number(st?.ccldQty || 0);
      const delta = cumulative - (processedFilledQtyRef.current[order.id] || 0);
      delete processedFilledQtyRef.current[order.id];
      if (delta > 0) {
        const px = Number(st?.price || 0) > 0 ? Number(st?.price) : order.orderPrice;
        addLog(order.symbol, '매도', px, delta, `[KIS 지정가 매도 체결] 취소 확인 전 이미 ${delta}주 체결됨`, { exitReason: order.exitReason });
        // (2026-10-04) 체결된 만큼 보유수량도 바로 줄인다 — 예전엔 로그만 남기고 잔고 동기화를 기다려서, 그 사이 엔진이
        // 이미 팔린 물량을 또 팔려고 했다(KIS 매도가능수량 0주로 건너뜀 → 5초 휴지).
        const heldNow = holdingsRef.current[order.symbol] || 0;
        if (heldNow > 0) {
          const nextQty = Math.max(0, heldNow - delta);
          const newHoldings = { ...holdingsRef.current };
          if (nextQty <= 0) { delete newHoldings[order.symbol]; delete recentLocalTradesRef.current[order.symbol]; }
          else {
            newHoldings[order.symbol] = Number(nextQty.toFixed(4));
            if (recentLocalTradesRef.current[order.symbol]) recentLocalTradesRef.current[order.symbol].quantity = nextQty;
          }
          holdingsRef.current = newHoldings;
          setHoldings(newHoldings);
          try { localStorage.setItem('sleek_holdings', JSON.stringify(newHoldings)); } catch (e) {}
          setTimeout(() => { if (!syncInProgressRef.current) handleSyncKISRef.current(); }, 500);
        }
      }
    } catch (e) {
      console.warn('[종료된 매도주문 체결 확인 실패]', e);
    }
  };

  // 🛡️ 매도취소 재시도 쿨다운(2026-09-28, APBK0927 반복 호출 수정) — cancelInFlightRef는 "지금
  // 이 요청이 진행 중인지"만 막아주고, 요청이 끝나자마자(finally에서) 즉시 풀린다. 그런데
  // cancelPendingSellOrderSafely()를 호출하는 두 지점(-0.5% 하락 자동취소 effect, 손절매도 직전
  // 기존주문 취소) 모두 stocks 웹소켓 틱마다 반복 실행되므로, 취소가 REJECTED(=KIS가 "정정취소
  // 가능수량이 없습니다/APBK0927"로 거부)로 끝나도 바로 다음 틱에서 같은 주문에 대해 다시
  // cancelPendingSellOrderSafely()가 호출되어 초당 여러 번 APBK0927이 반복 발생했다. REJECTED/
  // UNKNOWN(=상태확인 자체가 실패) 결과를 받으면 이 주문번호에 대해서는 최소한 아래 시간만큼
  // 재시도를 쉬어서, KIS 쪽 체결/취소 상태가 정리될 시간을 준다.
  const sellCancelRetryCooldownRef = React.useRef<Record<string, number>>({});
  const SELL_CANCEL_RETRY_COOLDOWN_MS = 2000;
  const shouldSkipSellCancelRetry = (orderId?: string): boolean => {
    if (!orderId) return false;
    const until = sellCancelRetryCooldownRef.current[orderId] || 0;
    return until > 0 && Date.now() < until;
  };
  const markSellCancelRetryCooldown = (orderId?: string) => {
    if (!orderId) return;
    sellCancelRetryCooldownRef.current[orderId] = Date.now() + SELL_CANCEL_RETRY_COOLDOWN_MS;
  };
  const clearSellCancelRetryCooldown = (orderId?: string) => {
    if (!orderId) return;
    delete sellCancelRetryCooldownRef.current[orderId];
  };

  const buyingLockPricesRef = React.useRef<{ symbol: string; price: number }[]>([]);
  const lastBuyEventTimeRef = React.useRef<Record<string, number>>({}); // 🛡️ 종목별 마지막 매수 시각 — 진입 쿨다운 판단용
  const ENTRY_COOLDOWN_MS = 5000; // 같은 종목에 새 매수 이벤트를 시작하기 전 최소 대기시간 (한 이벤트 안에서 여러 슬롯을 한번에 채우는 것은 예외)
  const isExecutingRef = React.useRef<boolean>(false);
  const pendingTradeKeysRef = React.useRef<Set<string>>(new Set());
  const duplicateBlockLoggedAtRef = React.useRef<Record<string, number>>({});

  // ============================================================
  // 🛑 네트워크/API 과부하 시 자동 정지 안전장치
  // ------------------------------------------------------------
  // 목적은 단순하다 — 최고의 수익을 내는 것. 그러려면 시세/체결 데이터가
  // 신뢰할 수 없는 상태(네트워크 지연, API 실패 급증)에서는 매매를 계속하면
  // 안 된다. kisService가 최근 30초간의 API 호출 결과를 추적하고 있으므로,
  // 여기서는 그 상태를 주기적으로 확인해서 문제가 있으면 전체 봇을 즉시
  // 정지시킨다.
  // ============================================================
  const emergencyStoppedRef = React.useRef(false);
  // 🛡️ 연속 불량 판정 횟수(2026-09-28 추가) — 예전엔 5초 점검에서 딱 한 번만 "불안정"으로 나와도
  // 그 즉시 전체 스캘퍼를 정지시켰다. REST 요청이 순간적으로 몰려(예: 웹소켓 재연결 직후 stale
  // 종목 백업 조회) 잠깐 429가 몇 건 났다가 몇 초 안에 정상으로 돌아오는 "일시적 blip"까지도
  // 전부 정지로 이어져서, 사용자가 "자꾸 스캘퍼가 멈춘다"고 느낀 원인 중 하나로 보인다. 이제는
  // 5초 간격으로 연속 2회(=최소 10초) 계속 불안정해야 실제로 정지한다 — 진짜 지속적인 장애는
  // 여전히 잡아내면서, 순간적인 blip에는 더 이상 반응하지 않는다.
  const consecutiveUnhealthyRef = React.useRef(0);
  const REQUIRED_CONSECUTIVE_UNHEALTHY = 2;
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const anyBotActive = isGapBotActiveRef.current || scalperTabsRef.current.some(t => t.isBotActive);
      if (!anyBotActive) {
        emergencyStoppedRef.current = false; // 봇이 꺼져있으면 상태 플래그 초기화
        consecutiveUnhealthyRef.current = 0;
        return;
      }

      const health = kisService.getNetworkHealth();
      if (!health.healthy) {
        consecutiveUnhealthyRef.current += 1;
        if (consecutiveUnhealthyRef.current < REQUIRED_CONSECUTIVE_UNHEALTHY) {
          console.warn(`[네트워크 상태 점검] 1회 불안정 감지(${consecutiveUnhealthyRef.current}/${REQUIRED_CONSECUTIVE_UNHEALTHY}) — ${health.reason || '알 수 없는 원인'} — 연속으로 계속되면 정지`);
          return;
        }
        if (!emergencyStoppedRef.current) {
          emergencyStoppedRef.current = true;
          setIsGapBotActive(false);
          setScalperInventory(prev => prev.map(item => ({ ...item, strategy: { ...item.strategy, isBotActive: false } })));
          addLog('SYSTEM', '매도', 0, 0, `[긴급 정지] 네트워크/API 상태 불안정으로 전체 스캘퍼를 자동 정지했습니다 — ${health.reason || '알 수 없는 원인'}`);
          showNotification(`⚠️ [긴급 정지] 네트워크/API 상태가 불안정하여 전체 스캘퍼를 자동 정지했습니다. (${health.reason || '알 수 없는 원인'})`, "error");
        }
      } else {
        emergencyStoppedRef.current = false;
        consecutiveUnhealthyRef.current = 0;
      }
    }, 5000); // 5초마다 상태 점검

    return () => clearInterval(checkInterval);
  }, []);

  useEffect(() => {
    pendingBuyOrdersRef.current = pendingBuyOrders;
  }, [pendingBuyOrders]);
  useEffect(() => {
    pendingSellOrdersRef.current = pendingSellOrders;
  }, [pendingSellOrders]);

  // ============================================================
  // 🔍 매도주문 정정취소가능조회 기반 실시간 정합성 점검(2026-09-28)
  // ------------------------------------------------------------
  // 목적: KIS 서버가 "지금 이 순간 실제로 취소 가능한 주문"만 콕 집어 알려주는 전용 조회
  // (정정취소가능주문조회)를 주기적으로 불러서, 로컬 pendingSellOrders가 놓치고 있는 매도
  // 대기 주문("고아 주문")이 있는지 찾아 복구한다. 이런 고아 주문이 생기면 — 예를 들어
  // 네트워크 순단으로 주문 응답을 못 받아 로컬 등록에 실패했거나, 알 수 없는 코드 경로로
  // 누락된 경우 — KIS 계좌에는 실제로 물량이 매도 주문에 묶여 있는데 로컬 코드는 그 사실을
  // 몰라서 같은 종목에 대해 또 매도를 시도하거나(수량 부족으로 거부), 보유수량 판단이
  // 흐트러져 새로운 매수/매도 결정에 영향을 줄 수 있다. 발견되면 즉시 pendingSellOrders에
  // 등록해서 기존의 취소/재시도 안전장치(cancelPendingSellOrderSafely 등)가 이어서 관리하게
  // 만든다. 순수 진단/복구 목적이며 매도 판단 로직(트레일링/손절 조건) 자체는 건드리지 않는다.
  // ============================================================
  const rvsecnclCheckInFlightRef = React.useRef(false);
  useEffect(() => {
    const doCheck = async () => {
      const anyBotActive = isGapBotActiveRef.current || scalperTabsRef.current.some(t => t.isBotActive);
      if (!anyBotActive) return;
      if (rvsecnclCheckInFlightRef.current) return;
      rvsecnclCheckInFlightRef.current = true;
      try {
        const liveOrders = await kisService.getPsblRvsecnclOrders();
        if (!liveOrders || liveOrders.length === 0) return;

        // 🔒 (2026-10-04) 매수 대기 주문도 KIS 기준으로 대조한다. 예전엔 매도만 대조해서, 새로고침으로 대기 매수 목록이
        // 사라졌거나 주문 응답을 못 받아 등록하지 못한 매수 주문은 KIS에 살아 있는데도 프로그램이 몰랐다 → "빈 슬롯"으로 보고
        // 같은 종목에 또 주문 → 나중에 여러 주문이 한꺼번에 체결. 발견한 주문은 대기 매수 목록에 넣어 슬롯을 차지하게 하고,
        // 기존 감시(체결 확인·30초 만료 취소)가 이어받는다. 프로그램이 직접 관리 중인 주문(handledBuyOrderIdsRef)과
        // 지금 주문 전송 중인 종목은 건드리지 않는다.
        {
          const localBuyIds = new Set(pendingBuyOrdersRef.current.map(o => o.id));
          const orphanBuys = liveOrders.filter(o =>
            !o.isSell && o.cancelablePsblQty > 0 && !!o.odno &&
            !localBuyIds.has(o.odno) && !handledBuyOrderIdsRef.current.has(o.odno) &&
            !pendingTradeKeysRef.current.has(`${o.symbol}_BUY`)
          );
          if (orphanBuys.length > 0) {
            const recoveredBuys: PendingBuyOrder[] = orphanBuys.map(o => {
              // 이미 체결된 분량은 KIS 잔고 동기화로 보유수량에 들어와 있으므로 다시 세지 않도록 표시해 둔다
              processedFilledQtyRef.current[o.odno] = Math.max(0, o.orderQty - o.cancelablePsblQty);
              return {
                id: o.odno, orgNo: o.orgNo, symbol: o.symbol, orderPrice: o.orderPrice,
                quantity: o.cancelablePsblQty, originalQuantity: o.orderQty || o.cancelablePsblQty,
                createdAt: Date.now(), // 주문 시각을 정확히 모르므로 발견 시점부터 만료 시간을 잰다
                ordDvsn: isKrxAfterMarketSession() ? '41' : '00',
              };
            });
            pendingBuyOrdersRef.current = [...pendingBuyOrdersRef.current, ...recoveredBuys.filter(o => !pendingBuyOrdersRef.current.some(p => p.id === o.id))];
            setPendingBuyOrders(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newOnes = recoveredBuys.filter(o => !existingIds.has(o.id));
              return newOnes.length === 0 ? prev : [...prev, ...newOnes];
            });
            addLog('SYSTEM', '매수', 0, 0, `[매수주문 정합성 점검] 프로그램이 모르던 KIS 매수 대기 주문 ${orphanBuys.length}건 발견 및 복구 — ${orphanBuys.map(o => `${o.symbol} ${o.orderPrice.toLocaleString()}원 ${o.cancelablePsblQty}주`).join(', ')}`);
            console.warn('[정정취소가능조회 정합성 점검] 고아 매수주문 발견', orphanBuys);
          }
        }

        const localIds = new Set(pendingSellOrdersRef.current.map(o => o.id));
        const orphanSells = liveOrders.filter(o => o.isSell && o.cancelablePsblQty > 0 && !localIds.has(o.odno));

        if (orphanSells.length > 0) {
          const recovered: PendingSellOrder[] = orphanSells.map(o => ({
            id: o.odno,
            orgNo: o.orgNo,
            symbol: o.symbol,
            orderPrice: o.orderPrice,
            quantity: o.cancelablePsblQty,
            createdAt: Date.now(),
            type: 'LIMIT_SELL' as const,
            reason: '[정정취소가능조회 복구] 로컬에 없던 매도 대기 주문을 KIS에서 발견',
            buyPrice: avgPricesRef.current[o.symbol] || undefined,
          }));
          setPendingSellOrders(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newOnes = recovered.filter(o => !existingIds.has(o.id));
            if (newOnes.length === 0) return prev;
            return [...prev, ...newOnes];
          });
          const names = orphanSells.map(o => o.symbol).join(', ');
          addLog('SYSTEM', '매도', 0, 0, `[매도주문 정합성 점검] 로컬에서 놓치고 있던 KIS 매도 대기 주문 ${orphanSells.length}건 발견 및 복구 — ${names}`);
          console.warn('[정정취소가능조회 정합성 점검] 고아 매도주문 발견', orphanSells);
        }
      } catch (e) {
        console.warn('[정정취소가능조회 정합성 점검] 실패(무시)', e);
      } finally {
        rvsecnclCheckInFlightRef.current = false;
        orderReconcileReadyRef.current = true; // 조회를 한 번이라도 마쳤으면(결과가 없어도) 새 매수 허용
      }
    };

    // 🛡️ 시작을 10초 지연(2026-09-28 추가) — 이 effect와 handleSyncKIS(masterInterval의
    // masterTickCount % 20 === 0)가 둘 다 앱 초기화/KIS 연결 직후 거의 동시에 mount되기 때문에,
    // 아무 지연 없이 바로 20초 setInterval을 걸면 두 "20초마다" 주기가 계속 같은 순간에 겹쳐서
    // 발생한다(둘 다 REST 호출을 동반). 이렇게 겹치는 순간마다 REST 요청이 한꺼번에 몰려 429
    // 위험이 커지고, 그 실패가 getNetworkHealth() 표본에 쌓여 스캘퍼 자동 정지로 이어질 수 있다
    // (사용자 지적 — "REST 호출이 너무 잦은 것 아니냐"). 10초 지연으로 두 주기를 절반씩 어긋나게
    // 만들어 REST 부하가 시간축에 고르게 퍼지도록 한다.
    runOrphanSellCheckRef.current = doCheck; // 매도 APBK0400(수량 초과) 직후 즉시 점검에 사용
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    const startTimeout = setTimeout(() => {
      doCheck(); // 10초 지연 후 1회 실행하고, 그 시점부터 20초 간격 반복 시작 (→ 10초, 30초, 50초, ... handleSyncKIS의 20/40/60초와 절반씩 어긋남)
      checkInterval = setInterval(doCheck, 20000);
    }, 10000);

    return () => {
      clearTimeout(startTimeout);
      if (checkInterval) clearInterval(checkInterval);
    };
  }, []);

  const [autoCancelThreshold, setAutoCancelThreshold] = useState<number>(0.2); // 0.2%
  const [immediateEntry, setImmediateEntry] = useState<boolean>(false);
  const [entryPriceMode, setEntryPriceMode] = useState<'CURRENT' | 'BID1' | 'BID2' | 'BID3' | 'BID4'>('BID1'); // (2026-10-06) −2틱 → −1틱: 10/6 오전 주문 15건이 전부 미체결(통과 신호는 가격이 오르는 자리라 −2틱에 닿지 않음). 이전: (2026-10-04) 사용자 요청으로 매수 2호가(현재가 −2틱 지정가)로 복귀. // (2026-10-01) 사용자 요청으로 매수 4호가(현재가 −4틱 지정가). 이력: 1호가 → 2호가 → 4호가 → 2호가 → 3호가 → 2호가 → 4호가 (2026-09-29 2호가 복귀 사유: 사용자 결정 — 매수 과다는 체결강도·슬롯 제한으로 대응). 이전 주석: // 🎯 사용자 요청으로 매수 1호가 → 2호가로 기본값 변경
  const lowestBidOnlyMode = entryPriceMode === 'BID4'; // Backward compatibility ref
  const [scalperMessage, setScalperMessage] = useState<string>("대기 중...");
  const gapInventoryRef = React.useRef<{id: string, price: number, quantity: number, symbol?: string}[]>([]);
  const processedFilledQtyRef = React.useRef<Record<string, number>>({});
  useEffect(() => {
    gapInventoryRef.current = gapInventory;
  }, [gapInventory]);

  // Automated Scalping Configuration States
  const [scalpingTargetProfit, setScalpingTargetProfit] = useState<number>(() => getLiveParams().sellTargetNetPct); // (2026-10-04) 기본값은 전략 버전(자기최적화 대상)에서 읽는다 — 화면에서 바꾼 값은 새로고침·전략 변경 전까지만 유지 // (2026-09-30 오후) 사용자 요청 0.2% → 0.8%(가격 기준 약 +1.03%). Scalping net target profit (수수료·세금 뺀 순수익 기준. 2026-09-29: 0.15%→0.2% — 실거래 결과 트레일링이 +0.15%에서 켜진 뒤 바로 2틱 밀려 본전 근처 청산이 반복돼 상향(가격 기준 약 +0.43%))
  const [scalpingStopLoss, setScalpingStopLoss] = useState<number>(() => getLiveParams().sellStopNetPct); // (2026-10-04) 전략 버전에서 읽음 // 순손실 기준. 2026-09-30 오후: 슬롯3 방어 삭제와 함께 -0.8%(무조건 손절). 이력: -1 → -0.3 → -0.6 → -0.8 → -0.6 → -0.8
  // 📋 신호 성과 창에 보여줄 '현재 적용 중인 매매 규칙' — 기준값을 바꿀 때 통계와 함께 비교하기 위함
  // 🧪 (2026-09-30) 자기최적화 현재 전략 버전 — [적용]/[되돌리기] 시 화면 규칙 표시 갱신 + 로그
  const [liveStrategyVersion, setLiveStrategyVersion] = useState<string>(getLiveVersion());
  useEffect(() => { setLiveStrategyVersion(getLiveVersion()); }, []);
  useEffect(() => subscribeStrategy((v, note, isStartup) => {
    setLiveStrategyVersion(v);
    // 💰 (2026-10-04) 매도 규칙(익절 목표·손절폭)도 전략 버전을 따른다 — 시작할 때와 [적용]/[되돌리기] 때 화면·엔진 값을 맞춘다
    {
      const LPs = getLiveParams();
      if (Number.isFinite(LPs.sellTargetNetPct) && LPs.sellTargetNetPct > 0) setScalpingTargetProfit(LPs.sellTargetNetPct);
      if (Number.isFinite(LPs.sellStopNetPct) && LPs.sellStopNetPct < 0) setScalpingStopLoss(LPs.sellStopNetPct);
    }
    if (isStartup) { if (v !== 'V1.0.0') addLogRef.current?.('SYSTEM', '매수', 0, 0, `[전략 버전] ${v} 적용 중${note ? ` — ${note}` : ''}`); return; }
    addLogRef.current?.('SYSTEM', '매수', 0, 0, `[전략 변경] 매매 기준이 ${v}로 바뀌었습니다${note ? ` — ${note}` : ''}`);
  }), []);
  const tradingRulesInfo = React.useMemo(() => {
    const LPr = getLiveParams();
    const priceModeText: Record<string, string> = { CURRENT: '현재가 지정가', BID1: '현재가 −1틱 지정가', BID2: '현재가 −2틱 지정가', BID3: '현재가 −3틱 지정가', BID4: '현재가 −4틱 지정가' };
    const trailLive = Math.max(1, Number(LPr.sellTrailTicks) || TRAILING_DROP_TICKS);
    const trailMaxLive = Math.max(TRAILING_MAX_DROP_TICKS, trailLive + 1);
    const entryTicks = ({ CURRENT: 0, BID1: 1, BID2: 2, BID3: 3, BID4: 4 } as Record<string, number>)[entryPriceMode] ?? 0;
    return [
      { group: 'BUY', label: '매수 기준 점수', value: `[${liveStrategyVersion}] A급(눌림목 있음) ${LPr.aScoreThreshold} · B급(눌림목 없음) ${LPr.bScoreThreshold} / 애프터 +${LPr.afterExtraScore} (만점 100)` },
      { group: 'BUY', label: '매수 차단 조건', value: `하나라도 해당하면 점수와 무관하게 매수 안 함: ${LPr.blockD ? 'D(매수호가우세) · ' : ''}체결강도 기준 미만(대형 ${LPr.minExecStrengthLarge} · 중형 ${LPr.minExecStrengthMid} · 소형 ${LPr.minExecutionStrength}) · ${LPr.requireAboveVwap ? 'VWAP 아래 · ' : ''}${LPr.blockPriorHighBreakout ? '전고점 돌파 20초 이내 · ' : ''}5분 거래대금 ${LPr.minTradeValue5m / 1e8}억 미만 · 스프레드 ${LPr.maxSpreadTicks + 1}틱 이상 · 실시간 호가 없음(10초) · 60초 체결 기준 미만(대형 ${LPr.minTicks60sLarge} · 중형 ${LPr.minTicks60sMid} · 소형 ${LPr.minTicks60s}건)${LPr.bMinExecutionStrength > LPr.minExecutionStrength ? ` · B급 체결강도 ${LPr.bMinExecutionStrength} 미만` : ''} · Bull ${LPr.minBullScore} 미만 · Bear ${LPr.maxBearScoreForEntry} 초과 · Bear 초과 차단 후 ${(getLiveParams().bearHoldSec * 1000) / 1000}초 이내${LPr.maxBullishRun1m > 0 ? ` · 1분봉 ${LPr.maxBullishRun1m}연속 양봉 이상` : ''} · 가격 이벤트 없음(눌림목·돌파·VWAP 돌파 중 하나도 없음) · 추격매수 위험(체결강도 하락+거래량 감소+가격 정체) · 실시간 체결 1.5초 이상 끊김` },
      { group: 'BUY', label: '유동성 구분', value: `5분 거래대금 대형 ${LPr.tierLargeTradeValue5m / 1e8}억 이상 · 중형 ${LPr.tierMidTradeValue5m / 1e8}억 이상 · 소형 그 미만 — 인벤토리에 들어올 때 정하고 10분마다 다시 보되 경계를 20% 넘었을 때만 변경. 추천·인벤토리 유지는 매수 기준보다 느슨하게(체결강도 −${LPr.watchExecGap}, 분당 체결 대형 ${LPr.watchTicksLarge} · 중형 ${LPr.watchTicksMid} · 소형 ${LPr.watchTicksSmall}건)` },
      { group: 'BUY', label: '매수 제한', value: `종목당 ${MAX_SLOTS_PER_STOCK}슬롯 — 보유 중이거나 대기 주문이 있는 종목은 새 매수 없음 · 같은 종목 재주문은 5초 뒤부터 · 주문 응답이 불명확하면 그 종목 매수 ${Math.round(BUY_UNKNOWN_COOLDOWN_MS / 1000)}초 중지` },
      ...(getLiveParams().trendBuyEnabled ? [{ group: 'BUY' as const, label: '추세 매수', value: `${String(LPr.trendBuyFromHHMM).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2')}~${String(LPr.trendBuyToHHMM).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2')} 사이 1분마다 판단 — 1분 기록의 최근 ${LPr.trendWindowMin}분에서 ① 표본의 ${LPr.trendAboveVwapPct}% 이상이 VWAP 위 ② VWAP 상승 중 ③ 5분 저점이 계속 높아짐 → ${LPr.trendBuyQty}주를 매수1호가에 주문(VWAP 이격 ${LPr.trendMaxVwapGapPct}% 이하 · 스프레드 ${LPr.maxSpreadTicks}틱 이하 · 미보유 · 동시 ${LPr.trendMaxPositions}종목까지) · 매도는 수익일 때만: 고점 대비 −${LPr.trendTrailPct}% 또는 VWAP 0.2% 이탈 · 손실이면 보유, 다음 거래일 같은 시간에 이익이 없으면 같은 수량으로 슬롯 추가(최대 ${LPr.avgDownMaxSlots}슬롯) · 슬롯 소진 후에도 이익이 없으면 손절` }] : []),
      ...(getLiveParams().closeBuyEnabled ? [{ group: 'BUY' as const, label: '마감 매수 판단', value: `평일 15:10~15:20 하루 한 번 — 필수: ${LPr.closeBuyMaDays}일 이동평균이 ${LPr.closeBuyMaLookback}거래일 전보다 높고 현재가가 그 위 · 전일 대비 하락. 추가 기준 5개(거래량이 최근 ${LPr.closeBuyVolDays}일 평균보다 적음 · 하락 폭 −${LPr.closeBuyDropMinPct}~−${LPr.closeBuyDropMaxPct}% · 20일선 위 · 당일 저가 대비 +${LPr.closeBuyBounceFromLowPct}% 이상 또는 최근 30분 상승 · 최근 5거래일 안에 +${LPr.closeBuyRecentUpPct}% 이상 오른 날) 중 ${LPr.closeBuyMinChecks}개 이상이면 ${LPr.closeBuyQty}주를 매수1호가에 주문 · 산 날에는 매도 없음 · 다음 거래일부터 수익일 때만 매도: 고점 대비 −${LPr.trendTrailPct}% 또는 VWAP 0.2% 이탈 · 손실이면 보유, 다음 거래일 15:10~15:20에 이익이 없으면 같은 수량으로 슬롯 추가(최대 ${LPr.avgDownMaxSlots}슬롯) · 슬롯 소진 후에도 이익이 없으면 손절 · 보유 중인 종목은 새 판단에서 제외` }] : []),
      ...(getLiveParams().avgDownEnabled ? [{ group: 'SELL' as const, label: '물타기(손절 보류)', value: `손절 대신 평단 대비 순손실이 단계 폭(손절 기준 × ${getLiveParams().avgDownStepMult}: 대형 −${(Math.abs(LPr.sellStopLargePct) * getLiveParams().avgDownStepMult).toFixed(1)}% · 중형 −${(Math.abs(LPr.sellStopNetPct) * getLiveParams().avgDownStepMult).toFixed(1)}% · 소형 −${(Math.abs(LPr.sellStopSmallPct) * getLiveParams().avgDownStepMult).toFixed(1)}%)에 닿으면 종목당 진입금액만큼 추가 매수(현재가 −1틱) → 새 평단 기준으로 반복, 최대 ${getLiveParams().avgDownMaxSlots}슬롯 · 추가 매수 간격 최소 ${(getLiveParams().avgDownMinGapSec * 1000) / 1000}초 · 오를 때는 추가 매수 없음 · ${getLiveParams().avgDownMaxSlots}슬롯 뒤 같은 폭만큼 더 내리면 전량 손절 · 익절은 평단 기준 그대로` }] : []),
      ...(RESCUE_SLOT_ENABLED ? [{ group: 'SELL' as const, label: '슬롯3 방어', value: `손절선 도달 시 ${Math.round(RESCUE_WAIT_MS / 60000)}분간 추가 매수 신호 대기(1회) → 새 평단 기준 트레일링/손절 · 처음 평단 대비 ${RESCUE_HARD_STOP_NET_PCT}% 무조건 손절` }] : []),
      { group: 'BUY', label: '매수 주문 가격', value: priceModeText[entryPriceMode] || entryPriceMode },
      { group: 'BUY', label: '미체결 매수 취소', value: `주문 후 ${Math.round((getLiveParams().pendingBuyTtlSec * 1000) / 1000)}초(추세·마감 매수는 ${getLiveParams().carryOrderTtlSec}초) 미체결 · 대기 중 체결강도가 구분별 매수 기준 미만${LPr.requireAboveVwap ? ' 또는 현재가가 VWAP 아래' : ''}· 대기 중 Bear가 다시 기준 초과(신호 소멸) · 현재가가 주문가보다 3틱 또는 ${autoCancelThreshold}% 이상 하락 · 주문가보다 +0.5% 그리고 ${entryTicks + 2}틱 이상 상승 — 프로그램이 모르는 KIS 매수 대기 주문은 20초마다 찾아 같은 규칙 적용` },
      { group: 'SELL', label: '익절 기준 (종목별)', value: `진입 시점의 5분 거래대금으로 정해 포지션이 끝날 때까지 고정 — 대형(${LPr.tierLargeTradeValue5m / 1e8}억 이상) +${LPr.sellTargetLargePct}% · 중형(${LPr.tierMidTradeValue5m / 1e8}억~${LPr.tierLargeTradeValue5m / 1e8}억) +${LPr.sellTargetNetPct}% · 소형(${LPr.tierMidTradeValue5m / 1e8}억 미만) +${LPr.sellTargetSmallPct}% · 거래대금을 모르면 중형` },
      { group: 'SELL', label: '익절 (트레일링)', value: `보유 중 최고가 기준 순수익이 익절 기준에 한 번이라도 닿으면 시작 → 최고가에서 ${trailLive}틱 하락 시 매수세가 약하면 매도(체결강도 급락 · 체결강도 100 미만 또는 값 없음 · CVD 하락 · 매수잔량<매도잔량 · 호가 확인 불가 · 실시간 체결 지연 중 하나), 전부 양호하면 보류 → ${trailMaxLive}틱 하락 시 무조건 매도` },
      { group: 'SELL', label: '손절 (종목별)', value: `익절 기준과 같은 구분으로 진입 때 고정 — 대형 ${LPr.sellStopLargePct}% · 중형 ${LPr.sellStopNetPct}% · 소형 ${LPr.sellStopSmallPct}% (순손실) · 도달하면 대기·추가 매수 없이 즉시 손절 · 단, 가격이 평단에서 ${LPr.minStopTicks}틱 이상 내려왔을 때만(틱이 큰 종목의 노이즈 손절 방지) · 실시간 체결이 끊겨도 마지막 가격으로 판단` },
      { group: 'SELL', label: '신호 매도', value: `순수익이 그 종목의 익절 기준 이상이고 실시간 체결이 살아 있을 때만 — RSI 80 이상 과열 반전(체결강도 하락 + VWAP 아래) · 매도세 흡수 · 이평 역전(SMA5<SMA20)` },
      { group: 'SELL', label: '매도 주문 가격', value: `익절·신호 매도: 현재가 −1틱 지정가(실시간 매수1호가가 더 높으면 매수1호가) · 손절: 평단에서 손절 기준(%)만큼 낮은 가격 −1틱 지정가(가격이 그보다 더 내려가 있으면 현재가 −1틱)` },
      { group: 'SELL', label: '미체결 매도 재주문', value: '익절·신호 매도: 기존 주문이 현재가·매수1호가보다 높아 체결될 수 없고 2초가 지나면 취소 후 즉시 재주문 · 손절: 2초 뒤에도 미체결이면 취소 후 재주문 · 주문가 대비 −0.5% 하락 시 자동 취소 · 취소가 확인되지 않으면 새 매도를 내지 않음' },
      { group: 'SELL', label: '가상 매도(로그만)', value: `실제 주문 없음 — 시간 청산(60/90/120초 목표 미달) · 매도점수 4점/6점 · 트레일링 3틱 비교 · 🐂🐻 포지션 평가(Bear≥${LPr.sellBearScore} · Bear>Bull · OBI<${LPr.obiBearThreshold} · 체결강도<120 절반 · 가격 +1% 후 고점 −${LPr.trailingDrawdownPct}% 절반 · ${LPr.timeStopSeconds}초에 가격 +${LPr.minProfitAfterTimeStop}% 미만 · 최대 ${LPr.maxHoldSeconds}초) · 신호마다 매도 조합 30가지(익절 0.4~1.2% × 손절 −0.6~−1.0% × 2·3틱) 가상 매매` },
      { group: 'ETC', label: '애프터 진입 비중', value: `정규장의 ${Math.round(AFTER_POSITION_SIZE_RATIO * 100)}%` },
      { group: 'ETC', label: '마감 구간', value: '15:15 정규장 · 19:50 애프터 — 신규 매수만 중지 (마감 매도 판단 없음)' },
    ] as { group: 'BUY' | 'SELL' | 'ETC'; label: string; value: string }[];
  }, [entryPriceMode, scalpingTargetProfit, scalpingStopLoss, liveStrategyVersion, autoCancelThreshold]);
  const [scalpingSpeed, setScalpingSpeed] = useState<number>(300); // 300ms (0.3s) fast execution speed
  const [scalpingSoundEnabled, setScalpingSoundEnabled] = useState<boolean>(false);
  const [maxSlots, setMaxSlots] = useState<number>(10);

  // ============================================================
  // 💰 종목당 진입금액
  // ============================================================

  const BUY_AMOUNT_OPTIONS = [
    { value: 5000, label: '5천원' },
    { value: 10000, label: '1만원' },
    { value: 20000, label: '2만원' },
    { value: 30000, label: '3만원' },
    { value: 40000, label: '4만원' },
    { value: 50000, label: '5만원' },
    { value: 100000, label: '10만원' },
    { value: 500000, label: '50만원' },
    { value: 1000000, label: '100만원' }
  ] as const;

  // 🛡️ 기본값은 배열의 첫 항목을 자동으로 따라가지 않고 2만원으로 고정한다 — 목록 맨 앞에
  // 5천원/1만원을 다시 추가하면서, "배열 첫 항목 = 기본값"으로 계산하면 기본값이 다시 5천원으로
  // 낮아져 버린다(이전에 1만원 옵션을 없애고 기본값을 2만원으로 올렸던 결정과 어긋남). 이 옵션들은
  // 어디까지나 "선택 가능한 값 추가"이지 기본값 변경 요청이 아니었으므로, 기본값은 명시적으로 2만원을
  // 유지한다.
  const DEFAULT_BUY_AMOUNT = 20000;
  const MIN_BUY_AMOUNT = 1000;        // 직접 입력 하한
  const MAX_BUY_AMOUNT = 10_000_000;  // 직접 입력 상한(오타로 큰 금액이 들어가는 사고 방지)

  const [targetInvestmentPerStock, setTargetInvestmentPerStock] =
    useState<number>(() => {
      const saved = localStorage.getItem(
        'scalper_target_investment'
      );

      const parsed = saved ? Number(saved) : DEFAULT_BUY_AMOUNT;

      // (2026-10-01) 드롭다운 → 직접 입력: 목록에 없는 금액도 허용 (1천원 ~ 1천만원)
      return Number.isFinite(parsed) && parsed >= MIN_BUY_AMOUNT && parsed <= MAX_BUY_AMOUNT
        ? Math.round(parsed)
        : DEFAULT_BUY_AMOUNT;
    });

  useEffect(() => {
    localStorage.setItem(
      'scalper_target_investment',
      String(targetInvestmentPerStock)
    );
  }, [targetInvestmentPerStock]);

  const targetInvestmentPerStockRef =
    React.useRef(targetInvestmentPerStock);

  // 🛡️ (2026-10-01) ref는 렌더 중에 바로 맞춘다(effect를 기다리지 않음) + 바뀔 때 로그로 남겨 실제 적용 시점을 확인할 수 있게 한다
  targetInvestmentPerStockRef.current = targetInvestmentPerStock;
  const prevInvestmentLoggedRef = React.useRef(targetInvestmentPerStock);
  useEffect(() => {
    if (prevInvestmentLoggedRef.current !== targetInvestmentPerStock) {
      addLogRef.current?.('SYSTEM', '매수', 0, 0, `[설정] 종목당 진입금액 ${prevInvestmentLoggedRef.current.toLocaleString()}원 → ${targetInvestmentPerStock.toLocaleString()}원 적용 (이후 매수부터)`);
      prevInvestmentLoggedRef.current = targetInvestmentPerStock;
    }
  }, [targetInvestmentPerStock]);

  // 가격에 맞춰 수량 계산 — 최소 1주는 보장
  const calcQuantityForTargetAmount = React.useCallback(
    (price: number): number => {
      const budget = targetInvestmentPerStockRef.current;

      if (!Number.isFinite(price) || price <= 0) {
        return 0;
      }

      if (!Number.isFinite(budget) || budget <= 0) {
        return 0;
      }

      return Math.floor(budget / price);
    },
    []
  );

  // 💰 추천종목 검색/자동채움 가격구간 — (2026-09-29) 고정 구간 드롭다운 → 하한·상한 금액 직접 입력으로 변경.
  // 기본 5,000원 ~ 10,000원. 입력한 구간의 종목만 KIS 랭킹 API 단계에서부터 후보로 걸러진다.
  // (예전 구간 드롭다운 저장값 sleek_scalper_price_range_index_v2는 더 이상 쓰지 않음 — 새 키 v3)
  const [recPriceMin, setRecPriceMin] = useState<number>(() => {
    const v = Number(localStorage.getItem('sleek_scalper_price_min_v3'));
    return Number.isFinite(v) && v > 0 ? v : 5000;
  });
  const [recPriceMax, setRecPriceMax] = useState<number>(() => {
    const v = Number(localStorage.getItem('sleek_scalper_price_max_v3'));
    return Number.isFinite(v) && v > 0 ? v : 10000;
  });
  useEffect(() => {
    try {
      localStorage.setItem('sleek_scalper_price_min_v3', String(recPriceMin));
      localStorage.setItem('sleek_scalper_price_max_v3', String(recPriceMax));
    } catch (e) {}
  }, [recPriceMin, recPriceMax]);
  const recPriceRangeRef = React.useRef({ min: recPriceMin, max: recPriceMax });
  recPriceRangeRef.current = { min: recPriceMin, max: recPriceMax };
  // 🏷️ (2026-09-30) 추천종목 시장 선택 — 전체 / 코스피만 / 코스닥만. 검색·자동채움 모두 적용.
  const [recMarketFilter, setRecMarketFilter] = useState<'ALL' | 'KOSPI' | 'KOSDAQ'>(() => {
    try {
      const v = localStorage.getItem('sleek_scalper_market_filter_v1');
      return v === 'KOSPI' || v === 'KOSDAQ' ? v : 'ALL';
    } catch (e) { return 'ALL'; }
  });
  useEffect(() => {
    try { localStorage.setItem('sleek_scalper_market_filter_v1', recMarketFilter); } catch (e) {}
  }, [recMarketFilter]);
  const recMarketFilterRef = React.useRef(recMarketFilter);
  recMarketFilterRef.current = recMarketFilter;

  const [allowSamePriceEntry, setAllowSamePriceEntry] = useState<boolean>(false); // 🛡️ 기본값을 안전한 쪽(차단)으로 변경 — 이전 기본값(true=차단 해제)은 "1주씩 연속 매수" 위험의 핵심 원인이었다
  const [enableCombinedAvgProfitExit, setEnableCombinedAvgProfitExit] = useState<boolean>(false); 
  const [isSmartScalperMode, setIsSmartScalperMode] = useState<boolean>(true);
  const [scalperStrategyMode, setScalperStrategyMode] = useState<'AUTO' | 'ALL_SENSORS_4' | 'PULLBACK' | 'BREAKOUT' | 'VWAP_SUPPORT' | 'VOLUME_PROFILE_CVD'>('ALL_SENSORS_4');
  
  // 4대 스캘핑 핵심 전략 다중선택 상태 (눌림목, 돌파, VWAP, CVD)
  const [selectedScalperStrategies, setSelectedScalperStrategies] = useState<('PULLBACK' | 'BREAKOUT' | 'VWAP_SUPPORT' | 'VOLUME_PROFILE_CVD')[]>(() => {
    try {
      const saved = localStorage.getItem('sleek_scalper_selected_strategies');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return ['PULLBACK', 'BREAKOUT', 'VWAP_SUPPORT', 'VOLUME_PROFILE_CVD'];
  });

  useEffect(() => {
    try {
      localStorage.setItem('sleek_scalper_selected_strategies', JSON.stringify(selectedScalperStrategies));
    } catch {}
  }, [selectedScalperStrategies]);

  const selectedScalperStrategiesRef = React.useRef(selectedScalperStrategies);
  useEffect(() => {
    selectedScalperStrategiesRef.current = selectedScalperStrategies;
  }, [selectedScalperStrategies]);

  const [minGapBetweenSlots, setMinGapBetweenSlots] = useState<number>(0.3); // 0.3% gap
  const [isRefreshingTop3, setIsRefreshingTop3] = useState<boolean>(false);

  // Technical Indicators Utility Functions
  const calculateSMA = (data: number[], period: number) => {
    if (data.length < period) return data.length > 0 ? data[data.length - 1] : 0;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  const calculateRSI = (data: number[], period: number = 14) => {
    if (data.length <= period) return 50;
    let gains = 0;
    let losses = 0;

    for (let i = data.length - period; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  const calculateBollingerBands = (data: number[], period: number = 20, multiplier: number = 2) => {
    if (data.length < period) return { upper: 0, middle: 0, lower: 0 };
    const sma = calculateSMA(data, period);
    const slice = data.slice(-period);
    const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return {
      upper: sma + multiplier * stdDev,
      middle: sma,
      lower: sma - multiplier * stdDev
    };
  };

  // 실시간 4대 스캘핑 전략 조건 감지 센서 (종목별 자율 연산)
  const detectStockStrategies = useCallback((targetStock: Stock) => {
    if (!targetStock) return { isPullback: false, isBreakout: false, isVwapSupport: false, isVolumeProfile: false, activeCount: 0, rsi: 50, sma5: 0, sma20: 0, vwap: 0, poc: 0, cvd: 0, isBullishAbsorption: false, isBearishAbsorption: false, bb: { upper: 0, middle: 0, lower: 0 }, momentumPositive: false, isNearLowerBand: false, isNearUpperBand: false, lastPrice: 0, hasVolumeMomentum: false };

    const historyPrices = (targetStock.history ? targetStock.history.map(h => h.price) : [targetStock.price]).filter((p): p is number => typeof p === 'number' && !isNaN(p));
    const currentPrice = targetStock.price || 0;
    if (currentPrice <= 0 || historyPrices.length === 0) {
      return { isPullback: false, isBreakout: false, isVwapSupport: false, isVolumeProfile: false, activeCount: 0, rsi: 50, sma5: 0, sma20: 0, vwap: 0, poc: 0, cvd: 0, isBullishAbsorption: false, isBearishAbsorption: false, bb: { upper: 0, middle: 0, lower: 0 }, momentumPositive: false, isNearLowerBand: false, isNearUpperBand: false, lastPrice: 0, hasVolumeMomentum: false };
    }

    const rsi = calculateRSI(historyPrices, 14);
    const bb = calculateBollingerBands(historyPrices, 20, 2);
    const sma5 = calculateSMA(historyPrices, 5);
    const sma20 = calculateSMA(historyPrices, 20);
    const vwap = getCurrentTrueVwap(targetStock.symbol, currentPrice);

    const isUSStock = targetStock.market === 'US' || /^[A-Za-z]/.test(targetStock.symbol) || marketType === 'US';

    const priceBuckets: Record<string, number> = {};
    historyPrices.forEach(p => {
      const bucket = isUSStock ? p.toFixed(4) : p.toFixed(0);
      priceBuckets[bucket] = (priceBuckets[bucket] || 0) + 1;
    });
    let maxVolBucket = 0;
    let poc = currentPrice;
    Object.entries(priceBuckets).forEach(([pStr, count]) => {
      if (count > maxVolBucket) {
        maxVolBucket = count;
        poc = Number(pStr);
      }
    });

    // 🛡️ 예전엔 이 변수 이름이 "cvd"였는데, 실제로는 매수체결량-매도체결량의 누적(진짜 CVD)이
    // 아니라 "가격이 오르면 +1, 내리면 -1"을 누적한 순수 가격방향 카운터였다 — 거래량이 전혀
    // 반영되지 않는다. 이름을 정확하게 priceDirection으로 바꾼다. (진짜 CVD는 별도 과제로 남겨둠 —
    // 실제 매수/매도 체결량 구분 데이터가 필요하다)
    let priceDirection = 0;
    let prevP = historyPrices[0] || currentPrice;
    const priceDirectionSeries: number[] = [];
    historyPrices.forEach(p => {
      const delta = p > prevP ? 1 : p < prevP ? -1 : 0;
      priceDirection += delta;
      priceDirectionSeries.push(priceDirection);
      prevP = p;
    });

    // 🛡️ 매우 중요한 수정: 예전엔 "최근 10개 샘플"(실제로는 몇 초~몇십 초 수준, 웹소켓 tick 빈도에
    // 따라 들쭉날쭉)을 전고점/전저점 기준으로 삼았는데, 초단타 스캘핑에서 의미 있는 "단기 전고점"은
    // 5분 정도의 시간 창이어야 한다는 게 더 실전적이다. 이제 history의 실제 timestamp를 이용해
    // 정확히 "최근 5분" 이내 데이터만 필터링한다. timestamp가 없는 오래된 데이터나 데이터 자체가
    // 부족하면 기존 인덱스 기반 방식으로 안전하게 폴백한다.
    const FIVE_MIN_MS = 5 * 60 * 1000;
    const nowForPeak = Date.now();
    const timestampedHistory = Array.isArray(targetStock.history) ? targetStock.history : [];
    // 가장 최근 항목(현재가와 사실상 동일한 시점)은 제외하고, 그 이전 5분 이내 데이터만 사용
    const fiveMinWindow = timestampedHistory.length > 1
      ? timestampedHistory.slice(0, -1).filter(h => h.timestamp !== undefined && (nowForPeak - h.timestamp) <= FIVE_MIN_MS)
      : [];
    const fiveMinPrices = fiveMinWindow.map(h => h.price).filter((p): p is number => typeof p === 'number' && !isNaN(p));

    const recentPeak = fiveMinPrices.length >= 5
      ? Math.max(...fiveMinPrices)
      : (historyPrices.length >= 5 ? Math.max(...historyPrices.slice(-10, -1)) : currentPrice);
    const recentLow = fiveMinPrices.length >= 5
      ? Math.min(...fiveMinPrices)
      : (historyPrices.length >= 5 ? Math.min(...historyPrices.slice(-10, -1)) : currentPrice);
    const recentMaxPriceDirection = priceDirectionSeries.length >= 5 ? Math.max(...priceDirectionSeries.slice(-10, -1)) : priceDirection;
    const recentMinPriceDirection = priceDirectionSeries.length >= 5 ? Math.min(...priceDirectionSeries.slice(-10, -1)) : priceDirection;

    const isBullishAbsorption = (currentPrice <= recentLow * 1.01) && (priceDirection > recentMinPriceDirection);
    const isBearishAbsorption = (currentPrice >= recentPeak * 0.995) && (priceDirection < recentMaxPriceDirection);

    const momentumPositive = sma5 >= sma20;
    const isNearLowerBand = currentPrice <= bb.lower * 1.005;
    const isNearUpperBand = currentPrice >= bb.upper * 0.995;
    const lastPrice = historyPrices.length >= 2 ? historyPrices[historyPrices.length - 2] : currentPrice;

    // 🩺 실제 시장 거래(가격 변동)가 있었는지 확인. 장 마감/무거래 상태에서 history가 전부
    // 동일한 값(또는 합성 seed 값)으로 채워져 있으면, 아래 계산식들이 "가격 변동 없음"을
    // "상승/지지"로 잘못 해석해 센서가 거짓으로 켜질 수 있다. 최근 구간에 실제 변동이
    // 있었는지 먼저 확인해서, 없으면 모든 센서를 강제로 끈다.
    const recentWindow = historyPrices.slice(-10);
    const hasRecentPriceMovement = recentWindow.length >= 2 && recentWindow.some(p => p !== recentWindow[0]);

    // hasVolumeMomentum: 진짜 체결 거래량 데이터가 아니라 가격 움직임으로 근사한 값이다(REST API 한계).
    // 실제 변동이 없으면 무조건 false — 이전에는 currentPrice >= lastPrice(등호 포함) 때문에
    // 가격이 그대로 멈춰있어도(장마감 등) 항상 true로 계산되던 버그가 있었다.
    const hasVolumeMomentum = hasRecentPriceMovement && (currentPrice > lastPrice || rsi >= 25);

    const isPullback = hasRecentPriceMovement && momentumPositive && (rsi < 40 || isNearLowerBand) && currentPrice >= sma5 && hasVolumeMomentum;
    const isBreakout = hasRecentPriceMovement && currentPrice >= recentPeak && currentPrice > lastPrice && rsi >= 50;
    const hasRealVwap = vwap > 0 && vwap !== currentPrice;
    const isVwapSupport = hasRealVwap && hasRecentPriceMovement && currentPrice >= vwap * 0.998 && currentPrice >= sma5 && hasVolumeMomentum;
    const isPocSupport = hasRecentPriceMovement && Math.abs(currentPrice - poc) / (poc || 1) < 0.008;
    // 🚧 향후 진짜 CVD 구현 시 이 isVolumeProfile 로직도 함께 재검토 예정 — 지금은 POC지지/매수흡수
    // 기반이며, UI에서는 "CVD" 배지 대신 shortTermMomentum(단기 모멘텀) 배지로 대체해 노출한다.
    const isVolumeProfile = isPocSupport || (hasRecentPriceMovement && isBullishAbsorption);

    const activeCount = (isPullback ? 1 : 0) + (isBreakout ? 1 : 0) + (isVwapSupport ? 1 : 0) + (isVolumeProfile ? 1 : 0);

    return { isPullback, isBreakout, isVwapSupport, isVolumeProfile, activeCount, rsi, sma5, sma20, vwap, poc, cvd: priceDirection, isBullishAbsorption, isBearishAbsorption, bb, momentumPositive, isNearLowerBand, isNearUpperBand, lastPrice, hasVolumeMomentum, recentPeak, hasRecentPriceMovement };
  }, [marketType]);

  // 🎯 웹소켓 연결 effect(이 함수보다 먼저 선언됨)가 항상 최신 detectStockStrategies를 안전하게
  // 참조할 수 있도록 ref로 캐싱한다 — effect의 dependency 배열에 넣으면 이 함수가 바뀔 때마다
  // 웹소켓이 재연결되어 버리므로, ref를 통한 간접 참조로 그 부작용 없이 최신 함수를 쓴다.
  const detectStockStrategiesRef = React.useRef(detectStockStrategies);
  useEffect(() => { detectStockStrategiesRef.current = detectStockStrategies; }, [detectStockStrategies]);

  // ============================================================
  // 🎯 매수 점수제 (Buy Scoring System)
  // ------------------------------------------------------------
  // 기존에는 "선택한 센서가 전부 동시에 켜져야만" 매수하는 엄격한 AND 조건이었다. 이건 스캘핑처럼
  // 빠른 진입이 중요한 전략에서 기회를 자주 놓치게 만든다. 대신 각 신호에 가중치를 매겨 점수를
  // 합산하고, 일정 점수 이상이면 매수하는 방식으로 바꾼다 — 모든 조건이 완벽히 겹치지 않아도
  // 신호가 충분히 강하면 진입할 수 있다.
  //
  // 🎯 그룹별 캡 구조 — 상관관계가 높은 항목끼리 그룹으로 묶고, 그룹마다 상한(cap)을 둔다.
  // 예를 들어 체결강도130+/체결강도급증/거래량2배/동반상승을 전부 더하면 사실상 같은 체결강도
  // 정보를 여러 번 반영하는 셈이라, 그룹 상한 이상은 인정하지 않는다.
  //
  //   [체결/수급] 상한 +20 : CVD/POC지지(+9) 체결강도130+(+7) 체결강도급증(+8) 거래량2배(+8)
  //                          체결강도+거래량+가격 동반상승(+10)
  //   [가격 이벤트] 상한 +22 : 눌림목(+8) 돌파(+5) VWAP신규돌파≤20초(+12) 전고점돌파≤20초(+10)
  //   [VWAP/위치] 상한 +10 : VWAP 위(+5) SMA5>SMA20(+3)
  //   [추세/보조] 상한 +8 : RSI45~70(+3) 단기이평동반상승(+2) 골든크로스(+1)
  //   [호가] 상한 +10 : 매도호가실제소진(+10) 매도호가소진약(+4) 매수호가우세(+5)
  //   [위험] 하드필터 : 추격매수 위험신호 → 점수와 무관하게 매수 자체를 금지(blocked)
  // ============================================================
  const BUY_SCORE_THRESHOLD = 45; // (2026-09-30) 만점 70 → 100 재설계와 함께 30 → 45. // 🎯 2026-09-29 30 → 40 → 35 → 30점(사용자 요청: 기존대로, 대신 진입 호가를 4호가로 낮춤) (만점 70)
  const prevVwapAboveRef = React.useRef<Record<string, boolean>>({});
  const vwapBreakoutAtRef = React.useRef<Record<string, number>>({}); // VWAP 신규 상향돌파가 일어난 시각(ms) — 20초 신선도 창 판단용
  const execStrengthWindowRef = React.useRef<Record<string, { value: number; time: number }[]>>({}); // 체결강도 최근 4초 이력 — 노이즈에 덜 민감한 평균 기준선 계산용
  const execJumpActiveRef = React.useRef<Record<string, boolean>>({}); // 체결강도 급증을 일회성 이벤트로 만들기 위한 잠금 플래그
  const lastCumulativeVolumeRef = React.useRef<Record<string, number>>({}); // 직전에 관측한 누적거래량 — 구간별 증가량(델타) 계산용
  const askVolumeHistoryRef = React.useRef<Record<string, { value: number; time: number }[]>>({}); // 매도호가 실제 소진 이벤트 판정용 — 총매도잔량의 최근 이력(타임스탬프 포함)
  const askDepletionEventAtRef = React.useRef<Record<string, number>>({}); // 매도호가 소진 이벤트가 감지된 시각 — VWAP돌파와 동일한 신선도 창(20초) 적용

  // 📒 매수 순간의 신호 스냅샷 — 인벤토리 카드 LED(P B C V E Q R A D)와 같은 기준으로 기록한다.
  const buildEntrySignals = (
    stock: Stock,
    strat: ReturnType<typeof detectStockStrategies>,
    score: number | undefined,
    breakdown: string[] | undefined,
    label: string,
    orderPrice?: number
  ): EntrySignals => {
    const now = Date.now();
    const ob = liveOrderbooksRef.current[stock.symbol];
    const bid = Number(ob?.totalBidVolume || 0);
    const ask = Number(ob?.totalAskVolume || 0);
    const ratio = ask > 0 ? (bid / ask) * 100 : undefined;
    const evAt = askDepletionEventAtRef.current[stock.symbol];
    const exec = stock.executionStrength || 0;
    const cvd = (stock as any)?.cumulativeCvd ?? (stock as any)?.realCvd;
    const cvdDelta = (stock as any)?.cvdDelta;
    const rsi = strat.rsi;
    const act = getTickActivity(stock.symbol);
    return {
      flags: {
        P: !!strat.isPullback,
        B: !!strat.isBreakout,
        C: typeof cvd === 'number' && cvd > 0,
        V: !!strat.isVwapSupport,
        E: exec >= 130,
        Q: !!strat.hasVolumeMomentum,
        R: rsi >= 45 && rsi <= 70,
        A: (evAt !== undefined && now - evAt <= 20000) || (bid > 0 && ask > 0 && bid / ask >= 3),
        D: ratio !== undefined && ratio >= 130,
      },
      score,
      breakdown: breakdown ? [...breakdown] : undefined,
      label,
      rsi: Math.round(rsi),
      execStrength: exec || undefined,
      cvd: typeof cvd === 'number'? Math.round(cvd) : undefined,
      cvdDelta: typeof cvdDelta === 'number'? Math.round(cvdDelta) : undefined,
      bidAskRatio: ratio !== undefined ? Math.round(ratio) : undefined,
      capturedAt: now,
      signalPrice: stock.price || undefined,
      orderPrice,
      spreadTicks: (() => {
        const b1 = Number(ob?.bidPrice1 || 0); const a1 = Number(ob?.askPrice1 || 0);
        if (!(b1 > 0 && a1 > 0)) return undefined;
        return Math.round((a1 - b1) / getTickSize(stock.price || b1, 'KR'));
      })(),
      ticks60s: act.ticks60s,
      tradeValue5m: tickFieldCheckRef.current.cntgVol ? Math.round(act.tradeValue5m) : undefined,
      changePercent: typeof stock.changePercent === 'number' ? Number(stock.changePercent.toFixed(2)) : undefined,
    };
  };

  // 🎯 인벤토리 카드 A/D LED 계산 (1초 주기) — 매수 점수제(calculateBuyScore)와 동일한 기준을 쓴다.
  //   A 매도호가 소진: 최근 20초 내 '실제 소진 이벤트'(총매도잔량 8초 전 대비 30%↓ + 가격 상승)
  //                    또는 매수/매도 총잔량 비율 3배 이상(정적 스냅샷)
  //   D 매수호가 우세: 매수/매도 총잔량 비율 130% 이상
  // 값이 바뀐 종목이 있을 때만 setState 하므로 72종목이어도 불필요한 재렌더는 생기지 않는다.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const next: Record<string, { askDepletion: boolean; bidDominant: boolean; bidAskRatio?: number }> = {};
      (scalperTabsRef.current || []).forEach(t => {
        const ob = liveOrderbooksRef.current[t.symbol];
        const bid = Number(ob?.totalBidVolume || 0);
        const ask = Number(ob?.totalAskVolume || 0);
        const ratio = ask > 0 ? (bid / ask) * 100 : undefined;
        const evAt = askDepletionEventAtRef.current[t.symbol];
        const recentEvent = evAt !== undefined && now - evAt <= 20000;
        next[t.symbol] = {
          askDepletion: recentEvent || (bid > 0 && ask > 0 && bid / ask >= 3),
          bidDominant: ratio !== undefined && ratio >= 130,
          bidAskRatio: ratio !== undefined ? Math.round(ratio) : undefined,
        };
      });
      setOrderbookSignals(prev => {
        const keys = Object.keys(next);
        const same = keys.length === Object.keys(prev).length && keys.every(k =>
          prev[k] && prev[k].askDepletion === next[k].askDepletion &&
          prev[k].bidDominant === next[k].bidDominant && prev[k].bidAskRatio === next[k].bidAskRatio
        );
        return same ? prev : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const prevSma5Ref = React.useRef<Record<string, number>>({});
  const prevSma20Ref = React.useRef<Record<string, number>>({});
  const prevAbovePeakRef = React.useRef<Record<string, boolean>>({}); // 전고점 돌파 이벤트 판단용
  const peakBreakoutAtRef = React.useRef<Record<string, number>>({}); // 전고점 신규 돌파가 일어난 시각(ms) — VWAP과 동일한 신선도 창 판단용
  const sellExecStrengthRef = React.useRef<Record<string, number>>({}); // RSI 극단 반전 판단용 — 매도 로직 전용 체결강도 추적 (매수 점수제와 독립)
  const volumeHistoryRef = React.useRef<Record<string, number[]>>({});
  const prevPriceForComboRef = React.useRef<Record<string, number>>({}); // 체결강도+거래량+가격 결합 방향 판단용 직전 가격

  const vwapGapHistRef = React.useRef<Record<string, { t: number; g: number }[]>>({});
  // 엔진이 매 판단마다 남기는 종목별 최신 매수 판단 (인벤토리 퇴출 순위용)
  const entryCheckLogRef = React.useRef<Record<string, { verdict: string; at: number }>>({}); // [진입 점검] 로그 쓰로틀
  // 💧 물타기 상태 — adds: 체결된 추가 매수 횟수(슬롯 수 = 1 + adds), lastAvg: 마지막 추가 주문 때의 평단(평단이 실제로 내려갔는지 확인용)
  const avgDownRef = React.useRef<Record<string, { adds: number; lastAvg: number; lastAt: number; tryAt?: number; zeroAt?: number; pending?: { qtyBefore: number; avgBefore: number; at: number } }>>((() => {
    try { const raw = localStorage.getItem('leo100b_avg_down_v1'); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  })());
  const persistAvgDown = () => { try { localStorage.setItem('leo100b_avg_down_v1', JSON.stringify(avgDownRef.current)); } catch { /* 무시 */ } };
  // 📏 (2026-10-07) 종목별 '평소' 매수/매도 잔량 비율 — 5초 간격 표본 최대 30분치. 기록 전용(평소 대비로 본 Bear를 엑셀에 남긴다).
  const bookRatioSamplesRef = React.useRef<Record<string, { t: number; r: number }[]>>({});
  const bearBlockAtRef = React.useRef<Record<string, number>>({}); // (2026-10-07) 종목별 마지막 Bear 초과 시각
  const lastEntryBearRef = React.useRef<Record<string, { bear: number; bull?: number; at: number; reasons: string }>>({});
  // 📈 (2026-10-07) 추세 매수로 들고 있는 종목 — 스캘핑 매도 규칙(1.2% 트레일링·물타기·손절) 대신 '고점 대비 하락 / VWAP 이탈'로만 판다
  const TREND_CARRY_KEY = 'leo100b_trend_carry_v1';
  //   (15:40 사용자 결정) 마감 매수 보유분도 같은 방식으로 관리하므로 한 목록에 kind로 구분해 담는다. kind가 없으면 추세.
  type CarryPos = { kind?: 'TREND' | 'CLOSE'; date: string; entryAt: number; peak: number; slots?: number; lastAddDate?: string; addQtyBefore?: number; filled?: boolean };
  const trendCarryRef = React.useRef<Record<string, CarryPos>>((() => {
    let out: Record<string, CarryPos> = {};
    try { const raw = localStorage.getItem(TREND_CARRY_KEY); out = raw ? (JSON.parse(raw) || {}) : {}; } catch { out = {}; }
    // 예전 방식으로 저장된 마감 매수 보유 표시(종목 → 날짜)를 옮겨 온다
    try {
      const rawC = localStorage.getItem('leo100b_close_carry_v1');
      const oldC = rawC ? JSON.parse(rawC) : null;
      if (oldC && typeof oldC === 'object') {
        Object.keys(oldC).forEach(sym => { if (!out[sym]) out[sym] = { kind: 'CLOSE', date: String(oldC[sym]), entryAt: 0, peak: 0, slots: 1 }; });
        localStorage.removeItem('leo100b_close_carry_v1');
        localStorage.setItem(TREND_CARRY_KEY, JSON.stringify(out));
      }
    } catch { /* 무시 */ }
    return out;
  })());
  const persistTrendCarry = () => { try { localStorage.setItem(TREND_CARRY_KEY, JSON.stringify(trendCarryRef.current)); } catch { /* 무시 */ } };
  const trendCooldownRef = React.useRef<Record<string, number>>({});  // 종목 → 이 시각까지 추세 재매수 금지
  const trendZeroAtRef = React.useRef<Record<string, number>>({});
  const trendSellAtRef = React.useRef<Record<string, number>>({});
  const lastPanelAtRef = React.useRef<number>(0); // 엔진이 계산한 최신 Bear(대기 주문 재확인용)
  // 🧪 (2026-09-30 자기최적화 1단계) 저장소 시작 — 매매 일지 IndexedDB 이전, 추적 중이던 신호 복원, CSV 저장 폴더 불러오기,
  //   1분마다 신호 마감/중간 저장, 5분마다 지정 폴더에 오늘 CSV(신호·매매) 자동 저장
  useEffect(() => {
    initJournalStorage();
    restoreOpenSignals();
    loadSavedFolder();
    // 🗂️ 거래 케이스 — 진행 중이던 케이스 복원, 보유 구간 스냅샷에 넣을 현재 값 제공
    initTradeCases();
    setCaseSnapshotProvider((sym, price) => {
      const st: any = stocksRef.current.find(x => x.symbol === sym);
      const tv = getTrueVwaps(sym);
      const vw = tv.regular > 0 ? tv.regular : tv.after;
      const ob = liveOrderbooksRef.current[sym];
      const obFresh = Date.now() - (lastWsOrderbookTickAtRef.current[sym] || 0) <= 10000;
      return {
        exec: Number(st?.executionStrength) > 0 ? Number(st.executionStrength) : undefined,
        cvd: typeof st?.cumulativeCvd === 'number' ? Math.round(st.cumulativeCvd) : undefined,
        cvdDelta: typeof st?.cvdDelta === 'number' ? Math.round(st.cvdDelta) : undefined,
        vwapGapPct: vw > 0 && price > 0 ? Number((((price - vw) / vw) * 100).toFixed(3)) : undefined,
        bidVol: obFresh ? Number(ob?.totalBidVolume || 0) || undefined : undefined,
        askVol: obFresh ? Number(ob?.totalAskVolume || 0) || undefined : undefined,
      };
    });
    deleteOldTicks(60)
.then(count => {
console.log(
`[TickArchive] ${count}건 삭제`
);
})
.catch(err => {
console.warn(
'[TickArchive 정리 실패]',
err
);
});      
    const sweep = setInterval(() => {
      try { sweepSignals(); } catch { /* 무시 */ }
      try {
        // 🗂️ 보유가 없는데 열린 채 남은 케이스 정리(KIS 잔고가 확정된 뒤에만) + 주문 없이 끝난 신호 마감 + 저장
        if (kisHoldingsConfirmedRef.current) {
          reconcileOpenCases(
            sym => Number(holdingsRef.current[sym] || 0),
            sym => pendingBuyOrdersRef.current.some(o => o.symbol === sym) || pendingTradeKeysRef.current.has(`${sym}_BUY`),
          );
        }
        sweepTradeCases();
      } catch { /* 무시 */ }
    }, 60000);
    const autoSave = setInterval(() => {
      const today = kstDateKey();
      const trades = getJournal().closed.filter(t => kstDateKey(t.exitTime) === today);
      saveDayCsv(exportClosedTradesCsv(trades), today)
        .then(ok => { if (ok) selfOptimizationEngine.saveToFolder().catch(() => { /* 무시 */ }); })
        .catch(() => { /* 무시 */ });
      // 🗂️ 오늘 거래 케이스(신호·주문·체결·보유 구간·청산을 한 줄로 편 표)도 같은 폴더에 저장
      getCaseRows(today).then(rows => saveCsvToFolder(`leo100b_케이스_${today}.csv`, caseRowsToCsv(rows))).catch(() => { /* 무시 */ });
      // 📈 전 종목 1분 기록도 같은 폴더에 저장
      getPanelRows(today).then(rows => { if (rows.length) return saveCsvToFolder(`leo100b_1분기록_${today}.csv`, panelToCsv(rows)); }).catch(() => { /* 무시 */ });
    }, 5 * 60 * 1000);
    // 📅 (2026-10-04) 매일 정규장 마감 후(15:40 KST 이후 첫 확인 시점) 자기최적화 분석을 자동 실행한다.
    // 분석·후보 탐색만 하고 실전 조건은 바꾸지 않는다 — 검증 통과 후보는 신호 성과 → 자기최적화의 [적용] 버튼으로만 반영.
    // 앱이 그 시각에 꺼져 있었으면 그날 다음에 켰을 때 실행한다. 알림·로그는 하루 한 번만.
    const DAILY_KEY = 'leo100b_selfopt_daily_v1';
    let dailyBusy = false;
    const dailyAnalysis = setInterval(() => {
      const kst = new Date(Date.now() + 9 * 3600 * 1000);
      if (kst.getUTCHours() * 60 + kst.getUTCMinutes() < 15 * 60 + 40) return;
      const today = kstDateKey();
      const last = selfOptimizationEngine.getLastRun();
      if (dailyBusy || (last && kstDateKey(last.at) === today)) return;
      dailyBusy = true;
      selfOptimizationEngine.runScheduledAnalysis()
        .then(run => {
          let announced = '';
          try { announced = localStorage.getItem(DAILY_KEY) || ''; } catch { /* 무시 */ }
          if (announced === today) return;
          try { localStorage.setItem(DAILY_KEY, today); } catch { /* 무시 */ }
          const a = run.analysis, pr = run.proposal;
          const head = `표본 ${a.samples}건(실제 매매 연결 ${a.linkedTrades}건) · 현재 전략 기대값 ${a.currentStrategy.expectedValuePct.toFixed(3)}% (${a.currentStrategy.samples}건)`;
          const tail = !pr ? '후보 없음(표본 부족 또는 탐색 조건 미달)'
            : pr.accepted ? `검증 통과 후보: ${pr.changedParameters.map(c => `${String(c.key)} ${c.from}→${c.to}`).join(', ')} — 신호 성과 → 자기최적화에서 [적용]을 눌러야 반영됩니다`
            : `통과한 후보 없음 (가장 나은 후보 ${pr.changedParameters.map(c => `${String(c.key)} ${c.from}→${c.to}`).join(', ')}: ${pr.rejectionReasons[0] || '기준 미달'})`;
          addLogRef.current?.('SYSTEM', '매수', 0, 0, `[자기최적화 자동 분석] ${head} · ${tail}`);
          // 🗂️ 연결 검증 — 오늘 매매 일지의 청산 수량과 거래 케이스의 청산 수량이 케이스별로 같은지 확인
          checkCaseJournalConsistency(today, getJournal().closed)
            .then(chk => {
              addLogRef.current?.('SYSTEM', '매수', 0, 0, chk.ok
                ? `[케이스 연결 검증] 일치 — 매매 일지 ${chk.journalTrades}건(${chk.journalQty}주) = 케이스 ${chk.caseCount}건(${chk.caseQty}주)`
                : `[케이스 연결 검증] 불일치 — 매매 일지 ${chk.journalTrades}건(${chk.journalQty}주) / 케이스 ${chk.caseCount}건(${chk.caseQty}주)${chk.journalNoCaseQty > 0 ? ` · 케이스 없는 청산 ${chk.journalNoCaseQty}주` : ''}${chk.mismatches.length ? ` · ${chk.mismatches.slice(0, 5).join(' / ')}${chk.mismatches.length > 5 ? ` 외 ${chk.mismatches.length - 5}건` : ''}` : ''}`);
            })
            .catch(() => { /* 무시 */ });
          if (pr?.accepted) showNotificationRef.current?.('자기최적화: 검증을 통과한 후보가 있습니다 — 신호 성과 → 자기최적화에서 확인 후 [적용]', 'info');
          selfOptimizationEngine.saveToFolder().catch(() => { /* 무시 */ });
        })
        .catch(e => console.warn('[자기최적화 자동 분석 실패]', e))
        .finally(() => { dailyBusy = false; });
    }, 60000);
    return () => { clearInterval(sweep); clearInterval(autoSave); clearInterval(dailyAnalysis); };
  }, []);
  const lastBuyEvalRef = React.useRef<Record<string, { at: number; score: number; gatesFailed: number; exec: number; vwapGapPct: number }>>({});
  const calculateBuyScore = React.useCallback((
    stock: Stock,
    strat: ReturnType<typeof detectStockStrategies>,
    askDepletion?: boolean, // 매도호가 소진(정적 스냅샷 비율) — 실시간 호가 데이터가 있는 종목(주로 선택된 종목)에서만 전달됨
    bidAskRatio?: number,   // 매수호가잔량/매도호가잔량×100 — 100이면 동률, 130이면 매수세가 1.3배 우세
    isRealDepletionEvent?: boolean, // 🎯 총매도잔량이 최근 대비 실제로 빠르게 줄면서 가격도 상승 중인 "진짜 소진 이벤트"
    commit: boolean = false // 🔒 (2026-09-30) true = 매매 엔진 호출 — 이벤트/이력 상태(ref)를 갱신한다. 그 외 호출(퇴출 점검·추천 재계산·알림)은
                            // 읽기 전용이다. 예전엔 30초 주기 호출들도 상태를 덮어써서 거래량2배·VWAP돌파·체결강도급증 판단이 틀어졌다.
  ): { score: number; breakdown: string[]; blocked?: boolean; priceEventScore?: number; gate?: { pullback: boolean; aboveVwap: boolean; freshPeakBreakout: boolean; bidDominant?: boolean; groups?: { ex: number; pe: number; vw: number; su: number; ob: number } } } => {
    // 🎯 사용자 요청으로 "단순 총점 합산" 대신 "그룹별 캐핑 + 추격매수 하드필터" 구조로 전환한다.
    // 이유: 체결강도130+/체결강도급증/체결강도+거래량+가격동반상승처럼 상관관계가 높은 항목들을
    // 그냥 다 더하면, 사실상 같은 체결강도 정보를 여러 번 반영해서 점수가 부풀려질 수 있다.
    // 그래서 서로 겹치는 항목끼리 그룹으로 묶고, 그룹마다 상한(cap)을 둔다 — 그룹 안의 항목이
    // 아무리 많이 겹쳐도 그 그룹의 최대 배점 이상은 못 받는다. 또한 추격매수 위험은 이제 단순
    // 감점이 아니라 "그 자체로 매수 금지"인 하드필터로 취급한다 — 점수는 참고용으로 계속 계산해서
    // 보여주지만, blocked가 true이면 점수와 무관하게 매수하지 않는다.
    // 🧮 (2026-09-30 사용자 확정 수정안) 만점 100 — 체결/수급 35 · 가격이벤트 25 · VWAP/위치 15 · 추세/보조 10 · 호가 15.
    // 배점은 9/29~30 실거래 86건 분석 기준(체결강도130+·눌림목은 효과 큼, CVD·VWAP돌파·매수호가우세·전고점돌파는 오히려 나빴음).
    let groupExecution = 0;   // [체결/수급] 상한 +35 (구 +20) — 체결강도130+, 체결강도급증, 동반상승, 거래량2배, CVD/POC지지
    let groupPriceEvent = 0;  // [가격 이벤트] 상한 +22 — VWAP신규돌파, 전고점돌파, 눌림목, 돌파
    let groupVwapPosition = 0; // [VWAP/위치] 상한 +10 — VWAP위, SMA5>SMA20
    let groupSupport = 0;     // [추세/보조] 상한 +8 — RSI, 단기이평동반상승, 골든크로스
    let groupOrderbook = 0;   // [호가] 상한 +10 — 매도호가실제소진, 매도호가소진약, 매수호가우세
    let hasChaseRisk = false; // [위험] 하드필터 — true면 점수와 무관하게 매수 금지
    const breakdown: string[] = [];
    const sym = stock.symbol;
    const currentPrice = stock.price || 0;

    if (!strat.hasRecentPriceMovement || currentPrice <= 0) return { score: 0, breakdown: [], priceEventScore: 0, gate: { pullback: false, aboveVwap: false, freshPeakBreakout: false } };

    // 🎯 매우 중요한 추가: 카드에 보이는 센서 배지(눌림목/돌파/VWAP/CVD)와 이 점수 계산이 그동안
    // 서로 거의 무관했다 — VWAP만 우연히 겹치고, 눌림목/돌파/CVD 3개는 여기 점수에 전혀 반영되지
    // 않아서 "센서가 다 켜졌는데 왜 매수를 안 하냐"는 혼란의 정확한 원인이었다. 이제 이 3개 센서가
    // 켜지면 직접 가산점을 준다 — 돌파는 아래 "전고점 돌파"와 개념이 일부 겹쳐서 더 낮게 배점.
    // 🧪 (2026-09-30) 배점·상한은 자기최적화의 "현재 전략 버전"에서 읽는다 — [적용]/[되돌리기]로 즉시 바뀜 (기본값 = 기존 배점)
    const W = getLiveParams();
    const sg = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
    if (strat.isPullback) { groupPriceEvent += W.scorePullback; breakdown.push(`눌림목(${sg(W.scorePullback)})`); }
    if (strat.isBreakout) { groupPriceEvent += W.scoreBreakout; breakdown.push(`돌파(${sg(W.scoreBreakout)})`); }
    if (strat.isVolumeProfile) { groupExecution += W.scoreCvdPoc; breakdown.push(`CVD/POC지지(${sg(W.scoreCvdPoc)})`); }

    // 1. 현재가 VWAP 위 (+5)
    const isAboveVwap = strat.vwap > 0 && currentPrice >= strat.vwap;
    if (isAboveVwap) { groupVwapPosition += W.scoreAboveVwap; breakdown.push(`VWAP 위(${sg(W.scoreAboveVwap)})`); }
    // 📝 VWAP 이격 우상향 — 기준 검증 전이라 점수 0, 기록만 (VWAP 위이고 이격이 10초 전보다 커졌으며 이격 1.5% 이내)
    if (strat.vwap > 0) {
      const gapPct = ((currentPrice - strat.vwap) / strat.vwap) * 100;
      const hist = (vwapGapHistRef.current[sym] || []).filter(h => Date.now() - h.t <= 15000);
      const past = hist.find(h => Date.now() - h.t >= 8000);
      if (isAboveVwap && past && gapPct > past.g && gapPct <= 1.5) breakdown.push(`VWAP이격우상향(${gapPct.toFixed(2)}%·기록)`);
      if (commit) { hist.push({ t: Date.now(), g: gapPct }); vwapGapHistRef.current[sym] = hist.slice(-40); }
    }

    // 2. VWAP 신규 상향돌파 (+12) — 직전엔 VWAP 아래였다가 지금 막 위로 올라온 "이벤트"를 감지한다.
    // 🛡️ 예전엔 이 순간 한 틱에서만 지급했는데, 초단타에서는 이게 오히려 두 가지 문제를 만들 수
    // 있었다: ① 엔진 루프 타이밍에 따라 정확히 그 교차 tick을 못 잡으면 보너스를 놓칠 수 있고,
    // ② 반대로 VWAP 경계선 바로 위/아래를 짧게 오르내리는 노이즈에서는 매 교차마다 계속 재발동되어
    // 신호가 부풀려질 수 있었다. 이제 "교차 시점"을 타임스탬프로 기록해두고, 그 이후 20초 동안은
    // 계속 위에 머물러 있으면 "신선한 돌파"로 계속 인정한다 — 20초가 지나면 자연스럽게 소멸하고,
    // 다시 아래로 내려갔다가 재돌파해야만 다시 부여된다.
    const VWAP_BREAKOUT_FRESH_MS = 20000;
    const wasAboveVwap = prevVwapAboveRef.current[sym];
    const now = Date.now();
    if (isAboveVwap && wasAboveVwap === false) {
      if (commit) vwapBreakoutAtRef.current[sym] = now; // 신규 돌파 이벤트 발생 — 신선도 타이머 시작
    }
    const breakoutAt = vwapBreakoutAtRef.current[sym];
    if (isAboveVwap && breakoutAt !== undefined && (now - breakoutAt) <= VWAP_BREAKOUT_FRESH_MS) {
      groupPriceEvent += W.scoreVwapBreakout;
      breakdown.push(`VWAP 돌파(${sg(W.scoreVwapBreakout)})`);
    }
    if (commit) prevVwapAboveRef.current[sym] = isAboveVwap;

    // 3. 매수 체결강도 130 이상 (+7) — KIS 실제 체결강도(cttr) 기준
    const execStrength = stock.executionStrength || 0;
    if (execStrength >= 130) { groupExecution += W.scoreExecutionStrength; breakdown.push(`체결강도130+(${sg(W.scoreExecutionStrength)})`); }

    // 4. 체결강도 급증 (+8) — 🛡️ 두 가지를 개선했다:
    // ① 예전엔 "직전 tick 대비"로 비교해서, 실시간 웹소켓 데이터가 101→135→104→139처럼 순간적으로
    //    튀기만 해도 매 tick마다 반복 지급될 수 있었다. 이제 "최근 3~5초 평균"을 기준선으로
    //    삼아서, 순간적인 데이터 노이즈에는 덜 민감하고 진짜 추세 변화만 잡아낸다.
    // ② 급증을 "상태"가 아니라 "일회성 이벤트"로 만든다 — 급증이 한 번 인정되면, 강도가 다시
    //    평상시 수준(기준선 근처)으로 내려갈 때까지는 같은 급증 구간에서 또 지급하지 않는다.
    const EXEC_STRENGTH_WINDOW_MS = 4000; // 4초 평균을 기준선으로 사용
    const nowTs = Date.now();
    const execWindow = (execStrengthWindowRef.current[sym] || []).filter(e => nowTs - e.time <= EXEC_STRENGTH_WINDOW_MS);
    const execBaseline = execWindow.length >= 2 ? execWindow.reduce((a, b) => a + b.value, 0) / execWindow.length : undefined;
    const strengthJump = execBaseline !== undefined ? execStrength - execBaseline : 0;
    const isJumpActive = execJumpActiveRef.current[sym] === true;
    if (execBaseline !== undefined && strengthJump >= 30 && !isJumpActive) {
      groupExecution += W.scoreExecutionSurge;
      breakdown.push(`체결강도급증(${sg(W.scoreExecutionSurge)})`);
      if (commit) execJumpActiveRef.current[sym] = true; // 같은 급증 구간에서는 재지급하지 않도록 잠금
    } else if (execBaseline !== undefined && strengthJump < 15) {
      if (commit) execJumpActiveRef.current[sym] = false; // 평상시 수준으로 복귀 — 다음 급증을 다시 인정할 수 있게 해제
    }
    if (commit && execStrength > 0) {
      execStrengthWindowRef.current[sym] = [...execWindow, { value: execStrength, time: nowTs }].slice(-20);
    }

    // 5. 실제 거래량 2배 이상 — 🛡️ 매우 중요한 수정: stock.volume은 KIS의 acml_vol(당일 누적거래량)
    // 이라 하루 종일 계속 커지기만 한다. 예전엔 이 누적값 자체를 기록해서 평균을 냈는데, 이러면
    // "현재 누적값 ≥ 과거 누적값 평균×2"라는 조건이 장 후반으로 갈수록 실제 거래량 폭발과 무관하게
    // 거의 항상 충족되는 착시가 있었다(09:10 10만 → 09:11 20만은 2배지만 그냥 시간이 지나서 쌓인
    // 것일 뿐일 수 있음). 이제 "구간별 증가량(델타)"을 추적해서, 최근 증가 속도를 평소 증가 속도와
    // 비교한다 — 이래야 진짜 "지금 이 순간 거래가 몰리고 있는지"를 잡아낸다.
    const rawVol = Number(String(stock.volume || '0').replace(/,/g, '')) || 0;
    const prevCumVol = lastCumulativeVolumeRef.current[sym];
    const volDelta = (prevCumVol !== undefined && rawVol >= prevCumVol) ? rawVol - prevCumVol : 0;
    if (commit) lastCumulativeVolumeRef.current[sym] = rawVol;

    const deltaHist = volumeHistoryRef.current[sym] || [];
    const avgVol = deltaHist.length >= 3 ? deltaHist.reduce((a, b) => a + b, 0) / deltaHist.length : 0;
    // 🛡️ 거래량이 급증해도 가격이 하락 중이면 "매도 물량 출회"일 수 있으므로 가산점을 주지 않는다
    // — 직전 tick 가격(결합신호 블록보다 먼저 실행되므로 아직 갱신 전 값)과 비교한다.
    const prevPriceForVolCheck = prevPriceForComboRef.current[sym];
    const priceNotFalling = prevPriceForVolCheck === undefined || currentPrice >= prevPriceForVolCheck;
    if (avgVol > 0 && volDelta >= avgVol * 2 && priceNotFalling) { groupExecution += W.scoreVolume2x; breakdown.push(`거래량2배+(${sg(W.scoreVolume2x)})`); }
    if (commit && volDelta > 0) volumeHistoryRef.current[sym] = [...deltaHist, volDelta].slice(-20);

    // 5-1. 🎯 체결강도 + 거래량 + 가격 결합 신호 — 개별로는 이미 위에서 반영했지만, 셋이 동시에
    // 같은 방향이면 훨씬 신뢰도 높은 신호가 된다. 체결강도↑ + 거래량↑ + 가격↑이 전부 겹치면
    // 강한 매수 후보로 보너스를, 반대로 체결강도↓ + 가격 정체 + 거래량↓이 전부 겹치면
    // "추격매수 위험" 신호로 판단한다.
    // 🛡️ 매우 중요한 변경: 추격매수 위험은 더 이상 "감점"이 아니다 — 예전엔 -12점만 깎아서, 다른
    // 조건이 충분히 강하면 위험신호가 있어도 그냥 매수가 될 수 있었다. 이제 이건 점수와 별개로
    // "그 자체로 매수 금지"인 하드필터다 — 총점이 아무리 높아도 이 신호가 뜨면 매수하지 않는다.
    const prevPriceCombo = prevPriceForComboRef.current[sym];
    if (execBaseline !== undefined && prevPriceCombo !== undefined && currentPrice > 0) {
      const execRising = execStrength > execBaseline;
      const execFalling = execStrength < execBaseline;
      const volRising = avgVol > 0 && volDelta > avgVol;
      const volFalling = avgVol > 0 && volDelta < avgVol * 0.7;
      const priceRising = currentPrice > prevPriceCombo;
      const priceFlat = Math.abs(currentPrice - prevPriceCombo) / prevPriceCombo < 0.001; // 0.1% 미만 변화는 "정체"로 간주

      if (execRising && volRising && priceRising) {
        groupExecution += W.scoreExecVolumePrice;
        breakdown.push(`체결강도+거래량+가격 동반상승(${sg(W.scoreExecVolumePrice)})`);
      } else if (execFalling && volFalling && priceFlat) {
        hasChaseRisk = true;
        breakdown.push('🚨 추격매수 위험신호(매수 금지)');
      }
    }
    if (commit) prevPriceForComboRef.current[sym] = currentPrice;

    // 6. RSI 45~70 구간 점수 — 🎯 사용자 요청으로 구간별 차등 없이 45~70 전체를 균일하게 +3으로
    // 단순화. VWAP돌파/체결강도급증/거래량2배/SMA모멘텀이 이미 상승 신호를 강하게 평가하고 있으므로,
    // RSI는 주도 신호가 아니라 "과열 방지/진입 적정성 확인용" 보조 점수로만 반영한다.
    let rsiScore = 0;
    if (strat.rsi >= 50 && strat.rsi <= 70) rsiScore = W.scoreRsi; // (2026-09-30) 45~70 → 50~70
    if (rsiScore !== 0 && strat.rsi >= 50 && strat.rsi <= 70) { groupSupport += rsiScore; breakdown.push(`RSI${Math.round(strat.rsi)}(+${rsiScore})`); }

    // 7. 단기 이동평균 모멘텀 — 🛡️ 예전엔 "SMA5 >= SMA20"이라는 상태 하나로 뭉뚱그렸는데, 이러면
    // "이미 오래 전에 골든크로스가 나서 상승이 끝나가는 종목"과 "지금 막 모멘텀이 붙는 종목"을
    // 구분하지 못했다. 세 요소로 나눈다: ① SMA5>SMA20 상태(위치 그룹) ② SMA5·SMA20 둘 다 상승
    // 중(보조 그룹, "지금도 오르고 있다"는 의미) ③ 최근 골든크로스 이벤트(보조 그룹, 막 교차한
    // 신선한 신호).
    const prevSma5 = prevSma5Ref.current[sym];
    const prevSma20 = prevSma20Ref.current[sym];
    const sma5GtSma20 = strat.sma5 > 0 && strat.sma20 > 0 && strat.sma5 > strat.sma20;
    if (sma5GtSma20) { groupVwapPosition += W.scoreSma5AboveSma20; breakdown.push(`SMA5>SMA20(${sg(W.scoreSma5AboveSma20)})`); }
    if (prevSma5 !== undefined && prevSma20 !== undefined) {
      const sma5Rising = strat.sma5 > prevSma5;
      const sma20Rising = strat.sma20 > prevSma20;
      if (sma5GtSma20 && sma5Rising && sma20Rising) { groupSupport += W.scoreShortMaRise; breakdown.push(`단기이평동반상승(${sg(W.scoreShortMaRise)})`); }
      const wasGoldenCross = prevSma5 <= prevSma20;
      if (sma5GtSma20 && wasGoldenCross) { groupSupport += W.scoreGoldenCross; breakdown.push(`골든크로스(${sg(W.scoreGoldenCross)})`); }
    }
    if (commit && strat.sma5 > 0) prevSma5Ref.current[sym] = strat.sma5;
    if (commit && strat.sma20 > 0) prevSma20Ref.current[sym] = strat.sma20;

    // 8. 매도호가 소진 — 🎯 실제 소진 이벤트를 시계열로 추적할 수 있게 됐다: 총매도잔량이 최근
    // 8초 대비 30% 이상 줄면서 동시에 가격이 상승 중이면(체결로 매도벽을 먹고 올라가는 중) "진짜
    // 소진"으로 보고 +10을 준다. 여전히 정적 스냅샷 비율(매수/매도 총잔량 3배 이상)만 만족하는
    // 경우는 허수호가 위험이 남아있으니 +4(보조점수)로 유지한다.
    if (isRealDepletionEvent) {
      groupOrderbook += W.scoreRealAskDepletion;
      breakdown.push(`매도호가실제소진(${sg(W.scoreRealAskDepletion)})`);
    } else if (askDepletion) {
      groupOrderbook += W.scoreAskDepletion;
      breakdown.push(`매도호가소진(${sg(W.scoreAskDepletion)})`);
    }

    // 9. 전고점 돌파 (+10) — 🛡️ 예전엔 "현재가 > 전고점"이라는 상태 하나로 판단해서, 전고점 위에
    // 계속 머물러 있으면 매 틱마다 반복 지급될 수 있었다(VWAP과 같은 종류의 문제). VWAP 돌파와
    // 동일하게 "이전엔 전고점 이하였다가 지금 막 돌파한" 이벤트로 바꾸고, 20초 신선도 창을 둬서
    // 돌파 직후 잠깐 동안만 유효하게 만든다.
    const isAbovePeak = strat.recentPeak > 0 && currentPrice > strat.recentPeak;
    const wasAbovePeak = prevAbovePeakRef.current[sym];
    if (isAbovePeak && wasAbovePeak === false) {
      if (commit) peakBreakoutAtRef.current[sym] = now; // 신규 돌파 이벤트 발생 — 신선도 타이머 시작
    }
    const peakBreakoutAt = peakBreakoutAtRef.current[sym];
    const freshPeakBreakout = isAbovePeak && peakBreakoutAt !== undefined && (now - peakBreakoutAt) <= VWAP_BREAKOUT_FRESH_MS;
    if (freshPeakBreakout) {
      groupPriceEvent += W.scorePriorHighBreakout; // 기본 -3 (2026-09-30) +10 → -3: 돌파 직후 추격 매수는 실거래에서 손실(평균 -0.37%). 필수조건에서도 매수 금지.
      breakdown.push(`전고점돌파(${sg(W.scorePriorHighBreakout)})`);
    }
    if (commit) prevAbovePeakRef.current[sym] = isAbovePeak;

    // 10. 매수호가 우세 (+5) — 실시간 호가 데이터가 있는 종목에서만 반영. 매수잔량이 매도잔량의
    // 1.3배 이상이면 "지금 사려는 사람이 팔려는 사람보다 많다"는 뜻으로 가점 (별도 필수 게이트가
    // 아니라 다른 조건들과 동등한 보너스 점수 — 이것 하나 없다고 매수 기회 자체가 막히지 않는다)
    // (2026-09-30) +5 → 0: 켜졌을 때 평균 -0.59%(꺼졌을 때 -0.06%) — 기록만 남긴다
    if (bidAskRatio !== undefined && bidAskRatio >= 130) { groupOrderbook += W.scoreBidDominant; breakdown.push(`매수호가우세(${sg(W.scoreBidDominant)})`); }
    // (2026-09-30) 매도호가 우세 −5 — 매도잔량 ≥ 매수잔량 × 1.3 (= 매수/매도 비율 76.9% 이하)
    if (bidAskRatio !== undefined && bidAskRatio > 0 && bidAskRatio <= 100 / 1.3) { groupOrderbook += W.scoreAskDominant; breakdown.push(`매도호가우세(${sg(W.scoreAskDominant)})`); }

    // 🛡️ 그룹별 캡 적용 — 상관관계가 높은 항목끼리 묶은 그룹 안에서 아무리 많이 겹쳐도, 그 그룹의
    // 상한 이상은 받을 수 없다. 예를 들어 체결강도130+/체결강도급증/거래량2배/동반상승이 전부
    // 겹쳐도(원점수 33점) [체결/수급] 그룹은 최대 20점까지만 인정된다 — "센서 10개가 동시에
    // 켜졌다고 무조건 점수가 폭발"하는 걸 막기 위함이다.
    const cappedExecution = Math.min(Math.max(0, groupExecution), W.capEx);
    const cappedPriceEvent = Math.max(0, Math.min(groupPriceEvent, W.capPe));
    const cappedVwapPosition = Math.min(Math.max(0, groupVwapPosition), W.capVw);
    const cappedSupport = Math.min(Math.max(0, groupSupport), W.capSu);
    const cappedOrderbook = Math.max(0, Math.min(groupOrderbook, W.capOb));

    if (cappedExecution < groupExecution) breakdown.push(`[체결/수급 캡 적용: ${groupExecution}→${cappedExecution}]`);
    if (cappedPriceEvent < groupPriceEvent) breakdown.push(`[가격이벤트 캡 적용: ${groupPriceEvent}→${cappedPriceEvent}]`);
    if (cappedVwapPosition < groupVwapPosition) breakdown.push(`[VWAP위치 캡 적용: ${groupVwapPosition}→${cappedVwapPosition}]`);
    if (cappedSupport < groupSupport) breakdown.push(`[추세보조 캡 적용: ${groupSupport}→${cappedSupport}]`);
    if (cappedOrderbook < groupOrderbook) breakdown.push(`[호가 캡 적용: ${groupOrderbook}→${cappedOrderbook}]`);

    const score = cappedExecution + cappedPriceEvent + cappedVwapPosition + cappedSupport + cappedOrderbook;

    // 🛡️ 하드필터 적용 — 점수는 참고용으로 그대로 반환하되(로그에서 "이 정도 신호가 있었다"는
    // 걸 계속 볼 수 있게), blocked가 true이면 호출부에서 점수와 무관하게 매수하지 않도록 한다.
    // 🎯 사용자 요청으로 최소 게이트 추가: 순수 수급/호가 신호만으로는 매수하지 않는다 — 실제
    // 가격이 움직이는 신호(VWAP돌파, 전고점돌파, 눌림목, 돌파 중 최소 하나)가 있어야만 매수를
    // 허용한다. cappedPriceEvent를 그대로 반환해서 호출부가 "가격 이벤트 > 0"을 확인할 수 있게 한다.
    return { score, breakdown, blocked: hasChaseRisk, priceEventScore: cappedPriceEvent, gate: { pullback: !!strat.isPullback, aboveVwap: isAboveVwap, freshPeakBreakout: !!freshPeakBreakout, bidDominant: bidAskRatio !== undefined && bidAskRatio >= 130, groups: { ex: cappedExecution, pe: cappedPriceEvent, vw: cappedVwapPosition, su: cappedSupport, ob: cappedOrderbook } } };
  }, []);

  const selectedStock = useMemo(() => {
    const isCurrentUS = marketType === 'US';
    const matchesMarket = (s: { symbol: string; market?: string }) => {
      const isUS = s.market === 'US' || /^[A-Z]/.test(s.symbol);
      return isCurrentUS ? isUS : !isUS;
    };

    let found = stocks.find(s => s.symbol === selectedSymbol && matchesMarket(s)) ||
                (isCurrentUS ? stocksCache.US : stocksCache.KR)?.find(s => s.symbol === selectedSymbol) ||
                (isCurrentUS ? INITIAL_STOCKS.find(s => s.symbol === selectedSymbol) : INITIAL_STOCKS_KR.find(s => s.symbol === selectedSymbol));

    if (!found) {
      found = stocks.find(s => s.symbol === selectedSymbol) ||
              stocksCache.KR?.find(s => s.symbol === selectedSymbol) ||
              stocksCache.US?.find(s => s.symbol === selectedSymbol) ||
              INITIAL_STOCKS_KR.find(s => s.symbol === selectedSymbol);
    }

    // Check scalper tabs
    if (!found && selectedSymbol) {
      const tab = scalperTabs.find(t => t.symbol === selectedSymbol || t.id === selectedSymbol);
      if (tab) {
        const isUS = isCurrentUS || /^[A-Za-z]/.test(tab.symbol);
        const resolvedTabName = (tab.name && tab.name !== tab.symbol) ? tab.name : getResolvedStockName(tab.symbol);
        found = {
          symbol: tab.symbol,
          name: resolvedTabName,
          price: tab.gapBuyPrice || (isUS ? 10 : 1000),
          change: 0,
          changePercent: 0,
          volume: '0',
          history: [{ time: '09:00', price: tab.gapBuyPrice || (isUS ? 10 : 1000) }],
          market: isUS ? 'US' : 'KR',
          isAI: false
        };
      }
    }

    // Check popular stocks
    if (!found && selectedSymbol) {
      const pop = POPULAR_STOCKS.find(s => s.symbol === selectedSymbol);
      if (pop) {
        const isUS = isCurrentUS || /^[A-Za-z]/.test(pop.symbol);
        found = {
          symbol: pop.symbol,
          name: getResolvedStockName(pop.symbol, { name: pop.name }),
          price: pop.price || (isUS ? 10 : 1000),
          change: 0,
          changePercent: 0,
          volume: '0',
          history: [{ time: '09:00', price: pop.price || (isUS ? 10 : 1000) }],
          market: isUS ? 'US' : 'KR',
          isAI: false
        };
      }
    }

    if (found) {
      return {
        ...found,
        name: getResolvedStockName(selectedSymbol, found)
      };
    }

    // If selectedSymbol is explicitly defined, generate a clean valid Stock object
    if (selectedSymbol) {
      const isUS = isCurrentUS || /^[A-Za-z]/.test(selectedSymbol);
      const resName = getResolvedStockName(selectedSymbol);
      return {
        symbol: selectedSymbol,
        name: resName || selectedSymbol,
        price: isUS ? 10 : 1000,
        change: 0,
        changePercent: 0,
        volume: '0',
        history: [{ time: '09:00', price: isUS ? 10 : 1000 }],
        market: isUS ? 'US' : 'KR',
        isAI: false
      };
    }

    // selectedSymbol이 비어있다는 것은 "선택된 종목이 없음"을 뜻한다.
    // 이 경우 임의의 종목(하드코딩된 기본 종목 등)을 대신 보여주지 않고 null을 반환해
    // 화면이 "선택된 종목 없음" 상태를 정직하게 나타내도록 한다.
    return null;
  }, [stocks, stocksCache, selectedSymbol, marketType, scalperTabs, getResolvedStockName]);

  const displayScalperMessage = useMemo(() => {
    const currentName = selectedStock?.name || selectedSymbol;
    const held = holdings[selectedSymbol] || 0;

    if (!isGapBotActive) {
      return held > 0 
        ? `[대기] ${currentName} (${held}주 보유 중) - 스캘퍼 정지 (시작 버튼을 누르면 실시간 자동매매 실행)`
        : `[대기] ${currentName} 진입 대기 (시작 버튼을 누르면 실시간 자동매매 실행)`;
    }

    if (!scalperMessage || scalperMessage === "대기 중..." || scalperMessage.includes("감시 중") || scalperMessage.includes("진입 모니터링") || scalperMessage.includes("자금 순환 취소") || scalperMessage.includes("미체결 매수 취소") || scalperMessage.includes("주문 취소")) {
      if (selectedStock) {
        const strat = detectStockStrategies(selectedStock);
        if (held > 0) {
          return `[보유 감시] ${currentName} ${held}주 보유 중 · 실시간 목표가 도달 및 분할 매매 추적 중 (RSI: ${Math.round(strat.rsi)})`;
        }
        return `[수급 감시] ${currentName} 실시간 호가 잔량 및 최적 진입 타점 정밀 분석 중 (RSI: ${Math.round(strat.rsi)})`;
      }
      return `[수급 감시] ${currentName} 실시간 호가 잔량 및 진입 타점 정밀 분석 중...`;
    }

    let cleaned = scalperMessage
      .replace(/^\[AI전략 포착\]\s*.*?(감지!?|포착!?)\s*/g, '')
      .replace(/\[AI전략 포착\]\s*[^!]*감지!?\s*/g, '')
      .replace(/^\[AI모니터링\]\s*/g, '')
      .replace(/\[AI모니터링\]\s*/g, '')
      .replace(/^\[AI관망\]\s*/g, '')
      .replace(/\[AI관망\]\s*/g, '')
      .replace(/\[.*?올-그린.*?\]/g, '')
      .replace(/\[.*?눌림목.*?\]/g, '')
      .replace(/\[.*?돌파.*?\]/g, '')
      .replace(/\[.*?VWAP.*?\]/g, '')
      .replace(/\[.*?CVD.*?\]/g, '')
      .replace(/\(.*?(눌림목|돌파|VWAP|CVD|올-그린).*?\)/g, '')
      .replace(/\[.*?(눌림목|돌파|VWAP|CVD|올-그린).*?\]/g, '')
      .replace(/\([①②③④].*?\)/g, '')
      .replace(/\[[①②③④].*?\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // If message explicitly references a different stock name, synthesize accurate status for selected stock
    const isOtherStockMessage = stocksRef.current.some(s => s.symbol !== selectedSymbol && cleaned.includes(s.name) && !cleaned.includes(currentName));
    if (isOtherStockMessage) {
      if (!isGapBotActive) {
        return held > 0 
          ? `[대기] ${currentName} (${held}주 보유 중) - 스캘퍼 정지 (시작 버튼을 누르면 실시간 자동매매 실행)`
          : `[대기] ${currentName} 진입 대기 (시작 버튼을 누르면 실시간 자동매매 실행)`;
      }
      if (selectedStock) {
        const strat = detectStockStrategies(selectedStock);
        if (held > 0) return `[보유 감시] ${currentName} ${held}주 보유 중 · 실시간 목표가 도달 및 분할 매매 추적 중 (RSI: ${Math.round(strat.rsi)})`;
        return `[수급 감시] ${currentName} 실시간 호가 잔량 및 최적 진입 타점 정밀 분석 중 (RSI: ${Math.round(strat.rsi)})`;
      }
      return `[수급 감시] ${currentName} 실시간 호가 잔량 및 진입 타점 정밀 분석 중...`;
    }

    return cleaned || `[수급 감시] ${currentName} 실시간 호가 잔량 및 진입 타점 정밀 분석 중...`;
  }, [scalperMessage, selectedStock, selectedSymbol, isGapBotActive, holdings, detectStockStrategies]);

  const isGapBotActiveRef = React.useRef(isGapBotActive);
  const gapBuyPriceRef = React.useRef(gapBuyPrice);
  const gapSellPriceRef = React.useRef(gapSellPrice);
  const tradeQuantityRef = React.useRef(tradeQuantity);
  const maxSlotsRef = React.useRef(maxSlots);
  const gapTradingProfitRef = React.useRef(gapTradingProfit);
  const gapTradeCountRef = React.useRef(gapTradeCount);
  const lastTradeTypeRef = React.useRef(lastTradeType);
  const scalperMessageRef = React.useRef(scalperMessage);
  const entryPriceModeRef = React.useRef(entryPriceMode);
  const autoCancelThresholdRef = React.useRef(autoCancelThreshold);
  const tradeLogsRef = React.useRef(tradeLogs);

  useEffect(() => { isGapBotActiveRef.current = isGapBotActive; }, [isGapBotActive]);
  useEffect(() => { gapBuyPriceRef.current = gapBuyPrice; }, [gapBuyPrice]);
  useEffect(() => { gapSellPriceRef.current = gapSellPrice; }, [gapSellPrice]);
  useEffect(() => { tradeQuantityRef.current = tradeQuantity; }, [tradeQuantity]);
  useEffect(() => { maxSlotsRef.current = maxSlots; }, [maxSlots]);
  useEffect(() => { gapTradingProfitRef.current = gapTradingProfit; }, [gapTradingProfit]);
  useEffect(() => { gapTradeCountRef.current = gapTradeCount; }, [gapTradeCount]);
  useEffect(() => { lastTradeTypeRef.current = lastTradeType; }, [lastTradeType]);
  useEffect(() => { scalperMessageRef.current = scalperMessage; }, [scalperMessage]);
  useEffect(() => { entryPriceModeRef.current = entryPriceMode; }, [entryPriceMode]);
  useEffect(() => { autoCancelThresholdRef.current = autoCancelThreshold; }, [autoCancelThreshold]);
  useEffect(() => { tradeLogsRef.current = tradeLogs; }, [tradeLogs]);

  useEffect(() => {
    const activeSym = activeTabIdRef.current;
    if (!activeSym) return;
    updateTab(activeSym, {
      isBotActive: isGapBotActive,
      gapBuyPrice,
      gapSellPrice,
      tradeQuantity,
      maxSlots: maxSlots || 10,
      gapInventory: (gapInventory || []).filter(s => !s.symbol || s.symbol === activeSym),
      gapTradingProfit,
      gapTradeCount,
      lastTradeType,
      scalperMessage,
      entryPriceMode,
      autoCancelThreshold
      // tradeLogs는 여기서 다루지 않는다 — tradeLogs(전역 GLOBAL TRADE LOGS)는 addLog()가
      // 종목별 인벤토리 로그(item.tradeLogs)에 직접 기록하므로, 여기서 다시 덮어쓰면 충돌/중복이 생긴다.
    });
  }, [isGapBotActive, gapBuyPrice, gapSellPrice, tradeQuantity, maxSlots, gapInventory, gapTradingProfit, gapTradeCount, lastTradeType, scalperMessage, entryPriceMode, autoCancelThreshold, updateTab]);

  // Helper for tick-aware target sell price calculation to guarantee positive net profit above tick size, fees, and taxes
  const calculateTargetSellPrice = useCallback((basePrice: number, targetProfitPct: number) => {
    return calcTargetSellPriceByNetProfit(basePrice, targetProfitPct, marketType);
  }, [marketType]); 

  // Notification State
  const [notifications, setNotifications] = useState<{ id: string; type: 'success' | 'error' | 'info'; message: string }[]>([]);

  const playScalpingSound = (type: 'BUY' | 'SELL') => {
    if (!scalpingSoundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      if (type === 'BUY') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'triangle';
        osc2.type = 'sine';
        
        osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc1.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.08); // C6
        osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.04); // E6
        
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.25);
        osc2.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {
      console.warn("Audio Context blocked or failed:", e);
    }
  };

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);
  showNotificationRef.current = showNotification;

  const handleToggleStrategy = useCallback((strat: 'PULLBACK' | 'BREAKOUT' | 'VWAP_SUPPORT' | 'VOLUME_PROFILE_CVD') => {
    setSelectedScalperStrategies(prev => {
      let next: ('PULLBACK' | 'BREAKOUT' | 'VWAP_SUPPORT' | 'VOLUME_PROFILE_CVD')[];
      if (prev.includes(strat)) {
        if (prev.length === 1) {
          next = prev; // 최소 1개 유지
          showNotification("최소 1개 이상의 전략이 활성화되어 있어야 합니다.", "info");
        } else {
          next = prev.filter(s => s !== strat);
        }
      } else {
        next = [...prev, strat];
      }

      if (next.length === 4) {
        setScalperStrategyMode('ALL_SENSORS_4');
      } else {
        setScalperStrategyMode('AUTO');
      }
      return next;
    });
  }, [showNotification]);

  const handleSelectAllGreen = useCallback(() => {
    setSelectedScalperStrategies(['PULLBACK', 'BREAKOUT', 'VWAP_SUPPORT', 'VOLUME_PROFILE_CVD']);
    setScalperStrategyMode('ALL_SENSORS_4');
    showNotification("🎯 [4/4 올-그린] 4개 핵심 전략(눌림목·돌파·VWAP·CVD)이 전체 활성화되었습니다.", "success");
  }, [showNotification]);


  

  // Confirmation Modal State

  // Auto-set Upper/Lower Price Limits (당일 상/하한가) when selectedStock, price, or market changes
  useEffect(() => {
    if (selectedStock && selectedStock.price > 0) {
      const isUS = selectedStock.market === 'US' || /^[A-Za-z]/.test(selectedStock.symbol) || marketType === 'US';
      const limits = calculateStockLimits(selectedStock.price, selectedStock.changePercent || 0, isUS, selectedStock.basePrice);
      setGapSellPrice(limits.upperLimit);
      setGapBuyPrice(limits.lowerLimit);
    }
  }, [selectedSymbol, selectedStock?.price, selectedStock?.changePercent, selectedStock?.basePrice, marketType]);
  const rangePercentage = useMemo(() => {
    if (!gapBuyPrice || !gapSellPrice || gapBuyPrice >= gapSellPrice || !selectedStock) return 0;
    const pct = ((selectedStock.price - gapBuyPrice) / (gapSellPrice - gapBuyPrice)) * 100;
    return Math.min(100, Math.max(0, pct));
  }, [gapBuyPrice, gapSellPrice, selectedStock?.price]);

  const displayBuyableQty = useMemo(() => {
    if (!selectedStock || selectedStock.price <= 0) return 0;
    const isUS = /^[A-Za-z]/.test(selectedStock.symbol) || selectedStock.market === 'US';
    const stockPriceInKRW = isUS ? selectedStock.price * exchangeRate : selectedStock.price;

    if (kisConfig.isConnected) {
      if (kisBuyableQty !== null) return kisBuyableQty;
      const realCash = isUS ? (orderableUsd > 0 ? orderableUsd * exchangeRate : balance) : (orderableKrw > 0 ? orderableKrw : balance);
      return Math.floor(realCash / (stockPriceInKRW || 1));
    } else {
      return Math.floor(balance / (stockPriceInKRW || 1));
    }
  }, [selectedStock, kisConfig.isConnected, kisBuyableQty, orderableKrw, orderableUsd, balance, exchangeRate]);

  const totalValue = useMemo(() => {
    // 💰 KIS가 직접 계산해서 주는 총평가금액(tot_evlu_amt = 예수금 + 보유종목 평가금액)이 있으면
    // 그대로 신뢰한다 — 로컬에서 holdings×현재가로 재계산하면 동기화 타이밍에 따라 미세하게
    // 어긋날 수 있지만, KIS 응답 자체는 그럴 위험이 없다. 다만 이 값은 "국내 계좌" 잔고조회
    // 기준이라, 해외주식을 보유 중이면 그 평가금액이 반영되지 않아 부정확할 수 있다 — 그 경우엔
    // 기존 로컬 재계산으로 폴백한다.
    const hasOverseasHoldings = Object.entries(holdings).some(([sym, qty]) => Number(qty) > 0 && /^[A-Z]/.test(sym));
    if (kisTotalAssetValue > 0 && !hasOverseasHoldings) {
      return kisTotalAssetValue;
    }

    // Total Asset Valuation = Cash Balance + Current Market Value of Stock Holdings + Pending Order Reserves
    let stockValue = 0;
    Object.entries(holdings).forEach(([sym, rawQty]) => {
      const qty = Number(rawQty);
      if (qty <= 0) return;

      const st = stocks.find(s => s.symbol === sym) ||
                 INITIAL_STOCKS_KR.find(s => s.symbol === sym);

      const currentPrice = st ? st.price : (avgPrices[sym] || 0);
      const isUS = /^[A-Z]/.test(sym);
      const priceInKRW = isUS ? currentPrice * exchangeRate : currentPrice;

      stockValue += qty * priceInKRW;
    });

    return Math.floor(balance + stockValue);
  }, [balance, holdings, stocks, avgPrices, exchangeRate, pendingBuyOrders, kisTotalAssetValue]);

  const convertedValue = displayCurrency === 'USD' ? Math.round(totalValue / exchangeRate) : Math.round(totalValue);
  const convertedBalance = displayCurrency === 'USD' ? Math.round(balance / exchangeRate) : Math.round(balance);
  
  const pnl = Math.round(totalValue - principal);
  const pnlPercent = principal > 0 ? (pnl / principal) * 100 : 0;

  const convertedPnl = displayCurrency === 'USD' ? Math.round(pnl / exchangeRate) : Math.round(pnl);
  const convertedPrincipal = displayCurrency === 'USD' ? Math.round(principal / exchangeRate) : Math.round(principal);
  const curPrefix = displayCurrency === 'USD' ? '$' : '₩';

  const [isAssetAnalysisModalOpen, setIsAssetAnalysisModalOpen] = useState<boolean>(false);
  const [showScalperGuide, setShowScalperGuide] = useState<boolean>(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState<boolean>(false);
  const [showPnlDetailsModal, setShowPnlDetailsModal] = useState<boolean>(false);
  const pnlCountryTab = 'KR';
  const [pnlActiveTab, setPnlActiveTab] = useState<'stock' | 'daily' | 'monthly' | 'yearly'>('daily');
  const [pnlViewMode, setPnlViewMode] = useState<'card' | 'table'>('card');
  const [pnlLoading, setPnlLoading] = useState<boolean>(false);
  const [pnlDataStock, setPnlDataStock] = useState<any[]>([]);
  const [pnlDataDaily, setPnlDataDaily] = useState<any[]>([]);
  const [pnlDataMonthly, setPnlDataMonthly] = useState<any[]>([]);
  const [pnlDataYearly, setPnlDataYearly] = useState<any[]>([]);
  const [pnlFilterQuery, setPnlFilterQuery] = useState<string>('');
  const [pnlPeriodRange, setPnlPeriodRange] = useState<'1m' | '3m' | '6m' | '1y' | 'all'>('3m');

  // 🚨 갭하락 대응 AI 예상보고서 모달 & 상태
  const [isAppReady, setIsAppReady] = useState<boolean>(false);
  // 🛡️ (2026-09-29) 매매 엔진(setInterval 안)은 effect를 만들 때의 isAppReady 값에 갇힐 수 있어서(의존성 배열에 없음)
  // 손절 조건이 영원히 false로 남을 위험이 있었다 — 엔진은 항상 이 ref로 최신 값을 읽는다.
  const isAppReadyRef = React.useRef(false);
  const kisHoldingsConfirmedRef = React.useRef(false);
  isAppReadyRef.current = isAppReady;

  // Delay auto-popup triggers until initial program loading & price/stock sync completes
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAppReady(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);


  // 🤖 AI 실시간 추천 종목 팝업 모달 상태 및 트리거 함수
  const [showAiRecPopup, setShowAiRecPopup] = useState<boolean>(false);
  const [aiRecPopupData, setAiRecPopupData] = useState<any>(null);

  const triggerAiRecommendationPopup = useCallback((recStock?: Stock, customReason?: string) => {
    let target = recStock;
    let realScore = 0;
    let realBreakdown: string[] = [];

    if (!target) {
      // 🛡️ 예전에는 보유 안 한 종목 중 완전 랜덤으로 하나를 뽑고, 신뢰도/목표가/손절가까지
      // 전부 Math.random()으로 만들어서 "AI 승률 95%+" 같은 문구를 붙이고 있었다. 이제는
      // 실제 매매 엔진이 쓰는 것과 동일한 점수제(calculateBuyScore)로 지금 추적 중인 종목들을
      // 전부 채점해서, 가장 점수가 높은 종목만 추천 후보로 삼는다 — 실제로 매수 신호가 없으면
      // 팝업 자체를 띄우지 않는다(가짜로 그럴듯한 추천을 지어내지 않음).
      const candidatePool = stocksRef.current.filter(s => !(holdings[s.symbol] > 0) && /^\d{6}$/.test(s.symbol) && s.price > 0);
      let bestScore = -1;
      let bestStock: Stock | null = null;
      let bestBreakdown: string[] = [];
      for (const s of candidatePool) {
        const strat = detectStockStrategies(s);
        const { score, breakdown } = calculateBuyScore(s, strat);
        if (score > bestScore) {
          bestScore = score;
          bestStock = s;
          bestBreakdown = breakdown;
        }
      }
      if (!bestStock || bestScore < BUY_SCORE_THRESHOLD) return; // 실제로 괜찮은 후보가 없으면 팝업을 띄우지 않는다
      target = bestStock;
      realScore = bestScore;
      realBreakdown = bestBreakdown;
    } else {
      const strat = detectStockStrategies(target);
      const { score, breakdown } = calculateBuyScore(target, strat);
      realScore = score;
      realBreakdown = breakdown;
    }
    if (!target) return;

    const currentP = target.price || 0;
    if (currentP <= 0) return;

    // 🔄 realScore는 calculateBuyScore가 이미 100점 만점으로 정규화해서 반환한 값이다 —
    // 여기서 다시 /130 등으로 재환산하면 이중 정규화가 되어 실제보다 낮게 표시되는 버그가 있었다.
    const confidence = Math.round(realScore);
    // 🔄 목표가/손절가는 실제 매매 엔진이 쓰는 설정값(목표순익/손절 %)을 그대로 반영
    const targetP = Math.round(currentP * (1 + scalpingTargetProfit / 100));
    const stopL = Math.round(currentP * (1 + scalpingStopLoss / 100));
    const expReturn = scalpingTargetProfit.toFixed(2);

    setAiRecPopupData({
      stock: target,
      symbol: target.symbol,
      name: target.name,
      price: currentP,
      changePercent: target.changePercent,
      confidence,
      targetPrice: targetP,
      stopLoss: stopL,
      expectedReturn: expReturn,
      reason: customReason || `실시간 매수 점수제 분석 결과 ${realScore}/100점 (${confidence}%) — ${realBreakdown.join(', ') || '조건 충족'}. 목표순익 +${expReturn}% 설정 기준.`,
      technicalTags: realBreakdown.length > 0 ? realBreakdown.map(b => b.replace(/\(\+\d+\)/, '')) : ['점수제 조건 충족']
    });
    setShowAiRecPopup(true);
  }, [stocks, holdings, detectStockStrategies, calculateBuyScore, scalpingTargetProfit, scalpingStopLoss]);

  const loadRealizedPnL = useCallback(async () => {
    setPnlLoading(true);
    try {
      const now = new Date();
      let startDate = new Date();
      if (pnlPeriodRange === '1m') startDate.setMonth(now.getMonth() - 1);
      else if (pnlPeriodRange === '3m') startDate.setMonth(now.getMonth() - 3);
      else if (pnlPeriodRange === '6m') startDate.setMonth(now.getMonth() - 6);
      else if (pnlPeriodRange === '1y') startDate.setFullYear(now.getFullYear() - 1);
      else if (pnlPeriodRange === 'all') startDate.setFullYear(now.getFullYear() - 3);

      const formatYMD = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
      const startStr = formatYMD(startDate);
      const endStr = formatYMD(now);

      let stockList: any[] = [];
      let dailyList: any[] = [];
      let monthlyList: any[] = [];
      let yearlyList: any[] = [];

      // 1. KIS API Query using Promise.allSettled to prevent indefinite spinning
      // TR IDs: TTTC8494R (종목별 실현손익), TTTC8715R (주식일별매매손익), TTTC8001R (체결내역)
      if (kisConfig.isConnected) {
        const results = await Promise.allSettled([
          kisService.getDomesticPeriodRealizedPnL(startStr, endStr),
          kisService.getPeriodTradeProfit(startStr, endStr, '', '02'),
          kisService.getDomesticOrderExecutions(startStr, endStr)
        ]);

        const resPeriod = results[0].status === 'fulfilled' ? results[0].value : null;
        const resProfit = results[1].status === 'fulfilled' ? results[1].value : null;
        const resExecutions = results[2].status === 'fulfilled' ? results[2].value : null;

        // Extract summary totals from output2 of TTTC8715R or TTTC8494R if present
        const summaryProfit = Array.isArray(resProfit?.output2) && resProfit.output2.length > 0 
          ? resProfit.output2[0] 
          : (resProfit?.output2 || {});
        const summaryPeriod = Array.isArray(resPeriod?.output2) && resPeriod.output2.length > 0 
          ? resPeriod.output2[0] 
          : (resPeriod?.output2 || {});

        const summarySllAmt = Number(summaryProfit.tot_sll_amt || summaryProfit.smc_sll_amt || summaryProfit.sll_amt || summaryPeriod.sll_amt || summaryPeriod.tot_sll_amt || 0);
        const summaryPchsAmt = Number(summaryProfit.tot_pchs_amt || summaryProfit.smc_pchs_amt || summaryProfit.bying_amt || summaryProfit.pchs_amt || summaryProfit.tot_buy_amt || summaryPeriod.pchs_amt || summaryPeriod.tot_pchs_amt || 0);
        const summaryPnl = Number(summaryProfit.tot_rlzt_pfls_amt || summaryProfit.smc_rlzt_pfls_amt || summaryProfit.rlzt_pfls_amt || summaryProfit.rlzt_pnl || summaryPeriod.rlzt_pfls_amt || summaryPeriod.rlzt_pnl || 0);
        const summaryErng = Number(summaryProfit.tot_erng_rt || summaryProfit.smc_erng_rt || summaryProfit.rlzt_erng_rt || summaryProfit.erng_rt || summaryPeriod.erng_rt || summaryPeriod.tot_erng_rt || 0);

        // Helper to extract purchase amount from all possible KIS Open API fields
        const extractPchsAmt = (item: any): number => {
          return Number(
            item.pchs_amt ||
            item.bying_amt ||
            item.buy_amt ||
            item.tot_pchs_amt ||
            item.sll_pchs_amt ||
            item.pchs_ccld_amt ||
            item.smc_pchs_amt ||
            item.cblc_amt ||
            item.bfdy_buy_amt ||
            item.thdy_buy_amt ||
            item.tot_buy_amt ||
            item.buy_amt_sum ||
            (item.pchs_unpr && item.sll_qty ? Number(item.pchs_unpr) * Number(item.sll_qty) : 0) ||
            (item.pchs_unpr && item.ccld_qty ? Number(item.pchs_unpr) * Number(item.ccld_qty) : 0) ||
            (item.sll_buy_dvsn_cd === '02' && item.tot_ccld_amt ? Number(item.tot_ccld_amt) : 0) ||
            0
          );
        };

        // Helper to extract sell amount from all possible KIS Open API fields
        const extractSllAmt = (item: any): number => {
          return Number(
            item.sll_amt ||
            item.tot_sll_amt ||
            item.sll_ccld_amt ||
            item.sell_amt ||
            item.smc_sll_amt ||
            item.sl_amt ||
            item.tot_sell_amt ||
            item.sll_amt_sum ||
            item.thdy_sll_amt ||
            item.bfdy_sll_amt ||
            (item.sll_unpr && item.sll_qty ? Number(item.sll_unpr) * Number(item.sll_qty) : 0) ||
            (item.trad_unpr && item.sll_qty ? Number(item.trad_unpr) * Number(item.sll_qty) : 0) ||
            (item.ccld_unpr && item.sll_qty ? Number(item.ccld_unpr) * Number(item.sll_qty) : 0) ||
            (item.sll_buy_dvsn_cd === '01' && item.tot_ccld_amt ? Number(item.tot_ccld_amt) : 0) ||
            (item.tot_ccld_amt && !item.pchs_amt && !item.bying_amt ? Number(item.tot_ccld_amt) : 0) ||
            0
          );
        };

        const extractRlztPnl = (item: any): number => {
          return Number(
            item.rlzt_pfls_amt ||
            item.rlzt_pnl ||
            item.sll_pnl_amt ||
            item.real_pfls_amt ||
            item.trad_pnl_amt ||
            item.tot_pnl_amt ||
            item.pnl_amt ||
            item.pfls_amt ||
            item.smc_rlzt_pfls_amt ||
            0
          );
        };

        const extractErngRt = (item: any): number => {
          return Number(
            item.rlzt_erng_rt ||
            item.tot_erng_rt ||
            item.erng_rt ||
            item.pnl_rat ||
            item.smc_erng_rt ||
            item.profit_rate ||
            0
          );
        };

        // 1. Process Stock List (TTTC8494R: 종목별 실현손익)
        if (resPeriod && resPeriod.rt_cd === '0' && Array.isArray(resPeriod.output1) && resPeriod.output1.length > 0) {
          const rawStockItems = resPeriod.output1.map((item: any) => {
            let sllAmt = extractSllAmt(item);
            let pchsAmt = extractPchsAmt(item);
            let rlztPnl = extractRlztPnl(item);
            let erngRt = extractErngRt(item);

            // Symmetrical Cross-field recovery
            if (pchsAmt === 0 && sllAmt > 0) {
              if (rlztPnl !== 0) {
                pchsAmt = Math.max(0, sllAmt - rlztPnl);
              } else if (erngRt !== 0) {
                pchsAmt = Math.round(sllAmt / (1 + (erngRt / 100)));
                rlztPnl = sllAmt - pchsAmt;
              } else if (summarySllAmt > 0 && summaryPchsAmt > 0) {
                pchsAmt = Math.round((sllAmt / summarySllAmt) * summaryPchsAmt);
                rlztPnl = sllAmt - pchsAmt;
              }
            } else if (sllAmt === 0 && pchsAmt > 0) {
              if (rlztPnl !== 0) {
                sllAmt = Math.max(0, pchsAmt + rlztPnl);
              } else if (erngRt !== 0) {
                sllAmt = Math.round(pchsAmt * (1 + (erngRt / 100)));
                rlztPnl = sllAmt - pchsAmt;
              } else if (summarySllAmt > 0 && summaryPchsAmt > 0) {
                sllAmt = Math.round((pchsAmt / summaryPchsAmt) * summarySllAmt);
                rlztPnl = sllAmt - pchsAmt;
              }
            }

            if (rlztPnl === 0 && sllAmt > 0 && pchsAmt > 0) {
              rlztPnl = sllAmt - pchsAmt;
            }
            if (erngRt === 0 && pchsAmt > 0) {
              erngRt = Number(((rlztPnl / pchsAmt) * 100).toFixed(2));
            }

            return {
              pdno: item.pdno || item.stck_shrn_iscd || '005930',
              prdt_name: item.prdt_name || item.hts_kor_isnm || '주식',
              sll_qty: Number(item.sll_qty || item.ccld_qty || item.sll_ccld_qty || item.trad_qty || 1),
              pchs_amt: pchsAmt,
              sll_amt: sllAmt,
              rlzt_pnl: rlztPnl,
              erng_rt: erngRt
            };
          });

          // Consolidate duplicates by stock code
          const stockGroup: Record<string, typeof rawStockItems[0]> = {};
          rawStockItems.forEach(item => {
            const key = item.pdno || item.prdt_name;
            if (!stockGroup[key]) {
              stockGroup[key] = { ...item };
            } else {
              stockGroup[key].sll_qty += item.sll_qty;
              stockGroup[key].pchs_amt += item.pchs_amt;
              stockGroup[key].sll_amt += item.sll_amt;
              stockGroup[key].rlzt_pnl += item.rlzt_pnl;
            }
          });
          stockList = Object.values(stockGroup).map(s => ({
            ...s,
            erng_rt: s.pchs_amt > 0 ? Number(((s.rlzt_pnl / s.pchs_amt) * 100).toFixed(2)) : 0
          }));
        }

        // 2. Process Daily List (TTTC8715R: 주식일별매매손익)
        if (resProfit && resProfit.rt_cd === '0' && Array.isArray(resProfit.output1) && resProfit.output1.length > 0) {
          const rawDailyItems = resProfit.output1.map((item: any) => {
            let rawDate = item.stck_bsop_date || item.bzdt || item.trad_dt || item.dt || '';
            if (rawDate && rawDate.length === 8 && !rawDate.includes('.')) {
              rawDate = `${rawDate.slice(0, 4)}.${rawDate.slice(4, 6)}.${rawDate.slice(6, 8)}`;
            }

            let sllAmt = extractSllAmt(item);
            let pchsAmt = extractPchsAmt(item);
            let rlztPnl = extractRlztPnl(item);
            let erngRt = extractErngRt(item);

            // Symmetrical Cross-field recovery
            if (pchsAmt === 0 && sllAmt > 0) {
              if (rlztPnl !== 0) {
                pchsAmt = Math.max(0, sllAmt - rlztPnl);
              } else if (erngRt !== 0) {
                pchsAmt = Math.round(sllAmt / (1 + (erngRt / 100)));
                rlztPnl = sllAmt - pchsAmt;
              } else if (summarySllAmt > 0 && summaryPchsAmt > 0) {
                pchsAmt = Math.round((sllAmt / summarySllAmt) * summaryPchsAmt);
                rlztPnl = sllAmt - pchsAmt;
              }
            } else if (sllAmt === 0 && pchsAmt > 0) {
              if (rlztPnl !== 0) {
                sllAmt = Math.max(0, pchsAmt + rlztPnl);
              } else if (erngRt !== 0) {
                sllAmt = Math.round(pchsAmt * (1 + (erngRt / 100)));
                rlztPnl = sllAmt - pchsAmt;
              } else if (summarySllAmt > 0 && summaryPchsAmt > 0) {
                sllAmt = Math.round((pchsAmt / summaryPchsAmt) * summarySllAmt);
                rlztPnl = sllAmt - pchsAmt;
              }
            }

            if (rlztPnl === 0 && sllAmt > 0 && pchsAmt > 0) {
              rlztPnl = sllAmt - pchsAmt;
            }
            if (erngRt === 0 && pchsAmt > 0) {
              erngRt = Number(((rlztPnl / pchsAmt) * 100).toFixed(2));
            }

            return {
              stck_bsop_date: rawDate || '2026.08.14',
              trad_cnt: Number(item.trad_cnt || item.ccld_cnt || 1),
              pchs_amt: pchsAmt,
              sll_amt: sllAmt,
              rlzt_pnl: rlztPnl,
              erng_rt: erngRt,
            };
          });

          // Consolidate trades by Date so daily view shows unified day rows (like MTS app)
          const dailyGroup: Record<string, { stck_bsop_date: string; trad_cnt: number; pchs_amt: number; sll_amt: number; rlzt_pnl: number }> = {};
          rawDailyItems.forEach(item => {
            const dt = item.stck_bsop_date || '2026.08.14';
            if (!dailyGroup[dt]) {
              dailyGroup[dt] = {
                stck_bsop_date: dt,
                trad_cnt: 0,
                pchs_amt: 0,
                sll_amt: 0,
                rlzt_pnl: 0
              };
            }
            dailyGroup[dt].trad_cnt += (item.trad_cnt || 1);
            dailyGroup[dt].pchs_amt += item.pchs_amt;
            dailyGroup[dt].sll_amt += item.sll_amt;
            dailyGroup[dt].rlzt_pnl += item.rlzt_pnl;
          });

          dailyList = Object.values(dailyGroup).map(d => {
            let sll = d.sll_amt;
            let pchs = d.pchs_amt;
            let pnl = d.rlzt_pnl;

            if (sll === 0 && pchs > 0) {
              sll = pnl !== 0 ? pchs + pnl : Math.round(pchs * 1.0119);
              pnl = sll - pchs;
            } else if (pchs === 0 && sll > 0) {
              pchs = pnl !== 0 ? Math.max(0, sll - pnl) : Math.round(sll / 1.0119);
              pnl = sll - pchs;
            }
            return {
              stck_bsop_date: d.stck_bsop_date,
              trad_cnt: d.trad_cnt,
              pchs_amt: pchs,
              sll_amt: sll,
              rlzt_pnl: pnl,
              erng_rt: pchs > 0 ? Number(((pnl / pchs) * 100).toFixed(2)) : 0
            };
          }).sort((a, b) => b.stck_bsop_date.localeCompare(a.stck_bsop_date));
        }

        // 3. Fallback: Parse order executions (TTTC8001R) with Buy/Sell matching
        if (resExecutions && resExecutions.rt_cd === '0' && Array.isArray(resExecutions.output1) && resExecutions.output1.length > 0) {
          const buyGroup: Record<string, { qty: number; amt: number }> = {};
          const sellGroup: Record<string, { pdno: string; prdt_name: string; qty: number; amt: number; date: string }> = {};

          resExecutions.output1.forEach((exec: any) => {
            const sym = exec.pdno || exec.stck_shrn_iscd || '005930';
            const name = exec.prdt_name || exec.hts_kor_isnm || sym;
            const isBuy = exec.sll_buy_dvsn_cd === '02' || exec.sll_buy_dvsn_cd_name === '매수';
            const isSell = exec.sll_buy_dvsn_cd === '01' || exec.sll_buy_dvsn_cd_name === '매도' || !isBuy;
            const qty = Number(exec.tot_ccld_qty || exec.ccld_qty || exec.ord_qty || 0);
            const amt = Number(exec.tot_ccld_amt || exec.ccld_amt || 0);
            let execDate = exec.ord_dt || exec.trad_dt || '';
            if (execDate && execDate.length === 8 && !execDate.includes('.')) {
              execDate = `${execDate.slice(0, 4)}.${execDate.slice(4, 6)}.${execDate.slice(6, 8)}`;
            }

            if (isBuy) {
              if (!buyGroup[sym]) buyGroup[sym] = { qty: 0, amt: 0 };
              buyGroup[sym].qty += qty;
              buyGroup[sym].amt += amt;
            } else if (isSell) {
              if (!sellGroup[sym]) sellGroup[sym] = { pdno: sym, prdt_name: name, qty: 0, amt: 0, date: execDate || '2026.08.14' };
              sellGroup[sym].qty += qty;
              sellGroup[sym].amt += amt;
            }
          });

          // If stockList was empty, populate from matched executions
          if (stockList.length === 0 && Object.keys(sellGroup).length > 0) {
            stockList = Object.values(sellGroup).map(s => {
              const matchedBuy = buyGroup[s.pdno];
              let pchsAmt = matchedBuy && matchedBuy.qty > 0 
                ? Math.round((matchedBuy.amt / matchedBuy.qty) * s.qty) 
                : 0;
              
              if (pchsAmt === 0 && s.amt > 0) {
                const heldStock = stocksRef.current.find(st => st.symbol === s.pdno);
                if (heldStock && heldStock.price > 0) {
                  pchsAmt = Math.round(heldStock.price * s.qty);
                } else {
                  pchsAmt = Math.round(s.amt * 0.988);
                }
              }
              const rlztPnl = s.amt - pchsAmt;
              const erngRt = pchsAmt > 0 ? Number(((rlztPnl / pchsAmt) * 100).toFixed(2)) : 0;
              return {
                pdno: s.pdno,
                prdt_name: s.prdt_name,
                sll_qty: s.qty,
                pchs_amt: pchsAmt,
                sll_amt: s.amt,
                rlzt_pnl: rlztPnl,
                erng_rt: erngRt
              };
            });
          }

          // If dailyList was empty, populate from executions
          if (dailyList.length === 0 && Object.keys(sellGroup).length > 0) {
            const dateMap: Record<string, { trad_cnt: number; pchs_amt: number; sll_amt: number; rlzt_pnl: number }> = {};
            stockList.forEach(s => {
              const dt = '2026.08.14';
              if (!dateMap[dt]) dateMap[dt] = { trad_cnt: 0, pchs_amt: 0, sll_amt: 0, rlzt_pnl: 0 };
              dateMap[dt].trad_cnt += 1;
              dateMap[dt].pchs_amt += s.pchs_amt;
              dateMap[dt].sll_amt += s.sll_amt;
              dateMap[dt].rlzt_pnl += s.rlzt_pnl;
            });
            dailyList = Object.entries(dateMap).map(([dt, v]) => ({
              stck_bsop_date: dt,
              trad_cnt: v.trad_cnt,
              pchs_amt: v.pchs_amt,
              sll_amt: v.sll_amt,
              rlzt_pnl: v.rlzt_pnl,
              erng_rt: v.pchs_amt > 0 ? Number(((v.rlzt_pnl / v.pchs_amt) * 100).toFixed(2)) : 0
            }));
          }
        }

        // Reconcile and cross-fill any remaining 0 fields
        if (dailyList.length > 0) {
          dailyList = dailyList.map(d => {
            let sll = d.sll_amt;
            let pchs = d.pchs_amt;
            let pnl = d.rlzt_pnl;

            if (sll === 0 && pchs > 0) {
              sll = pnl !== 0 ? pchs + pnl : Math.round(pchs * 1.0119);
              pnl = sll - pchs;
            } else if (pchs === 0 && sll > 0) {
              pchs = pnl !== 0 ? Math.max(0, sll - pnl) : Math.round(sll / 1.0119);
              pnl = sll - pchs;
            }

            if (pnl === 0 && sll > 0 && pchs > 0) {
              pnl = sll - pchs;
            }
            const erng = pchs > 0 ? Number(((pnl / pchs) * 100).toFixed(2)) : d.erng_rt;

            return {
              ...d,
              sll_amt: sll,
              pchs_amt: pchs,
              rlzt_pnl: pnl,
              erng_rt: erng
            };
          });
        }

        if (stockList.length > 0) {
          stockList = stockList.map(s => {
            let sll = s.sll_amt;
            let pchs = s.pchs_amt;
            let pnl = s.rlzt_pnl;

            if (sll === 0 && pchs > 0) {
              sll = pnl !== 0 ? pchs + pnl : Math.round(pchs * 1.0119);
              pnl = sll - pchs;
            } else if (pchs === 0 && sll > 0) {
              pchs = pnl !== 0 ? Math.max(0, sll - pnl) : Math.round(sll / 1.0119);
              pnl = sll - pchs;
            }

            if (pnl === 0 && sll > 0 && pchs > 0) {
              pnl = sll - pchs;
            }
            const erng = pchs > 0 ? Number(((pnl / pchs) * 100).toFixed(2)) : s.erng_rt;

            return {
              ...s,
              sll_amt: sll,
              pchs_amt: pchs,
              rlzt_pnl: pnl,
              erng_rt: erng
            };
          });
        }

        // Calculate total KIS realized PnL
        let totalPnlFromKis = summaryPnl;
        if (totalPnlFromKis === 0 && dailyList.length > 0) {
          totalPnlFromKis = dailyList.reduce((acc, curr) => acc + (curr.rlzt_pnl || 0), 0);
        }
        if (totalPnlFromKis === 0 && stockList.length > 0) {
          totalPnlFromKis = stockList.reduce((acc, curr) => acc + (curr.rlzt_pnl || 0), 0);
        }
        setKisTotalRealizedPnL(totalPnlFromKis);
      } else {
        setKisTotalRealizedPnL(null);
      }

      // 2. Local Trade Log & Fallback when KIS returns no closed trades
      if (!kisConfig.isConnected || (stockList.length === 0 && dailyList.length === 0)) {
        // Try extracting session sell logs first
        const allLogs = tradeLogsRef.current || [];
        const sellLogs = allLogs.filter(log => log.type === 'SELL' || log.type === '매도' || (log.reason && (log.reason.includes('익절') || log.reason.includes('매도'))));
        
        if (stockList.length === 0 && sellLogs.length > 0) {
          const grouped: Record<string, { pdno: string; prdt_name: string; sll_qty: number; pchs_amt: number; sll_amt: number; rlzt_pnl: number }> = {};
          sellLogs.forEach(log => {
            const sym = log.symbol || '005930';
            const name = log.name || stocksRef.current.find(s => s.symbol === sym)?.name || sym;
            const qty = log.amount || 1;
            const sellAmt = log.price * qty;
            const pnlMatch = log.reason?.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
            const pnlPct = pnlMatch ? parseFloat(pnlMatch[1]) : 1.0;
            const buyAmt = Math.round(sellAmt / (1 + pnlPct / 100));
            const pnl = sellAmt - buyAmt;

            if (!grouped[sym]) {
              grouped[sym] = { pdno: sym, prdt_name: name, sll_qty: 0, pchs_amt: 0, sll_amt: 0, rlzt_pnl: 0 };
            }
            grouped[sym].sll_qty += qty;
            grouped[sym].pchs_amt += buyAmt;
            grouped[sym].sll_amt += sellAmt;
            grouped[sym].rlzt_pnl += pnl;
          });

          stockList = Object.values(grouped).map(item => ({
            ...item,
            erng_rt: item.pchs_amt > 0 ? Number(((item.rlzt_pnl / item.pchs_amt) * 100).toFixed(2)) : 0
          }));
        }

        // 🛡️ 매우 중요한 삭제: 여기 있던 "삼성전자 15주 매도 +12,500원" 같은 가짜 3종목 내역과,
        // 실제 KIS 응답(TTTC8715R)을 한 번 보고 그 숫자를 그대로 영구 하드코딩해뒀던 가짜 일별
        // 실현손익(2026년 8월 여러 날짜)을 완전히 삭제했다. 이건 실현손익(내 계좌의 실제 수익/손실)
        // 이라는, 사용자가 실제 돈과 직결해서 신뢰해야 하는 화면에 지어낸 매매 기록을 보여주는
        // 것이었다 — KIS 미연동이기만 해도 이 가짜 수익 내역이 그대로 노출됐다. 이제 채울 실제
        // 데이터(KIS 응답 또는 세션 내 실제 매도 로그)가 없으면 정직하게 빈 배열로 남겨서
        // "거래 내역 없음"이 표시되도록 한다.
      }

      // Generate Monthly List dynamically from dailyList if available
      if (dailyList.length > 0) {
        const monthlyGroup: Record<string, { trad_cnt: number; pchs_amt: number; sll_amt: number; rlzt_pnl: number }> = {};
        dailyList.forEach(item => {
          const raw = (item.stck_bsop_date || '').replace(/[^0-9]/g, '');
          let monthLabel = '26년 8월';
          if (raw.length >= 6) {
            const yr = raw.slice(2, 4);
            const mo = parseInt(raw.slice(4, 6), 10);
            monthLabel = `${yr}년 ${mo}월`;
          }
          if (!monthlyGroup[monthLabel]) {
            monthlyGroup[monthLabel] = { trad_cnt: 0, pchs_amt: 0, sll_amt: 0, rlzt_pnl: 0 };
          }
          monthlyGroup[monthLabel].trad_cnt += (item.trad_cnt || 1);
          monthlyGroup[monthLabel].pchs_amt += (item.pchs_amt || 0);
          monthlyGroup[monthLabel].sll_amt += (item.sll_amt || 0);
          monthlyGroup[monthLabel].rlzt_pnl += (item.rlzt_pnl || 0);
        });

        // 🛡️ 여기 있던 "26년 7월/6월/5월"이라는 지어낸 이전 달 수익 데이터를 삭제했다 — 실제
        // dailyList(진짜 데이터)만으로 월간 집계하고, 데이터가 그 달만큼만 있으면 정직하게
        // 그만큼만 보여준다.

        monthlyList = Object.entries(monthlyGroup).map(([moLabel, vals]) => ({
          stck_bsop_month: moLabel,
          trad_cnt: vals.trad_cnt,
          pchs_amt: vals.pchs_amt,
          sll_amt: vals.sll_amt,
          rlzt_pnl: vals.rlzt_pnl,
          erng_rt: vals.pchs_amt > 0 ? Number(((vals.rlzt_pnl / vals.pchs_amt) * 100).toFixed(2)) : 0
        }));
      }

      // Generate Yearly List dynamically from dailyList & monthlyList
      if (dailyList.length > 0) {
        const yearlyGroup: Record<string, { trad_cnt: number; pchs_amt: number; sll_amt: number; rlzt_pnl: number }> = {};
        dailyList.forEach(item => {
          const yr = (item.stck_bsop_date || '').replace(/[^0-9]/g, '').slice(0, 4) || '2026';
          const label = `${yr}년`;
          if (!yearlyGroup[label]) {
            yearlyGroup[label] = { trad_cnt: 0, pchs_amt: 0, sll_amt: 0, rlzt_pnl: 0 };
          }
          yearlyGroup[label].trad_cnt += (item.trad_cnt || 1);
          yearlyGroup[label].pchs_amt += (item.pchs_amt || 0);
          yearlyGroup[label].sll_amt += (item.sll_amt || 0);
          yearlyGroup[label].rlzt_pnl += (item.rlzt_pnl || 0);
        });

        // 🛡️ 여기 있던 "2025년"이라는 지어낸 이전 해 수익 데이터를 삭제했다 — 실제 데이터만큼만
        // 정직하게 보여준다.

        yearlyList = Object.entries(yearlyGroup).map(([yrLabel, vals]) => ({
          stck_bsop_year: yrLabel,
          trad_cnt: vals.trad_cnt,
          pchs_amt: vals.pchs_amt,
          sll_amt: vals.sll_amt,
          rlzt_pnl: vals.rlzt_pnl,
          erng_rt: vals.pchs_amt > 0 ? Number(((vals.rlzt_pnl / vals.pchs_amt) * 100).toFixed(2)) : 0
        }));
      }

      setPnlDataStock(stockList);
      setPnlDataDaily(dailyList);
      setPnlDataMonthly(monthlyList);
      setPnlDataYearly(yearlyList);
    } catch (err) {
      console.warn("Realized PnL load error:", err);
    } finally {
      setPnlLoading(false);
    }
  }, [kisConfig.isConnected, pnlPeriodRange, gapTradingProfit, gapTradeCount, selectedSymbol]);

  const formatPnlDateWithDay = (dateStr: string): string => {
    if (!dateStr) return '';
    const clean = String(dateStr).replace(/[^0-9]/g, '');
    if (clean.length >= 8) {
      const y = parseInt(clean.slice(0, 4), 10);
      const m = parseInt(clean.slice(4, 6), 10) - 1;
      const d = parseInt(clean.slice(6, 8), 10);
      const dateObj = new Date(y, m, d);
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      const dayOfWeek = isNaN(dateObj.getDay()) ? '' : days[dateObj.getDay()];
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      return `${mm}.${dd}. (${dayOfWeek})`;
    }
    return dateStr;
  };

  useEffect(() => {
    if (showPnlDetailsModal) {
      loadRealizedPnL();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPnlDetailsModal, pnlPeriodRange]);
  const [selectedAccountType, setSelectedAccountType] = useState<string>('위탁');

  const accountStatusFormattedTime = useMemo(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}.${date}. ${hours}:${minutes}`;
  }, [time]);

  const effectiveHoldings = useMemo(() => {
    const result: Record<string, number> = {};
    const now = Date.now();

    // 1. Incorporate all positive holdings from authoritative holdings state
    Object.entries(holdings).forEach(([sym, qty]) => {
      const numQty = Number(qty);
      if (numQty > 0 && !isNaN(numQty)) {
        result[sym] = numQty;
      }
    });

    // 2. Incorporate newly bought stocks from recent local trades (within 45s) for instant UI responsiveness
    Object.entries(recentLocalTradesRef.current || {}).forEach(([sym, trade]: [string, any]) => {
      if (trade && now - trade.timestamp < 45000 && trade.quantity > 0) {
        result[sym] = Math.max(result[sym] || 0, trade.quantity);
      }
    });

    // Clean up any zero/negative/NaN values
    Object.keys(result).forEach(sym => {
      if (!result[sym] || Number(result[sym]) <= 0 || isNaN(Number(result[sym]))) {
        delete result[sym];
      }
    });

    return result;
  }, [holdings]);

  // 🛡️ 매우 중요한 삭제: 여기 있던 "보유종목 4초 주기 가격조회" useEffect는 refreshStalePrices(25초
  // 주기, 인벤토리 종목 15초/추천풀 2분 우선순위)와 완전히 별개로, 독립적으로 4초마다 보유종목
  // 전체를 순회하며 REST 조회를 하고 있었다 — 두 함수가 같은 종목에 대해 각각 요청을 날리니
  // 실제 KIS 요청량이 예상보다 훨씬 많아지고, 이게 429(요청 과다) 발생 위험을 키우는 원인이었다.
  // 게다가 이 함수는 새 종목을 stocks에 추가할 때 history를 실제 값이 아니라 가짜 랜덤값
  // (price * (0.98~1.02배))으로 채우고 있었다. refreshStalePrices가 이미 stocks 배열 전체(보유종목이
  // stocks에 있는 한 포함)를 담당하므로 이 중복 루프를 완전히 제거한다.


  const assetAnalysis = useMemo(() => {
    const isUSD = displayCurrency === 'USD';
    const conv = (krwVal: number) => isUSD ? krwVal / exchangeRate : krwVal;

    let totalStockValue = 0;
    let totalStockInvested = 0;
    const stockList: Array<{
      symbol: string;
      name: string;
      qty: number;
      avgPrice: number;
      currentPrice: number;
      investedAmount: number;
      evaluatedAmount: number;
      pnlAmount: number | null;
      pnlPercent: number | null;
      hasAvgPriceData: boolean; // 평단가를 실제로 알고 있는지 여부 — false면 "0%"가 아니라 "데이터 없음"으로 표시해야 함
      portfolioShare: number;
    }> = [];

    Object.entries(effectiveHoldings).forEach(([sym, rawQty]) => {
      const qty = Number(rawQty);
      if (qty <= 0) return;

      const isStockUS = /^[A-Za-z]/.test(sym) && !/^\d+$/.test(sym);

      const st = stocks.find(s => s.symbol === sym) ||
                 stocksCache.KR?.find(s => s.symbol === sym) ||
                 stocksCache.US?.find(s => s.symbol === sym) ||
                 INITIAL_STOCKS_KR.find(s => s.symbol === sym) ||
                 { name: sym, symbol: sym, price: 0 };

      const resolvedStockName = getResolvedStockName(sym, st);

      const currentPriceKRW = isStockUS ? (st.price || 0) * exchangeRate : (st.price || 0);

      let avgP = avgPrices[sym] || 0;
      if (avgP <= 0 && gapInventory.length > 0 && selectedSymbol === sym) {
        const totalCost = gapInventory.reduce((acc, slot) => acc + (slot.price * slot.quantity), 0);
        const totalQty = gapInventory.reduce((acc, slot) => acc + slot.quantity, 0);
        avgP = totalQty > 0 ? Math.floor(totalCost / totalQty) : 0;
      }
      // 평단가를 실제로 구했는지(avgPrices 또는 gapInventory에서) 여부를 여기서 확정한다 —
      // 아래에서 currentPrice로 대체하기 "직전"의 값으로 판단해야 진짜 데이터 유무를 알 수 있다.
      const hasAvgPriceData = avgP > 0;
      if (avgP <= 0) avgP = st.price || 0;
      const avgPriceKRW = isStockUS ? Math.floor(avgP * exchangeRate) : Math.floor(avgP);

      const invested = qty * avgPriceKRW;
      const evaluated = qty * currentPriceKRW;
      // 평단가 데이터가 없으면(현재가로 대체된 상태) 손익을 "0%"로 단정하지 않고 null로 남겨서
      // "진짜 무손익"과 "평단가를 몰라서 계산 불가"를 구분한다.
      const pnlAmt = hasAvgPriceData ? (evaluated - invested) : null;
      const pnlPct = hasAvgPriceData ? (invested > 0 ? (pnlAmt! / invested) * 100 : 0) : null;

      totalStockValue += evaluated;
      totalStockInvested += invested;

      stockList.push({
        symbol: sym,
        name: resolvedStockName,
        qty,
        avgPrice: conv(avgPriceKRW),
        currentPrice: conv(currentPriceKRW),
        investedAmount: conv(invested),
        evaluatedAmount: conv(evaluated),
        pnlAmount: pnlAmt !== null ? conv(pnlAmt) : null,
        pnlPercent: pnlPct,
        hasAvgPriceData,
        portfolioShare: 0
      });
    });

    stockList.forEach(item => {
      // portfolioShare should be based on totalValue (which is converted in convertedValue)
      // but let's just keep it relative to its own category if filtered, or keep total
      item.portfolioShare = totalValue > 0 ? ((item.evaluatedAmount * (isUSD ? exchangeRate : 1)) / totalValue) * 100 : 0;
    });

    const filteredTotalValue = (marketType === 'US' ? balance : balance) + totalStockValue; // simplified for now

    // Let's make shares relative to the filtered total for a consistent sub-view
    const currentViewTotal = conv(balance) + totalStockValue;

    return {
      cashBalance: conv(balance),
      stockValue: totalStockValue,
      stockInvested: totalStockInvested,
      pendingReserve: 0,
      totalCalculatedAsset: currentViewTotal, // Reflecting total valuation including reserves
      principal: conv(principal),
      totalPnL: totalStockValue - totalStockInvested,
      totalPnLPercent: totalStockInvested > 0 ? ((totalStockValue - totalStockInvested) / totalStockInvested) * 100 : 0,
      cashShare: currentViewTotal > 0 ? (conv(balance) / currentViewTotal) * 100 : 0,
      stockShare: currentViewTotal > 0 ? (totalStockValue / currentViewTotal) * 100 : 0,
      pendingShare: 0,
      stockList
    };
  }, [balance, holdings, effectiveHoldings, stocks, avgPrices, gapInventory, selectedSymbol, exchangeRate, pendingBuyOrders, totalValue, principal, pnl, pnlPercent, marketType, displayCurrency]);

  // Stable symbol ordering for TOP 5 Scalper Optimal Stocks:
  // Priority: Real-time Rising Momentum + 1-Year Upward Trend + AI Recommended Optimal Candidates (No Price Limit)


  // Scalper Engine Optimal Top 5 Stocks mapping live stock snapshot

  // Real-time Exchange Rate Fetcher & Simulator
  

  // Firebase Auth & License Check
  useEffect(() => {
    let licenseUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsAuthLoading(true);
      
      // Cleanup previous license listener if exists
      if (licenseUnsubscribe) {
        licenseUnsubscribe();
        licenseUnsubscribe = null;
      }

      if (user) {
        setCurrentUser(user);
        
        // Load user settings if logged in
        getUserSettings(user.uid).then(settings => {
          // 🚀 설정 적용은 이 블록 끝에서 끝나지만, 표시만 늦게 켜도 되므로 다음 틱에 완료 표시
          setTimeout(() => { userSettingsLoadedRef.current = true; }, 0);
          if (settings) {
            if (settings.kisConfig) {
              const loadedConfig = settings.kisConfig;
              // Migration to single real server config
              let finalConfig = loadedConfig;
              if (loadedConfig.activeType || loadedConfig.real) {
                 const activeData = loadedConfig.real || loadedConfig[loadedConfig.activeType] || loadedConfig || {};
                 finalConfig = {
                    appKey: activeData.appKey || '',
                    appSecret: activeData.appSecret || '',
                    accountNo: activeData.accountNo || '',
                    accountCode: activeData.accountCode || '01',
                    accountPw: activeData.accountPw || '',
                    isConnected: loadedConfig.isConnected || false,
                    domesticOrderType: activeData.domesticOrderType || '00',
                 };
              }
              
              setKisConfig(finalConfig);
              // If it was connected, re-init the service with saved token
              if (finalConfig.isConnected) {
                const tokenData = settings.kisTokenReal || settings.kisToken;

                // 🔍 kisService.init()이 실제로 이 세션에서 호출/완료되는지, 그리고 유효한 설정으로
                // 호출되는지 확인하기 위한 진단 로그 — "Config not initialized" 에러가 반복되면
                // 이 로그가 아예 안 찍혔거나(effect 자체가 실행 안 됨) appKey/accountNo가 비어있을
                // 가능성을 여기서 확인할 수 있다.
                console.log('[KIS 초기화] kisService.init() 호출', {
                  appKey존재: !!finalConfig.appKey,
                  accountNo존재: !!finalConfig.accountNo,
                  isConnected: finalConfig.isConnected
                });

                kisService.init(
                  getActiveKisConfig(finalConfig), 
                  tokenData?.token, 
                  tokenData?.expiresAt
                );

                console.log('[KIS 초기화] kisService.init() 완료 — isConfigReady:', kisService.isConfigReady());
              }
            }
            // 🎯 과제 1(멀티 앱키) — 계좌 #2~4(실시간 시세 전용). 없으면 빈 슬롯 3칸 그대로 유지.
            if (Array.isArray(settings.kisExtraAccounts) && settings.kisExtraAccounts.length > 0) {
              const bySlot = new Map<number, { appKey: string; appSecret: string }>();
              settings.kisExtraAccounts.forEach((a: any) => {
                if (a && [2, 3, 4].includes(Number(a.slot))) {
                  bySlot.set(Number(a.slot), { appKey: String(a.appKey || ''), appSecret: String(a.appSecret || '') });
                }
              });
              setKisExtraAccounts(prev => prev.map(slot => {
                const saved = bySlot.get(slot.slot);
                return saved ? { ...slot, ...saved } : slot;
              }));
            }
            setExtraAccountsLoaded(true); // 계좌 #2~4 설정까지 확인 완료 — 이제부터 실제 계좌 수로 한도를 정한다
            if (settings.holdings && typeof settings.holdings === 'object') {
              setHoldings(() => {
                const updated: Record<string, number> = {};
                Object.entries(settings.holdings).forEach(([k, v]) => {
                  const qty = Number(v);
                  if (qty > 0) updated[k] = qty;
                });
                return updated;
              });
            }
          }
        }).catch(() => { userSettingsLoadedRef.current = true; });

        // Set up token update handler to minimize LMS notifications
        kisService.setTokenUpdateHandler((token, expiresAt) => {
          if (user) {
            saveUserKISToken(user.uid, token, expiresAt);
          }
        });
        
        // Super Admin Bypass
        if (user.email?.toLowerCase() === "agnus9524@gmail.com") {
          setIsSubscribed(true);
        } else {
          // Set up real-time listener for current user's license
          // This allows immediate blocking if admin suspends/deletes the license
          licenseUnsubscribe = onSnapshot(doc(db, 'licenses', user.uid), (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              setUserLicenseData(data);
              const expiresAt = new Date(data.expiresAt);
              const isExpired = expiresAt < new Date();
              setIsSubscribed(data.status === 'active' && !isExpired);

              // Silent Email Sync: Update if missing in DB but available in Auth
              if (data.status === 'active' && !data.email && user.email) {
                updateLicense(user.uid, { email: user.email });
              }
            } else {
              // License document doesn't exist (deleted by admin)
              setIsSubscribed(false);
              setUserLicenseData(null);
            }
          }, (error) => {
            console.error("License listener error:", error);
            setIsSubscribed(false);
            setUserLicenseData(null);
          });
        }
      } else {
        setCurrentUser(null);
        setIsSubscribed(false);
        userSettingsLoadedRef.current = true;
      }
      setIsAuthLoading(false);
    });

    return () => {
      authUnsubscribe();
      if (licenseUnsubscribe) licenseUnsubscribe();
    }
  }, []);

  // Auto-Sync KIS Account Status once initial stocks, charts, and prices load
 // ============================================================
// 🔄 KIS 초기 계좌 자동 동기화
//
// executeFullKisInitialSync()가 초기화 중에는 이미
// handleSyncKIS()를 호출하므로 중복 호출하지 않는다.
//
// 초기화가 완료된 뒤에도 실제 계좌 상태가 필요한 경우에만
// 1회 실행한다.
// ============================================================
const hasAutoSyncedRef = React.useRef(false);

useEffect(() => {
  if (!currentUser) return;
  if (!isAppInitialized) return;
  if (!kisConfig.isConnected) return;
  if (hasAutoSyncedRef.current) return;
  if (stocks.length === 0) return;

  hasAutoSyncedRef.current = true;

  const timer = setTimeout(() => {
    if (!currentUser) return;
    if (!isAppInitialized) return;
    if (!kisConfig.isConnected) return;

    handleSyncKIS();
  }, 800);

  return () => clearTimeout(timer);
}, [
  currentUser,
  isAppInitialized,
  kisConfig.isConnected,
  stocks.length
]);

  const isLoggingInRef = React.useRef(false);
  const handleLogin = async () => {
    if (isLoggingInRef.current) return;
    isLoggingInRef.current = true;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        showNotification("로그인 창이 닫혔습니다.", "info");
      } else if (error.code === 'auth/popup-blocked') {
        alert("팝업이 차단되었습니다. 브라우저 주소창의 팝업 차단 설정을 해제해주세요.");
      } else if (error.code === 'auth/network-request-failed') {
        alert("네트워크 연결 오류가 발생했습니다.");
      } else {
        alert(`로그인 중 오류가 발생했습니다: ${error.message}\n\n* 만약 iFrame(AI Studio 프리뷰) 환경이라면 브라우저의 '3방 쿠키 차단(Third-Party Cookie Block)' 보안 정책으로 인해 구글 소셜 로그인이 차단되었을 수 있습니다. 오른쪽 상단의 '새 창에서 열기' 버튼을 클릭해 독립된 창에서 다시 시도해 주세요.`);
      }
    } finally {
      setTimeout(() => { isLoggingInRef.current = false; }, 1000);
    }
  };

  const handleLogout = async () => {
  try {
    // ============================================================
    // 🔴 로그아웃 즉시 실시간 데이터 세션 무효화
    // ============================================================
    liveDataSessionRef.current += 1;

    // 진행 중인 동기화 플래그 초기화
    syncInProgressRef.current = false;

    // 앱 실시간 데이터 루프 중단
    setIsAppInitialized(false);

    // 봇/실시간 상태도 안전하게 대기 상태로 변경
    setBotStatus("대기 중");

    // ============================================================
    // KIS 연결 상태 초기화
    // ============================================================
    try {
      kisService.clear();
    } catch (kisError) {
      console.warn("[로그아웃] KIS 세션 정리 실패:", kisError);
    }

    // Firebase 로그아웃
    await signOut(auth);

    showNotification("로그아웃 되었습니다.", "info");

    console.log("[로그아웃 완료] 실시간 시세/센서/동기화 세션 중단");
  } catch (e: any) {
    console.error("[로그아웃 오류]", e);
    showNotification("로그아웃 중 오류가 발생했습니다.", "error");
  }
};


  const handleFetchAllLicenses = async () => {
    setIsAdminLoading(true);
    const licenses = await getAllLicenses();
    const keys = await getAllAuthKeys();
    setAllLicenses(licenses);
    setAllAuthKeys(keys);
    setIsAdminLoading(false);
  };

  const handleGenerateKey = async () => {
    setIsAdminLoading(true);
    try {
      const key = await generateAuthKey(30);
      if (key) {
        showNotification(`새 인증키가 생성되었습니다: ${key}`, "success");
        handleFetchAllLicenses();
      }
    } catch (error: any) {
      console.error("Failed to generate auth key:", error);
      showNotification(`인증키 생성에 실패했습니다: ${error.message || error}`, "error");
    }
    setIsAdminLoading(false);
  };

  const handleUpdateUserStatus = async (userId: string, newStatus?: 'active' | 'suspended' | any, currentData?: any) => {
    setIsAdminLoading(true);
    try {
      let resolvedStatus: 'active' | 'suspended' = 'active';
      if (typeof newStatus === 'string' && (newStatus === 'active' || newStatus === 'suspended')) {
        resolvedStatus = newStatus;
      } else if (typeof newStatus === 'object' && newStatus?.status) {
        resolvedStatus = newStatus.status === 'active' ? 'suspended' : 'active';
      } else if (currentData?.status) {
        resolvedStatus = currentData.status === 'active' ? 'suspended' : 'active';
      } else {
        const found = allLicenses.find(l => (l.id === userId || l.userId === userId));
        resolvedStatus = found?.status === 'active' ? 'suspended' : 'active';
      }

      await updateLicense(userId, { status: resolvedStatus });
      
      // Optimistic update
      setAllLicenses(prev => prev.map(l => {
        if (l.id === userId || l.userId === userId) {
          return { ...l, status: resolvedStatus };
        }
        return l;
      }));

      showNotification(`사용자 상태가 [${resolvedStatus === 'active' ? '활성' : '중지'}](으)로 변경되었습니다.`, "success");
      await handleFetchAllLicenses();
    } catch (e: any) {
      console.error("Status update error:", e);
      showNotification(`상태 변경 실패: ${e.message}`, "error");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleExtendLicense = async (userId: string, additionalDays: number | any = 30, currentData?: any) => {
    setIsAdminLoading(true);
    try {
      const days = (typeof additionalDays === 'number' && !isNaN(additionalDays) && additionalDays > 0) 
        ? additionalDays 
        : 30;

      const licObj = (typeof additionalDays === 'object' && additionalDays !== null)
        ? additionalDays
        : ((typeof currentData === 'object' && currentData !== null)
            ? currentData
            : allLicenses.find(l => l.id === userId || l.userId === userId));

      let baseTime = Date.now();
      if (licObj?.expiresAt) {
        const expTime = new Date(licObj.expiresAt).getTime();
        if (!isNaN(expTime) && expTime > baseTime) {
          baseTime = expTime;
        }
      }

      const newExpiryDate = new Date(baseTime + days * 24 * 60 * 60 * 1000);
      const newExpiryIso = newExpiryDate.toISOString();
      const targetDocId = licObj?.id || userId || licObj?.userId;

      if (!targetDocId) {
        throw new Error("대상 회원의 식별자(UID)를 찾을 수 없습니다.");
      }

      await updateLicense(targetDocId, { 
        expiresAt: newExpiryIso,
        status: 'active'
      });

      if (licObj?.userId && licObj.userId !== targetDocId) {
        await updateLicense(licObj.userId, { 
          expiresAt: newExpiryIso,
          status: 'active'
        });
      }

      // Optimistic update in state
      setAllLicenses(prev => prev.map(l => {
        if (l.id === targetDocId || l.userId === targetDocId || l.id === userId || l.userId === userId) {
          return { ...l, expiresAt: newExpiryIso, status: 'active' };
        }
        return l;
      }));

      // If current user is extended, update user license state
      if (currentUser && (targetDocId === currentUser.uid || licObj?.userId === currentUser.uid || userId === currentUser.uid)) {
        setIsSubscribed(true);
      }

      showNotification(`라이선스가 +${days}일 연장되었습니다. (만료일: ${newExpiryDate.toLocaleDateString()})`, "success");
      await handleFetchAllLicenses();
    } catch (e: any) {
      console.error("License extension error:", e);
      showNotification(`연장 실패: ${e.message}`, "error");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleDeleteUserLicense = async (userId: string) => {
    if (!confirm("정말 이 사용자의 라이선스를 삭제하시겠습니까?")) return;
    setIsAdminLoading(true);
    try {
      await deleteLicense(userId);
      showNotification("라이선스가 삭제되었습니다.", "success");
      await handleFetchAllLicenses();
    } catch (e: any) {
      showNotification(`삭제 실패: ${e.message}`, "error");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleDeleteAuthKey = async (keyText: string) => {
    if (!confirm(`인증키 [${keyText}]를 삭제하시겠습니까?`)) return;
    setIsAdminLoading(true);
    try {
      await deleteAuthKeyDoc(keyText);
      showNotification("인증키가 삭제되었습니다.", "success");
      await handleFetchAllLicenses();
    } catch (e: any) {
      showNotification(`인증키 삭제 실패: ${e.message}`, "error");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleExportCSV = () => {
    try {
      const rows = [
        ["ID", "이메일", "상태", "만료일", "인증키", "생성일"],
        ...allLicenses.map(l => [
          l.id || l.userId || '',
          l.email || '',
          l.status || '',
          l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : '',
          l.key || '',
          l.createdAt?.toDate ? l.createdAt.toDate().toLocaleDateString() : ''
        ])
      ];
      const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `licenses_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      showNotification(`CSV 내보내기 실패: ${e.message}`, "error");
    }
  };


  // ============================================================
  // 🔄 추천종목 목록 로딩 — 실제 코스피 시장을 거래량 기준으로 스캔한다
  // ------------------------------------------------------------
  // 이전에는 앱이 미리 추적 중인 "예시 등록 종목"(INITIAL_STOCKS_KR, 25개)만 후보로 썼기 때문에
  // 실제 시장과 무관하게 항상 같은 종목군에서만 추천이 나왔다. 이제는 KIS 거래량순위 API로
  // 지금 이 순간 실제로 거래량이 많은 종목들을 먼저 가져오고, 그 위에서 전략센서 분석을 돌린다.
  // ============================================================
  const fallbackSymbolsRef = React.useRef<Set<string>>(new Set());
  // 🛡️ 추천 검색 중복 실행 방지 — 사용자가 버튼을 누른 것과 자동 슬롯 채우기가 거의 동시에
  // loadScalperRecommendations를 호출하면, 예전엔 각자 독립적으로 KIS 랭킹 API를 또 호출해서
  // 요청 큐가 불필요하게 붐볐다. 이미 진행 중인 검색이 있으면 새로 요청을 만들지 않고 그 결과를
  // 그대로 기다리게 한다.
  const recommendationSearchPromiseRef = React.useRef<Promise<ScalperRecommendation[]> | null>(null);
  const loadScalperRecommendations = useCallback(async (): Promise<ScalperRecommendation[]> => {
    // 💰 추천 가격구간(하한~상한) — 모든 후보 경로(순위 API·보충 후보·최종 목록)에 공통 적용
    const isInRecPriceRange = (price: number) => {
      const { min, max } = recPriceRangeRef.current;
      return Number(price) > 0 && Number(price) >= min && Number(price) <= max;
    };
    // 💧 당일 거래대금 10억 원 이상 (2026-09-30) — 거래량순위는 KIS 누적 거래대금, 없으면 현재가 × 누적 거래량으로 추정
    const hasEnoughTradingValue = (v: { price: number; volume?: any; tradingValue?: number }) => {
      const tvKis = Number((v as any).tradingValue);
      const vol = Number(String(v.volume ?? '0').replace(/,/g, '')) || 0;
      const tv = Number.isFinite(tvKis) && tvKis > 0 ? tvKis : Number(v.price) * vol;
      return tv >= REC_MIN_TRADING_VALUE;
    };
    // 🏷️ 시장 선택(코스피/코스닥) — 시장을 모르는 종목은 특정 시장 선택 시 제외
    const isInRecMarket = (symbol: string, known?: string) => {
      const f = recMarketFilterRef.current;
      if (f === 'ALL') return true;
      return (known || getKnownMarket(symbol)) === f;
    };
    if (recommendationSearchPromiseRef.current) {
      console.log('[추천 검색 중복 요청 차단] 기존 검색 결과 대기');
      return recommendationSearchPromiseRef.current;
    }

    const searchPromise = (async (): Promise<ScalperRecommendation[]> => {
    let list: ScalperRecommendation[] = [];

    // 1순위: 실제 코스피 거래량순위 + 등락률순위를 함께 조회해서 병합한다.
    // 거래량만 보는 것보다, "거래량도 많고 방향성(모멘텀)도 뚜렷한" 종목까지 후보군에 넣어야
    // 스캘핑에 더 적합한 종목을 놓치지 않는다. (비공식 3rd-party 스크래핑 대신 KIS 공식 랭킹 API 조합)
    if (kisConfig.isConnected) {
      // 🛡️ 등록 종목이 많을수록 요청 큐가 붐벼서 429 백오프가 겹치기 쉽다. "추천종목 조회는
      // 최우선"이라는 원칙에 맞춰, 1차 시도(20초)가 실패해도 곧바로 포기하지 않고 5초 대기 후
      // 한 번 더 시도한다 — 일시적인 혼잡으로 인한 실패 가능성을 낮추기 위함이다.
      // 🛡️ 예전엔 거래량순위/등락률순위 두 API를 Promise.all로 동시에 호출했다 — 이게 다른 KIS
      // 요청(가격조회 등)과 겹쳐서 큐가 붐빌 위험을 키웠다. 이제 순차 호출하고 그 사이에 아주
      // 짧은 간격(150ms)을 둬서, 추천 검색 하나가 다른 요청과 충돌할 가능성을 줄인다.
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      const fetchRanking = async (): Promise<[any[], any[],]> => {
        // 💰 "종목당 10000원" 입력창 대신 만든 가격구간 드롭다운 — 선택한 구간의 종목만
        // KIS 랭킹 API 단계에서부터 걸러진다(추가 API 호출 없이 파라미터만 바뀜).
        const selectedRange: { minPrice: number; maxPrice?: number } = { minPrice: recPriceRangeRef.current.min, maxPrice: recPriceRangeRef.current.max };

        // 🛡️ 매우 중요한 수정: KIS의 거래량순위/등락률순위 API는 연속조회(페이지네이션) 자체를
        // 지원하지 않는다는 게 실측으로 확인됐다(응답에 다음 페이지 커서가 아예 없음) — 즉 한 번
        // 호출하면 항상 최대 30건까지만 온다. 그래서 넓은 가격구간(예: 1,000~20,000원)을 한 번에
        // 조회하면, 그 구간 안의 종목이 아무리 많아도 상위 30위 안에 든 것만 볼 수 있고 나머지는
        // 영원히 놓친다. 이제 선택된 가격구간을 3등분해서, 각 좁은 구간마다 별도로 API를 호출한다
        // — 좁은 구간 안에서는 상대적으로 적은 종목이 경쟁하니, 예전엔 큰 구간에서 30위 밖으로
        // 밀렸던 종목도 자신의 좁은 구간 안에서는 상위 30위 안에 들 가능성이 높아진다.
        const subRanges: { minPrice: number; maxPrice?: number }[] = [];
        if (selectedRange.maxPrice) {
          const span = selectedRange.maxPrice - selectedRange.minPrice;
          const step = Math.max(1, Math.round(span / 3));
          subRanges.push({ minPrice: selectedRange.minPrice, maxPrice: selectedRange.minPrice + step });
          subRanges.push({ minPrice: selectedRange.minPrice + step, maxPrice: selectedRange.minPrice + step * 2 });
          subRanges.push({ minPrice: selectedRange.minPrice + step * 2, maxPrice: selectedRange.maxPrice });
        } else {
          // "무제한" 구간(maxPrice 없음)은 등분이 애매하므로 기존처럼 1구간만 조회한다.
          subRanges.push({ minPrice: selectedRange.minPrice, maxPrice: undefined });
        }

        const rankingPromise = (async (): Promise<[any[], any[]]> => {
          const volumeMap = new Map<string, any>();
          const fluctuationMap = new Map<string, any>();

          for (let i = 0; i < subRanges.length; i++) {
            const sub = subRanges[i];
            const priceFilter = { minPrice: sub.minPrice, maxPrice: sub.maxPrice, minVolume: 100000 };

            const volumeLeaders = await kisService.getVolumeRanking('J', 30, priceFilter, recMarketFilterRef.current);
            (Array.isArray(volumeLeaders) ? volumeLeaders : []).forEach(v => { if (v?.symbol) volumeMap.set(v.symbol, v); });
            await sleep(150);

            const fluctuationLeaders = await kisService.getFluctuationRanking('J', 'UP', 30, priceFilter, recMarketFilterRef.current);
            (Array.isArray(fluctuationLeaders) ? fluctuationLeaders : []).forEach(v => { if (v?.symbol) fluctuationMap.set(v.symbol, v); });
            await sleep(150);
          }

          const volumeLeaders = Array.from(volumeMap.values());
          const fluctuationLeaders = Array.from(fluctuationMap.values());

return [
  Array.isArray(volumeLeaders) ? volumeLeaders : [],
  Array.isArray(fluctuationLeaders) ? fluctuationLeaders : []
];
        })();

        return Promise.race([
          rankingPromise,
          new Promise<[any[], any[]]>((_, reject) => setTimeout(() => reject(new Error('ranking_timeout')), 30000)) // 코스피·코스닥을 따로 조회하느라 호출 수가 2배라 20→30초
        ]);
      };

      try {
        // 🛡️ 재시도 로직 제거 — 큐가 이미 붐벼서 실패하는 상황에서, 5초 후 재시도는 그 붐비는
        // 큐에 요청을 또 하나 얹는 것과 같아서 오히려 상황을 악화시켰다. 1차 시도로 끝내고
        // 실패하면 바로 아래 2순위(추적 종목 풀)로 넘어간다.
        const [volumeLeaders, fluctuationLeaders] = await fetchRanking();

        // symbol 기준으로 병합 (중복 제거) — 두 순위에 모두 등장하는 종목이 특히 유의미한 후보.
        // 🔍 어느 순위에서 온 종목인지(source) 태깅해서, 특정 종목이 후보군 단계에서 실제로
        // 잡혔는지 진단 로그로 바로 확인할 수 있게 한다.
        const mergedMap = new Map<string, { symbol: string; name: string; price: number; changePercent: number; volume: string; source?: string; marketType?: 'KOSPI' | 'KOSDAQ' }>();
        volumeLeaders.forEach(v => {
          if (!v?.symbol) return;
          mergedMap.set(v.symbol, { ...v, source: 'VOLUME' });
        });
        fluctuationLeaders.forEach(v => {
          if (!v?.symbol) return;
          const existing = mergedMap.get(v.symbol);
          mergedMap.set(v.symbol, { ...(existing || {}), ...v, source: existing ? 'VOLUME+MOMENTUM' : 'MOMENTUM' });
        });
        // 추천에서 KODEX/TIGER 등 ETF 상품, 인버스/레버리지/선물 파생상품은 제외.
        // 종목명 자체를 알 수 없는(빈 이름) 종목도 제외한다 — 대부분 로컬 마스터 데이터에 없는
        // ETN/ETF류이고, 이름을 못 찾으면 화면에 "종목코드(종목코드)"처럼 코드가 이름 대신 표시되는
        // 원인이 되므로 아예 추천하지 않는 게 안전하다.
        const isEtfName = (name: string) => {
          const lower = (name || '').toLowerCase();
          return lower.includes('kodex') || lower.includes('tiger') || lower.includes('etf') || lower.includes('spac')
            || (name || '').includes('인버스') || (name || '').includes('레버리지') || (name || '').includes('선물') || (name || '').includes('스팩');
        };
        // 🛡️ (2026-09-29) 설정한 가격구간 밖의 종목은 여기서 한 번 더 걸러낸다 — KIS 순위 API에 가격 조건을 보내긴
        // 하지만 응답을 그대로 믿지 않는다(장 시작 전·시간외 등 가격 필드가 조건과 다르게 올 수 있음).
        const merged = Array.from(mergedMap.values()).filter(v => v.name && v.name.trim().length > 0 && !isEtfName(v.name) && isInRecPriceRange(v.price) && isInRecMarket(v.symbol, (v as any).marketType) && hasEnoughTradingValue(v));

        if (merged.length > 0) {
          // 🎯 (2026-10-04) 가짜 가격 이력으로 전략을 판정하던 방식을 없앴다. 두 순위에 모두 오른 종목과
          // 거래대금 큰 종목부터 상위 REC_DETAIL_LIMIT개만 현재가·체결강도를 실제로 조회해서 점수를 낸다.
          const tvOf = (v: any) => (Number(v.tradingValue) > 0 ? Number(v.tradingValue) : 0);
          const ordered = [...merged].sort((x, y) =>
            Number(y.source === 'VOLUME+MOMENTUM') - Number(x.source === 'VOLUME+MOMENTUM') || tvOf(y) - tvOf(x));
          // 🎯 (2026-10-06) 조회 30종목을 "새로 들어올 수 있는 후보"에 쓴다. 예전엔 순위 상위 30종목을 그대로
          // 조회해서, 이미 인벤토리에 있는 종목과 재편입 금지(퇴출 후 10분) 종목이 그 자리를 차지했다 →
          // 인벤토리(38)가 조회 대상(30)보다 커서 새 후보가 거의 남지 않았고, 퇴출만 되고 채워지지 않았다.
          // 이미 등록된 종목은 앱이 받고 있는 실시간 값으로 점수를 내고(조회 불필요), 금지 중인 종목은 맨 뒤로 민다.
          const registeredNow = new Set(scalperTabsRef.current.map(t => t.symbol));
          const nowForCooldown = Date.now();
          const inCooldown = (sym: string) => {
            const at = evictedAtRef.current[sym];
            return !!at && nowForCooldown - at < INVENTORY_REENTRY_COOLDOWN_MS;
          };
          const detailTargets = ordered
            .filter(v => !registeredNow.has(v.symbol))
            .sort((x, y) => Number(inCooldown(x.symbol)) - Number(inCooldown(y.symbol)))
            .slice(0, REC_DETAIL_LIMIT);
          const details = new Map<string, RecommendationDetail | null>();
          const detailStartedAt = Date.now();
          const detailJobs = detailTargets.map(v =>
            kisService.getRecommendationDetail(v.symbol).then(d => { details.set(v.symbol, d); }).catch(() => { details.set(v.symbol, null); }));
          await Promise.race([Promise.all(detailJobs), sleep(REC_DETAIL_BUDGET_MS)]);
          const got = detailTargets.filter(v => !!details.get(v.symbol)).length;
          console.log(`[추천 상세 조회] ${got}/${detailTargets.length}종목 수신 · ${((Date.now() - detailStartedAt) / 1000).toFixed(1)}초 · 후보 ${merged.length}종목`);

          list = ordered.map(v => {
            const st = registeredNow.has(v.symbol) ? stocksRef.current.find(x => x.symbol === v.symbol) : undefined;
            if (st && st.price > 0) {
              // 등록 종목 — 실시간으로 받고 있는 값(체결강도·VWAP·5분 거래대금)을 그대로 쓴다
              const vw = Number(getCurrentTrueVwap(st.symbol, st.price));
              const tv5 = tickFieldCheckRef.current.cntgVol ? getTradeValue5mEst(st.symbol).value : undefined;
              const live: RecommendationDetail = {
                price: st.price,
                changePercent: st.changePercent,
                execStrength: st.executionStrength && st.executionStrength > 0 ? st.executionStrength : undefined,
                vwap: vw > 0 ? vw : undefined,
                tradingValue: Number((v as any).tradingValue) > 0 ? Number((v as any).tradingValue) : undefined,
              };
              return {
                ...buildScalperRecommendation(v as any, live, { tradeValue5m: tv5 && tv5 > 0 ? tv5 : undefined }),
                dataSource: 'TRACKED_POOL' as const,
                dataAgeSeconds: lastWsTickAtRef.current[v.symbol] !== undefined ? Math.round((Date.now() - lastWsTickAtRef.current[v.symbol]) / 1000) : undefined,
              };
            }
            return {
              ...buildScalperRecommendation(v as any, details.get(v.symbol) || null),
              dataSource: 'RANKING_API' as const,
              dataAgeSeconds: 0,
            };
          });
        }
      } catch (err) {
        console.warn('[거래량/등락률 순위 기반 추천 실패]', err);
      }
    }

    // 2순위: 거래량 순위 스캔이 안 되면(KIS 미연동 등), 현재 추적 중인 종목 풀로 분석
    // 🛡️ (2026-09-29) 예전엔 이 보충 후보(앱이 들고 있는 종목 전체)에 가격구간 조건이 없어서, 순위 결과가
    // 19개보다 적으면(좁은 가격구간·장 시작 전 등) 구간 밖의 비싼 종목이 추천에 섞여 들어왔다. 이제 같은 구간만 쓴다.
    if (list.length < MAX_SCALPER_RECOMMENDATIONS) {
      const candidatePool = stocksRef.current.filter(s => {
        if (/^[A-Za-z]/.test(s.symbol) || s.market === 'US' || s.price <= 0) return false;
        if (!isInRecPriceRange(s.price)) return false;
        if (!isInRecMarket(s.symbol)) return false;
        if (!hasEnoughTradingValue(s)) return false;
        if (!s.name || s.name.trim().length === 0 || s.name === s.symbol) return false;
        const lowerName = (s.name || '').toLowerCase();
        if (lowerName.includes('kodex') || lowerName.includes('tiger') || lowerName.includes('etf')) return false;
        if ((s.name || '').includes('인버스') || (s.name || '').includes('레버리지') || (s.name || '').includes('선물')) return false;
        return true;
      });
      if (candidatePool.length > 0) {
        const existingSymbols = new Set(list.map(r => r.symbol));
        const nowForAge = Date.now();
        const rawGenerated = kisService.generateRealtimeRecommendations(candidatePool, detectStockStrategies);

        const supplement = rawGenerated
          .filter(r => !existingSymbols.has(r.symbol))
          .map(r => {
            const lastTick = lastWsTickAtRef.current[r.symbol];
            const ageSeconds = lastTick !== undefined ? Math.round((nowForAge - lastTick) / 1000) : undefined;
            // 이미 추적 중인 종목은 앱이 받고 있는 실제 값(체결강도·VWAP·5분 거래대금)으로 같은 점수를 낸다
            const st = candidatePool.find(c => c.symbol === r.symbol)!;
            const live: RecommendationDetail = {
              price: st.price,
              changePercent: st.changePercent,
              execStrength: st.executionStrength && st.executionStrength > 0 ? st.executionStrength : undefined,
              vwap: (() => { const vw = Number(getCurrentTrueVwap(st.symbol, st.price)); return vw > 0 ? vw : undefined; })(),
              tradingValue: Number((st as any).tradingValue) > 0 ? Number((st as any).tradingValue) : undefined,
            };
            const tv5 = tickFieldCheckRef.current.cntgVol ? getTradeValue5mEst(st.symbol).value : undefined;
            return {
              ...buildScalperRecommendation({ symbol: st.symbol, name: st.name, price: st.price, changePercent: st.changePercent || 0, volume: st.volume, tradingValue: (st as any).tradingValue, marketType: (st as any).marketType }, live, { tradeValue5m: tv5 && tv5 > 0 ? tv5 : undefined }),
              dataSource: 'TRACKED_POOL' as const,
              dataAgeSeconds: ageSeconds,
            };
          });
        list = [...list, ...supplement];
      }
    }

    // 🛡️ 매우 중요한 수정: kisService.generateRealtimeRecommendations()가 매긴 점수(눌림목40/
    // 돌파5/VWAP40/CVD40 — 100점 만점, 실제 매매 판단과는 완전히 다른 단순 체계)를 그대로
    // 정렬에 쓰지 않는다. 실제 매매 실행(엔진 루프)이 쓰는 calculateBuyScore(130점, VWAP위/
    // VWAP돌파/체결강도/거래량2배/RSI/단기이평/매도호가소진/전고점돌파/매수호가우세를 정교하게
    // 반영)로 각 후보의 점수를 재계산해서 덮어쓴다. 이렇게 해야 "추천 1위"가 실제로 봇이 살
    // "매수 우선순위 1위"와 정확히 같아진다 — 예전엔 추천 목록과 실제 매수 판단이 서로 다른
    // 잣대를 쓰고 있었다.
    // 🎯 (2026-10-04) 등록 종목만 다른 점수(매수 점수)로 덮어쓰던 것을 없앴다 — 모든 추천이 같은 추천 점수 하나로 정렬된다.
    const rescored = list;

    // 🛡️ 예전엔 여기서 1/2순위가 부족하면 하드코딩된 예전 데이터(3순위)로 채워 넣었는데,
    // 이건 실시간 계산이 아닌 가짜/오래된 데이터라 삭제했다. 1/2순위로 구한 만큼만(모자라면
    // 모자란 대로, 극단적으로는 0개도) 정직하게 반환한다 — 실시간 데이터가 아니면 차라리
    // 추천이 없는 게 낫다는 원칙.
    fallbackSymbolsRef.current = new Set();

    // 🛡️ 최종 안전망 — 재계산 중 최신 시세로 가격이 바뀌었더라도 구간 밖이면 추천하지 않는다
    const scoredCandidates = rescored
      .filter(rec => {
        const live = stocksRef.current.find(s => s.symbol === rec.symbol)?.price;
        if (!isInRecMarket(rec.symbol, (rec as any).marketType)) return false;
        return isInRecPriceRange(Number(live) > 0 ? Number(live) : rec.price);
      })
      .sort((a, b) => b.scalpingScore - a.scalpingScore);

    // 🛡️ 1년 장기 추세 필터를 완전히 제거했다 — 실시간 초단타 추천에서는 거래량/등락률/체결강도/
    // 눌림목·돌파·VWAP·CVD 같은 실시간 조건이 우선이고, 장기 추세는 그 자체로 KIS 요청 큐를
    // 불필요하게 점유해서(월봉 API를 추가로 호출) 429/타임아웃 문제를 계속 일으키는 원인이었다.
    // "추천 자체를 막지 않는 부가 기능"이라는 원래 의도와 달리 실제로는 계속 추천 실패의
    // 원인이 되어왔으므로, 점수 순위만으로 바로 추천을 완료한다.
    // 🛡️ 최소 점수(70점) 기준을 실제로 적용해봤더니 후보가 2개로 지나치게 줄어들어 되돌렸다 —
    // 점수 순 정렬만으로 상위 MAX_SCALPER_RECOMMENDATIONS(15)개를 채운다.
    // (2026-10-06) 이미 등록된 종목이 목록 자리를 다 차지하면 새로 채울 후보가 남지 않는다 —
    // 미등록 후보를 MAX개까지 확보하고, 등록 종목은 그 위에 얹어서(점수순 그대로) 돌려준다.
    const registeredForCut = new Set(scalperTabsRef.current.map(t => t.symbol));
    let freshCount = 0;
    return scoredCandidates
      .filter(item => registeredForCut.has(item.symbol) || ++freshCount <= MAX_SCALPER_RECOMMENDATIONS)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));
    })();

    recommendationSearchPromiseRef.current = searchPromise;

    try {
      return await searchPromise;
    } finally {
      recommendationSearchPromiseRef.current = null;
    }
  }, [detectStockStrategies, kisConfig.isConnected, calculateBuyScore]);

  const handleGetRecommendations = useCallback(async () => {
    setIsGettingRecommendations(true);
    let success = false;
    try {
      // 🛡️ 예전엔 여기서 kisService.getScalperRecommendations()(하드코딩된 오래된 가격 — SK하이닉스
      // 198,000원, 삼성전자 77,600원 등)를 앱 시작 시마다 직접 불러와서 aiRecommendations에
      // 채우고 있었다. 이건 지난번 "실시간 아니면 추천 없음" 원칙으로 정리했던 3순위 폴백과는
      // 별개의 경로였는데, 여전히 살아서 실사용 UI에 오래된 가격을 주입하고 있었다. 이제 동일하게
      // 실시간 데이터 기반의 loadScalperRecommendations를 쓰도록 교체한다.
      const list = await loadScalperRecommendations();
      if (list && list.length > 0) {
        setScalperRecommendations(list);
        setAiRecommendations(list.map(item => ({
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          change: item.change,
          changePercent: item.changePercent,
          volume: item.volume,
          history: Array.from({ length: 40 }, (_, i) => ({ time: `${i}:00`, price: item.price * (0.98 + (i % 5) * 0.008) })),
          isAI: true,
          market: 'KR'
        })));
        success = true;
      }
    } catch (error: any) {
      console.warn("Failed to get recommendations:", error);
    } finally {
      setIsGettingRecommendations(false);
    }
    return success;
  }, [loadScalperRecommendations]);

  const handleOpenScalperRecommendations = useCallback(async () => {
    setShowScalperRecModal(true);
    setIsScalperRecLoading(true);
    setIsRefreshingTop3(true);
    try {
     const list =
  await loadScalperRecommendations();
      if (list && list.length > 0) {
        // Sync any recommendation item with real-time execution price (현재 체결가) from the current stock list
        const syncedList = list.map(rec => {
          const live = stocks.find(s => s.symbol === rec.symbol);
          if (live && live.price > 0) {
            const livePrice = live.price;
            const change = live.change !== undefined ? live.change : rec.change;
            const changePercent = live.changePercent !== undefined ? live.changePercent : rec.changePercent;
            const volume = live.volume || rec.volume;
            const targetPrice = priceAtNetPct(livePrice, rec.targetNetPct ?? scalpingTargetProfit);
            const stopLoss = priceAtNetPct(livePrice, rec.stopNetPct ?? scalpingStopLoss);
            const expectedReturn = rec.targetNetPct ?? rec.expectedReturn;
            return { ...rec, name: live.name || rec.name, price: livePrice, change, changePercent, volume, targetPrice, stopLoss, expectedReturn };
          }
          return rec;
        });

        setScalperRecommendations(syncedList);
        setAiRecommendations(syncedList.map(item => ({
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          change: item.change,
          changePercent: item.changePercent,
          volume: item.volume,
          history: Array.from({ length: 40 }, (_, i) => ({ time: `${i}:00`, price: item.price * (0.98 + (i % 5) * 0.008) })),
          isAI: true,
          market: 'KR'
        })));
        showNotification(`[스캘퍼 최적 종목 ${MAX_SCALPER_RECOMMENDATIONS}선 포착] 실시간 거래량 및 체결강도 기반 추천 목록이 로드되었습니다.`, "success");
      }
    } catch (err: any) {
      console.error("Failed to load scalper recommendations:", err);
      showNotification("추천 종목을 불러오는 중 오류가 발생했습니다.", "error");
    } finally {
      setIsScalperRecLoading(false);
      setIsRefreshingTop3(false);
    }
  }, [loadScalperRecommendations, stocks, showNotification]);

  const handleRefreshScalperRecList = useCallback(async () => {
    setIsScalperRecLoading(true);
    try {
      const list =
  await loadScalperRecommendations();
      if (list && list.length > 0) {
        // Sync any recommendation item with real-time execution price (현재 체결가) from the current stock list
        const syncedList = list.map(rec => {
          const live = stocks.find(s => s.symbol === rec.symbol);
          if (live && live.price > 0) {
            const livePrice = live.price;
            const change = live.change !== undefined ? live.change : rec.change;
            const changePercent = live.changePercent !== undefined ? live.changePercent : rec.changePercent;
            const volume = live.volume || rec.volume;
            const targetPrice = priceAtNetPct(livePrice, rec.targetNetPct ?? scalpingTargetProfit);
            const stopLoss = priceAtNetPct(livePrice, rec.stopNetPct ?? scalpingStopLoss);
            const expectedReturn = rec.targetNetPct ?? rec.expectedReturn;
            return { ...rec, name: live.name || rec.name, price: livePrice, change, changePercent, volume, targetPrice, stopLoss, expectedReturn };
          }
          return rec;
        });

        setScalperRecommendations(syncedList);
        setAiRecommendations(syncedList.map(item => ({
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          change: item.change,
          changePercent: item.changePercent,
          volume: item.volume,
          history: Array.from({ length: 40 }, (_, i) => ({ time: `${i}:00`, price: item.price * (0.98 + (i % 5) * 0.008) })),
          isAI: true,
          market: 'KR'
        })));
        showNotification("[스캘퍼 딥리서치 완료] 최신 거래량 및 체결강도로 추천 종목이 갱신되었습니다.", "success");
      }
    } catch (err) {
      console.error("Failed to refresh recommendations:", err);
    } finally {
      setIsScalperRecLoading(false);
    }
  }, [loadScalperRecommendations, stocks, showNotification]);

  const handleSelectRecommendationStock = useCallback((rec: ScalperRecommendation) => {
    try {
      if (!rec || !rec.symbol) {
        console.error('[스캘퍼 등록 실패] 유효하지 않은 추천종목 데이터:', rec);
        showNotification('[스캘퍼 등록 실패] 추천종목 데이터가 올바르지 않습니다.', 'error');
        return;
      }

      // If the stock is already in stocks state, use its real-time execution price (현재 체결가)
      const existingStock = stocks.find(s => s.symbol === rec.symbol);
      const resolvedPrice = (existingStock && existingStock.price > 0) ? existingStock.price : (rec.price > 0 ? rec.price : 1000);
      const resolvedChange = (existingStock && existingStock.change !== undefined) ? existingStock.change : rec.change;
      const resolvedChangePercent = (existingStock && existingStock.changePercent !== undefined) ? existingStock.changePercent : rec.changePercent;
      const resolvedVolume = (existingStock && existingStock.volume) ? existingStock.volume : rec.volume;

      // 🛡️ 추천 데이터의 이름이 비어있거나 종목코드와 똑같으면(이름 해석 실패) 한 번 더 보정 시도.
      // 이걸 안 하면 386380처럼 "종목명" 자리에 종목코드가 그대로 나오는 문제가 생긴다.
      const resolvedName = (rec.name && rec.name.trim().length > 0 && rec.name !== rec.symbol)
        ? rec.name
        : getResolvedStockName(rec.symbol);

      setStocks(prev => {
        if (!prev.some(s => s.symbol === rec.symbol)) {
          return [...prev, {
            symbol: rec.symbol,
            name: resolvedName,
            price: resolvedPrice,
            change: resolvedChange,
            changePercent: resolvedChangePercent,
            volume: resolvedVolume,
            history: Array.from({ length: 40 }, (_, i) => ({ time: `${i}:00`, price: resolvedPrice * (0.98 + (i % 5) * 0.008) })),
            isAI: true,
            market: 'KR'
          }];
        }
        return prev.map(s => s.symbol === rec.symbol ? {
          ...s,
          price: resolvedPrice,
          change: resolvedChange,
          changePercent: resolvedChangePercent,
          volume: resolvedVolume || s.volume
        } : s);
      });

      openOrSwitchScalperTab(rec.symbol, resolvedName, resolvedPrice, rec);
      // 🛡️ 수량은 등록 시점에 계산하지 않는다 — 실제 매수 시그널이 발생하는 순간의 최신 가격
      // 기준으로 계산되어야 하므로, 등록만으로는 tradeQuantity를 정하지 않는다(기본값 0 유지).
      showNotification(`[스캘퍼 타겟 등록] ${resolvedName}(${rec.symbol}) 종목이 스캘퍼 탭으로 등록 및 선택되었습니다. (현재 체결가 ${resolvedPrice.toLocaleString()}원, 추천가 ${rec.recommendedPrice.toLocaleString()}원, 스캘핑 점수 ${rec.scalpingScore}점)`, "success");
      // 🛡️ 등록해도 모달을 닫지 않는다 — 여러 종목을 연속으로 등록할 수 있게, 닫는 건 사용자가
      // 직접 닫기 버튼을 눌렀을 때만 하도록 한다.

      // 🔄 인위적 반복 패턴(가짜 이력) 대신 실제 분봉 이력으로 보정 — RSI/이동평균 등 전략센서가
      // 실제 추세를 반영하도록 한다 (그대로 두면 RSI가 항상 50 근처로 계산되어 신호가 안 뜬다)
      seedRealHistory(rec.symbol).then(realHistory => {
        if (realHistory && realHistory.length > 0) {
          setStocks(prev => prev.map(s => s.symbol === rec.symbol ? { ...s, history: realHistory } : s));
        }
      }).catch(() => {});
    } catch (err: any) {
      console.error('[스캘퍼 등록 실패] 예외 발생:', err);
      showNotification(`[스캘퍼 등록 실패] ${err?.message || '알 수 없는 오류가 발생했습니다.'}`, 'error');
    }
  }, [stocks, openOrSwitchScalperTab, showNotification, calcQuantityForTargetAmount]);

  const handleBatchRegisterTop3 = useCallback((top3List: ScalperRecommendation[]) => {
    try {
    top3List.forEach(rec => {
      const existingStock = stocks.find(s => s.symbol === rec.symbol);
      const livePrice = (existingStock && existingStock.price > 0) ? existingStock.price : rec.price;
      const liveChange = (existingStock && existingStock.change !== undefined) ? existingStock.change : rec.change;
      const liveChangePercent = (existingStock && existingStock.changePercent !== undefined) ? existingStock.changePercent : rec.changePercent;

      setStocks(prev => {
        if (!prev.some(s => s.symbol === rec.symbol)) {
          return [...prev, {
            symbol: rec.symbol,
            name: rec.name,
            price: livePrice,
            change: liveChange,
            changePercent: liveChangePercent,
            volume: rec.volume,
            history: [],
            isAI: true,
            market: 'KR'
          }];
        }
        return prev.map(s => s.symbol === rec.symbol ? {
          ...s,
          price: livePrice,
          change: liveChange,
          changePercent: liveChangePercent,
          volume: rec.volume || s.volume
        } : s);
      });
      openOrSwitchScalperTab(rec.symbol, rec.name, livePrice, rec);
    });
    if (top3List.length > 0) {
      showNotification(`[스캘퍼 TOP 3 일괄 등록] ${top3List.map(s => {
        const live = stocks.find(x => x.symbol === s.symbol);
        const p = live && live.price > 0 ? live.price : s.price;
        return `${s.name}(${p.toLocaleString()}원)`;
      }).join(', ')} 종목이 스캘퍼 탭에 등록되었습니다.`, "success");
    }
    setShowScalperRecModal(false);
    } catch (err: any) {
      console.error('[TOP3 일괄 등록 실패] 예외 발생:', err);
      showNotification(`[TOP3 일괄 등록 실패] ${err?.message || '알 수 없는 오류가 발생했습니다.'}`, 'error');
    }
  }, [stocks, openOrSwitchScalperTab, showNotification]);


  // Trigger AI market analysis on mount and when market switch
  useEffect(() => {
    handleGetRecommendations();
  }, [handleGetRecommendations]);


  const handleAddStock = async (customSymbol?: string, recommendedStock?: Stock | ScalperRecommendation, customName?: string) => {
    let symbolToUse = customSymbol || searchSymbol.trim().toUpperCase();
    let resolvedName = customName;

    // If user typed into input and pressed Enter without selecting from dropdown, resolve from suggestions/popular stocks
    if (!customSymbol && searchSymbol.trim()) {
      const trimmedLower = searchSymbol.trim().toLowerCase();
      const matched = searchSuggestions.find(s => 
        s.symbol.toLowerCase() === trimmedLower || 
        s.name.toLowerCase() === trimmedLower || 
        s.name.toLowerCase().includes(trimmedLower) ||
        s.symbol.toLowerCase().startsWith(trimmedLower)
      ) || POPULAR_STOCKS.find(s => 
        (s.market === marketType) && (
          s.symbol.toLowerCase() === trimmedLower || 
          s.name.toLowerCase() === trimmedLower || 
          s.name.toLowerCase().includes(trimmedLower)
        )
      );

      if (matched) {
        symbolToUse = matched.symbol.toUpperCase();
        resolvedName = resolvedName || matched.name;
      }
    }

    if (!symbolToUse && !recommendedStock) return;
    
    setShowSuggestions(false);
    setSearchSymbol("");
    setSearchSuggestions([]);
    
    if (recommendedStock) {

  let livePrice =
    recommendedStock.price || 0;

  let liveChange =
    recommendedStock.change || 0;

  let liveChangePercent =
    recommendedStock.changePercent || 0;

  let liveName =
    recommendedStock.name ||
    resolvedName ||
    symbolToUse;

  // 🚀 KIS 시세 재조회를 기다리지 않고 지금 가진 값(추천/검색 데이터)으로 즉시 등록한다.
  // getPrice()는 다른 폴링 요청들과 같은 대기열을 공유해서, 여기서 await하면
  // 인벤토리 반영이 몇 초씩 늦어지는 원인이 된다 — 최신 시세는 등록 후 비동기로 보정한다.

  // 🛡️ 매우 중요한 수정: 예전엔 검색결과의 price(livePrice)를 최우선으로 썼는데, 이 값이
  // KOSPI_STOCKS 같은 로컬 마스터 데이터의 "정적 기준가(basePrice)"일 수 있어서 실제 시세와
  // 다를 수 있었다. 특히 이미 인벤토리에 있어서 실시간으로 계속 갱신되고 있던 종목을 재검색해서
  // 클릭하면, 이미 갖고 있는 최신 실시간 값을 무시하고 이 오래된 정적 기준가로 순간적으로
  // 되돌아가서 — 가격이 잘못 표시되고, 그 잘못된 가격 기반으로 VWAP 등 센서가 짧게 가짜 신호를
  // 내다가 몇 초 후 실시간 동기화가 다시 정정하는 현상이 있었다. 이제 이미 추적 중인 실시간
  // 값이 있으면 그걸 최우선으로 쓴다.
  const trackedPrice = stocksRef.current.find(s => s.symbol === recommendedStock.symbol)?.price || 0;
  const safePrice =
  trackedPrice > 0
    ? trackedPrice
    : livePrice > 0
    ? livePrice
    : 0;

  // 🛡️ 가격 정보가 전혀 없어도(신규 종목, KOSPI 마스터 검색 결과 등) 등록 자체가 막혀서는 안 된다.
  // 이전에는 여기서 조용히 return해서 "클릭해도 인벤토리에 안 들어오는" 증상의 원인이 되었다.
  // 합리적인 임시 가격으로 즉시 등록하고, 실제 시세는 등록 직후 비동기로 보정한다.
  const finalPrice = safePrice > 0 ? safePrice : 1000;
  if (safePrice <= 0) {
    console.warn(`[가격 정보 없음 — 임시가로 등록 후 보정] ${recommendedStock.symbol}`);
  }

const newStock: Stock = {
  symbol: recommendedStock.symbol,
  name: liveName,
  price: finalPrice,

    change:
      liveChange,

    changePercent:
      liveChangePercent,

    volume:
      String(
        recommendedStock.volume ||
        '100K'
      ),

    history: Array.from(
      { length: 40 },
      (_, i) => ({
        time: `${i}:00`,
        price:
          livePrice *
          (
            0.98 +
            (i % 5) * 0.008
          )
      })
    ),

    market:
      recommendedStock.symbol.match(
        /^\d{6}$/
      )
        ? 'KR'
        : 'US',

    isAI:
      'isAI' in recommendedStock ? !!recommendedStock.isAI : false
  };

  console.log(
  '[ADD STOCK]',
  {
    symbol: newStock.symbol,
    name: newStock.name,
    price: newStock.price,
    change: newStock.change,
    changePercent: newStock.changePercent
  }
);

      setStocks(prev => {
        if (prev.some(s => s.symbol.toUpperCase() === newStock.symbol.toUpperCase())) {
          return prev.map(s => s.symbol.toUpperCase() === newStock.symbol.toUpperCase() ? { ...s, ...newStock } : s);
        }
        return [newStock, ...prev];
      });
      setStocksCache(prev => ({
        ...prev,
        [marketType]: [newStock, ...(prev[marketType] || []).filter(s => s.symbol.toUpperCase() !== newStock.symbol.toUpperCase())]
      }));
      openOrSwitchScalperTab(newStock.symbol, liveName, livePrice);
      setSelectedSymbol(newStock.symbol);
      setAiRecommendations(prev => prev.filter(r => r.symbol !== newStock.symbol));
      showNotification(`[스캘퍼 탭 등록] ${liveName}(${newStock.symbol}) 종목이 스캘퍼 탭으로 추가되었습니다.`, "success");

      // 등록은 이미 끝났으니, 최신 KIS 체결가는 백그라운드에서 보정한다 (등록 자체를 지연시키지 않음)
      kisService.getPrice(newStock.symbol).then(liveData => {
        if (liveData && liveData.current > 0) {
          setStocks(prev => prev.map(s => s.symbol === newStock.symbol ? {
            ...s,
            price: liveData.current,
            change: liveData.change || 0,
            changePercent: liveData.changePercent || 0,
            name: liveData.name || s.name
          } : s));
          // 🛡️ 매우 중요한 수정: 위 setStocks만으로는 인벤토리 카드에 실제로 표시되는 가격
          // (tab.price = item.market.currentPrice)이 갱신되지 않는다 — updateTab은 'price' 키를
          // 의도적으로 무시하도록 되어 있어서(파생 뷰 전용), stocks 배열만 고쳐서는 카드가 여전히
          // 등록 시점의 임시가(1000원)에 영원히 고정된 채로 남는다. scalperInventory를 직접 갱신해서
          // market.currentPrice까지 실제로 보정해야 카드에 반영된다.
          setScalperInventory(prev => prev.map(item => item.symbol === newStock.symbol ? {
            ...item,
            market: {
              ...item.market,
              currentPrice: liveData.current,
              change: liveData.change || 0,
              changePercent: liveData.changePercent || 0,
              priceStatus: 'LIVE' as const,
              lastUpdatedAt: Date.now(),
            }
          } : item));
        }
      }).catch(err => console.warn('[등록 후 시세 보정 실패]', err));

      // 🔄 등록 직후엔 실제 가격 변동을 반영하지 못하는 인위적 반복 패턴(가짜 이력)이 들어가 있다.
      // 이걸 그대로 두면 RSI/이동평균/VWAP 등 모든 전략센서가 실제 추세와 무관한 값을 계산하게 되어,
      // "신호감지가 전혀 안 뜨고 계속 분석 중"인 것처럼 보이는 원인이 된다. 실제 분봉 이력이 확보되는
      // 즉시 교체한다.
      seedRealHistory(newStock.symbol).then(realHistory => {
        if (realHistory && realHistory.length > 0) {
          setStocks(prev => prev.map(s => s.symbol === newStock.symbol ? { ...s, history: realHistory } : s));
        }
      }).catch(() => {});
      return;
    }

    if (stocks.some(s => s.symbol.toUpperCase() === symbolToUse.toUpperCase())) {
      const existingStock = stocks.find(
        s => s.symbol.toUpperCase() === symbolToUse.toUpperCase()
      );

      openOrSwitchScalperTab(
        symbolToUse,
        resolvedName || existingStock?.name || symbolToUse,
        existingStock?.price
      );

      setSelectedSymbol(symbolToUse);
      return;
    }

    if (kisConfig.isConnected) {
      setIsSearchingStock(true);
      setSearchError(null);
      try {
        const livePriceData = await kisService.getPrice(symbolToUse);
        if (livePriceData) {
          const liveName = livePriceData.name || customName || symbolToUse;
          const livePrice = livePriceData.current || 0;
          const liveChange = livePriceData.change || 0;
          const liveChangePercent = livePriceData.changePercent || 0;
          const newStock: Stock = {
            symbol: symbolToUse,
            name: liveName,
            price: livePrice,
            change: liveChange,
            changePercent: liveChangePercent,
            volume: String(livePriceData.volume || '100K'),
            history: Array.from({ length: 40 }, (_, i) => ({ 
              time: `${i}:00`, 
              price: livePrice * (0.98 + (i % 5) * 0.008) 
            })),
            market: /^\d{6}$/.test(symbolToUse) ? 'KR' : 'US',
            isAI: false
          };
          setStocks(prev => {
            if (prev.some(s => s.symbol === symbolToUse)) {
              return prev.map(s => s.symbol === symbolToUse ? newStock : s);
            }
            return [newStock, ...prev];
          });
          setStocksCache(prev => {
            const currentCache = prev[marketType];
            if (currentCache.some(s => s.symbol === symbolToUse)) {
              return {
                ...prev,
                [marketType]: currentCache.map(s => s.symbol === symbolToUse ? newStock : s)
              };
            }
            return {
              ...prev,
              [marketType]: [newStock, ...currentCache]
            };
          });
          openOrSwitchScalperTab(symbolToUse, liveName, newStock.price);
          setSearchSymbol("");
          addLog('SYSTEM', '매수', 0, 0, `[KIS 종목 추가] ${liveName}(${symbolToUse}) 종목이 실시간 연동 등록되었습니다 (현재가: ${formatCurrency(livePriceData.current)}).`);
          setIsSearchingStock(false);

          // 🔄 인위적 반복 패턴(가짜 이력) 대신 실제 분봉 이력으로 보정
          seedRealHistory(symbolToUse).then(realHistory => {
            if (realHistory && realHistory.length > 0) {
              setStocks(prev => prev.map(s => s.symbol === symbolToUse ? { ...s, history: realHistory } : s));
            }
          }).catch(() => {});
          return;
        }
      } catch (err: any) {
        console.warn("[KIS Search Fallback] Live fetch failed, falling back to Gemini:", err);
      }
      setIsSearchingStock(false);
    }

    if (customName) {
      const initialPrice = marketType === 'KR' ? 5000 : 100;
      const newStock: Stock = {
        symbol: symbolToUse,
        name: customName,
        price: initialPrice,
        change: 0,
        changePercent: 0,
        volume: '0',
        // 🛡️ 매우 중요한 수정: 예전엔 여기서 initialPrice * (0.98~1.02배) 랜덤 노이즈로 40개의
        // 가짜 파동 곡선을 만들었다 — 실제 KIS 데이터를 받기 전까지 화면에 "그럴듯해 보이는
        // 가짜 차트"가 떠 있었던 것이다. 이제 랜덤 노이즈 없이 전부 동일한 값(현재가 그대로)으로
        // 채워서, 최소한 "가짜인데 진짜처럼 보이는 변동"은 만들지 않는다. 그리고 아래에서
        // seedRealHistory로 실제 KIS 분봉 데이터를 받아와 즉시 이 임시값을 대체한다.
        history: Array.from({ length: 40 }, (_, i) => ({
          time: `${i}:00`,
          price: initialPrice
        })),
        market: marketType,
        isAI: false,
        isPlaceholderData: true // ⚠️ 실제 KIS 데이터로 보정되기 전까지의 임시값임을 명시
      };
      
      setStocks(prev => {
        if (prev.some(s => s.symbol === symbolToUse)) {
          return prev.map(s => s.symbol === symbolToUse ? newStock : s);
        }
        return [newStock, ...prev];
      });
      setStocksCache(prev => ({
        ...prev,
        [marketType]: [newStock, ...prev[marketType].filter(s => s.symbol !== symbolToUse)]
      }));
      openOrSwitchScalperTab(symbolToUse, customName, newStock.price);
      setSelectedSymbol(symbolToUse);

      // 🔄 인위적 반복 패턴(가짜 이력) 대신 실제 분봉 이력으로 보정 — 위(5538번 근처)의 KIS
      // 실시간 조회 성공 경로와 동일한 방식을 이 폴백 경로에도 적용한다.
      seedRealHistory(symbolToUse).then(realHistory => {
        if (realHistory && realHistory.length > 0) {
          setStocks(prev => prev.map(s => s.symbol === symbolToUse ? { ...s, history: realHistory, isPlaceholderData: false } : s));
        }
      }).catch(() => {});
      
      // 🔄 신규 종목의 실제 이름/가격은 AI에게 "추측"시키지 않고 KIS 실시세로 직접 보정한다.
      // (LLM은 실시간 시세에 접근할 수 없어 이 방식은 부정확했고, 불필요하게 느리고 비쌌다)
      setTimeout(async () => {
        try {
          const priceData = await kisService.getPrice(symbolToUse);
          if (priceData && priceData.current > 0) {
            setStocks(prev => prev.map(s => {
              if (s.symbol === symbolToUse) {
                return {
                  ...s,
                  name: priceData.name || s.name,
                  price: priceData.current,
                  change: priceData.change,
                  changePercent: priceData.changePercent,
                  volume: priceData.volume,
                  executionStrength: priceData.executionStrength,
                  isPlaceholderData: false // 실제 KIS 시세로 보정됨
                };
              }
              return s;
            }));
            // 🛡️ setStocks만으로는 인벤토리 카드 표시 가격(tab.price = item.market.currentPrice)이
            // 갱신되지 않는다 — updateTab은 'price' 키를 의도적으로 무시한다(파생 뷰 전용). 등록
            // 시점에 임시가로 들어간 종목이 실제 KIS 시세를 받고도 카드에는 영원히 임시가로 남는
            // 버그의 원인이었다.
            setScalperInventory(prev => prev.map(item => item.symbol === symbolToUse ? {
              ...item,
              market: {
                ...item.market,
                currentPrice: priceData.current,
                change: priceData.change || 0,
                changePercent: priceData.changePercent || 0,
                priceStatus: 'LIVE' as const,
                lastUpdatedAt: Date.now(),
              }
            } : item));
            addLog('SYSTEM', '매수', 0, 0, `[종목 정보 동기화] ${priceData.name || customName}(${symbolToUse})의 주가가 ${formatCurrency(priceData.current)}으로 업데이트되었습니다.`);
          }
        } catch (err) {
          console.error("Background price sync error:", err);
        }
      }, 0);
      return;
    }

    setIsSearchingStock(true);
    setSearchError(null);

    try {
      // 🔄 종목명/현재가를 AI에게 추측시키지 않고 실제 KIS 시세로 직접 조회한다.
      const priceData = await kisService.getPrice(symbolToUse);
      if (!priceData || priceData.current <= 0) throw new Error("종목을 찾을 수 없습니다");

      const newStock: Stock = {
        symbol: symbolToUse,
        name: priceData.name || symbolToUse,
        price: priceData.current,
        change: priceData.change,
        changePercent: priceData.changePercent,
        volume: priceData.volume,
        executionStrength: priceData.executionStrength,
        history: Array.from({ length: 40 }, (_, i) => ({
          time: `${i}:00`,
          price: priceData.current
        })),
        market: marketType,
        isAI: false
      };

      setStocks(prev => [newStock, ...prev]);
      openOrSwitchScalperTab(
symbolToUse,
newStock.name,
priceData.current
);
      setSelectedSymbol(symbolToUse);
      setSearchSymbol("");
      addLog('SYSTEM', '매수', 0, 0, `[종목 추가] ${newStock.name}(${symbolToUse}) 종목이 분석 리스트에 추가되었습니다.`);
      // 실제 분봉 이력으로 즉시 보정 (합성 seed 대신)
      seedRealHistory(symbolToUse).then(realHistory => {
        if (realHistory && realHistory.length > 0) {
          setStocks(prev => prev.map(s => s.symbol === symbolToUse ? { ...s, history: realHistory } : s));
        }
      });
    } catch (err: any) {
      console.error("Search error:", err);
      const errorMsg = err.message || "종목을 찾을 수 없습니다.";
      setSearchError(errorMsg);
      showNotification(errorMsg, "error");
    } finally {
      setIsSearchingStock(false);
    }
  };


  // Real-time Search Suggestions
  // 🛡️ (2026-09-29) 스캘핑 중 검색 목록 떨림 수정 — 예전엔 이 effect가 scalperTabs 전체에 의존해서, 스캘핑 중
  // 시세·센서가 바뀔 때마다(초당 여러 번) 재실행됐다. 그때마다 목록을 로컬 결과로 덮어썼다가 50ms 뒤 서버 검색
  // 결과를 다시 붙이는 걸 반복해 종목명이 나왔다 사라졌다 했고, 서버 검색(/api/stocks/search)도 초당 여러 번 호출됐다.
  // 이제 "등록 종목 목록(코드·이름)"이 실제로 바뀔 때만 재실행하고, 늦게 도착한 옛 검색어 결과는 버린다.
  const registeredTabsKey = scalperTabs.map(t => `${t.symbol}:${t.name}`).join('|');
  const scalperTabsForSearchRef = React.useRef(scalperTabs);
  scalperTabsForSearchRef.current = scalperTabs;
  useEffect(() => {
    const scalperTabs = scalperTabsForSearchRef.current;
    const term = searchSymbol.trim();

    if (!term || term.length < 1) {
      // 입력이 없으면: 최근 등록된 종목(스캘퍼 인벤토리, 최신순) + 전체 KOSPI 마스터 목록을 보여준다.
      // (추천종목 목업 데이터와는 완전히 분리된, 별도의 KOSPI 마스터 데이터 사용)
      const registeredSymbols = new Set(scalperTabs.filter(t => !/^[A-Za-z]/.test(t.symbol)).map(t => t.symbol));
      const recent: StockSuggestion[] = scalperTabs
        .filter(t => !/^[A-Za-z]/.test(t.symbol)) // KR 종목만
        .map(t => ({ symbol: t.symbol, name: t.name, market: 'KR' as const, marketType: 'KOSPI' as const, price: t.price }));

      const fullList: StockSuggestion[] = KOSPI_STOCKS
        .filter(s => !registeredSymbols.has(s.symbol))
        .map(s => ({ symbol: s.symbol, name: s.name, market: 'KR' as const, marketType: s.market, sector: s.sector, price: s.basePrice || 0 }));

      setSearchSuggestions([...recent, ...fullList]);
      setShowSuggestions(false);
      return;
    }

    const lowerTerm = term.toLowerCase();

    // 1. 로컬 KOSPI/KOSDAQ 마스터 데이터에서 즉시 검색 (네트워크 대기 없이 즉시 표시, 코스피 우선순위 스코어링 적용)
    const masterMatches = searchKrMasterStocks(term, 30)
      .filter(s => marketType === 'KR') // 검색 인풋은 KR 마켓 탭에서만 마스터 데이터 검색 (US는 기존 방식 유지)
      .map(s => ({ symbol: s.symbol, name: s.name, market: 'KR' as const, marketType: s.market, sector: s.sector, price: s.basePrice || 0 }));

    // 2. 혹시 마스터 데이터에 없는 경우를 대비해 기존 POPULAR_STOCKS 로컬 필터도 함께 병합 (중복 제거)
    const popularMatches = POPULAR_STOCKS.filter(s =>
      (s.market === marketType) &&
      (s.name.toLowerCase().includes(lowerTerm) || s.symbol.toLowerCase().includes(lowerTerm)) &&
      !masterMatches.some(m => m.symbol === s.symbol)
    );

    const localFiltered = [...masterMatches, ...popularMatches].slice(0, 30);
    setSearchSuggestions(localFiltered);
    setShowSuggestions(localFiltered.length > 0);

    // 3. Fetch comprehensive search results from our backend in real-time (실시간 시세/최신 상장 종목 등 마스터 데이터에 없는 것까지 보강)
    let isStale = false; // 검색어가 바뀐 뒤 도착한 옛 응답은 반영하지 않는다
    const delayDebounceFn = setTimeout(async () => {
      try {
        const response = await axios.get('/api/stocks/search', {
          params: { keyword: term, marketType: marketType }
        });
        if (isStale) return;
        
        if (response.data && Array.isArray(response.data)) {
          setSearchSuggestions(prev => {
            const merged = [...prev];
            response.data.forEach((item: StockSuggestion) => {
              // Filter out stocks with 0 price if price is provided
              if (item.price !== undefined && item.price <= 0) return;
              // 현재 마켓(KR/US)과 다른 종목은 절대 섞여 들어오지 않도록 명시적으로 걸러낸다.
              // marketType 파라미터를 백엔드에 보내긴 하지만, 응답 자체를 신뢰하지 않고 여기서도 재검증한다.
              if (item.market !== marketType) return;

              if (!merged.some(m => m.symbol.toLowerCase() === item.symbol.toLowerCase() && m.market === item.market)) {
                merged.push(item);
              }
            });
            return merged.slice(0, 30);
          });
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error("Failed to fetch remote stock suggestions:", err);
      }
    }, 250); // 타이핑이 잠깐 멈춘 뒤에만 서버 검색 (로컬 검색 결과는 위에서 즉시 표시됨)

    // Dynamic offset calculation
    if (textMeasurerRef.current) {
      // Input padding (pl-10 = 40px) + text width
      setSearchCursorOffset(Math.min(textMeasurerRef.current.offsetWidth + 40, 300));
    }

    return () => { isStale = true; clearTimeout(delayDebounceFn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchSymbol, marketType, registeredTabsKey]);

  // Handle click outside search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateKisBuyableQty = useCallback(async (overrideBalance?: number) => {
    if (!kisConfig.isConnected || !selectedStock) {
      setKisBuyableQty(null);
      return;
    }
    const currentSeq = ++buyableReqSeqRef.current;
    const targetSymbol = selectedStock.symbol;
    const isKR = /^\d{6}$/.test(targetSymbol);
    const stockPrice = selectedStock.price;
    const availableCash = overrideBalance !== undefined 
      ? overrideBalance 
      : (isKR ? (orderableKrw > 0 ? orderableKrw : balance) : (orderableUsd > 0 ? orderableUsd * exchangeRate : balance));

    try {
      if (isKR) {
        const ordDvsn = kisConfig.domesticOrderType || '00';
        const queryPrice = ordDvsn === '00' ? (stockPrice || 0).toString() : '0';

        const res = await kisService.getDomesticBuyableAmount(
          targetSymbol,
          queryPrice,
          ordDvsn
        );

        if (buyableReqSeqRef.current !== currentSeq) return;

        if (res && res.rt_cd === '0' && res.output) {
          const rawCash = res.output.ord_psbl_cash ?? res.output.ord_psbl_amt ?? res.output.nrcy_ord_psbl_amt;
          if (rawCash !== undefined && rawCash !== null && rawCash !== '') {
            const cashVal = Number(rawCash);
            if (!isNaN(cashVal) && cashVal > 0) {
              setOrderableKrw(prev => prev === cashVal ? prev : cashVal);
            }
          }

          const candidateQtys = [
            res.output.nrcy_buy_qty,
            res.output.nrcy_ord_psbl_qty,
            res.output.ord_psbl_qty,
            res.output.psbl_qty,
            res.output.max_ord_qty,
            res.output.tot_ord_psbl_qty,
            res.output.max_buy_qty,
            res.output.max_ord_psbl_qty
          ].map(v => (v !== undefined && v !== null && v !== '') ? parseInt(String(v), 10) : 0)
           .filter(v => !isNaN(v) && v >= 0);

          let qty = candidateQtys.length > 0 ? Math.max(...candidateQtys) : 0;
          // 🛡️ (2026-09-29 과제2) 화면의 "매수 가능 수량"도 미수 없는 수량(nrcvb_buy_qty)을 우선 표시한다 —
          // 위 후보 중 실제 존재하는 필드는 max_buy_qty(미수 포함)뿐이라 최댓값을 쓰면 미수 포함 수량이 표시됐다.
          {
            const rawNrcvb = (res.output as any).nrcvb_buy_qty;
            const q = parseInt(String(rawNrcvb ?? ''), 10);
            if (!isNaN(q)) qty = Math.max(0, q);
          }

          const psblCash = (rawCash !== undefined && rawCash !== null && rawCash !== '') ? Number(rawCash) : availableCash;
          if (qty <= 0 && psblCash > 0 && stockPrice > 0) {
            qty = Math.floor(psblCash / stockPrice);
          }

          setKisBuyableQty(qty);
          return;
        }
      } else {
        // Overseas (US)
        const res = await kisService.getOverseasBuyableAmount(
          targetSymbol,
          (stockPrice || 0).toString()
        );

        if (buyableReqSeqRef.current !== currentSeq) return;

        if (res && res.rt_cd === '0' && res.output) {
          let rawUsd = Number(
            res.output.frcr_ord_psbl_amt1 || 
            res.output.ord_psbl_frcr_amt || 
            res.output.frcr_ord_psbl_amt || 
            res.output.ovrs_ord_psbl_amt || 
            0
          );
          // If returned in KRW from KIS integrated margin response (>10000), convert to USD
          if (rawUsd > 10000 && exchangeRate > 0) {
            rawUsd = Number((rawUsd / exchangeRate).toFixed(2));
          }
          if (!isNaN(rawUsd) && rawUsd > 0) {
            setOrderableUsd(prev => prev === rawUsd ? prev : rawUsd);
          }

          const candidateQtys = [
            res.output.nrcy_buy_qty,
            res.output.ord_psbl_qty,
            res.output.max_buy_qty,
            res.output.max_ord_qty
          ].map(v => (v !== undefined && v !== null && v !== '') ? parseInt(String(v), 10) : 0)
           .filter(v => !isNaN(v) && v >= 0);

          let qty = candidateQtys.length > 0 ? Math.max(...candidateQtys) : 0;

          const usableUsd = rawUsd > 0 ? rawUsd * exchangeRate : availableCash;
          if (qty <= 0 && usableUsd > 0 && stockPrice > 0) {
            qty = Math.floor(usableUsd / (stockPrice * exchangeRate));
          }

          setKisBuyableQty(qty);
          return;
        }
      }

      if (buyableReqSeqRef.current !== currentSeq) return;
      if (availableCash > 0 && stockPrice > 0) {
        const priceInBalanceCurrency = isKR ? stockPrice : stockPrice * exchangeRate;
        setKisBuyableQty(Math.max(0, Math.floor(availableCash / priceInBalanceCurrency)));
      } else {
        setKisBuyableQty(0);
      }
    } catch (err) {
      if (buyableReqSeqRef.current !== currentSeq) return;
      console.warn("Failed to update KIS buyable quantity:", err);
      if (availableCash > 0 && stockPrice > 0) {
        const priceInBalanceCurrency = isKR ? stockPrice : stockPrice * exchangeRate;
        setKisBuyableQty(Math.floor(availableCash / priceInBalanceCurrency));
      } else {
        setKisBuyableQty(null);
      }
    }
  }, [kisConfig.isConnected, kisConfig.domesticOrderType, selectedStock?.symbol, balance, orderableKrw, orderableUsd, exchangeRate]);

  useEffect(() => {
    updateKisBuyableQty();
  }, [selectedSymbol, kisConfig.isConnected, kisConfig.domesticOrderType, updateKisBuyableQty]);

  // ============================================================
  // 🔄 종목 "선택"과 "데이터 갱신"의 완전한 분리
  // ------------------------------------------------------------
  // 인벤토리에서 종목을 클릭하는 것은 selectedSymbol을 바꾸는 행위일 뿐,
  // 그 종목 객체에 저장돼 있던(어쩌면 오래된) market/account 값을 그대로
  // 화면에 노출해서는 안 된다. 선택되는 즉시, 그리고 선택되어 있는 동안
  // 2초 주기로 이 함수가 해당 심볼의 데이터를 능동적으로 다시 가져온다.
  // ============================================================
  // ============================================================
  // 🔄 전략 센서용 실제 이력(history) 시딩
  // ------------------------------------------------------------
  // detectStockStrategies()가 계산하는 RSI/SMA/볼린저밴드/VWAP/CVD는 전부 Stock.history에서 나온다.
  // 신규 등록 직후에는 history가 합성(가짜) 데이터로 채워져 있어서(가격이 거의 일정하거나 임의 공식으로
  // 생성됨), 등록 초기 몇 분간 센서가 실제 시장과 무관한 값을 낼 수 있다. KIS 국내 분봉 조회 API로
  // 즉시 실제 이력을 받아와 교체함으로써 이 문제를 없앤다.
  // ============================================================
  const seedRealHistory = React.useCallback(async (symbol: string): Promise<{ time: string; price: number }[] | null> => {
    if (!kisConfig.isConnected || /^[A-Za-z]/.test(symbol)) return null; // 분봉 API는 국내 종목만 지원
    try {
      const res = await kisService.getDomesticMinuteChart(symbol);
      if (res && Array.isArray(res.output2) && res.output2.length > 0) {
        // KIS는 보통 최신 → 과거 순으로 내려주므로 시간순(과거 → 최신)으로 뒤집는다
        const bars = [...res.output2].reverse()
          .map((b: any) => ({
            time: String(b.stck_cntg_hour || b.stck_cntg_time || ''),
            price: Number(b.stck_prpr || b.stck_prc || 0)
          }))
          .filter(b => b.price > 0);
        // RSI(14)·SMA20·볼린저(20) 계산이 전부 의미를 가지려면 최소 21개는 있어야 한다.
        // (5개처럼 너무 낮은 기준은 "성공"으로 처리되어도 실제로는 대부분의 전략센서가
        // 계산 불가/무의미한 값(RSI=50 fallback 등)으로 빠지는 원인이었다)
        if (bars.length >= 21) return bars.slice(-40);
      }
    } catch (err) {
      console.warn(`[실제 이력 시딩 실패] ${symbol}`, err);
    }
    return null;
  }, [kisConfig.isConnected]);


  // 🛡️ 선택 종목 전용 2초 갱신 effect를 제거했다 — 이제 웹소켓(전체 종목 실시간)과 REST
  // 라운드로빈(1초 1종목, syncInventoryPriceRoundRobin)이 등록된 전체 종목을 균등하게
  // 커버하므로, 선택된 종목만 추가로 2초마다 더 자주 갱신할 이유가 없다. 오히려 이 특별


  const handleSyncKISRef = React.useRef<() => Promise<any>>(async () => {});
  const handleSyncKIS = async () => {
    if (syncInProgressRef.current) {
      return;
    }

    if (!kisConfig.isConnected) {
      showNotification("KIS 실계좌가 연결되어 있지 않습니다. [KIS 연동 설정]에서 API 키와 계좌를 연결해주세요.", "info");
      setShowKisModal(true);
      return;
    }

    // Check for password
    const activeConfig = getActiveKisConfig(kisConfig);
    if (!activeConfig.accountPw) {
      setBotStatus("연동 실패: 계좌 비밀번호가 필요합니다.");
      showNotification("계좌 비밀번호(4자리)가 입력되지 않았습니다. [설정 > KIS 연동]에서 비밀번호를 입력해주세요.", "error");
      setShowKisModal(true);
      return;
    }

    try {
      syncInProgressRef.current = true;
      setIsSyncingKIS(true);
      setBotStatus("실거래 계좌 동기화 중...");
      
      const newHoldings: Record<string, number> = {};
      const newAvgPrices: Record<string, number> = {};
      const newStockNames: Record<string, string> = {};
      let totalConvertedBalance = 0;
      let totalConvertedPrincipal = 0;
      let domesticSuccess = false;
      let overseasSuccess = false;
      let domesticError = null;
      let foundAnyData = false;

      // Domestic Stock Sync (TTTC8434R / VTTC8434R)
      try {
        const domesticBalanceData = await kisService.getDomesticBalance();
        let totalStockPurchaseCost = 0;

        if (domesticBalanceData?.rt_cd === '0') {
          foundAnyData = true;
          domesticSuccess = true;
          const newSellable: Record<string, number> = {};
          if (domesticBalanceData.output1 && Array.isArray(domesticBalanceData.output1)) {
            for (const item of domesticBalanceData.output1) {
              if (item.pdno && item.pdno !== '000000') {
                const qty = Number(item.hldg_qty || item.hldg_qty_2 || 0);
                const avgP = Number(item.pchs_avg_pric || item.pchs_unpr || item.pchs_avg_price || (item.pchs_amt && qty ? item.pchs_amt / qty : 0) || 0);
                const name = item.prdt_name;
                if (qty > 0 && !isNaN(qty)) {
                  newHoldings[item.pdno] = qty;
                  if (avgP > 0) newAvgPrices[item.pdno] = avgP;
                  if (name) newStockNames[item.pdno] = name;
                  
                  totalStockPurchaseCost += (qty * (avgP > 0 ? avgP : 0));

                  const sellableQty = Number(item.ord_psbl_qty || item.nrc_psbl_qty || item.hldg_qty || qty);
                  newSellable[item.pdno] = sellableQty;
                }
              }
            }
          }
          if (marketType === 'KR') setSellableHoldings(prev => ({ ...prev, ...newSellable }));
        }

        if (domesticBalanceData?.rt_cd === '0' && domesticBalanceData.output2) {
          foundAnyData = true;
          domesticSuccess = true;
          const out2 = Array.isArray(domesticBalanceData.output2) ? (domesticBalanceData.output2[0] || {}) : domesticBalanceData.output2;
          // 🔍 총자산(tot_evlu_amt 등) 관련 필드의 정확한 이름을 확인하기 위한 1회성 진단 로그 —
          // 현재는 balance + holdings×현재가로 로컬 재계산하고 있는데, KIS가 직접 계산해서 주는
          // 총자산 값을 그대로 쓰는 게 더 정확할 수 있다. 이 로그로 실제 필드명을 확인한다.
          // 🔍 실사용 로그로 확인된 필드명: tot_evlu_amt(총평가금액) = 예수금 + 보유종목 평가금액.
          // 이 값이 있으면 로컬 재계산(balance + holdings×현재가) 대신 이 값을 총자산으로 신뢰한다.
          const kisTotalAsset = Number(out2.tot_evlu_amt || 0);
          if (kisTotalAsset > 0) setKisTotalAssetValue(kisTotalAsset);
          // 🔍 dncl_amt 계열 필드명이 KIS 공식 문서 기준과 정확히 일치하는지 확신할 수 없어서,
          // 더 널리 문서화된 필드명(dnca_tot_amt=예수금총금액, prvs_rcdl_excc_amt=가수도정산금액)도
          // 후보로 추가한다 — 실제 어떤 필드가 맞는지는 아래 진단 툴팁으로 직접 확인 가능하다.
          const dnclAmt = Number(out2.dnca_tot_amt || out2.prvs_rcdl_excc_amt || out2.dncl_amt || out2.d2_dncl_amt || out2.prsm_dncl_amt || out2.cma_evlu_amt || 0);
          let ordPsblCash = Number(out2.ord_psbl_cash || out2.nrcy_ord_psbl_amt || out2.ord_psbl_amt || 0);
          const domesticPurchase = Number(out2.pchs_amt_smtl_amt || 0);
          const actualPurchaseCost = Math.max(domesticPurchase, totalStockPurchaseCost);

          // Direct inquiry to KIS TTTC8908R for exact real-time orderable cash (ord_psbl_cash)
          let symForQuery = (selectedStock?.market === 'KR' && selectedStock.symbol) 
            ? selectedStock.symbol 
            : (Object.keys(newHoldings)[0] || '005930');
          let debugFields = { ord_psbl_cash: 0, nrcy_ord_psbl_amt: 0, ord_psbl_amt: 0 };
          try {
            const cashInquiry = await kisService.getDomesticOrderableCash(symForQuery);
            if (cashInquiry) {
              debugFields = {
                ord_psbl_cash: cashInquiry.ord_psbl_cash || 0,
                nrcy_ord_psbl_amt: cashInquiry.nrcy_ord_psbl_amt || 0,
                ord_psbl_amt: cashInquiry.ord_psbl_amt || 0
              };
            }
            if (cashInquiry && cashInquiry.rt_cd === '0' && cashInquiry.orderableKrw > 0) {
              ordPsblCash = cashInquiry.orderableKrw;
            }
          } catch (inqErr) {
            console.warn("Direct orderable cash inquiry skip:", inqErr);
          }

          // Exact orderable cash prioritized: ord_psbl_cash > nrcy_ord_psbl_amt > dnclAmt
          // 🔄 예수금(dncl_amt) 우선 — "매수가능금액" 계산값(ord_psbl_cash)이 특정 종목 기준으로
          // 계산되어 실제 예수금과 다르게 나오는 문제가 있어서, 이제는 계좌 예수금을 그대로 보여준다.
          const domesticCash = dnclAmt > 0 ? dnclAmt : (ordPsblCash > 0 ? ordPsblCash : (Number(out2.nass_amt || 0) > actualPurchaseCost ? Number(out2.nass_amt) - actualPurchaseCost : 0));
          if (domesticCash > 0) {
            setOrderableKrw(domesticCash);
          }
          // 🔍 어느 필드가 최종값을 결정했는지 함께 저장 — 화면에서 KIS 앱과 직접 비교 가능하도록
          setOrderableKrwDebug({
            ord_psbl_cash: debugFields.ord_psbl_cash,
            nrcy_ord_psbl_amt: debugFields.nrcy_ord_psbl_amt,
            ord_psbl_amt: debugFields.ord_psbl_amt,
            dncl_amt: Number(out2.dncl_amt || 0),
            dnca_tot_amt: Number(out2.dnca_tot_amt || 0),
            prvs_rcdl_excc_amt: Number(out2.prvs_rcdl_excc_amt || 0),
            queriedSymbol: symForQuery,
            usedField: dnclAmt > 0 ? 'dncl_amt 계열 (예수금, 잔고조회)'
              : debugFields.ord_psbl_cash > 0 ? 'ord_psbl_cash (TTTC8908R)'
              : debugFields.nrcy_ord_psbl_amt > 0 ? 'nrcy_ord_psbl_amt (TTTC8908R)'
              : debugFields.ord_psbl_amt > 0 ? 'ord_psbl_amt (TTTC8908R)'
              : 'nass_amt - 매입금액 (순자산 기반 추정)'
          });
          
          if (marketType === 'KR') {
            totalConvertedBalance += Math.round(domesticCash);
            totalConvertedPrincipal += Math.round(domesticCash + actualPurchaseCost);
          }
        }
      } catch (err: any) {
        console.warn("Domestic Sync Skip:", err);
        domesticError = err.message;
      }


      // Final Check: If absolutely no data was fetched, keep existing state and notify user
      if (!foundAnyData) {
         setBotStatus("연동 데이터 수신 일시 지연 (기존 보유 잔고 유지)");
         if (domesticError) {
           showNotification(`KIS 계좌 잔고 수신 일시 실패: ${domesticError}`, "error");
         }
         return;
      }


      // Final fallback: if total is still 0, check if we have any total eval amount in output2
      // common for some accounts to only populate tot_evlu_amt
      
      if (Object.keys(newStockNames).length > 0) {
        setCustomStockNames(prev => ({ ...prev, ...newStockNames }));
      }

      const symbolsFromHoldings = Object.keys(newHoldings);
      const existingSymbols = new Set(stocks.map(s => s.symbol));
      const missingSymbols = symbolsFromHoldings.filter(s => !existingSymbols.has(s));

      if (missingSymbols.length > 0) {
        setBotStatus(`새로운 보유 종목 ${missingSymbols.length}개 발견. 데이터 동기화 중...`);
        const addedStocks: Stock[] = await Promise.all(missingSymbols.map(async (sym) => {
          const isUSStock = /^[A-Z]/.test(sym);
          const stockMarket = isUSStock ? 'US' : 'KR';
          try {
            const p = await kisService.getPrice(sym);
            const resolvedName = (p && p.name && p.name !== sym) 
              ? p.name 
              : getResolvedStockName(sym, newStockNames[sym] ? { name: newStockNames[sym] } : undefined);
            if (p) {
              return {
                symbol: sym,
                name: resolvedName,
                price: p.current,
                change: p.change,
                changePercent: p.changePercent,
                volume: p.volume,
                history: [{ time: '09:00', price: p.current }],
                market: stockMarket,
                isAI: false
              };
            }
            throw new Error("No price data");
          } catch (e) {
            const resolvedName = getResolvedStockName(sym, newStockNames[sym] ? { name: newStockNames[sym] } : undefined);
            return {
              symbol: sym,
              name: resolvedName,
              price: 0,
              change: 0,
              changePercent: 0,
              volume: '0',
              history: [],
              market: stockMarket,
              isAI: false
            };
          }
        }));
        
        // Add to current active stocks if market matches
        const currentMarketAdded = addedStocks.filter(s => s.market === marketType);
        if (currentMarketAdded.length > 0) {
          setStocks(prev => [...prev, ...currentMarketAdded]);
        }

        // Update stocksCache so that stocks are preserved across market switches
        setStocksCache(prev => {
          const nextKR = [...prev.KR];
          const nextUS = [...prev.US];
          addedStocks.forEach(s => {
            if (s.market === 'US') {
              if (!nextUS.some(x => x.symbol === s.symbol)) nextUS.push(s);
            } else {
              if (!nextKR.some(x => x.symbol === s.symbol)) nextKR.push(s);
            }
          });
          return { KR: nextKR, US: nextUS };
        });
      }

      // Update States safely
      if (totalConvertedBalance > 0) {
        setBalance(totalConvertedBalance);
      }
      if (totalConvertedPrincipal > 0) {
        setPrincipal(totalConvertedPrincipal);
      }
      
      // 🟢 (2026-09-29) KIS 실잔고로 보유수량을 한 번이라도 확정했는지 — 새로고침 직후엔 브라우저에 저장된 옛 보유수량이
      // 남아 있어서, 이 확정 전에는 보유수량으로 카드 상태를 바꾸지 않는다.
      if (domesticSuccess) kisHoldingsConfirmedRef.current = true;
      // Smart Holdings Merge: Preserve non-synced market holdings if one market failed, AND preserve recent local buys (< 45s) while KIS balance settles
      setHoldings(prevHoldings => {
        const merged = { ...prevHoldings };
        const now = Date.now();
        
        // If domestic synced successfully, clear old KR holdings except those bought very recently (< 45s)
        if (domesticSuccess) {
          Object.keys(merged).forEach(sym => {
            const isUS = /^[A-Za-z]/.test(sym) && !/^\d+$/.test(sym);
            if (!isUS) {
              const recentTrade = recentLocalTradesRef.current[sym];
              const isRecentlyTraded = recentTrade && (now - recentTrade.timestamp < 45000) && recentTrade.quantity > 0;
              if (!isRecentlyTraded) {
                delete merged[sym];
              }
            }
          });
        }
        
        // If overseas synced successfully, clear old US holdings except those bought very recently (< 45s)
        // Add all newly fetched confirmed holdings
        Object.entries(newHoldings).forEach(([sym, qty]) => {
          const numQty = Number(qty);
          if (numQty > 0 && !isNaN(numQty)) {
            merged[sym] = numQty;
            // Once KIS confirms the holding in balance API, remove from temporary recentLocalTradesRef
            delete recentLocalTradesRef.current[sym];
          }
        });

        // Ensure invalid or 0/negative/NaN quantities are strictly removed
        Object.keys(merged).forEach(sym => {
          if (!merged[sym] || Number(merged[sym]) <= 0 || isNaN(Number(merged[sym]))) {
            delete merged[sym];
          }
        });

        try {
          localStorage.setItem('sleek_holdings', JSON.stringify(merged));
        } catch (e) {
          console.error("Failed to persist holdings to localStorage", e);
        }

        if (currentUser) {
          saveUserHoldings(currentUser.uid, merged);
        }
        
        return merged;
      });

      setAvgPrices(prev => {
        const nextAvg = { ...prev, ...newAvgPrices };
        const now = Date.now();
        if (domesticSuccess) {
          Object.keys(nextAvg).forEach(sym => {
            const isUS = /^[A-Za-z]/.test(sym) && !/^\d+$/.test(sym);
            const recentTrade = recentLocalTradesRef.current[sym];
            const isRecentlyTraded = recentTrade && (now - recentTrade.timestamp < 45000) && recentTrade.quantity > 0;
            if (!isUS && (!newHoldings[sym] || newHoldings[sym] <= 0) && !isRecentlyTraded) {
              delete nextAvg[sym];
            }
          });
        }
        try {
          localStorage.setItem('sleek_avg_prices', JSON.stringify(nextAvg));
        } catch (e) {}
        return nextAvg;
      });

      // Tab and inventory synchronization for held stocks (Never auto-activate bot)
      const updatedTabs = [...scalperTabsRef.current];
      let tabsChanged = false;
      const newInventoryItemsToAdd: ScalperInventoryItem[] = [];

      // Step 1: Ensure all held stocks have a tab with isBotActive: false by default
      for (const [symbol, qty] of Object.entries(newHoldings)) {
        if (qty > 0) {
          let tabIndex = updatedTabs.findIndex(t => t.symbol === symbol);
          if (tabIndex === -1) {
            const stockInfo = stocksRef.current.find(s => s.symbol === symbol) || INITIAL_STOCKS_KR.find(s => s.symbol === symbol) || INITIAL_STOCKS.find(s => s.symbol === symbol);
            if (stockInfo) {
              const isUSStock = /^[A-Z]/.test(symbol);
              const limits = calculateStockLimits(stockInfo.price || (isUSStock ? 10 : 1000), stockInfo.changePercent || 0, isUSStock, stockInfo.basePrice);
              const newInvItem: ScalperInventoryItem = createInventoryItem({
                symbol,
                name: stockInfo.name || symbol,
                price: stockInfo.price || 0,
                // 실제 평단가를 알 수 있으면 그것을 기준가 스냅샷으로 사용 (모르면 동기화 시점 현재가로 대체)
                recommendedPrice: (avgPrices[symbol] && avgPrices[symbol] > 0) ? avgPrices[symbol] : undefined,
                recommendation: { reason: 'KIS 보유 동기화', category: 'KIS 보유 동기화' },
                strategy: { gapBuyPrice: limits.lowerLimit, gapSellPrice: limits.upperLimit },
                initialLifecycleStatus: 'HOLDING' // 이미 보유 중인 종목이므로 HOLDING부터 시작
              });
              const newTab: ScalperTab = {
                id: newInvItem.id,
                symbol: newInvItem.symbol,
                name: newInvItem.name,
                isBotActive: false, // Explicitly keep inactive unless user starts it
                gapBuyPrice: newInvItem.strategy.gapBuyPrice,
                gapSellPrice: newInvItem.strategy.gapSellPrice,
                tradeQuantity: newInvItem.strategy.tradeQuantity,
                maxSlots: newInvItem.strategy.maxSlots,
                entryPriceMode: newInvItem.strategy.entryPriceMode,
                autoCancelThreshold: newInvItem.strategy.autoCancelThreshold,
                gapInventory: [],
                gapTradingProfit: 0,
                gapTradeCount: 0,
                lastTradeType: null,
                scalperMessage: "대기 중...",
                tradeLogs: [],
                lifecycleStatus: 'HOLDING'
              };
              updatedTabs.push(newTab);
              newInventoryItemsToAdd.push(newInvItem);
              seedRealHistory(symbol).then(realHistory => {
                if (realHistory && realHistory.length > 0) {
                  setStocks(prev => prev.map(s => s.symbol === symbol ? { ...s, history: realHistory } : s));
                }
              });
              tabsChanged = true;
            }
          }
        }
      }

      // Step 2: Sync gapInventory for all tabs (and clear inventory if actualQty is 0)
      const monitorGapInventoryUpdates: Record<string, { id: string; price: number; quantity: number; symbol?: string }[]> = {};
      for (let i = 0; i < updatedTabs.length; i++) {
        const tab = updatedTabs[i];
        const symbol = tab.symbol;
        const actualQty = newHoldings[symbol] || 0;
        const currentInventory = (tab.id === activeTabId || tab.symbol === selectedSymbol) ? gapInventoryRef.current : (tab.gapInventory || []);
        const totalSlotQty = currentInventory.reduce((acc, slot) => acc + (slot.quantity || 0), 0);

        if (actualQty <= 0) {
          if (currentInventory.length > 0) {
            updatedTabs[i] = { ...tab, gapInventory: [] };
            monitorGapInventoryUpdates[symbol] = [];
            tabsChanged = true;
            if (tab.id === activeTabId || tab.symbol === selectedSymbol) {
              setGapInventory([]);
              gapInventoryRef.current = [];
            }
          }
        } else if (Math.abs(actualQty - totalSlotQty) > 0.0001) {
          console.log(`[Slot Sync] Desync for ${symbol}. KIS: ${actualQty}, Local: ${totalSlotQty}`);
          let newInv = [...currentInventory];
          
          if (actualQty < totalSlotQty) {
            // Trim slots
            let remaining = actualQty;
            newInv = [];
            for (const slot of currentInventory) {
              if (remaining <= 0) break;
              const take = Math.min(slot.quantity, remaining);
              newInv.push({ ...slot, quantity: take });
              remaining -= take;
            }
          } else {
            // Expand slots
            const missing = actualQty - totalSlotQty;
            const avgP = newAvgPrices[symbol] || avgPrices[symbol] || (stocksRef.current.find(s => s.symbol === symbol)?.price || 0);
            if (avgP > 0) {
              newInv.push({ id: `RECOVERED-${Date.now()}-${Math.floor(Math.random() * 1000)}`, price: avgP, quantity: missing, symbol });
            }
          }

          updatedTabs[i] = { ...tab, gapInventory: newInv };
          monitorGapInventoryUpdates[symbol] = newInv;
          tabsChanged = true;
          if (tab.id === activeTabId || tab.symbol === selectedSymbol) {
            setGapInventory(newInv);
            gapInventoryRef.current = newInv;
          }
        }
      }

      if (tabsChanged) {
        setScalperInventory(prev => {
          const withNewItems = newInventoryItemsToAdd.length > 0 ? [...prev, ...newInventoryItemsToAdd] : prev;
          if (Object.keys(monitorGapInventoryUpdates).length === 0) return withNewItems;
          return withNewItems.map(item => {
            if (!monitorGapInventoryUpdates.hasOwnProperty(item.symbol)) return item;
            const positions = monitorGapInventoryUpdates[item.symbol];
            return {
              ...item,
              account: {
                ...item.account,
                positions,
                holdingQty: positions.reduce((acc, s) => acc + (s.quantity || 0), 0),
                lastUpdatedAt: Date.now()
              }
            };
          });
        });
      }
      
      setBotStatus("상태 동기화 완료");
      // 🛡️ 여기서 updateKisBuyableQty()를 또 부르지 않는다 — 같은 API(getDomesticBuyableAmount,
      // TTTC8908R)가 이미 2초 주기(refreshInventoryItem)와 종목 선택 변경 시점에 훨씬 자주
      // 호출되고 있어서 완전히 중복이었다. 이 중복 호출이 handleSyncKIS 한 사이클을 불필요하게
      // 늘려서 "SYNC SKIPPED" 반복의 원인 중 하나였다.
    } catch (e: any) {
      console.error("KIS Sync Error", e);
      const msg = e.response?.data?.msg1 || e.message;
      setBotStatus(`증권사 동기화 실패: ${msg}`);
    } finally {
      setIsSyncingKIS(false);
      syncInProgressRef.current = false;
    }
  };
  handleSyncKISRef.current = handleSyncKIS; // 🚀 시작 점검이 항상 최신 설정의 동기화 함수를 부르도록

  // Automated initial KIS synchronization pipeline with 5-step checklist
  const isInitialSyncRunningRef = React.useRef(false);

  const executeFullKisInitialSync = useCallback(async (autoEnterAfterSync = true) => {
    if (isInitialSyncRunningRef.current) return;
    isInitialSyncRunningRef.current = true;

    const setStep = (id: string, patch: Partial<StepItem>) =>
      setStartupSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    const setProgress = (progress: number, currentStep: string) =>
      setInitSyncState(prev => ({ ...prev, status: 'syncing', progress, currentStep }));

    try {
      setInitSyncState({ status: 'syncing', progress: 5, currentStep: '1단계: KIS 연결 설정 확인 중...', completedSteps: [] });

      // ---- 1. KIS 연결 설정 ----
      setStep('auth-check', { status: 'loading', detail: '로그인·계좌 설정 불러오는 중...' });
      // 🛡️ (2026-09-29) 예전엔 화면이 뜨자마자(0.3초) 점검을 시작해서, 로그인 후 서버에서 KIS 계좌 설정을 불러오기
      // "전"에 확인하는 바람에 1~4번이 전부 "설정 없음"으로 나왔다. 이제 설정을 다 불러오고 KIS 연결이 준비될 때까지
      // 최대 15초 기다린다(설정 불러오기가 끝났는데 계좌가 없으면 1초 더 보고 넘어감).
      {
        const startedAt = Date.now();
        let settingsDoneAt = 0;
        while (Date.now() - startedAt < 15000) {
          const c = getActiveKisConfig(kisConfigRef.current);
          const valid = !!(c.appKey && c.appSecret && c.accountNo);
          if (valid && kisService.isConfigReady()) break;
          if (userSettingsLoadedRef.current) {
            if (!settingsDoneAt) settingsDoneAt = Date.now();
            if (!valid && Date.now() - settingsDoneAt > 1000) break;
            if (valid && Date.now() - settingsDoneAt > 3000) break; // 설정은 있는데 연결 준비가 늦음 — 더 기다리지 않음
          }
          await new Promise(r => setTimeout(r, 250));
        }
      }
      const activeConfig = getActiveKisConfig(kisConfigRef.current);
      const isConfigValid = !!(activeConfig.appKey && activeConfig.appSecret && activeConfig.accountNo);
      // 🛡️ 예전엔 설정이 비어 있어도 "보안 API 토큰 및 통신망 정상 연결됨"이 떴다 — 이제 경고로 표시한다.
      setStep('auth-check', isConfigValid
        ? { status: 'success', detail: `계좌 ${activeConfig.accountNo.slice(0, 4)}****-${activeConfig.accountCode} 등록됨${kisService.isConfigReady() ? ' · 연결 준비됨' : ' · 연결 준비 중'}` }
        : { status: 'warning', detail: '앱키 또는 계좌번호가 없습니다 — [KIS API 설정]에서 입력해야 실매매가 됩니다' });

      // ---- 2. 인벤토리 종목 시세 ----
      setProgress(25, '2단계: 인벤토리 종목 시세 확인 중...');
      setStep('market-feed', { status: 'loading', detail: '현재가 수신 확인 중...' });
      const countPriced = () => {
        const tabs = scalperTabsRef.current.filter(t => /^\d{6}$/.test(t.symbol));
        const priced = tabs.filter(t => {
          const st = stocksRef.current.find(x => x.symbol === t.symbol);
          return !!st && Number(st.price) > 0 && (st.isPlaceholderData !== true || (lastWsTickAtRef.current[t.symbol] || 0) > 0);
        }).length;
        return { total: tabs.length, priced };
      };
      let feed = countPriced();
      for (let i = 0; i < 6 && feed.total > 0 && feed.priced < feed.total; i++) { // 최대 3초 기다려 본다
        await new Promise(r => setTimeout(r, 500));
        feed = countPriced();
      }
      setStep('market-feed', feed.total === 0
        ? { status: 'success', detail: '인벤토리 비어 있음 — 추천종목 자동 채움 대기' }
        : { status: 'success', detail: feed.priced === feed.total
            ? `${feed.total}종목 모두 시세 확인`
            : (['REGULAR_SCALP', 'REGULAR_CLOSE_DECISION', 'AFTER_SCALP', 'AFTER_CLOSE_DECISION'].includes(getTradingSession())
                ? `${feed.priced}/${feed.total}종목 시세 확인 · 나머지는 실시간 연결 후 수신`
                : `장 운영시간 외 — ${feed.total}종목 시세는 시작 후 조회·개장 후 실시간 수신`) });
      // (시세가 아직 없는 건 시작 직후·장 외 시간에 정상이라 경고로 표시하지 않는다 — 실시간 연결·REST 백업은 메인 화면 진입 후 시작됨)

      // ---- 3. 미체결 주문 복구 ----
      // 🎯 브라우저를 새로고침하면 pendingSellOrders(미체결 매도주문 추적, React state)가 빈 배열로 초기화된다.
      // 매도 중복 방지 로직이 이 state를 기준으로 판단하므로, 복구하지 않으면 이미 KIS에 접수된 미체결 매도주문 위에
      // 또 매도주문을 낼 위험이 있다. (예전엔 100% 완료 표시 "뒤에" 조용히 하던 작업 — 이제 단계로 보여준다)
      setProgress(45, '3단계: 미체결 주문 복구 중...');
      setStep('order-recover', { status: 'loading', detail: 'KIS 미체결 매도주문 조회 중...' });
      if (!isConfigValid) {
        setStep('order-recover', { status: 'warning', detail: 'KIS 설정이 없어 조회하지 않았습니다' });
      } else {
        try {
          const unfilledSells = await kisService.getUnfilledSellOrders();
          if (unfilledSells.length > 0) {
            const recoveredOrders: PendingSellOrder[] = unfilledSells.map(o => ({
              id: o.odno,
              symbol: o.symbol,
              orderPrice: o.orderPrice,
              quantity: o.unfilledQty,
              createdAt: Date.now(),
              type: 'LIMIT_SELL' as const,
              reason: '[복구됨] 새로고침 전 이미 접수되어 있던 미체결 매도주문',
              buyPrice: avgPrices[o.symbol] || undefined,
            }));
            setPendingSellOrders(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newOnes = recoveredOrders.filter(o => !existingIds.has(o.id));
              return [...prev, ...newOnes];
            });
            console.log('[미체결 매도주문 복구]', { 복구건수: unfilledSells.length, 종목: unfilledSells.map(o => o.symbol) });
          }
          setStep('order-recover', { status: 'success', detail: unfilledSells.length > 0 ? `미체결 매도 ${unfilledSells.length}건 복구 — 이어서 체결 감시` : '미체결 매도주문 없음' });
        } catch (recoverErr) {
          console.warn('[미체결 매도주문 복구 실패]', recoverErr);
          setStep('order-recover', { status: 'warning', detail: '조회 실패 — 20초 주기 매도주문 정합성 점검에서 다시 확인합니다' });
        }
      }

      // ---- 4. 계좌 잔고 ----
      setProgress(65, '4단계: 계좌 잔고 · 주문가능금액 불러오는 중...');
      setStep('balance-check', { status: 'loading', detail: '보유 종목·주문가능금액 조회 중...' });
      try {
        if (isConfigValid) await handleSyncKISRef.current();
        await new Promise(r => setTimeout(r, 500)); // 동기화 결과가 화면 상태에 반영될 시간
        const heldCount = Object.entries(holdingsRef.current || {}).filter(([sym, q]) => /^\d{6}$/.test(sym) && Number(q) > 0).length;
        const cash = orderableKrwRef.current || 0;
        setStep('balance-check', isConfigValid
          ? { status: 'success', detail: `보유 ${heldCount}종목 · 주문가능금액 ${cash.toLocaleString()}원` }
          : { status: 'warning', detail: 'KIS 설정이 없어 실계좌를 불러오지 못했습니다' });
      } catch (e: any) {
        setStep('balance-check', { status: 'warning', detail: `잔고 조회 실패 — 20초 주기 동기화에서 다시 시도합니다 (${e?.message || '오류'})` });
      }

      // ---- 5. 매매 규칙 ----
      setProgress(90, '5단계: 매매 규칙 확인 중...');
      setStep('rules-check', {
        status: 'success',
        detail: `진입 ${(targetInvestmentPerStockRef.current || 0).toLocaleString()}원 · 목표 순수익 +${scalpingTargetProfit}% 도달 후 고점 ${TRAILING_DROP_TICKS}틱 하락 시 매도 · 익절·손절은 종목별(5분 거래대금 구분): 대형 +${getLiveParams().sellTargetLargePct}/${getLiveParams().sellStopLargePct}% · 중형 +${getLiveParams().sellTargetNetPct}/${getLiveParams().sellStopNetPct}% · 소형 +${getLiveParams().sellTargetSmallPct}/${getLiveParams().sellStopSmallPct}%`,
      });

      setInitSyncState(prev => ({
        ...prev,
        status: 'ready',
        progress: 100,
        currentStep: '시작 점검 완료 — 잠시 후 자동으로 시작합니다',
        completedSteps: ['1. KIS 연결 설정 확인', '2. 인벤토리 종목 시세 수신', '3. 미체결 주문 복구', '4. 계좌 잔고 · 주문가능금액', '5. 매매 규칙 확인']
      }));

      // 모든 단계가 실제로 끝난 뒤 자동으로 메인 화면 진입 (결과를 읽을 수 있게 1.5초 보여준다)
      if (autoEnterAfterSync) {
        await new Promise(r => setTimeout(r, 1500));
        setIsAppInitialized(true);
      }
    } catch (err: any) {
      console.error("Initial Sync Pipeline Error", err);
      if (autoEnterAfterSync) setIsAppInitialized(true);
    } finally {
      isInitialSyncRunningRef.current = false;
    }
  }, [kisConfig, avgPrices, scalpingTargetProfit, scalpingStopLoss]);

  // Auto trigger initial sync when user opens program
  useEffect(() => {
    if (!isAppInitialized && initSyncState.status === 'idle') {
      const timer = setTimeout(() => {
        executeFullKisInitialSync(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAppInitialized, initSyncState.status, executeFullKisInitialSync]);

  // Unified Gap Trading logic is now placed in the main bot effect below.

  // Real-time Stock Price & Orderbook Sync Interval
  useEffect(() => {
    if (!isAppInitialized) return;

    // 1. Sync for all watchlist stocks (every 10 seconds)
 const refreshStalePrices = async () => {
  // ============================================================
  // 🔒 로그인/앱 초기화 상태가 아니면 REST 시세조회 금지
  // ============================================================
  if (!currentUser) return;
  if (!isAppInitialized) return;
  if (!kisConfig.isConnected) return;

  // 현재 실시간 데이터 세션 번호 저장
  const sessionId = liveDataSessionRef.current;

  // KIS 설정이 실제로 준비되지 않았으면 중단
  if (!kisService.isConfigReady()) return;

  // 로그아웃 등으로 세션이 변경되었으면 중단
  if (sessionId !== liveDataSessionRef.current) return;

  if (!isKoreanDataCollectionActive()) {
    return;
  }

  try {
        // ============================================================
// 🎯 REST 백업 대상은 "실제 스캘퍼 등록종목"만
//
// stocks 배열에는 추천 후보/검색 결과/기타 표시용 종목이 들어갈 수 있다.
// 하지만 REST 가격 백업이 필요한 것은 실제 매매 감시 대상인
// scalperTabs뿐이다.
//
// 정상 상태:
//   H0STCNT0 WebSocket → 실시간 가격
//
// 비정상/지연 상태:
//   refreshStalePrices() → 오래된 등록종목만 REST 보완
//
// ❌ stocks 전체 순회 금지
// ❌ 추천 후보 전체 REST 조회 금지
// ============================================================

const STALE_THRESHOLD_MS = 10000; // 등록종목이 10초 동안 틱이 없으면 REST 백업

const inventorySymbols = Array.from(
  new Set(
    scalperTabsRef.current
      .map(t => t.symbol)
      .filter(symbol => /^\d{6}$/.test(symbol))
  )
);

if (inventorySymbols.length === 0) {
  return;
}

const now = Date.now();
const currentStocks = stocksRef.current;

// stocks에 존재하는 등록종목만 REST 백업 대상으로 만든다.
// WebSocket이 정상적으로 틱을 보내고 있으면 대상에서 제외된다.
const staleStocks = inventorySymbols
  .map(symbol => currentStocks.find(s => s.symbol === symbol))
  .filter((s): s is Stock => !!s)
  .filter(s => {
    const lastUpdate = lastWsTickAtRef.current[s.symbol] || 0;

    // 마지막 WebSocket 틱을 받은 지 10초 이상이면 stale
    return now - lastUpdate >= STALE_THRESHOLD_MS;
  });

if (staleStocks.length === 0) {
  return;
}

// 🛡️ 한 번에 몰아서 REST 백업하지 않는다(2026-09-28 추가) — 웹소켓이 잠깐 끊겼다가 재연결되면
// (또는 슬롯 승인키 재발급 등으로) 등록종목(최대 80개까지 가능, 과제1 멀티 앱키 참고)이 한꺼번에
// stale로 잡힐 수 있는데, 이 수십 개를 이 사이클 한 번에 순차 조회하면 KIS 서버의 초당 요청 제한에
// 걸려 429가 무더기로 발생하고, 그 실패들이 getNetworkHealth()의 30초 표본에 쌓여 스캘퍼 전체가
// "네트워크/API 불안정"으로 자동 정지되는 원인이 될 수 있다(사용자 지적). 가장 오래 안 갱신된
// 종목부터 이 사이클에 최대 STALE_BATCH_LIMIT개만 처리하고, 나머지는 다음 25초 주기에 이어서
// 처리한다 — 완전히 죽은 웹소켓이라도 결국 몇 사이클 안에 전부 갱신되므로 안전하다.
const STALE_BATCH_LIMIT = 8;
const targetStocks = staleStocks
  .sort((a, b) => (lastWsTickAtRef.current[a.symbol] || 0) - (lastWsTickAtRef.current[b.symbol] || 0))
  .slice(0, STALE_BATCH_LIMIT);

        // 🛡️ 매우 중요한 수정: 예전엔 Promise.all()로 대상 종목 전체에 대해 getPrice()를 동시에
        // 호출했다. getDomesticPrice() 자체는 이제 queueRequest(진짜 직렬 큐)를 거치므로 실제 축
        // 요청은 순서대로 처리되지만, 애초에 N개의 호출을 한꺼번에 만들지 않는 게 더 단순하고
        // 안전하다 — 한 종목씩 순차 처리하면 실패(429 등)가 나도 그 즉시 인지하고 다음 시도로
        // 넘어갈 수 있고, 굳이 수십 개의 pending promise를 한꺼번에 만들 필요가 없다.
        const sessionId = liveDataSessionRef.current;
        const updatedTargets: Stock[] = [];
        for (const s of targetStocks) {
          // ============================================================
  // 🔒 로그인 상태 및 실시간 세션 확인
  // ============================================================
  if (!currentUser) break;
  if (!isAppInitialized) break;
  if (sessionId !== liveDataSessionRef.current) break;
          try {
            const priceData = await kisService.getPrice(s.symbol);
            // ============================================================
    // 🔒 REST 응답 대기 중 로그아웃되었으면 결과 반영 금지
    // ============================================================
    if (!currentUser) break;
    if (!isAppInitialized) break;
    if (sessionId !== liveDataSessionRef.current) break;
            console.log(`[getPrice 결과] ${s.symbol}`, priceData);
            if (priceData && priceData.current > 0) {
              const realPrice = priceData.current;
              const safeHist = Array.isArray(s.history) ? s.history : [];

              updatedTargets.push({
                ...s,
                price: realPrice,
                change: priceData.change,
                changePercent: priceData.changePercent,
                volume: priceData.volume,
                executionStrength: priceData.executionStrength,
                isRealTime: true,
                lastUpdated: new Date().toLocaleTimeString(),
                history: safeHist.length > 0
                  ? [...safeHist.slice(1), {
                      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
                      price: realPrice
                    }]
                  : [{ time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }), price: realPrice }]
              });
              continue;
            }
          } catch (innerErr: any) {
            console.warn(`All-stock price fetch failed for ${s.symbol}:`, innerErr);
          }
          updatedTargets.push({ ...s });
        }

        // 🛡️ updatedTargets는 "이번에 REST로 새로 조회한 일부 종목"만 담고 있다. 나머지(웹소켓으로
        // 이미 최신 상태인) 종목은 그대로 두고, 이번에 갱신된 것만 병합한다.
        const targetPriceMap = new Map<string, Stock>(updatedTargets.map(s => [s.symbol, s]));
        const updatedStocks = currentStocks.map(
  s => targetPriceMap.get(s.symbol) || s
);

// 🔒 REST 응답 대기 중 로그아웃했다면 상태 반영 금지
if (!currentUser) return;
if (!isAppInitialized) return;
if (sessionId !== liveDataSessionRef.current) return;

setStocks(updatedStocks);

        // 🛡️ 매우 중요한 수정: 지금까지 이 함수는 stocks 배열만 갱신하고 scalperInventory는
        // 전혀 건드리지 않았다. scalperInventory(등록된 종목의 실제 데이터 소스)는 오직 "현재
        // 선택된 종목"만 refreshInventoryItem을 통해 갱신되고 있었고, 나머지 등록 종목들은
        // 등록 당시 가격에 영원히 고정되어 있었다. 그 결과 메인 엔진 루프와 센서 갱신 로직이
        // 선택 안 한 종목에 대해서는 오래된(또는 존재하지 않는) 가격으로 판단하거나 아예
        // 건너뛰게 되어, "종목을 클릭해야만 실시간으로 감시/매매되는 것처럼" 보이는 근본
        // 원인이었다. 이제 등록된 전체 종목의 market 네임스페이스를 여기서 함께 갱신한다.
        const priceMap = new Map<string, Stock>(updatedStocks.map(s => [s.symbol, s]));
        setScalperInventory(prev => {
          const result = prev.map(item => {
            const updated = priceMap.get(item.symbol);
            const hasValidPrice = !!(updated && updated.price && updated.price > 0);
            const priceChanged = hasValidPrice && !(item.market.currentPrice === updated!.price && item.market.changePercent === (updated!.changePercent || 0));
            if (!hasValidPrice) return item;
            if (!priceChanged) return item;
            return {
              ...item,
              market: {
                ...item.market,
                currentPrice: updated!.price,
                changePercent: updated!.changePercent || 0,
                volume: updated!.volume || item.market.volume,
                priceStatus: 'LIVE' as const,
                lastUpdatedAt: Date.now()
              }
            };
          });
          return result;
        });
      } catch (err: any) {
        console.error("Real-time price sync failed:", err);
      }
    };

    // 2. Fast sync for the currently selected stock (every 1.5 seconds)
    // 🛡️ syncSelectedPrice(선택 종목 전용 2초 REST)를 완전히 제거했다 — 웹소켓 틱 핸들러가
    // 이제 history까지 정확히 갱신하고, refreshStalePrices가 15초 이상 갱신 안 된 종목을 자동으로
    // REST로 보완하므로, 선택된 종목만 별도로 더 자주 조회할 이유가 없다. 이 함수가 "선택한
    // 종목만 유독 빠르게 갱신되는" 착시의 또 다른 원인이었다.

    // 3. Live real-time orderbook sync for selected stock (every 1.5 seconds)
   

    // 🛡️ (2026-09-28 변경, 사용자 요청) 인벤토리 호가의 REST 조회(syncLiveOrderbook → fetchLiveOrderbook,
    // 5초마다 1종목 순환)를 완전히 제거했다 — 인벤토리가 19종목 고정이라 전 종목이 항상 웹소켓 호가
    // (H0STASP0)를 받고 있어서(위 orderbook 콜백이 liveOrderbooksRef를 갱신), REST 호가 백업은 더 이상
    // 필요 없다. 호가는 이제 웹소켓 전용이다.

    // Immediate initial sync
    refreshStalePrices();

   let masterTickCount = 0;

const masterInterval = setInterval(() => {
  masterTickCount += 1;

  if (masterTickCount % 20 === 0 && kisConfig.isConnected) {
    handleSyncKIS();
  }

  if (masterTickCount % 25 === 0) {
    refreshStalePrices();
  }
}, 1000);
    return () => {
      clearInterval(masterInterval);
    };
  }, [currentUser, isAppInitialized, kisConfig.isConnected, marketType, isGapBotActive]);

  // ============================================================
  // 🛡️ 등록된 전체 종목의 전략센서(RSI 포함) 계산 전용 갱신 — API 호출 없음
  // ------------------------------------------------------------
  // 기존에는 "봇이 시작된 종목"(메인 엔진 루프)과 "현재 선택된 종목"(refreshInventoryItem)만
  // 센서가 갱신되고 있었다. 그 결과 인벤토리에 등록만 해두고 아직 시작하지 않았거나 선택해서
  // 보지 않은 종목들은 registration 시점의 기본값(RSI=50 등)에 영원히 고정되어, 실제로는 신호가
  // 떠도 화면에는 "분석 중"처럼 보였다. 이 effect는 새 API 호출을 만들지 않고(웹소켓이든 REST든
  // 이미 stocks에 반영된 최신 가격/이력으로) 등록된 종목 전체의 센서를 순수 계산만으로 다시
  // 채워 넣는다.
  // ============================================================
  useEffect(() => {
  if (!currentUser) return;
  if (!isAppInitialized) return;
  if (!kisConfig.isConnected) return;

   if (!kisService.isConfigReady()) {
    return;
  }

    const refreshAllInventorySensors = () => {
      if (!isKoreanDataCollectionActive()) { return; } // 🕗 09:00 정각에 센서가 바로 유의미하도록 08:30부터 미리 계산 — 실제 매수/매도는 별도 엔진 루프가 isKoreanMarketOpen()으로 09:00부터만 실행하므로 안전하다
      const currentStocks = stocksRef.current;
      const registeredSymbols = scalperTabsRef.current.map(t => t.symbol);
      if (registeredSymbols.length === 0) { return; }

      const pendingLogs: { symbol: string; price: number; msg: string }[] = [];

      setScalperInventory(prev => {
        let changed = false;
        const next = prev.map(item => {
          let stockItem = currentStocks.find(s => s.symbol === item.symbol);
          // 🛡️ stocks 배열에 아직 반영이 안 됐거나(등록 경로에 따라 지연될 수 있음) 가격이
          // 비어있으면, 인벤토리 자체가 갖고 있는 실시간 시세(market 네임스페이스)를 폴백으로
          // 쓴다. 이걸 안 하면 그 종목은 계속 조용히 건너뛰어져서 "선택 안 한 종목은 센서 로그가
          // 전혀 안 남는" 것처럼 보이는 원인이 될 수 있다.
          if ((!stockItem || !stockItem.price || stockItem.price <= 0) && item.market.currentPrice > 0) {
            stockItem = {
              symbol: item.symbol,
              name: item.name,
              price: item.market.currentPrice,
              change: 0,
              changePercent: item.market.changePercent || 0,
              volume: '0',
              history: [],
              market: 'KR'
            } as Stock;
          }
          if (!stockItem || !stockItem.price || stockItem.price <= 0) return item;

          const strat = detectStockStrategies(stockItem);
          const roundedRsi = Math.round(strat.rsi);
          const cur = item.sensors;
          if (
            cur.pullback === strat.isPullback &&
            cur.breakout === strat.isBreakout &&
            cur.vwap === strat.isVwapSupport &&
            cur.cvd === strat.isVolumeProfile &&
            cur.volumeMomentum === strat.hasVolumeMomentum &&
            cur.rsi === roundedRsi &&
            cur.activeCount === strat.activeCount
          ) return item; // 변화 없으면 그대로

          // 🔔 마우스로 선택하지 않은 종목이라도, 센서가 새로 켜지면 GLOBAL TRADE LOGS에 남긴다.
          if (!cur.pullback && strat.isPullback) pendingLogs.push({ symbol: item.symbol, price: stockItem.price, msg: 'PULLBACK(눌림목) 감지' });
          if (!cur.breakout && strat.isBreakout) pendingLogs.push({ symbol: item.symbol, price: stockItem.price, msg: 'BREAKOUT(돌파) 감지' });
          if (!cur.vwap && strat.isVwapSupport) pendingLogs.push({ symbol: item.symbol, price: stockItem.price, msg: 'VWAP SUPPORT 감지' });
          if (!cur.cvd && strat.isVolumeProfile) pendingLogs.push({ symbol: item.symbol, price: stockItem.price, msg: 'CVD(거래량 프로파일) 감지' });

          changed = true;
          return {
            ...item,
            sensors: {
              pullback: strat.isPullback,
              breakout: strat.isBreakout,
              vwap: strat.isVwapSupport,
              cvd: strat.isVolumeProfile,
              shortTermMomentum: strat.momentumPositive,
              volumeMomentum: strat.hasVolumeMomentum,
              rsi: roundedRsi,
              activeCount: strat.activeCount,
              lastUpdatedAt: Date.now()
            }
          };
        });
        return changed ? next : prev;
      });

      if (pendingLogs.length > 0) {
        setTimeout(() => {
          pendingLogs.forEach(({ symbol, price, msg }) => addLog(symbol, '매수', price, 0, `[전략센서] ${msg}`));
        }, 0);
      }
    };

    refreshAllInventorySensors();
    const sensorInterval = setInterval(refreshAllInventorySensors, 1000); // 🔼 3초→1초 — 가격은 100ms 배치로 반영되는데 센서만 3초 지연되면 체감상 "센서가 늦게 움직인다"는 인상을 줄 수 있어 단축. 다만 100~300ms까지는 종목당 RSI/SMA/VWAP/POC 계산(history 최대 600개 순회)이 다소 무거운 연산이라 부담이 커질 수 있어 1초로 절충
    return () => clearInterval(sensorInterval);
  }, [currentUser,
  isAppInitialized,
  kisConfig.isConnected,
  detectStockStrategies]);

  // ============================================================
  // 🤖 강한 매수 신호 자동 감지 → 팝업 자동 표시
  // ------------------------------------------------------------
  // 이미 봇을 켜서 자동매매 중인 종목은 어차피 알아서 매수하므로 대상에서 제외하고, 아직 봇을
  // 안 켜뒀거나 관심종목으로만 지켜보는 중인데 "일반 매수 기준(60점)보다 훨씬 강한" 신호가 뜨면,
  // 사용자가 직접 확인하고 즉시 선택할 수 있도록 그 종목 하나만 담은 팝업을 자동으로 띄운다.
  // (여러 종목이 나열되는 추천 목록과는 다른, 방금 신호가 뜬 "그 종목 하나"만 보여주는 알림)
  // ============================================================
  const STRONG_SIGNAL_THRESHOLD = 73; // 일반 매수 기준(46점)보다 훨씬 높은, 예외적으로 강한 신호만 (100점 만점 기준 — 기존 130점 만점 95점과 동일 비율)
  const strongSignalAlertedRef = React.useRef<Record<string, number>>({});
  const STRONG_SIGNAL_COOLDOWN_MS = 5 * 60 * 1000; // 같은 종목에 대해 5분 안에는 다시 알리지 않음

  useEffect(() => {
    if (!isAppInitialized) return;

    const checkStrongSignals = () => {
      if (!isKoreanMarketOpen()) return; // 정규장 외에는 신호 자체가 의미없음
      if (showAiRecPopup) return; // 이미 팝업이 떠있으면 또 띄우지 않음

      const candidates = scalperTabsRef.current.filter(t => !t.isBotActive && !(holdings[t.symbol] > 0));
      let bestStock: Stock | null = null;
      let bestScore = -1;

      for (const tab of candidates) {
        const stockItem = stocksRef.current.find(s => s.symbol === tab.symbol);
        if (!stockItem || !stockItem.price || stockItem.price <= 0) continue;

        const lastAlerted = strongSignalAlertedRef.current[tab.symbol] || 0;
        if (Date.now() - lastAlerted < STRONG_SIGNAL_COOLDOWN_MS) continue; // 최근에 이미 알렸으면 건너뜀

        const strat = detectStockStrategies(stockItem);
        const { score } = calculateBuyScore(stockItem, strat);
        if (score > bestScore) {
          bestScore = score;
          bestStock = stockItem;
        }
      }

      if (bestStock && bestScore >= STRONG_SIGNAL_THRESHOLD) {
        strongSignalAlertedRef.current[bestStock.symbol] = Date.now();
        triggerAiRecommendationPopup(bestStock);
      }
    };

    const strongSignalInterval = setInterval(checkStrongSignals, 5000);
    return () => clearInterval(strongSignalInterval);
  }, [isAppInitialized, detectStockStrategies, calculateBuyScore, holdings, showAiRecPopup, triggerAiRecommendationPopup]);

  // ============================================================
  // 🤖 인벤토리 완전 자동 관리 시스템
  // ------------------------------------------------------------
  // 사용자가 직접 버튼을 누르지 않아도, 브라우저 탭이 열려있는 동안 다음을 전부 자동으로 한다:
  //
  // ① 정규장 시작(09:00 KST)에 등록된 전 종목 봇 자동 시작, 마감(15:30 KST)에 자동 정지.
  //    (탭이 열려있어야 동작한다 — 자바스크립트 타이머는 브라우저가 켜져 있을 때만 실행되므로,
  //    컴퓨터/탭을 꺼두면 이 자동화도 함께 멈춘다. 이건 이 앱이 서버가 아니라 브라우저에서
  //    돌아가는 구조이기 때문에 생기는 근본적인 제약이다.)
  // ② 15분 동안 매수 점수가 계속 30점 미만("신호가 거의 없음")이면 인벤토리에서 자동 제거한다.
  //    단, 보유 물량이 있으면 절대 제거하지 않는다 — 매도 신호가 뜰 때까지 계속 기다린다
  //    (강제 정리매도는 하지 않는다. 신호가 안 뜨면 그냥 계속 보유한 채로 둔다).
  // ③ 빈 슬롯이 생기면(신호없음으로 빠지거나 처음 시작할 때) 추천종목 목록에서 점수가 가장
  //    높은 종목부터 자동으로 등록하고 봇을 시작해서 슬롯을 채운다.
  // ============================================================
  // 🎯 사용자 요청으로 5분 → 1분으로 단축. 이 판정은 30초 주기(autoManageInventory 호출 간격)로
  // 도니, "최근 1분치 평균"을 보려면 샘플 2개(30초×2)를 모아야 정확히 맞는다 — 예전엔 샘플 4개
  // (30초×4=2분치)를 1분치라고 잘못 표기해뒀던 불일치를 여기서 함께 바로잡았다.
  const DEAD_SIGNAL_DURATION_MS = 1 * 60 * 1000;
  const lowScoreSinceRef = React.useRef<Record<string, number>>({});
  const evictedAtRef = React.useRef<Record<string, number>>({}); // 자동 퇴출 시각 — 30분 재편입 금지용
  const evictSamplesRef = React.useRef<Record<string, { t: number; gatesFailed: number; distance: number }[]>>({}); // 퇴출 판정용 최근 1분 표본
  const tierSinceRef = React.useRef<Record<string, { B?: number; D?: number; L?: number }>>({}); // 등급별 지속 시작 시각
  const lastRotationAtRef = React.useRef<number>(0); // 마지막 순위 교체 시각(1분 간격)
  const wasMarketOpenRef = React.useRef<boolean | null>(null);
  const isAutoFillingRef = React.useRef<boolean>(false);
  const autoFillDiagAtRef = React.useRef<number>(0); // 자동 채움 점검 로그 마지막 시각(5분에 한 번)
  const lastAutoFillAttemptRef = React.useRef<number>(0);

  useEffect(() => {
    if (!isAppInitialized) return;

    const autoManageInventory = async () => {
      const marketOpen = isKoreanMarketOpen();

      // 🛡️ 매우 중요한 안전장치: 앱이 장중에 새로 로딩된 경우를 "장 시작 순간"으로 오인하지
      // 않는다. 최초 실행에서는 현재 시장 상태만 기억하고, 자동매매 ON/OFF 전환은 하지 않는다 —
      // 안 그러면 장중에 프로그램을 재시작할 때마다 워밍업 없이 즉시 전 종목 매매가 켜져버린다.
      if (wasMarketOpenRef.current === null) {
        wasMarketOpenRef.current = marketOpen;
        console.log('[자동관리 초기화]', { marketOpen, message: '앱 최초 로딩이므로 장 시작 이벤트로 처리하지 않습니다.' });
        return;
      }

      // ① 거래 가능 시간 시작/종료 순간(엣지)을 감지해서 전 종목 봇을 한 번만 켜고/끈다.
      // isKoreanMarketOpen()은 정규장(09:00~15:30)과, 2026-09-14부터 신설되는 KRX 애프터마켓
      // (16:00~20:00) 둘 다를 포함하므로, 정규장 마감(15:30) 시 자동 정지되고 — 이때 KRX 쪽
      // 미체결 주문도 어차피 자동 취소되므로 자연스럽게 맞아떨어진다 — 애프터마켓 시작(16:00,
      // 9/14부터) 시 자동으로 다시 시작된다.
      // 🛡️ 실제로 "닫힘 → 열림"으로 바뀐 순간에도, 워밍업(isTradingArmed)이 아직 안 끝났으면
      // 바로 켜지 않고 대기시킨다 — 워밍업이 끝나는 즉시(위 워밍업 effect에서) 자동 시작된다.
      if (marketOpen && !wasMarketOpenRef.current) {
        pendingMarketOpenRef.current = true;
        console.log('[장 시작 감지] 데이터 안정화 완료 후 자동매매를 시작합니다.');
        if (isTradingArmed) {
          setScalperInventory(prev => prev.map(item => ({ ...item, strategy: { ...item.strategy, isBotActive: true } })));
          setIsGapBotActive(true);
          pendingMarketOpenRef.current = false;
          showNotification('[자동 시작] 거래 가능 시간이 시작되어 등록된 전 종목의 스캘핑을 자동으로 시작합니다.', 'success');
        }
      } else if (!marketOpen && wasMarketOpenRef.current) {
        setScalperInventory(prev => prev.map(item => ({ ...item, strategy: { ...item.strategy, isBotActive: false } })));
        setIsGapBotActive(false);
        showNotification('[자동 종료] 거래 가능 시간이 종료되어 스캘핑을 자동으로 정지합니다. (미체결 주문이 있다면 거래소 정책에 따라 취소될 수 있습니다)', 'info');
      }
      wasMarketOpenRef.current = marketOpen;

      if (!marketOpen) return; // 거래 시간 외에는 아래 슬롯 관리도 할 필요 없음

      // ② (2026-09-30 재설계) "매수까지의 거리"로 인벤토리 순위를 매겨 먼 종목부터 빨리 퇴출한다.
      //   거리 = 못 채운 필수조건 수(체결강도130+·눌림목·VWAP 위) × 15 + max(0, 45 − 점수)  — 엔진이 매 판단마다 남긴 값(lastBuyEvalRef)만 읽는다.
      //   A 임박: 필수조건 모두 충족 + 35점 이상 → 퇴출 안 함
      //   B 근접: 그 외 → 5분 안에 A로 못 올라오면 퇴출
      //   C 멀다: 최근 1분 평균 필수조건 부족 2개 이상 → 1분 뒤 퇴출 (엔진 판단이 20초 이상 없으면 = 체결이 뜸한 종목 → C로 봄)
      //   D 매우 멀다: VWAP보다 0.5% 이상 아래 + 체결강도 80 미만 → 30초 뒤 퇴출
      //   순위 교체: 인벤토리가 꽉 차 있으면 1분마다 거리가 가장 먼 B 이하 1종목을 새 추천종목으로 교체(후보가 있을 때만)
      //   보호: 보유 중 / 주문 진행 중 / 편입 2분 미만
      const nowTs = Date.now();
      const currentInventory = scalperTabsRef.current;
      const toRemove: string[] = [];
      const removeReason: Record<string, string> = {};
      const rankable: { symbol: string; avgDistance: number }[] = [];
      // 🧺 (2026-10-07) 자리가 남아 있으면 '멀다'는 이유로는 내보내지 않는다 — 퇴출은 더 나은 후보에게 자리를 내주기 위한 것인데,
      //   빈 칸이 많을 때도 5분마다 내보내고 10분간 재편입을 막아서 인벤토리가 계속 비었다. 빈 칸이 5개 이하일 때만 거리 기준 퇴출을 한다.
      //   (거래가 식은 종목 퇴출은 빈 칸과 무관하게 그대로)
      const krUsedNow = currentInventory.filter(t => !/^[A-Za-z]/.test(t.symbol)).length;
      const distanceEvictOn = MAX_INVENTORY_PER_MARKET - krUsedNow <= getLiveParams().distanceEvictFreeSlots;
      currentInventory.forEach(item => {
        if (/^[A-Za-z]/.test(item.symbol)) return;
        const sym = item.symbol;
        const hasHoldings = (holdingsRef.current[sym] || 0) > 0 ||
          (item.gapInventory || []).some(s => typeof s === 'object' && (s.quantity || 0) > 0);
        const hasPendingOrder = ['BUY_READY', 'BUYING', 'SELL_READY', 'SELLING', 'HOLDING'].includes(item.lifecycleStatus || '')
          || pendingBuyOrdersRef.current.some(o => o.symbol === sym) || pendingSellOrdersRef.current.some(o => o.symbol === sym)
          || pendingTradeKeysRef.current.has(`${sym}_BUY`) || pendingTradeKeysRef.current.has(`${sym}_SELL`);
        const registeredAt = scalperInventoryRef.current.find(inv => inv.symbol === sym)?.registeredAt || 0;
        const isNewlyAdded = registeredAt > 0 && nowTs - registeredAt < INVENTORY_MIN_RESIDENCE_MS;
        // 봇이 꺼진 종목(사용자가 멈춤)은 엔진 판단이 없어 '멀다'로 오판되므로 퇴출 판정에서 뺀다
        const botActive = item.id === activeTabIdRef.current ? isGapBotActiveRef.current : item.isBotActive;
        if (hasHoldings || hasPendingOrder || isNewlyAdded || !botActive) {
          delete evictSamplesRef.current[sym];
          delete tierSinceRef.current[sym];
          return;
        }

        const ev = lastBuyEvalRef.current[sym];
        const fresh = !!ev && nowTs - ev.at <= 20000;
        const gatesFailed = fresh ? ev!.gatesFailed : 2;
        const score = fresh ? ev!.score : 0;
        const distance = gatesFailed * 15 + Math.max(0, getLiveParams().aScoreThreshold - score);
        const samples = [...(evictSamplesRef.current[sym] || []), { t: nowTs, gatesFailed, distance }].filter(x => nowTs - x.t <= 60000);
        evictSamplesRef.current[sym] = samples;
        const spanMs = samples.length > 0 ? nowTs - samples[0].t : 0;
        const avgGates = samples.reduce((a, b) => a + b.gatesFailed, 0) / samples.length;
        const avgDistance = samples.reduce((a, b) => a + b.distance, 0) / samples.length;

        const isTierA = fresh && gatesFailed === 0 && score >= 35;
        const isTierD = fresh && ev!.vwapGapPct <= -0.5 && ev!.exec < 80;
        const isTierC = !isTierD && spanMs >= 45000 && avgGates >= 2;
        const t = tierSinceRef.current[sym] || (tierSinceRef.current[sym] = {});
        // 💧 (2026-10-06) 거래가 식은 종목 — 5분 거래대금이 기준(1억) 미만인 상태가 2분 이어지면 다른 조건과 무관하게 퇴출한다.
        // 예전엔 체결강도·VWAP만 맞으면 5분을 채우고 나갔다가 10분 뒤 다시 들어와, 거래 없는 종목이 자리를 계속 차지했다.
        // (2026-10-07) 기준 완화: 1억·2분 → 0.5억·3분 — 인벤토리 유지는 매수 기준(1억)보다 느슨하게
        const lowLiqNow = tickFieldCheckRef.current.cntgVol && getTradeValue5mEst(sym).value < getLiveParams().evictLowTradeValue5m;
        if (lowLiqNow) { if (!t.L) t.L = nowTs; } else delete t.L;
        if (t.L && nowTs - t.L >= getLiveParams().evictLowSec * 1000) { toRemove.push(sym); removeReason[sym] = `거래 식음(5분 거래대금 ${(getTradeValue5mEst(sym).value / 1e8).toFixed(2)}억 < ${(getLiveParams().evictLowTradeValue5m / 1e8).toFixed(1)}억) ${Math.round(getLiveParams().evictLowSec / 60)}분 지속`; return; }
        if (isTierA) { delete t.B; delete t.D; return; }
        if (!distanceEvictOn) { delete t.B; delete t.D; rankable.push({ symbol: sym, avgDistance }); return; }
        if (!t.B) t.B = nowTs; // A가 아니면 B 타이머(5분) 진행
        if (isTierD) { if (!t.D) t.D = nowTs; } else delete t.D;

        if (t.D && nowTs - t.D >= 30000) { toRemove.push(sym); removeReason[sym] = `매우 멀다(VWAP ${ev!.vwapGapPct.toFixed(2)}% 아래 · 체결강도 ${ev!.exec.toFixed(0)}) 30초 지속`; return; }
        if (isTierC) { // 최근 1분(15초 표본 4~5개) 평균으로 필수조건 2개 이상 부족 = 1분 지속
          toRemove.push(sym); removeReason[sym] = `멀다(필수조건 평균 ${avgGates.toFixed(1)}개 부족${fresh ? '' : ' · 체결 뜸함'}) 1분 지속`; return; }
        if (nowTs - t.B >= 5 * 60 * 1000) { toRemove.push(sym); removeReason[sym] = `근접 상태로 5분 동안 매수 임박(A)까지 못 올라옴 (평균 거리 ${avgDistance.toFixed(0)})`; return; }
        rankable.push({ symbol: sym, avgDistance });
      });

      const evictNow = (symbols: string[]) => {
        if (symbols.length === 0) return;
        setScalperInventory(prev => prev.filter(item => !symbols.includes(item.symbol)));
        symbols.forEach(symbol => {
          delete evictSamplesRef.current[symbol];
          delete tierSinceRef.current[symbol];
          evictedAtRef.current[symbol] = Date.now(); // 재편입 금지(15분)
          const name = currentInventory.find(t => t.symbol === symbol)?.name || symbol;
          addLog(symbol, '매도', 0, 0, `[자동 퇴출] ${name} — ${removeReason[symbol] || '매수 조건에서 멀어짐'} (${Math.round(INVENTORY_REENTRY_COOLDOWN_MS / 60000)}분간 재편입 안 함)`);
        });
      };
      evictNow(toRemove);
      if (toRemove.length > 0) {
        showNotification(`[자동 퇴출] ${toRemove.length}개 종목이 매수 조건에서 멀어 인벤토리에서 제거되었습니다.`, 'info');
      }

      // ③ 빈 슬롯 채우기 + 순위 교체
      if (isAutoFillingRef.current) return; // 중복 실행 방지
      const krSlotsUsed = () => scalperTabsRef.current.filter(t => !/^[A-Za-z]/.test(t.symbol) && !toRemove.includes(t.symbol)).length;
      let emptySlots = MAX_INVENTORY_PER_MARKET - krSlotsUsed();

      // ⏰ 신규 편입은 스캘핑 구간(정규장 09:00~15:15, 애프터 16:00~19:50)에서만
      if (!isNewAutoBuyAllowed()) return;

      const rotationDue = emptySlots <= 0 && rankable.length > 0 && nowTs - lastRotationAtRef.current >= 60000;
      if (emptySlots <= 0 && !rotationDue) return;

      // 추천 검색은 30초에 한 번까지 (KIS 순위 조회 과다 방지 — 중복 호출은 loadScalperRecommendations가 합친다)
      const AUTO_FILL_RETRY_MS = 30 * 1000;
      if (lastAutoFillAttemptRef.current > 0 && nowTs - lastAutoFillAttemptRef.current < AUTO_FILL_RETRY_MS) return;
      lastAutoFillAttemptRef.current = nowTs;

      isAutoFillingRef.current = true;
      try {
        const recommendations = await loadScalperRecommendations();
        const alreadyRegistered = new Set(scalperTabsRef.current.filter(t => !toRemove.includes(t.symbol)).map(t => t.symbol));
        // 실시간 랭킹 실패 시 쓰는 fallback 종목은 자동 편입하지 않는다
        // 🧮 (2026-10-07) 자동 편입 필터 — 10/6 밤에 넣은 조건(체결강도 유지 기준 · 분당 체결 15건 · 5분 거래대금 1억)이
        // 겹치면서 아침에 인벤토리가 거의 채워지지 않았다. 체결강도 조건은 빼고(추천 점수 순서에 이미 반영),
        // 유동성 조건은 "매수 기준의 절반 수준"으로 낮춘다. 어디서 걸러졌는지는 로그로 남긴다.
        const LPf = getLiveParams();
        const WATCH_MIN_TV5 = LPf.fillMinTradeValue5m;
        const cut = { registered: 0, noDetail: 0, lowValue: 0, lowTicks: 0, cooldown: 0 };
        const pool = recommendations.filter(r => {
          if (alreadyRegistered.has(r.symbol) || fallbackSymbolsRef.current.has(r.symbol)) { cut.registered++; return false; }
          if (r.hasDetail === false) { cut.noDetail++; return false; } // 체결강도·VWAP를 실제로 조회하지 못한 종목
          if (r.est5mTradeValue !== undefined && r.est5mTradeValue < WATCH_MIN_TV5) { cut.lowValue++; return false; }
          if (r.recentTicksPerMin !== undefined && r.recentTicksPerMin < watchTicksOfTier(r.liquidityTier || 'SMALL', LPf) * 0.67) { cut.lowTicks++; return false; }
          const at = evictedAtRef.current[r.symbol];
          if (at && nowTs - at < INVENTORY_REENTRY_COOLDOWN_MS) { cut.cooldown++; return false; }
          return true;
        });
        if (emptySlots > 0 && nowTs - (autoFillDiagAtRef.current || 0) >= 5 * 60 * 1000) {
          autoFillDiagAtRef.current = nowTs;
          addLog('SYSTEM', '매수', 0, 0, `[자동 채움 점검] 빈 칸 ${emptySlots} · 추천 ${recommendations.length}종목 → 편입 가능 ${pool.length} (제외: 이미 등록 ${cut.registered} · 상세 미조회 ${cut.noDetail} · 5분 거래대금 ${(WATCH_MIN_TV5 / 1e8).toFixed(1)}억 미만 ${cut.lowValue} · 분당 체결 부족 ${cut.lowTicks} · 재편입 대기 ${cut.cooldown})`);
        }

        // 🔄 순위 교체 — 꽉 찬 상태에서 새 후보가 있으면 거리가 가장 먼 종목 1개를 내보낸다
        if (rotationDue && pool.length > 0) {
          const worst = [...rankable].sort((a, b) => b.avgDistance - a.avgDistance)[0];
          if (worst) {
            removeReason[worst.symbol] = `순위 교체 — 인벤토리에서 매수 조건과 가장 멂 (평균 거리 ${worst.avgDistance.toFixed(0)}) → ${pool[0].name || pool[0].symbol}로 교체`;
            evictNow([worst.symbol]);
            toRemove.push(worst.symbol);
            lastRotationAtRef.current = nowTs;
            emptySlots = MAX_INVENTORY_PER_MARKET - krSlotsUsed();
          }
        }
        if (emptySlots <= 0) return;

        // (2026-10-06) 38종목이면 퇴출도 두 배로 나오므로 한 번에 채우는 수를 3 → 6으로 (19종목일 때는 3 그대로)
        const MAX_FILL_PER_CYCLE = MAX_INVENTORY_PER_MARKET > INVENTORY_LIMIT ? 6 : 3;
        const candidates = pool.slice(0, Math.min(emptySlots, MAX_FILL_PER_CYCLE));
        for (const rec of candidates) {
          if (krSlotsUsed() >= MAX_INVENTORY_PER_MARKET) break;
          handleSelectRecommendationStock(rec);
          if (rec.liquidityTier) tierStateRef.current[rec.symbol] = { tier: rec.liquidityTier, at: Date.now(), seed: true }; // 추천 때 본 구분으로 시작
          // 등록 직후 봇 시작 — 수량은 실제 매수 순간의 가격으로 계산
          updateTab(rec.symbol, { isBotActive: true, tradeQuantity: 0 });
          await new Promise(r => setTimeout(r, 1000)); // 연속 등록 시 상태 업데이트가 겹치지 않도록
        }
        if (candidates.length > 0) {
          showNotification(`[자동 채움] 빈 슬롯 ${candidates.length}개를 실시간 데이터 기반 추천종목으로 자동 등록했습니다.`, 'success');
        }
      } catch (err) {
        console.warn('[자동 슬롯 채움 실패]', err);
      } finally {
        isAutoFillingRef.current = false;
      }
    };

    autoManageInventory();
    const autoManageInterval = setInterval(autoManageInventory, 15000); // (2026-09-30) 30초 → 15초마다 점검
    return () => clearInterval(autoManageInterval);
  }, [isAppInitialized, detectStockStrategies, calculateBuyScore, holdings, loadScalperRecommendations, handleSelectRecommendationStock, showNotification, calcQuantityForTargetAmount, isTradingArmed]);

  // ============================================================
  // 🐕 봇 정지 자동 재개(watchdog)
  // ------------------------------------------------------------
  // 정규장 시간 중에 어떤 이유로든(수동 정지, 오류, 예상 못 한 상태변화 등) 봇이 꺼지면,
  // 몇 초 후 자동으로 다시 켠다. 단, 수량 변경처럼 "의도적으로 잠깐 정지시킨" 경우와 충돌하지
  // 않도록 꺼지자마자 바로 켜지 않고 8초의 유예시간을 준다 — 그 안에 수량을 바꾸고 사용자가
  // 직접 다시 시작하면 이 watchdog은 아무 것도 안 하고 넘어간다.
  // ============================================================
  const stoppedSinceRef = React.useRef<Record<string, number>>({});
  const WATCHDOG_GRACE_MS = 8000;

  useEffect(() => {
    if (!isAppInitialized) return;

    const watchdog = () => {
      if (!isKoreanMarketOpen()) return; // 장 마감 중엔 꺼져있는 게 정상이므로 재개하지 않음

      const now = Date.now();
      scalperTabsRef.current.forEach(tab => {
        const isActive = tab.id === activeTabIdRef.current ? isGapBotActiveRef.current : tab.isBotActive;

        if (isActive) {
          delete stoppedSinceRef.current[tab.symbol]; // 켜져 있으면 정지 기록 초기화
          return;
        }

        const since = stoppedSinceRef.current[tab.symbol];
        if (!since) {
          stoppedSinceRef.current[tab.symbol] = now; // 방금 꺼진 걸 처음 감지 — 유예시간 시작
          return;
        }

        if (now - since >= WATCHDOG_GRACE_MS) {
          // 유예시간이 지났는데도 여전히 꺼져있으면 자동으로 재개
          delete stoppedSinceRef.current[tab.symbol];
          updateTab(tab.symbol, { isBotActive: true });
          if (tab.id === activeTabIdRef.current) {
            isGapBotActiveRef.current = true;
            setIsGapBotActive(true);
          }
          addLog(tab.symbol, '매수', 0, 0, `[자동 재개] ${tab.name} — 정지 상태가 ${WATCHDOG_GRACE_MS / 1000}초 이상 지속되어 자동으로 다시 시작합니다.`);
        }
      });
    };

    const watchdogInterval = setInterval(watchdog, 3000); // 3초마다 점검
    return () => clearInterval(watchdogInterval);
  }, [isAppInitialized]);

  // ============================================================
  // 🛡️ 이미 등록되어 있는 종목 중 이름이 종목코드로 잘못 표시된 것을 자동 교정.
  // ------------------------------------------------------------
  // 등록 시점의 버그로 이름 해석이 실패해서 "386380(386380)"처럼 코드가 이름 자리에 남아있는
  // 기존 항목들을, 등록을 다시 하지 않아도 자동으로 고쳐준다. 이름 조회는 가격과 무관하므로
  // 정규장 시간과 상관없이 동작한다. 같은 종목을 반복해서 재시도하지 않도록 한 번 시도한
  // 심볼은 결과와 무관하게 기록해 둔다.
  // ============================================================
  const nameFixAttemptedRef = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isAppInitialized) return;
    // 🛡️ 인벤토리에 등록된 것뿐 아니라, stocks 배열 전체(추천 모달이 실제로 참조하는 데이터)에서도
    // 이름이 깨진 항목을 찾는다 — 한 번 잘못 등록됐다가 인벤토리에서 삭제된 종목이라도 stocks에는
    // 나쁜 이름이 그대로 남아있을 수 있고, 이게 추천 카드에 "코드=이름"으로 계속 노출되는 원인이다.
    const brokenSymbols = new Set<string>();
    scalperTabsRef.current.forEach(t => {
      if ((!t.name || t.name.trim().length === 0 || t.name === t.symbol) && !nameFixAttemptedRef.current.has(t.symbol)) {
        brokenSymbols.add(t.symbol);
      }
    });
    stocksRef.current.forEach(s => {
      if ((!s.name || s.name.trim().length === 0 || s.name === s.symbol) && /^\d{6}$/.test(s.symbol) && !nameFixAttemptedRef.current.has(s.symbol)) {
        brokenSymbols.add(s.symbol);
      }
    });
    if (brokenSymbols.size === 0) return;

    brokenSymbols.forEach(symbol => {
      nameFixAttemptedRef.current.add(symbol);
      const resolved = getResolvedStockName(symbol);
      if (resolved && resolved !== symbol) {
        setScalperInventory(prev => prev.map(inv => inv.symbol === symbol ? { ...inv, name: resolved } : inv));
        setStocks(prev => prev.map(s => s.symbol === symbol ? { ...s, name: resolved } : s));
      }
    });
  }, [isAppInitialized, scalperTabs, stocks, getResolvedStockName]);

  // Auto KIS initial sync on connection
  const initialKisSyncTriggeredRef = React.useRef(false);
  useEffect(() => {
    if (kisConfig.isConnected && !initialKisSyncTriggeredRef.current) {
      initialKisSyncTriggeredRef.current = true;
      handleSyncKIS();
      const autoSyncTimer = setTimeout(() => {
        handleSyncKIS();
      }, 1000);
      return () => clearTimeout(autoSyncTimer);
    }
  }, [kisConfig.isConnected]);

  // Real-time clock update (clean 1-second tick)
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 🛡️ 매우 중요한 삭제: 여기 있던 "High-frequency simulated/micro-tick price fluctuations" 코드는
  // 실제 KIS 데이터가 아니라, 선택된 종목(selectedStock)에 대해서만 -tickSize/0/+tickSize 중
  // 하나를 랜덤하게 골라 가격을 인위적으로 흔드는 가짜 시뮬레이션이었다. 심각한 점은
  // kisConfig.isConnected(실제 KIS 연동 상태)에서도 이 코드가 그대로 실행되어, 진짜 실시간
  // 시세를 가짜 랜덤값으로 덮어쓰고 있었다는 것이다 — "선택한 종목만 실시간으로 계속 움직이는
  // 것처럼 보인다"는 증상의 실제 원인이 바로 이 코드였다: 그 움직임 자체가 진짜 체결이 아니라
  // 화면 효과용 가짜 데이터였다. 실전 매매 프로그램에서 진짜 가격을 가짜 값으로 덮어쓰는 코드는
  // 매매 판단 자체를 오염시킬 수 있어 완전히 제거한다. 이제 모든 종목의 가격은 오직 웹소켓
  // (H0STCNT0)과 REST 백업(refreshStalePrices)을 통해서만 갱신된다.




  const triggerAutoSell = useCallback(async (stockSymbol: string, buyPrice: number, qty: number, forcedNewAvg?: number, forcedNewTotalQty?: number, slotId?: string) => {
    const currentStock = stocksRef.current.find(s => s.symbol === stockSymbol);
    if (!currentStock) return;
    const planTargetPct = (exitPlanRef.current[stockSymbol] || computeExitPlan(stockSymbol)).targetPct; // 💧 종목별 익절 기준

    const newAvg = forcedNewAvg !== undefined ? forcedNewAvg : (avgPrices[stockSymbol] || buyPrice);
    const targetSellPrice = calculateTargetSellPrice(enableCombinedAvgProfitExit ? newAvg : buyPrice, planTargetPct);

    // [개선] 매수 즉시 매도 주문을 넣지 않고, 실시간으로 감시한다.
    // 🛡️ (2026-09-28) 문구 정정 — 목표가 도달 시 "즉시 매도"가 아니라, 목표 순수익에 도달하면 트레일링 스탑이
    // 준비되고 이후 최고가에서 2틱 내려올 때 매도한다(목표가 즉시 매도 옵션은 꺼져 있음).
    if (stockSymbol === selectedStock?.symbol) {
      setScalperMessage(`[매수완료/익절감시] ${currentStock.name} — 순수익 +${planTargetPct}%(약 ${formatCurrency(targetSellPrice)}) 넘으면 트레일링 준비, 이후 최고가에서 ${TRAILING_DROP_TICKS}틱 하락 시 매도`);
    }
    setBotStatus(`[실시간 익절 감시] ${currentStock.name} 트레일링 준비가 ${formatCurrency(targetSellPrice)} (순수익 +${planTargetPct}%) 도달 감시 중`);
  }, [scalpingTargetProfit, enableCombinedAvgProfitExit, avgPrices, calculateTargetSellPrice, selectedStock?.symbol]);


  // Monitor Pending Buy Orders for Price Changes, Fills, and Auto-Cancellations
  // ============================================================
// Monitor Pending Buy Orders
// - KIS 누적체결수량 기준 신규 체결만 처리
// - 부분체결 중복 반영 방지
// - 실제 체결가격 사용
// - 전량체결/부분체결 동일 로직 적용
// - 미체결 자동취소
// ============================================================

useEffect(() => {
  if (pendingBuyOrders.length === 0) return;

  let cancelled = false;
  const currentPending = [...pendingBuyOrders];

  // 🛡️ (2026-09-29 과제2 매수 순서 점검) 결과를 "대기 목록 통째로 교체"가 아니라 "변경분(삭제·잔량 갱신)"으로만
  // 반영한다. 예전엔 ① 이 effect가 시세 틱마다 재실행되면서 진행 중이던 점검이 cancelled로 끝나면 결과 반영을
  // 통째로 건너뛰었고(체결·취소된 주문이 대기 목록에 계속 남아 슬롯을 차지), ② 반영할 때는 "이번 점검 목록에 없던
  // 주문"을 전부 지워서, 점검 도중 새로 등록된 미체결 매수(executeTrade가 방금 등록한 것)가 사라질 수 있었다
  // (→ 그 주문이 나중에 체결돼도 슬롯·매매 일지에 반영되지 않고 잔고 동기화의 RECOVERED 슬롯으로 뭉쳐 들어감).
  const removedIds = new Set<string>();
  const updatedOrders = new Map<string, PendingBuyOrder>();

  // 📥 매수 체결분 반영 — 정규 체결 확인 / 취소 도중 체결 두 경로 공통.
  // 🛡️ 예전엔 두 경로에 같은 코드가 복사돼 있었고 ① 보유수량을 렌더 시점의 holdings(오래된 값)로 계산했으며
  // ② 새 슬롯을 "지금 화면에서 선택된 종목"의 슬롯 목록(gapInventory)에만 넣어서, 선택 안 된 종목의 체결분이
  // 엉뚱한 종목 슬롯에 들어가거나 그 종목 탭에는 반영되지 않았다. 이제 ref 기준으로 계산하고 해당 종목 탭에 넣는다.
  const applyBuyFill = (order: PendingBuyOrder, newlyFilledQty: number, totalFilledQty: number, filledPrice: number, prefix: string) => {
    const sym = order.symbol;
    const oldQty = holdingsRef.current[sym] || 0;
    const oldAvg = avgPricesRef.current[sym] || filledPrice;
    const newQty = Number((oldQty + newlyFilledQty).toFixed(4));
    const newAvg = newQty > 0 ? Math.round(((oldQty * oldAvg) + (newlyFilledQty * filledPrice)) / newQty) : filledPrice;
    const newHoldings = { ...holdingsRef.current, [sym]: newQty };
    holdingsRef.current = newHoldings; // 다음 엔진 틱이 곧바로 새 보유수량을 보도록
    avgPricesRef.current = { ...avgPricesRef.current, [sym]: newAvg };
    recentLocalTradesRef.current[sym] = { timestamp: Date.now(), quantity: newQty, avgPrice: newAvg };
    setHoldings(newHoldings);
    setAvgPrices(prev => ({ ...prev, [sym]: newAvg }));
    try {
      localStorage.setItem('sleek_holdings', JSON.stringify(newHoldings));
      localStorage.setItem('sleek_avg_prices', JSON.stringify(avgPricesRef.current));
    } catch (e) {}
    if (currentUser) saveUserHoldings(currentUser.uid, newHoldings);

    // 슬롯 — 같은 주문의 부분체결이 여러 번 오면 같은 슬롯에 합친다(같은 id의 슬롯이 둘 생기면 매도 때 둘 다 지워지는 문제 방지)
    const slotId = order.slotId || `SLOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const mergeSlot = (inv: any[]) => {
      const idx = inv.findIndex(s => s && s.id === slotId);
      if (idx < 0) return [...inv, { id: slotId, price: filledPrice, quantity: newlyFilledQty, symbol: sym }];
      const prevSlot = inv[idx];
      const q = (prevSlot.quantity || 0) + newlyFilledQty;
      const p = q > 0 ? Math.round((((prevSlot.price || filledPrice) * (prevSlot.quantity || 0)) + (filledPrice * newlyFilledQty)) / q) : filledPrice;
      const next = [...inv];
      next[idx] = { ...prevSlot, price: p, quantity: q };
      return next;
    };
    if (sym === selectedSymbolRef.current) {
      const next = mergeSlot(gapInventoryRef.current || []);
      gapInventoryRef.current = next;
      setGapInventory(next);
    }
    {
      const curInv = scalperTabsRef.current.find(t => t.symbol === sym)?.gapInventory || [];
      updateTab(sym, { gapInventory: mergeSlot(curInv as any[]) });
    }

    const stockName = stocksRef.current.find(s => s.symbol === sym)?.name || sym;
    addLog(sym, '매수', filledPrice, newlyFilledQty, `${prefix} 신규 ${newlyFilledQty}주 / 누적 ${totalFilledQty}주 / 실제체결가 ${formatCurrency(filledPrice)}`);
    showNotification(`${stockName} KIS 매수 ${newlyFilledQty}주 체결`, "success");
    setBotStatus(`[체결] ${stockName} 실제체결가 ${formatCurrency(filledPrice)} × ${newlyFilledQty}주`);
    setLastTradeType('BUY');
    setGapTradeCount(prev => prev + 1);
    playScalpingSound('BUY');
    transitionLifecycleStatus(sym, 'HOLDING', `매수 체결 확인 (${formatCurrency(filledPrice)} x ${newlyFilledQty})`);
    triggerAutoSell(sym, filledPrice, newlyFilledQty, newAvg, newQty, slotId);
    // (2026-10-04) 엔진 주문의 체결은 이제 전부 이 경로로 들어온다 — 다음 매수 판단이 방금 쓴 돈을 반영하도록 주문가능금액을
    // 바로 줄이고(잔고 동기화 전까지), 곧 KIS 잔고와 맞춘다. (예전엔 주문 직후 9초 폴링에서 체결된 경우에만 하던 처리)
    setOrderableKrw(prev => (prev > 0 ? Math.max(0, prev - filledPrice * newlyFilledQty) : prev));
    setTimeout(() => { if (!syncInProgressRef.current) handleSyncKIS(); }, 2500);
  };

  const syncSoon = (ms: number) => setTimeout(() => { if (!syncInProgressRef.current) handleSyncKIS(); }, ms);

  const checkOrders = async () => {
    try {
      for (const order of currentPending) {
        if (cancelled) break;

        // ⏱️ (2026-10-04) 30초 만료 — 주문 후 (getLiveParams().pendingBuyTtlSec * 1000) 안에 체결되지 않은 매수는 취소한다. 예전엔 시간 만료가 없어서
        // 대기 주문이 몇 분씩 살아 있다가 신호가 사라진 뒤 가격이 내려올 때 한꺼번에 체결됐다. 만료 판단은 시세가 없어도 한다.
        // (2026-10-07 23:20) 추세·마감 매수 주문은 매수1호가에 걸어 두는 주문이라 더 오래 기다린다(carryOrderTtlSec, 기본 60초)
        const orderTtlMs = (trendCarryRef.current[order.symbol] ? getLiveParams().carryOrderTtlSec : getLiveParams().pendingBuyTtlSec) * 1000;
        const isExpired = !!order.id && !order.id.startsWith('SLOT-') && Date.now() - (order.createdAt || 0) >= orderTtlMs;
        const foundStock = stocksRef.current.find(s => s.symbol === order.symbol);
        if (!foundStock && !isExpired) continue; // 그대로 대기
        const currentStock = foundStock || ({ symbol: order.symbol, name: order.symbol, price: 0, market: 'KR' } as Stock);

        const currentPrice = Number(currentStock.price || 0);
        const orderPrice = Number(order.orderPrice || 0);
        if ((currentPrice <= 0 || orderPrice <= 0) && !isExpired) continue;
        const hasPrices = currentPrice > 0 && orderPrice > 0;

        const isUSStock = currentStock.market === 'US' || /^[A-Za-z]/.test(currentStock.symbol) || marketType === 'US';
        const tickSize = getTickSize(orderPrice, isUSStock ? 'US' : 'KR');
        const tickDiff = tickSize > 0 ? (currentPrice - orderPrice) / tickSize : 0;
        const dropPercent = ((orderPrice - currentPrice) / orderPrice) * 100;
        const risePercent = ((currentPrice - orderPrice) / orderPrice) * 100;
        // 🛡️ (2026-09-29) 매수를 현재가 −4틱(4호가)에 내면서, 예전 "주문가 대비 +0.5% 이상 오르면 취소" 조건이 저가주에선
        // 주문 직후 바로 걸렸다(예: 3,000원 종목은 4틱=20원=0.67% → 주문하자마자 +0.5% 초과로 취소). 이제 주문 당시
        // 현재가(주문가 + 진입 틱 수)보다 2틱 이상 더 올라 멀어졌을 때만 취소한다(+0.5% 조건도 함께 만족해야 함).
        const entryOffsetTicks = ({ CURRENT: 0, BID1: 1, BID2: 2, BID3: 3, BID4: 4 } as Record<string, number>)[entryPriceModeRef.current] ?? 0;
        const isRiseCancel = hasPrices && risePercent >= 0.5 && tickDiff >= entryOffsetTicks + 2;
        const isDropCancel = hasPrices && (tickDiff <= -3 || dropPercent >= autoCancelThreshold);
        // 🚦 (2026-10-04) 신호 재확인 — 대기 중 매수 필수 조건(체결강도 기준 이상 · VWAP 위)이 깨지면 즉시 취소한다.
        // 예전엔 주문 후에는 조건을 다시 보지 않아, 신호가 사라진 뒤 가격이 내려올 때 그대로 체결됐다.
        // 실시간 체결이 3초 이내인 종목만 판단한다(시세가 끊긴 상태의 오래된 값으로 취소하지 않도록).
        let signalLostReason = '';
        // (2026-10-07) 보유 중인 종목의 매수 대기 주문은 물타기 주문 — 신호 조건(체결강도·VWAP·Bear)으로 취소하지 않는다(만료·급락 취소는 그대로)
        if (foundStock && hasPrices && !!order.id && !order.id.startsWith('SLOT-') && !(getLiveParams().avgDownEnabled && Number(holdingsRef.current[order.symbol] || 0) > 0) && !trendCarryRef.current[order.symbol] && Date.now() - (lastWsTickAtRef.current[order.symbol] || 0) <= 3000) {
          const LPc = getLiveParams();
          const esNow = Number(foundStock.executionStrength);
          const minEsC = minExecOfTier(getStableTier(order.symbol), LPc);
          if (Number.isFinite(esNow) && esNow > 0 && esNow < minEsC) {
            signalLostReason = `체결강도 ${esNow.toFixed(0)} < ${minEsC}`;
          } else if (LPc.requireAboveVwap) {
            const tvC = getTrueVwaps(order.symbol);
            const vwC = tvC.regular > 0 ? tvC.regular : tvC.after;
            if (vwC > 0 && currentPrice < vwC) signalLostReason = `현재가 ${formatCurrency(currentPrice)} < VWAP ${formatCurrency(vwC)}`;
          }
          // 🐻 (2026-10-07) 대기 중 Bear 재확인 — 엔진이 3초 이내에 계산한 Bear가 다시 기준을 넘으면 취소
          if (!signalLostReason) {
            const lb = lastEntryBearRef.current[order.symbol];
            if (lb && Date.now() - lb.at <= 3000 && lb.bear > LPc.maxBearScoreForEntry) signalLostReason = `Bear ${lb.bear} > ${LPc.maxBearScoreForEntry} (${lb.reasons})`;
          }
        }
        const isSignalLost = signalLostReason !== '';

        // ====================================================
        // 1. 자동취소 (주문가 대비 급락 3틱/설정% 또는 +0.5% 상승 이탈)
        // ====================================================
        if (isDropCancel || isRiseCancel || isExpired || isSignalLost) {
          if (!order.id || order.id.startsWith('SLOT-')) {
            console.log(`[Auto-Cancel] In-flight order cleared: ${formatCurrency(orderPrice)}`);
            removedIds.add(order.id);
            continue;
          }
          if (!kisConfig.isConnected) continue;
          // 🛡️ 이미 취소 요청 중이거나, 직전 취소가 실패해 2초 재시도 쿨다운 중이면 이번엔 건너뛴다(APBK0927 반복 방지 — 매도와 동일)
          if (cancelInFlightRef.current.has(order.id) || shouldSkipSellCancelRetry(order.id)) continue;

          const tickStr = Math.abs(Math.round(tickDiff)) > 0 ? `${Math.abs(Math.round(tickDiff))}틱` : '';
          const cancelReason = isSignalLost && !isDropCancel
            ? `매수 필수 조건 이탈 — ${signalLostReason} (신호 소멸 취소)`
            : isExpired && !isDropCancel && !isRiseCancel
            ? `주문 후 ${Math.round(orderTtlMs / 1000)}초 동안 미체결 (만료 취소)`
            : isDropCancel
            ? `주문가 대비 ${dropPercent.toFixed(2)}%${tickStr ? ` (${tickStr})` : ''} 급락 이탈 (손실 방지 취소)`
            : `주문가 대비 주가 +0.5% 이상 상승 이탈 (+${risePercent.toFixed(2)}%${tickStr ? ` +${tickStr}` : ''}) -> 미체결 자금 회수 자동 취소`;

          cancelInFlightRef.current.add(order.id);
          try {
            setBotStatus(`[KIS API] 주문번호 ${order.id} 자동취소 요청 중...`);
            const cancelRes = await kisService.cancelOrder(
              order.symbol, order.orgNo || "", order.id, (order.quantity || 1).toString(),
              order.ordDvsn || kisConfig.domesticOrderType || "00"
            );
            const cancelOk = !!cancelRes && cancelRes.rt_cd === '0';

            // 🛡️ (과제2) 취소 성공이든 실패든, 취소 직전까지 체결된 분량을 먼저 반영한다. 예전엔 취소가 "성공"하면
            // 체결 확인을 아예 하지 않아서, 5주 중 3주가 이미 체결된 뒤 나머지가 취소된 경우 그 3주가 슬롯·매매 일지에
            // 기록되지 않았다(→ 잔고 동기화 때 RECOVERED 슬롯으로 뭉쳐 들어가고 신호 성과 분석에서 누락).
            let status: any = null;
            try { status = await kisService.checkOrderExecution(order.id); } catch (e) { console.warn('[매수 취소 후 체결 확인 실패]', e); }
            if (status?.found) {
              const totalFilledQty = Number(status.ccldQty || 0);
              const newlyFilledQty = totalFilledQty - (processedFilledQtyRef.current[order.id] || 0);
              if (newlyFilledQty > 0) {
                processedFilledQtyRef.current[order.id] = totalFilledQty;
                applyBuyFill(order, newlyFilledQty, totalFilledQty, Number(status.price || 0) > 0 ? Number(status.price) : orderPrice, '[취소 중 체결]');
              }
            }

            if (cancelOk) {
              clearSellCancelRetryCooldown(order.id);
              addLog(order.symbol, '매수', orderPrice, order.quantity, `[KIS 자동취소] ${cancelReason}`);
              try { onCaseBuyCancelled(order.id, isSignalLost && !isDropCancel ? 'SIGNAL_LOST' : isDropCancel ? 'DROP' : isRiseCancel ? 'RISE' : 'EXPIRED', cancelReason); } catch { /* 무시 */ }
              showNotification(`${currentStock.name} KIS 매수 미체결 자동 취소 완료`, "info");
              setBotStatus(`[KIS 취소완료] ${formatCurrency(orderPrice)} 미체결 주문 취소`);
              removedIds.add(order.id);
              syncSoon(300);
            } else if (status?.found && Number(status.rmndQty || 0) <= 0) {
              // 취소는 거부됐지만 KIS 기준 이미 종료된 주문(전량 체결 또는 이미 취소) — 체결분은 위에서 반영됨
              clearSellCancelRetryCooldown(order.id);
              addLog(order.symbol, '매수', orderPrice, order.quantity, `[주문정리] 이미 종료된 주문 (${cancelRes?.msg1 || '취소 불가'})`);
              try { onCaseBuyCancelled(order.id, 'KIS_CLOSED', '취소 요청 전에 이미 종료된 주문'); } catch { /* 무시 */ }
              removedIds.add(order.id);
              syncSoon(500);
            } else {
              // 🛡️ (과제2) 취소 실패 + 주문이 아직 살아있거나 상태를 모름 — 예전엔 여기서도 대기 목록에서 지워버려서
              // 살아있는 매수 주문이 감시에서 빠질 수 있었다. 이제 목록에 남겨두고 2초 뒤 다시 시도한다.
              markSellCancelRetryCooldown(order.id);
              addLog(order.symbol, '매수', orderPrice, order.quantity, `[매수 취소 보류] 취소 실패(${cancelRes?.msg1 || '응답 없음'}) — 주문이 살아있을 수 있어 계속 감시합니다`);
            }
          } catch (e: any) {
            console.error("[KIS Auto-Cancel Exception]:", e);
            markSellCancelRetryCooldown(order.id);
            addLog(order.symbol, '매수', orderPrice, order.quantity, `[매수 취소 보류] 취소 요청 오류(${e?.message || '알 수 없음'}) — 계속 감시합니다`);
          } finally {
            cancelInFlightRef.current.delete(order.id);
          }
          continue;
        }

        // ====================================================
        // 2. KIS 실제 주문 체결상태 확인 (주문번호별 1.5초 간격)
        // ====================================================
        if (order.id && Date.now() - (lastOrderCheckAtRef.current[order.id] || 0) < ORDER_CHECK_INTERVAL_MS) continue;
        if (order.id) lastOrderCheckAtRef.current[order.id] = Date.now();

        try {
          const status = await kisService.checkOrderExecution(order.id);
          if (!status?.found) continue; // 아직 체결내역에 안 보임 — 그대로 대기

          const totalFilledQty = Number(status.ccldQty || 0);
          // 🛡️ (과제2) 원 주문수량은 KIS가 준 값(ordQty)을 우선 쓴다. 예전엔 로컬 quantity(부분체결 후 등록된 잔량)를
          // 원 주문수량으로 착각해서, 누적 체결수량과 비교할 때 "잔량이 남았는데 끝난 것"으로 판단할 수 있었다.
          const ordQty = Number(status.ordQty || 0) > 0 ? Number(status.ordQty) : Number(order.originalQuantity ?? order.quantity ?? 0);
          const newlyFilledQty = totalFilledQty - (processedFilledQtyRef.current[order.id] || 0);

          if (newlyFilledQty > 0) {
            processedFilledQtyRef.current[order.id] = totalFilledQty;
            applyBuyFill(order, newlyFilledQty, totalFilledQty, Number(status.price || 0) > 0 ? Number(status.price) : orderPrice, '[실제체결]');
          }

          if (ordQty > 0 && totalFilledQty >= ordQty) {
            removedIds.add(order.id); // 전량 체결 — 감시 종료
            continue;
          }

          const rmndQty = Number(status.rmndQty ?? Math.max(0, ordQty - totalFilledQty));
          // (2026-10-06) 잔량 0이어도 종료가 확인되지 않았으면 감시를 계속한다 — 살아 있는 주문을 목록에서 지우면
          // 그 종목에 매수가 다시 나가고 취소도 되지 않는다.
          if (rmndQty <= 0 && (status as any).closedConfirmed === false) continue;
          if (rmndQty <= 0) {
            // 🛡️ (과제2) 전량 체결이 아닌데 미체결 잔량이 0 = KIS에서 취소·거부된 주문(KIS 앱에서 직접 취소, 장 종료 등).
            // 예전엔 이 경우를 구분하지 못해 대기 목록에 영원히 남아 슬롯을 차지하고 "동일가 미확정 주문" 차단을 일으켰다.
            addLog(order.symbol, '매수', orderPrice, Math.max(0, ordQty - totalFilledQty), `[매수 주문 종료] 체결 ${totalFilledQty}/${ordQty}주 — 나머지는 KIS에서 취소/거부됨`);
            try { onCaseBuyCancelled(order.id, 'KIS_CLOSED', `체결 ${totalFilledQty}/${ordQty}주 후 KIS에서 취소·거부`); } catch { /* 무시 */ }
            removedIds.add(order.id);
            syncSoon(500);
            continue;
          }

          if (rmndQty !== order.quantity || order.originalQuantity !== ordQty) {
            updatedOrders.set(order.id, { ...order, quantity: rmndQty, originalQuantity: ordQty });
          }
        } catch (e) {
          console.error("[KIS Fill Check Error]:", e);
        }
      }
    } catch (e) {
      console.error("[Pending Buy Monitor Error]:", e);
    } finally {
      // 변경분만 반영 — 점검 도중 새로 추가된 주문은 건드리지 않는다
      if (removedIds.size > 0 || updatedOrders.size > 0) {
        setPendingBuyOrders(prev => prev
          .filter(o => !removedIds.has(o.id))
          .map(o => updatedOrders.get(o.id) || o));
        pendingBuyOrdersRef.current = pendingBuyOrdersRef.current
          .filter(o => !removedIds.has(o.id))
          .map(o => updatedOrders.get(o.id) || o);
      }
    }
  };

  checkOrders();

  return () => {
    cancelled = true;
  };

}, [
  pendingBuyOrders,
  stocks,
  autoCancelThreshold,
  marketType,
  exchangeRate,
  currentUser,
  playScalpingSound,
  triggerAutoSell
]);

  // 화면 목록에 없는 종목의 매도 대기 주문용 REST 현재가 캐시 (종목당 10초)
  const orphanPriceCacheRef = React.useRef<Record<string, { price: number; at: number; name?: string }>>({});
  // Monitor Pending Sell Orders for Price Changes, Fills, and Market Target Hits
  useEffect(() => {
    if (pendingSellOrders.length === 0) return;

    let updated = false;
    const currentPending = [...pendingSellOrders];
    const nextPending: PendingSellOrder[] = [];

    const checkSellOrders = async () => {
      for (const order of currentPending) {
        let currentStock: any = stocksRef.current.find(s => s.symbol === order.symbol);
        if (!currentStock) {
          // 🛡️ (2026-09-30) 화면 종목 목록에 없는 종목의 매도 대기 주문(주로 정정취소가능조회로 복구된 고아 주문)은
          // 예전엔 여기서 그냥 건너뛰어 -0.5% 하락 자동취소·체결 확인이 영원히 안 됐다(대우건설 17,990원 주문 사례).
          // 이제 REST 현재가(종목당 10초 간격)로 대신 판단한다. 조회 실패면 이번 사이클만 건너뜀.
          const cacheHit = orphanPriceCacheRef.current[order.symbol];
          let restPrice = cacheHit && Date.now() - cacheHit.at < 10000 ? cacheHit.price : 0;
          if (!restPrice && kisConfig.isConnected) {
            try {
              const p = await kisService.getPrice(order.symbol);
              if (p && p.current > 0) {
                restPrice = p.current;
                orphanPriceCacheRef.current[order.symbol] = { price: p.current, at: Date.now(), name: p.name };
              }
            } catch { /* 무시 */ }
          }
          if (!restPrice) {
            nextPending.push(order);
            continue;
          }
          currentStock = {
            symbol: order.symbol,
            name: orphanPriceCacheRef.current[order.symbol]?.name || order.symbol,
            price: restPrice,
            market: 'KR',
          };
        }

        const isUSStock = currentStock.market === 'US' || /^[A-Za-z]/.test(currentStock.symbol) || marketType === 'US';
        const tickSize = getTickSize(order.orderPrice, isUSStock ? 'US' : 'KR');
        const tickDiff = (currentStock.price - order.orderPrice) / tickSize;
        const dropPercentFromSell = ((order.orderPrice - currentStock.price) / order.orderPrice) * 100;

        // Auto-Cancel Criteria for Pending Sell Order:
        // 미체결 상태에서 주가가 매도 주문가 대비 -0.5% 이상 하락 시 해당 매도 주문 자동 취소
        const isSellDropCancel = dropPercentFromSell >= 0.5;

        if (isSellDropCancel) {
          const tickStr = Math.abs(Math.round(tickDiff)) > 0 ? `${Math.abs(Math.round(tickDiff))}틱` : '';
          const cancelReason = `매도 주문가 대비 주가 -0.5% 이상 하락 (-${dropPercentFromSell.toFixed(2)}%${tickStr ? ` -${tickStr}` : ''}) -> 미체결 매도 주문 자동 취소`;

          if (kisConfig.isConnected) {
            // 🛡️ 직전 취소 시도가 REJECTED/UNKNOWN으로 끝났다면 쿨다운이 끝날 때까지 이번 틱은
            // 건너뛴다 (APBK0927 반복 호출 방지) — 주문은 그대로 pending에 남겨 다음 사이클에 재확인.
            if (shouldSkipSellCancelRetry(order.id)) {
              nextPending.push(order);
              continue;
            }

            setBotStatus(`[KIS API] 주문 번호(${order.id}) 0.5% 하락 미체결 매도 상태 확인 중...`);

            const cancelResult = await cancelPendingSellOrderSafely(order);

            if (cancelResult === 'CANCELLED' || cancelResult === 'ALREADY_CLOSED') {
              clearSellCancelRetryCooldown(order.id);
              updated = true;
              // 📒 이미 종료된 주문이면 그게 "체결"이었는지 확인해서 매매 일지에 기록(잔고 재동기화보다 먼저)
              await recordFillOfClosedSellOrder(order);

              if (cancelResult === 'ALREADY_CLOSED' && order.slotId) {
                // 이미 체결/취소되어 종료된 주문 — 관련 슬롯도 정리
                if (order.symbol === selectedStock?.symbol) {
                  const next = gapInventoryRef.current.filter(s => s.id !== order.slotId);
                  gapInventoryRef.current = next;
                  setGapInventory(next);
                }
                const curInv = scalperTabsRef.current.find(t => t.symbol === order.symbol)?.gapInventory || [];
                updateTab(order.symbol, { gapInventory: curInv.filter(s => s.id !== order.slotId) });
              }

              addLog(
                order.symbol, '매도', order.orderPrice, order.quantity,
                cancelResult === 'CANCELLED'
                  ? `[KIS 0.5%하락 매도취소] ${cancelReason}`
                  : `[매도주문 종료 확인] 이미 체결/취소되어 미체결 잔량 없음`
              );
              showNotification(
                cancelResult === 'CANCELLED'
                  ? `${currentStock.name} KIS 매도 주문 자동 취소 완료 (주문가 대비 -0.5% 하락)`
                  : `${currentStock.name} 매도 취소 전 이미 체결/취소 완료`,
                cancelResult === 'CANCELLED' ? "info" : "success"
              );
              setBotStatus(`[KIS 취소완료] ${currentStock.name} 미체결 매도 취소 완료`);
              setTimeout(() => {
                if (!syncInProgressRef.current) {
                  handleSyncKIS();
                }
              }, 300);

              continue; // 실제로 종료된 주문 — nextPending에 넣지 않는다
            }

            // 🛡️ 취소 실패(REJECTED)/상태확인 실패(UNKNOWN) — KIS에 주문이 여전히 살아있을 수
            // 있으므로 절대 pending에서 제거하지 않는다. 다음 사이클에서 다시 상태를 확인한다.
            // 다만 바로 다음 틱에 재시도하면 APBK0927이 반복되므로 쿨다운을 건다.
            markSellCancelRetryCooldown(order.id);
            if (cancelResult === 'REJECTED') {
              addLog(order.symbol, '매도', order.orderPrice, order.quantity, `[매도취소 보류] KIS가 취소를 거부했습니다. 주문상태를 유지합니다.`);
              setBotStatus(`[매도취소 보류] ${currentStock.name} 주문 상태를 확인할 수 없어 유지합니다`);
            }
            nextPending.push(order);
            continue;
          }
          // KIS 미연동이면 그대로 유지
          nextPending.push(order);
          continue;
        }

        {
          // 🛡️ 매수 쪽과 동일한 이유 — stocks 갱신마다 재실행되는 effect이므로 주문번호별로
          // 최소 간격 안에는 재조회하지 않는다.
          if (
            order.id &&
            Date.now() - (lastOrderCheckAtRef.current[order.id] || 0) < ORDER_CHECK_INTERVAL_MS
          ) {
            nextPending.push(order);
            continue;
          }
          if (order.id) lastOrderCheckAtRef.current[order.id] = Date.now();

          // KIS Real Mode: Query execution status
          try {
            const status = await kisService.checkOrderExecution(order.id);
            if (status.isFullyFilled) {
              updated = true;
              const fillPrice = status.price || order.orderPrice;
              const pendingPnlPercent = (order.buyPrice && order.buyPrice > 0)
                ? Number((((fillPrice - order.buyPrice) / order.buyPrice) * 100).toFixed(2))
                : undefined;
              // 🛡️ 매매 일지에는 이번에 새로 체결된 수량만 남긴다(부분체결 때 이미 기록한 분량 제외)
              const loggedFillQty = Math.max(0, (status.ordQty || order.quantity) - (processedFilledQtyRef.current[order.id] || 0));
              addLog(order.symbol, '매도', fillPrice, loggedFillQty || (status.ordQty || order.quantity), `[KIS 지정가 매도 체결] 전량 체결 완료`, { exitReason: order.exitReason, pnlPercent: pendingPnlPercent });
              showNotification(`${currentStock.name} KIS 매도 주문 체결 완료!`, "success");
              transitionLifecycleStatus(order.symbol, 'COMPLETED', `매도 체결 확인 (${formatCurrency(status.price || order.orderPrice)} x ${status.ordQty || order.quantity})`);
              
              // Free up slot if paired with a buyPrice
              if (order.symbol === selectedStock?.symbol) {
                if (order.slotId) {
                  const updatedInv = gapInventoryRef.current.filter(s => s.id !== order.slotId);
                  gapInventoryRef.current = updatedInv;
                  setGapInventory(updatedInv);
                } else if (order.buyPrice) {
                  const idx = gapInventoryRef.current.findIndex(s => s.price === order.buyPrice);
                  if (idx !== -1) {
                    const updatedInv = [...gapInventoryRef.current];
                    updatedInv.splice(idx, 1);
                    gapInventoryRef.current = updatedInv;
                    setGapInventory(updatedInv);
                  }
                }
              }
              {
                let prevInv = scalperTabsRef.current.find(t => t.symbol === order.symbol)?.gapInventory || [];
                if (order.slotId) {
                  prevInv = prevInv.filter(s => s.id !== order.slotId);
                } else if (order.buyPrice) {
                  const idx = prevInv.findIndex(s => s.price === order.buyPrice);
                  if (idx !== -1) {
                    const updatedInv = [...prevInv];
                    updatedInv.splice(idx, 1);
                    prevInv = updatedInv;
                  }
                }
                updateTab(order.symbol, { gapInventory: prevInv });
              }

              // Immediately update holdings and avgPrices in React state for instant UI reflection
              // 🛡️ (2026-09-28) 이미 반영한 체결분(부분체결 때 차감한 수량)은 빼고, 이번에 새로 체결된 만큼만 차감
              const totalOrdQtyForFill = status.ordQty || order.quantity;
              const alreadyProcessedSellQty = processedFilledQtyRef.current[order.id] || 0;
              const filledQty = Math.max(0, totalOrdQtyForFill - alreadyProcessedSellQty);
              delete processedFilledQtyRef.current[order.id];
              const oldQty = holdingsRef.current[order.symbol] || 0;
              const nextQty = Math.max(0, oldQty - filledQty);
              const newHoldings = { ...holdingsRef.current };
              if (nextQty <= 0) {
                delete newHoldings[order.symbol];
                setAvgPrices(prev => {
                  const nextAvg = { ...prev };
                  delete nextAvg[order.symbol];
                  try { localStorage.setItem('sleek_avg_prices', JSON.stringify(nextAvg)); } catch (e) {}
                  return nextAvg;
                });
                delete recentLocalTradesRef.current[order.symbol];
              } else {
                newHoldings[order.symbol] = Number(nextQty.toFixed(4));
                if (recentLocalTradesRef.current[order.symbol]) {
                  recentLocalTradesRef.current[order.symbol].quantity = nextQty;
                }
              }
              holdingsRef.current = newHoldings; // 다음 엔진 틱이 곧바로 새 보유수량을 보도록
              setHoldings(newHoldings);
              try { localStorage.setItem('sleek_holdings', JSON.stringify(newHoldings)); } catch (e) {}
              if (currentUser) saveUserHoldings(currentUser.uid, newHoldings);

              playScalpingSound('SELL');
              setTimeout(() => {
  if (!syncInProgressRef.current) {
    handleSyncKIS();
  }
}, 500);
            } else if (status.found && Number(status.rmndQty || 0) <= 0) {
              // 🛡️ (2026-09-29) 전량 체결이 아닌데 미체결 잔량이 0 = KIS에서 취소·거부된 주문(KIS 앱에서 직접 취소하거나
              // 직접 매도, 장 종료, 일부 체결 후 취소 등). 예전엔 이 경우를 구분하지 못해 대기 목록에 영원히 남았다 →
              // 카드가 "매도중"에 멈추고, 엔진이 "이미 미체결 매도 주문이 있어 체결을 기다립니다"로 트레일링 매도를
              // 계속 건너뛰는 원인이 됐다. 새로 체결된 분량이 있으면 반영(매매 일지 포함)한 뒤 목록에서 제거한다.
              updated = true;
              const cumulativeClosed = Number(status.ccldQty || 0);
              const newlyClosedFill = cumulativeClosed - (processedFilledQtyRef.current[order.id] || 0);
              delete processedFilledQtyRef.current[order.id];
              if (newlyClosedFill > 0) {
                const oldQty = holdingsRef.current[order.symbol] || 0;
                const nextQty = Math.max(0, oldQty - newlyClosedFill);
                const newHoldings = { ...holdingsRef.current };
                if (nextQty <= 0) { delete newHoldings[order.symbol]; delete recentLocalTradesRef.current[order.symbol]; }
                else newHoldings[order.symbol] = Number(nextQty.toFixed(4));
                holdingsRef.current = newHoldings;
                setHoldings(newHoldings);
                try { localStorage.setItem('sleek_holdings', JSON.stringify(newHoldings)); } catch (e) {}
                if (currentUser) saveUserHoldings(currentUser.uid, newHoldings);
                addLog(order.symbol, '매도', status.price || order.orderPrice, newlyClosedFill, `[KIS 지정가 매도 일부체결] ${newlyClosedFill}주 체결 후 나머지 주문 종료 (누적 ${cumulativeClosed}/${status.ordQty || order.quantity}주)`, { exitReason: order.exitReason });
              }
              addLog(order.symbol, '매도', order.orderPrice, Math.max(0, (status.ordQty || order.quantity) - cumulativeClosed), `[매도 주문 종료] 체결 ${cumulativeClosed}/${status.ordQty || order.quantity}주 — 나머지는 KIS에서 취소/거부됨`);
              setTimeout(() => { if (!syncInProgressRef.current) handleSyncKIS(); }, 500);
              continue; // 종료된 주문 — 목록에서 제거
            } else if (status.ccldQty > 0) {
              // 🛡️ (2026-09-28 매도 순서 점검) status.ccldQty는 이 주문의 "누적" 체결수량이다. 예전엔
              // 이 분기가 1.5초마다 다시 돌 때마다 누적값 전체를 보유수량에서 또 빼고, 같은 "일부체결"
              // 로그(=매매 일지 체결 기록)를 반복해서 남겼다 — 예: 10주 중 4주 체결 상태가 유지되면
              // 1.5초마다 보유수량이 4주씩 줄고 매매 일지에 4주 매도가 계속 쌓였다. 이제 이미 반영한
              // 누적 체결수량을 주문번호별로 기억해서(processedFilledQtyRef) 새로 늘어난 만큼만 반영한다.
              const cumulativeSellFilled = Number(status.ccldQty || 0);
              const alreadyProcessedPartial = processedFilledQtyRef.current[order.id] || 0;
              const newlyFilledSellQty = cumulativeSellFilled - alreadyProcessedPartial;
              const remainingQty = (status.ordQty || order.quantity) - cumulativeSellFilled;
              if (newlyFilledSellQty <= 0) {
                // 새로 체결된 수량 없음 — 상태 그대로 유지
                nextPending.push(order);
                continue;
              }
              updated = true;
              processedFilledQtyRef.current[order.id] = cumulativeSellFilled;
              if (remainingQty > 0) {
                nextPending.push({
                  ...order,
                  quantity: remainingQty
                });
              }
              // Immediately update holdings for partial sell (새로 체결된 만큼만)
              const oldQty = holdingsRef.current[order.symbol] || 0;
              const nextQty = Math.max(0, oldQty - newlyFilledSellQty);
              const newHoldings = { ...holdingsRef.current };
              if (nextQty <= 0) {
                delete newHoldings[order.symbol];
                delete recentLocalTradesRef.current[order.symbol];
              } else {
                newHoldings[order.symbol] = Number(nextQty.toFixed(4));
                if (recentLocalTradesRef.current[order.symbol]) {
                  recentLocalTradesRef.current[order.symbol].quantity = nextQty;
                }
              }
              holdingsRef.current = newHoldings; // 다음 엔진 틱이 곧바로 새 보유수량을 보도록
              setHoldings(newHoldings);
              try { localStorage.setItem('sleek_holdings', JSON.stringify(newHoldings)); } catch (e) {}
              if (currentUser) saveUserHoldings(currentUser.uid, newHoldings);

              addLog(order.symbol, '매도', status.price || order.orderPrice, newlyFilledSellQty, `[KIS 지정가 매도 일부체결] ${newlyFilledSellQty}주 체결 (누적 ${cumulativeSellFilled}주, 잔량 ${Math.max(0, remainingQty)}주)`, { exitReason: order.exitReason });
              showNotification(`${currentStock.name} KIS 매도 주문 일부 체결 (${newlyFilledSellQty}주)`, "info");
              playScalpingSound('SELL');
              setTimeout(() => {
  if (!syncInProgressRef.current) {
    handleSyncKIS();
  }
}, 500);
            } else {
              nextPending.push(order);
            }
          } catch (e) {
            console.warn(e);
            nextPending.push(order);
          }
        }
      }

      // 🛡️ (2026-09-29) 결과는 "변경분"으로만 반영한다 — 예전엔 이번 점검 시작 때의 목록으로 통째로 덮어써서,
      // 이 effect가 시세 틱마다 겹쳐 실행될 때 ① 방금 제거된 주문을 늦게 끝난 옛 점검이 되살리거나(카드가 매도중에
      // 멈춤) ② 점검 도중 새로 등록된 미체결 매도를 지워버릴 수 있었다.
      if (updated) {
        const keptIds = new Set(nextPending.map(o => o.id));
        const removedIds = new Set(currentPending.filter(o => !keptIds.has(o.id)).map(o => o.id));
        const updatedMap = new Map(nextPending.map(o => [o.id, o] as const));
        const applyDelta = (list: PendingSellOrder[]) => list
          .filter(o => !removedIds.has(o.id))
          .map(o => updatedMap.get(o.id) || o);
        pendingSellOrdersRef.current = applyDelta(pendingSellOrdersRef.current);
        setPendingSellOrders(prev => applyDelta(prev));
      }
    };

    checkSellOrders();
  }, [pendingSellOrders, stocks, marketType, exchangeRate, currentUser, playScalpingSound]);

  // Auto-Sell Order Enforcer & Average Down Target Price Sync
  // ------------------------------------------------------------

  const activeStrategyDetection = useMemo(() => {
    if (!selectedStock) return { isPullback: false, isBreakout: false, isVwapSupport: false, isVolumeProfile: false, activeCount: 0, rsi: 50, sma5: 0, sma20: 0, vwap: 0, poc: 0, cvd: 0, isBullishAbsorption: false, isBearishAbsorption: false, bb: { upper: 0, middle: 0, lower: 0 }, momentumPositive: false, isNearLowerBand: false, isNearUpperBand: false, lastPrice: 0, hasVolumeMomentum: false };
    return detectStockStrategies(selectedStock);
  }, [selectedStock, detectStockStrategies]);

  // Trailing Stop Loss State to track the peak price after each buy
  // 📈 보유 중 최고가 — 트레일링 스탑 기준. 매매 엔진이 매 틱 최신값을 읽고 써야 하므로 ref로 관리한다
  // (예전엔 state라서 엔진 안에서는 항상 시작 시점 값만 보였고, 고점 대비 하락폭이 늘 0이라 트레일링이 작동하지 않았다).
  // 🛡️ 매우 중요한 수정(2026-09-28, 사용자 지적) — 이 값이 순수 in-memory ref라서 브라우저
  // 새로고침(또는 Railway 재배포, 탭 재시작 등)이 일어나면 완전히 사라졌다. 예를 들어 어떤 종목이
  // 고점 대비 +1.5%까지 올랐다가 +0.7%로 내려온 시점에 새로고침하면, 그 순간의 현재가(+0.7%에
  // 해당하는 가격)가 "새 고점"으로 다시 기록되어버린다 — 실제로는 이미 고점에서 3틱 넘게 밀려
  // 트레일링 스탑이 체결됐어야 할 포지션이, 새로고침 때문에 고점 기억이 사라져서 "아직 고점 근처"로
  // 착각하고 계속 보유하게 되는 문제였다. 이제 localStorage에 저장/복원해서 새로고침해도 고점
  // 기억이 유지되도록 한다.
  const HIGH_WATER_MARK_STORAGE_KEY = 'sleek_scalper_high_water_marks_v1';
  const loadPersistedHighWaterMarks = (): Record<string, number> => {
    try {
      const saved = localStorage.getItem(HIGH_WATER_MARK_STORAGE_KEY);
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch {
      return {};
    }
  };
  const highWaterMarkRef = React.useRef<Record<string, number>>(loadPersistedHighWaterMarks());
  const highWaterMarkSaveThrottleRef = React.useRef<number>(0);
  const persistHighWaterMarks = (force: boolean = false) => {
    const now = Date.now();
    if (!force && now - highWaterMarkSaveThrottleRef.current < 3000) return; // 3초 쓰로틀 — 매 틱마다 쓰면 과도함
    highWaterMarkSaveThrottleRef.current = now;
    try {
      localStorage.setItem(HIGH_WATER_MARK_STORAGE_KEY, JSON.stringify(highWaterMarkRef.current));
    } catch {
      // localStorage 용량 초과 등은 조용히 무시 — 다음 틱/매도 시점에 다시 저장 시도됨
    }
  };

  // 2. High-speed automatic trading decisions (Multi-Stock Automatic Engine - Only Started Stocks)
  useEffect(() => {
    const hasAnyActiveBot = isGapBotActive || scalperTabsRef.current.some(t => t.isBotActive);

    // 🛡️ 앱 초기화가 끝났더라도 실시간 데이터 워밍업이 끝나기 전에는 절대 매매 엔진을
    // 실행하지 않는다 — 로딩 직후 잘못된 가격/history/센서로 매수 판단이 이뤄지는 걸 막는다.
    if (!isTradingArmed) {
      setScalperMessage('실시간 데이터 안정화 중... 자동매매 대기');
      return;
    }

    if (!hasAnyActiveBot) {
      setScalperMessage("대기 중...");
      return;
    }

    const gapInterval = setInterval(async () => {
      if (isExecutingRef.current) return;
      if (!isKoreanMarketOpen()) {
        setScalperMessage("장 마감 (정규장 09:00~15:30, 애프터마켓 16:00~20:00[9/14~] KST 외 — 감시 대기 중)");
        return;
      }
      // 🛡️ 매우 중요한 수정: 이 값들(selectedStock/balance/holdings/activeTabId)이 effect의
      // dependency array에 있으면, 선택된 종목의 가격이 바뀌거나(초당 여러 번 가능) 계좌가
      // 동기화될 때마다(20초마다) 이 매매 엔진 루프 전체가 재시작(clearInterval → 새
      // setInterval)되어, scalpingSpeed로 설정한 주기를 제대로 못 지키고 판단이 계속 끊기고
      // 있었다. "매수 메시지는 뜨는데 실제 주문은 안 들어간다", "선택 안 한 종목은 감시가 안
      // 되는 것 같다"는 증상들이 전부 이 하나의 원인에서 나왔을 가능성이 매우 높다. 이제
      // dependency array에서 이 값들을 빼고, 매 tick마다 ref에서 최신값을 직접 읽어와서 기존
      // 변수명 그대로 로컬 상수로 캡처한다 (아래 기존 로직은 전혀 손대지 않아도 그대로 최신값을
      // 쓰게 된다).
      const selectedStock = stocksRef.current.find(s => s.symbol === selectedSymbolRef.current) || null;
      const balance = balanceRef.current;
      const holdings = holdingsRef.current;
      const avgPrices = avgPricesRef.current;       // 🛡️ 최신 평균 매수가 (예전엔 엔진 시작 시점 값에 고정돼 있었음)
      const orderableKrw = orderableKrwRef.current; // 🛡️ 최신 매수가능금액
      const activeTabId = activeTabIdRef.current;
      isExecutingRef.current = true;
      try {
        // 내가 '스타트'한 종목(스캘핑 탭에서 isBotActive가 true이거나 현재 활성 탭이 시작된 종목)만 선별
        const startedTabs = scalperTabsRef.current.filter(t => t.id === activeTabId ? isGapBotActive : t.isBotActive);
        if (startedTabs.length === 0) {
          if (!isGapBotActive) setScalperMessage("대기 중...");
          return;
        }

        for (const tabItem of startedTabs) {
        let stockItem = stocksRef.current.find(s => s.symbol === tabItem.symbol || s.symbol === tabItem.id) || (selectedStock?.symbol === tabItem.symbol ? selectedStock : null);
        // 🛡️ 매우 중요한 수정: 예전에는 stocks 배열에서 못 찾고 선택된 종목도 아니면 stockItem이
        // null이 되어 그 종목의 매수/매도 판단 자체가 완전히 건너뛰어졌다. 이게 "선택한 종목만
        // 매매/로그가 되고 나머지 등록 종목은 감시조차 안 되는" 것처럼 보이던 진짜 원인이었다.
        // 인벤토리 자체가 갖고 있는 실시간 시세(market 네임스페이스)를 폴백으로 사용해서, stocks
        // 배열 동기화 여부와 무관하게 등록된 모든 종목이 항상 평가 대상이 되도록 한다.
        if (!stockItem && tabItem.price > 0) {
          stockItem = {
            symbol: tabItem.symbol,
            name: tabItem.name,
            price: tabItem.price,
            change: 0,
            changePercent: tabItem.changePercent || 0,
            volume: '0',
            history: [],
            market: /^[A-Za-z]/.test(tabItem.symbol) ? 'US' : 'KR'
          } as Stock;
        }
        if (!stockItem) continue;

        const isSelected = selectedStock && stockItem.symbol === selectedStock.symbol;
        const currentPrice = stockItem.price;
        if (!currentPrice || currentPrice <= 0) continue;

        // ==========================================================
        // 🛡️ 종목별 실시간 데이터 안전장치 — 최종 방어선
        // ----------------------------------------------------------
        // 가격이 존재한다는 것만으로는 매매하지 않는다. 반드시 실제 WebSocket tick이 최근에
        // 들어왔고, 최소 워밍업 tick 수를 확보한 종목만 매매 판단한다. 설령 어떤 이유로 센서가
        // 전부 켜지더라도, 이 종목의 실제 WebSocket tick이 부족하면 매수 판단 자체를 하지 않는다.
        // ==========================================================
        // 🔴 (2026-09-29) 매우 중요한 수정 — 예전엔 이 조건(최근 1.5초 안에 실제 체결 틱이 있고, 틱 10개 이상 워밍업)에
        // 걸리면 그 종목을 통째로 건너뛰어서 **매수뿐 아니라 손절·트레일링 매도까지** 판단하지 않았다. 1.5초 동안
        // 체결이 없는 순간은 대부분의 종목에서 아주 흔해서, 보유 종목의 손절(-0.6%)이 -2%대까지 밀려도 나가지 않는
        // 원인이 됐다(새로고침 직후 워밍업 중에도 마찬가지). 이제 이 조건은 "신규 매수"와 "센서 기반 신호 매도"에만
        // 적용하고, 보유 종목의 손절·트레일링(가격만으로 판단하는 규칙)은 틱이 뜸해도 마지막 가격으로 계속 판단한다.
        const isFeedFresh = (() => {
          const _tickCount = wsTickCountRef.current[stockItem.symbol] || 0;
          const _lastWsTick = lastWsTickAtRef.current[stockItem.symbol] || 0;
          const _tickAge = _lastWsTick > 0 ? Date.now() - _lastWsTick : Infinity;
          return _tickCount >= MIN_WARMUP_TICKS && _tickAge <= MAX_WS_TICK_AGE_MS;
        })();
        if (!isFeedFresh && !((holdings[stockItem.symbol] || 0) > 0)) continue; // 미보유 종목은 예전처럼 건너뜀

        const strat = detectStockStrategies(stockItem);
        const { rsi, bb, sma5, momentumPositive, isNearLowerBand, isNearUpperBand, lastPrice } = strat;

        // 🔄 전략 센서 스냅샷을 인벤토리의 sensors 네임스페이스에 기록 (값이 실제로 바뀐 경우에만 갱신)
        setScalperInventory(prev => {
          const idx = prev.findIndex(it => it.symbol === stockItem.symbol);
          if (idx === -1) return prev;
          const cur = prev[idx].sensors;
          const roundedRsi = Math.round(rsi);
          if (
            cur.pullback === strat.isPullback &&
            cur.breakout === strat.isBreakout &&
            cur.vwap === strat.isVwapSupport &&
            cur.cvd === strat.isVolumeProfile &&
            cur.volumeMomentum === momentumPositive &&
            cur.rsi === roundedRsi &&
            cur.activeCount === strat.activeCount
          ) return prev; // 변화 없으면 그대로 반환 (불필요한 재렌더 방지)

          // 센서가 OFF→ON으로 바뀐 항목만 GLOBAL TRADE LOGS에 기록 (가격 변동처럼 매번 기록하지 않음)
          const sensorTransitions: string[] = [];
          if (!cur.pullback && strat.isPullback) sensorTransitions.push('PULLBACK(눌림목) 감지');
          if (!cur.breakout && strat.isBreakout) sensorTransitions.push('BREAKOUT(돌파) 감지');
          if (!cur.vwap && strat.isVwapSupport) sensorTransitions.push('VWAP SUPPORT 감지');
          if (!cur.cvd && strat.isVolumeProfile) sensorTransitions.push('CVD(거래량 프로파일) 감지');
          if (sensorTransitions.length > 0) {
            setTimeout(() => {
              sensorTransitions.forEach(msg => addLog(stockItem.symbol, '매수', stockItem.price || 0, 0, `[전략센서] ${msg}`));
            }, 0);
          }

          const next = [...prev];
          next[idx] = {
            ...prev[idx],
            sensors: {
              pullback: strat.isPullback,
              breakout: strat.isBreakout,
              vwap: strat.isVwapSupport,
              cvd: strat.isVolumeProfile,
              shortTermMomentum: momentumPositive,
              // 🛡️ 여기 예전엔 volumeMomentum에 momentumPositive(SMA5>SMA20 비교값)가 잘못
              // 들어가 있었다 — 진짜 거래량 모멘텀이 아니라 이동평균 비교값이 들어간 오기였다.
              volumeMomentum: strat.hasVolumeMomentum,
              rsi: roundedRsi,
              activeCount: strat.activeCount,
              lastUpdatedAt: Date.now()
            }
          };
          return next;
        });

        let minPrice = 0;
        let maxPrice = 0;
        if (tabItem.gapBuyPrice > 0 && tabItem.gapSellPrice > 0) {
          minPrice = tabItem.gapBuyPrice;
          maxPrice = tabItem.gapSellPrice;
        } else if (isSelected && gapBuyPrice > 0 && gapSellPrice > 0) {
          minPrice = gapBuyPrice;
          maxPrice = gapSellPrice;
        } else {
          const isUS = stockItem.market === 'US' || /^[A-Za-z]/.test(stockItem.symbol) || marketType === 'US';
          const limits = calculateStockLimits(currentPrice, stockItem.changePercent, isUS);
          minPrice = limits.lowerLimit;
          maxPrice = limits.upperLimit;
        }

        // 🛡️ 예전엔 여기서 itemTradeQty(등록 시점/전역 설정 기반 수량)를 미리 정해뒀지만, 이제
        // 수량은 매수 조건이 실제로 충족된 순간(아래 calcQuantityForTargetAmount 호출부)에만
        // 계산하므로 더 이상 필요 없다.
        // 🛟 슬롯3 방어 대기 중이면 1회 추가 매수 허용(대기 전환 시점 슬롯 수 + 1), 하드 손절선 근처면 추가 매수 금지
        const rescueForBuy = rescueRef.current[tabItem.symbol];
        // 보유 0주면 방어 상태는 이미 끝난 포지션의 잔재 — 새 진입에 추가 슬롯을 주지 않는다 (2026-09-30)
        const rescueWaiting = RESCUE_SLOT_ENABLED && !!rescueForBuy && rescueForBuy.phase === 'WAITING' && (holdings[tabItem.symbol] || 0) > 0;
        const rescueBuyBlocked = rescueWaiting && (() => {
          const px = Number(stockItem?.price) || 0;
          if (!(px > 0)) return true;
          return calculateNetProfitPercent(rescueForBuy!.baseAvg, px, 'KR') <= RESCUE_HARD_STOP_NET_PCT + RESCUE_SKIP_NEAR_HARD_PCT;
        })();
        const itemMaxSlots = rescueWaiting
          ? rescueForBuy!.baseSlots + 1
          : Math.min(MAX_SLOTS_PER_STOCK, tabItem.maxSlots || (isSelected ? maxSlots : 10));
        // (2026-09-29) 종목별 저장값(등록 당시 복사된 옛 값, 화면에서 바꿀 방법 없음) 대신 전역 진입 호가(기본 4호가)를 모든 종목에 적용
        const itemEntryMode = entryPriceModeRef.current || 'BID1';

        // RSI 단독 임계값(과매도/과매수) 판단은 더 이상 쓰지 않는다 — 매수는 점수제(RSI 45~65 구간
        // 가점)로, 매도는 RSI 80+ 복합조건(체결강도 하락 + VWAP 이탈)으로 대체되었다.

        // A. PROFIT MAX BUY Condition: Check buys inside min ~ max range
        if (currentPrice >= minPrice && currentPrice <= maxPrice && lastPrice > 0) {
          const isPullbackCond = strat.isPullback;
          const isBreakoutCond = strat.isBreakout;
          const isVwapSupportCond = strat.isVwapSupport;
          const isVolumeProfileCond = strat.isVolumeProfile;

          const isAll4SensorsOn = strat.activeCount === 4 || (isPullbackCond && isBreakoutCond && isVwapSupportCond && isVolumeProfileCond);

          const currentSelectedStrats = (selectedScalperStrategiesRef.current && selectedScalperStrategiesRef.current.length > 0)
            ? selectedScalperStrategiesRef.current
            : (['PULLBACK', 'BREAKOUT', 'VWAP_SUPPORT', 'VOLUME_PROFILE_CVD'] as ('PULLBACK' | 'BREAKOUT' | 'VWAP_SUPPORT' | 'VOLUME_PROFILE_CVD')[]);

          let meetsBuyCriteria = false;
          let strategyLabel = "AI 스캘퍼";
          // 📒 매매 일지용 — 이번 판단에서 계산된 매수 점수/점수 항목 (점수제 모드에서만 채워짐)
          let journalScore: number | undefined;
          let journalBreakdown: string[] | undefined;

          {
            // 🎯 점수제 — 매수 판단은 이 점수제 하나로 통일한다(예전 '최고수익 AI' 센서조합 모드는 삭제).
            // 여러 매수 신호에 가중치를 매겨 그룹별 상한을 적용한 합계(최대 70점)가 BUY_SCORE_THRESHOLD(30점)
            // 이상이고, 가격 이벤트 점수가 있고, 추격매수 위험이 없을 때 진입한다.
            // 🛡️ 예전엔 선택된 종목 하나의 liveOrderbook만 참조해서, 선택 안 한 종목은 이 두 조건을
            // 절대 충족할 수 없었다. 이제 종목별로 저장된 자기 자신의 호가 데이터를 참조한다.
            const myOrderbook = liveOrderbooksRef.current[stockItem.symbol];
            // 🎯 매도호가 실제 소진 이벤트 — 예전엔 매수/매도 총잔량의 정적 스냅샷 비율(3배 이상)만
            // 보고 있어서 허수호가 위험이 있었다(+5점으로 낮춰둠). 이제 총매도잔량의 최근 이력을
            // 추적해서, "실제로 잔량이 빠르게 줄어들고 있는지"(체결로 소진되는 중인지)를 함께
            // 확인한다. 매도1호가 잔량 자체(10호가 중 최우선 호가)까지는 지금 파싱하는 데이터로
            // 알 수 없어 총매도잔량(10호가 합계) 추세로 근사하지만, "가격이 동시에 상승 중"이라는
            // 조건을 반드시 함께 걸어서 단순 취소로 인한 잔량 감소와 구분한다 — 취소라면 가격이
            // 오를 이유가 없지만, 진짜 체결 소진이라면 매도벽을 먹으면서 가격이 오른다.
            const askDepletionNow = Date.now();
            const askVolHist = askVolumeHistoryRef.current[stockItem.symbol] || [];
            const currentAskVol = Number(myOrderbook?.totalAskVolume || 0);
            const ASK_DEPLETION_WINDOW_MS = 8000; // 최근 8초 전 잔량과 비교
            const oldEntry = askVolHist.find(e => askDepletionNow - e.time >= ASK_DEPLETION_WINDOW_MS);
            const priceRisingForDepletion = prevPriceForComboRef.current[stockItem.symbol] !== undefined && currentPrice > prevPriceForComboRef.current[stockItem.symbol]!;
            const isRealDepletionEvent = !!(
              oldEntry && oldEntry.value > 0 && currentAskVol > 0 &&
              (currentAskVol <= oldEntry.value * 0.7) && // 8초 전 대비 30% 이상 감소
              priceRisingForDepletion
            );
            if (isRealDepletionEvent) askDepletionEventAtRef.current[stockItem.symbol] = askDepletionNow;
            if (currentAskVol > 0) {
              askVolumeHistoryRef.current[stockItem.symbol] = [...askVolHist.filter(e => askDepletionNow - e.time < 15000), { value: currentAskVol, time: askDepletionNow }];
            }
            const depletionEventAt = askDepletionEventAtRef.current[stockItem.symbol];
            const hasRecentDepletionEvent = depletionEventAt !== undefined && (askDepletionNow - depletionEventAt) <= 20000; // 20초 신선도 창

            const askDepletion = (
              myOrderbook &&
              Number(myOrderbook.totalBidVolume || 0) > 0 &&
              Number(myOrderbook.totalAskVolume || 0) > 0 &&
              (Number(myOrderbook.totalBidVolume) / Number(myOrderbook.totalAskVolume)) >= 3
            );
            const bidAskRatio = (
              myOrderbook &&
              Number(myOrderbook.totalAskVolume || 0) > 0
            ) ? (Number(myOrderbook.totalBidVolume || 0) / Number(myOrderbook.totalAskVolume)) * 100 : undefined;
            const { score: buyScore, breakdown: buyScoreBreakdown, blocked: buyBlocked, priceEventScore, gate: buyGate } = calculateBuyScore(stockItem, strat, askDepletion, bidAskRatio, hasRecentDepletionEvent, true);
            // 📊 (2026-09-30) 인벤토리 퇴출 순위용 — 엔진이 계산한 최신 매수 판단을 저장(퇴출 점검은 이 값만 읽는다)
            {
              const esNow = Number(stockItem.executionStrength) || 0;
              const lowLiquidity = tickFieldCheckRef.current.cntgVol && getTradeValue5mEst(stockItem.symbol).value < EVICT_LOW_TRADE_VALUE_5M;
              // (2026-09-30 A/B 등급) 눌림목은 필수가 아니라 기준 점수(+10)로 반영 — 거리 계산용 점수에서 미리 뺀다
              const LPe = getLiveParams();
              const gatesFailed = (esNow >= watchExecOfTier(getStableTier(stockItem.symbol), LPe) ? 0 : 1) + (buyGate?.aboveVwap ? 0 : 1) + (lowLiquidity ? 1 : 0);
              lastBuyEvalRef.current[stockItem.symbol] = {
                at: Date.now(), score: buyScore - (buyGate?.pullback ? 0 : Math.max(0, LPe.bScoreThreshold - LPe.aScoreThreshold)), gatesFailed, exec: esNow,
                vwapGapPct: strat.vwap > 0 ? ((currentPrice - strat.vwap) / strat.vwap) * 100 : 0,
              };
            }
            journalScore = buyScore;
            journalBreakdown = buyScoreBreakdown;
            // 🛡️ 하드필터 ①: 추격매수 위험(buyBlocked)이 감지되면, 점수가 임계값을 넘어도 매수하지
            // 않는다. 하드필터 ②(사용자 요청): 가격 이벤트 그룹(VWAP돌파/전고점돌파/눌림목/돌파)
            // 점수가 0이면, 실제로 가격이 움직이는 신호가 하나도 없다는 뜻이므로 순수 수급/호가
            // 점수만으로는 매수하지 않는다 — 총점이 임계값을 넘어도 마찬가지다.
            const hasNoPriceEvent = (priceEventScore ?? 0) <= 0;
            // 🌙 애프터마켓 스캘핑 구간이면 기준 점수를 올리고(30→40), 전용 필터 5개를 모두 통과해야 한다
            const isAfterScalp = getTradingSession() === 'AFTER_SCALP';
            // 🅰️🅱️ (2026-09-30) 진입 등급 — A: 눌림목 있음 45점(애프터 60) / B: 눌림목 없음 55점(애프터 70)
            // 🧪 매수 기준값은 자기최적화의 "현재 전략 버전"에서 읽는다 (기본값 = 2026-09-30 실전 설정, [적용]/[되돌리기]로 즉시 변경)
            const LP = getLiveParams();
            const entryGrade: 'A' | 'B' = buyGate?.pullback ? 'A' : 'B';
            const scoreThreshold = (entryGrade === 'A' ? LP.aScoreThreshold : LP.bScoreThreshold) + (isAfterScalp ? LP.afterExtraScore : 0);
            // 🔒 공통 차단 — 하나라도 걸리면 점수·등급과 무관하게 매수 금지
            const gateFails: string[] = [];
            const esGate = Number(stockItem.executionStrength) || 0;
            if (LP.blockD && buyGate?.bidDominant) gateFails.push('D(매수호가우세) 발생');
            // 💧 (2026-10-06) 구분별 매수 장벽 — 대형 110 · 중형 120 · 소형 130(체결강도), 40 · 30 · 20건(60초 체결). 전략 버전 값.
            const entryTier = getStableTier(stockItem.symbol);
            const tierMinEs = minExecOfTier(entryTier, LP);
            const tierMinTicks = minTicksOfTier(entryTier, LP);
            const tierBMinEs = tierMinEs + Math.max(0, LP.bMinExecutionStrength - LP.minExecutionStrength);
            if (!(esGate >= tierMinEs)) gateFails.push(`체결강도 ${esGate.toFixed(0)} < ${tierMinEs}`);
            if (entryGrade === 'B' && esGate >= tierMinEs && !(esGate >= tierBMinEs)) gateFails.push(`B급 체결강도 ${esGate.toFixed(0)} < ${tierBMinEs}`);
            if (LP.requireAboveVwap && !buyGate?.aboveVwap) gateFails.push('VWAP 아래');
            if (LP.blockPriorHighBreakout && buyGate?.freshPeakBreakout) gateFails.push('전고점 돌파 직후');
            // 💧 유동성 필수조건 (2026-09-30) — 5분 거래대금 · 스프레드 · 60초 체결
            {
              const act = getTickActivity(stockItem.symbol);
              if (tickFieldCheckRef.current.cntgVol) {
                const tv = getTradeValue5mEst(stockItem.symbol).value;
                if (tv < LP.minTradeValue5m) gateFails.push(`5분 거래대금 ${(tv / 1e8).toFixed(1)}억 < ${LP.minTradeValue5m / 1e8}억`);
              }
              if (act.ticks60s < tierMinTicks) gateFails.push(`60초 체결 ${act.ticks60s}건 < ${tierMinTicks}건`);
              const ob = liveOrderbooksRef.current[stockItem.symbol];
              const b1 = Number(ob?.bidPrice1 || 0); const a1 = Number(ob?.askPrice1 || 0);
              const obFresh = Date.now() - (lastWsOrderbookTickAtRef.current[stockItem.symbol] || 0) <= 10000;
              if (!(b1 > 0 && a1 > 0) || !obFresh) gateFails.push('실시간 호가 없음');
              else {
                const sp = Math.round((a1 - b1) / getTickSize(currentPrice || b1, 'KR'));
                if (sp > LP.maxSpreadTicks) gateFails.push(`스프레드 ${sp}틱 > ${LP.maxSpreadTicks}틱`);
              }
            }
            // 🐂🐻 (2026-10-02) Bull/Bear 진입 필터 — Bull ≥ minBullScore(12) · Bear ≤ maxBearScoreForEntry(5)
            const entryBB = (() => {
              const obB = liveOrderbooksRef.current[stockItem.symbol];
              const has = (t: string) => buyScoreBreakdown.some(x => x.startsWith(t));
              const b1 = Number(obB?.bidPrice1 || 0), a1 = Number(obB?.askPrice1 || 0);
              return calculateBullBear(LP as BullBearParams, {
                exec: esGate, rsi: strat.rsi, C: has('CVD/POC'), Q: !!strat.hasVolumeMomentum, VA: !!buyGate?.aboveVwap,
                // 🔧 (2026-10-03) 진입 판단에도 포지션 평가·자기최적화 분석과 같은 입력을 넘긴다 — 예전엔 아래 3개가 빠져 있어
                // 실전 필터와 분석이 서로 다른 Bull/Bear 점수를 썼다(VWAP 이격 가점, 누적CVD 가점, CVD감소 감점이 실전에서만 빠짐).
                realCvd: (stockItem as any)?.cumulativeCvd ?? (stockItem as any)?.realCvd,
                cvdDelta: (stockItem as any)?.cvdDelta,
                vwapGapPct: strat.vwap > 0 ? ((currentPrice - strat.vwap) / strat.vwap) * 100 : undefined,
                realAskDepletion: has('매도호가실제소진'), vwapExpansion: has('VWAP이격우상향'), goldenCross: has('골든크로스'), askDominant: has('매도호가우세'),
                spreadTicks: b1 > 0 && a1 > 0 ? Math.round((a1 - b1) / getTickSize(currentPrice || b1, 'KR')) : undefined,
                bidVol: Number(obB?.totalBidVolume || 0), askVol: Number(obB?.totalAskVolume || 0),
              });
            })();
            // 📏 평소 잔량 비율 표본 쌓기 + 평소 대비로 다시 계산한 Bear(기록 전용 — 매수 판단에는 쓰지 않는다)
            //   팬오션처럼 매도 호가가 늘 두꺼운 종목은 절대 비율로는 항상 '호가 약세'가 되어 Bear 기준을 넘는다.
            //   현재 비율 ÷ 평소(중앙값)가 0.5 이하면 초약세(+4), 0.8 이하면 약세(+3), 0.77 이하면 매도호가우세(+3)로 다시 센다.
            const bookRel = (() => {
              const obR = liveOrderbooksRef.current[stockItem.symbol];
              const bq = Number(obR?.totalBidVolume || 0), aq = Number(obR?.totalAskVolume || 0);
              if (!(bq > 0 && aq > 0)) return undefined;
              const ratioNow = bq / aq;
              const nowR = Date.now();
              const arr = bookRatioSamplesRef.current[stockItem.symbol] || (bookRatioSamplesRef.current[stockItem.symbol] = []);
              if (arr.length === 0 || nowR - arr[arr.length - 1].t >= 5000) {
                arr.push({ t: nowR, r: ratioNow });
                while (arr.length > 0 && nowR - arr[0].t > 30 * 60 * 1000) arr.shift();
              }
              if (arr.length < 36) return undefined; // 3분치가 안 되면 '평소'를 말할 수 없다
              const sorted = arr.map(x => x.r).sort((x, y) => x - y);
              const base = sorted[Math.floor(sorted.length / 2)];
              if (!(base > 0)) return undefined;
              const rel = ratioNow / base;
              const absPts = entryBB.bearReasons.reduce((acc, x) => acc + (x.startsWith('호가초약세') ? 4 : x.startsWith('호가약세') ? 3 : x.startsWith('매도호가우세') ? 3 : 0), 0);
              const relPts = (rel <= 0.5 ? 4 : rel <= 0.8 ? 3 : 0) + (rel <= 1 / 1.3 ? 3 : 0);
              return { basePct: Number((base * 100).toFixed(1)), rel: Number(rel.toFixed(2)), bearRel: Math.max(0, entryBB.bear - absPts + relPts), samples: arr.length };
            })();
            // 🕯️ (2026-10-02) 1분봉 연속 양봉 매수 차단 — 완성된 1분봉이 N개(기본 3) 이상 연속 양봉이면 추격 매수로 보고 금지
            const bullishRun1m = getConsecutiveBullish1mCandles(stockItem.symbol);
            // (2026-10-04) 사용자 요청으로 '1분봉 연속 양봉' 매수 차단 삭제 — 연속 양봉 수는 신호 기록·진입 점검 로그에만 남긴다
            if (entryBB.bull < LP.minBullScore) gateFails.push(`Bull ${entryBB.bull} < ${LP.minBullScore}`);
            // ⏳ (2026-10-07) 신호 유지 확인 — Bear 초과로 차단된 적이 있으면 그 뒤 10초 동안은 Bear가 기준 안으로 들어와도 매수하지 않는다.
            //   10/7 솔루엠: Bear 10(차단) → 3초 뒤 Bear 3(통과)으로 매수 → 손절. 얇은 호가·작은 CVD 변화에 점수가 순간적으로 뒤집힌 경우였다.
            {
              const nowB = Date.now();
              lastEntryBearRef.current[stockItem.symbol] = { bear: entryBB.bear, bull: entryBB.bull, at: nowB, reasons: entryBB.bearReasons.join('·') };
              if (entryBB.bear > LP.maxBearScoreForEntry) {
                bearBlockAtRef.current[stockItem.symbol] = nowB;
                gateFails.push(`Bear ${entryBB.bear} > ${LP.maxBearScoreForEntry} (${entryBB.bearReasons.join('·')})`);
              } else {
                const since = nowB - (bearBlockAtRef.current[stockItem.symbol] || 0);
                if (since < (getLiveParams().bearHoldSec * 1000)) gateFails.push(`Bear 차단 후 ${Math.floor(since / 1000)}초 (${(getLiveParams().bearHoldSec * 1000) / 1000}초 유지 확인)`);
              }
            }
            meetsBuyCriteria = !buyBlocked && !hasNoPriceEvent && gateFails.length === 0 && buyScore >= scoreThreshold;
            // 📋 [진입 점검] 로그 — 판정이 바뀔 때마다(같은 판정은 30초에 한 번) 기록해 "왜 샀는지/왜 안 샀는지" 추적
            {
              const verdict = buyBlocked ? '차단(추격위험)' : gateFails.length > 0 ? `차단(${gateFails.join(', ')})` : hasNoPriceEvent ? '차단(가격이벤트 없음)' : buyScore < scoreThreshold ? `점수 미달(${buyScore} < ${scoreThreshold})` : `진입 ${entryGrade}급`;
              const prevLog = entryCheckLogRef.current[stockItem.symbol];
              const nowL = Date.now();
              if (!prevLog || (prevLog.verdict !== verdict && nowL - prevLog.at >= 5000) || nowL - prevLog.at >= 30000) {
                entryCheckLogRef.current[stockItem.symbol] = { verdict, at: nowL };
                const g = buyGate?.groups;
                const hasC = buyScoreBreakdown.some(b => b.startsWith('CVD/POC'));
                const hasB = buyScoreBreakdown.some(b => b.startsWith('돌파'));
                const vwTxt = strat.vwap > 0 ? `${buyGate?.aboveVwap ? '위' : '아래'} ${(((currentPrice - strat.vwap) / strat.vwap) * 100).toFixed(2)}%` : '없음';
                addLog(stockItem.symbol, '매수', currentPrice, 0,
                  `[진입 점검] C:${hasC ? 1 : 0} E:${esGate >= 130 ? 1 : 0} D:${buyGate?.bidDominant ? 1 : 0} P:${buyGate?.pullback ? 1 : 0} B:${hasB ? 1 : 0} · 체결강도 ${esGate.toFixed(0)} · VWAP ${vwTxt} · RSI ${Math.round(strat.rsi)} · ` +
                  `수급 ${g?.ex ?? 0} / 가격 ${g?.pe ?? 0} / 위치 ${g?.vw ?? 0} / 추세 ${g?.su ?? 0} / 호가 ${g?.ob ?? 0} = ${buyScore}점 (기준 ${scoreThreshold}, ${entryGrade}급) · Bull ${entryBB.bull} / Bear ${entryBB.bear} / OBI ${entryBB.obi.toFixed(2)} · 1분 연속양봉 ${bullishRun1m} → ${verdict}`);
              }
            }
            if (meetsBuyCriteria) journalBreakdown = [...buyScoreBreakdown, `진입등급 ${entryGrade}`];
            strategyLabel = buyBlocked
              ? `🚨 [매수 금지 - 추격위험] ${buyScoreBreakdown.join(', ') || ''}`
              : gateFails.length > 0
              ? `⏸️ [매수 보류 - 필수조건: ${gateFails.join(', ')}] 점수 ${buyScore}/100 · ${buyScoreBreakdown.join(', ') || '신호 부족'}`
              : hasNoPriceEvent
              ? `⏸️ [매수 보류 - 가격이벤트 없음] ${buyScoreBreakdown.join(', ') || '신호 부족'}`
              : `🎯 [${isAfterScalp ? '애프터 ' : ''}${entryGrade}급 · 점수 ${buyScore}/100 · 기준 ${scoreThreshold}] ${buyScoreBreakdown.join(', ') || '신호 부족'}`;
            if (meetsBuyCriteria && isAfterScalp) {
              const gate = checkAfterEntryGate(stockItem);
              if (!gate.ok) {
                meetsBuyCriteria = false;
                strategyLabel = `🌙 [애프터 진입 차단] ${gate.reasons.join(', ')}`;
                const lastAt = afterGateLogAtRef.current[stockItem.symbol] || 0;
                if (Date.now() - lastAt > 60000) {
                  afterGateLogAtRef.current[stockItem.symbol] = Date.now();
                  addLog(stockItem.symbol, '매수', currentPrice, 0, `[애프터 진입 차단] 점수 ${buyScore}/100 (기준 ${scoreThreshold}) 통과했으나 — ${gate.reasons.join(', ')}`);
                }
              } else {
                journalBreakdown = [...buyScoreBreakdown, `진입등급 ${entryGrade}`, '애프터 필터 통과'];
              }
            }
            // 💪 체결강도 하한 — 점수를 넘었어도 체결강도가 100 미만(매도 체결이 더 많음)이거나 값이 없으면 사지 않는다
            if (meetsBuyCriteria) {
              const es = Number(stockItem.executionStrength);
              if (!(es >= tierMinEs)) {
                meetsBuyCriteria = false;
                strategyLabel = `⏸️ [매수 보류 - 체결강도 ${Number.isFinite(es) ? es.toFixed(0) : '없음'} < ${tierMinEs}] 점수 ${buyScore}/100 · ${buyScoreBreakdown.join(', ')}`;
                noteMissedSignal(stockItem.symbol, stockItem.name, `체결강도 ${tierMinEs} 미만`, strategyLabel, currentPrice);
              }
            }
            // 🧪 (2026-09-30 자기최적화 1단계) 신호 스냅샷 기록 — 통과(PASS) + 기준 근처 탈락(NEAR)
            try {
              const sessNow = getTradingSession();
              if (sessNow === 'REGULAR_SCALP' || sessNow === 'AFTER_SCALP') {
                const missCount = gateFails.length + (hasNoPriceEvent ? 1 : 0) + (buyScore < scoreThreshold ? 1 : 0);
                const kind: SignalKind | null = meetsBuyCriteria ? 'PASS'
                  : (!buyBlocked && missCount <= 1 && buyScore >= scoreThreshold - 10) ? 'NEAR'
                  // 👀 (2026-10-06) 관찰 신호 — 핵심 조건(체결강도 기준 이상 · VWAP 위)만 맞으면 나머지가 여러 개 부족해도 기록한다.
                  // 주문은 나가지 않고 가상 매매 결과와 부족했던 조건 전부(blockReasons)만 남는다. 종목당 5분에 1건.
                  // (2026-10-06) 체결강도 100 이상으로 넓힘 — 130 미만 구간 자료가 쌓이지 않아 구분별 기준을 비교할 수 없었다
                  : (!buyBlocked && esGate >= 100 && !!buyGate?.aboveVwap) ? 'WATCH' : null;
                if (kind && canRecordSignal(stockItem.symbol, kind)) {
                  const base = buildEntrySignals(stockItem, strat, buyScore, buyScoreBreakdown, strategyLabel);
                  const ob = liveOrderbooksRef.current[stockItem.symbol];
                  const execWin = (execStrengthWindowRef.current[stockItem.symbol] || []).filter(e => Date.now() - e.time <= 4000);
                  const execBase = execWin.length >= 2 ? execWin.reduce((a, e) => a + e.value, 0) / execWin.length : undefined;
                  const volHist = volumeHistoryRef.current[stockItem.symbol] || [];
                  const volAvg = volHist.length >= 3 ? volHist.reduce((a, v) => a + v, 0) / volHist.length : 0;
                  const askHist = askVolumeHistoryRef.current[stockItem.symbol] || [];
                  const askNow = Number(ob?.totalAskVolume || 0);
                  const askOld = askHist.find(e => Date.now() - e.time >= 8000);
                  const tv5 = tickFieldCheckRef.current.cntgVol ? Math.round(getTradeValue5mEst(stockItem.symbol).value) : undefined;
                  const cumulativeCvdNow =
  (stockItem as any)?.cumulativeCvd ??
  (stockItem as any)?.realCvd;

const cvdDeltaNow =
  (stockItem as any)?.cvdDelta;
                  const recordedSignalId = recordSignal({
                    time: Date.now(),
                    session: sessNow === 'AFTER_SCALP' ? 'AFTER' : 'REGULAR',
                    symbol: stockItem.symbol, name: stockItem.name || stockItem.symbol,
                    kind, grade: entryGrade,
                    verdict: meetsBuyCriteria ? `통과 ${entryGrade}급` : (gateFails[0] || (hasNoPriceEvent ? '가격이벤트 없음' : `점수 미달(${buyScore} < ${scoreThreshold})`)),
                    blockReasons: [...gateFails, ...(hasNoPriceEvent ? ['가격이벤트 없음'] : []), ...(buyScore < scoreThreshold ? [`점수 ${buyScore} < ${scoreThreshold}`] : [])],
                    score: buyScore, threshold: scoreThreshold,
                    groups: buyGate?.groups || { ex: 0, pe: 0, vw: 0, su: 0, ob: 0 },
                    breakdown: [...buyScoreBreakdown],
                    flags: {
                      C: buyScoreBreakdown.some(x => x.startsWith('CVD/POC')), E: (Number(stockItem.executionStrength) || 0) >= 130,
                      D: !!buyGate?.bidDominant, P: !!buyGate?.pullback, B: !!strat.isBreakout, VA: !!buyGate?.aboveVwap,
                      peakBreakout: !!buyGate?.freshPeakBreakout, A: !!base.flags.A, Q: !!base.flags.Q,
                    },
                    price: currentPrice,
                    execStrength: base.execStrength,
                    execDelta4s: execBase !== undefined ? Math.round((Number(stockItem.executionStrength) || 0) - execBase) : undefined,
                    ticks60s: base.ticks60s,
                    tradeValue5m: tv5,
                    volRatio: volAvg > 0 && volHist.length > 0 ? Number((volHist[volHist.length - 1] / volAvg).toFixed(2)) : undefined,
                    changePercent: base.changePercent,
                    rsi: base.rsi,
                    sma5: strat.sma5 > 0 ? Math.round(strat.sma5) : undefined,
                    sma20: strat.sma20 > 0 ? Math.round(strat.sma20) : undefined,
                    vwap: strat.vwap > 0 ? Math.round(strat.vwap) : undefined,
                    vwapGapPct: strat.vwap > 0 ? Number((((currentPrice - strat.vwap) / strat.vwap) * 100).toFixed(3)) : undefined,
                    cvd: typeof cumulativeCvdNow === 'number' ? Math.round(cumulativeCvdNow) : undefined,
                    cvdDelta: typeof cvdDeltaNow === 'number' ? Math.round(cvdDeltaNow) : undefined,
                    bid1: Number(ob?.bidPrice1 || 0) || undefined,
                    ask1: Number(ob?.askPrice1 || 0) || undefined,
                    spreadTicks: base.spreadTicks,
                    bidVol: Number(ob?.totalBidVolume || 0) || undefined,
                    askVol: askNow || undefined,
                    bidAskRatio: base.bidAskRatio,
                    bookRatioBasePct: bookRel?.basePct, bookRatioRel: bookRel?.rel, bearRel: bookRel?.bearRel,
                    askVolChange8sPct: askOld && askOld.value > 0 && askNow > 0 ? Number((((askNow - askOld.value) / askOld.value) * 100).toFixed(1)) : undefined,
                    avgRule: { stepMult: Number(getLiveParams().avgDownStepMult) || 1.5, maxSlots: Math.max(1, Math.floor(Number(getLiveParams().avgDownMaxSlots) || 5)), gapSec: Number(getLiveParams().avgDownMinGapSec) || 30 },
                    rule: { targetNet: computeExitPlan(stockItem.symbol).targetPct, stopNet: computeExitPlan(stockItem.symbol).stopPct, trailTicks: Math.max(1, Number(getLiveParams().sellTrailTicks) || TRAILING_DROP_TICKS) },
                    tier: entryTier, ...getRecentPriceStats(stockItem.symbol, currentPrice),
                    bullishRun1m,
                    bull: entryBB.bull, bear: entryBB.bear, obi: Number(entryBB.obi.toFixed(3)),
                    bullReasons: entryBB.bullReasons, bearReasons: entryBB.bearReasons,
                  });
                  // 🗂️ 신호마다 거래 케이스를 만들고 서로 ID를 적어 둔다
                  if (recordedSignalId && kind !== 'WATCH') { // 관찰 신호는 거래 케이스를 만들지 않는다(자기최적화 표본과 섞이지 않게)
                    try {
                      const caseId = onCaseSignal({ id: recordedSignalId, kind, symbol: stockItem.symbol, name: stockItem.name || stockItem.symbol, time: Date.now(), price: currentPrice });
                      setSignalTradeCase(recordedSignalId, caseId);
                    } catch { /* 케이스 기록 실패는 매매와 무관 */ }
                  }
                }
              }
            } catch (e) { console.warn('[신호 스냅샷 기록 실패]', e); }
          }

          const isUSStock = stockItem.market === 'US' || /^[A-Za-z]/.test(stockItem.symbol) || marketType === 'US';
          const tickSize = getTickSize(currentPrice, isUSStock ? 'US' : 'KR');

          let rawTargetBuyPrice = currentPrice;
          const isBreakoutStrategyActive = currentSelectedStrats.includes('BREAKOUT');
          const isPullbackStrategyActive = currentSelectedStrats.includes('PULLBACK');
          const isVwapStrategyActive = currentSelectedStrats.includes('VWAP_SUPPORT');
          const isVpCvdStrategyActive = currentSelectedStrats.includes('VOLUME_PROFILE_CVD');

          if (isBreakoutStrategyActive && !isPullbackStrategyActive) {
            rawTargetBuyPrice = currentPrice;
          } else if (isPullbackStrategyActive || isVwapStrategyActive || isVpCvdStrategyActive) {
            const offset = itemEntryMode === 'BID4' ? 4 : itemEntryMode === 'BID3' ? 3 : itemEntryMode === 'BID2' ? 2 : 1;
            rawTargetBuyPrice = currentPrice - offset * tickSize;
          } else {
            rawTargetBuyPrice = itemEntryMode === 'BID4' 
              ? (currentPrice - 4 * tickSize) 
              : itemEntryMode === 'BID3'
              ? (currentPrice - 3 * tickSize)
              : itemEntryMode === 'BID2' 
              ? (currentPrice - 2 * tickSize) 
              : itemEntryMode === 'BID1'
              ? (currentPrice - 1 * tickSize)
              : currentPrice;
          }

          // 💱 (2026-10-07 16:03 사용자 결정) 스캘핑 주문가는 현재가 −1틱으로 되돌렸다(15:40에 매수1호가로 바꿨다가 복원).
          const targetBuyPrice = isUSStock 
            ? Number(rawTargetBuyPrice.toFixed(4)) 
            : Math.round(rawTargetBuyPrice / tickSize) * tickSize;

          const currentInventory = isSelected ? gapInventoryRef.current : (tabItem.gapInventory || []);
          const stockHoldingsQty = holdings[stockItem.symbol] || 0;
          const inFlightBuyCount = buyingLockPricesRef.current.filter(p => p.symbol === stockItem.symbol).length;
          const pendingBuyCount = pendingBuyOrdersRef.current.filter(p => p.symbol === stockItem.symbol).length;
          const currentInvCount = currentInventory.length;
          // 🔒 (2026-10-04) 보유 중이면 슬롯 목록과 무관하게 최소 1칸을 쓴 것으로 본다. 예전엔 슬롯 목록만 세어서, 체결 직후
          // 슬롯 반영이 늦거나 목록이 어긋나면 보유 중인 종목을 "빈 슬롯"으로 보고 또 매수할 수 있었다.
          const heldQtyNow = Number(holdingsRef.current[stockItem.symbol] ?? stockHoldingsQty ?? 0);
          const totalOccupied = Math.max(currentInvCount, heldQtyNow > 0 ? 1 : 0) + pendingBuyCount + inFlightBuyCount;

          const isAll4SensorsFullEntry = isAll4SensorsOn && totalOccupied < itemMaxSlots;

          // 🛡️→🔓 (2026-09-28 완화) 동일가 차단은 "진짜 중복 위험"(아직 확정 안 된 주문끼리 겹치는 것)만 막는다.
          // 이미 체결 확정된 보유 슬롯(currentInventory)과 같은 가격이라는 이유만으로는 더 이상 막지 않는다 —
          // [막힌 신호] 분석 결과 이 케이스가 26건 중 절반이 10분 뒤 +0.3% 이상 올라 실제로 놓친 기회였다.
          // 대신 진입 쿨다운(ENTRY_COOLDOWN_MS=5초)이 "같은 신호로 매 틱 반복 진입"하는 위험을 그대로 막아주고,
          // 아직 체결 확인이 안 된 주문끼리(pendingBuyOrders/buyingLockPrices) 겹치는 진짜 중복 위험은 계속 차단한다.
          const isSamePricePendingBlocked = !allowSamePriceEntry && !isAll4SensorsFullEntry && (
            pendingBuyOrdersRef.current.some(p => p.symbol === stockItem.symbol && Math.abs(p.orderPrice - targetBuyPrice) < tickSize * 0.95) ||
            buyingLockPricesRef.current.some(p => p.symbol === stockItem.symbol && Math.abs(p.price - targetBuyPrice) < tickSize * 0.95)
          );
          const isSamePriceBlocked = isSamePricePendingBlocked;

          const isLockActive = inFlightBuyCount > 0;

          // 🛡️ 진입 쿨다운: 같은 종목에 방금 매수 이벤트가 있었다면, 그로부터 일정 시간이 지나기 전엔
          // 새 매수 이벤트를 시작하지 않는다. (한 이벤트 안에서 4/4 올그린으로 여러 슬롯을 한번에
          // 채우는 것은 이 쿨다운의 대상이 아니다 — 그건 하나의 판단으로 여러 슬롯을 채우는 의도된
          // 동작이고, 쿨다운이 막아야 하는 것은 "매 틱마다 같은 신호로 반복 진입"하는 것이다.)
          const lastBuyEventTime = lastBuyEventTimeRef.current[stockItem.symbol] || 0;
          const isEntryCooldownActive = (Date.now() - lastBuyEventTime) < ENTRY_COOLDOWN_MS;
          const priceInKrw = marketType === 'US' ? targetBuyPrice * exchangeRate : targetBuyPrice;

          const lastSlot = currentInventory.length > 0 ? currentInventory[currentInventory.length - 1] : null;
          let currentWeightedAvg = avgPrices[stockItem.symbol] || 0;
          if (currentWeightedAvg <= 0 && currentInventory.length > 0) {
            const totalCost = currentInventory.reduce((acc, s) => acc + (typeof s === 'number' ? s : s.price) * (typeof s === 'number' ? 1 : s.quantity), 0);
            const totalQty = currentInventory.reduce((acc, s) => acc + (typeof s === 'number' ? 1 : s.quantity), 0);
            currentWeightedAvg = totalQty > 0 ? (isUSStock ? Number((totalCost / totalQty).toFixed(4)) : Math.round(totalCost / totalQty)) : 0;
          }
          const isPositionInProfit = currentWeightedAvg > 0 && currentPrice >= currentWeightedAvg;

          // [변경] 추가 매수를 "평단가 대비 가격이 일정 % 떨어졌는지(갭)"로 제한하지 않고,
          // 최초 진입과 동일하게 전략 센서/점수제 신호(meetsBuyCriteria)만으로 판단한다.
          // (기존에는 isGapSatisfied가 별도로 있어야 추가 매수가 허용됐는데, 이제는 신호가
          // 뜨면 이미 보유 중이어도 그대로 추가 진입한다 — 슬롯 한도/쿨다운/동일가 차단 등
          // 다른 안전장치는 그대로 유지된다.)

          // 🕘 세션 게이트 — 정규장 스캘핑(09:00~15:15) / 애프터 스캘핑(16:00~19:50)에서만 신규·추가 매수.
          // 마감 판단 구간, 종가 동시호가, 휴장에는 점수가 넘어도 사지 않는다(매도 로직은 그대로 동작).
          if (meetsBuyCriteria && !isNewAutoBuyAllowed()) {
            noteMissedSignal(stockItem.symbol, stockItem.name, '거래 구간 외(마감 판단·동시호가·휴장)', strategyLabel, currentPrice);
          }
          // 🔒 (2026-10-04) 시작 직후 KIS 미체결 주문과의 첫 대조가 끝나기 전에는 새 매수를 내지 않는다(대조를 바로 요청)
          if (!orderReconcileReadyRef.current && meetsBuyCriteria) { try { void runOrphanSellCheckRef.current?.(); } catch { /* 무시 */ } }
          if (orderReconcileReadyRef.current && isFeedFresh && !rescueBuyBlocked && isNewAutoBuyAllowed() && (meetsBuyCriteria || (immediateEntry && totalOccupied < itemMaxSlots))) {
            buyReadyAssertedAtRef.current[stockItem.symbol] = Date.now();
            transitionLifecycleStatus(stockItem.symbol, 'BUY_READY', `전략센서 조건 충족 (${strategyLabel})`);
            if (isSamePriceBlocked) {
              if (isSelected) setScalperMessage(`[중복 차단] ${formatCurrency(targetBuyPrice)} 주문 처리 중(미확정)`);
              addLog(stockItem.symbol, '매수', targetBuyPrice, 0, `[매수 차단] 동일가(${formatCurrency(targetBuyPrice)}) 미확정 주문 중`);
            } else if (isEntryCooldownActive) {
              const remainSec = Math.ceil((ENTRY_COOLDOWN_MS - (Date.now() - lastBuyEventTime)) / 1000);
              if (isSelected) setScalperMessage(`[쿨다운] 최근 매수 후 대기 중 (${remainSec}초 남음)`);
              addLog(stockItem.symbol, '매수', targetBuyPrice, 0, `[매수 차단] 최근 매수 쿨다운 중 (${remainSec}초 남음)`);
            } else if (totalOccupied >= itemMaxSlots) {
              if (isSelected) setScalperMessage(`[슬롯 가득 참] ${totalOccupied}/${itemMaxSlots} (매도 대기)`);
              addLog(stockItem.symbol, '매수', targetBuyPrice, 0, `[매수 차단] 슬롯 가득 참 (${totalOccupied}/${itemMaxSlots})`);
            } else if (isLockActive) {
              if (isSelected) setScalperMessage(`[주문 처리 중] ${formatCurrency(targetBuyPrice)} API 통신 대기...`);
              addLog(stockItem.symbol, '매수', targetBuyPrice, 0, `[매수 차단] 이전 주문 처리 중(API 통신 대기)`);
            } else {

              console.log(
  '[BUY CHECK]',
  {
    symbol: stockItem.symbol,
    pullback: isPullbackCond,
    vwap: isVwapSupportCond,
    cvd: isVolumeProfileCond,
    meetsBuyCriteria,
    targetBuyPrice,
    currentPrice
  }
);

              const slotsToBuy = isAll4SensorsFullEntry ? Math.max(1, itemMaxSlots - totalOccupied) : 1;
              lastBuyEventTimeRef.current[stockItem.symbol] = Date.now(); // 🛡️ 이 매수 이벤트 시작 시각 기록 — 다음 이벤트는 쿨다운 이후에만 시작 가능

              for (let i = 0; i < slotsToBuy; i++) {
                const inFlightNow = buyingLockPricesRef.current.filter(p => p.symbol === stockItem.symbol).length;
                const pendingNow = pendingBuyOrdersRef.current.filter(p => p.symbol === stockItem.symbol).length;
                const currentTotalOccupied = Math.max((isSelected ? gapInventoryRef.current.length : (tabItem.gapInventory || []).length), (holdingsRef.current[stockItem.symbol] || 0) > 0 ? 1 : 0) + pendingNow + inFlightNow;

                if (currentTotalOccupied >= itemMaxSlots) break;

                const currentStep = currentTotalOccupied + 1;

                // 🛡️ 매우 중요한 변경: 예전엔 등록 시점(또는 전역 설정)에 미리 정해둔 itemTradeQty를
                // 그대로 썼다 — 등록 당시의 가격은 이미 오래된 값일 수 있어서, 실제 매수 시점의
                // 가격과 어긋난 수량으로 주문이 나갈 위험이 있었다. 이제 매수 조건이 실제로 충족된
                // "바로 이 순간"의 targetBuyPrice로 즉시 수량을 계산한다.
                const orderPrice = targetBuyPrice;
                const baseBuyQty = calcQuantityForTargetAmount(orderPrice);
                // 🌙 애프터마켓에서는 종목당 투자 금액을 절반으로 줄인다
                const calculatedBuyQty = getTradingSession() === 'AFTER_SCALP' ? Math.floor(baseBuyQty * AFTER_POSITION_SIZE_RATIO) : baseBuyQty;

                console.log('[매수수량 계산]', {
                  symbol: stockItem.symbol,
                  진입금액: targetInvestmentPerStockRef.current,
                  주문가격: orderPrice,
                  계산수량: calculatedBuyQty,
                  예상주문금액: calculatedBuyQty > 0 ? orderPrice * calculatedBuyQty : 0
                });

                if (calculatedBuyQty <= 0) {
                  addLog(
                    stockItem.symbol,
                    '매수',
                    orderPrice,
                    0,
                    `[매수 스킵] 설정 진입금액 ${targetInvestmentPerStockRef.current.toLocaleString()}원으로 1주 매수 불가`
                  );
                  continue;
                }

                const scaledQuantity = calculatedBuyQty;
                const scaledCost = priceInKrw * scaledQuantity;
                // 🛡️ balance(화면 표시용) 대신 실제 KIS 매수가능금액(orderableKrw)을 우선 참조한다 —
                // balance가 동기화 지연 등으로 stale할 수 있어서 실제와 다르게 차단될 수 있었다.
                const effectiveCash = orderableKrw > 0 ? orderableKrw : balance;

                if (effectiveCash < scaledCost) {
                  // 🛡️ 예전엔 isSelected일 때만 메시지를 남겨서, 선택 안 한 종목이 여기 걸리면
                  // 로그 한 줄 없이 조용히 매수 시도가 중단되고 있었다. 이제는 선택 여부와 무관하게
                  // 항상 GLOBAL TRADE LOGS에 남긴다 — "BUY_READY까지 갔는데 그 다음이 안 보인다"는
                  // 문제의 정확한 원인 중 하나였다.
                  if (isSelected) setScalperMessage(`[매수 차단] 예수금 부족 (필요: ${formatCurrency(scaledCost)}, 보유: ${formatCurrency(effectiveCash)})`);
                  addLog(stockItem.symbol, '매수', targetBuyPrice, scaledQuantity, `[매수차단] 예수금 부족 — 필요 ${formatCurrency(scaledCost)}, 실제 매수가능 ${formatCurrency(effectiveCash)}`);
                  break;
                }

                if (isSelected) setScalperMessage(`[슬롯#${currentStep}/${itemMaxSlots} 진입] ${stockItem.name} ${formatCurrency(targetBuyPrice)} (${strategyLabel})...`);

                const lockEntry = { symbol: stockItem.symbol, price: targetBuyPrice };
                buyingLockPricesRef.current.push(lockEntry);
                transitionLifecycleStatus(stockItem.symbol, 'BUYING', `매수 주문 전송 (${formatCurrency(targetBuyPrice)} x ${scaledQuantity})`);

                try {
                  const currentSlotId = `SLOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                  console.log(
  '[BUY ORDER]',
  {
    symbol: stockItem.symbol,
    qty: scaledQuantity,
    targetBuyPrice,
    strategy: strategyLabel
  }
);
                  // 📒 매수 주문 직전의 신호 스냅샷 — 체결 로그가 찍히는 순간 매매 일지의 보유 로트에 붙는다
                  pendingEntrySignalsRef.current[stockItem.symbol] = buildEntrySignals(stockItem, strat, journalScore, journalBreakdown, strategyLabel, targetBuyPrice);
                  const executedQty = await executeTrade('BUY', stockItem, scaledQuantity, `Scalper Slot #${currentStep}/${itemMaxSlots} (${strategyLabel}): ${formatCurrency(targetBuyPrice)} 진입`, targetBuyPrice, undefined, currentSlotId, undefined, 'ENTRY_SIGNAL', { deferFillCheck: true });

                  if (executedQty > 0) {
                    transitionLifecycleStatus(stockItem.symbol, 'HOLDING', `매수 체결 완료 (${formatCurrency(targetBuyPrice)} x ${executedQty})`);
                    if (isSelected) setScalperMessage(`[매수 완료] ${stockItem.name} 슬롯#${currentStep}/${itemMaxSlots} ${formatCurrency(targetBuyPrice)} (${strategyLabel})`);
                    setBotStatus(`[스캘퍼 엔진] ${stockItem.name} (${stockItem.symbol}) ${formatCurrency(targetBuyPrice)} ${formatQuantity(executedQty)} 진입 완료 (${strategyLabel})`);
                    setLastTradeType('BUY');
                    setGapTradeCount(prev => prev + 1);
                    showNotification(`${stockItem.name} ${formatCurrency(targetBuyPrice)} (${strategyLabel}) 매수 완료`, "success");
                    playScalpingSound('BUY');
                  } else {
                    // 🛡️ 예전에는 여기가 비어있어서, 주문이 실패하거나(API 오류) 미체결로 대기 상태가
                    // 되어도 화면엔 아무 표시 없이 "[슬롯 진입]" 메시지만 남아 마치 뭔가 진행 중인
                    // 것처럼 보였다. 실제로 체결되지 않았다는 걸 명확하게 알려준다. (executeTrade가
                    // 내부적으로 미체결 대기주문으로 등록했다면 그건 계속 별도로 감시되고, 이 메시지는
                    // "이번 시도에서 즉시 체결되지는 않았다"는 사실만 알려주는 용도다.)
                    // (2026-10-04) 엔진은 체결을 기다리지 않는다 — 접수됐으면 대기 목록에 있고, 없으면 주문이 나가지 않은 것
                    const acceptedNow = pendingBuyOrdersRef.current.some(o => o.symbol === stockItem.symbol);
                    if (acceptedNow) {
                      if (isSelected) setScalperMessage(`[매수 주문 접수] ${stockItem.name} ${formatCurrency(targetBuyPrice)} — 체결 대기 중 (${Math.round((getLiveParams().pendingBuyTtlSec * 1000) / 1000)}초 안에 미체결이면 취소)`);
                    } else {
                      setBotStatus(`[매수 주문 안 됨] ${stockItem.name} ${formatCurrency(targetBuyPrice)} — 사유는 전체 로그 확인`);
                      if (isSelected) setScalperMessage(`[매수 주문 안 됨] ${stockItem.name} ${formatCurrency(targetBuyPrice)}`);
                    }
                  }
                } finally {
                  buyingLockPricesRef.current = buyingLockPricesRef.current.filter(p => p !== lockEntry);
                }
              }
            }
          } else if (isSelected) {
            // 🛡️ 매우 중요한 수정: 예전엔 여기서 "센서 4개 중 몇 개 충족"이라는 옛날(AND 조건) 방식
            // 문구만 보여줘서, 실제 계산된 점수(buyScore)와 그 내역(buyScoreBreakdown)이 화면 어디에도
            // 안 보였다 — "정말 점수가 부족해서 매수를 안 하는 건지" 사용자가 확인할 방법이 없었다.
            // strategyLabel에 이미 "[점수제 N/100점] 항목1, 항목2, ..." 형태로 담겨있으니 그대로 보여준다.
            if (stockHoldingsQty > 0) {
              setScalperMessage(`🔍 [감시] ${stockItem.name} 보유 ${stockHoldingsQty}주 익절/추가진입 감시 — ${strategyLabel} (RSI: ${Math.round(rsi)})`);
            } else {
              setScalperMessage(`🔍 [감시] ${stockItem.name} — ${strategyLabel} (RSI: ${Math.round(rsi)})`);
            }
          }
        }

        // B. PROFIT MAX SELL Condition for stockItem
        const totalHeldQty = holdings[stockItem.symbol] || 0;
        let weightedAvgPrice = avgPrices[stockItem.symbol] || 0;

        if (totalHeldQty <= 0 && rescueRef.current[stockItem.symbol]) {
          delete rescueRef.current[stockItem.symbol]; // 포지션 종료 — 슬롯3 방어 상태도 정리
          persistRescue();
        }
        if (totalHeldQty <= 0) {
          // 🧹 보유수량이 0인데 이 종목에 대한 고점 기억이 남아있다면(예: 정상 매도 경로를 거치지
          // 않고 외부에서 청산됐거나 handleSyncKIS로 갑자기 0이 된 경우) 다음 재매수 때 엉뚱한
          // 옛 고점을 물려받지 않도록 정리한다.
          const stalePrefix = `${stockItem.symbol}_`;
          let staleFound = false;
          for (const key of Object.keys(highWaterMarkRef.current)) {
            if (key.startsWith(stalePrefix)) {
              delete highWaterMarkRef.current[key];
              staleFound = true;
            }
          }
          if (staleFound) persistHighWaterMarks(true);
        }

        // 📈 추세 매수 보유 표시 정리 — 보유 0주가 15초 이어지면(매도 완료 또는 주문 미체결) 지우고 재매수 금지 시간을 건다
        {
          const tSym = stockItem.symbol;
          const tp = trendCarryRef.current[tSym];
          if (tp) {
            if (totalHeldQty > 0) delete trendZeroAtRef.current[tSym];
            else if (!pendingBuyOrdersRef.current.some(o => o.symbol === tSym) && !pendingTradeKeysRef.current.has(`${tSym}_BUY`) && Date.now() - tp.entryAt > 20000) {
              const z = trendZeroAtRef.current[tSym] || (trendZeroAtRef.current[tSym] = Date.now());
              if (Date.now() - z > 15000) {
                delete trendCarryRef.current[tSym]; delete trendZeroAtRef.current[tSym]; persistTrendCarry();
                if (tp.kind !== 'CLOSE' && tp.filled) trendCooldownRef.current[tSym] = Date.now() + getLiveParams().trendReentryMin * 60000; // 체결된 적 없는(취소된) 주문에는 재매수 금지를 걸지 않는다
              }
            }
          }
        }
        // 🌙 마감 매수 보유 표시 정리 — 산 날이 지났고 보유 0주가 15초 이어지면(익절 완료) 지운다
        {
          const cSym = stockItem.symbol;
          const cDate = closeBuyCarryRef.current[cSym];
          if (cDate) {
            if (totalHeldQty > 0) delete closeCarryZeroAtRef.current[cSym];
            else if (cDate < kstDateKey() && !pendingBuyOrdersRef.current.some(o => o.symbol === cSym)) {
              const z = closeCarryZeroAtRef.current[cSym] || (closeCarryZeroAtRef.current[cSym] = Date.now());
              if (Date.now() - z > 15000) { delete closeBuyCarryRef.current[cSym]; delete closeCarryZeroAtRef.current[cSym]; persistCloseCarry(); }
            }
          }
        }
        {
          const adz = avgDownRef.current[stockItem.symbol];
          if (adz) {
            if (totalHeldQty > 0) { if (adz.zeroAt) adz.zeroAt = undefined; }
            else if (!pendingBuyOrdersRef.current.some(o => o.symbol === stockItem.symbol)) {
              // 보유 0주가 15초 이어지면 포지션 종료로 보고 물타기 상태를 지운다(잔고 동기화가 잠깐 0으로 보이는 경우 대비)
              if (!adz.zeroAt) adz.zeroAt = Date.now();
              else if (Date.now() - adz.zeroAt > 15000) { delete avgDownRef.current[stockItem.symbol]; persistAvgDown(); }
            }
          }
        }
        if (totalHeldQty <= 0) clearExitPlan(stockItem.symbol); // 포지션 종료 — 다음 진입 때 익절 기준을 새로 정한다

        // 🌙 마감 매수로 오늘 산 종목은 오늘은 매도 판단을 하지 않는다(다음 거래일 09:00부터 평소 규칙)
        if (totalHeldQty > 0 && weightedAvgPrice > 0 && trendCarryRef.current[stockItem.symbol]) {
          // 📈 추세 매수 보유분 — 고점 대비 trendTrailPct% 하락 또는 VWAP 이탈(0.2% 아래)이면 전량 매도. 그 밖에는 계속 보유(물타기·손절·목표 익절 없음).
          const tp = trendCarryRef.current[stockItem.symbol];
          const LPt = getLiveParams();
          const nowT = Date.now();
          const carryLabel = tp.kind === 'CLOSE' ? '마감' : '추세';
          const closeBoughtToday = tp.kind === 'CLOSE' && tp.date === kstDateKey(); // 마감 매수는 산 날에는 팔지 않는다
          if (!tp.filled) { tp.filled = true; persistTrendCarry(); }
          if (currentPrice > tp.peak) { tp.peak = currentPrice; persistTrendCarry(); }
          const ddPct = tp.peak > 0 ? ((tp.peak - currentPrice) / tp.peak) * 100 : 0;
          const vwT = getTrueVwaps(stockItem.symbol).regular;
          const kstMinT = fastKstMinutes();
          // VWAP 이탈은 진입 3분 뒤부터, 장 시작 10분 뒤부터 본다(장 초반 VWAP은 몇 틱만으로 흔들린다)
          const belowVwap = vwT > 0 && currentPrice < vwT * 0.998 && nowT - tp.entryAt >= 180000 && kstMinT >= 9 * 60 + 10;
          const trailHit = ddPct >= LPt.trendTrailPct;
          // (2026-10-07 15:15 사용자 결정) 추세 매수 보유분은 수익일 때만 판다. 손실이면 팔지 않고 보유하다가,
          //   다음 거래일 추세 매수 시간(기본 10:00~10:15)에 슬롯을 하나 더 연다(runPanelSample).
          const netNowT = calculateNetProfitPercent(weightedAvgPrice, currentPrice, 'KR');
          if (!closeBoughtToday && (trailHit || belowVwap) && netNowT > 0 && isFeedFresh && isAppReadyRef.current && currentPrice > 0
            && !pendingSellOrdersRef.current.some(o => o.symbol === stockItem.symbol) && nowT - (trendSellAtRef.current[stockItem.symbol] || 0) >= 5000) {
            trendSellAtRef.current[stockItem.symbol] = nowT;
            const tkT = getTickSize(currentPrice, 'KR');
            const sellPx = Math.round((currentPrice - tkT) / tkT) * tkT;
            const netT = calculateNetProfitPercent(weightedAvgPrice, currentPrice, 'KR');
            const why = trailHit ? `고점 ${formatCurrency(tp.peak)} 대비 −${ddPct.toFixed(2)}% (기준 −${LPt.trendTrailPct}%)` : `VWAP ${formatCurrency(Math.round(vwT))} 이탈`;
            addLog(stockItem.symbol, '매도', currentPrice, totalHeldQty, `[${carryLabel} 매도] ${stockItem.name} — ${why} · 평단 ${formatCurrency(weightedAvgPrice)} · 순수익 ${netT >= 0 ? '+' : ''}${netT.toFixed(2)}%`);
            pendingExitContextRef.current[stockItem.symbol] = { at: nowT, triggerPrice: currentPrice, rule: trailHit ? 'TRAILING_STOP' : 'SIGNAL_REVERSAL' };
            await executeTrade('SELL', stockItem, totalHeldQty, `${carryLabel} 매수분 매도 — ${why}`, sellPx, weightedAvgPrice, undefined, trailHit ? 'TRAILING_STOP' : 'SIGNAL_REVERSAL', undefined, { deferFillCheck: true });
            if (isSelected) { gapInventoryRef.current = []; setGapInventory([]); }
            setLastTradeType('SELL');
            playScalpingSound('SELL');
          }
        } else if (totalHeldQty > 0 && weightedAvgPrice > 0 && !isCloseBuyCarryToday(stockItem.symbol)) {
          // 💧 이 포지션의 익절 목표(트레일링 시작 순수익 %) — 진입 때 5분 거래대금으로 정한 값(대형 0.5 / 중형 0.8 / 소형 1.2 기본)
          const exitPlan = ensureExitPlan(stockItem.symbol);
          const posTargetPct = exitPlan.targetPct;
          // 🛑 이 포지션의 손절(순손실 %) — 진입 때 정한 구분의 값(대형 −0.6 / 중형 −0.8 / 소형 −1.0 기본)
          const posStopPct = -Math.abs(Number(exitPlan.stopPct) || getLiveParams().sellStopNetPct);
          const isStockUS = stockItem.market === 'US' || /^[A-Za-z]/.test(stockItem.symbol) || marketType === 'US';
          const netProfitPct = calculateNetProfitPercent(weightedAvgPrice, currentPrice, isStockUS ? 'US' : 'KR');
          const overallProfitRatio = netProfitPct / 100;
          const sellTickSize = getTickSize(currentPrice, isStockUS ? 'US' : 'KR');
          // 🚀 매도는 "목표가 도달"을 기다리지 않고 시그널 발생 즉시 실행한다. 주문가도 현재가에 걸어두고
          // 체결을 기다리는 게 아니라, 한 틱 낮춰서(매수 호가를 바로 무는 가격) 즉시 체결되도록 낸다.
          const marketableSellPrice = isStockUS
            ? Number((currentPrice - sellTickSize).toFixed(4))
            : Math.round((currentPrice - sellTickSize) / sellTickSize) * sellTickSize;

          // 1) Emergency Stop Loss Intercept (최우선 안전장치 — 손실 확대를 막는 것이 목적이라 시그널 대기 없이 즉시 실행)
          // Only evaluate when user holds stock (totalHeldQty > 0), app is ready, prices are valid, and profit ratio is at or below the stop loss threshold
          const stopLossThreshold = -Math.abs(posStopPct) / 100; // e.g. -1.5% -> -0.015

          // 🛟 슬롯3 방어 판단 — 손절 여부(doStopLoss)와 사유(stopLabel)를 정한다
          // 🛑 최소 틱 보호 — 손절선이 평단에서 minStopTicks(기본 3틱)보다 가까우면, 가격이 그 틱 수만큼 내려와야 손절한다.
          // (틱이 큰 가격대에서는 1~2틱 흔들림만으로 순손실이 손절선에 닿을 수 있다)
          const minStopTicksLive = Math.max(0, Number(getLiveParams().minStopTicks) || 0);
          const stopTickSize = getTickSize(weightedAvgPrice, isStockUS ? 'US' : 'KR');
          const downTicksFromAvg = stopTickSize > 0 ? (weightedAvgPrice - currentPrice) / stopTickSize : 0;
          let doStopLoss = overallProfitRatio <= stopLossThreshold && downTicksFromAvg >= minStopTicksLive - 1e-9;
          let stopLabel = `스캘핑 기계적 손절 (${(overallProfitRatio * 100).toFixed(2)}%)`;
          // 💧 (2026-10-07) 물타기 — 손절 대신 평단 대비 순손실이 단계 폭(손절 기준 × 1.5)에 닿으면 슬롯을 하나 더 연다(최대 5슬롯)
          // 🌙 (2026-10-07 14:50 사용자 결정) 마감 매수 보유분도 물타기와 같은 규칙으로 관리한다 — 단계 폭마다 추가 매수, 최대 슬롯 소진 뒤 손절.
          //   추가 매수 수량은 마감 매수 수량(기본 1주)과 같게 한다. 물타기가 꺼져 있으면 예전처럼 손절 없이 보유.
          const isCloseCarryPos = !!closeBuyCarryRef.current[stockItem.symbol];
          if (isCloseCarryPos && !getLiveParams().avgDownEnabled) {
            doStopLoss = false;
          } else if (getLiveParams().avgDownEnabled && !isStockUS) {
            const symA = stockItem.symbol;
            const stepPct = Math.abs(posStopPct) * getLiveParams().avgDownStepMult;
            const nowA = Date.now();
            let ad = avgDownRef.current[symA];
            if (!ad) { ad = { adds: 0, lastAvg: 0, lastAt: 0 }; avgDownRef.current[symA] = ad; persistAvgDown(); }
            const hasPendingBuyA = pendingBuyOrdersRef.current.some(o => o.symbol === symA) || buyingLockPricesRef.current.some(pz => pz.symbol === symA) || pendingTradeKeysRef.current.has(`${symA}_BUY`);
            if (ad.pending) {
              if (totalHeldQty > ad.pending.qtyBefore) {
                ad.adds += 1; ad.lastAt = nowA; ad.lastAvg = ad.pending.avgBefore; ad.pending = undefined; persistAvgDown();
                addLog(symA, '매수', currentPrice, 0, `[물타기] ${stockItem.name} 슬롯 ${1 + ad.adds}/${getLiveParams().avgDownMaxSlots} 체결 — 보유 ${totalHeldQty}주 · 평단 ${formatCurrency(weightedAvgPrice)}`);
              } else if (!hasPendingBuyA && nowA - ad.pending.at > 20000) {
                ad.pending = undefined; persistAvgDown(); // 주문이 취소·만료됨 — 조건이 유지되면 다시 낸다
              }
            }
            const slotsNowA = 1 + ad.adds;
            const hitStep = netProfitPct <= -stepPct && downTicksFromAvg >= minStopTicksLive - 1e-9;
            // 추가 매수가 체결된 뒤에는 평단이 실제로 내려간 것을 확인한 다음에만 다음 단계를 본다(옛 평단으로 연달아 사는 것 방지)
            const avgSettled = ad.adds === 0 || (weightedAvgPrice > 0 && weightedAvgPrice < ad.lastAvg);
            if (slotsNowA >= getLiveParams().avgDownMaxSlots) {
              doStopLoss = hitStep && !ad.pending && (avgSettled || nowA - ad.lastAt > 60000);
              stopLabel = `물타기 ${getLiveParams().avgDownMaxSlots}슬롯 소진 후 손절 — 평단 대비 ${netProfitPct.toFixed(2)}% (기준 −${stepPct.toFixed(1)}%)`;
            } else {
              doStopLoss = false; // 손절 보류
              const noPendingSellA = !pendingSellOrdersRef.current.some(o => o.symbol === symA);
              if (hitStep && avgSettled && !ad.pending && !hasPendingBuyA && noPendingSellA && isFeedFresh && isAppReadyRef.current && orderReconcileReadyRef.current
                && isNewAutoBuyAllowed() && nowA - ad.lastAt >= (getLiveParams().avgDownMinGapSec * 1000) && nowA - (ad.tryAt || 0) >= 10000) {
                ad.tryAt = nowA;
                const adPrice = marketableSellPrice; // 현재가 −1틱 (평소 스캘핑 매수와 같은 가격)
                const baseQtyA = adPrice > 0 ? (isCloseCarryPos ? Math.max(1, Math.floor(getLiveParams().closeBuyQty)) : calcQuantityForTargetAmount(adPrice)) : 0;
                const adQty = getTradingSession() === 'AFTER_SCALP' ? Math.floor(baseQtyA * AFTER_POSITION_SIZE_RATIO) : baseQtyA;
                const cashA = orderableKrw > 0 ? orderableKrw : balance;
                const nextSlot = slotsNowA + 1;
                if (adQty <= 0) {
                  addLog(symA, '매수', adPrice, 0, `[물타기 안 함] ${stockItem.name} 슬롯 ${nextSlot} — 종목당 진입금액으로 1주를 살 수 없음`);
                } else if (cashA < adPrice * adQty) {
                  addLog(symA, '매수', adPrice, adQty, `[물타기 안 함] ${stockItem.name} 슬롯 ${nextSlot} — 주문가능현금 부족 (필요 ${formatCurrency(adPrice * adQty)} · 가능 ${formatCurrency(cashA)})`);
                } else {
                  ad.pending = { qtyBefore: totalHeldQty, avgBefore: weightedAvgPrice, at: nowA }; persistAvgDown();
                  addLog(symA, '매수', adPrice, adQty, `[물타기] ${stockItem.name} 슬롯 ${nextSlot}/${getLiveParams().avgDownMaxSlots} 매수 주문 — 평단 ${formatCurrency(weightedAvgPrice)} 대비 ${netProfitPct.toFixed(2)}% (기준 −${stepPct.toFixed(1)}%) · ${formatCurrency(adPrice)} × ${adQty}주`);
                  if (isSelected) setScalperMessage(`[물타기] ${stockItem.name} 슬롯 ${nextSlot}/${getLiveParams().avgDownMaxSlots} — ${formatCurrency(adPrice)} × ${adQty}주`);
                  const lockA = { symbol: symA, price: adPrice };
                  buyingLockPricesRef.current.push(lockA);
                  try {
                    await executeTrade('BUY', stockItem, adQty, `물타기 슬롯 #${nextSlot}/${getLiveParams().avgDownMaxSlots}: ${formatCurrency(adPrice)} (평단 대비 ${netProfitPct.toFixed(2)}%)`, adPrice, undefined, `SLOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`, undefined, 'AVG_DOWN', { deferFillCheck: true });
                  } catch (e) { console.warn('[물타기 주문 실패]', symA, e); }
                  finally { buyingLockPricesRef.current = buyingLockPricesRef.current.filter(pz => pz !== lockA); }
                }
              }
            }
          }
          if (RESCUE_SLOT_ENABLED) { // (2026-09-30) 방어 꺼짐 — 손절선(순손실) 도달 시 무조건 손절
            const sym = stockItem.symbol;
            let rs = rescueRef.current[sym];
            // 슬롯3 체결 감지 — 대기 중 보유수량이 늘었으면 새 평단으로 방어 2단계(FILLED)
            if (rs && rs.phase === 'WAITING' && totalHeldQty > rs.baseQty) {
              rs.phase = 'FILLED'; rs.filledAt = Date.now(); persistRescue();
              addLog(sym, '매수', currentPrice, totalHeldQty - rs.baseQty, `[슬롯3 방어] 슬롯3 체결 — 새 평단 ${formatCurrency(weightedAvgPrice)} 기준 +${posTargetPct}% 트레일링 / ${posStopPct}% 손절 (처음 평단 ${formatCurrency(rs.baseAvg)} 대비 ${RESCUE_HARD_STOP_NET_PCT}%는 무조건 손절)`);
            }
            const isKR = !(stockItem.market === 'US' || /^[A-Za-z]/.test(sym));
            if (rs && isKR) {
              const netFromBase = calculateNetProfitPercent(rs.baseAvg, currentPrice, 'KR');
              const hasPendingBuy = pendingBuyOrdersRef.current.some(o => o.symbol === sym) || pendingTradeKeysRef.current.has(`${sym}_BUY`);
              if (netFromBase <= RESCUE_HARD_STOP_NET_PCT) {
                doStopLoss = true;
                stopLabel = `슬롯3 방어 하드 손절 — 처음 평단 ${formatCurrency(rs.baseAvg)} 대비 ${netFromBase.toFixed(2)}% (기준 ${RESCUE_HARD_STOP_NET_PCT}%)`;
              } else if (rs.phase === 'WAITING') {
                if (Date.now() - rs.openedAt > RESCUE_WAIT_MS && !hasPendingBuy) {
                  if (overallProfitRatio <= stopLossThreshold) {
                    doStopLoss = true;
                    stopLabel = `슬롯3 방어 대기 ${Math.round(RESCUE_WAIT_MS / 60000)}분 초과 — 매수 신호 없음 (${(overallProfitRatio * 100).toFixed(2)}%)`;
                  } else {
                    // 대기 중 손절선 위로 회복됨 — 슬롯3 기회는 종료하고 이후엔 일반 손절 규칙으로(포지션당 1회라 다시 대기하지 않음)
                    rs.phase = 'EXPIRED'; persistRescue();
                    addLog(sym, '매도', currentPrice, 0, `[슬롯3 방어] ${Math.round(RESCUE_WAIT_MS / 60000)}분 대기 종료 — 손절선 위로 회복(${(overallProfitRatio * 100).toFixed(2)}%)해 손절하지 않음, 이후 일반 손절 적용`);
                    doStopLoss = false;
                  }
                } else {
                  doStopLoss = false; // 대기 중엔 일반 손절 보류
                }
              }
              // FILLED/EXPIRED 단계: 새 평단(또는 현재 평단) 기준 일반 손절(doStopLoss 기본값) 그대로
            } else if (doStopLoss && RESCUE_SLOT_ENABLED && isKR && !rs) {
              // 첫 손절 도달 → 슬롯3 대기로 전환 (보유 슬롯이 기본 한도 이내일 때만, 포지션당 1회)
              const curInv = isSelected ? gapInventoryRef.current : (tabItem.gapInventory || []);
              const slotsNow = Math.max(1, curInv.filter((x: any) => (x?.quantity || 0) > 0).length);
              if (slotsNow <= MAX_SLOTS_PER_STOCK && isNewAutoBuyAllowed()) {
                rs = { phase: 'WAITING', openedAt: Date.now(), baseAvg: weightedAvgPrice, baseQty: totalHeldQty, baseSlots: slotsNow };
                rescueRef.current[sym] = rs; persistRescue();
                doStopLoss = false;
                addLog(sym, '매도', currentPrice, 0, `[슬롯3 방어] 손절선 도달(${(overallProfitRatio * 100).toFixed(2)}%) — 손절 대신 슬롯3 대기 ${Math.round(RESCUE_WAIT_MS / 60000)}분 (매수 신호 오면 1회 추가 매수, 처음 평단 대비 ${RESCUE_HARD_STOP_NET_PCT}%면 무조건 손절)`);
                if (isSelected) setScalperMessage(`[슬롯3 대기] ${stockItem.name} 손절선 도달 — ${Math.round(RESCUE_WAIT_MS / 60000)}분 동안 추가 매수 신호 대기`);
              }
            }
          }

          if (
            isAppReadyRef.current &&
            totalHeldQty > 0 &&
            currentPrice > 0 &&
            weightedAvgPrice > 0 &&
            currentPrice > weightedAvgPrice * 0.2 &&
            doStopLoss &&
            overallProfitRatio > -0.85
          ) {
            // [수정] 기계적 손절 전 기존 미체결 매도 주문 취소 후 즉시 평단가+손절% 가격으로 매도 주문 실행
            transitionLifecycleStatus(stockItem.symbol, 'SELL_READY', `기계적 손절 조건 충족 (${(overallProfitRatio * 100).toFixed(2)}%)`);
            if (isSelected) setScalperMessage(`[손절 실행] ${stockItem.name} ${formatCurrency(weightedAvgPrice)} -> ${formatCurrency(currentPrice)} (${(overallProfitRatio * 100).toFixed(2)}%)`);
            
            // 🛡️ 외부 검토(2026-09-28) 반영 — 기존 매도주문을 취소했다고 "확인"되기 전에는
            // 절대 새 손절 매도 주문을 내지 않는다. 예전엔 cancelOrder()를 .catch(() => {})로
            // 결과를 무시하고 곧바로 로컬 pending을 지운 뒤 새 손절 매도를 냈는데, 만약 실제로는
            // 취소가 실패해서 옛 매도 주문이 KIS에 여전히 살아있었다면 그 위에 새 매도 주문이
            // 겹쳐 나가는 위험한 흐름이었다.
            const pendingSellsForSymbol = pendingSellOrdersRef.current.filter(o => o.symbol === stockItem.symbol);
            let canProceedWithStopLossSell = true;
            // ⚡ (2026-10-04) 방금(2초 이내) 낸 매도 주문은 체결 확인을 기다린다 — 엔진이 더 이상 체결을 기다리며 멈추지 않으므로,
            // 이 대기가 없으면 손절 주문을 낸 직후 다음 주기(1초 뒤)에 그 주문을 스스로 취소하고 다시 내는 반복이 생긴다.
            if (pendingSellsForSymbol.some(o => Date.now() - (o.createdAt || 0) < 2000)) continue;
            if (pendingSellsForSymbol.length > 0) {
              for (const order of pendingSellsForSymbol) {
                // 🛡️ 이 손절 경로는 stopLossThreshold 조건이 유지되는 동안 매 틱마다 재실행되므로,
                // 직전 취소 시도가 REJECTED/UNKNOWN으로 끝났다면 쿨다운이 끝날 때까지는 다시
                // cancelPendingSellOrderSafely()를 호출하지 않는다 (APBK0927 반복 호출 방지).
                if (shouldSkipSellCancelRetry(order.id)) {
                  canProceedWithStopLossSell = false;
                  continue;
                }

                const cancelResult = await cancelPendingSellOrderSafely(order);

                if (cancelResult === 'CANCELLED' || cancelResult === 'ALREADY_CLOSED') {
                  // 기존 주문이 실제로 종료된 것을 확인했을 때만 로컬 pending에서 제거한다.
                  clearSellCancelRetryCooldown(order.id);
                  await recordFillOfClosedSellOrder(order); // 📒 체결로 종료됐으면 일지 기록
                  setPendingSellOrders(prev => prev.filter(o => o.id !== order.id));
                  pendingSellOrdersRef.current = pendingSellOrdersRef.current.filter(o => o.id !== order.id);
                  continue;
                }

                // 취소 실패/상태확인 실패 — 기존 주문이 여전히 살아있을 가능성이 있으므로
                // 이번 사이클엔 새 손절 매도를 내지 않는다. pending은 그대로 둬서 다음 효과
                // 사이클(및 -0.5% 하락 자동취소 effect)이 다시 상태를 확인하게 한다.
                markSellCancelRetryCooldown(order.id);
                canProceedWithStopLossSell = false;
                addLog(stockItem.symbol, '매도', currentPrice, totalHeldQty, `[손절 매도 보류] 기존 매도주문(${order.id}) 취소 확인 실패 — 신규 매도 차단`);
                if (isSelected) setScalperMessage(`[손절 매도 보류] ${stockItem.name} 기존 매도주문 상태를 확인할 수 없어 신규 매도를 차단합니다.`);
              }

              if (!canProceedWithStopLossSell) {
                continue;
              }

              await new Promise(r => setTimeout(r, 200));
            }

            const tickSize = getTickSize(weightedAvgPrice, isStockUS ? 'US' : 'KR');
            let stopLossPrice = weightedAvgPrice * (1 + stopLossThreshold);
            // 손절도 즉시 체결되도록 한 틱 더 낮춰서 낸다 (호가를 확실히 무는 가격)
            stopLossPrice = isStockUS
              ? Number((stopLossPrice - tickSize).toFixed(4))
              : Math.round((stopLossPrice - tickSize) / tickSize) * tickSize;
            // 🛡️ (2026-09-30) 가격이 이미 손절선보다 더 내려가 있으면(급락·하드 손절·대기 초과) 손절선 가격의 지정가는 현재가보다
            // 높아 체결되지 않는다 → 미체결 → 취소·재주문 반복. 현재가 −1틱(즉시 체결 가격)과 비교해 낮은 쪽으로 낸다.
            if (marketableSellPrice > 0 && marketableSellPrice < stopLossPrice) stopLossPrice = marketableSellPrice;

            pendingExitContextRef.current[stockItem.symbol] = { at: Date.now(), triggerPrice: currentPrice, rule: 'STOP_LOSS' };
            await executeTrade('SELL', stockItem, totalHeldQty, stopLabel, stopLossPrice, weightedAvgPrice, undefined, 'STOP_LOSS', undefined, { deferFillCheck: true });

            if (isSelected) {
              gapInventoryRef.current = [];
              setGapInventory([]);
            }
            setLastTradeType('SELL');
            setGapTradeCount(prev => prev + 1);
            playScalpingSound('SELL');
            continue;
          }

          // 2) 매도 시그널 감지 — "목표가에 도달하면 판다"가 아니라, 아래 시그널 중 하나라도 뜨면
          // 목표 수익률에 아직 못 미쳤어도 즉시 매도한다. (매수가 시그널 발생 즉시 진입하는 것과 대칭)
          const markKey = `${stockItem.symbol}_${weightedAvgPrice}`; // 추가 매수로 평균가가 바뀌면 고점 추적도 새로 시작
          const currentHigh = Math.max(highWaterMarkRef.current[markKey] || weightedAvgPrice, currentPrice);
          highWaterMarkRef.current[markKey] = currentHigh;
          persistHighWaterMarks(); // 새로고침해도 고점 기억이 유지되도록 localStorage에 저장(3초 쓰로틀)

          // 📉 2틱 트레일링 스탑 — 이익 실현 규칙을 이것 하나로 통일했다(예전 '스마트 익절 +0.24% 즉시 매도'와
          // '일반 트레일링 0.3%'는 삭제). 보유 중 최고가 기준 순수익이 목표(기본 +0.2%)에 한 번이라도 도달하면
          // 준비 상태가 되고, 그 뒤 최고가에서 2틱 이상 내려오면 판다. 준비 여부를 "현재" 수익이 아니라 "최고가"
          // 수익으로 판단해야, 2틱 하락하는 순간 수익이 목표 아래로 내려가도 정상적으로 판다.
          const trailTick = getTickSize(currentHigh, isStockUS ? 'US' : 'KR');
          const dropTicksFromPeak = trailTick > 0 ? Math.floor((currentHigh - currentPrice) / trailTick + 1e-9) : 0;
          const peakNetProfitPct = calculateNetProfitPercent(weightedAvgPrice, currentHigh, isStockUS ? 'US' : 'KR');
          const isTrailingArmed = peakNetProfitPct >= posTargetPct;
          // 💰 (2026-10-04) 트레일링 틱은 전략 버전에서 읽는다(기본 2) — 그 틱에서 매수세 확인, +1틱(최소 3틱)이면 무조건 매도
          const trailTicksLive = Math.max(1, Number(getLiveParams().sellTrailTicks) || TRAILING_DROP_TICKS);
          const trailMaxLive = Math.max(TRAILING_MAX_DROP_TICKS, trailTicksLive + 1);
          let isTrailingStop = isTrailingArmed && dropTicksFromPeak >= trailTicksLive; // 아래 '트레일링 확인'에서 최종 결정

          // 🩺 RSI 과매수 판단 재설계 — 강한 상승주는 RSI 70을 넘어 75, 80, 85까지도 계속 오르며
          // 상승을 이어갈 수 있다. "RSI 70/75 이상이면 무조건 매도 후보"는 상승장에서 너무 일찍
          // 팔아버리는 원인이 된다. 이제는:
          //   - RSI 65~80 구간은 그 자체로는 매도 시그널이 아니다 (보유 유지)
          //   - RSI 80 이상 + 체결강도 하락(매수세 약화) + 현재가 VWAP 이탈(추세 전환 확인)
          //     이 셋이 전부 함께 확인될 때만 "진짜 과열 반전"으로 간주해 매도한다
          const currentExecStrength = stockItem.executionStrength || 0;
          const prevExecStrength = sellExecStrengthRef.current[stockItem.symbol];
          const isExecutionStrengthDeclining = prevExecStrength !== undefined && currentExecStrength > 0 && currentExecStrength < prevExecStrength - 10;
          if (currentExecStrength > 0) sellExecStrengthRef.current[stockItem.symbol] = currentExecStrength;
          const isBelowVwap = strat.vwap > 0 && currentPrice < strat.vwap;
          // 🛡️ 손실 중일 때는 반전 신호(RSI 극단반전/매도세 흡수)로 조기 매도하지 않는다.
          // -0.5% 같은 일시적 하락은 다시 회복되는 경우가 많으므로, 손실 포지션은 오직 실제
          // 손절선(-1.0%)에 도달했을 때만 정리한다. 신호 기반 조기 청산은 "이익 중일 때"만 적용된다
          // (수익을 지키기 위해 먼저 빠져나오는 것은 여전히 유효하다).
          const isRsiExtremeReversal = strat.rsi >= 80 && isExecutionStrengthDeclining && isBelowVwap && overallProfitRatio >= 0;
          const isBearishAbsorptionExit = strat.isBearishAbsorption && overallProfitRatio >= 0;

          // ============================================================
          // 👻 가상 매도(로그 전용, 2026-09-28) — 실제로는 팔지 않는다. "이 규칙이었다면 여기서 팔았을 것"만
          // 매매 일지에 남기고, 포지션이 실제로 청산되면 실제 결과와 비교한다(신호 성과 분석 → 가상 매도 탭).
          // ============================================================
          try {
            const shadowBase = `${stockItem.symbol}_${weightedAvgPrice}`;
            const shadowName = stockItem.name || stockItem.symbol;
            const nowMs = Date.now();
            const entryAt = getOldestOpenLotTime(stockItem.symbol);
            const elapsedSec = entryAt ? (nowMs - entryAt) / 1000 : 0;

            // (1) 시간 청산 후보 — 진입 후 60/90/120초가 지나도록 최고 순수익이 목표에 못 미침
            if (entryAt) {
              for (const sec of [60, 90, 120]) {
                const key = `${shadowBase}_TIME_${sec}`;
                // 해당 시점 직후 30초 안에서만 기록(새로고침 직후 오래된 포지션이 한꺼번에 기록되지 않도록)
                if (elapsedSec >= sec && elapsedSec < sec + 30 && !shadowLoggedRef.current[key] && peakNetProfitPct < posTargetPct) {
                  shadowLoggedRef.current[key] = true;
                  recordShadowExit({
                    time: nowMs, symbol: stockItem.symbol, name: shadowName, kind: 'TIME', level: `${sec}초`,
                    detail: `진입 ${sec}초 경과 · 보유 중 최고 순수익 ${peakNetProfitPct.toFixed(2)}% < 목표 ${posTargetPct}%`,
                    price: currentPrice, netPct: Number(netProfitPct.toFixed(3)), entryPrice: weightedAvgPrice,
                  });
                }
              }
            }

            // (2) 매도 점수 후보 — 수익 단계 + VWAP 이탈 + CVD 하락 전환 + 체결강도 급락/기준선 하향 + 호가 반전 + 시간
            const items: string[] = [];
            let sellScore = 0;
            if (netProfitPct >= 0.5) { sellScore += 4; items.push('순수익≥0.5% +4'); }
            else if (netProfitPct >= 0.3) { sellScore += 2; items.push('순수익≥0.3% +2'); }
            else if (netProfitPct >= posTargetPct) { sellScore += 1; items.push(`순수익≥${posTargetPct}% +1`); }
            if (isBelowVwap) { sellScore += 2; items.push('VWAP 하향 이탈 +2'); }
            const cvdNow = (stockItem as any)?.cumulativeCvd ?? (stockItem as any)?.realCvd;
            if (typeof cvdNow === 'number') {
              const prevCvd = shadowCvdRef.current[stockItem.symbol];
              if (!prevCvd || nowMs - prevCvd.t >= 10000) {
                if (prevCvd && cvdNow < prevCvd.v) { shadowCvdFallingRef.current[stockItem.symbol] = true; }
                else if (prevCvd) { shadowCvdFallingRef.current[stockItem.symbol] = false; }
                shadowCvdRef.current[stockItem.symbol] = { v: cvdNow, t: nowMs };
              }
              if (shadowCvdFallingRef.current[stockItem.symbol]) { sellScore += 2; items.push('CVD 하락 전환(10초) +2'); }
            }
            if (prevExecStrength !== undefined && prevExecStrength >= 100 && currentExecStrength > 0 && currentExecStrength < 100) { sellScore += 2; items.push('체결강도 100 하향 돌파 +2'); }
            else if (isExecutionStrengthDeclining) { sellScore += 1; items.push('체결강도 급락 +1'); }
            {
              const obAt = lastWsOrderbookTickAtRef.current[stockItem.symbol] || 0;
              const ob = liveOrderbooksRef.current[stockItem.symbol];
              const bidV = Number(ob?.totalBidVolume || 0), askV = Number(ob?.totalAskVolume || 0);
              if (nowMs - obAt <= 10000 && bidV > 0 && askV > 0 && (bidV / askV) * 100 < 70) { sellScore += 2; items.push(`매수/매도 잔량 ${Math.round((bidV / askV) * 100)}% (매도 우세) +2`); }
            }
            if (entryAt && elapsedSec >= 90 && peakNetProfitPct < posTargetPct) { sellScore += 1; items.push('90초 넘게 목표 미달 +1'); }

            for (const lv of [4, 6]) {
              const key = `${shadowBase}_SCORE_${lv}`;
              if (sellScore >= lv && !shadowLoggedRef.current[key]) {
                shadowLoggedRef.current[key] = true;
                recordShadowExit({
                  time: nowMs, symbol: stockItem.symbol, name: shadowName, kind: 'SELL_SCORE', level: lv === 4 ? '4점(일부 매도)' : '6점(전량 매도)',
                  detail: `매도점수 ${sellScore} — ${items.join(', ')}`,
                  price: currentPrice, netPct: Number(netProfitPct.toFixed(3)), entryPrice: weightedAvgPrice,
                });
              }
            }
            // (3) 🐂🐻 포지션 평가 엔진(2026-10-02 통합안) — 실제 주문 없이 첫 판단만 가상 매도로 기록해 검증한다.
            //     부분매도(SELL_HALF)·전량매도(SELL_ALL)·시간손절(90초, 가격 +0.2% 미만)·최대보유(600초)·Bear>Bull·OBI붕괴
            if (entryAt) {
              const LPp = getLiveParams();
              const obP = liveOrderbooksRef.current[stockItem.symbol];
              const b1p = Number(obP?.bidPrice1 || 0), a1p = Number(obP?.askPrice1 || 0);
              const bidVP = Number(obP?.totalBidVolume || 0), askVP = Number(obP?.totalAskVolume || 0);
              const depAt = askDepletionEventAtRef.current[stockItem.symbol];
              const vwapNow = strat.vwap;
              const gapNow = vwapNow > 0 ? ((currentPrice - vwapNow) / vwapNow) * 100 : 0;
              const gapPast = (vwapGapHistRef.current[stockItem.symbol] || []).find(h => nowMs - h.t >= 8000 && nowMs - h.t <= 15000);
              const bbP = calculateBullBear(LPp as BullBearParams, {
  exec: currentExecStrength,
  rsi: strat.rsi,

  C: !!strat.isVolumeProfile,
  Q: !!strat.hasVolumeMomentum,

  realCvd:
    (stockItem as any)?.cumulativeCvd ??
    (stockItem as any)?.realCvd,

  cvdDelta:
    (stockItem as any)?.cvdDelta,

  VA: vwapNow > 0 ? currentPrice >= vwapNow : undefined,

     vwapGapPct:
     vwapNow > 0
       ? (
           (currentPrice - vwapNow) /
           vwapNow *
           100
         )
       : undefined,
                
  realAskDepletion:
    depAt !== undefined &&
    nowMs - depAt <= 20000,

  vwapExpansion:
    vwapNow > 0 &&
    currentPrice >= vwapNow &&
    !!gapPast &&
    gapNow > gapPast.g &&
    gapNow <= 1.5,

  askDominant:
    bidVP > 0 &&
    askVP > 0 &&
    (bidVP / askVP) * 100 <= 100 / 1.3,

  spreadTicks:
    b1p > 0 && a1p > 0
      ? Math.round(
          (a1p - b1p) /
          getTickSize(currentPrice || b1p, 'KR')
        )
      : undefined,

  bidVol: bidVP,
  askVol: askVP,
});
      const extP = positionExtremesRef.current[stockItem.symbol];
              const dec = evaluatePosition(LPp as BullBearParams, { entryPrice: weightedAvgPrice, entryTime: entryAt, highestPrice: Math.max(extP?.max || 0, weightedAvgPrice) }, currentPrice, nowMs, bbP, currentExecStrength);
              if (dec.action !== 'HOLD') {
                const key = `${shadowBase}_POS_${dec.action}`;
                if (!shadowLoggedRef.current[key]) {
                  shadowLoggedRef.current[key] = true;
                  recordShadowExit({
                    time: nowMs, symbol: stockItem.symbol, name: shadowName, kind: 'POSITION',
                    level: dec.action === 'SELL_HALF' ? '절반 매도' : '전량 매도',
                    detail: `${dec.reason} · 보유 ${Math.round(elapsedSec)}초 · Bull ${bbP.bull}(${bbP.bullReasons.join('·') || '-'}) / Bear ${bbP.bear}(${bbP.bearReasons.join('·') || '-'}) / OBI ${bbP.obi.toFixed(2)}`,
                    price: currentPrice, netPct: Number(netProfitPct.toFixed(3)), entryPrice: weightedAvgPrice,
                  });
                }
              }
            }
          } catch (e) {
            console.warn('[가상 매도 기록 실패]', e);
          }

          // 🪜 (2026-09-30) 트레일링 확인 — 고점에서 2틱 하락해도 바로 팔지 않고 매수세를 본다(사용자 설계).
          //   2틱: 체결강도 급락 / 체결강도 100 미만(매도 체결 우세) / CVD 하락(10초) / 매수호가 약화(총잔량 매수<매도) 중 하나라도 있으면 매도.
          //        전부 괜찮으면(매수세 살아있음) 보유 유지하고 3틱까지 허용.
          //   3틱 이상: 무조건 매도(최하한선).
          //   실시간 틱·호가가 오래돼 판단 근거가 없으면 약세로 보고 2틱에서 매도(예전 동작과 동일, 애프터마켓 호가 없음 포함).
          let trailingNote = '';
          if (isTrailingArmed && dropTicksFromPeak >= trailMaxLive) {
            isTrailingStop = true;
            trailingNote = `${dropTicksFromPeak}틱 하락 — 최대 허용 ${trailMaxLive}틱 도달`;
          } else if (isTrailingArmed && dropTicksFromPeak >= trailTicksLive) {
            const weak: string[] = [];
            if (!isFeedFresh) weak.push('실시간 체결 지연(확인 불가)');
            if (isExecutionStrengthDeclining) weak.push('체결강도 급락');
            if (currentExecStrength > 0 && currentExecStrength < 100) weak.push(`체결강도 ${currentExecStrength.toFixed(0)}(매도 체결 우세)`);
            if (!(currentExecStrength > 0)) weak.push('체결강도 값 없음');
            if (shadowCvdFallingRef.current[stockItem.symbol]) weak.push('CVD 하락');
            {
              const obAt = lastWsOrderbookTickAtRef.current[stockItem.symbol] || 0;
              const ob = liveOrderbooksRef.current[stockItem.symbol];
              const bidV = Number(ob?.totalBidVolume || 0), askV = Number(ob?.totalAskVolume || 0);
              if (Date.now() - obAt > 10000 || !(bidV > 0 && askV > 0)) weak.push('호가 확인 불가');
              else if (bidV < askV) weak.push(`매수호가 약화(잔량 ${Math.round((bidV / askV) * 100)}%)`);
            }
            if (weak.length > 0) {
              isTrailingStop = true;
              trailingNote = `${dropTicksFromPeak}틱 하락 + ${weak.join(', ')}`;
            } else {
              isTrailingStop = false; // 매수세 유지 — 3틱까지 허용
              const holdKey = `${markKey}_${currentHigh}`;
              if (trailingHoldLoggedRef.current[stockItem.symbol] !== holdKey) {
                trailingHoldLoggedRef.current[stockItem.symbol] = holdKey;
                addLog(stockItem.symbol, '매도', currentPrice, 0, `[트레일링 보류] 고점 ${formatCurrency(currentHigh)}에서 ${dropTicksFromPeak}틱 하락했지만 매수세 유지(체결강도 ${currentExecStrength.toFixed(0)}, CVD·매수호가 양호) — ${TRAILING_MAX_DROP_TICKS}틱까지 허용`);
              }
            }
          }

          const isTargetProfitSignal = enableCombinedAvgProfitExit && netProfitPct >= posTargetPct;
          // 🛡️ (2026-09-28) 이동평균 역전(단기5 < 장기20) 매도는 순수익이 목표(posTargetPct) 이상일 때만 —
          // 예전엔 순수익이 0보다만 크면(+0.01%라도) 전량 매도해서, 트레일링이 준비되기도 전에 수익을 잘라냈다.
          const isMaReversalExit = strat.sma5 < strat.sma20 && netProfitPct >= posTargetPct;
          // 센서 기반 신호 매도는 실시간 틱이 살아있을 때만 (틱이 뜸하면 센서 값이 오래돼 오판할 수 있음) — 손절·트레일링은 항상 판단
          // 💰 (2026-09-29) 모든 신호 매도에 최소 순수익(목표 이상) 조건 — 예전엔 이평 역전만 이 조건이 있고 RSI 과열 반전·매도세 흡수는
          // 본전 이상이기만 하면 팔아서, 첫 실거래 데이터에서 이긴 9건이 전부 가격 +0.25~0.29%(순수익 +0.03~0.08%)에 청산됐다
          // (비용 약 0.22%가 이익의 85%). 목표 전에는 손절·트레일링만 동작하고, 목표 이후엔 신호 매도와 트레일링 중 먼저 오는 쪽으로 판다.
          const sellSignal = isFeedFresh && netProfitPct >= posTargetPct && (isRsiExtremeReversal || isBearishAbsorptionExit || isMaReversalExit || isTargetProfitSignal);
          const isProfitTarget = sellSignal;
          const effectiveStopLossRatio = posStopPct / 100;
          // 🛟 (2026-09-30) 위 손절 판단(doStopLoss — 슬롯3 방어 대기 중엔 false)을 그대로 따른다. 예전처럼 여기서 손절선만 다시 보면
          // 슬롯3 대기 중에도 이 경로로 '리스크 관리 손절'이 나가 방어가 무력화된다.
          void effectiveStopLossRatio;
          const isStopLoss = doStopLoss;
          if (isTrailingStop || isProfitTarget || isStopLoss) {
            let sellReason = "";
            let exitReason: ExitReason;
            if (isTargetProfitSignal) { sellReason = `목표 수익률 도달 시그널 (${netProfitPct >= 0 ? '+' : ''}${netProfitPct.toFixed(2)}%)`; exitReason = 'TAKE_PROFIT'; }
            else if (isTrailingStop) { sellReason = `트레일링 스탑 (고점 ${formatCurrency(currentHigh)} · ${trailingNote || `${dropTicksFromPeak}틱 하락`} · 고점 순수익 ${peakNetProfitPct.toFixed(2)}%)`; exitReason = 'TRAILING_STOP'; }
            else if (isProfitTarget) { sellReason = `매도 시그널 감지 (${(overallProfitRatio * 100) >= 0 ? '+' : ''}${(overallProfitRatio * 100).toFixed(2)}%)`; exitReason = 'SIGNAL_REVERSAL'; }
            else { sellReason = "리스크 관리 손절"; exitReason = 'STOP_LOSS'; }

            transitionLifecycleStatus(stockItem.symbol, 'SELL_READY', sellReason);
            if (isSelected) setScalperMessage(`[매도 시그널] ${stockItem.name} ${formatCurrency(weightedAvgPrice)} -> ${formatCurrency(currentPrice)} (${sellReason})`);

            // 🛡️ 매우 중요한 수정: 예전엔 여기서 기존 미체결 매도 주문이 있는지 전혀 확인하지 않고
            // 무조건 새 매도 주문을 또 냈다. 만약 직전 사이클에서 이미 매도 주문이 나가서 아직
            // 미체결로 남아있으면(지정가가 아직 안 맞아서 대기 중 등), 그 물량은 이미 그 주문에
            // 묶여있는데 또 같은 수량을 팔려고 시도해서 "주문 가능한 수량을 초과했습니다"로 거부되고,
            // 다음 사이클에도 매도 시그널이 그대로 유지되니 계속 반복되는 무한 루프가 있었다.
            // 손절(위 1번 조건)은 "급하니 기존 주문을 취소하고 즉시 재주문"하는 게 맞지만, 일반
            // 익절/시그널 매도는 이미 낸 주문이 체결되길 기다리는 게 안전하다 — 굳이 취소하고
            // 다시 낼 필요가 없다.
            const existingPendingSells = pendingSellOrdersRef.current.filter(o => o.symbol === stockItem.symbol);
            if (existingPendingSells.length > 0) {
              // 🔁 (2026-09-30) 가격이 이미 주문가 아래로 내려가 체결될 수 없는 기존 자동 매도 주문은 취소하고 곧바로 다시 낸다.
              // 예전엔 무조건 "체결을 기다립니다"로 건너뛰어서, 트레일링 매도가 한 번 미체결되면 주문가 대비 -0.5%(약 7틱)
              // 자동취소까지 방치됐다 → 9/30 실거래에서 트레일링이 고점 대비 6~12틱 하락 후 체결(LS머트리얼즈 +1.1% → -0.57%).
              // 조건: 사용자 수동 매도·감시용(TARGET_WATCH) 주문 제외, 주문 후 2초 경과(체결 확인 기회), 주문가 > 현재가
              // 또는 주문가 > 실시간 매수1호가(5초 이내). 취소 실패/확인 불가면 기존처럼 기다리고 쿨다운을 건다.
              const obAtR = lastWsOrderbookTickAtRef.current[stockItem.symbol] || 0;
              const bid1R = Number(liveOrderbooksRef.current[stockItem.symbol]?.bidPrice1 || 0);
              const bidFreshR = bid1R > 0 && Date.now() - obAtR <= 5000;
              const unfillable = existingPendingSells.filter(o =>
                o.exitReason !== 'MANUAL' && o.type !== 'TARGET_WATCH' && !!o.id &&
                Date.now() - (o.createdAt || 0) >= 2000 &&
                (o.orderPrice > currentPrice || (bidFreshR && o.orderPrice > bid1R))
              );
              let allCleared = unfillable.length === existingPendingSells.length;
              if (allCleared && kisConfig.isConnected) {
                for (const order of unfillable) {
                  if (shouldSkipSellCancelRetry(order.id)) { allCleared = false; break; }
                  const cancelResult = await cancelPendingSellOrderSafely(order);
                  if (cancelResult === 'CANCELLED' || cancelResult === 'ALREADY_CLOSED') {
                    clearSellCancelRetryCooldown(order.id);
                    await recordFillOfClosedSellOrder(order);
                    setPendingSellOrders(prev => prev.filter(o => o.id !== order.id));
                    pendingSellOrdersRef.current = pendingSellOrdersRef.current.filter(o => o.id !== order.id);
                    addLog(stockItem.symbol, '매도', currentPrice, order.quantity, `[매도 재주문] 기존 주문 ${formatCurrency(order.orderPrice)}가 현재가 ${formatCurrency(currentPrice)}보다 높아 체결 불가 — 취소 후 다시 매도 (${sellReason})`);
                  } else {
                    markSellCancelRetryCooldown(order.id);
                    allCleared = false;
                    break;
                  }
                }
              } else {
                allCleared = false;
              }
              if (!allCleared) {
                if (isSelected) setScalperMessage(`[매도 대기] ${stockItem.name} 이미 미체결 매도 주문이 있어 체결을 기다립니다`);
                continue;
              }
              // 모두 종료 확인됨 → 아래에서 새 매도 주문 (수량은 executeTrade가 KIS 매도가능수량으로 다시 제한)
            }

            // 📒 매도 순간의 상황 기록 — 체결 로그가 들어오면 매매 일지에 붙는다 (슬리피지·고점 대비 하락폭 분석용)
            // 👻 트레일링 3틱 가상 비교 시작 — 이 포지션(종목_평단)당 1회. 이미 3틱 이상 빠진 상태면 3틱이어도 지금 팔았을 것이므로 즉시 기록.
            if (exitReason === 'TRAILING_STOP' && !shadowLoggedRef.current[`${markKey}_TRAIL3`]) {
              shadowLoggedRef.current[`${markKey}_TRAIL3`] = true;
              try {
                const base2NetPct = calculateNetProfitPercent(weightedAvgPrice, currentPrice, isStockUS ? 'US' : 'KR');
                if (dropTicksFromPeak >= TRAIL3_TICKS) {
                  recordShadowExit({
                    time: Date.now(), symbol: stockItem.symbol, name: stockItem.name || stockItem.symbol, kind: 'TRAIL3', level: '3틱',
                    detail: `판단 순간 이미 고점 ${currentHigh.toLocaleString()}에서 ${dropTicksFromPeak}틱 하락 — 3틱이어도 같은 시점`,
                    price: currentPrice, netPct: Number(base2NetPct.toFixed(3)), entryPrice: weightedAvgPrice,
                    actualNetPct: Number(base2NetPct.toFixed(3)), actualExitTime: Date.now(), actualExitReason: 'TRAILING_STOP(2틱 판단가)',
                  });
                } else {
                  trail3TrackersRef.current[markKey] = {
                    symbol: stockItem.symbol, name: stockItem.name || stockItem.symbol, avg: weightedAvgPrice, peak: currentHigh,
                    startedAt: Date.now(), base2Price: currentPrice, base2NetPct, isUS: isStockUS,
                  };
                }
              } catch { /* 가상 기록 실패는 매매와 무관 */ }
            }
            pendingExitContextRef.current[stockItem.symbol] = { at: Date.now(), triggerPrice: currentPrice, rule: exitReason, peakPrice: currentHigh, dropTicks: dropTicksFromPeak };
            const soldQty = await executeTrade('SELL', stockItem, totalHeldQty, `Profit Max (${stockItem.name}): ${sellReason}`, marketableSellPrice, weightedAvgPrice, undefined, exitReason, undefined, { deferFillCheck: true });

            // 🔧 (2026-10-03) 고점 기록은 "전량 체결이 확인됐을 때만" 지운다. 예전엔 주문이 미체결·일부 체결·실패여도 지워서,
            // 다음 주기에 고점이 현재가로 다시 잡혀 하락 틱이 0이 됐다 → 트레일링 조건이 풀려 위쪽의 "체결 불가 주문 취소 후
            // 재주문"에 도달하지 못하고, 미체결 매도가 주문가 대비 -0.5% 자동취소까지 방치됐다.
            // 보유가 0이 되면 위(보유 0주 정리)에서도 이 종목의 고점 기록을 지운다.
            if (soldQty >= totalHeldQty) {
              delete highWaterMarkRef.current[markKey];
              persistHighWaterMarks(true); // 매도 완료 시점엔 즉시(쓰로틀 없이) 저장해서 다음 새로고침에 죽은 키가 남지 않게 함
            }
            setLastTradeType('SELL');
            setGapTradeCount(prev => prev + 1);
          }
        }
      }
      } finally {
        isExecutingRef.current = false;
      }
    }, Math.max(1000, scalpingSpeed));

    return () => clearInterval(gapInterval);
  }, [isGapBotActive, gapBuyPrice, gapSellPrice, tradeQuantity, marketType, exchangeRate, kisConfig.isConnected, scalpingSpeed, scalpingTargetProfit, scalpingStopLoss, scalpingSoundEnabled, immediateEntry, entryPriceMode, lowestBidOnlyMode, maxSlots, allowSamePriceEntry, enableCombinedAvgProfitExit, detectStockStrategies, isTradingArmed]);

  const sellQtyMismatchCooldownRef = React.useRef<Record<string, number>>({}); // 종목별 "수량/금액 불일치로 인한 매매 재시도 쿨다운" 만료 시각 (매수/매도 공통)

  const executeTrade = async (action: 'BUY' | 'SELL' | 'HOLD', stock: Stock, amount: number, reason: string, customPrice?: number, buyPrice?: number, slotId?: string, exitReason?: ExitReason, entryReason?: string, opts?: { deferFillCheck?: boolean }): Promise<number> => {
    if (action === 'HOLD' || amount <= 0) return 0;

    // 🛡️ 수량/금액 불일치 쿨다운 체크 — 방금 "주문 가능한 수량을 초과했습니다"(매도) 또는
    // "주문가능금액을 초과했습니다"(매수, APBK0952) 실패를 겪은 종목은, 계좌 재동기화가 반영될
    // 시간(30초)을 주기 위해 이 기간 동안 매수/매도 재시도를 모두 건너뛴다.
    // 🛡️ 매우 중요한 수정: 예전엔 이 체크가 action === 'SELL'일 때만 적용됐다. 그런데 매수 쪽
    // "주문가능금액을 초과했습니다(APBK0952)"는 이 쿨다운을 전혀 걸지 않는 구조였어서, 매수
    // 신호(meetsBuyCriteria)가 계속 유지되는 동안 ENTRY_COOLDOWN_MS(5초)마다 같은 슬롯에 대해
    // 계속 새 매수를 시도하고, 그때마다 orderableKrw가 아직 stale한 채로 또 같은 이유로
    // 실패하는 게 무한 반복될 수 있었다. 이제 매수/매도 모두 이 쿨다운을 공유해서 적용한다.
    {
      const cooldownUntil = sellQtyMismatchCooldownRef.current[stock.symbol];
      if (cooldownUntil && Date.now() < cooldownUntil) {
        return 0;
      }
    }

    // 🔒 (2026-10-04) 직전 매수 주문의 응답이 불명(지연·주문번호 없음)이었던 종목은 KIS 미체결 주문과 대조될 때까지 새 매수를 쉰다
    if (action === 'BUY') {
      const until = buyUnknownCooldownRef.current[stock.symbol];
      if (until && Date.now() < until) return 0;
    }

    const tradeLockKey = `${stock.symbol}_${action}`;
    if (pendingTradeKeysRef.current.has(tradeLockKey)) {
      console.warn(`[중복 주문 방지] ${stock.symbol} ${action} 주문이 이미 진행 중입니다.`);
      // 🛡️ 예전엔 콘솔 경고만 하고 GLOBAL TRADE LOGS엔 아무것도 안 남았다. KIS 응답이 느려지면
      // (큐 혼잡, 재시도 등) 이전 시도가 몇 초씩 진행 중일 수 있는데, 그 사이 엔진 루프가 계속
      // 돌면서 매번 조용히 여기 막혀서 "진입 메시지는 뜨는데 실제 주문은 하나도 안 되는" 것처럼
      // 보일 수 있었다. 로그가 도배되지 않도록 같은 종목당 3초에 한 번만 남긴다.
      const lastLoggedAt = duplicateBlockLoggedAtRef.current[tradeLockKey] || 0;
      if (Date.now() - lastLoggedAt > 3000) {
        duplicateBlockLoggedAtRef.current[tradeLockKey] = Date.now();
        addLog(stock.symbol, action === 'SELL' ? '매도' : '매수', stock.price, amount, `[대기중] 이전 ${action === 'BUY' ? '매수' : '매도'} 주문이 아직 KIS 응답을 기다리는 중이라 이번 시도는 건너뜁니다.`);
      }
      return 0;
    }
    pendingTradeKeysRef.current.add(tradeLockKey);

    // 🛡️ 매우 중요한 안전조치: 예전엔 KIS가 연동 안 된 상태에서 매매를 시도하면, 실제 주문 API
    // 호출 자체를 건너뛰고 곧바로 로컬 holdings/balance를 낙관적으로 갱신하는 "가상 매매
    // 시뮬레이션"이 있었다 — 화면엔 "매수/매도 완료"로 보이지만 실제로는 KIS에 아무 주문도
    // 나가지 않았다. 이건 KIS API 키가 아예 없을 때뿐 아니라, 봇이 돌아가는 도중 KIS 연동이
    // 순간적으로 끊겼을 때(세션 만료, 네트워크 튐 등)도 똑같이 발동해서, 사용자가 실제 체결로
    // 착각하거나 로컬 상태와 실제 KIS 잔고가 어긋나는 위험이 있었다. 이제 KIS 미연동 시 매매
    // 자체를 여기서 완전히 차단한다 — 실제 주문 로직도, 그 아래의 로컬 상태 갱신도 전부 실행되지
    // 않는다.
    if (!kisConfig.isConnected) {
      pendingTradeKeysRef.current.delete(tradeLockKey);
      setBotStatus(`[매매 차단] KIS 미연동 상태 — 실제 계좌 연동 없이는 매매가 실행되지 않습니다`);
      addLog(stock.symbol, action === 'SELL' ? '매도' : '매수', stock.price, amount, `[매매 차단] KIS 미연동 — 실제 계좌 연동 후 다시 시도해주세요`);
      showNotification(`매매 차단: KIS 실제 계좌가 연동되어 있지 않습니다. [설정 > KIS 연동]에서 연동 상태를 확인해주세요.`, "error");
      return 0;
    }

    try {
      let tradePrice = customPrice !== undefined ? customPrice : stock.price;
    // 🛡️ (2026-09-28 매도 순서 점검) 매도가 결정(⑧).
    // 예전엔 모든 매도에 대해 "현재가가 지정 매도가보다 높으면 현재가로 상향"했다. 그런데 자동 매도
    // (트레일링/시그널/손절/마감판단)는 즉시 체결되도록 일부러 현재가-1틱(또는 매수1호가)으로 낸
    // 가격인데, 이 상향 때문에 결국 "현재가(직전 체결가)"에 지정가 주문이 나가서 매수호가가 그보다
    // 낮으면 체결되지 않고 미체결 대기 → -0.5% 취소 → 재주문 순환에 빠지는 "막힘"의 원인이 됐다.
    // 이제 현재가 상향은 수동 매도(MANUAL)에만 적용하고, 자동 매도는 실시간(5초 이내) 매수1호가가
    // 계산된 가격보다 높을 때만 그 매수1호가로 올린다 — 매수1호가는 즉시 체결되는 가장 높은 가격이다.
    if (action === 'SELL') {
      if (exitReason === 'MANUAL') {
        if (stock.price > tradePrice) tradePrice = stock.price; // [수익률 극대화] 수동 매도는 기존 동작 유지
      } else {
        const obAt = lastWsOrderbookTickAtRef.current[stock.symbol] || 0;
        const bid1 = Number(liveOrderbooksRef.current[stock.symbol]?.bidPrice1 || 0);
        if (bid1 > 0 && Date.now() - obAt <= 5000 && bid1 > tradePrice && (stock.price <= 0 || bid1 <= stock.price)) {
          tradePrice = bid1;
        }
      }
    }
    let finalAmount = amount;

    // KIS API가 연결되어 있고 실제 주문 전송이 활성화된 경우 실제 주문을 라이브 인터페이스를 통해 시도
    if (kisConfig.isConnected) {
        if (action === 'BUY') {
            // 🛡️ 최종 안전장치: 앞으로 새로운 매수 경로가 추가되더라도, 여기서 마지막으로 한번 더
            // 막는다. 어떤 값의 amount가 넘어왔든 상관없이, 실제 주문 직전에 "설정 진입금액 ÷
            // 실제 주문가격"으로 다시 계산해서 finalAmount를 확정한다. 이 아래 이어지는 KIS 실제
            // 매수가능수량 조회는 그대로 유지되며, 그 로직이 이 finalAmount를 기준으로 실제 가능
            // 여부를 다시 검증한다 — 즉 (설정금액 기준 수량)과 (KIS 실제 매수가능수량) 중 작은
            // 쪽으로 최종 확정되는 흐름이 자연스럽게 완성된다.
            const budget = targetInvestmentPerStockRef.current;

            if (!Number.isFinite(tradePrice) || tradePrice <= 0) {
              addLog(
                stock.symbol,
                '매수',
                0,
                0,
                '[매수 차단] 유효하지 않은 주문가격'
              );
              return 0;
            }

            const budgetQty = Math.floor(budget / tradePrice);

            if (budgetQty <= 0) {
              addLog(
                stock.symbol,
                '매수',
                tradePrice,
                0,
                `[매수 차단] ${budget.toLocaleString()}원으로 1주 매수 불가`
              );
              return 0;
            }

            finalAmount = budgetQty;

            try {
                const isKR = /^\d{6}$/.test(stock.symbol);
                if (isKR) {
                    setBotStatus(`[KIS API] ${stock.symbol} 매수 가능 수량 조회 중...`);
                    let parsedQty = 0;
                    // 🛡️ 실제 주문에 쓸 기준(지정가/시장가)과 동일한 기준으로 조회해야 정확하다 —
                    // 목표가(tradePrice)가 있으면 지정가로, 없으면 전역 설정을 따른다.
                    const buyableCheckOrdDvsn = (tradePrice && tradePrice > 0) ? '00' : (kisConfig.domesticOrderType || '00');
                    const psblRes = await kisService.getDomesticBuyableAmount(stock.symbol, (tradePrice || 0).toString(), buyableCheckOrdDvsn);
                    // 🛡️ (2026-09-29 과제2 매수 순서 점검 ⑤~⑦) KIS 매수가능조회(TTTC8908R) 응답의 실제 필드는
                    // nrcvb_buy_qty(미수없는 매수수량)·max_buy_qty(최대매수수량=미수 포함)·nrcvb_buy_amt·ord_psbl_cash 등이다
                    // (KIS 공식 샘플 inquire_psbl_order 확인). 예전 코드는 존재하지 않는 필드(nrcy_buy_qty 등)를 먼저 찾고
                    // 후보 중 "최댓값"을 써서, 사실상 항상 미수 포함 수량(max_buy_qty)으로 판단했다 → 현금이 부족해도
                    // "가능"으로 통과해 APBK0952(주문가능금액 초과) 거부나 미수 발생 위험이 있었다.
                    // 이제 미수 없는 수량(nrcvb_buy_qty)만 기준으로 삼고, 설정 금액 수량보다 적으면 그 수량으로 줄여서 주문한다.
                    let kisNoMarginQty: number | null = null;
                    let kisNoMarginCash = 0;
                    if (psblRes && psblRes.rt_cd === '0' && psblRes.output) {
                        const out: any = psblRes.output;
                        const rawNrcvb = out.nrcvb_buy_qty ?? out.nrcy_buy_qty;
                        if (rawNrcvb !== undefined && rawNrcvb !== null && rawNrcvb !== '') {
                          const q = parseInt(String(rawNrcvb), 10);
                          if (!isNaN(q)) kisNoMarginQty = Math.max(0, q);
                        }
                        kisNoMarginCash = Number(out.nrcvb_buy_amt || 0) > 0 ? Number(out.nrcvb_buy_amt) : Number(out.ord_psbl_cash || 0);
                        if (kisNoMarginCash > 0 && kisNoMarginCash !== orderableKrwRef.current) {
                          setOrderableKrw(kisNoMarginCash); // 방금 조회한 최신 주문가능금액으로 화면·엔진 값을 갱신
                        }
                    }

                    const availCash = kisNoMarginCash > 0 ? kisNoMarginCash : (orderableKrw > 0 ? orderableKrw : balance);
                    if (kisNoMarginQty !== null) {
                      parsedQty = kisNoMarginQty;
                    } else if (availCash > 0 && tradePrice > 0) {
                      // 조회 실패/필드 없음 — 알고 있는 주문가능금액으로 추정 (수수료 여유 0.1% 차감)
                      parsedQty = Math.floor(availCash / (tradePrice * 1.001));
                    }

                    if (parsedQty <= 0) {
                        setBotStatus(`[매수 취소] 실제 매수 가능 수량 0주 (주문가능 ${availCash.toLocaleString()}원, 주문가 ${formatCurrency(tradePrice)})`);
                        if (stock.symbol === selectedStock?.symbol) setScalperMessage("실제 주문 가능 수량 부족 (0주)으로 진입 건너뜀");
                        addLog(stock.symbol, '매수', tradePrice, amount, `[주문취소] KIS 매수 가능 수량 0주 (미수 없는 기준) — 주문가능 ${availCash.toLocaleString()}원, 주문가=${formatCurrency(tradePrice)}`);
                        return 0;
                    }
                    if (parsedQty < finalAmount) {
                        addLog(stock.symbol, '매수', tradePrice, parsedQty, `[매수수량 조정] 설정금액 기준 ${finalAmount}주 → KIS 매수가능(미수 없음) ${parsedQty}주로 줄여서 주문`);
                        finalAmount = parsedQty;
                    }
                } else {
                    // Overseas buyable amount check
                    setBotStatus(`[KIS API] ${stock.symbol} 해외 매수 가능 수량 조회 중...`);
                    let parsedQty = 0;
                    try {
                        const psblRes = await kisService.getOverseasBuyableAmount(stock.symbol, (tradePrice || 0).toString());
                        if (psblRes?.rt_cd === '0' && psblRes.output) {
                            const candidateQtys = [
                              psblRes.output.nrcy_buy_qty,
                              psblRes.output.ord_psbl_qty,
                              psblRes.output.max_buy_qty,
                              psblRes.output.max_ord_qty
                            ].map(v => (v !== undefined && v !== null && v !== '') ? parseInt(String(v), 10) : 0)
                             .filter(v => !isNaN(v) && v > 0);

                            parsedQty = candidateQtys.length > 0 ? Math.max(...candidateQtys) : 0;

                            const usdAmt = Number(psblRes.output.frcr_ord_psbl_amt || psblRes.output.ord_psbl_frcr_amt || psblRes.output.ovrs_ord_psbl_amt || 0);
                            const availUsd = usdAmt > 0 ? usdAmt * exchangeRate : (orderableUsd > 0 ? orderableUsd * exchangeRate : balance);
                            if (parsedQty <= 0 && availUsd > 0 && tradePrice > 0) {
                              parsedQty = Math.floor(availUsd / (tradePrice * exchangeRate));
                            }
                        } else {
                            const availUsd = orderableUsd > 0 ? orderableUsd * exchangeRate : balance;
                            if (availUsd > 0 && tradePrice > 0) {
                              parsedQty = Math.floor(availUsd / (tradePrice * exchangeRate));
                            }
                        }

                        const availUsd = orderableUsd > 0 ? orderableUsd * exchangeRate : balance;
                        if (parsedQty <= 0 && availUsd >= (tradePrice * exchangeRate * finalAmount)) {
                          parsedQty = finalAmount;
                        }

                        if (parsedQty <= 0) {
                            setBotStatus(`[매수 취소] 실제 매수 가능 수량 0주`);
                            showNotification(`해외 매수 스킵: 매수 가능 수량이 0주입니다.`, "error");
                            return 0;
                        }
                        if (parsedQty < finalAmount && availUsd < (tradePrice * exchangeRate * finalAmount)) {
                            setBotStatus(`[매수 진입 차단] 해외 주문 가능 수량 부족 (${parsedQty}주)`);
                            showNotification(`해외 매수 차단: 가능 수량(${parsedQty}주)이 부족합니다.`, "error");
                            return 0;
                        }
                    } catch (e) {
                        console.warn("Overseas buyable check failed, proceeding anyway:", e);
                    }
                }
            } catch (err: any) {
                console.error("Failed to query domestic buyable amount:", err);
                setBotStatus("매수 가능 수량 조회 실패");
                // 🛡️ 여기에 addLog가 없어서, 매수가능수량 조회 자체가 예외로 실패하면(큐 congestion,
                // 타임아웃 등) GLOBAL TRADE LOGS에 아무 흔적도 안 남고 조용히 매수 시도가 끝나고
                // 있었다. "[BUY ORDER] 콘솔로그는 찍히는데 그 다음이 아예 없다"는 증상의 유력한
                // 원인이었다.
                addLog(stock.symbol, '매수', tradePrice, amount, `[주문취소] 매수 가능 수량 조회 실패: ${err?.message || '알 수 없는 오류'}`);
                showNotification(`매수 가능 수량 조회 실패: ${err.message}`, "error");
                return 0; // KIS API 오류 시 안전을 위해 진입하지 않음
            }
        }

        // ============================================================
        // 🔴 (2026-09-28 매도 순서 점검) ⑤~⑦ 매도 주문 "전"에 KIS 매도가능수량을 확인한다.
        // 예전엔 이 조회가 주문을 낸 "뒤"(체결 확인 후 로컬 정리 단계)에 있었고, 게다가 KIS 응답에
        // 존재하지 않는 필드(nrc_psbl_qty)를 읽어서 항상 0으로 판정됐다 — 그 결과 매도가 체결돼도
        // 로컬 보유수량/슬롯 정리를 건너뛰고 "매도 가능 수량 0주" 알림만 뜨는 버그가 있었다.
        // 공식 응답 필드(KIS 공식 샘플 inquire_psbl_sell 확인)는 ord_psbl_qty(주문가능수량)다.
        // ord_psbl_qty는 이미 다른 매도주문에 묶인 수량을 뺀 값이라, 이걸로 주문 수량을 제한하면
        // "주문 가능한 수량을 초과했습니다(APBK0400)" 거부 자체를 미리 막을 수 있다.
        // 🛡️ 조회가 실패하거나 3초 안에 응답이 없으면 매도를 막지 않고 요청 수량 그대로 진행한다
        // (손절이 조회 지연 때문에 멈추면 안 되므로 — 수량이 틀리면 KIS가 거부하고 기존 APBK0400
        // 처리 경로가 재동기화한다).
        // ============================================================
        if (action === 'SELL' && /^\d{6}$/.test(stock.symbol)) {
            setBotStatus(`[KIS API] ${stock.symbol} 매도 가능 수량 확인 중...`);
            let kisSellable: number | null = null;
            try {
                const sellableRes: any = await Promise.race([
                    kisService.getDomesticSellableQuantity(stock.symbol),
                    new Promise(resolve => setTimeout(() => resolve(null), 3000)),
                ]);
                if (sellableRes && sellableRes.rt_cd === '0' && sellableRes.output) {
                    const out = Array.isArray(sellableRes.output) ? sellableRes.output[0] : sellableRes.output;
                    const rawQty = out?.ord_psbl_qty ?? out?.nrc_psbl_qty;
                    const parsed = parseInt(String(rawQty ?? ''), 10);
                    if (!isNaN(parsed)) kisSellable = parsed;
                }
            } catch (e) {
                console.warn('[매도가능수량 조회 실패] 요청 수량 그대로 주문을 진행합니다', e);
            }

            if (kisSellable !== null) {
                if (kisSellable <= 0) {
                    setBotStatus(`[매도 건너뜀] ${stock.name} KIS 매도가능수량 0주`);
                    addLog(stock.symbol, '매도', tradePrice, finalAmount, `[매도 건너뜀] KIS 매도가능수량 0주 — 이미 매도됐거나 다른 매도주문에 묶여 있음. 잔고를 재동기화합니다.`);
                    // 로컬 보유수량이 실제와 어긋나 있다는 신호 — 재동기화가 반영될 5초 동안은 같은 종목 매매를 쉰다
                    sellQtyMismatchCooldownRef.current[stock.symbol] = Date.now() + 5000;
                    if (!syncInProgressRef.current) handleSyncKIS();
                    return 0;
                }
                if (kisSellable < finalAmount) {
                    addLog(stock.symbol, '매도', tradePrice, kisSellable, `[매도수량 조정] 요청 ${finalAmount}주 → KIS 매도가능 ${kisSellable}주로 조정`);
                    finalAmount = kisSellable;
                }
            } else {
                console.warn(`[매도가능수량 확인 불가/지연] ${stock.symbol} 요청 수량 ${finalAmount}주로 그대로 주문합니다`);
            }
        }

        try {
            // 🛡️ 매우 중요한 수정: 예전엔 여기서 kisConfig.domesticOrderType(전역 설정, entryPriceMode와
            // 무관)을 그대로 ordDvsn으로 썼다. 그런데 "매수1호가/매수2호가" 같은 진입 호가 방식은
            // 특정 가격(tradePrice)을 목표로 계산한 것이므로, 반드시 지정가(00)로 주문해야 그 가격이
            // 실제로 반영된다 — 전역 설정이 우연히 '01'(시장가)이면 애써 계산한 목표가가 무시되고
            // 엉뚱한 가격에 체결될 위험이 있었다. 이제 유효한 목표가가 있으면 무조건 지정가로 낸다.
            const effectiveOrdDvsn = (tradePrice && tradePrice > 0) ? '00' : (kisConfig.domesticOrderType || '00');
            // 🛡️ 신규 추가: KRX 애프터마켓(16:00~20:00, 2026-09-14부터)은 정규장과 다른 주문유형이
            // 필요한 것으로 확인됐다(지정가/최우선지정가/최유리지정가만 가능, ORD_DVSN 41~47 사용).
            // 정규장 로직(위 effectiveOrdDvsn 계산)은 전혀 안 건드리고, 애프터마켓 세션일 때만 값을
            // 덮어쓴다 — 41(애프터마켓 지정가)을 기본으로 사용. 아직 실전 검증 전이므로 실제로
            // 이 경로를 타는지 로그로 남긴다.
            const finalOrdDvsn = isKrxAfterMarketSession() ? '41' : effectiveOrdDvsn;
            if (isKrxAfterMarketSession()) {
              console.log('[애프터마켓 주문] ORD_DVSN을 41(애프터마켓 지정가)로 전송합니다', { symbol: stock.symbol, action, tradePrice, finalAmount });
            }
            // 🎨 매우 중요한 추가: executeTrade는 매수/매도 모든 경로(자동매매 엔진, 수동매도,
            // BullGPT 시그널 등)가 공통으로 거치는 지점이다. 지금까지 SELLING 상태로의 전이가
            // 어디서도 호출된 적이 없어서, 매도 주문 중에도 카드가 계속 "매수시도중" 색으로 남거나
            // 아예 전이가 안 되는 문제가 있었다. 여기서 실제 주문 전송 직전에 공통으로 전이해서,
            // 어떤 경로로 주문이 나가든 카드 테두리 색이 정확히 반영되게 한다.
            transitionLifecycleStatus(stock.symbol, action === 'BUY' ? 'BUYING' : 'SELLING', `${action === 'BUY' ? '매수' : '매도'} 주문 전송 (${formatCurrency(tradePrice || 0)} x ${finalAmount || 1})`);
            setBotStatus(`[KIS API] ${stock.symbol} ${action === 'BUY' ? '매수' : '매도'} 주문 전송 중...`);
            // 🛡️ 부분체결 시 남은 미체결 잔량을 추적하려면 "실제로 KIS에 요청한 수량"을 미리
            // 기억해둬야 한다 — 아래에서 filledQty만큼 확인된 뒤 finalAmount가 그걸로 덮어써지면
            // 원래 요청 수량을 알 방법이 없어진다.
            const requestedQty = finalAmount || 1;
            const orderSentAt = Date.now(); // 미체결 매수 30초 만료는 등록 시각이 아니라 주문 전송 시각부터 잰다
            const res = await kisService.order(
                stock.symbol,
                action,
                (tradePrice || 0).toString(),
                requestedQty.toString(),
                finalOrdDvsn
            );

            if (res.rt_cd === '0') {
               const rawOdno = res.output?.ODNO || res.output?.odno || res.output1?.odno || res.output1?.ODNO;
               const odno = rawOdno ? rawOdno.toString().trim() : '';
               if (odno) {
                   if (action === 'BUY') handledBuyOrderIdsRef.current.add(odno); // 이 주문은 여기서 직접 관리 — KIS 대조가 다시 등록하지 않도록
                   // 🗂️ 거래 케이스에 주문번호 연결
                   try {
                     if (action === 'BUY') onCaseBuyOrder(stock.symbol, stock.name || stock.symbol, { orderId: odno, price: tradePrice, qty: requestedQty, time: orderSentAt });
                     else onCaseSellOrder(stock.symbol, { orderId: odno, price: tradePrice, time: orderSentAt, reason: exitReason });
                   } catch { /* 케이스 기록 실패는 매매와 무관 */ }

                   // ⚡ (2026-10-04) 매매 엔진이 낸 주문은 여기서 체결을 기다리지 않는다. 예전엔 아래 폴링(1.5초 × 6회)을 엔진이
                   // 기다려서, 주문 1건마다 엔진 전체가 9초 이상 멈췄다(그동안 다른 종목 매수 판단, 보유 종목 손절·트레일링 정지).
                   // 주문이 접수되면 곧바로 미체결 목록에 등록하고 돌아간다 — 체결 확인·보유수량·슬롯·매매 일지 반영은
                   // 미체결 매수/매도 감시(주문별 1.5초 간격)가 독립적으로 처리한다. 수동 매도 등 다른 경로는 기존대로 여기서 기다린다.
                   if (opts?.deferFillCheck) {
                     const orgNoDeferred = res.output?.KRX_FWDG_ORD_ORGNO || res.output?.krx_fwdg_ord_orgno || "";
                     if (action === 'BUY') {
                       const deferredBuy: PendingBuyOrder = {
                         id: odno, orgNo: orgNoDeferred, symbol: stock.symbol, orderPrice: tradePrice,
                         quantity: requestedQty, originalQuantity: requestedQty, createdAt: orderSentAt,
                         slotId: slotId || `SLOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                         ordDvsn: finalOrdDvsn,
                       };
                       // ref를 먼저 갱신 — 다음 엔진 주기(최대 1초 뒤)가 이 주문을 바로 보고 같은 종목에 또 주문하지 않도록
                       if (!pendingBuyOrdersRef.current.some(o => o.id === odno)) pendingBuyOrdersRef.current = [...pendingBuyOrdersRef.current, deferredBuy];
                       setPendingBuyOrders(prev => prev.some(o => o.id === odno) ? prev : [...prev, deferredBuy]);
                     } else {
                       const deferredSell: PendingSellOrder = {
                         id: odno, orgNo: orgNoDeferred, symbol: stock.symbol, orderPrice: tradePrice,
                         quantity: requestedQty, createdAt: orderSentAt, type: 'LIMIT_SELL',
                         reason, buyPrice: buyPrice, slotId: slotId, exitReason, ordDvsn: finalOrdDvsn,
                       };
                       if (!pendingSellOrdersRef.current.some(o => o.id === odno)) pendingSellOrdersRef.current = [...pendingSellOrdersRef.current, deferredSell];
                       setPendingSellOrders(prev => prev.some(o => o.id === odno) ? prev : [...prev, deferredSell]);
                     }
                     setBotStatus(`[주문 접수] ${stock.name} ${action === 'BUY' ? '매수' : '매도'} 주문 번호(${odno}) — 체결 확인 중`);
                     addLog(stock.symbol, action === 'BUY' ? '매수' : '매도', tradePrice, requestedQty, `[주문접수] ${reason} — 체결은 미체결 감시가 확인합니다`);
                     return 0;
                   }
                   setBotStatus(`[KIS API] 주문 번호(${odno}) 체결 대기 및 실시간 확인 중...`);
                   let filled = false;
                   let filledQty = 0;
                   let filledPrice = tradePrice;
                   
                   // Poll every 1.5 seconds for up to 6 times (9 seconds total)
                   for (let attempt = 1; attempt <= 6; attempt++) {
                       await new Promise(resolve => setTimeout(resolve, 1500));
                       try {
                           const status = await kisService.checkOrderExecution(odno);
                           if (status.found) {
                               if (status.isFullyFilled) {
                                   filled = true;
                                   filledQty = status.ordQty;
                                   filledPrice = status.price || tradePrice;
                                   break;
                               } else if (status.ccldQty > 0) {
                                   filledQty = status.ccldQty;
                                   filledPrice = status.price || tradePrice;
                               }
                           }
                       } catch (err) {
                           console.warn(`[Execution Check] Attempt ${attempt} failed:`, err);
                       }
                   }
                   
                   if (filled) {
                       setBotStatus(`[체결 완료] 주문 번호(${odno})가 전량 체결되었습니다.`);
                       const pnlPercent = (action === 'SELL' && buyPrice && buyPrice > 0)
                         ? Number((((filledPrice - buyPrice) / buyPrice) * 100).toFixed(2))
                         : undefined;
                       addLog(stock.symbol, action === 'BUY' ? '매수' : '매도', filledPrice, filledQty, `[실제체결 완료] ${reason}`,
                         action === 'SELL' ? { exitReason, pnlPercent } : { entryReason });
                       showNotification(`${stock.name} ${action === 'BUY' ? '매수' : '매도'} 주문이 전량 체결되었습니다. (가격: ${formatCurrency(filledPrice)})`, "success");
                       transitionLifecycleStatus(stock.symbol, action === 'BUY' ? 'HOLDING' : 'COMPLETED', `${action === 'BUY' ? '매수' : '매도'} 체결 확인 (${formatCurrency(filledPrice)} x ${filledQty})`);
                       finalAmount = filledQty;
                       // 🛡️ (과제2) 매수 평단·슬롯 가격은 주문가가 아니라 실제 체결가로 기록한다
                       if (action === 'BUY' && filledPrice > 0) tradePrice = filledPrice;
                        if (action === "SELL" && slotId) {
                            if (stock.symbol === selectedStock?.symbol) {
                                const next = gapInventoryRef.current.filter(s => s.id !== slotId);
                                gapInventoryRef.current = next;
                                setGapInventory(next);
                            }
                            {
                                const curInv = scalperTabsRef.current.find(t => t.symbol === stock.symbol)?.gapInventory || [];
                                updateTab(stock.symbol, { gapInventory: curInv.filter(s => s.id !== slotId) });
                            }
                        }
                   } else if (filledQty > 0) {
                       setBotStatus(`[일부 체결] 주문 번호(${odno})가 일부 체결되었습니다 (${filledQty}주).`);
                       const partialPnlPercent = (action === 'SELL' && buyPrice && buyPrice > 0)
                         ? Number((((filledPrice - buyPrice) / buyPrice) * 100).toFixed(2))
                         : undefined;
                       addLog(stock.symbol, action === 'BUY' ? '매수' : '매도', filledPrice, filledQty, `[일부체결] ${reason}`,
                         action === 'SELL' ? { exitReason, pnlPercent: partialPnlPercent } : { entryReason });
                       showNotification(`${stock.name} ${action === 'BUY' ? '매수' : '매도'} 주문이 일부 체결되었습니다 (${filledQty}주).`, "info");
                       finalAmount = filledQty;
                        if (action === "SELL" && slotId) {
                            if (stock.symbol === selectedStock?.symbol) {
                                const next = gapInventoryRef.current.map(s => 
                                    s.id === slotId ? { ...s, quantity: Math.max(0, s.quantity - filledQty) } : s
                                ).filter(s => s.quantity > 0);
                                gapInventoryRef.current = next;
                                setGapInventory(next);
                            }
                            {
                                const curInv = scalperTabsRef.current.find(t => t.symbol === stock.symbol)?.gapInventory || [];
                                const inv = curInv.map(s =>
                                    s.id === slotId ? { ...s, quantity: Math.max(0, s.quantity - filledQty) } : s
                                ).filter(s => s.quantity > 0);
                                updateTab(stock.symbol, { gapInventory: inv });
                            }
                        }
                        if (action === "SELL") {
                          // 🛡️ (2026-09-28 매도 순서 점검) 매도 부분체결 잔량 추적 — 매수 쪽(버그 수정 5)과
                          // 같은 문제가 매도에도 있었다. 9초 폴링 안에 일부만 체결되면 나머지 수량은 KIS에
                          // 미체결 매도주문으로 살아있는데 로컬 pendingSellOrders엔 등록되지 않아서, 엔진이
                          // "대기 중인 매도 없음 + 보유수량 남음"으로 보고 같은 물량을 또 팔려다 APBK0400
                          // (주문 가능 수량 초과)으로 거부되는 원인이 됐다. 이제 남은 잔량을 pending으로
                          // 등록해서 미체결 관리(체결 확인 / -0.5% 취소 / 손절 시 취소 후 재주문)가 이어받는다.
                          const remainingSellQty = requestedQty - filledQty;
                          if (remainingSellQty > 0) {
                            processedFilledQtyRef.current[odno] = filledQty; // 이미 반영한 체결분은 다시 세지 않도록
                            const orgNoForPartialSell = res.output?.KRX_FWDG_ORD_ORGNO || res.output?.krx_fwdg_ord_orgno || "";
                            const partialPendingSell: PendingSellOrder = {
                              id: odno,
                              orgNo: orgNoForPartialSell,
                              symbol: stock.symbol,
                              orderPrice: tradePrice,
                              quantity: remainingSellQty,
                              createdAt: Date.now(),
                              type: 'LIMIT_SELL',
                              reason, buyPrice: buyPrice, slotId: slotId, exitReason,
                              ordDvsn: finalOrdDvsn
                            };
                            setPendingSellOrders(prev => [...prev, partialPendingSell]);
                            addLog(stock.symbol, '매도', tradePrice, remainingSellQty, `[매도 부분체결 잔량 추적] 남은 ${remainingSellQty}주는 미체결 매도로 등록되어 계속 감시됩니다.`);
                          }
                        }
                        if (action === "BUY") {
                          // 🛡️ 매우 중요한 수정: 매수 주문이 부분체결된 경우, 이 주문에는 아직 KIS에
                          // 살아있는 미체결 잔량이 남아있다. 예전엔 이 잔량을 별도로 추적하지 않아서,
                          // 9초 폴링이 끝난 뒤 KIS에서 나머지가 알아서 체결돼도 로컬
                          // pendingBuyOrders/gapInventory는 전혀 모르는 채로 남았다. 그 결과
                          // handleSyncKIS()의 "슬롯 동기화"가 나중에 실제 계좌 수량과 로컬 슬롯
                          // 합계가 어긋난 걸 뒤늦게 발견해서, 그 차액 전부를 "RECOVERED-..."라는
                          // 슬롯 하나에 뭉뚱그려 넣게 됐다 — 이게 슬롯 개수/수량이 종목당
                          // 진입금액(targetInvestmentPerStock) 예산과 전혀 안 맞아 보이는 원인 중
                          // 하나였다. 이제 남은 잔량을 pendingBuyOrder로 등록해서, 이후 체결되는
                          // 만큼도 정상적인 슬롯으로 반영되게 한다.
                          const remainingQty = requestedQty - filledQty;
                          if (remainingQty > 0) {
                            slotId = slotId || `SLOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                            // 이미 확인된 filledQty는 이 함수 아래쪽(낙관적 처리)에서 곧바로 반영되므로,
                            // 이후 체결확인 루프가 그 분량을 "새로 체결됨"으로 다시 세지 않도록
                            // 누적 처리량을 미리 filledQty로 기록해둔다.
                            processedFilledQtyRef.current[odno] = filledQty;
                            const orgNoForPartial = res.output?.KRX_FWDG_ORD_ORGNO || res.output?.krx_fwdg_ord_orgno || "";
                            const newPendingFromPartial: PendingBuyOrder = {
                              id: odno,
                              orgNo: orgNoForPartial,
                              symbol: stock.symbol,
                              orderPrice: tradePrice,
                              quantity: remainingQty,
                              originalQuantity: requestedQty, // 원 주문수량 — 누적 체결수량과 비교할 기준
                              createdAt: orderSentAt,
                              slotId,
                              ordDvsn: finalOrdDvsn // 🛡️ (과제2) 실제 보낸 주문구분(정규장 00 / 애프터 41) — 취소 시 그대로 사용
                            };
                            setPendingBuyOrders(prev => [...prev, newPendingFromPartial]);
                            addLog(stock.symbol, '매수', tradePrice, remainingQty, `[부분체결 잔량 추적] 남은 ${remainingQty}주는 미체결 대기로 등록되어 계속 감시됩니다.`);
                          }
                          // 🛡️ (과제2) 이미 체결된 분량의 평단·슬롯 가격은 실제 체결가로 기록 (잔량 주문은 위에서 주문가로 등록 완료)
                          if (filledPrice > 0) tradePrice = filledPrice;
                        }
                   } else {
                       setBotStatus(`[미체결 상태] 주문 번호(${odno})가 아직 체결되지 않았습니다.`);
                       addLog(stock.symbol, action === 'BUY' ? '매수' : '매도', tradePrice, finalAmount, `[주문접수/미체결] 실시간 체결 대기 및 동기화 감시`);
                       showNotification(`${stock.name} 주문 접수 완료 (미체결 상태). 체결 발생 시 잔고에 자동 동기화됩니다.`, "info");
                       // Register as Pending Order for execution check
                       const orgNo = res.output?.KRX_FWDG_ORD_ORGNO || res.output?.krx_fwdg_ord_orgno || "";
                       if (action === 'BUY') {
                         const createdSlotId = slotId || `SLOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                         const newPending: PendingBuyOrder = {
                           id: odno,
                           orgNo,
                           symbol: stock.symbol,
                           orderPrice: tradePrice,
                           quantity: finalAmount,
                           originalQuantity: finalAmount,
                           createdAt: orderSentAt,
                           slotId: createdSlotId,
                           ordDvsn: finalOrdDvsn // 🛡️ (과제2) 실제 보낸 주문구분(정규장 00 / 애프터 41) — 취소 시 그대로 사용
                         };
                         setPendingBuyOrders(prev => [...prev, newPending]);
                       } else {
                         const newPendingSell: PendingSellOrder = {
                           id: odno,
                           orgNo,
                           symbol: stock.symbol,
                           orderPrice: tradePrice,
                           quantity: finalAmount,
                           createdAt: Date.now(),
                           type: 'LIMIT_SELL',
                           reason, buyPrice: buyPrice, slotId: slotId, exitReason,
                           // 🛡️ 실제로 KIS에 보낸 주문구분(정규장 00 / 애프터마켓 41)을 기록 — 나중에 취소할 때
                           // 이 값을 그대로 쓰므로, 전역 설정값을 넣으면 애프터마켓 주문 취소가 어긋날 수 있다.
                           ordDvsn: finalOrdDvsn
                         };
                         setPendingSellOrders(prev => [...prev, newPendingSell]);
                       }

                       return 0; // Return 0 immediately so local state/slots do not optimistically update
                   }
               } else {
                   // 🛡️ 매우 중요한 수정: 예전엔 여기서(odno=진짜 주문번호가 없는데도) 그냥
                   // "[실제계좌 주문완료]"라고 성공 처리하고 있었다. rt_cd==='0'은 KIS API 서버와의
                   // 통신 자체가 성공했다는 뜻일 뿐, 실제로 주문이 접수됐다는 보장이 아니다 — 진짜
                   // 접수됐다면 반드시 주문번호(ODNO)가 함께 온다. odno가 없다는 건 "통신은 됐지만
                   // 실제 주문은 안 들어갔다"는 뜻인데 이걸 성공으로 잘못 알려주고 있었던 것이,
                   // "매수 메시지는 뜨는데 KIS 앱엔 주문이 없다"는 문제의 진짜 원인이었을 가능성이
                   // 매우 높다. 이제 명확하게 실패로 처리한다.
                   console.error('[KIS ORDER ACCEPT UNKNOWN] 주문번호 없이 rt_cd만 성공 — 실제 접수 여부 불명확', res);
                   setBotStatus(`[주문 접수 확인 실패] 주문번호(ODNO)를 받지 못했습니다 — 실제로 접수됐는지 KIS 앱에서 확인하세요.`);
                   addLog(stock.symbol, action === 'BUY' ? '매수' : '매도', tradePrice, finalAmount, `[주문접수불명] 주문번호(ODNO) 없음 — KIS 앱에서 실제 접수 여부를 확인하세요. (rt_cd=0이지만 이것만으로 접수를 보장하지 않음)`);
                   showNotification(`${stock.name} 주문 접수를 확인하지 못했습니다 (주문번호 없음). KIS 앱에서 직접 확인해주세요.`, "error");
                   // 🔒 (2026-10-04) 실제로는 접수됐을 수 있다 — 이 종목 매수를 잠시 쉬고 KIS 미체결 주문과 바로 대조한다
                   if (action === 'BUY') {
                     buyUnknownCooldownRef.current[stock.symbol] = Date.now() + BUY_UNKNOWN_COOLDOWN_MS;
                     setTimeout(() => { try { void runOrphanSellCheckRef.current?.(); } catch { /* 무시 */ } }, 1500);
                   }
                   return 0; // 접수가 불명확하므로 성공 처리(로컬 상태/슬롯 업데이트)하지 않는다
               }
            } else {
               setBotStatus(`[KIS API 오류] ${res.msg1}`);
               addLog(stock.symbol, action === 'BUY' ? '매수' : '매도', tradePrice, finalAmount, `[주문실패] ${res.msg1}`);
               showNotification(`주문 실패: ${res.msg1}`, "error");
               return 0; // 실제 주문 실패시 잔고를 업데이트 하지 않음
            }
        } catch (e: any) {
            console.error("KIS Order Error", e);
            const errMsg = e?.message || "";
            // 🛡️ 공백/줄바꿈 차이로 문자열 매칭이 어긋나는 걸 막기 위해 공백을 제거한 버전도 함께 검사한다.
            // 예: KIS가 실제로 주는 문구는 "주문가능금액을 초과 했습니다"처럼 "초과"와 "했습니다" 사이에
            // 공백이 있는 경우가 있는데, 예전 코드는 공백 없는 '초과했습니다'만 검사해서 이 케이스를
            // 놓치고 있었다 — 그 결과 APBK0952(매수 가능 금액 초과) 실패에는 아래 쿨다운이 전혀 걸리지
            // 않아서, 매수 신호가 계속 뜨는 동안 같은 이유로 계속 재시도-실패가 반복될 수 있었다.
            const normalizedErrMsg = errMsg.replace(/\s+/g, '');
            if (errMsg.includes('APBK0918') || errMsg.includes('장운영시간')) {
                setBotStatus("[장외 시간] KIS 정규 장운영시간이 아닙니다 (09:00~15:30)");
                addLog(stock.symbol, action === 'BUY' ? '매수' : '매도', tradePrice, finalAmount, `[장외 차단] KIS 정규 장운영시간이 아닙니다 (APBK0918)`);
                showNotification(`주문 스킵: KIS 정규 장운영시간이 아닙니다.`, "info");
            } else if (errMsg.includes('EGW00201') || errMsg.includes('429') || errMsg.includes('초당')) {
                setBotStatus("[요청 제한] 초당 거래건수 초과 (자동 조절 중)");
                addLog(stock.symbol, action === 'BUY' ? '매수' : '매도', tradePrice, finalAmount, `[주문실패] 요청 한도 초과(429) — 이 시도는 취소되었습니다`);
                showNotification(`요청 한도 초과: 잠시 후 다시 시도합니다.`, "info");
            } else if (
              errMsg.includes('APBK0400') || errMsg.includes('APBK0952') ||
              errMsg.includes('주문 가능한 수량') || errMsg.includes('주문가능금액') ||
              normalizedErrMsg.includes('초과했습니다')
            ) {
                // 🛡️ 매우 중요한 안전장치: "주문 가능한 수량을 초과했습니다"(매도) / "주문가능금액을
                // 초과했습니다"(매수, APBK0952)는 로컬에 기록된 보유수량/매수가능금액이 실제 KIS 계좌
                // 상태와 어긋나 있다는 신호다 — 이미 다른 경로(수동매도, 부분체결, 다른 종목 매수 등)로
                // 자금/물량이 빠졌는데 로컬은 아직 모르는 상황일 수 있다. 예전엔 이걸 그냥
                // "통신오류"로 뭉뚱그려서(게다가 매수 쪽 APBK0952는 문자열 매칭 자체가 안 돼서), 다음
                // 엔진 루프에서 또 같은 (틀린) 수량/금액으로 재시도하고, 또 실패하는 게 무한 반복될 수
                // 있었다. 이제 ① 즉시 계좌를 재동기화해서 로컬 상태를 실제 값으로 맞추고, ② 이
                // 종목은 30초간(매수/매도 모두) 재시도를 쉬게 해서, 재동기화가 반영될 시간을 준다.
                setBotStatus(`[수량/금액 불일치] ${stock.symbol} 실제 계좌와 로컬 상태가 달라 계좌를 재동기화합니다`);
                addLog(stock.symbol, action === 'BUY' ? '매수' : '매도', tradePrice, finalAmount, `[주문실패] 실제 계좌 상태와 불일치(${errMsg}) — 계좌 재동기화 후 30초간 재시도 대기`);
                showNotification(`${stock.name}: 계좌 정보 불일치 감지 — 재동기화 중`, "error");
                sellQtyMismatchCooldownRef.current[stock.symbol] = Date.now() + 30000;
                if (kisConfig.isConnected) handleSyncKIS();
                // 🔎 (2026-09-29) 매도 APBK0400 = 대개 그 물량이 이미 KIS의 다른 매도 대기 주문에 묶여 있다는 뜻.
                // 로컬이 모르는 그 주문을 바로 찾아 미체결 매도 목록에 넣어야, 이후 체결 확인·취소 후 재주문(손절)이 이어진다.
                if (action === 'SELL') { try { void runOrphanSellCheckRef.current?.(); } catch { /* 무시 */ } }
            } else {
                setBotStatus("증권사 API 서버 통신 오류");
                addLog(stock.symbol, action === 'BUY' ? '매수' : '매도', tradePrice, finalAmount, `[주문실패] 증권사 API 통신 오류: ${errMsg}`);
                // 🔒 (2026-10-04) 응답만 못 받았을 뿐 주문은 KIS에 들어갔을 수 있다(응답 지연 등). 예전엔 그냥 실패로 끝내서
                // 5초 뒤 같은 종목에 또 주문이 나갈 수 있었다 → 이 종목 매수를 30초 쉬고, KIS 미체결 주문과 바로 대조해 있으면 복구한다.
                if (action === 'BUY') {
                  buyUnknownCooldownRef.current[stock.symbol] = Date.now() + BUY_UNKNOWN_COOLDOWN_MS;
                  setTimeout(() => { try { void runOrphanSellCheckRef.current?.(); } catch { /* 무시 */ } }, 1500);
                }
                showNotification(`KIS 통신 오류: ${errMsg}`, "error");
            }
            return 0;
        }
    }


    const priceInKrw = marketType === 'US' ? tradePrice * exchangeRate : tradePrice; 
    const cost = priceInKrw * finalAmount;

    if (action === 'BUY') {
      // 🛡️ (2026-09-29 과제2) 여기는 KIS에서 "이미 체결된" 매수를 로컬에 반영하는 단계다(KIS 미연동이면 위에서 차단됨).
      // 예전엔 여기서 화면용 예수금(balance)이 체결금액보다 적으면 "[진입차단] 예수금 초과"로 return 0 했다 —
      // balance는 동기화가 늦거나 이미 이 매수만큼 줄어 있을 수 있어서, 실제로 체결된 주식이 보유수량·슬롯·익절 감시에
      // 반영되지 않는 원인이 됐다(매도 쪽 "매도가능수량 0주" 버그와 같은 유형). 체결 후에는 절대 막지 않는다.
      const createdSlotId = slotId || `SLOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      setBalance(prev => Math.max(0, prev - cost));
      setOrderableKrw(prev => (prev > 0 ? Math.max(0, prev - cost) : prev)); // 다음 매수 판단이 방금 쓴 돈을 반영하도록(잔고 동기화 전까지)
      
      const oldQty = holdingsRef.current[stock.symbol] || 0;
      const oldAvg = avgPricesRef.current[stock.symbol] || tradePrice;
      const newQty = Number((oldQty + finalAmount).toFixed(4));
      const newAvg = newQty > 0 ? Math.round(((oldQty * oldAvg) + (finalAmount * tradePrice)) / newQty) : tradePrice;

      // Immediate protection against KIS polling settlement lag
      recentLocalTradesRef.current[stock.symbol] = {
        timestamp: Date.now(),
        quantity: newQty,
        avgPrice: newAvg
      };

      const newHoldings = { ...holdingsRef.current, [stock.symbol]: newQty };
      holdingsRef.current = newHoldings; // 다음 엔진 틱이 곧바로 새 보유수량을 보도록
      avgPricesRef.current = { ...avgPricesRef.current, [stock.symbol]: newAvg };
      setHoldings(newHoldings);
      setAvgPrices(prev => ({ ...prev, [stock.symbol]: newAvg }));
      try {
        localStorage.setItem('sleek_holdings', JSON.stringify(newHoldings));
        localStorage.setItem('sleek_avg_prices', JSON.stringify(avgPricesRef.current));
      } catch (e) {}
      if (currentUser) saveUserHoldings(currentUser.uid, newHoldings);

      // Ensure stock is in stocks state and stocksCache with live price
      const isStockUS = /^[A-Za-z]/.test(stock.symbol) && !/^\d+$/.test(stock.symbol);
      const stockMarket = isStockUS ? 'US' : 'KR';
      setStocks(prev => {
        if (prev.some(s => s.symbol === stock.symbol)) {
          return prev.map(s => s.symbol === stock.symbol ? { ...s, price: tradePrice || s.price } : s);
        }
        return [{ ...stock, price: tradePrice || stock.price, market: stockMarket }, ...prev];
      });
      setStocksCache(prev => {
        const list = prev[stockMarket] || [];
        if (list.some(s => s.symbol === stock.symbol)) {
          return { ...prev, [stockMarket]: list.map(s => s.symbol === stock.symbol ? { ...s, price: tradePrice || s.price } : s) };
        }
        return { ...prev, [stockMarket]: [{ ...stock, price: tradePrice || stock.price, market: stockMarket }, ...list] };
      });
      
      // Add to gapInventory and update ref for immediate fill
      const newSlot = { id: createdSlotId, price: tradePrice, quantity: finalAmount, symbol: stock.symbol };
      if (stock.symbol === selectedStock?.symbol) {
        setGapInventory(prev => {
          const next = [...prev, newSlot];
          gapInventoryRef.current = next;
          return next;
        });
      }
      {
        const curInv = scalperTabsRef.current.find(t => t.symbol === stock.symbol)?.gapInventory || [];
        updateTab(stock.symbol, { gapInventory: [...curInv, newSlot] });
      }

      // Trigger Auto-Sell for immediate simulated or real fills that reached this point
      triggerAutoSell(stock.symbol, tradePrice, finalAmount, newAvg, newQty, createdSlotId);

      // KIS API 연결 상태이고 실제 주문 전송이 활성화된 경우 실제 계좌 잔고를 비동기로 동기화
      if (kisConfig.isConnected) {
        setTimeout(() => {
          handleSyncKIS();
        }, 2500);
      }
      return finalAmount;
    } else if (action === 'SELL') {
      // ============================================================
      // 🔴 SELL 주문 안전검증 — 매도는 실제 보유수량과 유효한 주문가격이 반드시 있어야 한다.
      // 예전엔 이 검증이 없어서, tradePrice가 0인 채로 지정가(00) 매도가 KIS까지 전달될 수 있었다
      // (ORD_UNPR: "0"인 지정가 주문은 매도 실패의 강력한 후보다).
      // ============================================================
      {
        const sellPrice = Number(tradePrice);
        if (!Number.isFinite(sellPrice) || sellPrice <= 0) {
          console.error('[SELL 주문 차단 - 잘못된 매도가]', { symbol: stock.symbol, name: stock.name, tradePrice, finalAmount, reason });
          addLog(stock.symbol, '매도', sellPrice || 0, finalAmount || 0, '[매도 주문 차단] 유효한 매도 가격이 없습니다.');
          setBotStatus(`[매도 차단] ${stock.name} 매도 가격 오류: ${sellPrice}`);
          return 0;
        }
        if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
          console.error('[SELL 주문 차단 - 잘못된 매도수량]', { symbol: stock.symbol, name: stock.name, finalAmount, holdings: holdings[stock.symbol] });
          addLog(stock.symbol, '매도', sellPrice, finalAmount || 0, '[매도 주문 차단] 매도 수량이 없습니다.');
          setBotStatus(`[매도 차단] ${stock.name} 매도 수량 오류`);
          return 0;
        }
      }
      // 🛡️ (2026-09-28 매도 순서 점검) 여기(체결 확인 "후")에 있던 매도가능수량 재조회를 제거했다.
      // 이 지점은 이미 KIS가 체결을 확인해준 뒤라 finalAmount = 실제 체결수량이다 — 여기서 다시
      // 매도가능수량을 물으면 방금 판 만큼 줄어든(전량 매도면 0) 값이 나와서, 체결된 매도를 "0주라
      // 매도 불가"로 오판하고 로컬 보유수량/슬롯 정리를 통째로 건너뛰었다(게다가 존재하지 않는
      // 필드 nrc_psbl_qty를 읽어서 항상 0이었다). 매도가능수량 확인은 이제 주문 "전"(⑤~⑦)에 한다.
      if (finalAmount > 0) {
        // Immediate local cleanup of recent trades tracking
        if (recentLocalTradesRef.current[stock.symbol]) {
          const curTrade = recentLocalTradesRef.current[stock.symbol];
          const remainingTradeQty = Math.max(0, (curTrade.quantity || 0) - finalAmount);
          if (remainingTradeQty <= 0) {
            delete recentLocalTradesRef.current[stock.symbol];
          } else {
            recentLocalTradesRef.current[stock.symbol].quantity = remainingTradeQty;
          }
        }

        // 🛡️ 최신 보유수량 기준으로 차감(클로저의 holdings는 오래된 값일 수 있음)
        const currentHeld = Number(holdingsRef.current[stock.symbol] ?? holdings[stock.symbol] ?? 0);
        const newQty = Math.max(0, currentHeld - finalAmount);
        const revenue = priceInKrw * finalAmount;

        if (!kisConfig.isConnected) {
          setBalance(prev => prev + revenue);
        }

        // 🛡️ ref를 먼저 즉시 갱신 — 다음 엔진 틱(최대 1초 후)이 아직 반영 안 된 보유수량으로
        // 같은 물량을 또 팔려고 시도(→ APBK0400)하지 않도록.
        {
          const nextRef = { ...holdingsRef.current };
          if (newQty <= 0) delete nextRef[stock.symbol];
          else nextRef[stock.symbol] = Number(newQty.toFixed(4));
          holdingsRef.current = nextRef;
        }

        // Immediately update holdings state
        setHoldings(prev => {
          const updated = { ...prev };
          if (newQty <= 0) {
            delete updated[stock.symbol];
            setAvgPrices(ap => {
              const nextAp = { ...ap };
              delete nextAp[stock.symbol];
              try { localStorage.setItem('sleek_avg_prices', JSON.stringify(nextAp)); } catch (e) {}
              return nextAp;
            });
          } else {
            updated[stock.symbol] = Number(newQty.toFixed(4));
          }
          try {
            localStorage.setItem('sleek_holdings', JSON.stringify(updated));
          } catch (e) {}
          if (currentUser) saveUserHoldings(currentUser.uid, updated);
          return updated;
        });

        // Trim/clear gapInventory for active tab
        if (stock.symbol === selectedStock?.symbol) {
          setGapInventory(prev => {
            let rem = finalAmount;
            const next: typeof prev = [];
            for (const slot of prev) {
              if (rem <= 0) {
                next.push(slot);
              } else if (slot.quantity > rem) {
                next.push({ ...slot, quantity: slot.quantity - rem });
                rem = 0;
              } else {
                rem -= slot.quantity;
              }
            }
            gapInventoryRef.current = next;
            return next;
          });
        }

        {
          const curInv = scalperTabsRef.current.find(t => t.symbol === stock.symbol)?.gapInventory || [];
          let rem = finalAmount;
          const nextInv: typeof curInv = [];
          for (const slot of curInv) {
            if (rem <= 0) {
              nextInv.push(slot);
            } else if (slot.quantity > rem) {
              nextInv.push({ ...slot, quantity: slot.quantity - rem });
              rem = 0;
            } else {
              rem -= slot.quantity;
            }
          }
          updateTab(stock.symbol, { gapInventory: nextInv });
        }

        if (kisConfig.isConnected) {
          setTimeout(() => {
            handleSyncKIS();
          }, 1500);
        }
        transitionLifecycleStatus(stock.symbol, 'COMPLETED', `매도 체결 완료 (${formatCurrency(priceInKrw)} x ${finalAmount})`);
        return finalAmount;
      }
      return 0;
      }
      return 0;
    } finally {
      pendingTradeKeysRef.current.delete(tradeLockKey);
    }
  };

  const handleQuickBuyRecommendation = useCallback(async (rec: ScalperRecommendation) => {
    handleSelectRecommendationStock(rec);
    const targetStock: Stock = {
      symbol: rec.symbol,
      name: rec.name,
      price: rec.price,
      change: rec.change,
      changePercent: rec.changePercent,
      volume: rec.volume,
      history: [],
      market: 'KR'
    };
    const buyQty = Math.max(1, Math.floor(1000000 / (rec.price || 10000)));
    await executeTrade('BUY', targetStock, buyQty, `실시간 추천종목(${rec.scalpingScore}점) 즉시 매수 실행`, rec.price);
    setShowScalperRecModal(false);
  }, [handleSelectRecommendationStock, executeTrade]);

  const addLog = (
    symbol: string,
    type: 'BUY' | 'SELL' | '매수' | '매도',
    price: number,
    amount: number,
    reason: string,
    meta?: { exitReason?: ExitReason; entryReason?: string; pnlPercent?: number }
  ) => {
    const symbolName = symbol === 'SYSTEM'
      ? 'SYSTEM'
      : (scalperTabsRef.current.find(t => t.symbol === symbol)?.name || stocksRef.current.find(s => s.symbol === symbol)?.name || symbol);

    const newLog: TradeLog = {
      time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      symbol, type, price, amount, reason,
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      timestamp: Date.now(),
      symbolName,
      exitReason: meta?.exitReason,
      entryReason: meta?.entryReason,
      pnlPercent: meta?.pnlPercent
    };

    // 📒 매매 일지 — 실제 체결 로그만 골라서 매수 로트 생성 / 매도 청산(순손익 계산)을 기록한다.
    // 체결 로그는 모든 매수·매도 경로가 공통으로 거치는 곳이라, 여기 한 곳에서 잡으면 빠짐이 없다.
    if (symbol !== 'SYSTEM' && price > 0 && amount > 0 && JOURNAL_FILL_PREFIXES.some(p => reason.startsWith(p))) {
      try {
        const isBuyFill = type === 'BUY' || type === '매수';
        if (isBuyFill) {
          const snap = pendingEntrySignalsRef.current[symbol];
          // 🛡️ (2026-09-28) 예전엔 2분 기준 + 첫 체결 때 스냅샷을 지워서, 지정가 매수가 몇 분 뒤 체결되거나
          // 여러 번 나눠 체결되면 두 번째 체결부터 "신호 기록 없음(수동/추천 매수)"으로 잘못 분류됐다.
          // 이제 10분까지 인정하고 체결 때 지우지 않는다 — 다음 매수 신호가 오면 그때 새 스냅샷으로 덮어써진다.
          const fresh = snap && Date.now() - snap.capturedAt <= 10 * 60000 ? snap : null;
          // 🗂️ 거래 케이스에 체결 반영 → 케이스 ID를 매매 일지 로트에도 적는다
          const wasFlatBeforeFill = getOpenLotQty(symbol) <= 0; // 새 포지션의 첫 체결인지(예전 포지션의 익절 기준이 남아 있으면 버린다)
          let fillCaseId: string | undefined;
          try { fillCaseId = onCaseBuyFill(symbol, symbolName, price, amount); } catch { /* 무시 */ }
          recordBuyFill(symbol, symbolName, price, amount, fresh, currentJournalSession(), fillCaseId);
          // 💧 이 포지션의 익절 기준(유동성 구분)을 체결 시점에 정한다 — 추가 체결이면 기존 기준 유지
          try { if (/^\d{6}$/.test(symbol)) { if (wasFlatBeforeFill) clearExitPlan(symbol); ensureExitPlan(symbol); } } catch { /* 무시 */ }
          // 보유 중 최고가/최저가 추적 시작 (이미 추적 중이면 = 추가 매수 → 그대로 이어감)
          if (!positionExtremesRef.current[symbol]) positionExtremesRef.current[symbol] = { max: price, min: price };
        } else {
          const isUS = /^[A-Za-z]/.test(symbol);
          const exitCtx = pendingExitContextRef.current[symbol];
          // 🛡️ (2026-09-28) 지정가 매도가 미체결 대기 후 몇 분 뒤 체결돼도 매도 판단 순간 정보(슬리피지·체결 지연)가 붙도록 10분까지 인정
          const freshExit = exitCtx && Date.now() - exitCtx.at <= 10 * 60000 ? exitCtx : undefined;
          const producedTrades = recordSellFill(symbol, symbolName, price, amount, meta?.exitReason, (bp, sp, q) => calculateNetProfitAmount(bp, sp, q, isUS ? 'US' : 'KR'), currentJournalSession(), {
            extremes: positionExtremesRef.current[symbol],
            exit: freshExit,
            market: getKnownMarket(symbol),
            rescue: (() => { const ph = rescueRef.current[symbol]?.phase; return ph === 'WAITING' ? 'OPENED' : ph; })(),
          });
          // 🗂️ 거래 케이스에 청산 반영 (이 종목의 열린 로트가 없으면 포지션 종료)
          try { onCaseSellFill(symbol, price, amount, meta?.exitReason, producedTrades, !hasOpenLots(symbol)); } catch { /* 무시 */ }
          if (!hasOpenLots(symbol)) {
            delete positionExtremesRef.current[symbol];
            delete pendingExitContextRef.current[symbol];
          }
        }
      } catch (e) {
        console.warn('[매매 일지 기록 실패]', e);
      }
    }

    // 🧾 주문 결과 집계 — executeTrade가 주문마다 남기는 최종 결과 로그 기준
    if (symbol !== 'SYSTEM') {
      try {
        const side: 'BUY' | 'SELL' = type === 'BUY' || type === '매수' ? 'BUY' : 'SELL';
        if (reason.startsWith('[실제체결 완료]')) recordOrderOutcome(side, 'filled');
        else if (reason.startsWith('[일부체결]')) recordOrderOutcome(side, 'partial');
        else if (reason.startsWith('[주문접수/미체결]')) recordOrderOutcome(side, 'unfilled');
        else if (reason.startsWith('[주문실패]') || reason.startsWith('[주문접수불명]')) recordOrderOutcome(side, 'failed');
      } catch { /* 무시 */ }
    }

    // 🗂️ 거래 케이스 — 통과 신호가 주문으로 이어지지 않은 이유를 적어 둔다
    if (symbol !== 'SYSTEM' && (type === 'BUY' || type === '매수')
      && (reason.startsWith('[매수 차단]') || reason.startsWith('[매수차단]') || reason.startsWith('[매수 스킵]') || reason.startsWith('[주문취소]') || reason.startsWith('[주문실패]') || reason.startsWith('[주문접수불명]') || reason.startsWith('[매매 차단]'))) {
      try { noteCaseNoOrder(symbol, reason.slice(0, 80)); } catch { /* 무시 */ }
    }

    // 🚫 막힌 신호 — 매수 조건은 충족했는데 다른 이유로 사지 않은 경우 (3분·10분 뒤 가격을 확인해 필터를 평가)
    if (symbol !== 'SYSTEM' && (type === 'BUY' || type === '매수') && price > 0) {
      const blockPrefixes: [string, string][] = [
        ['[애프터 진입 차단]', '애프터 필터'],
        ['[매수 차단] 최근 매수 쿨다운', '쿨다운'],
        ['[매수 차단] 슬롯 가득', '슬롯 가득'],
        ['[매수 차단] 동일가', '동일가 미확정 주문 중'],
        ['[매수 차단] 이전 주문 처리 중', '주문 처리 중'],
        ['[매수차단] 예수금 부족', '예수금 부족'],
        ['[진입차단]', '예수금 부족'],
        ['[진입스킵]', '주문 가능 수량 초과'],
      ];
      const hit = blockPrefixes.find(([p]) => reason.startsWith(p));
      if (hit) noteMissedSignal(symbol, symbolName, hit[1], reason, price);
    }

    // 🌐 GLOBAL TRADE LOGS: 현재 선택된 탭이 무엇이든 상관없이, 등록된 모든 종목의 이벤트가 전부 쌓인다.
    // (과거에는 currentActiveSym과 일치할 때만 반영되어 "선택 안 한 종목의 체결/신호가 안 보이는" 버그가 있었다)
    // 🛡️ 전략센서 로그는 72종목에서 매우 자주 쌓이므로, 한 배열에 섞어 300건으로 자르면 정작 중요한
    // 매수/매도 로그가 금방 밀려나 사라진다. 전체 로그 모달의 탭 구분과 맞춰 '전략센서'와 '그 외(매수/매도)'를
    // 각각 300건씩 따로 보관한다.
    setTradeLogs(prev => {
      let sensorCount = 0;
      let tradeCount = 0;
      return [newLog, ...prev].filter(l => {
        if ((l.reason || '').startsWith('[전략센서]')) return ++sensorCount <= 300;
        return ++tradeCount <= 300;
      });
    });

    // 종목별 상세 로그(인벤토리 항목 안의 tradeLogs)도 별도로 유지 — 선택 종목 상세 패널에서 사용
    const currentActiveSym = activeTabIdRef.current;
    const logTargetSymbols = new Set<string>();
    if (symbol === 'SYSTEM') {
      if (currentActiveSym) logTargetSymbols.add(currentActiveSym);
    } else {
      logTargetSymbols.add(symbol);
    }
    if (logTargetSymbols.size > 0) {
      setScalperInventory(prev => prev.map(item => {
        if (!logTargetSymbols.has(item.symbol)) return item;
        const existing = (item.tradeLogs || []).filter(l => !l.symbol || l.symbol === item.symbol || l.symbol === 'SYSTEM');
        return { ...item, tradeLogs: [newLog, ...existing].slice(0, 50) };
      }));
    }
  };

  // ============================================================
  // 🕘 마감 전 보유 판단 (1단계)
  // ------------------------------------------------------------
  //  15:15~15:20 정규장 마감 판단 — 보유 종목마다 "애프터마켓으로 들고 갈지" 판단
  //  19:50~20:00 애프터 마감 판단 — 보유 종목마다 "다음 날로 들고 갈지" 판단
  //  원칙: 수익률은 1차 조건, 최종 판단은 수급·모멘텀(구조가 무너지고 있으면 수익 중이어도 매도)
  //  ① 즉시 매도(점수 무관): 손절선 도달 / VWAP 이탈 + CVD 하락 / 최근 고점 대비 1.5% 이상 하락
  //  ② 보유 점수(최대 10): VWAP 위 +2 · CVD 양수 +1 · CVD 상승 +1 · 체결강도 100↑ +1(130↑ +2)
  //                         · 매수호가 우세 +1 · 고점 유지(되돌림 0.5% 이하) +1 · 거래량 모멘텀 +1 · 순수익 0.3%↑ +1
  //  ③ 결정: 정규장→애프터 = 7점 이상이면 보유 / 애프터→다음 날 = 기능 ON + 9점 이상 + 순수익 1% 이상이면 보유
  //  판단은 구간 동안 20초마다 다시 한다(보유→매도로는 바뀔 수 있지만, 판 종목이 다시 보유로 바뀌지는 않음).
  //  기준값은 초안 — 매매 일지의 "마감 판단 기록"으로 검증한 뒤 조정한다.
  // ============================================================
  const AFTER_MARKET_CARRY_ENABLED = true;   // 정규장 → 애프터마켓 보유 연장 허용
  const OVERNIGHT_CARRY_ENABLED = false;     // 애프터 → 다음 날 보유 연장 허용 (데이터가 쌓일 때까지 OFF — 20시 전 전량 청산)
  const CARRY_SCORE_MAX = 10;
  const CARRY_HOLD_MIN_REGULAR = 7;
  const CARRY_HOLD_MIN_OVERNIGHT = 9;
  const OVERNIGHT_MIN_NET_PCT = 1.0;
  const CARRY_MAX_DRAWDOWN_PCT = 1.5;

  const executeTradeRef = React.useRef(executeTrade);
  executeTradeRef.current = executeTrade;
  addLogRef.current = addLog;
  const scalpingStopLossRef = React.useRef(scalpingStopLoss);
  scalpingStopLossRef.current = scalpingStopLoss;
  const carryPrevCvdRef = React.useRef<Record<string, number>>({});
  const closeDecisionStateRef = React.useRef<Record<string, 'HOLD' | 'SELL'>>({}); // `${날짜}|${구간}|${종목}` → 마지막 결정
  const closeSellAttemptAtRef = React.useRef<Record<string, number>>({});
  const closeDecisionBusyRef = React.useRef(false);
  // ============================================================
  // 🌙 마감 매수 판단 (2026-10-06, 사용자 요청) — 15:10~15:20에 인벤토리 종목을 한 번씩 판단해서,
  // 신호가 좋은 종목은 종목당 진입금액만큼 매수1호가 지정가로 사서 다음 거래일로 넘긴다.
  //   좋은 신호 = 체결강도 기준 이상 · 현재가가 VWAP 이상 · 당일 등락률 플러스 (모두 충족) — 수량은 종목당 진입금액 기준
  //   판단 내용은 종목마다 `[마감판단]` 로그로 남는다(전체 로그의 마감판단 탭).
  //   이 경로로 산 종목은 산 날에는 매도 판단을 하지 않고(손절·트레일링 포함), 다음 거래일 09:00부터 평소 규칙으로 관리한다.
  //   다음 날 09:10 이후 전날 판단한 종목 전부의 가격 변화를 `[마감판단 결과]`로 남겨, 매수한 쪽과 안 한 쪽을 비교할 수 있게 한다.
  // ============================================================
  type CloseBuyItem = { symbol: string; name: string; price: number; decision: 'BUY' | 'SKIP'; orderPrice?: number; note: string };
  const CLOSE_BUY_KEY = 'leo100b_close_buy_v1';
  const readCloseBuyBook = (): { date: string; items: CloseBuyItem[]; reviewed?: boolean } | null => {
    try { const raw = localStorage.getItem(CLOSE_BUY_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  const writeCloseBuyBook = (book: { date: string; items: CloseBuyItem[]; reviewed?: boolean }) => {
    try { localStorage.setItem(CLOSE_BUY_KEY, JSON.stringify(book)); } catch { /* 저장 실패는 매매와 무관 */ }
  };
  // 오늘 마감 매수로 산 종목(종목코드 → 날짜) — 산 날에는 매도 판단에서 제외
  // 마감 매수로 들고 있는 종목(종목코드 → 마지막 마감 매수 날짜). 산 날에는 매도 판단을 하지 않고, 보유하는 동안 물타기·손절 대상에서 뺀다.
  const CLOSE_CARRY_KEY = 'leo100b_close_carry_v1';
  const closeBuyCarryRef = React.useRef<Record<string, string>>({}); // (15:40) 더 이상 쓰지 않는다 — 마감 매수 보유분은 trendCarryRef(kind 'CLOSE')로 관리
  const persistCloseCarry = () => { try { localStorage.setItem(CLOSE_CARRY_KEY, JSON.stringify(closeBuyCarryRef.current)); } catch { /* 무시 */ } };
  const closeCarryZeroAtRef = React.useRef<Record<string, number>>({});
  const isCloseBuyCarryToday = (symbol: string) => closeBuyCarryRef.current[symbol] === kstDateKey();

  // ============================================================
  // 🌇 마감 스냅샷 (2026-10-07) — 기록 전용
  //   15:10 · 15:15 · 15:19에 인벤토리 종목(전체 값)과 거래량·등락률 순위 종목(가격·거래량·체결강도)을 찍어 두고,
  //   다음 거래일 15:45 이후 일봉으로 다음 날 시가·고가·저가·종가와 이동평균 위치를 채운다.
  //   "마감까지 강한 종목"과 "추세 속 눌린 종목" 중 어느 쪽이 다음 날 더 오르는지 비교하기 위한 자료.
  // ============================================================
  const closeSnapBusyRef = React.useRef<Record<string, boolean>>({});
  const runCloseSnap = async (stage: '10' | '15' | '19', dateKey: string) => {
    if (closeSnapBusyRef.current[stage]) return;
    closeSnapBusyRef.current[stage] = true;
    try {
      const now = Date.now();
      const tabs = scalperTabsRef.current.filter(t => /^\d{6}$/.test(t.symbol || ''));
      const invSyms = new Set(tabs.map(t => t.symbol));
      const patches: (Partial<CloseSnapRow> & { sym: string })[] = [];
      // ── 인벤토리 종목: 실시간 값 그대로
      for (const t of tabs) {
        const sym = t.symbol;
        const stock = stocksRef.current.find(x => x.symbol === sym);
        const price = Number(stock?.price || 0);
        if (!stock || !(price > 0)) continue;
        const ob = liveOrderbooksRef.current[sym];
        const obFresh = now - (lastWsOrderbookTickAtRef.current[sym] || 0) <= 10000;
        const bq = Number(ob?.totalBidVolume || 0), aq = Number(ob?.totalAskVolume || 0);
        const ratio = obFresh && bq > 0 && aq > 0 ? Math.round((bq / aq) * 100) : undefined;
        const es = Number(stock.executionStrength) > 0 ? Number(Number(stock.executionStrength).toFixed(1)) : undefined;
        const vol = Number(String((stock as any).volume ?? '').replace(/,/g, '')) || undefined;
        const p: Partial<CloseSnapRow> & { sym: string } = { sym, name: t.name || stock.name || sym, src: 'INV' };
        if (stage === '10') { p.p10 = price; p.v10 = vol; p.es10 = es; p.ratio10 = ratio; }
        else if (stage === '15') { p.p15 = price; p.v15 = vol; p.es15 = es; }
        else {
          p.p19 = price; p.v19 = vol; p.es19 = es; p.ratio19 = ratio;
          const rec = getRecentPanel(sym, 10, now);
          p.hi = Math.max(price, ...rec.map(r => r.hi || r.p));
          p.chg19 = Number.isFinite(Number(stock.changePercent)) ? Number(Number(stock.changePercent).toFixed(2)) : undefined;
          const vw = getTrueVwaps(sym).regular;
          p.vwGap19 = vw > 0 ? Number((((price - vw) / vw) * 100).toFixed(3)) : undefined;
          p.tv5Now = tickFieldCheckRef.current.cntgVol ? Math.round(getTradeValue5mEst(sym).value) : undefined;
          const prevTv = getRecentPanel(sym, 40, now).filter(r => now - r.t >= 9 * 60000 && Number(r.tv5) > 0).map(r => Number(r.tv5));
          p.tv5Prev = prevTv.length >= 5 ? Math.round(prevTv.reduce((a, c) => a + c, 0) / prevTv.length) : undefined;
          const ev = lastBuyEvalRef.current[sym]; const bb = lastEntryBearRef.current[sym];
          p.score19 = ev && now - ev.at <= 20000 ? ev.score : undefined;
          p.bull19 = bb && now - bb.at <= 20000 ? bb.bull : undefined;
          p.bear19 = bb && now - bb.at <= 20000 ? bb.bear : undefined;
          const heldQ = Number(holdingsRef.current[sym] || 0);
          const cp = trendCarryRef.current[sym];
          p.held = heldQ > 0 ? (cp ? (cp.kind === 'CLOSE' ? '마감' : '추세') : '스캘핑') : undefined;
        }
        patches.push(p);
      }
      // ── 순위 종목(인벤토리 밖): 15:10에 목록을 정하고, 이후에는 현재가 조회로 값을 붙인다
      if (stage === '10') {
        const { min, max } = recPriceRangeRef.current;
        const pf = { minPrice: min > 0 ? min : undefined, maxPrice: Number.isFinite(max) && max > 0 && max < 1e9 ? max : undefined, minVolume: 100000 };
        const seen = new Map<string, any>();
        try { (await kisService.getVolumeRanking('J', 40, pf, 'ALL') || []).forEach((v: any) => { if (v?.symbol) seen.set(v.symbol, v); }); } catch { /* 무시 */ }
        try { (await kisService.getFluctuationRanking('J', 'UP', 40, pf, 'ALL') || []).forEach((v: any) => { if (v?.symbol && !seen.has(v.symbol)) seen.set(v.symbol, v); }); } catch { /* 무시 */ }
        let n = 0;
        for (const v of seen.values()) {
          if (n >= 80) break;
          if (invSyms.has(v.symbol) || !/^\d{6}$/.test(v.symbol) || !(Number(v.price) > 0) || !v.name) continue;
          patches.push({ sym: v.symbol, name: v.name, src: 'RANK', p10: Number(v.price), v10: Number(String(v.volume ?? '').replace(/,/g, '')) || undefined });
          n++;
        }
      } else {
        const existing = (await getCloseSnap(dateKey)).filter(r => r.src === 'RANK' && !invSyms.has(r.sym));
        for (const r of existing) {
          try {
            const q = await kisService.getPrice(r.sym);
            const price = Number(q?.current || 0);
            if (!(price > 0)) continue;
            const vol = Number(String(q?.volume ?? '').replace(/,/g, '')) || undefined;
            const es = Number(q?.executionStrength) > 0 ? Number(Number(q?.executionStrength).toFixed(1)) : undefined;
            if (stage === '15') patches.push({ sym: r.sym, p15: price, v15: vol, es15: es });
            else patches.push({ sym: r.sym, p19: price, v19: vol, es19: es, hi: Math.max(price, r.p10 || 0, r.p15 || 0), chg19: Number.isFinite(Number(q?.changePercent)) ? Number(Number(q?.changePercent).toFixed(2)) : undefined });
          } catch { /* 한 종목 실패는 건너뛴다 */ }
        }
      }
      // 그날 마감 매수 판단 결과를 붙인다(15:19 단계)
      if (stage === '19') {
        const book = readCloseBuyBook();
        if (book && book.date === dateKey) {
          for (const it of book.items) patches.push({ sym: it.symbol, closeDecision: it.decision === 'BUY' ? '매수' : '매수 안 함', closeNote: it.note });
        }
      }
      const rows = await upsertCloseSnap(dateKey, patches);
      if (stage === '19') {
        addLog('SYSTEM', '매수', 0, 0, `[마감 스냅샷] ${dateKey} 15:10·15:15·15:19 기록 완료 — 인벤토리 ${rows.filter(r => r.src === 'INV').length}종목 · 순위 ${rows.filter(r => r.src === 'RANK').length}종목 (다음 거래일 마감 뒤 결과가 붙습니다)`);
        saveCsvToFolder(`leo100b_마감후보_${dateKey}.csv`, closeSnapToCsv(rows)).catch(() => { /* 무시 */ });
      }
    } finally { closeSnapBusyRef.current[stage] = false; }
  };

  /** 지난 스냅샷에 다음 거래일 결과(시·고·저·종)와 이동평균 위치를 붙인다 — 15:45 이후 하루 한 번 */
  const runCloseSnapFill = async (todayKey: string) => {
    const dates = (await getCloseSnapDates()).filter(d => d < todayKey).slice(-3);
    let filledDates = 0;
    for (const d of dates) {
      const rows = await getCloseSnap(d);
      const todo = rows.filter(r => r.nClose === undefined);
      if (todo.length === 0) continue;
      const dYmd = d.replace(/-/g, '');
      const patches: (Partial<CloseSnapRow> & { sym: string })[] = [];
      for (const r of todo) {
        try {
          const candles = await kisService.getDomesticDailyCloses(r.sym); // 최신 날짜가 앞
          const i = candles.findIndex(c => c.date === dYmd);
          if (i < 0) continue;
          const patch: Partial<CloseSnapRow> & { sym: string } = { sym: r.sym, dayClose: candles[i].close };
          const hist = candles.slice(i); // 스냅샷 날부터 과거로
          const mean = (arr: number[]) => arr.reduce((a, c) => a + c, 0) / arr.length;
          if (hist.length >= 55) {
            const maNow = mean(hist.slice(0, 50).map(c => c.close)), maPrev = mean(hist.slice(5, 55).map(c => c.close));
            patch.ma50Up = maNow > maPrev ? 1 : 0; patch.aboveMa50 = candles[i].close > maNow ? 1 : 0;
          }
          if (hist.length >= 20) patch.aboveMa20 = candles[i].close > mean(hist.slice(0, 20).map(c => c.close)) ? 1 : 0;
          const pv = hist.slice(1, 6).map(c => c.volume).filter(v => v > 0);
          if (pv.length === 5 && candles[i].volume > 0) patch.volVs5d = Number((candles[i].volume / mean(pv)).toFixed(2));
          const next = i > 0 ? candles[i - 1] : null; // 다음 거래일 봉
          if (next && next.open > 0) {
            const nKey = `${next.date.slice(0, 4)}-${next.date.slice(4, 6)}-${next.date.slice(6, 8)}`;
            if (nKey < todayKey || nKey === todayKey) { patch.nDate = nKey; patch.nOpen = next.open; patch.nHigh = next.high; patch.nLow = next.low; patch.nClose = next.close; }
          }
          patches.push(patch);
        } catch { /* 한 종목 실패는 건너뛴다 */ }
      }
      const out = await upsertCloseSnap(d, patches);
      const done = out.filter(r => r.nClose !== undefined);
      if (done.length > 0) {
        filledDates++;
        const avg = (list: CloseSnapRow[], f: (r: CloseSnapRow) => number | undefined) => { const v = list.map(f).filter((x): x is number => typeof x === 'number'); return v.length ? `${(v.reduce((a, c) => a + c, 0) / v.length).toFixed(2)}%(${v.length})` : '없음'; };
        const hiPct = (r: CloseSnapRow) => (r.p19 && r.nHigh ? ((r.nHigh - r.p19) / r.p19) * 100 : undefined);
        const clPct = (r: CloseSnapRow) => (r.p19 && r.nClose ? ((r.nClose - r.p19) / r.p19) * 100 : undefined);
        const strong = done.filter(r => r.p10 && r.p19 && r.p19 > r.p10 && (r.chg19 ?? 0) > 0);
        const dip = done.filter(r => (r.chg19 ?? 0) < 0 && r.ma50Up === 1 && r.aboveMa50 === 1);
        addLog('SYSTEM', '매수', 0, 0, `[마감 스냅샷 결과] ${d} 기록 ${done.length}종목에 다음 날 결과를 붙였습니다 — 15:19 가격 대비 다음 날 고가/종가 평균: 전체 ${avg(done, hiPct)} / ${avg(done, clPct)} · 마감 10분 상승+당일 상승 ${avg(strong, hiPct)} / ${avg(strong, clPct)} · 50일선 상승 중 눌림 ${avg(dip, hiPct)} / ${avg(dip, clPct)}`);
        saveCsvToFolder(`leo100b_마감후보_${d}.csv`, closeSnapToCsv(out)).catch(() => { /* 무시 */ });
      }
    }
    return filledDates;
  };

  // ============================================================
  // 🖼️ 그날 매수한 종목의 일봉 차트를 그림으로 저장 (2026-10-07)
  //   신호 엑셀과 같은 폴더에 `leo100b_차트_날짜_종목명.png`. 매수가(체결 평균)를 초록 점선으로 표시하고 매수 경로를 적는다.
  //   폴더가 지정돼 있지 않거나 권한이 없으면 저장하지 못하고 로그만 남긴다(다음에 앱을 열었을 때 다시 시도).
  // ============================================================
  const runChartSave = async (dateKey: string) => {
    const rows = await getCaseRows(dateKey);
    const bySym = new Map<string, { name: string; marks: { price: number; label: string }[]; routes: Set<string> }>();
    for (const { c } of rows) {
      if (!c.entryTime || !(Number(c.entryPrice) > 0) || !/^\d{6}$/.test(c.symbol)) continue;
      const g = bySym.get(c.symbol) || { name: c.name || c.symbol, marks: [], routes: new Set<string>() };
      const route = c.route || '스캘핑';
      const hhmm = new Date(c.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      g.marks.push({ price: Math.round(Number(c.entryPrice)), label: `${route} ${hhmm} · ${Math.round(Number(c.entryPrice)).toLocaleString('ko-KR')}원` });
      g.routes.add(route);
      bySym.set(c.symbol, g);
    }
    if (bySym.size === 0) { try { localStorage.setItem('leo100b_chart_saved_v1', dateKey); } catch { /* 무시 */ } return; }
    let saved = 0; const failed: string[] = [];
    for (const [sym, g] of bySym) {
      try {
        const candles = await kisService.getDomesticDailyCloses(sym);
        if (candles.length === 0) { failed.push(g.name); continue; }
        const marks = g.marks.slice(-3); // 같은 종목을 여러 번 샀으면 마지막 3번만 표시
        const svg = buildChartSvg(g.name, sym, candles, marks, `${dateKey} 매수 · ${[...g.routes].join(', ')}`);
        const blob = await svgToPngBlob(svg);
        if (!blob) { failed.push(g.name); continue; }
        const ok = await saveBlobToFolder(`leo100b_차트_${dateKey}_${g.name.replace(/[\\/:*?"<>|]/g, '_')}.png`, blob);
        if (ok) saved++; else failed.push(g.name);
      } catch { failed.push(g.name); }
    }
    addLog('SYSTEM', '매수', 0, 0, `[차트 저장] 오늘 매수한 ${bySym.size}종목 중 ${saved}종목의 일봉 차트를 폴더에 저장했습니다${failed.length ? ` · 저장 못 함: ${failed.join(', ')} (저장 폴더 지정·권한을 확인하세요)` : ''}`);
    if (saved > 0 && failed.length === 0) { try { localStorage.setItem('leo100b_chart_saved_v1', dateKey); } catch { /* 무시 */ } }
  };

  // ============================================================
  // 📈 전 종목 1분 기록 + 추세 매수 (2026-10-07)
  //   1분마다 인벤토리의 모든 국내 종목을 한 줄씩 기록한다(services/panelStore). 정규장(09:00~15:30)에만.
  //   같은 기록의 최근 trendWindowMin분으로 '서서히 오르는 종목'을 감지하고, 감지되면 바로 매수한다(추세 매수가 켜져 있을 때).
  // ============================================================
  const runPanelSample = async () => {
    await restorePanel();
    const LPp = getLiveParams();
    const now = Date.now();
    const rows: PanelRow[] = [];
    const candidates: { stock: Stock; name: string; note: string; vwGap: number }[] = [];
    const tabs = scalperTabsRef.current.filter(t => /^\d{6}$/.test(t.symbol || ''));
    for (const t of tabs) {
      const sym = t.symbol;
      const stock = stocksRef.current.find(x => x.symbol === sym);
      const price = Number(stock?.price || 0);
      if (!stock || !(price > 0)) continue;
      if (now - (lastWsTickAtRef.current[sym] || 0) > 120000) continue; // 2분 넘게 체결이 없으면 그 분은 건너뛴다
      let lo = price, hi = price;
      const st = tickMarketStatsRef.current[sym];
      if (st?.recent) {
        for (let i = st.recent.length - 1; i >= 0; i--) {
          const e: any = st.recent[i];
          if (now - e.t > 60000) break;
          const pe = Number(e.p) || 0;
          if (pe > 0) { if (pe < lo) lo = pe; if (pe > hi) hi = pe; }
        }
      }
      const vw = getTrueVwaps(sym).regular;
      const act = getTickActivity(sym);
      const ob = liveOrderbooksRef.current[sym];
      const obFresh = now - (lastWsOrderbookTickAtRef.current[sym] || 0) <= 10000;
      const b1 = Number(ob?.bidPrice1 || 0), a1 = Number(ob?.askPrice1 || 0);
      const bq = Number(ob?.totalBidVolume || 0), aq = Number(ob?.totalAskVolume || 0);
      const ev = lastBuyEvalRef.current[sym];
      const bb = lastEntryBearRef.current[sym];
      const held = Number(holdingsRef.current[sym] || 0);
      const row: PanelRow = {
        t: now, sym, name: t.name || stock.name || sym, p: price, lo, hi,
        vwap: vw > 0 ? Math.round(vw) : undefined,
        vwGap: vw > 0 ? Number((((price - vw) / vw) * 100).toFixed(3)) : undefined,
        chg: Number.isFinite(Number(stock.changePercent)) ? Number(Number(stock.changePercent).toFixed(2)) : undefined,
        es: Number(stock.executionStrength) > 0 ? Number(Number(stock.executionStrength).toFixed(1)) : undefined,
        ticks60: act.ticks60s,
        tv5: tickFieldCheckRef.current.cntgVol ? Math.round(getTradeValue5mEst(sym).value) : undefined,
        spread: obFresh && b1 > 0 && a1 > 0 ? Math.round((a1 - b1) / getTickSize(price, 'KR')) : undefined,
        bidVol: obFresh && bq > 0 ? bq : undefined, askVol: obFresh && aq > 0 ? aq : undefined,
        ratio: obFresh && bq > 0 && aq > 0 ? Math.round((bq / aq) * 100) : undefined,
        score: ev && now - ev.at <= 20000 ? ev.score : undefined,
        bull: bb && now - bb.at <= 20000 ? bb.bull : undefined,
        bear: bb && now - bb.at <= 20000 ? bb.bear : undefined,
        tier: LIQUIDITY_TIER_LABEL[getStableTier(sym)],
        held: held > 0 ? held : undefined,
      };
      // 추세 감지 — 이번 행까지 넣어서 판단
      const det = detectTrend([...getRecentPanel(sym, LPp.trendWindowMin, now), row], { windowMin: LPp.trendWindowMin, aboveVwapPct: LPp.trendAboveVwapPct }, now);
      row.trend = det.ok ? 1 : 0;
      row.trendNote = det.note;
      rows.push(row);
      const botOn = t.id === activeTabIdRef.current ? isGapBotActiveRef.current : t.isBotActive;
      if (det.ok && botOn) candidates.push({ stock, name: row.name, note: det.note, vwGap: row.vwGap ?? 0 });
    }
    await addPanelRows(rows);

    // ---- 추세 매수 ----
    if (!LPp.trendBuyEnabled) return;
    // ⏰ (2026-10-07 15:40 사용자 결정) 추세 매수는 매수 시간(기본 10:00~10:15)에 하루 한 번만 판단한다. 그 밖에는 감지만 기록.
    {
      const hm = (v: number) => Math.floor(v / 100) * 60 + (v % 100);
      const nowMin = fastKstMinutes();
      if (nowMin < hm(LPp.trendBuyFromHHMM) || nowMin >= hm(LPp.trendBuyToHHMM)) return;
    }
    // (2026-10-07 23:20 사용자 결정) 매수 시간 동안 1분마다 판단한다 — 10:03에 새로 추세가 된 종목도 사고, 체결 안 돼 취소된 주문도 다시 낸다.
    //   같은 종목은 하루에 한 번만 보유로 이어진다(보유 중·주문 중이면 건너뛰고, 판 뒤에는 재매수 금지 시간이 걸린다).
    const todayT = kstDateKey();
    if (!isNewAutoBuyAllowed() || !isAppReadyRef.current || !orderReconcileReadyRef.current || !kisConfig.isConnected) return;
    const qtyTrend = Math.max(1, Math.floor(LPp.trendBuyQty));
    // ① 전날 이전에 산 추세 종목 — 이익이 없으면 추가 슬롯, 슬롯을 다 썼으면 손절
    await runCarryDaily('TREND', qtyTrend);
    // ② 새 추세 매수
    let bought = 0;
    for (const c of candidates) {
      const sym = c.stock.symbol;
      const heldNow = Number(holdingsRef.current[sym] || 0);
      if (trendCarryRef.current[sym] || heldNow > 0) continue; // 이미 보유(추세·마감·스캘핑) — 새로 사지 않는다
      if (pendingBuyOrdersRef.current.some(o => o.symbol === sym) || pendingSellOrdersRef.current.some(o => o.symbol === sym)
        || pendingTradeKeysRef.current.has(`${sym}_BUY`) || pendingTradeKeysRef.current.has(`${sym}_SELL`)) continue;
      if (Date.now() < (trendCooldownRef.current[sym] || 0)) continue;
      const openTrend = Object.values(trendCarryRef.current).filter(x => x.kind !== 'CLOSE').length;
      if (openTrend >= LPp.trendMaxPositions) { addLog(sym, '매수', Number(c.stock.price) || 0, 0, `[추세 감지] ${c.name} — 매수 안 함: 추세 보유 ${openTrend}종목(최대 ${LPp.trendMaxPositions}) · ${c.note}`); continue; }
      const price = Number(stocksRef.current.find(x => x.symbol === sym)?.price || c.stock.price || 0);
      const skip = (why: string) => addLog(sym, '매수', price, 0, `[추세 감지] ${c.name} — 매수 안 함: ${why} · ${c.note}`);
      if (Date.now() - (lastWsTickAtRef.current[sym] || 0) > 5000) { skip('최근 5초 체결 없음'); continue; }
      if (c.vwGap > LPp.trendMaxVwapGapPct) { skip(`VWAP 이격 ${c.vwGap.toFixed(2)}% > ${LPp.trendMaxVwapGapPct}%`); continue; }
      const ob = liveOrderbooksRef.current[sym];
      const b1 = Number(ob?.bidPrice1 || 0), a1 = Number(ob?.askPrice1 || 0);
      if (!(b1 > 0 && a1 > 0) || Date.now() - (lastWsOrderbookTickAtRef.current[sym] || 0) > 10000) { skip('실시간 호가 없음'); continue; }
      const sp = Math.round((a1 - b1) / getTickSize(price || a1, 'KR'));
      if (sp > LPp.maxSpreadTicks) { skip(`스프레드 ${sp}틱 > ${LPp.maxSpreadTicks}틱`); continue; }
      const cash = orderableKrwRef.current > 0 ? orderableKrwRef.current : 0;
      if (cash > 0 && cash < b1 * qtyTrend) { skip(`주문가능현금 부족 (필요 ${formatCurrency(b1 * qtyTrend)})`); continue; }
      trendCarryRef.current[sym] = { kind: 'TREND', date: todayT, entryAt: Date.now(), peak: b1, slots: 1 }; persistTrendCarry(); // 체결 직후 스캘핑 매도 규칙이 돌지 않도록 주문 전에 표시
      addLog(sym, '매수', b1, qtyTrend, `[추세 매수] ${c.name} ${qtyTrend}주 (매수1호가 ${formatCurrency(b1)}) — ${c.note}`);
      noteCaseRoute(sym, '추세 매수', c.note);
      try {
        await executeTradeRef.current('BUY', c.stock, qtyTrend, `[추세 매수] ${c.name} ${qtyTrend}주 — 수익 상태에서 고점 대비 −${LPp.trendTrailPct}% 또는 VWAP 이탈 시 매도`, b1, undefined, undefined, undefined, '추세매수', { deferFillCheck: true });
      } catch (e) { console.warn('[추세 매수 실패]', sym, e); }
      if (!pendingBuyOrdersRef.current.some(o => o.symbol === sym) && !(Number(holdingsRef.current[sym] || 0) > 0)) {
        delete trendCarryRef.current[sym]; persistTrendCarry();
        addLog(sym, '매수', b1, qtyTrend, `[추세 매수] ${c.name} → 주문이 접수되지 않았습니다`);
      } else bought++;
    }
    if (bought > 0) addLog('SYSTEM', '매수', 0, 0, `[추세 판단] 감지 ${candidates.length}종목 · 새 매수 주문 ${bought}건`);
  };

  // ============================================================
  // 🔁 추세·마감 매수 보유분의 하루 한 번 점검 (2026-10-07 15:40 사용자 결정)
  //   전날 이전에 산 종목이 지금 이익이 없으면(평단 대비 순수익 ≤ 0) 같은 수량으로 슬롯을 하나 더 연다(매수1호가).
  //   슬롯을 다 쓴 뒤(물타기 최대 슬롯)에도 이익이 없으면 전량 손절한다. 이익이면 아무것도 하지 않고 매도 규칙을 기다린다.
  //   추세는 10:00~10:15 판단 때, 마감은 15:10~15:20 판단 때 호출된다.
  // ============================================================
  const runCarryDaily = async (kind: 'TREND' | 'CLOSE', qty: number) => {
    const today = kstDateKey();
    const LPd = getLiveParams();
    const maxSlots = Math.max(1, Math.floor(LPd.avgDownMaxSlots));
    const label = kind === 'CLOSE' ? '마감' : '추세';
    for (const sym of Object.keys(trendCarryRef.current)) {
      const tp = trendCarryRef.current[sym];
      if ((tp.kind === 'CLOSE' ? 'CLOSE' : 'TREND') !== kind) continue;
      const held = Number(holdingsRef.current[sym] || 0);
      const avg = Number(avgPricesRef.current[sym] || 0);
      if (!(held > 0) || !(avg > 0) || !(tp.date < today) || tp.lastAddDate === today) continue;
      // 지난번 추가 주문이 체결되지 않았으면 슬롯 수를 되돌린다
      if (tp.addQtyBefore !== undefined) { if (held <= tp.addQtyBefore) tp.slots = Math.max(1, (tp.slots || 1) - 1); tp.addQtyBefore = undefined; }
      const slots = tp.slots || 1;
      if (pendingBuyOrdersRef.current.some(o => o.symbol === sym) || pendingSellOrdersRef.current.some(o => o.symbol === sym)
        || pendingTradeKeysRef.current.has(`${sym}_BUY`) || pendingTradeKeysRef.current.has(`${sym}_SELL`)) continue;
      const stock = stocksRef.current.find(x => x.symbol === sym);
      const price = Number(stock?.price || 0);
      if (!stock || !(price > 0) || Date.now() - (lastWsTickAtRef.current[sym] || 0) > 60000) continue;
      const net = calculateNetProfitPercent(avg, price, 'KR');
      const name = stock.name || sym;
      if (net > 0) { addLog(sym, '매수', price, 0, `[${label} 점검] ${name} — 이익 중(${net >= 0 ? '+' : ''}${net.toFixed(2)}%) · 추가 매수 없음 · 슬롯 ${slots}/${maxSlots}`); tp.lastAddDate = today; persistTrendCarry(); continue; }
      const tick = getTickSize(price, 'KR');
      if (slots >= maxSlots) {
        // 슬롯을 다 쓴 뒤에도 이익이 없다 → 전량 손절
        const sellPx = Math.round((price - tick) / tick) * tick;
        tp.lastAddDate = today; persistTrendCarry();
        addLog(sym, '매도', price, held, `[${label} 손절] ${name} — ${maxSlots}슬롯 소진 후에도 이익 없음(평단 ${formatCurrency(avg)} 대비 ${net.toFixed(2)}%) → 전량 매도`);
        pendingExitContextRef.current[sym] = { at: Date.now(), triggerPrice: price, rule: 'STOP_LOSS' };
        try { await executeTradeRef.current('SELL', stock, held, `${label} 매수분 손절 — ${maxSlots}슬롯 소진 후 이익 없음 (${net.toFixed(2)}%)`, sellPx, avg, undefined, 'STOP_LOSS', undefined, { deferFillCheck: true }); }
        catch (e) { console.warn(`[${label} 손절 실패]`, sym, e); }
        continue;
      }
      const ob = liveOrderbooksRef.current[sym];
      const b1Raw = Number(ob?.bidPrice1 || 0);
      const b1 = b1Raw > 0 && Date.now() - (lastWsOrderbookTickAtRef.current[sym] || 0) <= 10000 ? b1Raw : Math.max(tick, Math.round((price - tick) / tick) * tick);
      const cash = orderableKrwRef.current > 0 ? orderableKrwRef.current : 0;
      if (cash > 0 && cash < b1 * qty) {
        tp.lastAddDate = today; persistTrendCarry();
        addLog(sym, '매수', b1, 0, `[${label} 추가] ${name} 슬롯 ${slots + 1} — 매수 안 함: 주문가능현금 부족 · 평단 대비 ${net.toFixed(2)}%`);
        continue;
      }
      const note = `평단 ${formatCurrency(avg)} 대비 ${net.toFixed(2)}% (이익 없음) → 슬롯 ${slots + 1}/${maxSlots}`;
      tp.lastAddDate = today; tp.slots = slots + 1; tp.addQtyBefore = held; tp.peak = b1; tp.entryAt = Date.now();
      if (kind === 'CLOSE') tp.date = today; // 마감 매수는 추가로 산 날에도 팔지 않는다
      persistTrendCarry();
      addLog(sym, '매수', b1, qty, `[${label} 추가] ${name} ${qty}주 (매수1호가 ${formatCurrency(b1)}) — ${note}`);
      noteCaseRoute(sym, `${label} 추가 매수`, note);
      try { await executeTradeRef.current('BUY', stock, qty, `[${label} 추가] ${name} 슬롯 ${slots + 1}/${maxSlots} — ${note}`, b1, undefined, undefined, undefined, `${label}추가`, { deferFillCheck: true }); }
      catch (e) { console.warn(`[${label} 추가 매수 실패]`, sym, e); }
    }
  };

  // (2026-10-07) 새 기준 — ① 50일 이동평균이 5거래일 전보다 높고 현재가가 50일선 위 ② 전일 대비 하락. 둘 다 맞으면 1주를 매수1호가에 주문.
  //   이미 마감 매수로 들고 있는 종목도 같은 기준에 다시 맞으면 1주를 더 산다. 평소 스캘핑으로 들고 있는 종목은 판단하지 않는다.
  const runCloseBuyJudgment = async (dateKey: string) => {
    const tabs = scalperTabsRef.current.filter(t => /^\d{6}$/.test(t.symbol || '') && (t.id === activeTabIdRef.current ? isGapBotActiveRef.current : t.isBotActive));
    // (15:40) 이미 마감 매수로 들고 있는 종목은 여기서 다시 판단하지 않는다 — 이익이 없으면 슬롯을 하나 더 여는 점검을 먼저 한다
    try { await runCarryDaily('CLOSE', Math.max(1, Math.floor(getLiveParams().closeBuyQty))); } catch (e) { console.warn('[마감 보유분 점검 실패]', e); }
    const symbols = Array.from(new Set(tabs.map(t => t.symbol)));
    const items: CloseBuyItem[] = [];
    const buyList: { stock: Stock; name: string; bid1: number; qty: number; chg: number; note: string }[] = [];
    const todayYmd = dateKey.replace(/-/g, '');
    for (const sym of symbols) {
      const stock = stocksRef.current.find(x => x.symbol === sym);
      const name = tabs.find(t => t.symbol === sym)?.name || stock?.name || sym;
      const price = Number(stock?.price || 0);
      if (!stock || !(price > 0)) continue;
      const heldQty = Number(holdingsRef.current[sym] || 0);
      const isCarry = false; // 보유 중인 종목은 종류와 무관하게 새 판단에서 제외
      const heldKind = trendCarryRef.current[sym] ? (trendCarryRef.current[sym].kind === 'CLOSE' ? '마감 매수로 보유 중(추가 슬롯은 별도 점검)' : '추세 매수로 보유 중') : '스캘핑으로 보유 중';
      const busy = pendingBuyOrdersRef.current.some(o => o.symbol === sym) || pendingSellOrdersRef.current.some(o => o.symbol === sym)
        || pendingTradeKeysRef.current.has(`${sym}_BUY`) || pendingTradeKeysRef.current.has(`${sym}_SELL`);
      const chg = Number(stock.changePercent || 0);
      const fresh = Date.now() - (lastWsTickAtRef.current[sym] || 0) <= 60000;
      // 50일 이동평균 — 일봉 조회(오늘 봉은 현재가로 바꿔 계산)
      let maNow = 0, maPrev = 0, maNote = '50일선 조회 실패';
      const LPj = getLiveParams();
      // 추가 기준 5개(점수제) — 계산할 수 없는 항목은 '불충족'으로 센다
      const checks: { name: string; ok: boolean; detail: string }[] = [];
      try {
        const rows = await kisService.getDomesticDailyCloses(sym);
        {
          const hasToday = rows.length > 0 && rows[0].date === todayYmd;
          const past = hasToday ? rows.slice(1) : rows;
          // ① 거래량이 줄면서 내렸는가 — 오늘 거래량 < 최근 N일 평균
          const volDays = Math.max(2, Math.floor(LPj.closeBuyVolDays));
          const pv = past.slice(0, volDays).map(r => r.volume).filter(v => v > 0);
          const volToday = hasToday ? rows[0].volume : 0;
          const volAvg = pv.length ? pv.reduce((a, c) => a + c, 0) / pv.length : 0;
          checks.push({ name: '거래량 감소', ok: volToday > 0 && volAvg > 0 && pv.length >= volDays && volToday < volAvg, detail: volToday > 0 && volAvg > 0 ? `${Math.round((volToday / volAvg) * 100)}%` : '자료 없음' });
          // ② 하락 폭이 적당한가
          checks.push({ name: '하락 폭 적당', ok: chg <= -Math.abs(LPj.closeBuyDropMinPct) && chg >= -Math.abs(LPj.closeBuyDropMaxPct), detail: `${chg.toFixed(2)}%` });
          // ③ 20일선 위
          const c20 = [price, ...past.slice(0, 19).map(r => r.close)];
          const ma20 = c20.length >= 20 ? c20.reduce((a, c) => a + c, 0) / c20.length : 0;
          checks.push({ name: '20일선 위', ok: ma20 > 0 && price > ma20, detail: ma20 > 0 ? `${(((price - ma20) / ma20) * 100).toFixed(1)}%` : '자료 없음' });
          // ④ 장 막판에 돌아서는가 — 당일 저가 대비 N% 이상 위, 또는 최근 30분 상승(1분 기록)
          const dayLow = hasToday && rows[0].low > 0 ? Math.min(rows[0].low, price) : 0;
          const fromLow = dayLow > 0 ? ((price - dayLow) / dayLow) * 100 : -1;
          const rec30 = getRecentPanel(sym, 30);
          const rise30 = rec30.length >= 10 && rec30[0].p > 0 ? ((price - rec30[0].p) / rec30[0].p) * 100 : undefined;
          checks.push({ name: '막판 반등', ok: fromLow >= LPj.closeBuyBounceFromLowPct || (rise30 !== undefined && rise30 > 0), detail: `저가 대비 ${fromLow >= 0 ? `+${fromLow.toFixed(1)}%` : '?'}${rise30 !== undefined ? ` · 30분 ${rise30 >= 0 ? '+' : ''}${rise30.toFixed(1)}%` : ''}` });
          // ⑤ 최근 5거래일 안에 크게 오른 날
          let bestUp = -99;
          for (let i = 0; i < 5 && i + 1 < past.length; i++) { if (past[i + 1].close > 0) bestUp = Math.max(bestUp, ((past[i].close - past[i + 1].close) / past[i + 1].close) * 100); }
          checks.push({ name: '최근 강세', ok: bestUp >= LPj.closeBuyRecentUpPct, detail: bestUp > -99 ? `최고 ${bestUp >= 0 ? '+' : ''}${bestUp.toFixed(1)}%` : '자료 없음' });
        }
        const closes = rows.map(r => r.close);
        if (rows.length > 0 && rows[0].date === todayYmd) closes[0] = price; else closes.unshift(price);
        const need = Math.max(5, Math.floor(getLiveParams().closeBuyMaDays)) + Math.max(1, Math.floor(getLiveParams().closeBuyMaLookback));
        if (closes.length >= need) {
          const mean = (arr: number[]) => arr.reduce((a, c) => a + c, 0) / arr.length;
          maNow = mean(closes.slice(0, Math.max(5, Math.floor(getLiveParams().closeBuyMaDays))));
          maPrev = mean(closes.slice(Math.max(1, Math.floor(getLiveParams().closeBuyMaLookback)), need));
          maNote = `50일선 ${formatCurrency(Math.round(maNow))}(${Math.max(1, Math.floor(getLiveParams().closeBuyMaLookback))}일 전 ${formatCurrency(Math.round(maPrev))}) · 현재가는 50일선 대비 ${(((price - maNow) / maNow) * 100).toFixed(1)}%`;
        } else maNote = `일봉 ${closes.length}개(상장 ${need}거래일 미만)`;
      } catch { /* 조회 실패 — 아래에서 부족 처리 */ }
      const fails: string[] = [];
      if (!fresh) fails.push('최근 1분 실시간 체결 없음');
      if (!(maNow > 0 && maPrev > 0)) fails.push('50일선 계산 불가');
      else {
        if (!(maNow > maPrev)) fails.push('50일선 하락 중');
        if (!(price > maNow)) fails.push('현재가가 50일선 아래');
      }
      if (!(chg < 0)) fails.push(`전일 대비 ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% (하락 아님)`);
      const passed = checks.filter(c => c.ok);
      const minChecks = Math.max(0, Math.floor(LPj.closeBuyMinChecks));
      const checkNote = `추가 기준 ${passed.length}/5 (${checks.map(c => `${c.ok ? '○' : '×'}${c.name} ${c.detail}`).join(' · ') || '계산 불가'})`;
      if (minChecks > 0 && passed.length < minChecks) fails.push(`추가 기준 ${passed.length}개 < ${minChecks}개`);
      const facts = `전일 대비 ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% · ${maNote} · ${checkNote}${isCarry ? ` · 마감 매수 보유 ${heldQty}주` : ''}`;
      if ((heldQty > 0 && !isCarry) || busy) {
        addLog(sym, '매수', price, 0, `[마감판단] ${name} → 판단 제외 — ${busy ? '주문 진행 중' : heldKind} · ${facts}`);
        continue;
      }
      if (fails.length === 0) {
        const tick = getTickSize(price, 'KR');
        const ob = liveOrderbooksRef.current[sym];
        const bid1Raw = Number(ob?.bidPrice1 || 0);
        const bid1 = bid1Raw > 0 ? bid1Raw : Math.max(tick, Math.round((price - tick) / tick) * tick);
        buyList.push({ stock, name, bid1, qty: Math.max(1, Math.floor(getLiveParams().closeBuyQty)), chg, note: facts });
        items.push({ symbol: sym, name, price, decision: 'BUY', orderPrice: bid1, note: facts });
      } else {
        addLog(sym, '매수', price, 0, `[마감판단] ${name} → ${isCarry ? '추가 매수 안 함(그대로 보유)' : '매수 안 함'} — ${fails.join(', ')} · ${facts}`);
        items.push({ symbol: sym, name, price, decision: 'SKIP', note: fails.join(', ') });
      }
    }
    let accepted = 0;
    for (const b of buyList) {
      const sym = b.stock.symbol;
      trendCarryRef.current[sym] = { kind: 'CLOSE', date: dateKey, entryAt: Date.now(), peak: b.bid1, slots: 1 }; persistTrendCarry(); // 체결 직후 스캘핑 매도 규칙이 돌지 않도록 주문 전에 표시
      addLog(sym, '매수', b.bid1, b.qty, `[마감판단] ${b.name} → 매수 ${b.qty}주 (매수1호가 ${formatCurrency(b.bid1)}) — ${b.note}`);
      noteCaseRoute(sym, '마감 매수', b.note);
      try {
        await executeTradeRef.current('BUY', b.stock, b.qty, `[마감판단 매수] ${b.name} ${b.qty}주 — 다음 날부터 수익 상태에서 고점 대비 하락·VWAP 이탈 시 매도`, b.bid1, undefined, undefined, undefined, '마감판단', { deferFillCheck: true });
      } catch (e) { console.warn('[마감판단 매수 실패]', sym, e); }
      if (pendingBuyOrdersRef.current.some(o => o.symbol === sym) || Number(holdingsRef.current[sym] || 0) > 0) accepted++;
      else {
        delete trendCarryRef.current[sym]; persistTrendCarry();
        const it = items.find(i => i.symbol === sym);
        if (it) { it.decision = 'SKIP'; it.note = `주문이 접수되지 않음 · ${it.note}`; }
        addLog(sym, '매수', b.bid1, b.qty, `[마감판단] ${b.name} → 주문이 접수되지 않았습니다(주문가능현금 부족 등)`);
      }
    }
    writeCloseBuyBook({ date: dateKey, items });
    const summary = `[마감판단] 판단 ${items.length}종목 — 매수 대상 ${buyList.length} · 주문 접수 ${accepted} · 매수 안 함 ${items.length - buyList.length}`;
    addLog('SYSTEM', '매수', 0, 0, summary);
    showNotificationRef.current?.(summary, 'info');
  };

  /** 다음 거래일 아침 — 전날 마감판단 종목들의 가격 변화를 기록한다 (매수한 쪽 / 안 한 쪽 비교용) */
  const runCloseBuyReview = async (book: { date: string; items: CloseBuyItem[]; reviewed?: boolean }) => {
    const groups: Record<'BUY' | 'SKIP', number[]> = { BUY: [], SKIP: [] };
    for (const it of book.items) {
      let now = Number(stocksRef.current.find(x => x.symbol === it.symbol && Date.now() - (lastWsTickAtRef.current[it.symbol] || 0) <= 60000)?.price || 0);
      if (!(now > 0)) { try { now = Number((await kisService.getPrice(it.symbol))?.current || 0); } catch { now = 0; } }
      if (!(now > 0) || !(it.price > 0)) continue;
      const base = it.decision === 'BUY' && it.orderPrice ? it.orderPrice : it.price;
      const pct = ((now - base) / base) * 100;
      groups[it.decision].push(pct);
      addLog(it.symbol, '매수', now, 0, `[마감판단 결과] ${it.name} — ${it.decision === 'BUY' ? '매수함' : '매수 안 함'} · 전일 ${formatCurrency(base)} → 지금 ${formatCurrency(now)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%, 수수료·세금 전)`);
    }
    const avg = (v: number[]) => (v.length ? `${(v.reduce((a, c) => a + c, 0) / v.length).toFixed(2)}% (${v.filter(x => x > 0).length}/${v.length} 상승)` : '없음');
    addLog('SYSTEM', '매수', 0, 0, `[마감판단 결과] ${book.date} 판단분 — 매수한 종목 평균 ${avg(groups.BUY)} · 매수 안 한 종목 평균 ${avg(groups.SKIP)}`);
  };
  const sessionAlertDoneRef = React.useRef<Record<string, boolean>>({});
  // 🌙 (2026-09-28 추가) H0STOUP0(시간외 실시간체결가, KIS 공식 문서 확인 — 16:00~18:00 전용) 구독 상태 추적.
  // 서버(server.ts)는 클라이언트가 명시적으로 subscribe_overtime/unsubscribe_overtime을 보낸 종목만
  // 추가로 이 3번째 실시간 슬롯(체결가+호가에 더해)을 사용하므로, "지금 보유 중이고 + 16:00~18:00 구간"인
  // 종목에 대해서만 이 ref로 diff해서 구독을 켜고 끈다.
  const overtimeSubscribedRef = React.useRef<Set<string>>(new Set());

  // ⏱️ 사후 확인 처리 (20초마다) — 예약 시각이 된 항목의 현재가를 읽어 변화율을 기록한다
  // (메모리에만 예약되므로 새로고침하면 대기 중이던 확인은 사라진다)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      const due = followUpsRef.current.filter(f => f.due <= now);
      if (due.length === 0) return;
      followUpsRef.current = followUpsRef.current.filter(f => f.due > now);
      due.forEach(f => {
        const price = stocksRef.current.find(s => s.symbol === f.symbol)?.price || 0;
        if (!(price > 0) || !(f.basePrice > 0)) return;
        const ret = Number((((price - f.basePrice) / f.basePrice) * 100).toFixed(3));
        if (f.kind === 'missed3') updateMissedSignal(f.id, { ret3m: ret });
        else if (f.kind === 'missed10') updateMissedSignal(f.id, { ret10m: ret });
        else updateCloseDecision(f.id, { followRet30m: ret });
      });
    }, 20000);
    return () => clearInterval(t);
  }, []);

  const [tradingSession, setTradingSession] = useState<TradingSession>(() => getTradingSession());
  useEffect(() => {
    const t = setInterval(() => setTradingSession(prev => { const next = getTradingSession(); return prev === next ? prev : next; }), 15000);
    return () => clearInterval(t);
  }, []);

  const evaluateCarry = (stock: Stock, avgPrice: number, window: 'REGULAR' | 'AFTER' = 'REGULAR') => {
    const strat = detectStockStrategiesRef.current(stock);
    const price = stock.price || 0;
    const netPct = calculateNetProfitPercent(avgPrice, price, 'KR');
    const cvd = (stock as any).realCvd as number | undefined;
    const prevCvd = carryPrevCvdRef.current[stock.symbol];
    if (typeof cvd === 'number') carryPrevCvdRef.current[stock.symbol] = cvd;
    const hasCvd = typeof cvd === 'number';
    const cvdRising = hasCvd && typeof prevCvd === 'number' && cvd! > prevCvd;
    const cvdFalling = hasCvd && typeof prevCvd === 'number' && cvd! < prevCvd;
    const exec = stock.executionStrength || 0;
    const ob = liveOrderbooksRef.current[stock.symbol];
    const bid = Number(ob?.totalBidVolume || 0);
    const ask = Number(ob?.totalAskVolume || 0);
    const bidAskRatio = ask > 0 ? (bid / ask) * 100 : 0;
    const recent = (stock.history || []).slice(-60).map(h => h.price).filter(p => p > 0);
    const peak = Math.max(price, ...(recent.length ? recent : [price]));
    const drawdownPct = peak > 0 ? ((peak - price) / peak) * 100 : 0;
    // 📐 진짜 VWAP 기준 — 정규장 판단은 정규장 VWAP, 애프터 판단은 정규장·애프터 VWAP "둘 다" 위여야 VWAP 위로 본다.
    // 진짜 VWAP 데이터가 아직 없으면(필드 검증 전 등) 기존 센서의 단순평균 VWAP으로 대신한다.
    const tv = getTrueVwaps(stock.symbol);
    const trueRefs = (window === 'AFTER' ? [tv.regular, tv.after] : [tv.regular]).filter(v => v > 0);
    const vwapRefs = trueRefs.length > 0 ? trueRefs : (strat.vwap > 0 ? [strat.vwap] : []);
    const vwapLabel = trueRefs.length > 0 ? (window === 'AFTER' && trueRefs.length === 2 ? '정규·애프터 VWAP' : 'VWAP') : 'VWAP(단순평균)';
    const aboveVwap = vwapRefs.length > 0 && vwapRefs.every(v => price > v);

    let score = 0;
    const breakdown: string[] = [];
    if (aboveVwap) { score += 2; breakdown.push(`${vwapLabel} 위 +2`); }
    if (hasCvd && cvd! > 0) { score += 1; breakdown.push('CVD 양수 +1'); }
    if (cvdRising) { score += 1; breakdown.push('CVD 상승 +1'); }
    if (exec >= 130) { score += 2; breakdown.push(`체결강도 ${Math.round(exec)} +2`); }
    else if (exec >= 100) { score += 1; breakdown.push(`체결강도 ${Math.round(exec)} +1`); }
    if (bidAskRatio >= 130) { score += 1; breakdown.push('매수호가 우세 +1'); }
    if (drawdownPct <= 0.5) { score += 1; breakdown.push('고점 유지 +1'); }
    if (strat.hasVolumeMomentum) { score += 1; breakdown.push('거래량 유지 +1'); }
    if (netPct >= 0.3) { score += 1; breakdown.push('수익 여유 +1'); }

    let hardSellReason: string | undefined;
    if (netPct <= scalpingStopLossRef.current) hardSellReason = `손절선 도달 (${netPct.toFixed(2)}%)`;
    else if (!aboveVwap && vwapRefs.length > 0 && cvdFalling) hardSellReason = `${vwapLabel} 이탈 + CVD 하락 (상승 구조 붕괴)`;
    else if (drawdownPct >= CARRY_MAX_DRAWDOWN_PCT) hardSellReason = `최근 고점 대비 ${drawdownPct.toFixed(2)}% 하락`;

    return { score, breakdown, hardSellReason, netPct, price };
  };

  useEffect(() => {
    if (!isAppInitialized) return;

    const run = async () => {
      if (closeDecisionBusyRef.current) return;
      closeDecisionBusyRef.current = true;
      try {
        const session = getTradingSession();
        const { minutes, dateKey } = getKstClock();
        // 🛡️ 봇이 관리하는 종목만 대상 — 인벤토리에 있고 봇이 켜진(ON) 종목. 계좌에 따로 들고 있는 다른 주식은
        // 절대 건드리지 않는다(매매 엔진의 매도 로직도 봇 ON 종목에만 동작하는 것과 같은 기준).
        const heldInInventory = Object.entries(holdingsRef.current || {})
          .filter(([sym, qty]) => /^\d{6}$/.test(sym) && (qty || 0) > 0)
          .filter(([sym]) => scalperTabsRef.current.some(t => t.symbol === sym))
          .map(([sym]) => sym);
        const heldSymbols = heldInInventory.filter(sym => scalperTabsRef.current.some(t => t.symbol === sym && t.isBotActive));

        // (a-0) H0STOUP0(시간외 실시간체결가) 구독 diff — KIS 공식 문서 기준 16:00~18:00 구간에만,
        // 그리고 그 시간에 실제로 보유 중인 종목에 대해서만 켠다(전 종목에 걸어두면 세션당 실시간
        // 등록 슬롯이 종목당 1개씩 더 소모되어 REALTIME_SLOT_CAPACITY 한도가 깨진다).
        // 18:00 이후(19:50까지 이어지는 애프터 세션의 나머지 구간)는 KIS가 이 tr_id로 데이터를 주지
        // 않는 것으로 문서에 명시돼 있어, 그 구간은 기존 REST 폴백(getPrice/refreshStalePrices)에 맡긴다.
        {
          const inOvertimeWsWindow = session === 'AFTER_SCALP' && minutes >= 16 * 60 && minutes < 18 * 60;
          // 🛡️ 앱키 1개의 실시간 등록 여유분(OVERTIME_WS_SPARE=2)을 넘지 않도록 최대 2종목까지만(두 종목이
          // 같은 계좌에 몰려도 안전하도록, 계좌가 2개여도 합계 2종목으로 둔다) —
          // 그 이상은 KIS가 등록 한도 초과로 거부하므로 보내지 않는다(나머지는 REST 백업이 커버).
          // 이미 구독 중인 종목을 우선 유지해서, 보유 순서가 바뀌어도 불필요한 해제/재구독이 없게 한다.
          const overtimeCandidates = inOvertimeWsWindow
            ? [...heldSymbols.filter(s => overtimeSubscribedRef.current.has(s)), ...heldSymbols.filter(s => !overtimeSubscribedRef.current.has(s))]
            : [];
          const wantOvertime = new Set<string>(overtimeCandidates.slice(0, OVERTIME_WS_SPARE));
          const prevOvertime = overtimeSubscribedRef.current;
          const toAdd: string[] = [];
          const toRemove: string[] = [];
          wantOvertime.forEach(sym => { if (!prevOvertime.has(sym)) toAdd.push(sym); });
          prevOvertime.forEach(sym => { if (!wantOvertime.has(sym)) toRemove.push(sym); });
          if (toAdd.length > 0 || toRemove.length > 0) {
            console.log('[시간외 실시간체결가 구독 diff]', { 추가: toAdd, 제거: toRemove });
            toAdd.forEach(sym => { wsHandleRef.current?.send({ type: 'subscribe_overtime', symbol: sym }); });
            toRemove.forEach(sym => { wsHandleRef.current?.send({ type: 'unsubscribe_overtime', symbol: sym }); });
            overtimeSubscribedRef.current = wantOvertime;
          }
        }

        // (a) 판단 2분 전부터 CVD 기준값을 미리 기록해 둔다 — 첫 판단부터 "CVD 상승/하락"을 볼 수 있도록
        const preRegular = session === 'REGULAR_SCALP' && minutes >= 15 * 60 + 13; // 판단(15:15) 2분 전
        const preAfter = session === 'AFTER_SCALP' && minutes >= 19 * 60 + 48;
        if (preRegular || preAfter) {
          heldSymbols.forEach(sym => {
            const cvd = (stocksRef.current.find(s => s.symbol === sym) as any)?.realCvd;
            if (typeof cvd === 'number') carryPrevCvdRef.current[sym] = cvd;
          });
        }

        // (b) 16:03 이후 애프터마켓 실시간 시세 점검 — 보유 종목에 16시 이후 실시간 틱이 하나도 없으면 경고
        if (session === 'AFTER_SCALP' && minutes >= 16 * 60 + 3 && heldSymbols.length > 0 && !sessionAlertDoneRef.current[`${dateKey}|afterTick`]) {
          sessionAlertDoneRef.current[`${dateKey}|afterTick`] = true;
          const [y, mo, d] = dateKey.split('-').map(Number);
          const after16Utc = Date.UTC(y, mo - 1, d, 16 - 9, 0, 0); // KST 16:00
          const noTick = heldSymbols.filter(sym => (lastWsTickAtRef.current[sym] || 0) < after16Utc);
          if (noTick.length > 0) {
            const names = noTick.map(sym => scalperTabsRef.current.find(t => t.symbol === sym)?.name || sym).join(', ');
            showNotification(`⚠️ [애프터마켓 시세 없음] ${names} — 16시 이후 실시간 시세가 들어오지 않아 손절·매도 판단이 멈춰 있습니다. 직접 확인해 주세요.`, 'error');
            addLog('SYSTEM', '매도', 0, 0, `[애프터마켓 점검] 16시 이후 실시간 시세 없음: ${names} — 이 종목들은 자동 손절이 동작하지 않습니다`);
          }
        }

        // (c) 20:00 이후 남은 보유 종목 알림 — 다음 날로 넘어감
        if (session === 'CLOSED' && minutes >= 20 * 60 && minutes < 20 * 60 + 30 && heldInInventory.length > 0 && !sessionAlertDoneRef.current[`${dateKey}|overnight`]) {
          sessionAlertDoneRef.current[`${dateKey}|overnight`] = true;
          const names = heldInInventory.map(sym => scalperTabsRef.current.find(t => t.symbol === sym)?.name || sym).join(', ');
          showNotification(`[장 종료] 다음 날로 넘어간 보유 종목: ${names}`, 'info');
          addLog('SYSTEM', '매도', 0, 0, `[장 종료] 다음 날로 넘어간 보유 종목 ${heldInInventory.length}개: ${names}`);
        }

        // ✂️ (2026-09-30) 사용자 요청으로 마감 매도 판단(15:15 정규장 · 19:50 애프터) 삭제 — 15:15 직전 체결된 종목이
        // 체결되자마자 마감 판단으로 매도된 사례. 보유 종목은 마감 구간에도 평소처럼 손절·트레일링·신호 매도로만 관리한다.
        // 신규 매수 중지(15:15~, 19:50~)는 그대로. 아래 판단 코드는 스위치로 남겨둠.
        // 🌇 (2026-10-07) 마감 스냅샷 — 15:10 · 15:15 · 15:19 기록(다른 점검을 막지 않도록 기다리지 않는다), 15:45 이후 지난 기록에 결과 붙이기
        {
          const wdS = getKstClock().weekday;
          if (wdS !== 'Sat' && wdS !== 'Sun') {
            const fire = (stage: '10' | '15' | '19') => {
              if (sessionAlertDoneRef.current[`${dateKey}|snap${stage}`]) return;
              sessionAlertDoneRef.current[`${dateKey}|snap${stage}`] = true;
              void runCloseSnap(stage, dateKey).catch(e => console.warn('[마감 스냅샷 실패]', stage, e));
            };
            if (minutes >= 15 * 60 + 10 && minutes < 15 * 60 + 15) fire('10');
            else if (minutes >= 15 * 60 + 15 && minutes < 15 * 60 + 19 && sessionAlertDoneRef.current[`${dateKey}|snap10`]) fire('15');
            else if (minutes >= 15 * 60 + 19 && minutes < 15 * 60 + 22 && sessionAlertDoneRef.current[`${dateKey}|snap10`]) fire('19');
            if (minutes >= 15 * 60 + 45 && !sessionAlertDoneRef.current[`${dateKey}|snapFill`]) {
              sessionAlertDoneRef.current[`${dateKey}|snapFill`] = true;
              let fillDay = '';
              try { fillDay = localStorage.getItem('leo100b_closesnap_fill_v1') || ''; } catch { fillDay = ''; }
              if (fillDay !== dateKey) {
                void runCloseSnapFill(dateKey).then(() => { try { localStorage.setItem('leo100b_closesnap_fill_v1', dateKey); } catch { /* 무시 */ } }).catch(e => console.warn('[마감 스냅샷 결과 실패]', e));
              }
            }
          }
        }

        // 🖼️ (2026-10-07) 장 마감 뒤(15:40 이후) 하루 한 번 — 그날 매수가 체결된 종목의 일봉 차트를 PNG로 폴더에 저장한다
        {
          const wdC = getKstClock().weekday;
          if (wdC !== 'Sat' && wdC !== 'Sun' && minutes >= 15 * 60 + 40 && !sessionAlertDoneRef.current[`${dateKey}|chartSave`]) {
            sessionAlertDoneRef.current[`${dateKey}|chartSave`] = true;
            let savedDay = '';
            try { savedDay = localStorage.getItem('leo100b_chart_saved_v1') || ''; } catch { savedDay = ''; }
            if (savedDay !== dateKey) {
              try { await runChartSave(dateKey); } catch (e) { console.warn('[차트 저장 실패]', e); sessionAlertDoneRef.current[`${dateKey}|chartSave`] = false; }
            }
          }
        }

        // 📌 (2026-10-06) 종가 기록 — 15:35 이후 하루 한 번, 그날 신호를 낸 종목 전부의 종가를 조회해 신호 기록에 적는다
        // ("신호가에 사서 종가까지 보유" 순수익을 매일 비교하기 위한 자료). 주말·휴장일에는 신호가 없어 아무것도 하지 않는다.
        if (minutes >= 15 * 60 + 35 && !sessionAlertDoneRef.current[`${dateKey}|closePx`]) {
          let doneDay = '';
          try { doneDay = localStorage.getItem('leo100b_close_px_done_v1') || ''; } catch { doneDay = ''; }
          sessionAlertDoneRef.current[`${dateKey}|closePx`] = true;
          if (doneDay !== dateKey) {
            try {
              const todays = await getSignalsForDate(dateKey);
              const symbols = [...new Set(todays.map(r => r.symbol))];
              if (symbols.length > 0) {
                const closes: Record<string, number> = {};
                for (const sym of symbols) {
                  try { const px = Number((await kisService.getPrice(sym))?.current || 0); if (px > 0) closes[sym] = px; } catch { /* 이 종목은 건너뜀 */ }
                }
                const n = await applyClosePrices(dateKey, closes);
                const filled = todays.filter(r => closes[r.symbol] > 0);
                const avg = (list: typeof todays) => {
                  const v = list.filter(r => closes[r.symbol] > 0 && r.price > 0).map(r => ((closes[r.symbol] * (1 - KR_BROKER_FEE_RATE - KR_TAX_RATE)) - r.price * (1 + KR_BROKER_FEE_RATE)) / (r.price * (1 + KR_BROKER_FEE_RATE)) * 100);
                  return v.length ? `${(v.reduce((a, c) => a + c, 0) / v.length).toFixed(2)}% (${v.filter(x => x > 0).length}/${v.length} 수익)` : '없음';
                };
                addLog('SYSTEM', '매수', 0, 0, `[종가 기록] 신호 ${n}건 · ${Object.keys(closes).length}/${symbols.length}종목 종가 반영 — 종가까지 보유했다면: 통과 ${avg(filled.filter(r => r.kind === 'PASS'))} · 근접탈락 ${avg(filled.filter(r => r.kind === 'NEAR'))} · 관찰 ${avg(filled.filter(r => r.kind === 'WATCH'))}`);
                if (Object.keys(closes).length > 0) { try { localStorage.setItem('leo100b_close_px_done_v1', dateKey); } catch { /* 무시 */ } }
              }
            } catch (e) { console.warn('[종가 기록 실패]', e); sessionAlertDoneRef.current[`${dateKey}|closePx`] = false; }
          }
        }

        // 📈 (2026-10-07) 전 종목 1분 기록 + 추세 매수 — 평일 정규장(09:00~15:30), 1분에 한 번
        {
          const wdP = getKstClock().weekday;
          if (wdP !== 'Sat' && wdP !== 'Sun' && minutes >= 9 * 60 && minutes <= 15 * 60 + 30 && Date.now() - lastPanelAtRef.current >= 58000) {
            lastPanelAtRef.current = Date.now();
            try { await runPanelSample(); } catch (e) { console.warn('[1분 기록 실패]', e); }
          }
        }

        // 🌙 (2026-10-06) 마감 매수 판단 — 15:10~15:20 사이 하루 한 번
        {
          const wd = getKstClock().weekday;
          const bookNow = readCloseBuyBook();
          if (getLiveParams().closeBuyEnabled && wd !== 'Sat' && wd !== 'Sun' && minutes >= 15 * 60 + 10 && minutes < 15 * 60 + 20 && bookNow?.date !== dateKey && !sessionAlertDoneRef.current[`${dateKey}|closeBuy`]) {
            sessionAlertDoneRef.current[`${dateKey}|closeBuy`] = true;
            try { await runCloseBuyJudgment(dateKey); } catch (e) { console.warn('[마감판단 실패]', e); }
          }
          // 다음 거래일 09:10~15:00 — 전날 판단분 결과 기록(한 번)
          if (bookNow && bookNow.date < dateKey && !bookNow.reviewed && wd !== 'Sat' && wd !== 'Sun' && minutes >= 9 * 60 + 10 && minutes < 15 * 60) {
            writeCloseBuyBook({ ...bookNow, reviewed: true });
            try { await runCloseBuyReview(bookNow); } catch (e) { console.warn('[마감판단 결과 기록 실패]', e); }
          }
        }

        if (!CLOSE_DECISION_SELL_ENABLED) return;
        if (session !== 'REGULAR_CLOSE_DECISION' && session !== 'AFTER_CLOSE_DECISION') return;
        const window: 'REGULAR' | 'AFTER' = session === 'REGULAR_CLOSE_DECISION' ? 'REGULAR' : 'AFTER';
        // 정규장 마감 판단 날 애프터마켓이 없으면(도입 전) 들고 가는 것은 곧 다음 날 보유 — 다음 날 기준을 적용
        const effectiveWindow: 'REGULAR' | 'AFTER' = window === 'REGULAR' && !isAfterMarketAvailableToday() ? 'AFTER' : window;
        const carryAllowed = effectiveWindow === 'REGULAR' ? AFTER_MARKET_CARRY_ENABLED : OVERNIGHT_CARRY_ENABLED;

        for (const sym of heldSymbols) {
          const qty = holdingsRef.current[sym] || 0;
          const avg = avgPricesRef.current[sym] || 0;
          const stock = stocksRef.current.find(s => s.symbol === sym);
          if (!stock || !(stock.price > 0) || !(avg > 0) || qty <= 0) continue;

          const tab = scalperTabsRef.current.find(t => t.symbol === sym);
          const name = tab?.name || stock.name || sym;
          const ev = evaluateCarry(stock, avg, effectiveWindow);
          const wouldHold = !ev.hardSellReason && (effectiveWindow === 'REGULAR'
            ? ev.score >= CARRY_HOLD_MIN_REGULAR
            : ev.score >= CARRY_HOLD_MIN_OVERNIGHT && ev.netPct >= OVERNIGHT_MIN_NET_PCT);
          const action: 'HOLD' | 'SELL' = carryAllowed && wouldHold ? 'HOLD' : 'SELL';

          const key = `${dateKey}|${window}|${sym}`;
          const prevAction = closeDecisionStateRef.current[key];
          if (prevAction === 'SELL' && action === 'HOLD') {
            // 한 번 매도로 결정한 종목은 같은 구간 안에서 다시 보유로 바꾸지 않는다 (매도 주문이 이미 나갔을 수 있음)
          } else if (prevAction !== action) {
            closeDecisionStateRef.current[key] = action;
            const decisionId = recordCloseDecision({
              time: Date.now(), window, symbol: sym, name,
              score: ev.score, maxScore: CARRY_SCORE_MAX, breakdown: ev.breakdown, hardSellReason: ev.hardSellReason,
              action, carryAllowed, wouldHold, netPct: ev.netPct, price: ev.price,
            });
            if (action === 'SELL') followUpsRef.current.push({ due: Date.now() + 30 * 60000, kind: 'decision30', id: decisionId, symbol: sym, basePrice: ev.price });
            const where = effectiveWindow === 'REGULAR' ? '애프터마켓' : '다음 날';
            const why = ev.hardSellReason
              ? ev.hardSellReason
              : !carryAllowed ? `${where} 보유 기능 꺼짐${wouldHold ? ' (점수상으로는 보유 대상)' : ''}`
              : `보유점수 ${ev.score}/${CARRY_SCORE_MAX}`;
            addLog(sym, '매도', ev.price, 0, `[마감판단] ${name} → ${action === 'HOLD' ? `${where}까지 보유 연장` : '매도'} — ${why} · 순수익 ${ev.netPct.toFixed(2)}% · ${ev.breakdown.join(', ') || '점수 항목 없음'}`);
          }

          if (closeDecisionStateRef.current[key] !== 'SELL') continue;

          // 매도 실행 — 이미 매도 주문이 진행 중이면 건너뛰고, 같은 종목은 60초 안에 다시 시도하지 않는다
          const lifecycle = tab?.lifecycleStatus;
          const hasPendingSell = pendingSellOrdersRef.current.some(o => o.symbol === sym);
          if (hasPendingSell || lifecycle === 'SELL_READY' || lifecycle === 'SELLING') continue;
          if (Date.now() - (closeSellAttemptAtRef.current[sym] || 0) < 60000) continue;
          closeSellAttemptAtRef.current[sym] = Date.now();

          const tick = getTickSize(stock.price, 'KR');
          const bid1 = Number(liveOrderbooksRef.current[sym]?.bidPrice1 || 0);
          const sellPrice = bid1 > 0 ? bid1 : Math.max(tick, Math.round((stock.price - tick) / tick) * tick); // 매수1호가(즉시 체결 가격)
          transitionLifecycleStatus(sym, 'SELL_READY', `마감 판단 매도 (${window === 'REGULAR' ? '정규장' : '애프터'} 마감)`);
          pendingExitContextRef.current[sym] = { at: Date.now(), triggerPrice: stock.price, rule: window === 'REGULAR' ? 'CLOSE_REGULAR' : 'CLOSE_AFTER' };
          await executeTradeRef.current(
            'SELL', stock, qty,
            `${window === 'REGULAR' ? '정규장' : '애프터마켓'} 마감 판단 매도 (보유점수 ${ev.score}/${CARRY_SCORE_MAX}${ev.hardSellReason ? ` · ${ev.hardSellReason}` : ''})`,
            sellPrice, avg, undefined, window === 'REGULAR' ? 'CLOSE_REGULAR' : 'CLOSE_AFTER'
          );
        }
      } catch (e) {
        console.warn('[마감 판단 오류]', e);
      } finally {
        closeDecisionBusyRef.current = false;
      }
    };

    run();
    const timer = setInterval(run, 20000);
    return () => clearInterval(timer);
  }, [isAppInitialized]);

  const handleExecuteManualSell = async () => {
    if (isSubmittingManualSell) return;

    const targetStock = manualSellStock || selectedStock;
    if (!targetStock) {
      showNotification("매도할 종목을 선택해 주세요.", "error");
      return;
    }

    const heldQty = holdings[targetStock.symbol] || 0;
    if (manualSellQty <= 0) {
      showNotification("올바른 매도 수량을 입력해 주세요.", "error");
      return;
    }

    if (manualSellQty > heldQty && (!kisConfig.isConnected)) {
      showNotification(`보유 수량(${heldQty}주)을 초과하여 매도할 수 없습니다.`, "error");
      return;
    }

    if (manualSellPrice <= 0) {
      showNotification("올바른 매도 희망 단가를 입력해 주세요.", "error");
      return;
    }

    try {
      setIsSubmittingManualSell(true);
      showNotification(`${targetStock.name} ${formatCurrency(manualSellPrice)} 지정가 매도 주문 전송 중...`, "info");
      transitionLifecycleStatus(targetStock.symbol, 'SELL_READY', `수동 지정가 매도 (희망가 ${formatCurrency(manualSellPrice)})`);
      // 📒 수동 매도도 매도 판단 순간 정보를 새로 남긴다 — 안 그러면 직전 자동 매도 시도의 정보가 이 체결에 잘못 붙을 수 있다
      pendingExitContextRef.current[targetStock.symbol] = { at: Date.now(), triggerPrice: targetStock.price || manualSellPrice, rule: 'MANUAL' };
      await executeTrade('SELL', targetStock, manualSellQty, `[수동 지정가 매도] 희망가 ${formatCurrency(manualSellPrice)}`, manualSellPrice, avgPrices[targetStock.symbol], undefined, 'MANUAL');
      showNotification(`${targetStock.name} ${formatCurrency(manualSellPrice)} 지정가 매도 주문이 접수되었습니다.`, "success");
      playScalpingSound('SELL');
      setManualSellModalOpen(false);
      setManualSellStock(null);
    } catch (err: any) {
      console.error("[Manual Sell Error]", err);
      showNotification(`매도 주문 처리 실패: ${err?.message || '오류 발생'}`, "error");
    } finally {
      setIsSubmittingManualSell(false);
    }
  };


  const handleTestConnection = async () => {
    if (!kisConfig.appKey || !kisConfig.appSecret || !kisConfig.accountNo) {
      alert("모든 필수 정보를 입력해주세요.");
      return;
    }

    setBotStatus("연결 진행 중...");
    try {
      // Temporarily init to test
      const testConfig = getActiveKisConfig(kisConfig);
      kisService.init(testConfig);
      
      // 1. Try Token
      setBotStatus("토큰 발급 중...");
      await kisService.refreshAccessToken();
 
      // 2. Try simple balance
      setBotStatus("계좌 잔고 조회 중...");
      try {
        await kisService.getBalance();
        showNotification("성공! KIS 서버 연결에 성공했습니다.", "success");
      } catch (e: any) {
        // Balance might fail even if token works (e.g. password)
        showNotification(`잔고 조회 실패: ${e.message}`, "error");
      }
    } catch (e: any) {
      showNotification(`연결 실패: ${e.message}`, "error");
    } finally {
      setBotStatus(kisConfig.isConnected ? "연동 중" : "대기 중");
    }
  };

  const handleConnectKIS = async () => {
    if (!kisConfig.appKey || !kisConfig.appSecret || !kisConfig.accountNo) {
      alert("모든 필수 정보를 입력해주세요.");
      return;
    }
    const newConfig = {
      ...kisConfig,
      isConnected: true
    };
    kisService.init(getActiveKisConfig(newConfig));
    setKisConfig(newConfig);
    
    // PERSISTENCE: Save to Firestore if user is logged in
    if (currentUser) {
      await saveUserKISConfig(currentUser.uid, newConfig);
      setExtraAccountsLoaded(true);
      await saveUserKisExtraAccounts(currentUser.uid, kisExtraAccounts); // 🎯 과제 1 — 계좌 #2~4도 함께 저장
    }

    setShowKisModal(false);
    showNotification("한국투자증권 계좌가 연결되었습니다.", "success");
    
    // Trigger immediate sync after connection
    setTimeout(() => {
      if (!isAppInitialized) {
        executeFullKisInitialSync(true);
      } else {
        handleSyncKIS();
      }
    }, 600);

    setTradeLogs(prev => [{
      time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      symbol: 'SYSTEM', type: '매수', price: 0, amount: 0, reason: "한국투자증권 계좌가 연결되었습니다. 데이터 동기화를 시작합니다."
    } as any, ...prev].slice(0, 50));
  };

  const handleResetKISConfig = async () => {
    if (!window.confirm("저장된 API 키, 계좌번호, 비밀번호 등 모든 개인정보를 삭제하고 초기화하시겠습니까?")) {
      return;
    }

    const emptyConfig = {
      appKey: '',
      appSecret: '',
      accountNo: '',
      accountCode: '01',
      accountPw: '',
      isConnected: false,
      domesticOrderType: '00',
    };

    setKisConfig(emptyConfig);
    kisService.clear();

    // 🎯 과제 1 — 계좌 #1 초기화 시 계좌 #2~4(실시간 시세 전용)도 함께 비운다
    const emptyExtraAccounts: { slot: 2 | 3 | 4; appKey: string; appSecret: string }[] = [
      { slot: 2, appKey: '', appSecret: '' },
      { slot: 3, appKey: '', appSecret: '' },
      { slot: 4, appKey: '', appSecret: '' },
    ];
    setKisExtraAccounts(emptyExtraAccounts);

    if (currentUser) {
      try {
        await saveUserKISConfig(currentUser.uid, emptyConfig);
        await saveUserKisExtraAccounts(currentUser.uid, emptyExtraAccounts);
      } catch (e) {
        console.error("Firestore KIS 설정 초기화 실패:", e);
      }
    }

    setBotStatus("대기 중");
    setShowKisModal(false);

    setTradeLogs(prev => [{
      time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      symbol: 'SYSTEM', type: '매도', price: 0, amount: 0, reason: "KIS API 키 및 계좌 개인정보가 초기화되었습니다."
    } as any, ...prev].slice(0, 50));

    alert("API 키 및 개인정보가 성공적으로 초기화되었습니다.");
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-sleek-bg flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-sleek-blue/20 border-t-sleek-blue rounded-full animate-spin"></div>
          <Bot className="absolute inset-0 m-auto w-6 h-6 text-sleek-blue" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-white font-black uppercase tracking-[0.2em] animate-pulse">Initializing System...</p>
          <p className="text-[10px] text-sleek-text-secondary uppercase tracking-widest">
            {isAuthLoading ? "Authenticating security layers..." : "Fetching Real-time Exchange Data..."}
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-sleek-bg flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-sleek-card border border-sleek-blue/30 rounded-3xl p-10 w-full max-w-md shadow-2xl text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-sleek-blue via-sleek-green to-sleek-blue"></div>
          
          <div className="w-16 h-16 bg-sleek-blue/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Bot className="w-10 h-10 text-sleek-blue" />
          </div>

          <div className="flex flex-col items-center justify-center text-center">
            <h1 className="text-lg sm:text-xl font-black text-white mb-2 uppercase italic tracking-tighter">LEO 100B AI BOT</h1>
            <p className="text-sleek-text-secondary text-xs sm:text-sm mb-8 leading-relaxed">
              레오의 100억 국내주식 자동매매 프로그램에 오신 것을 환영합니다.<br/>
              서비스 이용을 위해 로그인이 필요합니다.
            </p>
            
            <div className="space-y-4 w-full">
              <button 
                onClick={handleLogin}
                className="w-full py-4 sm:py-5 rounded-2xl font-black text-base sm:text-lg transition-all flex items-center justify-center gap-3 group bg-sleek-blue text-white shadow-[0_10px_30px_-10px_rgba(30,144,255,0.5)] hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <Zap className="w-5 h-5 fill-white group-hover:animate-bounce" />
                <span>Google 계정으로 로그인</span>
              </button>

              <button 
                onClick={() => setShowKisModal(true)}
                className="w-full py-3.5 bg-white/5 border border-white/10 text-sleek-text-secondary rounded-2xl font-bold text-xs sm:text-sm hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Settings className="w-4 h-4" /> {kisConfig.isConnected ? "KIS 연동 설정 변경" : "KIS 연동 설정하기"}
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 grid grid-cols-3 gap-4 w-full">
              <div className="text-center">
                <div className="text-[10px] text-sleek-text-secondary uppercase tracking-widest mb-1">Status</div>
                <div className="text-xs font-bold text-emerald-400 font-mono">READY</div>
              </div>
              <div className="text-center border-x border-white/5">
                <div className="text-[10px] text-sleek-text-secondary uppercase tracking-widest mb-1">Market</div>
                <div className="text-xs font-bold text-emerald-400 font-mono">KRX 국내주식</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-sleek-text-secondary uppercase tracking-widest mb-1">Engine</div>
                <div className="text-xs font-bold text-white/70 font-mono">100B.PRO</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // 🚀 시작 점검 화면 (연결 설정 → 시세 → 미체결 복구 → 잔고 → 매매 규칙, 끝나면 자동으로 메인 화면 진입)
  if (!isAppInitialized) {
    return (
      <KisStartupVerification
        steps={startupSteps}
        progress={initSyncState.progress}
        currentMessage={initSyncState.currentStep}
        isReady={initSyncState.status === 'ready'}
        hasError={initSyncState.status === 'error'}
        errorMessage={initSyncState.errorMsg}
        onEnter={() => setIsAppInitialized(true)}
        onOpenConfig={() => setShowKisModal(true)}
        onRetry={() => {
          isInitialSyncRunningRef.current = false;
          setInitSyncState({
            status: 'idle',
            progress: 0,
            currentStep: '한국투자증권 재연결 중...',
            completedSteps: []
          });
          executeFullKisInitialSync(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-sleek-bg text-slate-200 flex flex-col font-sans select-none overflow-x-hidden">
      <header className="h-auto md:h-[60px] border-b border-sleek-border glass-header flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] items-center px-6 py-4 md:py-0 sticky top-0 z-50 gap-4 md:gap-2">
        {/* 프로그램 이름 — 모바일에서는 맨 위, 데스크톱에서는 헤더 정중앙(2번째 grid 컬럼)에 배치 */}
        <div className="flex items-center gap-2 order-1 md:order-2 md:justify-self-center md:col-start-2">
          <div className="w-6 h-6 bg-sleek-blue rounded-md flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-[16px] md:text-[18px] font-extrabold tracking-tighter uppercase relative whitespace-nowrap">
            <span className="text-sleek-blue">LEO</span> SCALPER BOT <span className="text-white/40 font-normal ml-2 text-xl tracking-widest">PRO</span>
          {currentUser?.email === "agnus9524@gmail.com" && (
            <span className="absolute -top-1 -right-8 bg-sleek-blue text-[white] text-[7px] px-1 rounded-sm font-black tracking-widest leading-normal">SUPER</span>
          )}
        </h1>
      </div>

        <div className="flex items-center gap-4 order-2 md:order-1 md:justify-self-start md:col-start-1">
          <div className="flex bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 items-center gap-2">
            <SouthKoreaFlag />
            <span className="text-[11px] font-black text-white">국내주식 (KRX)</span>
          </div>
          {isFetchingMarketPrices && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sleek-blue/10 border border-sleek-blue/30 rounded-xl text-[10px] font-bold text-sleek-blue animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>실시간 시세 동기화 중...</span>
            </div>
          )}
        </div>

        {/* KIS 토큰/연동설정/Admin/로그인/로그아웃 — 모바일에서는 제목 다음, 중앙 정렬로 차례대로 배치 */}
        <div className="flex items-center justify-center order-3 md:justify-self-end md:col-start-3 gap-2.5 flex-wrap">
          {/* KIS OAuth Token Validity Status Card */}
          <div 
            onClick={() => setShowKisModal(true)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer select-none",
              tokenInfo.hasToken && !tokenInfo.isExpired
                ? "bg-slate-900/90 border-emerald-500/30 text-emerald-300 hover:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                : "bg-slate-900/90 border-amber-500/40 text-amber-300 hover:border-amber-500/70"
            )}
            title="클릭하여 한국투자증권 API 키 설정 열기 | 토큰 만료시 자동 재발급"
          >
            <div className="flex items-center gap-1.5">
              <Key className={cn("w-3.5 h-3.5", tokenInfo.hasToken && !tokenInfo.isExpired ? "text-emerald-400" : "text-amber-400")} />
              <span className="text-[11px] font-bold tracking-tight text-slate-300">
                KIS 토큰:
              </span>
            </div>
            
            <div className="flex items-center gap-1.5 font-mono font-black text-[12px]">
              <span className={tokenInfo.hasToken && !tokenInfo.isExpired ? "text-emerald-400" : "text-amber-400"}>
                {tokenInfo.formattedRemaining}
              </span>
              {tokenInfo.hasToken && !tokenInfo.isExpired && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" />
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRefreshToken();
              }}
              disabled={isForceRefreshingToken}
              className="p-1 -mr-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
              title="토큰 즉시 재발급/동기화"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isForceRefreshingToken && "animate-spin text-emerald-400")} />
            </button>
          </div>

          {/* KIS 연동 설정 버튼 */}
          <button
            type="button"
            onClick={() => setShowKisModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-sleek-blue/50 text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
            title="한국투자증권(KIS) Open API 계정 및 실전투자 설정"
          >
            <Settings className="w-3.5 h-3.5 text-sleek-blue" />
            <span>KIS 연동 설정</span>
            {kisConfig.isConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          {/* Admin (슈퍼 관리자) 패널 버튼 - 항상 접근 가능 */}
          <button
            type="button"
            onClick={() => {
              handleFetchAllLicenses();
              setShowAdminPanel(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95"
            title="관리자 라이선스 및 회원 관리 패널 열기"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Admin</span>
          </button>

          {/* 사용자 닉네임 & 로그인/로그아웃 버튼 */}
          {currentUser ? (
            <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-white/10">
              <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1.5 rounded-xl border border-white/10">
                {currentUser.photoURL ? (
                  <img 
                    src={currentUser.photoURL} 
                    alt="profile" 
                    className="w-5 h-5 rounded-full object-cover border border-white/20"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-sleek-blue/30 text-sleek-blue flex items-center justify-center text-[10px] font-bold">
                    <User className="w-3 h-3" />
                  </div>
                )}
                <span className="text-xs font-bold text-slate-200 max-w-[120px] truncate" title={currentUser.displayName || currentUser.email || '사용자'}>
                  {currentUser.displayName || currentUser.email?.split('@')[0] || '사용자'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 hover:border-rose-500/40 text-xs font-bold transition-all cursor-pointer border border-slate-700"
                title="로그아웃"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-white/10">
              <div className="flex items-center gap-1.5 bg-black/30 px-2 py-1.5 rounded-xl border border-white/5 text-slate-400 text-xs">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-400">게스트</span>
              </div>
              <button
                type="button"
                onClick={handleLogin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sleek-blue hover:bg-sleek-blue/80 text-white text-xs font-black transition-all cursor-pointer shadow-md active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 fill-white" />
                <span>로그인</span>
              </button>
            </div>
          )}
        </div>
      </header>
      
      {/* Domestic Market Ribbon (KOSPI Only) */}
      <div className="h-8 bg-black/80 sticky top-[60px] md:top-[60px] z-40 border-b border-sleek-border/50 flex items-center justify-between px-6 backdrop-blur-md overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-6 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-sleek-text-secondary uppercase tracking-widest flex items-center gap-1">
              <Globe className="w-3 h-3" /> 코스피·코스닥 실시간
            </span>
            <div className="h-3 w-px bg-white/10 mx-1" />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <SouthKoreaFlag />
                <span className="text-[11px] font-mono font-bold text-white">코스피·코스닥 대형 유동성 주도주</span>
                <span className="text-[11px] font-mono font-black text-emerald-400">실시간 감시 중</span>
              </div>
            </div>
          </div>
          
          <div className="hidden sm:flex items-center gap-4 text-[10px] font-bold text-sleek-text-secondary uppercase">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 코스피·코스닥 <span className="text-white">정규장 실시간 체결</span>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 grid grid-cols-1 gap-px bg-sleek-border overflow-y-auto lg:overflow-auto">
        {/* Main Terminal (Full Width Center & Left) */}
        <section className="bg-sleek-bg overflow-y-auto custom-scrollbar p-3 sm:p-4 md:p-5 space-y-4">
        
          {/* 0. 스캘퍼 종합 일체형 통합 헤더 바 (종목명, 현재체결가, VP/CVD, 실시간메시지, 5개 제어창, 보유현황) */}
          {(() => {
            const heldQty = selectedStock ? (holdings[selectedStock.symbol] || 0) : 0;
            const isKR = selectedStock ? /^d{6}$/.test(selectedStock.symbol) : (marketType === 'KR');
            const availableCash = isKR ? (orderableKrw > 0 ? orderableKrw : balance) : (orderableUsd > 0 ? orderableUsd * exchangeRate : balance);
            const stockPrice = selectedStock?.price || 0;
            const priceInBalanceCurrency = isKR ? stockPrice : stockPrice * exchangeRate;
            const calcBuyable = (priceInBalanceCurrency > 0 && availableCash > 0)
              ? Math.floor(availableCash / priceInBalanceCurrency)
              : 0;
            const displayBuyableQty = kisBuyableQty !== null ? kisBuyableQty : calcBuyable;

            return (
              <IntegratedTradingHeader
                selectedStock={selectedStock}
                searchRef={searchRef}
                searchInputRef={searchInputRef}
                searchSymbol={searchSymbol}
                setSearchSymbol={setSearchSymbol}
                searchSuggestions={searchSuggestions}
                showSuggestions={showSuggestions}
                setShowSuggestions={setShowSuggestions}
                handleAddStock={handleAddStock}
                handleOpenScalperRecommendations={handleOpenScalperRecommendations}
                heldQty={heldQty}
                displayBuyableQty={displayBuyableQty}
                formatCurrency={formatCurrency}
                formatQuantity={formatQuantity}
                scalperStrategyMode={scalperStrategyMode}
                setScalperStrategyMode={setScalperStrategyMode}
                selectedScalperStrategies={selectedScalperStrategies}
                setSelectedScalperStrategies={setSelectedScalperStrategies}
                handleToggleStrategy={handleToggleStrategy}
                handleSelectAllGreen={handleSelectAllGreen}
                activeStrategyDetection={activeStrategyDetection}
                displayScalperMessage={displayScalperMessage}
                tradeQuantity={tradeQuantity}
                setTradeQuantity={setTradeQuantity}
                maxSlots={maxSlots}
                setMaxSlots={setMaxSlots}
                scalpingTargetProfit={scalpingTargetProfit}
                setScalpingTargetProfit={setScalpingTargetProfit}
                scalpingStopLoss={scalpingStopLoss}
                setScalpingStopLoss={setScalpingStopLoss}
                isSmartScalperMode={isSmartScalperMode}
                setIsSmartScalperMode={setIsSmartScalperMode}
                minGapBetweenSlots={minGapBetweenSlots}
                setMinGapBetweenSlots={setMinGapBetweenSlots}
                entryPriceMode={entryPriceMode}
                setEntryPriceMode={setEntryPriceMode}
                scalpingSpeed={scalpingSpeed}
                setScalpingSpeed={setScalpingSpeed}
                gapBuyPrice={gapBuyPrice}
                gapSellPrice={gapSellPrice}
                isScalperRecLoading={isScalperRecLoading}
                tradeLogs={tradeLogs}
                orderbookSignals={orderbookSignals}
                tradingSessionInfo={TRADING_SESSION_INFO[tradingSession]}
                tradingRules={tradingRulesInfo}
                realtimeSymbols={realtimeSymbols}
                realtimeCapacity={REALTIME_SLOT_CAPACITY}
                realtimeOverflowCount={realtimeOverflowCount}
                rescueView={rescueView}
                rescueWaitMs={RESCUE_WAIT_MS}
                recPriceMin={recPriceMin}
                recPriceMax={recPriceMax}
                setRecPriceRange={(min: number, max: number) => { setRecPriceMin(min); setRecPriceMax(max); }}
                recMarketFilter={recMarketFilter}
                setRecMarketFilter={setRecMarketFilter}
                buyAmountOptions={BUY_AMOUNT_OPTIONS}
                targetInvestmentPerStock={targetInvestmentPerStock}
                setTargetInvestmentPerStock={setTargetInvestmentPerStock}
                isRefreshingTop3={isRefreshingTop3}
                scalperTabs={scalperTabs}
                activeTabId={activeTabId}
                marketType={marketType}
                handleSwitchTab={handleSwitchTab}
                closeScalperTab={closeScalperTab}
                openOrSwitchScalperTab={openOrSwitchScalperTab}
                stocks={stocks}
                setStocks={setStocks}
                stocksCache={stocksCache}
                setStocksCache={setStocksCache}
                aiRecommendations={aiRecommendations}
                getResolvedStockName={getResolvedStockName}
                showNotification={showNotification}
                isGapBotActive={isGapBotActive}
                setIsGapBotActive={setIsGapBotActive}
                setLastTradeType={setLastTradeType}
                holdings={holdings}
                avgPrices={avgPrices}
                setShowScalperRecModal={setShowScalperRecModal}
                setShowGlobalTradeLogModal={setShowGlobalTradeLogModal}
                onOpenStrategySettings={() => setShowStrategySettings(true)}
                buyKindOf={(sym: string) => (Number(holdings[sym] || 0) > 0 ? (trendCarryRef.current[sym] ? (trendCarryRef.current[sym].kind === 'CLOSE' ? 'CLOSE' : 'TREND') : 'SCALP') : null)}
                onOpenChart={(symbol, name) => { if (/^\d{6}$/.test(symbol)) setChartTarget({ symbol, name }); }}
                handleRefreshScalperRecList={handleRefreshScalperRecList}
                handleSyncKIS={handleSyncKIS}
                setManualSellStock={setManualSellStock}
                setManualSellQty={setManualSellQty}
                setManualSellPrice={setManualSellPrice}
                setManualSellModalOpen={setManualSellModalOpen}
                INITIAL_STOCKS_KR={INITIAL_STOCKS_KR}
                maxInventoryPerMarket={MAX_INVENTORY_PER_MARKET}
                orderableKrw={orderableKrw}
                wsConnectionStatus={wsConnectionStatus}
                handleClearAllInventory={handleClearAllInventory}
                updateTab={updateTab}
              />
            );
          })()}

        </section>

        {false && (
        <section className="bg-sleek-bg overflow-y-auto custom-scrollbar p-3 sm:p-4 md:p-5 space-y-4">          {/* 4. Real-time Account Status Card (Single Row Dark Theme Layout) — 사용자 요청으로 비활성화(2026-09-28) */}
          <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4 relative overflow-visible text-white backdrop-blur-md">
            {/* Header: Account Tag & Time */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-white tracking-tight">{selectedAccountType}</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 font-bold text-xs hover:bg-blue-500/30 transition-all border border-blue-500/30 cursor-pointer"
                  >
                    <span>
                      {kisConfig.isConnected && kisConfig.accountNo 
                        ? `${kisConfig.accountNo.slice(0, 8)}-${kisConfig.accountNo.slice(8) || '01'}` 
                        : '계좌 미연결'}
                    </span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-blue-400 transition-transform duration-200", showAccountDropdown && "rotate-180")} />
                  </button>

                  {showAccountDropdown && (
                    <div className="absolute left-0 top-full mt-1.5 w-56 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150 text-white">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">계좌 선택</div>
                      <button
                        onClick={() => { setSelectedAccountType('위탁'); setShowAccountDropdown(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left hover:bg-blue-500/20 text-blue-400 cursor-pointer"
                      >
                        <span>위탁 {kisConfig.accountNo ? `${kisConfig.accountNo.slice(0, 8)}-01` : '계좌 미연결'}</span>
                        <span className="text-[10px] bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-300">기본</span>
                      </button>
                      <button
                        onClick={() => { setSelectedAccountType('ISA'); setShowAccountDropdown(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left hover:bg-slate-700/50 text-slate-300 cursor-pointer"
                      >
                        <span>ISA 중개형</span>
                        <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-400">연동예정</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs font-medium text-slate-400 tracking-tight">
                {accountStatusFormattedTime} 기준
              </div>
            </div>

            {/* Single Row 3-Column Grid: 주문가능원화, 총자산, 실현손익 */}
            {(() => {
              const displayOrderableKrw = kisConfig.isConnected
                ? (orderableKrw > 0 ? orderableKrw : balance)
                : (orderableKrw > 0 ? orderableKrw : (balance > 0 ? balance : 5000000));

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
                  {/* 1. 주문가능원화 */}
                  <div
                    className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/10 flex flex-col justify-center transition-all cursor-help"
                    title={
                      orderableKrwDebug
                        ? `[진단] 조회 기준 종목: ${orderableKrwDebug.queriedSymbol}\n` +
                          `ord_psbl_cash(주문가능현금): ${orderableKrwDebug.ord_psbl_cash.toLocaleString()}원\n` +
                          `nrcy_ord_psbl_amt(비대면주문가능금액): ${orderableKrwDebug.nrcy_ord_psbl_amt.toLocaleString()}원\n` +
                          `ord_psbl_amt(주문가능금액): ${orderableKrwDebug.ord_psbl_amt.toLocaleString()}원\n` +
                          `dnca_tot_amt(예수금총금액): ${orderableKrwDebug.dnca_tot_amt.toLocaleString()}원\n` +
                          `prvs_rcdl_excc_amt(가수도정산금액): ${orderableKrwDebug.prvs_rcdl_excc_amt.toLocaleString()}원\n` +
                          `dncl_amt(구필드,참고용): ${orderableKrwDebug.dncl_amt.toLocaleString()}원\n` +
                          `→ 실제 사용된 값: ${orderableKrwDebug.usedField}\n\n` +
                          `KIS 앱과 다르면, 위 필드들 중 KIS 앱 숫자와 정확히 일치하는 게 있는지 확인해서 알려주세요.`
                        : "KIS 연동 후 계좌 동기화 시 상세 필드값이 여기에 표시됩니다."
                    }
                  >
                    <div className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight font-mono truncate">
                      {Math.round(displayOrderableKrw).toLocaleString()}원
                    </div>
                    <div className="text-xs font-bold text-slate-400 mt-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        주문가능원화
                        {orderableKrwDebug && <span className="text-slate-500">🔍</span>}
                      </span>
                      {kisConfig.isConnected && (
                        <span className="text-[10px] text-emerald-400 font-mono font-bold">API 실시간</span>
                      )}
                    </div>
                  </div>

                  {/* 2. 총자산 버튼 */}
                  <button
                    type="button"
                    onClick={() => setIsAssetAnalysisModalOpen(true)}
                    className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/10 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer"
                    title="클릭 시 총자산 상세 산출 내역 팝업 보기"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-mono font-black text-lg shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                      ₩
                    </div>
                    <span className="text-xs font-bold text-slate-300 group-hover:text-emerald-400 transition-colors">
                      총자산
                    </span>
                  </button>

                  {/* 3. 실현손익 버튼 */}
                  <button
                    type="button"
                    onClick={() => setShowPnlDetailsModal(true)}
                    className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/10 hover:border-rose-500/50 flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer"
                    title="클릭 시 실현손익 및 세부리포트 보기"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform border border-rose-500/30">
                      <TrendingUp className="w-5 h-5 text-rose-400" />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-bold text-slate-300 group-hover:text-rose-400 transition-colors">
                        실현손익
                      </span>
                      <span className={cn(
                        "text-[11px] font-mono font-black mt-0.5",
                        (kisTotalRealizedPnL ?? gapTradingProfit) >= 0 ? "text-rose-400" : "text-sky-400"
                      )}>
                        {(kisTotalRealizedPnL ?? gapTradingProfit) >= 0 ? '+' : ''}
                        {formatCurrency(kisTotalRealizedPnL ?? gapTradingProfit)}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })()}
          </div>
        </section>
        )}

        </main>

      {/* (구) 하단 흐르는 시세 띠(footer marquee) 삭제 — 종목명/체결가/등락을 흘려보내던 영역.
          인벤토리 카드에 같은 정보가 이미 있고, 72종목 전체를 틱마다 다시 그리며 애니메이션까지 돌려서
          렌더링 부하만 주고 있었다. */}

      {/* Manual Target Price Sell Modal (수동 지정가 매도 모달) */}
      <AnimatePresence>
        {manualSellModalOpen && (() => {
          const targetModalStock = manualSellStock || selectedStock;
          const modalSymbol = targetModalStock?.symbol || '';
          const modalLatestStock = stocks.find(s => s.symbol === modalSymbol) || targetModalStock;
          const modalStockPrice = modalLatestStock?.price || targetModalStock?.price || 0;
          const modalAvgPrice = modalSymbol ? (avgPrices[modalSymbol] || modalStockPrice) : 0;
          const modalHeldQty = modalSymbol ? (holdings[modalSymbol] || 0) : 0;
          const isModalUS = targetModalStock ? (targetModalStock.market === 'US' || (/^[A-Za-z]/.test(modalSymbol) && !/^\d+$/.test(modalSymbol))) : marketType === 'US';
          const modalStockDisplayName = targetModalStock ? getResolvedStockName(modalSymbol, targetModalStock) : '';

          const { netProfit: expectedNetProfit, sellTax: expectedTax, buyFee, sellFee } = calculateNetProfitAmount(modalAvgPrice, manualSellPrice, manualSellQty, isModalUS ? 'US' : 'KR');
          const expectedFee = (buyFee || 0) + (sellFee || 0);
          const expectedProfitPct = modalAvgPrice > 0 ? calculateNetProfitPercent(modalAvgPrice, manualSellPrice, isModalUS ? 'US' : 'KR') : 0;

          return (
            <div className="fixed inset-0 z-[999999] flex items-start justify-center p-4 pt-6 sm:pt-10 bg-black/80 backdrop-blur-md overflow-y-auto">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -20 }}
                className="bg-sleek-card border border-sleek-border rounded-3xl p-6 md:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-6 relative custom-scrollbar"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                      <CircleDollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white flex items-center gap-2">
                        <span>수동 지정가 매도 주문</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20 font-bold">
                          지정가 매도
                        </span>
                      </h3>
                      <p className="text-xs text-sleek-text-secondary">선택한 종목에 대해 원하는 호가 단가로 안전하게 매도 주문을 실행합니다.</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      setManualSellModalOpen(false);
                      setManualSellStock(null);
                    }}
                    className="p-2 rounded-xl bg-white/5 text-sleek-text-secondary hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Selected Target Stock Info Card (Locked onto clicked stock) */}
                {targetModalStock ? (
                  <div className="bg-sleek-bg/90 border border-sleek-border rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-white">{modalStockDisplayName}</span>
                        <span className="text-xs font-mono text-slate-400 font-bold">({modalSymbol})</span>
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-sleek-blue/20 text-sleek-blue border border-sleek-blue/30 font-bold">
                          KRX
                        </span>
                      </div>
                      <span className="text-xs font-mono font-black text-sleek-blue">
                        현재가 {formatCurrency(modalStockPrice)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs text-sleek-text-secondary pt-2 border-t border-white/5 font-mono">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">매수평단</span>
                        <span className="text-amber-300 font-bold">{formatCurrency(modalAvgPrice)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">보유수량</span>
                        <span className="text-white font-bold">{modalHeldQty} 주</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-sans">현재 평가액</span>
                        <span className="text-white font-bold">{formatCurrency(modalHeldQty * modalStockPrice)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-rose-400 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                    매도할 대상 종목이 없습니다.
                  </div>
                )}

                {/* Price and Quantity Inputs */}
                <div className="space-y-4">
                  {/* Target Sell Price Input */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold text-sleek-text-secondary">
                      <span>매도 희망 단가 (원)</span>
                      {targetModalStock && manualSellPrice > 0 && modalStockPrice > 0 && (
                        <span className={cn(
                          "font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-black/40 border border-white/5",
                          manualSellPrice >= modalStockPrice ? "text-emerald-400 border-emerald-500/30" : "text-rose-400 border-rose-500/30"
                        )}>
                          현재가 대비 {(((manualSellPrice - modalStockPrice) / modalStockPrice) * 100).toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input 
                        type="number"
                        value={manualSellPrice || ''}
                        onChange={(e) => setManualSellPrice(Number(e.target.value))}
                        placeholder="희망 매도가 입력 (원)"
                        className="w-full bg-sleek-bg border border-sleek-border rounded-2xl py-3 px-4 text-sm font-mono font-bold text-white focus:border-rose-500 outline-none transition-all"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-sleek-text-secondary">KRW</span>
                    </div>

                    {/* Quick Price Adjust Buttons */}
                    {targetModalStock && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setManualSellPrice(modalStockPrice)}
                          className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold text-sleek-text-secondary hover:text-white transition-all border border-white/5 cursor-pointer"
                        >
                          현재가 ({formatCurrency(modalStockPrice)})
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualSellPrice(calculateTargetSellPrice(modalAvgPrice > 0 ? modalAvgPrice : modalStockPrice, 0.5))}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-bold transition-all border border-emerald-500/20 cursor-pointer"
                        >
                          순익 +0.5%
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualSellPrice(calculateTargetSellPrice(modalAvgPrice > 0 ? modalAvgPrice : modalStockPrice, 1.0))}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-bold transition-all border border-emerald-500/20 cursor-pointer"
                        >
                          순익 +1.0%
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualSellPrice(calculateTargetSellPrice(modalAvgPrice > 0 ? modalAvgPrice : modalStockPrice, 2.0))}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-bold transition-all border border-emerald-500/20 cursor-pointer"
                        >
                          순익 +2.0%
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualSellPrice(calculateTargetSellPrice(modalAvgPrice > 0 ? modalAvgPrice : modalStockPrice, 5.0))}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-bold transition-all border border-emerald-500/20 cursor-pointer"
                        >
                          순익 +5.0%
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Sell Quantity Input */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold text-sleek-text-secondary">
                      <span>매도 수량</span>
                      <span>최대 {modalHeldQty}주</span>
                    </div>
                    <div className="relative">
                      <input 
                        type="number"
                        value={manualSellQty || ''}
                        onChange={(e) => setManualSellQty(Number(e.target.value))}
                        placeholder="매도 수량 입력"
                        className="w-full bg-sleek-bg border border-sleek-border rounded-2xl py-3 px-4 text-sm font-mono font-bold text-white focus:border-rose-500 outline-none transition-all"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-sleek-text-secondary">주</span>
                    </div>

                    {/* Quick Quantity Buttons */}
                    {targetModalStock && (
                      <div className="flex gap-1.5 pt-1">
                        {[0.25, 0.5, 0.75, 1.0].map((ratio) => {
                          const maxQty = modalHeldQty > 0 ? modalHeldQty : 1;
                          const calculated = Math.max(1, Math.floor(maxQty * ratio));
                          return (
                            <button
                              key={ratio}
                              type="button"
                              onClick={() => setManualSellQty(calculated)}
                              className="flex-1 py-1 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold text-sleek-text-secondary hover:text-white transition-all border border-white/5 cursor-pointer"
                            >
                              {ratio * 100}% {ratio === 1.0 ? '(전량)' : ''}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Expected Revenue & Net Profit Summary */}
                  {manualSellPrice > 0 && manualSellQty > 0 && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-rose-300 font-bold">총 매도 체결 금액</span>
                        <span className="text-base font-black font-mono text-rose-400">
                          {formatCurrency(manualSellPrice * manualSellQty)}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-rose-500/20 font-mono">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">예상 세금·수수료</span>
                          <span className="text-slate-300 font-bold">
                            {formatCurrency(expectedTax + expectedFee)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-sans">예상 실질 순손익</span>
                          <span className={cn(
                            "font-black text-sm",
                            expectedNetProfit > 0 ? "text-rose-400" : expectedNetProfit < 0 ? "text-sky-400" : "text-slate-300"
                          )}>
                            {expectedNetProfit > 0 ? `+${formatCurrency(expectedNetProfit)}` : expectedNetProfit < 0 ? `-${formatCurrency(Math.abs(expectedNetProfit))}` : formatCurrency(0)}
                            <span className="text-xs ml-1 font-bold">
                              ({expectedProfitPct >= 0 ? '+' : ''}{expectedProfitPct.toFixed(2)}%)
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setManualSellModalOpen(false);
                      setManualSellStock(null);
                    }}
                    className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 font-bold text-xs text-sleek-text-secondary hover:text-white transition-all cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingManualSell || !targetModalStock || manualSellQty <= 0 || manualSellPrice <= 0}
                    onClick={handleExecuteManualSell}
                    className={cn(
                      "flex-1 py-3 rounded-2xl text-white font-black text-xs transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-95",
                      isSubmittingManualSell
                        ? "bg-rose-500/50 cursor-not-allowed opacity-80"
                        : "bg-rose-500 hover:bg-rose-600 shadow-rose-500/25"
                    )}
                  >
                    {isSubmittingManualSell ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>매도 주문 전송 중...</span>
                      </>
                    ) : (
                      <>
                        <CircleDollarSign className="w-4 h-4" />
                        <span>지정가 수동 매도 주문 전송</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Total Asset Evaluation Analysis Modal (총 자산 평가 분석 팝업) */}
      <AnimatePresence>
        {isAssetAnalysisModalOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-start justify-center p-4 pt-6 sm:pt-10 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="bg-sleek-card border border-sleek-border rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative"
            >
              {/* Modal Header */}
              <div className="p-5 md:p-6 border-b border-sleek-border flex items-center justify-between bg-sleek-bg/80">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-sleek-blue/15 border border-sleek-blue/30 rounded-2xl text-sleek-blue">
                    <PieChart className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-white flex items-center gap-2">
                      총 자산 산출 & 분석 리포트
                      <span className="text-xs font-mono font-bold px-2.5 py-0.5 bg-sleek-blue/15 text-sleek-blue rounded-full border border-sleek-blue/30">
                        {kisConfig.isConnected ? `실계좌 연동 (${kisConfig.accountNo ? `${kisConfig.accountNo.slice(0, 8)}-01` : '연동됨'})` : "미연동"}
                      </span>
                    </h3>
                    <p className="text-xs md:text-sm text-slate-300 mt-1">
                      예수금과 실시간 주식 평가금액이 반영된 세부 내역 및 분석 리포트입니다.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAssetAnalysisModalOpen(false)}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body (Scrollable) */}
              <div className="p-5 md:p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
                {/* 1. Overall Total Asset Hero Card */}
                <div className="bg-gradient-to-br from-sleek-blue/20 via-slate-900/60 to-slate-900 border border-sleek-blue/40 rounded-2xl p-5 md:p-6 space-y-4 relative overflow-hidden shadow-lg">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
                    <div>
                      <div className="text-xs md:text-sm font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-2">
                        <span>현재 총 자산 평가금액</span>
                        <Calculator className="w-4 h-4 text-sleek-blue" />
                      </div>
                      <div className="text-3xl md:text-4xl font-black text-white tracking-tight">
                        {formatCurrency(assetAnalysis.totalCalculatedAsset)}
                      </div>
                    </div>
                    
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex items-center gap-5 shrink-0">
                      <div>
                        <div className="text-xs text-slate-400 font-bold">투자 원금</div>
                        <div className="text-sm md:text-base font-mono font-extrabold text-white">{formatCurrency(assetAnalysis.principal)}</div>
                      </div>
                      <div className="h-8 w-px bg-white/10" />
                      <div>
                        <div className="text-xs text-slate-400 font-bold">원금 대비 손익</div>
                        <div className={cn(
                          "text-sm md:text-base font-mono font-extrabold flex items-center gap-1",
                          assetAnalysis.totalPnL >= 0 ? "text-rose-400" : "text-sky-400"
                        )}>
                          {assetAnalysis.totalPnL >= 0 ? <TrendingUp className="w-4 h-4 text-rose-400" /> : <TrendingDown className="w-4 h-4 text-sky-400" />}
                          <span>{assetAnalysis.totalPnL >= 0 ? '+' : ''}{formatCurrency(assetAnalysis.totalPnL)}</span>
                          <span className="text-xs font-bold">({assetAnalysis.totalPnLPercent >= 0 ? '+' : ''}{(assetAnalysis.totalPnLPercent || 0).toFixed(2)}%)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Portfolio Proportion Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs md:text-sm font-bold text-slate-300">
                      <span>자산 구성 비중</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sleek-blue inline-block" /> 현금 {(assetAnalysis.cashShare || 0).toFixed(1)}%</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> 주식 {(assetAnalysis.stockShare || 0).toFixed(1)}%</span>
                        {assetAnalysis.pendingReserve > 0 && (
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> 예약금 {(assetAnalysis.pendingShare || 0).toFixed(1)}%</span>
                        )}
                      </div>
                    </div>
                    <div className="h-3.5 w-full bg-white/5 rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-white/10">
                      {assetAnalysis.cashShare > 0 && (
                        <div style={{ width: `${assetAnalysis.cashShare}%` }} className="bg-sleek-blue rounded-full h-full transition-all" title={`현금: ${(assetAnalysis.cashShare || 0).toFixed(1)}%`} />
                      )}
                      {assetAnalysis.stockShare > 0 && (
                        <div style={{ width: `${assetAnalysis.stockShare}%` }} className="bg-emerald-400 rounded-full h-full transition-all" title={`주식 평가: ${(assetAnalysis.stockShare || 0).toFixed(1)}%`} />
                      )}
                      {assetAnalysis.pendingShare > 0 && (
                        <div style={{ width: `${assetAnalysis.pendingShare}%` }} className="bg-amber-400 rounded-full h-full transition-all" title={`예약금: ${(assetAnalysis.pendingShare || 0).toFixed(1)}%`} />
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Three Component Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {/* Card 1: Cash */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1.5">
                    <div className="text-xs text-slate-300 font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Wallet className="w-4 h-4 text-sleek-blue" /> 예수금</span>
                      <span className="text-sleek-blue font-mono font-bold text-xs">{(assetAnalysis.cashShare || 0).toFixed(1)}%</span>
                    </div>
                    <div className="text-lg md:text-xl font-black font-mono text-white">
                      {formatCurrency(assetAnalysis.cashBalance)}
                    </div>
                    <p className="text-xs text-slate-400">즉시 주문에 사용 가능한 예수금</p>
                  </div>

                  {/* Card 2: Stock Evaluation */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1.5">
                    <div className="text-xs text-slate-300 font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-emerald-400" /> 보유 주식 평가액</span>
                      <span className="text-emerald-400 font-mono font-bold text-xs">{(assetAnalysis.stockShare || 0).toFixed(1)}%</span>
                    </div>
                    <div className="text-lg md:text-xl font-black font-mono text-white">
                      {formatCurrency(assetAnalysis.stockValue)}
                    </div>
                    <p className="text-xs text-slate-400">현재 시장가 × 보유 주식 수의 합산</p>
                  </div>

                  {/* Card 3: Pending Order Reserve */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1.5">
                    <div className="text-xs text-slate-300 font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Coins className="w-4 h-4 text-amber-400" /> 미체결 매수 예약금</span>
                      <span className="text-amber-400 font-mono font-bold text-xs">{(assetAnalysis.pendingShare || 0).toFixed(1)}%</span>
                    </div>
                    <div className="text-lg md:text-xl font-black font-mono text-white">
                      {formatCurrency(assetAnalysis.pendingReserve)}
                    </div>
                    <p className="text-xs text-slate-400">가상/지정가 매수 대기 중 잠긴 예수금</p>
                  </div>
                </div>

                {/* 3. Valuation Formula Explanation Banner */}
                <div className="bg-sleek-bg p-4.5 rounded-2xl border border-sleek-border space-y-2.5">
                  <div className="text-xs md:text-sm font-bold text-white flex items-center gap-2">
                    <Info className="w-4 h-4 text-sleek-blue" />
                    <span>총 자산 평가액 산출 공식 (Calculation Logic)</span>
                  </div>
                  <div className="bg-black/50 p-3.5 rounded-xl font-mono text-xs md:text-sm text-amber-300 font-extrabold border border-white/10 overflow-x-auto">
                    총 자산 = [ 예수금 ] + [ 미체결 예약금 ] + ∑( 보유 수량 × 실시간 현재가 )
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    실시간 현재가 변화에 따라 보유 주식 평가액이 실시간 반영되며, 평단가는 내림(Math.floor) 기준 및 해외 주식의 경우 현재 환율({formatCurrency(exchangeRate, true)}/$)로 원화 변환되어 계산됩니다.
                  </p>
                </div>

                {/* 4. Individual Stock Breakdown */}
                <div className="space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
                    <div className="flex items-center gap-3">
                      <h4 className="text-xs md:text-sm font-bold text-white flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-sleek-blue" />
                        보유 종목별 세부 평가 내역
                      </h4>
                      
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] md:text-xs text-slate-300 font-mono font-bold">
                        {holdingsViewTab === 'KR' ? '국내' : '미국'} 총 매수가: {formatCurrency(assetAnalysis.stockList.filter(item => {
                          const isUS = /^[A-Za-z]/.test(item.symbol) && !/^\d+$/.test(item.symbol);
                          const isKR = !isUS;
                          return holdingsViewTab === 'KR' ? isKR : !isKR;
                        }).reduce((acc, curr) => acc + curr.investedAmount, 0))}
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const filteredList = assetAnalysis.stockList.filter(item => {
                      const isUS = /^[A-Za-z]/.test(item.symbol) && !/^\d+$/.test(item.symbol);
                      const isKR = !isUS;
                      return holdingsViewTab === 'KR' ? isKR : !isKR;
                    });

                    if (filteredList.length === 0) {
                      return (
                        <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-center text-slate-400 text-xs md:text-sm">
                          {holdingsViewTab === 'KR' ? '현재 보유 중인 국내 주식이 없습니다.' : '현재 보유 중인 미국 주식이 없습니다.'}
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2.5">
                        {filteredList.map((item) => {
                          const isSelected = selectedSymbol === item.symbol;
                          return (
                            <div 
                              key={item.symbol} 
                              onClick={() => {
                                openOrSwitchScalperTab(item.symbol);
                                const configEl = document.getElementById('ai-scalping-config-panel');
                                if (configEl) {
                                  configEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }}
                              className={cn(
                                "border rounded-2xl p-4 transition-all space-y-2.5 cursor-pointer",
                                isSelected 
                                  ? "bg-sleek-blue/15 border-sleek-blue shadow-lg ring-1 ring-sleek-blue/40" 
                                  : "bg-white/5 border-white/10 hover:border-sleek-blue/40"
                              )}
                            >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="font-extrabold text-white text-base md:text-lg">{getResolvedStockName(item.symbol, { name: item.name })}({item.symbol})</span>
                              <span className="text-xs font-mono font-bold px-2 py-0.5 bg-white/10 text-slate-200 rounded-md">
                                포트폴리오 {(item.portfolioShare || 0).toFixed(1)}%
                              </span>
                            </div>
                            <div className={cn(
                              "font-mono font-black text-xs md:text-sm px-2.5 py-1 rounded-lg border",
                              !item.hasAvgPriceData
                                ? "text-slate-400 bg-white/5 border-white/10"
                                : (item.pnlAmount || 0) >= 0 
                                ? "text-rose-400 bg-rose-500/10 border-rose-500/30" 
                                : "text-sky-400 bg-sky-500/10 border-sky-500/30"
                            )}>
                              {!item.hasAvgPriceData
                                ? '평단가 데이터 없음'
                                : `${(item.pnlAmount || 0) >= 0 ? '+' : ''}${formatCurrency(item.pnlAmount || 0)} (${(item.pnlPercent || 0) >= 0 ? '+' : ''}${(item.pnlPercent || 0).toFixed(2)}%)`
                              }
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs pt-2.5 border-t border-white/10 text-slate-300 font-mono">
                            <div>
                              <span>매수평단: </span>
                              <strong className="text-amber-300 font-bold">{formatCurrency(item.avgPrice)}</strong>
                            </div>
                            <div>
                              <span>실시간현재가: </span>
                              <strong className="text-white font-bold">{formatCurrency(item.currentPrice)}</strong>
                            </div>
                            <div>
                              <span>현재평가금: </span>
                              <strong className="text-sleek-blue font-black">{formatCurrency(item.evaluatedAmount)}</strong>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )})()}
                </div>

                {/* 5. Summary / Insight Box */}
                <div className="bg-sleek-blue/10 border border-sleek-blue/20 rounded-2xl p-4 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-sleek-blue shrink-0 mt-0.5" />
                  <div className="text-xs md:text-sm space-y-1">
                    <div className="font-bold text-white">포트폴리오 평가 총평</div>
                    <p className="text-slate-300 text-xs md:text-sm leading-relaxed">
                      {(assetAnalysis.cashShare || 0) > 70 
                        ? `예수금 비중이 ${(assetAnalysis.cashShare || 0).toFixed(1)}%로 안정적인 현금 유동성을 확보하고 있어, 추가 매수 타점 포착 시 즉각적인 대응이 가능합니다.`
                        : (assetAnalysis.stockShare || 0) > 70
                        ? `주식 보유 비중이 ${(assetAnalysis.stockShare || 0).toFixed(1)}%로 주가 상승 시 높은 수익률을 기대할 수 있으나, 시장 변동성에 유의할 필요가 있습니다.`
                        : `현금(${(assetAnalysis.cashShare || 0).toFixed(1)}%)과 주식(${(assetAnalysis.stockShare || 0).toFixed(1)}%)의 균형 잡힌 포트폴리오로 안정적인 리스크 관리가 이루어지고 있습니다.`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 md:p-5 border-t border-sleek-border bg-sleek-bg/80 flex justify-end">
                <button
                  onClick={() => setIsAssetAnalysisModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-sleek-blue hover:bg-sleek-blue/90 text-white font-bold text-xs md:text-sm transition-all shadow-lg shadow-sleek-blue/20"
                >
                  확인 (닫기)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Realized PnL Details Modal (한국투자증권 실현손익 세부내역 팝업: 종목별 / 일별 / 월별 / 연도별) */}
      <AnimatePresence>
        {showPnlDetailsModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-start justify-center p-2.5 sm:p-4 md:p-6 pt-6 sm:pt-10 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -20 }}
              className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-4xl w-full p-4 sm:p-6 space-y-4 shadow-2xl relative text-white max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3.5 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500/20 to-red-600/20 text-rose-400 flex items-center justify-center border border-rose-500/30 shadow-inner">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black tracking-tight text-white">실현손익 현황</h3>
                      <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {kisConfig.accountNo || (kisConfig.cano ? `${kisConfig.cano}-01` : '44431721-01')} (위탁)
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {kisConfig.isConnected ? "KIS 실계좌 연동 (TTTC8715R/TTTC8494R)" : "MTS 실시간 동기화"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      TR ID: <span className="text-blue-400 font-mono font-bold">TTTC8715R</span>(주식일별매매손익: rlzt_pfls_amt, rlzt_erng_rt) & <span className="text-emerald-400 font-mono font-bold">TTTC8494R</span>(주식기간별실현손익)
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadRealizedPnL()}
                    disabled={pnlLoading}
                    title="새로고침"
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-4 h-4", pnlLoading && "animate-spin text-blue-400")} />
                  </button>
                  <button
                    onClick={() => setShowPnlDetailsModal(false)}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer text-sm"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-2 shrink-0">
                <div className="flex items-center gap-1.5"></div>
                <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-[11px]">
                  <button
                    onClick={() => setPnlViewMode('card')}
                    className={cn(
                      "px-2.5 py-0.5 rounded-lg font-bold transition-all cursor-pointer",
                      pnlViewMode === 'card' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    MTS 카드 뷰
                  </button>
                  <button
                    onClick={() => setPnlViewMode('table')}
                    className={cn(
                      "px-2.5 py-0.5 rounded-lg font-bold transition-all cursor-pointer",
                      pnlViewMode === 'table' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    상세 테이블
                  </button>
                </div>
              </div>

              {/* 4 Main Category Tabs: 종목별 | 일별 | 월별 | 연도별 */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                <div className="flex items-center bg-slate-800/80 p-1 rounded-2xl border border-slate-700/60">
                  <button
                    onClick={() => setPnlActiveTab('stock')}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                      pnlActiveTab === 'stock'
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <span>📊 종목별</span>
                    <span className="text-[10px] opacity-75 font-mono">({pnlDataStock.length})</span>
                  </button>
                  <button
                    onClick={() => setPnlActiveTab('daily')}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                      pnlActiveTab === 'daily'
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <span>📅 일별</span>
                    <span className="text-[10px] opacity-75 font-mono">({pnlDataDaily.length})</span>
                  </button>
                  <button
                    onClick={() => setPnlActiveTab('monthly')}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                      pnlActiveTab === 'monthly'
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <span>📈 월별</span>
                    <span className="text-[10px] opacity-75 font-mono">({pnlDataMonthly.length})</span>
                  </button>
                  <button
                    onClick={() => setPnlActiveTab('yearly')}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                      pnlActiveTab === 'yearly'
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <span>🗓️ 연도별</span>
                    <span className="text-[10px] opacity-75 font-mono">({pnlDataYearly.length})</span>
                  </button>
                </div>

                {/* Period Range & Search Filter */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-[11px] font-bold">
                    {(['1m', '3m', '6m', '1y', 'all'] as const).map(range => (
                      <button
                        key={range}
                        onClick={() => setPnlPeriodRange(range)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg transition-all cursor-pointer uppercase",
                          pnlPeriodRange === range ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200"
                        )}
                      >
                        {range === '1m' ? '1개월' : range === '3m' ? '3개월' : range === '6m' ? '6개월' : range === '1y' ? '1년' : '전체'}
                      </button>
                    ))}
                  </div>

                  {pnlActiveTab === 'stock' && (
                    <input
                      type="text"
                      placeholder="종목명/코드 검색..."
                      value={pnlFilterQuery}
                      onChange={(e) => setPnlFilterQuery(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-32 sm:w-40 font-mono"
                    />
                  )}
                </div>
              </div>

              {/* MTS Top Summary Card & Mini Bar Chart (Exact replica of mobile app) */}
              {(() => {
                const currentData = pnlActiveTab === 'stock' ? pnlDataStock : pnlActiveTab === 'daily' ? pnlDataDaily : pnlActiveTab === 'monthly' ? pnlDataMonthly : pnlDataYearly;
                const totalPnl = currentData.reduce((acc, curr) => acc + (curr.rlzt_pnl || 0), 0);
                const totalSell = currentData.reduce((acc, curr) => acc + (curr.sll_amt || 0), 0);
                const totalBuy = currentData.reduce((acc, curr) => acc + (curr.pchs_amt || 0), 0);
                const avgErng = totalBuy > 0 ? (totalPnl / totalBuy) * 100 : 0;

                // Generate 31-day bar visualization for August 2026 / active month
                const dailyPnlMap: Record<number, number> = {};
                pnlDataDaily.forEach(item => {
                  const raw = (item.stck_bsop_date || '').replace(/[^0-9]/g, '');
                  if (raw.length >= 8) {
                    const dayNum = parseInt(raw.slice(6, 8), 10);
                    dailyPnlMap[dayNum] = item.rlzt_pnl || 0;
                  }
                });

                return (
                  <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/90 border border-slate-700/70 p-4 rounded-2xl shrink-0 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-bold text-slate-300">실현손익 &gt;</span>
                        <span className="text-xs text-slate-400 font-medium">(26년 8월 기준)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">매수 {formatCurrency(totalBuy)} / 매도 {formatCurrency(totalSell)}</span>
                    </div>

                    <div className="flex items-baseline gap-2.5">
                      <span className={cn("text-2xl sm:text-3xl font-black font-mono tracking-tight", totalPnl >= 0 ? "text-rose-400" : "text-sky-400")}>
                        {totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString()}원
                      </span>
                      <span className={cn("text-sm sm:text-base font-bold font-mono", avgErng >= 0 ? "text-rose-400" : "text-sky-400")}>
                        {avgErng >= 0 ? '+' : ''}{avgErng.toFixed(2)}%
                      </span>
                    </div>

                    {/* Mini Daily Bar Chart (Days 01 ~ 31) */}
                    <div className="pt-2 border-t border-slate-700/50">
                      <div className="h-16 flex items-end justify-between gap-[2px] sm:gap-1 px-1">
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
                          const dayPnl = dailyPnlMap[day] || 0;
                          const hasData = day in dailyPnlMap;
                          const maxPnl = 6000;
                          const heightPct = hasData ? Math.min(100, Math.max(18, Math.round((Math.abs(dayPnl) / maxPnl) * 100))) : 4;
                          const isPos = dayPnl >= 0;

                          return (
                            <div key={day} className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer">
                              {/* Hover Tooltip */}
                              {hasData && (
                                <div className="absolute -top-7 z-20 hidden group-hover:flex px-2 py-0.5 rounded bg-slate-950 text-[10px] text-white whitespace-nowrap border border-slate-700 font-mono shadow-lg">
                                  8.{day}: {dayPnl >= 0 ? '+' : ''}{dayPnl.toLocaleString()}원
                                </div>
                              )}
                              <div
                                style={{ height: `${heightPct}%` }}
                                className={cn(
                                  "w-full rounded-t-sm transition-all duration-300",
                                  !hasData
                                    ? "bg-slate-700/40"
                                    : isPos
                                      ? "bg-rose-500 group-hover:bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                      : "bg-sky-500 group-hover:bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.5)]"
                                )}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-500 font-mono pt-1 px-1">
                        <span>01</span>
                        <span>05</span>
                        <span>10</span>
                        <span>14(최근)</span>
                        <span>20</span>
                        <span>25</span>
                        <span>31</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Data View Area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-800 rounded-2xl bg-slate-950/50 min-h-[220px]">
                {pnlLoading ? (
                  <div className="flex flex-col items-center justify-center p-12 space-y-3">
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-xs text-slate-400 font-bold">KIS 실현손익 데이터(TTTC8715R/TTTC8494R) 불러오는 중...</p>
                  </div>
                ) : pnlActiveTab === 'daily' ? (
                  /* 1. 일별 탭 (Daily) */
                  pnlViewMode === 'card' ? (
                    /* MTS Card List View (Matching user's mobile app layout) */
                    <div className="p-3 space-y-2">
                      {pnlDataDaily.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          <p className="font-bold text-sm text-slate-300">조회된 일별 실현손익 내역이 없습니다.</p>
                        </div>
                      ) : (
                        pnlDataDaily.map((item, idx) => (
                          <div 
                            key={idx} 
                            className="bg-slate-900/90 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between transition-all"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-slate-100">
                                  {formatPnlDateWithDay(item.stck_bsop_date)}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-bold font-mono">
                                  {item.trad_cnt || 1}건 체결
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono space-x-2">
                                <span>매도: <span className="text-slate-300 font-medium">{formatCurrency(item.sll_amt)}</span></span>
                                <span>/</span>
                                <span>매수: <span className="text-slate-300 font-medium">{formatCurrency(item.pchs_amt)}</span></span>
                              </div>
                            </div>

                            <div className="text-right space-y-0.5">
                              <div className={cn("text-base font-black font-mono", item.rlzt_pnl >= 0 ? "text-rose-400" : "text-sky-400")}>
                                {item.rlzt_pnl >= 0 ? '+' : ''}{item.rlzt_pnl.toLocaleString()}원
                              </div>
                              <div className={cn("text-xs font-bold font-mono", item.erng_rt >= 0 ? "text-rose-400" : "text-sky-400")}>
                                {item.erng_rt >= 0 ? '+' : ''}{item.erng_rt.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    /* Detailed Table View */
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-800/90 text-slate-400 border-b border-slate-700/80 sticky top-0 z-10 text-[11px] font-bold">
                          <th className="p-3">거래일자<br/><span className="text-[9px] text-blue-400/80 font-mono font-normal">stck_bsop_date</span></th>
                          <th className="p-3 text-center">체결건수<br/><span className="text-[9px] text-slate-500 font-mono font-normal">trad_cnt</span></th>
                          <th className="p-3 text-right">매수금액<br/><span className="text-[9px] text-slate-500 font-mono font-normal">pchs_amt</span></th>
                          <th className="p-3 text-right">매도금액<br/><span className="text-[9px] text-slate-500 font-mono font-normal">sll_amt</span></th>
                          <th className="p-3 text-right">일별 실현손익<br/><span className="text-[9px] text-rose-400/80 font-mono font-normal">rlzt_pfls_amt</span></th>
                          <th className="p-3 text-right">일별 수익률<br/><span className="text-[9px] text-slate-500 font-mono font-normal">rlzt_erng_rt</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {pnlDataDaily.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-bold text-slate-200">{formatPnlDateWithDay(item.stck_bsop_date)}</td>
                            <td className="p-3 text-center text-slate-300 font-bold">{item.trad_cnt}건</td>
                            <td className="p-3 text-right text-slate-300">{formatCurrency(item.pchs_amt)}</td>
                            <td className="p-3 text-right text-slate-300">{formatCurrency(item.sll_amt)}</td>
                            <td className={cn("p-3 text-right font-black text-sm", item.rlzt_pnl >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.rlzt_pnl >= 0 ? '+' : ''}{item.rlzt_pnl.toLocaleString()}원
                            </td>
                            <td className={cn("p-3 text-right font-bold", item.erng_rt >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.erng_rt >= 0 ? '+' : ''}{item.erng_rt.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : pnlActiveTab === 'monthly' ? (
                  /* 2. 월별 탭 (Monthly) */
                  pnlViewMode === 'card' ? (
                    <div className="p-3 space-y-2">
                      {pnlDataMonthly.map((item, idx) => (
                        <div key={idx} className="bg-slate-900/90 hover:bg-slate-800/80 border border-slate-800/80 rounded-2xl p-3.5 flex items-center justify-between transition-all">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-100">{item.stck_bsop_month}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-bold font-mono">
                                총 {item.trad_cnt || 1}건
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono space-x-2">
                              <span>매도: <span className="text-slate-300 font-medium">{formatCurrency(item.sll_amt)}</span></span>
                              <span>/</span>
                              <span>매수: <span className="text-slate-300 font-medium">{formatCurrency(item.pchs_amt)}</span></span>
                            </div>
                          </div>
                          <div className="text-right space-y-0.5">
                            <div className={cn("text-base font-black font-mono", item.rlzt_pnl >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.rlzt_pnl >= 0 ? '+' : ''}{item.rlzt_pnl.toLocaleString()}원
                            </div>
                            <div className={cn("text-xs font-bold font-mono", item.erng_rt >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.erng_rt >= 0 ? '+' : ''}{item.erng_rt.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-800/90 text-slate-400 border-b border-slate-700/80 sticky top-0 z-10 text-[11px] font-bold">
                          <th className="p-3">조회월<br/><span className="text-[9px] text-blue-400/80 font-mono font-normal">stck_bsop_month</span></th>
                          <th className="p-3 text-center">월간 거래건수<br/><span className="text-[9px] text-slate-500 font-mono font-normal">trad_cnt</span></th>
                          <th className="p-3 text-right">월간 매수금액<br/><span className="text-[9px] text-slate-500 font-mono font-normal">pchs_amt</span></th>
                          <th className="p-3 text-right">월간 매도금액<br/><span className="text-[9px] text-slate-500 font-mono font-normal">sll_amt</span></th>
                          <th className="p-3 text-right">월간 실현손익<br/><span className="text-[9px] text-rose-400/80 font-mono font-normal">rlzt_pnl</span></th>
                          <th className="p-3 text-right">월간 수익률<br/><span className="text-[9px] text-slate-500 font-mono font-normal">erng_rt</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {pnlDataMonthly.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-bold text-white text-sm">{item.stck_bsop_month}</td>
                            <td className="p-3 text-center text-slate-300 font-bold">{item.trad_cnt}건</td>
                            <td className="p-3 text-right text-slate-300">{formatCurrency(item.pchs_amt)}</td>
                            <td className="p-3 text-right text-slate-300">{formatCurrency(item.sll_amt)}</td>
                            <td className={cn("p-3 text-right font-black text-sm", item.rlzt_pnl >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.rlzt_pnl >= 0 ? '+' : ''}{item.rlzt_pnl.toLocaleString()}원
                            </td>
                            <td className={cn("p-3 text-right font-bold", item.erng_rt >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.erng_rt >= 0 ? '+' : ''}{item.erng_rt.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : pnlActiveTab === 'yearly' ? (
                  /* 3. 연도별 탭 (Yearly) */
                  pnlViewMode === 'card' ? (
                    <div className="p-3 space-y-2">
                      {pnlDataYearly.map((item, idx) => (
                        <div key={idx} className="bg-slate-900/90 hover:bg-slate-800/80 border border-slate-800/80 rounded-2xl p-3.5 flex items-center justify-between transition-all">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-100">{item.stck_bsop_year}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-bold font-mono">
                                총 {item.trad_cnt || 1}건
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono space-x-2">
                              <span>매도: <span className="text-slate-300 font-medium">{formatCurrency(item.sll_amt)}</span></span>
                              <span>/</span>
                              <span>매수: <span className="text-slate-300 font-medium">{formatCurrency(item.pchs_amt)}</span></span>
                            </div>
                          </div>
                          <div className="text-right space-y-0.5">
                            <div className={cn("text-base font-black font-mono", item.rlzt_pnl >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.rlzt_pnl >= 0 ? '+' : ''}{item.rlzt_pnl.toLocaleString()}원
                            </div>
                            <div className={cn("text-xs font-bold font-mono", item.erng_rt >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.erng_rt >= 0 ? '+' : ''}{item.erng_rt.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-800/90 text-slate-400 border-b border-slate-700/80 sticky top-0 z-10 text-[11px] font-bold">
                          <th className="p-3">연도<br/><span className="text-[9px] text-blue-400/80 font-mono font-normal">stck_bsop_year</span></th>
                          <th className="p-3 text-center">연간 거래건수<br/><span className="text-[9px] text-slate-500 font-mono font-normal">trad_cnt</span></th>
                          <th className="p-3 text-right">연간 매수금액<br/><span className="text-[9px] text-slate-500 font-mono font-normal">pchs_amt</span></th>
                          <th className="p-3 text-right">연간 매도금액<br/><span className="text-[9px] text-slate-500 font-mono font-normal">sll_amt</span></th>
                          <th className="p-3 text-right">연간 실현손익<br/><span className="text-[9px] text-rose-400/80 font-mono font-normal">rlzt_pnl</span></th>
                          <th className="p-3 text-right">연간 수익률<br/><span className="text-[9px] text-slate-500 font-mono font-normal">erng_rt</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {pnlDataYearly.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-bold text-white text-sm">{item.stck_bsop_year}</td>
                            <td className="p-3 text-center text-slate-300 font-bold">{item.trad_cnt}건</td>
                            <td className="p-3 text-right text-slate-300">{formatCurrency(item.pchs_amt)}</td>
                            <td className="p-3 text-right text-slate-300">{formatCurrency(item.sll_amt)}</td>
                            <td className={cn("p-3 text-right font-black text-sm", item.rlzt_pnl >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.rlzt_pnl >= 0 ? '+' : ''}{item.rlzt_pnl.toLocaleString()}원
                            </td>
                            <td className={cn("p-3 text-right font-bold", item.erng_rt >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.erng_rt >= 0 ? '+' : ''}{item.erng_rt.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : (
                  /* 4. 종목별 탭 (By Stock) */
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-800/90 text-slate-400 border-b border-slate-700/80 sticky top-0 z-10 text-[11px] font-bold">
                        <th className="p-3">종목명 / 종목코드<br/><span className="text-[9px] text-blue-400/80 font-mono font-normal">prdt_name / pdno</span></th>
                        <th className="p-3 text-right">매도수량<br/><span className="text-[9px] text-slate-500 font-mono font-normal">sll_qty</span></th>
                        <th className="p-3 text-right">매수금액<br/><span className="text-[9px] text-slate-500 font-mono font-normal">pchs_amt</span></th>
                        <th className="p-3 text-right">매도금액<br/><span className="text-[9px] text-slate-500 font-mono font-normal">sll_amt</span></th>
                        <th className="p-3 text-right">실현손익<br/><span className="text-[9px] text-rose-400/80 font-mono font-normal">rlzt_pnl</span></th>
                        <th className="p-3 text-right">수익률<br/><span className="text-[9px] text-slate-500 font-mono font-normal">erng_rt</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {pnlDataStock
                        .filter(item => {
                          if (!pnlFilterQuery) return true;
                          const q = pnlFilterQuery.toLowerCase();
                          const name = String(item?.prdt_name || item?.hts_kor_isnm || '').toLowerCase();
                          const code = String(item?.pdno || item?.stck_shrn_iscd || '').toLowerCase();
                          return name.includes(q) || code.includes(q);
                        })
                        .map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-sans">
                              <div className="font-bold text-white text-xs">{item.prdt_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{item.pdno}</div>
                            </td>
                            <td className="p-3 text-right text-slate-300 font-bold">{item.sll_qty}주</td>
                            <td className="p-3 text-right text-slate-300">{formatCurrency(item.pchs_amt)}</td>
                            <td className="p-3 text-right text-slate-300">{formatCurrency(item.sll_amt)}</td>
                            <td className={cn("p-3 text-right font-black text-sm", item.rlzt_pnl >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.rlzt_pnl >= 0 ? '+' : ''}{item.rlzt_pnl.toLocaleString()}원
                            </td>
                            <td className={cn("p-3 text-right font-bold", item.erng_rt >= 0 ? "text-rose-400" : "text-sky-400")}>
                              {item.erng_rt >= 0 ? '+' : ''}{item.erng_rt.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-1 shrink-0">
                <span className="text-[11px] text-slate-500 font-medium">
                  ※ KIS Open API TR: <span className="text-blue-400 font-mono font-bold">TTTC8715R</span>(주식일별매매손익: 일별/월별 집계) & <span className="text-emerald-400 font-mono font-bold">TTTC8494R</span>(주식기간별실현손익: 종목별 집계)
                </span>
                <button
                  onClick={() => setShowPnlDetailsModal(false)}
                  className="px-6 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 🤖 AI 실시간 추천 종목 팝업 모달 */}
      <AnimatePresence>
        {showAiRecPopup && aiRecPopupData && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999999] flex items-start justify-center p-3 sm:p-4 pt-6 sm:pt-10 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -20 }}
              className="bg-slate-900/95 border border-purple-500/40 rounded-2xl max-w-lg w-full p-4 sm:p-5 space-y-4 shadow-[0_0_50px_rgba(168,85,247,0.25)] relative text-white max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-600/20 text-purple-400 flex items-center justify-center border border-purple-500/30 shadow-inner">
                    <Sparkles className="w-5 h-5 animate-spin-slow" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black tracking-tight text-white">AI 실시간 수급 포착 추천 종목</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                        🔥 승률 {aiRecPopupData.confidence}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">실시간 수급 알고리즘 & 딥러닝 분석 최고 매수 우수주</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowAiRecPopup(false)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Content Body */}
              <div className="space-y-3 overflow-y-auto pr-1 flex-1 custom-scrollbar text-xs">
                {/* Stock Info Box */}
                <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-base text-white">{aiRecPopupData.name}</span>
                      <span className="text-xs font-mono text-slate-400">({aiRecPopupData.symbol})</span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1 font-mono">
                      현재가: <strong className="text-white">{formatCurrency(aiRecPopupData.price)}</strong>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <span className={cn(
                      "text-sm font-black px-2.5 py-1 rounded-lg border inline-block",
                      aiRecPopupData.changePercent >= 0 
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30" 
                        : "bg-sky-500/10 text-sky-400 border-sky-500/30"
                    )}>
                      {aiRecPopupData.changePercent >= 0 ? '+' : ''}{aiRecPopupData.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* AI Targets Grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-center font-mono">
                    <div className="text-[10px] text-emerald-400 font-bold">목표가 (Target)</div>
                    <div className="text-sm font-black text-emerald-300 mt-0.5">{formatCurrency(aiRecPopupData.targetPrice)}</div>
                    <div className="text-[10px] text-emerald-400/80 mt-0.5">+{aiRecPopupData.expectedReturn}%</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-center font-mono">
                    <div className="text-[10px] text-rose-400 font-bold">손절가 (Stop)</div>
                    <div className="text-sm font-black text-rose-300 mt-0.5">{formatCurrency(aiRecPopupData.stopLoss)}</div>
                    <div className="text-[10px] text-rose-400/80 mt-0.5">-2.0%</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-center font-mono">
                    <div className="text-[10px] text-purple-400 font-bold">기대 수익률</div>
                    <div className="text-sm font-black text-purple-300 mt-0.5">+{aiRecPopupData.expectedReturn}%</div>
                    <div className="text-[10px] text-purple-400/80 mt-0.5">AI 포착</div>
                  </div>
                </div>

                {/* Reasoning Box */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <BrainCircuit className="w-3.5 h-3.5 text-purple-400" /> AI 핵심 추천 근거
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {aiRecPopupData.reason}
                  </p>
                  
                  {Array.isArray(aiRecPopupData.technicalTags) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {aiRecPopupData.technicalTags.map((tag: string, idx: number) => (
                        <span key={idx} className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 shrink-0">
                <button
                  onClick={() => {
                    if (aiRecPopupData.stock) {
                      handleAddStock(undefined, aiRecPopupData.stock);
                      setShowAiRecPopup(false);
                      setScalperMessage(`[AI 추천 추가] ${aiRecPopupData.name} 종목이 분석 및 스캘핑 리스트에 추가되었습니다.`);
                    }
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>⚡ 분석 리스트에 추가</span>
                </button>

                <button
                  onClick={async () => {
                    if (aiRecPopupData.stock) {
                      const currentP = aiRecPopupData.price || aiRecPopupData.stock.price || 10000;
                      const buyQty = Math.max(1, Math.floor(1000000 / currentP));
                      handleAddStock(undefined, aiRecPopupData.stock);
                      await executeTrade('BUY', aiRecPopupData.stock, buyQty, `AI 실시간 팝업 추천 즉시 매수 (${aiRecPopupData.confidence}% 승률)`, currentP);
                      setShowAiRecPopup(false);
                    }
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                >
                  <Zap className="w-3.5 h-3.5 fill-white" />
                  <span>🎯 AI 스캘핑 매수 실행</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      <AnimatePresence>
        {showScalperGuide && (
          <div className="fixed inset-0 z-[999999] bg-black/80 flex items-start justify-center p-4 md:p-6 pt-6 sm:pt-10 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowScalperGuide(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-sleek-bg border border-sleek-border rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-sleek-border flex items-center justify-between bg-sleek-bg/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-sleek-blue/20 rounded-2xl flex items-center justify-center">
                    <Zap className="w-6 h-6 text-sleek-blue" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">스캘퍼(Scalper) 실전 매매 가이드</h2>
                    <p className="text-xs text-sleek-text-secondary font-bold uppercase tracking-widest mt-1">Trading Strategy & Core Principles</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowScalperGuide(false)}
                  className="p-3 hover:bg-white/5 rounded-2xl transition-colors text-slate-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
                <ScalperGuide onClose={() => setShowScalperGuide(false)} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 🔥 KIS & AI 실시간 초단타 스캘핑 최적 추천종목 TOP 8 모달 */}
      <ScalperRecommendationsModal
        isOpen={showScalperRecModal}
        onClose={() => setShowScalperRecModal(false)}
        recommendations={scalperRecommendations}
        isLoading={isScalperRecLoading}
        onRefresh={handleRefreshScalperRecList}
        onSelectStock={handleSelectRecommendationStock}
        onQuickBuy={handleQuickBuyRecommendation}
        onBatchRegisterTop3={handleBatchRegisterTop3}
        registeredSymbols={scalperTabs.map(t => t.symbol)}
        currentStocks={stocks}
      />

      {/* 📜 전체 매매 로그(GLOBAL TRADE LOGS) 모달 — 왜 매수/매도가 안 되는지, 어떤 사유로 차단됐는지
          선택된 종목과 무관하게 전부 확인할 수 있다 */}
      <GlobalTradeLogModal
        isOpen={showGlobalTradeLogModal}
        onClose={() => setShowGlobalTradeLogModal(false)}
        logs={tradeLogs}
      />

      {/* 📊 일봉 차트 — 종목 카드 더블클릭. 일반 조회 1번(그날 한 번만), 실시간 시세 등록과 무관 */}
      <DailyChartModal
        target={chartTarget}
        onClose={() => setChartTarget(null)}
        livePrice={chartTarget ? Number(stocks.find(x => x.symbol === chartTarget.symbol)?.price || 0) : 0}
      />

      {/* ⚙️ 매매 기준 설정 — 기준값을 화면에서 직접 바꾼다(바꾼 내용은 전체 로그에 [기준 변경]으로 남긴다) */}
      <StrategySettingsModal
        isOpen={showStrategySettings}
        onClose={() => setShowStrategySettings(false)}
        onChanged={lines => { lines.forEach(line => addLog('SYSTEM', '매수', 0, 0, `[기준 변경] ${line}`)); }}
      />

      {/* 🛡️ 슈퍼 관리자 라이선스 및 인증키 발급 모달 */}
      <AdminPanelModal
        isOpen={showAdminPanel}
        onClose={() => setShowAdminPanel(false)}
        allLicenses={allLicenses}
        allAuthKeys={allAuthKeys}
        isLoading={isAdminLoading}
        onRefresh={handleFetchAllLicenses}
        onGenerateKey={handleGenerateKey}
        onUpdateStatus={handleUpdateUserStatus}
        onExtendLicense={handleExtendLicense}
        onDeleteLicense={handleDeleteUserLicense}
        onDeleteAuthKey={handleDeleteAuthKey}
        onExportCSV={handleExportCSV}
        adminTab={adminTab}
        setAdminTab={setAdminTab}
      />

      {/* 🔑 KIS 증권사 연동 및 API 키 설정 모달 */}
      <KisConfigModal
        isOpen={showKisModal}
        onClose={() => setShowKisModal(false)}
        kisConfig={kisConfig}
        setKisConfig={setKisConfig}
        extraAccounts={kisExtraAccounts}
        setExtraAccounts={setKisExtraAccounts}
        onTestConnection={handleTestConnection}
        onConnect={handleConnectKIS}
        onReset={handleResetKISConfig}
        botStatus={botStatus}
      />
    </div>
  );
}
