/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ArrowRight, KeyRound, ShieldCheck, Wrench } from 'lucide-react';
import { AuthConfig } from '../types';

interface LoginViewProps {
  // 서버가 알려주는 로그인 가능 방식 (불러오는 중이면 null)
  authConfig: AuthConfig | null;
  // 브라우저 쪽 firebase-applet-config.json이 채워졌는지
  isFirebaseConfigured: boolean;
  onGoogleLogin: () => Promise<void>;
  onDevLogin: (email: string) => void;
}

// Firebase 팝업 오류를 사용자가 이해할 수 있는 말로 바꾼다
function describeLoginError(err: any): string | null {
  const code = String(err?.code || '');
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
  if (code === 'auth/popup-blocked') return '브라우저가 로그인 팝업을 막았습니다. 팝업 차단을 해제한 뒤 다시 시도해 주세요.';
  if (code === 'auth/unauthorized-domain')
    return '이 주소는 Firebase에 승인된 도메인이 아닙니다. Firebase 콘솔 > Authentication > 설정 > 승인된 도메인에 현재 주소를 추가해 주세요.';
  if (code === 'auth/operation-not-allowed')
    return 'Firebase 콘솔 > Authentication > 로그인 방법에서 Google 로그인을 사용 설정해 주세요.';
  if (code === 'auth/network-request-failed') return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
  return err?.message || '로그인에 실패했습니다.';
}

export const LoginView: React.FC<LoginViewProps> = ({ authConfig, isFirebaseConfigured, onGoogleLogin, onDevLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState('');

  const googleReady = isFirebaseConfigured && !!authConfig?.firebase_configured;

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      await onGoogleLogin();
    } catch (err: any) {
      setErrorMsg(describeLoginError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!devEmail.trim()) return;
    onDevLogin(devEmail);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 text-slate-100 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/50 p-6 sm:p-8 md:p-10 text-slate-900 z-10 animate-in fade-in zoom-in-95 duration-300">
        {/* Brand Header */}
        <div className="text-center space-y-2 mb-8">
          <div className="w-14 h-14 bg-indigo-600 text-amber-300 rounded-2xl mx-auto flex items-center justify-center font-black text-2xl shadow-lg ring-4 ring-indigo-600/20">
            돈
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">돈돈 회계관리 프로그램</h1>
          <p className="text-sm text-slate-600 font-medium">Google 계정으로 로그인해 주세요.</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm font-semibold flex items-start gap-2">
            <span className="w-2 h-2 mt-1.5 rounded-full bg-rose-600 shrink-0 animate-pulse" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Google 로그인 */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading || !googleReady}
          className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-2xl border-2 border-slate-200 hover:border-indigo-500 shadow-sm transition-all flex items-center justify-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-200"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.2v3.15C3.17 21.32 7.23 24 12 24z" />
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.2C.44 8.12 0 9.87 0 11.7s.44 3.58 1.2 5.12l4.08-3.15z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.23 0 3.17 2.68 1.2 6.58l4.08 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
          </svg>
          <span className="text-sm sm:text-base font-bold text-slate-800">
            {isLoading ? '로그인 중...' : 'Google 계정으로 로그인'}
          </span>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Firebase 미설정 안내 */}
        {authConfig && !googleReady && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs leading-relaxed space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              Google 로그인 설정이 아직 끝나지 않았습니다
            </div>
            <p>
              프로젝트 폴더의 <code className="font-mono font-bold">firebase-applet-config.json</code> 파일에 돈돈 전용
              Firebase 프로젝트의 설정값을 넣고 서버를 다시 시작해 주세요.
            </p>
          </div>
        )}

        {/* 이용 안내 */}
        <div className="mt-8 space-y-3 text-xs text-slate-600 leading-relaxed">
          <div className="flex items-start gap-2.5">
            <KeyRound className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p>
              <strong className="text-slate-900">회사 대표 관리자</strong>는 로그인 후 발급받은 인증키를 입력하면 회사가
              등록되고 프로그램이 활성화됩니다.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              <strong className="text-slate-900">직원</strong>은 로그인 후 회사 코드로 가입을 신청하고, 대표 관리자의
              승인을 받으면 사용할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 개발용 로그인 (서버에서 DONDON_DEV_LOGIN=true 일 때만 보임) */}
        {authConfig?.dev_login && (
          <form onSubmit={handleDevSubmit} className="mt-8 p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 space-y-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">개발용 로그인 (운영에서는 꺼짐)</div>
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                placeholder="name@example.com"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-indigo-600"
              />
              <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold shrink-0">
                입장
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
