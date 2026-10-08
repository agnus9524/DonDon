/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { PermissionCode } from '../types';
import { ROLE_PERMISSIONS } from '../data/initialData';
import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  Landmark,
  FileSpreadsheet,
  Building2,
  Users,
  Layers,
  Briefcase,
  Shield,
  FolderGit2,
  Lock,
  X,
  SlidersHorizontal,
  CreditCard,
  Building,
  Code2,
  ChevronDown,
  ChevronRight,
  UserCog,
  KeyRound,
} from 'lucide-react';

export type NavSection =
  | 'dashboard'
  | 'transactions'
  | 'budgets'
  | 'banks'
  | 'reports'
  | 'admin-super'
  | 'admin-companies'
  | 'admin-accounting-settings'
  | 'admin-accounting-accounts'
  | 'admin-accounting-cards'
  | 'admin-accounting-cash-banks'
  | 'admin-accounting-units'
  | 'admin-accounting-codes'
  | 'admin-user-settings'
  | 'admin-teams'
  | 'admin-users'
  | 'admin-permissions'
  | 'admin-vendors'
  | 'admin-accounts';

export interface AccountingSubMenuItem {
  id: NavSection;
  label: string;
  icon: any;
  badge?: string;
}

export const ACCOUNTING_SUB_MENUS: AccountingSubMenuItem[] = [
  { id: 'admin-accounting-accounts', label: '계정과목관리', icon: Layers },
  { id: 'admin-accounting-cards', label: '신용카드관리', icon: CreditCard },
  { id: 'admin-accounting-cash-banks', label: '현금계좌관리', icon: Landmark },
  { id: 'admin-accounting-units', label: '회계단위관리', icon: Building },
  { id: 'admin-accounting-codes', label: '코드종합관리', icon: Code2, badge: '관리' },
];

export interface UserSubMenuItem {
  id: NavSection;
  label: string;
  icon: any;
  badge?: string;
  permission: PermissionCode;
}

export const USER_SUB_MENUS: UserSubMenuItem[] = [
  { id: 'admin-teams', label: '부서관리', icon: FolderGit2, permission: 'team.view' },
  { id: 'admin-users', label: '권한관리', icon: Users, permission: 'user.view' },
  { id: 'admin-permissions', label: '회계권한관리', icon: Shield, permission: 'role.manage' },
];

interface SidebarProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  userRole: string;
  isSuperAdmin: boolean;
  companyName: string;
  permissions?: Set<PermissionCode>;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

// 각 메뉴가 요구하는 최소 권한. hasPermission(code)가 false면 super admin이 아닌 한
// 메뉴 자체가 보이지 않는다 (서버 측 requirePermission과 동일한 기준을 사용).
const NAV_ITEMS: { id: NavSection; label: string; icon: any; permission: PermissionCode }[] = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard, permission: 'dashboard.view' },
  { id: 'transactions', label: '회계전표 · 거래관리', icon: Receipt, permission: 'transaction.view' },
  { id: 'budgets', label: '예산관리', icon: PiggyBank, permission: 'budget.view' },
  { id: 'banks', label: '은행내역 · 계좌연동', icon: Landmark, permission: 'bank_import.view' },
  { id: 'reports', label: '결산보고서 (월·분기·연)', icon: FileSpreadsheet, permission: 'report.monthly' },
];

const ADMIN_ITEMS: {
  id: NavSection;
  label: string;
  icon: any;
  permission: PermissionCode;
  highlight?: boolean;
  hasChildren?: boolean;
}[] = [
  { id: 'admin-super', label: '슈퍼 관리자 패널', icon: KeyRound, permission: 'company.manage', highlight: true },
  { id: 'admin-companies', label: '회사 관리 (법인)', icon: Building2, permission: 'company.manage', highlight: true },
  { id: 'admin-accounting-settings', label: '회계설정', icon: SlidersHorizontal, permission: 'account.manage', hasChildren: true },
  { id: 'admin-user-settings', label: '사용자설정', icon: UserCog, permission: 'user.view', hasChildren: true },
  { id: 'admin-vendors', label: '거래처 관리', icon: Briefcase, permission: 'vendor.manage' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentSection,
  onSelectSection,
  userRole,
  isSuperAdmin,
  companyName,
  permissions,
  isOpenMobile,
  onCloseMobile,
}) => {
  const activePerms = permissions || new Set(ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.SUPER_ADMIN || []);
  const canAdmin = isSuperAdmin || userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'ORG_ADMIN';
  const hasPermission = (code: PermissionCode) =>
    isSuperAdmin || userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || userRole === 'ORG_ADMIN' || activePerms.has(code);

  const visibleNavItems = NAV_ITEMS.filter((item) => hasPermission(item.permission));
  const visibleAdminItems = ADMIN_ITEMS.filter((item) => {
    // 슈퍼 관리자 패널(라이선스·인증키)과 회사 관리(법인)는 최고관리자에게만 보임
    if (item.id === 'admin-super' || item.id === 'admin-companies') {
      return isSuperAdmin;
    }
    return hasPermission(item.permission);
  });

  const isAccountingSection =
    currentSection === 'admin-accounting-settings' ||
    currentSection === 'admin-accounts' ||
    currentSection === 'admin-accounting-accounts' ||
    currentSection === 'admin-accounting-cards' ||
    currentSection === 'admin-accounting-cash-banks' ||
    currentSection === 'admin-accounting-units' ||
    currentSection === 'admin-accounting-codes';

  const isUserSection =
    currentSection === 'admin-user-settings' ||
    currentSection === 'admin-teams' ||
    currentSection === 'admin-users' ||
    currentSection === 'admin-permissions';

  const [isAccountingOpen, setIsAccountingOpen] = useState(true);
  const [isUserOpen, setIsUserOpen] = useState(true);

  useEffect(() => {
    if (isAccountingSection) {
      setIsAccountingOpen(true);
    }
  }, [isAccountingSection]);

  useEffect(() => {
    if (isUserSection) {
      setIsUserOpen(true);
    }
  }, [isUserSection]);

  const handleItemClick = (sectionId: NavSection) => {
    onSelectSection(sectionId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          className="fixed inset-x-0 top-16 bottom-0 bg-slate-900/60 backdrop-blur-xs z-30 md:hidden transition-opacity duration-200"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed top-16 bottom-0 left-0 z-30 w-72 pb-16 bg-white flex flex-col transition-transform duration-200 ease-in-out shadow-2xl
          md:sticky md:top-16 md:self-start md:h-[calc(100vh-4rem)] md:pb-0 md:w-64 md:shrink-0 md:shadow-none md:translate-x-0 md:border-r md:border-slate-200/80
          ${isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Company context header with mobile close button */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/40 flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              현재 회계 장부
            </div>
            <div className="text-sm font-bold text-slate-900 truncate mt-0.5" title={companyName}>
              {companyName}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>회사별 데이터 격리 가동 중</span>
            </div>
          </div>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden -mr-1 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              aria-label="메뉴 닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Main Navigation */}
        <div className="p-3 space-y-1 flex-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            회계 업무
          </div>

          {visibleNavItems.length === 0 && (
            <div className="px-3 py-4 text-[11px] text-slate-400 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" />
              접근 가능한 메뉴가 없습니다.
            </div>
          )}

          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Admin Section */}
          {visibleAdminItems.length > 0 && (
            <div className="pt-4 mt-4 border-t border-slate-100">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>시스템 관리</span>
                {canAdmin && (
                  <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-bold">
                    관리자
                  </span>
                )}
              </div>

              <div className="space-y-1">
                {visibleAdminItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentSection === item.id;

                  // 회계설정: 하위 서브메뉴(계정과목, 신용카드, 현금계좌, 회계단위, 코드종합관리) 아코디언 렌더링
                  if (item.id === 'admin-accounting-settings') {
                    return (
                      <div key={item.id} className="space-y-0.5">
                        <button
                          onClick={() => {
                            setIsAccountingOpen((prev) => !prev);
                            handleItemClick('admin-accounting-settings');
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                            isAccountingSection
                              ? 'bg-indigo-50/80 text-indigo-950 font-bold ring-1 ring-indigo-200/70'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${isAccountingSection ? 'text-indigo-600' : 'text-slate-400'}`} />
                            <span className="truncate">{item.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-bold">
                              설정
                            </span>
                            {isAccountingOpen ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {/* 회계설정 하위 메뉴 (계정과목관리, 신용카드관리, 현금계좌관리, 회계단위관리, 코드종합관리) */}
                        {isAccountingOpen && (
                          <div className="pl-4 ml-3 border-l-2 border-indigo-200/80 space-y-0.5 pt-0.5 pb-1 animate-in fade-in duration-150">
                            {ACCOUNTING_SUB_MENUS.map((sub) => {
                              const SubIcon = sub.icon;
                              const isSubActive =
                                currentSection === sub.id ||
                                (sub.id === 'admin-accounting-accounts' && (currentSection === 'admin-accounts' || currentSection === 'admin-accounting-settings'));

                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => handleItemClick(sub.id)}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                    isSubActive
                                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                                      : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/90'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 truncate">
                                    <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-amber-300' : 'text-slate-400'}`} />
                                    <span className="truncate">{sub.label}</span>
                                  </div>
                                  {sub.badge && (
                                    <span
                                      className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                                        isSubActive ? 'bg-indigo-700 text-amber-200' : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {sub.badge}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // 사용자설정: 하위 서브메뉴(부서관리, 권한관리, 회계권한관리) 아코디언 렌더링
                  if (item.id === 'admin-user-settings') {
                    return (
                      <div key={item.id} className="space-y-0.5">
                        <button
                          onClick={() => {
                            setIsUserOpen((prev) => !prev);
                            handleItemClick('admin-user-settings');
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                            isUserSection
                              ? 'bg-blue-50/80 text-blue-950 font-bold ring-1 ring-blue-200/70'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${isUserSection ? 'text-blue-600' : 'text-slate-400'}`} />
                            <span className="truncate">{item.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-bold">
                              설정
                            </span>
                            {isUserOpen ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {/* 사용자설정 하위 메뉴 (부서관리, 권한관리, 회계권한관리) */}
                        {isUserOpen && (
                          <div className="pl-4 ml-3 border-l-2 border-blue-200/80 space-y-0.5 pt-0.5 pb-1 animate-in fade-in duration-150">
                            {USER_SUB_MENUS.filter((sub) => hasPermission(sub.permission)).map((sub) => {
                              const SubIcon = sub.icon;
                              const isSubActive =
                                currentSection === sub.id ||
                                (sub.id === 'admin-teams' && currentSection === 'admin-user-settings');

                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => handleItemClick(sub.id)}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                    isSubActive
                                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                                      : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/90'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 truncate">
                                    <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-amber-300' : 'text-slate-400'}`} />
                                    <span className="truncate">{sub.label}</span>
                                  </div>
                                  {sub.badge && (
                                    <span
                                      className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                                        isSubActive ? 'bg-blue-700 text-amber-200' : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {sub.badge}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-900 font-semibold ring-1 ring-indigo-200'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                      {item.highlight && (
                        <span className="ml-auto text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                          ★
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-600">
        <div className="font-semibold text-slate-700">don don Multi-Tenant Core</div>
        <div className="mt-0.5 text-slate-500">RLS & Company ID Isolation</div>
      </div>
    </aside>
  </>
  );
};
