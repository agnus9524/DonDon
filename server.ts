/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config'; // .env 파일의 설정(SUPER_ADMIN_EMAIL 등)을 읽는다
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { createSnapshotStore, FileSnapshotStore, Snapshot, SnapshotStore } from './storage';
import { createServer as createViteServer } from 'vite';
import {
  INITIAL_COMPANIES,
  INITIAL_ALL_USERS,
  INITIAL_ROLES,
  INITIAL_PERMISSIONS,
  INITIAL_ROLE_PERMISSIONS,
  INITIAL_USER_COMPANY_ROLES,
  INITIAL_TEAMS,
  INITIAL_USER_TEAM_ROLES,
  INITIAL_FISCAL_PERIODS,
  INITIAL_ACCOUNTS,
  INITIAL_COMPANY_ACCOUNTS,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_VENDORS,
  INITIAL_TRANSACTIONS,
  INITIAL_ATTACHMENTS,
  INITIAL_BUDGETS,
  INITIAL_BANK_IMPORTS,
  INITIAL_BANK_IMPORT_ROWS,
  INITIAL_AUDIT_LOGS,
} from './src/data/initialData';
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
  License,
  AuthKey,
  LicenseState,
} from './src/types';

// ────────────────────────────────────────────────────────────────
// 운영 설정
// ────────────────────────────────────────────────────────────────

// 최고관리자: 이 Google 계정으로 로그인하면 시스템 최고관리자 권한을 가진다.
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'agnus9524@gmail.com').trim().toLowerCase();

// 데이터 저장 파일 (서버를 껐다 켜도 회사·라이선스·전표가 유지되도록 JSON으로 저장)
const DATA_FILE = process.env.DONDON_DATA_FILE || path.join(process.cwd(), 'data', 'dondon-db.json');

// 돈돈 전용 Firebase 설정 파일(firebase-applet-config.json)의 값을 읽는다.
function readFirebaseConfigField(field: string): string {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8');
    const value = String(JSON.parse(raw)[field] || '').trim();
    if (value && !value.startsWith('YOUR_')) return value;
  } catch {
    // 설정 파일이 없으면 미설정 상태로 둔다.
  }
  return '';
}
// Firebase 프로젝트 ID (로그인 토큰 검증용)
const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || '').trim() || readFirebaseConfigField('projectId');
// 데이터를 영구 저장할 Firestore 데이터베이스 ID
const FIRESTORE_DATABASE_ID =
  (process.env.FIRESTORE_DATABASE_ID || '').trim() || readFirebaseConfigField('firestoreDatabaseId') || '(default)';

// 개발용 로그인: Firebase 설정 전에 로컬에서만 화면을 확인하기 위한 스위치.
// 운영(production)에서는 절대 켜지지 않는다.
const DEV_LOGIN_ENABLED = process.env.DONDON_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production';

const DAY_MS = 24 * 60 * 60 * 1000;
const nowIso = () => new Date().toISOString();
const randomSuffix = () => crypto.randomBytes(3).toString('hex');

// ────────────────────────────────────────────────────────────────
// Firebase ID 토큰 검증 (Google 공개키로 서명 확인 — 추가 패키지 불필요)
// ────────────────────────────────────────────────────────────────

interface VerifiedIdentity {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
}

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache: { keys: Map<string, crypto.KeyObject>; expiresAt: number } | null = null;

async function getFirebasePublicKey(kid: string): Promise<crypto.KeyObject | undefined> {
  if (!jwksCache || jwksCache.expiresAt < Date.now() || !jwksCache.keys.has(kid)) {
    const resp = await fetch(FIREBASE_JWKS_URL);
    if (!resp.ok) throw new Error('Google 공개키를 가져오지 못했습니다.');
    const body = (await resp.json()) as { keys: any[] };
    const keys = new Map<string, crypto.KeyObject>();
    for (const jwk of body.keys || []) {
      keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
    }
    const maxAge = /max-age=(\d+)/.exec(resp.headers.get('cache-control') || '');
    const ttlSec = maxAge ? Number(maxAge[1]) : 3600;
    jwksCache = { keys, expiresAt: Date.now() + ttlSec * 1000 };
  }
  return jwksCache.keys.get(kid);
}

async function verifyFirebaseIdToken(token: string): Promise<VerifiedIdentity> {
  if (!FIREBASE_PROJECT_ID) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('토큰 형식이 올바르지 않습니다.');

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('지원하지 않는 토큰입니다.');

  const publicKey = await getFirebasePublicKey(header.kid);
  if (!publicKey) throw new Error('토큰 서명 키를 찾을 수 없습니다.');

  const signatureOk = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    publicKey,
    Buffer.from(parts[2], 'base64url')
  );
  if (!signatureOk) throw new Error('토큰 서명이 올바르지 않습니다.');

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error('다른 프로젝트의 토큰입니다.');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error('토큰 발급자가 올바르지 않습니다.');
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) throw new Error('로그인이 만료되었습니다.');
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) throw new Error('토큰 발급 시각이 올바르지 않습니다.');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('토큰에 사용자 정보가 없습니다.');
  if (!payload.email || payload.email_verified !== true) throw new Error('이메일이 인증된 Google 계정만 사용할 수 있습니다.');

  return {
    uid: payload.sub,
    email: String(payload.email).trim().toLowerCase(),
    name: payload.name,
    picture: payload.picture,
  };
}

// 18-Table Multi-Tenant Database Store (+ licenses, auth_keys) — 메모리에 두고 JSON 파일로 저장
const PERSISTED_TABLES = [
  'companies',
  'users',
  'userCompanyRoles',
  'teams',
  'userTeamRoles',
  'accounts',
  'companyAccounts',
  'bankAccounts',
  'vendors',
  'fiscalPeriods',
  'transactions',
  'transactionAttachments',
  'budgets',
  'bankImports',
  'bankImportRows',
  'auditLogs',
  'licenses',
  'authKeys',
] as const;

class AccountingDatabase {
  // 인증/권한
  companies: Company[] = [...INITIAL_COMPANIES];
  users: User[] = [...INITIAL_ALL_USERS];
  roles: Role[] = [...INITIAL_ROLES];
  permissions: Permission[] = [...INITIAL_PERMISSIONS];
  rolePermissions: RolePermission[] = [...INITIAL_ROLE_PERMISSIONS];
  userCompanyRoles: UserCompanyRole[] = [...INITIAL_USER_COMPANY_ROLES];
  teams: Team[] = [...INITIAL_TEAMS];
  userTeamRoles: UserTeamRole[] = [...INITIAL_USER_TEAM_ROLES];

  // 회계 기준정보
  accounts: Account[] = [...INITIAL_ACCOUNTS];
  companyAccounts: CompanyAccount[] = [...INITIAL_COMPANY_ACCOUNTS];
  bankAccounts: BankAccount[] = [...INITIAL_BANK_ACCOUNTS];
  vendors: Vendor[] = [...INITIAL_VENDORS];
  fiscalPeriods: FiscalPeriod[] = [...INITIAL_FISCAL_PERIODS];

  // 회계
  transactions: Transaction[] = [...INITIAL_TRANSACTIONS];
  transactionAttachments: TransactionAttachment[] = [...INITIAL_ATTACHMENTS];
  budgets: Budget[] = [...INITIAL_BUDGETS];

  // 은행
  bankImports: BankImport[] = [...INITIAL_BANK_IMPORTS];
  bankImportRows: BankImportRow[] = [...INITIAL_BANK_IMPORT_ROWS];

  // 관리
  auditLogs: AuditLog[] = [...INITIAL_AUDIT_LOGS];

  // 라이선스 / 인증키
  licenses: License[] = [];
  authKeys: AuthKey[] = [];

  private saveTimer: NodeJS.Timeout | null = null;

  // Helper to append audit log
  addAuditLog(entry: Omit<AuditLog, 'id' | 'created_at'>) {
    const newLog: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      created_at: new Date().toISOString(),
      ...entry,
    };
    this.auditLogs.unshift(newLog);
    return newLog;
  }

  // 저장된 스냅샷을 메모리에 올린다
  applySnapshot(saved: Snapshot) {
    for (const table of PERSISTED_TABLES) {
      if (Array.isArray(saved[table])) {
        (this as any)[table] = saved[table];
      }
    }
    // 예전 데이터 보정: 회사가 추가한 계정과목인데 소유 회사가 비어 있으면, 처음 등록한 회사로 채운다
    for (const acc of this.accounts) {
      if (acc.is_system || acc.company_id) continue;
      const firstUse = this.companyAccounts
        .filter((ca) => ca.account_id === acc.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (firstUse) acc.company_id = firstUse.company_id;
    }
  }

  toSnapshot(): Snapshot {
    const snapshot: Snapshot = { saved_at: new Date().toISOString() };
    for (const table of PERSISTED_TABLES) {
      snapshot[table] = (this as any)[table];
    }
    return snapshot;
  }

  // ── 영구 저장 ──
  store: SnapshotStore | null = null;
  storageReady = false;
  lastSavedAt: string | null = null;
  lastSaveError: string | null = null;
  private saveChain: Promise<void> = Promise.resolve();
  private dirty = false;

  // 서버 시작 시 한 번: 저장소에서 데이터를 불러온다.
  // 불러오기에 실패하면 서버를 띄우지 않는다 (빈 데이터로 시작해 기존 데이터를 덮어쓰는 사고 방지).
  async initStorage(store: SnapshotStore, legacyFile: string) {
    this.store = store;
    let saved = await store.load();
    if (!saved && store.mode === 'firestore' && fs.existsSync(legacyFile)) {
      // 처음 Firestore로 옮길 때: 서버에 남아 있던 파일 데이터를 가져온다
      saved = await new FileSnapshotStore(legacyFile).load();
      if (saved) console.log(`[db] 기존 파일 데이터를 Firestore로 옮깁니다: ${legacyFile}`);
      if (saved) this.dirty = true;
    }
    if (saved) {
      this.applySnapshot(saved);
      console.log(`[db] 저장된 데이터를 불러왔습니다 (${store.description}): 회사 ${this.companies.length}개, 라이선스 ${this.licenses.length}개`);
    } else {
      console.log(`[db] 저장된 데이터가 없어 새로 시작합니다 (${store.description})`);
    }
    this.storageReady = true;
    if (this.dirty) this.scheduleSave();
  }

  // 지금까지의 변경을 저장 (저장은 한 번에 하나씩 순서대로)
  saveNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.store || !this.storageReady) return this.saveChain;
    this.dirty = false;
    const snapshot = this.toSnapshot();
    const store = this.store;
    this.saveChain = this.saveChain.then(async () => {
      try {
        await store.save(snapshot);
        this.lastSavedAt = new Date().toISOString();
        this.lastSaveError = null;
      } catch (err: any) {
        this.lastSaveError = err?.message || String(err);
        this.dirty = true; // 다음 변경 때 다시 저장
        console.error('[db] 데이터 저장 실패:', err);
        setTimeout(() => this.scheduleSave(), 5000);
      }
    });
    return this.saveChain;
  }

  // 변경이 몰려도 한 번만 쓰도록 잠깐 모았다가 저장
  scheduleSave() {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveNow();
    }, 500);
  }
}

const db = new AccountingDatabase();

// 라이선스 상태 계산: 중지 > 만료 > 정상
function getLicenseState(license: License | undefined): LicenseState {
  if (!license) return 'none';
  if (license.status !== 'active') return 'suspended';
  if (new Date(license.expires_at).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function getCompanyLicense(companyId: string): License | undefined {
  return db.licenses.find((l) => l.company_id === companyId);
}

const LICENSE_BLOCK_MESSAGES: Record<Exclude<LicenseState, 'active'>, string> = {
  none: '이 회사에는 유효한 라이선스가 없습니다. 대표 관리자가 인증키로 인증해야 사용할 수 있습니다.',
  suspended: '이 회사의 라이선스가 관리자에 의해 중지되었습니다. 운영자에게 문의해 주세요.',
  expired: '이 회사의 라이선스 사용 기간이 만료되었습니다. 대표 관리자가 새 인증키로 연장해 주세요.',
};

// 인증키 생성: XXXX-XXXX-XXXX-XXXX (헷갈리는 글자 0/O/1/I 제외, 암호학적 난수 사용)
function generateAuthKeyText(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let text: string;
  do {
    const bytes = crypto.randomBytes(16);
    const chars = Array.from(bytes, (b: number) => alphabet[b % alphabet.length]);
    text = [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
  } while (db.authKeys.some((k) => k.id === text));
  return text;
}

function generateCompanyCode(): string {
  let code: string;
  do {
    code = `C${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  } while (db.companies.some((c) => c.company_code === code));
  return code;
}

// 새 회사(테넌트) 생성 + 기본 팀/회계기간/계정과목 세팅 + 대표 관리자(ORG_ADMIN) 지정
function provisionCompany(
  fields: {
    company_code?: string;
    company_name: string;
    business_number?: string;
    representative_name?: string;
    address?: string;
    phone?: string;
    email?: string;
  },
  owner: User
): Company {
  const now = nowIso();
  const newCompany: Company = {
    id: `comp_${Date.now()}_${randomSuffix()}`,
    company_code: (fields.company_code || generateCompanyCode()).toUpperCase(),
    company_name: fields.company_name,
    business_number: fields.business_number || '',
    representative_name: fields.representative_name || owner.name,
    address: fields.address || '',
    phone: fields.phone || '',
    email: fields.email || owner.email,
    status: 'ACTIVE',
    created_at: now,
    updated_at: now,
    user_count: 1,
  };
  db.companies.push(newCompany);

  db.teams.push(
    {
      id: `team_${Date.now()}_${randomSuffix()}_ga`,
      company_id: newCompany.id,
      team_code: 'TEAM_GA',
      team_name: '총무부서',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    },
    {
      id: `team_${Date.now()}_${randomSuffix()}_biz`,
      company_id: newCompany.id,
      team_code: 'TEAM_BIZ',
      team_name: '사업기획팀',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    }
  );

  // 이번 달 회계기간을 OPEN 상태로 연다
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  db.fiscalPeriods.push({
    id: `fp_${newCompany.id}_${year}_${String(month).padStart(2, '0')}`,
    company_id: newCompany.id,
    year,
    month,
    status: 'OPEN',
    created_at: now,
    updated_at: now,
  });

  db.userCompanyRoles.push({
    id: `ucr_${Date.now()}_${randomSuffix()}`,
    user_id: owner.id,
    company_id: newCompany.id,
    role_id: 'ORG_ADMIN',
    status: 'ACTIVE',
    created_at: now,
    updated_at: now,
  });

  // Default Company Accounts (Method B) — 공통 계정과목만 (다른 회사가 추가한 과목은 제외)
  db.accounts.filter((acc) => !acc.company_id).forEach((acc) => {
    db.companyAccounts.push({
      id: `ca_${newCompany.id}_${acc.id}`,
      company_id: newCompany.id,
      account_id: acc.id,
      is_active: ['101', '103', '251', '253', '331', '4100', '4200', '5100', '5210', '5250'].includes(
        acc.account_code
      ),
      created_at: now,
    });
  });

  return newCompany;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // 1) 저장소 연결 + 데이터 불러오기 (실패하면 여기서 멈춤)
  const store = await createSnapshotStore({
    dataFile: DATA_FILE,
    serviceAccountRaw: process.env.FIREBASE_SERVICE_ACCOUNT,
    firestoreDatabaseId: FIRESTORE_DATABASE_ID,
  });
  await db.initStorage(store, DATA_FILE);
  const STORAGE_IS_EPHEMERAL = store.mode === 'file' && process.env.NODE_ENV === 'production' && !process.env.DONDON_DATA_FILE;

  app.use(express.json({ limit: '10mb' }));

  // 값을 바꾸는 요청이 끝나면 파일에 저장
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      res.on('finish', () => db.scheduleSave());
    }
    next();
  });

  // Multi-tenant Context Extraction Middleware
  interface TenantRequest extends Request {
    user?: User;
    companyId?: string;
    userRole?: UserCompanyRole;
    isSuperAdmin?: boolean;
    // 회사는 있지만 라이선스가 유효하지 않을 때의 상태 (최고관리자는 해당 없음)
    licenseBlock?: Exclude<LicenseState, 'active'>;
  }

  // 로그인 없이 호출할 수 있는 경로 (그 외 모든 /api 요청은 로그인 필수)
  const PUBLIC_API_PATHS = new Set(['/health', '/v1/auth/config']);

  // 요청에서 로그인 신원을 확인한다. 헤더의 사용자 ID 같은 자기신고 값은 절대 믿지 않는다.
  const resolveIdentity = async (req: Request): Promise<VerifiedIdentity | null> => {
    const header = String(req.headers.authorization || '');
    if (header.startsWith('Bearer ')) {
      return verifyFirebaseIdToken(header.slice(7).trim());
    }
    if (DEV_LOGIN_ENABLED && header.startsWith('Dev ')) {
      const email = header.slice(4).trim().toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return { uid: `dev|${email}`, email, name: email.split('@')[0] };
      }
    }
    return null;
  };

  // 로그인한 신원에 해당하는 사용자 레코드를 찾거나 새로 만든다
  const findOrCreateUser = (identity: VerifiedIdentity): User => {
    const isSuper = identity.email === SUPER_ADMIN_EMAIL;
    let user =
      db.users.find((u) => u.auth_user_id === identity.uid) ||
      db.users.find((u) => u.email.toLowerCase() === identity.email);
    let changed = false;

    if (!user) {
      user = {
        id: `usr_${Date.now()}_${randomSuffix()}`,
        auth_user_id: identity.uid,
        email: identity.email,
        name: isSuper ? '최고관리자' : identity.name || identity.email.split('@')[0],
        profile_image_url: identity.picture,
        status: 'ACTIVE',
        last_login_at: nowIso(),
        created_at: nowIso(),
        updated_at: nowIso(),
        is_system_admin: isSuper,
        is_super_admin: isSuper,
      };
      db.users.push(user);
      db.addAuditLog({
        company_id: 'system',
        user_id: user.id,
        user_name: user.name,
        action: 'LOGIN',
        entity_type: 'AUTH',
        entity_id: user.id,
        after_data: { email: user.email, first_login: true },
      });
      changed = true;
    } else {
      if (user.auth_user_id !== identity.uid) {
        user.auth_user_id = identity.uid;
        changed = true;
      }
      // 최고관리자 여부는 저장된 값이 아니라 항상 로그인 이메일로 다시 판정한다
      if (!!user.is_super_admin !== isSuper || !!user.is_system_admin !== isSuper) {
        user.is_super_admin = isSuper;
        user.is_system_admin = isSuper;
        changed = true;
      }
    }
    if (changed) db.scheduleSave();
    return user;
  };

  const tenantAuthMiddleware = async (req: TenantRequest, res: Response, next: NextFunction) => {
    if (PUBLIC_API_PATHS.has(req.path)) return next();

    let identity: VerifiedIdentity | null = null;
    try {
      identity = await resolveIdentity(req);
    } catch (err: any) {
      return res.status(401).json({ error: err?.message || '로그인 확인에 실패했습니다.', code: 'UNAUTHENTICATED' });
    }
    if (!identity) {
      return res.status(401).json({ error: '로그인이 필요합니다.', code: 'UNAUTHENTICATED' });
    }

    const user = findOrCreateUser(identity);
    req.user = user;
    req.isSuperAdmin = identity.email === SUPER_ADMIN_EMAIL;

    if (user.status === 'SUSPENDED' && !req.isSuperAdmin && req.path !== '/v1/auth/me') {
      return res.status(403).json({ error: '이용이 정지된 계정입니다. 관리자에게 문의해 주세요.', code: 'USER_SUSPENDED' });
    }

    // Company context from header or query
    const companyId = (req.headers['x-company-id'] as string) || (req.query.company_id as string);
    if (companyId) {
      req.companyId = companyId;
      if (req.isSuperAdmin) {
        // Super Admin gets implicit SUPER_ADMIN role in all companies (라이선스와 무관)
        req.userRole = {
          id: `ucr_sa_${companyId}`,
          user_id: user.id,
          company_id: companyId,
          role_id: 'SUPER_ADMIN',
          status: 'ACTIVE',
          created_at: nowIso(),
          updated_at: nowIso(),
        };
      } else {
        const role = db.userCompanyRoles.find(
          (r) => r.user_id === user.id && r.company_id === companyId && r.status === 'ACTIVE'
        );
        const hasTeamRole = db.userTeamRoles.some(
          (tr) => tr.user_id === user.id && db.teams.some((t) => t.id === tr.team_id && t.company_id === companyId)
        );
        if (role || hasTeamRole) {
          const state = getLicenseState(getCompanyLicense(companyId));
          if (state === 'active') {
            // 라이선스가 유효할 때만 회사 권한을 부여한다
            if (role) req.userRole = role;
          } else {
            req.licenseBlock = state;
          }
        }
      }
    }
    next();
  };

  app.use('/api', tenantAuthMiddleware);

  // 회사 관리자 여부 (최고관리자 또는 현재 회사의 대표 관리자)
  const isCompanyAdmin = (req: TenantRequest) =>
    !!req.isSuperAdmin || req.userRole?.role_id === 'ORG_ADMIN' || req.userRole?.role_id === 'ADMIN';

  const requireSuperAdmin = (req: TenantRequest, res: Response, next: NextFunction) => {
    if (!req.isSuperAdmin) {
      return res.status(403).json({ error: '최고관리자만 사용할 수 있는 기능입니다.' });
    }
    next();
  };

  // 사용자가 속한(ACTIVE) 회사 목록
  const getMemberCompanyIds = (userId: string): Set<string> => {
    const ids = new Set<string>();
    db.userCompanyRoles
      .filter((r) => r.user_id === userId && r.status === 'ACTIVE')
      .forEach((r) => ids.add(r.company_id));
    db.userTeamRoles
      .filter((tr) => tr.user_id === userId)
      .forEach((tr) => {
        const team = db.teams.find((t) => t.id === tr.team_id);
        if (team) ids.add(team.company_id);
      });
    return ids;
  };

  const describeCompanyLicense = (companyId: string, userId: string) => {
    const license = getCompanyLicense(companyId);
    return {
      state: getLicenseState(license),
      expires_at: license ? license.expires_at : null,
      is_owner: !!license && license.user_id === userId,
    };
  };

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      app: 'don don multi-tenant accounting system',
      time: new Date().toISOString(),
    });
  });

  // 로그인 화면이 어떤 로그인 방식을 쓸 수 있는지 확인하는 공개 정보
  app.get('/api/v1/auth/config', (req, res) => {
    res.json({ firebase_configured: !!FIREBASE_PROJECT_ID, dev_login: DEV_LOGIN_ENABLED });
  });

  // Auth & Profile — 로그인 직후 호출. 내 정보, 내 회사, 라이선스 상태를 돌려준다.
  app.get('/api/v1/auth/me', (req: TenantRequest, res: Response) => {
    const user = req.user!;
    const userRoles = db.userCompanyRoles.filter((r) => r.user_id === user.id && r.status === 'ACTIVE');
    const memberCompanyIds = getMemberCompanyIds(user.id);
    const authorizedCompanies = req.isSuperAdmin
      ? db.companies
      : db.companies.filter((c) => memberCompanyIds.has(c.id));

    const lastLogin = user.last_login_at ? new Date(user.last_login_at).getTime() : 0;
    if (Date.now() - lastLogin > 60 * 1000) {
      user.last_login_at = nowIso();
      db.scheduleSave();
    }

    const pendingRequests = db.userCompanyRoles
      .filter((r) => r.user_id === user.id && r.status === 'PENDING')
      .map((r) => {
        const c = db.companies.find((comp) => comp.id === r.company_id);
        return { id: r.id, company_name: c?.company_name || '', company_code: c?.company_code || '', created_at: r.created_at };
      });

    res.json({
      user,
      is_super_admin: !!req.isSuperAdmin,
      roles: userRoles,
      companies: authorizedCompanies.map((comp) => {
        const role = userRoles.find((r) => r.company_id === comp.id);
        return {
          ...comp,
          my_role: req.isSuperAdmin ? 'SUPER_ADMIN' : role ? role.role_id : 'VIEWER',
          license: describeCompanyLicense(comp.id, user.id),
        };
      }),
      pending_requests: pendingRequests,
    });
  });

  // 인증키로 라이선스 인증 — 처음이면 회사를 만들고 대표 관리자가 되며, 이미 대표라면 기간이 연장된다.
  app.post('/api/v1/license/activate', (req: TenantRequest, res: Response) => {
    const user = req.user!;
    if (req.isSuperAdmin) {
      return res.status(400).json({ error: '최고관리자 계정은 인증키 인증이 필요하지 않습니다.' });
    }

    const keyText = String(req.body?.key || '').trim().toUpperCase();
    if (!keyText) {
      return res.status(400).json({ error: '인증키를 입력해 주세요.' });
    }
    const authKey = db.authKeys.find((k) => k.id === keyText);
    if (!authKey) {
      return res.status(404).json({ error: '존재하지 않는 인증키입니다.' });
    }

    const ownedLicense = db.licenses.find(
      (l) => l.user_id === user.id && db.companies.some((c) => c.id === l.company_id)
    );

    // 이미 사용된 키: 처음 사용한 계정에만 귀속된다 (키 하나를 여러 계정이 나눠 쓰는 것 방지)
    if (authKey.status === 'used') {
      if (authKey.used_by !== user.id) {
        return res.status(409).json({ error: '이미 다른 계정에서 사용 중인 인증키입니다.' });
      }
      if (!ownedLicense) {
        return res.status(404).json({ error: '라이선스 정보를 찾을 수 없습니다. 운영자에게 문의해 주세요.' });
      }
      const state = getLicenseState(ownedLicense);
      if (state !== 'active') {
        return res.status(403).json({ error: LICENSE_BLOCK_MESSAGES[state], code: `LICENSE_${state.toUpperCase()}` });
      }
      return res.json({
        success: true,
        already_used: true,
        license: ownedLicense,
        company: db.companies.find((c) => c.id === ownedLicense.company_id),
      });
    }

    const durationDays = authKey.duration_days || 30;
    const now = nowIso();
    let license: License;
    let company: Company;
    let renewed = false;

    if (ownedLicense) {
      // 기존 대표 관리자: 남은 기간 뒤에 이어서 연장
      if (ownedLicense.status !== 'active') {
        return res.status(403).json({ error: LICENSE_BLOCK_MESSAGES.suspended, code: 'LICENSE_SUSPENDED' });
      }
      const base = Math.max(Date.now(), new Date(ownedLicense.expires_at).getTime());
      ownedLicense.expires_at = new Date(base + durationDays * DAY_MS).toISOString();
      ownedLicense.key = keyText;
      ownedLicense.updated_at = now;
      license = ownedLicense;
      company = db.companies.find((c) => c.id === ownedLicense.company_id)!;
      renewed = true;
    } else {
      // 라이선스가 삭제된(또는 없는) 회사의 대표 관리자라면 새 회사를 만들지 않고 그 회사에 다시 붙인다
      const adminRoleWithoutLicense = db.userCompanyRoles.find(
        (r) =>
          r.user_id === user.id &&
          r.status === 'ACTIVE' &&
          r.role_id === 'ORG_ADMIN' &&
          !getCompanyLicense(r.company_id) &&
          db.companies.some((c) => c.id === r.company_id)
      );
      if (adminRoleWithoutLicense) {
        company = db.companies.find((c) => c.id === adminRoleWithoutLicense.company_id)!;
      } else {
        const companyName = String(req.body?.company_name || '').trim();
        if (!companyName) {
          return res.status(400).json({ error: '회사명을 입력해 주세요.', code: 'COMPANY_NAME_REQUIRED' });
        }
        company = provisionCompany(
          {
            company_name: companyName,
            business_number: String(req.body?.business_number || '').trim(),
            representative_name: String(req.body?.representative_name || '').trim(),
          },
          user
        );
      }
      license = {
        id: `lic_${Date.now()}_${randomSuffix()}`,
        user_id: user.id,
        email: user.email,
        company_id: company.id,
        status: 'active',
        expires_at: new Date(Date.now() + durationDays * DAY_MS).toISOString(),
        key: keyText,
        created_at: now,
        updated_at: now,
      };
      db.licenses.push(license);
    }

    authKey.status = 'used';
    authKey.used_by = user.id;
    authKey.used_by_email = user.email;
    authKey.used_at = now;
    authKey.company_id = company.id;

    db.addAuditLog({
      company_id: company.id,
      user_id: user.id,
      user_name: user.name,
      action: 'ACTIVATE',
      entity_type: 'LICENSE',
      entity_id: license.id,
      after_data: { renewed, duration_days: durationDays, expires_at: license.expires_at, company_name: company.company_name },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.status(renewed ? 200 : 201).json({ success: true, renewed, license, company });
  });

  // Request Join Company Endpoint — 로그인한 사용자가 회사 코드로 소속 가입을 신청
  app.post('/api/v1/auth/request-join', (req: TenantRequest, res: Response) => {
    const user = req.user!;
    const companyCode = String(req.body?.company_code || '').trim().toUpperCase();
    const reason = String(req.body?.reason || '').trim();
    if (!companyCode) {
      return res.status(400).json({ error: '회사 코드를 입력해 주세요.' });
    }
    const company = db.companies.find((c) => c.company_code.toUpperCase() === companyCode);
    if (!company) {
      return res.status(404).json({ error: '해당 회사 코드를 찾을 수 없습니다. 대표 관리자에게 회사 코드를 확인해 주세요.' });
    }

    const existing = db.userCompanyRoles.find((r) => r.user_id === user.id && r.company_id === company.id);
    if (existing && existing.status === 'ACTIVE') {
      return res.status(400).json({ error: '이미 소속된 회사입니다.' });
    }

    if (existing) {
      existing.status = 'PENDING';
      existing.reason = reason || existing.reason;
      existing.updated_at = nowIso();
    } else {
      db.userCompanyRoles.push({
        id: `ucr_${Date.now()}_${randomSuffix()}`,
        user_id: user.id,
        company_id: company.id,
        role_id: 'VIEWER',
        status: 'PENDING',
        reason,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    }

    db.addAuditLog({
      company_id: company.id,
      user_id: user.id,
      user_name: user.name,
      action: 'CREATE',
      entity_type: 'USER_COMPANY_ROLE_REQUEST',
      entity_id: user.id,
      after_data: { name: user.name, email: user.email, reason, status: 'PENDING', company_id: company.id },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      company_name: company.company_name,
      message: '회사 소속 가입 신청이 정상 접수되었습니다. 대표 관리자 승인 후 권한이 부여됩니다.',
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 슈퍼 관리자 패널 API — 회원 라이선스 / 인증키 관리 (최고관리자 전용)
  // ────────────────────────────────────────────────────────────────

  // 데이터 저장 상태 (슈퍼 관리자 패널 상단에 표시)
  app.get('/api/v1/super/storage', requireSuperAdmin, (req: TenantRequest, res: Response) => {
    res.json({
      mode: store.mode,
      description: store.mode === 'firestore' ? store.description : '서버 내부 파일',
      ephemeral: STORAGE_IS_EPHEMERAL,
      last_saved_at: db.lastSavedAt,
      last_error: db.lastSaveError,
      counts: { companies: db.companies.length, licenses: db.licenses.length, users: db.users.length },
    });
  });

  app.get('/api/v1/super/licenses', requireSuperAdmin, (req: TenantRequest, res: Response) => {
    const rows = db.licenses
      .map((lic) => {
        const company = db.companies.find((c) => c.id === lic.company_id);
        const owner = db.users.find((u) => u.id === lic.user_id);
        return {
          ...lic,
          state: getLicenseState(lic),
          user_name: owner?.name || '',
          company_name: company?.company_name || '(삭제된 회사)',
          company_code: company?.company_code || '',
          member_count: db.userCompanyRoles.filter((r) => r.company_id === lic.company_id && r.status === 'ACTIVE').length,
        };
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    res.json({ licenses: rows });
  });

  app.put('/api/v1/super/licenses/:id', requireSuperAdmin, (req: TenantRequest, res: Response) => {
    const license = db.licenses.find((l) => l.id === req.params.id);
    if (!license) {
      return res.status(404).json({ error: '라이선스를 찾을 수 없습니다.' });
    }
    const before = { status: license.status, expires_at: license.expires_at };
    const { status, extend_days } = req.body || {};

    if (status !== undefined) {
      if (status !== 'active' && status !== 'suspended') {
        return res.status(400).json({ error: 'status는 active 또는 suspended여야 합니다.' });
      }
      license.status = status;
    }
    if (extend_days !== undefined) {
      const days = Number(extend_days);
      if (!Number.isFinite(days) || days <= 0 || days > 3650) {
        return res.status(400).json({ error: '연장 일수는 1~3650 사이여야 합니다.' });
      }
      // 이미 만료됐다면 오늘부터, 아니면 기존 만료일 뒤로 이어서 연장
      const base = Math.max(Date.now(), new Date(license.expires_at).getTime());
      license.expires_at = new Date(base + days * DAY_MS).toISOString();
      license.status = 'active';
    }
    license.updated_at = nowIso();

    db.addAuditLog({
      company_id: license.company_id,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'UPDATE',
      entity_type: 'LICENSE',
      entity_id: license.id,
      before_data: before,
      after_data: { status: license.status, expires_at: license.expires_at },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({ success: true, license: { ...license, state: getLicenseState(license) } });
  });

  // 라이선스 삭제: 회사 데이터는 남기고 사용만 막는다. 대표 관리자가 새 인증키로 인증하면 같은 회사로 복구된다.
  app.delete('/api/v1/super/licenses/:id', requireSuperAdmin, (req: TenantRequest, res: Response) => {
    const idx = db.licenses.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '라이선스를 찾을 수 없습니다.' });
    }
    const [removed] = db.licenses.splice(idx, 1);
    db.addAuditLog({
      company_id: removed.company_id,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'DELETE',
      entity_type: 'LICENSE',
      entity_id: removed.id,
      before_data: removed,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });
    res.json({ success: true });
  });

  app.get('/api/v1/super/auth-keys', requireSuperAdmin, (req: TenantRequest, res: Response) => {
    const keys = [...db.authKeys]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((k) => ({
        ...k,
        company_name: k.company_id ? db.companies.find((c) => c.id === k.company_id)?.company_name || '' : '',
      }));
    res.json({ auth_keys: keys });
  });

  app.post('/api/v1/super/auth-keys', requireSuperAdmin, (req: TenantRequest, res: Response) => {
    const durationDays = Number(req.body?.duration_days ?? 30);
    if (!Number.isInteger(durationDays) || durationDays <= 0 || durationDays > 3650) {
      return res.status(400).json({ error: '유효 기간은 1~3650일 사이의 정수여야 합니다.' });
    }
    const newKey: AuthKey = {
      id: generateAuthKeyText(),
      status: 'unused',
      duration_days: durationDays,
      memo: String(req.body?.memo || '').trim().slice(0, 100) || undefined,
      created_at: nowIso(),
      created_by: req.user!.id,
    };
    db.authKeys.push(newKey);
    db.addAuditLog({
      company_id: 'system',
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'CREATE',
      entity_type: 'AUTH_KEY',
      entity_id: newKey.id,
      after_data: { duration_days: durationDays, memo: newKey.memo },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });
    res.status(201).json({ auth_key: newKey });
  });

  // 인증키 폐기: 미사용 키는 더 이상 쓸 수 없게 되고, 사용된 키는 기록만 지워진다(라이선스는 유지)
  app.delete('/api/v1/super/auth-keys/:id', requireSuperAdmin, (req: TenantRequest, res: Response) => {
    const idx = db.authKeys.findIndex((k) => k.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '인증키를 찾을 수 없습니다.' });
    }
    const [removed] = db.authKeys.splice(idx, 1);
    db.addAuditLog({
      company_id: removed.company_id || 'system',
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'DELETE',
      entity_type: 'AUTH_KEY',
      entity_id: removed.id,
      before_data: removed,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });
    res.json({ success: true });
  });

  // Companies List
  app.get('/api/v1/companies', (req: TenantRequest, res: Response) => {
    const user = req.user!;
    const memberCompanyIds = getMemberCompanyIds(user.id);
    const result = req.isSuperAdmin
      ? db.companies
      : db.companies.filter((c) => memberCompanyIds.has(c.id));

    res.json({
      companies: result.map((c) => ({
        ...c,
        user_count: db.userCompanyRoles.filter((r) => r.company_id === c.id && r.status === 'ACTIVE').length,
        license: describeCompanyLicense(c.id, user.id),
      })),
    });
  });

  // Create Company (Super Admin only)
  app.post('/api/v1/companies', (req: TenantRequest, res: Response) => {
    if (!req.isSuperAdmin) {
      return res.status(403).json({ error: '회사(법인) 등록은 최고관리자만 수행할 수 있습니다.' });
    }

    const { company_code, company_name, business_number, representative_name, address, phone, email } = req.body;
    if (!company_code || !company_name) {
      return res.status(400).json({ error: '회사 코드와 회사명은 필수입니다.' });
    }

    if (db.companies.some((c) => c.company_code.toUpperCase() === company_code.toUpperCase())) {
      return res.status(400).json({ error: '이미 존재하는 회사 코드입니다.' });
    }

    const newCompany = provisionCompany(
      { company_code, company_name, business_number, representative_name, address, phone, email },
      req.user!
    );

    // Audit Log
    db.addAuditLog({
      company_id: newCompany.id,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'CREATE',
      entity_type: 'COMPANY',
      entity_id: newCompany.id,
      after_data: newCompany,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.status(201).json({ company: newCompany });
  });

  // Delete Company (Super Admin only)
  app.delete('/api/v1/companies/:id', (req: TenantRequest, res: Response) => {
    if (!req.isSuperAdmin) {
      return res.status(403).json({ error: '회사 삭제는 최고관리자(SUPER_ADMIN)만 수행할 수 있습니다.' });
    }

    const companyId = req.params.id;
    const compIdx = db.companies.findIndex((c) => c.id === companyId);
    if (compIdx === -1) {
      return res.status(404).json({ error: '삭제할 회사를 찾을 수 없습니다.' });
    }

    const targetCompany = db.companies[compIdx];

    const { confirm_company_name } = req.body || {};
    if (confirm_company_name !== undefined) {
      if (String(confirm_company_name).trim() !== targetCompany.company_name.trim()) {
        return res.status(400).json({
          error: `입력하신 회사명 [${confirm_company_name}]이(가) 삭제 대상 회사명 [${targetCompany.company_name}]과 일치하지 않습니다.`,
        });
      }
    }

    // Cascade delete all records belonging to this company
    db.companies.splice(compIdx, 1);
    db.teams = db.teams.filter((t) => t.company_id !== companyId);
    db.companyAccounts = db.companyAccounts.filter((ca) => ca.company_id !== companyId);
    db.accounts = db.accounts.filter((acc) => acc.company_id !== companyId);
    db.bankAccounts = db.bankAccounts.filter((ba) => ba.company_id !== companyId);
    db.vendors = db.vendors.filter((v) => v.company_id !== companyId);
    db.fiscalPeriods = db.fiscalPeriods.filter((fp) => fp.company_id !== companyId);
    db.transactions = db.transactions.filter((tx) => tx.company_id !== companyId);
    db.transactionAttachments = db.transactionAttachments.filter((att) => att.company_id !== companyId);
    db.budgets = db.budgets.filter((b) => b.company_id !== companyId);
    db.bankImports = db.bankImports.filter((bi) => bi.company_id !== companyId);
    db.bankImportRows = db.bankImportRows.filter((bir) => bir.company_id !== companyId);
    db.userTeamRoles = db.userTeamRoles.filter((utr) => db.teams.some((t) => t.id === utr.team_id));
    db.userCompanyRoles = db.userCompanyRoles.filter((ucr) => ucr.company_id !== companyId);
    db.licenses = db.licenses.filter((lic) => lic.company_id !== companyId);

    db.addAuditLog({
      company_id: companyId,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'DELETE',
      entity_type: 'COMPANY',
      entity_id: companyId,
      before_data: targetCompany,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: `[${targetCompany.company_name}] 회사가 성공적으로 삭제되었습니다.`,
      deleted_id: companyId,
    });
  });

  // Guard: Multi-tenant Company Access check
  const requireCompanyAccess = (req: TenantRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'x-company-id 헤더 또는 company_id 파라미터가 필요합니다.' });
    }
    const company = db.companies.find((c) => c.id === companyId);
    if (!company) {
      return res.status(404).json({ error: '회사를 찾을 수 없습니다.' });
    }
    // 라이선스가 없거나 만료/중지된 회사는 최고관리자 외에는 사용할 수 없다
    if (!req.isSuperAdmin && req.licenseBlock) {
      return res.status(403).json({
        error: LICENSE_BLOCK_MESSAGES[req.licenseBlock],
        code: `LICENSE_${req.licenseBlock.toUpperCase()}`,
      });
    }
    // Check permission
    if (!req.isSuperAdmin && !req.userRole) {
      return res.status(403).json({
        error: '해당 회사(법인)에 대한 접근 권한이 없습니다. (Multi-Tenant Isolation Violation)',
      });
    }
    next();
  };

  // 10. 회계기간 fiscal_periods API (마감 관리)
  app.get('/api/v1/fiscal-periods', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const companyId = req.companyId!;
    const periods = db.fiscalPeriods
      .filter((fp) => fp.company_id === companyId)
      .sort((a, b) => b.year - a.year || b.month - a.month);
    res.json({ fiscal_periods: periods });
  });

  app.post('/api/v1/fiscal-periods/:id/toggle-close', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    // Only ORG_ADMIN, SUPER_ADMIN or HQ_ACCOUNTANT can toggle closing
    const roleId = req.userRole?.role_id;
    if (!req.isSuperAdmin && roleId !== 'ORG_ADMIN' && roleId !== 'HQ_ACCOUNTANT' && roleId !== 'ADMIN') {
      return res.status(403).json({ error: '회계기간 마감 권한이 없습니다.' });
    }

    const fp = db.fiscalPeriods.find((p) => p.id === req.params.id && p.company_id === req.companyId);
    if (!fp) {
      return res.status(404).json({ error: '회계기간을 찾을 수 없습니다.' });
    }

    const beforeStatus = fp.status;
    if (fp.status === 'OPEN') {
      fp.status = 'CLOSED';
      fp.closed_at = new Date().toISOString();
      fp.closed_by = req.user!.name;
    } else {
      fp.status = 'OPEN';
      fp.closed_at = undefined;
      fp.closed_by = undefined;
    }
    fp.updated_at = new Date().toISOString();

    db.addAuditLog({
      company_id: req.companyId!,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'CLOSE_PERIOD',
      entity_type: 'FISCAL_PERIOD',
      entity_id: fp.id,
      before_data: { status: beforeStatus },
      after_data: { status: fp.status, closed_by: fp.closed_by },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({ success: true, fiscal_period: fp });
  });

  // Teams for Current Company
  app.get('/api/v1/teams', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const teams = db.teams.filter((t) => t.company_id === req.companyId);
    res.json({ teams });
  });

  app.post('/api/v1/teams', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const { team_code, team_name } = req.body;
    if (!team_name) {
      return res.status(400).json({ error: '팀 이름이 필요합니다.' });
    }
    const newTeam: Team = {
      id: `team_${Date.now()}`,
      company_id: req.companyId!,
      team_code: team_code || `TEAM_${Date.now().toString().slice(-4)}`,
      team_name,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.teams.push(newTeam);

    db.addAuditLog({
      company_id: req.companyId!,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'CREATE',
      entity_type: 'TEAM',
      entity_id: newTeam.id,
      after_data: newTeam,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.status(201).json({ team: newTeam });
  });

  // Delete Team
  app.delete('/api/v1/teams/:id', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const roleId = req.userRole?.role_id;
    if (!req.isSuperAdmin && roleId !== 'ORG_ADMIN' && roleId !== 'SUPER_ADMIN' && roleId !== 'ADMIN') {
      return res.status(403).json({ error: '팀(부서) 삭제 권한이 없습니다.' });
    }

    const teamId = req.params.id;
    const teamIdx = db.teams.findIndex((t) => t.id === teamId && t.company_id === req.companyId);
    if (teamIdx === -1) {
      return res.status(404).json({ error: '삭제할 팀을 찾을 수 없습니다.' });
    }

    const deletedTeam = db.teams[teamIdx];
    db.teams.splice(teamIdx, 1);

    // Clean up team references in transactions & budgets
    db.transactions.forEach((tx) => {
      if (tx.company_id === req.companyId && tx.team_id === teamId) {
        tx.team_id = '';
      }
    });
    db.budgets = db.budgets.filter((b) => !(b.company_id === req.companyId && b.team_id === teamId));
    db.userTeamRoles = db.userTeamRoles.filter((utr) => !(utr.company_id === req.companyId && utr.team_id === teamId));

    db.addAuditLog({
      company_id: req.companyId!,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'DELETE',
      entity_type: 'TEAM',
      entity_id: teamId,
      before_data: deletedTeam,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: `[${deletedTeam.team_name}] 팀(부서)이 삭제되었습니다.`,
      deleted_id: teamId,
    });
  });

  // Accounts with Company Active Status (Method B)
  // 이 회사가 볼 수 있는 계정과목 = 공통 계정과목 + 이 회사가 직접 추가한 계정과목
  const getVisibleAccounts = (companyId: string) =>
    db.accounts.filter((acc) => !acc.company_id || acc.company_id === companyId);

  const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
  type AccountTypeCode = (typeof ACCOUNT_TYPES)[number];
  const defaultAccountCategory = (type: string) =>
    type === 'EXPENSE' ? '판관비' : type === 'REVENUE' ? '사업수익' : '일반';

  const canManageAccounts = (req: TenantRequest) =>
    !!req.isSuperAdmin || ['ORG_ADMIN', 'ADMIN', 'HQ_ACCOUNTANT'].includes(req.userRole?.role_id || '');

  app.get('/api/v1/accounts', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const companyId = req.companyId!;
    const activeMap = new Map(
      db.companyAccounts
        .filter((ca) => ca.company_id === companyId)
        .map((ca) => [ca.account_id, ca.is_active])
    );

    const result = getVisibleAccounts(companyId).map((acc) => ({
      ...acc,
      is_active: activeMap.has(acc.id) ? !!activeMap.get(acc.id) : true,
    }));

    res.json({ accounts: result });
  });

  // Create new Account Code
  app.post('/api/v1/accounts', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const roleId = req.userRole?.role_id;
    if (
      !req.isSuperAdmin &&
      roleId !== 'ORG_ADMIN' &&
      roleId !== 'SUPER_ADMIN' &&
      roleId !== 'HQ_ACCOUNTANT' &&
      roleId !== 'ADMIN'
    ) {
      return res.status(403).json({ error: '계정과목 생성 권한이 없습니다.' });
    }

    const { account_code, account_name, account_type, category, description, is_active } = req.body;
    if (!account_code || !account_name || !account_type) {
      return res.status(400).json({ error: '계정코드, 계정과목명, 분류(Type)는 필수 항목입니다.' });
    }

    if (!ACCOUNT_TYPES.includes(account_type)) {
      return res.status(400).json({ error: '분류(Type)는 자산·부채·자본·수익·비용 중 하나여야 합니다.' });
    }
    const cleanCode = String(account_code).trim();
    if (getVisibleAccounts(req.companyId!).some((a) => a.account_code === cleanCode)) {
      return res.status(400).json({ error: `계정코드 [${cleanCode}]는 이미 등록되어 있습니다.` });
    }

    const newAccount: Account = {
      id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      account_code: cleanCode,
      account_name: String(account_name).trim(),
      account_type,
      category: category || (account_type === 'EXPENSE' ? '판관비' : account_type === 'REVENUE' ? '사업수익' : '일반'),
      description: description || '',
      is_system: false,
      company_id: req.companyId!,
      created_at: new Date().toISOString(),
    };

    db.accounts.push(newAccount);

    // Initialize for current company
    db.companyAccounts.push({
      id: `ca_${req.companyId}_${newAccount.id}`,
      company_id: req.companyId!,
      account_id: newAccount.id,
      is_active: is_active !== false,
      created_at: new Date().toISOString(),
    });

    db.addAuditLog({
      company_id: req.companyId!,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'CREATE',
      entity_type: 'ACCOUNT',
      entity_id: newAccount.id,
      after_data: newAccount,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.status(201).json({
      account: {
        ...newAccount,
        is_active: is_active !== false,
      },
    });
  });

  // Batch Create Account Codes (엑셀 일괄 업로드)
  // 새 계정코드만 이 회사의 계정과목으로 등록한다. 이미 있는 코드(공통 또는 이 회사 과목)는 손대지 않고 건너뛴다.
  app.post('/api/v1/accounts/batch', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    if (!canManageAccounts(req)) {
      return res.status(403).json({ error: '계정과목 생성 권한이 없습니다.' });
    }

    const { accounts } = req.body || {};
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ error: '등록할 계정과목 목록(accounts 배열)이 필요합니다.' });
    }
    if (accounts.length > 2000) {
      return res.status(400).json({ error: '한 번에 등록할 수 있는 계정과목은 최대 2,000건입니다.' });
    }

    const companyId = req.companyId!;
    const now = nowIso();
    const knownCodes = new Set(getVisibleAccounts(companyId).map((a) => a.account_code));
    const createdList: (Account & { is_active: boolean })[] = [];
    const skipped: { account_code: string; reason: string }[] = [];

    for (const item of accounts) {
      const code = String(item?.account_code ?? '').trim();
      const name = String(item?.account_name ?? '').trim();
      const type = String(item?.account_type ?? '').trim().toUpperCase() as AccountTypeCode;

      if (!code || !name) {
        skipped.push({ account_code: code, reason: '계정코드 또는 과목명 누락' });
        continue;
      }
      if (!ACCOUNT_TYPES.includes(type)) {
        skipped.push({ account_code: code, reason: '과목구분 오류' });
        continue;
      }
      if (knownCodes.has(code)) {
        skipped.push({ account_code: code, reason: '이미 등록된 계정코드' });
        continue;
      }
      knownCodes.add(code);

      const isActive = item.is_active !== false;
      const newAccount: Account = {
        id: `acc_${Date.now()}_${randomSuffix()}`,
        account_code: code,
        account_name: name,
        account_type: type,
        category: String(item.category ?? '').trim() || defaultAccountCategory(type),
        description: String(item.description ?? '').trim(),
        is_system: false,
        company_id: companyId,
        created_at: now,
      };
      db.accounts.push(newAccount);
      db.companyAccounts.push({
        id: `ca_${companyId}_${newAccount.id}`,
        company_id: companyId,
        account_id: newAccount.id,
        is_active: isActive,
        created_at: now,
      });
      createdList.push({ ...newAccount, is_active: isActive });
    }

    if (createdList.length > 0) {
      db.addAuditLog({
        company_id: companyId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: 'CREATE',
        entity_type: 'ACCOUNT',
        entity_id: 'batch',
        after_data: {
          count: createdList.length,
          skipped: skipped.length,
          account_codes: createdList.map((a) => a.account_code),
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      });
    }

    res.status(201).json({
      success: true,
      created_count: createdList.length,
      skipped_count: skipped.length,
      skipped,
      accounts: createdList,
    });
  });

  // Delete Account Code
  app.delete('/api/v1/accounts/:id', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const roleId = req.userRole?.role_id;
    if (
      !req.isSuperAdmin &&
      roleId !== 'ORG_ADMIN' &&
      roleId !== 'SUPER_ADMIN' &&
      roleId !== 'HQ_ACCOUNTANT' &&
      roleId !== 'ADMIN'
    ) {
      return res.status(403).json({ error: '계정과목 삭제 권한이 없습니다.' });
    }

    const accountId = req.params.id;
    // 다른 회사가 추가한 계정과목은 존재 자체를 알려 주지 않는다
    const accIdx = db.accounts.findIndex(
      (a) => a.id === accountId && (req.isSuperAdmin || !a.company_id || a.company_id === req.companyId)
    );
    if (accIdx === -1) {
      return res.status(404).json({ error: '삭제할 계정과목을 찾을 수 없습니다.' });
    }

    const targetAccount = db.accounts[accIdx];

    // 공통 계정과목은 모든 회사가 함께 쓰므로 최고관리자만 삭제할 수 있다
    if (!targetAccount.company_id && !req.isSuperAdmin) {
      return res.status(403).json({
        error: `[${targetAccount.account_code} ${targetAccount.account_name}]은(는) 모든 회사가 함께 쓰는 공통 계정과목이라 삭제할 수 없습니다. 쓰지 않으려면 [사용 여부]를 OFF로 변경해 주세요.`,
      });
    }

    // Check if account is used in transactions
    const usedCount = db.transactions.filter((t) => t.account_id === accountId).length;
    if (usedCount > 0) {
      return res.status(400).json({
        error: `계정과목 [${targetAccount.account_code} ${targetAccount.account_name}]은 이미 ${usedCount}건의 전표에서 사용 중이므로 삭제할 수 없습니다. 대신 [사용 여부]를 OFF로 변경해 주세요.`,
      });
    }

    db.accounts.splice(accIdx, 1);
    db.companyAccounts = db.companyAccounts.filter((ca) => ca.account_id !== accountId);

    db.addAuditLog({
      company_id: req.companyId!,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'DELETE',
      entity_type: 'ACCOUNT',
      entity_id: accountId,
      before_data: targetAccount,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: `[${targetAccount.account_code} ${targetAccount.account_name}] 계정과목이 삭제되었습니다.`,
      deleted_id: accountId,
    });
  });

  // Toggle Account Active Status for Current Company
  app.put('/api/v1/company-accounts/:accountId/toggle', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const companyId = req.companyId!;
    const accountId = req.params.accountId;
    if (!getVisibleAccounts(companyId).some((a) => a.id === accountId)) {
      return res.status(404).json({ error: '계정과목을 찾을 수 없습니다.' });
    }
    let entry = db.companyAccounts.find((ca) => ca.company_id === companyId && ca.account_id === accountId);
    if (!entry) {
      entry = {
        id: `ca_${companyId}_${accountId}`,
        company_id: companyId,
        account_id: accountId,
        is_active: false,
        created_at: new Date().toISOString(),
      };
      db.companyAccounts.push(entry);
    } else {
      entry.is_active = !entry.is_active;
    }
    res.json({ success: true, account_id: accountId, is_active: entry.is_active });
  });

  // Bank Accounts for Current Company
  app.get('/api/v1/bank-accounts', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const bankAccounts = db.bankAccounts.filter((ba) => ba.company_id === req.companyId);
    res.json({ bank_accounts: bankAccounts });
  });

  app.post('/api/v1/bank-accounts', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const { bank_name, account_number, account_name, initial_balance, notes, account_type } = req.body;
    if (!bank_name || !account_number) {
      return res.status(400).json({ error: '은행명과 계좌번호는 필수입니다.' });
    }
    const newBank: BankAccount = {
      id: `bank_${Date.now()}`,
      company_id: req.companyId!,
      bank_name,
      account_number,
      account_name: account_name || `${bank_name} 보통예금`,
      account_type: account_type || 'CHECKING',
      current_balance: Number(initial_balance) || 0,
      is_main: false,
      is_active: true,
      notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.bankAccounts.push(newBank);
    res.status(201).json({ bank_account: newBank });
  });

  // Vendors for Current Company
  app.get('/api/v1/vendors', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const vendors = db.vendors.filter((v) => v.company_id === req.companyId);
    res.json({ vendors });
  });

  app.post('/api/v1/vendors', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const { vendor_name, business_number, representative_name, representative, phone, email, address, category } =
      req.body;
    if (!vendor_name) {
      return res.status(400).json({ error: '거래처명을 입력해주세요.' });
    }
    const newVendor: Vendor = {
      id: `ven_${Date.now()}`,
      company_id: req.companyId!,
      vendor_code: `V-${Date.now().toString().slice(-4)}`,
      vendor_name,
      business_number: business_number || '000-00-00000',
      representative_name: representative_name || representative || '',
      phone: phone || '',
      email: email || '',
      address: address || '',
      vendor_type: 'SUPPLIER',
      is_active: true,
      category: category || '일반거래처',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.vendors.push(newVendor);
    res.status(201).json({ vendor: newVendor });
  });

  // Budgets for Current Company (실시간 지출액 차감 계산)
  app.get('/api/v1/budgets', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const year = Number(req.query.year) || 2026;
    const companyBudgets = db.budgets.filter((b) => b.company_id === req.companyId && b.fiscal_year === year);

    // Calculate actual spent amount from transactions
    const enriched = companyBudgets.map((b) => {
      const spent = db.transactions
        .filter(
          (t) =>
            t.company_id === req.companyId &&
            t.team_id === b.team_id &&
            t.account_id === b.account_id &&
            t.transaction_type === 'EXPENSE' &&
            t.status !== 'CANCELLED'
        )
        .reduce((sum, t) => sum + t.total_amount, 0);

      const team = db.teams.find((t) => t.id === b.team_id);
      const account = db.accounts.find((a) => a.id === b.account_id);

      return {
        ...b,
        team_name: team?.team_name || '미지정',
        account_name: account?.account_name || '미지정',
        spent_amount: spent,
        executed_amount: spent,
        remaining_amount: b.budget_amount - spent,
        execution_rate: b.budget_amount > 0 ? Math.round((spent / b.budget_amount) * 100) : 0,
      };
    });

    res.json({ budgets: enriched });
  });

  app.post('/api/v1/budgets', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const { team_id, account_id, budget_amount, description, fiscal_year = 2026 } = req.body;
    if (!team_id || !account_id || budget_amount === undefined) {
      return res.status(400).json({ error: '팀, 계정과목, 예산 금액을 입력해주세요.' });
    }

    const newBudget: Budget = {
      id: `b_${Date.now()}`,
      company_id: req.companyId!,
      team_id,
      account_id,
      fiscal_year: Number(fiscal_year),
      budget_amount: Number(budget_amount),
      description,
      created_by: req.user!.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.budgets.push(newBudget);
    res.status(201).json({ budget: newBudget });
  });

  // 14. Transactions Strictly Isolated by company_id
  app.get('/api/v1/transactions', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const companyId = req.companyId!;
    let list = db.transactions.filter((t) => t.company_id === companyId);

    // Attach attachments
    list = list.map((t) => ({
      ...t,
      attachments: db.transactionAttachments.filter((att) => att.transaction_id === t.id),
    }));

    // Team constraint if TEAM_ACCOUNTANT
    if (req.userRole?.role_id === 'TEAM_ACCOUNTANT') {
      const userTeam = db.userTeamRoles.find((utr) => utr.user_id === req.user?.id);
      if (userTeam) {
        list = list.filter((t) => t.team_id === userTeam.team_id);
      }
    }

    // Filters
    const { team_id, transaction_type, account_id, status, keyword, start_date, end_date } = req.query;
    if (team_id) list = list.filter((t) => t.team_id === team_id);
    if (transaction_type) list = list.filter((t) => t.transaction_type === transaction_type);
    if (account_id) list = list.filter((t) => t.account_id === account_id);
    if (status) list = list.filter((t) => t.status === status);
    if (start_date) list = list.filter((t) => t.transaction_date >= (start_date as string));
    if (end_date) list = list.filter((t) => t.transaction_date <= (end_date as string));
    if (keyword) {
      const q = (keyword as string).toLowerCase();
      list = list.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          (t.memo && t.memo.toLowerCase().includes(q)) ||
          t.id.toLowerCase().includes(q)
      );
    }

    // Sort descending by date
    list.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

    // Summary calculation
    const total_income = list
      .filter((t) => t.transaction_type === 'INCOME' && t.status !== 'CANCELLED')
      .reduce((sum, t) => sum + t.total_amount, 0);
    const total_expense = list
      .filter((t) => t.transaction_type === 'EXPENSE' && t.status !== 'CANCELLED')
      .reduce((sum, t) => sum + t.total_amount, 0);
    const net_balance = total_income - total_expense;

    res.json({
      company_id: companyId,
      total_count: list.length,
      summary: {
        total_income,
        total_expense,
        net_balance,
      },
      transactions: list,
    });
  });

  // Create Transaction (Mandatory Server Validation: supply_amount + vat_amount = total_amount, CLOSED fiscal_period check)
  app.post('/api/v1/transactions', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    if (req.userRole?.role_id === 'VIEWER') {
      return res.status(403).json({ error: '조회자(VIEWER) 권한은 거래 전표를 등록할 수 없습니다.' });
    }

    const {
      team_id,
      transaction_date,
      transaction_type,
      account_id,
      payment_method,
      bank_account_id,
      vendor_id,
      vat_type = 'TAXABLE',
      supply_amount,
      vat_amount,
      total_amount,
      description,
      memo,
    } = req.body;

    if (!transaction_date || !transaction_type || !account_id || !description) {
      return res.status(400).json({ error: '필수 항목(일자, 구분, 계정과목, 적요)을 입력해주세요.' });
    }

    // Check Fiscal Period status (CLOSED block)
    const txDate = new Date(transaction_date);
    const year = txDate.getFullYear();
    const month = txDate.getMonth() + 1;
    const closedPeriod = db.fiscalPeriods.find(
      (fp) => fp.company_id === req.companyId && fp.year === year && fp.month === month && fp.status === 'CLOSED'
    );
    if (closedPeriod) {
      return res.status(400).json({
        error: `${year}년 ${month}월은 회계기간이 마감(CLOSED)되어 신규 전표를 등록할 수 없습니다.`,
      });
    }

    // Find or assign fiscal period ID
    let activePeriod = db.fiscalPeriods.find(
      (fp) => fp.company_id === req.companyId && fp.year === year && fp.month === month
    );
    if (!activePeriod) {
      activePeriod = {
        id: `fp_${req.companyId}_${year}_${String(month).padStart(2, '0')}`,
        company_id: req.companyId!,
        year,
        month,
        status: 'OPEN',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.fiscalPeriods.push(activePeriod);
    }

    // Strict validation: supply_amount + vat_amount === total_amount
    const sup = Math.round(Number(supply_amount) || 0);
    const vat = vat_type === 'TAXABLE' ? (vat_amount !== undefined ? Math.round(Number(vat_amount)) : Math.round(sup * 0.1)) : 0;
    const tot = total_amount !== undefined ? Math.round(Number(total_amount)) : sup + vat;

    if (sup + vat !== tot) {
      return res.status(400).json({
        error: `금액 검증 실패: 공급가액(${sup.toLocaleString()}원) + 부가세(${vat.toLocaleString()}원) = ${(sup + vat).toLocaleString()}원이어야 하나, 총금액이 ${tot.toLocaleString()}원으로 입력되었습니다.`,
      });
    }

    const newTx: Transaction = {
      id: `tx_${req.companyId?.replace('comp_', '')}_${Date.now().toString().slice(-6)}`,
      company_id: req.companyId!, // ★ CORE MULTI-TENANT KEY
      team_id: team_id || (db.teams.find((t) => t.company_id === req.companyId)?.id || ''),
      fiscal_period_id: activePeriod.id,
      transaction_date,
      transaction_type,
      account_id,
      payment_method: payment_method || 'BANK_TRANSFER',
      bank_account_id,
      vendor_id,
      vat_type,
      supply_amount: sup,
      vat_amount: vat,
      total_amount: tot,
      description,
      memo,
      status: 'CONFIRMED',
      created_by: req.user!.name,
      confirmed_by: req.user!.name,
      confirmed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.transactions.push(newTx);

    // Update bank account balance if connected
    if (bank_account_id) {
      const bank = db.bankAccounts.find((b) => b.id === bank_account_id);
      if (bank) {
        if (transaction_type === 'INCOME') bank.current_balance += tot;
        else if (transaction_type === 'EXPENSE') bank.current_balance -= tot;
      }
    }

    // Audit Log
    db.addAuditLog({
      company_id: req.companyId!,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'CREATE',
      entity_type: 'TRANSACTION',
      entity_id: newTx.id,
      after_data: newTx,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.status(201).json({ transaction: newTx });
  });

  // Delete Transaction
  app.delete('/api/v1/transactions/:id', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    if (req.userRole?.role_id === 'VIEWER') {
      return res.status(403).json({ error: '조회자 권한은 삭제할 수 없습니다.' });
    }
    const idx = db.transactions.findIndex((t) => t.id === req.params.id && t.company_id === req.companyId);
    if (idx === -1) {
      return res.status(404).json({ error: '전표를 찾을 수 없습니다.' });
    }
    const deleted = db.transactions[idx];

    // Check fiscal period closed
    if (deleted.fiscal_period_id) {
      const fp = db.fiscalPeriods.find((p) => p.id === deleted.fiscal_period_id);
      if (fp && fp.status === 'CLOSED') {
        return res.status(400).json({ error: '마감된 회계기간의 전표는 삭제할 수 없습니다.' });
      }
    }

    db.transactions.splice(idx, 1);

    // Revert bank balance
    if (deleted.bank_account_id) {
      const bank = db.bankAccounts.find((b) => b.id === deleted.bank_account_id);
      if (bank) {
        if (deleted.transaction_type === 'INCOME') bank.current_balance -= deleted.total_amount;
        else if (deleted.transaction_type === 'EXPENSE') bank.current_balance += deleted.total_amount;
      }
    }

    // Audit Log
    db.addAuditLog({
      company_id: req.companyId!,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'DELETE',
      entity_type: 'TRANSACTION',
      entity_id: deleted.id,
      before_data: deleted,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({ success: true, deleted_id: deleted.id });
  });

  // 15. Attachments API (증빙 파일)
  app.get('/api/v1/transactions/:id/attachments', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const atts = db.transactionAttachments.filter(
      (a) => a.transaction_id === req.params.id && a.company_id === req.companyId
    );
    res.json({ attachments: atts });
  });

  app.post('/api/v1/transactions/:id/attachments', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const { file_name, file_type, file_size, file_path } = req.body;
    const tx = db.transactions.find((t) => t.id === req.params.id && t.company_id === req.companyId);
    if (!tx) {
      return res.status(404).json({ error: '전표를 찾을 수 없습니다.' });
    }

    const newAtt: TransactionAttachment = {
      id: `att_${Date.now()}`,
      company_id: req.companyId!,
      transaction_id: tx.id,
      file_name: file_name || '영수증_증빙.pdf',
      file_path: file_path || `https://storage.supabase.co/v0/b/accounting/o/${req.companyId}/${file_name}`,
      file_type: file_type || 'application/pdf',
      file_size: file_size || 128000,
      uploaded_by: req.user!.name,
      created_at: new Date().toISOString(),
    };
    db.transactionAttachments.push(newAtt);
    res.status(201).json({ attachment: newAtt });
  });

  // 18. 은행 Excel 가져오기 2단계 파이프라인
  // 1단계: 업로드 및 임시 데이터 생성 + 중복 검사 (row_hash & external_transaction_id)
  app.post('/api/v1/bank-imports/upload', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const { bank_account_id, file_name, rows } = req.body;
    if (!bank_account_id) {
      return res.status(400).json({ error: '가져올 은행 계좌를 선택해주세요.' });
    }

    const bank = db.bankAccounts.find((b) => b.id === bank_account_id && b.company_id === req.companyId);
    if (!bank) {
      return res.status(404).json({ error: '은행 계좌를 찾을 수 없습니다.' });
    }

    const importId = `bi_${Date.now()}`;
    const rawRows = Array.isArray(rows) && rows.length > 0 ? rows : [
      { date: '2026-09-22', desc: '하나로마트 사무용품 구매', inAmt: 0, outAmt: 45000, counterparty: '하나로마트' },
      { date: '2026-09-22', desc: '개인 지정후원금 입금', inAmt: 200000, outAmt: 0, counterparty: '박서현' },
      { date: '2026-09-20', desc: '카카오페이 식대 지출', inAmt: 0, outAmt: 32000, counterparty: '카카오페이' },
    ];

    let successRows = 0;
    let duplicateRows = 0;
    const parsedRows: BankImportRow[] = [];

    rawRows.forEach((r: any, idx: number) => {
      const isIncome = Number(r.inAmt) > 0;
      const amount = isIncome ? Number(r.inAmt) : Number(r.outAmt);
      const date = r.date || new Date().toISOString().split('T')[0];
      const desc = r.desc || '';
      const counterparty = r.counterparty || '';
      const externalId = r.external_id || `BANK_${date.replace(/-/g, '')}_${idx + 1}`;

      // Calculate row hash for duplicate prevention: date + amount + type + desc + bank_account_id
      const hashInput = `${date}_${isIncome ? 'INCOME' : 'EXPENSE'}_${amount}_${desc}_${bank_account_id}`;
      const rowHash = crypto.createHash('md5').update(hashInput).digest('hex');

      // Check duplicate against existing transactions or existing bank_import_rows
      const isDupInTxs = db.transactions.some(
        (t) =>
          t.company_id === req.companyId &&
          t.bank_account_id === bank_account_id &&
          t.transaction_date === date &&
          t.total_amount === amount &&
          t.description === desc
      );

      const isDupInImport = db.bankImportRows.some(
        (bir) => bir.company_id === req.companyId && (bir.row_hash === rowHash || (bir.external_transaction_id && bir.external_transaction_id === externalId))
      );

      const isDuplicate = isDupInTxs || isDupInImport;
      if (isDuplicate) duplicateRows++;
      else successRows++;

      const importRow: BankImportRow = {
        id: `bir_${Date.now()}_${idx}`,
        bank_import_id: importId,
        company_id: req.companyId!,
        transaction_date: date,
        transaction_type: isIncome ? 'INCOME' : 'EXPENSE',
        amount,
        balance: bank.current_balance,
        description: desc,
        counterparty,
        external_transaction_id: externalId,
        row_hash: rowHash,
        status: isDuplicate ? 'DUPLICATE' : 'PENDING',
        error_message: isDuplicate ? '이미 장부에 등록되었거나 중복된 거래내역입니다.' : undefined,
        created_at: new Date().toISOString(),
      };

      db.bankImportRows.push(importRow);
      parsedRows.push(importRow);
    });

    const bankImportSession: BankImport = {
      id: importId,
      company_id: req.companyId!,
      bank_account_id,
      file_name: file_name || '거래내역_업로드.xlsx',
      import_date: new Date().toISOString(),
      total_rows: rawRows.length,
      success_rows: successRows,
      duplicate_rows: duplicateRows,
      error_rows: 0,
      status: 'PENDING',
      created_by: req.user!.name,
      created_at: new Date().toISOString(),
    };

    db.bankImports.push(bankImportSession);

    res.json({
      success: true,
      bank_import: bankImportSession,
      rows: parsedRows,
    });
  });

  // 2단계: 사용자 확인 후 PENDING 행을 정식 transactions 전표로 일괄 변환
  app.post('/api/v1/bank-imports/:importId/confirm', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const importSession = db.bankImports.find((bi) => bi.id === req.params.importId && bi.company_id === req.companyId);
    if (!importSession) {
      return res.status(404).json({ error: '은행 가져오기 세션을 찾을 수 없습니다.' });
    }

    const pendingRows = db.bankImportRows.filter(
      (r) => r.bank_import_id === importSession.id && r.status === 'PENDING'
    );

    if (pendingRows.length === 0) {
      return res.status(400).json({ error: '등록할 대기 거래 건이 없습니다.' });
    }

    const defaultTeam = db.teams.find((t) => t.company_id === req.companyId);
    const visibleAccounts = getVisibleAccounts(req.companyId!);
    const defaultExpenseAcc = visibleAccounts.find((a) => a.account_code === '5250') || visibleAccounts.find((a) => a.account_type === 'EXPENSE')!;
    const defaultIncomeAcc = visibleAccounts.find((a) => a.account_code === '4200') || visibleAccounts.find((a) => a.account_type === 'REVENUE')!;
    const bank = db.bankAccounts.find((b) => b.id === importSession.bank_account_id);

    const generatedTxs: Transaction[] = [];

    pendingRows.forEach((row) => {
      const isIncome = row.transaction_type === 'INCOME';
      const sup = isIncome ? row.amount : Math.round(row.amount / 1.1);
      const vat = isIncome ? 0 : row.amount - sup;

      const tx: Transaction = {
        id: `tx_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        company_id: req.companyId!,
        team_id: defaultTeam?.id || '',
        transaction_date: row.transaction_date,
        transaction_type: row.transaction_type,
        account_id: isIncome ? defaultIncomeAcc.id : defaultExpenseAcc.id,
        payment_method: 'BANK_TRANSFER',
        bank_account_id: importSession.bank_account_id,
        vat_type: isIncome ? 'TAX_EXEMPT' : 'TAXABLE',
        supply_amount: sup,
        vat_amount: vat,
        total_amount: row.amount,
        description: row.description,
        memo: `[은행 Excel 가져오기] 상대: ${row.counterparty || '미기재'}, 고유키: ${row.external_transaction_id}`,
        status: 'CONFIRMED',
        created_by: req.user!.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      db.transactions.push(tx);
      generatedTxs.push(tx);

      // Link transaction to row & mark CONFIRMED
      row.status = 'CONFIRMED';
      row.transaction_id = tx.id;

      // Update bank account balance
      if (bank) {
        if (isIncome) bank.current_balance += row.amount;
        else bank.current_balance -= row.amount;
      }
    });

    importSession.status = 'PROCESSED';

    // Audit Log
    db.addAuditLog({
      company_id: req.companyId!,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'IMPORT',
      entity_type: 'TRANSACTION',
      entity_id: importSession.id,
      after_data: { imported_count: generatedTxs.length, bank_account_id: importSession.bank_account_id },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: `${generatedTxs.length}건의 은행 거래가 전표로 일괄 등록되었습니다.`,
      transactions: generatedTxs,
    });
  });

  // 20. 감사 로그 audit_logs 조회
  app.get('/api/v1/audit-logs', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const logs = db.auditLogs.filter((l) => l.company_id === req.companyId).slice(0, 100);
    res.json({ audit_logs: logs });
  });

  // 24. 동적 보고서 API (비저장 모델: transactions로부터 실시간 계산)
  app.get('/api/v1/reports/summary', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const companyId = req.companyId!;
    const year = Number(req.query.year) || 2026;
    const month = req.query.month ? Number(req.query.month) : undefined;
    const quarter = req.query.quarter ? Number(req.query.quarter) : undefined;

    let txs = db.transactions.filter((t) => t.company_id === companyId && t.status !== 'CANCELLED');

    if (month) {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      txs = txs.filter((t) => t.transaction_date.startsWith(monthStr));
    } else if (quarter) {
      const qMonths =
        quarter === 1 ? ['01', '02', '03'] : quarter === 2 ? ['04', '05', '06'] : quarter === 3 ? ['07', '08', '09'] : ['10', '11', '12'];
      txs = txs.filter((t) => {
        const ym = t.transaction_date.slice(0, 7);
        return qMonths.some((m) => ym === `${year}-${m}`);
      });
    } else {
      txs = txs.filter((t) => t.transaction_date.startsWith(String(year)));
    }

    const total_income = txs
      .filter((t) => t.transaction_type === 'INCOME')
      .reduce((sum, t) => sum + t.total_amount, 0);
    const total_expense = txs
      .filter((t) => t.transaction_type === 'EXPENSE')
      .reduce((sum, t) => sum + t.total_amount, 0);

    const taxable_amount = txs
      .filter((t) => t.vat_type === 'TAXABLE')
      .reduce((sum, t) => sum + t.supply_amount, 0);
    const tax_free_amount = txs
      .filter((t) => t.vat_type === 'TAX_EXEMPT')
      .reduce((sum, t) => sum + t.supply_amount, 0);

    // Group by Account
    const accMap = new Map(db.accounts.map((a) => [a.id, a]));
    const incomeAccs: Record<string, { account_id: string; account_name: string; category: string; amount: number }> = {};
    const expenseAccs: Record<string, { account_id: string; account_name: string; category: string; amount: number }> = {};

    txs.forEach((t) => {
      const acc = accMap.get(t.account_id);
      const accName = acc?.account_name || '미분류';
      const cat = acc?.category || '일반';

      if (t.transaction_type === 'INCOME') {
        if (!incomeAccs[t.account_id]) incomeAccs[t.account_id] = { account_id: t.account_id, account_name: accName, category: cat, amount: 0 };
        incomeAccs[t.account_id].amount += t.total_amount;
      } else if (t.transaction_type === 'EXPENSE') {
        if (!expenseAccs[t.account_id]) expenseAccs[t.account_id] = { account_id: t.account_id, account_name: accName, category: cat, amount: 0 };
        expenseAccs[t.account_id].amount += t.total_amount;
      }
    });

    // Team Summary
    const teams = db.teams.filter((t) => t.company_id === companyId);
    const team_summary = teams.map((team) => {
      const tTxs = txs.filter((t) => t.team_id === team.id);
      const inc = tTxs.filter((t) => t.transaction_type === 'INCOME').reduce((s, t) => s + t.total_amount, 0);
      const exp = tTxs.filter((t) => t.transaction_type === 'EXPENSE').reduce((s, t) => s + t.total_amount, 0);
      return {
        team_id: team.id,
        team_name: team.team_name,
        income: inc,
        expense: exp,
        net: inc - exp,
      };
    });

    res.json({
      period_type: month ? 'MONTHLY' : quarter ? 'QUARTERLY' : 'ANNUAL',
      year,
      month,
      quarter,
      total_income,
      total_expense,
      net_income: total_income - total_expense,
      taxable_amount,
      tax_free_amount,
      income_by_category: Object.values(incomeAccs),
      expense_by_category: Object.values(expenseAccs),
      team_summary,
    });
  });

  // 총계정원장 (General Ledger) 실시간 산출
  app.get('/api/v1/reports/ledger', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const companyId = req.companyId!;
    const { account_id, year = '2026' } = req.query;

    let txs = db.transactions.filter(
      (t) => t.company_id === companyId && t.transaction_date.startsWith(year as string) && t.status !== 'CANCELLED'
    );
    if (account_id) {
      txs = txs.filter((t) => t.account_id === account_id);
    }
    txs.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

    res.json({
      year,
      account_id,
      entries: txs.map((t) => {
        const acc = db.accounts.find((a) => a.id === t.account_id);
        const team = db.teams.find((tm) => tm.id === t.team_id);
        return {
          id: t.id,
          date: t.transaction_date,
          account_name: acc?.account_name,
          team_name: team?.team_name,
          description: t.description,
          debit: t.transaction_type === 'EXPENSE' ? t.total_amount : 0,
          credit: t.transaction_type === 'INCOME' ? t.total_amount : 0,
        };
      }),
    });
  });

  // Roles & Permissions Reference API
  app.get('/api/v1/roles', (req, res) => {
    res.json({
      roles: db.roles,
      permissions: db.permissions,
      role_permissions: db.rolePermissions,
    });
  });

  // Admin: User-Company Roles Management
  app.get('/api/v1/admin/users-and-roles', (req: TenantRequest, res: Response) => {
    if (req.isSuperAdmin) {
      return res.json({
        users: db.users,
        roles: db.userCompanyRoles,
        companies: db.companies,
        all_roles: db.roles,
        team_roles: db.userTeamRoles,
      });
    }

    // 일반 사용자는 자기가 속한 회사의 사용자·권한만 볼 수 있다 (다른 회사 정보 차단)
    const myCompanyIds = getMemberCompanyIds(req.user!.id);
    const roles = db.userCompanyRoles.filter((r) => myCompanyIds.has(r.company_id));
    const teamRoles = db.userTeamRoles.filter((tr) =>
      db.teams.some((t) => t.id === tr.team_id && myCompanyIds.has(t.company_id))
    );
    const visibleUserIds = new Set<string>([req.user!.id, ...roles.map((r) => r.user_id), ...teamRoles.map((tr) => tr.user_id)]);
    res.json({
      users: db.users.filter((u) => visibleUserIds.has(u.id)),
      roles,
      companies: db.companies.filter((c) => myCompanyIds.has(c.id)),
      all_roles: db.roles.filter((r) => r.role_code !== 'SUPER_ADMIN'),
      team_roles: teamRoles,
    });
  });

  app.post('/api/v1/admin/user-company-roles', (req: TenantRequest, res: Response) => {
    const { user_id, company_id, role_id } = req.body;
    if (!user_id || !company_id || !role_id) {
      return res.status(400).json({ error: 'user_id, company_id, role_id는 필수입니다.' });
    }

    if (!isCompanyAdmin(req) || (!req.isSuperAdmin && company_id !== req.companyId)) {
      return res.status(403).json({ error: '사용자 역할 및 권한 배정 권한이 없습니다.' });
    }
    if (!db.companies.some((c) => c.id === company_id) || !db.users.some((u) => u.id === user_id)) {
      return res.status(404).json({ error: '회사 또는 사용자를 찾을 수 없습니다.' });
    }
    if (role_id === 'SUPER_ADMIN' || !db.roles.some((r) => r.role_code === role_id)) {
      return res.status(400).json({ error: '배정할 수 없는 역할입니다.' });
    }
    if (!req.isSuperAdmin) {
      // 대표 관리자는 이미 회사에 소속(또는 가입 신청)된 사용자의 역할만 바꿀 수 있다
      if (!db.userCompanyRoles.some((r) => r.user_id === user_id && r.company_id === company_id)) {
        return res.status(403).json({ error: '이 회사에 소속되거나 가입 신청한 사용자만 권한을 배정할 수 있습니다.' });
      }
      // 라이선스를 가진 대표 관리자의 역할은 내릴 수 없다
      if (getCompanyLicense(company_id)?.user_id === user_id && role_id !== 'ORG_ADMIN') {
        return res.status(403).json({ error: '라이선스 대표 관리자의 역할은 변경할 수 없습니다.' });
      }
    }

    const existingIdx = db.userCompanyRoles.findIndex(
      (r) => r.user_id === user_id && r.company_id === company_id
    );

    if (existingIdx !== -1) {
      const beforeRole = db.userCompanyRoles[existingIdx].role_id;
      db.userCompanyRoles[existingIdx].role_id = role_id;
      db.userCompanyRoles[existingIdx].status = 'ACTIVE';
      db.userCompanyRoles[existingIdx].updated_at = new Date().toISOString();

      db.addAuditLog({
        company_id,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: 'UPDATE',
        entity_type: 'USER_ROLE',
        entity_id: user_id,
        before_data: { role_id: beforeRole },
        after_data: { role_id },
      });

      return res.json({ role: db.userCompanyRoles[existingIdx] });
    }

    const newRole: UserCompanyRole = {
      id: `ucr_${Date.now()}`,
      user_id,
      company_id,
      role_id,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.userCompanyRoles.push(newRole);

    db.addAuditLog({
      company_id,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'CREATE',
      entity_type: 'USER_ROLE',
      entity_id: user_id,
      after_data: newRole,
    });

    res.status(201).json({ role: newRole });
  });

  // Admin: Update Custom Permissions for User-Company Role (A가 B에게 특정 메뉴 권한 허용/제한)
  app.put('/api/v1/admin/user-company-roles/:id/permissions', (req: TenantRequest, res: Response) => {
    if (!isCompanyAdmin(req)) {
      return res.status(403).json({ error: '개별 메뉴 권한 조정 권한이 없습니다.' });
    }

    const roleRecord = db.userCompanyRoles.find(
      (r) => r.id === req.params.id && (req.isSuperAdmin || r.company_id === req.companyId)
    );
    if (!roleRecord) {
      return res.status(404).json({ error: '해당 권한 레코드를 찾을 수 없습니다.' });
    }

    const { grant = [], revoke = [] } = req.body || {};
    roleRecord.custom_permissions = { grant, revoke };
    roleRecord.updated_at = new Date().toISOString();

    db.addAuditLog({
      company_id: roleRecord.company_id,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'UPDATE',
      entity_type: 'USER_ROLE',
      entity_id: roleRecord.user_id,
      after_data: { grant, revoke },
    });

    res.json({ success: true, role: roleRecord });
  });

  // Admin: Team Role Assignment
  app.post('/api/v1/admin/user-team-roles', (req: TenantRequest, res: Response) => {
    const { user_id, team_id, company_id, role_id } = req.body;
    if (!user_id || !team_id || !company_id || !role_id) {
      return res.status(400).json({ error: 'user_id, team_id, company_id, role_id가 필요합니다.' });
    }
    if (!isCompanyAdmin(req) || (!req.isSuperAdmin && company_id !== req.companyId)) {
      return res.status(403).json({ error: '팀 권한 배정 권한이 없습니다.' });
    }
    if (!db.teams.some((t) => t.id === team_id && t.company_id === company_id)) {
      return res.status(404).json({ error: '이 회사의 팀을 찾을 수 없습니다.' });
    }
    if (!req.isSuperAdmin && !getMemberCompanyIds(user_id).has(company_id)) {
      return res.status(403).json({ error: '이 회사에 소속된 사용자만 팀에 배정할 수 있습니다.' });
    }

    const newTeamRole = {
      id: `utr_${Date.now()}`,
      user_id,
      team_id,
      role_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.userTeamRoles.push(newTeamRole);

    res.status(201).json({ team_role: newTeamRole });
  });

  app.delete('/api/v1/admin/user-team-roles/:id', (req: TenantRequest, res: Response) => {
    if (!isCompanyAdmin(req)) {
      return res.status(403).json({ error: '팀 권한 제거 권한이 없습니다.' });
    }
    const idx = db.userTeamRoles.findIndex(
      (utr) =>
        utr.id === req.params.id &&
        (req.isSuperAdmin || db.teams.some((t) => t.id === utr.team_id && t.company_id === req.companyId))
    );
    if (idx !== -1) {
      db.userTeamRoles.splice(idx, 1);
    }
    res.json({ success: true });
  });

  // Admin: Get Join Requests
  app.get('/api/v1/admin/join-requests', (req: TenantRequest, res: Response) => {
    const compId = req.companyId;
    // 가입 신청은 그 회사의 대표 관리자(와 최고관리자)만 볼 수 있다
    const pendingRoles = isCompanyAdmin(req)
      ? db.userCompanyRoles.filter(
          (r) => r.status === 'PENDING' && (req.isSuperAdmin ? !compId || r.company_id === compId : r.company_id === compId)
        )
      : [];

    const requests = pendingRoles.map((r) => {
      const u = db.users.find((user) => user.id === r.user_id);
      const c = db.companies.find((comp) => comp.id === r.company_id);
      return {
        id: r.id,
        role_record_id: r.id,
        user_id: r.user_id,
        user_name: u?.name || '신청자',
        user_email: u?.email || '',
        company_id: r.company_id,
        company_name: c?.company_name || '소속 회사',
        company_code: c?.company_code || '',
        reason: (r as any).reason || '회사 소속 가입 및 업무 권한 요청',
        status: r.status,
        created_at: r.created_at,
        suggested_role: r.role_id || 'VIEWER',
      };
    });

    res.json({ requests });
  });

  // Admin: Approve Join Request & Assign Role
  app.post('/api/v1/admin/join-requests/:id/approve', (req: TenantRequest, res: Response) => {
    if (!isCompanyAdmin(req)) {
      return res.status(403).json({ error: '가입 승인 및 권한 부여 권한이 없습니다.' });
    }

    const { role_id = 'VIEWER' } = req.body || {};
    if (role_id === 'SUPER_ADMIN' || !db.roles.some((r) => r.role_code === role_id)) {
      return res.status(400).json({ error: '배정할 수 없는 역할입니다.' });
    }
    const reqRecord = db.userCompanyRoles.find(
      (r) => r.id === req.params.id && (req.isSuperAdmin || r.company_id === req.companyId)
    );
    if (!reqRecord) {
      return res.status(404).json({ error: '가입 신청 건을 찾을 수 없습니다.' });
    }

    reqRecord.status = 'ACTIVE';
    reqRecord.role_id = role_id;
    reqRecord.updated_at = new Date().toISOString();

    const targetUser = db.users.find((u) => u.id === reqRecord.user_id);
    if (targetUser && targetUser.status === 'PENDING') {
      targetUser.status = 'ACTIVE';
      targetUser.updated_at = new Date().toISOString();
    }

    db.addAuditLog({
      company_id: reqRecord.company_id,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'APPROVE',
      entity_type: 'USER_ROLE',
      entity_id: reqRecord.user_id,
      after_data: { role_id, status: 'ACTIVE', applicant: targetUser?.name },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: '가입 승인 및 권한 부여가 완료되었습니다.',
      role: reqRecord,
      user: targetUser,
    });
  });

  // Admin: Reject Join Request
  app.post('/api/v1/admin/join-requests/:id/reject', (req: TenantRequest, res: Response) => {
    if (!isCompanyAdmin(req)) {
      return res.status(403).json({ error: '가입 반려 권한이 없습니다.' });
    }

    const reqRecord = db.userCompanyRoles.find(
      (r) => r.id === req.params.id && (req.isSuperAdmin || r.company_id === req.companyId)
    );
    if (!reqRecord) {
      return res.status(404).json({ error: '가입 신청 건을 찾을 수 없습니다.' });
    }

    reqRecord.status = 'SUSPENDED';
    reqRecord.updated_at = new Date().toISOString();

    db.addAuditLog({
      company_id: reqRecord.company_id,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'SUSPEND',
      entity_type: 'USER_ROLE',
      entity_id: reqRecord.user_id,
      after_data: { status: 'SUSPENDED' },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({ success: true, message: '가입 신청이 반려되었습니다.' });
  });

  // Admin: Update User Status
  app.put('/api/v1/admin/users/:id/status', (req: TenantRequest, res: Response) => {
    if (!isCompanyAdmin(req)) {
      return res.status(403).json({ error: '사용자 상태 변경 권한이 없습니다.' });
    }

    const { status } = req.body || {};
    if (status !== 'ACTIVE' && status !== 'SUSPENDED' && status !== 'PENDING') {
      return res.status(400).json({ error: '올바르지 않은 상태 값입니다.' });
    }
    const targetUser = db.users.find((u) => u.id === req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    if (targetUser.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: '최고관리자 계정의 상태는 변경할 수 없습니다.' });
    }

    const prevStatus = targetUser.status;

    if (req.isSuperAdmin) {
      // 최고관리자: 계정 자체의 상태를 바꾼다
      targetUser.status = status;
      targetUser.updated_at = nowIso();
      if (status === 'ACTIVE') {
        db.userCompanyRoles
          .filter((r) => r.user_id === targetUser.id && r.status === 'PENDING')
          .forEach((r) => {
            r.status = 'ACTIVE';
            r.updated_at = nowIso();
          });
      }
    } else {
      // 대표 관리자: 자기 회사 안에서의 소속 상태만 바꾼다 (다른 회사 소속에는 영향 없음)
      const membership = db.userCompanyRoles.find(
        (r) => r.user_id === targetUser.id && r.company_id === req.companyId
      );
      if (!membership) {
        return res.status(404).json({ error: '이 회사에 소속된 사용자가 아닙니다.' });
      }
      if (targetUser.id === req.user!.id) {
        return res.status(400).json({ error: '본인 계정의 상태는 변경할 수 없습니다.' });
      }
      if (getCompanyLicense(req.companyId!)?.user_id === targetUser.id) {
        return res.status(403).json({ error: '라이선스 대표 관리자의 상태는 변경할 수 없습니다.' });
      }
      membership.status = status;
      membership.updated_at = nowIso();
      // 이 회사에만 소속된 사용자라면 계정 표시 상태도 함께 맞춘다
      const otherMemberships = db.userCompanyRoles.filter(
        (r) => r.user_id === targetUser.id && r.company_id !== req.companyId
      );
      if (otherMemberships.length === 0) {
        targetUser.status = status;
        targetUser.updated_at = nowIso();
      }
    }

    db.addAuditLog({
      company_id: req.companyId || 'system',
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: 'UPDATE',
      entity_type: 'USER_STATUS',
      entity_id: targetUser.id,
      before_data: { status: prevStatus },
      after_data: { status },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({ success: true, user: targetUser });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`돈돈 회계관리 프로그램 서버 실행 중: http://localhost:${PORT}`);
    console.log(`  최고관리자 계정: ${SUPER_ADMIN_EMAIL}`);
    console.log(`  데이터 저장 위치: ${store.mode === 'firestore' ? store.description : DATA_FILE}`);
    if (STORAGE_IS_EPHEMERAL) {
      console.warn('  ⚠ 데이터가 서버 내부 파일에 저장됩니다. 새로 배포하면 지워집니다! FIREBASE_SERVICE_ACCOUNT를 설정하세요.');
    }
    if (!FIREBASE_PROJECT_ID) {
      console.warn('  ⚠ Firebase가 설정되지 않았습니다. firebase-applet-config.json을 채워야 Google 로그인이 동작합니다.');
    }
    if (DEV_LOGIN_ENABLED) {
      console.warn('  ⚠ 개발용 로그인(DONDON_DEV_LOGIN)이 켜져 있습니다. 실제 운영에서는 반드시 끄세요.');
    }
  });

  // 종료 시 마지막 변경분까지 저장
  let exiting = false;
  const flushAndExit = async () => {
    if (exiting) return;
    exiting = true;
    try {
      await db.saveNow();
    } catch (err) {
      console.error('[db] 종료 중 저장 실패:', err);
    }
    process.exit(0);
  };
  process.on('SIGINT', flushAndExit);
  process.on('SIGTERM', flushAndExit);
}

startServer().catch((err) => {
  console.error('[server] 서버를 시작하지 못했습니다:', err);
  process.exit(1);
});
