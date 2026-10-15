"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearPosLocalContext } from "@/lib/pos/offline-storage";

export function PosExit({ clearOnMount = false }: { clearOnMount?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (clearOnMount) void clearPosLocalContext(); }, [clearOnMount]);
  async function leave() {
    setBusy(true); setError("");
    await clearPosLocalContext();
    try {
      const response = await fetch("/api/pos/session", { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo cerrar la sesión de terminal.");
      const { error: authError } = await createClient().auth.signOut({ scope: "local" });
      if (authError) throw new Error("No se pudo cerrar la cuenta. Reintenta.");
      window.location.assign("/login?next=/pos");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo salir."); setBusy(false); }
  }
  return <div className="mt-4"><button type="button" disabled={busy} onClick={() => void leave()} className="rounded-lg border border-slate-400 px-4 py-2">{busy ? "Cerrando sesión…" : "Cerrar sesión de esta terminal"}</button>{error ? <p role="alert">{error}</p> : null}</div>;
}
