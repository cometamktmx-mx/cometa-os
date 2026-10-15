import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BrandOsGuardError } from "@/lib/brand-os/server";

export type StudioChangeSource = "internal" | "client";
export function classifyStudioChangeSource(latestClientReviewStatus: string | null, hasInternalChange: boolean): StudioChangeSource | null { if (latestClientReviewStatus === "changes_requested") return "client"; return hasInternalChange ? "internal" : null; }
export type StudioChangeSummary = { pieceId: string; source: StudioChangeSource; message: string; requestedAt: string | null; requestedByLabel: "Equipo Cometa" | "Cliente" };
export type StudioCurrentDeliverable = { id: string; type: string | null; name: string | null; provider: string | null; url: string | null; createdAt: string | null; mimeType: string | null };
export type StudioChangeCard = { id: string; brandSlug: string; brandName: string; title: string; contentType: string | null; distributionType: string | null; publishDate: string | null; dueDate: string | null; status: "changes_requested"; change: StudioChangeSummary; deliverable: StudioCurrentDeliverable | null };

const ITEM_FIELDS = "id,brand_slug,title,content_type,distribution_type,publish_date,due_date,status,assigned_to,updated_at";
const ASSET_FIELDS = "id,content_item_id,asset_type,asset_name,asset_url,file_url,asset_status,provider,metadata,created_at";

function db(): SupabaseClient { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new BrandOsGuardError(500, "STUDIO_SERVER_CONFIG_INVALID", "Configuración de Studio incompleta."); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function rowsBy<T extends Record<string, unknown>>(rows: T[], field: keyof T) { const map = new Map<string, T[]>(); for (const row of rows) { const id = String(row[field]); map.set(id, [...(map.get(id) || []), row]); } return map; }

export async function getStudioChangeCards(userId: string, allowedBrandSlugs: string[]): Promise<StudioChangeCard[]> {
  if (!allowedBrandSlugs.length) return [];
  const client = db();
  const result = await client.from("mercury_content_items").select(ITEM_FIELDS).eq("assigned_to", userId).eq("status", "changes_requested").in("brand_slug", allowedBrandSlugs).order("due_date", { ascending: true, nullsFirst: false }).limit(100);
  if (result.error) throw new BrandOsGuardError(500, "STUDIO_CHANGES_LOOKUP_FAILED", "No se pudieron cargar tus cambios.");
  const items = (result.data || []) as Array<Record<string, unknown>>;
  if (!items.length) return [];
  const brands = await client.from("brands").select("slug,name,status").in("slug", [...new Set(items.map((item) => String(item.brand_slug)))]).eq("status", "active");
  if (brands.error) throw new BrandOsGuardError(500, "STUDIO_BRAND_LOOKUP_FAILED", "No se pudieron cargar las marcas de tus piezas.");
  const brandNames = new Map((brands.data || []).map((brand) => [String(brand.slug), String(brand.name)]));
  const context = await resolveChangeContext(client, items.map((item) => String(item.id)));
  return items.flatMap((item) => { const brandSlug = String(item.brand_slug); const brandName = brandNames.get(brandSlug); if (!brandName) return []; const id = String(item.id); return [{ id, brandSlug, brandName, title: text(item.title) || "Sin título", contentType: text(item.content_type), distributionType: text(item.distribution_type), publishDate: text(item.publish_date), dueDate: text(item.due_date), status: "changes_requested" as const, change: context.summaries.get(id) || internalFallback(id, text(item.updated_at)), deliverable: context.deliverables.get(id) || null }]; });
}

export async function getStudioPieceChangeContext(userId: string, pieceId: string, brandSlug: string) {
  const client = db();
  const item = await client.from("mercury_content_items").select("id,status,updated_at").eq("id", pieceId).eq("brand_slug", brandSlug).eq("assigned_to", userId).maybeSingle();
  if (item.error) throw new BrandOsGuardError(500, "STUDIO_CHANGE_CONTEXT_FAILED", "No se pudo cargar el contexto del cambio.");
  if (!item.data || item.data.status !== "changes_requested") return null;
  const context = await resolveChangeContext(client, [pieceId]);
  return { change: context.summaries.get(pieceId) || internalFallback(pieceId, text(item.data.updated_at)), deliverable: context.deliverables.get(pieceId) || null };
}

async function resolveChangeContext(client: SupabaseClient, pieceIds: string[]) {
  const [reviews, comments, assets] = await Promise.all([
    client.from("mercury_client_content_reviews").select("id,content_item_id,status,decision_comment,decided_at,created_at").in("content_item_id", pieceIds).order("created_at", { ascending: false }),
    client.from("mercury_content_comments").select("id,content_item_id,comment,user_role,is_private,created_at").in("content_item_id", pieceIds).eq("is_private", true).eq("user_role", "cometa").order("created_at", { ascending: false }),
    client.from("mercury_content_assets").select(ASSET_FIELDS).in("content_item_id", pieceIds).neq("asset_status", "deleted").order("created_at", { ascending: false }),
  ]);
  if (reviews.error || comments.error || assets.error) throw new BrandOsGuardError(500, "STUDIO_CHANGE_CONTEXT_FAILED", "No se pudo cargar el contexto del cambio.");
  const reviewMap = rowsBy((reviews.data || []) as Array<Record<string, unknown>>, "content_item_id");
  const commentMap = rowsBy((comments.data || []) as Array<Record<string, unknown>>, "content_item_id");
  const assetMap = rowsBy((assets.data || []) as Array<Record<string, unknown>>, "content_item_id");
  const summaries = new Map<string, StudioChangeSummary>();
  for (const pieceId of pieceIds) { const latestReview = reviewMap.get(pieceId)?.[0]; const comment = commentMap.get(pieceId)?.[0]; const canonicalClientChange = latestReview ? latestReview.status === "changes_requested" : false; const source = classifyStudioChangeSource(canonicalClientChange ? "changes_requested" : text(latestReview?.status), Boolean(comment)); if (source === "client" && latestReview) { summaries.set(pieceId, { pieceId, source: "client", message: text(latestReview.decision_comment) || "El cliente solicitó cambios sin comentario adicional.", requestedAt: text(latestReview.decided_at) || text(latestReview.created_at), requestedByLabel: "Cliente" }); continue; } if (source === "internal" && comment) summaries.set(pieceId, { pieceId, source: "internal", message: text(comment.comment) || "El equipo solicitó una corrección sin comentario adicional.", requestedAt: text(comment.created_at), requestedByLabel: "Equipo Cometa" }); }
  const chosenAssets = new Map<string, Record<string, unknown>>();
  for (const pieceId of pieceIds) { const values = assetMap.get(pieceId) || []; const chosen = values.find((asset) => ["final_design", "design_preview", "video"].includes(String(asset.asset_type))) || values[0]; if (chosen) chosenAssets.set(pieceId, chosen); }
  const paths = [...new Set([...chosenAssets.values()].map((asset) => { const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {}; return asset.provider === "supabase" ? text(metadata.storage_path) : null; }).filter((value): value is string => Boolean(value)))];
  const signedUrls = new Map<string, string>(); if (paths.length) { const signed = await client.storage.from("brand-content").createSignedUrls(paths, 900); if (!signed.error) for (const entry of signed.data || []) if (entry.path && entry.signedUrl) signedUrls.set(entry.path, entry.signedUrl); }
  const deliverables = new Map<string, StudioCurrentDeliverable>();
  for (const [pieceId, asset] of chosenAssets) { const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {}; const path = text(metadata.storage_path); deliverables.set(pieceId, { id: String(asset.id), type: text(asset.asset_type), name: text(asset.asset_name), provider: text(asset.provider), url: text(asset.asset_url) || text(asset.file_url) || (path ? signedUrls.get(path) || null : null), createdAt: text(asset.created_at), mimeType: text(metadata.mimeType) }); }
  return { summaries, deliverables };
}

function internalFallback(pieceId: string, requestedAt: string | null): StudioChangeSummary { return { pieceId, source: "internal", message: "No se registró un comentario adicional para esta corrección.", requestedAt, requestedByLabel: "Equipo Cometa" }; }
