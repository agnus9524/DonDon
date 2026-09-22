/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/client';
import {
  Company,
  User,
  Team,
  Account,
  BankAccount,
  Vendor,
  Transaction,
  UserCompanyRole,
  RoleType,
} from './types';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar, NavSection } from './components/Sidebar';
import { CompanySelectorModal } from './components/CompanySelectorModal';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { BudgetView } from './components/BudgetView';
import { BankAccountsView } from './components/BankAccountsView';
import { ReportsView } from './components/ReportsView';
import { AdminCompanyView } from './components/AdminCompanyView';
import { AdminTeamsView } from './components/AdminTeamsView';
import { AdminAccountsView } from './components/AdminAccountsView';
import { AdminUsersView } from './components/AdminUsersView';
import { AdminVendorsView } from './components/AdminVendorsView';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [userCompanies, setUserCompanies] = useState<(Company & { my_role?: string })[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [currentRole, setCurrentRole] = useState<string>('VIEWER');
  const [allUserRoles, setAllUserRoles] = useState<UserCompanyRole[]>([]);

  // Section navigation
  const [currentSection, setCurrentSection] = useState<NavSection>('dashboard');

  // Domain data strictly scoped to currentCompany
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Modals
  const [isCompanySelectorOpen, setIsCompanySelectorOpen] = useState(false);
  const [isBankImportOpen, setIsBankImportOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize and load user & tenant auth
  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      // 1. Fetch current authenticated user & their company list
      const meData = await api.getMe();
      setCurrentUser(meData.user);
      setUserCompanies(meData.companies);

      // 2. Fetch all users and all companies (for super admin switcher & management)
      const adminData = await api.getAdminUsersAndRoles();
      setAllUsers(adminData.users);
      setAllCompanies(adminData.companies);
      setAllUserRoles(adminData.roles);

      // 3. Resolve active company:
      const savedCompanyId = api.getCompanyId();
      let targetCompany = meData.companies.find((c) => c.id === savedCompanyId);

      // If user is super admin, they can access any company in allCompanies
      if (!targetCompany && meData.user.is_super_admin) {
        targetCompany = adminData.companies.find((c) => c.id === savedCompanyId) as any;
      }

      // Default fallback
      if (!targetCompany) {
        targetCompany = meData.companies[0] || adminData.companies[0];
      }

      if (targetCompany) {
        api.setCompany(targetCompany.id);
        setCurrentCompany(targetCompany);
        const role = targetCompany.my_role || (meData.user.is_super_admin ? 'SUPER_ADMIN' : 'VIEWER');
        setCurrentRole(role);

        // Load company-specific scoped domain data
        await loadCompanyData(targetCompany.id);
      } else {
        setIsCompanySelectorOpen(true);
      }
    } catch (err: any) {
      console.error('Initial load error:', err);
      setErrorMessage(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load domain data for a given company
  const loadCompanyData = async (companyId: string) => {
    try {
      const [txData, bankData, teamData, accData, budData, venData] = await Promise.all([
        api.getTransactions(),
        api.getBankAccounts(),
        api.getTeams(),
        api.getAccounts(),
        api.getBudgets(2026),
        api.getVendors(),
      ]);

      setTransactions(txData.transactions || []);
      setBankAccounts(bankData || []);
      setTeams(teamData || []);
      setAccounts(accData || []);
      setBudgets(budData || []);
      setVendors(venData || []);
    } catch (err: any) {
      console.error('Company data load error:', err);
      setErrorMessage(err.message || '회사 데이터를 조회하지 못했습니다.');
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Handler: Switch company
  const handleSelectCompany = async (companyId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      api.setCompany(companyId);

      // Find company
      const found =
        userCompanies.find((c) => c.id === companyId) ||
        allCompanies.find((c) => c.id === companyId);

      if (found) {
        setCurrentCompany(found);
        const myRole = (found as any).my_role || (currentUser?.is_super_admin ? 'SUPER_ADMIN' : 'VIEWER');
        setCurrentRole(myRole);
      }

      setIsCompanySelectorOpen(false);
      await loadCompanyData(companyId);
    } catch (err: any) {
      setErrorMessage(err.message || '회사 전환에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Switch user session (Persona testing)
  const handleSwitchUser = async (userId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      api.setUser(userId);
      await loadInitialData();
    } catch (err: any) {
      setErrorMessage(err.message || '사용자 전환 실패');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Create transaction
  const handleAddTransaction = async (payload: Partial<Transaction>) => {
    const newTx = await api.createTransaction(payload);
    setTransactions((prev) => [newTx, ...prev]);

    // Refresh bank accounts to reflect balance change
    const updatedBanks = await api.getBankAccounts();
    setBankAccounts(updatedBanks);

    // Refresh budgets
    const updatedBudgets = await api.getBudgets();
    setBudgets(updatedBudgets);
  };

  // Handler: Delete transaction
  const handleDeleteTransaction = async (id: string) => {
    await api.deleteTransaction(id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  // Handler: Add bank account
  const handleAddBankAccount = async (payload: any) => {
    const newBank = await api.createBankAccount(payload);
    setBankAccounts((prev) => [...prev, newBank]);
  };

  // Handler: Bank Excel import
  const handleImportBankExcel = async (bankAccountId: string, rows?: any[]) => {
    const result = await api.importBankExcel(bankAccountId, rows);
    setTransactions((prev) => [...result.transactions, ...prev]);
    const updatedBanks = await api.getBankAccounts();
    setBankAccounts(updatedBanks);
  };

  // Handler: Toggle company account (Method B)
  const handleToggleAccount = async (accountId: string, isActive: boolean) => {
    await api.toggleCompanyAccount(accountId);
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, is_active: isActive } : a))
    );
  };

  // Handler: Add team
  const handleAddTeam = async (name: string, code?: string) => {
    const newTeam = await api.createTeam(name, code);
    setTeams((prev) => [...prev, newTeam]);
  };

  // Handler: Create company
  const handleCreateCompany = async (payload: Partial<Company>) => {
    const newComp = await api.createCompany(payload);
    setAllCompanies((prev) => [...prev, newComp]);
    setUserCompanies((prev) => [...prev, { ...newComp, my_role: 'ADMIN' }]);
    // Switch to the new company
    await handleSelectCompany(newComp.id);
  };

  // Handler: Assign User Role
  const handleAssignRole = async (userId: string, companyId: string, role: RoleType) => {
    await api.assignUserCompanyRole(userId, companyId, role);
    const adminData = await api.getAdminUsersAndRoles();
    setAllUserRoles(adminData.roles);
  };

  // Handler: Add vendor
  const handleAddVendor = async (payload: Partial<Vendor>) => {
    const newVendor = await api.createVendor(payload);
    setVendors((prev) => [...prev, newVendor]);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-white space-y-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-lg font-bold">don don 통합 회계시스템 로딩 중...</div>
          <div className="text-xs text-slate-400">멀티테넌트 인증 및 테넌트 장부를 준비하고 있습니다.</div>
        </div>
      </div>
    );
  }

  const isSuperAdmin = currentUser.is_super_admin === true;

  // Enrich companies with user count
  const enrichedCompanies = allCompanies.map((c) => {
    const uCount = allUserRoles.filter((r) => r.company_id === c.id).length;
    return { ...c, user_count: Math.max(uCount, 1) };
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <TopNavbar
        currentCompany={currentCompany}
        companies={userCompanies.length > 0 ? userCompanies : (enrichedCompanies as any)}
        currentUser={currentUser}
        allUsers={allUsers}
        currentRole={currentRole}
        onSelectCompany={handleSelectCompany}
        onSelectUser={handleSwitchUser}
        onOpenNewCompanyModal={() => setCurrentSection('admin-companies')}
        onOpenCompanySelector={() => setIsCompanySelectorOpen(true)}
        onRefresh={() => currentCompany && loadCompanyData(currentCompany.id)}
        isLoading={isLoading}
      />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          currentSection={currentSection}
          onSelectSection={setCurrentSection}
          userRole={currentRole}
          isSuperAdmin={isSuperAdmin}
          companyName={currentCompany ? currentCompany.company_name : '회사 선택 대기'}
        />

        {/* Dynamic Main Content Canvas */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
          {errorMessage && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={() => currentCompany && loadCompanyData(currentCompany.id)}
                className="text-rose-700 font-bold underline"
              >
                다시 시도
              </button>
            </div>
          )}

          {currentCompany && (
            <>
              {currentSection === 'dashboard' && (
                <DashboardView
                  currentCompany={currentCompany}
                  transactions={transactions}
                  bankAccounts={bankAccounts}
                  teams={teams}
                  accounts={accounts}
                  onNavigate={setCurrentSection}
                  onOpenAddTransaction={() => setCurrentSection('transactions')}
                  onOpenBankImport={() => setIsBankImportOpen(true)}
                />
              )}

              {currentSection === 'transactions' && (
                <TransactionsView
                  currentCompany={currentCompany}
                  transactions={transactions}
                  teams={teams}
                  accounts={accounts}
                  bankAccounts={bankAccounts}
                  vendors={vendors}
                  userRole={currentRole}
                  onAddTransaction={handleAddTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  onOpenBankImport={() => setIsBankImportOpen(true)}
                />
              )}

              {currentSection === 'budgets' && (
                <BudgetView
                  currentCompany={currentCompany}
                  budgets={budgets}
                  teams={teams}
                  accounts={accounts}
                  userRole={currentRole}
                  onRefresh={() => loadCompanyData(currentCompany.id)}
                />
              )}

              {currentSection === 'banks' && (
                <BankAccountsView
                  currentCompany={currentCompany}
                  bankAccounts={bankAccounts}
                  userRole={currentRole}
                  onAddBankAccount={handleAddBankAccount}
                  onImportBankExcel={handleImportBankExcel}
                  isImportModalOpen={isBankImportOpen}
                  setIsImportModalOpen={setIsBankImportOpen}
                />
              )}

              {currentSection === 'reports' && (
                <ReportsView
                  currentCompany={currentCompany}
                  transactions={transactions}
                  teams={teams}
                  accounts={accounts}
                />
              )}

              {currentSection === 'admin-companies' && (
                <AdminCompanyView
                  companies={enrichedCompanies}
                  currentCompanyId={currentCompany.id}
                  onSelectCompany={handleSelectCompany}
                  onCreateCompany={handleCreateCompany}
                  isSuperAdmin={isSuperAdmin}
                />
              )}

              {currentSection === 'admin-teams' && (
                <AdminTeamsView
                  currentCompany={currentCompany}
                  teams={teams}
                  userRole={currentRole}
                  onAddTeam={handleAddTeam}
                />
              )}

              {currentSection === 'admin-accounts' && (
                <AdminAccountsView
                  currentCompany={currentCompany}
                  accounts={accounts}
                  onToggleAccount={handleToggleAccount}
                  userRole={currentRole}
                />
              )}

              {currentSection === 'admin-users' && (
                <AdminUsersView
                  users={allUsers}
                  companies={allCompanies}
                  userRoles={allUserRoles}
                  currentCompany={currentCompany}
                  currentUserId={currentUser.id}
                  onSwitchUser={handleSwitchUser}
                  onAssignRole={handleAssignRole}
                />
              )}

              {currentSection === 'admin-vendors' && (
                <AdminVendorsView
                  currentCompany={currentCompany}
                  vendors={vendors}
                  userRole={currentRole}
                  onAddVendor={handleAddVendor}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Company Selector Modal (Prompt Requirement) */}
      <CompanySelectorModal
        isOpen={isCompanySelectorOpen}
        onClose={() => setIsCompanySelectorOpen(false)}
        user={currentUser}
        companies={userCompanies.length > 0 ? userCompanies : (enrichedCompanies as any)}
        currentCompanyId={currentCompany?.id || ''}
        onSelectCompany={handleSelectCompany}
        canDismiss={!!currentCompany}
      />
    </div>
  );
}
