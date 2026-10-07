// ============================================================
// 🖼️ 일봉 차트 이미지 — 2026-10-07
// ------------------------------------------------------------
// 일봉 자료로 차트 그림(SVG 문자열)을 만들고 PNG로 바꾼다. 화면의 일봉 차트 창과 같은 모양이며,
// 종목명·시고저종·등락·거래량·50일선과 매수 표시(매수가 수평선)를 그림 안에 함께 넣는다.
// 장 마감 뒤 그날 매수한 종목의 차트를 폴더에 자동 저장하는 데 쓴다.
// ============================================================

export type ChartCandle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export type ChartMark = { price: number; label: string };

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const escXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const UP = '#f04452', DOWN = '#3182f6', MA_COLOR = '#f5b83d';
const MA_DAYS = 50;

export function buildChartSvg(name: string, symbol: string, candles: ChartCandle[], marks: ChartMark[] = [], note = ''): string {
  const data = [...candles].filter(r => r.open > 0 && r.high > 0 && r.low > 0 && r.close > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  const W = 1000, H = 560, PAD_L = 16, PAD_R = 76, HEAD = 78, PRICE_H = 300, GAP = 30, VOL_H = 96;
  const n = data.length;
  if (n === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#0f172a"/><text x="20" y="40" fill="#e2e8f0" font-size="16" font-family="sans-serif">${escXml(name)} — 일봉 자료 없음</text></svg>`;
  const markPrices = marks.map(m => m.price).filter(p => p > 0);
  const hi = Math.max(...data.map(d => d.high)), lo = Math.min(...data.map(d => d.low));
  const top = Math.max(hi, ...markPrices), bottom = Math.min(lo, ...markPrices);
  const pad = (top - bottom) * 0.06 || 1;
  const pMax = top + pad, pMin = bottom - pad;
  const plotW = W - PAD_L - PAD_R;
  const step = plotW / n;
  const bw = Math.max(1.5, Math.min(14, step * 0.68));
  const x = (i: number) => PAD_L + step * (i + 0.5);
  const y = (p: number) => HEAD + (pMax - p) / (pMax - pMin) * PRICE_H;
  const vMax = Math.max(...data.map(d => d.volume)) || 1;
  const vTop = HEAD + PRICE_H + GAP;
  const vy = (v: number) => vTop + VOL_H - (v / vMax) * VOL_H;
  const last = data[n - 1], prev = n > 1 ? data[n - 2] : null;
  const chg = prev ? last.close - prev.close : 0;
  const chgPct = prev && prev.close > 0 ? (chg / prev.close) * 100 : 0;
  const ma: (number | null)[] = data.map((_, i) => {
    if (i + 1 < MA_DAYS) return null;
    let sum = 0; for (let k = i - MA_DAYS + 1; k <= i; k++) sum += data[k].close;
    return sum / MA_DAYS;
  });
  const maLast = ma[n - 1];
  const hiIdx = data.findIndex(d => d.high === hi), loIdx = data.findIndex(d => d.low === lo);
  const fromLast = (p: number) => ((last.close - p) / p) * 100;
  const colorOf = (d: ChartCandle, pc?: number) => (d.close > d.open ? UP : d.close < d.open ? DOWN : (pc !== undefined && d.close < pc ? DOWN : UP));
  const o: string[] = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Malgun Gothic','Apple SD Gothic Neo',sans-serif">`);
  o.push(`<rect width="${W}" height="${H}" fill="#0f172a"/>`);
  // 머리글
  o.push(`<text x="${PAD_L}" y="30" font-size="18" font-weight="700" fill="#f1f5f9">${escXml(name)}</text>`);
  o.push(`<text x="${PAD_L + 14 + name.length * 18}" y="30" font-size="12" fill="#94a3b8" font-family="monospace">${escXml(symbol)} · 일봉 ${n}일</text>`);
  const dLabel = `${last.date.slice(0, 4)}.${last.date.slice(4, 6)}.${last.date.slice(6, 8)}`;
  const head2 = `${dLabel}   시 ${fmt(last.open)}   고 ${fmt(last.high)}   저 ${fmt(last.low)}   종 ${fmt(last.close)}`;
  o.push(`<text x="${PAD_L}" y="54" font-size="13" fill="#cbd5e1" font-family="monospace">${escXml(head2)}</text>`);
  o.push(`<text x="${PAD_L + head2.length * 7.9 + 14}" y="54" font-size="13" fill="${chg >= 0 ? UP : DOWN}" font-family="monospace">${chg >= 0 ? '▲' : '▼'} ${fmt(Math.abs(chg))} (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)</text>`);
  o.push(`<text x="${W - PAD_R}" y="54" font-size="13" fill="#cbd5e1" font-family="monospace" text-anchor="end">거 ${fmt(last.volume)}   ${maLast ? `${MA_DAYS}일선 ${fmt(maLast)}` : ''}</text>`);
  if (note) o.push(`<text x="${W - PAD_R}" y="30" font-size="12" fill="#fbbf24" text-anchor="end">${escXml(note)}</text>`);
  // 가격 눈금
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const p = pMin + (pMax - pMin) * t;
    o.push(`<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${y(p).toFixed(1)}" y2="${y(p).toFixed(1)}" stroke="rgba(255,255,255,0.07)"/>`);
    o.push(`<text x="${W - PAD_R + 6}" y="${(y(p) + 4).toFixed(1)}" font-size="11" fill="#8b95a1" font-family="monospace">${fmt(p)}</text>`);
  }
  // 월 구분
  data.forEach((d, i) => {
    if (i > 0 && d.date.slice(4, 6) !== data[i - 1].date.slice(4, 6)) {
      const xx = (x(i) - step / 2).toFixed(1);
      o.push(`<line x1="${xx}" x2="${xx}" y1="${HEAD}" y2="${vTop + VOL_H}" stroke="rgba(255,255,255,0.05)"/>`);
      o.push(`<text x="${(x(i) - step / 2 + 3).toFixed(1)}" y="${H - 8}" font-size="11" fill="#8b95a1">${Number(d.date.slice(4, 6))}월</text>`);
    }
  });
  // 캔들 · 거래량
  data.forEach((d, i) => {
    const c = colorOf(d, i > 0 ? data[i - 1].close : undefined);
    const t = y(Math.max(d.open, d.close)), b = y(Math.min(d.open, d.close));
    o.push(`<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${y(d.high).toFixed(1)}" y2="${y(d.low).toFixed(1)}" stroke="${c}" stroke-width="1"/>`);
    o.push(`<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${t.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, b - t).toFixed(1)}" fill="${c}"/>`);
    o.push(`<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${vy(d.volume).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, vTop + VOL_H - vy(d.volume)).toFixed(1)}" fill="${c}" opacity="0.85"/>`);
  });
  // 50일선
  let path = ''; let started = false;
  ma.forEach((v, i) => { if (v === null) return; path += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; started = true; });
  if (path) o.push(`<path d="${path.trim()}" fill="none" stroke="${MA_COLOR}" stroke-width="1.5"/>`);
  // 최고·최저
  const clampX = (v: number) => Math.min(Math.max(v, 80), W - PAD_R - 80);
  o.push(`<text x="${clampX(x(hiIdx)).toFixed(1)}" y="${(y(hi) - 5).toFixed(1)}" font-size="11" fill="#d1d6db" text-anchor="middle">최고 ${fmt(hi)} (${fromLast(hi) >= 0 ? '+' : ''}${fromLast(hi).toFixed(2)}%)</text>`);
  o.push(`<text x="${clampX(x(loIdx)).toFixed(1)}" y="${(y(lo) + 14).toFixed(1)}" font-size="11" fill="#d1d6db" text-anchor="middle">최저 ${fmt(lo)} (${fromLast(lo) >= 0 ? '+' : ''}${fromLast(lo).toFixed(2)}%)</text>`);
  // 현재가(종가) 표시
  o.push(`<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${y(last.close).toFixed(1)}" y2="${y(last.close).toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-dasharray="3 3"/>`);
  o.push(`<rect x="${W - PAD_R + 2}" y="${(y(last.close) - 9).toFixed(1)}" width="${PAD_R - 6}" height="18" rx="3" fill="${prev && last.close < prev.close ? DOWN : UP}"/>`);
  o.push(`<text x="${W - PAD_R + 7}" y="${(y(last.close) + 4).toFixed(1)}" font-size="11" fill="#fff" font-family="monospace">${fmt(last.close)}</text>`);
  // 매수 표시
  marks.filter(m => m.price > 0).forEach((m, k) => {
    const yy = y(m.price);
    o.push(`<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#34d399" stroke-width="1.2" stroke-dasharray="6 4"/>`);
    o.push(`<rect x="${PAD_L + 4}" y="${(yy - 19 - k * 2).toFixed(1)}" width="${Math.max(90, m.label.length * 11 + 16)}" height="17" rx="3" fill="#064e3b" stroke="#34d399" stroke-width="0.8"/>`);
    o.push(`<text x="${PAD_L + 11}" y="${(yy - 6 - k * 2).toFixed(1)}" font-size="11.5" fill="#a7f3d0">${escXml(m.label)}</text>`);
  });
  o.push(`<text x="${PAD_L}" y="${vTop - 8}" font-size="11" fill="#8b95a1">거래량</text>`);
  o.push(`<text x="${W - PAD_R}" y="${H - 8}" font-size="10.5" fill="#64748b" text-anchor="end">노란 선 ${MA_DAYS}일 이동평균 · 초록 점선 매수가 · 수정주가</text>`);
  o.push('</svg>');
  return o.join('');
}

/** SVG 문자열을 PNG로 바꾼다(브라우저 전용). 실패하면 null. */
export function svgToPngBlob(svg: string, scale = 2): Promise<Blob | null> {
  return new Promise(resolve => {
    try {
      const m = svg.match(/width="(\d+)" height="(\d+)"/);
      const w = m ? Number(m[1]) : 1000, h = m ? Number(m[2]) : 560;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = w * scale; canvas.height = h * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) { URL.revokeObjectURL(url); resolve(null); return; }
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          canvas.toBlob(b => resolve(b), 'image/png');
        } catch { URL.revokeObjectURL(url); resolve(null); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch { resolve(null); }
  });
}

/** 폴더 저장이 안 될 때 — 브라우저 다운로드로 내려받는다 */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
