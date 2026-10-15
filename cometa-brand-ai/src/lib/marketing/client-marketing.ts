import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireBrandOsAccess } from "@/lib/brand-os/server";
import { isClientContentVisible } from "@/lib/mercury/client-content";

const TZ = "America/Mexico_City";
const FIELDS = "id,title,content_type,platform,publish_date,due_date,status,distribution_type,calendar_id,created_at";

export type ClientMarketingItem = {
  id: string; title: string; contentType: string | null; platform: string | null;
  publishDate: string | null; dueDate: string | null; status: string;
  statusLabel: string; calendarId: string | null; createdAt: string | null;
};

const labels: Record<string, string> = {
  generated: "Borrador interno", internal_review: "En producción", assigned: "En producción",
  in_design: "En producción", design_uploaded: "En revisión", approved_internal: "En revisión",
  sent_to_client: "En revisión", changes_requested: "Cambios solicitados", approved_client: "Aprobado",
  scheduled: "Programado", published: "Publicado", analyzed: "Publicado", cancelled: "Cancelado",
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing Supabase server configuration");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function dateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), weekday: get("weekday") };
}

function isoDate(date: Date) { const p = dateParts(date); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; }
function addDays(date: Date, days: number) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; }

function project(row: Record<string, unknown>): ClientMarketingItem {
  const raw = String(row.status || "generated").toLowerCase();
  return { id: String(row.id), title: typeof row.title === "string" ? row.title : "Sin título", contentType: typeof row.content_type === "string" ? row.content_type : null, platform: typeof row.platform === "string" ? row.platform : null, publishDate: typeof row.publish_date === "string" ? row.publish_date : null, dueDate: typeof row.due_date === "string" ? row.due_date : null, status: raw, statusLabel: labels[raw] || "En producción", calendarId: row.calendar_id ? String(row.calendar_id) : null, createdAt: typeof row.created_at === "string" ? row.created_at : null };
}

async function loadVisible(brandSlug: string, period?: { month: number; year: number }) {
  const access = await requireBrandOsAccess(brandSlug);
  const db = client();
  let query = db.from("mercury_content_items").select(FIELDS).eq("brand_slug", access.brand.slug).order("publish_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  if (period) {
    const calendars = await db.from("mercury_calendars").select("id").eq("brand_slug", access.brand.slug).eq("cycle_month", period.month).eq("cycle_year", period.year);
    if (calendars.error) throw calendars.error;
    const calendarIds = (calendars.data || []).map((row) => String(row.id));
    if (!calendarIds.length) return { access, items: [] as ClientMarketingItem[] };
    query = query.in("calendar_id", calendarIds);
  }
  const { data: rows, error } = await query;
  if (error) throw error;
  const ids = (rows || []).map((row) => String(row.id));
  const { data: reviews, error: reviewError } = ids.length ? await db.from("mercury_client_content_reviews").select("content_item_id,status").eq("brand_slug", access.brand.slug).in("content_item_id", ids) : { data: [], error: null };
  if (reviewError) throw reviewError;
  const reviewIds = new Set((reviews || []).map((row) => String(row.content_item_id)));
  const items = (rows || []).filter((row) => isClientContentVisible(row.status, reviewIds.has(String(row.id)))).map((row) => project(row as Record<string, unknown>));
  return { access, items };
}

export async function getClientMarketingContent(brandSlug: string, period?: { month: number; year: number }) {
  return (await loadVisible(brandSlug, period)).items;
}

export async function getClientMarketingOverview(brandSlug: string, period = (() => { const p = dateParts(new Date()); return { month: p.month, year: p.year }; })()) {
  const { access, items } = await loadVisible(brandSlug, period);
  const now = new Date();
  const today = isoDate(now);
  const weekStart = addDays(now, -(dateParts(now).weekday === "Sun" ? 6 : dateParts(now).weekday === "Mon" ? 0 : ["Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dateParts(now).weekday) + 1));
  const weekDates = new Set(Array.from({ length: 7 }, (_, index) => isoDate(addDays(weekStart, index))));
  const weekItems = items.filter((item) => item.publishDate && weekDates.has(item.publishDate.slice(0, 10)));
  const pendingReviews = items.filter((item) => item.status === "sent_to_client");
  const movement = {
    production: items.filter((item) => ["generated", "internal_review", "assigned", "in_design", "design_uploaded", "approved_internal", "changes_requested"].includes(item.status)),
    review: pendingReviews,
    approved: items.filter((item) => item.status === "approved_client"),
    scheduled: items.filter((item) => item.status === "scheduled"),
  };
  const published = items.filter((item) => item.status === "published").sort((a, b) => String(b.publishDate || b.createdAt || "").localeCompare(String(a.publishDate || a.createdAt || "")));
  return { brand: { id: access.brand.id, slug: access.brand.slug, name: access.brand.name }, period, items, weekItems, movement, published, pendingReviews, today, counts: { total: items.length, published: published.length, scheduled: movement.scheduled.length, review: movement.review.length, approved: movement.approved.length, production: movement.production.length } };
}
