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
import { AdminPermissionsView } from './components/AdminPermissionsView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { LoginView } from './components/LoginView';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(api.isLoggedIn());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [userCompanies, setUserCompanies] = useState<(Company & { my_role?: string })[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [currentRole, setCurrentRole] = useState<string>('VIEWER');
  const [allUserRoles, setAllUserRoles] = useState<UserCompanyRole[]>([]);

  // Section navigation & Mobile state
  const [currentSection, setCurrentSection] = useState<NavSection>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const handleLogin = async (emailOrId: string) => {
    await api.login(emailOrId);
    setIsLoggedIn(true);
    await loadInitialData();
  };

  const handleLogout = () => {
    api.logout();
    setIsLoggedIn(false);
    setCurrentUser(null);
    setCurrentCompany(null);
  };

  const handleRequestJoinCompany = async (companyId: string, reason: string) => {
    await api.requestJoinCompany(companyId, reason);
  };

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

  useEffect(() => {
    if (isLoggedIn) {
      loadInitialData();
    } else {
      fetch('/api/v1/companies')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.companies) setAllCompanies(data.companies);
        })
        .catch(() => {});
      setIsLoading(false);
    }
  }, [isLoggedIn, loadInitialData]);

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

  // Handler: Create account
  const handleCreateAccount = async (payload: any) => {
    const newAccount = await api.createAccount(payload);
    setAccounts((prev) => [...prev, newAccount]);
  };

  // Handler: Delete account
  const handleDeleteAccount = async (accountId: string) => {
    await api.deleteAccount(accountId);
    setAccounts((prev) => prev.filter((a) => a.id !== accountId));
  };

  // Handler: Add team
  const handleAddTeam = async (name: string, code?: string) => {
    const newTeam = await api.createTeam(name, code);
    setTeams((prev) => [...prev, newTeam]);
  };

  // Handler: Delete team
  const handleDeleteTeam = async (teamId: string) => {
    await api.deleteTeam(teamId);
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
  };

  // Handler: Create company
  const handleCreateCompany = async (payload: Partial<Company>) => {
    const newComp = await api.createCompany(payload);
    setAllCompanies((prev) => [...prev, newComp]);
    setUserCompanies((prev) => [...prev, { ...newComp, my_role: 'ADMIN' }]);
    // Switch to the new company
    await handleSelectCompany(newComp.id);
  };

  // Handler: Delete company
  const handleDeleteCompany = async (companyId: string, confirmName?: string) => {
    await api.deleteCompany(companyId, confirmName);
    setAllCompanies((prev) => prev.filter((c) => c.id !== companyId));
    setUserCompanies((prev) => prev.filter((c) => c.id !== companyId));

    // If currently selected company was deleted, switch to another company
    if (currentCompany?.id === companyId) {
      const remaining = allCompanies.filter((c) => c.id !== companyId);
      if (remaining.length > 0) {
        await handleSelectCompany(remaining[0].id);
      } else {
        setCurrentCompany(null);
        setIsCompanySelectorOpen(true);
      }
    }
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

  if (!isLoggedIn || !currentUser) {
    return (
      <LoginView
        onLogin={handleLogin}
        companies={allCompanies.length > 0 ? allCompanies : []}
        onRequestJoinCompany={handleRequestJoinCompany}
      />
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
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onLogout={handleLogout}
      />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <Sidebar
          currentSection={currentSection}
          onSelectSection={(sec) => {
            setCurrentSection(sec);
            setIsMobileMenuOpen(false);
          }}
          userRole={currentRole}
          isSuperAdmin={isSuperAdmin}
          companyName={currentCompany ? currentCompany.company_name : '회사 선택 대기'}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* Dynamic Main Content Canvas */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 pb-20 md:pb-8 max-w-7xl mx-auto w-full min-w-0">
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
                  onDeleteCompany={handleDeleteCompany}
                  isSuperAdmin={isSuperAdmin}
                />
              )}

              {currentSection === 'admin-teams' && (
                <AdminTeamsView
                  currentCompany={currentCompany}
                  teams={teams}
                  userRole={currentRole}
                  onAddTeam={handleAddTeam}
                  onDeleteTeam={handleDeleteTeam}
                />
              )}

              {currentSection === 'admin-accounts' && (
                <AdminAccountsView
                  currentCompany={currentCompany}
                  accounts={accounts}
                  onToggleAccount={handleToggleAccount}
                  onCreateAccount={handleCreateAccount}
                  onDeleteAccount={handleDeleteAccount}
                  userRole={currentRole}
                />
              )}

              {currentSection === 'admin-users' && (
                <AdminUsersView
                  users={allUsers}
                  companies={allCompanies}
                  teams={teams}
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

              {currentSection === 'admin-permissions' && (
                <AdminPermissionsView currentCompany={currentCompany} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (md:hidden) */}
      <MobileBottomNav
        currentSection={currentSection}
        onSelectSection={(section) => {
          setCurrentSection(section);
          setIsMobileMenuOpen(false);
        }}
        onOpenAllMenu={() => setIsMobileMenuOpen(true)}
        isSuperAdmin={isSuperAdmin}
      />

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
