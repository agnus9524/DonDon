/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Company } from '../types';
import {
  Building2,
  Plus,
  Users,
  ShieldCheck,
  CheckCircle,
  ExternalLink,
  X,
  Building,
} from 'lucide-react';

interface AdminCompanyViewProps {
  companies: (Company & { user_count?: number })[];
  currentCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  onCreateCompany: (payload: Partial<Company>) => Promise<void>;
  isSuperAdmin: boolean;
}

export const AdminCompanyView: React.FC<AdminCompanyViewProps> = ({
  companies,
  currentCompanyId,
  onSelectCompany,
  onCreateCompany,
  isSuperAdmin,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    company_code: '',
    company_name: '',
    business_number: '',
    representative_name: '',
    address: '',
    phone: '',
    email: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_code || !formData.company_name) return;
    try {
      setIsSubmitting(true);
      await onCreateCompany(formData);
      setIsAddModalOpen(false);
      setFormData({
        company_code: '',
        company_name: '',
        business_number: '',
        representative_name: '',
        address: '',
        phone: '',
        email: '',
      });
    } catch (err: any) {
      alert(err.message || '회사 생성 실패');
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
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">회사(법인) 통합 관리</h1>
            <span className="text-xs bg-amber-50 text-amber-800 font-bold px-2 py-0.5 rounded border border-amber-200">
              최고 관리자 전용
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            시스템 내에 등록된 모든 독립 법인/단체를 총괄 관리하며 새로운 회사를 등록합니다.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ 회사 추가</span>
        </button>
      </div>

      {/* Architecture Explainer Callout */}
      <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-white">단일 데이터베이스 멀티테넌트 (Logical Multi-Tenancy)</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              각 회사는 고유한 <code className="bg-slate-800 text-amber-300 px-1 py-0.2 rounded font-mono">company_id</code>를 보유하며,
              모든 전표/팀/계정과목/은행계좌가 완벽하게 분리되어 타사에 노출되지 않습니다.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">등록 법인 수:</span>
          <span className="text-lg font-bold text-amber-400 font-mono">{companies.length}개</span>
        </div>
      </div>

      {/* Companies Table matching User Prompt Mockup */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">등록 회사 목록</h2>
          <span className="text-xs text-slate-400">행을 클릭하면 해당 회사의 장부로 즉시 전환됩니다.</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px]">
                <th className="py-2.5 px-4 w-16">No</th>
                <th className="py-2.5 px-4">회사코드</th>
                <th className="py-2.5 px-5">회사명 (법인명)</th>
                <th className="py-2.5 px-4">사업자등록번호</th>
                <th className="py-2.5 px-4">대표자</th>
                <th className="py-2.5 px-4">상태</th>
                <th className="py-2.5 px-4">소속 사용자</th>
                <th className="py-2.5 px-4 text-center">장부 전환</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((c, idx) => {
                const isCurrent = c.id === currentCompanyId;
                return (
                  <tr
                    key={c.id}
                    onClick={() => onSelectCompany(c.id)}
                    className={`cursor-pointer transition-colors ${
                      isCurrent ? 'bg-indigo-50/50 font-medium' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {String(idx + 1).padStart(2, '0')}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                      {c.company_code}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{c.company_name}</span>
                        {isCurrent && (
                          <span className="text-[10px] bg-indigo-600 text-white font-bold px-1.5 py-0.2 rounded">
                            현재 선택
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs">{c.address || c.email}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700">
                      {c.business_number}
                    </td>
                    <td className="py-3.5 px-4 text-slate-800">
                      {c.representative_name}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> 정상
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 text-slate-700">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold">{c.user_count || 1}명</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCompany(c.id);
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                          isCurrent
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isCurrent ? '사용 중' : '장부 열기'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Company Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-amber-400 font-semibold">신규 테넌트 법인 등록</div>
                <h3 className="text-base font-bold text-white mt-0.5">새 회사(법인) 추가</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">회사 코드 *</label>
                  <input
                    type="text"
                    placeholder="예: COMPANY_D"
                    value={formData.company_code}
                    onChange={(e) => setFormData({ ...formData, company_code: e.target.value.toUpperCase() })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono uppercase focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">회사명 (법인명) *</label>
                  <input
                    type="text"
                    placeholder="예: (주)한국미래기술"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">사업자등록번호</label>
                  <input
                    type="text"
                    placeholder="000-00-00000"
                    value={formData.business_number}
                    onChange={(e) => setFormData({ ...formData, business_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">대표자명</label>
                  <input
                    type="text"
                    placeholder="대표자 이름"
                    value={formData.representative_name}
                    onChange={(e) => setFormData({ ...formData, representative_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">사업장 주소</label>
                <input
                  type="text"
                  placeholder="예: 서울특별시 서초구 반포대로..."
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">대표 전화</label>
                  <input
                    type="text"
                    placeholder="02-1234-5678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">대표 이메일</label>
                  <input
                    type="email"
                    placeholder="accounting@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-lg text-indigo-900 text-[11px] leading-relaxed">
                * 등록 즉시 기본 계정과목과 기본 부서가 생성되며, 로그인 사용자가 해당 회사의 관리자로 자동 배정됩니다.
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50"
                >
                  {isSubmitting ? '생성 중...' : '회사 생성 및 장부 개설'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
