import { NextResponse } from "next/server";
import { requireAdminWorkspace } from "@/lib/workspace/admin-brands";
import { sendForReview } from "@/lib/mercury/reviews";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(_request:Request,{params}:{params:Promise<{brandSlug:string;contentItemId:string}>}){try{const {userId}=await requireAdminWorkspace();const {brandSlug,contentItemId}=await params;const result=await sendForReview(brandSlug,contentItemId,userId);return NextResponse.json({ok:true,...result},{status:result.duplicate?200:201});}catch(error){const code=error instanceof Error?error.message:"REVIEW_SEND_FAILED";return NextResponse.json({ok:false,error:code==="CONTENT_NOT_FOUND"?"CONTENT_NOT_FOUND":"REVIEW_SEND_FAILED"},{status:code==="CONTENT_NOT_FOUND"?404:400});}}
