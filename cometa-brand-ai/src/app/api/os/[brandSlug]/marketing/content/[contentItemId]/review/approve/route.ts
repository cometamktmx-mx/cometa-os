import { NextResponse } from "next/server";
import { requireBrandOsAccess } from "@/lib/brand-os/server";
import { decideReview } from "@/lib/mercury/reviews";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(_request:Request,{params}:{params:Promise<{brandSlug:string;contentItemId:string}>}){try{const {brandSlug,contentItemId}=await params;const access=await requireBrandOsAccess(brandSlug);const review=await decideReview(brandSlug,contentItemId,access.user.userId,"approved");return NextResponse.json({ok:true,review});}catch(error){const code=error instanceof Error?error.message:"REVIEW_DECISION_FAILED";return NextResponse.json({ok:false,error:code==="CONTENT_NOT_FOUND"?"CONTENT_NOT_FOUND":"REVIEW_DECISION_FAILED"},{status:code==="CONTENT_NOT_FOUND"?404:400});}}
