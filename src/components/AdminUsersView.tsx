/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, Company, Team, UserCompanyRole, UserTeamRole, RoleType, PermissionCode } from '../types';
import { PERMISSION_DEFINITIONS, ROLE_DEFINITIONS } from '../data/initialData';
import {
  Users,
  Shield,
  CheckCircle2,
  UserCheck,
  Key,
  Plus,
  X,
  ArrowRight,
  Clock,
  Ban,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';

export interface AdminUsersViewProps {
  users: User[];
  companies: Company[];
  teams?: Team[];
  userRoles: UserCompanyRole[];
  teamRoles?: UserTeamRole[];
  currentCompany: Company;
  currentUserId: string;
  onSwitchUser: (userId: string) => void;
  onAssignRole: (userId: string, companyId: string, role: RoleType) => Promise<void>;
  onUpdateUserStatus?: (userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'PENDING') => Promise<void>;
  onAssignTeamRole?: (userId: string, teamId: string, companyId: string, role: RoleType) => Promise<void>;
  onRemoveTeamRole?: (id: string) => Promise<void>;
  onUpdateCustomPermissions?: (userCompanyRoleId: string, grant: PermissionCode[], revoke: PermissionCode[]) => Promise<void>;
}

const TEAM_SCOPED_ROLES: RoleType[] = ['TEAM_MANAGER', 'TEAM_ACCOUNTANT', 'VIEWER'];

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  users,
  companies,
  teams = [],
  userRoles,
  teamRoles = [],
  currentCompany,
  currentUserId,
  onSwitchUser,
  onAssignRole,
  onUpdateUserStatus,
  onAssignTeamRole,
  onRemoveTeamRole,
  onUpdateCustomPermissions,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || '');
  const [targetCompanyId, setTargetCompanyId] = useState(currentCompany.id);
  const [targetRole, setTargetRole] = useState<RoleType>('ACCOUNTANT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [teamAssignFor, setTeamAssignFor] = useState<string | null>(null);
  const [newTeamId, setNewTeamId] = useState(teams[0]?.id || '');
  const [newTeamRole, setNewTeamRole] = useState<RoleType>('TEAM_ACCOUNTANT');
  const [permEditRoleId, setPermEditRoleId] = useState<string | null>(null);
  const [permDraft, setPermDraft] = useState<{ grant: Set<PermissionCode>; revoke: Set<PermissionCode> }>({
    grant: new Set(),
    revoke: new Set(),
  });
  const [savingPerm, setSavingPerm] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const companyMap = new Map(companies.map((c) => [c.id, c.company_name]));
  const teamMap = new Map(teams.map((t) => [t.id, t.team_name]));

  const pendingUsers = users.filter((u) => u.status === 'PENDING');
  const activeUsers = users.filter((u) => u.status !== 'PENDING');

  const getRoleBadge = (role: string) => {
    const normalized = role.replace(/^role_/, '').toUpperCase();
    const info =
      ROLE_DEFINITIONS[normalized as keyof typeof ROLE_DEFINITIONS] ||
      ROLE_DEFINITIONS[role as keyof typeof ROLE_DEFINITIONS];
    if (!info) return <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{role}</span>;
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${info.color}`}>{info.name}</span>
    );
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await onAssignRole(selectedUserId, targetCompanyId, targetRole);
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || '권한 부여 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      setStatusUpdatingId(userId);
      if (onUpdateUserStatus) {
        await onUpdateUserStatus(userId, 'ACTIVE');
      }
    } catch (err: any) {
      alert(err.message || '승인 실패');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleToggleSuspend = async (u: User) => {
    const next = u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    if (!confirm(next === 'SUSPENDED' ? `${u.name} 님의 이용을 정지할까요?` : `${u.name} 님의 이용 정지를 해제할까요?`)) return;
    try {
      setStatusUpdatingId(u.id);
      if (onUpdateUserStatus) {
        await onUpdateUserStatus(u.id, next);
      }
    } catch (err: any) {
      alert(err.message || '상태 변경 실패');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleAddTeamRole = async (userId: string) => {
    if (!newTeamId) return;
    try {
      if (onAssignTeamRole) {
        await onAssignTeamRole(userId, newTeamId, currentCompany.id, newTeamRole);
      }
      setTeamAssignFor(null);
    } catch (err: any) {
      alert(err.message || '팀 권한 배정 실패');
    }
  };

  const openPermEditor = (role: UserCompanyRole) => {
    setPermEditRoleId(role.id);
    setPermDraft({
      grant: new Set(role.custom_permissions?.grant || []),
      revoke: new Set(role.custom_permissions?.revoke || []),
    });
  };

  const togglePermState = (code: PermissionCode, kind: 'grant' | 'revoke') => {
    setPermDraft((prev) => {
      const grant = new Set(prev.grant);
      const revoke = new Set(prev.revoke);
      if (kind === 'grant') {
        if (grant.has(code)) grant.delete(code);
        else {
          grant.add(code);
          revoke.delete(code);
        }
      } else {
        if (revoke.has(code)) revoke.delete(code);
        else {
          revoke.add(code);
          grant.delete(code);
        }
      }
      return { grant, revoke };
    });
  };

  const savePermDraft = async () => {
    if (!permEditRoleId) return;
    try {
      setSavingPerm(true);
      if (onUpdateCustomPermissions) {
        await onUpdateCustomPermissions(permEditRoleId, Array.from(permDraft.grant), Array.from(permDraft.revoke));
      }
      setPermEditRoleId(null);
    } catch (err: any) {
      alert(err.message || '개별 권한 저장 실패');
    } finally {
      setSavingPerm(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">사용자 및 권한 관리</h1>
            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200">
              user_company_roles · user_team_roles
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            새 사용자는 승인 대기 상태로 생성되며, 관리자가 승인해야 로그인 후 실제 화면에 접근할 수 있습니다.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ 회사 권한 부여</span>
        </button>
      </div>

      {/* Pending approval queue (UI 목업 01/13) */}
      {pendingUsers.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-amber-100 bg-amber-50/60 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-amber-900">승인 대기 중인 사용자 ({pendingUsers.length}명)</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingUsers.map((u) => (
              <div key={u.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {u.name.slice(0, 1)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{u.name}</div>
                    <div className="text-slate-500 font-mono text-[11px]">{u.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(u.id)}
                    disabled={statusUpdatingId === u.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    승인
                  </button>
                  <button
                    onClick={() => handleToggleSuspend(u)}
                    disabled={statusUpdatingId === u.id}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold flex items-center gap-1 disabled:opacity-50"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    거부
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-Company Architecture Callout */}
      <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-emerald-400 text-sm">회사 권한 + 팀 권한 이중 구조</div>
            <div className="text-slate-300 mt-0.5">
              사용자는 회사 단위 역할(예: 조회자)과 별개로, 같은 회사 안의 여러 팀에 각기 다른 역할로도 배정될 수
              있습니다. 팀 역할은 그 팀의 전표에만 적용됩니다.
            </div>
          </div>
        </div>
      </div>

      {/* User List with Personas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">활성 사용자 및 권한 현황</h2>
          <span className="text-xs text-slate-400">'상세'를 눌러 팀별 권한과 개별 권한을 조정할 수 있습니다.</span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {activeUsers.map((u) => {
            const isCurrentUser = u.id === currentUserId;
            const roles = userRoles.filter((r) => r.user_id === u.id);
            const tRoles = teamRoles.filter((r) => r.user_id === u.id);
            const isExpanded = expandedUserId === u.id;
            const isSuspended = u.status === 'SUSPENDED';

            return (
              <div key={u.id} className={`transition-colors ${isCurrentUser ? 'bg-indigo-50/40' : ''}`}>
                <div className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* User info */}
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold text-sm shrink-0 ${
                          isSuspended
                            ? 'bg-slate-100 border-slate-200 text-slate-400'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        {u.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{u.name}</span>
                          <span className="font-mono text-[11px] text-slate-400">({u.email})</span>
                          {isCurrentUser && (
                            <span className="text-[10px] bg-indigo-600 text-white font-bold px-2 py-0.2 rounded-full">
                              현재 로그인 중
                            </span>
                          )}
                          {isSuspended && (
                            <span className="text-[10px] bg-rose-100 text-rose-700 font-bold px-2 py-0.2 rounded-full">
                              이용정지
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">ID: {u.id}</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <button
                        onClick={() => handleToggleSuspend(u)}
                        disabled={statusUpdatingId === u.id}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 ${
                          isSuspended
                            ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>{isSuspended ? '정지 해제' : '이용 정지'}</span>
                      </button>
                      {!isCurrentUser && (
                        <button
                          onClick={() => onSwitchUser(u.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                          <span>이 사용자로 전환</span>
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1"
                      >
                        <span>상세</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Company Access Pills */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-400">회사 권한:</span>
                    {roles.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">배정된 회사 권한이 없습니다.</span>
                    ) : (
                      roles.map((r) => {
                        const cName = companyMap.get(r.company_id) || r.company_id;
                        const isViewingThisCompany = r.company_id === currentCompany.id;
                        return (
                          <div
                            key={r.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] ${
                              isViewingThisCompany
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <span className="font-medium">{cName}</span>
                            <span className="text-slate-300">•</span>
                            {getRoleBadge(r.role_id)}
                            {r.custom_permissions &&
                              (r.custom_permissions.grant.length > 0 || r.custom_permissions.revoke.length > 0) && (
                                <span className="text-[9px] bg-purple-50 text-purple-700 px-1 py-0.2 rounded font-bold">
                                  개별조정
                                </span>
                              )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Team Role Pills (always visible summary) */}
                  {tRoles.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-400">팀 권한:</span>
                      {tRoles.map((tr) => (
                        <div
                          key={tr.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 text-sky-900 text-[11px]"
                        >
                          <span className="font-medium">{teamMap.get(tr.team_id) || tr.team_id}</span>
                          <span className="text-sky-300">•</span>
                          {getRoleBadge(tr.role_id)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expanded detail panel (섹션 32 목업: 소속/권한 + 개별 권한) */}
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
                      {/* Team role management */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-bold text-slate-700">
                            팀별 소속/권한 ({currentCompany.company_name} 기준)
                          </h3>
                          <button
                            onClick={() => setTeamAssignFor(teamAssignFor === u.id ? null : u.id)}
                            className="text-[11px] text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> 소속/권한 추가
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          {tRoles.length === 0 && (
                            <div className="text-[11px] text-slate-400 italic">이 회사에서 배정된 팀 권한이 없습니다.</div>
                          )}
                          {tRoles.map((tr) => (
                            <div
                              key={tr.id}
                              className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-3 py-2"
                            >
                              <div className="flex items-center gap-2 text-[11px]">
                                <span className="font-semibold text-slate-800">{teamMap.get(tr.team_id) || tr.team_id}</span>
                                {getRoleBadge(tr.role_id)}
                              </div>
                              <button
                                onClick={() => onRemoveTeamRole && onRemoveTeamRole(tr.id)}
                                className="text-slate-400 hover:text-rose-600"
                                title="팀 권한 제거"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>

                        {teamAssignFor === u.id && (
                          <div className="mt-2 p-3 bg-white rounded-lg border border-indigo-200 flex flex-wrap items-center gap-2 text-[11px]">
                            <select
                              value={newTeamId}
                              onChange={(e) => setNewTeamId(e.target.value)}
                              className="px-2 py-1.5 rounded-lg border border-slate-200"
                            >
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.team_name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={newTeamRole}
                              onChange={(e) => setNewTeamRole(e.target.value as RoleType)}
                              className="px-2 py-1.5 rounded-lg border border-slate-200"
                            >
                              {TEAM_SCOPED_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_DEFINITIONS[r as keyof typeof ROLE_DEFINITIONS]?.name || r}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAddTeamRole(u.id)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                            >
                              배정
                            </button>
                            <button
                              onClick={() => setTeamAssignFor(null)}
                              className="px-2 py-1.5 text-slate-500 hover:text-slate-800"
                            >
                              취소
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Individual permission override */}
                      {roles.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-slate-700 mb-2">개별 권한 조정 (회사 역할 기준)</h3>
                          <div className="space-y-2">
                            {roles.map((r) => (
                              <div key={r.id} className="bg-white rounded-lg border border-slate-200 p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-[11px]">
                                    <span className="font-semibold text-slate-800">
                                      {companyMap.get(r.company_id) || r.company_id}
                                    </span>
                                    {getRoleBadge(r.role_id)}
                                  </div>
                                  <button
                                    onClick={() => (permEditRoleId === r.id ? setPermEditRoleId(null) : openPermEditor(r))}
                                    className="text-[11px] text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                                  >
                                    <Key className="w-3 h-3" />
                                    {permEditRoleId === r.id ? '닫기' : '개별 권한 편집'}
                                  </button>
                                </div>

                                {permEditRoleId === r.id && (
                                  <div className="mt-3 border-t border-slate-100 pt-3">
                                    <div className="text-[10px] text-slate-400 mb-2">
                                      기본 권한 외에 <strong className="text-emerald-600">추가로 허용</strong>하거나{' '}
                                      <strong className="text-rose-600">제한</strong>할 항목을 선택하세요. (예: 지출
                                      입력은 허용하지만 삭제는 제한)
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 max-h-64 overflow-y-auto pr-1">
                                      {PERMISSION_DEFINITIONS.map((p) => (
                                        <div
                                          key={p.code}
                                          className="flex items-center justify-between text-[11px] py-1 border-b border-slate-50"
                                        >
                                          <span className="text-slate-700">{p.name}</span>
                                          <div className="flex items-center gap-3 shrink-0">
                                            <label className="flex items-center gap-1 text-emerald-700 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={permDraft.grant.has(p.code)}
                                                onChange={() => togglePermState(p.code, 'grant')}
                                              />
                                              허용
                                            </label>
                                            <label className="flex items-center gap-1 text-rose-700 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={permDraft.revoke.has(p.code)}
                                                onChange={() => togglePermState(p.code, 'revoke')}
                                              />
                                              제한
                                            </label>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-slate-100">
                                      <button
                                        onClick={() => setPermEditRoleId(null)}
                                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-[11px]"
                                      >
                                        취소
                                      </button>
                                      <button
                                        onClick={savePermDraft}
                                        disabled={savingPerm}
                                        className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] disabled:opacity-50"
                                      >
                                        {savingPerm ? '저장 중...' : '저장'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Assign Role Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">회사별 권한 배정 (Role Assignment)</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">대상 사용자 *</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}){u.status === 'PENDING' ? ' - 승인대기' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">배정할 회사(테넌트) *</label>
                <select
                  value={targetCompanyId}
                  onChange={(e) => setTargetCompanyId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name} ({c.company_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">부여할 직책/권한 (Role) *</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as RoleType)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-medium"
                >
                  <option value="ADMIN">회사 관리자 (ADMIN - 전표 작성, 승인, 팀/사용자/계정 관리)</option>
                  <option value="ACCOUNTANT">회계담당자 (ACCOUNTANT - 회사 전체 전표 작성 및 조회)</option>
                  <option value="TEAM_MANAGER">팀장 (TEAM_MANAGER - 팀별 배정, 확정 권한 포함)</option>
                  <option value="TEAM_ACCOUNTANT">팀 회계담당자 (TEAM_ACCOUNTANT - 팀별 배정)</option>
                  <option value="VIEWER">조회자 (VIEWER - 보고서 및 전표 조회만 가능)</option>
                </select>
                {(targetRole === 'TEAM_MANAGER' || targetRole === 'TEAM_ACCOUNTANT') && (
                  <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1.5">
                    팀장/팀 회계담당자는 특정 팀에 배정해야 실제로 동작합니다. 저장 후 사용자 상세의 "소속/권한 추가"에서
                    팀을 지정해주세요.
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50"
                >
                  {isSubmitting ? '저장 중...' : '권한 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
