import { openDB, type IDBPDatabase, deleteDB } from 'idb';
import type { OfflineDBSchema } from './types';

const DB_VERSION = 1;

export function getOfflineDbName(userId: string): string {
  if (!userId) {
    throw new Error('userId is required to access offline database');
  }
  return `cybergym-offline-${userId}`;
}

const dbCache = new Map<string, Promise<IDBPDatabase<OfflineDBSchema>>>();

export async function getOfflineDb(userId: string): Promise<IDBPDatabase<OfflineDBSchema>> {
  const dbName = getOfflineDbName(userId);
  const cached = dbCache.get(dbName);
  if (cached) {
    try {
      const db = await cached;
      // If DB was closed externally, remove from cache and reopen
      db.transaction('meta', 'readonly');
      return db;
    } catch {
      dbCache.delete(dbName);
    }
  }

  const promise = openDB<OfflineDBSchema>(dbName, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('rq')) {
        db.createObjectStore('rq');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        const outboxStore = db.createObjectStore('outbox', { keyPath: 'opId' });
        outboxStore.createIndex('seq', 'seq', { unique: true });
        outboxStore.createIndex('userId', 'userId', { unique: false });
        outboxStore.createIndex('state', 'state', { unique: false });
      }
      if (!db.objectStoreNames.contains('idmap')) {
        db.createObjectStore('idmap');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    },
    blocked() {
      console.warn(`[offlineDb] openDB blocked for ${dbName}`);
    },
    blocking() {
      console.warn(`[offlineDb] openDB blocking for ${dbName}`);
    },
    terminated() {
      console.warn(`[offlineDb] openDB terminated for ${dbName}`);
      dbCache.delete(dbName);
    },
  });

  dbCache.set(dbName, promise);
  return promise;
}

export async function closeOfflineDb(userId: string): Promise<void> {
  const dbName = getOfflineDbName(userId);
  const promise = dbCache.get(dbName);
  if (promise) {
    dbCache.delete(dbName);
    try {
      const db = await promise;
      db.close();
    } catch {
      // ignore
    }
  }
}

export async function closeAllOfflineDbs(): Promise<void> {
  const entries = Array.from(dbCache.entries());
  dbCache.clear();
  for (const [, promise] of entries) {
    try {
      const db = await promise;
      db.close();
    } catch {
      // ignore
    }
  }
}

export async function clearUserRqStore(userId: string): Promise<void> {
  const db = await getOfflineDb(userId);
  const tx = db.transaction('rq', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

export async function deleteOfflineDb(userId: string): Promise<void> {
  await closeOfflineDb(userId);
  const dbName = getOfflineDbName(userId);
  await deleteDB(dbName);
}

