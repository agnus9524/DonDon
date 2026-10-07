import React, { useEffect, useMemo, useState } from 'react';
import { X, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { getBaseParams, getLiveParams, getUserOverrides, setUserOverrides, type StrategyParameters } from '../services/selfOptimizationEngine';

// ⚙️ (2026-10-07) 매매 기준 설정 — 코드에 박혀 있던 기준값을 화면에서 직접 바꾼다.
//   저장하면 새로고침 없이 바로 적용되고, 값은 이 브라우저에 저장된다.
//   '기본값'은 전략 버전(자기최적화 [적용] 값) + 코드 기본값이다. 기본값과 같은 값은 저장하지 않으므로, 나중에 기본값이 바뀌면 따라간다.

type Key = keyof StrategyParameters;
type Field =
  | { key: Key; label: string; kind: 'bool'; hint?: string }
  | { key: Key; label: string; kind: 'num'; unit?: string; scale?: number; step?: number; min?: number; max?: number; hint?: string };

const EOK = 100_000_000;
const GROUPS: { title: string; note?: string; fields: Field[] }[] = [
  {
    title: '매수 차단',
    note: '하나라도 걸리면 점수와 무관하게 매수하지 않습니다.',
    fields: [
      { key: 'minExecStrengthLarge', label: '체결강도 최소 · 대형', kind: 'num', step: 5, min: 0, max: 500 },
      { key: 'minExecStrengthMid', label: '체결강도 최소 · 중형', kind: 'num', step: 5, min: 0, max: 500 },
      { key: 'minExecutionStrength', label: '체결강도 최소 · 소형', kind: 'num', step: 5, min: 0, max: 500 },
      { key: 'bMinExecutionStrength', label: 'B급 체결강도(소형 기준)', kind: 'num', step: 5, min: 0, max: 500, hint: '소형 기준보다 높은 만큼 모든 구분의 B급에 더해집니다.' },
      { key: 'minTicks60sLarge', label: '60초 체결 최소 · 대형', kind: 'num', unit: '건', min: 0, max: 500 },
      { key: 'minTicks60sMid', label: '60초 체결 최소 · 중형', kind: 'num', unit: '건', min: 0, max: 500 },
      { key: 'minTicks60s', label: '60초 체결 최소 · 소형', kind: 'num', unit: '건', min: 0, max: 500 },
      { key: 'minTradeValue5m', label: '5분 거래대금 최소', kind: 'num', unit: '억', scale: EOK, step: 0.1, min: 0, max: 1000 },
      { key: 'maxSpreadTicks', label: '스프레드 최대', kind: 'num', unit: '틱', min: 1, max: 20 },
      { key: 'minBullScore', label: 'Bull 최소', kind: 'num', unit: '점', min: 0, max: 100 },
      { key: 'maxBearScoreForEntry', label: 'Bear 최대', kind: 'num', unit: '점', min: 0, max: 100 },
      { key: 'bearHoldSec', label: 'Bear 차단 후 대기', kind: 'num', unit: '초', min: 0, max: 300, hint: 'Bear 초과로 차단된 뒤 이 시간 동안은 매수하지 않습니다. 0이면 끔.' },
      { key: 'blockD', label: 'D(매수호가우세) 차단', kind: 'bool' },
      { key: 'requireAboveVwap', label: 'VWAP 아래 차단', kind: 'bool' },
      { key: 'blockPriorHighBreakout', label: '전고점 돌파 직후 차단', kind: 'bool' },
    ],
  },
  {
    title: '점수 · 주문',
    fields: [
      { key: 'aScoreThreshold', label: 'A급(눌림목 있음) 기준 점수', kind: 'num', unit: '점', min: 0, max: 100 },
      { key: 'bScoreThreshold', label: 'B급(눌림목 없음) 기준 점수', kind: 'num', unit: '점', min: 0, max: 100 },
      { key: 'afterExtraScore', label: '애프터마켓 추가 점수', kind: 'num', unit: '점', min: 0, max: 100 },
      { key: 'pendingBuyTtlSec', label: '스캘핑 매수 미체결 만료', kind: 'num', unit: '초', min: 3, max: 600 },
      { key: 'carryOrderTtlSec', label: '추세·마감 매수 미체결 만료', kind: 'num', unit: '초', min: 5, max: 600, hint: '매수1호가 주문이 체결되기를 기다리는 시간입니다.' },
    ],
  },
  {
    title: '익절 · 손절',
    note: '이미 보유 중인 종목은 진입 때 정한 값이 유지되고, 새 진입부터 적용됩니다. 물타기가 켜져 있으면 손절은 실행되지 않고 물타기 단계 폭의 기준으로만 쓰입니다.',
    fields: [
      { key: 'sellTargetLargePct', label: '익절 시작 · 대형', kind: 'num', unit: '%', step: 0.1, min: 0.1, max: 20 },
      { key: 'sellTargetNetPct', label: '익절 시작 · 중형', kind: 'num', unit: '%', step: 0.1, min: 0.1, max: 20 },
      { key: 'sellTargetSmallPct', label: '익절 시작 · 소형', kind: 'num', unit: '%', step: 0.1, min: 0.1, max: 20 },
      { key: 'sellStopLargePct', label: '손절 · 대형', kind: 'num', unit: '%', step: 0.1, min: -20, max: -0.1, hint: '음수로 입력합니다.' },
      { key: 'sellStopNetPct', label: '손절 · 중형', kind: 'num', unit: '%', step: 0.1, min: -20, max: -0.1, hint: '음수로 입력합니다.' },
      { key: 'sellStopSmallPct', label: '손절 · 소형', kind: 'num', unit: '%', step: 0.1, min: -20, max: -0.1, hint: '음수로 입력합니다.' },
      { key: 'sellTrailTicks', label: '트레일링 하락 틱', kind: 'num', unit: '틱', min: 1, max: 20 },
      { key: 'minStopTicks', label: '손절·물타기 최소 하락 틱', kind: 'num', unit: '틱', min: 0, max: 20 },
      { key: 'tierLargeTradeValue5m', label: '대형 기준(5분 거래대금 이상)', kind: 'num', unit: '억', scale: EOK, step: 1, min: 0.1, max: 10000 },
      { key: 'tierMidTradeValue5m', label: '중형 기준(5분 거래대금 이상)', kind: 'num', unit: '억', scale: EOK, step: 0.5, min: 0.1, max: 10000 },
    ],
  },
  {
    title: '물타기 (손절 보류)',
    note: '평단 대비 순손실이 "손절 기준 × 단계 배수"에 닿을 때마다 종목당 진입금액만큼 추가 매수합니다. 끄면 예전처럼 손절합니다.',
    fields: [
      { key: 'avgDownEnabled', label: '물타기 사용', kind: 'bool' },
      { key: 'avgDownStepMult', label: '단계 배수', kind: 'num', unit: '배', step: 0.1, min: 1, max: 10 },
      { key: 'avgDownMaxSlots', label: '최대 슬롯', kind: 'num', unit: '개', min: 1, max: 10, hint: '마지막 슬롯 뒤 같은 폭만큼 더 내리면 전량 손절합니다.' },
      { key: 'avgDownMinGapSec', label: '추가 매수 간격', kind: 'num', unit: '초', min: 5, max: 3600 },
    ],
  },
  {
    title: '마감 매수 판단',
    note: '평일 15:10~15:20 하루 한 번. 필수: 이동평균이 상승 중이고 현재가가 그 위 · 전일 대비 하락. 여기에 추가 기준 5개 중 정한 개수 이상이 맞으면 매수1호가에 삽니다. 매도는 다음 날부터, 수익 상태에서 고점 대비 하락 또는 VWAP 이탈일 때만. 손실이면 보유하고, 다음 날 같은 시간에 이익이 없으면 같은 수량으로 슬롯을 하나 더 엽니다. 슬롯을 다 쓴 뒤에도 이익이 없으면 손절합니다.',
    fields: [
      { key: 'closeBuyEnabled', label: '마감 매수 사용', kind: 'bool' },
      { key: 'closeBuyQty', label: '매수 수량', kind: 'num', unit: '주', min: 1, max: 1000 },
      { key: 'closeBuyMaDays', label: '이동평균 일수', kind: 'num', unit: '일', min: 5, max: 90, hint: '일수 + 비교 간격이 95를 넘으면 일봉이 모자라 계산할 수 없습니다.' },
      { key: 'closeBuyMaLookback', label: '상승 비교 간격', kind: 'num', unit: '거래일 전', min: 1, max: 30 },
      { key: 'closeBuyMinChecks', label: '추가 기준 통과 개수', kind: 'num', unit: '개 이상', min: 0, max: 5, hint: '5개 기준(거래량 감소 · 하락 폭 적당 · 20일선 위 · 막판 반등 · 최근 강세) 중 이만큼 맞아야 삽니다. 0이면 추가 기준 없이 삽니다.' },
      { key: 'closeBuyDropMinPct', label: '하락 폭 최소', kind: 'num', unit: '%', step: 0.1, min: 0, max: 30 },
      { key: 'closeBuyDropMaxPct', label: '하락 폭 최대', kind: 'num', unit: '%', step: 0.5, min: 0.5, max: 30 },
      { key: 'closeBuyVolDays', label: '거래량 비교 일수', kind: 'num', unit: '일 평균', min: 2, max: 20 },
      { key: 'closeBuyBounceFromLowPct', label: '저가 대비 반등', kind: 'num', unit: '% 이상', step: 0.1, min: 0, max: 20 },
      { key: 'closeBuyRecentUpPct', label: '최근 강세 기준', kind: 'num', unit: '% 이상', step: 0.5, min: 1, max: 30, hint: '최근 5거래일 안에 하루 이만큼 오른 날이 있어야 합니다.' },
    ],
  },
  {
    title: '추세 매수 (서서히 오르는 종목)',
    note: '1분 기록으로 감지합니다: 구간 대부분을 VWAP 위에서 보냄 · VWAP 상승 중 · 5분 저점이 계속 높아짐. 매수 시간 동안 1분마다 판단해 감지된 종목을 매수1호가에 삽니다(종목당 하루 한 번). 매도는 수익 상태에서 고점 대비 하락 또는 VWAP 이탈일 때만. 손실이면 보유하고, 다음 날 같은 시간에 이익이 없으면 슬롯을 하나 더 엽니다(최대 슬롯은 물타기 묶음 값). 슬롯을 다 쓴 뒤에도 이익이 없으면 손절합니다. 마감 매수 보유분의 매도도 이 묶음의 "고점 대비 하락" 값을 씁니다.',
    fields: [
      { key: 'trendBuyEnabled', label: '추세 매수 사용', kind: 'bool', hint: '꺼도 감지 여부는 1분 기록에 계속 남습니다.' },
      { key: 'trendBuyQty', label: '매수 수량', kind: 'num', unit: '주', min: 1, max: 1000, hint: '첫 매수와 다음 날 추가 슬롯 모두 이 수량입니다.' },
      { key: 'trendBuyFromHHMM', label: '매수 시작 시각', kind: 'num', unit: '시분', min: 900, max: 1520, hint: '시·분을 붙여 씁니다. 1000 = 10시 00분.' },
      { key: 'trendBuyToHHMM', label: '매수 종료 시각', kind: 'num', unit: '시분', min: 901, max: 1520, hint: '이 시각 전까지 1분마다 판단해 삽니다. 1010 = 10시 10분.' },
      { key: 'trendWindowMin', label: '감지 구간', kind: 'num', unit: '분', min: 20, max: 110 },
      { key: 'trendAboveVwapPct', label: 'VWAP 위 비율 최소', kind: 'num', unit: '%', min: 50, max: 100 },
      { key: 'trendMaxVwapGapPct', label: '매수 시 VWAP 이격 최대', kind: 'num', unit: '%', step: 0.5, min: 0.5, max: 30 },
      { key: 'trendTrailPct', label: '고점 대비 하락 매도', kind: 'num', unit: '%', step: 0.1, min: 0.3, max: 20 },
      { key: 'trendMaxPositions', label: '동시 보유 최대', kind: 'num', unit: '종목', min: 1, max: 50 },
      { key: 'trendReentryMin', label: '매도 뒤 재매수 금지', kind: 'num', unit: '분', min: 0, max: 600 },
    ],
  },
  {
    title: '인벤토리 편입 · 퇴출',
    fields: [
      { key: 'fillMinTradeValue5m', label: '편입 최소 5분 거래대금', kind: 'num', unit: '억', scale: EOK, step: 0.1, min: 0, max: 1000 },
      { key: 'evictLowTradeValue5m', label: '거래 식음 퇴출 기준', kind: 'num', unit: '억', scale: EOK, step: 0.1, min: 0, max: 1000 },
      { key: 'evictLowSec', label: '거래 식음 지속 시간', kind: 'num', unit: '초', min: 30, max: 3600 },
      { key: 'distanceEvictFreeSlots', label: '"멀다" 퇴출을 시작하는 빈 칸 수', kind: 'num', unit: '칸 이하', min: 0, max: 80, hint: '빈 칸이 이보다 많으면 매수 조건에서 멀어도 내보내지 않습니다.' },
      { key: 'watchExecGap', label: '유지 체결강도 = 매수 기준 −', kind: 'num', min: 0, max: 200 },
      { key: 'watchTicksLarge', label: '편입 분당 체결 · 대형', kind: 'num', unit: '건', min: 0, max: 500 },
      { key: 'watchTicksMid', label: '편입 분당 체결 · 중형', kind: 'num', unit: '건', min: 0, max: 500 },
      { key: 'watchTicksSmall', label: '편입 분당 체결 · 소형', kind: 'num', unit: '건', min: 0, max: 500 },
    ],
  },
];
const ALL_FIELDS = GROUPS.flatMap(g => g.fields);

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');
const toShown = (f: Field, raw: unknown): string => {
  if (f.kind === 'bool') return raw ? '켬' : '끔';
  const n = Number(raw) / (f.scale || 1);
  return Number.isFinite(n) ? String(Number(n.toFixed(4))) : '';
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 저장으로 실제 값이 바뀌었을 때 — 변경 내용을 한 줄씩 전달(전체 로그 기록용) */
  onChanged?: (lines: string[]) => void;
}

export const StrategySettingsModal: React.FC<Props> = ({ isOpen, onClose, onChanged }) => {
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState<string>('');
  const [saved, setSaved] = useState<string>('');

  const loadDraft = () => {
    const live = getLiveParams() as any;
    const d: Record<string, string | boolean> = {};
    ALL_FIELDS.forEach(f => { d[f.key] = f.kind === 'bool' ? !!live[f.key] : toShown(f, live[f.key]); });
    setDraft(d); setError(''); setSaved('');
  };
  useEffect(() => { if (isOpen) loadDraft(); }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = getBaseParams() as any;
  const isChangedFromBase = (f: Field) => {
    const v = draft[f.key];
    if (f.kind === 'bool') return !!v !== !!base[f.key];
    return String(v ?? '').trim() !== toShown(f, base[f.key]);
  };
  const changedCount = useMemo(() => ALL_FIELDS.filter(isChangedFromBase).length, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handleSave = () => {
    const live = getLiveParams() as any;
    const next: Record<string, unknown> = { ...getUserOverrides() };
    const lines: string[] = [];
    for (const f of ALL_FIELDS) {
      const v = draft[f.key];
      let val: number | boolean;
      if (f.kind === 'bool') val = !!v;
      else {
        const n = Number(String(v ?? '').trim());
        if (String(v ?? '').trim() === '' || !Number.isFinite(n)) { setError(`"${f.label}" 값이 숫자가 아닙니다.`); return; }
        if (f.min !== undefined && n < f.min) { setError(`"${f.label}"는 ${f.min} 이상이어야 합니다.`); return; }
        if (f.max !== undefined && n > f.max) { setError(`"${f.label}"는 ${f.max} 이하여야 합니다.`); return; }
        val = Number((n * (f.scale || 1)).toFixed(6));
      }
      next[f.key] = val;
      if (val !== live[f.key]) lines.push(`${f.label}: ${toShown(f, live[f.key])} → ${toShown(f, val)}${f.kind === 'num' && f.unit ? f.unit : ''}`);
    }
    for (const k of ['trendBuyFromHHMM', 'trendBuyToHHMM']) { const v = Number(next[k]); if (v % 100 >= 60) { setError('시각은 시·분을 붙여 씁니다(분은 00~59). 예: 1015'); return; } }
    if (!(Number(next.trendBuyToHHMM) > Number(next.trendBuyFromHHMM))) { setError('추세 매수 종료 시각은 시작 시각보다 늦어야 합니다.'); return; }
    const tL = Number(next.tierLargeTradeValue5m), tM = Number(next.tierMidTradeValue5m);
    if (!(tL > tM)) { setError('대형 기준은 중형 기준보다 커야 합니다.'); return; }
    setUserOverrides(next as Partial<StrategyParameters>, lines.length ? `매매 기준 설정 변경 ${lines.length}건` : '매매 기준 설정 저장');
    setError('');
    setSaved(lines.length ? `${lines.length}개 항목을 바꿨습니다. 바로 적용됩니다.` : '바뀐 항목이 없습니다.');
    if (lines.length) onChanged?.(lines);
    loadDraftKeepMessage();
  };
  const loadDraftKeepMessage = () => {
    const live = getLiveParams() as any;
    const d: Record<string, string | boolean> = {};
    ALL_FIELDS.forEach(f => { d[f.key] = f.kind === 'bool' ? !!live[f.key] : toShown(f, live[f.key]); });
    setDraft(d);
  };
  const resetField = (f: Field) => setDraft(prev => ({ ...prev, [f.key]: f.kind === 'bool' ? !!base[f.key] : toShown(f, base[f.key]) }));
  const resetAll = () => {
    const d: Record<string, string | boolean> = {};
    ALL_FIELDS.forEach(f => { d[f.key] = f.kind === 'bool' ? !!base[f.key] : toShown(f, base[f.key]); });
    setDraft(d); setError(''); setSaved('전부 기본값으로 채웠습니다. [저장]을 눌러야 적용됩니다.');
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl border border-white/10 bg-slate-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-slate-100">
            <SlidersHorizontal className="w-4 h-4 text-amber-300" />
            <span className="font-bold text-sm">매매 기준 설정</span>
            <span className="text-[11px] text-slate-400">저장하면 바로 적용 · 이 브라우저에 저장 · 기본값과 다른 항목 {changedCount}개</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer" title="닫기"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {GROUPS.map(g => (
            <div key={g.title} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[12px] font-bold text-amber-200">{g.title}</div>
              {g.note && <div className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{g.note}</div>}
              <div className="mt-2 space-y-1.5">
                {g.fields.map(f => {
                  const changed = isChangedFromBase(f);
                  return (
                    <div key={f.key} className="flex items-center gap-2" title={f.hint || ''}>
                      <div className={cn('flex-1 min-w-0 text-[11.5px]', changed ? 'text-amber-200 font-semibold' : 'text-slate-200')}>
                        {f.label}
                        {f.hint && <div className="text-[10px] font-normal text-slate-500 leading-snug">{f.hint}</div>}
                      </div>
                      {f.kind === 'bool' ? (
                        <button
                          type="button"
                          onClick={() => setDraft(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                          className={cn('w-24 h-7 rounded-md border text-[11px] font-bold cursor-pointer', draft[f.key] ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200' : 'border-white/15 bg-white/5 text-slate-400')}
                        >{draft[f.key] ? '켬' : '끔'}</button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step={f.step ?? 1}
                            value={String(draft[f.key] ?? '')}
                            onChange={e => setDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className={cn('w-24 h-7 px-2 rounded-md border bg-slate-950 text-right text-[12px] font-mono text-slate-100 outline-none focus:border-amber-300/70', changed ? 'border-amber-300/50' : 'border-white/15')}
                          />
                          <span className="w-12 text-[10px] text-slate-400 truncate">{f.unit || ''}</span>
                        </div>
                      )}
                      <div className="w-20 text-right text-[10px] text-slate-500 font-mono">기본 {toShown(f, base[f.key])}</div>
                      <button
                        type="button"
                        onClick={() => resetField(f)}
                        disabled={!changed}
                        className={cn('p-1 rounded', changed ? 'text-amber-300 hover:bg-white/10 cursor-pointer' : 'text-slate-700')}
                        title="이 항목만 기본값으로"
                      ><RotateCcw className="w-3 h-3" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 px-4 py-3 border-t border-white/10">
          <div className="flex-1 min-w-0 text-[11px]">
            {error ? <span className="text-rose-300 font-semibold">{error}</span>
              : saved ? <span className="text-emerald-300">{saved}</span>
              : <span className="text-slate-400">장중에 값을 바꾸면 그 전후 신호가 서로 다른 기준으로 기록됩니다. 바꾼 내용은 전체 로그에 [기준 변경]으로 남습니다.</span>}
          </div>
          <button type="button" onClick={resetAll} className="h-8 px-3 rounded-md border border-white/15 bg-white/5 text-[11px] font-bold text-slate-300 hover:bg-white/10 cursor-pointer">전부 기본값으로</button>
          <button type="button" onClick={onClose} className="h-8 px-3 rounded-md border border-white/15 bg-white/5 text-[11px] font-bold text-slate-300 hover:bg-white/10 cursor-pointer">닫기</button>
          <button type="button" onClick={handleSave} className="h-8 px-4 rounded-md border border-amber-300/60 bg-amber-400/20 text-[11px] font-bold text-amber-100 hover:bg-amber-400/30 cursor-pointer">저장</button>
        </div>
      </div>
    </div>
  );
};
