/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Company,
  Team,
  Account,
  CompanyAccount,
  User,
  UserCompanyRole,
  Transaction,
  BankAccount,
  Vendor,
  Budget,
} from '../types';

export const INITIAL_COMPANIES: Company[] = [
  {
    id: 'comp_daechul',
    company_code: 'COMPANY_A',
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
    company_code: 'COMPANY_B',
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
    company_code: 'COMPANY_C',
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

export const INITIAL_TEAMS: Team[] = [
  // 대철청소년회
  {
    id: 'team_a_youth',
    company_id: 'comp_daechul',
    team_code: 'DEPT_YOUTH',
    team_name: '청소년국',
    status: 'ACTIVE',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2025-01-10T09:00:00Z',
  },
  {
    id: 'team_a_edu',
    company_id: 'comp_daechul',
    team_code: 'DEPT_EDU',
    team_name: '교육국',
    status: 'ACTIVE',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2025-01-10T09:00:00Z',
  },
  {
    id: 'team_a_admin',
    company_id: 'comp_daechul',
    team_code: 'DEPT_ADMIN',
    team_name: '사무국',
    status: 'ACTIVE',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2025-01-10T09:00:00Z',
  },
  {
    id: 'team_a_pr',
    company_id: 'comp_daechul',
    team_code: 'DEPT_PR',
    team_name: '홍보팀',
    status: 'ACTIVE',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2025-01-10T09:00:00Z',
  },

  // ABC 주식회사
  {
    id: 'team_b_ga',
    company_id: 'comp_abc',
    team_code: 'TEAM_GA',
    team_name: '총무팀',
    status: 'ACTIVE',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2025-02-15T09:00:00Z',
  },
  {
    id: 'team_b_sales',
    company_id: 'comp_abc',
    team_code: 'TEAM_SALES',
    team_name: '영업팀',
    status: 'ACTIVE',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2025-02-15T09:00:00Z',
  },
  {
    id: 'team_b_dev',
    company_id: 'comp_abc',
    team_code: 'TEAM_DEV',
    team_name: '개발팀',
    status: 'ACTIVE',
    created_at: '2025-02-15T09:00:00Z',
    updated_at: '2025-02-15T09:00:00Z',
  },

  // XYZ 법인
  {
    id: 'team_c_plan',
    company_id: 'comp_xyz',
    team_code: 'TEAM_PLAN',
    team_name: '경영기획팀',
    status: 'ACTIVE',
    created_at: '2025-05-20T09:00:00Z',
    updated_at: '2025-05-20T09:00:00Z',
  },
  {
    id: 'team_c_logistics',
    company_id: 'comp_xyz',
    team_code: 'TEAM_LOGIS',
    team_name: '유통물류팀',
    status: 'ACTIVE',
    created_at: '2025-05-20T09:00:00Z',
    updated_at: '2025-05-20T09:00:00Z',
  },
];

export const INITIAL_ACCOUNTS: Account[] = [
  // Assets
  { id: 'acc_101', account_code: '101', account_name: '현금', account_type: 'ASSET', category: '유동자산' },
  { id: 'acc_103', account_code: '103', account_name: '보통예금', account_type: 'ASSET', category: '유동자산' },
  { id: 'acc_108', account_code: '108', account_name: '외상매출금', account_type: 'ASSET', category: '매출채권' },
  { id: 'acc_120', account_code: '120', account_name: '미수금', account_type: 'ASSET', category: '기타채권' },
  { id: 'acc_212', account_code: '212', account_name: '비품', account_type: 'ASSET', category: '유형자산' },

  // Liabilities
  { id: 'acc_251', account_code: '251', account_name: '외상매입금', account_type: 'LIABILITY', category: '매입채무' },
  { id: 'acc_253', account_code: '253', account_name: '미지급금', account_type: 'LIABILITY', category: '기타채무' },
  { id: 'acc_254', account_code: '254', account_name: '예수금(원천세/4대보험)', account_type: 'LIABILITY', category: '유동부채' },
  { id: 'acc_255', account_code: '255', account_name: '부가세예수금', account_type: 'LIABILITY', category: '유동부채' },

  // Equity
  { id: 'acc_331', account_code: '331', account_name: '자본금 / 기본재산', account_type: 'EQUITY', category: '자본금' },
  { id: 'acc_371', account_code: '371', account_name: '이월이익잉여금', account_type: 'EQUITY', category: '이익잉여금' },

  // Revenue (수입)
  { id: 'acc_401', account_code: '401', account_name: '회비수입', account_type: 'REVENUE', category: '사업외수익/회비' },
  { id: 'acc_402', account_code: '402', account_name: '후원금수입', account_type: 'REVENUE', category: '기부후원' },
  { id: 'acc_403', account_code: '403', account_name: '목적사업수입', account_type: 'REVENUE', category: '사업수익' },
  { id: 'acc_404', account_code: '404', account_name: '국고 및 지자체보조금', account_type: 'REVENUE', category: '보조금' },
  { id: 'acc_411', account_code: '411', account_name: '제품매출', account_type: 'REVENUE', category: '매출액' },
  { id: 'acc_412', account_code: '412', account_name: '용역 및 솔루션매출', account_type: 'REVENUE', category: '매출액' },
  { id: 'acc_451', account_code: '451', account_name: '이자수익', account_type: 'REVENUE', category: '영업외수익' },

  // Expense (지출)
  { id: 'acc_501', account_code: '501', account_name: '급여(인건비)', account_type: 'EXPENSE', category: '인건비' },
  { id: 'acc_502', account_code: '502', account_name: '상여금/제수당', account_type: 'EXPENSE', category: '인건비' },
  { id: 'acc_503', account_code: '503', account_name: '복리후생비(식대/건강검진)', account_type: 'EXPENSE', category: '판관비' },
  { id: 'acc_504', account_code: '504', account_name: '임차료(사무실/행사장)', account_type: 'EXPENSE', category: '운영비' },
  { id: 'acc_505', account_code: '505', account_name: '여비교통비', account_type: 'EXPENSE', category: '판관비' },
  { id: 'acc_506', account_code: '506', account_name: '통신비/인터넷', account_type: 'EXPENSE', category: '운영비' },
  { id: 'acc_507', account_code: '507', account_name: '광고홍보비', account_type: 'EXPENSE', category: '마케팅' },
  { id: 'acc_508', account_code: '508', account_name: '소모품비/사무용품', account_type: 'EXPENSE', category: '운영비' },
  { id: 'acc_509', account_code: '509', account_name: '청소년캠프/사업행사비', account_type: 'EXPENSE', category: '사업비' },
  { id: 'acc_510', account_code: '510', account_name: '지급수수료(세무/서버)', account_type: 'EXPENSE', category: '판관비' },
  { id: 'acc_511', account_code: '511', account_name: '서버클라우드비용', account_type: 'EXPENSE', category: '기술운영비' },
];

// Method B: Company Accounts configuration (Active accounts per company)
export const INITIAL_COMPANY_ACCOUNTS: CompanyAccount[] = [
  // 대철청소년회: 회비, 후원금, 보조금, 사업비, 행사비 특화
  { company_id: 'comp_daechul', account_id: 'acc_101', is_active: true },
  { company_id: 'comp_daechul', account_id: 'acc_103', is_active: true },
  { company_id: 'comp_daechul', account_id: 'acc_120', is_active: true },
  { company_id: 'comp_daechul', account_id: 'acc_212', is_active: true },
  { company_id: 'comp_daechul', account_id: 'acc_253', is_active: true },
  { company_id: 'comp_daechul', account_id: 'acc_254', is_active: true },
  { company_id: 'comp_daechul', account_id: 'acc_331', is_active: true },
  { company_id: 'comp_daechul', account_id: 'acc_401', is_active: true }, // 회비수입
  { company_id: 'comp_daechul', account_id: 'acc_402', is_active: true }, // 후원금수입
  { company_id: 'comp_daechul', account_id: 'acc_403', is_active: true }, // 목적사업수입
  { company_id: 'comp_daechul', account_id: 'acc_404', is_active: true }, // 국고보조금
  { company_id: 'comp_daechul', account_id: 'acc_451', is_active: true }, // 이자
  { company_id: 'comp_daechul', account_id: 'acc_501', is_active: true }, // 급여
  { company_id: 'comp_daechul', account_id: 'acc_503', is_active: true }, // 복리후생비
  { company_id: 'comp_daechul', account_id: 'acc_504', is_active: true }, // 임차료
  { company_id: 'comp_daechul', account_id: 'acc_505', is_active: true }, // 여비교통비
  { company_id: 'comp_daechul', account_id: 'acc_506', is_active: true }, // 통신비
  { company_id: 'comp_daechul', account_id: 'acc_507', is_active: true }, // 광고홍보비
  { company_id: 'comp_daechul', account_id: 'acc_508', is_active: true }, // 소모품비
  { company_id: 'comp_daechul', account_id: 'acc_509', is_active: true }, // 캠프/행사비
  { company_id: 'comp_daechul', account_id: 'acc_510', is_active: true }, // 수수료

  // ABC 주식회사: 제품매출, 용역매출, 서버비용 등 IT 비즈니스 활성화
  { company_id: 'comp_abc', account_id: 'acc_101', is_active: true },
  { company_id: 'comp_abc', account_id: 'acc_103', is_active: true },
  { company_id: 'comp_abc', account_id: 'acc_108', is_active: true },
  { company_id: 'comp_abc', account_id: 'acc_251', is_active: true },
  { company_id: 'comp_abc', account_id: 'acc_253', is_active: true },
  { company_id: 'comp_abc', account_id: 'acc_254', is_active: true },
  { company_id: 'comp_abc', account_id: 'acc_255', is_active: true },
  { company_id: 'comp_abc', account_id: 'acc_331', is_active: true },
  { company_id: 'comp_abc', account_id: 'acc_371', is_active: true },
  { company_id: 'comp_abc', account_id: 'acc_411', is_active: true }, // 제품매출
  { company_id: 'comp_abc', account_id: 'acc_412', is_active: true }, // 용역매출
  { company_id: 'comp_abc', account_id: 'acc_501', is_active: true }, // 급여
  { company_id: 'comp_abc', account_id: 'acc_502', is_active: true }, // 상여금
  { company_id: 'comp_abc', account_id: 'acc_503', is_active: true }, // 복리후생비
  { company_id: 'comp_abc', account_id: 'acc_504', is_active: true }, // 임차료
  { company_id: 'comp_abc', account_id: 'acc_507', is_active: true }, // 광고홍보비
  { company_id: 'comp_abc', account_id: 'acc_508', is_active: true }, // 소모품비
  { company_id: 'comp_abc', account_id: 'acc_510', is_active: true }, // 수수료
  { company_id: 'comp_abc', account_id: 'acc_511', is_active: true }, // 클라우드비용

  // XYZ 법인
  { company_id: 'comp_xyz', account_id: 'acc_101', is_active: true },
  { company_id: 'comp_xyz', account_id: 'acc_103', is_active: true },
  { company_id: 'comp_xyz', account_id: 'acc_108', is_active: true },
  { company_id: 'comp_xyz', account_id: 'acc_251', is_active: true },
  { company_id: 'comp_xyz', account_id: 'acc_411', is_active: true },
  { company_id: 'comp_xyz', account_id: 'acc_501', is_active: true },
  { company_id: 'comp_xyz', account_id: 'acc_504', is_active: true },
  { company_id: 'comp_xyz', account_id: 'acc_508', is_active: true },
];

export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  // 대철청소년회
  {
    id: 'bank_a_kb',
    company_id: 'comp_daechul',
    bank_name: 'KB국민은행',
    account_number: '123-4567-890101',
    account_name: '대철청소년회(운영비통장)',
    current_balance: 18450000,
    is_active: true,
    notes: '기본 운영비 및 인건비 출금용 주거래 계좌',
  },
  {
    id: 'bank_a_nh',
    company_id: 'comp_daechul',
    bank_name: 'NH농협은행',
    account_number: '302-0192-3481-91',
    account_name: '대철청소년회(후원금전용)',
    current_balance: 8550000,
    is_active: true,
    notes: '지정기부금 및 일반후원금 전용 계좌',
  },
  {
    id: 'bank_a_sh',
    company_id: 'comp_daechul',
    bank_name: '신한은행',
    account_number: '110-384-918230',
    account_name: '대철청소년회(사업보조금)',
    current_balance: 4200000,
    is_active: true,
    notes: '서울시 청소년 공익프로젝트 보조금 결재용',
  },

  // ABC 주식회사
  {
    id: 'bank_b_kb',
    company_id: 'comp_abc',
    bank_name: 'KB국민은행',
    account_number: '987-6543-210988',
    account_name: 'ABC주식회사(기업보통예금)',
    current_balance: 45200000,
    is_active: true,
    notes: '매출입금 및 법인세 결재 계좌',
  },
  {
    id: 'bank_b_hana',
    company_id: 'comp_abc',
    bank_name: '하나은행',
    account_number: '284-9102-4819-01',
    account_name: 'ABC주식회사(R&D지원금)',
    current_balance: 31000000,
    is_active: true,
    notes: '중기부 혁신성장 R&D 지원 전용 계좌',
  },

  // XYZ 법인
  {
    id: 'bank_c_ibk',
    company_id: 'comp_xyz',
    bank_name: 'IBK기업은행',
    account_number: '010-8472-1923-01',
    account_name: 'XYZ법인(운영자금)',
    current_balance: 15300000,
    is_active: true,
    notes: '물류 결제 전용 계좌',
  },
];

export const INITIAL_VENDORS: Vendor[] = [
  // 대철청소년회 거래처
  {
    id: 'ven_a_1',
    company_id: 'comp_daechul',
    vendor_code: 'V-001',
    vendor_name: '(주)대학로빌딩임대관리',
    business_number: '101-85-23491',
    representative: '정민식',
    phone: '02-741-9080',
    category: '임대/건물관리',
  },
  {
    id: 'ven_a_2',
    company_id: 'comp_daechul',
    vendor_code: 'V-002',
    vendor_name: '숲속자연캠프장(양평)',
    business_number: '215-90-11234',
    representative: '최성수',
    phone: '031-772-5501',
    category: '청소년수련/행사',
  },
  {
    id: 'ven_a_3',
    company_id: 'comp_daechul',
    vendor_code: 'V-003',
    vendor_name: '오피스큐브 문구유통',
    business_number: '109-12-88741',
    representative: '한영희',
    phone: '02-2278-4300',
    category: '사무용품/소모품',
  },

  // ABC 주식회사 거래처
  {
    id: 'ven_b_1',
    company_id: 'comp_abc',
    vendor_code: 'VB-001',
    vendor_name: '아마존웹서비시즈(AWS)',
    business_number: '105-87-88921',
    representative: '함기호',
    phone: '02-3490-2000',
    category: '클라우드인프라',
  },
  {
    id: 'ven_b_2',
    company_id: 'comp_abc',
    vendor_code: 'VB-002',
    vendor_name: '패스트파이브 강남',
    business_number: '214-88-99012',
    representative: '김대일',
    phone: '02-552-1100',
    category: '오피스임차',
  },
];

export const CURRENT_USER: User = {
  id: 'usr_hong',
  name: '홍길동',
  email: 'agnus9524@gmail.com',
  department: '재무총괄',
  is_system_admin: true,
};

export const INITIAL_USER_COMPANY_ROLES: UserCompanyRole[] = [
  // 홍길동 (로그인 사용자): 회사별로 서로 다른 권한 소속!
  {
    id: 'ucr_1',
    user_id: 'usr_hong',
    company_id: 'comp_daechul',
    role_id: 'ACCOUNTANT', // 대철청소년회: 회계담당자
    status: 'ACTIVE',
    created_at: '2025-01-10T09:00:00Z',
  },
  {
    id: 'ucr_2',
    user_id: 'usr_hong',
    company_id: 'comp_abc',
    role_id: 'VIEWER', // ABC 주식회사: 조회자
    status: 'ACTIVE',
    created_at: '2025-02-15T09:00:00Z',
  },
  {
    id: 'ucr_3',
    user_id: 'usr_hong',
    company_id: 'comp_xyz',
    role_id: 'ADMIN', // XYZ 법인: 관리자
    status: 'ACTIVE',
    created_at: '2025-05-20T09:00:00Z',
  },

  // 다른 사원들
  {
    id: 'ucr_4',
    user_id: 'usr_kim',
    company_id: 'comp_daechul',
    role_id: 'ADMIN',
    status: 'ACTIVE',
    created_at: '2025-01-10T09:00:00Z',
  },
  {
    id: 'ucr_5',
    user_id: 'usr_park',
    company_id: 'comp_daechul',
    role_id: 'TEAM_ACCOUNTANT',
    team_id: 'team_a_youth',
    status: 'ACTIVE',
    created_at: '2025-01-15T09:00:00Z',
  },
  {
    id: 'ucr_6',
    user_id: 'usr_lee',
    company_id: 'comp_abc',
    role_id: 'ADMIN',
    status: 'ACTIVE',
    created_at: '2025-02-15T09:00:00Z',
  },
];

export const INITIAL_ALL_USERS: User[] = [
  CURRENT_USER,
  { id: 'usr_kim', name: '김대철', email: 'director@daechul-youth.org', department: '대표이사', is_system_admin: false },
  { id: 'usr_park', name: '박청소년', email: 'park@daechul-youth.org', department: '청소년국', is_system_admin: false },
  { id: 'usr_lee', name: '이진우', email: 'ceo@abc-corp.kr', department: '대표이사', is_system_admin: false },
  { id: 'usr_jung', name: '정영업', email: 'jung@abc-corp.kr', department: '영업팀', is_system_admin: false },
  { id: 'usr_choi', name: '최개발', email: 'choi@abc-corp.kr', department: '개발팀', is_system_admin: false },
];

export const INITIAL_BUDGETS: Budget[] = [
  // 대철청소년회 2026년 예산
  { id: 'b_a_1', company_id: 'comp_daechul', team_id: 'team_a_youth', fiscal_year: 2026, account_id: 'acc_509', allocated_amount: 35000000 },
  { id: 'b_a_2', company_id: 'comp_daechul', team_id: 'team_a_edu', fiscal_year: 2026, account_id: 'acc_509', allocated_amount: 25000000 },
  { id: 'b_a_3', company_id: 'comp_daechul', team_id: 'team_a_admin', fiscal_year: 2026, account_id: 'acc_501', allocated_amount: 80000000 },
  { id: 'b_a_4', company_id: 'comp_daechul', team_id: 'team_a_admin', fiscal_year: 2026, account_id: 'acc_504', allocated_amount: 24000000 },
  { id: 'b_a_5', company_id: 'comp_daechul', team_id: 'team_a_pr', fiscal_year: 2026, account_id: 'acc_507', allocated_amount: 15000000 },

  // ABC 주식회사 2026년 예산
  { id: 'b_b_1', company_id: 'comp_abc', team_id: 'team_b_dev', fiscal_year: 2026, account_id: 'acc_511', allocated_amount: 45000000 },
  { id: 'b_b_2', company_id: 'comp_abc', team_id: 'team_b_sales', fiscal_year: 2026, account_id: 'acc_507', allocated_amount: 30000000 },
  { id: 'b_b_3', company_id: 'comp_abc', team_id: 'team_b_ga', fiscal_year: 2026, account_id: 'acc_504', allocated_amount: 60000000 },
];

// Sample Initial Transactions matching prompt:
// In Daechul Youth: ~125,000,000 income, ~98,000,000 expense, ~27,000,000 balance!
export const INITIAL_TRANSACTIONS: Transaction[] = [
  // ==================== [대철청소년회 - COMPANY_A] ====================
  {
    id: 'tx_daechul_001',
    company_id: 'comp_daechul',
    team_id: 'team_a_youth',
    transaction_date: '2026-09-02',
    transaction_type: 'INCOME',
    account_id: 'acc_404', // 국고보조금
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_a_sh',
    vendor_id: 'ven_a_1',
    vat_type: 'TAX_EXEMPT',
    supply_amount: 65000000,
    vat_amount: 0,
    total_amount: 65000000,
    description: '2026년 2차 하반기 청소년 진로성장 지원 국고보조금 입금',
    memo: '서울시 청소년육성기금 사업',
    status: 'CONFIRMED',
    created_by: '홍길동',
    created_at: '2026-09-02T10:15:00Z',
    updated_at: '2026-09-02T10:15:00Z',
  },
  {
    id: 'tx_daechul_002',
    company_id: 'comp_daechul',
    team_id: 'team_a_admin',
    transaction_date: '2026-09-05',
    transaction_type: 'INCOME',
    account_id: 'acc_402', // 후원금수입
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_a_nh',
    vat_type: 'TAX_EXEMPT',
    supply_amount: 38000000,
    vat_amount: 0,
    total_amount: 38000000,
    description: '9월 정기지정 후원금 및 일반 CMS 모금액 입금',
    memo: '국민은행 CMS 자동이체분 1,240건 취합',
    status: 'CONFIRMED',
    created_by: '홍길동',
    created_at: '2026-09-05T14:20:00Z',
    updated_at: '2026-09-05T14:20:00Z',
  },
  {
    id: 'tx_daechul_003',
    company_id: 'comp_daechul',
    team_id: 'team_a_edu',
    transaction_date: '2026-09-08',
    transaction_type: 'INCOME',
    account_id: 'acc_401', // 회비수입
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_a_kb',
    vat_type: 'TAX_EXEMPT',
    supply_amount: 22000000,
    vat_amount: 0,
    total_amount: 22000000,
    description: '청소년지도사 교육회원 정기 연회비 수납',
    memo: '350개 회원교/기관 납부',
    status: 'CONFIRMED',
    created_by: '홍길동',
    created_at: '2026-09-08T11:00:00Z',
    updated_at: '2026-09-08T11:00:00Z',
  },
  // 지출 98,000,000원
  {
    id: 'tx_daechul_004',
    company_id: 'comp_daechul',
    team_id: 'team_a_admin',
    transaction_date: '2026-09-10',
    transaction_type: 'EXPENSE',
    account_id: 'acc_501', // 급여
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_a_kb',
    vat_type: 'TAX_EXEMPT',
    supply_amount: 52000000,
    vat_amount: 0,
    total_amount: 52000000,
    description: '2026년 9월 임직원 정기 급여 및 4대보험 원천세 집행',
    memo: '사무국/청소년국/교육국 총 12명',
    status: 'CONFIRMED',
    created_by: '홍길동',
    created_at: '2026-09-10T16:00:00Z',
    updated_at: '2026-09-10T16:00:00Z',
  },
  {
    id: 'tx_daechul_005',
    company_id: 'comp_daechul',
    team_id: 'team_a_youth',
    transaction_date: '2026-09-12',
    transaction_type: 'EXPENSE',
    account_id: 'acc_509', // 캠프 행사비
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_a_kb',
    vendor_id: 'ven_a_2',
    vat_type: 'TAXABLE',
    supply_amount: 25000000,
    vat_amount: 2500000,
    total_amount: 27500000,
    description: '전국 청소년 리더십 가을캠프 숙박 및 체험시설 대관',
    memo: '숲속자연캠프장 3박 4일',
    status: 'CONFIRMED',
    created_by: '홍길동',
    created_at: '2026-09-12T13:40:00Z',
    updated_at: '2026-09-12T13:40:00Z',
  },
  {
    id: 'tx_daechul_006',
    company_id: 'comp_daechul',
    team_id: 'team_a_admin',
    transaction_date: '2026-09-15',
    transaction_type: 'EXPENSE',
    account_id: 'acc_504', // 임차료
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_a_kb',
    vendor_id: 'ven_a_1',
    vat_type: 'TAXABLE',
    supply_amount: 8000000,
    vat_amount: 800000,
    total_amount: 8800000,
    description: '본부 대학로 사무실 9월분 임차료 및 공용관리비',
    memo: '전자세금계산서 청구분',
    status: 'CONFIRMED',
    created_by: '홍길동',
    created_at: '2026-09-15T09:30:00Z',
    updated_at: '2026-09-15T09:30:00Z',
  },
  {
    id: 'tx_daechul_007',
    company_id: 'comp_daechul',
    team_id: 'team_a_pr',
    transaction_date: '2026-09-18',
    transaction_type: 'EXPENSE',
    account_id: 'acc_507', // 광고홍보비
    payment_method: 'CORPORATE_CARD',
    bank_account_id: 'bank_a_kb',
    vat_type: 'TAXABLE',
    supply_amount: 6000000,
    vat_amount: 600000,
    total_amount: 6600000,
    description: '청소년 자원봉사 페스티벌 홍보 리플렛 및 디지털 배너 광고',
    memo: 'SNS 타겟광고 및 배포물 인쇄',
    status: 'APPROVED',
    created_by: '홍길동',
    created_at: '2026-09-18T15:10:00Z',
    updated_at: '2026-09-18T15:10:00Z',
  },
  {
    id: 'tx_daechul_008',
    company_id: 'comp_daechul',
    team_id: 'team_a_admin',
    transaction_date: '2026-09-20',
    transaction_type: 'EXPENSE',
    account_id: 'acc_508', // 소모품비
    payment_method: 'CORPORATE_CARD',
    bank_account_id: 'bank_a_kb',
    vendor_id: 'ven_a_3',
    vat_type: 'TAXABLE',
    supply_amount: 2818182,
    vat_amount: 281818,
    total_amount: 3100000,
    description: '교육국 세미나 자료 인쇄용 토너 및 사무용지 구매',
    memo: '법인카드 일시불',
    status: 'CONFIRMED',
    created_by: '홍길동',
    created_at: '2026-09-20T17:00:00Z',
    updated_at: '2026-09-20T17:00:00Z',
  },

  // ==================== [ABC 주식회사 - COMPANY_B] ====================
  {
    id: 'tx_abc_101',
    company_id: 'comp_abc',
    team_id: 'team_b_sales',
    transaction_date: '2026-09-03',
    transaction_type: 'INCOME',
    account_id: 'acc_412', // 용역 및 솔루션매출
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_b_kb',
    vat_type: 'TAXABLE',
    supply_amount: 180000000,
    vat_amount: 18000000,
    total_amount: 198000000,
    description: '클라우드 회계 ERP 솔루션 3단계 구축 납품 2차 기성금 입금',
    memo: '(주)케이엠통상 계약건',
    status: 'CONFIRMED',
    created_by: '이진우',
    created_at: '2026-09-03T11:00:00Z',
    updated_at: '2026-09-03T11:00:00Z',
  },
  {
    id: 'tx_abc_102',
    company_id: 'comp_abc',
    team_id: 'team_b_sales',
    transaction_date: '2026-09-07',
    transaction_type: 'INCOME',
    account_id: 'acc_411', // 제품매출
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_b_kb',
    vat_type: 'TAXABLE',
    supply_amount: 45000000,
    vat_amount: 4500000,
    total_amount: 49500000,
    description: 'SaaS 회계 패키지 월간 구독 라이선스 결제 취합',
    memo: '9월 스트라이프 결제분 정산',
    status: 'CONFIRMED',
    created_by: '이진우',
    created_at: '2026-09-07T18:00:00Z',
    updated_at: '2026-09-07T18:00:00Z',
  },
  {
    id: 'tx_abc_103',
    company_id: 'comp_abc',
    team_id: 'team_b_dev',
    transaction_date: '2026-09-10',
    transaction_type: 'EXPENSE',
    account_id: 'acc_511', // 서버클라우드
    payment_method: 'CORPORATE_CARD',
    bank_account_id: 'bank_b_kb',
    vendor_id: 'ven_b_1',
    vat_type: 'TAXABLE',
    supply_amount: 12500000,
    vat_amount: 1250000,
    total_amount: 13750000,
    description: 'AWS 인프라 서버 및 데이터베이스 인스턴스 8월 사용료 정산',
    memo: '해외원화결제 카드 매입',
    status: 'CONFIRMED',
    created_by: '이진우',
    created_at: '2026-09-10T09:00:00Z',
    updated_at: '2026-09-10T09:00:00Z',
  },
  {
    id: 'tx_abc_104',
    company_id: 'comp_abc',
    team_id: 'team_b_ga',
    transaction_date: '2026-09-11',
    transaction_type: 'EXPENSE',
    account_id: 'acc_504', // 임차료
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_b_kb',
    vendor_id: 'ven_b_2',
    vat_type: 'TAXABLE',
    supply_amount: 18000000,
    vat_amount: 1800000,
    total_amount: 19800000,
    description: '강남타워 오피스 9월분 임차료 및 지정 주차료',
    memo: '정기 지급분',
    status: 'CONFIRMED',
    created_by: '이진우',
    created_at: '2026-09-11T14:00:00Z',
    updated_at: '2026-09-11T14:00:00Z',
  },
  {
    id: 'tx_abc_105',
    company_id: 'comp_abc',
    team_id: 'team_b_ga',
    transaction_date: '2026-09-15',
    transaction_type: 'EXPENSE',
    account_id: 'acc_501', // 급여
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_b_kb',
    vat_type: 'TAX_EXEMPT',
    supply_amount: 85000000,
    vat_amount: 0,
    total_amount: 85000000,
    description: '2026년 9월 임직원 정기 급여 지급',
    memo: '개발팀/영업팀/총무팀 총 8인',
    status: 'CONFIRMED',
    created_by: '이진우',
    created_at: '2026-09-15T10:00:00Z',
    updated_at: '2026-09-15T10:00:00Z',
  },

  // ==================== [XYZ 법인 - COMPANY_C] ====================
  {
    id: 'tx_xyz_201',
    company_id: 'comp_xyz',
    team_id: 'team_c_logistics',
    transaction_date: '2026-09-04',
    transaction_type: 'INCOME',
    account_id: 'acc_411',
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_c_ibk',
    vat_type: 'TAXABLE',
    supply_amount: 92000000,
    vat_amount: 9200000,
    total_amount: 101200000,
    description: '물류 대행 3분기 정산 수수료 수입',
    memo: '수도권 유통 허브 정산',
    status: 'CONFIRMED',
    created_by: '박명선',
    created_at: '2026-09-04T13:00:00Z',
    updated_at: '2026-09-04T13:00:00Z',
  },
  {
    id: 'tx_xyz_202',
    company_id: 'comp_xyz',
    team_id: 'team_c_plan',
    transaction_date: '2026-09-14',
    transaction_type: 'EXPENSE',
    account_id: 'acc_501',
    payment_method: 'BANK_TRANSFER',
    bank_account_id: 'bank_c_ibk',
    vat_type: 'TAX_EXEMPT',
    supply_amount: 41000000,
    vat_amount: 0,
    total_amount: 41000000,
    description: '9월 임직원 급여 지급',
    memo: '5인 급여',
    status: 'CONFIRMED',
    created_by: '박명선',
    created_at: '2026-09-14T10:00:00Z',
    updated_at: '2026-09-14T10:00:00Z',
  },
];

export const ROLE_DEFINITIONS = {
  SUPER_ADMIN: {
    role_id: 'SUPER_ADMIN' as const,
    name: '최고관리자 (Master)',
    description: '모든 회사 생성/조회/삭제 및 전사 시스템 통제 권한',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  ADMIN: {
    role_id: 'ADMIN' as const,
    name: '회사 관리자',
    description: '소속 회사의 모든 장부, 사용자, 예산, 계정 총괄 관리',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  ACCOUNTANT: {
    role_id: 'ACCOUNTANT' as const,
    name: '회계담당자',
    description: '소속 회사의 전표 작성, 승인, 마감, 은행내역 및 보고서 조회',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  TEAM_ACCOUNTANT: {
    role_id: 'TEAM_ACCOUNTANT' as const,
    name: '팀 회계담당자',
    description: '배정된 부서/팀의 거래 전표 작성 및 부서 예산 조회',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  VIEWER: {
    role_id: 'VIEWER' as const,
    name: '조회자 (Viewer)',
    description: '소속 회사의 장부 및 재무보고서 읽기 전용 열람 권한',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
  },
};
