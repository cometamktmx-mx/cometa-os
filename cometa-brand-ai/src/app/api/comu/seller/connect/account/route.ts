import { createSellerConnectAccount, financeError } from "@/lib/comu/finance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST() {
  try { return Response.json({ ok: true, result: await createSellerConnectAccount() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return financeError(error); }
}
