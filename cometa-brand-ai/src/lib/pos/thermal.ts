export type TerminalPrintConfig = {printer: string; width: 58 | 80; autoPrint: boolean; autoDrawer: boolean; profile: "driver" | "escpos-pin2" | "escpos-pin5"};
// Pinned QZ 2.2 configuration. The signer accepts this exact allowlist only.
export function qzPrintOptions(width:58|80) {return {bounds:null,colorType:"color",copies:1,density:0,duplex:false,fallbackDensity:null,interpolation:"bicubic",jobName:null,legacy:false,margins:0,orientation:null,paperThickness:null,printerTray:null,rasterize:false,rotation:0,scaleContent:false,size:{width,height:null},units:"mm",forceRaw:false,encoding:null,spool:null};}
export function samePrintOptions(value:unknown,width:58|80) {
  const canonical=(input:unknown):string=>JSON.stringify(input,(_key,v)=>v && typeof v==="object" && !Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  return canonical(value)===canonical(qzPrintOptions(width));
}
export type ThermalSale = {sale_number:string;sold_at:string;subtotal:number;discount_total:number;loyalty_discount_total?:number;tax_total:number;total:number;currency:string;items:{product_name:string;variant_name:string;sku:string|null;quantity:number;unit_price:number;line_total:number}[];payments:{payment_method:string;amount:number;tendered_amount:number;change_amount:number}[]};
export function automaticOperations(config: TerminalPrintConfig, payments: ThermalSale["payments"]) {
  return [...(config.autoPrint ? ["receipt" as const]:[]),...(config.autoDrawer && config.profile !== "driver" && payments.some(p=>p.payment_method === "cash" && Number(p.amount)>0) ? ["drawer" as const]:[])];
}
const escape = (value:unknown)=>String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] ?? c));
export function thermalReceipt(sale:ThermalSale,business:string,cashier:string,width:58|80, options:{copy?:boolean;customer?:string;test?:boolean;documentLabel?:string;footer?:string[]}={}) {
  const money=(n:number)=>new Intl.NumberFormat("es-MX",{style:"currency",currency:sale.currency}).format(Number(n));
  const methods:Record<string,string>={cash:"Efectivo",card:"Tarjeta",transfer:"Transferencia",wallet:"Monedero",other:"Otro"};
  const row=(label:string,value:number,cls="")=>`<div class="row ${cls}"><span>${escape(label)}</span><b>${money(value)}</b></div>`;
  // 80 mm paper has only 72 mm of printable width on TM-T20II. Leave
  // additional horizontal tolerance; never infer a 297 mm content height.
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title></title><style>
@page{margin:0;size:auto}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}
body{width:${width===80?70:48}mm;font:12px/1.3 Arial,sans-serif;padding:1mm 0;margin:0 auto}
h1{font-size:17px;line-height:1.15;margin:0 0 2mm;text-align:center;overflow-wrap:anywhere}
p{margin:1mm 0;overflow-wrap:anywhere}.label{text-align:center;font-weight:bold;margin:1mm 0 2mm}
.row{display:table;width:100%;table-layout:fixed;margin:1mm 0;break-inside:avoid;page-break-inside:avoid}
.row span,.row b{display:table-cell;vertical-align:top}.row b{text-align:right;white-space:nowrap;width:42%}
.item{border-bottom:1px dashed #777;padding:2mm 0;break-inside:avoid;page-break-inside:avoid}
.item p{margin:0 0 1mm}.variant{font-size:11px}.amounts{display:table;width:100%;table-layout:fixed;font-variant-numeric:tabular-nums}
.amounts span{display:table-cell;text-align:right;width:36%;white-space:nowrap}.amounts span:first-child{text-align:left;width:28%}
.columns{font-size:10px;border-bottom:1px solid #000;margin-top:2mm;padding-bottom:1mm}
.total{font-size:18px;border-top:1px solid #000;padding-top:2mm;margin-top:2mm}.summary{margin-top:2mm}
</style></head><body><h1>${escape(business)}</h1><p class="label">${options.test?"PRUEBA — SIN VALOR COMERCIAL":escape(options.documentLabel||"VENTA PAGADA")}${options.copy?" · COPIA / REIMPRESIÓN":""}</p><p>Folio: <b>${escape(sale.sale_number)}</b></p><p>${escape(new Date(sale.sold_at).toLocaleString("es-MX",{timeZone:"America/Mexico_City"}))}</p><p>Operador: ${escape(cashier)}</p>${options.customer?`<p>Cliente: ${escape(options.customer)}</p>`:""}<div class="amounts columns"><span>Cant.</span><span>P. unitario</span><span>Importe</span></div>${sale.items.map(item=>`<div class="item"><p><b>${escape(item.product_name)}</b></p>${item.variant_name||item.sku?`<p class="variant">${escape(item.variant_name)}${item.sku?` · ${escape(item.sku)}`:""}</p>`:""}<div class="amounts"><span>${escape(item.quantity)}</span><span>${money(item.unit_price)}</span><span>${money(item.line_total)}</span></div></div>`).join("")}<div class="summary">${row("Subtotal",sale.subtotal)}${sale.discount_total?row("Descuentos",-sale.discount_total):""}${sale.tax_total?row("Impuestos registrados",sale.tax_total):""}${row(`TOTAL ${sale.currency}`,sale.total,"total")}${sale.payments.map(p=>`${row(methods[p.payment_method]||"Pago",p.amount)}${p.payment_method==="cash"?row("Recibido",p.tendered_amount)+row("Cambio",p.change_amount):""}`).join("")}</div>${(options.footer||[]).map(line=>`<p>${escape(line)}</p>`).join("")}</body></html>`;
}
export function drawerCommand(profile:TerminalPrintConfig["profile"]) {
  if(profile === "driver") throw new Error("Confirma un perfil de cajón compatible antes de enviar órdenes.");
  return "\x1b\x70"+(profile === "escpos-pin2" ? "\x00" : "\x01")+"\x19\xfa";
}
