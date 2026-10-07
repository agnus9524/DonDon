/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, setUnauthorizedHandler } from './api/client';
import { isFirebaseConfigured, loginDev, loginWithGoogle, logout, watchSession } from './services/authSession';
import {
  Company,
  User,
  Team,
  Account,
  BankAccount,
  Vendor,
  Transaction,
  UserCompanyRole,
  UserTeamRole,
  PermissionCode,
  RoleType,
  JoinRequest,
  AuthConfig,
  MeResponse,
  PendingJoinInfo,
} from './types';
import { PERMISSION_DEFINITIONS, ROLE_PERMISSIONS } from './data/initialData';
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
import { AdminAccountingSettingsView, AccountingSettingTab } from './components/AdminAccountingSettingsView';
import { AdminUserSettingsView, UserSettingTab } from './components/AdminUserSettingsView';
import { AdminUsersView } from './components/AdminUsersView';
import { AdminVendorsView } from './components/AdminVendorsView';
import { AdminPermissionsView } from './components/AdminPermissionsView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { LoginView } from './components/LoginView';
import { OnboardingView, LicenseBlockedView, RenewLicenseModal } from './components/LicenseGateView';
import { SuperAdminView } from './components/SuperAdminView';
import { AlertCircle, Lock, KeyRound } from 'lucide-react';

type MyCompany = MeResponse['companies'][number];

export default function App() {
  // 로그인 세션 (Firebase Google 로그인) — sessionReady 전에는 로그인 여부를 아직 모른다
  const [sessionReady, setSessionReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingJoinInfo[]>([]);
  const [isRenewOpen, setIsRenewOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [userCompanies, setUserCompanies] = useState<MyCompany[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [currentRole, setCurrentRole] = useState<string>('VIEWER');
  const [allUserRoles, setAllUserRoles] = useState<UserCompanyRole[]>([]);
  const [teamRoles, setTeamRoles] = useState<UserTeamRole[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);

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

  const handleLogout = async () => {
    api.clearCompany();
    await logout();
  };

  const handleApproveJoinRequest = async (requestId: string, roleId: string) => {
    await api.approveJoinRequest(requestId, roleId);
    const [reqs, adminData] = await Promise.all([
      api.getJoinRequests(),
      api.getAdminUsersAndRoles(),
    ]);
    setJoinRequests(reqs);
    setAllUsers(adminData.users);
    setAllUserRoles(adminData.roles);
  };

  const handleRejectJoinRequest = async (requestId: string) => {
    await api.rejectJoinRequest(requestId);
    const reqs = await api.getJoinRequests();
    setJoinRequests(reqs);
  };

  const handleUpdateUserStatus = async (userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'PENDING') => {
    await api.updateUserStatus(userId, status);
    const [reqs, adminData] = await Promise.all([
      api.getJoinRequests(),
      api.getAdminUsersAndRoles(),
    ]);
    setJoinRequests(reqs);
    setAllUsers(adminData.users);
    setAllUserRoles(adminData.roles);
  };

  // Load domain data for a given company
  const loadCompanyData = useCallback(async (companyId: string) => {
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
  }, []);

  // Initialize and load user & tenant auth
  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      // 1. 내 정보 + 내 회사 목록(라이선스 상태 포함)
      const meData = await api.getMe();
      setCurrentUser(meData.user);
      setIsSuperAdmin(meData.is_super_admin);
      setUserCompanies(meData.companies);
      setPendingRequests(meData.pending_requests);

      // 소속 회사가 없는 일반 사용자 → 인증키 입력 / 가입 신청 화면
      if (!meData.is_super_admin && meData.companies.length === 0) {
        api.clearCompany();
        setCurrentCompany(null);
        return;
      }

      // 2. 사용할 회사 결정: 저장된 회사 → 라이선스가 유효한 첫 회사 → 그 외
      const isUsable = (c: MyCompany) => meData.is_super_admin || c.license.state === 'active';
      const savedCompanyId = api.getCompanyId();
      const targetCompany =
        meData.companies.find((c) => c.id === savedCompanyId && isUsable(c)) ||
        meData.companies.find(isUsable) ||
        meData.companies.find((c) => c.id === savedCompanyId) ||
        meData.companies[0];

      if (!targetCompany) {
        // 최고관리자인데 아직 등록된 회사가 하나도 없는 경우 → 슈퍼 관리자 패널로
        api.clearCompany();
        setCurrentCompany(null);
        setCurrentRole('SUPER_ADMIN');
        setAllCompanies([]);
        setCurrentSection('admin-super');
        return;
      }

      api.setCompany(targetCompany.id);
      setCurrentCompany(targetCompany);
      setCurrentRole(targetCompany.my_role || (meData.is_super_admin ? 'SUPER_ADMIN' : 'VIEWER'));

      // 라이선스가 만료·중지된 회사는 자료를 불러오지 않는다 (안내 화면으로 대체)
      if (!isUsable(targetCompany)) return;

      // 3. 사용자·권한 정보 (서버가 내 회사 범위로 제한해서 내려줌)
      const adminData = await api.getAdminUsersAndRoles();
      setAllUsers(adminData.users);
      setAllCompanies(adminData.companies);
      setAllUserRoles(adminData.roles);
      setTeamRoles(adminData.team_roles || []);

      try {
        setJoinRequests(await api.getJoinRequests());
      } catch {
        setJoinRequests([]);
      }

      // 4. 회사 자료
      await loadCompanyData(targetCompany.id);
    } catch (err: any) {
      console.error('Initial load error:', err);
      setErrorMessage(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [loadCompanyData]);

  // 로그인 세션 감시 + 로그인 화면 설정 불러오기
  useEffect(() => {
    api
      .getAuthConfig()
      .then(setAuthConfig)
      .catch(() => setAuthConfig({ firebase_configured: false, dev_login: false }));
    setUnauthorizedHandler(() => {
      logout();
    });
    const unsubscribe = watchSession((signedIn) => {
      setIsLoggedIn(signedIn);
      setSessionReady(true);
    });
    return () => {
      unsubscribe();
      setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (isLoggedIn) {
      loadInitialData();
    } else {
      // 로그아웃: 화면에 남아 있는 이전 사용자의 자료를 모두 비운다
      setCurrentUser(null);
      setIsSuperAdmin(false);
      setCurrentCompany(null);
      setUserCompanies([]);
      setAllCompanies([]);
      setAllUsers([]);
      setAllUserRoles([]);
      setTeamRoles([]);
      setJoinRequests([]);
      setPendingRequests([]);
      setTransactions([]);
      setBankAccounts([]);
      setTeams([]);
      setAccounts([]);
      setBudgets([]);
      setVendors([]);
      setErrorMessage(null);
      setCurrentSection('dashboard');
      setIsLoading(false);
    }
  }, [sessionReady, isLoggedIn, loadInitialData]);

  // 인증키 인증: 회사 등록(처음) 또는 기간 연장(대표 관리자)
  const handleActivateLicense = async (payload: {
    key: string;
    company_name?: string;
    business_number?: string;
    representative_name?: string;
  }) => {
    const result = await api.activateLicense(payload);
    api.setCompany(result.company.id);
    await loadInitialData();
  };

  const handleRequestJoinCompany = async (payload: { company_code: string; reason: string }) => {
    await api.requestJoinCompany(payload);
    const meData = await api.getMe();
    setPendingRequests(meData.pending_requests);
  };

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
        const myRole = (found as any).my_role || (isSuperAdmin ? 'SUPER_ADMIN' : 'VIEWER');
        setCurrentRole(myRole);
      }

      setIsCompanySelectorOpen(false);
      // 라이선스가 유효하지 않은 회사는 안내 화면만 보여 주고 자료는 불러오지 않는다
      const mine = userCompanies.find((c) => c.id === companyId);
      if (!isSuperAdmin && mine && mine.license.state !== 'active') return;
      await loadCompanyData(companyId);
      if (currentSection === 'admin-super' && !isSuperAdmin) setCurrentSection('dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || '회사 전환에 실패했습니다.');
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
    // 새 회사로 전환한 뒤 목록을 다시 불러온다
    api.setCompany(newComp.id);
    await loadInitialData();
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
        api.clearCompany();
        setCurrentCompany(null);
        setCurrentSection('admin-super');
      }
    }
  };

  // Handler: Assign User Role
  const handleAssignRole = async (userId: string, companyId: string, role: RoleType) => {
    await api.assignUserCompanyRole(userId, companyId, role);
    const adminData = await api.getAdminUsersAndRoles();
    setAllUserRoles(adminData.roles);
    if (adminData.team_roles) setTeamRoles(adminData.team_roles);
  };

  // Handler: Update Custom Permissions for User (A가 B에게 메뉴별 허용/제한 설정)
  const handleUpdateCustomPermissions = async (
    roleRecordId: string,
    grant: PermissionCode[],
    revoke: PermissionCode[]
  ) => {
    await api.updateCustomPermissions(roleRecordId, grant, revoke);
    const adminData = await api.getAdminUsersAndRoles();
    setAllUserRoles(adminData.roles);
  };

  // Handler: Assign Team Role
  const handleAssignTeamRole = async (
    userId: string,
    teamId: string,
    companyId: string,
    role: RoleType
  ) => {
    await api.assignTeamRole(userId, teamId, companyId, role);
    const adminData = await api.getAdminUsersAndRoles();
    if (adminData.team_roles) setTeamRoles(adminData.team_roles);
  };

  // Handler: Remove Team Role
  const handleRemoveTeamRole = async (id: string) => {
    await api.removeTeamRole(id);
    const adminData = await api.getAdminUsersAndRoles();
    if (adminData.team_roles) setTeamRoles(adminData.team_roles);
  };

  // Handler: Add vendor
  const handleAddVendor = async (payload: Partial<Vendor>) => {
    const newVendor = await api.createVendor(payload);
    setVendors((prev) => [...prev, newVendor]);
  };

  // 현재 회사의 내 라이선스 상태
  const currentMyCompany = userCompanies.find((c) => c.id === currentCompany?.id);
  const needsOnboarding = !!currentUser && !isSuperAdmin && userCompanies.length === 0;
  const licenseBlocked = !isSuperAdmin && !!currentMyCompany && currentMyCompany.license.state !== 'active';

  const currentUserRoleRecord = allUserRoles.find(
    (r) => r.user_id === currentUser?.id && r.company_id === currentCompany?.id
  );

  const effectivePermissions = useMemo(() => {
    if (!currentUser) return new Set<PermissionCode>();
    if (isSuperAdmin) {
      return new Set(PERMISSION_DEFINITIONS.map((p) => p.code));
    }
    const roleKey = (currentRole || 'VIEWER') as keyof typeof ROLE_PERMISSIONS;
    const basePerms = new Set(ROLE_PERMISSIONS[roleKey] || ROLE_PERMISSIONS.VIEWER || []);
    if (currentUserRoleRecord?.custom_permissions) {
      currentUserRoleRecord.custom_permissions.grant?.forEach((p) => basePerms.add(p));
      currentUserRoleRecord.custom_permissions.revoke?.forEach((p) => basePerms.delete(p));
    }
    return basePerms;
  }, [currentUser, isSuperAdmin, currentRole, currentUserRoleRecord]);

  // Enrich companies with user count
  const enrichedCompanies = useMemo(() => {
    return allCompanies.map((c) => {
      const uCount = allUserRoles.filter((r) => r.company_id === c.id).length;
      return { ...c, user_count: Math.max(uCount, 1) };
    });
  }, [allCompanies, allUserRoles]);

  const loadingScreen = (text: string) => (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
      <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm font-bold text-slate-200">{text}</p>
    </div>
  );

  if (!sessionReady) {
    return loadingScreen('로그인 상태를 확인하는 중입니다...');
  }

  if (!isLoggedIn) {
    return (
      <LoginView
        authConfig={authConfig}
        isFirebaseConfigured={isFirebaseConfigured}
        onGoogleLogin={loginWithGoogle}
        onDevLogin={loginDev}
      />
    );
  }

  if (!currentUser) {
    // 로그인은 됐지만 서버에서 내 정보를 받지 못한 경우: 원인을 보여 주고 빠져나갈 수 있게 한다
    if (errorMessage && !isLoading) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center gap-4">
          <AlertCircle className="w-10 h-10 text-rose-400" />
          <p className="text-sm font-bold text-slate-100 max-w-md">{errorMessage}</p>
          <div className="flex gap-2">
            <button onClick={() => loadInitialData()} className="px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-bold">
              다시 시도
            </button>
            <button onClick={handleLogout} className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-bold">
              로그아웃
            </button>
          </div>
        </div>
      );
    }
    return loadingScreen('메인 화면으로 이동 중입니다...');
  }

  if (needsOnboarding) {
    return (
      <OnboardingView
        user={currentUser}
        pendingRequests={pendingRequests}
        onActivate={handleActivateLicense}
        onRequestJoin={handleRequestJoinCompany}
        onLogout={handleLogout}
      />
    );
  }

  if (licenseBlocked && currentMyCompany) {
    return (
      <LicenseBlockedView
        user={currentUser}
        company={currentMyCompany}
        otherCompanies={userCompanies.filter((c) => c.id !== currentMyCompany.id)}
        onRenew={(key) => handleActivateLicense({ key })}
        onSelectCompany={async (companyId) => {
          api.setCompany(companyId);
          await loadInitialData();
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <TopNavbar
        currentCompany={currentCompany}
        companies={userCompanies.length > 0 ? userCompanies : (enrichedCompanies as any)}
        currentUser={currentUser}
        isSuperAdmin={isSuperAdmin}
        currentRole={currentRole}
        license={currentMyCompany?.license || null}
        onOpenRenewLicense={() => setIsRenewOpen(true)}
        onSelectCompany={handleSelectCompany}
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
          permissions={effectivePermissions}
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

          {/* 슈퍼 관리자 패널: 회사 선택과 무관하게 최고관리자에게만 열린다 */}
          {currentSection === 'admin-super' && isSuperAdmin && <SuperAdminView />}

          {!currentCompany && isSuperAdmin && currentSection !== 'admin-super' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-lg mx-auto my-12 shadow-sm">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-black text-slate-900 mb-2">아직 등록된 회사가 없습니다</h2>
              <p className="text-xs text-slate-600 mb-6 leading-relaxed">
                슈퍼 관리자 패널에서 인증키를 발급해 회사 대표에게 전달하세요.<br />
                대표가 인증키로 인증하면 회사가 등록됩니다.
              </p>
              <button
                onClick={() => setCurrentSection('admin-super')}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                슈퍼 관리자 패널 열기
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
                  joinRequests={joinRequests}
                  userRole={currentRole}
                  isSuperAdmin={isSuperAdmin}
                  onNavigate={setCurrentSection}
                  onOpenAddTransaction={() => setCurrentSection('transactions')}
                  onOpenBankImport={() => setIsBankImportOpen(true)}
                  onApproveJoinRequest={handleApproveJoinRequest}
                  onRejectJoinRequest={handleRejectJoinRequest}
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
                isSuperAdmin ? (
                  <AdminCompanyView
                    companies={enrichedCompanies}
                    currentCompanyId={currentCompany.id}
                    onSelectCompany={handleSelectCompany}
                    onCreateCompany={handleCreateCompany}
                    onDeleteCompany={handleDeleteCompany}
                    isSuperAdmin={isSuperAdmin}
                  />
                ) : (
                  <div className="bg-white rounded-2xl border border-rose-200 p-8 sm:p-12 text-center max-w-lg mx-auto my-12 shadow-sm animate-in fade-in duration-200">
                    <div className="w-14 h-14 bg-rose-50 text-rose-600 border border-rose-200 rounded-2xl flex items-center justify-center mx-auto mb-4 font-bold text-xl shadow-xs">
                      <Lock className="w-7 h-7" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 mb-2">최고관리자 전용 메뉴입니다</h2>
                    <p className="text-xs text-slate-600 mb-6 leading-relaxed">
                      <strong>회사 관리 (법인)</strong> 메뉴는 시스템 최고관리자만 접근할 수 있습니다.<br />
                      회사 내 회계, 부서, 사용자 권한 관리는 사이드바의 해당 메뉴를 이용해 주세요.
                    </p>
                    <button
                      onClick={() => setCurrentSection('dashboard')}
                      className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
                    >
                      대시보드로 돌아가기
                    </button>
                  </div>
                )
              )}

              {(currentSection === 'admin-accounting-settings' ||
                currentSection === 'admin-accounts' ||
                currentSection === 'admin-accounting-accounts' ||
                currentSection === 'admin-accounting-cards' ||
                currentSection === 'admin-accounting-cash-banks' ||
                currentSection === 'admin-accounting-units' ||
                currentSection === 'admin-accounting-codes') && (
                <AdminAccountingSettingsView
                  currentCompany={currentCompany}
                  activeTab={
                    currentSection === 'admin-accounting-cards'
                      ? 'cards'
                      : currentSection === 'admin-accounting-cash-banks'
                      ? 'cash-banks'
                      : currentSection === 'admin-accounting-units'
                      ? 'units'
                      : currentSection === 'admin-accounting-codes'
                      ? 'codes'
                      : 'accounts'
                  }
                  onTabChange={(tab: AccountingSettingTab) => {
                    if (tab === 'cards') setCurrentSection('admin-accounting-cards');
                    else if (tab === 'cash-banks') setCurrentSection('admin-accounting-cash-banks');
                    else if (tab === 'units') setCurrentSection('admin-accounting-units');
                    else if (tab === 'codes') setCurrentSection('admin-accounting-codes');
                    else setCurrentSection('admin-accounting-accounts');
                  }}
                  accounts={accounts}
                  bankAccounts={bankAccounts}
                  userRole={currentRole}
                  onToggleAccount={handleToggleAccount}
                  onCreateAccount={handleCreateAccount}
                  onDeleteAccount={handleDeleteAccount}
                  onAddBankAccount={handleAddBankAccount}
                />
              )}

              {(currentSection === 'admin-user-settings' ||
                currentSection === 'admin-teams' ||
                currentSection === 'admin-users' ||
                currentSection === 'admin-permissions') && (
                <AdminUserSettingsView
                  currentCompany={currentCompany}
                  activeTab={
                    currentSection === 'admin-users'
                      ? 'users'
                      : currentSection === 'admin-permissions'
                      ? 'permissions'
                      : 'teams'
                  }
                  onTabChange={(tab: UserSettingTab) => {
                    if (tab === 'users') setCurrentSection('admin-users');
                    else if (tab === 'permissions') setCurrentSection('admin-permissions');
                    else setCurrentSection('admin-teams');
                  }}
                  teams={teams}
                  userRole={currentRole}
                  onAddTeam={handleAddTeam}
                  onDeleteTeam={handleDeleteTeam}
                  users={allUsers}
                  companies={allCompanies}
                  userRoles={allUserRoles}
                  teamRoles={teamRoles}
                  currentUserId={currentUser.id}
                  onSwitchUser={() => {}}
                  onAssignRole={handleAssignRole}
                  onUpdateUserStatus={handleUpdateUserStatus}
                  onAssignTeamRole={handleAssignTeamRole}
                  onRemoveTeamRole={handleRemoveTeamRole}
                  onUpdateCustomPermissions={handleUpdateCustomPermissions}
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

      {/* 대표 관리자: 사용 중 인증키로 기간 연장 */}
      <RenewLicenseModal
        isOpen={isRenewOpen}
        onClose={() => setIsRenewOpen(false)}
        companyName={currentCompany?.company_name || ''}
        expiresAt={currentMyCompany?.license.expires_at || null}
        onRenew={(key) => handleActivateLicense({ key })}
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
