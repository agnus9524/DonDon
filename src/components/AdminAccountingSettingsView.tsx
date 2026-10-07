/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Company,
  Account,
  BankAccount,
  CorporateCard,
  AccountingUnit,
  CompanyCodeItem,
} from '../types';
import {
  INITIAL_CORPORATE_CARDS,
  INITIAL_ACCOUNTING_UNITS,
  INITIAL_COMPANY_CODES,
} from '../data/initialData';
import { AdminAccountsView } from './AdminAccountsView';
import { formatKRW, formatNumber } from '../api/client';
import {
  SlidersHorizontal,
  Layers,
  CreditCard,
  Landmark,
  Building,
  Code2,
  Plus,
  Search,
  Check,
  X,
  Edit2,
  Trash2,
  Shield,
  AlertCircle,
  HelpCircle,
  Wallet,
  Sparkles,
} from 'lucide-react';

export type AccountingSettingTab =
  | 'accounts'
  | 'cards'
  | 'cash-banks'
  | 'units'
  | 'codes';

interface AdminAccountingSettingsViewProps {
  currentCompany: Company;
  activeTab?: AccountingSettingTab;
  onTabChange?: (tab: AccountingSettingTab) => void;
  accounts: (Account & { is_active?: boolean })[];
  bankAccounts: BankAccount[];
  userRole: string;
  onToggleAccount: (accountId: string, isActive: boolean) => Promise<void>;
  onCreateAccount?: (payload: Partial<Account> & { is_active?: boolean }) => Promise<void>;
  onBatchCreateAccounts?: (newAccountsList: any[]) => Promise<any>;
  onDeleteAccount?: (accountId: string) => Promise<void>;
  onAddBankAccount?: (payload: any) => Promise<void>;
}

export const AdminAccountingSettingsView: React.FC<AdminAccountingSettingsViewProps> = ({
  currentCompany,
  activeTab = 'accounts',
  onTabChange,
  accounts,
  bankAccounts,
  userRole,
  onToggleAccount,
  onCreateAccount,
  onBatchCreateAccounts,
  onDeleteAccount,
  onAddBankAccount,
}) => {
  const [currentTab, setCurrentTab] = useState<AccountingSettingTab>(activeTab);

  // Corporate Cards State (persisted per company)
  const [corporateCards, setCorporateCards] = useState<CorporateCard[]>(() => {
    const saved = localStorage.getItem(`dondon_cards_${currentCompany.id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    const initial = INITIAL_CORPORATE_CARDS.filter((c) => c.company_id === currentCompany.id);
    return initial.length > 0
      ? initial
      : INITIAL_CORPORATE_CARDS.slice(0, 2).map((c) => ({ ...c, company_id: currentCompany.id }));
  });

  // Accounting Units State
  const [accountingUnits, setAccountingUnits] = useState<AccountingUnit[]>(() => {
    const saved = localStorage.getItem(`dondon_units_${currentCompany.id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    const initial = INITIAL_ACCOUNTING_UNITS.filter((u) => u.company_id === currentCompany.id);
    return initial.length > 0
      ? initial
      : INITIAL_ACCOUNTING_UNITS.slice(0, 2).map((u) => ({ ...u, company_id: currentCompany.id }));
  });

  // Company Custom Codes State
  const [companyCodes, setCompanyCodes] = useState<CompanyCodeItem[]>(() => {
    const saved = localStorage.getItem(`dondon_codes_${currentCompany.id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    const initial = INITIAL_COMPANY_CODES.filter((c) => c.company_id === currentCompany.id);
    return initial.length > 0
      ? initial
      : INITIAL_COMPANY_CODES.map((c) => ({ ...c, company_id: currentCompany.id }));
  });

  // Sync tab with external prop
  useEffect(() => {
    if (activeTab) {
      setCurrentTab(activeTab);
    }
  }, [activeTab]);

  // Persist Cards
  const saveCards = (newCards: CorporateCard[]) => {
    setCorporateCards(newCards);
    localStorage.setItem(`dondon_cards_${currentCompany.id}`, JSON.stringify(newCards));
  };

  // Persist Units
  const saveUnits = (newUnits: AccountingUnit[]) => {
    setAccountingUnits(newUnits);
    localStorage.setItem(`dondon_units_${currentCompany.id}`, JSON.stringify(newUnits));
  };

  // Persist Codes
  const saveCodes = (newCodes: CompanyCodeItem[]) => {
    setCompanyCodes(newCodes);
    localStorage.setItem(`dondon_codes_${currentCompany.id}`, JSON.stringify(newCodes));
  };

  const handleSelectTab = (tab: AccountingSettingTab) => {
    setCurrentTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // ==========================================
  // 1. Corporate Cards Modal & CRUD
  // ==========================================
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CorporateCard | null>(null);
  const [cardFormData, setCardFormData] = useState({
    card_name: '',
    card_number: '',
    card_issuer: '신한카드',
    card_type: 'CORPORATE' as 'CORPORATE' | 'INDIVIDUAL_CORP' | 'CHECK',
    monthly_limit: 5000000,
    payment_day: 25,
    holder_name: '',
    department_name: '',
    is_active: true,
    notes: '',
  });

  const openAddCardModal = () => {
    setEditingCard(null);
    setCardFormData({
      card_name: '',
      card_number: '',
      card_issuer: '신한카드',
      card_type: 'CORPORATE',
      monthly_limit: 5000000,
      payment_day: 25,
      holder_name: '',
      department_name: '',
      is_active: true,
      notes: '',
    });
    setIsCardModalOpen(true);
  };

  const openEditCardModal = (card: CorporateCard) => {
    setEditingCard(card);
    setCardFormData({
      card_name: card.card_name,
      card_number: card.card_number,
      card_issuer: card.card_issuer,
      card_type: card.card_type,
      monthly_limit: card.monthly_limit,
      payment_day: card.payment_day,
      holder_name: card.holder_name || '',
      department_name: card.department_name || '',
      is_active: card.is_active,
      notes: card.notes || '',
    });
    setIsCardModalOpen(true);
  };

  // UI Feedback States (Avoiding window.alert/window.confirm for iFrame safety)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  const handleCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardFormData.card_name.trim() || !cardFormData.card_number.trim()) {
      showToast('카드명과 카드번호를 입력해 주세요.', 'error');
      return;
    }

    if (editingCard) {
      const updated = corporateCards.map((c) =>
        c.id === editingCard.id
          ? {
              ...c,
              ...cardFormData,
              updated_at: new Date().toISOString(),
            }
          : c
      );
      saveCards(updated);
      showToast(`[${cardFormData.card_name}] 카드가 수정되었습니다.`, 'success');
    } else {
      const newCard: CorporateCard = {
        id: `card_${Date.now()}`,
        company_id: currentCompany.id,
        ...cardFormData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      saveCards([newCard, ...corporateCards]);
      showToast(`[${cardFormData.card_name}] 새 카드가 등록되었습니다.`, 'success');
    }
    setIsCardModalOpen(false);
  };

  const handleDeleteCard = (cardId: string, cardName: string) => {
    setConfirmModal({
      title: '신용카드 삭제',
      message: `[${cardName}] 카드를 삭제하시겠습니까?`,
      onConfirm: () => {
        const filtered = corporateCards.filter((c) => c.id !== cardId);
        saveCards(filtered);
        showToast(`[${cardName}] 카드가 삭제되었습니다.`, 'info');
        setConfirmModal(null);
      },
    });
  };

  // ==========================================
  // 2. Accounting Units Modal & CRUD
  // ==========================================
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<AccountingUnit | null>(null);
  const [unitFormData, setUnitFormData] = useState({
    unit_code: '',
    unit_name: '',
    business_number: currentCompany.business_number || '',
    representative_name: currentCompany.representative_name || '',
    address: currentCompany.address || '',
    is_main: false,
    is_active: true,
    notes: '',
  });

  const openAddUnitModal = () => {
    setEditingUnit(null);
    setUnitFormData({
      unit_code: `UNIT_0${accountingUnits.length + 1}`,
      unit_name: '',
      business_number: currentCompany.business_number || '',
      representative_name: currentCompany.representative_name || '',
      address: currentCompany.address || '',
      is_main: accountingUnits.length === 0,
      is_active: true,
      notes: '',
    });
    setIsUnitModalOpen(true);
  };

  const openEditUnitModal = (unit: AccountingUnit) => {
    setEditingUnit(unit);
    setUnitFormData({
      unit_code: unit.unit_code,
      unit_name: unit.unit_name,
      business_number: unit.business_number || '',
      representative_name: unit.representative_name || '',
      address: unit.address || '',
      is_main: unit.is_main,
      is_active: unit.is_active,
      notes: unit.notes || '',
    });
    setIsUnitModalOpen(true);
  };

  const handleUnitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitFormData.unit_code.trim() || !unitFormData.unit_name.trim()) {
      showToast('회계단위 코드와 단위명을 입력해 주세요.', 'error');
      return;
    }

    if (editingUnit) {
      const updated = accountingUnits.map((u) =>
        u.id === editingUnit.id
          ? {
              ...u,
              ...unitFormData,
              updated_at: new Date().toISOString(),
            }
          : unitFormData.is_main
          ? { ...u, is_main: false }
          : u
      );
      saveUnits(updated);
      showToast(`[${unitFormData.unit_name}] 회계단위 정보가 수정되었습니다.`, 'success');
    } else {
      let currentList = accountingUnits;
      if (unitFormData.is_main) {
        currentList = currentList.map((u) => ({ ...u, is_main: false }));
      }
      const newUnit: AccountingUnit = {
        id: `unit_${Date.now()}`,
        company_id: currentCompany.id,
        ...unitFormData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      saveUnits([...currentList, newUnit]);
      showToast(`[${unitFormData.unit_name}] 새 회계단위가 추가되었습니다.`, 'success');
    }
    setIsUnitModalOpen(false);
  };

  const handleDeleteUnit = (unitId: string, unitName: string) => {
    if (accountingUnits.length <= 1) {
      showToast('최소 1개의 회계단위가 필요합니다.', 'error');
      return;
    }
    setConfirmModal({
      title: '회계단위 삭제',
      message: `[${unitName}] 회계단위를 삭제하시겠습니까?`,
      onConfirm: () => {
        const filtered = accountingUnits.filter((u) => u.id !== unitId);
        saveUnits(filtered);
        showToast(`[${unitName}] 회계단위가 삭제되었습니다.`, 'info');
        setConfirmModal(null);
      },
    });
  };

  // ==========================================
  // 3. Comprehensive Code Management (코드종합관리) CRUD
  // ==========================================
  const [selectedCodeGroup, setSelectedCodeGroup] = useState<string>('ALL');
  const [codeSearchTerm, setCodeSearchTerm] = useState('');
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<CompanyCodeItem | null>(null);
  const [codeFormData, setCodeFormData] = useState({
    group_code: 'EXPENSE_TYPE',
    group_name: '지출유형구분',
    code_value: '',
    code_name: '',
    sort_order: 10,
    description: '',
    is_active: true,
  });

  const CODE_GROUPS = [
    { code: 'EXPENSE_TYPE', name: '지출유형구분', description: '전표 작성 시 지출 목적 및 성격 분류' },
    { code: 'PAYMENT_METHOD', name: '결제수단구분', description: '법인카드, 계좌이체, 현금, 전자결제 등' },
    { code: 'PROOF_TYPE', name: '증빙서류유형', description: '세금계산서, 카드전표, 현금영수증, 간이영수증' },
    { code: 'PROJECT_TAG', name: '프로젝트구분', description: '회사 고유 목적사업 및 R&D 프로젝트 태그' },
    { code: 'COST_CENTER', name: '코스트센터', description: '예산 집행 원가 부문 코드' },
  ];

  const handleGroupCodeChange = (groupCode: string) => {
    const matched = CODE_GROUPS.find((g) => g.code === groupCode);
    setCodeFormData((prev) => ({
      ...prev,
      group_code: groupCode,
      group_name: matched ? matched.name : groupCode,
    }));
  };

  const openAddCodeModal = () => {
    setEditingCode(null);
    const defaultGroup = selectedCodeGroup === 'ALL' ? 'EXPENSE_TYPE' : selectedCodeGroup;
    const matched = CODE_GROUPS.find((g) => g.code === defaultGroup);
    setCodeFormData({
      group_code: defaultGroup,
      group_name: matched ? matched.name : '사용자정의코드',
      code_value: '',
      code_name: '',
      sort_order: (companyCodes.filter((c) => c.group_code === defaultGroup).length + 1) * 10,
      description: '',
      is_active: true,
    });
    setIsCodeModalOpen(true);
  };

  const openEditCodeModal = (item: CompanyCodeItem) => {
    setEditingCode(item);
    setCodeFormData({
      group_code: item.group_code,
      group_name: item.group_name,
      code_value: item.code_value,
      code_name: item.code_name,
      sort_order: item.sort_order,
      description: item.description || '',
      is_active: item.is_active,
    });
    setIsCodeModalOpen(true);
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeFormData.code_value.trim() || !codeFormData.code_name.trim()) {
      showToast('코드값과 코드명을 입력해 주세요.', 'error');
      return;
    }

    if (editingCode) {
      const updated = companyCodes.map((c) =>
        c.id === editingCode.id
          ? {
              ...c,
              ...codeFormData,
              updated_at: new Date().toISOString(),
            }
          : c
      );
      saveCodes(updated);
      showToast(`[${codeFormData.code_name}] 코드가 수정되었습니다.`, 'success');
    } else {
      const newCode: CompanyCodeItem = {
        id: `code_${Date.now()}`,
        company_id: currentCompany.id,
        ...codeFormData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      saveCodes([...companyCodes, newCode]);
      showToast(`[${codeFormData.code_name}] 새 코드가 등록되었습니다.`, 'success');
    }
    setIsCodeModalOpen(false);
  };

  const handleDeleteCode = (codeId: string, codeName: string) => {
    setConfirmModal({
      title: '공통 코드 삭제',
      message: `[${codeName}] 코드를 삭제하시겠습니까?`,
      onConfirm: () => {
        const filtered = companyCodes.filter((c) => c.id !== codeId);
        saveCodes(filtered);
        showToast(`[${codeName}] 코드가 삭제되었습니다.`, 'info');
        setConfirmModal(null);
      },
    });
  };

  const filteredCodes = companyCodes.filter((c) => {
    if (selectedCodeGroup !== 'ALL' && c.group_code !== selectedCodeGroup) return false;
    if (codeSearchTerm) {
      const q = codeSearchTerm.toLowerCase();
      return (
        c.code_name.toLowerCase().includes(q) ||
        c.code_value.toLowerCase().includes(q) ||
        c.group_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Header with Breadcrumb and Company Context */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                시스템 관리 &gt; 회계설정
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                {currentCompany.company_name} ({currentCompany.company_code})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <span>회계설정 · 코드종합관리</span>
              <SlidersHorizontal className="w-6 h-6 text-indigo-600 shrink-0" />
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              회사관리자가 법인 회계 정책에 맞게 계정과목, 신용카드, 현금계좌, 회계단위, 공통 코드를 등록·수정·삭제하여 자유롭게 구성할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-800">회사관리자 권한 가동 중</div>
              <div className="text-[11px] text-emerald-600 font-semibold">등록 · 수정 · 삭제 자율 제어</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 2. Top Tabs Navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 pt-5 -mb-1 scrollbar-none">
          <button
            onClick={() => handleSelectTab('accounts')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              currentTab === 'accounts'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>계정과목관리</span>
            <span className="text-[10px] bg-slate-100 px-1.5 py-0.2 rounded-full font-semibold">
              {accounts.length}
            </span>
          </button>

          <button
            onClick={() => handleSelectTab('cards')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              currentTab === 'cards'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>신용카드관리</span>
            <span className="text-[10px] bg-slate-100 px-1.5 py-0.2 rounded-full font-semibold">
              {corporateCards.length}
            </span>
          </button>

          <button
            onClick={() => handleSelectTab('cash-banks')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              currentTab === 'cash-banks'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>현금계좌관리</span>
            <span className="text-[10px] bg-slate-100 px-1.5 py-0.2 rounded-full font-semibold">
              {bankAccounts.length}
            </span>
          </button>

          <button
            onClick={() => handleSelectTab('units')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              currentTab === 'units'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>회계단위관리</span>
            <span className="text-[10px] bg-slate-100 px-1.5 py-0.2 rounded-full font-semibold">
              {accountingUnits.length}
            </span>
          </button>

          <button
            onClick={() => handleSelectTab('codes')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              currentTab === 'codes'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>코드종합관리</span>
            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full font-bold">
              자율편집
            </span>
          </button>
        </div>
      </div>

      {/* =========================================================
          Tab 1: 계정과목관리 (Accounts)
          ========================================================= */}
      {currentTab === 'accounts' && (
        <div className="space-y-4">
          <div className="bg-indigo-50/50 border border-indigo-200/60 rounded-xl p-3.5 text-xs text-indigo-900 flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              <strong>계정과목 관리 안내:</strong> 우리 회사의 자산, 부채, 자본, 수익, 비용 계정과목의 활성화 여부를 설정하고, 회사의 특성에 맞는 커스텀 계정과목을 추가/삭제할 수 있습니다.
            </div>
          </div>
          <AdminAccountsView
            currentCompany={currentCompany}
            accounts={accounts}
            onToggleAccount={onToggleAccount}
            onCreateAccount={onCreateAccount}
            onBatchCreateAccounts={onBatchCreateAccounts}
            onDeleteAccount={onDeleteAccount}
            userRole={userRole}
          />
        </div>
      )}

      {/* =========================================================
          Tab 2: 신용카드관리 (Corporate Cards)
          ========================================================= */}
      {currentTab === 'cards' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>법인 신용카드 관리</span>
                <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded">
                  총 {corporateCards.length}개
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                회사 명의로 발급된 법인카드 및 업무용 카드를 등록하고, 소지자/한도/결제일을 관리합니다.
              </p>
            </div>

            <button
              onClick={openAddCardModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>새 신용카드 등록</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">카드명 / 발급사</th>
                    <th className="py-3 px-4">카드번호 (마스킹)</th>
                    <th className="py-3 px-4">카드 구분</th>
                    <th className="py-3 px-4 text-right">월 사용한도</th>
                    <th className="py-3 px-4 text-center">결제일</th>
                    <th className="py-3 px-4">소지자 (담당자)</th>
                    <th className="py-3 px-4 text-center">사용 상태</th>
                    <th className="py-3 px-4 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {corporateCards.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        등록된 신용카드가 없습니다. 상단의 [+ 새 신용카드 등록]을 눌러 추가하세요.
                      </td>
                    </tr>
                  ) : (
                    corporateCards.map((card) => (
                      <tr key={card.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{card.card_name}</div>
                          <div className="text-[11px] text-indigo-600 font-semibold">{card.card_issuer}</div>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {card.card_number}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              card.card_type === 'CORPORATE'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {card.card_type === 'CORPORATE' ? '법인공용' : '개인법인'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          {formatKRW(card.monthly_limit)}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-700">
                          매월 {card.payment_day}일
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-900 font-semibold">{card.holder_name || '미지정'}</div>
                          <div className="text-[11px] text-slate-400">{card.department_name}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              card.is_active
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {card.is_active ? '사용중' : '정지'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditCardModal(card)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="카드 수정"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCard(card.id, card.card_name)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="카드 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          Tab 3: 현금계좌관리 (Cash & Bank Accounts)
          ========================================================= */}
      {currentTab === 'cash-banks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>현금 및 은행계좌 관리</span>
                <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded">
                  총 {bankAccounts.length}개
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                수입·지출 거래와 연동되는 보통예금, 현금출납장, 후원금전용, 보조금 계좌를 설정합니다.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts.map((b) => (
              <div
                key={b.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:border-indigo-300 transition-all space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                      <Landmark className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{b.bank_name}</div>
                      <div className="text-[11px] font-mono text-slate-500">{b.account_number}</div>
                    </div>
                  </div>
                  {b.is_main && (
                    <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded border border-amber-200">
                      주거래
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[11px] text-slate-500">계좌별칭</div>
                  <div className="text-xs font-semibold text-slate-800 mt-0.5">{b.account_name}</div>
                </div>

                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-[11px] text-slate-500">현재 잔액</span>
                  <span className="text-base font-extrabold text-slate-900">
                    {formatKRW(b.current_balance)}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 bg-slate-50 p-2 rounded-lg">
                  {b.notes || '비고 사항 없음'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================
          Tab 4: 회계단위관리 (Accounting Units)
          ========================================================= */}
      {currentTab === 'units' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>사업장 및 회계단위 관리</span>
                <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded">
                  총 {accountingUnits.length}개
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                본점, 지점, 부설연구소, 독립채산 사업부 등 회계 결산 단위를 분리하여 관리할 수 있습니다.
              </p>
            </div>

            <button
              onClick={openAddUnitModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>새 회계단위 추가</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">단위코드</th>
                    <th className="py-3 px-4">회계단위명</th>
                    <th className="py-3 px-4">사업자등록번호</th>
                    <th className="py-3 px-4">대표자</th>
                    <th className="py-3 px-4">소재지 (주소)</th>
                    <th className="py-3 px-4 text-center">주 단위 여부</th>
                    <th className="py-3 px-4 text-center">상태</th>
                    <th className="py-3 px-4 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {accountingUnits.map((unit) => (
                    <tr key={unit.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                        {unit.unit_code}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {unit.unit_name}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {unit.business_number || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-800">
                        {unit.representative_name || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={unit.address}>
                        {unit.address || '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {unit.is_main ? (
                          <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded">
                            주 회계단위
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">일반</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            unit.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {unit.is_active ? '정상' : '중지'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditUnitModal(unit)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="수정"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUnit(unit.id, unit.unit_name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          Tab 5: 코드종합관리 (Comprehensive Code Management)
          ========================================================= */}
      {currentTab === 'codes' && (
        <div className="space-y-4">
          {/* Explanation Callout */}
          <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-indigo-800">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
                <Code2 className="w-5 h-5" />
              </div>
              <div className="space-y-1 text-xs">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <span>코드종합관리 (회사 맞춤형 자율 설정)</span>
                  <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.2 rounded font-semibold">
                    회사관리자 전권
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  회사관리자가 등록, 수정, 삭제하여 회사의 회계 환경에 맞게 커스텀할 수 있는 종합 코드 관리 메뉴입니다.<br />
                  전표 작성 시 사용되는 <strong>지출유형, 결제수단, 증빙서류유형, 프로젝트구분</strong> 등의 코드를 자유롭게 관리하세요.
                </p>
              </div>
            </div>
          </div>

          {/* Group Filter Buttons + Search + Add Button */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedCodeGroup('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  selectedCodeGroup === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                전체 ({companyCodes.length})
              </button>
              {CODE_GROUPS.map((g) => {
                const count = companyCodes.filter((c) => c.group_code === g.code).length;
                return (
                  <button
                    key={g.code}
                    onClick={() => setSelectedCodeGroup(g.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      selectedCodeGroup === g.code
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {g.name} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="코드명, 코드값 검색..."
                  value={codeSearchTerm}
                  onChange={(e) => setCodeSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs w-44 sm:w-52 bg-white"
                />
              </div>

              <button
                onClick={openAddCodeModal}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>새 코드 등록</span>
              </button>
            </div>
          </div>

          {/* Codes Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">분류 그룹</th>
                    <th className="py-3 px-4">코드값 (ID)</th>
                    <th className="py-3 px-4">코드명 (표시명)</th>
                    <th className="py-3 px-4 text-center">정렬순서</th>
                    <th className="py-3 px-4">설명 / 비고</th>
                    <th className="py-3 px-4 text-center">사용 상태</th>
                    <th className="py-3 px-4 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredCodes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        해당하는 코드가 없습니다. [+ 새 코드 등록] 버튼을 눌러 추가하세요.
                      </td>
                    </tr>
                  ) : (
                    filteredCodes.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <span className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded border border-slate-200">
                            {item.group_name}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                          {item.code_value}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {item.code_name}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 font-mono">
                          {item.sort_order}
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={item.description}>
                          {item.description || '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {item.is_active ? '사용' : '미사용'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditCodeModal(item)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="코드 수정"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCode(item.id, item.code_name)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="코드 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          Modal: 신용카드 등록 및 수정
          ========================================================= */}
      {isCardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-400" />
                <span>{editingCard ? '신용카드 정보 수정' : '새 법인 신용카드 등록'}</span>
              </h3>
              <button onClick={() => setIsCardModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCardSubmit} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">카드 별칭 / 명칭 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 법인 신한카드 1호 (운영비)"
                  value={cardFormData.card_name}
                  onChange={(e) => setCardFormData({ ...cardFormData, card_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">카드사 *</label>
                  <select
                    value={cardFormData.card_issuer}
                    onChange={(e) => setCardFormData({ ...cardFormData, card_issuer: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                  >
                    <option value="신한카드">신한카드</option>
                    <option value="KB국민카드">KB국민카드</option>
                    <option value="하나카드">하나카드</option>
                    <option value="삼성카드">삼성카드</option>
                    <option value="현대카드">현대카드</option>
                    <option value="BC카드">BC카드</option>
                    <option value="IBK기업은행">IBK기업은행</option>
                    <option value="NH농협카드">NH농협카드</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">카드구분</label>
                  <select
                    value={cardFormData.card_type}
                    onChange={(e) => setCardFormData({ ...cardFormData, card_type: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                  >
                    <option value="CORPORATE">법인공용</option>
                    <option value="INDIVIDUAL_CORP">임직원개인법인</option>
                    <option value="CHECK">법인체크카드</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">카드 번호 (마스킹) *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 1102-****-****-9831"
                  value={cardFormData.card_number}
                  onChange={(e) => setCardFormData({ ...cardFormData, card_number: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">월 한도 (원)</label>
                  <input
                    type="number"
                    step="100000"
                    value={cardFormData.monthly_limit}
                    onChange={(e) => setCardFormData({ ...cardFormData, monthly_limit: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">결제일 (일)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={cardFormData.payment_day}
                    onChange={(e) => setCardFormData({ ...cardFormData, payment_day: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">소지자 / 담당자</label>
                  <input
                    type="text"
                    placeholder="홍길동"
                    value={cardFormData.holder_name}
                    onChange={(e) => setCardFormData({ ...cardFormData, holder_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">사용 부서</label>
                  <input
                    type="text"
                    placeholder="경영지원팀"
                    value={cardFormData.department_name}
                    onChange={(e) => setCardFormData({ ...cardFormData, department_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">비고 / 메모</label>
                <input
                  type="text"
                  placeholder="용도 및 보관 위치 등"
                  value={cardFormData.notes}
                  onChange={(e) => setCardFormData({ ...cardFormData, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCardModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                >
                  {editingCard ? '수정 완료' : '카드 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          Modal: 회계단위 등록 및 수정
          ========================================================= */}
      {isUnitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Building className="w-4 h-4 text-indigo-400" />
                <span>{editingUnit ? '회계단위 수정' : '새 회계단위 추가'}</span>
              </h3>
              <button onClick={() => setIsUnitModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUnitSubmit} className="p-6 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">회계단위 코드 *</label>
                  <input
                    type="text"
                    required
                    placeholder="UNIT_01, HQ"
                    value={unitFormData.unit_code}
                    onChange={(e) => setUnitFormData({ ...unitFormData, unit_code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono font-medium uppercase"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">회계단위명 *</label>
                  <input
                    type="text"
                    required
                    placeholder="본사, 강남지점 등"
                    value={unitFormData.unit_name}
                    onChange={(e) => setUnitFormData({ ...unitFormData, unit_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">사업자등록번호</label>
                <input
                  type="text"
                  placeholder="000-00-00000"
                  value={unitFormData.business_number}
                  onChange={(e) => setUnitFormData({ ...unitFormData, business_number: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">대표자명</label>
                  <input
                    type="text"
                    placeholder="대표자 성명"
                    value={unitFormData.representative_name}
                    onChange={(e) => setUnitFormData({ ...unitFormData, representative_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={unitFormData.is_main}
                      onChange={(e) => setUnitFormData({ ...unitFormData, is_main: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    <span>주 회계단위로 설정</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">소재지 주소</label>
                <input
                  type="text"
                  placeholder="사업장 소재지 주소"
                  value={unitFormData.address}
                  onChange={(e) => setUnitFormData({ ...unitFormData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">비고</label>
                <input
                  type="text"
                  placeholder="회계단위 관련 비고"
                  value={unitFormData.notes}
                  onChange={(e) => setUnitFormData({ ...unitFormData, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUnitModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                >
                  {editingUnit ? '수정 완료' : '회계단위 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          Modal: 코드 등록 및 수정 (코드종합관리)
          ========================================================= */}
      {isCodeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span>{editingCode ? '코드 수정' : '새 코드 등록 (회사 맞춤형)'}</span>
              </h3>
              <button onClick={() => setIsCodeModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCodeSubmit} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">분류 그룹 *</label>
                <select
                  value={codeFormData.group_code}
                  onChange={(e) => handleGroupCodeChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                >
                  {CODE_GROUPS.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">코드값 (Key/ID) *</label>
                  <input
                    type="text"
                    required
                    placeholder="예: EXP_MEAL"
                    value={codeFormData.code_value}
                    onChange={(e) => setCodeFormData({ ...codeFormData, code_value: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono font-medium uppercase"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">정렬 순서</label>
                  <input
                    type="number"
                    value={codeFormData.sort_order}
                    onChange={(e) => setCodeFormData({ ...codeFormData, sort_order: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">코드명 (화면 표시명) *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 회의비 및 야근식대"
                  value={codeFormData.code_name}
                  onChange={(e) => setCodeFormData({ ...codeFormData, code_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">코드 설명 및 가이드</label>
                <textarea
                  rows={2}
                  placeholder="전표 입력자에게 안내할 항목 설명"
                  value={codeFormData.description}
                  onChange={(e) => setCodeFormData({ ...codeFormData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={codeFormData.is_active}
                    onChange={(e) => setCodeFormData({ ...codeFormData, is_active: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>사용 활성화 (전표 작성 메뉴에 노출)</span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCodeModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                >
                  {editingCode ? '수정 완료' : '코드 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (iFrame safe) */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{confirmModal.title}</h3>
              <p className="text-xs text-slate-600 mt-1">{confirmModal.message}</p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-in slide-in-from-bottom-5 duration-200">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2.5 ${
              toast.type === 'error'
                ? 'bg-rose-50 text-rose-900 border-rose-200'
                : toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-indigo-50 text-indigo-900 border-indigo-200'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : toast.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-auto text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
