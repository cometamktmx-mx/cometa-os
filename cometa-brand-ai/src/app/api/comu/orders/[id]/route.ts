import { NextResponse } from "next/server";
import { getBuyerOrder } from "@/lib/comu/orders";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try { return NextResponse.json({ ok: true, order: await getBuyerOrder((await params).id) }); } catch (error) { return NextResponse.json({ ok: false, code: "COMU_ORDER_FAILED", error: error instanceof Error ? error.message : "No se pudo cargar la orden." }, { status: 404 }); } }
