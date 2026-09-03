import "server-only";

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BrandOsGuardError } from "@/lib/brand-os/server";
import { classifyStudioChangeSource } from "@/lib/studio/changes";

export type StudioLiveAttentionItem = { pieceId: string; brandName: string; title: string; contentType: string | null; status: string; updatedAt: string | null; latestChangeAt: string | null; changeSource: "client" | "internal" | null; reviewDecision: string | null; reviewUpdatedAt: string | null };
export type StudioLiveSnapshot = { asOf: string; fingerprint: string; counts: { changes: number; assigned: number; readyForReview: number }; attentionItems: StudioLiveAttentionItem[] };

function db(): SupabaseClient { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new BrandOsGuardError(500, "STUDIO_SERVER_CONFIG_INVALID", "Configuración de Studio incompleta."); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
function value(input: unknown) { return typeof input === "string" && input ? input : null; }
function latestBy(rows: Array<Record<string, unknown>>) { const map = new Map<string, Record<string, unknown>>(); for (const row of rows) { const id = String(row.content_item_id); if (!map.has(id)) map.set(id, row); } return map; }
export function studioLiveFingerprint(items: StudioLiveAttentionItem[], counts: StudioLiveSnapshot["counts"]) { const canonical = { counts, items: [...items].sort((a, b) => a.pieceId.localeCompare(b.pieceId)).map((item) => [item.pieceId, item.status, item.latestChangeAt, item.changeSource, item.reviewDecision, item.reviewUpdatedAt]) }; return createHash("sha256").update(JSON.stringify(canonical)).digest("hex"); }

export async function getStudioLiveSnapshot(userId: string): Promise<StudioLiveSnapshot> {
  const client = db();
  const assignments = await client.from("mercury_team_assignments").select("brand_slug").eq("user_id", userId).eq("active", true).in("role", ["admin", "designer", "reels", "cm", "copy", "producer"]);
  if (assignments.error) throw new BrandOsGuardError(500, "STUDIO_LIVE_ASSIGNMENTS_FAILED", "No se pudo actualizar Studio.");
  const assignedSlugs = [...new Set((assignments.data || []).map((row) => String(row.brand_slug)).filter(Boolean))]; if (!assignedSlugs.length) return emptySnapshot();
  const [memberships, brands] = await Promise.all([
    client.from("user_brand_access").select("brand_slug").eq("user_id", userId).eq("status", "active").in("brand_slug", assignedSlugs),
    client.from("brands").select("slug,name").eq("status", "active").in("slug", assignedSlugs),
  ]);
  if (memberships.error || brands.error) throw new BrandOsGuardError(500, "STUDIO_LIVE_ACCESS_FAILED", "No se pudo actualizar Studio.");
  const membershipSlugs = new Set((memberships.data || []).map((row) => String(row.brand_slug))); const brandNames = new Map((brands.data || []).filter((brand) => membershipSlugs.has(String(brand.slug))).map((brand) => [String(brand.slug), String(brand.name)])); const slugs = [...brandNames.keys()]; if (!slugs.length) return emptySnapshot();
  const pieces = await client.from("mercury_content_items").select("id,brand_slug,title,content_type,status,updated_at").eq("assigned_to", userId).in("brand_slug", slugs).order("id").limit(100);
  if (pieces.error) throw new BrandOsGuardError(500, "STUDIO_LIVE_ITEMS_FAILED", "No se pudo actualizar Studio.");
  const rows = (pieces.data || []) as Array<Record<string, unknown>>; const ids = rows.map((row) => String(row.id));
  const [reviews, comments] = ids.length ? await Promise.all([
    client.from("mercury_client_content_reviews").select("content_item_id,status,decided_at,created_at").in("content_item_id", ids).order("created_at", { ascending: false }),
    client.from("mercury_content_comments").select("content_item_id,created_at").in("content_item_id", ids).eq("is_private", true).eq("user_role", "cometa").order("created_at", { ascending: false }),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (reviews.error || comments.error) throw new BrandOsGuardError(500, "STUDIO_LIVE_ATTENTION_FAILED", "No se pudo actualizar Studio.");
  const reviewMap = latestBy((reviews.data || []) as Array<Record<string, unknown>>); const commentMap = latestBy((comments.data || []) as Array<Record<string, unknown>>);
  const attentionItems: StudioLiveAttentionItem[] = rows.map((row) => { const id = String(row.id); const review = reviewMap.get(id); const comment = commentMap.get(id); const status = String(row.status); const reviewDecision = value(review?.status); const source = status === "changes_requested" ? classifyStudioChangeSource(reviewDecision, Boolean(comment)) : null; const reviewAt = value(review?.decided_at) || value(review?.created_at); const commentAt = value(comment?.created_at); return { pieceId: id, brandName: brandNames.get(String(row.brand_slug)) || "Marca", title: value(row.title) || "Sin título", contentType: value(row.content_type), status, updatedAt: value(row.updated_at), latestChangeAt: source === "client" ? reviewAt : source === "internal" ? commentAt : null, changeSource: source, reviewDecision, reviewUpdatedAt: reviewAt }; });
  const counts = { changes: attentionItems.filter((item) => item.status === "changes_requested").length, assigned: attentionItems.length, readyForReview: attentionItems.filter((item) => ["design_uploaded", "internal_review"].includes(item.status)).length };
  return { asOf: new Date().toISOString(), fingerprint: studioLiveFingerprint(attentionItems, counts), counts, attentionItems };
}
function emptySnapshot(): StudioLiveSnapshot { const counts = { changes: 0, assigned: 0, readyForReview: 0 }; return { asOf: new Date().toISOString(), fingerprint: studioLiveFingerprint([], counts), counts, attentionItems: [] }; }
