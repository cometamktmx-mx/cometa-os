import {
  PosApiError,
  getBrandSlugFromUrl,
  handlePosError,
  uuidValue,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["products", "payments", "inventory"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "";
    if (!TYPES.has(type)) {
      throw new PosApiError(400, "POS_REPORTS_EXPORT_INVALID_TYPE", "El tipo de exportación no es válido.");
    }

    const dateFrom = parseDate(url.searchParams.get("dateFrom"), "dateFrom");
    const dateTo = parseDate(url.searchParams.get("dateTo"), "dateTo");
    if (dateTo <= dateFrom) {
      throw new PosApiError(400, "POS_REPORTS_INVALID_RANGE", "El rango de fechas no es válido.");
    }

    const locationId = parseLocationId(url.searchParams.get("locationId"));
    const { admin, brand } = await requirePosOperationalAccess({
      brandSlug: getBrandSlugFromUrl(request),
      entitlement: "pos.reports",
    });

    let rows: Record<string, unknown>[];
    if (type === "products") {
      const result = await admin.rpc("pos_get_reports_export_products_v1", {
        p_brand_slug: brand.slug,
        p_date_from: dateFrom.toISOString(),
        p_date_to: dateTo.toISOString(),
        p_location_id: locationId,
      });
      if (result.error) throw result.error;
      rows = asRows(result.data);
    } else if (type === "inventory") {
      const result = await admin.rpc("pos_get_reports_export_inventory_v1", {
        p_brand_slug: brand.slug,
        p_date_from: dateFrom.toISOString(),
        p_date_to: dateTo.toISOString(),
        p_location_id: locationId,
      });
      if (result.error) throw result.error;
      rows = asRows(result.data);
    } else {
      const result = await admin.rpc("pos_get_analytics_summary", {
        p_brand_slug: brand.slug,
        p_date_from: dateFrom.toISOString(),
        p_date_to: dateTo.toISOString(),
        p_location_id: locationId,
      });
      if (result.error) throw result.error;
      const summary = asRecord(result.data);
      rows = asRows(summary.payments).map((row) => ({
        payment_method: row.paymentMethod,
        payment_count: row.transactionsCount,
        amount: row.amount,
        percentage: row.percentageOfSales,
      }));
    }

    const columns = type === "products"
      ? ["product_code", "product_name", "variant_name", "sku", "current_attributes", "units_sold", "net_sales", "historical_cogs", "gross_margin", "gross_margin_pct", "current_stock", "location_name"]
      : type === "inventory"
        ? ["product_code", "product_name", "variant_name", "sku", "location", "available_quantity", "minimum_quantity", "current_unit_cost", "estimated_inventory_value", "average_units_per_day", "estimated_days_of_stock", "status"]
        : ["payment_method", "payment_count", "amount", "percentage"];

    const normalizedRows = rows.map((row) => normalizeRow(row, type));
    const csv = `\uFEFF${toCsv(columns, normalizedRows)}\r\n`;
    const datePart = dateTo.toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cometa-pos-${type}-${datePart}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handlePosError(error);
  }
}

function normalizeRow(row: Record<string, unknown>, type: string) {
  if (type === "products") {
    return {
      product_code: row.productCode,
      product_name: row.productName,
      variant_name: row.variantName,
      sku: row.sku,
      current_attributes: stringifyJson(row.currentAttributes),
      units_sold: row.unitsSold,
      net_sales: row.netSales,
      historical_cogs: row.historicalCogs,
      gross_margin: row.grossMargin,
      gross_margin_pct: row.grossMarginPct,
      current_stock: row.currentStock,
      location_name: row.locationName,
    };
  }
  if (type === "inventory") {
    return {
      product_code: row.productCode,
      product_name: row.productName,
      variant_name: row.variantName,
      sku: row.sku,
      location: row.location,
      available_quantity: row.availableQuantity,
      minimum_quantity: row.minimumQuantity,
      current_unit_cost: row.currentUnitCost,
      estimated_inventory_value: row.estimatedInventoryValue,
      average_units_per_day: row.averageUnitsPerDay,
      estimated_days_of_stock: row.estimatedDaysOfStock,
      status: row.status,
    };
  }
  return row;
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringifyJson(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function toCsv(columns: string[], rows: Record<string, unknown>[]) {
  const lines = [columns.map(escapeCsv).join(",")];
  for (const row of rows) lines.push(columns.map((column) => escapeCsv(formatValue(row[column]))).join(","));
  return lines.join("\r\n");
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCsv(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseDate(value: string | null, field: string) {
  if (!value) throw new PosApiError(400, "POS_REPORTS_INVALID_RANGE", `El campo ${field} es obligatorio.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new PosApiError(400, "POS_REPORTS_INVALID_RANGE", `El campo ${field} no contiene una fecha válida.`);
  return parsed;
}

function parseLocationId(value: string | null) {
  if (!value) return null;
  try { return uuidValue(value, "locationId", false); }
  catch { throw new PosApiError(400, "POS_REPORTS_INVALID_LOCATION", "La sucursal seleccionada no es válida."); }
}
