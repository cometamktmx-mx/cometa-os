import type { OnlineOrder } from './operations-contract';

const events: Record<string,string> = {
 CREATED:'Pedido creado', PAYMENT_PAID:'Pago confirmado', PAYMENT_EXPIRED:'Pago vencido',
 PAYMENT_CANCELLED:'Intento de pago cancelado', PAYMENT_PAYMENT_REVIEW:'Pago en revisión',
 PAYMENT_FAILED:'Pago fallido', PAYMENT_PENDING:'Pago pendiente',
 NEW:'Pedido creado', PREPARING:'Preparación iniciada', READY:'Pedido listo',
 SHIPPED:'Pedido enviado', DELIVERED:'Pedido entregado', CANCELLED:'Pedido cancelado',
};
const states:Record<string,string>={PENDING:'Pendiente',PAID:'Pagado',EXPIRED:'Vencido',CANCELLED:'Cancelado',PAYMENT_REVIEW:'Pago en revisión',FAILED:'Fallido',NEW:'Creado',PREPARING:'En preparación',READY:'Listo',SHIPPED:'Enviado',DELIVERED:'Entregado',SHIPPING:'Envío',PICKUP:'Recolección',STRIPE:'Tarjeta · Stripe',WHATSAPP:'WhatsApp'};
export function orderEventLabel(kind:string,delivery?:string){return kind==='READY'&&delivery==='PICKUP'?'Listo para recoger':kind==='READY'&&delivery==='SHIPPING'?'Listo para enviar':Object.hasOwn(events,kind)?events[kind]:'Pedido actualizado';}
export function orderStateLabel(state:string,delivery?:string){return state==='READY'&&delivery==='PICKUP'?'Listo para recoger':state==='READY'&&delivery==='SHIPPING'?'Listo para enviar':Object.hasOwn(states,state)?states[state]:'Estado por confirmar';}
export function orderDate(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(date):'Fecha no disponible';}
export const orderFolio=(id:string)=>id.slice(0,8).toUpperCase();
export type OrderItemView={id:string;quantity:number;unit_cents:number;snapshot:{name?:string;variantName?:string;sku?:string|null;barcode?:string|null;options?:Record<string,string|number>;colorName?:string|null;imagePath?:string|null;retailUnitCents?:number};current?:{sku:string|null;barcode:string|null};imageUrl?:string|null;fallbackImageUrl?:string|null};
export type StoreNotice={event_id:string;read_at?:string|null;store_order_events:{order_id:string;kind:string;created_at:string}};
export function orderAmounts(order:OnlineOrder,items:OrderItemView[]){
 const hasRetail=items.length>0&&items.every(i=>Number.isSafeInteger(i.snapshot.retailUnitCents)&&Number(i.snapshot.retailUnitCents)>=i.unit_cents);
 const retail=hasRetail?items.reduce((sum,i)=>sum+Number(i.snapshot.retailUnitCents)*i.quantity,0):null;
 return {products:retail??order.subtotal_cents,discount:retail===null?null:retail-order.subtotal_cents};
}
