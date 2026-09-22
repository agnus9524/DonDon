/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Company, User } from '../types';
import { ROLE_DEFINITIONS } from '../data/initialData';
import { Building2, ShieldCheck, ArrowRight, UserCheck, X } from 'lucide-react';

interface CompanySelectorModalProps {
  isOpen: boolean;
  onClose?: () => void;
  user: User;
  companies: (Company & { my_role?: string })[];
  currentCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  canDismiss?: boolean;
}

export const CompanySelectorModal: React.FC<CompanySelectorModalProps> = ({
  isOpen,
  onClose,
  user,
  companies,
  currentCompanyId,
  onSelectCompany,
  canDismiss = true,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header matching user prompt design */}
        <div className="bg-gradient-to-b from-slate-900 to-slate-800 text-white px-7 py-6 relative">
          {canDismiss && onClose && (
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-400 text-slate-950 font-black text-xs px-2 py-0.5 rounded tracking-wide uppercase">
              don don
            </span>
            <span className="text-slate-300 text-xs tracking-wider">통합 멀티테넌트 회계관리</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white mt-2">사용할 회사를 선택하세요</h2>
          <div className="flex items-center gap-2 mt-2 text-slate-300 text-sm">
            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-amber-300 text-xs font-semibold">
              {user.name.slice(0, 1)}
            </div>
            <span className="font-medium text-white">{user.name} 님</span>
            <span className="text-slate-400 text-xs">({user.email})</span>
          </div>
        </div>

        {/* Company Selection List */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-3 bg-slate-50/50">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            접근 가능한 소속 법인 / 회사 ({companies.length}개)
          </div>

          {companies.map((comp) => {
            const isSelected = comp.id === currentCompanyId;
            const roleKey = (comp.my_role || 'VIEWER') as keyof typeof ROLE_DEFINITIONS;
            const roleInfo = ROLE_DEFINITIONS[roleKey] || ROLE_DEFINITIONS.VIEWER;

            return (
              <button
                key={comp.id}
                onClick={() => {
                  onSelectCompany(comp.id);
                  if (onClose) onClose();
                }}
                className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-200'
                        : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                    }`}
                  >
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {comp.company_name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {comp.company_code}
                      </span>
                      {isSelected && (
                        <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                          현재 사용중
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span>사업자: {comp.business_number}</span>
                      <span>•</span>
                      <span>대표: {comp.representative_name}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${roleInfo.color}`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        {roleInfo.name}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                        {roleInfo.description}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pl-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-0.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-700'
                    }`}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Security / Isolation notice footer */}
        <div className="px-6 py-4 bg-slate-100/70 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>멀티테넌트 데이터 논리적 완전 격리 (company_id 자동 제어)</span>
          </div>
          {canDismiss && onClose && (
            <button
              onClick={onClose}
              className="text-slate-600 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-200/60"
            >
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
