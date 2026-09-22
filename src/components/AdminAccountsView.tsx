/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Company, Account } from '../types';
import { Layers, Plus, Search, Check, X, Shield, ToggleLeft, ToggleRight } from 'lucide-react';

interface AdminAccountsViewProps {
  currentCompany: Company;
  accounts: Account[];
  onToggleAccount: (accountId: string, isActive: boolean) => Promise<void>;
  userRole: string;
}

export const AdminAccountsView: React.FC<AdminAccountsViewProps> = ({
  currentCompany,
  accounts,
  onToggleAccount,
  userRole,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const filtered = accounts.filter((a) => {
    if (selectedType !== 'ALL' && a.account_type !== selectedType) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = a.account_name.toLowerCase().includes(q);
      const matchCode = a.account_code.toLowerCase().includes(q);
      if (!matchName && !matchCode) return false;
    }
    return true;
  });

  const handleToggle = async (acc: Account) => {
    if (userRole === 'VIEWER') return;
    try {
      setTogglingId(acc.id);
      await onToggleAccount(acc.id, !acc.is_active);
    } catch (err: any) {
      alert(err.message || '상태 변경 실패');
    } finally {
      setTogglingId(null);
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'ASSET':
        return '자산';
      case 'LIABILITY':
        return '부채';
      case 'EQUITY':
        return '자본';
      case 'REVENUE':
        return '수익(매출/수입)';
      case 'EXPENSE':
        return '비용(지출)';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">계정과목 관리 (Chart of Accounts)</h1>
            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200">
              방법 B: 공통 계정과목 + 회사별 사용 활성화
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            표준 계정과목 체계를 바탕으로 <strong className="text-slate-800">{currentCompany.company_name}</strong>에서 실제 사용할 과목을 회사별로 On/Off 설정합니다.
          </p>
        </div>
      </div>

      {/* Concept Architecture Info Banner */}
      <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <div className="font-bold text-amber-400 text-sm">계정과목 멀티테넌트 전략 (Method B)</div>
            <div className="text-slate-300 mt-0.5">
              전체 회사의 통일된 재무 통계를 유지하면서, 회사 특성에 맞지 않는 계정과목은 비활성화하여 전표 입력 시 불필요한 노출을 방지합니다.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            <span className="text-slate-400 text-[11px]">사용 활성화 과목:</span>{' '}
            <strong className="text-emerald-400 font-mono text-sm">
              {accounts.filter((a) => a.is_active !== false).length}개
            </strong>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="계정코드, 과목명 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
          >
            <option value="ALL">과목분류: 전체</option>
            <option value="ASSET">자산 (Asset)</option>
            <option value="LIABILITY">부채 (Liability)</option>
            <option value="EQUITY">자본 (Equity)</option>
            <option value="REVENUE">수익 (Revenue)</option>
            <option value="EXPENSE">비용 (Expense)</option>
          </select>
        </div>

        <span className="text-xs text-slate-500">
          총 <strong className="font-mono text-slate-900">{filtered.length}</strong>개 과목
        </span>
      </div>

      {/* Accounts Table with Toggle */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px]">
              <th className="py-2.5 px-4 w-28">계정코드</th>
              <th className="py-2.5 px-4">계정과목명</th>
              <th className="py-2.5 px-4">분류 (Type)</th>
              <th className="py-2.5 px-4">설명 / 표준 가이드</th>
              <th className="py-2.5 px-4 text-center w-36">
                {currentCompany.company_name} 사용 여부
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((acc) => {
              const active = acc.is_active !== false;
              const isToggling = togglingId === acc.id;

              return (
                <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{acc.account_code}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800 text-sm">
                    {acc.account_name}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        acc.account_type === 'EXPENSE'
                          ? 'bg-rose-50 text-rose-700'
                          : acc.account_type === 'REVENUE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-indigo-50 text-indigo-700'
                      }`}
                    >
                      {getTypeName(acc.account_type)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-[11px]">
                    {acc.description || '-'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleToggle(acc)}
                      disabled={isToggling || userRole === 'VIEWER'}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 mx-auto ${
                        active
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-150 text-slate-500 hover:bg-slate-200'
                      } disabled:opacity-50`}
                    >
                      {active ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>사용 중 (ON)</span>
                        </>
                      ) : (
                        <>
                          <X className="w-3.5 h-3.5" />
                          <span>미사용 (OFF)</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
