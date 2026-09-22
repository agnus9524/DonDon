/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Company, Team, Account } from '../types';
import { formatKRW, formatNumber } from '../api/client';
import { PiggyBank, Plus, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react';

interface BudgetViewProps {
  currentCompany: Company;
  budgets: any[];
  teams: Team[];
  accounts: Account[];
  userRole: string;
  onRefresh: () => void;
}

export const BudgetView: React.FC<BudgetViewProps> = ({
  currentCompany,
  budgets,
  teams,
  accounts,
  userRole,
  onRefresh,
}) => {
  const [selectedYear, setSelectedYear] = useState(2026);

  const totalAllocated = budgets.reduce((s, b) => s + (b.allocated_amount || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.spent_amount || 0), 0);
  const totalRemaining = totalAllocated - totalSpent;
  const overallRate = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">예산관리 (Budget Control)</h1>
          <p className="text-xs text-slate-500 mt-1">
            {currentCompany.company_name} 부서별 회계 연도 배정 예산 및 실집행률 관리
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold"
          >
            <option value={2026}>2026 회계연도</option>
            <option value={2025}>2025 회계연도</option>
          </select>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">총 배정 예산</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatKRW(totalAllocated)}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">연간 승인 예산 총계</span>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">현재 누적 집행액</span>
          <div className="text-xl font-bold text-rose-600 mt-1">{formatKRW(totalSpent)}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">전표 확정 지출액 합계</span>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">잔여 집행 가능액</span>
          <div className="text-xl font-bold text-emerald-600 mt-1">{formatKRW(totalRemaining)}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">남은 예산</span>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">전사 예산 집행률</span>
          <div className="text-xl font-bold text-indigo-600 mt-1">{overallRate}%</div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full ${overallRate > 90 ? 'bg-rose-500' : overallRate > 70 ? 'bg-amber-500' : 'bg-indigo-600'}`}
              style={{ width: `${Math.min(overallRate, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Budget Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">부서 및 계정별 예산 현황표</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px]">
                <th className="py-2.5 px-4">담당 부서/팀</th>
                <th className="py-2.5 px-4">계정과목</th>
                <th className="py-2.5 px-4 text-right">배정예산 (원)</th>
                <th className="py-2.5 px-4 text-right">실제집행액 (원)</th>
                <th className="py-2.5 px-4 text-right">잔여예산 (원)</th>
                <th className="py-2.5 px-4">집행 진척도</th>
                <th className="py-2.5 px-3 text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {budgets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    등록된 예산 항목이 없습니다.
                  </td>
                </tr>
              ) : (
                budgets.map((b) => {
                  const rate = b.execution_rate || 0;
                  const isExceeded = rate > 100;
                  const isWarning = rate >= 80 && rate <= 100;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">{b.team_name}</td>
                      <td className="py-3 px-4 text-slate-700">{b.account_name}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatNumber(b.allocated_amount)}원
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-rose-600 font-semibold">
                        {formatNumber(b.spent_amount)}원
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-600 font-semibold">
                        {formatNumber(b.remaining_amount)}원
                      </td>
                      <td className="py-3 px-4 w-48">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isExceeded ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-indigo-600'
                              }`}
                              style={{ width: `${Math.min(rate, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-bold w-10 text-right">{rate}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isExceeded ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full font-bold">
                            <AlertTriangle className="w-3 h-3" /> 초과
                          </span>
                        ) : isWarning ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-bold">
                            주의
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                            <CheckCircle className="w-3 h-3" /> 정상
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
