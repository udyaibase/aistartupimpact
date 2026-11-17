'use client';

import type { RosterRow } from './checkin-rules';

/**
 * Offline check-in storage on this device (IndexedDB): the downloaded attendee list per event, and scans waiting
 * to upload. Scans are kept until the server confirms them, so closing the tab or losing signal loses nothing.
 */

const DB = 'udyaibase-checkin';
// 2: lists hold hashes instead of ticket codes and emails; older lists are wiped on upgrade.
const VERSION = 2;

export type Roster = {
  eventId: string; title: string; downloadedAt: string; rows: RosterRow[];
  /** Deleted from the device after this (a day after the event ends). */
  keepUntil: string;
  /** The signed-in person who saved it; someone else signing in on this device doesn't get it. */
  downloadedBy: string;
};
export type PendingScan = { key: string; eventId: string; registrationId: string; scannedAt: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // Lists saved by the old version contain raw ticket codes and emails: remove them.
      if (e.oldVersion < 2 && db.objectStoreNames.contains('rosters')) db.deleteObjectStore('rosters');
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

/** Delete every saved attendee list on this device (on sign-out). Waiting scans hold only ids and are kept. */
export async function clearOfflineRosters(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await run('rosters', 'readwrite', (s) => s.clear());
}

/** Delete lists past their keep date, from an older format, or saved by someone else. Returns what's left. */
export async function pruneRosters(personId: string | null, now = Date.now()): Promise<void> {
  const all = (await run<Roster[]>('rosters', 'readonly', (s) => s.getAll())) ?? [];
  for (const r of all) {
    const expired = !r.keepUntil || new Date(r.keepUntil).getTime() < now;
    if (expired || !r.downloadedBy || (personId && r.downloadedBy !== personId)) await deleteRoster(r.eventId);
  }
}

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
