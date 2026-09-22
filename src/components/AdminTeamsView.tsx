/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Company, Team } from '../types';
import { FolderGit2, Plus, CheckCircle2, X } from 'lucide-react';

interface AdminTeamsViewProps {
  currentCompany: Company;
  teams: Team[];
  userRole: string;
  onAddTeam: (name: string, code?: string) => Promise<void>;
}

export const AdminTeamsView: React.FC<AdminTeamsViewProps> = ({
  currentCompany,
  teams,
  userRole,
  onAddTeam,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> 사용중
              </span>
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
    </div>
  );
};
