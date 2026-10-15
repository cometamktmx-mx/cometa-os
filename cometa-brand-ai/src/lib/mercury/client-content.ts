import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireBrandOsAccess } from "@/lib/brand-os/server";

export type ClientContentStatus =
  | "in_production"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published"
  | "cancelled";

export type MarketingCalendarItem = {
  id: string;
  title: string;
  contentType: string | null;
  platform: string | null;
  objective: string | null;
  brief: string | null;
  copy: string | null;
  cta: string | null;
  visualDirection: string | null;
  referenceNotes: string | null;
  publishDate: string | null;
  dueDate: string | null;
  status: ClientContentStatus;
  statusLabel: string;
  distributionType?: "organic" | "paid" | "organic_paid" | null;
};

export type MarketingAsset = {
  id: string;
  type: string | null;
  url: string | null;
  provider: string | null;
  label: string | null;
  status: string | null;
  mimeType?: string | null;
  available?: boolean;
};
export type ClientReview = { id: string; status: string; submittedAt: string | null; decidedAt: string | null; decisionComment: string | null; canApprove: boolean; canRequestChanges: boolean };

export type MarketingComment = {
  id: string;
  comment: string;
  authorRole: string | null;
  createdAt: string | null;
};

const ITEM_FIELDS = "id,title,content_type,platform,objective,brief,copy_base,cta,visual_direction,reference_notes,publish_date,due_date,status,distribution_type,calendar_id";

const CALENDAR_FIELDS =
  "id,cycle_month,cycle_year,cycle_start_date,cycle_end_date,status";

const ASSET_FIELDS =
  "id,asset_type,asset_url,file_url,asset_name,asset_status,provider,metadata";

export const CLIENT_VISIBLE_WITHOUT_REVIEW_STATUSES = new Set([
  "scheduled",
  "published",
  "analyzed",
]);

export function isClientContentVisible(status: unknown, hasReviewHistory: boolean) {
  return hasReviewHistory || CLIENT_VISIBLE_WITHOUT_REVIEW_STATUSES.has(String(status || "").toLowerCase());
}

const STATUS_LABELS: Record<string, string> = {
  generated: "En producción",
  internal_review: "En producción",
  assigned: "En producción",
  in_design: "En producción",
  design_uploaded: "En revisión",
  approved_internal: "En revisión",
  sent_to_client: "En revisión",
  changes_requested: "Cambios solicitados",
  approved_client: "Aprobado",
  scheduled: "Programado",
  published: "Publicado",
  analyzed: "Publicado",
  cancelled: "Cancelado",
};

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing Supabase server configuration");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeStatus(value: unknown): ClientContentStatus {
  const status = String(value || "generated").toLowerCase();
  if (["changes_requested"].includes(status)) return "changes_requested";
  if (["approved_client"].includes(status)) return "approved";
  if (["scheduled"].includes(status)) return "scheduled";
  if (["published", "analyzed"].includes(status)) return "published";
  if (["cancelled"].includes(status)) return "cancelled";
  if (["design_uploaded", "approved_internal", "sent_to_client"].includes(status)) {
    return "in_review";
  }
  return "in_production";
}

function projectItem(row: Record<string, unknown>): MarketingCalendarItem {
  const rawStatus = String(row.status || "generated").toLowerCase();
  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "Sin título",
    contentType: typeof row.content_type === "string" ? row.content_type : null,
    platform: typeof row.platform === "string" ? row.platform : null,
    objective: typeof row.objective === "string" ? row.objective : null,
    brief: typeof row.brief === "string" ? row.brief : null,
    copy: typeof row.copy_base === "string" ? row.copy_base : null,
    cta: typeof row.cta === "string" ? row.cta : null,
    visualDirection:
      typeof row.visual_direction === "string" ? row.visual_direction : null,
    referenceNotes:
      typeof row.reference_notes === "string" ? row.reference_notes : null,
    publishDate: typeof row.publish_date === "string" ? row.publish_date : null,
    dueDate: typeof row.due_date === "string" ? row.due_date : null,
    status: normalizeStatus(row.status),
    statusLabel: STATUS_LABELS[rawStatus] || "En producción",
  };
}

function summary(items: MarketingCalendarItem[]) {
  return items.reduce(
    (result, item) => {
      result.total += 1;
      if (item.status === "in_production") result.inProduction += 1;
      if (item.status === "in_review") result.inReview += 1;
      if (item.status === "changes_requested") result.changesRequested += 1;
      if (item.status === "approved") result.approved += 1;
      if (item.status === "scheduled") result.scheduled += 1;
      if (item.status === "published") result.published += 1;
      return result;
    },
    {
      total: 0,
      inProduction: 0,
      inReview: 0,
      changesRequested: 0,
      approved: 0,
      scheduled: 0,
      published: 0,
    }
  );
}

export function isValidCalendarPeriod(month: number, year: number) {
  return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 2000 && year <= 2100;
}

export async function getClientMarketingCalendar({
  brandSlug,
  month,
  year,
}: {
  brandSlug: string;
  month: number;
  year: number;
}) {
  const access = await requireBrandOsAccess(brandSlug);
  const client = adminClient();
  const canonicalSlug = access.brand.slug;

  const { data: calendar, error: calendarError } = await client
    .from("mercury_calendars")
    .select(CALENDAR_FIELDS)
    .eq("brand_slug", canonicalSlug)
    .eq("cycle_month", month)
    .eq("cycle_year", year)
    .maybeSingle();

  if (calendarError) throw calendarError;
  if (!calendar) {
    return {
      brand: { slug: canonicalSlug, name: access.brand.name },
      period: { month, year },
      calendar: null,
      summary: summary([]),
      items: [],
    };
  }

  const { data: rows, error: itemsError } = await client
    .from("mercury_content_items")
    .select(ITEM_FIELDS)
    .eq("calendar_id", calendar.id)
    .eq("brand_slug", canonicalSlug)
    .order("publish_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (itemsError) throw itemsError;
  const { data: reviewRows, error: reviewsError } = await client
    .from("mercury_client_content_reviews")
    .select("content_item_id")
    .eq("brand_slug", canonicalSlug)
    .eq("calendar_id", calendar.id);
  if (reviewsError) throw reviewsError;
  const reviewedItemIds = new Set((reviewRows || []).map((review) => String(review.content_item_id)));
  const items = (rows || [])
    .filter((row) => isClientContentVisible(row.status, reviewedItemIds.has(String(row.id))))
    .map((row) => projectItem(row as unknown as Record<string, unknown>));

  return {
    brand: { slug: canonicalSlug, name: access.brand.name },
    period: { month, year },
    calendar: {
      id: String(calendar.id),
      cycleMonth: Number(calendar.cycle_month),
      cycleYear: Number(calendar.cycle_year),
      cycleStartDate: calendar.cycle_start_date || null,
      cycleEndDate: calendar.cycle_end_date || null,
      status: calendar.status || null,
    },
    summary: summary(items),
    items,
  };
}

export async function getClientMarketingContentItem({
  brandSlug,
  contentItemId,
}: {
  brandSlug: string;
  contentItemId: string;
}) {
  const access = await requireBrandOsAccess(brandSlug);
  const client = adminClient();
  const canonicalSlug = access.brand.slug;

  const { data: row, error } = await client
    .from("mercury_content_items")
    .select(ITEM_FIELDS)
    .eq("id", contentItemId)
    .eq("brand_slug", canonicalSlug)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: reviewEvidence, error: reviewEvidenceError } = await client
    .from("mercury_client_content_reviews")
    .select("id")
    .eq("brand_slug", canonicalSlug)
    .eq("calendar_id", row.calendar_id)
    .eq("content_item_id", contentItemId)
    .limit(1)
    .maybeSingle();
  if (reviewEvidenceError) throw reviewEvidenceError;
  if (!isClientContentVisible(row.status, Boolean(reviewEvidence))) return null;

  const item = projectItem(row as unknown as Record<string, unknown>);
  const { data: assets, error: assetsError } = await client
    .from("mercury_content_assets")
    .select(ASSET_FIELDS)
    .eq("content_item_id", contentItemId)
    .eq("brand_slug", canonicalSlug)
    .neq("asset_status", "deleted")
    .order("created_at", { ascending: false });
  if (assetsError) throw assetsError;

  const { data: comments, error: commentsError } = await client
    .from("mercury_content_comments")
    .select("id,comment,user_role,created_at")
    .eq("content_item_id", contentItemId)
    .eq("brand_slug", canonicalSlug)
    .eq("is_private", false)
    .order("created_at", { ascending: true });
  if (commentsError) throw commentsError;

  const { data: review, error: reviewError } = await client
    .from("mercury_client_content_reviews")
    .select("id,status,submitted_at,decided_at,decision_comment,asset_snapshot,content_snapshot")
    .eq("content_item_id", contentItemId)
    .eq("brand_slug", canonicalSlug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reviewError && reviewError.code !== "42P01") throw reviewError;

  const reviewDto: ClientReview | null = review ? { id: String(review.id), status: String(review.status), submittedAt: review.submitted_at || null, decidedAt: review.decided_at || null, decisionComment: review.decision_comment || null, canApprove: review.status === "pending", canRequestChanges: review.status === "pending" } : null;
  const rawSnapshot = review?.content_snapshot && typeof review.content_snapshot === "object" ? review.content_snapshot as Record<string, unknown> : null;
  const displayContent = review?.status === "pending" && rawSnapshot ? { title: typeof rawSnapshot.title === "string" ? rawSnapshot.title : item.title, contentType: typeof rawSnapshot.contentType === "string" ? rawSnapshot.contentType : item.contentType, platform: typeof rawSnapshot.platform === "string" ? rawSnapshot.platform : item.platform, objective: typeof rawSnapshot.objective === "string" ? rawSnapshot.objective : item.objective, brief: typeof rawSnapshot.brief === "string" ? rawSnapshot.brief : item.brief, copy: typeof rawSnapshot.copy === "string" ? rawSnapshot.copy : item.copy, cta: typeof rawSnapshot.cta === "string" ? rawSnapshot.cta : item.cta, visualDirection: typeof rawSnapshot.visualDirection === "string" ? rawSnapshot.visualDirection : item.visualDirection, referenceNotes: typeof rawSnapshot.referenceNotes === "string" ? rawSnapshot.referenceNotes : null, publishDate: typeof rawSnapshot.publishDate === "string" ? rawSnapshot.publishDate : item.publishDate } : item;
  const snapshotIds = review?.status === "pending" && Array.isArray(review.asset_snapshot) ? new Set(review.asset_snapshot.map((entry: unknown) => entry && typeof entry === "object" && "assetId" in entry ? String((entry as { assetId: unknown }).assetId) : "")) : null;
  const displayAssets = snapshotIds ? (await Promise.all((assets || []).filter(asset => snapshotIds.has(String(asset.id))).map(async (asset) => ({ id: String(asset.id), type: typeof asset.asset_type === "string" ? asset.asset_type : null, url: typeof asset.asset_url === "string" ? asset.asset_url : typeof asset.file_url === "string" ? asset.file_url : null, provider: typeof asset.provider === "string" ? asset.provider : null, label: typeof asset.asset_name === "string" ? asset.asset_name : null, status: typeof asset.asset_status === "string" ? asset.asset_status : null, available: true })))) : undefined;
  return {
    brand: { slug: canonicalSlug, name: access.brand.name },
    item,
    assets: await Promise.all((assets || []).map(async (asset) => ({
      id: String(asset.id),
      type: typeof asset.asset_type === "string" ? asset.asset_type : null,
      url: typeof asset.asset_url === "string" ? asset.asset_url : typeof asset.file_url === "string" ? asset.file_url : (asset.provider === "supabase" && asset.metadata && typeof asset.metadata === "object" && typeof (asset.metadata as Record<string, unknown>).storage_path === "string" ? (await client.storage.from("brand-content").createSignedUrl(String((asset.metadata as Record<string, unknown>).storage_path), 900)).data?.signedUrl || null : null),
      provider: typeof asset.provider === "string" ? asset.provider : null,
      label: typeof asset.asset_name === "string" ? asset.asset_name : null,
      status: typeof asset.asset_status === "string" ? asset.asset_status : null,
    }))),
    comments: (comments || []).map((comment) => ({
      id: String(comment.id),
      comment: String(comment.comment || ""),
      authorRole: typeof comment.user_role === "string" ? comment.user_role : null,
      createdAt: typeof comment.created_at === "string" ? comment.created_at : null,
    })),
    review: reviewDto,
    displayContent,
    displayAssets,
  };
}
