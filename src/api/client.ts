/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Company,
  Team,
  Account,
  BankAccount,
  Vendor,
  Budget,
  Transaction,
  User,
  UserCompanyRole,
  FiscalPeriod,
  TransactionAttachment,
  BankImport,
  BankImportRow,
  AuditLog,
  DynamicReportSummary,
  Role,
  Permission,
  RolePermission,
} from '../types';

class ApiClient {
  private currentCompanyId: string = 'comp_daechul';
  private currentUserId: string = 'usr_hong';

  setCompany(companyId: string) {
    this.currentCompanyId = companyId;
    localStorage.setItem('dondon_current_company_id', companyId);
  }

  getCompanyId(): string {
    const saved = localStorage.getItem('dondon_current_company_id');
    if (saved) {
      this.currentCompanyId = saved;
    }
    return this.currentCompanyId;
  }

  setUser(userId: string) {
    this.currentUserId = userId;
    localStorage.setItem('dondon_current_user_id', userId);
  }

  getUserId(): string {
    const saved = localStorage.getItem('dondon_current_user_id');
    if (saved) {
      this.currentUserId = saved;
    }
    return this.currentUserId;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-company-id': this.getCompanyId(),
      'x-user-id': this.getUserId(),
    };
  }

  async getMe(): Promise<{ user: User; roles: UserCompanyRole[]; companies: (Company & { my_role: string })[] }> {
    const res = await fetch('/api/v1/auth/me', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('사용자 정보를 가져올 수 없습니다.');
    return res.json();
  }

  async login(email: string): Promise<any> {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '로그인 실패');
    }
    const data = await res.json();
    if (data.user) {
      this.setUser(data.user.id);
      localStorage.setItem('dondon_is_logged_in', 'true');
    }
    return data;
  }

  logout() {
    localStorage.removeItem('dondon_is_logged_in');
    localStorage.removeItem('dondon_current_user_id');
    localStorage.removeItem('dondon_current_company_id');
  }

  async isLoggedIn(): Promise<boolean> {
    return localStorage.getItem('dondon_is_logged_in') === 'true';
  }

  async requestJoinCompany(companyId: string, reason: string): Promise<any> {
    const res = await fetch('/api/v1/auth/request-join', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ company_id: companyId, reason }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '가입 신청 실패');
    }
    return res.json();
  }

  async getCompanies(): Promise<Company[]> {
    const res = await fetch('/api/v1/companies', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('회사 목록 조회 실패');
    const data = await res.json();
    return data.companies;
  }

  async createCompany(payload: Partial<Company>): Promise<Company> {
    const res = await fetch('/api/v1/companies', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '회사 생성 실패');
    }
    const data = await res.json();
    return data.company;
  }

  async deleteCompany(id: string, confirmCompanyName?: string): Promise<void> {
    const res = await fetch(`/api/v1/companies/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: confirmCompanyName ? JSON.stringify({ confirm_company_name: confirmCompanyName }) : undefined,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '회사 삭제 실패');
    }
  }

  async getFiscalPeriods(): Promise<FiscalPeriod[]> {
    const res = await fetch('/api/v1/fiscal-periods', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('회계기간 목록 조회 실패');
    const data = await res.json();
    return data.fiscal_periods;
  }

  async toggleFiscalPeriod(id: string): Promise<FiscalPeriod> {
    const res = await fetch(`/api/v1/fiscal-periods/${id}/toggle-close`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '회계마감 변경 실패');
    }
    const data = await res.json();
    return data.fiscal_period;
  }

  async getTeams(): Promise<Team[]> {
    const res = await fetch('/api/v1/teams', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('팀 목록 조회 실패');
    const data = await res.json();
    return data.teams;
  }

  async createTeam(team_name: string, team_code?: string): Promise<Team> {
    const res = await fetch('/api/v1/teams', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ team_name, team_code }),
    });
    if (!res.ok) throw new Error('팀 추가 실패');
    const data = await res.json();
    return data.team;
  }

  async deleteTeam(id: string): Promise<void> {
    const res = await fetch(`/api/v1/teams/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '팀 삭제 실패');
    }
  }

  async getAccounts(): Promise<(Account & { is_active: boolean })[]> {
    const res = await fetch('/api/v1/accounts', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('계정과목 목록 조회 실패');
    const data = await res.json();
    return data.accounts;
  }

  async createAccount(payload: Partial<Account> & { is_active?: boolean }): Promise<Account & { is_active: boolean }> {
    const res = await fetch('/api/v1/accounts', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '계정과목 생성 실패');
    }
    const data = await res.json();
    return data.account;
  }

  async deleteAccount(id: string): Promise<void> {
    const res = await fetch(`/api/v1/accounts/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '계정과목 삭제 실패');
    }
  }

  async toggleCompanyAccount(accountId: string): Promise<boolean> {
    const res = await fetch(`/api/v1/company-accounts/${accountId}/toggle`, {
      method: 'PUT',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('계정과목 설정 변경 실패');
    const data = await res.json();
    return data.is_active;
  }

  async getBankAccounts(): Promise<BankAccount[]> {
    const res = await fetch('/api/v1/bank-accounts', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('은행계좌 목록 조회 실패');
    const data = await res.json();
    return data.bank_accounts;
  }

  async createBankAccount(payload: Partial<BankAccount> & { initial_balance?: number }): Promise<BankAccount> {
    const res = await fetch('/api/v1/bank-accounts', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('은행계좌 추가 실패');
    const data = await res.json();
    return data.bank_account;
  }

  async getVendors(): Promise<Vendor[]> {
    const res = await fetch('/api/v1/vendors', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('거래처 목록 조회 실패');
    const data = await res.json();
    return data.vendors;
  }

  async createVendor(payload: Partial<Vendor>): Promise<Vendor> {
    const res = await fetch('/api/v1/vendors', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('거래처 추가 실패');
    const data = await res.json();
    return data.vendor;
  }

  async getBudgets(year = 2026): Promise<any[]> {
    const res = await fetch(`/api/v1/budgets?year=${year}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('예산 목록 조회 실패');
    const data = await res.json();
    return data.budgets;
  }

  async createBudget(payload: Partial<Budget>): Promise<Budget> {
    const res = await fetch('/api/v1/budgets', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '예산 등록 실패');
    }
    const data = await res.json();
    return data.budget;
  }

  async getTransactions(params?: Record<string, string>): Promise<{
    transactions: (Transaction & { attachments?: TransactionAttachment[] })[];
    summary: { total_income: number; total_expense: number; net_balance: number };
    total_count: number;
  }> {
    const query = new URLSearchParams(params || {}).toString();
    const res = await fetch(`/api/v1/transactions?${query}`, { headers: this.getHeaders() });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '거래내역 조회 실패');
    }
    return res.json();
  }

  async createTransaction(payload: Partial<Transaction>): Promise<Transaction> {
    const res = await fetch('/api/v1/transactions', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '전표 작성 실패');
    }
    const data = await res.json();
    return data.transaction;
  }

  async deleteTransaction(id: string): Promise<void> {
    const res = await fetch(`/api/v1/transactions/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '전표 삭제 실패');
    }
  }

  async getAttachments(transactionId: string): Promise<TransactionAttachment[]> {
    const res = await fetch(`/api/v1/transactions/${transactionId}/attachments`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('증빙 목록 조회 실패');
    const data = await res.json();
    return data.attachments;
  }

  async uploadAttachment(transactionId: string, payload: Partial<TransactionAttachment>): Promise<TransactionAttachment> {
    const res = await fetch(`/api/v1/transactions/${transactionId}/attachments`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('증빙 업로드 실패');
    const data = await res.json();
    return data.attachment;
  }

  // 2단계 은행 엑셀 가져오기
  async uploadBankImport(payload: {
    bank_account_id: string;
    file_name?: string;
    rows?: any[];
  }): Promise<{ bank_import: BankImport; rows: BankImportRow[] }> {
    const res = await fetch('/api/v1/bank-imports/upload', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '은행 데이터 분석 실패');
    }
    return res.json();
  }

  async confirmBankImport(importId: string): Promise<{ success: boolean; message: string; transactions: Transaction[] }> {
    const res = await fetch(`/api/v1/bank-imports/${importId}/confirm`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '전표 일괄 확정 실패');
    }
    return res.json();
  }

  // 기존 호환용 편의 메서드
  async importBankExcel(bankAccountId: string, rows?: any[]): Promise<{ transactions: Transaction[] }> {
    const uploadRes = await this.uploadBankImport({
      bank_account_id: bankAccountId,
      file_name: '신한은행_거래내역_202609.xlsx',
      rows,
    });
    const confirmRes = await this.confirmBankImport(uploadRes.bank_import.id);
    return { transactions: confirmRes.transactions };
  }

  // 동적 보고서 API
  async getDynamicReport(params: { year: number; month?: number; quarter?: number }): Promise<DynamicReportSummary> {
    const q = new URLSearchParams({
      year: String(params.year),
      ...(params.month ? { month: String(params.month) } : {}),
      ...(params.quarter ? { quarter: String(params.quarter) } : {}),
    }).toString();

    const res = await fetch(`/api/v1/reports/summary?${q}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('보고서 생성 실패');
    return res.json();
  }

  async getGeneralLedger(params: { account_id?: string; year?: string }): Promise<{ entries: any[] }> {
    const q = new URLSearchParams(params as any).toString();
    const res = await fetch(`/api/v1/reports/ledger?${q}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('총계정원장 조회 실패');
    return res.json();
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    const res = await fetch('/api/v1/audit-logs', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('감사 로그 조회 실패');
    const data = await res.json();
    return data.audit_logs;
  }

  async getRoles(): Promise<{ roles: Role[]; permissions: Permission[]; role_permissions: RolePermission[] }> {
    const res = await fetch('/api/v1/roles', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('역할 및 권한 기준정보 조회 실패');
    return res.json();
  }

  async getAdminUsersAndRoles(): Promise<{
    users: User[];
    roles: UserCompanyRole[];
    companies: Company[];
    all_roles: Role[];
  }> {
    const res = await fetch('/api/v1/admin/users-and-roles', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('사용자 및 권한 정보 조회 실패');
    return res.json();
  }

  async assignUserCompanyRole(user_id: string, company_id: string, role_id: string): Promise<void> {
    const res = await fetch('/api/v1/admin/user-company-roles', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ user_id, company_id, role_id }),
    });
    if (!res.ok) throw new Error('권한 설정 실패');
  }
}

export const api = new ApiClient();

// Helper formatting utilities
export const formatKRW = (amount: number): string => {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
};

export const formatNumber = (amount: number): string => {
  return new Intl.NumberFormat('ko-KR').format(amount);
};
