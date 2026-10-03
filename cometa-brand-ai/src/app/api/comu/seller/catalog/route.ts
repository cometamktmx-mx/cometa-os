import { NextResponse } from "next/server";
import { requireComuFeature } from "@/lib/comu/features";
import { readSellerCatalog, saveSellerCatalog } from "@/lib/comu/seller-catalog";

const headers = { "Cache-Control": "private, no-store" };
function fail(error: unknown) {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) || 500 : 500;
  return NextResponse.json({ ok: false, error: status < 500 && error instanceof Error ? error.message : "No se pudo acceder al catálogo." }, { status, headers });
}
export async function GET(request: Request) {
  try { requireComuFeature("catalog"); return NextResponse.json({ ok: true, ...await readSellerCatalog(new URL(request.url).searchParams.get("sellerId") || "") }, { headers }); }
  catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try { requireComuFeature("catalog"); return NextResponse.json(await saveSellerCatalog(await request.json()), { headers }); }
  catch (error) { return fail(error); }
}
