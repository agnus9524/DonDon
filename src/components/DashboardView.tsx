/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Company, Transaction, BankAccount, Team, Account } from '../types';
import { formatKRW, formatNumber } from '../api/client';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Building2,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Landmark,
  ShieldCheck,
} from 'lucide-react';

interface DashboardViewProps {
  currentCompany: Company;
  transactions: Transaction[];
  bankAccounts: BankAccount[];
  teams: Team[];
  accounts: Account[];
  onNavigate: (section: any) => void;
  onOpenAddTransaction: () => void;
  onOpenBankImport: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentCompany,
  transactions,
  bankAccounts,
  teams,
  accounts,
  onNavigate,
  onOpenAddTransaction,
  onOpenBankImport,
}) => {
  // Current month transactions (2026-09)
  const currentMonthPrefix = '2026-09';
  const monthTxs = transactions.filter((t) => t.transaction_date.startsWith(currentMonthPrefix));

  const totalIncome = monthTxs
    .filter((t) => t.transaction_type === 'INCOME')
    .reduce((s, t) => s + t.total_amount, 0);

  const totalExpense = monthTxs
    .filter((t) => t.transaction_type === 'EXPENSE')
    .reduce((s, t) => s + t.total_amount, 0);

  const netBalance = totalIncome - totalExpense;

  const totalBankBalance = bankAccounts.reduce((s, b) => s + b.current_balance, 0);

  const teamMap = new Map(teams.map((t) => [t.id, t.team_name]));
  const accountMap = new Map(accounts.map((a) => [a.id, a.account_name]));

  // Team-wise expense breakdown
  const teamExpenseMap: Record<string, number> = {};
  monthTxs
    .filter((t) => t.transaction_type === 'EXPENSE')
    .forEach((t) => {
      const name = teamMap.get(t.team_id) || '미지정 부서';
      teamExpenseMap[name] = (teamExpenseMap[name] || 0) + t.total_amount;
    });

  const recentTxs = [...transactions].slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Banner with Company Info & Isolation badge */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-amber-400 uppercase">
              <Building2 className="w-4 h-4" />
              <span>{currentCompany.company_code} • 멀티테넌트 독립 장부</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1 text-white">
              {currentCompany.company_name} 회계 대시보드
            </h1>
            <p className="text-slate-300 text-xs md:text-sm mt-1">
              사업자등록번호 {currentCompany.business_number} | 대표자 {currentCompany.representative_name}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAddTransaction}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
            >
              <Receipt className="w-4 h-4" />
              <span>+ 새 전표 작성</span>
            </button>
            <button
              onClick={onOpenBankImport}
              className="bg-slate-700/80 hover:bg-slate-700 text-white font-medium text-sm px-4 py-2.5 rounded-xl transition-all border border-slate-600/60 flex items-center gap-1.5"
            >
              <Landmark className="w-4 h-4" />
              <span>은행 엑셀 가져오기</span>
            </button>
          </div>
        </div>

        {/* Ambient subtle glow */}
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* KPI 4-Card Row (Matching Prompt Specs: 이번달 수입, 이번달 지출, 잔액) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Income */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">이번 달 수입 (9월)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
            {formatKRW(totalIncome)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>수납 및 매출 실적 정상 반영</span>
          </div>
        </div>

        {/* Expense */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">이번 달 지출 (9월)</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
            {formatKRW(totalExpense)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-rose-600 font-medium">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>인건비, 임차료, 사업비 집행</span>
          </div>
        </div>

        {/* Net Profit / Balance */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">당월 당기순이익 (잔액)</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-bold mt-2 tracking-tight ${netBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
            {formatKRW(netBalance)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
            <span>수지차액 (수입 - 지출)</span>
          </div>
        </div>

        {/* Total Bank Balance */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">회사 통장 총잔액</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
            {formatKRW(totalBankBalance)}
          </div>
          <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
            <span>등록 계좌 {bankAccounts.length}개 보유</span>
          </div>
        </div>
      </div>

      {/* Middle Section: Department Expense Distribution + Bank Accounts Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Expense Distribution */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">부서/팀별 지출 현황</h2>
              <p className="text-xs text-slate-500">소속 팀별 당월 예산 집행 비율</p>
            </div>
            <button
              onClick={() => onNavigate('budgets')}
              className="text-xs text-indigo-600 font-semibold hover:underline"
            >
              예산관리 바로가기 &rarr;
            </button>
          </div>

          {Object.keys(teamExpenseMap).length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">당월 지출 내역이 없습니다.</div>
          ) : (
            <div className="space-y-3.5">
              {Object.entries(teamExpenseMap).map(([teamName, amt]) => {
                const pct = totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0;
                return (
                  <div key={teamName} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{teamName}</span>
                      <div className="space-x-2">
                        <span className="font-mono text-slate-900 font-bold">{formatKRW(amt)}</span>
                        <span className="text-slate-400">({pct}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bank Accounts List for this company */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">등록 은행 계좌</h2>
                <p className="text-xs text-slate-500">{currentCompany.company_name} 전용</p>
              </div>
              <button
                onClick={() => onNavigate('banks')}
                className="text-xs text-indigo-600 font-semibold hover:underline"
              >
                관리 &rarr;
              </button>
            </div>

            <div className="space-y-2.5">
              {bankAccounts.map((b) => (
                <div key={b.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{b.bank_name}</span>
                    <span className="font-mono text-indigo-600 font-bold">{formatKRW(b.current_balance)}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono mt-0.5">{b.account_number}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{b.account_name}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> 타사 계좌와 완전 분리됨
            </span>
            <button
              onClick={onOpenBankImport}
              className="text-indigo-600 font-medium hover:underline text-[11px]"
            >
              엑셀 거래 가져오기
            </button>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">최근 전표 거래내역</h2>
            <p className="text-xs text-slate-500">{currentCompany.company_name}의 최근 등록 전표</p>
          </div>
          <button
            onClick={() => onNavigate('transactions')}
            className="text-xs text-indigo-600 font-semibold hover:underline"
          >
            전체 전표장부 보기 ({transactions.length}건) &rarr;
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px]">
                <th className="py-2.5 px-4">전표일자</th>
                <th className="py-2.5 px-3">구분</th>
                <th className="py-2.5 px-3">담당팀</th>
                <th className="py-2.5 px-3">계정과목</th>
                <th className="py-2.5 px-4">적요</th>
                <th className="py-2.5 px-4 text-right">금액 (원)</th>
                <th className="py-2.5 px-3 text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentTxs.map((t) => {
                const isIncome = t.transaction_type === 'INCOME';
                return (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-600">{t.transaction_date}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block font-semibold px-2 py-0.5 rounded text-[10px] ${
                          isIncome ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {isIncome ? '수입' : '지출'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700">
                      {teamMap.get(t.team_id) || '미지정'}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {accountMap.get(t.account_id) || '계정'}
                    </td>
                    <td className="py-3 px-4 text-slate-900 font-medium max-w-xs truncate">
                      {t.description}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      <span className={isIncome ? 'text-emerald-700' : 'text-slate-900'}>
                        {isIncome ? '+' : '-'}{formatNumber(t.total_amount)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        {t.status === 'CONFIRMED' ? '확정' : '승인'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
