/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  Landmark,
  FileSpreadsheet,
  Building2,
  Users,
  Layers,
  CreditCard,
  Briefcase,
  Shield,
  FolderGit2,
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
  | 'admin-vendors';

interface SidebarProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  userRole: string;
  isSuperAdmin: boolean;
  companyName: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentSection,
  onSelectSection,
  userRole,
  isSuperAdmin,
  companyName,
}) => {
  const canAdmin = isSuperAdmin || userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

  const navItems = [
    { id: 'dashboard' as NavSection, label: '대시보드', icon: LayoutDashboard },
    { id: 'transactions' as NavSection, label: '회계전표 · 거래관리', icon: Receipt },
    { id: 'budgets' as NavSection, label: '예산관리', icon: PiggyBank },
    { id: 'banks' as NavSection, label: '은행내역 · 계좌연동', icon: Landmark },
    { id: 'reports' as NavSection, label: '결산보고서 (월·분기·연)', icon: FileSpreadsheet },
  ];

  const adminItems = [
    { id: 'admin-companies' as NavSection, label: '회사 관리 (법인)', icon: Building2, highlight: true },
    { id: 'admin-teams' as NavSection, label: '팀 · 부서 관리', icon: FolderGit2 },
    { id: 'admin-accounts' as NavSection, label: '계정과목 관리', icon: Layers },
    { id: 'admin-users' as NavSection, label: '사용자 · 권한 관리', icon: Users },
    { id: 'admin-vendors' as NavSection, label: '거래처 관리', icon: Briefcase },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col shrink-0 min-h-[calc(100vh-4rem)]">
      {/* Company context header */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/40">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          현재 회계 장부
        </div>
        <div className="text-sm font-bold text-slate-900 truncate mt-0.5">
          {companyName}
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-700 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>회사별 데이터 격리 가동 중</span>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="p-3 space-y-1 flex-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          회계 업무
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
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
        <div className="pt-4 mt-4 border-t border-slate-100">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>시스템 관리</span>
            {canAdmin && (
              <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-bold">
                관리자
              </span>
            )}
          </div>

          {adminItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectSection(item.id)}
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
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-600">
        <div className="font-semibold text-slate-700">don don Multi-Tenant Core</div>
        <div className="mt-0.5 text-slate-500">RLS & Company ID Isolation</div>
      </div>
    </aside>
  );
};
