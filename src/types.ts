/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type EntityStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

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

export interface Team {
  id: string;
  company_id: string;
  team_code: string;
  team_name: string;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
}

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  category: string;
  description?: string;
  is_active?: boolean;
}

export interface CompanyAccount {
  id?: string;
  company_id: string;
  account_id: string;
  is_active: boolean;
}

export type RoleType = 'SUPER_ADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'TEAM_ACCOUNTANT' | 'VIEWER';

export interface RoleInfo {
  role_id: RoleType;
  name: string;
  description: string;
  color: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  department?: string;
  is_system_admin: boolean;
  is_super_admin?: boolean;
}

export interface UserCompanyRole {
  id: string;
  user_id: string;
  company_id: string;
  role_id: RoleType;
  team_id?: string; // Optional team constraint for TEAM_ACCOUNTANT
  status: EntityStatus;
  created_at: string;
}

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type PaymentMethod = 'BANK_TRANSFER' | 'CREDIT_CARD' | 'CASH' | 'CORPORATE_CARD' | 'NOTE';
export type VatType = 'TAXABLE' | 'TAX_EXEMPT' | 'ZERO_TAX';
export type TransactionStatus = 'DRAFT' | 'APPROVED' | 'CONFIRMED' | 'REJECTED';

export interface Transaction {
  id: string;
  company_id: string; // Core Multi-Tenant Key
  team_id: string;
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
  created_at: string;
  updated_at: string;
  evidence_url?: string;
}

export interface BankAccount {
  id: string;
  company_id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  current_balance: number;
  is_active: boolean;
  notes?: string;
}

export interface Vendor {
  id: string;
  company_id: string;
  vendor_code: string;
  vendor_name: string;
  business_number: string;
  representative: string;
  phone: string;
  email?: string;
  category: string;
}

export interface Budget {
  id: string;
  company_id: string;
  team_id: string;
  fiscal_year: number;
  account_id: string;
  allocated_amount: number;
}

export interface MonthlyReportSummary {
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  net_profit: number;
  income_by_category: { category: string; amount: number }[];
  expense_by_category: { category: string; amount: number }[];
  team_summary: { team_id: string; team_name: string; income: number; expense: number }[];
}
