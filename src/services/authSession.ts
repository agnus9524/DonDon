/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 로그인 세션 — 돈돈 전용 Firebase 프로젝트의 Google 로그인을 사용한다.
// 서버는 여기서 받은 ID 토큰을 직접 검증하므로, 브라우저가 "나는 누구다"라고 주장하는 값은 쓰지 않는다.

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// firebase-applet-config.json에 실제 값이 채워졌는지 여부
export const isFirebaseConfigured =
  !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_') && !firebaseConfig.projectId.startsWith('YOUR_');

const firebaseAuth = isFirebaseConfigured ? getAuth(initializeApp(firebaseConfig)) : null;

// 개발용 로그인(서버에서 DONDON_DEV_LOGIN=true 일 때만 통과)의 이메일. 탭을 닫으면 사라진다.
const DEV_EMAIL_KEY = 'dondon_dev_login_email';
const readDevEmail = (): string | null => {
  try {
    return sessionStorage.getItem(DEV_EMAIL_KEY);
  } catch {
    return null;
  }
};

type SessionListener = (signedIn: boolean) => void;
const listeners = new Set<SessionListener>();
const notify = () => {
  const signedIn = isSignedIn();
  listeners.forEach((fn) => fn(signedIn));
};

export function isSignedIn(): boolean {
  return !!firebaseAuth?.currentUser || !!readDevEmail();
}

// 로그인 상태 변화를 구독한다. 처음 상태가 확정되면 곧바로 한 번 호출된다.
export function watchSession(listener: SessionListener): () => void {
  listeners.add(listener);
  let unsubscribeFirebase = () => {};
  if (firebaseAuth) {
    unsubscribeFirebase = onAuthStateChanged(firebaseAuth, () => listener(isSignedIn()));
  } else {
    listener(isSignedIn());
  }
  return () => {
    listeners.delete(listener);
    unsubscribeFirebase();
  };
}

export async function loginWithGoogle(): Promise<void> {
  if (!firebaseAuth) {
    throw new Error('Firebase가 아직 설정되지 않았습니다. firebase-applet-config.json을 먼저 채워 주세요.');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(firebaseAuth, provider);
}

export function loginDev(email: string): void {
  sessionStorage.setItem(DEV_EMAIL_KEY, email.trim().toLowerCase());
  notify();
}

export async function logout(): Promise<void> {
  try {
    sessionStorage.removeItem(DEV_EMAIL_KEY);
  } catch {
    // sessionStorage를 쓸 수 없는 환경이면 무시
  }
  if (firebaseAuth?.currentUser) {
    await signOut(firebaseAuth);
  }
  notify();
}

// 서버 요청에 붙일 Authorization 헤더 값. ID 토큰은 만료가 가까우면 자동으로 새로 받아진다.
export async function getAuthorizationHeader(): Promise<string | null> {
  if (firebaseAuth?.currentUser) {
    return `Bearer ${await firebaseAuth.currentUser.getIdToken()}`;
  }
  const devEmail = readDevEmail();
  return devEmail ? `Dev ${devEmail}` : null;
}
