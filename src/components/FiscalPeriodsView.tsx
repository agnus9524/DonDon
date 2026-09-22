/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Company, FiscalPeriod } from '../types';
import { Lock, Unlock, CalendarCheck, ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';

interface FiscalPeriodsViewProps {
  currentCompany: Company;
  userRole: string;
}

export const FiscalPeriodsView: React.FC<FiscalPeriodsViewProps> = ({ currentCompany, userRole }) => {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canManageClosing = ['ORG_ADMIN', 'HQ_ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);

  const loadPeriods = async () => {
    try {
      setLoading(true);
      const list = await api.getFiscalPeriods();
      setPeriods(list);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || '회계기간을 불러오지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeriods();
  }, [currentCompany.id]);

  const handleToggle = async (fp: FiscalPeriod) => {
    if (!canManageClosing) {
      alert('회계기간 마감 권한이 없습니다.');
      return;
    }
    const actionName = fp.status === 'OPEN' ? '마감(CLOSED)' : '마감 해제(OPEN)';
    if (!confirm(`${fp.year}년 ${fp.month}월 회계기간을 ${actionName} 처리하시겠습니까?`)) {
      return;
    }

    try {
      setTogglingId(fp.id);
      setMsg(null);
      const updated = await api.toggleFiscalPeriod(fp.id);
      setPeriods((prev) => prev.map((p) => (p.id === fp.id ? updated : p)));
      setMsg({
        type: 'success',
        text: `${fp.year}년 ${fp.month}월이 성공적으로 ${updated.status === 'CLOSED' ? '마감' : '개시'}되었습니다.`,
      });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || '마감 처리 중 오류가 발생했습니다.' });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-600" />
            회계기간 및 마감 관리 (Fiscal Periods)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            월별 회계마감 상태를 관리합니다. 마감(CLOSED)된 기간에는 전표 생성, 수정, 삭제가 엄격히 차단됩니다.
          </p>
        </div>
        <button
          onClick={loadPeriods}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Notice Card */}
      <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
        <ShieldAlert className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
        <div>
          <div className="font-bold">회계기간 마감 원칙 안내</div>
          <div className="mt-0.5 text-amber-800">
            결산이 완료된 월은 회계마감을 진행하여 의도치 않은 거래 전표 변경이나 추가를 예방하세요.
            마감 해제는 본사 관리자(HQ_ACCOUNTANT, ORG_ADMIN) 권한이 필요하며, 모든 변경 내역은 감사 로그(audit_logs)에 영구 기록됩니다.
          </div>
        </div>
      </div>

      {/* Period Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-sm font-bold text-slate-900">
            {currentCompany.company_name} 회계기간 목록
          </div>
          <div className="text-xs text-slate-500">
            총 {periods.length}개 기간
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/70 text-slate-400 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-6 py-3">회계 연월</th>
                <th className="px-6 py-3">상태</th>
                <th className="px-6 py-3">마감 일시</th>
                <th className="px-6 py-3">마감 처리자</th>
                <th className="px-6 py-3 text-right">마감 제어</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periods.map((fp) => {
                const isClosed = fp.status === 'CLOSED';
                return (
                  <tr key={fp.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 text-sm">
                      {fp.year}년 {String(fp.month).padStart(2, '0')}월
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          isClosed
                            ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-200'
                            : 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
                        }`}
                      >
                        {isClosed ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {isClosed ? '마감됨 (CLOSED)' : '진행중 (OPEN)'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {fp.closed_at ? new Date(fp.closed_at).toLocaleString('ko-KR') : '-'}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">
                      {fp.closed_by || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canManageClosing ? (
                        <button
                          disabled={togglingId === fp.id}
                          onClick={() => handleToggle(fp)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs ${
                            isClosed
                              ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                              : 'bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          {togglingId === fp.id ? (
                            '처리 중...'
                          ) : isClosed ? (
                            '마감 해제하기'
                          ) : (
                            '회계마감 확정'
                          )}
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">권한 없음</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {periods.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400">
                    등록된 회계기간이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
