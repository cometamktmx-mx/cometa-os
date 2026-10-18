import {thermalReceipt,type ThermalSale} from "./thermal";
export type RetailQuoteLine=ThermalSale["items"][number]&{variant_id:string;product_id:string;regular_price:number;bulk_discount_amount?:number;pricing_mode?:"factory_price"|"per_piece_discount";discount_amount:number;tax_amount:number;track_inventory:boolean;model_quantity:number;remaining:number;factory_applied:boolean;factory_missing:boolean};
export type RetailQuote={pricing_mode?:"factory_price"|"per_piece_discount";items:RetailQuoteLine[];subtotal:number;discount_total:number;tax_total:number;total:number;currency:string;wholesale_enabled:boolean};
export type RetailRules={allow_active_content_changes?:boolean;ordinary_returns_allowed?:boolean;open_box?:boolean;pricing_mode?:"factory_price"|"per_piece_discount";per_piece_discount?:number;brand_slug:string;wholesale_enabled:boolean;minimum_pieces:number;grouping:"product"|"variant";combine_variants:boolean;orders_enabled:boolean;minimum_deposit:number;validity_days:number;retained_deposit:number;policy:string;updated_at:string;updated_by:string|null};
export type RetailOrder={open_box?:boolean;amount_due?:number;available_balance?:number;id:string;brand_slug:string;folio:string;location_id:string;customer_id:string;contact:string;state:"note"|"active"|"settled"|"expired"|"cancelled";items:{variant_id:string;quantity:number;discount_amount:number}[];quote:RetailQuote;total:number;paid:number;retained:number;unresolved:number;revision:number;policy_snapshot:RetailRules|null;activated_at:string|null;expires_at:string|null;delivered_at:string|null;created_at:string;sale_id:string|null};
export type RetailPayment={reference?:string;id:string;order_id:string;method:string;amount:number;tendered:number;change:number;created_at:string;staff_id:string;request_key:string};
export function factoryProgress(line:RetailQuoteLine){
 if(line.factory_applied)return line.pricing_mode==="per_piece_discount"?`Precio de fábrica aplicado · −$${Number(line.regular_price)-Number(line.unit_price)} por pieza`:"Precio de fábrica aplicado";
 if(line.factory_missing)return "Falta configurar precio de fábrica";
 return `${line.model_quantity}/${Number(line.model_quantity)+Number(line.remaining)} piezas · Faltan ${line.remaining} para fábrica`;
}
export function retailOrderReceipt(order:RetailOrder,business:string,cashier:string,customer:string,payment?:RetailPayment,copy=false){
 const labels={note:"PEDIDO PENDIENTE — NO ES COMPROBANTE DE PAGO",active:payment?"COMPROBANTE DE ABONO / APARTADO":"APARTADO ACTIVO",settled:"LIQUIDACIÓN",expired:"APARTADO VENCIDO",cancelled:"PEDIDO CANCELADO"};
 const money=(n:number)=>new Intl.NumberFormat("es-MX",{style:"currency",currency:order.quote.currency}).format(Number(n));
 const lines=[`Abonado: ${money(order.paid)} · Saldo: ${money(Math.max(Number(order.total)-Number(order.paid),0))}`,order.state==='expired'||order.state==='cancelled'?"Reserva liberada":order.delivered_at?`Entregado: ${new Date(order.delivered_at).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}`:"Entrega pendiente"];
 if(order.open_box&&order.state==='active')lines.push(`Saldo disponible en esta caja: ${money(Math.max(Number(order.paid)-Number(order.total),0))}. Caja activa; no es cambio ni cierre.`);
 if(payment?.reference)lines.push(`Referencia: ${payment.reference}`);
 if(order.state==='note')lines.splice(0,lines.length,"Sin cobro. Sin reserva de inventario. Precios y disponibilidad se revisan al convertir.");
 if(order.expires_at)lines.push(`Vence: ${new Date(order.expires_at).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}`);
 if(order.policy_snapshot)lines.push(`Anticipo mínimo: ${money(order.policy_snapshot.minimum_deposit)}. Retención al vencer: ${money(order.policy_snapshot.retained_deposit)}. ${order.policy_snapshot.policy}`);
 if(Number(order.unresolved)>0)lines.push(`Saldo pendiente de resolución administrativa: ${money(order.unresolved)}`);
 if(Number(order.retained)>0)lines.push(`Retención registrada: ${money(order.retained)}. Sin nuevo ingreso de dinero.`);
 return thermalReceipt({...order.quote,sale_number:payment?`${order.folio} / ${payment.id.slice(0,8).toUpperCase()}`:order.folio,sold_at:payment?.created_at||order.created_at,payments:payment?[{payment_method:payment.method,amount:payment.amount,tendered_amount:payment.tendered,change_amount:payment.change}]:[]},business,cashier,80,{copy,customer,documentLabel:labels[order.state],footer:lines});
}
