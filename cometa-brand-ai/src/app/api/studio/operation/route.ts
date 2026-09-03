import { NextResponse } from "next/server";
import { BrandOsGuardError } from "@/lib/brand-os/server";
import { getOwnStudioOperationState, transitionOwnStudioOperation } from "@/lib/studio/operation";

export const dynamic = "force-dynamic";
const ACTIONS = ["open", "pause", "resume", "close"] as const;
type Action = (typeof ACTIONS)[number];

export async function GET() {
  try { return NextResponse.json({ ok: true, state: await getOwnStudioOperationState() }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "") as Action;
    if (!ACTIONS.includes(action)) return NextResponse.json({ ok: false, error: "OPERATION_ACTION_INVALID" }, { status: 400 });
    return NextResponse.json({ ok: true, state: await transitionOwnStudioOperation(action) });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  const status = error instanceof BrandOsGuardError ? error.status : 400;
  const code = error instanceof BrandOsGuardError ? error.code : error instanceof Error ? error.message : "OPERATION_REQUEST_FAILED";
  const message = error instanceof BrandOsGuardError ? error.message : "No se pudo actualizar tu operación.";
  return NextResponse.json({ ok: false, error: code, message }, { status });
}
