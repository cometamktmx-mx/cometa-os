import { createClient } from "@/lib/supabase/server";
import { clearPosSessionCookies } from "@/lib/pos/device-server";
import { getAdminClient, handlePosError, ok, PosApiError } from "@/lib/pos/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";

export async function DELETE() {
  try {
    const auth = await createClient();
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) { await clearPosSessionCookies(); return ok({ clearLocalContext: true }); }
    const token = (await cookies()).get("cometa_pos_staff_session")?.value;
    if (token) {
      const result = await getAdminClient().from("pos_staff_sessions").update({ revoked_at: new Date().toISOString() })
        .eq("host_user_id", user.id).eq("token_hash", createHash("sha256").update(token).digest("hex"));
      if (result.error) throw new PosApiError(503, "POS_STAFF_SESSION_REVOKE_FAILED", "No se pudo cerrar la sesión operacional.");
    }
    const result = await auth.auth.signOut({ scope: "local" });
    if (result.error) throw new PosApiError(503, "POS_LOGOUT_FAILED", "No se pudo cerrar la cuenta.");
    await clearPosSessionCookies();
    return ok({ clearLocalContext: true });
  } catch (error) { return handlePosError(error); }
}
