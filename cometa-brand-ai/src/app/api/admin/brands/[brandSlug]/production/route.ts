import { NextResponse } from "next/server";
import { getBrandProductionProfile, saveBrandProductionProfile, assignUnassignedPieces, type ProductionProfileInput } from "@/lib/studio/production";
import { requireAdminWorkspace } from "@/lib/workspace/admin-brands";
import { BrandOsGuardError } from "@/lib/brand-os/server";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ brandSlug: string }> }) { try { await requireAdminWorkspace(); const { brandSlug } = await params; return NextResponse.json({ ok: true, profile: await getBrandProductionProfile(brandSlug) }); } catch (error) { return fail(error); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ brandSlug: string }> }) { try { const { brandSlug } = await params; const body = await request.json() as ProductionProfileInput; return NextResponse.json({ ok: true, profile: await saveBrandProductionProfile(brandSlug, body) }); } catch (error) { return fail(error); } }
export async function POST(_: Request, { params }: { params: Promise<{ brandSlug: string }> }) { try { const { brandSlug } = await params; return NextResponse.json({ ok: true, result: await assignUnassignedPieces(brandSlug) }); } catch (error) { return fail(error); } }
function fail(error: unknown) { const status = error instanceof BrandOsGuardError ? error.status : 400; return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "PRODUCTION_PROFILE_FAILED" }, { status }); }
