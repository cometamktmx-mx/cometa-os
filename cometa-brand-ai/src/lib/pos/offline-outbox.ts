import { offlineGet, offlinePut, offlineScope } from "./offline-storage";

export type OfflineOutboxStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
export type OfflineOutboxEntry = { id: string; requestKey: string; brandSlug: string; locationId: string | null; staffId: string | null; action: string; payload: unknown; createdAt: string; updatedAt: string; retryCount: number; status: OfflineOutboxStatus; lastError: string | null };

const scope = (brandSlug: string) => offlineScope(brandSlug, "outbox");
export async function enqueueOfflineOperation(input: Omit<OfflineOutboxEntry, "id" | "createdAt" | "updatedAt" | "retryCount" | "status" | "lastError">) {
  const now = new Date().toISOString(); const entry: OfflineOutboxEntry = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now, retryCount: 0, status: "PENDING", lastError: null };
  const current = await offlineGet<OfflineOutboxEntry[]>("outbox", scope(input.brandSlug));
  const entries = current?.value || []; if (!entries.some((item) => item.requestKey === entry.requestKey)) await offlinePut("outbox", scope(input.brandSlug), [...entries, entry]);
  return entry;
}

export async function readOfflineOutbox(brandSlug: string) { return (await offlineGet<OfflineOutboxEntry[]>("outbox", scope(brandSlug)))?.value || []; }
export async function flushOfflineOutbox(brandSlug: string, send: (entry: OfflineOutboxEntry) => Promise<void>) {
  const entries = await readOfflineOutbox(brandSlug); const result: OfflineOutboxEntry[] = [];
  for (const entry of entries) {
    if (entry.status === "SYNCED") { result.push(entry); continue; }
    const syncing = { ...entry, status: "SYNCING" as const, updatedAt: new Date().toISOString() }; result.push(syncing);
    try { await send(syncing); result[result.length - 1] = { ...syncing, status: "SYNCED", updatedAt: new Date().toISOString() }; }
    catch (error) { const retryCount = syncing.retryCount + 1; result[result.length - 1] = { ...syncing, status: retryCount >= 5 ? "FAILED" : "PENDING", retryCount, lastError: error instanceof Error ? error.message : "SYNC_FAILED", updatedAt: new Date().toISOString() }; if (result[result.length - 1].status === "PENDING") break; }
  }
  await offlinePut("outbox", scope(brandSlug), result); return result;
}
