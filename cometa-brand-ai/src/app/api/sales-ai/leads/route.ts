import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const brandName = searchParams.get("brandName") || "Mar Cosmetic";

    const { data, error } = await supabase
      .from("sales_leads")
      .select("*")
      .eq("brand_name", brandName)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      leads: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Error cargando leads",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}