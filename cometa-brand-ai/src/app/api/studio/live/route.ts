import { NextResponse } from "next/server";
import { requireStudioAccess } from "@/lib/studio/server";
import { getStudioLiveSnapshot } from "@/lib/studio/live";

export const dynamic = "force-dynamic";

export async function GET() {
  try { const studio = await requireStudioAccess(); const snapshot = await getStudioLiveSnapshot(studio.userId); return NextResponse.json(snapshot, { headers: { "cache-control": "private, no-store, max-age=0" } }); }
  catch (cause) { const status = typeof cause === "object" && cause && "status" in cause && typeof cause.status === "number" ? cause.status : 500; const code = cause instanceof Error ? cause.message : "STUDIO_LIVE_FAILED"; console.error("[STUDIO_LIVE_FAILED]", { status, code }); return NextResponse.json({ error: "No se pudo actualizar Studio." }, { status }); }
}
