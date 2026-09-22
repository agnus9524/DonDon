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
  UserTeamRole,
  PermissionCode,
  RoleType,
  MonthlyReportSummary,
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

  async getMe(): Promise<{
    user: User;
    roles: UserCompanyRole[];
    team_roles: UserTeamRole[];
    companies: (Company & { my_role: string })[];
  }> {
    const res = await fetch('/api/v1/auth/me', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('사용자 정보를 가져올 수 없습니다.');
    return res.json();
  }

  async getPermissions(): Promise<{
    company_id: string;
    permissions: PermissionCode[];
    team_scope: 'ALL' | string[];
    team_roles: UserTeamRole[];
  }> {
    const res = await fetch('/api/v1/auth/permissions', { headers: this.getHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '권한 정보를 가져올 수 없습니다.');
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

  async getAccounts(): Promise<(Account & { is_active: boolean })[]> {
    const res = await fetch('/api/v1/accounts', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('계정과목 목록 조회 실패');
    const data = await res.json();
    return data.accounts;
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

  async getTransactions(params?: Record<string, string>): Promise<{
    transactions: Transaction[];
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
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '전표 삭제 실패');
    }
  }

  async getMonthlyReport(year = 2026, month = 9): Promise<MonthlyReportSummary> {
    const res = await fetch(`/api/v1/reports/monthly?year=${year}&month=${month}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('월간 보고서 조회 실패');
    return res.json();
  }

  async importBankExcel(bank_account_id: string, rows?: any[]): Promise<{ count: number; transactions: Transaction[] }> {
    const res = await fetch('/api/v1/bank-import', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ bank_account_id, rows }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '은행 거래내역 가져오기 실패');
    }
    return res.json();
  }

  async getAdminUsersAndRoles(): Promise<{
    users: User[];
    roles: UserCompanyRole[];
    team_roles: UserTeamRole[];
    companies: Company[];
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '권한 설정 실패');
    }
  }

  async assignUserTeamRole(user_id: string, team_id: string, company_id: string, role_id: RoleType): Promise<UserTeamRole> {
    const res = await fetch('/api/v1/admin/user-team-roles', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ user_id, team_id, company_id, role_id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '팀 권한 배정 실패');
    }
    const data = await res.json();
    return data.team_role;
  }

  async removeUserTeamRole(id: string): Promise<void> {
    const res = await fetch(`/api/v1/admin/user-team-roles/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '팀 권한 삭제 실패');
    }
  }

  async updateUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'): Promise<User> {
    const res = await fetch(`/api/v1/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '사용자 상태 변경 실패');
    }
    const data = await res.json();
    return data.user;
  }

  async updateCustomPermissions(
    userCompanyRoleId: string,
    grant: PermissionCode[],
    revoke: PermissionCode[]
  ): Promise<void> {
    const res = await fetch(`/api/v1/admin/user-company-roles/${userCompanyRoleId}/custom-permissions`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ grant, revoke }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '개별 권한 저장 실패');
    }
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
