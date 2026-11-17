'use client';

import type { RosterRow } from './checkin-rules';

/**
 * Offline check-in storage on this device (IndexedDB): the downloaded attendee list per event, and scans waiting
 * to upload. Scans are kept until the server confirms them, so closing the tab or losing signal loses nothing.
 */

const DB = 'udyaibase-checkin';
const VERSION = 1;

export type Roster = { eventId: string; title: string; downloadedAt: string; rows: RosterRow[] };
export type PendingScan = { key: string; eventId: string; registrationId: string; scannedAt: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('rosters')) db.createObjectStore('rosters', { keyPath: 'eventId' });
      if (!db.objectStoreNames.contains('scans')) db.createObjectStore('scans', { keyPath: 'key' }).createIndex('eventId', 'eventId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export const saveRoster = (r: Roster) => run('rosters', 'readwrite', (s) => s.put(r));
export const getRoster = (eventId: string) => run<Roster>('rosters', 'readonly', (s) => s.get(eventId));
export const deleteRoster = (eventId: string) => run('rosters', 'readwrite', (s) => s.delete(eventId));

/** Queue a scan. One per person per event: the first one is kept. */
export async function queueScan(eventId: string, registrationId: string, scannedAt = new Date().toISOString()) {
  const key = `${eventId}:${registrationId}`;
  const existing = await run<PendingScan>('scans', 'readonly', (s) => s.get(key));
  if (!existing) await run('scans', 'readwrite', (s) => s.put({ key, eventId, registrationId, scannedAt } satisfies PendingScan));
}
export const pendingScans = (eventId: string) =>
  run<PendingScan[]>('scans', 'readonly', (s) => s.index('eventId').getAll(eventId)).then((x) => x ?? []);
export async function removeScans(keys: string[]) {
  if (!keys.length) return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('scans', 'readwrite');
    for (const k of keys) tx.objectStore('scans').delete(k);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
