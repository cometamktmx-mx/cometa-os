import { PosReceiptSocials } from "./pos-receipt-socials";
import type { FoodCheck, FoodItem } from "@/lib/pos/food-shared";
import type { PosBranding } from "./pos-shell";
import { FoodItemModifiers } from "./pos-food-modifiers";

type ReceiptMode = "pre" | "final" | "account" | "payment";

export function FoodReceipt({ mode, branding, check, items, staff, table, accountReference = check.id.replace(/-/g, "").slice(-6).toUpperCase(), total, method, received, change, reference, preview = false }: {
  mode: ReceiptMode;
  branding?: PosBranding | null;
  check: FoodCheck;
  items: FoodItem[];
  staff: string;
  table: string;
  accountReference?: string;
  total: string;
  method?: string;
  received?: string;
  change?: string;
  reference?: string;
  preview?: boolean;
}) {
  void check;
  const formatLine = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
  const isAccount = mode === "pre" || mode === "account";
  return <div className="food-receipt-print" aria-hidden="true">
    <style jsx global>{`@media print { @page { size: 80mm auto; margin: 4mm; } body * { visibility: hidden !important; } .food-receipt-print, .food-receipt-print * { visibility: visible !important; } .food-receipt-print { position: absolute; inset: 0 auto auto 0; width: 72mm; color: #000; background: #fff; font: 11px/1.35 Arial, sans-serif; } .food-receipt-print .receipt-divider { border-top: 1px dashed #000; margin: 10px 0; } .food-receipt-print .receipt-row { display: flex; justify-content: space-between; gap: 8px; } .food-receipt-print .receipt-modifier { padding-left: 8px; } }`}</style>
    <div className={`mx-auto w-[72mm] bg-white p-2 text-[11px] leading-4 text-black ${preview ? "block" : "hidden print:block"}`}>
      {branding?.logo_url ? <img src={branding.logo_url} alt="" className="mx-auto mb-1 max-h-12 max-w-[58mm] object-contain" /> : null}<div className="text-center font-bold">{branding?.display_name || "Cometa POS"}</div>{branding?.legal_name ? <div className="text-center">{branding.legal_name}</div> : null}{branding?.tax_id ? <div className="text-center">RFC: {branding.tax_id}</div> : null}{branding?.phone || branding?.whatsapp ? <div className="text-center">{branding.phone || branding.whatsapp}</div> : null}
      <div className="receipt-divider" />
      <div className="text-center font-bold">{isAccount ? "PRE-CUENTA" : "COMPROBANTE DE PAGO"}</div>
      <p className="mt-2">Mesa: {table}<br />Cuenta #{accountReference}<br />Mesero: {staff}<br />Fecha: {new Date().toLocaleString("es-MX")}</p>
      <div className="receipt-divider" />
      {items.map(item => <div key={item.id} className="mb-2"><div className="receipt-row"><span>{item.quantity} × {item.product_name}</span><span>{formatLine(Number(item.line_total))}</span></div><div>{item.variant_name}</div><FoodItemModifiers modifiers={item.configuration?.modifiers} />{item.notes ? <div className="receipt-modifier">Nota: {item.notes}</div> : null}</div>)}
      <div className="receipt-divider" />
      <div className="receipt-row"><span>Total</span><span>{total}</span></div>
      {branding && <PosReceiptSocials socials={branding} />}
      {isAccount ? null : <><div className="receipt-divider" /><div>Método: {method}</div>{received ? <div className="receipt-row"><span>Recibido</span><span>{received}</span></div> : null}{change ? <div className="receipt-row"><span>Cambio</span><span>{change}</span></div> : null}{reference ? <div>Folio: {reference}</div> : null}<p className="mt-4 text-center">{branding?.receipt_message || branding?.ticket_footer || "Gracias por tu compra"}</p><p className="mt-2 text-center text-[9px]">Operado con Cometa POS</p></>}
    </div>
  </div>;
}
