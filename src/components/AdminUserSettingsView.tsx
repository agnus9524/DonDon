/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Company,
  Team,
  User,
  UserCompanyRole,
  UserTeamRole,
  RoleType,
  PermissionCode,
} from '../types';
import { AdminTeamsView } from './AdminTeamsView';
import { AdminUsersView } from './AdminUsersView';
import { AdminPermissionsView } from './AdminPermissionsView';
import {
  UserCog,
  FolderGit2,
  Users,
  Shield,
  ShieldCheck,
} from 'lucide-react';

export type UserSettingTab = 'teams' | 'users' | 'permissions';

interface AdminUserSettingsViewProps {
  currentCompany: Company;
  activeTab?: UserSettingTab;
  onTabChange?: (tab: UserSettingTab) => void;

  // Teams props
  teams: Team[];
  userRole: string;
  onAddTeam: (name: string, code?: string) => Promise<void>;
  onDeleteTeam?: (teamId: string) => Promise<void>;

  // Users props
  users: User[];
  companies: Company[];
  userRoles: UserCompanyRole[];
  teamRoles?: UserTeamRole[];
  currentUserId: string;
  onSwitchUser: (userId: string) => Promise<void>;
  onAssignRole: (userId: string, companyId: string, role: RoleType) => Promise<void>;
  onUpdateUserStatus?: (userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'PENDING') => Promise<void>;
  onAssignTeamRole?: (userId: string, teamId: string, companyId: string, role: RoleType) => Promise<void>;
  onRemoveTeamRole?: (id: string) => Promise<void>;
  onUpdateCustomPermissions?: (roleRecordId: string, grant: PermissionCode[], revoke: PermissionCode[]) => Promise<void>;
}

export const AdminUserSettingsView: React.FC<AdminUserSettingsViewProps> = ({
  currentCompany,
  activeTab = 'teams',
  onTabChange,
  teams,
  userRole,
  onAddTeam,
  onDeleteTeam,
  users,
  companies,
  userRoles,
  teamRoles,
  currentUserId,
  onSwitchUser,
  onAssignRole,
  onUpdateUserStatus,
  onAssignTeamRole,
  onRemoveTeamRole,
  onUpdateCustomPermissions,
}) => {
  const [currentTab, setCurrentTab] = useState<UserSettingTab>(activeTab);

  useEffect(() => {
    if (activeTab) {
      setCurrentTab(activeTab);
    }
  }, [activeTab]);

  const handleSelectTab = (tab: UserSettingTab) => {
    setCurrentTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Breadcrumb and Company Context */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                시스템 관리 &gt; 사용자설정
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                {currentCompany.company_name} ({currentCompany.company_code})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <span>사용자설정</span>
              <UserCog className="w-6 h-6 text-blue-600 shrink-0" />
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              소속 회사의 <strong>부서관리</strong>, 사용자 계정 승인 및 권한 위임을 위한 <strong>권한관리</strong>, 역할별 권한 기준표인 <strong>회계권한관리</strong>를 통합 설정합니다.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-800">조직 · 권한 관리 가동 중</div>
              <div className="text-[11px] text-emerald-600 font-semibold">부서 · 사용자 · 역할 통합 제어</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 2. Top Tabs Navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 pt-5 -mb-1 scrollbar-none">
          <button
            onClick={() => handleSelectTab('teams')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              currentTab === 'teams'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <FolderGit2 className="w-4 h-4" />
            <span>부서관리</span>
            <span className="text-[10px] bg-slate-100 px-1.5 py-0.2 rounded-full font-semibold">
              {teams.length}
            </span>
          </button>

          <button
            onClick={() => handleSelectTab('users')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              currentTab === 'users'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>권한관리</span>
            <span className="text-[10px] bg-slate-100 px-1.5 py-0.2 rounded-full font-semibold">
              {users.length}
            </span>
          </button>

          <button
            onClick={() => handleSelectTab('permissions')}
            className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              currentTab === 'permissions'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>회계권한관리</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full font-bold">
              역할별
            </span>
          </button>
        </div>
      </div>

      {/* 3. Sub-views */}
      {currentTab === 'teams' && (
        <AdminTeamsView
          currentCompany={currentCompany}
          teams={teams}
          userRole={userRole}
          onAddTeam={onAddTeam}
          onDeleteTeam={onDeleteTeam}
        />
      )}

      {currentTab === 'users' && (
        <AdminUsersView
          users={users}
          companies={companies}
          teams={teams}
          userRoles={userRoles}
          teamRoles={teamRoles}
          currentCompany={currentCompany}
          currentUserId={currentUserId}
          onSwitchUser={onSwitchUser}
          onAssignRole={onAssignRole}
          onUpdateUserStatus={onUpdateUserStatus}
          onAssignTeamRole={onAssignTeamRole}
          onRemoveTeamRole={onRemoveTeamRole}
          onUpdateCustomPermissions={onUpdateCustomPermissions}
        />
      )}

      {currentTab === 'permissions' && (
        <AdminPermissionsView currentCompany={currentCompany} />
      )}
    </div>
  );
};
