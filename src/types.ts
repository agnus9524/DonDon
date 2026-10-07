/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Core Multi-Tenant Statuses
export type EntityStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING';

// Permission Codes
export type PermissionCode =
  | 'dashboard.view'
  | 'transaction.view'
  | 'transaction.create'
  | 'transaction.update'
  | 'transaction.confirm'
  | 'transaction.cancel'
  | 'bank_import.view'
  | 'bank_import.create'
  | 'budget.view'
  | 'budget.create'
  | 'budget.update'
  | 'report.monthly'
  | 'report.quarterly'
  | 'report.annual'
  | 'ledger.view'
  | 'cashbook.view'
  | 'user.manage'
  | 'user.view'
  | 'company.manage'
  | 'team.manage'
  | 'team.view'
  | 'account.manage'
  | 'bank_account.manage'
  | 'vendor.manage'
  | 'role.manage';

// 1. 회사 (companies) - 최상위 테넌트
export interface Company {
  id: string;
  company_code: string;
  company_name: string;
  business_number: string;
  representative_name: string;
  address: string;
  phone: string;
  email: string;
  logo_url?: string;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
  user_count?: number;
}

// 2. 사용자 (users) - Google 로그인 연결, company_id 없음 (여러 회사 소속 가능)
export interface User {
  id: string;
  auth_user_id: string;
  email: string;
  name: string;
  profile_image_url?: string;
  department?: string;
  status: EntityStatus;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
  is_system_admin?: boolean;
  is_super_admin?: boolean;
}

// 3. 역할 (roles)
export type RoleCode =
  | 'SUPER_ADMIN'
  | 'ORG_ADMIN'
  | 'HQ_ACCOUNTANT'
  | 'TEAM_MANAGER'
  | 'TEAM_ACCOUNTANT'
  | 'VIEWER'
  // Legacy aliases for backward-compatibility
  | 'ADMIN'
  | 'ACCOUNTANT';

export interface Role {
  id: string;
  role_code: RoleCode;
  role_name: string;
  description: string;
  created_at: string;
}

// 4. 권한 (permissions)
export interface Permission {
  id: string;
  permission_code: string;
  permission_name: string;
  description: string;
}

// 5. 역할-권한 (role_permissions)
export interface RolePermission {
  role_id: string;
  permission_id: string;
}

// 6. 사용자-회사-권한 (user_company_roles) - 멀티 회사 구조의 핵심
export interface UserCompanyRole {
  id: string;
  user_id: string;
  company_id: string;
  role_id: string; // FK to roles
  status: EntityStatus;
  reason?: string;
  custom_permissions?: {
    grant: PermissionCode[];
    revoke: PermissionCode[];
  };
  created_at: string;
  updated_at: string;
}

// 6-1. 신규 소속 가입 신청 (join_requests)
export interface JoinRequest {
  id: string;
  role_record_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  company_id: string;
  company_name: string;
  company_code: string;
  reason: string;
  status: EntityStatus;
  created_at: string;
  suggested_role?: RoleType;
}

// 7. 팀 (teams) - 회사에 종속
export interface Team {
  id: string;
  company_id: string;
  team_code: string;
  team_name: string;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
}

// 8. 팀 사용자 (user_team_roles) - 팀 단위 권한
export interface UserTeamRole {
  id: string;
  user_id: string;
  team_id: string;
  company_id?: string;
  role_id: string;
  created_at: string;
  updated_at: string;
}

// 9. 회계기간 (fiscal_periods) - 회계연도/월 마감 관리
export type FiscalPeriodStatus = 'OPEN' | 'CLOSED';

export interface FiscalPeriod {
  id: string;
  company_id: string;
  year: number;
  month: number;
  status: FiscalPeriodStatus;
  closed_at?: string;
  closed_by?: string;
  created_at: string;
  updated_at: string;
}

// 10. 계정과목 (accounts) - 공통 계정과목
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  parent_id?: string;
  category: string;
  is_system: boolean;
  // 회사가 직접 추가한 계정과목이면 그 회사 ID. 없으면 모든 회사가 함께 쓰는 공통 계정과목.
  company_id?: string;
  is_active?: boolean; // Convenience flag when merged with company_accounts
  description?: string;
  created_at?: string;
  updated_at?: string;
}

// 11. 회사별 계정과목 사용 여부 (company_accounts)
export interface CompanyAccount {
  id: string;
  company_id: string;
  account_id: string;
  is_active: boolean;
  created_at: string;
}

// 12. 은행계좌 (bank_accounts) - 회사별 은행계좌
export interface BankAccount {
  id: string;
  company_id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  account_type: string;
  current_balance: number;
  is_main: boolean;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// 13. 거래처 (vendors) - 회사별 거래처
export interface Vendor {
  id: string;
  company_id: string;
  vendor_code: string;
  vendor_name: string;
  business_number: string;
  representative_name: string;
  representative?: string; // alias
  phone: string;
  email: string;
  address: string;
  vendor_type: string;
  is_active: boolean;
  category?: string; // display helper
  created_at: string;
  updated_at: string;
}

// 14. 거래/전표 (transactions) - 수입/지출 통합
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type VatType = 'TAXABLE' | 'TAX_EXEMPT' | 'ZERO_TAX';
export type PaymentMethod = 'BANK_TRANSFER' | 'CREDIT_CARD' | 'CASH' | 'CORPORATE_CARD' | 'NOTE';
export type TransactionStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export interface Transaction {
  id: string;
  company_id: string; // Core Multi-Tenant Key
  team_id: string;
  accounting_unit_id?: string; // 소속 회계단위 (본점, 지점, 부설기관 등)
  fiscal_period_id?: string;
  transaction_date: string;
  transaction_type: TransactionType;
  account_id: string;
  payment_method: PaymentMethod;
  bank_account_id?: string;
  vendor_id?: string;
  vat_type: VatType;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  description: string;
  memo?: string;
  status: TransactionStatus;
  created_by: string;
  updated_by?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  created_at: string;
  updated_at: string;
  attachments?: TransactionAttachment[];
}

// 15. 증빙 (transaction_attachments)
export interface TransactionAttachment {
  id: string;
  company_id: string;
  transaction_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
}

// 16. 예산 (budgets)
export interface Budget {
  id: string;
  company_id: string;
  team_id: string;
  accounting_unit_id?: string; // 소속 회계단위
  fiscal_period_id?: string;
  fiscal_year?: number; // 편리한 연도 필터링
  account_id: string;
  budget_amount: number;
  description?: string;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  // Computed execution stats from transactions
  executed_amount?: number;
  remaining_amount?: number;
  execution_rate?: number;
}

// 17. 은행 엑셀 가져오기 세션 (bank_imports)
export type BankImportStatus = 'PENDING' | 'PROCESSED' | 'FAILED';

export interface BankImport {
  id: string;
  company_id: string;
  bank_account_id: string;
  file_name: string;
  import_date: string;
  total_rows: number;
  success_rows: number;
  duplicate_rows: number;
  error_rows: number;
  status: BankImportStatus;
  created_by: string;
  created_at: string;
}

// 18. 은행 엑셀 개별 행 (bank_import_rows)
export type BankImportRowStatus = 'PENDING' | 'CONFIRMED' | 'DUPLICATE' | 'ERROR';

export interface BankImportRow {
  id: string;
  bank_import_id: string;
  company_id: string;
  transaction_date: string;
  transaction_type: 'INCOME' | 'EXPENSE';
  amount: number;
  balance?: number;
  description: string;
  counterparty?: string;
  external_transaction_id?: string;
  row_hash: string;
  status: BankImportRowStatus;
  transaction_id?: string;
  error_message?: string;
  created_at: string;
}

// 19. 감사 로그 (audit_logs)
export interface AuditLog {
  id: string;
  company_id: string;
  user_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'CONFIRM' | 'CANCEL' | 'CLOSE_PERIOD' | 'IMPORT' | 'LOGIN' | 'APPROVE' | 'SUSPEND' | 'ACTIVATE';
  entity_type: 'TRANSACTION' | 'BUDGET' | 'FISCAL_PERIOD' | 'BANK_ACCOUNT' | 'COMPANY' | 'USER_ROLE' | 'TEAM' | 'ACCOUNT' | 'VENDOR' | 'AUTH' | 'USER_COMPANY_ROLE_REQUEST' | 'USER_STATUS' | 'USER' | 'LICENSE' | 'AUTH_KEY';
  entity_id: string;
  before_data?: any;
  after_data?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  user_name?: string;
}

// 20. 실시간 집계 보고서 (비저장 계산 모델)
export interface FinancialReportSummary {
  period_type: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  year: number;
  month?: number;
  quarter?: number;
  total_income: number;
  total_expense: number;
  net_income: number;
  taxable_amount: number;
  tax_free_amount: number;
  income_by_category: { account_id: string; account_name: string; category: string; amount: number }[];
  expense_by_category: { account_id: string; account_name: string; category: string; amount: number }[];
  team_summary: { team_id: string; team_name: string; income: number; expense: number; net: number }[];
}

export type DynamicReportSummary = FinancialReportSummary;


// Type aliases for components backward compatibility
export type RoleType = RoleCode;
export interface RoleInfo {
  role_id: RoleCode;
  name: string;
  description: string;
  color: string;
}

// 21. 신용카드 (corporate_cards) - 법인카드 및 업무용 카드
export interface CorporateCard {
  id: string;
  company_id: string;
  card_name: string;
  card_number: string; // 마스킹 (예: 1102-****-****-9831)
  card_issuer: string; // 신한카드, KB국민카드, 하나카드, 삼성카드 등
  card_type: 'CORPORATE' | 'INDIVIDUAL_CORP' | 'CHECK';
  monthly_limit: number;
  payment_day: number;
  linked_bank_account_id?: string;
  holder_name?: string;
  department_name?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// 22. 회계단위 (accounting_units) - 사업장, 본점/지점, 사업부문
export interface AccountingUnit {
  id: string;
  company_id: string;
  unit_code: string;
  unit_name: string;
  business_number?: string;
  representative_name?: string;
  address?: string;
  is_main: boolean;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// 23. 코드종합관리 (company_codes) - 회사별 맞춤 공통 코드
export interface CompanyCodeItem {
  id: string;
  company_id: string;
  group_code: string; // EXPENSE_TYPE, PAYMENT_METHOD, PROOF_TYPE, PROJECT_TAG 등
  group_name: string; // 지출유형구분, 결제수단구분, 증빙서류유형, 프로젝트구분 등
  code_value: string;
  code_name: string;
  sort_order: number;
  is_system?: boolean;
  is_active: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}


// ────────────────────────────────────────────────────────────────
// 라이선스 / 인증키 (최고관리자 발급 → 회사 대표 관리자 인증)
// ────────────────────────────────────────────────────────────────

// 라이선스 계산 상태: none(없음) / active(정상) / suspended(관리자 중지) / expired(기간 만료)
export type LicenseState = 'none' | 'active' | 'suspended' | 'expired';

// 회사 라이선스 — 인증키로 인증한 대표 관리자(user_id)와 그 회사(company_id)에 귀속
export interface License {
  id: string;
  user_id: string; // 대표 관리자 (라이선스 소유 계정)
  email: string;
  company_id: string;
  status: 'active' | 'suspended';
  expires_at: string;
  key: string; // 마지막으로 적용한 인증키
  created_at: string;
  updated_at: string;
}

// 인증키 — 최고관리자가 발급, 1회용 (한 번 쓰이면 그 계정에 귀속)
export interface AuthKey {
  id: string; // 키 문자열 XXXX-XXXX-XXXX-XXXX
  status: 'unused' | 'used';
  duration_days: number;
  memo?: string;
  created_at: string;
  created_by: string;
  used_by?: string;
  used_by_email?: string;
  used_at?: string;
  company_id?: string;
}

// 최고관리자 패널용 조회 모델
export interface LicenseRow extends License {
  state: LicenseState;
  user_name: string;
  company_name: string;
  company_code: string;
  member_count: number;
}

// 회사 목록에 붙는 내 라이선스 요약
export interface CompanyLicenseInfo {
  state: LicenseState;
  expires_at: string | null;
  is_owner: boolean;
}

export interface AuthConfig {
  firebase_configured: boolean;
  dev_login: boolean;
}

export interface PendingJoinInfo {
  id: string;
  company_name: string;
  company_code: string;
  created_at: string;
}

export interface MeResponse {
  user: User;
  is_super_admin: boolean;
  roles: UserCompanyRole[];
  companies: (Company & { my_role: string; license: CompanyLicenseInfo })[];
  pending_requests: PendingJoinInfo[];
}
