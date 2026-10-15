import { getAdminFinance, runAdminFinanceOperation, financeError } from "@/lib/comu/finance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ ok: true, sellers: await getAdminFinance() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return financeError(error); }
}
export async function POST(request: Request) {
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return Response.json({ ok: false, error: "Selecciona una operación válida." }, { status: 400 });
    return Response.json({ ok: true, result: await runAdminFinanceOperation(input as Record<string, unknown>) });
  } catch (error) { return financeError(error); }
}
