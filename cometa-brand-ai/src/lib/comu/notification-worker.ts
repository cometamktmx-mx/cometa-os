import "server-only";
import { getAdminClient } from "@/lib/pos/server";
import { notificationEmailConfig, sendComuEmail, type ComuEmail, type EmailTransport } from "./notification-email";

type Claim = { id: string; claim_token: string; channel: "EVENT" | "EMAIL" };
// Only called after worker secret authentication, or by the isolated test harness.
export async function dispatchNotifications(limit = 10, transport: EmailTransport = sendComuEmail) {
  const admin = getAdminClient();
  const reconciled = await admin.rpc("comu_n1_reconcile");
  if (reconciled.error) throw new Error("COMU_N1_RECONCILE_FAILED");
  const result = { reconciled: Number(reconciled.data || 0), processed: 0, delivered: 0, retry: 0, suppressed: 0, lostLease: 0 };
  const finish = async (claim: Claim, ok: boolean, error: string | null) => {
    const r = await admin.rpc("comu_n1_finish", { p_id: claim.id, p_token: claim.claim_token, p_ok: ok, p_error: error });
    if (r.error) throw new Error("COMU_N1_ACK_FAILED");
    if (!r.data) result.lostLease++;
    else if (ok) result.delivered++;
    else result.retry++;
  };
  // Claim one at a time so no batch waits out its lease while previous sends run.
  for (let i = 0; i < Math.min(10, Math.max(1, limit)); i++) {
    const r = await admin.rpc("comu_n1_claim", { p_size: 1 });
    if (r.error) throw new Error("COMU_N1_CLAIM_FAILED");
    const claim = (r.data as Claim[] | null)?.[0];
    if (!claim) break;
    result.processed++;
    try {
      if (claim.channel === "EVENT") {
        const expanded = await admin.rpc("comu_n1_expand", { p_id: claim.id, p_token: claim.claim_token });
        if (expanded.error) throw new Error("COMU_N1_EXPAND_FAILED");
        if (expanded.data) result.delivered++; else result.lostLease++;
      } else {
        const config = notificationEmailConfig();
        if (!config) { await finish(claim, false, "CONFIGURATION"); continue; }
        const prepared = await admin.rpc("comu_n1_prepare_email", { p_id: claim.id, p_token: claim.claim_token, p_from: config.from, p_origin: config.origin });
        if (prepared.error) throw new Error("COMU_N1_PREPARE_FAILED");
        if (!prepared.data) { result.suppressed++; continue; }
        const sent = await transport(prepared.data as ComuEmail, `comu-n1/${claim.id}`);
        await finish(claim, sent.ok, sent.ok ? null : sent.error);
      }
    } catch { await finish(claim, false, "DISPATCH_FAILED"); }
  }
  return result;
}
