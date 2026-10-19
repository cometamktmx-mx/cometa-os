export type TerminalPrintConfig = {printer: string; width: 58 | 80; autoPrint: boolean; autoDrawer: boolean; profile: "driver" | "escpos-pin2" | "escpos-pin5"; receiptMode?:"driver"|"epson-tm-t20ii"; showSku?:boolean; paymentHistory?:boolean};
// Pinned QZ 2.2 configuration. The signer accepts this exact allowlist only.
export function qzPrintOptions(width:58|80,mode?:TerminalPrintConfig["receiptMode"]) {return {bounds:null,colorType:"color",copies:1,density:mode==="epson-tm-t20ii"?8:0,duplex:false,fallbackDensity:null,interpolation:"bicubic",jobName:null,legacy:false,margins:0,orientation:null,paperThickness:null,printerTray:null,rasterize:false,rotation:0,scaleContent:false,size:{width,height:null},units:"mm",forceRaw:false,encoding:null,spool:null};}
export function samePrintOptions(value:unknown,width:58|80,mode?:TerminalPrintConfig["receiptMode"]) {
  const canonical=(input:unknown):string=>JSON.stringify(input,(_key,v)=>v && typeof v==="object" && !Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  return canonical(value)===canonical(qzPrintOptions(width,mode));
}
export function qzReceiptData(html:string,config:TerminalPrintConfig) {
 if(config.receiptMode!=="epson-tm-t20ii")return [{type:"pixel",format:"html",flavor:"plain",data:html}];
 // QZ 2.2 raw HTML pageWidth is pixels. 560 dots = 70 mm at 8 dots/mm.
 // No leading feed. GS V 66 0 feeds only to the cutter's physical position.
 return [{type:"raw",format:"command",flavor:"hex",data:"1B40"},
  {type:"raw",format:"html",flavor:"plain",data:html,options:{language:"ESCPOS",pageWidth:config.width===80?560:384,dotDensity:"double"}},
  {type:"raw",format:"command",flavor:"hex",data:"1D564200"}];
}
export type ThermalSale = {sale_number:string;sold_at:string;subtotal:number;discount_total:number;loyalty_discount_total?:number;tax_total:number;total:number;currency:string;items:{product_id?:string;product_name:string;variant_name:string;sku:string|null;quantity:number;unit_price:number;line_total:number;regular_price?:number;discount_amount?:number;bulk_discount_amount?:number}[];payments:{payment_method:string;amount:number;tendered_amount:number;change_amount:number}[]};
export function automaticOperations(config: TerminalPrintConfig, payments: ThermalSale["payments"]) {
  return [...(config.autoPrint ? ["receipt" as const]:[]),...(config.autoDrawer && config.profile !== "driver" && payments.some(p=>p.payment_method === "cash" && Number(p.amount)>0) ? ["drawer" as const]:[])];
}


const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));
export type ReceiptOptions={copy?:boolean;customer?:string;test?:boolean;documentLabel?:string;footer?:string[];showSku?:boolean;paymentHistory?:boolean};
export function thermalReceipt(sale:ThermalSale,business:string,cashier:string,width:58|80,options:ReceiptOptions={}){
 const money=(n:number)=>new Intl.NumberFormat("es-MX",{style:"currency",currency:sale.currency}).format(Number(n));
 const methods:Record<string,string>={cash:"Efectivo",card:"Tarjeta",transfer:"Transferencia",wallet:"Monedero",other:"Otro"};
 const row=(label:string,value:number,cls="")=>`<div class="row ${cls}"><span>${escape(label)}</span><b>${money(value)}</b></div>`;
 // Never merge different products merely because their names match.
 const groups=new Map<string,{name:string;items:ThermalSale["items"]}>();
 sale.items.forEach((item,index)=>{const key=item.product_id||`snapshot:${index}`;const group=groups.get(key)||{name:item.product_name,items:[]};group.items.push(item);groups.set(key,group);});
 const payments=new Map<string,{amount:number;tendered:number;change:number}>();
 sale.payments.forEach(p=>{const totals=payments.get(p.payment_method)||{amount:0,tendered:0,change:0};totals.amount+=Number(p.amount);totals.tendered+=Number(p.tendered_amount);totals.change+=Number(p.change_amount);payments.set(p.payment_method,totals);});
 const cash=payments.get("cash");
 // Repair only the known separator corruption in display; preserve the snapshot.
 const variant=(name:string)=>escape(name.replace(/\s+[?\uFFFD]\s+/g," / ").replace(/\s*·\s*/g," / "));
 const items=[...groups.values()].map(group=>`<section class="model"><h2>${escape(group.name)}</h2><table><colgroup><col style="width:37%"><col style="width:11%"><col style="width:25%"><col style="width:27%"></colgroup><tbody>${group.items.map(item=>`<tr><td>${variant(item.variant_name)||"Única"}${options.showSku&&item.sku?`<small>SKU: ${escape(item.sku)}</small>`:""}</td><td>${escape(item.quantity)}</td><td>${money(item.unit_price)}</td><td>${money(item.line_total)}</td></tr>${Number(item.bulk_discount_amount||0)+Number(item.discount_amount||0)>0?`<tr class="discount"><td colspan="4">${item.regular_price!==undefined&&item.regular_price!==item.unit_price?`Original/pza ${money(item.regular_price)} · `:""}Dto. ${money(Number(item.bulk_discount_amount||0)+Number(item.discount_amount||0))} · Neto/pza ${money((Number(item.regular_price??item.unit_price)*Number(item.quantity)-Number(item.bulk_discount_amount||0)-Number(item.discount_amount||0))/Number(item.quantity))}</td></tr>`:""}`).join("")}</tbody></table></section>`).join("");
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title></title><style>
@page{margin:0;size:auto}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}
body{width:${width===80?70:48}mm;font:12px/1.2 Arial,sans-serif;padding:1mm 0;margin:0 auto}
h1{font-size:17px;line-height:1.15;margin:0 0 1mm;text-align:center;overflow-wrap:anywhere}
p{margin:.5mm 0;overflow-wrap:anywhere}.label{text-align:center;font-weight:bold;margin:.5mm 0 1mm}
.row{display:table;width:100%;table-layout:fixed;margin:.5mm 0;break-inside:avoid;page-break-inside:avoid}
.row span,.row b{display:table-cell;vertical-align:top}.row b{text-align:right;white-space:nowrap;width:42%}
.model{margin-top:1.5mm}h2{font-size:12px;margin:0 0 .5mm;overflow-wrap:anywhere;break-after:avoid}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-variant-numeric:tabular-nums}
th,td{padding:.4mm 0;vertical-align:top;text-align:right;overflow-wrap:anywhere}th{font-size:10px;border-bottom:1px solid #777}
th:first-child,td:first-child{text-align:left;padding-right:1mm}td:not(:first-child){white-space:nowrap}
tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-row-group}small{display:block;font-size:11px}.discount td{font-size:11px;padding-top:0;white-space:normal}
.total{font-size:18px;border-top:1px solid #000;padding-top:1mm;margin-top:1mm}.summary{margin-top:1.5mm}
</style></head><body><h1>${escape(business)}</h1><p class="label">${options.test?"PRUEBA — SIN VALOR COMERCIAL":escape(options.documentLabel||"VENTA PAGADA")}${options.copy?" · COPIA / REIMPRESIÓN":""}</p><p>Folio: <b>${escape(sale.sale_number)}</b></p><p>${escape(new Date(sale.sold_at).toLocaleString("es-MX",{timeZone:"America/Mexico_City"}))}</p><p>Operador: ${escape(cashier)}</p>${options.customer?`<p>Cliente: ${escape(options.customer)}</p>`:""}<table class="columns"><colgroup><col style="width:37%"><col style="width:11%"><col style="width:25%"><col style="width:27%"></colgroup><thead><tr><th>Variante</th><th>Cant.</th><th>P. unit.</th><th>Importe</th></tr></thead></table>${items}<div class="summary">${row("Subtotal",sale.subtotal)}${sale.discount_total?row("Descuentos",-sale.discount_total):""}${sale.tax_total?row("Impuestos registrados",sale.tax_total):""}${row(`TOTAL ${sale.currency}`,sale.total,"total")}${[...payments].map(([method,p])=>row(methods[method]||method,p.amount)).join("")}${cash?row("Efectivo recibido",cash.tendered)+row("Cambio",cash.change):""}</div>${options.paymentHistory?sale.payments.map((p,i)=>`<p>Pago ${i+1}: ${escape(methods[p.payment_method]||p.payment_method)} ${money(p.amount)}</p>`).join(""):""}${(options.footer||[]).map(line=>`<p>${escape(line)}</p>`).join("")}</body></html>`;
}

export function drawerCommand(profile:TerminalPrintConfig["profile"]) {
  if(profile === "driver") throw new Error("Confirma un perfil de cajón compatible antes de enviar órdenes.");
  // Epson ESC p: m=0 pin 2, m=1 pin 5; t1=25 (50ms), t2=250 (500ms).
  // Explicit hex prevents text encoders from transforming the byte FA.
  return "1B70"+(profile === "escpos-pin2" ? "00" : "01")+"19FA";
}
