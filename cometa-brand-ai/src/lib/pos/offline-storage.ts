export const POS_OFFLINE_DB = "cometa-pos-offline";
export const POS_OFFLINE_SCHEMA_VERSION = 1;

export type PosOfflineScope = { brandSlug: string; locationId: string | null };
export type PosOfflineRecord<T> = PosOfflineScope & { value: T; cachedAt: string; serverUpdatedAt?: string | null; schemaVersion: number };

const stores = ["meta", "bootstrap", "branding", "catalog", "food_snapshot", "outbox"] as const;
type StoreName = (typeof stores)[number];

function key(scope: PosOfflineScope) { return `${scope.brandSlug}::${scope.locationId || "default"}`; }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("INDEXED_DB_UNAVAILABLE"));
    const request = indexedDB.open(POS_OFFLINE_DB, POS_OFFLINE_SCHEMA_VERSION);
    request.onupgradeneeded = () => { const db = request.result; for (const store of stores) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("INDEXED_DB_OPEN_FAILED"));
  });
}

export async function offlinePut<T>(store: StoreName, scope: PosOfflineScope, value: T, serverUpdatedAt?: string | null) {
  if (typeof window === "undefined") return false;
  try { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put({ brandSlug: scope.brandSlug, locationId: scope.locationId, value, cachedAt: new Date().toISOString(), serverUpdatedAt: serverUpdatedAt || null, schemaVersion: POS_OFFLINE_SCHEMA_VERSION }, key(scope)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); return true; } catch { return false; }
}

export async function offlineGet<T>(store: StoreName, scope: PosOfflineScope): Promise<PosOfflineRecord<T> | null> {
  if (typeof window === "undefined") return null;
  try { const db = await openDb(); const value = await new Promise<PosOfflineRecord<T> | null>((resolve, reject) => { const tx = db.transaction(store, "readonly"); const request = tx.objectStore(store).get(key(scope)); request.onsuccess = () => resolve((request.result as PosOfflineRecord<T> | undefined) || null); request.onerror = () => reject(request.error); }); db.close(); return value; } catch { return null; }
}

export async function offlineDelete(store: StoreName, scope: PosOfflineScope) { if (typeof window === "undefined") return; try { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).delete(key(scope)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); } catch { /* Online operation must survive storage failures. */ } }

export function offlineScope(brandSlug: string, locationId?: string | null): PosOfflineScope { return { brandSlug, locationId: locationId || null }; }
