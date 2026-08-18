import { getBusinessDocumentProfile } from "@/lib/pos/business-document-profile";
import { requirePosOperationalAccess } from "@/lib/pos/access";
import { PosApiError, uuidValue } from "@/lib/pos/server";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

export default async function ReportsPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { brandSlug } = await params;
  const query = await searchParams;
  const dateFrom = parseDate(query.dateFrom, "dateFrom");
  const dateTo = parseDate(query.dateTo, "dateTo");
  if (dateTo <= dateFrom) throw new PosApiError(400, "POS_REPORTS_INVALID_RANGE", "El rango de fechas no es válido.");
  const displayDateTo = new Date(dateTo.getTime() - 1);
  const locationId = parseLocation(query.locationId);
  const access = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.reports" });
  const { admin, brand } = access;
  const args = {
    p_brand_slug: brand.slug,
    p_date_from: dateFrom.toISOString(),
    p_date_to: dateTo.toISOString(),
    p_location_id: locationId,
  };
  const granularity = selectGranularity(dateFrom, dateTo);
  const [summaryResult, seriesResult, productsResult, inventoryResult, profile] = await Promise.all([
    admin.rpc("pos_get_analytics_summary", args),
    admin.rpc("pos_get_analytics_sales_series", { ...args, p_granularity: granularity }),
    admin.rpc("pos_get_operational_report_products_v1", { ...args, p_limit: 500 }),
    admin.rpc("pos_get_analytics_inventory", args),
    getBusinessDocumentProfile(admin, brand.slug, { locationId }),
  ]);
  for (const result of [summaryResult, seriesResult, productsResult, inventoryResult]) {
    if (result.error) throw result.error;
  }

  const summary = asRecord(summaryResult.data);
  const sales = asRecord(summary.sales);
  const products = asRecords(productsResult.data);
  const series = asRecords(seriesResult.data);
  const inventory = asRecords(inventoryResult.data);
  const topProducts = products.slice(0, 15);
  const topVariants: JsonRecord[] = products.flatMap((product) => asRecords(product.variants).map((variant) => ({
    ...variant,
    productName: product.productName,
  }))).sort((a: JsonRecord, b: JsonRecord) => numberValue(b.revenue) - numberValue(a.revenue)).slice(0, 15);
  const attention = inventory.filter((row) => numberValue(row.availableQuantity) <= numberValue(row.minimumQuantity)).slice(0, 15);
  const kpis = [
    ["Ventas netas", metricValue(sales.netSales)], ["Ventas brutas", metricValue(sales.grossSales)],
    ["Descuentos", metricValue(sales.discountTotal)], ["Impuestos", metricValue(sales.taxTotal)],
    ["Tickets", metricValue(sales.ordersCount, true)], ["Ticket promedio", metricValue(sales.averageTicket)],
    ["Unidades", metricValue(sales.itemsSold, true)], ["COGS", metricValue(sales.cogs)],
    ["Margen bruto", money(numberValue(sales.grossProfit))], ["Margen %", sales.grossMarginPercent == null ? "—" : `${numberValue(sales.grossMarginPercent).toFixed(1)}%`],
  ];

  return (
    <main className="print-report" style={{ "--report-accent": safeAccent(profile.brandColor) } as CSSProperties}>
      <div className="print-toolbar"><button id="print-report-button" type="button">Guardar / Imprimir PDF</button></div>
      <header className="report-header">
        <div className="brand-mark">
          {profile.logoUrl ? <img src={profile.logoUrl} alt="Logotipo del negocio" /> : <span>{initials(profile.commercialName)}</span>}
        </div>
        <div className="header-copy"><p className="eyebrow">Reporte de operación</p><h1>{profile.commercialName}</h1>
          {profile.legalName ? <p>{profile.legalName}{profile.taxId ? ` · ${profile.taxId}` : ""}</p> : null}
          <p>{profile.phone || profile.whatsapp || profile.email || ""}</p>
        </div>
        <div className="header-meta"><strong>Periodo</strong><span>{formatDate(dateFrom)} — {formatDate(displayDateTo)}</span><strong>Sucursal</strong><span>{profile.location?.name || "Todas las sucursales"}</span><strong>Generado</strong><span>{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}</span></div>
      </header>

      <section className="section"><SectionTitle title="Resumen ejecutivo" subtitle="Resultados del periodo seleccionado" /><div className="kpi-grid">{kpis.map(([label, value]) => <div className="kpi" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><Comparison sales={sales} /></section>
      <section className="section"><SectionTitle title="Tendencia de ventas" subtitle="Ventas netas por periodo" /><SalesSeries rows={series} /></section>
      <section className="section two-columns"><div><SectionTitle title="Productos destacados" subtitle="Principales productos por ventas" /><SimpleTable headers={["Clave", "Producto", "Unidades", "Ventas", "Margen"]} rows={topProducts.map((row) => [String(row.productCode || "—"), String(row.productName || "—"), integer(numberValue(row.unitsSold)), money(numberValue(row.revenue)), money(numberValue(row.grossProfit))])} /></div><div><SectionTitle title="Variantes destacadas" subtitle="Detalle operativo por variante" /><SimpleTable headers={["Producto / variante", "SKU", "Unidades", "Ventas", "Margen"]} rows={topVariants.map((row) => [`${String(row.productName || "—")} · ${String(row.variantName || "—")}`, String(row.sku || "—"), integer(numberValue(row.unitsSold)), money(numberValue(row.revenue)), money(numberValue(row.grossProfit))])} /></div></section>
      <section className="section two-columns"><div><SectionTitle title="Métodos de pago" subtitle="Pagos asociados al universo filtrado" /><SimpleTable headers={["Método", "Pagos", "Monto", "%"]} rows={asRecords(summary.payments).map((row) => [paymentLabel(String(row.paymentMethod || "")), integer(numberValue(row.transactionsCount)), money(numberValue(row.amount)), row.percentageOfSales == null ? "—" : `${numberValue(row.percentageOfSales).toFixed(1)}%`])} /></div><div><SectionTitle title="Inventario que requiere atención" subtitle="Valor actual estimado y existencias críticas" /><p className="inventory-value">Valor estimado actual: <strong>{money(inventory.reduce((sum, row) => sum + numberValue(row.inventoryCostValue), 0))}</strong></p><SimpleTable headers={["Producto / variante", "SKU", "Stock", "Estado"]} rows={attention.map((row) => [String(row.productName || "—") + " · " + String(row.variantName || "—"), String(row.sku || "—"), integer(numberValue(row.availableQuantity)), numberValue(row.availableQuantity) <= 0 ? "Agotado" : "Bajo stock"])} /></div></section>
      <section className="methodology"><SectionTitle title="Notas metodológicas" subtitle="Alcance y lectura de este reporte" /><ul><li>Ventas considera únicamente operaciones <strong>completed</strong>.</li><li>COGS utiliza el costo histórico de cada línea vendida.</li><li>El margen conserva la fórmula de Reports V1A.</li><li>El inventario es un valor actual estimado desde existencias y costo vigente.</li><li>Product code y atributos son metadata actual; no son snapshots históricos.</li><li>Los refunds financieros completos todavía no forman parte de este reporte.</li></ul></section>
      <footer><span>{profile.commercialName} · {formatDate(dateFrom)} — {formatDate(displayDateTo)}</span><span>{profile.documentFooter || ""}</span><span>Generado con Cometa POS</span></footer>
      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('print-report-button')?.addEventListener('click', () => window.print());" }} />
      <style>{PRINT_CSS}</style>
    </main>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="section-title"><h2>{title}</h2><p>{subtitle}</p></div>; }
function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) { return <table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${index}-${row[0]}`}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length}>Sin datos registrados en este periodo.</td></tr>}</tbody></table>; }
function Comparison({ sales }: { sales: JsonRecord }) { const net = asRecord(sales.netSales); const delta = net.deltaPercent == null ? null : numberValue(net.deltaPercent); return <p className="comparison">{delta == null ? "Sin comparación disponible" : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}% vs periodo anterior`}</p>; }
function SalesSeries({ rows }: { rows: JsonRecord[] }) { if (!rows.length) return <p className="empty">Sin ventas registradas en este periodo.</p>; const width = 900, height = 210, pad = 26, max = Math.max(...rows.map((row) => numberValue(row.netSales)), 1); const points = rows.map((row, index) => `${pad + index * (width - pad * 2) / Math.max(rows.length - 1, 1)},${height - pad - numberValue(row.netSales) / max * (height - pad * 2)}`).join(" "); return <><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tendencia de ventas" className="sales-chart"><polyline points={points} fill="none" stroke="var(--report-accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{rows.map((row) => <circle key={String(row.bucketStart)} cx={pad + rows.indexOf(row) * (width - pad * 2) / Math.max(rows.length - 1, 1)} cy={height - pad - numberValue(row.netSales) / max * (height - pad * 2)} r="4" fill="white" stroke="var(--report-accent)" strokeWidth="3" />)}</svg><div className="chart-labels"><span>{formatDate(String(rows[0].bucketStart))}</span><span>{money(max)}</span><span>{formatDate(String(rows[rows.length - 1].bucketStart))}</span></div></>; }
function parseDate(value: string | string[] | undefined, field: string) { const raw = Array.isArray(value) ? value[0] : value; if (!raw) throw new PosApiError(400, "POS_REPORTS_INVALID_RANGE", `El campo ${field} es obligatorio.`); const date = new Date(raw); if (Number.isNaN(date.getTime())) throw new PosApiError(400, "POS_REPORTS_INVALID_RANGE", `El campo ${field} no es válido.`); return date; }
function parseLocation(value: string | string[] | undefined) { const raw = Array.isArray(value) ? value[0] : value; return raw ? uuidValue(raw, "locationId", false) : null; }
function asRecords(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((row): row is JsonRecord => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : []; }
function asRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function numberValue(value: unknown) { return typeof value === "number" ? value : Number(value || 0); }
function metricValue(value: unknown, whole = false) { const metric = asRecord(value); return whole ? integer(numberValue(metric.current)) : money(numberValue(metric.current)); }
function money(value: number) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value || 0); }
function integer(value: number) { return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value || 0); }
function formatDate(value: Date | string) { return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(typeof value === "string" ? new Date(value) : value); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "C"; }
function safeAccent(value: string) { return /^#[0-9A-F]{6}$/i.test(value) ? value : "#0f766e"; }
function paymentLabel(value: string) { return ({ cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", wallet: "Wallet", other: "Otro" } as Record<string, string>)[value] || value; }
function selectGranularity(from: Date, to: Date) { const days = (to.getTime() - from.getTime()) / 864e5; return days > 180 ? "month" : days > 45 ? "week" : "day"; }

const PRINT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f4; color: #18212b; font-family: Arial, Helvetica, sans-serif; }
  .print-report { --report-accent: #0f766e; max-width: 1120px; margin: 24px auto; padding: 36px 42px; background: white; min-height: 100vh; color: #18212b; }
  .print-toolbar { display:flex; justify-content:flex-end; margin-bottom: 20px; }
  .print-toolbar button { border:0; border-radius:8px; padding:10px 16px; background:var(--report-accent); color:white; font-weight:700; cursor:pointer; }
  .report-header { display:grid; grid-template-columns:80px 1fr 230px; gap:20px; align-items:center; border-bottom:3px solid var(--report-accent); padding-bottom:22px; }
  .brand-mark { width:72px; height:72px; display:grid; place-items:center; overflow:hidden; border-radius:14px; background:#f1f5f5; color:var(--report-accent); font-size:22px; font-weight:800; }
  .brand-mark img { width:100%; height:100%; object-fit:contain; }
  .eyebrow, .section-title p, .header-meta strong, .kpi span { margin:0; color:#64727e; text-transform:uppercase; letter-spacing:.12em; font-size:10px; font-weight:800; }
  h1 { margin:4px 0; font-size:28px; letter-spacing:-.04em; } .header-copy p { margin:3px 0; font-size:12px; color:#66737d; }
  .header-meta { display:grid; gap:4px; font-size:12px; text-align:right; } .header-meta span { margin-bottom:7px; }
  .section { margin-top:30px; break-inside:avoid; } .section-title { margin-bottom:14px; } .section-title h2 { margin:0; font-size:18px; } .section-title p { margin-top:4px; letter-spacing:.02em; text-transform:none; }
  .kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; } .kpi { border:1px solid #dbe4e7; border-top:3px solid var(--report-accent); padding:12px; border-radius:8px; break-inside:avoid; } .kpi strong { display:block; margin-top:8px; font-size:19px; }
  .comparison { color:var(--report-accent); font-size:12px; font-weight:700; margin:12px 0 0; }
  .sales-chart { display:block; width:100%; height:190px; border-bottom:1px solid #dbe4e7; } .chart-labels { display:flex; justify-content:space-between; font-size:10px; color:#71808a; }
  .two-columns { display:grid; grid-template-columns:1fr 1fr; gap:28px; } table { width:100%; border-collapse:collapse; font-size:11px; } th { text-align:left; color:#64727e; text-transform:uppercase; letter-spacing:.07em; font-size:9px; border-bottom:2px solid #dbe4e7; padding:8px 6px; } td { padding:8px 6px; border-bottom:1px solid #edf1f2; vertical-align:top; } .inventory-value { font-size:13px; color:#53616c; } .inventory-value strong { color:#18212b; }
  .methodology { margin-top:30px; border-left:3px solid var(--report-accent); padding:12px 16px; background:#f7faf9; break-inside:avoid; } .methodology ul { margin:0; padding-left:18px; font-size:11px; line-height:1.7; color:#53616c; }
  footer { display:flex; justify-content:space-between; gap:15px; border-top:1px solid #dbe4e7; margin-top:32px; padding-top:12px; color:#7a8790; font-size:10px; }
  .empty { color:#64727e; font-size:12px; } @page { size:A4; margin:12mm; }
  @media (max-width:760px) { .print-report { margin:0; padding:20px; } .report-header { grid-template-columns:60px 1fr; } .header-meta { grid-column:1/-1; text-align:left; grid-template-columns:auto 1fr; } .kpi-grid { grid-template-columns:repeat(2,1fr); } .two-columns { grid-template-columns:1fr; } footer { flex-direction:column; } }
  @media print { body { background:white; } .print-report { margin:0; max-width:none; padding:0; } .print-toolbar { display:none; } .section { break-inside:avoid; } table, tr, .kpi { break-inside:avoid; } }
`;
