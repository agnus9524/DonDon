/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 라이선스 관문 화면 모음
//  - OnboardingView      : 로그인했지만 소속 회사가 없는 사용자 (인증키로 회사 등록 / 회사 코드로 가입 신청)
//  - LicenseBlockedView  : 소속 회사의 라이선스가 만료·중지·없음 상태일 때
//  - RenewLicenseModal   : 대표 관리자가 사용 중에 새 인증키로 기간을 연장

import React, { useState } from 'react';
import { AlertTriangle, Building2, CheckCircle, Clock, KeyRound, LogOut, UserPlus, X } from 'lucide-react';
import { Company, CompanyLicenseInfo, LicenseState, PendingJoinInfo, User } from '../types';

// 입력을 XXXX-XXXX-XXXX-XXXX 모양으로 정리
export function formatAuthKey(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  return clean.match(/.{1,4}/g)?.join('-') || '';
}

const isCompleteKey = (key: string) => key.replace(/-/g, '').length === 16;

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-indigo-600';

const GateShell: React.FC<{ user: User; onLogout: () => void; children: React.ReactNode }> = ({ user, onLogout, children }) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900">
    <div className="w-full max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3 text-slate-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 bg-indigo-600 text-amber-300 rounded-xl flex items-center justify-center font-black text-lg shrink-0">돈</div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white">돈돈 회계관리 프로그램</div>
            <div className="text-[11px] text-slate-300 truncate">{user.email}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          로그아웃
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────
// 소속 회사가 없는 사용자
// ────────────────────────────────────────────────────────────────

interface OnboardingViewProps {
  user: User;
  pendingRequests: PendingJoinInfo[];
  onActivate: (payload: { key: string; company_name: string; business_number?: string; representative_name?: string }) => Promise<void>;
  onRequestJoin: (payload: { company_code: string; reason: string }) => Promise<void>;
  onLogout: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ user, pendingRequests, onActivate, onRequestJoin, onLogout }) => {
  const [mode, setMode] = useState<'key' | 'join'>('key');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 인증키 등록
  const [key, setKey] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [representativeName, setRepresentativeName] = useState('');

  // 가입 신청
  const [companyCode, setCompanyCode] = useState('');
  const [reason, setReason] = useState('');
  const [joinMessage, setJoinMessage] = useState<string | null>(null);

  const submitKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isCompleteKey(key)) return setError('인증키 16자리를 모두 입력해 주세요.');
    if (!companyName.trim()) return setError('회사명을 입력해 주세요.');
    try {
      setBusy(true);
      await onActivate({
        key,
        company_name: companyName.trim(),
        business_number: businessNumber.trim() || undefined,
        representative_name: representativeName.trim() || undefined,
      });
    } catch (err: any) {
      setError(err.message || '인증에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setJoinMessage(null);
    if (!companyCode.trim()) return setError('회사 코드를 입력해 주세요.');
    try {
      setBusy(true);
      await onRequestJoin({ company_code: companyCode.trim(), reason: reason.trim() });
      setJoinMessage('가입 신청이 접수되었습니다. 대표 관리자가 승인하면 사용할 수 있습니다.');
      setCompanyCode('');
      setReason('');
    } catch (err: any) {
      setError(err.message || '가입 신청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GateShell user={user} onLogout={onLogout}>
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 sm:px-8 pt-6 sm:pt-8">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">프로그램 사용을 시작하려면</h1>
          <p className="text-sm text-slate-600 mt-1">아직 소속된 회사가 없습니다. 아래 두 가지 중 해당하는 방법을 선택해 주세요.</p>

          <div className="grid grid-cols-2 gap-2 mt-5">
            <button
              type="button"
              onClick={() => { setMode('key'); setError(null); }}
              className={`p-3 rounded-xl border-2 text-left transition-all ${mode === 'key' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <KeyRound className={`w-5 h-5 mb-1.5 ${mode === 'key' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <div className="text-sm font-bold">인증키로 회사 등록</div>
              <div className="text-[11px] text-slate-500 mt-0.5">회사 대표 관리자</div>
            </button>
            <button
              type="button"
              onClick={() => { setMode('join'); setError(null); }}
              className={`p-3 rounded-xl border-2 text-left transition-all ${mode === 'join' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <UserPlus className={`w-5 h-5 mb-1.5 ${mode === 'join' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <div className="text-sm font-bold">기존 회사에 가입 신청</div>
              <div className="text-[11px] text-slate-500 mt-0.5">직원 · 회계 담당자</div>
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-4">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm font-semibold">{error}</div>
          )}

          {mode === 'key' ? (
            <form onSubmit={submitKey} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                운영자에게 받은 인증키를 입력하면 회사가 등록되고, 지금 로그인한 계정이 그 회사의{' '}
                <strong className="text-slate-900">대표 관리자</strong>가 되어 회계 프로그램의 모든 기능을 사용할 수 있습니다.
              </p>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">인증키</label>
                <input
                  value={key}
                  onChange={(e) => setKey(formatAuthKey(e.target.value))}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputClass} font-mono tracking-widest text-center text-base`}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">회사명</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="예: 주식회사 돈돈" className={inputClass} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">사업자등록번호 <span className="font-normal text-slate-400">(선택)</span></label>
                  <input value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} placeholder="000-00-00000" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">대표자명 <span className="font-normal text-slate-400">(선택)</span></label>
                  <input value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} placeholder="홍길동" className={inputClass} />
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-50 transition-colors"
              >
                <KeyRound className="w-4 h-4 text-amber-300" />
                {busy ? '인증 중...' : '인증하고 회사 등록하기'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitJoin} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                회사 대표 관리자에게 <strong className="text-slate-900">회사 코드</strong>를 받아 입력해 주세요. 대표 관리자가
                승인하면서 권한을 지정합니다.
              </p>
              {joinMessage && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-semibold flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{joinMessage}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">회사 코드</label>
                <input
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                  placeholder="예: C1A2B3C"
                  autoComplete="off"
                  className={`${inputClass} font-mono tracking-wider`}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">소속 부서 및 신청 사유 <span className="font-normal text-slate-400">(선택)</span></label>
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 재무회계팀 전표 담당자입니다." className={inputClass} />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-50 transition-colors"
              >
                <Building2 className="w-4 h-4 text-amber-300" />
                {busy ? '신청 중...' : '가입 신청 보내기'}
              </button>
            </form>
          )}

          {pendingRequests.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                승인 대기 중인 가입 신청
              </div>
              {pendingRequests.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                  <div className="font-bold text-slate-900">{p.company_name}</div>
                  <div className="text-slate-500 font-mono shrink-0">{p.company_code}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </GateShell>
  );
};

// ────────────────────────────────────────────────────────────────
// 라이선스가 유효하지 않은 회사
// ────────────────────────────────────────────────────────────────

const BLOCK_TITLES: Record<Exclude<LicenseState, 'active'>, string> = {
  none: '라이선스 인증이 필요합니다',
  expired: '라이선스 사용 기간이 만료되었습니다',
  suspended: '라이선스가 중지되었습니다',
};

interface LicenseBlockedViewProps {
  user: User;
  company: Company & { license: CompanyLicenseInfo; my_role?: string };
  otherCompanies: (Company & { license: CompanyLicenseInfo })[];
  onRenew: (key: string) => Promise<void>;
  onSelectCompany: (companyId: string) => void;
  onLogout: () => void;
}

export const LicenseBlockedView: React.FC<LicenseBlockedViewProps> = ({ user, company, otherCompanies, onRenew, onSelectCompany, onLogout }) => {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = company.license.state === 'active' ? 'none' : company.license.state;
  // 새 인증키로 직접 풀 수 있는 사람: 라이선스 소유자, 또는 라이선스가 사라진 회사의 대표 관리자
  const canRenew = state !== 'suspended' && (company.license.is_owner || (state === 'none' && company.my_role === 'ORG_ADMIN'));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isCompleteKey(key)) return setError('인증키 16자리를 모두 입력해 주세요.');
    try {
      setBusy(true);
      await onRenew(key);
    } catch (err: any) {
      setError(err.message || '인증에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GateShell user={user} onLogout={onLogout}>
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">{BLOCK_TITLES[state]}</h1>
            <p className="text-sm text-slate-600 mt-1">
              <strong className="text-slate-900">{company.company_name}</strong>
              {company.license.expires_at && state === 'expired' && (
                <> · 만료일 {new Date(company.license.expires_at).toLocaleDateString('ko-KR')}</>
              )}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-700 leading-relaxed">
          {state === 'suspended'
            ? '운영자가 이 회사의 라이선스를 중지했습니다. 프로그램 운영자에게 문의해 주세요.'
            : canRenew
            ? '운영자에게 새 인증키를 받아 아래에 입력하면 바로 다시 사용할 수 있습니다. 입력해 둔 회계 자료는 그대로 유지됩니다.'
            : '회사의 대표 관리자가 새 인증키로 인증하면 다시 사용할 수 있습니다. 대표 관리자에게 알려 주세요.'}
        </p>

        {canRenew && (
          <form onSubmit={submit} className="space-y-3">
            {error && <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm font-semibold">{error}</div>}
            <input
              value={key}
              onChange={(e) => setKey(formatAuthKey(e.target.value))}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono tracking-widest text-center text-base`}
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-50 transition-colors"
            >
              <KeyRound className="w-4 h-4 text-amber-300" />
              {busy ? '인증 중...' : '새 인증키로 인증하기'}
            </button>
          </form>
        )}

        {otherCompanies.length > 0 && (
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="text-xs font-bold text-slate-700">다른 소속 회사로 이동</div>
            {otherCompanies.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCompany(c.id)}
                className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-left text-sm transition-colors"
              >
                <span className="font-bold">{c.company_name}</span>
                <span className={`text-[11px] font-bold ${c.license.state === 'active' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {c.license.state === 'active' ? '사용 가능' : '사용 불가'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </GateShell>
  );
};

// ────────────────────────────────────────────────────────────────
// 사용 중 기간 연장 (대표 관리자)
// ────────────────────────────────────────────────────────────────

interface RenewLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  expiresAt: string | null;
  onRenew: (key: string) => Promise<void>;
}

export const RenewLicenseModal: React.FC<RenewLicenseModalProps> = ({ isOpen, onClose, companyName, expiresAt, onRenew }) => {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isCompleteKey(key)) return setError('인증키 16자리를 모두 입력해 주세요.');
    try {
      setBusy(true);
      await onRenew(key);
      setKey('');
      onClose();
    } catch (err: any) {
      setError(err.message || '인증에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-slate-900">
        <div className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-300" />
            <h3 className="text-base font-bold">라이선스 기간 연장</h3>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white" aria-label="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-900">{companyName}</strong>의 현재 사용 기한은{' '}
            <strong className="text-slate-900">{expiresAt ? new Date(expiresAt).toLocaleDateString('ko-KR') : '-'}</strong>
            입니다. 새 인증키를 입력하면 남은 기간 뒤에 이어서 연장됩니다.
          </p>
          {error && <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm font-semibold">{error}</div>}
          <input
            value={key}
            onChange={(e) => setKey(formatAuthKey(e.target.value))}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} font-mono tracking-widest text-center text-base`}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-medium">
              취소
            </button>
            <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm disabled:opacity-50">
              {busy ? '인증 중...' : '연장하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
