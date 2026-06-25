import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveBrandFromSupabase } from "@/lib/brand-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const brandSlug = url.searchParams.get("brandSlug");
    const brandName = url.searchParams.get("brandName");

    const brand = await resolveBrandFromSupabase(supabase, {
      brandSlug,
      brandName,
    });

    return NextResponse.json({
      ok: true,
      brand,
    });
  } catch (error: any) {
    console.error("brand-resolver error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo resolver la marca.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}