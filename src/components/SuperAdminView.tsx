/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 슈퍼 관리자 패널 — leo100b의 AdminPanelModal(회원 라이선스 / 인증키 목록)을 돈돈에 맞게 옮긴 화면.
// 최고관리자가 인증키를 발급하고, 인증한 회사(대표 관리자)의 라이선스를 조회·중지·연장·삭제한다.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  Key,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import { AuthKey, LicenseRow, LicenseState } from '../types';

type AdminTab = 'users' | 'keys';
type AuthKeyRow = AuthKey & { company_name?: string };

const DURATION_OPTIONS = [
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
  { days: 180, label: '180일' },
  { days: 365, label: '1년' },
];

const STATE_BADGES: Record<LicenseState, { label: string; className: string }> = {
  active: { label: '활성 (정상)', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  expired: { label: '기간 만료', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  suspended: { label: '중지됨', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  none: { label: '없음', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR') : '-');

const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));

// CSV 셀 하나를 안전하게 감싼다 (쉼표·따옴표·줄바꿈, 엑셀 수식 주입 방지)
const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const SuperAdminView: React.FC = () => {
  const [adminTab, setAdminTab] = useState<AdminTab>('users');
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [authKeys, setAuthKeys] = useState<AuthKeyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // 삭제는 실수 방지를 위해 한 번 더 눌러야 실행된다
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || '데이터를 불러오지 못했습니다.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 작업 하나를 실행하고 목록을 다시 불러온다
  const runAction = async (id: string, action: () => Promise<unknown>, successText: string) => {
    setBusyId(id);
    setConfirmDeleteId(null);
    try {
      await action();
      setNotice({ type: 'success', text: successText });
      await refresh();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || '작업에 실패했습니다.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleGenerateKey = () =>
    runAction(
      'new-key',
      async () => {
        const key = await api.createAuthKey({ duration_days: newKeyDays, memo: newKeyMemo.trim() || undefined });
        setNewKeyMemo('');
        setAdminTab('keys');
        handleCopy(key.id);
      },
      '새 인증키가 발급되어 클립보드에 복사되었습니다.'
    );

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(text);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportCSV = () => {
    const rows =
      adminTab === 'users'
        ? [
            ['회사명', '회사코드', '대표 관리자', '이메일', '상태', '만료일', '적용 인증키', '소속 인원', '등록일'],
            ...licenses.map((l) => [
              l.company_name,
              l.company_code,
              l.user_name,
              l.email,
              STATE_BADGES[l.state].label,
              formatDate(l.expires_at),
              l.key,
              l.member_count,
              formatDate(l.created_at),
            ]),
          ]
        : [
            ['인증키', '유효 기간(일)', '사용 여부', '사용 계정', '사용 회사', '메모', '발급일', '사용일'],
            ...authKeys.map((k) => [
              k.id,
              k.duration_days,
              k.status === 'used' ? '사용 완료' : '미사용',
              k.used_by_email || '',
              k.company_name || '',
              k.memo || '',
              formatDate(k.created_at),
              k.used_at ? formatDate(k.used_at) : '',
            ]),
          ];
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${adminTab === 'users' ? 'licenses' : 'auth_keys'}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredLicenses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return licenses;
    return licenses.filter((l) =>
      [l.company_name, l.company_code, l.email, l.user_name, l.key].some((v) => (v || '').toLowerCase().includes(term))
    );
  }, [licenses, searchTerm]);

  const filteredKeys = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return authKeys;
    return authKeys.filter((k) =>
      [k.id, k.used_by_email, k.company_name, k.memo].some((v) => (v || '').toLowerCase().includes(term))
    );
  }, [authKeys, searchTerm]);

  const unusedKeyCount = authKeys.filter((k) => k.status === 'unused').length;
  const activeCount = licenses.filter((l) => l.state === 'active').length;

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
            <p className="text-xs text-slate-500 mt-0.5">회사별 라이선스 현황 조회, 중지·연장 및 인증키 발급·관리</p>
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
          { label: '등록 회사', value: licenses.length },
          { label: '사용 중 (정상)', value: activeCount },
          { label: '만료·중지', value: licenses.length - activeCount },
          { label: '미사용 인증키', value: unusedKeyCount },
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

      {/* 인증키 발급 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-end gap-3">
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
          <label className="block text-[11px] font-bold text-slate-600">메모 (누구에게 줄 키인지 — 선택)</label>
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
          disabled={busyId === 'new-key'}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          {DURATION_OPTIONS.find((o) => o.days === newKeyDays)?.label} 인증키 발급
        </button>
      </div>

      {/* Tabs + Search */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdminTab('users')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-colors ${
                adminTab === 'users' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              회원 라이선스 ({licenses.length})
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('keys')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-colors ${
                adminTab === 'keys' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Key className="w-4 h-4" />
              인증키 목록 ({authKeys.length})
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={adminTab === 'users' ? '회사명, 이메일, 키 검색...' : '인증키, 이메일, 메모 검색...'}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-indigo-600 w-full sm:w-56"
            />
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 flex items-center gap-1.5 shrink-0"
              title="CSV 파일로 다운로드"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">CSV 내보내기</span>
            </button>
          </div>
        </div>

        {isLoading && licenses.length === 0 && authKeys.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
            <RefreshCw className="w-7 h-7 animate-spin text-indigo-600" />
            <p className="text-sm font-bold">데이터를 불러오는 중입니다...</p>
          </div>
        ) : adminTab === 'users' ? (
          filteredLicenses.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-bold">등록된 라이선스 회원이 없습니다.</p>
              <p className="text-xs">인증키를 발급해 회사 대표에게 전달하면, 인증 후 여기에 표시됩니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-bold text-[11px] bg-slate-50/60">
                    <th className="py-2.5 px-4">회사 / 대표 관리자</th>
                    <th className="py-2.5 px-3">상태</th>
                    <th className="py-2.5 px-3">만료일</th>
                    <th className="py-2.5 px-3">적용 인증키</th>
                    <th className="py-2.5 px-4 text-right">관리 작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLicenses.map((lic) => {
                    const badge = STATE_BADGES[lic.state];
                    const left = daysLeft(lic.expires_at);
                    const isBusy = busyId === lic.id;
                    return (
                      <tr key={lic.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 text-sm">{lic.company_name}</div>
                          <div className="text-[11px] text-slate-600">
                            {lic.user_name} · {lic.email}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {lic.company_code} · 소속 {lic.member_count}명
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatDate(lic.expires_at)}</span>
                          </div>
                          {lic.state === 'active' && (
                            <div className={`text-[10px] mt-0.5 ${left <= 7 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>{left}일 남음</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-[11px] font-mono whitespace-nowrap">{lic.key || '-'}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                runAction(
                                  lic.id,
                                  () => api.updateLicense(lic.id, { status: lic.status === 'active' ? 'suspended' : 'active' }),
                                  lic.status === 'active' ? '라이선스를 중지했습니다.' : '라이선스를 다시 활성화했습니다.'
                                )
                              }
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-50 whitespace-nowrap ${
                                lic.status === 'active'
                                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {lic.status === 'active' ? '중지' : '활성화'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runAction(lic.id, () => api.updateLicense(lic.id, { extend_days: 30 }), '30일 연장했습니다.')}
                              className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              +30일 연장
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runAction(lic.id, () => api.updateLicense(lic.id, { extend_days: 365 }), '1년 연장했습니다.')}
                              className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              +1년
                            </button>
                            {confirmDeleteId === lic.id ? (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => runAction(lic.id, () => api.deleteLicense(lic.id), '라이선스를 삭제했습니다. 회사 자료는 그대로 남아 있습니다.')}
                                className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold whitespace-nowrap"
                              >
                                삭제 확인
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteId(lic.id)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors disabled:opacity-50"
                                title="라이선스 삭제 (회사 자료는 유지, 사용만 차단)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : filteredKeys.length === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-sm font-bold">생성된 인증키가 없습니다. 위의 [인증키 발급] 버튼을 눌러보세요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 font-bold text-[11px] bg-slate-50/60">
                  <th className="py-2.5 px-4">인증키</th>
                  <th className="py-2.5 px-3">유효 기간</th>
                  <th className="py-2.5 px-3">사용 여부</th>
                  <th className="py-2.5 px-3">사용 계정 / 회사</th>
                  <th className="py-2.5 px-3">메모</th>
                  <th className="py-2.5 px-4 text-right">관리 작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredKeys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-700 tracking-wider text-xs whitespace-nowrap">{k.id}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(k.id)}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors"
                          title="인증키 복사"
                        >
                          {copiedKey === k.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">발급 {formatDate(k.created_at)}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{k.duration_days}일</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${
                          k.status === 'used' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {k.status === 'used' ? '사용 완료' : '미사용 (사용 가능)'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 text-[11px]">
                      {k.status === 'used' ? (
                        <>
                          <div>{k.used_by_email || '-'}</div>
                          <div className="text-slate-400">
                            {k.company_name || ''} {k.used_at ? `· ${formatDate(k.used_at)}` : ''}
                          </div>
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600 text-[11px]">{k.memo || '-'}</td>
                    <td className="py-3 px-4 text-right">
                      {confirmDeleteId === k.id ? (
                        <button
                          type="button"
                          disabled={busyId === k.id}
                          onClick={() => runAction(k.id, () => api.deleteAuthKey(k.id), '인증키를 폐기했습니다.')}
                          className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold whitespace-nowrap"
                        >
                          폐기 확인
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(k.id)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors"
                          title={k.status === 'used' ? '기록 삭제 (이미 적용된 라이선스는 유지)' : '인증키 폐기'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-500">
          총 <strong className="text-slate-900">{licenses.length}</strong>개 회사 / <strong className="text-slate-900">{authKeys.length}</strong>개 인증키
        </div>
      </div>
    </div>
  );
};
