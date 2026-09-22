/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Company } from '../types';
import { PERMISSION_DEFINITIONS, ROLE_PERMISSIONS, ROLE_DEFINITIONS } from '../data/initialData';
import { ShieldCheck, Check, Minus, Users2 } from 'lucide-react';

interface AdminPermissionsViewProps {
  currentCompany: Company;
}

const ROLE_ORDER: (keyof typeof ROLE_DEFINITIONS)[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'ACCOUNTANT',
  'TEAM_MANAGER',
  'TEAM_ACCOUNTANT',
  'VIEWER',
];

export const AdminPermissionsView: React.FC<AdminPermissionsViewProps> = ({ currentCompany }) => {
  const groups = Array.from(new Set(PERMISSION_DEFINITIONS.map((p) => p.group)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">권한 설정 (역할별 기본 권한)</h1>
          <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200">
            role_permissions
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          역할(Role)마다 어떤 기능을 사용할 수 있는지 한눈에 보여주는 기준표입니다. 개별 사용자에 대한 예외(추가/제한)는{' '}
          <strong className="text-slate-700">사용자 관리 &rarr; 사용자 상세</strong>에서 설정합니다.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-slate-900 text-white flex items-start gap-3 text-xs">
        <div className="w-10 h-10 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold text-amber-400 text-sm">역할은 회사(company_id) 또는 팀(team_id) 단위로 배정됩니다</div>
          <div className="text-slate-300 mt-0.5 leading-relaxed">
            ADMIN · ACCOUNTANT · VIEWER는 회사 전체 범위로 배정되는 것이 기본이고, TEAM_MANAGER · TEAM_ACCOUNTANT는
            배정된 팀의 전표에만 접근할 수 있도록 범위가 제한됩니다. 같은 사람이 팀마다 다른 역할을 가질 수도 있습니다
            (예: 청소년국-회계담당자, 중앙본부-조회자).
          </div>
        </div>
      </div>

      {/* Role legend */}
      <div className="flex flex-wrap gap-2">
        {ROLE_ORDER.map((key) => {
          const info = ROLE_DEFINITIONS[key];
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${info.color}`}
              title={info.description}
            >
              <Users2 className="w-3 h-3" />
              {info.name}
            </span>
          );
        })}
      </div>

      {/* Matrix */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-semibold text-[11px]">
                <th className="py-2.5 px-4 sticky left-0 bg-slate-50/95 backdrop-blur-xs">기능 / 권한</th>
                {ROLE_ORDER.map((key) => (
                  <th key={key} className="py-2.5 px-3 text-center whitespace-nowrap">
                    {ROLE_DEFINITIONS[key].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map((group) => (
                <React.Fragment key={group}>
                  <tr className="bg-slate-50/60">
                    <td colSpan={ROLE_ORDER.length + 1} className="py-1.5 px-4 text-[11px] font-bold text-slate-500">
                      {group}
                    </td>
                  </tr>
                  {PERMISSION_DEFINITIONS.filter((p) => p.group === group).map((perm) => (
                    <tr key={perm.code} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-4 sticky left-0 bg-white font-medium text-slate-800">
                        {perm.name}
                        <div className="text-[10px] text-slate-400 font-mono">{perm.code}</div>
                      </td>
                      {ROLE_ORDER.map((roleKey) => {
                        const has = ROLE_PERMISSIONS[roleKey].includes(perm.code);
                        return (
                          <td key={roleKey} className="py-2.5 px-3 text-center">
                            {has ? (
                              <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                            ) : (
                              <Minus className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        {currentCompany.company_name} 기준 화면이지만, 이 매트릭스는 모든 회사에 공통으로 적용되는 역할 기본값입니다.
      </p>
    </div>
  );
};
