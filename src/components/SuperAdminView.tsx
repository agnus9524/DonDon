/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 슈퍼 관리자 패널
// 최고관리자가 인증키를 발급하고, 회원(회사 대표) 라이선스를 한 목록에서 조회·메모·정지·연장·삭제·대표 변경한다.
// 아직 아무도 쓰지 않은 인증키도 같은 목록에 "미사용 키"로 보인다.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, Copy, Download, Plus, RefreshCw, Search, ShieldCheck, UserCog, X } from 'lucide-react';
import { api } from '../api/client';
import { AuthKey, LicenseRow, LicenseState } from '../types';
import { SuperExtensionRequests } from './ExtensionViews';

type AuthKeyRow = AuthKey & { company_name?: string };

const DURATION_OPTIONS = [
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
  { days: 180, label: '180일' },
  { days: 365, label: '1년' },
];

const STATE_BADGES: Record<LicenseState, { label: string; className: string }> = {
  active: { label: '사용 중', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  expired: { label: '만료', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  suspended: { label: '정지', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  none: { label: '없음', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));

// CSV 셀 하나를 안전하게 감싼다 (쉼표·따옴표·줄바꿈, 엑셀 수식 주입 방지)
const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

// ────────────────────────────────────────────────────────────────
// 확인 창 (정지·연장·삭제·대표 변경 공통)
// ────────────────────────────────────────────────────────────────

interface ConfirmState {
  tone: 'danger' | 'warning' | 'primary';
  title: string;
  lines: React.ReactNode[];
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
}

const TONE_STYLES = {
  danger: { icon: 'bg-rose-100 text-rose-600', button: 'bg-rose-600 hover:bg-rose-700' },
  warning: { icon: 'bg-amber-100 text-amber-600', button: 'bg-amber-500 hover:bg-amber-600' },
  primary: { icon: 'bg-indigo-100 text-indigo-600', button: 'bg-indigo-600 hover:bg-indigo-700' },
};

const ConfirmDialog: React.FC<{ state: ConfirmState; busy: boolean; onClose: () => void }> = ({ state, busy, onClose }) => {
  const style = TONE_STYLES[state.tone];
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${style.icon}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h3 className="text-base font-black text-slate-900">{state.title}</h3>
            {state.lines.map((line, i) => (
              <div key={i} className="text-sm text-slate-600 leading-relaxed break-words">
                {line}
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => state.onConfirm()}
            disabled={busy}
            className={`px-4 py-2 rounded-xl text-sm font-black text-white disabled:opacity-50 ${style.button}`}
          >
            {busy ? '처리 중...' : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────
// 메모 칸: 클릭하면 바로 입력, Enter/바깥 클릭 저장, Esc 취소
// ────────────────────────────────────────────────────────────────

const MemoCell: React.FC<{ value?: string; onSave: (memo: string) => Promise<void> }> = ({ value, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value || '');
  }, [value, editing]);

  const commit = async () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    setEditing(false);
    if (draft.trim() === (value || '').trim()) return;
    setSaving(true);
    try {
      await onSave(draft.trim());
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={200}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            setDraft(value || '');
            setEditing(false);
          }
        }}
        placeholder="메모 입력 후 Enter"
        className="w-full min-w-[9rem] px-2 py-1 rounded-md border border-indigo-400 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="클릭해서 메모 작성"
      className="w-full min-w-[9rem] text-left px-2 py-1 rounded-md border border-transparent hover:border-slate-300 hover:bg-white text-xs"
    >
      {saving ? <span className="text-slate-400">저장 중...</span> : value ? <span className="text-slate-800 break-words">{value}</span> : <span className="text-slate-300">+ 메모</span>}
    </button>
  );
};

// ────────────────────────────────────────────────────────────────
// 대표 변경 창 (대표가 퇴사해 직접 인계할 수 없을 때 최고관리자가 대신)
// ────────────────────────────────────────────────────────────────

const OwnerChangeDialog: React.FC<{
  license: LicenseRow;
  onClose: () => void;
  onPick: (member: { id: string; email: string; name: string }) => void;
}> = ({ license, onClose, onPick }) => (
  <div className="fixed inset-0 z-[90] bg-slate-950/50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900">대표 변경 — {license.company_name}</h3>
          <p className="text-xs text-slate-500 mt-1">
            현재 대표: <strong className="text-slate-700">{license.email}</strong>
            <br />이 회사에 소속된(승인된) 구성원 중에서 새 대표를 고르세요. 인증키·만료일은 그대로 넘어갑니다.
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
          <X className="w-4 h-4" />
        </button>
      </div>
      {license.members.length === 0 ? (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
          넘겨받을 수 있는 구성원이 없습니다. 새 대표가 될 사람이 먼저 회사 코드 <strong className="font-mono">{license.company_code}</strong>
          로 가입 신청하고 승인을 받아야 합니다.
        </div>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {license.members.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onPick(m)} className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900 truncate">{m.name || m.email}</span>
                  <span className="block text-xs text-slate-500 truncate">{m.email}</span>
                </span>
                <span className="text-xs font-bold text-indigo-600 shrink-0">선택</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────

export const SuperAdminView: React.FC<{ onActivity?: () => void }> = ({ onActivity }) => {
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [authKeys, setAuthKeys] = useState<AuthKeyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [ownerTarget, setOwnerTarget] = useState<LicenseRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 인증키 발급 옵션
  const [newKeyDays, setNewKeyDays] = useState(30);
  const [newKeyMemo, setNewKeyMemo] = useState('');

  // 데이터 저장 상태 (배포 때 데이터가 지워지는 상태인지 경고)
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof api.getStorageStatus>> | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [lics, keys, storageStatus] = await Promise.all([
        api.getLicenses(),
        api.getAuthKeys(),
        api.getStorageStatus().catch(() => null),
      ]);
      setLicenses(lics);
      setAuthKeys(keys);
      setStorage(storageStatus);
      setReloadKey((k) => k + 1);
      onActivity?.();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || '데이터를 불러오지 못했습니다.' });
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(text);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  // 확인 창에서 "확인"을 누르면 실행된다
  const ask = (state: Omit<ConfirmState, 'onConfirm'>, action: () => Promise<unknown>, successText: string) => {
    setConfirm({
      ...state,
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          await action();
          setNotice({ type: 'success', text: successText });
          await refresh();
        } catch (err: any) {
          setNotice({ type: 'error', text: err.message || '작업에 실패했습니다.' });
        } finally {
          setConfirmBusy(false);
          setConfirm(null);
        }
      },
    });
  };

  const handleGenerateKey = async () => {
    setIsIssuing(true);
    try {
      const key = await api.createAuthKey({ duration_days: newKeyDays, memo: newKeyMemo.trim() || undefined });
      setNewKeyMemo('');
      setNewKey(key.id);
      handleCopy(key.id);
      setNotice(null);
      await refresh();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || '인증키 발급에 실패했습니다.' });
    } finally {
      setIsIssuing(false);
    }
  };

  const saveMemo = async (id: string, memo: string) => {
    try {
      const updated = await api.updateLicense(id, { memo });
      setLicenses((prev) => prev.map((l) => (l.id === id ? { ...l, memo: updated.memo } : l)));
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || '메모 저장에 실패했습니다.' });
    }
  };

  const who = (l: LicenseRow) => (
    <>
      <strong className="text-slate-900">{l.email}</strong> ({l.company_name})
    </>
  );

  const askSuspend = (l: LicenseRow) =>
    l.status === 'suspended'
      ? ask(
          { tone: 'primary', title: '정지를 해제할까요?', lines: [who(l), '해제하면 이 회사의 모든 구성원이 바로 다시 사용할 수 있습니다.'], confirmLabel: '정지 해제' },
          () => api.updateLicense(l.id, { status: 'active' }),
          `${l.company_name} 라이선스 정지를 해제했습니다.`
        )
      : ask(
          {
            tone: 'warning',
            title: '이 라이선스를 정지할까요?',
            lines: [who(l), '정지하면 대표와 소속 직원 모두 즉시 프로그램을 사용할 수 없습니다. 데이터는 지워지지 않으며 언제든 해제할 수 있습니다.'],
            confirmLabel: '정지',
          },
          () => api.updateLicense(l.id, { status: 'suspended' }),
          `${l.company_name} 라이선스를 정지했습니다.`
        );

  const askExtend = (l: LicenseRow) => {
    const base = Math.max(Date.now(), new Date(l.expires_at).getTime());
    const next = new Date(base + 30 * 24 * 60 * 60 * 1000).toISOString();
    ask(
      {
        tone: 'primary',
        title: '30일 연장할까요?',
        lines: [who(l), <>만료일 {formatDate(l.expires_at)} → <strong className="text-indigo-700">{formatDate(next)}</strong></>],
        confirmLabel: '+30일 연장',
      },
      () => api.updateLicense(l.id, { extend_days: 30 }),
      `${l.company_name} 라이선스를 30일 연장했습니다.`
    );
  };

  const askDelete = (l: LicenseRow) =>
    ask(
      {
        tone: 'danger',
        title: '라이선스를 삭제할까요?',
        lines: [
          who(l),
          '삭제하면 이 회사는 즉시 사용할 수 없게 되고, 대표가 새 인증키를 넣어야 다시 사용할 수 있습니다. (회사의 회계 데이터는 지워지지 않습니다)',
          <strong className="text-rose-600">이 작업은 되돌릴 수 없습니다.</strong>,
        ],
        confirmLabel: '삭제',
      },
      () => api.deleteLicense(l.id),
      `${l.company_name} 라이선스를 삭제했습니다.`
    );

  const askDeleteKey = (k: AuthKeyRow) =>
    ask(
      {
        tone: 'danger',
        title: '미사용 인증키를 삭제할까요?',
        lines: [<span className="font-mono font-bold text-slate-900">{k.id}</span>, '삭제한 키는 더 이상 인증에 쓸 수 없습니다.'],
        confirmLabel: '삭제',
      },
      () => api.deleteAuthKey(k.id),
      '인증키를 삭제했습니다.'
    );

  const askTransfer = (l: LicenseRow, m: { id: string; email: string; name: string }) => {
    setOwnerTarget(null);
    ask(
      {
        tone: 'warning',
        title: '회사 대표를 변경할까요?',
        lines: [
          <>회사: <strong className="text-slate-900">{l.company_name}</strong></>,
          <>{l.email} → <strong className="text-indigo-700">{m.email}</strong></>,
          '새 대표가 인증키·만료일을 그대로 넘겨받고 대표 관리자 권한을 갖습니다. 이전 대표의 소속은 새 대표가 사용자 관리에서 정지할 수 있습니다.',
        ],
        confirmLabel: '대표 변경',
      },
      () => api.adminTransferLicense(l.id, m.id),
      `${l.company_name}의 대표를 ${m.email}(으)로 변경했습니다.`
    );
  };

  const unusedKeys = useMemo(() => authKeys.filter((k) => k.status === 'unused'), [authKeys]);

  const term = searchTerm.trim().toLowerCase();
  const filteredLicenses = useMemo(
    () =>
      term
        ? licenses.filter((l) => [l.company_name, l.company_code, l.email, l.user_name, l.key, l.memo].some((v) => (v || '').toLowerCase().includes(term)))
        : licenses,
    [licenses, term]
  );
  const filteredUnused = useMemo(
    () => (term ? unusedKeys.filter((k) => [k.id, k.memo].some((v) => (v || '').toLowerCase().includes(term))) : unusedKeys),
    [unusedKeys, term]
  );

  const handleExportCSV = () => {
    const rows = [
      ['회원이메일', '회사명', '인증키', '상태', '시작날짜', '만료날짜', '남은일수', '메모'],
      ...licenses.map((l) => [
        l.email,
        l.company_name,
        l.key,
        STATE_BADGES[l.state].label,
        formatDate(l.created_at),
        formatDate(l.expires_at),
        Math.max(0, daysLeft(l.expires_at)),
        l.memo || '',
      ]),
      ...unusedKeys.map((k) => ['', '', k.id, '미사용 키', '', '', `${k.duration_days}일권`, k.memo || '']),
    ];
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `licenses_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeCount = licenses.filter((l) => l.state === 'active').length;
  const th = 'px-3 py-2.5 text-left text-[11px] font-black text-slate-500 whitespace-nowrap';
  const td = 'px-3 py-2.5 align-middle';
  const actionBtn = 'px-2.5 py-1 rounded-lg text-[11px] font-black border transition-colors whitespace-nowrap disabled:opacity-40';

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-amber-300 flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">슈퍼 관리자 패널</h1>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-slate-950">SUPER ADMIN</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">인증키 발급, 회원 라이선스 조회·정지·연장·삭제</p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isLoading}
          className="self-start sm:self-auto px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 데이터 저장 상태 */}
      {storage && (storage.ephemeral || storage.last_error) && (
        <div className="p-4 rounded-2xl border-2 border-rose-300 bg-rose-50 text-rose-900 text-sm space-y-1">
          <div className="font-black flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            {storage.last_error ? '데이터 저장에 실패하고 있습니다' : '데이터가 영구 저장되지 않는 상태입니다'}
          </div>
          <p className="text-xs leading-relaxed">
            {storage.last_error
              ? `최근 저장 오류: ${storage.last_error}`
              : '지금은 회사·라이선스·전표가 서버 내부 파일에만 저장되어, 새로 배포하면 모두 지워집니다. 배포 서비스의 환경변수에 FIREBASE_SERVICE_ACCOUNT를 설정해 Firestore 저장으로 바꿔 주세요.'}
          </p>
        </div>
      )}
      {storage && !storage.ephemeral && !storage.last_error && (
        <div className="px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>데이터 저장: {storage.mode === 'firestore' ? 'Firestore (배포해도 유지)' : storage.description}</span>
          {storage.last_saved_at && <span className="text-emerald-700/80">마지막 저장 {new Date(storage.last_saved_at).toLocaleString('ko-KR')}</span>}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '등록 회원(회사)', value: licenses.length },
          { label: '사용 중', value: activeCount },
          { label: '만료·정지', value: licenses.length - activeCount },
          { label: '미사용 인증키', value: unusedKeys.length },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
            <div className="text-[11px] font-semibold text-slate-500">{stat.label}</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{stat.value}</div>
          </div>
        ))}
      </div>

      {notice && (
        <div
          className={`p-3.5 rounded-xl border text-sm font-semibold flex items-center justify-between gap-3 ${
            notice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="text-xs underline shrink-0">
            닫기
          </button>
        </div>
      )}

      {/* 연장 요청 (사용자가 요청 → 입금 확인 후 승인) */}
      <SuperExtensionRequests ask={ask} reloadKey={reloadKey} onChanged={refresh} onNotice={setNotice} />

      {/* 인증키 발급 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-600">유효 기간</label>
            <div className="flex gap-1.5">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setNewKeyDays(opt.days)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                    newKeyDays === opt.days ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <label className="block text-[11px] font-bold text-slate-600">메모 (누구에게 줄 키인지 — 인증하면 회원 메모로 옮겨짐)</label>
            <input
              value={newKeyMemo}
              onChange={(e) => setNewKeyMemo(e.target.value)}
              maxLength={100}
              placeholder="예: ○○상사 김대표"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-indigo-600"
            />
          </div>
          <button
            type="button"
            onClick={handleGenerateKey}
            disabled={isIssuing}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            {DURATION_OPTIONS.find((o) => o.days === newKeyDays)?.label} 인증키 발급
          </button>
        </div>
        {newKey && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-xs font-bold text-emerald-800">새 인증키</span>
            <span className="font-mono text-base font-black text-slate-900 tracking-wider">{newKey}</span>
            <button
              type="button"
              onClick={() => handleCopy(newKey)}
              className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-xs font-bold text-emerald-700 flex items-center gap-1"
            >
              {copiedKey === newKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === newKey ? '복사됨' : '복사'}
            </button>
            <button type="button" onClick={() => setNewKey(null)} className="ml-auto text-emerald-700/70 hover:text-emerald-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 회원 라이선스 목록 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-black text-slate-900">
            회원 라이선스 목록 <span className="text-slate-400 font-bold">({licenses.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="이메일·회사명·인증키·메모 검색"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 shrink-0"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={th}>회원이메일(회사명)</th>
                <th className={th}>인증키</th>
                <th className={th}>상태</th>
                <th className={th}>시작날짜</th>
                <th className={th}>만료날짜</th>
                <th className={`${th} text-right`}>남은일수</th>
                <th className={th}>메모</th>
                <th className={`${th} text-center`}>정지</th>
                <th className={`${th} text-center`}>+30일</th>
                <th className={`${th} text-center`}>삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLicenses.map((l) => {
                const left = daysLeft(l.expires_at);
                const badge = STATE_BADGES[l.state];
                return (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className={td}>
                      <div className="font-bold text-slate-900 break-all">{l.email}</div>
                      <div className="text-slate-500 flex items-center gap-2 flex-wrap">
                        <span>({l.company_name})</span>
                        <button
                          type="button"
                          onClick={() => setOwnerTarget(l)}
                          className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-0.5"
                        >
                          <UserCog className="w-3 h-3" />
                          대표 변경
                        </button>
                      </div>
                    </td>
                    <td className={td}>
                      <button
                        type="button"
                        onClick={() => handleCopy(l.key)}
                        title="클릭해서 복사"
                        className="font-mono text-[11px] text-slate-700 hover:text-indigo-700 whitespace-nowrap flex items-center gap-1"
                      >
                        {l.key}
                        {copiedKey === l.key ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-300" />}
                      </button>
                    </td>
                    <td className={td}>
                      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{formatDate(l.created_at)}</td>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{formatDate(l.expires_at)}</td>
                    <td className={`${td} text-right whitespace-nowrap font-black ${left <= 0 ? 'text-rose-600' : left <= 7 ? 'text-amber-600' : 'text-slate-900'}`}>
                      {left <= 0 ? '만료' : `${left}일`}
                    </td>
                    <td className={`${td} w-56`}>
                      <MemoCell value={l.memo} onSave={(memo) => saveMemo(l.id, memo)} />
                    </td>
                    <td className={`${td} text-center`}>
                      <button
                        type="button"
                        onClick={() => askSuspend(l)}
                        className={`${actionBtn} ${
                          l.status === 'suspended'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {l.status === 'suspended' ? '해제' : '정지'}
                      </button>
                    </td>
                    <td className={`${td} text-center`}>
                      <button type="button" onClick={() => askExtend(l)} className={`${actionBtn} bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100`}>
                        +30일
                      </button>
                    </td>
                    <td className={`${td} text-center`}>
                      <button type="button" onClick={() => askDelete(l)} className={`${actionBtn} bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100`}>
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* 아직 아무도 인증하지 않은 키 */}
              {filteredUnused.map((k) => (
                <tr key={k.id} className="bg-slate-50/40">
                  <td className={`${td} text-slate-400 italic`}>아직 인증 전</td>
                  <td className={td}>
                    <button
                      type="button"
                      onClick={() => handleCopy(k.id)}
                      title="클릭해서 복사"
                      className="font-mono text-[11px] text-slate-700 hover:text-indigo-700 whitespace-nowrap flex items-center gap-1"
                    >
                      {k.id}
                      {copiedKey === k.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-300" />}
                    </button>
                  </td>
                  <td className={td}>
                    <span className="px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap bg-sky-50 text-sky-700 border-sky-200">미사용 키</span>
                  </td>
                  <td className={`${td} text-slate-400`}>-</td>
                  <td className={`${td} text-slate-400`}>-</td>
                  <td className={`${td} text-right whitespace-nowrap text-slate-500 font-bold`}>{k.duration_days}일권</td>
                  <td className={`${td} text-slate-600 break-words`}>{k.memo || <span className="text-slate-300">-</span>}</td>
                  <td className={td} />
                  <td className={td} />
                  <td className={`${td} text-center`}>
                    <button type="button" onClick={() => askDeleteKey(k)} className={`${actionBtn} bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100`}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}

              {!isLoading && filteredLicenses.length === 0 && filteredUnused.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-slate-400 text-sm">
                    {term ? '검색 결과가 없습니다.' : '아직 등록된 회원이 없습니다. 위에서 인증키를 발급해 전달해 주세요.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {ownerTarget && <OwnerChangeDialog license={ownerTarget} onClose={() => setOwnerTarget(null)} onPick={(m) => askTransfer(ownerTarget, m)} />}
      {confirm && <ConfirmDialog state={confirm} busy={confirmBusy} onClose={() => !confirmBusy && setConfirm(null)} />}
    </div>
  );
};
