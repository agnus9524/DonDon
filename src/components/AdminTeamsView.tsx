/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Company, Team } from '../types';
import { FolderGit2, Plus, CheckCircle2, X, Trash2, AlertTriangle } from 'lucide-react';

interface AdminTeamsViewProps {
  currentCompany: Company;
  teams: Team[];
  userRole: string;
  onAddTeam: (name: string, code?: string) => Promise<void>;
  onDeleteTeam?: (teamId: string) => Promise<void>;
}

export const AdminTeamsView: React.FC<AdminTeamsViewProps> = ({
  currentCompany,
  teams,
  userRole,
  onAddTeam,
  onDeleteTeam,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [deleteConfirmTeamName, setDeleteConfirmTeamName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName) return;
    try {
      setIsSubmitting(true);
      await onAddTeam(teamName, teamCode);
      setIsModalOpen(false);
      setTeamName('');
      setTeamCode('');
    } catch (err: any) {
      alert(err.message || '팀 추가 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTeam || !onDeleteTeam) return;
    try {
      setIsDeleting(true);
      await onDeleteTeam(deletingTeam.id);
      setDeletingTeam(null);
    } catch (err: any) {
      alert(err.message || '팀 삭제 실패');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">팀 · 부서 관리 (Teams)</h1>
            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200">
              company: {currentCompany.company_code}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentCompany.company_name} 내부의 조직 부서 및 사업팀을 관리합니다.
          </p>
        </div>

        {userRole !== 'VIEWER' && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>+ 팀(부서) 추가</span>
          </button>
        )}
      </div>

      {/* Grid of Teams */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((t) => (
          <div
            key={t.id}
            className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                  <FolderGit2 className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{t.team_name}</h3>
                  <span className="font-mono text-xs text-slate-400">{t.team_code}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> 사용중
                </span>
                {userRole !== 'VIEWER' && onDeleteTeam && (
                  <button
                    onClick={() => setDeletingTeam(t)}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                    title={`${t.team_name} 삭제`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
              <span>company_id:</span>
              <span className="font-mono text-slate-700">{t.company_id}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Team Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">새 팀/부서 추가</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">소속 법인</label>
                <div className="p-2.5 rounded-lg bg-slate-100 font-bold text-slate-800">
                  {currentCompany.company_name} ({currentCompany.company_code})
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">팀/부서명 *</label>
                <input
                  type="text"
                  placeholder="예: 청소년국, 개발팀, 기획재정팀"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">팀 코드 (영문/식별자)</label>
                <input
                  type="text"
                  placeholder="예: TEAM_DEV, DEPT_YOUTH"
                  value={teamCode}
                  onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 uppercase font-mono focus:outline-none focus:border-indigo-500"
                />
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
                  {isSubmitting ? '추가 중...' : '부서 추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Team Confirmation Modal */}
      {deletingTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
            <div className="bg-rose-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-300" />
                <h3 className="text-base font-bold text-white">팀/부서 삭제 확인</h3>
              </div>
              <button
                onClick={() => setDeletingTeam(null)}
                className="text-rose-200 hover:text-white"
                disabled={isDeleting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900">
                <div className="font-bold text-sm text-rose-800">
                  {deletingTeam.team_name} ({deletingTeam.team_code})
                </div>
                <p className="text-rose-700 text-[11px] mt-1 leading-relaxed">
                  이 팀/부서를 삭제하면 연동된 예산 및 부서 권한 정보가 정리됩니다.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 leading-snug">
                  오삭제 방지를 위해 팀명{' '}
                  <span className="font-black text-rose-700 bg-rose-100/80 px-1.5 py-0.5 rounded select-all">
                    {deletingTeam.team_name}
                  </span>
                  을(를) 아래에 정확히 입력해 주세요.
                </label>

                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={deleteConfirmTeamName}
                    onChange={(e) => setDeleteConfirmTeamName(e.target.value)}
                    placeholder={`"${deletingTeam.team_name}" 입력`}
                    disabled={isDeleting}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-base sm:text-sm font-semibold focus:outline-none transition-all ${
                      deleteConfirmTeamName.trim() === deletingTeam.team_name.trim()
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30 text-emerald-950'
                        : deleteConfirmTeamName
                        ? 'border-rose-300 ring-2 ring-rose-300/20 bg-rose-50/10 text-slate-900'
                        : 'border-slate-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-slate-900'
                    }`}
                  />
                  {deleteConfirmTeamName.trim() === deletingTeam.team_name.trim() && (
                    <span className="absolute right-3 top-2.5 text-emerald-600 flex items-center gap-1 text-[11px] font-bold">
                      <CheckCircle2 className="w-4 h-4" /> 확인 완료
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingTeam(null);
                    setDeleteConfirmTeamName('');
                  }}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting || deleteConfirmTeamName.trim() !== deletingTeam.team_name.trim()}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? '삭제 중...' : '팀 영구 삭제'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
