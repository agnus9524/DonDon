/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Building2, User, CheckCircle, ArrowRight, Lock, Mail, Sparkles, Building, Search, PlusCircle } from 'lucide-react';
import { Company, User as UserType } from '../types';

interface LoginViewProps {
  onLogin: (emailOrId: string) => Promise<void>;
  companies: Company[];
  onRequestJoinCompany: (companyId: string, reason: string) => Promise<void>;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, companies, onRequestJoinCompany }) => {
  const [emailInput, setEmailInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Join company modal state for new users
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [selectedJoinCompanyId, setSelectedJoinCompanyId] = useState(companies[0]?.id || '');
  const [joinReason, setJoinReason] = useState('');
  const [joinEmail, setJoinEmail] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      setErrorMsg('이메일 또는 사용자 아이디를 입력해주세요.');
      return;
    }
    try {
      setIsLoading(true);
      setErrorMsg(null);
      await onLogin(emailInput.trim());
    } catch (err: any) {
      setErrorMsg(err.message || '로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (email: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      await onLogin(email);
    } catch (err: any) {
      setErrorMsg(err.message || '로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinEmail || !joinName) {
      alert('이름과 이메일을 입력해주세요.');
      return;
    }
    try {
      await onRequestJoinCompany(selectedJoinCompanyId, joinReason);
      setJoinSuccess(true);
    } catch (err: any) {
      alert(err.message || '가입 신청 실패');
    }
  };

  const filteredCompanies = companies.filter(
    (c) =>
      c.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 text-slate-100 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/50 p-6 sm:p-8 md:p-10 text-slate-900 z-10 animate-in fade-in zoom-in-95 duration-300">
        {/* Brand Header */}
        <div className="text-center space-y-2 mb-8">
          <div className="w-14 h-14 bg-indigo-600 text-amber-300 rounded-2xl mx-auto flex items-center justify-center font-black text-2xl shadow-lg ring-4 ring-indigo-600/20">
            돈
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            don don 회계 통합 관리 시스템
          </h1>
          <p className="text-sm text-slate-600 font-medium">
            멀티테넌트 법인 장부, 예산, 권한(RBAC) 통합 솔루션
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm font-semibold flex items-center gap-2 animate-in shake">
            <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0 animate-pulse" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. Google OAuth Login Button */}
        <div className="space-y-4 mb-6">
          <button
            onClick={() => handleQuickLogin('agnus9524@gmail.com')}
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-2xl border-2 border-slate-200 hover:border-indigo-500 shadow-sm transition-all flex items-center justify-center gap-3 group"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.2v3.15C3.17 21.32 7.23 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.2C.44 8.12 0 9.87 0 11.7s.44 3.58 1.2 5.12l4.08-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.23 0 3.17 2.68 1.2 6.58l4.08 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span className="text-sm sm:text-base font-bold">Google 계정으로 간편 로그인 (최고관리자)</span>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        <div className="relative flex py-2 items-center mb-6">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">
            또는 권한별 체험 계정 선택
          </span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        {/* 2. Role-Based Quick Select Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => handleQuickLogin('agnus9524@gmail.com')}
            disabled={isLoading}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-amber-500 bg-amber-50/40 hover:bg-amber-50 text-left transition-all group flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs shrink-0 shadow-xs">
              👑
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 group-hover:text-amber-900">시스템 최고관리자</div>
              <div className="text-[11px] text-slate-500 font-mono">agnus9524@gmail.com</div>
              <div className="text-[10px] text-amber-700 font-semibold mt-0.5">전체 법인 및 감사로그 총괄</div>
            </div>
          </button>

          <button
            onClick={() => handleQuickLogin('director@daechul-youth.org')}
            disabled={isLoading}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50 text-left transition-all group flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-xs">
              🏢
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-900">회사 대표관리자</div>
              <div className="text-[11px] text-slate-500 font-mono">director@daechul-youth.org</div>
              <div className="text-[10px] text-indigo-700 font-semibold mt-0.5">대철청소년회 대표/마감권한</div>
            </div>
          </button>

          <button
            onClick={() => handleQuickLogin('accountant@daechul-youth.org')}
            disabled={isLoading}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50 text-left transition-all group flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-xs">
              📑
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">본사 총괄회계</div>
              <div className="text-[11px] text-slate-500 font-mono">accountant@daechul-youth.org</div>
              <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">전표승인·은행가져오기·결산</div>
            </div>
          </button>

          <button
            onClick={() => handleQuickLogin('choi@abc-corp.kr')}
            disabled={isLoading}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50 text-left transition-all group flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-xs">
              👥
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 group-hover:text-blue-900">팀 관리자 (부서장)</div>
              <div className="text-[11px] text-slate-500 font-mono">choi@abc-corp.kr</div>
              <div className="text-[10px] text-blue-700 font-semibold mt-0.5">ABC주식회사 개발팀 예산/전표</div>
            </div>
          </button>

          <button
            onClick={() => handleQuickLogin('park@daechul-youth.org')}
            disabled={isLoading}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-teal-500 bg-teal-50/40 hover:bg-teal-50 text-left transition-all group flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-xs">
              ✍️
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 group-hover:text-teal-900">팀 회계담당자</div>
              <div className="text-[11px] text-slate-500 font-mono">park@daechul-youth.org</div>
              <div className="text-[10px] text-teal-700 font-semibold mt-0.5">청소년국 전표작성 및 증빙</div>
            </div>
          </button>

          <button
            onClick={() => handleQuickLogin('viewer@daechul-youth.org')}
            disabled={isLoading}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-slate-400 bg-slate-100/60 hover:bg-slate-100 text-left transition-all group flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-700 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-xs">
              👁️
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 group-hover:text-slate-950">일반 열람자</div>
              <div className="text-[11px] text-slate-500 font-mono">viewer@daechul-youth.org</div>
              <div className="text-[10px] text-slate-600 font-semibold mt-0.5">장부 및 결산보고서 읽기전용</div>
            </div>
          </button>
        </div>

        {/* 3. Custom Email Login Form */}
        <form onSubmit={handleCustomLogin} className="space-y-3 pt-2 border-t border-slate-100">
          <label className="block text-xs font-bold text-slate-700">이메일 계정으로 로그인</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="example@company.com 입력"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shrink-0 shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>로그인</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* 4. Company Join Request for New Users */}
        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={() => setIsJoinModalOpen(true)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
          >
            <Building className="w-3.5 h-3.5" />
            <span>처음 오셨나요? 회사 소속 선택 및 가입 신청하기</span>
          </button>
        </div>
      </div>

      {/* Company Join Request Modal */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-slate-900">
            <div className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-300" />
                <h3 className="text-base font-bold text-white">회사 소속 선택 및 가입 신청</h3>
              </div>
              <button
                onClick={() => {
                  setIsJoinModalOpen(false);
                  setJoinSuccess(false);
                }}
                className="text-slate-300 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {joinSuccess ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">회사 가입 신청이 완료되었습니다!</h4>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                    해당 법인의 관리자가 승인하면 권한이 부여되며, 등록하신 이메일로 로그인하여 장부를 이용하실 수 있습니다.
                  </p>
                  <button
                    onClick={() => {
                      setIsJoinModalOpen(false);
                      setJoinSuccess(false);
                    }}
                    className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm"
                  >
                    확인
                  </button>
                </div>
              ) : (
                <form onSubmit={handleJoinSubmit} className="space-y-4 text-xs">
                  <p className="text-slate-600 leading-relaxed">
                    근무하시는 회사(법인)를 검색하여 선택하고 가입 신청을 접수하세요. 회사의 대표관리자가 확인 후 권한을 승인합니다.
                  </p>

                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-700">1. 회사(법인) 검색 및 선택</label>
                    <div className="relative mb-2">
                      <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="회사명 또는 법인코드 검색"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50">
                      {filteredCompanies.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => setSelectedJoinCompanyId(c.id)}
                          className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                            selectedJoinCompanyId === c.id
                              ? 'bg-indigo-600 text-white font-bold shadow-xs'
                              : 'bg-white text-slate-800 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold">{c.company_name}</div>
                            <div className={`text-[10px] font-mono ${selectedJoinCompanyId === c.id ? 'text-indigo-200' : 'text-slate-500'}`}>
                              코드: {c.company_code} | 사업자번호: {c.business_number}
                            </div>
                          </div>
                          {selectedJoinCompanyId === c.id && <CheckCircle className="w-4 h-4 text-amber-300" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block font-bold text-slate-700">신청자 성명</label>
                      <input
                        type="text"
                        required
                        value={joinName}
                        onChange={(e) => setJoinName(e.target.value)}
                        placeholder="홍길동"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block font-bold text-slate-700">이메일 (로그인 ID)</label>
                      <input
                        type="email"
                        required
                        value={joinEmail}
                        onChange={(e) => setJoinEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-700">소속 부서 및 가입 사유</label>
                    <textarea
                      rows={2}
                      value={joinReason}
                      onChange={(e) => setJoinReason(e.target.value)}
                      placeholder="예: 재무회계팀 전표 담당자로 입사하였습니다. 권한 승인 부탁드립니다."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsJoinModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm"
                    >
                      가입 신청 제출
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
