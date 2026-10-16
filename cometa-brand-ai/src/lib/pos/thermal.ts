export type TerminalPrintConfig = {printer: string; width: 58 | 80; autoPrint: boolean; autoDrawer: boolean; profile: "driver" | "escpos-pin2" | "escpos-pin5"};
// Pinned QZ 2.2 configuration. The signer accepts this exact allowlist only.
export function qzPrintOptions(width:58|80) {return {bounds:null,colorType:"color",copies:1,density:0,duplex:false,fallbackDensity:null,interpolation:"bicubic",jobName:null,legacy:false,margins:0,orientation:null,paperThickness:null,printerTray:null,rasterize:false,rotation:0,scaleContent:true,size:{width,height:null},units:"mm",forceRaw:false,encoding:null,spool:null};}
export function samePrintOptions(value:unknown,width:58|80) {
  const canonical=(input:unknown):string=>JSON.stringify(input,(_key,v)=>v && typeof v==="object" && !Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  return canonical(value)===canonical(qzPrintOptions(width));
}
export type ThermalSale = {sale_number:string;sold_at:string;subtotal:number;discount_total:number;loyalty_discount_total?:number;tax_total:number;total:number;currency:string;items:{product_name:string;variant_name:string;sku:string|null;quantity:number;unit_price:number;line_total:number}[];payments:{payment_method:string;amount:number;tendered_amount:number;change_amount:number}[]};
export function automaticOperations(config: TerminalPrintConfig, payments: ThermalSale["payments"]) {
  return [...(config.autoPrint ? ["receipt" as const]:[]),...(config.autoDrawer && config.profile !== "driver" && payments.some(p=>p.payment_method === "cash" && Number(p.amount)>0) ? ["drawer" as const]:[])];
}
const escape = (value:unknown)=>String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] ?? c));
export function thermalReceipt(sale:ThermalSale,business:string,cashier:string,width:58|80) {
  const money=(n:number)=>new Intl.NumberFormat("es-MX",{style:"currency",currency:sale.currency}).format(Number(n));
  const methods:Record<string,string>={cash:"Efectivo",card:"Tarjeta",transfer:"Transferencia",wallet:"Monedero",other:"Otro"};
  return `<html><head><meta charset="utf-8"><style>@page{size:${width}mm auto;margin:2mm}*{box-sizing:border-box}body{margin:0;width:${width-4}mm;font:11px Arial,sans-serif;color:#000}h1{font-size:16px;text-align:center}p{margin:4px 0;overflow-wrap:anywhere}.row{display:flex;justify-content:space-between;gap:4px}.item{border-bottom:1px dashed #888;padding:5px 0;break-inside:avoid}small{font-size:10px}strong{font-weight:700}</style></head><body><h1>${escape(business)}</h1><p>Folio: ${escape(sale.sale_number)}</p><p>${escape(new Date(sale.sold_at).toLocaleString("es-MX",{timeZone:"America/Mexico_City"}))}</p><p>Cajero: ${escape(cashier)}</p>${sale.items.map(item=>`<div class="item"><p>${escape(item.product_name)} ${escape(item.variant_name)}</p><small>${escape(item.sku)}</small><div class="row"><span>${escape(item.quantity)} × ${money(item.unit_price)}</span><span>${money(item.line_total)}</span></div></div>`).join("")}<p class="row"><span>Productos</span><span>${money(sale.subtotal)}</span></p><p class="row"><span>Descuentos</span><span>${money(sale.discount_total)}</span></p><p class="row"><span>Impuestos registrados</span><span>${money(sale.tax_total)}</span></p><p class="row"><strong>Total</strong><strong>${money(sale.total)}</strong></p>${sale.payments.map(p=>`<p class="row"><span>${escape(methods[p.payment_method]||"Pago")}</span><span>${money(p.amount)}</span></p>${p.payment_method==="cash"?`<p>Recibido: ${money(p.tendered_amount)} · Cambio: ${money(p.change_amount)}</p>`:""}`).join("")}</body></html>`;
}
export function drawerCommand(profile:TerminalPrintConfig["profile"]) {
  if(profile === "driver") throw new Error("Confirma un perfil de cajón compatible antes de enviar órdenes.");
  return "\x1b\x70"+(profile === "escpos-pin2" ? "\x00" : "\x01")+"\x19\xfa";
}
