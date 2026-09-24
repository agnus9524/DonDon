/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
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
  CURRENT_USER,
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
} from './src/types';

// 18-Table In-Memory Multi-Tenant Database Store
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
}

const db = new AccountingDatabase();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Multi-tenant Context Extraction Middleware
  interface TenantRequest extends Request {
    user?: User;
    companyId?: string;
    userRole?: UserCompanyRole;
    isSuperAdmin?: boolean;
  }

  const tenantAuthMiddleware = (req: TenantRequest, res: Response, next: NextFunction) => {
    // Current authenticated user (default to agnus9524@gmail.com / usr_hong)
    const userId = (req.headers['x-user-id'] as string) || CURRENT_USER.id;
    const user = db.users.find((u) => u.id === userId) || CURRENT_USER;
    req.user = user;
    req.isSuperAdmin = user.is_system_admin || user.is_super_admin || user.email === 'agnus9524@gmail.com';

    // Company context from header or query
    const companyId = (req.headers['x-company-id'] as string) || (req.query.company_id as string);
    if (companyId) {
      req.companyId = companyId;
      // Check user membership in this company
      const role = db.userCompanyRoles.find(
        (r) => r.user_id === user.id && r.company_id === companyId && r.status === 'ACTIVE'
      );
      if (role) {
        req.userRole = role;
      } else if (req.isSuperAdmin) {
        // Super Admin gets implicit SUPER_ADMIN role in all companies
        req.userRole = {
          id: `ucr_sa_${companyId}`,
          user_id: user.id,
          company_id: companyId,
          role_id: 'SUPER_ADMIN',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
    }
    next();
  };

  app.use('/api', tenantAuthMiddleware);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      app: 'don don multi-tenant accounting system',
      architecture: '18 core tables with tenant isolation',
      time: new Date().toISOString(),
    });
  });

  // Auth & Profile
  app.get('/api/v1/auth/me', (req: TenantRequest, res: Response) => {
    const user = req.user!;
    const userRoles = db.userCompanyRoles.filter((r) => r.user_id === user.id && r.status === 'ACTIVE');
    const authorizedCompanies = req.isSuperAdmin
      ? db.companies
      : db.companies.filter((c) => userRoles.some((r) => r.company_id === c.id));

    res.json({
      user,
      roles: userRoles,
      companies: authorizedCompanies.map((comp) => {
        const role = userRoles.find((r) => r.company_id === comp.id);
        return {
          ...comp,
          my_role: req.isSuperAdmin ? 'SUPER_ADMIN' : role ? role.role_id : 'VIEWER',
        };
      }),
    });
  });

  // Login Endpoint
  app.post('/api/v1/auth/login', (req: Request, res: Response) => {
    const { email, userId } = req.body || {};
    let targetUser: User | undefined;

    if (userId) {
      targetUser = db.users.find((u) => u.id === userId);
    } else if (email) {
      const cleanEmail = String(email).trim().toLowerCase();
      targetUser = db.users.find((u) => u.email.toLowerCase() === cleanEmail);

      // agnus9524@gmail.com is guaranteed Super Admin
      if (!targetUser && cleanEmail === 'agnus9524@gmail.com') {
        targetUser = {
          id: 'usr_hong',
          auth_user_id: 'google-oauth2|agnus9524',
          email: 'agnus9524@gmail.com',
          name: '최고관리자 (agnus9524)',
          department: '재무총괄 / 시스템총괄',
          status: 'ACTIVE',
          last_login_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_system_admin: true,
          is_super_admin: true,
        };
        db.users.push(targetUser);
      }
    }

    if (!targetUser) {
      return res.status(401).json({ error: '등록되지 않은 사용자 계정입니다. 이메일을 다시 확인해주세요.' });
    }

    targetUser.last_login_at = new Date().toISOString();
    targetUser.updated_at = new Date().toISOString();

    const isSuperAdmin = !!(targetUser.is_system_admin || targetUser.is_super_admin || targetUser.email === 'agnus9524@gmail.com');
    const userRoles = db.userCompanyRoles.filter((r) => r.user_id === targetUser!.id && r.status === 'ACTIVE');
    const authorizedCompanies = isSuperAdmin
      ? db.companies
      : db.companies.filter((c) => userRoles.some((r) => r.company_id === c.id));

    const teamRoles = db.userTeamRoles.filter((tr) => tr.user_id === targetUser!.id);

    // Primary role label
    let primaryRole = 'VIEWER';
    if (isSuperAdmin) {
      primaryRole = 'SUPER_ADMIN';
    } else if (userRoles.some((r) => r.role_id === 'ORG_ADMIN')) {
      primaryRole = 'ORG_ADMIN';
    } else if (userRoles.some((r) => r.role_id === 'HQ_ACCOUNTANT')) {
      primaryRole = 'HQ_ACCOUNTANT';
    } else if (userRoles.some((r) => r.role_id === 'TEAM_MANAGER') || teamRoles.some((tr) => tr.role_id === 'TEAM_MANAGER')) {
      primaryRole = 'TEAM_MANAGER';
    } else if (userRoles.some((r) => r.role_id === 'TEAM_ACCOUNTANT') || teamRoles.some((tr) => tr.role_id === 'TEAM_ACCOUNTANT')) {
      primaryRole = 'TEAM_ACCOUNTANT';
    } else if (userRoles.length > 0) {
      primaryRole = userRoles[0].role_id;
    }

    db.addAuditLog({
      company_id: authorizedCompanies[0]?.id || 'system',
      user_id: targetUser.id,
      user_name: targetUser.name,
      action: 'LOGIN',
      entity_type: 'AUTH',
      entity_id: targetUser.id,
      after_data: { email: targetUser.email, role: primaryRole },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      user: targetUser,
      primary_role: primaryRole,
      is_super_admin: isSuperAdmin,
      roles: userRoles,
      team_roles: teamRoles,
      companies: authorizedCompanies.map((comp) => {
        const role = userRoles.find((r) => r.company_id === comp.id);
        return {
          ...comp,
          my_role: isSuperAdmin ? 'SUPER_ADMIN' : role ? role.role_id : 'VIEWER',
        };
      }),
    });
  });

  // Request Join Company Endpoint
  app.post('/api/v1/auth/request-join', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const user = req.user!;
    const { company_id, reason } = req.body || {};
    const targetCompanyId = company_id || req.companyId;

    const existing = db.userCompanyRoles.find(
      (r) => r.user_id === user.id && r.company_id === targetCompanyId
    );

    if (existing) {
      existing.status = 'PENDING';
      existing.updated_at = new Date().toISOString();
    } else {
      db.userCompanyRoles.push({
        id: `ucr_${Date.now()}`,
        user_id: user.id,
        company_id: targetCompanyId,
        role_id: 'VIEWER',
        status: 'PENDING',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    db.addAuditLog({
      company_id: targetCompanyId,
      user_id: user.id,
      user_name: user.name,
      action: 'CREATE',
      entity_type: 'USER_COMPANY_ROLE_REQUEST',
      entity_id: user.id,
      after_data: { reason, status: 'PENDING' },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({ success: true, message: '회사 가입 신청이 정상적으로 접수되었습니다.' });
  });

  // Companies List
  app.get('/api/v1/companies', (req: TenantRequest, res: Response) => {
    const user = req.user!;
    const userRoles = db.userCompanyRoles.filter((r) => r.user_id === user.id && r.status === 'ACTIVE');
    const result = req.isSuperAdmin
      ? db.companies
      : db.companies.filter((c) => userRoles.some((r) => r.company_id === c.id));

    res.json({
      companies: result.map((c) => ({
        ...c,
        user_count: db.userCompanyRoles.filter((r) => r.company_id === c.id).length,
      })),
    });
  });

  // Create Company (Super Admin / Admin)
  app.post('/api/v1/companies', (req: TenantRequest, res: Response) => {
    const { company_code, company_name, business_number, representative_name, address, phone, email } = req.body;
    if (!company_code || !company_name) {
      return res.status(400).json({ error: '회사 코드와 회사명은 필수입니다.' });
    }

    if (db.companies.some((c) => c.company_code.toUpperCase() === company_code.toUpperCase())) {
      return res.status(400).json({ error: '이미 존재하는 회사 코드입니다.' });
    }

    const newCompany: Company = {
      id: `comp_${Date.now()}`,
      company_code: company_code.toUpperCase(),
      company_name,
      business_number: business_number || '000-00-00000',
      representative_name: representative_name || '대표자',
      address: address || '',
      phone: phone || '',
      email: email || '',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_count: 1,
    };

    db.companies.push(newCompany);

    // Default Teams
    const defaultTeams: Team[] = [
      {
        id: `team_${Date.now()}_ga`,
        company_id: newCompany.id,
        team_code: 'TEAM_GA',
        team_name: '총무부서',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: `team_${Date.now()}_biz`,
        company_id: newCompany.id,
        team_code: 'TEAM_BIZ',
        team_name: '사업기획팀',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    db.teams.push(...defaultTeams);

    // Initial Open Fiscal Period (2026-09)
    db.fiscalPeriods.push({
      id: `fp_${newCompany.id}_2026_09`,
      company_id: newCompany.id,
      year: 2026,
      month: 9,
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Default User-Company Role: creator gets ORG_ADMIN
    db.userCompanyRoles.push({
      id: `ucr_${Date.now()}`,
      user_id: req.user!.id,
      company_id: newCompany.id,
      role_id: 'ORG_ADMIN',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Default Company Accounts (Method B)
    db.accounts.forEach((acc) => {
      db.companyAccounts.push({
        id: `ca_${newCompany.id}_${acc.id}`,
        company_id: newCompany.id,
        account_id: acc.id,
        is_active: ['101', '103', '251', '253', '331', '4100', '4200', '5100', '5210', '5250'].includes(
          acc.account_code
        ),
        created_at: new Date().toISOString(),
      });
    });

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
    db.bankAccounts = db.bankAccounts.filter((ba) => ba.company_id !== companyId);
    db.vendors = db.vendors.filter((v) => v.company_id !== companyId);
    db.fiscalPeriods = db.fiscalPeriods.filter((fp) => fp.company_id !== companyId);
    db.transactions = db.transactions.filter((tx) => tx.company_id !== companyId);
    db.transactionAttachments = db.transactionAttachments.filter((att) => att.company_id !== companyId);
    db.budgets = db.budgets.filter((b) => b.company_id !== companyId);
    db.bankImports = db.bankImports.filter((bi) => bi.company_id !== companyId);
    db.bankImportRows = db.bankImportRows.filter((bir) => bir.company_id !== companyId);
    db.userCompanyRoles = db.userCompanyRoles.filter((ucr) => ucr.company_id !== companyId);

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
  app.get('/api/v1/accounts', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const companyId = req.companyId!;
    const activeMap = new Map(
      db.companyAccounts
        .filter((ca) => ca.company_id === companyId)
        .map((ca) => [ca.account_id, ca.is_active])
    );

    const result = db.accounts.map((acc) => ({
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

    const cleanCode = String(account_code).trim();
    if (db.accounts.some((a) => a.account_code === cleanCode)) {
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
    const accIdx = db.accounts.findIndex((a) => a.id === accountId);
    if (accIdx === -1) {
      return res.status(404).json({ error: '삭제할 계정과목을 찾을 수 없습니다.' });
    }

    const targetAccount = db.accounts[accIdx];

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
    const defaultExpenseAcc = db.accounts.find((a) => a.account_code === '5250') || db.accounts.find((a) => a.account_type === 'EXPENSE')!;
    const defaultIncomeAcc = db.accounts.find((a) => a.account_code === '4200') || db.accounts.find((a) => a.account_type === 'REVENUE')!;
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
    res.json({
      users: db.users,
      roles: db.userCompanyRoles,
      companies: db.companies,
      all_roles: db.roles,
    });
  });

  app.post('/api/v1/admin/user-company-roles', (req: TenantRequest, res: Response) => {
    const { user_id, company_id, role_id } = req.body;
    if (!user_id || !company_id || !role_id) {
      return res.status(400).json({ error: 'user_id, company_id, role_id는 필수입니다.' });
    }

    const existingIdx = db.userCompanyRoles.findIndex(
      (r) => r.user_id === user_id && r.company_id === company_id
    );

    if (existingIdx !== -1) {
      const beforeRole = db.userCompanyRoles[existingIdx].role_id;
      db.userCompanyRoles[existingIdx].role_id = role_id;
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
    console.log(`don don Accounting Server (18 Tables Multi-Tenant) running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
