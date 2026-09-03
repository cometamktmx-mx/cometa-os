import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireBrandAccess } from "@/lib/brand-os/server";
import { recordCometaActivityEventAfterMutation } from "@/lib/cosmos/activity";
import { sendForReview } from "@/lib/mercury/reviews";
import { requireAdminWorkspace } from "@/lib/workspace/admin-brands";
import { APPROVAL_BUCKET_LABELS, contentGroup, contentStatusLabel, type ApprovalBucket, type ApprovalItem } from "@/lib/workspace/content-presentation";

const APPROVAL_STATUSES = ["design_uploaded", "internal_review", "approved_internal", "changes_requested", "sent_to_client"];
const ITEM_FIELDS = "id,calendar_id,brand_slug,title,content_type,objective,brief,cta,visual_direction,reference_notes,publish_date,due_date,status,assigned_to,distribution_type,delivery_type,updated_at";

function db(): SupabaseClient { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new Error("ADMIN_SERVER_CONFIG_INVALID"); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
function string(value: unknown) { return typeof value === "string" ? value : null; }
function bucket(status: string, latestReviewStatus: string | null): ApprovalBucket { if (["design_uploaded", "internal_review"].includes(status)) return "internal_review"; if (status === "approved_internal") return "ready_for_client"; if (status === "sent_to_client") return "client_reviewing"; return latestReviewStatus === "changes_requested" ? "client_changes" : "internal_changes"; }

export async function getApprovalCenterData() {
  await requireAdminWorkspace();
  const client = db();
  const brandsResult = await client.from("brands").select("id,slug,name,status").eq("status", "active").order("name");
  if (brandsResult.error) throw brandsResult.error;
  const brands = (brandsResult.data || []).map((row) => ({ id: String(row.id), slug: String(row.slug), name: String(row.name) }));
  if (!brands.length) return { items: [] as ApprovalItem[], brands: [], assignees: [], counts: emptyCounts() };
  const brandBySlug = new Map(brands.map((brand) => [brand.slug, brand]));
  const itemsResult = await client.from("mercury_content_items").select(ITEM_FIELDS).in("brand_slug", brands.map((brand) => brand.slug)).in("status", APPROVAL_STATUSES).order("publish_date", { ascending: true, nullsFirst: false }).limit(500);
  if (itemsResult.error) throw itemsResult.error;
  const rows = (itemsResult.data || []) as Array<Record<string, unknown>>;
  const ids = rows.map((row) => String(row.id));
  if (!ids.length) return { items: [] as ApprovalItem[], brands, assignees: [], counts: emptyCounts() };
  const userIds = [...new Set(rows.map((row) => string(row.assigned_to)).filter((value): value is string => Boolean(value)))];
  const [profiles, assets, reviews, comments] = await Promise.all([
    userIds.length ? client.from("user_profiles").select("user_id,full_name,email,status").in("user_id", userIds) : Promise.resolve({ data: [], error: null }),
    client.from("mercury_content_assets").select("id,content_item_id,asset_type,asset_name,asset_url,file_url,asset_status,provider,metadata,created_at").in("content_item_id", ids).neq("asset_status", "deleted").order("created_at", { ascending: false }),
    client.from("mercury_client_content_reviews").select("id,content_item_id,status,submitted_at,decided_at,decision_comment,created_at").in("content_item_id", ids).order("created_at", { ascending: false }),
    client.from("mercury_content_comments").select("id,content_item_id,comment,is_private,user_role,created_at").in("content_item_id", ids).order("created_at", { ascending: false }),
  ]);
  for (const result of [profiles, assets, reviews, comments]) if (result.error) throw result.error;
  const profileById = new Map((profiles.data || []).filter((row) => row.status === "active").map((row) => [String(row.user_id), String(row.full_name || row.email || "Miembro Cometa")]));
  const reviewsByItem = groupBy(reviews.data || [], "content_item_id");
  const commentsByItem = groupBy(comments.data || [], "content_item_id");
  const assetsByItem = groupBy(assets.data || [], "content_item_id");
  const storagePaths = [...new Set((assets.data || []).map((asset) => asset.provider === "supabase" && asset.metadata && typeof asset.metadata === "object" ? string((asset.metadata as Record<string, unknown>).storage_path) : null).filter((value): value is string => Boolean(value)))];
  const signedByPath = new Map<string, string>();
  if (storagePaths.length) { const signed = await client.storage.from("brand-content").createSignedUrls(storagePaths, 900); if (!signed.error) for (const entry of signed.data || []) if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl); }

  const items: ApprovalItem[] = rows.flatMap((row) => {
    const brand = brandBySlug.get(String(row.brand_slug)); if (!brand) return [];
    const reviewRows = reviewsByItem.get(String(row.id)) || [];
    const latestReview = reviewRows[0] || null;
    const assetRows = assetsByItem.get(String(row.id)) || [];
    const projectedAssets = assetRows.slice(0, 6).map((asset) => { const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {}; const path = string(metadata.storage_path); return { id: String(asset.id), type: string(asset.asset_type), label: string(asset.asset_name), url: string(asset.asset_url) || string(asset.file_url) || (path ? signedByPath.get(path) || null : null), mimeType: string(metadata.mimeType) || string(asset.file_type) }; });
    const status = String(row.status);
    const approvalBucket = bucket(status, latestReview ? String(latestReview.status) : null);
    const relevantComment = approvalBucket === "client_changes" && latestReview?.decision_comment ? { text: String(latestReview.decision_comment), createdAt: string(latestReview.decided_at), source: "client" as const } : (commentsByItem.get(String(row.id)) || []).find((comment) => comment.is_private === true) ? (() => { const comment = (commentsByItem.get(String(row.id)) || []).find((entry) => entry.is_private === true)!; return { text: String(comment.comment), createdAt: string(comment.created_at), source: "internal" as const }; })() : null;
    return [{ id: String(row.id), brandSlug: brand.slug, brandName: brand.name, title: string(row.title) || "Sin título", contentType: string(row.content_type), distributionType: string(row.distribution_type), deliveryType: string(row.delivery_type), status, statusLabel: contentStatusLabel(status), group: contentGroup(status), assignedTo: string(row.assigned_to), assigneeName: profileById.get(String(row.assigned_to)) || null, publishDate: string(row.publish_date), dueDate: string(row.due_date), periodSource: "publish_date" as const, thumbnailUrl: projectedAssets.find((asset) => asset.url)?.url || null, bucket: approvalBucket, objective: string(row.objective), brief: string(row.brief), cta: string(row.cta), visualDirection: string(row.visual_direction), referenceNotes: string(row.reference_notes), assets: projectedAssets, latestComment: relevantComment, reviewHistory: reviewRows.map((review) => ({ id: String(review.id), status: String(review.status), submittedAt: string(review.submitted_at), decidedAt: string(review.decided_at), decisionComment: string(review.decision_comment) })) }];
  });
  const counts = emptyCounts(); for (const item of items) counts[item.bucket]++;
  return { items, brands, assignees: [...profileById.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), counts };
}

export async function mutateApproval(input: { action: "request_internal_changes" | "approve_internal" | "send_to_client"; brandSlug: string; contentItemId: string; comment?: string }) {
  const actor = await requireAdminWorkspace();
  const access = await requireBrandAccess(input.brandSlug);
  const client = db();
  const current = await client.from("mercury_content_items").select("id,brand_slug,title,content_type,platform,status,updated_at").eq("id", input.contentItemId).eq("brand_slug", access.brand.slug).maybeSingle();
  if (current.error) throw current.error; if (!current.data) throw new Error("CONTENT_NOT_FOUND");
  if (input.action === "send_to_client") { if (current.data.status !== "approved_internal") throw new Error("APPROVAL_TRANSITION_NOT_ALLOWED"); return sendForReview(access.brand.slug, input.contentItemId, actor.userId); }
  const fromStatuses = input.action === "approve_internal" ? ["design_uploaded", "internal_review"] : ["design_uploaded", "internal_review", "approved_internal"];
  if (!fromStatuses.includes(String(current.data.status))) throw new Error("APPROVAL_TRANSITION_NOT_ALLOWED");
  if (input.action === "request_internal_changes") {
    const comment = input.comment?.trim() || ""; if (comment.length < 3 || comment.length > 2000) throw new Error("INVALID_COMMENT");
    const inserted = await client.from("mercury_content_comments").insert({ content_item_id: input.contentItemId, brand_name: access.brand.name, brand_slug: access.brand.slug, user_id: actor.userId, user_role: "cometa", comment, is_private: true }).select("id").single();
    if (inserted.error) throw inserted.error;
  }
  const statusTo = input.action === "approve_internal" ? "approved_internal" : "changes_requested";
  const updated = await client.from("mercury_content_items").update({ status: statusTo }).eq("id", input.contentItemId).eq("brand_slug", access.brand.slug).in("status", fromStatuses).select("id,status,updated_at").maybeSingle();
  if (updated.error || !updated.data) { if (input.action === "request_internal_changes") console.error("[APPROVAL_INTERNAL_PARTIAL_FAILURE]", { contentItemId: input.contentItemId, brandSlug: access.brand.slug, statusFrom: current.data.status, statusTo }); throw updated.error || new Error("APPROVAL_TRANSITION_CONFLICT"); }
  await recordCometaActivityEventAfterMutation({ eventType: "content.updated", entityType: "content_item", entityId: input.contentItemId, brand: { id: access.brand.id, slug: access.brand.slug }, actor: { type: "admin", userId: actor.userId }, contentItemId: input.contentItemId, contentTitle: String(current.data.title || "Contenido sin título"), contentType: string(current.data.content_type), platform: string(current.data.platform), occurredAt: String(updated.data.updated_at), persistedMutationAt: String(updated.data.updated_at), statusFrom: String(current.data.status), statusTo });
  return { id: input.contentItemId, status: statusTo };
}

function groupBy(rows: Array<Record<string, unknown>>, key: string) { const map = new Map<string, Array<Record<string, unknown>>>(); for (const row of rows) { const value = String(row[key]); map.set(value, [...(map.get(value) || []), row]); } return map; }
function emptyCounts(): Record<ApprovalBucket, number> { return { internal_review: 0, ready_for_client: 0, internal_changes: 0, client_changes: 0, client_reviewing: 0 }; }
export { APPROVAL_BUCKET_LABELS };
