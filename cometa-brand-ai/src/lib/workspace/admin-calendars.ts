import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BrandOsGuardError } from "@/lib/brand-os/server";
import { requireAdminWorkspace } from "@/lib/workspace/admin-brands";

const COMETA_TIME_ZONE = "America/Mexico_City";
const TERMINAL_OR_CANCELLED = new Set(["published", "analyzed", "cancelled"]);

type CanonicalBrandRow = { id: unknown; slug: unknown; name: unknown };
type CalendarRow = { id: unknown; brand_slug: unknown; cycle_month: unknown; cycle_year: unknown; status: unknown };
type ContentRow = { id: unknown; calendar_id: unknown; brand_slug: unknown; title: unknown; publish_date: unknown; due_date: unknown; status: unknown };

export type AdminCalendarItemPreview = {
  id: string;
  title: string;
  publishDate: string;
  status: string;
};

export type AdminCalendarSummary = {
  id: string;
  brandSlug: string;
  brandName: string;
  cycleMonth: number;
  cycleYear: number;
  status: string;
  counts: {
    total: number;
    internalReview: number;
    sentToClient: number;
    changesRequested: number;
    approvedClient: number;
    scheduled: number;
    published: number;
    analyzed: number;
  };
  upcomingPublications: AdminCalendarItemPreview[];
};

export type AdminCalendarBrandGroup = {
  id: string;
  slug: string;
  name: string;
  calendars: AdminCalendarSummary[];
};

export type AdminTodayActivity = {
  date: string;
  scheduledPublications: number;
  dueItems: number;
  internalReviews: number;
  awaitingClient: number;
  changesRequested: number;
};

export type AdminCalendarWorkspaceOverview = {
  brands: AdminCalendarBrandGroup[];
  today: AdminTodayActivity;
};

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new BrandOsGuardError(500, "ADMIN_SERVER_CONFIG_INVALID", "Configuración de servidor incompleta.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function dateInCometaTimeZone(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMETA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function date(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function getAdminCalendarWorkspaceOverview(): Promise<AdminCalendarWorkspaceOverview> {
  await requireAdminWorkspace();
  const client = adminClient();
  const { data: brandRows, error: brandError } = await client.from("brands").select("id,slug,name").order("name", { ascending: true });
  if (brandError) throw brandError;

  const brands = ((brandRows || []) as CanonicalBrandRow[]).map((row) => ({ id: string(row.id), slug: string(row.slug), name: string(row.name) })).filter((brand) => brand.id && brand.slug && brand.name);
  const today = dateInCometaTimeZone();
  const emptyToday: AdminTodayActivity = { date: today, scheduledPublications: 0, dueItems: 0, internalReviews: 0, awaitingClient: 0, changesRequested: 0 };
  if (!brands.length) return { brands: [], today: emptyToday };

  const canonicalBySlug = new Map(brands.map((brand) => [brand.slug, brand]));
  const { data: calendarRows, error: calendarError } = await client
    .from("mercury_calendars")
    .select("id,brand_slug,cycle_month,cycle_year,status")
    .in("brand_slug", brands.map((brand) => brand.slug))
    .order("cycle_year", { ascending: false })
    .order("cycle_month", { ascending: false });
  if (calendarError) throw calendarError;

  const calendars = ((calendarRows || []) as CalendarRow[]).map((row) => ({
    id: string(row.id),
    brandSlug: string(row.brand_slug),
    cycleMonth: Number(row.cycle_month),
    cycleYear: Number(row.cycle_year),
    status: string(row.status),
  })).filter((calendar) => calendar.id && canonicalBySlug.has(calendar.brandSlug) && Number.isInteger(calendar.cycleMonth) && Number.isInteger(calendar.cycleYear));
  if (!calendars.length) return { brands: brands.map((brand) => ({ ...brand, calendars: [] })), today: emptyToday };

  const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const { data: itemRows, error: itemError } = await client
    .from("mercury_content_items")
    .select("id,calendar_id,brand_slug,title,publish_date,due_date,status")
    .in("calendar_id", calendars.map((calendar) => calendar.id))
    .in("brand_slug", brands.map((brand) => brand.slug));
  if (itemError) throw itemError;

  const itemsByCalendar = new Map<string, Array<{ id: string; title: string; publishDate: string | null; dueDate: string | null; status: string }>>();
  for (const row of (itemRows || []) as ContentRow[]) {
    const calendarId = string(row.calendar_id);
    const brandSlug = string(row.brand_slug);
    const calendar = calendarById.get(calendarId);
    // The pair is revalidated even though both filters are present. A row can
    // only contribute to the calendar whose persisted brand_slug matches it.
    if (!calendar || calendar.brandSlug !== brandSlug || !canonicalBySlug.has(brandSlug)) continue;
    const item = { id: string(row.id), title: string(row.title) || "Sin título", publishDate: date(row.publish_date), dueDate: date(row.due_date), status: string(row.status) };
    itemsByCalendar.set(calendarId, [...(itemsByCalendar.get(calendarId) || []), item]);
  }

  const todayActivity = { ...emptyToday };
  const summariesByBrand = new Map<string, AdminCalendarSummary[]>();
  for (const calendar of calendars) {
    const brand = canonicalBySlug.get(calendar.brandSlug);
    if (!brand) continue;
    const items = itemsByCalendar.get(calendar.id) || [];
    const counts: AdminCalendarSummary["counts"] = { total: items.length, internalReview: 0, sentToClient: 0, changesRequested: 0, approvedClient: 0, scheduled: 0, published: 0, analyzed: 0 };
    for (const item of items) {
      if (item.status === "internal_review") counts.internalReview++;
      if (item.status === "sent_to_client") counts.sentToClient++;
      if (item.status === "changes_requested") counts.changesRequested++;
      if (item.status === "approved_client") counts.approvedClient++;
      if (item.status === "scheduled") counts.scheduled++;
      if (item.status === "published") counts.published++;
      if (item.status === "analyzed") counts.analyzed++;
      if (item.publishDate === today && item.status === "scheduled") todayActivity.scheduledPublications++;
      if (item.dueDate === today && !TERMINAL_OR_CANCELLED.has(item.status)) todayActivity.dueItems++;
      if (item.status === "internal_review") todayActivity.internalReviews++;
      if (item.status === "sent_to_client") todayActivity.awaitingClient++;
      if (item.status === "changes_requested") todayActivity.changesRequested++;
    }
    const upcomingPublications = items
      .filter((item) => item.publishDate && item.publishDate >= today && !TERMINAL_OR_CANCELLED.has(item.status))
      .sort((left, right) => String(left.publishDate).localeCompare(String(right.publishDate)))
      .slice(0, 3)
      .map((item) => ({ id: item.id, title: item.title, publishDate: item.publishDate as string, status: item.status }));
    const summary: AdminCalendarSummary = { ...calendar, brandName: brand.name, counts, upcomingPublications };
    summariesByBrand.set(brand.slug, [...(summariesByBrand.get(brand.slug) || []), summary]);
  }

  return { brands: brands.map((brand) => ({ ...brand, calendars: summariesByBrand.get(brand.slug) || [] })), today: todayActivity };
}
