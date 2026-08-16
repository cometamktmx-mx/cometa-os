import { PosApiError, assertDatabaseResult, getBrandSlugFromUrl, handlePosError, ok, uuidValue } from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["open", "acknowledged", "resolved", "dismissed"]);
const CATEGORIES = new Set(["opportunity", "risk", "anomaly", "trend", "loyalty", "customer", "inventory", "product"]);
const SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } = await requirePosOperationalAccess({ brandSlug, entitlement: "intelligence.signals" });
    const url = new URL(request.url);
    const { data, error } = await admin.rpc("pos_get_intelligence_signals", {
      p_brand_slug: brand.slug,
      p_location_id: parseLocation(url.searchParams.get("locationId")),
      p_status: parseChoice(url.searchParams.get("status") || "open", STATUSES, "POS_SIGNALS_INVALID_STATUS"),
      p_category: parseChoice(url.searchParams.get("category"), CATEGORIES, "POS_SIGNALS_INVALID_CATEGORY", true),
      p_severity: parseChoice(url.searchParams.get("severity"), SEVERITIES, "POS_SIGNALS_INVALID_SEVERITY", true),
      p_limit: parseInteger(url.searchParams.get("limit"), 20, 1, 100),
      p_offset: parseInteger(url.searchParams.get("offset"), 0, 0, 10000),
    });
    assertDatabaseResult(error, "No se pudieron cargar las señales comerciales.");
    return ok({ data });
  } catch (error) {
    return handleSignalsError(error, "POS_SIGNALS_READ_ERROR", "No se pudieron cargar las señales comerciales.");
  }
}

export async function POST(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } = await requirePosOperationalAccess({ brandSlug, entitlement: "intelligence.signals" });
    const url = new URL(request.url);
    const periodStart = parseDate(url.searchParams.get("dateFrom"), "dateFrom");
    const periodEnd = parseDate(url.searchParams.get("dateTo"), "dateTo");
    if (periodEnd.getTime() <= periodStart.getTime()) throw new PosApiError(400, "POS_SIGNALS_INVALID_RANGE", "El rango de fechas no es válido.");
    const { data, error } = await admin.rpc("pos_generate_intelligence_signals", {
      p_brand_slug: brand.slug,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
      p_location_id: parseLocation(url.searchParams.get("locationId")),
    });
    assertDatabaseResult(error, "No se pudieron actualizar las señales comerciales.");
    return ok({ data });
  } catch (error) {
    return handleSignalsError(error, "POS_SIGNALS_GENERATION_ERROR", "No se pudieron actualizar las señales comerciales.");
  }
}

function parseLocation(value: string | null) {
  try { return uuidValue(value, "locationId", false); }
  catch { throw new PosApiError(400, "POS_SIGNALS_INVALID_LOCATION", "La sucursal seleccionada no es válida."); }
}
function parseDate(value: string | null, field: string) {
  if (!value) throw new PosApiError(400, "POS_SIGNALS_INVALID_RANGE", `El campo ${field} es obligatorio.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new PosApiError(400, "POS_SIGNALS_INVALID_RANGE", `El campo ${field} no contiene una fecha válida.`);
  return date;
}
function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new PosApiError(400, "POS_SIGNALS_INVALID_PAGINATION", `El valor debe estar entre ${min} y ${max}.`);
  return parsed;
}
function parseChoice(value: string | null, allowed: Set<string>, code: string, nullable = false) {
  if (!value && nullable) return null;
  if (!value || !allowed.has(value)) throw new PosApiError(400, code, "El filtro de señales no es válido.");
  return value;
}
function handleSignalsError(error: unknown, code: string, message: string) {
  if (error instanceof PosApiError) return handlePosError(error);
  console.error("POS reports signals error:", error);
  return handlePosError(new PosApiError(500, code, message));
}
