/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BankAccount, Company } from '../types';
import { formatKRW, formatNumber } from '../api/client';
import {
  Landmark,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  ShieldCheck,
  Upload,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  X,
} from 'lucide-react';

interface BankAccountsViewProps {
  currentCompany: Company;
  bankAccounts: BankAccount[];
  userRole: string;
  onAddBankAccount: (payload: any) => Promise<void>;
  onImportBankExcel: (bankAccountId: string, rows?: any[]) => Promise<void>;
  isImportModalOpen: boolean;
  setIsImportModalOpen: (open: boolean) => void;
}

export const BankAccountsView: React.FC<BankAccountsViewProps> = ({
  currentCompany,
  bankAccounts,
  userRole,
  onAddBankAccount,
  onImportBankExcel,
  isImportModalOpen,
  setIsImportModalOpen,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [bankName, setBankName] = useState('KB국민은행');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [notes, setNotes] = useState('');

  // Import State
  const [selectedBankId, setSelectedBankId] = useState(bankAccounts[0]?.id || '');
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState('');

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountNumber) return;
    await onAddBankAccount({
      bank_name: bankName,
      account_number: accountNumber,
      account_name: accountName || `${bankName} 보통예금`,
      initial_balance: Number(initialBalance) || 0,
      notes,
    });
    setIsAddModalOpen(false);
    setAccountNumber('');
    setAccountName('');
    setInitialBalance('');
    setNotes('');
  };

  const handleRunImport = async () => {
    if (!selectedBankId) return;
    setIsImporting(true);
    setImportSuccessMsg('');
    try {
      await onImportBankExcel(selectedBankId);
      setImportSuccessMsg('선택하신 은행 계좌의 거래 3건이 company_id와 함께 성공적으로 가져오기 완료되었습니다!');
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportSuccessMsg('');
      }, 1800);
    } catch (err: any) {
      alert(err.message || '가져오기 실패');
    } finally {
      setIsImporting(false);
    }
  };

  const totalBalance = bankAccounts.reduce((s, b) => s + b.current_balance, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">은행계좌 관리 및 거래연동</h1>
            <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded border border-emerald-200">
              회사별 격리 통장
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentCompany.company_name} 소유의 사업용 은행계좌를 독립적으로 관리하며 은행 엑셀 거래내역을 연동합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>은행 엑셀 가져오기</span>
          </button>
          {userRole !== 'VIEWER' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ 은행 계좌 추가</span>
            </button>
          )}
        </div>
      </div>

      {/* Overview Banner */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-500">
            {currentCompany.company_name} 등록 계좌 총 잔액
          </span>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono tracking-tight">
            {formatKRW(totalBalance)}
          </div>
        </div>
        <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 max-w-md">
          <div className="font-semibold text-slate-700 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Multi-Tenant Bank Account Segregation
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            은행 계좌와 거래내역은 오직 해당 법인의 소속 사용자 및 승인된 권한자만 열람/집행할 수 있습니다.
          </p>
        </div>
      </div>

      {/* Bank Account Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bankAccounts.map((b) => (
          <div
            key={b.id}
            className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                    <Landmark className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{b.bank_name}</h3>
                    <span className="text-[11px] text-slate-500">{b.account_name}</span>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded">
                  정상사용
                </span>
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-[11px] text-slate-400">계좌번호</div>
                <div className="text-xs font-mono font-bold text-slate-800 mt-0.5 tracking-wide">
                  {b.account_number}
                </div>
              </div>

              <div className="mt-4">
                <span className="text-[11px] text-slate-500">현재 통장 잔액</span>
                <div className="text-xl font-bold font-mono text-indigo-900 mt-0.5">
                  {formatKRW(b.current_balance)}
                </div>
              </div>

              {b.notes && (
                <p className="text-[11px] text-slate-500 mt-2 line-clamp-2 bg-slate-50 p-2 rounded">
                  {b.notes}
                </p>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="font-mono text-[10px] text-slate-400">{b.id}</span>
              <button
                onClick={() => {
                  setSelectedBankId(b.id);
                  setIsImportModalOpen(true);
                }}
                className="text-indigo-600 font-semibold hover:underline text-xs flex items-center gap-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> 엑셀 내역 가져오기
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Bank Account Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">새 은행 계좌 등록</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">은행명 *</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="KB국민은행">KB국민은행</option>
                  <option value="NH농협은행">NH농협은행</option>
                  <option value="신한은행">신한은행</option>
                  <option value="우리은행">우리은행</option>
                  <option value="하나은행">하나은행</option>
                  <option value="IBK기업은행">IBK기업은행</option>
                  <option value="카카오뱅크">카카오뱅크</option>
                  <option value="토스뱅크">토스뱅크</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">계좌번호 *</label>
                <input
                  type="text"
                  placeholder="예: 123-4567-890101 (하이픈 포함)"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">통장 별칭/용도</label>
                <input
                  type="text"
                  placeholder="예: 운영비 전용 통장, 후원금 통장"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">기초 잔액 (원)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">관리 메모</label>
                <input
                  type="text"
                  placeholder="예: 지점명, 담당자 정보 등"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  계좌 등록
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bank Excel Import Simulator Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-amber-400 font-semibold">은행 거래내역 자동 연동</div>
                <h3 className="text-base font-bold text-white mt-0.5">은행 엑셀(CSV) 가져오기</h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {importSuccessMsg ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-xs leading-relaxed">{importSuccessMsg}</span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">입출금 대상 은행통장 선택 *</label>
                    <select
                      value={selectedBankId}
                      onChange={(e) => setSelectedBankId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                    >
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bank_name} ({b.account_number}) - 잔액: {formatKRW(b.current_balance)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">시뮬레이션 연동 거래 샘플 (3건)</span>
                      <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                        Auto Match
                      </span>
                    </div>

                    <div className="space-y-1.5 text-[11px]">
                      <div className="p-2 bg-white rounded border border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-slate-500">2026-09-21</span>
                          <span className="mx-1.5">•</span>
                          <span className="font-semibold text-slate-800">하나로마트 소모품 결제</span>
                        </div>
                        <span className="text-rose-600 font-mono font-bold">-84,000원</span>
                      </div>
                      <div className="p-2 bg-white rounded border border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-slate-500">2026-09-21</span>
                          <span className="mx-1.5">•</span>
                          <span className="font-semibold text-slate-800">익명 CMS 후원금 입금</span>
                        </div>
                        <span className="text-emerald-600 font-mono font-bold">+150,000원</span>
                      </div>
                      <div className="p-2 bg-white rounded border border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-slate-500">2026-09-20</span>
                          <span className="mx-1.5">•</span>
                          <span className="font-semibold text-slate-800">카카오페이 식대 지출</span>
                        </div>
                        <span className="text-rose-600 font-mono font-bold">-32,000원</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 pt-1">
                      * 가져오기 실행 시 <strong className="text-slate-800 font-mono">{currentCompany.company_name} ({currentCompany.id})</strong>의 거래 전표로 자동 등록됩니다.
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsImportModalOpen(false)}
                      className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={isImporting}
                      onClick={handleRunImport}
                      className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isImporting ? '연동 전표 생성 중...' : '엑셀 데이터 가져오기 실행'}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
