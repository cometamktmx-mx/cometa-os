import { createBrowserClient } from "@supabase/ssr";
import { clearPosLocalContext, POS_CONTEXT_CLEARED } from "@/lib/pos/offline-storage";
let cleanupRegistered = false;

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
  if (!cleanupRegistered && typeof window !== "undefined") {
    cleanupRegistered = true;
    client.auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") void clearPosLocalContext(); });
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(POS_CONTEXT_CLEARED);
      channel.onmessage = event => { void clearPosLocalContext(false, event.data === "operator" ? "operator" : "account"); };
    }
  }
  return client;
}
