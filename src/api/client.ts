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
  JoinRequest,
  PermissionCode,
  UserTeamRole,
  License,
  AuthKey,
  LicenseRow,
  AuthConfig,
  MeResponse,
} from '../types';
import { getAuthorizationHeader } from '../services/authSession';

// 서버가 내려준 오류 코드(LICENSE_EXPIRED 등)를 함께 담는 오류
export class ApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  return new ApiError(body.error || fallback, res.status, body.code);
}

// 로그인이 풀렸을 때(401) 앱에 알리기 위한 콜백
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// 모든 API 요청에 로그인 토큰을 붙인다
async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const authorization = await getAuthorizationHeader();
  if (authorization) headers.set('Authorization', authorization);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && onUnauthorized) onUnauthorized();
  return res;
}

class ApiClient {
  private currentCompanyId: string = '';

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

  clearCompany() {
    this.currentCompanyId = '';
    localStorage.removeItem('dondon_current_company_id');
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const companyId = this.getCompanyId();
    if (companyId) headers['x-company-id'] = companyId;
    return headers;
  }

  // 로그인 화면용 공개 정보 (Firebase 설정 여부, 개발용 로그인 허용 여부)
  async getAuthConfig(): Promise<AuthConfig> {
    const res = await fetch('/api/v1/auth/config');
    if (!res.ok) throw new Error('서버에 연결할 수 없습니다.');
    return res.json();
  }

  async getMe(): Promise<MeResponse> {
    const res = await authFetch('/api/v1/auth/me', { headers: this.getHeaders() });
    if (!res.ok) throw await toApiError(res, '사용자 정보를 가져올 수 없습니다.');
    return res.json();
  }

  // 인증키로 라이선스 인증 (처음이면 회사 생성 + 대표 관리자 지정, 이미 대표면 기간 연장)
  async activateLicense(payload: {
    key: string;
    company_name?: string;
    business_number?: string;
    representative_name?: string;
  }): Promise<{ success: boolean; renewed?: boolean; already_used?: boolean; license: License; company: Company }> {
    const res = await authFetch('/api/v1/license/activate', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await toApiError(res, '인증키 인증에 실패했습니다.');
    return res.json();
  }

  // 회사 코드로 소속 가입 신청
  async requestJoinCompany(payload: { company_code: string; reason?: string }): Promise<{ company_name: string; message: string }> {
    const res = await authFetch('/api/v1/auth/request-join', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await toApiError(res, '가입 신청 실패');
    return res.json();
  }

  // ── 슈퍼 관리자 패널 (최고관리자 전용) ──
  async getLicenses(): Promise<LicenseRow[]> {
    const res = await authFetch('/api/v1/super/licenses', { headers: this.getHeaders() });
    if (!res.ok) throw await toApiError(res, '라이선스 목록 조회 실패');
    return (await res.json()).licenses;
  }

  async updateLicense(id: string, payload: { status?: 'active' | 'suspended'; extend_days?: number }): Promise<LicenseRow> {
    const res = await authFetch(`/api/v1/super/licenses/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await toApiError(res, '라이선스 변경 실패');
    return (await res.json()).license;
  }

  async deleteLicense(id: string): Promise<void> {
    const res = await authFetch(`/api/v1/super/licenses/${id}`, { method: 'DELETE', headers: this.getHeaders() });
    if (!res.ok) throw await toApiError(res, '라이선스 삭제 실패');
  }

  async getAuthKeys(): Promise<(AuthKey & { company_name?: string })[]> {
    const res = await authFetch('/api/v1/super/auth-keys', { headers: this.getHeaders() });
    if (!res.ok) throw await toApiError(res, '인증키 목록 조회 실패');
    return (await res.json()).auth_keys;
  }

  async createAuthKey(payload: { duration_days: number; memo?: string }): Promise<AuthKey> {
    const res = await authFetch('/api/v1/super/auth-keys', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await toApiError(res, '인증키 발급 실패');
    return (await res.json()).auth_key;
  }

  async deleteAuthKey(id: string): Promise<void> {
    const res = await authFetch(`/api/v1/super/auth-keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw await toApiError(res, '인증키 폐기 실패');
  }

  async getCompanies(): Promise<Company[]> {
    const res = await authFetch('/api/v1/companies', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('회사 목록 조회 실패');
    const data = await res.json();
    return data.companies;
  }

  async createCompany(payload: Partial<Company>): Promise<Company> {
    const res = await authFetch('/api/v1/companies', {
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
    const res = await authFetch(`/api/v1/companies/${id}`, {
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
    const res = await authFetch('/api/v1/fiscal-periods', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('회계기간 목록 조회 실패');
    const data = await res.json();
    return data.fiscal_periods;
  }

  async toggleFiscalPeriod(id: string): Promise<FiscalPeriod> {
    const res = await authFetch(`/api/v1/fiscal-periods/${id}/toggle-close`, {
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
    const res = await authFetch('/api/v1/teams', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('팀 목록 조회 실패');
    const data = await res.json();
    return data.teams;
  }

  async createTeam(team_name: string, team_code?: string): Promise<Team> {
    const res = await authFetch('/api/v1/teams', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ team_name, team_code }),
    });
    if (!res.ok) throw new Error('팀 추가 실패');
    const data = await res.json();
    return data.team;
  }

  async deleteTeam(id: string): Promise<void> {
    const res = await authFetch(`/api/v1/teams/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '팀 삭제 실패');
    }
  }

  async getAccounts(): Promise<(Account & { is_active: boolean })[]> {
    const res = await authFetch('/api/v1/accounts', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('계정과목 목록 조회 실패');
    const data = await res.json();
    return data.accounts;
  }

  async createAccount(payload: Partial<Account> & { is_active?: boolean }): Promise<Account & { is_active: boolean }> {
    const res = await authFetch('/api/v1/accounts', {
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

  async batchCreateAccounts(
    accounts: Array<{
      account_code: string;
      account_name: string;
      account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
      category?: string;
      description?: string;
      is_active?: boolean;
    }>
  ): Promise<{ success: boolean; created_count: number; skipped_count: number; accounts: (Account & { is_active: boolean })[] }> {
    const res = await authFetch('/api/v1/accounts/batch', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ accounts }),
    });
    if (!res.ok) throw await toApiError(res, '계정과목 일괄 등록에 실패했습니다.');
    return res.json();
  }

  async deleteAccount(id: string): Promise<void> {
    const res = await authFetch(`/api/v1/accounts/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '계정과목 삭제 실패');
    }
  }

  async toggleCompanyAccount(accountId: string): Promise<boolean> {
    const res = await authFetch(`/api/v1/company-accounts/${accountId}/toggle`, {
      method: 'PUT',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('계정과목 설정 변경 실패');
    const data = await res.json();
    return data.is_active;
  }

  async getBankAccounts(): Promise<BankAccount[]> {
    const res = await authFetch('/api/v1/bank-accounts', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('은행계좌 목록 조회 실패');
    const data = await res.json();
    return data.bank_accounts;
  }

  async createBankAccount(payload: Partial<BankAccount> & { initial_balance?: number }): Promise<BankAccount> {
    const res = await authFetch('/api/v1/bank-accounts', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('은행계좌 추가 실패');
    const data = await res.json();
    return data.bank_account;
  }

  async getVendors(): Promise<Vendor[]> {
    const res = await authFetch('/api/v1/vendors', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('거래처 목록 조회 실패');
    const data = await res.json();
    return data.vendors;
  }

  async createVendor(payload: Partial<Vendor>): Promise<Vendor> {
    const res = await authFetch('/api/v1/vendors', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('거래처 추가 실패');
    const data = await res.json();
    return data.vendor;
  }

  async getBudgets(year = 2026): Promise<any[]> {
    const res = await authFetch(`/api/v1/budgets?year=${year}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('예산 목록 조회 실패');
    const data = await res.json();
    return data.budgets;
  }

  async createBudget(payload: Partial<Budget>): Promise<Budget> {
    const res = await authFetch('/api/v1/budgets', {
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
    const res = await authFetch(`/api/v1/transactions?${query}`, { headers: this.getHeaders() });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '거래내역 조회 실패');
    }
    return res.json();
  }

  async createTransaction(payload: Partial<Transaction>): Promise<Transaction> {
    const res = await authFetch('/api/v1/transactions', {
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
    const res = await authFetch(`/api/v1/transactions/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '전표 삭제 실패');
    }
  }

  async getAttachments(transactionId: string): Promise<TransactionAttachment[]> {
    const res = await authFetch(`/api/v1/transactions/${transactionId}/attachments`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('증빙 목록 조회 실패');
    const data = await res.json();
    return data.attachments;
  }

  async uploadAttachment(transactionId: string, payload: Partial<TransactionAttachment>): Promise<TransactionAttachment> {
    const res = await authFetch(`/api/v1/transactions/${transactionId}/attachments`, {
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
    const res = await authFetch('/api/v1/bank-imports/upload', {
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
    const res = await authFetch(`/api/v1/bank-imports/${importId}/confirm`, {
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

    const res = await authFetch(`/api/v1/reports/summary?${q}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('보고서 생성 실패');
    return res.json();
  }

  async getGeneralLedger(params: { account_id?: string; year?: string }): Promise<{ entries: any[] }> {
    const q = new URLSearchParams(params as any).toString();
    const res = await authFetch(`/api/v1/reports/ledger?${q}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('총계정원장 조회 실패');
    return res.json();
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    const res = await authFetch('/api/v1/audit-logs', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('감사 로그 조회 실패');
    const data = await res.json();
    return data.audit_logs;
  }

  async getRoles(): Promise<{ roles: Role[]; permissions: Permission[]; role_permissions: RolePermission[] }> {
    const res = await authFetch('/api/v1/roles', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('역할 및 권한 기준정보 조회 실패');
    return res.json();
  }

  async getAdminUsersAndRoles(): Promise<{
    users: User[];
    roles: UserCompanyRole[];
    companies: Company[];
    all_roles: Role[];
    team_roles?: UserTeamRole[];
  }> {
    const res = await authFetch('/api/v1/admin/users-and-roles', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('사용자 및 권한 정보 조회 실패');
    return res.json();
  }

  async assignUserCompanyRole(user_id: string, company_id: string, role_id: string): Promise<void> {
    const res = await authFetch('/api/v1/admin/user-company-roles', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ user_id, company_id, role_id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '권한 설정 실패');
    }
  }

  async updateCustomPermissions(
    roleRecordId: string,
    grant: PermissionCode[],
    revoke: PermissionCode[]
  ): Promise<void> {
    const res = await authFetch(`/api/v1/admin/user-company-roles/${roleRecordId}/permissions`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ grant, revoke }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '개별 메뉴 권한 저장 실패');
    }
  }

  async assignTeamRole(user_id: string, team_id: string, company_id: string, role_id: string): Promise<void> {
    const res = await authFetch('/api/v1/admin/user-team-roles', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ user_id, team_id, company_id, role_id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '팀 권한 배정 실패');
    }
  }

  async removeTeamRole(id: string): Promise<void> {
    const res = await authFetch(`/api/v1/admin/user-team-roles/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('팀 권한 제거 실패');
  }

  async getJoinRequests(): Promise<JoinRequest[]> {
    const res = await authFetch('/api/v1/admin/join-requests', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('가입 신청 목록 조회 실패');
    const data = await res.json();
    return data.requests || [];
  }

  async approveJoinRequest(id: string, role_id: string): Promise<any> {
    const res = await authFetch(`/api/v1/admin/join-requests/${id}/approve`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ role_id }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '가입 승인 실패');
    }
    return res.json();
  }

  async rejectJoinRequest(id: string): Promise<any> {
    const res = await authFetch(`/api/v1/admin/join-requests/${id}/reject`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '가입 반려 실패');
    }
    return res.json();
  }

  async updateUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'): Promise<any> {
    const res = await authFetch(`/api/v1/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '사용자 상태 변경 실패');
    }
    return res.json();
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
