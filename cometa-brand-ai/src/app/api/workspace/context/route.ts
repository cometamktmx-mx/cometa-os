import { NextResponse } from "next/server";
import { getUserWorkspaceContext, getWorkspaceDestination } from "@/lib/workspace/context";
import { BrandOsGuardError } from "@/lib/brand-os/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try { const context = await getUserWorkspaceContext(); return NextResponse.json({ ok: true, destination: getWorkspaceDestination(context) }); }
  catch (error) { const status = error instanceof BrandOsGuardError ? error.status : 500; return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "WORKSPACE_CONTEXT_FAILED" }, { status }); }
}
