import type {RetailOrder} from "./retail-orders";
export type ReportMoney={source:string;id:string;location_id:string;register_id:string;cash_session_id:string;staff_id:string|null;sale_id:string|null;order_id:string|null;folio:string;concept:string;method:string;amount:number;effective_at:string;reference:string|null;source_status:string;verified?:boolean;verification_reference?:string;verified_at?:string};
export type ReportSale={id:string;sale_number:string;status:string;subtotal:number;discount_total:number;loyalty_discount_total:number;total:number;tax_total:number;sold_at:string;currency:string;manual_discount:number;discount_identified:boolean};
export type ReportItem={id:string;sale_id:string;product_id:string;variant_id:string;product_name:string;variant_name:string;quantity:number;unit_cost:number;line_total:number;tax_amount:number;discount_amount:number};
export type ReportStock={id:string;location_id:string;variant_id:string;product_id:string;product_name:string;variant_name:string;sku:string;quantity:number;reserved_quantity:number;available:number;minimum_quantity:number;movement_quantity:number};
export type ReportSession={id:string;register_id:string;status:string;opened_at:string;closed_at:string|null;opening_staff_id:string|null;closed_by_staff_id:string|null;opening_amount:number;expected_cash:number|null;calculated_expected:number;counted_cash:number|null;difference:number|null;notes:string|null;movements:ReportMoney[]};
export type RetailReport={timezone:string;from:string;to:string;asOf:string;sales:ReportSale[];items:ReportItem[];money:ReportMoney[];orders:(RetailOrder&{customer_name:string;pieces:number})[];inventory:ReportStock[];inventoryMovements?:{id:string;variant_id:string;location_id:string;movement_type:string;quantity_delta:number;created_at:string;reference_id:string|null}[];sessions:ReportSession[];locations:{id:string;name:string;timezone:string;currency:string}[];staff:{id:string;name:string}[];registers:{id:string;name:string}[];verifications:Record<string,unknown>[]};
export const cents=(n:number)=>Math.round(Number(n)*100);
export function sumMoney<T>(rows:T[],amount:(row:T)=>number){return rows.reduce((sum,row)=>sum+cents(amount(row)),0)/100;}
export function retailMetrics(data:RetailReport){
 const sales=data.sales.filter(s=>s.status==='completed'||s.status==='partially_refunded'),ids=new Set(sales.map(s=>s.id)),items=data.items.filter(i=>ids.has(i.sale_id));
 const known=items.filter(i=>Number(i.unit_cost)>0),active=data.orders.filter(o=>o.state==='active');
 const revenue=sumMoney(sales,s=>s.total),knownRevenue=sumMoney(known,i=>i.line_total-i.tax_amount),cost=sumMoney(known,i=>i.quantity*i.unit_cost);
 return {sales,revenue,operations:sales.length,pieces:items.reduce((s,i)=>s+Number(i.quantity),0),average:sales.length?revenue/sales.length:0,
  discount:sumMoney(sales,s=>s.discount_total),factoryDiscount:sumMoney(sales.filter(s=>s.discount_identified),s=>Math.max(0,s.discount_total-s.manual_discount-s.loyalty_discount_total)),
  incoming:sumMoney(data.money.filter(m=>m.amount>0),m=>m.amount),outgoing:sumMoney(data.money.filter(m=>m.amount<0),m=>-m.amount),
  transferPending:sumMoney(data.money.filter(m=>m.method==='transfer'&&!m.verified),m=>m.amount),
  due:sumMoney(active,o=>Math.max(0,o.total-o.paid)),available:sumMoney(active,o=>Math.max(0,o.paid-o.total)),
  knownRevenue,cost,grossProfit:known.length?knownRevenue-cost:null,costCoverage:items.length?known.length/items.length:null,unknownCosts:items.length-known.length};
}
export function comparison(current:number,previous:number){return previous===0?null:(current-previous)/Math.abs(previous)*100;}
// Escape every cell, including headers. A leading quote prevents spreadsheet
// formula interpretation without changing the numeric values produced by us.
export function reportCsv(headers:string[],rows:(string|number|null|undefined)[][]){
 const cell=(v:string|number|null|undefined)=>{let s=typeof v==='number'?v.toFixed(2):String(v??'');if(typeof v!=='number'&&/^[\s\uFEFF]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\uFEFF'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
}
export function periodDates(period:string,timezone:string,anchor=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(anchor);
 const value=(key:string)=>Number(parts.find(p=>p.type===key)?.value),end=new Date(Date.UTC(value('year'),value('month')-1,value('day'))),start=new Date(end);
 if(period==='yesterday'){start.setUTCDate(start.getUTCDate()-1);end.setUTCDate(end.getUTCDate()-1);}
 if(period==='week')start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
 if(period==='month')start.setUTCDate(1);
 return {from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)};
}
