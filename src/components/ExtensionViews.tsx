/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 사용 기간 연장 요청 · 영수증
//  - ExtensionRequestModal     : 대표가 1개월/1년 연장을 요청 (입금 계좌 안내, 요청 내역, 영수증)
//  - ReceiptModal              : 입금 확인(승인)된 요청의 영수증 미리보기 + 인쇄/PDF 저장
//  - SuperExtensionRequests    : 최고관리자 패널의 연장 요청 처리 + 요금·계좌·영수증 발행자 설정

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle, Clock, CreditCard, FileText, KeyRound, Printer, Settings, X } from 'lucide-react';
import { api } from '../api/client';
import { BillingSettings, ExtensionPlan, ExtensionReceipt, ExtensionRequest, ExtensionRequestStatus } from '../types';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const ymd = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const PLAN_LABEL: Record<ExtensionPlan, string> = { '1m': '1개월', '1y': '1년' };

const STATUS_BADGE: Record<ExtensionRequestStatus, { label: string; className: string }> = {
  pending: { label: '입금 확인 대기', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  approved: { label: '연장 완료', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: '반려', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: '취소', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const StatusBadge: React.FC<{ status: ExtensionRequestStatus }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${STATUS_BADGE[status].className}`}>
    {STATUS_BADGE[status].label}
  </span>
);

// 금액을 한글로 (영수증의 "금 일십만원정")
function amountInKorean(n: number): string {
  if (!n) return '영';
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const small = ['', '십', '백', '천'];
  const big = ['', '만', '억', '조'];
  let result = '';
  let group = 0;
  while (n > 0) {
    const part = n % 10000;
    if (part) {
      let text = '';
      let p = part;
      for (let i = 0; i < 4 && p > 0; i++) {
        const d = p % 10;
        if (d) text = digits[d] + small[i] + text;
        p = Math.floor(p / 10);
      }
      result = text + big[group] + result;
    }
    n = Math.floor(n / 10000);
    group++;
  }
  return result;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// 인쇄용 영수증 HTML (iframe에 넣어 미리보기·인쇄)
function buildReceiptHtml(r: ExtensionReceipt): string {
  const e = (v?: string) => escapeHtml(v || '-');
  const req = r.request;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>영수증 ${e(req.receipt_no)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #0f172a; margin: 0; padding: 28px; background: #fff; }
  .sheet { max-width: 640px; margin: 0 auto; border: 2px solid #0f172a; padding: 28px 30px; }
  h1 { text-align: center; font-size: 30px; letter-spacing: 18px; margin: 0 0 6px; padding-left: 18px; }
  .no { text-align: center; font-size: 12px; color: #475569; margin-bottom: 22px; }
  .to { font-size: 17px; font-weight: 800; border-bottom: 1px solid #0f172a; padding-bottom: 6px; margin-bottom: 16px; }
  .amount { border: 1.5px solid #0f172a; padding: 14px 16px; margin: 14px 0 18px; display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .amount .k { font-size: 15px; font-weight: 800; }
  .amount .n { font-size: 22px; font-weight: 900; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #94a3b8; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; width: 26%; font-weight: 700; }
  .section { font-size: 12px; font-weight: 800; color: #334155; margin: 18px 0 6px; }
  .note { font-size: 11px; color: #64748b; margin-top: 18px; line-height: 1.6; }
  .sign { text-align: right; margin-top: 22px; font-size: 14px; font-weight: 700; }
</style></head><body><div class="sheet">
  <h1>영수증</h1>
  <div class="no">No. ${e(req.receipt_no)} · 발행일 ${ymd(req.processed_at)}</div>
  <div class="to">${e(r.customer.company_name)} 귀하</div>
  <div>아래 금액을 정히 영수합니다.</div>
  <div class="amount"><span class="k">금 ${amountInKorean(req.amount)}원정</span><span class="n">₩ ${req.amount.toLocaleString('ko-KR')}</span></div>
  <div class="section">내역</div>
  <table>
    <tr><th>품목</th><td>돈돈 회계관리 프로그램 이용료 (${PLAN_LABEL[req.plan]})</td></tr>
    <tr><th>이용 기간</th><td>${ymd(req.period_from)} ~ ${ymd(req.period_to)}</td></tr>
    <tr><th>입금자명</th><td>${e(req.depositor_name)}</td></tr>
    <tr><th>입금 확인일</th><td>${ymd(req.processed_at)}</td></tr>
  </table>
  <div class="section">공급받는 자</div>
  <table>
    <tr><th>상호</th><td>${e(r.customer.company_name)}</td></tr>
    <tr><th>사업자등록번호</th><td>${e(r.customer.business_number)}</td></tr>
    <tr><th>대표자</th><td>${e(r.customer.representative_name)}</td></tr>
    <tr><th>이메일</th><td>${e(r.customer.email)}</td></tr>
  </table>
  <div class="section">공급자</div>
  <table>
    <tr><th>상호</th><td>${e(r.issuer.issuer_name)}</td></tr>
    <tr><th>사업자등록번호</th><td>${e(r.issuer.issuer_biz_no)}</td></tr>
    <tr><th>대표자</th><td>${e(r.issuer.issuer_ceo)}</td></tr>
    <tr><th>주소</th><td>${e(r.issuer.issuer_address)}</td></tr>
    <tr><th>연락처</th><td>${e(r.issuer.issuer_contact)}</td></tr>
  </table>
  <div class="sign">${e(r.issuer.issuer_name)} ${r.issuer.issuer_ceo ? `대표 ${e(r.issuer.issuer_ceo)}` : ''} (인)</div>
  <div class="note">이 영수증은 입금 확인 사실을 증명하는 문서이며, 세금계산서·현금영수증을 대신하지 않습니다.</div>
</div></body></html>`;
}

// ────────────────────────────────────────────────────────────────
// 영수증 미리보기 + 인쇄
// ────────────────────────────────────────────────────────────────

export const ReceiptModal: React.FC<{ requestId: string | null; onClose: () => void }> = ({ requestId, onClose }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!requestId) return;
    setHtml(null);
    setError(null);
    api
      .getExtensionReceipt(requestId)
      .then((r) => setHtml(buildReceiptHtml(r)))
      .catch((err) => setError(err.message || '영수증을 불러오지 못했습니다.'));
  }, [requestId]);

  if (!requestId) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-black text-slate-900">
            <FileText className="w-5 h-5 text-indigo-600" />
            영수증
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!html}
              onClick={() => frameRef.current?.contentWindow?.print()}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              인쇄 / PDF 저장
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="닫기">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 overflow-hidden">
          {error ? (
            <div className="p-6 text-sm text-rose-700 font-semibold">{error}</div>
          ) : html ? (
            <iframe ref={frameRef} title="영수증" srcDoc={html} className="w-full h-full bg-white" />
          ) : (
            <div className="p-6 text-sm text-slate-400">불러오는 중...</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────
// 대표: 기간 연장 요청
// ────────────────────────────────────────────────────────────────

interface ExtensionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  expiresAt: string | null;
  // 인증키를 따로 받은 경우 (예전 방식)
  onUseKey?: () => void;
}

export const ExtensionRequestModal: React.FC<ExtensionRequestModalProps> = ({ isOpen, onClose, companyName, expiresAt, onUseKey }) => {
  const [billing, setBilling] = useState<Awaited<ReturnType<typeof api.getBillingInfo>> | null>(null);
  const [requests, setRequests] = useState<ExtensionRequest[]>([]);
  const [plan, setPlan] = useState<ExtensionPlan>('1m');
  const [depositor, setDepositor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [info, list] = await Promise.all([api.getBillingInfo(), api.getMyExtensionRequests()]);
      setBilling(info);
      setRequests(list);
    } catch (err: any) {
      setError(err.message || '정보를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSent(false);
    setDepositor((d) => d || companyName);
    load();
  }, [isOpen, load, companyName]);

  if (!isOpen) return null;

  const pending = requests.find((r) => r.status === 'pending');
  const priceOf = (p: ExtensionPlan) => (p === '1y' ? billing?.price_year : billing?.price_month) || 0;
  const priced = !!billing && (billing.price_month > 0 || billing.price_year > 0);

  const submit = async () => {
    setError(null);
    if (!depositor.trim()) return setError('입금자명을 입력해 주세요.');
    try {
      setBusy(true);
      await api.requestExtension({ plan, depositor_name: depositor.trim() });
      setSent(true);
      await load();
    } catch (err: any) {
      setError(err.message || '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await api.cancelExtensionRequest(id);
      setSent(false);
      await load();
    } catch (err: any) {
      setError(err.message || '취소에 실패했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92vh] overflow-y-auto text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-300" />
            <h3 className="text-base font-bold">사용 기간 연장 요청</h3>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white" aria-label="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-900">{companyName}</strong>의 현재 사용 기한은{' '}
            <strong className="text-slate-900">{expiresAt ? ymd(expiresAt) : '-'}</strong>입니다. 기간을 골라 요청하면{' '}
            <strong className="text-slate-900">관리자에게 연장 요청이 전달</strong>되고, 입금이 확인되면 남은 기간 뒤에 이어서 연장됩니다.
          </p>

          {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">{error}</div>}

          {sent && pending ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1.5">
              <div className="font-black flex items-center gap-1.5 text-sm">
                <CheckCircle className="w-4 h-4" />
                관리자에게 연장 요청을 보냈습니다
              </div>
              <p className="text-xs leading-relaxed">
                아래 계좌로 <strong>{won(pending.amount)}</strong>을(를) 입금자명 <strong>{pending.depositor_name}</strong>(으)로 보내 주세요.
                입금이 확인되면 기간이 연장되고, 이 창의 요청 내역에서 영수증을 받을 수 있습니다.
              </p>
            </div>
          ) : pending ? (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed space-y-2">
              <div className="font-black text-sm">입금 확인을 기다리는 요청이 있습니다</div>
              <div>
                {PLAN_LABEL[pending.plan]} · {won(pending.amount)} · 입금자명 {pending.depositor_name} · 요청일 {ymd(pending.created_at)}
              </div>
              <button type="button" onClick={() => cancel(pending.id)} className="text-[11px] font-bold underline">
                요청 취소
              </button>
            </div>
          ) : !billing ? (
            <div className="text-xs text-slate-400">불러오는 중...</div>
          ) : !priced ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              아직 요금이 정해지지 않아 요청할 수 없습니다. 프로그램 운영자에게 문의해 주세요.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {(['1m', '1y'] as ExtensionPlan[]).map((p) => {
                  const price = priceOf(p);
                  const monthly = billing.price_month;
                  const save = p === '1y' && monthly > 0 && price > 0 && price < monthly * 12 ? monthly * 12 - price : 0;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={!price}
                      onClick={() => setPlan(p)}
                      className={`p-4 rounded-2xl border-2 text-left transition-colors disabled:opacity-40 ${
                        plan === p ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-500">{PLAN_LABEL[p]} 연장</div>
                      <div className="text-lg font-black text-slate-900 mt-0.5">{price ? won(price) : '-'}</div>
                      {save > 0 && <div className="text-[11px] font-bold text-emerald-600 mt-0.5">1개월씩보다 {won(save)} 절약</div>}
                    </button>
                  );
                })}
              </div>

              {(billing.bank_account || billing.bank_name) && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-0.5">
                  <div className="font-bold text-slate-500 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" />
                    입금 계좌
                  </div>
                  <div className="font-black text-slate-900 text-sm">
                    {billing.bank_name} {billing.bank_account}
                  </div>
                  {billing.bank_holder && <div className="text-slate-600">예금주 {billing.bank_holder}</div>}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">입금자명</label>
                <input
                  value={depositor}
                  onChange={(e) => setDepositor(e.target.value)}
                  maxLength={40}
                  placeholder="통장에 찍힐 이름"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
                />
              </div>

              <button
                type="button"
                onClick={submit}
                disabled={busy || !priceOf(plan)}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-md disabled:opacity-50"
              >
                {busy ? '요청 중...' : `${PLAN_LABEL[plan]} 연장 요청 (${won(priceOf(plan))})`}
              </button>
            </div>
          )}

          {requests.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-700">요청 내역</div>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {requests.map((r) => (
                  <li key={r.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900">
                        {PLAN_LABEL[r.plan]} · {won(r.amount)}
                      </div>
                      <div className="text-slate-500">
                        요청 {ymd(r.created_at)}
                        {r.status === 'approved' && ` · ${ymd(r.period_to)}까지`}
                        {r.status === 'rejected' && r.reject_reason && ` · ${r.reject_reason}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={r.status} />
                      {r.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() => setReceiptId(r.id)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3" />
                          영수증
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {onUseKey && (
            <button type="button" onClick={onUseKey} className="w-full text-[11px] font-bold text-slate-500 hover:text-indigo-700 flex items-center justify-center gap-1">
              <KeyRound className="w-3 h-3" />
              관리자에게 인증키를 따로 받았다면 여기에 입력
            </button>
          )}
        </div>
      </div>
      <ReceiptModal requestId={receiptId} onClose={() => setReceiptId(null)} />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────
// 최고관리자: 연장 요청 처리 + 요금 설정
// ────────────────────────────────────────────────────────────────

type ConfirmFn = (
  state: { tone: 'danger' | 'warning' | 'primary'; title: string; lines: React.ReactNode[]; confirmLabel: string },
  action: () => Promise<unknown>,
  successText: string
) => void;

const SETTING_FIELDS: { key: keyof BillingSettings; label: string; placeholder?: string; type?: 'number' }[] = [
  { key: 'price_month', label: '1개월 요금(원)', type: 'number', placeholder: '예: 30000' },
  { key: 'price_year', label: '1년 요금(원)', type: 'number', placeholder: '예: 300000' },
  { key: 'bank_name', label: '입금 은행', placeholder: '예: 국민은행' },
  { key: 'bank_account', label: '계좌번호' },
  { key: 'bank_holder', label: '예금주' },
  { key: 'issuer_name', label: '영수증 발행자 상호' },
  { key: 'issuer_biz_no', label: '사업자등록번호' },
  { key: 'issuer_ceo', label: '대표자' },
  { key: 'issuer_address', label: '주소' },
  { key: 'issuer_contact', label: '연락처' },
];

export const SuperExtensionRequests: React.FC<{
  ask: ConfirmFn;
  reloadKey: number; // 바뀌면 다시 불러온다
  onChanged: () => void;
  onNotice: (n: { type: 'success' | 'error'; text: string }) => void;
}> = ({ ask, reloadKey, onChanged, onNotice }) => {
  const [requests, setRequests] = useState<ExtensionRequest[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ExtensionRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([api.getAllExtensionRequests(), api.getBillingSettings()]);
      setRequests(list);
      setSettings(s);
      setDraft(Object.fromEntries(SETTING_FIELDS.map((f) => [f.key, String(s[f.key] ?? '') === '0' ? '' : String(s[f.key] ?? '')])));
      if (!s.price_month && !s.price_year) setSettingsOpen(true);
    } catch (err: any) {
      onNotice({ type: 'error', text: err.message || '연장 요청을 불러오지 못했습니다.' });
    }
  }, [onNotice]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const pending = requests.filter((r) => r.status === 'pending');
  const done = requests.filter((r) => r.status !== 'pending');

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload: Partial<BillingSettings> = {};
      for (const f of SETTING_FIELDS) {
        const v = (draft[f.key] || '').trim();
        (payload as any)[f.key] = f.type === 'number' ? Number(v.replace(/[^0-9]/g, '') || 0) : v;
      }
      const s = await api.saveBillingSettings(payload);
      setSettings(s);
      onNotice({ type: 'success', text: '요금·입금 계좌·영수증 정보를 저장했습니다.' });
    } catch (err: any) {
      onNotice({ type: 'error', text: err.message || '저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  const approve = (r: ExtensionRequest) =>
    ask(
      {
        tone: 'primary',
        title: '입금을 확인하고 연장할까요?',
        lines: [
          <>
            <strong className="text-slate-900">{r.email}</strong> ({r.company_name})
          </>,
          <>
            {PLAN_LABEL[r.plan]} · <strong className="text-indigo-700">{won(r.amount)}</strong> · 입금자명 <strong>{r.depositor_name}</strong>
          </>,
          '통장에 위 금액이 들어온 것을 확인한 뒤 눌러 주세요. 승인하면 바로 기간이 연장되고 사용자가 영수증을 받을 수 있습니다.',
        ],
        confirmLabel: '입금 확인 · 연장',
      },
      async () => {
        await api.approveExtensionRequest(r.id);
        await load();
        onChanged();
      },
      `${r.company_name} 사용 기간을 ${PLAN_LABEL[r.plan]} 연장했습니다.`
    );

  const submitReject = async () => {
    if (!rejecting) return;
    try {
      await api.rejectExtensionRequest(rejecting.id, rejectReason);
      onNotice({ type: 'success', text: `${rejecting.company_name}의 연장 요청을 반려했습니다.` });
      setRejecting(null);
      setRejectReason('');
      await load();
      onChanged();
    } catch (err: any) {
      onNotice({ type: 'error', text: err.message || '반려에 실패했습니다.' });
    }
  };

  const th = 'px-3 py-2.5 text-left text-[11px] font-black text-slate-500 whitespace-nowrap';
  const td = 'px-3 py-2.5 align-middle';
  const rows = showDone ? [...pending, ...done] : pending;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Bell className={`w-4 h-4 ${pending.length ? 'text-rose-500' : 'text-slate-400'}`} />
          연장 요청
          {pending.length > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[11px] font-black">{pending.length}건 대기</span>}
        </h2>
        <div className="flex items-center gap-2">
          {done.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
            >
              {showDone ? '처리된 요청 숨기기' : `처리된 요청 보기 (${done.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" />
            요금·계좌 설정
          </button>
        </div>
      </div>

      {settingsOpen && settings && (
        <div className="p-4 border-b border-slate-100 bg-slate-50/60 space-y-3">
          {!settings.price_month && !settings.price_year && (
            <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              요금을 입력해야 사용자가 연장 요청을 할 수 있습니다.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {SETTING_FIELDS.map((f) => (
              <label key={f.key} className="space-y-1">
                <span className="block text-[11px] font-bold text-slate-600">{f.label}</span>
                <input
                  value={draft[f.key] || ''}
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-indigo-600"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black disabled:opacity-50"
            >
              {saving ? '저장 중...' : '설정 저장'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className={th}>요청일</th>
              <th className={th}>회원이메일(회사명)</th>
              <th className={th}>기간</th>
              <th className={`${th} text-right`}>금액</th>
              <th className={th}>입금자명</th>
              <th className={th}>상태</th>
              <th className={`${th} text-center`}>처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.status === 'pending' ? 'bg-amber-50/40' : ''}>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{ymd(r.created_at)}</td>
                <td className={td}>
                  <div className="font-bold text-slate-900 break-all">{r.email}</div>
                  <div className="text-slate-500">({r.company_name})</div>
                </td>
                <td className={`${td} whitespace-nowrap`}>{PLAN_LABEL[r.plan]}</td>
                <td className={`${td} text-right whitespace-nowrap font-black text-slate-900`}>{won(r.amount)}</td>
                <td className={`${td} font-bold text-slate-800`}>{r.depositor_name}</td>
                <td className={td}>
                  <StatusBadge status={r.status} />
                  {r.status === 'approved' && <div className="text-[11px] text-slate-500 mt-0.5">{ymd(r.period_to)}까지</div>}
                </td>
                <td className={`${td} text-center whitespace-nowrap`}>
                  {r.status === 'pending' ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => approve(r)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-black border bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                      >
                        입금 확인 · 연장
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejecting(r);
                          setRejectReason('');
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-black border bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                      >
                        반려
                      </button>
                    </div>
                  ) : r.status === 'approved' ? (
                    <button
                      type="button"
                      onClick={() => setReceiptId(r.id)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-indigo-50 text-indigo-700 border-indigo-200"
                    >
                      영수증
                    </button>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400 text-sm">
                  처리할 연장 요청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-[100] bg-slate-950/50 flex items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-rose-100 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <h3 className="text-base font-black text-slate-900">연장 요청을 반려할까요?</h3>
                <div className="text-sm text-slate-600">
                  {rejecting.email} ({rejecting.company_name}) · {won(rejecting.amount)}
                </div>
              </div>
            </div>
            <input
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={200}
              placeholder="반려 사유 (사용자에게 보임, 선택)"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-rose-500"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRejecting(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">
                취소
              </button>
              <button type="button" onClick={submitReject} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-sm font-black text-white">
                반려
              </button>
            </div>
          </div>
        </div>
      )}

      <ReceiptModal requestId={receiptId} onClose={() => setReceiptId(null)} />
    </div>
  );
};
