/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 돈돈 데이터 영구 저장소
//
// 배포 서비스는 새로 배포할 때마다 서버 디스크를 지우므로, 운영에서는 데이터를
// Firebase Firestore에 저장한다. (FIREBASE_SERVICE_ACCOUNT 환경변수가 있으면 Firestore, 없으면 로컬 파일)
//
// Firestore 저장 구조 (컬렉션 dondon_store)
//   meta                 : { version, chunk_count, byte_length, saved_at, counts }
//   v{version}_{i}       : { data: <압축된 스냅샷 조각(bytes)> }
// 새 버전 조각과 meta를 한 번의 batch로 함께 써서, 저장 도중 실패해도 이전 데이터가 그대로 남는다.
// 하루에 한 번 dondon_backups/{YYYY-MM-DD} 에 백업 사본도 남기고, 30일이 지난 백업은 지운다.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';

export type Snapshot = Record<string, unknown>;

export interface SnapshotStore {
  readonly mode: 'firestore' | 'file';
  readonly description: string;
  load(): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
}

// ────────────────────────────────────────────────────────────────
// 로컬 파일 저장 (개발용 / 영구 디스크가 있는 서버용)
// ────────────────────────────────────────────────────────────────

export class FileSnapshotStore implements SnapshotStore {
  readonly mode = 'file' as const;
  constructor(private readonly file: string) {}

  get description() {
    return this.file;
  }

  async load(): Promise<Snapshot | null> {
    if (!fs.existsSync(this.file)) return null;
    return JSON.parse(fs.readFileSync(this.file, 'utf-8'));
  }

  async save(snapshot: Snapshot): Promise<void> {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, this.file);
  }
}

// ────────────────────────────────────────────────────────────────
// Firestore 저장 (운영용)
// ────────────────────────────────────────────────────────────────

// firebase-admin Firestore 중 여기서 쓰는 부분만 (테스트에서 가짜로 바꿔 끼울 수 있게)
export interface FirestoreLike {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): any }>;
      delete(): Promise<unknown>;
    };
    listDocuments(): Promise<{ id: string; delete(): Promise<unknown> }[]>;
  };
  batch(): {
    set(ref: any, data: any): unknown;
    delete(ref: any): unknown;
    commit(): Promise<unknown>;
  };
}

const STORE_COLLECTION = 'dondon_store';
const BACKUP_COLLECTION = 'dondon_backups';
const CHUNK_BYTES = 900 * 1024; // Firestore 문서 한도(1MiB)보다 작게
const MAX_BATCH_BYTES = 9 * 1024 * 1024; // 한 번에 보낼 수 있는 요청 한도(10MiB)보다 작게
const BACKUP_KEEP_DAYS = 30;

function splitChunks(buf: Buffer): Buffer[] {
  const chunks: Buffer[] = [];
  for (let i = 0; i < buf.length; i += CHUNK_BYTES) chunks.push(buf.subarray(i, i + CHUNK_BYTES));
  return chunks.length ? chunks : [Buffer.alloc(0)];
}

function countRecords(snapshot: Snapshot): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (Array.isArray(value)) counts[key] = value.length;
  }
  return counts;
}

export class FirestoreSnapshotStore implements SnapshotStore {
  readonly mode = 'firestore' as const;
  private lastBackupDay = '';

  constructor(
    private readonly firestore: FirestoreLike,
    readonly description: string,
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10)
  ) {}

  async load(): Promise<Snapshot | null> {
    const col = this.firestore.collection(STORE_COLLECTION);
    const meta = await col.doc('meta').get();
    if (!meta.exists) return null;
    const { version, chunk_count, byte_length } = meta.data();
    const parts: Buffer[] = [];
    for (let i = 0; i < chunk_count; i++) {
      const chunk = await col.doc(`v${version}_${i}`).get();
      if (!chunk.exists) throw new Error(`저장 데이터 조각이 없습니다 (v${version}_${i})`);
      parts.push(Buffer.from(chunk.data().data));
    }
    const packed = Buffer.concat(parts);
    if (typeof byte_length === 'number' && packed.length !== byte_length) {
      throw new Error('저장 데이터 크기가 맞지 않습니다');
    }
    return JSON.parse(zlib.gunzipSync(packed).toString('utf-8'));
  }

  async save(snapshot: Snapshot): Promise<void> {
    const col = this.firestore.collection(STORE_COLLECTION);
    const packed = zlib.gzipSync(Buffer.from(JSON.stringify(snapshot), 'utf-8'));
    if (packed.length > MAX_BATCH_BYTES) {
      throw new Error(`저장할 데이터가 너무 큽니다 (${Math.round(packed.length / 1024 / 1024)}MB)`);
    }
    const chunks = splitChunks(packed);
    const previousSnap = await col.doc('meta').get();
    const previous = previousSnap.exists ? { ...previousSnap.data() } : null;
    const version = `${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
    const meta = {
      version,
      chunk_count: chunks.length,
      byte_length: packed.length,
      saved_at: new Date().toISOString(),
      counts: countRecords(snapshot),
    };

    // 새 조각 + meta 교체를 한 번에 (실패하면 아무것도 바뀌지 않음)
    const batch = this.firestore.batch();
    chunks.forEach((chunk, i) => batch.set(col.doc(`v${version}_${i}`), { data: chunk }));
    batch.set(col.doc('meta'), meta);
    await batch.commit();

    // 이전 버전 조각 정리 (실패해도 데이터에는 영향 없음)
    if (previous && previous.version !== version) {
      const old = previous;
      const cleanup = this.firestore.batch();
      for (let i = 0; i < (old.chunk_count || 0); i++) cleanup.delete(col.doc(`v${old.version}_${i}`));
      await cleanup.commit().catch((err) => console.warn('[storage] 이전 조각 정리 실패(무시):', err?.message || err));
    }

    await this.backupOncePerDay(chunks, meta).catch((err) =>
      console.warn('[storage] 일일 백업 실패(다음 저장 때 다시 시도):', err?.message || err)
    );
  }

  // 하루 한 번 백업 사본 저장 + 오래된 백업 삭제
  private async backupOncePerDay(chunks: Buffer[], meta: Record<string, unknown>) {
    const day = this.today();
    if (this.lastBackupDay === day) return;
    const col = this.firestore.collection(BACKUP_COLLECTION);
    const existing = await col.doc(`${day}_meta`).get();
    if (!existing.exists) {
      const batch = this.firestore.batch();
      chunks.forEach((chunk, i) => batch.set(col.doc(`${day}_${i}`), { data: chunk }));
      batch.set(col.doc(`${day}_meta`), { ...meta, backup_day: day });
      await batch.commit();
      console.log(`[storage] ${day} 백업을 저장했습니다.`);
    }
    this.lastBackupDay = day;

    const cutoff = new Date(Date.parse(`${day}T00:00:00Z`) - BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const docs = await col.listDocuments();
    await Promise.all(docs.filter((d) => d.id.slice(0, 10) < cutoff).map((d) => d.delete()));
  }
}

// ────────────────────────────────────────────────────────────────
// 환경에 맞는 저장소 고르기
// ────────────────────────────────────────────────────────────────

// FIREBASE_SERVICE_ACCOUNT: Firebase 서비스 계정 키(JSON) 내용 그대로, 또는 base64로 인코딩한 값
export function parseServiceAccount(raw: string | undefined): Record<string, any> | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const candidates = [text];
  if (!text.startsWith('{')) {
    try {
      candidates.push(Buffer.from(text, 'base64').toString('utf-8'));
    } catch {
      // base64가 아니면 무시
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && parsed.private_key && parsed.client_email) {
        // 환경변수에 넣으면서 줄바꿈이 \\n 글자로 바뀐 경우를 되돌린다
        parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
        return parsed;
      }
    } catch {
      // 다음 후보 시도
    }
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT 값을 읽을 수 없습니다. Firebase에서 받은 서비스 계정 키(JSON) 내용 전체를 넣어 주세요.');
}

export async function createSnapshotStore(options: {
  dataFile: string;
  serviceAccountRaw?: string;
  firestoreDatabaseId?: string;
}): Promise<SnapshotStore> {
  const serviceAccount = parseServiceAccount(options.serviceAccountRaw);
  if (!serviceAccount) return new FileSnapshotStore(options.dataFile);

  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = initializeApp({ credential: cert(serviceAccount as any) }, 'dondon-storage');
  const databaseId = (options.firestoreDatabaseId || '').trim();
  const firestore = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);
  return new FirestoreSnapshotStore(
    firestore as unknown as FirestoreLike,
    `Firestore ${serviceAccount.project_id}/${databaseId || '(default)'}`
  );
}
