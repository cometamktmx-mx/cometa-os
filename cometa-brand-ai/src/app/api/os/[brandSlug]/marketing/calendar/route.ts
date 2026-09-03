import { NextResponse } from "next/server";
import { brandContextErrorResponse, invalidRequestResponse } from "@/lib/brand-os/api";
import { getClientMarketingCalendar, isValidCalendarPeriod } from "@/lib/mercury/client-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ brandSlug: string }> }
) {
  try {
    const { brandSlug } = await params;
    const url = new URL(request.url);
    const now = new Date();
    const month = Number(url.searchParams.get("month") || now.getMonth() + 1);
    const year = Number(url.searchParams.get("year") || now.getFullYear());
    if (!isValidCalendarPeriod(month, year)) {
      return invalidRequestResponse("El periodo solicitado no es válido.");
    }
    return NextResponse.json(await getClientMarketingCalendar({ brandSlug, month, year }));
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}
