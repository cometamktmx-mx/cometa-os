import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: Request,
  context: { params: Promise<{ brandName: string }> }
) {
  const { brandName } = await context.params;

  const decodedBrandName = decodeURIComponent(brandName);

  const { data, error } = await supabase
    .from("brand_evidence")
    .select("*")
    .ilike("brand_name", `%${decodedBrandName}%`);

  if (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    });
  }

  return NextResponse.json({
    success: true,
    evidences: data,
  });
}