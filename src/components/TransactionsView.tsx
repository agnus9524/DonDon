/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Transaction,
  Company,
  Team,
  Account,
  BankAccount,
  Vendor,
  TransactionType,
  PaymentMethod,
  VatType,
} from '../types';
import { formatKRW, formatNumber } from '../api/client';
import {
  Search,
  Filter,
  Plus,
  Download,
  Trash2,
  CheckCircle,
  FileSpreadsheet,
  Building2,
  Calendar,
  X,
  CreditCard,
  Building,
  Tag,
  AlertCircle,
} from 'lucide-react';

interface TransactionsViewProps {
  currentCompany: Company;
  transactions: Transaction[];
  teams: Team[];
  accounts: Account[];
  bankAccounts: BankAccount[];
  vendors: Vendor[];
  userRole: string;
  onAddTransaction: (payload: Partial<Transaction>) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onOpenBankImport: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  currentCompany,
  transactions,
  teams,
  accounts,
  bankAccounts,
  vendors,
  userRole,
  onAddTransaction,
  onDeleteTransaction,
  onOpenBankImport,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // New Transaction Form State
  const [formData, setFormData] = useState<{
    transaction_date: string;
    transaction_type: TransactionType;
    team_id: string;
    account_id: string;
    payment_method: PaymentMethod;
    bank_account_id: string;
    vendor_id: string;
    vat_type: VatType;
    supply_amount: string;
    vat_amount: string;
    total_amount: string;
    description: string;
    memo: string;
  }>({
    transaction_date: new Date().toISOString().slice(0, 10),
    transaction_type: 'EXPENSE',
    team_id: teams[0]?.id || '',
    account_id: accounts[0]?.id || '',
    payment_method: 'BANK_TRANSFER',
    bank_account_id: bankAccounts[0]?.id || '',
    vendor_id: '',
    vat_type: 'TAXABLE',
    supply_amount: '',
    vat_amount: '',
    total_amount: '',
    description: '',
    memo: '',
  });

  const teamMap = new Map(teams.map((t) => [t.id, t.team_name]));
  const accountMap = new Map(accounts.map((a) => [a.id, a.account_name]));
  const bankMap = new Map(bankAccounts.map((b) => [b.id, b.bank_name]));
  const vendorMap = new Map(vendors.map((v) => [v.id, v.vendor_name]));

  // Auto calculate VAT and Total
  const handleSupplyAmountChange = (val: string, vatType = formData.vat_type) => {
    const sup = Number(val.replace(/,/g, '')) || 0;
    let vat = 0;
    if (vatType === 'TAXABLE') {
      vat = Math.round(sup * 0.1);
    }
    const tot = sup + vat;

    setFormData((prev) => ({
      ...prev,
      supply_amount: val,
      vat_amount: vat > 0 ? String(vat) : '0',
      total_amount: String(tot),
    }));
  };

  const handleVatTypeChange = (vatType: VatType) => {
    setFormData((prev) => ({ ...prev, vat_type: vatType }));
    handleSupplyAmountChange(formData.supply_amount, vatType);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description) {
      setErrorMsg('적요(거래 내용)를 입력해주세요.');
      return;
    }
    const total = Number(formData.total_amount) || Number(formData.supply_amount) || 0;
    if (total <= 0) {
      setErrorMsg('금액을 올바르게 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onAddTransaction({
        transaction_date: formData.transaction_date,
        transaction_type: formData.transaction_type,
        team_id: formData.team_id,
        account_id: formData.account_id,
        payment_method: formData.payment_method,
        bank_account_id: formData.bank_account_id || undefined,
        vendor_id: formData.vendor_id || undefined,
        vat_type: formData.vat_type,
        supply_amount: Number(formData.supply_amount) || 0,
        vat_amount: Number(formData.vat_amount) || 0,
        total_amount: total,
        description: formData.description,
        memo: formData.memo,
      });
      setIsModalOpen(false);
      // Reset form
      setFormData((prev) => ({
        ...prev,
        supply_amount: '',
        vat_amount: '',
        total_amount: '',
        description: '',
        memo: '',
      }));
    } catch (err: any) {
      setErrorMsg(err.message || '전표 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered transactions
  const filtered = transactions.filter((t) => {
    if (selectedType !== 'ALL' && t.transaction_type !== selectedType) return false;
    if (selectedTeam !== 'ALL' && t.team_id !== selectedTeam) return false;
    if (selectedAccount !== 'ALL' && t.account_id !== selectedAccount) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchDesc = t.description.toLowerCase().includes(q);
      const matchMemo = t.memo ? t.memo.toLowerCase().includes(q) : false;
      const matchId = t.id.toLowerCase().includes(q);
      if (!matchDesc && !matchMemo && !matchId) return false;
    }
    return true;
  });

  const totalFilteredIncome = filtered
    .filter((t) => t.transaction_type === 'INCOME')
    .reduce((s, t) => s + t.total_amount, 0);

  const totalFilteredExpense = filtered
    .filter((t) => t.transaction_type === 'EXPENSE')
    .reduce((s, t) => s + t.total_amount, 0);

  const filteredNet = totalFilteredIncome - totalFilteredExpense;

  const exportCSV = () => {
    const headers = ['전표번호,회사ID,일자,구분,팀,계정과목,공급가액,부가세,합계금액,결제수단,적요,메모\n'];
    const rows = filtered.map((t) =>
      [
        t.id,
        t.company_id,
        t.transaction_date,
        t.transaction_type === 'INCOME' ? '수입' : '지출',
        teamMap.get(t.team_id) || '',
        accountMap.get(t.account_id) || '',
        t.supply_amount,
        t.vat_amount,
        t.total_amount,
        t.payment_method,
        `"${t.description.replace(/"/g, '""')}"`,
        `"${(t.memo || '').replace(/"/g, '""')}"`,
      ].join(',')
    );
    const blob = new Blob(['\uFEFF' + headers + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${currentCompany.company_name}_회계장부_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isViewer = userRole === 'VIEWER';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">회계전표 및 거래관리</h1>
            <span className="text-xs bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded border border-slate-200">
              company_id: {currentCompany.id}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentCompany.company_name}의 모든 회계 거래는 타 법인과 완전히 분리되어 관리됩니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>장부 엑셀(CSV)</span>
          </button>
          <button
            onClick={onOpenBankImport}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>은행거래 가져오기</span>
          </button>
          {!isViewer && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ 전표 입력</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="적요, 메모, 전표번호 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Type */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="py-1.5 px-3 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">구분: 전체 (수입/지출)</option>
            <option value="INCOME">수입 (Income)</option>
            <option value="EXPENSE">지출 (Expense)</option>
            <option value="TRANSFER">이체 (Transfer)</option>
          </select>

          {/* Team */}
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="py-1.5 px-3 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">소속팀: 전체 부서</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.team_name}
              </option>
            ))}
          </select>

          {/* Account */}
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="py-1.5 px-3 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">계정과목: 전체 과목</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_code} {a.account_name}
              </option>
            ))}
          </select>
        </div>

        {/* Aggregated Filter Summary Strip */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-slate-500">
              조회 결과: <strong className="text-slate-900 font-mono">{filtered.length}</strong>건
            </span>
            <span className="text-slate-400">|</span>
            <span>
              총 수입: <strong className="text-emerald-600 font-mono">{formatKRW(totalFilteredIncome)}</strong>
            </span>
            <span className="text-slate-400">|</span>
            <span>
              총 지출: <strong className="text-rose-600 font-mono">{formatKRW(totalFilteredExpense)}</strong>
            </span>
            <span className="text-slate-400">|</span>
            <span>
              차인잔액:{' '}
              <strong className={`font-mono ${filteredNet >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                {formatKRW(filteredNet)}
              </strong>
            </span>
          </div>

          {(searchTerm || selectedType !== 'ALL' || selectedTeam !== 'ALL' || selectedAccount !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedType('ALL');
                setSelectedTeam('ALL');
                setSelectedAccount('ALL');
              }}
              className="text-xs text-slate-500 hover:text-indigo-600 font-medium underline"
            >
              필터 초기화
            </button>
          )}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px]">
                <th className="py-2.5 px-3">전표번호</th>
                <th className="py-2.5 px-3">일자</th>
                <th className="py-2.5 px-2">구분</th>
                <th className="py-2.5 px-3">부서/팀</th>
                <th className="py-2.5 px-3">계정과목</th>
                <th className="py-2.5 px-4">적요 (상세내역)</th>
                <th className="py-2.5 px-3 text-right">공급가액</th>
                <th className="py-2.5 px-3 text-right">부가세</th>
                <th className="py-2.5 px-4 text-right">합계금액</th>
                <th className="py-2.5 px-3">결제/통장</th>
                <th className="py-2.5 px-2 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    해당 조건에 맞는 거래 전표가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const isIncome = t.transaction_type === 'INCOME';
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500">{t.id}</td>
                      <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {t.transaction_date}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`inline-block font-bold px-1.5 py-0.5 rounded text-[10px] ${
                            isIncome ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {isIncome ? '수입' : '지출'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">
                        {teamMap.get(t.team_id) || '-'}
                      </td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                        <span className="font-semibold text-slate-800">{accountMap.get(t.account_id) || '-'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 max-w-xs">{t.description}</div>
                        {t.memo && <div className="text-[11px] text-slate-400 mt-0.5">{t.memo}</div>}
                        {t.vendor_id && (
                          <span className="inline-block mt-0.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                            거래처: {vendorMap.get(t.vendor_id)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        {formatNumber(t.supply_amount)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        {t.vat_amount > 0 ? formatNumber(t.vat_amount) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm whitespace-nowrap">
                        <span className={isIncome ? 'text-emerald-700' : 'text-slate-900'}>
                          {isIncome ? '+' : '-'}{formatNumber(t.total_amount)}원
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                        <div>
                          {t.payment_method === 'BANK_TRANSFER' && '계좌이체'}
                          {t.payment_method === 'CORPORATE_CARD' && '법인카드'}
                          {t.payment_method === 'CREDIT_CARD' && '신용카드'}
                          {t.payment_method === 'CASH' && '현금'}
                        </div>
                        {t.bank_account_id && (
                          <div className="text-[10px] text-indigo-600">
                            {bankMap.get(t.bank_account_id)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {!isViewer ? (
                          <button
                            onClick={() => {
                              if (confirm('이 전표를 삭제하시겠습니까?')) {
                                onDeleteTransaction(t.id);
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="전표 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px]">열람</span>
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

      {/* Add Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden my-6">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
                  <span>{currentCompany.company_name}</span>
                  <span>•</span>
                  <span>company_id 자동 매핑</span>
                </div>
                <h3 className="text-lg font-bold text-white mt-0.5">회계 전표 작성</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Row 1: Date & Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">거래일자 *</label>
                  <input
                    type="date"
                    value={formData.transaction_date}
                    onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">거래 구분 *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, transaction_type: 'INCOME' })}
                      className={`py-2 rounded-lg font-bold border transition-colors ${
                        formData.transaction_type === 'INCOME'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      수입 (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, transaction_type: 'EXPENSE' })}
                      className={`py-2 rounded-lg font-bold border transition-colors ${
                        formData.transaction_type === 'EXPENSE'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      지출 (-)
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Team & Account */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">담당 부서/팀 *</label>
                  <select
                    value={formData.team_id}
                    onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.team_name} ({t.team_code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">계정과목 *</label>
                  <select
                    value={formData.account_id}
                    onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.account_code}] {a.account_name} ({a.account_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: VAT Type & Amounts */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">부가세 및 금액 계산</span>
                  <div className="flex items-center gap-2">
                    {(['TAXABLE', 'TAX_EXEMPT', 'ZERO_TAX'] as VatType[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleVatTypeChange(v)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${
                          formData.vat_type === v
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {v === 'TAXABLE' ? '과세(10%)' : v === 'TAX_EXEMPT' ? '면세' : '영세'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-500 text-[11px] mb-1">공급가액 (원) *</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formData.supply_amount}
                      onChange={(e) => handleSupplyAmountChange(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[11px] mb-1">부가세 (원)</label>
                    <input
                      type="number"
                      value={formData.vat_amount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vat_amount: e.target.value,
                          total_amount: String(Number(formData.supply_amount || 0) + Number(e.target.value || 0)),
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[11px] mb-1">합계금액 (원) *</label>
                    <input
                      type="number"
                      value={formData.total_amount}
                      onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                      required
                      className="w-full px-3 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50/50 font-mono font-bold text-sm text-indigo-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Bank Account & Payment Method */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">결제 수단</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as PaymentMethod })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="BANK_TRANSFER">보통예금 계좌이체</option>
                    <option value="CORPORATE_CARD">법인 신용카드</option>
                    <option value="CREDIT_CARD">개인/대표 신용카드</option>
                    <option value="CASH">현금 영수증</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">연동 은행통장</label>
                  <select
                    value={formData.bank_account_id}
                    onChange={(e) => setFormData({ ...formData, bank_account_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">통장 미지정 (또는 현금)</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name} ({b.account_number})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 5: Vendor */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">거래처 (선택)</label>
                <select
                  value={formData.vendor_id}
                  onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">거래처 선택 안 함</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vendor_name} ({v.business_number})
                    </option>
                  ))}
                </select>
              </div>

              {/* Row 6: Description */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">적요 (상세 거래 내용) *</label>
                <input
                  type="text"
                  placeholder="예: 9월분 본부 사무실 임차료 지급"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Row 7: Memo */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">비고/참조 메모</label>
                <input
                  type="text"
                  placeholder="예: 전자세금계산서 승인번호, 영수증 번호 등"
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? '저장 중...' : '전표 저장 (확정)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
