import { NextRequest, NextResponse } from "next/server";
import { getAdminCalendar } from "@/lib/mercury/admin-content";
export const runtime="nodejs"; export const dynamic="force-dynamic";
function period(request:NextRequest){const now=new Date();const month=Number(request.nextUrl.searchParams.get("month")||now.getMonth()+1),year=Number(request.nextUrl.searchParams.get("year")||now.getFullYear());if(!Number.isInteger(month)||month<1||month>12||!Number.isInteger(year)||year<2000||year>2100)throw new Error("INVALID_PERIOD");return {month,year};}
export async function GET(request:NextRequest,{params}:{params:Promise<{brandSlug:string}>}){try{const {brandSlug}=await params;const p=period(request);return NextResponse.json(await getAdminCalendar(brandSlug,p.month,p.year));}catch(error){const status=error instanceof Error&&error.message==="INVALID_PERIOD"?400:500;return NextResponse.json({ok:false,error:status===400?"INVALID_PERIOD":"ADMIN_CALENDAR_UNAVAILABLE"},{status});}}
