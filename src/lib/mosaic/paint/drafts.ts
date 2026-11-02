"use client";
/**
 * Unsent paintings, kept in this browser's IndexedDB so closing the tab doesn't lose work.
 * Every call fails quietly: a private window or blocked storage just means no draft.
 */
import type { Draft } from "./engine.ts";

const DB = "tessera-paint";
const STORE = "drafts";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T | null>((res) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

export const draftKey = (mosaicId: string, slot: number) => `${mosaicId}:${slot}`;
export const loadDraft = (key: string) => run<Draft | undefined>("readonly", (s) => s.get(key)).then((d) => d ?? null);
export const saveDraft = (key: string, d: Draft) => run("readwrite", (s) => s.put(d, key));
export const deleteDraft = (key: string) => run("readwrite", (s) => s.delete(key));
