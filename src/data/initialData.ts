/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Company,
  User,
  Role,
  Permission,
  RolePermission,
  UserCompanyRole,
  Team,
  UserTeamRole,
  FiscalPeriod,
  Account,
  CompanyAccount,
  BankAccount,
  Vendor,
  Transaction,
  TransactionAttachment,
  Budget,
  BankImport,
  BankImportRow,
  AuditLog,
} from '../types';

// 1. 회사 companies
export const INITIAL_COMPANIES: Company[] = [
  {
    id: 'comp_daechul',
    company_code: 'COMPANY001',
    company_name: '대철청소년회',
    business_number: '128-82-49120',
    representative_name: '김대철',
    address: '서울특별시 종로구 대학로 102 대철빌딩 3층',
    phone: '02-765-4321',
    email: 'contact@daechul-youth.org',
    status: 'ACTIVE',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    user_count: 12,
  },
  {
    id: 'comp_abc',
    company_code: 'COMPANY002',
    company_name: 'ABC 주식회사',
    business_number: '220-81-74891',
    representative_name: '이진우',
    address: '서울특별시 강남구 테헤란로 152 강남타워 8층',
    phone: '02-555-8900',
    email: 'finance@abc-corp.kr',
    status: 'ACTIVE',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2026-09-05T14:30:00Z',
    user_count: 8,
  },
  {
    id: 'comp_xyz',
    company_code: 'COMPANY003',
    company_name: 'XYZ 법인',
    business_number: '314-86-09231',
    representative_name: '박명선',
    address: '인천광역시 연수구 송도과학로 32 송도테크노빌 5층',
    phone: '032-831-2244',
    email: 'admin@xyz-corp.co.kr',
    status: 'ACTIVE',
    created_at: '2025-05-20T09:00:00Z',
    updated_at: '2026-08-20T11:00:00Z',
    user_count: 5,
  },
];

// 2. 사용자 users (Google 로그인 연동, company_id 없음)
export const CURRENT_USER: User = {
  id: 'usr_hong',
  auth_user_id: 'google-oauth2|10928374619283',
  email: 'agnus9524@gmail.com',
  name: '홍길동',
  department: '재무총괄',
  status: 'ACTIVE',
  last_login_at: '2026-09-22T08:30:00Z',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2026-09-22T08:30:00Z',
  is_system_admin: true,
  is_super_admin: true,
};

export const INITIAL_ALL_USERS: User[] = [
  CURRENT_USER,
  {
    id: 'usr_kim',
    auth_user_id: 'google-oauth2|20918237461029',
    email: 'director@daechul-youth.org',
    name: '김대철',
    department: '대표이사',
    status: 'ACTIVE',
    last_login_at: '2026-09-21T18:00:00Z',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2026-09-21T18:00:00Z',
    is_system_admin: false,
  },
  {
    id: 'usr_park',
    auth_user_id: 'google-oauth2|30918237461033',
    email: 'park@daechul-youth.org',
    name: '박청소년',
    department: '청소년국',
    status: 'ACTIVE',
    last_login_at: '2026-09-22T02:00:00Z',
    created_at: '2025-01-15T09:00:00Z',
    updated_at: '2026-09-22T02:00:00Z',
    is_system_admin: false,
  },
  {
    id: 'usr_lee',
    auth_user_id: 'google-oauth2|40918237461044',
    email: 'ceo@abc-corp.kr',
    name: '이진우',
    department: '대표이사',
    status: 'ACTIVE',
    last_login_at: '2026-09-20T11:00:00Z',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2026-09-20T11:00:00Z',
    is_system_admin: false,
  },
  {
    id: 'usr_jung',
    auth_user_id: 'google-oauth2|50918237461055',
    email: 'jung@abc-corp.kr',
    name: '정영업',
    department: '영업팀',
    status: 'ACTIVE',
    last_login_at: '2026-09-19T14:20:00Z',
    created_at: '2025-03-01T09:00:00Z',
    updated_at: '2026-09-19T14:20:00Z',
    is_system_admin: false,
  },
  {
    id: 'usr_choi',
    auth_user_id: 'google-oauth2|60918237461066',
    email: 'choi@abc-corp.kr',
    name: '최개발',
    department: '개발팀',
    status: 'ACTIVE',
    last_login_at: '2026-09-22T01:10:00Z',
    created_at: '2025-03-10T09:00:00Z',
    updated_at: '2026-09-22T01:10:00Z',
    is_system_admin: false,
  },
];

// 3. 역할 roles
export const INITIAL_ROLES: Role[] = [
  {
    id: 'role_super_admin',
    role_code: 'SUPER_ADMIN',
    role_name: '시스템 최고관리자',
    description: '전체 테넌트(회사) 관리, 전사 감사로그 및 시스템 설정',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'role_org_admin',
    role_code: 'ORG_ADMIN',
    role_name: '회사 대표관리자',
    description: '해당 회사 내 모든 권한, 조직/계정 관리, 마감 권한',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'role_hq_accountant',
    role_code: 'HQ_ACCOUNTANT',
    role_name: '본부 총괄회계',
    description: '해당 회사의 전표 작성, 승인, 마감, 은행가져오기, 결산보고서 생성',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'role_team_manager',
    role_code: 'TEAM_MANAGER',
    role_name: '팀 관리자',
    description: '소속 팀의 예산 수립, 전표 결재 승인 및 집행 현황 확인',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'role_team_accountant',
    role_code: 'TEAM_ACCOUNTANT',
    role_name: '팀 회계담당자',
    description: '소속 팀의 전표 작성, 증빙 첨부 및 은행 Excel 가져오기',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'role_viewer',
    role_code: 'VIEWER',
    role_name: '일반 열람자',
    description: '승인된 장부 및 결산보고서 조회 전용',
    created_at: '2025-01-01T00:00:00Z',
  },
];

// 4. 권한 permissions
export const INITIAL_PERMISSIONS: Permission[] = [
  { id: 'p_dash_view', permission_code: 'dashboard.view', permission_name: '대시보드 조회', description: '회사 대시보드 지표 조회' },
  { id: 'p_tx_view', permission_code: 'transaction.view', permission_name: '전표 조회', description: '전표 목록 및 상세 조회' },
  { id: 'p_tx_create', permission_code: 'transaction.create', permission_name: '전표 작성', description: '신규 전표 등록' },
  { id: 'p_tx_update', permission_code: 'transaction.update', permission_name: '전표 수정', description: '작성 중 전표 수정' },
  { id: 'p_tx_confirm', permission_code: 'transaction.confirm', permission_name: '전표 승인', description: '전표 회계 승인' },
  { id: 'p_tx_cancel', permission_code: 'transaction.cancel', permission_name: '전표 취소', description: '전표 취소 처리' },
  { id: 'p_bank_view', permission_code: 'bank_import.view', permission_name: '은행가져오기 조회', description: '가져온 은행내역 조회' },
  { id: 'p_bank_create', permission_code: 'bank_import.create', permission_name: '은행 Excel 가져오기', description: '엑셀 업로드 및 전표변환' },
  { id: 'p_budget_view', permission_code: 'budget.view', permission_name: '예산 조회', description: '팀/계정별 예산 조회' },
  { id: 'p_budget_create', permission_code: 'budget.create', permission_name: '예산 편성', description: '신규 예산 배정' },
  { id: 'p_budget_update', permission_code: 'budget.update', permission_name: '예산 변경', description: '예산 금액 변경' },
  { id: 'p_rep_month', permission_code: 'report.monthly', permission_name: '월간보고서', description: '월간 수지보고서 조회' },
  { id: 'p_rep_quarter', permission_code: 'report.quarterly', permission_name: '분기보고서', description: '분기 결산보고서 조회' },
  { id: 'p_rep_annual', permission_code: 'report.annual', permission_name: '연간결산보고서', description: '연간 결산보고서 조회' },
  { id: 'p_ledger_view', permission_code: 'ledger.view', permission_name: '총계정원장 조회', description: '계정과목별 원장 조회' },
  { id: 'p_cash_view', permission_code: 'cashbook.view', permission_name: '현금출납장 조회', description: '현금/예금 출납장 조회' },
  { id: 'p_user_manage', permission_code: 'user.manage', permission_name: '사용자 관리', description: '회사 내 사용자 권한 설정' },
  { id: 'p_comp_manage', permission_code: 'company.manage', permission_name: '회사 정보 관리', description: '회사 기본정보 수정' },
  { id: 'p_team_manage', permission_code: 'team.manage', permission_name: '팀 관리', description: '팀 추가 및 관리' },
  { id: 'p_acc_manage', permission_code: 'account.manage', permission_name: '계정과목 관리', description: '회사 계정과목 활성화 설정' },
  { id: 'p_bank_manage', permission_code: 'bank_account.manage', permission_name: '은행계좌 관리', description: '회사 은행계좌 등록/관리' },
  { id: 'p_ven_manage', permission_code: 'vendor.manage', permission_name: '거래처 관리', description: '거래처 등록/관리' },
];

// 5. 역할-권한 role_permissions
export const INITIAL_ROLE_PERMISSIONS: RolePermission[] = [
  // SUPER_ADMIN & ORG_ADMIN: all permissions
  ...INITIAL_PERMISSIONS.map((p) => ({ role_id: 'role_super_admin', permission_id: p.id })),
  ...INITIAL_PERMISSIONS.map((p) => ({ role_id: 'role_org_admin', permission_id: p.id })),

  // HQ_ACCOUNTANT: 회계 전반 + 은행 + 보고서 + 기준정보
  { role_id: 'role_hq_accountant', permission_id: 'p_dash_view' },
  { role_id: 'role_hq_accountant', permission_id: 'p_tx_view' },
  { role_id: 'role_hq_accountant', permission_id: 'p_tx_create' },
  { role_id: 'role_hq_accountant', permission_id: 'p_tx_update' },
  { role_id: 'role_hq_accountant', permission_id: 'p_tx_confirm' },
  { role_id: 'role_hq_accountant', permission_id: 'p_tx_cancel' },
  { role_id: 'role_hq_accountant', permission_id: 'p_bank_view' },
  { role_id: 'role_hq_accountant', permission_id: 'p_bank_create' },
  { role_id: 'role_hq_accountant', permission_id: 'p_budget_view' },
  { role_id: 'role_hq_accountant', permission_id: 'p_rep_month' },
  { role_id: 'role_hq_accountant', permission_id: 'p_rep_quarter' },
  { role_id: 'role_hq_accountant', permission_id: 'p_rep_annual' },
  { role_id: 'role_hq_accountant', permission_id: 'p_ledger_view' },
  { role_id: 'role_hq_accountant', permission_id: 'p_cash_view' },
  { role_id: 'role_hq_accountant', permission_id: 'p_acc_manage' },
  { role_id: 'role_hq_accountant', permission_id: 'p_bank_manage' },
  { role_id: 'role_hq_accountant', permission_id: 'p_ven_manage' },

  // TEAM_ACCOUNTANT
  { role_id: 'role_team_accountant', permission_id: 'p_dash_view' },
  { role_id: 'role_team_accountant', permission_id: 'p_tx_view' },
  { role_id: 'role_team_accountant', permission_id: 'p_tx_create' },
  { role_id: 'role_team_accountant', permission_id: 'p_tx_update' },
  { role_id: 'role_team_accountant', permission_id: 'p_bank_create' },
  { role_id: 'role_team_accountant', permission_id: 'p_budget_view' },
  { role_id: 'role_team_accountant', permission_id: 'p_rep_month' },

  // VIEWER
  { role_id: 'role_viewer', permission_id: 'p_dash_view' },
  { role_id: 'role_viewer', permission_id: 'p_tx_view' },
  { role_id: 'role_viewer', permission_id: 'p_budget_view' },
  { role_id: 'role_viewer', permission_id: 'p_rep_month' },
];

// 6. 사용자-회사-권한 user_company_roles (멀티 회사 구조 핵심)
export const INITIAL_USER_COMPANY_ROLES: UserCompanyRole[] = [
  // 홍길동:
  // 대철청소년회 -> HQ_ACCOUNTANT
  // ABC 주식회사 -> TEAM_ACCOUNTANT
  // XYZ 법인     -> VIEWER
  {
    id: 'ucr_hong_daechul',
    user_id: 'usr_hong',
    company_id: 'comp_daechul',
    role_id: 'HQ_ACCOUNTANT',
    status: 'ACTIVE',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'ucr_hong_abc',
    user_id: 'usr_hong',
    company_id: 'comp_abc',
    role_id: 'TEAM_ACCOUNTANT',
    status: 'ACTIVE',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'ucr_hong_xyz',
    user_id: 'usr_hong',
    company_id: 'comp_xyz',
    role_id: 'VIEWER',
    status: 'ACTIVE',
    created_at: '2025-05-20T09:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },

  // 다른 유저들
  {
    id: 'ucr_kim_daechul',
    user_id: 'usr_kim',
    company_id: 'comp_daechul',
    role_id: 'ORG_ADMIN',
    status: 'ACTIVE',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'ucr_park_daechul',
    user_id: 'usr_park',
    company_id: 'comp_daechul',
    role_id: 'TEAM_ACCOUNTANT',
    status: 'ACTIVE',
    created_at: '2025-01-15T09:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'ucr_lee_abc',
    user_id: 'usr_lee',
    company_id: 'comp_abc',
    role_id: 'ORG_ADMIN',
    status: 'ACTIVE',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'ucr_jung_abc',
    user_id: 'usr_jung',
    company_id: 'comp_abc',
    role_id: 'TEAM_ACCOUNTANT',
    status: 'ACTIVE',
    created_at: '2025-03-01T09:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
];

// 7. 팀 teams
export const INITIAL_TEAMS: Team[] = [
  // 대철청소년회
  { id: 'team_a_youth', company_id: 'comp_daechul', team_code: 'DEPT_YOUTH', team_name: '청소년국', status: 'ACTIVE', created_at: '2025-01-10T09:00:00Z', updated_at: '2025-01-10T09:00:00Z' },
  { id: 'team_a_edu', company_id: 'comp_daechul', team_code: 'DEPT_EDU', team_name: '교육국', status: 'ACTIVE', created_at: '2025-01-10T09:00:00Z', updated_at: '2025-01-10T09:00:00Z' },
  { id: 'team_a_admin', company_id: 'comp_daechul', team_code: 'DEPT_ADMIN', team_name: '사무국', status: 'ACTIVE', created_at: '2025-01-10T09:00:00Z', updated_at: '2025-01-10T09:00:00Z' },
  { id: 'team_a_pr', company_id: 'comp_daechul', team_code: 'DEPT_PR', team_name: '홍보팀', status: 'ACTIVE', created_at: '2025-01-10T09:00:00Z', updated_at: '2025-01-10T09:00:00Z' },

  // ABC 주식회사
  { id: 'team_b_ga', company_id: 'comp_abc', team_code: 'TEAM_GA', team_name: '총무팀', status: 'ACTIVE', created_at: '2025-02-15T09:00:00Z', updated_at: '2025-02-15T09:00:00Z' },
  { id: 'team_b_sales', company_id: 'comp_abc', team_code: 'TEAM_SALES', team_name: '영업팀', status: 'ACTIVE', created_at: '2025-02-15T09:00:00Z', updated_at: '2025-02-15T09:00:00Z' },
  { id: 'team_b_dev', company_id: 'comp_abc', team_code: 'TEAM_DEV', team_name: '개발팀', status: 'ACTIVE', created_at: '2025-02-15T09:00:00Z', updated_at: '2025-02-15T09:00:00Z' },

  // XYZ 법인
  { id: 'team_c_plan', company_id: 'comp_xyz', team_code: 'TEAM_PLAN', team_name: '경영기획팀', status: 'ACTIVE', created_at: '2025-05-20T09:00:00Z', updated_at: '2025-05-20T09:00:00Z' },
  { id: 'team_c_logis', company_id: 'comp_xyz', team_code: 'TEAM_LOGIS', team_name: '유통물류팀', status: 'ACTIVE', created_at: '2025-05-20T09:00:00Z', updated_at: '2025-05-20T09:00:00Z' },
];

// 8. 팀 사용자 user_team_roles
export const INITIAL_USER_TEAM_ROLES: UserTeamRole[] = [
  { id: 'utr_1', user_id: 'usr_park', team_id: 'team_a_youth', role_id: 'TEAM_ACCOUNTANT', created_at: '2025-01-15T09:00:00Z', updated_at: '2025-01-15T09:00:00Z' },
  { id: 'utr_2', user_id: 'usr_jung', team_id: 'team_b_sales', role_id: 'TEAM_ACCOUNTANT', created_at: '2025-03-01T09:00:00Z', updated_at: '2025-03-01T09:00:00Z' },
  { id: 'utr_3', user_id: 'usr_choi', team_id: 'team_b_dev', role_id: 'TEAM_MANAGER', created_at: '2025-03-10T09:00:00Z', updated_at: '2025-03-10T09:00:00Z' },
];

// 9. 회계기간 fiscal_periods (마감 관리)
export const INITIAL_FISCAL_PERIODS: FiscalPeriod[] = [
  // 대철청소년회: 2026년 1~8월 CLOSED, 9월 OPEN
  { id: 'fp_a_2026_01', company_id: 'comp_daechul', year: 2026, month: 1, status: 'CLOSED', closed_at: '2026-02-05T10:00:00Z', closed_by: 'usr_kim', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-05T10:00:00Z' },
  { id: 'fp_a_2026_02', company_id: 'comp_daechul', year: 2026, month: 2, status: 'CLOSED', closed_at: '2026-03-05T10:00:00Z', closed_by: 'usr_kim', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-03-05T10:00:00Z' },
  { id: 'fp_a_2026_03', company_id: 'comp_daechul', year: 2026, month: 3, status: 'CLOSED', closed_at: '2026-04-05T10:00:00Z', closed_by: 'usr_kim', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-04-05T10:00:00Z' },
  { id: 'fp_a_2026_04', company_id: 'comp_daechul', year: 2026, month: 4, status: 'CLOSED', closed_at: '2026-05-05T10:00:00Z', closed_by: 'usr_kim', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-05-05T10:00:00Z' },
  { id: 'fp_a_2026_05', company_id: 'comp_daechul', year: 2026, month: 5, status: 'CLOSED', closed_at: '2026-06-05T10:00:00Z', closed_by: 'usr_kim', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-06-05T10:00:00Z' },
  { id: 'fp_a_2026_06', company_id: 'comp_daechul', year: 2026, month: 6, status: 'CLOSED', closed_at: '2026-07-05T10:00:00Z', closed_by: 'usr_kim', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-07-05T10:00:00Z' },
  { id: 'fp_a_2026_07', company_id: 'comp_daechul', year: 2026, month: 7, status: 'CLOSED', closed_at: '2026-08-05T10:00:00Z', closed_by: 'usr_kim', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-08-05T10:00:00Z' },
  { id: 'fp_a_2026_08', company_id: 'comp_daechul', year: 2026, month: 8, status: 'CLOSED', closed_at: '2026-09-05T10:00:00Z', closed_by: 'usr_kim', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-09-05T10:00:00Z' },
  { id: 'fp_a_2026_09', company_id: 'comp_daechul', year: 2026, month: 9, status: 'OPEN', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'fp_a_2026_10', company_id: 'comp_daechul', year: 2026, month: 10, status: 'OPEN', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },

  // ABC 주식회사
  { id: 'fp_b_2026_08', company_id: 'comp_abc', year: 2026, month: 8, status: 'CLOSED', closed_at: '2026-09-05T10:00:00Z', closed_by: 'usr_lee', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-09-05T10:00:00Z' },
  { id: 'fp_b_2026_09', company_id: 'comp_abc', year: 2026, month: 9, status: 'OPEN', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },

  // XYZ 법인
  { id: 'fp_c_2026_09', company_id: 'comp_xyz', year: 2026, month: 9, status: 'OPEN', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
];

// 10. 계정과목 accounts (공통 계정과목)
export const INITIAL_ACCOUNTS: Account[] = [
  // 1000 자산
  { id: 'acc_101', account_code: '101', account_name: '현금', account_type: 'ASSET', category: '유동자산', is_system: true },
  { id: 'acc_103', account_code: '103', account_name: '보통예금', account_type: 'ASSET', category: '유동자산', is_system: true },
  { id: 'acc_108', account_code: '108', account_name: '외상매출금', account_type: 'ASSET', category: '매출채권', is_system: true },
  { id: 'acc_120', account_code: '120', account_name: '미수금', account_type: 'ASSET', category: '기타채권', is_system: true },
  { id: 'acc_212', account_code: '212', account_name: '비품', account_type: 'ASSET', category: '유형자산', is_system: true },

  // 2000 부채
  { id: 'acc_251', account_code: '251', account_name: '외상매입금', account_type: 'LIABILITY', category: '매입채무', is_system: true },
  { id: 'acc_253', account_code: '253', account_name: '미지급금', account_type: 'LIABILITY', category: '기타채무', is_system: true },
  { id: 'acc_254', account_code: '254', account_name: '예수금(원천세/4대보험)', account_type: 'LIABILITY', category: '유동부채', is_system: true },
  { id: 'acc_255', account_code: '255', account_name: '부가세예수금', account_type: 'LIABILITY', category: '유동부채', is_system: true },

  // 3000 자본
  { id: 'acc_331', account_code: '331', account_name: '자본금 / 기본재산', account_type: 'EQUITY', category: '자본금', is_system: true },
  { id: 'acc_371', account_code: '371', account_name: '이월이익잉여금', account_type: 'EQUITY', category: '이익잉여금', is_system: true },

  // 4000 수입
  { id: 'acc_401', account_code: '4100', account_name: '회비수입', account_type: 'REVENUE', category: '사업외수익/회비', is_system: true },
  { id: 'acc_402', account_code: '4200', account_name: '후원금수입', account_type: 'REVENUE', category: '기부후원', is_system: true },
  { id: 'acc_403', account_code: '4300', account_name: '목적사업수입', account_type: 'REVENUE', category: '사업수익', is_system: true },
  { id: 'acc_404', account_code: '4400', account_name: '국고 및 지자체보조금', account_type: 'REVENUE', category: '보조금', is_system: true },
  { id: 'acc_411', account_code: '4500', account_name: '제품매출', account_type: 'REVENUE', category: '매출액', is_system: true },
  { id: 'acc_412', account_code: '4600', account_name: '용역 및 솔루션매출', account_type: 'REVENUE', category: '매출액', is_system: true },
  { id: 'acc_451', account_code: '4700', account_name: '이자수익', account_type: 'REVENUE', category: '영업외수익', is_system: true },

  // 5000 지출
  { id: 'acc_501', account_code: '5100', account_name: '인건비(급여)', account_type: 'EXPENSE', category: '인건비', is_system: true },
  { id: 'acc_502', account_code: '5110', account_name: '상여금/제수당', account_type: 'EXPENSE', category: '인건비', is_system: true },
  { id: 'acc_503', account_code: '5200', account_name: '복리후생비(식대/건강검진)', account_type: 'EXPENSE', category: '운영비', is_system: true },
  { id: 'acc_504', account_code: '5210', account_name: '임차료(사무실/행사장)', account_type: 'EXPENSE', category: '운영비', is_system: true },
  { id: 'acc_505', account_code: '5220', account_name: '여비교통비', account_type: 'EXPENSE', category: '운영비', is_system: true },
  { id: 'acc_506', account_code: '5230', account_name: '통신비/인터넷', account_type: 'EXPENSE', category: '운영비', is_system: true },
  { id: 'acc_507', account_code: '5240', account_name: '광고홍보비', account_type: 'EXPENSE', category: '마케팅', is_system: true },
  { id: 'acc_508', account_code: '5250', account_name: '소모품비/사무용품', account_type: 'EXPENSE', category: '운영비', is_system: true },
  { id: 'acc_509', account_code: '5300', account_name: '사업비(캠프/프로그램행사)', account_type: 'EXPENSE', category: '사업비', is_system: true },
  { id: 'acc_510', account_code: '5400', account_name: '지급수수료(세무/서버)', account_type: 'EXPENSE', category: '운영비', is_system: true },
  { id: 'acc_511', account_code: '5500', account_name: '서버클라우드비용', account_type: 'EXPENSE', category: '기술운영비', is_system: true },
];

// 11. 회사별 계정과목 company_accounts (회사별 활성화)
export const INITIAL_COMPANY_ACCOUNTS: CompanyAccount[] = [
  // 대철청소년회
  { id: 'ca_1', company_id: 'comp_daechul', account_id: 'acc_101', is_active: true, created_at: '2025-01-10T09:00:00Z' },
  { id: 'ca_2', company_id: 'comp_daechul', account_id: 'acc_103', is_active: true, created_at: '2025-01-10T09:00:00Z' },
  { id: 'ca_3', company_id: 'comp_daechul', account_id: 'acc_120', is_active: true, created_at: '2025-01-10T09:00:00Z' },
  { id: 'ca_4', company_id: 'comp_daechul', account_id: 'acc_212', is_active: true, created_at: '2025-01-10T09:00:00Z' },
  { id: 'ca_5', company_id: 'comp_daechul', account_id: 'acc_253', is_active: true, created_at: '2025-01-10T09:00:00Z' },
  { id: 'ca_6', company_id: 'comp_daechul', account_id: 'acc_254', is_active: true, created_at: '2025-01-10T09:00:00Z' },
  { id: 'ca_7', company_id: 'comp_daechul', account_id: 'acc_331', is_active: true, created_at: '2025-01-10T09:00:00Z' },
  { id: 'ca_8', company_id: 'comp_daechul', account_id: 'acc_401', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 회비
  { id: 'ca_9', company_id: 'comp_daechul', account_id: 'acc_402', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 후원금
  { id: 'ca_10', company_id: 'comp_daechul', account_id: 'acc_403', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 사업수입
  { id: 'ca_11', company_id: 'comp_daechul', account_id: 'acc_404', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 보조금
  { id: 'ca_12', company_id: 'comp_daechul', account_id: 'acc_451', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 이자
  { id: 'ca_13', company_id: 'comp_daechul', account_id: 'acc_501', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 인건비
  { id: 'ca_14', company_id: 'comp_daechul', account_id: 'acc_503', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 복리후생
  { id: 'ca_15', company_id: 'comp_daechul', account_id: 'acc_504', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 임차료
  { id: 'ca_16', company_id: 'comp_daechul', account_id: 'acc_505', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 여비교통비
  { id: 'ca_17', company_id: 'comp_daechul', account_id: 'acc_506', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 통신비
  { id: 'ca_18', company_id: 'comp_daechul', account_id: 'acc_507', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 광고홍보
  { id: 'ca_19', company_id: 'comp_daechul', account_id: 'acc_508', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 소모품
  { id: 'ca_20', company_id: 'comp_daechul', account_id: 'acc_509', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 사업비
  { id: 'ca_21', company_id: 'comp_daechul', account_id: 'acc_510', is_active: true, created_at: '2025-01-10T09:00:00Z' }, // 수수료

  // ABC 주식회사
  { id: 'ca_30', company_id: 'comp_abc', account_id: 'acc_101', is_active: true, created_at: '2025-02-15T09:00:00Z' },
  { id: 'ca_31', company_id: 'comp_abc', account_id: 'acc_103', is_active: true, created_at: '2025-02-15T09:00:00Z' },
  { id: 'ca_32', company_id: 'comp_abc', account_id: 'acc_108', is_active: true, created_at: '2025-02-15T09:00:00Z' },
  { id: 'ca_33', company_id: 'comp_abc', account_id: 'acc_251', is_active: true, created_at: '2025-02-15T09:00:00Z' },
  { id: 'ca_34', company_id: 'comp_abc', account_id: 'acc_253', is_active: true, created_at: '2025-02-15T09:00:00Z' },
  { id: 'ca_35', company_id: 'comp_abc', account_id: 'acc_254', is_active: true, created_at: '2025-02-15T09:00:00Z' },
  { id: 'ca_36', company_id: 'comp_abc', account_id: 'acc_255', is_active: true, created_at: '2025-02-15T09:00:00Z' },
  { id: 'ca_37', company_id: 'comp_abc', account_id: 'acc_331', is_active: true, created_at: '2025-02-15T09:00:00Z' },
  { id: 'ca_38', company_id: 'comp_abc', account_id: 'acc_411', is_active: true, created_at: '2025-02-15T09:00:00Z' }, // 제품매출
  { id: 'ca_39', company_id: 'comp_abc', account_id: 'acc_412', is_active: true, created_at: '2025-02-15T09:00:00Z' }, // 용역매출
  { id: 'ca_40', company_id: 'comp_abc', account_id: 'acc_501', is_active: true, created_at: '2025-02-15T09:00:00Z' }, // 급여
  { id: 'ca_41', company_id: 'comp_abc', account_id: 'acc_502', is_active: true, created_at: '2025-02-15T09:00:00Z' }, // 상여금
  { id: 'ca_42', company_id: 'comp_abc', account_id: 'acc_504', is_active: true, created_at: '2025-02-15T09:00:00Z' }, // 임차료
  { id: 'ca_43', company_id: 'comp_abc', account_id: 'acc_507', is_active: true, created_at: '2025-02-15T09:00:00Z' }, // 광고홍보
  { id: 'ca_44', company_id: 'comp_abc', account_id: 'acc_511', is_active: true, created_at: '2025-02-15T09:00:00Z' }, // 클라우드
];

// 12. 은행계좌 bank_accounts
export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  // 대철청소년회
  {
    id: 'bank_a_kb',
    company_id: 'comp_daechul',
    bank_name: 'KB국민은행',
    account_number: '123-4567-890101', // UI 마스킹: 국민은행 ****0101
    account_name: '대철청소년회(운영비통장)',
    account_type: 'CHECKING',
    current_balance: 18450000,
    is_main: true,
    is_active: true,
    notes: '기본 운영비 및 인건비 출금용 주거래 계좌',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2026-09-22T08:00:00Z',
  },
  {
    id: 'bank_a_nh',
    company_id: 'comp_daechul',
    bank_name: 'NH농협은행',
    account_number: '302-0192-3481-91',
    account_name: '대철청소년회(후원금전용)',
    account_type: 'SAVINGS',
    current_balance: 8550000,
    is_main: false,
    is_active: true,
    notes: '지정기부금 및 일반후원금 전용 계좌',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2026-09-22T08:00:00Z',
  },
  {
    id: 'bank_a_sh',
    company_id: 'comp_daechul',
    bank_name: '신한은행',
    account_number: '110-384-918230',
    account_name: '대철청소년회(사업보조금)',
    account_type: 'GOVERNMENT',
    current_balance: 4200000,
    is_main: false,
    is_active: true,
    notes: '서울시 청소년 공익프로젝트 보조금 결재용',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2026-09-22T08:00:00Z',
  },

  // ABC 주식회사
  {
    id: 'bank_b_kb',
    company_id: 'comp_abc',
    bank_name: 'KB국민은행',
    account_number: '987-6543-210988',
    account_name: 'ABC주식회사(기업보통예금)',
    account_type: 'CHECKING',
    current_balance: 45200000,
    is_main: true,
    is_active: true,
    notes: '매출입금 및 법인세 결재 계좌',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2026-09-22T08:00:00Z',
  },
  {
    id: 'bank_b_hana',
    company_id: 'comp_abc',
    bank_name: '하나은행',
    account_number: '284-9102-4819-01',
    account_name: 'ABC주식회사(R&D지원금)',
    account_type: 'GOVERNMENT',
    current_balance: 31000000,
    is_main: false,
    is_active: true,
    notes: '중기부 혁신성장 R&D 지원 전용 계좌',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2026-09-22T08:00:00Z',
  },

  // XYZ 법인
  {
    id: 'bank_c_ibk',
    company_id: 'comp_xyz',
    bank_name: 'IBK기업은행',
    account_number: '010-8472-1923-01',
    account_name: 'XYZ법인(운영자금)',
    account_type: 'CHECKING',
    current_balance: 15300000,
    is_main: true,
    is_active: true,
    notes: '물류 결제 전용 계좌',
    created_at: '2025-05-20T09:00:00Z',
    updated_at: '2026-09-22T08:00:00Z',
  },
];

// 13. 거래처 vendors
export const INITIAL_VENDORS: Vendor[] = [
  // 대철청소년회 거래처
  {
    id: 'ven_a_1',
    company_id: 'comp_daechul',
    vendor_code: 'VEN001',
    vendor_name: '(주)대학로빌딩임대관리',
    business_number: '101-85-23491',
    representative_name: '정민식',
    phone: '02-741-9080',
    email: 'lease@daehak-bldg.co.kr',
    address: '서울시 종로구 대학로 102 1층',
    vendor_type: 'SUPPLIER',
    is_active: true,
    category: '임대/건물관리',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2025-01-10T09:00:00Z',
  },
  {
    id: 'ven_a_2',
    company_id: 'comp_daechul',
    vendor_code: 'VEN002',
    vendor_name: '숲속자연캠프장(양평)',
    business_number: '215-90-11234',
    representative_name: '최성수',
    phone: '031-772-5501',
    email: 'camp@forest-yp.kr',
    address: '경기도 양평군 서종면 자연로 88',
    vendor_type: 'SUPPLIER',
    is_active: true,
    category: '청소년수련/행사',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2025-01-10T09:00:00Z',
  },
  {
    id: 'ven_a_3',
    company_id: 'comp_daechul',
    vendor_code: 'VEN003',
    vendor_name: '오피스큐브 문구유통',
    business_number: '109-12-88741',
    representative_name: '한영희',
    phone: '02-2278-4300',
    email: 'sales@office-cube.com',
    address: '서울시 중구 퇴계로 24',
    vendor_type: 'SUPPLIER',
    is_active: true,
    category: '사무용품/소모품',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2025-01-10T09:00:00Z',
  },

  // ABC 주식회사 거래처
  {
    id: 'ven_b_1',
    company_id: 'comp_abc',
    vendor_code: 'VEN101',
    vendor_name: '아마존웹서비시즈(AWS)',
    business_number: '105-87-88921',
    representative_name: '함기호',
    phone: '02-3490-2000',
    email: 'billing@aws-korea.com',
    address: '서울시 강남구 테헤란로 521',
    vendor_type: 'SUPPLIER',
    is_active: true,
    category: '클라우드인프라',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2025-02-15T09:00:00Z',
  },
  {
    id: 'ven_b_2',
    company_id: 'comp_abc',
    vendor_code: 'VEN102',
    vendor_name: '패스트파이브 강남',
    business_number: '214-88-99012',
    representative_name: '김대일',
    phone: '02-552-1100',
    email: 'support@fastfive.co.kr',
    address: '서울시 강남구 강남대로 382',
    vendor_type: 'SUPPLIER',
    is_active: true,
    category: '오피스임차',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2025-02-15T09:00:00Z',
  },
];

// 14. 거래/전표 transactions (수입/지출 통합, supply_amount + vat_amount = total_amount 검증)
export const INITIAL_TRANSACTIONS: Transaction[] = [
  // 1. 대철청소년회: 후원금 수입 (면세)
  {
    id: 'tx_daechul_001',
    company_id: 'comp_daechul',
    team_id: 'team_a_admin',
    fiscal_period_id: 'fp_a_2026_09',
    transaction_date: '2026-09-02',
    transaction_type: 'INCOME',
    account_id: 'acc_402', // 후원금수입
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_a_nh',
    vat_type: 'TAX_EXEMPT',
    supply_amount: 3500000,
    vat_amount: 0,
    total_amount: 3500000,
    description: '9월 정기 개인후원금 일괄 입금 (125인)',
    memo: 'CMS 자동이체 정상 처리 완료',
    status: 'CONFIRMED',
    created_by: '홍길동 (재무총괄)',
    confirmed_by: '김대철 (대표이사)',
    confirmed_at: '2026-09-02T15:00:00Z',
    created_at: '2026-09-02T10:00:00Z',
    updated_at: '2026-09-02T15:00:00Z',
  },
  // 2. 대철청소년회: 서울시 보조금 입금 (영세)
  {
    id: 'tx_daechul_002',
    company_id: 'comp_daechul',
    team_id: 'team_a_youth',
    fiscal_period_id: 'fp_a_2026_09',
    transaction_date: '2026-09-05',
    transaction_type: 'INCOME',
    account_id: 'acc_404', // 보조금
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_a_sh',
    vat_type: 'ZERO_TAX',
    supply_amount: 8000000,
    vat_amount: 0,
    total_amount: 8000000,
    description: '서울시 하반기 청소년 진로캠프 지원보조금 교부',
    status: 'CONFIRMED',
    created_by: '박청소년 (청소년국)',
    confirmed_by: '김대철 (대표이사)',
    confirmed_at: '2026-09-05T14:00:00Z',
    created_at: '2026-09-05T11:00:00Z',
    updated_at: '2026-09-05T14:00:00Z',
  },
  // 3. 대철청소년회: 사무실 월 임차료 지급 (과세: 공급 2,000,000 + 부가세 200,000 = 2,200,000)
  {
    id: 'tx_daechul_003',
    company_id: 'comp_daechul',
    team_id: 'team_a_admin',
    fiscal_period_id: 'fp_a_2026_09',
    transaction_date: '2026-09-10',
    transaction_type: 'EXPENSE',
    account_id: 'acc_504', // 임차료
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_a_kb',
    vendor_id: 'ven_a_1',
    vat_type: 'TAXABLE',
    supply_amount: 2000000,
    vat_amount: 200000,
    total_amount: 2200000,
    description: '대학로 사옥 3층 9월분 정기 임차료 송금',
    memo: '전자세금계산서 청구 건 입금 완료',
    status: 'CONFIRMED',
    created_by: '홍길동 (재무총괄)',
    confirmed_by: '김대철 (대표이사)',
    confirmed_at: '2026-09-10T16:00:00Z',
    created_at: '2026-09-10T09:30:00Z',
    updated_at: '2026-09-10T16:00:00Z',
  },
  // 4. 대철청소년회: 청소년 캠프 장소 대관 및 숙식비 지급 (과세: 3,000,000 + 300,000 = 3,300,000)
  {
    id: 'tx_daechul_004',
    company_id: 'comp_daechul',
    team_id: 'team_a_youth',
    fiscal_period_id: 'fp_a_2026_09',
    transaction_date: '2026-09-15',
    transaction_type: 'EXPENSE',
    account_id: 'acc_509', // 사업비
    payment_method: 'CORPORATE_CARD',
    bank_account_id: 'bank_a_kb',
    vendor_id: 'ven_a_2',
    vat_type: 'TAXABLE',
    supply_amount: 3000000,
    vat_amount: 300000,
    total_amount: 3300000,
    description: '가을 청소년 자연체험 캠프 수련원 대관 및 식대 결제',
    status: 'CONFIRMED',
    created_by: '박청소년 (청소년국)',
    confirmed_by: '김대철 (대표이사)',
    confirmed_at: '2026-09-15T18:00:00Z',
    created_at: '2026-09-15T17:00:00Z',
    updated_at: '2026-09-15T18:00:00Z',
  },
  // 5. 대철청소년회: 회비수입 입금 (면세: 1,500,000)
  {
    id: 'tx_daechul_005',
    company_id: 'comp_daechul',
    team_id: 'team_a_edu',
    fiscal_period_id: 'fp_a_2026_09',
    transaction_date: '2026-09-18',
    transaction_type: 'INCOME',
    account_id: 'acc_401', // 회비수입
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_a_kb',
    vat_type: 'TAX_EXEMPT',
    supply_amount: 1500000,
    vat_amount: 0,
    total_amount: 1500000,
    description: '지도자 아카데미 3기 연회비 납입',
    status: 'CONFIRMED',
    created_by: '홍길동 (재무총괄)',
    created_at: '2026-09-18T11:00:00Z',
    updated_at: '2026-09-18T11:00:00Z',
  },
  // 6. 대철청소년회: 사무용품 구매 (과세: 350,000 + 35,000 = 385,000)
  {
    id: 'tx_daechul_006',
    company_id: 'comp_daechul',
    team_id: 'team_a_admin',
    fiscal_period_id: 'fp_a_2026_09',
    transaction_date: '2026-09-20',
    transaction_type: 'EXPENSE',
    account_id: 'acc_508', // 소모품비
    payment_method: 'CORPORATE_CARD',
    bank_account_id: 'bank_a_kb',
    vendor_id: 'ven_a_3',
    vat_type: 'TAXABLE',
    supply_amount: 350000,
    vat_amount: 35000,
    total_amount: 385000,
    description: '교육자료 출력용 A4용지 및 토너 카트리지 구매',
    status: 'DRAFT',
    created_by: '홍길동 (재무총괄)',
    created_at: '2026-09-20T14:30:00Z',
    updated_at: '2026-09-20T14:30:00Z',
  },

  // ABC 주식회사 전표
  {
    id: 'tx_abc_001',
    company_id: 'comp_abc',
    team_id: 'team_b_sales',
    fiscal_period_id: 'fp_b_2026_09',
    transaction_date: '2026-09-08',
    transaction_type: 'INCOME',
    account_id: 'acc_412', // 용역매출
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_b_kb',
    vat_type: 'TAXABLE',
    supply_amount: 15000000,
    vat_amount: 1500000,
    total_amount: 16500000,
    description: '클라우드 회계 솔루션 3분기 라이선스 공급 대금 입금',
    status: 'CONFIRMED',
    created_by: '정영업 (영업팀)',
    created_at: '2026-09-08T09:00:00Z',
    updated_at: '2026-09-08T09:00:00Z',
  },
  {
    id: 'tx_abc_002',
    company_id: 'comp_abc',
    team_id: 'team_b_dev',
    fiscal_period_id: 'fp_b_2026_09',
    transaction_date: '2026-09-12',
    transaction_type: 'EXPENSE',
    account_id: 'acc_511', // 서버클라우드
    payment_method: 'CORPORATE_CARD',
    bank_account_id: 'bank_b_kb',
    vendor_id: 'ven_b_1',
    vat_type: 'TAXABLE',
    supply_amount: 2500000,
    vat_amount: 250000,
    total_amount: 2750000,
    description: 'AWS 인프라 서버 및 Aurora DB 8월 사용료 결제',
    status: 'CONFIRMED',
    created_by: '최개발 (개발팀)',
    created_at: '2026-09-12T13:00:00Z',
    updated_at: '2026-09-12T13:00:00Z',
  },
];

// 15. 증빙 transaction_attachments
export const INITIAL_ATTACHMENTS: TransactionAttachment[] = [
  {
    id: 'att_01',
    company_id: 'comp_daechul',
    transaction_id: 'tx_daechul_003',
    file_name: '202609_대학로빌딩_임차료_세금계산서.pdf',
    file_path: 'https://storage.supabase.co/v0/b/accounting/o/daechul/tax_invoice_sep.pdf',
    file_type: 'application/pdf',
    file_size: 245100,
    uploaded_by: '홍길동',
    created_at: '2026-09-10T10:00:00Z',
  },
  {
    id: 'att_02',
    company_id: 'comp_daechul',
    transaction_id: 'tx_daechul_004',
    file_name: '자연체험캠프_수련원계약서_및_영수증.pdf',
    file_path: 'https://storage.supabase.co/v0/b/accounting/o/daechul/camp_receipt.pdf',
    file_type: 'application/pdf',
    file_size: 512000,
    uploaded_by: '박청소년',
    created_at: '2026-09-15T17:10:00Z',
  },
];

// 16. 예산 budgets (실행액은 transactions에서 실시간 계산)
export const INITIAL_BUDGETS: Budget[] = [
  // 대철청소년회 2026년 예산
  { id: 'b_a_1', company_id: 'comp_daechul', team_id: 'team_a_youth', fiscal_year: 2026, account_id: 'acc_509', budget_amount: 35000000, description: '청소년 자율활동 및 캠프 운영비', created_by: '홍길동', created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
  { id: 'b_a_2', company_id: 'comp_daechul', team_id: 'team_a_edu', fiscal_year: 2026, account_id: 'acc_509', budget_amount: 25000000, description: '청소년 리더십 및 지도자 교육사업비', created_by: '홍길동', created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
  { id: 'b_a_3', company_id: 'comp_daechul', team_id: 'team_a_admin', fiscal_year: 2026, account_id: 'acc_504', budget_amount: 26400000, description: '연간 사옥 임차료 (월 220만 x 12)', created_by: '홍길동', created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
  { id: 'b_a_4', company_id: 'comp_daechul', team_id: 'team_a_admin', fiscal_year: 2026, account_id: 'acc_508', budget_amount: 6000000, description: '사무국 연간 사무용품 및 소모품비', created_by: '홍길동', created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },

  // ABC 주식회사 예산
  { id: 'b_b_1', company_id: 'comp_abc', team_id: 'team_b_dev', fiscal_year: 2026, account_id: 'acc_511', budget_amount: 40000000, description: '클라우드 인프라 호스팅비', created_by: '최개발', created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
  { id: 'b_b_2', company_id: 'comp_abc', team_id: 'team_b_sales', fiscal_year: 2026, account_id: 'acc_507', budget_amount: 30000000, description: '온라인 마케팅 광고비', created_by: '정영업', created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
];

// 17. 은행 엑셀 가져오기 세션 bank_imports
export const INITIAL_BANK_IMPORTS: BankImport[] = [
  {
    id: 'bi_001',
    company_id: 'comp_daechul',
    bank_account_id: 'bank_a_kb',
    file_name: 'KB_국민은행_거래내역_20260901_20260920.xlsx',
    import_date: '2026-09-21T10:00:00Z',
    total_rows: 5,
    success_rows: 4,
    duplicate_rows: 1,
    error_rows: 0,
    status: 'PROCESSED',
    created_by: '홍길동',
    created_at: '2026-09-21T10:00:00Z',
  },
];

// 18. 은행 엑셀 개별 행 bank_import_rows
export const INITIAL_BANK_IMPORT_ROWS: BankImportRow[] = [
  {
    id: 'bir_001',
    bank_import_id: 'bi_001',
    company_id: 'comp_daechul',
    transaction_date: '2026-09-10',
    transaction_type: 'EXPENSE',
    amount: 2200000,
    balance: 18450000,
    description: '대학로빌딩 임차료 송금',
    counterparty: '(주)대학로빌딩',
    external_transaction_id: 'KB202609101239812',
    row_hash: '2026-09-10_EXPENSE_2200000_대학로빌딩_bank_a_kb',
    status: 'CONFIRMED',
    transaction_id: 'tx_daechul_003',
    created_at: '2026-09-21T10:00:00Z',
  },
  {
    id: 'bir_002',
    bank_import_id: 'bi_001',
    company_id: 'comp_daechul',
    transaction_date: '2026-09-15',
    transaction_type: 'EXPENSE',
    amount: 3300000,
    balance: 15150000,
    description: '수련원 캠프장 법인카드 결제',
    counterparty: '숲속자연캠프장',
    external_transaction_id: 'KB202609159918231',
    row_hash: '2026-09-15_EXPENSE_3300000_숲속자연캠프장_bank_a_kb',
    status: 'CONFIRMED',
    transaction_id: 'tx_daechul_004',
    created_at: '2026-09-21T10:00:00Z',
  },
  {
    id: 'bir_003',
    bank_import_id: 'bi_001',
    company_id: 'comp_daechul',
    transaction_date: '2026-09-18',
    transaction_type: 'INCOME',
    amount: 1500000,
    balance: 16650000,
    description: '지도자 아카데미 3기 연회비',
    counterparty: '홍길동외20인',
    external_transaction_id: 'KB202609180182736',
    row_hash: '2026-09-18_INCOME_1500000_아카데미_bank_a_kb',
    status: 'CONFIRMED',
    transaction_id: 'tx_daechul_005',
    created_at: '2026-09-21T10:00:00Z',
  },
  {
    id: 'bir_004',
    bank_import_id: 'bi_001',
    company_id: 'comp_daechul',
    transaction_date: '2026-09-21',
    transaction_type: 'INCOME',
    amount: 500000,
    balance: 17150000,
    description: '기업 지정기부금 입금',
    counterparty: '동아상사(주)',
    external_transaction_id: 'KB202609218827361',
    row_hash: '2026-09-21_INCOME_500000_동아상사_bank_a_kb',
    status: 'PENDING',
    created_at: '2026-09-21T10:00:00Z',
  },
  {
    id: 'bir_005',
    bank_import_id: 'bi_001',
    company_id: 'comp_daechul',
    transaction_date: '2026-09-10',
    transaction_type: 'EXPENSE',
    amount: 2200000,
    balance: 18450000,
    description: '대학로빌딩 임차료 송금 (중복 시도 건)',
    counterparty: '(주)대학로빌딩',
    external_transaction_id: 'KB202609101239812',
    row_hash: '2026-09-10_EXPENSE_2200000_대학로빌딩_bank_a_kb',
    status: 'DUPLICATE',
    error_message: '이미 등록된 거래내역(외부 거래번호 동일)입니다.',
    created_at: '2026-09-21T10:00:00Z',
  },
];

// 19. 감사 로그 audit_logs
export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log_001',
    company_id: 'comp_daechul',
    user_id: 'usr_kim',
    user_name: '김대철',
    action: 'CLOSE_PERIOD',
    entity_type: 'FISCAL_PERIOD',
    entity_id: 'fp_a_2026_08',
    before_data: { status: 'OPEN' },
    after_data: { status: 'CLOSED' },
    ip_address: '211.192.83.10',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    created_at: '2026-09-05T10:00:00Z',
  },
  {
    id: 'log_002',
    company_id: 'comp_daechul',
    user_id: 'usr_hong',
    user_name: '홍길동',
    action: 'CREATE',
    entity_type: 'TRANSACTION',
    entity_id: 'tx_daechul_003',
    after_data: { supply_amount: 2000000, vat_amount: 200000, total_amount: 2200000 },
    ip_address: '112.187.32.41',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    created_at: '2026-09-10T09:30:00Z',
  },
  {
    id: 'log_003',
    company_id: 'comp_daechul',
    user_id: 'usr_kim',
    user_name: '김대철',
    action: 'CONFIRM',
    entity_type: 'TRANSACTION',
    entity_id: 'tx_daechul_003',
    before_data: { status: 'DRAFT' },
    after_data: { status: 'CONFIRMED' },
    ip_address: '211.192.83.10',
    created_at: '2026-09-10T16:00:00Z',
  },
];

// 역할(Role) UI 정의
export const ROLE_DEFINITIONS: Record<
  string,
  { label: string; name: string; color: string; badgeClass: string; description: string }
> = {
  SUPER_ADMIN: {
    label: '최고관리자 (Super Admin)',
    name: '최고관리자',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    description: '전체 법인 통합 관리 및 시스템 전권',
  },
  COMPANY_ADMIN: {
    label: '법인 관리자 (Company Admin)',
    name: '법인 관리자',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    description: '회사 내 전체 권한 (마감/회계/팀/예산)',
  },
  ACCOUNTANT: {
    label: '회계 담당자 (Accountant)',
    name: '회계 담당자',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: '전표 등록/수정/삭제, 예산, 엑셀 연동',
  },
  MANAGER: {
    label: '부서장 (Manager)',
    name: '부서장',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    description: '소속 팀 전표 조회/작성 및 예산 모니터링',
  },
  VIEWER: {
    label: '단순 조회자 (Viewer)',
    name: '단순 조회자',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    description: '읽기 전용 (전표 및 결산보고서 열람)',
  },
};

