import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { kisService } from '../services/kisService';
import { buildChartSvg, svgToPngBlob, downloadBlob } from '../services/chartImage';
import { saveBlobToFolder } from '../services/signalStore';

// 📊 (2026-10-07) 일봉 차트 창 — 인벤토리 종목 카드를 더블클릭하면 뜬다.
//   일봉 조회(국내주식기간별시세) 1번으로 그린다. 같은 날 같은 종목은 다시 조회하지 않는다(메모리 보관).
//   실시간 시세 등록(웹소켓)과는 무관하다. 오늘 봉의 종가만 화면의 현재가로 덧씌운다.

type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
const cache = new Map<string, { day: string; rows: Candle[] }>();
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const MA_DAYS = 50;

interface Props {
  target: { symbol: string; name: string } | null;
  onClose: () => void;
  livePrice?: number;
}

export const DailyChartModal: React.FC<Props> = ({ target, onClose, livePrice = 0 }) => {
  const [rows, setRows] = useState<Candle[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle');
  const [hover, setHover] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState<string>('');

  useEffect(() => {
    if (!target) return;
    let alive = true;
    setHover(null); setSaveMsg('');
    const hit = cache.get(target.symbol);
    if (hit && hit.day === todayKst()) { setRows(hit.rows); setState('ok'); return; }
    setState('loading'); setRows([]);
    kisService.getDomesticDailyCloses(target.symbol).then(list => {
      if (!alive) return;
      const asc = [...list].filter(r => r.open > 0 && r.high > 0 && r.low > 0 && r.close > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (asc.length === 0) { setState('error'); return; }
      cache.set(target.symbol, { day: todayKst(), rows: asc });
      setRows(asc); setState('ok');
    }).catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [target?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // 오늘 봉은 현재가로 종가·고가·저가를 맞춘다
  const data = useMemo(() => {
    if (rows.length === 0) return rows;
    const out = rows.map(r => ({ ...r }));
    const last = out[out.length - 1];
    if (livePrice > 0 && last.date === todayKst()) {
      last.close = livePrice; if (livePrice > last.high) last.high = livePrice; if (livePrice < last.low) last.low = livePrice;
    }
    return out;
  }, [rows, livePrice]);

  const ma = useMemo(() => data.map((_, i) => {
    if (i + 1 < MA_DAYS) return null;
    let sum = 0; for (let k = i - MA_DAYS + 1; k <= i; k++) sum += data[k].close;
    return sum / MA_DAYS;
  }), [data]);

  if (!target) return null;

  const W = 920, H = 430, PAD_L = 8, PAD_R = 64, TOP = 14, PRICE_H = 270, GAP = 26, VOL_H = 90;
  const n = data.length;
  const hi = n ? Math.max(...data.map(d => d.high)) : 0;
  const lo = n ? Math.min(...data.map(d => d.low)) : 0;
  const hiIdx = data.findIndex(d => d.high === hi), loIdx = data.findIndex(d => d.low === lo);
  const pad = (hi - lo) * 0.06 || 1;
  const pMax = hi + pad, pMin = lo - pad;
  const plotW = W - PAD_L - PAD_R;
  const step = n ? plotW / n : 0;
  const bw = Math.max(1.5, Math.min(14, step * 0.68));
  const x = (i: number) => PAD_L + step * (i + 0.5);
  const y = (p: number) => TOP + (pMax - p) / (pMax - pMin) * PRICE_H;
  const vMax = n ? Math.max(...data.map(d => d.volume)) || 1 : 1;
  const vTop = TOP + PRICE_H + GAP;
  const vy = (v: number) => vTop + VOL_H - (v / vMax) * VOL_H;
  const UP = '#f04452', DOWN = '#3182f6';
  const colorOf = (d: Candle, prevClose?: number) => (d.close > d.open ? UP : d.close < d.open ? DOWN : (prevClose !== undefined && d.close < prevClose ? DOWN : UP));

  const last = n ? data[n - 1] : null;
  const prev = n > 1 ? data[n - 2] : null;
  const shown = hover !== null && data[hover] ? data[hover] : last;
  const shownPrev = hover !== null ? (hover > 0 ? data[hover - 1] : null) : prev;
  const chg = shown && shownPrev ? shown.close - shownPrev.close : 0;
  const chgPct = shown && shownPrev && shownPrev.close > 0 ? (chg / shownPrev.close) * 100 : 0;
  const lastClose = last?.close || 0;
  const fromLast = (p: number) => (lastClose > 0 ? ((lastClose - p) / p) * 100 : 0);
  const dateLabel = (s: string) => `${s.slice(4, 6)}/${s.slice(6, 8)}`;
  const maPath = ma.map((v, i) => (v === null ? '' : `${ma[i - 1] === null || i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => pMin + (pMax - pMin) * t);
  const monthMarks = data.map((d, i) => ({ i, d })).filter(({ i, d }) => i > 0 && d.date.slice(4, 6) !== data[i - 1].date.slice(4, 6));

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="w-full max-w-5xl rounded-xl border border-white/10 bg-slate-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <div className="flex items-baseline gap-2 text-slate-100">
            <span className="font-bold text-sm">{target.name}</span>
            <span className="text-[11px] text-slate-400 font-mono">{target.symbol}</span>
            <span className="text-[11px] text-slate-500">일봉 {n ? `${n}일` : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            {saveMsg && <span className="text-[11px] text-emerald-300">{saveMsg}</span>}
            {state === 'ok' && (
              <button
                type="button"
                onClick={async () => {
                  setSaveMsg('저장 중…');
                  const day = todayKst();
                  const fileName = `leo100b_차트_${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}_${target.name.replace(/[\\/:*?"<>|]/g, '_')}.png`;
                  const blob = await svgToPngBlob(buildChartSvg(target.name, target.symbol, data));
                  if (!blob) { setSaveMsg('그림을 만들지 못했습니다'); return; }
                  const ok = await saveBlobToFolder(fileName, blob);
                  if (ok) setSaveMsg('폴더에 저장했습니다');
                  else { downloadBlob(fileName, blob); setSaveMsg('내려받기로 저장했습니다'); }
                }}
                className="h-7 px-2.5 rounded-md border border-white/15 bg-white/5 text-[11px] font-bold text-slate-200 hover:bg-white/10 cursor-pointer"
                title="이 차트를 PNG 그림으로 저장 — 신호 엑셀 저장 폴더가 지정돼 있으면 그 폴더에, 아니면 브라우저 내려받기로"
              >이미지 저장</button>
            )}
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer" title="닫기"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="px-4 pt-2 pb-3">
          {state === 'loading' && <div className="h-[430px] flex items-center justify-center text-slate-400 text-sm">일봉을 불러오는 중…</div>}
          {state === 'error' && <div className="h-[430px] flex items-center justify-center text-rose-300 text-sm">일봉을 불러오지 못했습니다. 잠시 뒤 다시 더블클릭해 주세요.</div>}
          {state === 'ok' && shown && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] font-mono text-slate-300 pb-1">
                <span className="text-slate-500">{`${shown.date.slice(0, 4)}.${shown.date.slice(4, 6)}.${shown.date.slice(6, 8)}`}</span>
                <span>시 <b className="text-slate-100">{fmt(shown.open)}</b></span>
                <span>고 <b className="text-slate-100">{fmt(shown.high)}</b></span>
                <span>저 <b className="text-slate-100">{fmt(shown.low)}</b></span>
                <span>종 <b className="text-slate-100">{fmt(shown.close)}</b></span>
                {shownPrev && <span style={{ color: chg >= 0 ? UP : DOWN }}>{chg >= 0 ? '▲' : '▼'} {fmt(Math.abs(chg))} ({chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%)</span>}
                <span>거 <b className="text-slate-100">{fmt(shown.volume)}</b></span>
                {(() => { const m = ma[hover !== null ? hover : n - 1]; return m ? <span style={{ color: '#f5b83d' }}>{MA_DAYS}일선 {fmt(m)}</span> : <span className="text-slate-600">{MA_DAYS}일선 —</span>; })()}
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseLeave={() => setHover(null)}
                onMouseMove={e => {
                  const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                  const px = ((e.clientX - r.left) / r.width) * W;
                  const i = Math.floor((px - PAD_L) / step);
                  setHover(i >= 0 && i < n ? i : null);
                }}>
                {ticks.map((p, k) => (
                  <g key={k}>
                    <line x1={PAD_L} x2={W - PAD_R} y1={y(p)} y2={y(p)} stroke="rgba(255,255,255,0.06)" />
                    <text x={W - PAD_R + 6} y={y(p) + 3.5} fontSize="10.5" fill="#8b95a1" fontFamily="monospace">{fmt(p)}</text>
                  </g>
                ))}
                {monthMarks.map(({ i, d }) => (
                  <g key={d.date}>
                    <line x1={x(i) - step / 2} x2={x(i) - step / 2} y1={TOP} y2={vTop + VOL_H} stroke="rgba(255,255,255,0.05)" />
                    <text x={x(i) - step / 2 + 3} y={H - 4} fontSize="10.5" fill="#8b95a1">{`${Number(d.date.slice(4, 6))}월`}</text>
                  </g>
                ))}
                {data.map((d, i) => {
                  const c = colorOf(d, i > 0 ? data[i - 1].close : undefined);
                  const top = y(Math.max(d.open, d.close)), bot = y(Math.min(d.open, d.close));
                  return (
                    <g key={d.date}>
                      <line x1={x(i)} x2={x(i)} y1={y(d.high)} y2={y(d.low)} stroke={c} strokeWidth="1" />
                      <rect x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} fill={c} />
                      <rect x={x(i) - bw / 2} y={vy(d.volume)} width={bw} height={Math.max(0.5, vTop + VOL_H - vy(d.volume))} fill={c} opacity="0.85" />
                    </g>
                  );
                })}
                {maPath && <path d={maPath} fill="none" stroke="#f5b83d" strokeWidth="1.4" />}
                {hiIdx >= 0 && (
                  <text x={Math.min(Math.max(x(hiIdx), 70), W - PAD_R - 70)} y={y(hi) - 4} fontSize="10.5" fill="#d1d6db" textAnchor="middle">
                    최고 {fmt(hi)} ({fromLast(hi) >= 0 ? '+' : ''}{fromLast(hi).toFixed(2)}%)
                  </text>
                )}
                {loIdx >= 0 && (
                  <text x={Math.min(Math.max(x(loIdx), 70), W - PAD_R - 70)} y={y(lo) + 13} fontSize="10.5" fill="#d1d6db" textAnchor="middle">
                    최저 {fmt(lo)} ({fromLast(lo) >= 0 ? '+' : ''}{fromLast(lo).toFixed(2)}%)
                  </text>
                )}
                <text x={PAD_L} y={vTop - 6} fontSize="10.5" fill="#8b95a1">거래량</text>
                {last && (
                  <g>
                    <line x1={PAD_L} x2={W - PAD_R} y1={y(last.close)} y2={y(last.close)} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
                    <rect x={W - PAD_R + 2} y={y(last.close) - 8} width={PAD_R - 4} height={16} rx="3" fill={prev && last.close < prev.close ? DOWN : UP} />
                    <text x={W - PAD_R + 6} y={y(last.close) + 3.5} fontSize="10.5" fill="#fff" fontFamily="monospace">{fmt(last.close)}</text>
                  </g>
                )}
                {hover !== null && data[hover] && (
                  <g pointerEvents="none">
                    <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={vTop + VOL_H} stroke="rgba(255,255,255,0.35)" />
                    <text x={Math.min(Math.max(x(hover), 20), W - PAD_R - 20)} y={TOP - 3} fontSize="10" fill="#d1d6db" textAnchor="middle">{dateLabel(data[hover].date)}</text>
                  </g>
                )}
              </svg>
              <div className="text-[10.5px] text-slate-500">노란 선 = {MA_DAYS}일 이동평균(마감 매수 판단 기준) · 수정주가 · 오늘 봉은 현재가 반영 · 마우스를 올리면 그날 값이 위에 표시됩니다</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
