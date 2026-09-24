/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
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
} from 'lucide-react';

export type NavSection =
  | 'dashboard'
  | 'transactions'
  | 'budgets'
  | 'banks'
  | 'reports'
  | 'admin-companies'
  | 'admin-teams'
  | 'admin-accounts'
  | 'admin-users'
  | 'admin-vendors'
  | 'admin-permissions';

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

const ADMIN_ITEMS: { id: NavSection; label: string; icon: any; permission: PermissionCode; highlight?: boolean }[] = [
  { id: 'admin-companies', label: '회사 관리 (법인)', icon: Building2, permission: 'company.manage', highlight: true },
  { id: 'admin-teams', label: '팀 · 부서 관리', icon: FolderGit2, permission: 'team.view' },
  { id: 'admin-accounts', label: '계정과목 관리', icon: Layers, permission: 'account.manage' },
  { id: 'admin-users', label: '사용자 · 권한 관리', icon: Users, permission: 'user.view' },
  { id: 'admin-vendors', label: '거래처 관리', icon: Briefcase, permission: 'vendor.manage' },
  { id: 'admin-permissions', label: '권한 설정 (역할별)', icon: Shield, permission: 'role.manage' },
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
    isSuperAdmin || userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || activePerms.has(code);

  const visibleNavItems = NAV_ITEMS.filter((item) => hasPermission(item.permission));
  const visibleAdminItems = ADMIN_ITEMS.filter(
    (item) => item.id === 'admin-companies' || hasPermission(item.permission)
  );

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
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 md:hidden transition-opacity duration-200"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-white flex flex-col transition-transform duration-200 ease-in-out shadow-2xl
          md:static md:w-64 md:shadow-none md:translate-x-0 md:min-h-[calc(100vh-4rem)] md:border-r md:border-slate-200/80
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
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

              {visibleAdminItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-900 font-semibold ring-1 ring-indigo-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
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
