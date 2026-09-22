/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Company, AuditLog } from '../types';
import { Shield, Search, RefreshCw, FileText, CheckCircle2, History } from 'lucide-react';

interface AuditLogsViewProps {
  currentCompany: Company;
  userRole: string;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ currentCompany, userRole }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [currentCompany.id]);

  const filteredLogs = logs.filter((log) => {
    if (selectedAction !== 'ALL' && log.action !== selectedAction) return false;
    if (keyword) {
      const q = keyword.toLowerCase();
      return (
        (log.user_name || '').toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.entity_type.toLowerCase().includes(q) ||
        log.entity_id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800 ring-1 ring-blue-200';
      case 'DELETE':
        return 'bg-rose-100 text-rose-800 ring-1 ring-rose-200';
      case 'CLOSE_PERIOD':
        return 'bg-purple-100 text-purple-800 ring-1 ring-purple-200';
      case 'IMPORT':
        return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            감사 로그 및 작업 이력 (Audit Logs)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {currentCompany.company_name}의 전표 생성, 수정, 삭제, 마감 제어 및 권한 변경 이력이 투명하게 보관됩니다.
          </p>
        </div>
        <button
          onClick={loadLogs}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="작업자, 대상ID, 유형 검색..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:bg-white"
          >
            <option value="ALL">모든 작업 유형</option>
            <option value="CREATE">신규 생성 (CREATE)</option>
            <option value="UPDATE">변경 수정 (UPDATE)</option>
            <option value="DELETE">삭제 (DELETE)</option>
            <option value="CLOSE_PERIOD">회계마감 (CLOSE_PERIOD)</option>
            <option value="IMPORT">일괄가져오기 (IMPORT)</option>
          </select>
        </div>
        <div className="text-slate-500 text-xs">
          조회 결과: <strong className="text-slate-900">{filteredLogs.length}</strong>건
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/70 text-slate-400 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-6 py-3">일시</th>
                <th className="px-6 py-3">작업 유형</th>
                <th className="px-6 py-3">대상 엔터티</th>
                <th className="px-6 py-3">작업자</th>
                <th className="px-6 py-3">변경 상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3.5 text-slate-500 font-sans">
                    {new Date(log.created_at).toLocaleString('ko-KR')}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getActionBadge(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 font-bold text-slate-800">
                    <div className="flex items-center gap-1.5 font-sans">
                      <span className="text-slate-900 font-bold">{log.entity_type}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({log.entity_id})</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 font-sans font-medium text-slate-700">
                    {log.user_name}
                  </td>
                  <td className="px-6 py-3.5 max-w-xs truncate text-slate-500">
                    {log.after_data ? (
                      <span title={JSON.stringify(log.after_data, null, 2)}>
                        {typeof log.after_data === 'object'
                          ? Object.keys(log.after_data)
                              .slice(0, 3)
                              .map((k) => `${k}: ${JSON.stringify(log.after_data[k])}`)
                              .join(', ')
                          : String(log.after_data)}
                      </span>
                    ) : (
                      log.before_data ? '삭제된 데이터' : '-'
                    )}
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400 font-sans text-xs">
                    기록된 감사 로그가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
