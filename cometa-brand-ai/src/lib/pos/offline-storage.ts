export const POS_OFFLINE_DB = "cometa-pos-offline";
export const POS_OFFLINE_SCHEMA_VERSION = 2;
export type PosCacheIdentity = { accountId: string; operatorId: string; deviceId?: string | null };
export type PosOfflineScope = { brandSlug: string; locationId: string | null; accountId: string; operatorId: string; deviceId: string | null };
export type PosOfflineRecord<T> = PosOfflineScope & { value: T; cachedAt: string; serverUpdatedAt?: string | null; schemaVersion: number };
const stores = ["meta", "bootstrap", "branding", "catalog", "food_snapshot", "outbox"] as const;
type StoreName = (typeof stores)[number];
let epoch = 0;
export const POS_CONTEXT_CLEARED = "cometa-pos-context-cleared";

export function offlineScope(brandSlug: string, locationId?: string | null, identity?: PosCacheIdentity): PosOfflineScope {
  return { brandSlug, locationId: locationId || null, accountId: identity?.accountId || "", operatorId: identity?.operatorId || "", deviceId: identity?.deviceId || null };
}
export function offlineScopeKey(scope: PosOfflineScope) {
  return JSON.stringify([scope.accountId, scope.deviceId, scope.brandSlug, scope.locationId, scope.operatorId]);
}
function valid(scope: PosOfflineScope) { return Boolean(scope.accountId && scope.brandSlug && scope.operatorId); }
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("INDEXED_DB_UNAVAILABLE"));
    const request = indexedDB.open(POS_OFFLINE_DB, POS_OFFLINE_SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of stores) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        else request.transaction?.objectStore(store).clear(); // v1 lacked account/operator isolation.
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function offlinePut<T>(store: StoreName, scope: PosOfflineScope, value: T, serverUpdatedAt?: string | null) {
  if (!valid(scope)) return false;
  const revision = epoch;
  try {
    const db = await openDb();
    try {
      if (revision !== epoch) return false;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put({ ...scope, value, cachedAt: new Date().toISOString(), serverUpdatedAt, schemaVersion: POS_OFFLINE_SCHEMA_VERSION }, offlineScopeKey(scope));
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
      return revision === epoch;
    } finally { db.close(); }
  } catch { return false; }
}
export async function offlineGet<T>(store: StoreName, scope: PosOfflineScope): Promise<PosOfflineRecord<T> | null> {
  if (!valid(scope)) return null;
  const revision = epoch;
  try {
    const db = await openDb();
    try {
      const value = await new Promise<PosOfflineRecord<T> | null>((resolve, reject) => {
        const request = db.transaction(store, "readonly").objectStore(store).get(offlineScopeKey(scope));
        request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
      });
      return revision === epoch && value?.schemaVersion === POS_OFFLINE_SCHEMA_VERSION && offlineScopeKey(value) === offlineScopeKey(scope) ? value : null;
    } finally { db.close(); }
  } catch { return null; }
}
export async function offlineDelete(store: StoreName, scope: PosOfflineScope) {
  try { const db = await openDb(); try {
    await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).delete(offlineScopeKey(scope)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  } finally { db.close(); } } catch { /* Storage failure cannot grant access. */ }
}
export async function clearPosLocalContext(broadcast = true, kind: "account" | "operator" = "account") {
  epoch++;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(POS_CONTEXT_CLEARED, { detail: kind }));
  if (broadcast && typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(POS_CONTEXT_CLEARED); channel.postMessage(kind); channel.close();
  }
  try { const db = await openDb(); try {
    await new Promise<void>((resolve, reject) => { const tx = db.transaction([...stores], "readwrite"); for (const store of stores) tx.objectStore(store).clear(); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  } finally { db.close(); } } catch { /* Never restore cached authorization. */ }
  try { if (typeof caches !== "undefined") {
    for (const name of await caches.keys()) if (name.startsWith("cometa-pos-")) await caches.delete(name);
  } } catch { /* A disabled Cache API must not prevent sign-out. */ }
}
export function mayUseOfflineSnapshot(error: unknown, online: boolean) {
  // HTTP failures (including 401/403/500) are not connectivity failures.
  return !online && error instanceof TypeError;
}
