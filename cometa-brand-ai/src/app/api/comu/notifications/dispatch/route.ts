import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchNotifications } from "@/lib/comu/notification-worker";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const secret = process.env.COMU_NOTIFICATIONS_WORKER_SECRET;
  const supplied = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const headers = { "Cache-Control": "private, no-store" };
  if (!secret || secret.length < 32) return NextResponse.json({ ok: false, code: "COMU_N1_WORKER_UNCONFIGURED" }, { status: 503, headers });
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return NextResponse.json({ ok: false, code: "COMU_UNAUTHORIZED" }, { status: 401, headers });
  try { return NextResponse.json({ ok: true, ...await dispatchNotifications() }, { headers }); }
  catch { return NextResponse.json({ ok: false, code: "COMU_N1_WORKER_FAILED" }, { status: 503, headers }); }
}
