import {
  PosApiError,
  assertDatabaseResult,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  readJsonBody,
  uuidValue,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWS = {
  summary: "pos_get_analytics_summary",
  products: "pos_get_analytics_products",
  operational_products: "pos_get_operational_report_products_v1",
  customers: "pos_get_analytics_customers",
  inventory: "pos_get_analytics_inventory",
  loyalty: "pos_get_analytics_loyalty",
  sales_series: "pos_get_analytics_sales_series",
  patterns: "pos_get_analytics_sales_patterns",
  product_pairs: "pos_get_analytics_product_pairs",
  data_quality: "pos_get_analytics_data_quality",
} as const;

type ReportsView = keyof typeof VIEWS;
const GRANULARITIES = new Set(["hour", "day", "week", "month"]);
const PRODUCT_ORDER = new Set(["sales_total", "units_sold", "ticket_count"]);
const SIGNAL_STATUSES = new Set(["open", "acknowledged", "resolved", "dismissed"]);
const SIGNAL_CATEGORIES = new Set(["opportunity", "risk", "anomaly", "trend", "loyalty", "customer", "inventory", "product"]);
const SIGNAL_SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const url = new URL(request.url);
    const view = String(url.searchParams.get("view") || "summary");
    const { admin, brand } = await requirePosOperationalAccess({
      brandSlug,
      entitlement: view === "signals" ? "intelligence.signals" : "pos.reports",
    });

    if (view === "signals") {
      const locationId = parseLocationId(url.searchParams.get("locationId"));
      const status = parseSetValue(url.searchParams.get("status") || "open", SIGNAL_STATUSES, "status");
      const category = parseSetValue(url.searchParams.get("category"), SIGNAL_CATEGORIES, "category");
      const severity = parseSetValue(url.searchParams.get("severity"), SIGNAL_SEVERITIES, "severity");
      const { data, error } = await admin.rpc("pos_get_intelligence_signals", {
        p_brand_slug: brand.slug,
        p_location_id: locationId,
        p_status: status,
        p_category: category,
        p_severity: severity,
        p_limit: parseInteger(url.searchParams.get("limit"), 20, 1, 100),
        p_offset: parseInteger(url.searchParams.get("offset"), 0, 0, 10000),
      });
      assertDatabaseResult(error, "No se pudieron cargar las señales del negocio.");
      return ok({ view, data });
    }

    if (!(view in VIEWS)) {
      throw new PosApiError(400, "POS_REPORTS_INVALID_VIEW", "La vista de reportes no es válida.");
    }

    const dateFrom = parseDate(url.searchParams.get("dateFrom"), "dateFrom");
    const dateTo = parseDate(url.searchParams.get("dateTo"), "dateTo");
    if (dateTo.getTime() <= dateFrom.getTime()) {
      throw new PosApiError(400, "POS_REPORTS_INVALID_RANGE", "El rango de fechas no es válido.");
    }

    let locationId: string | null;
    try {
      locationId = parseLocationId(url.searchParams.get("locationId"));
    } catch {
      throw new PosApiError(400, "POS_REPORTS_INVALID_LOCATION", "La sucursal seleccionada no es válida.");
    }
    const args: Record<string, unknown> = {
      p_brand_slug: brand.slug,
      p_date_from: dateFrom.toISOString(),
      p_date_to: dateTo.toISOString(),
      p_location_id: locationId,
    };

    if (view === "sales_series") {
      const granularity = String(url.searchParams.get("granularity") || "day");
      if (!GRANULARITIES.has(granularity)) {
        throw new PosApiError(400, "POS_REPORTS_INVALID_GRANULARITY", "La granularidad no es válida.");
      }
      args.p_granularity = granularity;
    }

    if (view === "products" || view === "operational_products" || view === "customers" || view === "product_pairs") {
      const maximum = view === "products" || view === "operational_products" ? 500 : 200;
      const fallback = view === "products" || view === "operational_products" ? 200 : 50;
      const limit = parseInteger(url.searchParams.get("limit"), fallback, 1, maximum);
      args.p_limit = limit;
      if (view === "products") {
        const orderBy = String(url.searchParams.get("orderBy") || "sales_total");
        if (!PRODUCT_ORDER.has(orderBy)) {
          throw new PosApiError(400, "POS_REPORTS_INVALID_ORDER", "El orden de productos no es válido.");
        }
        args.p_order_by = orderBy;
      }
    }

    const reportsView = view as ReportsView;
    const { data, error } = await admin.rpc(VIEWS[reportsView], args);
    assertDatabaseResult(error, "No se pudo cargar la analítica solicitada.");
    return ok({ view, data });
  } catch (error) {
    if (error instanceof PosApiError) return handlePosError(error);
    console.error("POS reports analytics error:", error);
    return handlePosError(new PosApiError(500, "POS_REPORTS_ANALYTICS_ERROR", "No se pudieron cargar los reportes."));
  }
}

export async function POST(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } = await requirePosOperationalAccess({
      brandSlug,
      entitlement: "intelligence.signals",
    });
    const body = await readJsonBody<Record<string, unknown>>(request);
    if (body.action !== "generate_signals") {
      throw new PosApiError(400, "POS_REPORTS_INVALID_ACTION", "La acción de reportes no es válida.");
    }
    const dateFrom = parseDate(typeof body.dateFrom === "string" ? body.dateFrom : null, "dateFrom");
    const dateTo = parseDate(typeof body.dateTo === "string" ? body.dateTo : null, "dateTo");
    if (dateTo.getTime() <= dateFrom.getTime()) {
      throw new PosApiError(400, "POS_REPORTS_INVALID_RANGE", "El rango de fechas no es válido.");
    }
    const locationId = parseLocationId(typeof body.locationId === "string" ? body.locationId : null);
    const { data, error } = await admin.rpc("pos_generate_intelligence_signals", {
      p_brand_slug: brand.slug,
      p_period_start: dateFrom.toISOString(),
      p_period_end: dateTo.toISOString(),
      p_location_id: locationId,
    });
    assertDatabaseResult(error, "No se pudieron generar las señales del negocio.");
    return ok({ data });
  } catch (error) {
    if (error instanceof PosApiError) return handlePosError(error);
    console.error("POS reports signals generation error:", error);
    return handlePosError(new PosApiError(500, "POS_REPORTS_SIGNALS_ERROR", "No se pudieron generar las señales."));
  }
}

function parseDate(value: string | null, field: string) {
  if (!value) throw new PosApiError(400, "POS_REPORTS_INVALID_RANGE", `El campo ${field} es obligatorio.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PosApiError(400, "POS_REPORTS_INVALID_RANGE", `El campo ${field} no contiene una fecha válida.`);
  }
  return date;
}

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new PosApiError(400, "POS_REPORTS_INVALID_LIMIT", `limit debe estar entre ${min} y ${max}.`);
  }
  return parsed;
}

function parseLocationId(value: string | null) {
  try {
    return uuidValue(value, "locationId", false);
  } catch {
    throw new PosApiError(400, "POS_REPORTS_INVALID_LOCATION", "La sucursal seleccionada no es válida.");
  }
}

function parseSetValue(value: string | null, allowed: Set<string>, field: string) {
  if (!value) return null;
  if (!allowed.has(value)) {
    throw new PosApiError(400, "POS_REPORTS_INVALID_SIGNAL_FILTER", `El filtro ${field} no es válido.`);
  }
  return value;
}
