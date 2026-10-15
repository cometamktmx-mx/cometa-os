import type { ReactNode } from "react";

const paths: Record<string, string> = {
  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  bag: "M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2",
  box: "m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7 4l10 6",
  stock: "M5 3h14v18H5V3Zm3 5h8M8 12h8M8 16h4",
  tag: "M3 3h9l9 9-9 9-9-9V3Zm4 4h.01",
  users: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 3a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-3-4",
  wallet: "M3 5h17v15H3V5Zm0 0 14-3v3M15 11h6v5h-6v-5",
  edit: "m4 16 12-12 4 4L8 20l-5 1 1-5M14 6l4 4",
  truck: "M2 5h12v13H2V5Zm12 5h4l4 4v4h-8M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 2h6l1 4 4 1 2 5-3 3v5l-5 2-3-3H6l-4-5 3-3V6l4-4",
  search: "M21 21l-6-6M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01",
  chart: "M5 20v-5M12 20V9M19 20V3",
  plus: "M12 3v18M3 12h18",
  check: "m4 12 5 5L20 6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  headset: "M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v8H3v-8Zm14 0h4v8h-4v-8M21 18v4h-7",
};
export function SellerIcon({ name, size = 20 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.box} /></svg>; }
export function SellerPanel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`seller-panel ${className}`}><div className="seller-panel-heading"><h2>{title}</h2>{action}</div>{children}</section>; }
export function SellerEmptyState({ children }: { children: ReactNode }) { return <div className="seller-empty"><SellerIcon name="chart" size={28} /><p>{children}</p></div>; }
export function SellerMetric({ label, value, icon, detail }: { label: string; value: string; icon: string; detail: string }) { return <section className="seller-metric"><span className="seller-metric-icon"><SellerIcon name={icon} size={27} /></span><div><h2>{label}</h2><strong>{value}</strong><p>{detail}</p></div></section>; }
export function SellerOrderStatus({ status }: { status: string }) {
  const names: Record<string, string> = { PAID: "Pago confirmado", PREPARING: "Preparando", READY_FOR_HUB: "Listo para HUB", HANDED_TO_HUB: "Entregado al HUB", HUB_RECEIVED: "Recibido en HUB", CONSOLIDATED: "Consolidado", READY_TO_SHIP: "Listo para envío", SHIPPED: "En camino", DELIVERED: "Entregado", CANCELLED: "Cancelado", ISSUE: "Requiere atención" };
  return <span className={`seller-badge ${status === "PREPARING" ? "amber" : status === "READY_FOR_HUB" ? "blue" : ""}`}>{names[status] || "En seguimiento"}</span>;
}
