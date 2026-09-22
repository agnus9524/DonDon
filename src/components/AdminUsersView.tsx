/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, Company, UserCompanyRole, RoleType } from '../types';
import { Users, Shield, CheckCircle2, UserCheck, Key, Plus, X, ArrowRight } from 'lucide-react';

interface AdminUsersViewProps {
  users: User[];
  companies: Company[];
  userRoles: UserCompanyRole[];
  currentCompany: Company;
  currentUserId: string;
  onSwitchUser: (userId: string) => void;
  onAssignRole: (userId: string, companyId: string, role: RoleType) => Promise<void>;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  users,
  companies,
  userRoles,
  currentCompany,
  currentUserId,
  onSwitchUser,
  onAssignRole,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || '');
  const [targetCompanyId, setTargetCompanyId] = useState(currentCompany.id);
  const [targetRole, setTargetRole] = useState<RoleType>('ACCOUNTANT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const companyMap = new Map(companies.map((c) => [c.id, c.company_name]));

  const getRoleBadge = (role: RoleType) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded">최고총괄관리자</span>;
      case 'ADMIN':
        return <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded">법인 관리자</span>;
      case 'ACCOUNTANT':
        return <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">회계담당자</span>;
      case 'TEAM_ACCOUNTANT':
        return <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded">부서회계담당</span>;
      case 'VIEWER':
        return <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded">단순열람자</span>;
      default:
        return <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{role}</span>;
    }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">사용자 및 다중 회사 권한 관리</h1>
            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200">
              user_company_roles 다대다 매핑
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            사용자는 하나의 ID로 로그인하여 권한이 부여된 회사에만 안전하게 접근할 수 있습니다.
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

      {/* Cross-Company Architecture Callout */}
      <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-emerald-400 text-sm">다중 테넌트 권한 매핑 (Multi-Company Role Architecture)</div>
            <div className="text-slate-300 mt-0.5">
              사용자 한 명이 여러 회사에 각기 다른 직책으로 등록될 수 있습니다. 예: 대철청소년회에서는 관리자, ABC주식회사에서는 회계담당자.
            </div>
          </div>
        </div>
      </div>

      {/* User List with Personas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">시스템 사용자 및 회사별 권한 현황</h2>
          <span className="text-xs text-slate-400">오른쪽 '계정 전환' 버튼으로 다른 사용자 권한을 즉시 테스트할 수 있습니다.</span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {users.map((u) => {
            const isCurrentUser = u.id === currentUserId;
            const roles = userRoles.filter((r) => r.user_id === u.id);

            return (
              <div key={u.id} className={`p-4 transition-colors ${isCurrentUser ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* User info */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm shrink-0">
                      {u.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{u.name}</span>
                        <span className="font-mono text-[11px] text-slate-400">({u.email})</span>
                        {isCurrentUser && (
                          <span className="text-[10px] bg-indigo-600 text-white font-bold px-2 py-0.2 rounded-full">
                            현재 로그인 중
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">ID: {u.id}</div>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex items-center gap-2 self-end md:self-auto">
                    {!isCurrentUser && (
                      <button
                        onClick={() => onSwitchUser(u.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                        <span>이 사용자로 전환</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Company Access Pills */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400">접근 허용 회사:</span>
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
                        </div>
                      );
                    })
                  )}
                </div>
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
                      {u.name} ({u.email})
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
                  <option value="ADMIN">법인 관리자 (ADMIN - 전표 작성, 승인, 팀/계정 관리)</option>
                  <option value="ACCOUNTANT">일반 회계담당자 (ACCOUNTANT - 전표 작성 및 조회)</option>
                  <option value="TEAM_ACCOUNTANT">부서 회계담당자 (TEAM_ACCOUNTANT - 소속 팀 전표 관리)</option>
                  <option value="VIEWER">단순 열람자 (VIEWER - 보고서 및 전표 조회만 가능)</option>
                </select>
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
