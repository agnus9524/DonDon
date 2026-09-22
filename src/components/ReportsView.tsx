/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Company, Transaction, Team, Account } from '../types';
import { formatKRW, formatNumber } from '../api/client';
import {
  FileSpreadsheet,
  Printer,
  Calendar,
  Building2,
  TrendingUp,
  TrendingDown,
  Scale,
  Download,
  ChevronRight,
} from 'lucide-react';

interface ReportsViewProps {
  currentCompany: Company;
  transactions: Transaction[];
  teams: Team[];
  accounts: Account[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  currentCompany,
  transactions,
  teams,
  accounts,
}) => {
  const [reportType, setReportType] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUAL'>('MONTHLY');
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(9); // Default 9월 matching prompt

  const teamMap = new Map(teams.map((t) => [t.id, t.team_name]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Monthly filtering
  const monthFilterStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const monthTxs = transactions.filter((t) => t.transaction_date.startsWith(monthFilterStr));

  // Annual filtering
  const yearFilterStr = `${selectedYear}-`;
  const yearTxs = transactions.filter((t) => t.transaction_date.startsWith(yearFilterStr));

  const activeTxs = reportType === 'MONTHLY' ? monthTxs : yearTxs;

  const totalIncome = activeTxs
    .filter((t) => t.transaction_type === 'INCOME')
    .reduce((s, t) => s + t.total_amount, 0);

  const totalExpense = activeTxs
    .filter((t) => t.transaction_type === 'EXPENSE')
    .reduce((s, t) => s + t.total_amount, 0);

  const netBalance = totalIncome - totalExpense;

  // Group by account
  const incomeAccountsMap: Record<string, number> = {};
  const expenseAccountsMap: Record<string, number> = {};

  activeTxs.forEach((t) => {
    const acc = accountMap.get(t.account_id);
    const name = acc ? `[${acc.account_code}] ${acc.account_name}` : '기타 계정';
    if (t.transaction_type === 'INCOME') {
      incomeAccountsMap[name] = (incomeAccountsMap[name] || 0) + t.total_amount;
    } else if (t.transaction_type === 'EXPENSE') {
      expenseAccountsMap[name] = (expenseAccountsMap[name] || 0) + t.total_amount;
    }
  });

  // Group by team
  const teamBreakdown = teams.map((team) => {
    const tTxs = activeTxs.filter((t) => t.team_id === team.id);
    const inc = tTxs.filter((t) => t.transaction_type === 'INCOME').reduce((s, t) => s + t.total_amount, 0);
    const exp = tTxs.filter((t) => t.transaction_type === 'EXPENSE').reduce((s, t) => s + t.total_amount, 0);
    return {
      team_id: team.id,
      team_name: team.team_name,
      income: inc,
      expense: exp,
      net: inc - exp,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">결산보고서 (Financial Statements)</h1>
            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200">
              회사별 독립 결산
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentCompany.company_name}의 독립 회계 데이터를 기반으로 생성된 재무결산 보고서입니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>보고서 인쇄</span>
          </button>
        </div>
      </div>

      {/* Report Controls (Tab + Month Selection) */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setReportType('MONTHLY')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              reportType === 'MONTHLY' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            월간 결산보고서
          </button>
          <button
            onClick={() => setReportType('QUARTERLY')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              reportType === 'QUARTERLY' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            분기 수지보고서
          </button>
          <button
            onClick={() => setReportType('ANNUAL')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              reportType === 'ANNUAL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            연간 결산보고서
          </button>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 font-semibold"
          >
            <option value={2026}>2026년</option>
            <option value={2025}>2025년</option>
          </select>

          {reportType === 'MONTHLY' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 font-semibold"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Statement Paper */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-6">
        {/* Title Area */}
        <div className="text-center border-b border-slate-200 pb-6">
          <div className="text-xs font-bold text-indigo-700 tracking-wider uppercase mb-1">
            don don multi-tenant accounting statement
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            {currentCompany.company_name} {selectedYear}년 {reportType === 'MONTHLY' ? `${selectedMonth}월 ` : ''}수지결산서
          </h2>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-center gap-4">
            <span>사업자등록번호: {currentCompany.business_number}</span>
            <span>•</span>
            <span>대표자: {currentCompany.representative_name}</span>
            <span>•</span>
            <span>기준통화: 대한민국 원 (KRW)</span>
          </div>
        </div>

        {/* Key Summary 3-Box */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-center">
            <span className="text-xs font-semibold text-emerald-800">총 수입 (Revenue/Income)</span>
            <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">
              {formatKRW(totalIncome)}
            </div>
            <span className="text-[11px] text-emerald-600 mt-0.5 block">수입 계정 합계</span>
          </div>

          <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 text-center">
            <span className="text-xs font-semibold text-rose-800">총 지출 (Expenditure/Expense)</span>
            <div className="text-2xl font-black text-rose-700 mt-1 font-mono">
              {formatKRW(totalExpense)}
            </div>
            <span className="text-[11px] text-rose-600 mt-0.5 block">지출 계정 합계</span>
          </div>

          <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 text-center">
            <span className="text-xs font-semibold text-indigo-800">당기 순수지 (차인 잔액)</span>
            <div className={`text-2xl font-black mt-1 font-mono ${netBalance >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
              {formatKRW(netBalance)}
            </div>
            <span className="text-[11px] text-indigo-600 mt-0.5 block">수입 - 지출 이익잉여</span>
          </div>
        </div>

        {/* 2-Column: Account Breakdown (Income vs Expense) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Income Accounts */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-emerald-600 text-white px-4 py-2.5 font-bold text-xs flex items-center justify-between">
              <span>수입 계정과목별 집계</span>
              <span className="font-mono">{formatKRW(totalIncome)}</span>
            </div>
            <div className="p-2 divide-y divide-slate-100 text-xs">
              {Object.keys(incomeAccountsMap).length === 0 ? (
                <div className="py-6 text-center text-slate-400">수입 거래 내역이 없습니다.</div>
              ) : (
                Object.entries(incomeAccountsMap).map(([accName, amt]) => {
                  const pct = totalIncome > 0 ? Math.round((amt / totalIncome) * 100) : 0;
                  return (
                    <div key={accName} className="py-2.5 px-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-800">{accName}</div>
                        <div className="text-[10px] text-slate-400">비중 {pct}%</div>
                      </div>
                      <span className="font-mono font-bold text-slate-900">{formatKRW(amt)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Expense Accounts */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-rose-600 text-white px-4 py-2.5 font-bold text-xs flex items-center justify-between">
              <span>지출 계정과목별 집계</span>
              <span className="font-mono">{formatKRW(totalExpense)}</span>
            </div>
            <div className="p-2 divide-y divide-slate-100 text-xs">
              {Object.keys(expenseAccountsMap).length === 0 ? (
                <div className="py-6 text-center text-slate-400">지출 거래 내역이 없습니다.</div>
              ) : (
                Object.entries(expenseAccountsMap).map(([accName, amt]) => {
                  const pct = totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0;
                  return (
                    <div key={accName} className="py-2.5 px-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-800">{accName}</div>
                        <div className="text-[10px] text-slate-400">비중 {pct}%</div>
                      </div>
                      <span className="font-mono font-bold text-slate-900">{formatKRW(amt)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Team Comparative Section */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-100 px-4 py-2.5 font-bold text-xs text-slate-700 flex items-center justify-between">
            <span>부서/팀별 손익 비교표</span>
            <span className="text-[11px] text-slate-500 font-normal">단위: 원</span>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold text-[11px]">
                <th className="py-2 px-4">부서/팀명</th>
                <th className="py-2 px-4 text-right">수입 총액</th>
                <th className="py-2 px-4 text-right">지출 총액</th>
                <th className="py-2 px-4 text-right">당기 순수지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamBreakdown.map((tb) => (
                <tr key={tb.team_id} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-4 font-semibold text-slate-800">{tb.team_name}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-emerald-600 font-semibold">
                    {formatNumber(tb.income)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-rose-600 font-semibold">
                    {formatNumber(tb.expense)}
                  </td>
                  <td className={`py-2.5 px-4 text-right font-mono font-bold ${tb.net >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                    {formatNumber(tb.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Official Signature Footer */}
        <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
          <div>위 결산 내역은 {currentCompany.company_name}의 전표 및 증빙 자료와 일치함을 확인합니다.</div>
          <div className="font-semibold text-slate-800">
            {currentCompany.company_name} 대표자 {currentCompany.representative_name} (인)
          </div>
        </div>
      </div>
    </div>
  );
};
