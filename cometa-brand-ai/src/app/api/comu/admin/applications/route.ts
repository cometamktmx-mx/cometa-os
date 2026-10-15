import { NextResponse } from "next/server";
import { PosApiError } from "@/lib/pos/server";
import { listSellerApplications, reviewSellerApplication } from "@/lib/comu/seller-approval";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  return NextResponse.json({ ok: false, error: error instanceof PosApiError ? error.message : "No se pudo revisar la solicitud." },
    { status: error instanceof PosApiError ? error.status : 500, headers });
}
export async function GET() {
  try { return NextResponse.json({ ok: true, applications: await listSellerApplications() }, { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { return NextResponse.json({ ok: true, application: await reviewSellerApplication(await request.json().catch(() => null)) }, { headers }); }
  catch (error) { return failure(error); }
}
