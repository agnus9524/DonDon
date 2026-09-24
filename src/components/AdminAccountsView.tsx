/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Company, Account } from '../types';
import { Layers, Plus, Search, Check, X, Shield, ToggleLeft, ToggleRight, Trash2, AlertTriangle } from 'lucide-react';

interface AdminAccountsViewProps {
  currentCompany: Company;
  accounts: (Account & { is_active?: boolean })[];
  onToggleAccount: (accountId: string, isActive: boolean) => Promise<void>;
  onCreateAccount?: (payload: Partial<Account> & { is_active?: boolean }) => Promise<void>;
  onDeleteAccount?: (accountId: string) => Promise<void>;
  userRole: string;
}

export const AdminAccountsView: React.FC<AdminAccountsViewProps> = ({
  currentCompany,
  accounts,
  onToggleAccount,
  onCreateAccount,
  onDeleteAccount,
  userRole,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<(Account & { is_active?: boolean }) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Create form state
  const [formData, setFormData] = useState({
    account_code: '',
    account_name: '',
    account_type: 'EXPENSE' as 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
    category: '판관비',
    description: '',
    is_active: true,
  });

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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.account_code.trim() || !formData.account_name.trim() || !onCreateAccount) return;
    try {
      setIsSubmitting(true);
      await onCreateAccount({
        account_code: formData.account_code.trim(),
        account_name: formData.account_name.trim(),
        account_type: formData.account_type,
        category: formData.category.trim() || (formData.account_type === 'EXPENSE' ? '판관비' : '일반'),
        description: formData.description.trim(),
        is_active: formData.is_active,
      });
      setIsCreateModalOpen(false);
      setFormData({
        account_code: '',
        account_name: '',
        account_type: 'EXPENSE',
        category: '판관비',
        description: '',
        is_active: true,
      });
    } catch (err: any) {
      alert(err.message || '계정과목 생성 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deletingAccount || !onDeleteAccount) return;
    try {
      setIsDeleting(true);
      await onDeleteAccount(deletingAccount.id);
      setDeletingAccount(null);
    } catch (err: any) {
      alert(err.message || '계정과목 삭제 실패');
    } finally {
      setIsDeleting(false);
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

        {userRole !== 'VIEWER' && onCreateAccount && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors self-start sm:self-auto shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ 계정과목 생성</span>
          </button>
        )}
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
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-none sm:max-w-xs">
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
            className="text-xs px-3 py-2 sm:py-1.5 rounded-lg border border-slate-200 bg-white"
          >
            <option value="ALL">과목분류: 전체</option>
            <option value="ASSET">자산 (Asset)</option>
            <option value="LIABILITY">부채 (Liability)</option>
            <option value="EQUITY">자본 (Equity)</option>
            <option value="REVENUE">수익 (Revenue)</option>
            <option value="EXPENSE">비용 (Expense)</option>
          </select>
        </div>

        <span className="text-xs text-slate-500 text-right">
          총 <strong className="font-mono text-slate-900">{filtered.length}</strong>개 과목
        </span>
      </div>

      {/* Accounts: Mobile Cards (< md) & Desktop Table (>= md) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Mobile Card List */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              조건에 맞는 계정과목이 없습니다.
            </div>
          ) : (
            filtered.map((acc) => {
              const active = acc.is_active !== false;
              const isToggling = togglingId === acc.id;

              return (
                <div key={acc.id} className="p-4 space-y-2 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-xs">
                          {acc.account_code}
                        </span>
                        <span className="font-bold text-slate-900 text-sm">{acc.account_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            acc.account_type === 'EXPENSE'
                              ? 'bg-rose-50 text-rose-700'
                              : acc.account_type === 'REVENUE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-indigo-50 text-indigo-700'
                          }`}
                        >
                          {getTypeName(acc.account_type)}
                        </span>
                        {acc.category && (
                          <span className="text-[11px] text-slate-500 font-medium">· {acc.category}</span>
                        )}
                      </div>
                    </div>

                    {userRole !== 'VIEWER' && onDeleteAccount && (
                      <button
                        onClick={() => setDeletingAccount(acc)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                        title={`${acc.account_name} 삭제`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {acc.description && (
                    <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      {acc.description}
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-xs text-slate-500">당사 장부 활성화:</span>
                    <button
                      onClick={() => handleToggle(acc)}
                      disabled={isToggling || userRole === 'VIEWER'}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[36px] ${
                        active
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
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
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px]">
                <th className="py-2.5 px-4 w-24">계정코드</th>
                <th className="py-2.5 px-4">계정과목명</th>
                <th className="py-2.5 px-4">분류 (Type)</th>
                <th className="py-2.5 px-4">카테고리</th>
                <th className="py-2.5 px-4">설명 / 표준 가이드</th>
                <th className="py-2.5 px-4 text-center w-36">
                  {currentCompany.company_name} 사용 여부
                </th>
                {userRole !== 'VIEWER' && onDeleteAccount && (
                  <th className="py-2.5 px-4 text-center w-20">계정 삭제</th>
                )}
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
                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {acc.category || '-'}
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
                    {userRole !== 'VIEWER' && onDeleteAccount && (
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setDeletingAccount(acc)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                          title={`${acc.account_name} (${acc.account_code}) 삭제`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Account Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-amber-400 font-semibold">신규 계정과목 등록</div>
                <h3 className="text-base font-bold text-white">계정코드 및 과목 생성</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    계정코드 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 5260, 105"
                    value={formData.account_code}
                    onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    과목 구분 (Type) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.account_type}
                    onChange={(e: any) => setFormData({ ...formData, account_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-semibold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="EXPENSE">비용 (EXPENSE)</option>
                    <option value="REVENUE">수익 (REVENUE)</option>
                    <option value="ASSET">자산 (ASSET)</option>
                    <option value="LIABILITY">부채 (LIABILITY)</option>
                    <option value="EQUITY">자본 (EQUITY)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  계정과목명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 소프트웨어구독료, 통신비, 행사비"
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  대분류 카테고리 (Category) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-semibold focus:outline-none focus:border-indigo-500"
                >
                  <option value="판매관리비">판매관리비</option>
                  <option value="유동자산">유동자산</option>
                  <option value="유형자산">유형자산</option>
                  <option value="매출채권">매출채권</option>
                  <option value="매입채무">매입채무</option>
                  <option value="유동부채">유동부채</option>
                  <option value="자본금">자본금</option>
                  <option value="사업수익">사업수익</option>
                  <option value="영업외수익">영업외수익</option>
                  <option value="기타">기타</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  설명 / 전표 가이드
                </label>
                <textarea
                  rows={2}
                  placeholder="전표 작성 시 참고할 용도나 계정 처리 기준..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  id="account_is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="account_is_active" className="text-slate-800 font-medium cursor-pointer">
                  생성 즉시 현재 회사({currentCompany.company_name})에서 사용 활성화 (ON)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50"
                >
                  {isSubmitting ? '생성 중...' : '계정과목 생성'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {deletingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
            <div className="bg-rose-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-300" />
                <h3 className="text-base font-bold text-white">계정과목 삭제 확인</h3>
              </div>
              <button
                onClick={() => setDeletingAccount(null)}
                className="text-rose-200 hover:text-white"
                disabled={isDeleting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900">
                <div className="font-bold text-sm text-rose-800">
                  [{deletingAccount.account_code}] {deletingAccount.account_name}
                </div>
                <p className="text-rose-700 text-[11px] mt-1 leading-relaxed">
                  주의: 이미 전표(거래 내역)에 사용된 계정과목은 데이터 무결성을 위해 삭제가 제한되며, 대신 <strong>미사용(OFF)</strong>으로 변경할 수 있습니다.
                </p>
              </div>

              <p className="text-slate-600 font-medium">
                정말로 <strong className="text-slate-900 font-bold">[{deletingAccount.account_code} {deletingAccount.account_name}]</strong> 계정코드를 삭제하시겠습니까?
              </p>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingAccount(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSubmit}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? '삭제 중...' : '계정코드 삭제'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
