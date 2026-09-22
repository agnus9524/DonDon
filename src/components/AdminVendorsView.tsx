/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Company, Vendor } from '../types';
import { Briefcase, Plus, Search, Building2, X } from 'lucide-react';

interface AdminVendorsViewProps {
  currentCompany: Company;
  vendors: Vendor[];
  userRole: string;
  onAddVendor: (payload: Partial<Vendor>) => Promise<void>;
}

export const AdminVendorsView: React.FC<AdminVendorsViewProps> = ({
  currentCompany,
  vendors,
  userRole,
  onAddVendor,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    vendor_name: '',
    business_number: '',
    representative: '',
    category: '',
    phone: '',
    email: '',
  });

  const filtered = vendors.filter((v) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        v.vendor_name.toLowerCase().includes(q) ||
        (v.business_number && v.business_number.includes(q)) ||
        (v.representative && v.representative.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vendor_name) return;
    try {
      setIsSubmitting(true);
      await onAddVendor(formData);
      setIsModalOpen(false);
      setFormData({
        vendor_name: '',
        business_number: '',
        representative: '',
        category: '',
        phone: '',
        email: '',
      });
    } catch (err: any) {
      alert(err.message || '거래처 등록 실패');
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
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">거래처 관리 (Vendors)</h1>
            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200">
              company: {currentCompany.company_code}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentCompany.company_name}의 매입/매출 거래처 및 협력사를 독립적으로 관리합니다.
          </p>
        </div>

        {userRole !== 'VIEWER' && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>+ 거래처 등록</span>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="상호명, 사업자번호, 대표자명 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>
        <span className="text-xs text-slate-500">
          총 <strong className="font-mono text-slate-900">{filtered.length}</strong>개 거래처
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px]">
              <th className="py-2.5 px-4">상호명 (거래처명)</th>
              <th className="py-2.5 px-4">사업자등록번호</th>
              <th className="py-2.5 px-4">대표자</th>
              <th className="py-2.5 px-4">업종/품목</th>
              <th className="py-2.5 px-4">연락처/이메일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  등록된 거래처가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-bold text-slate-800">{v.vendor_name}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{v.business_number || '-'}</td>
                  <td className="py-3 px-4 text-slate-700">{v.representative || '-'}</td>
                  <td className="py-3 px-4 text-slate-500">{v.category || '-'}</td>
                  <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                    {v.phone || v.email || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Vendor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">신규 거래처 등록</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">상호명 (거래처명) *</label>
                <input
                  type="text"
                  placeholder="예: (주)오피스알파"
                  value={formData.vendor_name}
                  onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">사업자등록번호</label>
                  <input
                    type="text"
                    placeholder="123-45-67890"
                    value={formData.business_number}
                    onChange={(e) => setFormData({ ...formData, business_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">대표자명</label>
                  <input
                    type="text"
                    placeholder="홍길동"
                    value={formData.representative}
                    onChange={(e) => setFormData({ ...formData, representative: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">업종 / 품목</label>
                <input
                  type="text"
                  placeholder="예: 사무용품 도소매, 클라우드 호스팅 서비스"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">연락처</label>
                  <input
                    type="text"
                    placeholder="02-123-4567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">이메일</label>
                  <input
                    type="email"
                    placeholder="tax@vendor.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
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
                  {isSubmitting ? '등록 중...' : '거래처 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
