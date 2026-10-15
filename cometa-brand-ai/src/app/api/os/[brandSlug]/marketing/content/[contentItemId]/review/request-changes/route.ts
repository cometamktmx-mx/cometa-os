import { NextRequest,NextResponse } from "next/server";
import { requireBrandOsAccess } from "@/lib/brand-os/server";
import { decideReview } from "@/lib/mercury/reviews";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{brandSlug:string;contentItemId:string}>}){try{const {brandSlug,contentItemId}=await params;const body=await request.json();const access=await requireBrandOsAccess(brandSlug);const review=await decideReview(brandSlug,contentItemId,access.user.userId,"changes_requested",typeof body.comment==="string"?body.comment:undefined);return NextResponse.json({ok:true,review});}catch(error){const code=error instanceof Error?error.message:"REVIEW_DECISION_FAILED";return NextResponse.json({ok:false,error:code==="INVALID_COMMENT"?code:code==="CONTENT_NOT_FOUND"?"CONTENT_NOT_FOUND":"REVIEW_DECISION_FAILED"},{status:code==="INVALID_COMMENT"?400:code==="CONTENT_NOT_FOUND"?404:400});}}
