import { getSellerConnectStatus, financeError } from "@/lib/comu/finance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ ok: true, result: await getSellerConnectStatus() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return financeError(error); }
}
