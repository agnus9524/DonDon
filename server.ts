/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  INITIAL_COMPANIES,
  INITIAL_TEAMS,
  INITIAL_ACCOUNTS,
  INITIAL_COMPANY_ACCOUNTS,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_VENDORS,
  CURRENT_USER,
  INITIAL_USER_COMPANY_ROLES,
  INITIAL_ALL_USERS,
  INITIAL_BUDGETS,
  INITIAL_TRANSACTIONS,
} from './src/data/initialData';
import {
  Company,
  Team,
  Account,
  CompanyAccount,
  BankAccount,
  Vendor,
  Budget,
  Transaction,
  UserCompanyRole,
  User,
} from './src/types';

// In-Memory Multi-Tenant Database Store
class AccountingDatabase {
  companies: Company[] = [...INITIAL_COMPANIES];
  teams: Team[] = [...INITIAL_TEAMS];
  accounts: Account[] = [...INITIAL_ACCOUNTS];
  companyAccounts: CompanyAccount[] = [...INITIAL_COMPANY_ACCOUNTS];
  bankAccounts: BankAccount[] = [...INITIAL_BANK_ACCOUNTS];
  vendors: Vendor[] = [...INITIAL_VENDORS];
  budgets: Budget[] = [...INITIAL_BUDGETS];
  transactions: Transaction[] = [...INITIAL_TRANSACTIONS];
  users: User[] = [...INITIAL_ALL_USERS];
  userCompanyRoles: UserCompanyRole[] = [...INITIAL_USER_COMPANY_ROLES];
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
    // Current authenticated user (default to Hong Gil-dong for demo/preview, or x-user-id header)
    const userId = (req.headers['x-user-id'] as string) || CURRENT_USER.id;
    const user = db.users.find((u) => u.id === userId) || CURRENT_USER;
    req.user = user;
    req.isSuperAdmin = user.is_system_admin;

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
      }
    }
    next();
  };

  app.use('/api', tenantAuthMiddleware);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'don don accounting system', time: new Date().toISOString() });
  });

  // Auth & Profile
  app.get('/api/v1/auth/me', (req: TenantRequest, res: Response) => {
    const user = req.user!;
    const userRoles = db.userCompanyRoles.filter((r) => r.user_id === user.id && r.status === 'ACTIVE');
    const authorizedCompanies = user.is_system_admin
      ? db.companies
      : db.companies.filter((c) => userRoles.some((r) => r.company_id === c.id));

    res.json({
      user,
      roles: userRoles,
      companies: authorizedCompanies.map((comp) => {
        const role = userRoles.find((r) => r.company_id === comp.id);
        return {
          ...comp,
          my_role: role ? role.role_id : user.is_system_admin ? 'SUPER_ADMIN' : 'VIEWER',
        };
      }),
    });
  });

  // Switch/Inspect active company info
  app.get('/api/v1/companies', (req: TenantRequest, res: Response) => {
    const user = req.user!;
    const userRoles = db.userCompanyRoles.filter((r) => r.user_id === user.id && r.status === 'ACTIVE');
    const result = user.is_system_admin
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

    // Automatically create default teams
    const defaultTeams: Team[] = [
      {
        id: `team_${Date.now()}_1`,
        company_id: newCompany.id,
        team_code: 'TEAM_GA',
        team_name: '총무팀',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: `team_${Date.now()}_2`,
        company_id: newCompany.id,
        team_code: 'TEAM_FIN',
        team_name: '회계팀',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    db.teams.push(...defaultTeams);

    // Automatically assign current user as ADMIN
    db.userCompanyRoles.push({
      id: `ucr_${Date.now()}`,
      user_id: req.user!.id,
      company_id: newCompany.id,
      role_id: 'ADMIN',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    });

    // Default activate base accounts (Method B)
    db.accounts.forEach((acc) => {
      db.companyAccounts.push({
        company_id: newCompany.id,
        account_id: acc.id,
        is_active: ['101', '103', '251', '253', '331', '411', '501', '504', '508'].includes(acc.account_code),
      });
    });

    res.status(201).json({ company: newCompany });
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

  // Get Teams for Current Company
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
    res.status(201).json({ team: newTeam });
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

  // Toggle Account Active Status for Current Company
  app.put('/api/v1/company-accounts/:accountId/toggle', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const companyId = req.companyId!;
    const accountId = req.params.accountId;
    let entry = db.companyAccounts.find((ca) => ca.company_id === companyId && ca.account_id === accountId);
    if (!entry) {
      entry = { company_id: companyId, account_id: accountId, is_active: false };
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
    const { bank_name, account_number, account_name, initial_balance, notes } = req.body;
    if (!bank_name || !account_number) {
      return res.status(400).json({ error: '은행명과 계좌번호는 필수입니다.' });
    }
    const newBank: BankAccount = {
      id: `bank_${Date.now()}`,
      company_id: req.companyId!,
      bank_name,
      account_number,
      account_name: account_name || `${bank_name} 보통예금`,
      current_balance: Number(initial_balance) || 0,
      is_active: true,
      notes,
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
    const { vendor_name, business_number, representative, phone, category } = req.body;
    if (!vendor_name) {
      return res.status(400).json({ error: '거래처명을 입력해주세요.' });
    }
    const newVendor: Vendor = {
      id: `ven_${Date.now()}`,
      company_id: req.companyId!,
      vendor_code: `V-${Date.now().toString().slice(-4)}`,
      vendor_name,
      business_number: business_number || '000-00-00000',
      representative: representative || '',
      phone: phone || '',
      category: category || '일반거래처',
    };
    db.vendors.push(newVendor);
    res.status(201).json({ vendor: newVendor });
  });

  // Budgets for Current Company
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
            t.transaction_type === 'EXPENSE'
        )
        .reduce((sum, t) => sum + t.total_amount, 0);

      const team = db.teams.find((t) => t.id === b.team_id);
      const account = db.accounts.find((a) => a.id === b.account_id);

      return {
        ...b,
        team_name: team?.team_name || '미지정',
        account_name: account?.account_name || '미지정',
        spent_amount: spent,
        remaining_amount: b.allocated_amount - spent,
        execution_rate: b.allocated_amount > 0 ? Math.round((spent / b.allocated_amount) * 100) : 0,
      };
    });

    res.json({ budgets: enriched });
  });

  // Transactions Strictly Isolated by company_id
  app.get('/api/v1/transactions', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const companyId = req.companyId!;
    let list = db.transactions.filter((t) => t.company_id === companyId);

    // Team constraint if TEAM_ACCOUNTANT
    if (req.userRole?.role_id === 'TEAM_ACCOUNTANT' && req.userRole.team_id) {
      list = list.filter((t) => t.team_id === req.userRole!.team_id);
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
      .filter((t) => t.transaction_type === 'INCOME')
      .reduce((sum, t) => sum + t.total_amount, 0);
    const total_expense = list
      .filter((t) => t.transaction_type === 'EXPENSE')
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

  // Create Transaction (Guaranteed company_id tagging)
  app.post('/api/v1/transactions', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    // Check permission: VIEWER cannot create
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

    const sup = Number(supply_amount) || 0;
    const vat = vat_type === 'TAXABLE' ? (vat_amount !== undefined ? Number(vat_amount) : Math.round(sup * 0.1)) : 0;
    const tot = total_amount !== undefined ? Number(total_amount) : sup + vat;

    const newTx: Transaction = {
      id: `tx_${req.companyId?.replace('comp_', '')}_${Date.now().toString().slice(-6)}`,
      company_id: req.companyId!, // ★ CORE MULTI-TENANT KEY
      team_id: team_id || (db.teams.find((t) => t.company_id === req.companyId)?.id || ''),
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
    const [deleted] = db.transactions.splice(idx, 1);
    res.json({ success: true, deleted_id: deleted.id });
  });

  // Reports API: Monthly Report (Isolated per company)
  app.get('/api/v1/reports/monthly', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const companyId = req.companyId!;
    const year = Number(req.query.year) || 2026;
    const month = Number(req.query.month) || 9;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const txs = db.transactions.filter(
      (t) => t.company_id === companyId && t.transaction_date.startsWith(monthStr)
    );

    const total_income = txs
      .filter((t) => t.transaction_type === 'INCOME')
      .reduce((sum, t) => sum + t.total_amount, 0);

    const total_expense = txs
      .filter((t) => t.transaction_type === 'EXPENSE')
      .reduce((sum, t) => sum + t.total_amount, 0);

    // Grouping by accounts
    const accountMap = new Map(db.accounts.map((a) => [a.id, a]));
    const categoryExpense: Record<string, number> = {};
    const categoryIncome: Record<string, number> = {};

    txs.forEach((t) => {
      const acc = accountMap.get(t.account_id);
      const cat = acc?.account_name || '기타';
      if (t.transaction_type === 'EXPENSE') {
        categoryExpense[cat] = (categoryExpense[cat] || 0) + t.total_amount;
      } else if (t.transaction_type === 'INCOME') {
        categoryIncome[cat] = (categoryIncome[cat] || 0) + t.total_amount;
      }
    });

    const companyTeams = db.teams.filter((t) => t.company_id === companyId);
    const team_summary = companyTeams.map((team) => {
      const teamTxs = txs.filter((t) => t.team_id === team.id);
      return {
        team_id: team.id,
        team_name: team.team_name,
        income: teamTxs.filter((t) => t.transaction_type === 'INCOME').reduce((s, t) => s + t.total_amount, 0),
        expense: teamTxs.filter((t) => t.transaction_type === 'EXPENSE').reduce((s, t) => s + t.total_amount, 0),
      };
    });

    res.json({
      company_id: companyId,
      year,
      month,
      total_income,
      total_expense,
      net_profit: total_income - total_expense,
      income_by_category: Object.entries(categoryIncome).map(([category, amount]) => ({ category, amount })),
      expense_by_category: Object.entries(categoryExpense).map(([category, amount]) => ({ category, amount })),
      team_summary,
    });
  });

  // Bank Excel Import Simulator
  app.post('/api/v1/bank-import', requireCompanyAccess, (req: TenantRequest, res: Response) => {
    const { bank_account_id, rows } = req.body;
    if (!bank_account_id) {
      return res.status(400).json({ error: '가져올 은행 계좌를 선택해주세요.' });
    }

    const importedTxs: Transaction[] = [];
    const defaultTeam = db.teams.find((t) => t.company_id === req.companyId);
    const defaultAccount = db.accounts.find((a) => a.account_code === '508') || db.accounts[0];

    const inputRows = Array.isArray(rows) && rows.length > 0 ? rows : [
      { date: '2026-09-21', desc: '하나로마트 소모품 결제', inAmt: 0, outAmt: 84000 },
      { date: '2026-09-21', desc: '익명 CMS 후원금 입금', inAmt: 150000, outAmt: 0 },
      { date: '2026-09-20', desc: '카카오페이 식대 지출', inAmt: 0, outAmt: 32000 },
    ];

    inputRows.forEach((r: any, idx: number) => {
      const isIncome = Number(r.inAmt) > 0;
      const amount = isIncome ? Number(r.inAmt) : Number(r.outAmt);
      const tx: Transaction = {
        id: `tx_imp_${Date.now()}_${idx}`,
        company_id: req.companyId!,
        team_id: defaultTeam?.id || '',
        transaction_date: r.date || '2026-09-21',
        transaction_type: isIncome ? 'INCOME' : 'EXPENSE',
        account_id: isIncome ? 'acc_402' : defaultAccount.id,
        payment_method: 'BANK_TRANSFER',
        bank_account_id,
        vat_type: isIncome ? 'TAX_EXEMPT' : 'TAXABLE',
        supply_amount: isIncome ? amount : Math.round(amount / 1.1),
        vat_amount: isIncome ? 0 : amount - Math.round(amount / 1.1),
        total_amount: amount,
        description: r.desc || '은행 엑셀 가져오기 거래',
        memo: '은행 거래내역 자동 연동분',
        status: 'CONFIRMED',
        created_by: req.user!.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.transactions.push(tx);
      importedTxs.push(tx);
    });

    res.json({ success: true, count: importedTxs.length, transactions: importedTxs });
  });

  // Admin: User-Company Roles Management
  app.get('/api/v1/admin/users-and-roles', (req: TenantRequest, res: Response) => {
    res.json({
      users: db.users,
      roles: db.userCompanyRoles,
      companies: db.companies,
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
      db.userCompanyRoles[existingIdx].role_id = role_id;
      return res.json({ role: db.userCompanyRoles[existingIdx] });
    }

    const newRole: UserCompanyRole = {
      id: `ucr_${Date.now()}`,
      user_id,
      company_id,
      role_id,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    db.userCompanyRoles.push(newRole);
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
    console.log(`don don Accounting Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
