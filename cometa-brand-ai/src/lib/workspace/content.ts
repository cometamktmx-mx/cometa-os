import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminWorkspace } from "@/lib/workspace/admin-brands";
import { contentGroup, contentStatusLabel, type ContentGroup, type WorkspaceContentItem } from "@/lib/workspace/content-presentation";

const ITEM_FIELDS = "id,calendar_id,brand_slug,title,content_type,publish_date,due_date,status,assigned_to,distribution_type,delivery_type";
function db(): SupabaseClient { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE; if (!url || !key) throw new Error("ADMIN_SERVER_CONFIG_INVALID"); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
function string(value: unknown) { return typeof value === "string" ? value : null; }
export function validContentPeriod(month: number, year: number) { return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 2000 && year <= 2100; }

export async function getGlobalContentData(month: number, year: number) {
  await requireAdminWorkspace(); if (!validContentPeriod(month, year)) throw new Error("CONTENT_PERIOD_INVALID");
  const client = db();
  const brandsResult = await client.from("brands").select("id,slug,name,status").eq("status", "active").order("name"); if (brandsResult.error) throw brandsResult.error;
  const brands = (brandsResult.data || []).map((row) => ({ id: String(row.id), slug: String(row.slug), name: String(row.name) }));
  const empty = { period: { month, year }, items: [] as WorkspaceContentItem[], brands, assignees: [], counts: emptyCounts() };
  if (!brands.length) return empty;
  const slugs = brands.map((brand) => brand.slug); const brandBySlug = new Map(brands.map((brand) => [brand.slug, brand]));
  const start = `${year}-${String(month).padStart(2, "0")}-01`; const endDate = new Date(Date.UTC(year, month, 1)); const end = endDate.toISOString().slice(0, 10);
  const calendars = await client.from("mercury_calendars").select("id,brand_slug,cycle_month,cycle_year").in("brand_slug", slugs).eq("cycle_month", month).eq("cycle_year", year);
  if (calendars.error) throw calendars.error;
  const calendarIds = (calendars.data || []).map((row) => String(row.id));
  const [dated, undated] = await Promise.all([
    client.from("mercury_content_items").select(ITEM_FIELDS).in("brand_slug", slugs).gte("publish_date", start).lt("publish_date", end).limit(1000),
    calendarIds.length ? client.from("mercury_content_items").select(ITEM_FIELDS).in("brand_slug", slugs).in("calendar_id", calendarIds).is("publish_date", null).limit(1000) : Promise.resolve({ data: [], error: null }),
  ]);
  if (dated.error || undated.error) throw dated.error || undated.error;
  const rows = [...(dated.data || []).map((row) => ({ ...row, period_source: "publish_date" })), ...(undated.data || []).map((row) => ({ ...row, period_source: "calendar" }))] as Array<Record<string, unknown>>;
  const ids = rows.map((row) => String(row.id)); if (!ids.length) return empty;
  const userIds = [...new Set(rows.map((row) => string(row.assigned_to)).filter((value): value is string => Boolean(value)))];
  const [profiles, assets] = await Promise.all([
    userIds.length ? client.from("user_profiles").select("user_id,full_name,email,status").in("user_id", userIds) : Promise.resolve({ data: [], error: null }),
    client.from("mercury_content_assets").select("id,content_item_id,asset_type,asset_url,file_url,asset_status,provider,metadata,created_at").in("content_item_id", ids).neq("asset_status", "deleted").order("created_at", { ascending: false }),
  ]);
  if (profiles.error || assets.error) throw profiles.error || assets.error;
  const profileById = new Map((profiles.data || []).filter((row) => row.status === "active").map((row) => [String(row.user_id), String(row.full_name || row.email || "Miembro Cometa")]));
  const assetsByItem = new Map<string, Array<Record<string, unknown>>>(); for (const asset of assets.data || []) { const id = String(asset.content_item_id); assetsByItem.set(id, [...(assetsByItem.get(id) || []), asset as Record<string, unknown>]); }
  const previewAssetByItem = new Map<string, Record<string, unknown>>(); for (const [id, values] of assetsByItem) { const preferred = values.find((asset) => ["final_design", "video", "design_preview"].includes(String(asset.asset_type))) || values[0]; if (preferred) previewAssetByItem.set(id, preferred); }
  const storagePaths = [...new Set([...previewAssetByItem.values()].map((asset) => asset.provider === "supabase" && asset.metadata && typeof asset.metadata === "object" ? string((asset.metadata as Record<string, unknown>).storage_path) : null).filter((value): value is string => Boolean(value)))];
  const signedByPath = new Map<string, string>(); if (storagePaths.length) { const signed = await client.storage.from("brand-content").createSignedUrls(storagePaths, 900); if (!signed.error) for (const entry of signed.data || []) if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl); }
  const items: WorkspaceContentItem[] = rows.flatMap((row) => { const brand = brandBySlug.get(String(row.brand_slug)); if (!brand) return []; const asset = previewAssetByItem.get(String(row.id)); const metadata = asset?.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {}; const path = string(metadata.storage_path); const status = String(row.status); return [{ id: String(row.id), brandSlug: brand.slug, brandName: brand.name, title: string(row.title) || "Sin título", contentType: string(row.content_type), distributionType: string(row.distribution_type), deliveryType: string(row.delivery_type), status, statusLabel: contentStatusLabel(status), group: contentGroup(status), assignedTo: string(row.assigned_to), assigneeName: profileById.get(String(row.assigned_to)) || null, publishDate: string(row.publish_date), dueDate: string(row.due_date), periodSource: row.period_source === "calendar" ? "calendar" as const : "publish_date" as const, thumbnailUrl: asset ? string(asset.asset_url) || string(asset.file_url) || (path ? signedByPath.get(path) || null : null) : null }]; });
  items.sort((a, b) => String(a.publishDate || a.dueDate || "9999-12-31").localeCompare(String(b.publishDate || b.dueDate || "9999-12-31")));
  const counts = emptyCounts(); for (const item of items) counts[item.group]++;
  return { period: { month, year }, items, brands, assignees: [...profileById.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), counts };
}

function emptyCounts(): Record<ContentGroup, number> { return { planned: 0, production: 0, review: 0, changes: 0, client: 0, scheduled: 0, published: 0, cancelled: 0 }; }
