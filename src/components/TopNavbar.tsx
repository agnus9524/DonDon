/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Company, User } from '../types';
import { ROLE_DEFINITIONS } from '../data/initialData';
import {
  Building2,
  ChevronDown,
  Check,
  Plus,
  Shield,
  User as UserIcon,
  RefreshCw,
  LogOut,
  Sliders,
  ExternalLink,
  Menu,
} from 'lucide-react';

interface TopNavbarProps {
  currentCompany: Company | null;
  companies: (Company & { my_role?: string })[];
  currentUser: User;
  allUsers: User[];
  currentRole: string;
  onSelectCompany: (companyId: string) => void;
  onSelectUser: (userId: string) => void;
  onOpenNewCompanyModal: () => void;
  onOpenCompanySelector: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
  onToggleMobileMenu?: () => void;
  onLogout?: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  currentCompany,
  companies,
  currentUser,
  allUsers,
  currentRole,
  onSelectCompany,
  onSelectUser,
  onOpenNewCompanyModal,
  onOpenCompanySelector,
  onRefresh,
  isLoading,
  onToggleMobileMenu,
  onLogout,
}) => {
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const companyRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (companyRef.current && !companyRef.current.contains(event.target as Node)) {
        setCompanyDropdownOpen(false);
      }
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const roleKey = (currentRole || 'VIEWER') as keyof typeof ROLE_DEFINITIONS;
  const roleInfo = ROLE_DEFINITIONS[roleKey] || ROLE_DEFINITIONS.VIEWER;

  return (
    <header className="h-16 border-b border-slate-200/80 bg-white sticky top-0 z-40 px-3 sm:px-4 md:px-6 flex items-center justify-between shadow-2xs">
      {/* Left: Hamburger + Brand + Company Switcher */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-5 min-w-0">
        {/* Mobile Hamburger Button */}
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="p-2 -ml-1 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-lg md:hidden shrink-0 transition-colors"
            aria-label="메뉴 열기"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-black text-sm tracking-tight shadow-xs">
            돈
          </div>
          <div className="hidden xs:block">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-bold text-slate-900 tracking-tight text-base">don don</span>
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded hidden sm:inline">
                Multi-Tenant
              </span>
            </div>
            <span className="text-[11px] text-slate-600 font-medium hidden sm:inline">
              통합 회계관리
            </span>
          </div>
        </div>

        <div className="h-5 w-px bg-slate-200 hidden md:block" />

        {/* Company Dropdown Trigger */}
        <div className="relative min-w-0" ref={companyRef}>
          <button
            onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50/80 hover:bg-slate-100 hover:border-slate-400 transition-all text-slate-800 text-xs sm:text-sm font-semibold shadow-2xs max-w-[130px] xs:max-w-[160px] sm:max-w-[220px]"
            title="소속 법인/회사 변경"
          >
            <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
            <span className="truncate">
              {currentCompany ? currentCompany.company_name : '회사 선택'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${companyDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Company Dropdown Menu */}
          {companyDropdownOpen && (
            <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>소속 법인 변경</span>
                <span className="text-slate-400">company_id 분리</span>
              </div>

              <div className="max-h-60 overflow-y-auto py-1">
                {companies.map((c) => {
                  const isSelected = currentCompany?.id === c.id;
                  const cRole = (c.my_role || 'VIEWER') as keyof typeof ROLE_DEFINITIONS;
                  const cRoleInfo = ROLE_DEFINITIONS[cRole] || ROLE_DEFINITIONS.VIEWER;

                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        onSelectCompany(c.id);
                        setCompanyDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-indigo-50/60 font-semibold text-indigo-900' : 'text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Building2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                        <div className="min-w-0">
                          <div className="text-xs truncate">{c.company_name}</div>
                          <div className="text-[10px] text-slate-600 font-normal">
                            {c.company_code} • {cRoleInfo.name}
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 mt-1 pt-1 px-1 space-y-0.5">
                <button
                  onClick={() => {
                    setCompanyDropdownOpen(false);
                    onOpenCompanySelector();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center gap-2 font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  전체 회사 선택 화면 열기
                </button>
                <button
                  onClick={() => {
                    setCompanyDropdownOpen(false);
                    onOpenNewCompanyModal();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-2 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />새 회사(법인) 추가 등록
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Current Company Role Badge */}
        <div className="hidden lg:flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${roleInfo.color}`}>
            <Shield className="w-3 h-3" />
            {roleInfo.name}
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            ID: {currentCompany?.id}
          </span>
        </div>
      </div>

      {/* Right: Refresh, User Switcher, Demo info */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onRefresh}
          className={`p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors ${
            isLoading ? 'animate-spin text-indigo-600' : ''
          }`}
          title="장부 데이터 새로고침"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* User Switcher Dropdown */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-slate-900 text-amber-300 flex items-center justify-center text-xs font-bold ring-1 ring-amber-400">
              {currentUser.name.slice(0, 1)}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-semibold text-slate-900 leading-tight flex items-center gap-1.5">
                <span>{currentUser.name} 님</span>
                {(currentUser.is_super_admin || currentUser.email === 'agnus9524@gmail.com') && (
                  <span className="text-[9px] bg-amber-400 text-slate-950 font-black px-1.5 py-0.5 rounded leading-none">
                    최고관리자
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 leading-tight">
                {currentUser.email}
              </div>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {userDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-900">{currentUser.name}</div>
                  {(currentUser.is_super_admin || currentUser.email === 'agnus9524@gmail.com') && (
                    <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded border border-amber-200">
                      최고관리자 (Super Admin)
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">{currentUser.email}</div>
                <div className="mt-1 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono inline-block">
                  현재 회사: {currentCompany?.company_name}
                </div>
              </div>

              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">
                사용자 전환 (멀티 권한 테스트)
              </div>

              <div className="py-1 max-h-56 overflow-y-auto">
                {allUsers.map((u) => {
                  const isCur = u.id === currentUser.id;
                  const isSuper = u.is_super_admin || u.email === 'agnus9524@gmail.com';
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        onSelectUser(u.id);
                        setUserDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                        isCur ? 'bg-indigo-50/70 font-semibold text-indigo-900' : 'text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div className="min-w-0 truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900">{u.name}</span>
                            {isSuper && (
                              <span className="text-[9px] bg-amber-400 text-slate-950 font-bold px-1 rounded">
                                최고관리자
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">{u.email}</div>
                        </div>
                      </div>
                      {isCur && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {onLogout && (
                <div className="pt-2 mt-1 border-t border-slate-100 px-3 pb-1">
                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>로그아웃 (계정 나가기)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
