import { NextRequest,NextResponse } from "next/server";
import { createAdminContent } from "@/lib/mercury/admin-content";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{brandSlug:string}>}){try{const {brandSlug}=await params;const body=await request.json();return NextResponse.json({ok:true,item:await createAdminContent(brandSlug,body)},{status:201});}catch(error){const message=error instanceof Error?error.message:"ADMIN_CONTENT_CREATE_FAILED";const status=["INVALID_DATE"].includes(message)?400:500;return NextResponse.json({ok:false,error:status===400?message:"ADMIN_CONTENT_CREATE_FAILED"},{status});}}
