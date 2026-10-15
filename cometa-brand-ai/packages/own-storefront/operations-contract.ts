import { uuidPattern } from './product-contract';
export type Tier = { productId: string; minQuantity: number; mode: 'UNIT_PRICE'|'AMOUNT_OFF'|'PERCENT_OFF'; value: number };
export type StoreSettings = {
 name: string; email: string; phone: string; whatsapp: string; address: string; status: 'OPEN'|'CLOSED';
 locationId: string; currency: 'MXN'|'USD'|'EUR';
 shipping: { enabled: boolean; country: string; postalPrefixes: string[]; feeCents: number; freeFromCents: number|null; minDays: number; maxDays: number };
 pickup: { enabled: boolean; address: string; hours: string; instructions: string };
 payments: { stripe: boolean; whatsapp: boolean }; mixProducts: boolean; tiers: Tier[];
 policies: { privacy: string; returns: string; terms: string }; recipients: string[];
};
export const emptyStoreSettings = (): StoreSettings => ({ name:'',email:'',phone:'',whatsapp:'',address:'',status:'CLOSED',locationId:'',currency:'MXN',shipping:{enabled:false,country:'MX',postalPrefixes:[],feeCents:0,freeFromCents:null,minDays:1,maxDays:5},pickup:{enabled:false,address:'',hours:'',instructions:''},payments:{stripe:false,whatsapp:false},mixProducts:false,tiers:[],policies:{privacy:'',returns:'',terms:''},recipients:[] });
export function parseStoreSettings(value: unknown): StoreSettings {
 const fieldPath='document';
 const fail=():never=>{throw new StoreSettingsValidationError({[fieldPath]:fieldMessage(fieldPath)});};
 const obj=(v:unknown,keys:string[])=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))return fail();return {...v} as Record<string,unknown>;};
 const text=(v:unknown,max=200)=>typeof v==='string'&&v.length<=max?v.trim():fail();
 const bool=(v:unknown)=>typeof v==='boolean'?v:fail();
 const num=(v:unknown,max=100000000)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max?v:fail();
 const list=(v:unknown,max:number)=>Array.isArray(v)&&v.length<=max?v:fail();
 const s=obj(value,Object.keys(emptyStoreSettings())),h=obj(s.shipping,['enabled','country','postalPrefixes','feeCents','freeFromCents','minDays','maxDays']),p=obj(s.pickup,['enabled','address','hours','instructions']),pay=obj(s.payments,['stripe','whatsapp']),policy=obj(s.policies,['privacy','returns','terms']);
 // Validate each leaf before parsing so API and client receive the same field paths.
 const errors:Record<string,string>={};
 const requireField=(path:string,valid:boolean,message=fieldMessage(path))=>{if(!valid)errors[path]=message;};
 for(const [path,v,max] of [['name',s.name,100],['email',s.email,200],['phone',s.phone,30],['whatsapp',s.whatsapp,40],['address',s.address,1000],['pickup.address',p.address,1000],['pickup.hours',p.hours,1000],['pickup.instructions',p.instructions,2000],['policies.privacy',policy.privacy,8000],['policies.returns',policy.returns,8000],['policies.terms',policy.terms,8000]] as const)requireField(path,typeof v==='string'&&v.length<=max);
 const whatsapp=typeof s.whatsapp==='string'?s.whatsapp.trim().replace(/^\+/, '').replace(/[\s()-]/g,''):'';
 requireField('whatsapp',!pay.whatsapp||/^[1-9][0-9]{7,14}$/.test(whatsapp));
 requireField('name',typeof s.name==='string'&&!!s.name.trim());requireField('locationId',typeof s.locationId==='string'&&uuidPattern.test(s.locationId));
 requireField('email',typeof s.email==='string'&&(!s.email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())));
 for(const k of ['feeCents','minDays','maxDays'] as const)requireField('shipping.'+k,typeof h[k]==='number'&&Number.isSafeInteger(h[k])&&Number(h[k])>=0&&Number(h[k])<=(k==='feeCents'?100000000:365));
 requireField('shipping.freeFromCents',h.freeFromCents===null||(typeof h.freeFromCents==='number'&&Number.isSafeInteger(h.freeFromCents)&&h.freeFromCents>=0&&h.freeFromCents<=100000000));
 if(h.enabled){requireField('shipping.country',typeof h.country==='string'&&/^[A-Z]{2}$/.test(h.country));requireField('shipping.postalPrefixes',Array.isArray(h.postalPrefixes)&&h.postalPrefixes.length>0&&h.postalPrefixes.every(v=>typeof v==='string'&&/^[A-Za-z0-9 -]{1,12}$/.test(v.trim())));requireField('shipping.maxDays',Number(h.maxDays)>=Number(h.minDays),'El plazo máximo debe ser igual o mayor al mínimo.');}
 if(p.enabled){requireField('pickup.address',typeof p.address==='string'&&!!p.address.trim());requireField('pickup.hours',typeof p.hours==='string'&&!!p.hours.trim());}
 if(s.status==='OPEN'){requireField('email',typeof s.email==='string'&&!!s.email.trim()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim()));requireField('address',typeof s.address==='string'&&!!s.address.trim());requireField('shipping.enabled',!!h.enabled||!!p.enabled,'Activa envío o recolección para abrir la tienda.');requireField('payments.stripe',!!pay.stripe||!!pay.whatsapp,'Activa al menos un método de pago.');}
 const tierKeys=new Set<string>();
 if(Array.isArray(s.tiers))s.tiers.forEach((v,i)=>{const t=obj(v,['productId','minQuantity','mode','value']);const path='tiers.'+i;requireField(path+'.productId',typeof t.productId==='string'&&(!t.productId||uuidPattern.test(t.productId)));requireField(path+'.minQuantity',typeof t.minQuantity==='number'&&Number.isSafeInteger(t.minQuantity)&&t.minQuantity>0&&t.minQuantity<=9900);requireField(path+'.mode',['UNIT_PRICE','AMOUNT_OFF','PERCENT_OFF'].includes(String(t.mode)));requireField(path+'.value',typeof t.value==='number'&&Number.isFinite(t.value)&&t.value>=0&&t.value<=1000000&&Math.abs(t.value*100-Math.round(t.value*100))<0.00001&&(t.mode!=='PERCENT_OFF'||t.value<100)&&(t.mode!=='UNIT_PRICE'||t.value>0));const key=t.productId+':'+t.minQuantity;requireField(path+'.minQuantity',!tierKeys.has(key),'Ya existe una regla para ese producto y cantidad.');tierKeys.add(key);});
 requireField('recipients',Array.isArray(s.recipients)&&s.recipients.length<=30&&s.recipients.every(v=>typeof v==='string'&&uuidPattern.test(v))&&new Set(s.recipients).size===s.recipients.length);
 if(Object.keys(errors).length)throw new StoreSettingsValidationError(errors);
 s.whatsapp=whatsapp;
 const result:StoreSettings={name:text(s.name,100),email:text(s.email),phone:text(s.phone,30),whatsapp:text(s.whatsapp,15),address:text(s.address,1000),status:s.status==='OPEN'?'OPEN':s.status==='CLOSED'?'CLOSED':fail(),locationId:text(s.locationId,36),currency:s.currency==='MXN'||s.currency==='USD'||s.currency==='EUR'?s.currency:fail(),
 shipping:{enabled:bool(h.enabled),country:text(h.country,2),postalPrefixes:list(h.postalPrefixes,100).map(x=>text(x,12)),feeCents:num(h.feeCents),freeFromCents:h.freeFromCents===null?null:num(h.freeFromCents),minDays:num(h.minDays,365),maxDays:num(h.maxDays,365)},
 pickup:{enabled:bool(p.enabled),address:text(p.address,1000),hours:text(p.hours,1000),instructions:text(p.instructions,2000)},payments:{stripe:bool(pay.stripe),whatsapp:bool(pay.whatsapp)},mixProducts:bool(s.mixProducts),
 tiers:list(s.tiers,100).map(v=>{const t=obj(v,['productId','minQuantity','mode','value']);const tier:Tier={productId:text(t.productId,36),minQuantity:num(t.minQuantity,9900),mode:t.mode==='UNIT_PRICE'||t.mode==='AMOUNT_OFF'||t.mode==='PERCENT_OFF'?t.mode:fail(),value:typeof t.value==='number'&&Number.isFinite(t.value)&&t.value>=0&&t.value<=1000000&&Math.abs(t.value*100-Math.round(t.value*100))<0.00001?t.value:fail()};if(!tier.minQuantity||(tier.productId&&!uuidPattern.test(tier.productId))||(tier.mode==='PERCENT_OFF'&&tier.value>=100)||(tier.mode==='UNIT_PRICE'&&tier.value===0))fail();return tier;}),
 policies:{privacy:text(policy.privacy,8000),returns:text(policy.returns,8000),terms:text(policy.terms,8000)},recipients:list(s.recipients,30).map(v=>text(v,36))};
 if(!result.name||!uuidPattern.test(result.locationId)||!result.recipients.every(v=>uuidPattern.test(v))||new Set(result.recipients).size!==result.recipients.length)fail();
 if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))fail();
 if(result.payments.whatsapp&&!/^[1-9][0-9]{7,14}$/.test(result.whatsapp))fail();
 if(result.shipping.enabled&&(!/^[A-Z]{2}$/.test(result.shipping.country)||!result.shipping.postalPrefixes.length||!result.shipping.postalPrefixes.every(v=>/^[A-Za-z0-9 -]{1,12}$/.test(v))||result.shipping.maxDays<result.shipping.minDays))fail();
 if(result.pickup.enabled&&(!result.pickup.address||!result.pickup.hours))fail();
 if(result.status==='OPEN'&&(!result.email||!result.address||!(result.shipping.enabled||result.pickup.enabled)||!(result.payments.stripe||result.payments.whatsapp)))fail();
 if(new Set(result.tiers.map(t=>t.productId+':'+t.minQuantity)).size!==result.tiers.length)fail();
 return result;
}
export class StoreSettingsValidationError extends Error { constructor(public fields:Record<string,string>){super('Revisa los campos señalados. Tus cambios se conservan.');this.name='StoreSettingsValidationError';} }
function fieldMessage(path:string){
 if(path==='whatsapp')return 'Escribe el número con código de país (8 a 15 dígitos). Puedes incluir +, espacios o guiones.';
 if(path.endsWith('minQuantity'))return 'Indica una cantidad entera entre 1 y 9900.';
 if(path.endsWith('.value'))return 'Indica un importe válido con hasta dos decimales; el porcentaje debe ser menor que 100 y el precio mayor que cero.';
 if(path==='locationId')return 'Selecciona una sucursal activa.';
 if(path==='email')return 'Escribe un correo de contacto válido.';
 if(path==='shipping.postalPrefixes')return 'Añade al menos un prefijo postal válido, separado por comas.';
 if(path==='shipping.country')return 'Usa el código de país de dos letras, por ejemplo MX.';
 if(path.startsWith('shipping.'))return 'Indica un número entero dentro del rango permitido.';
 if(path==='recipients')return 'Selecciona destinatarios válidos sin repetirlos.';
 return 'Revisa este campo: es obligatorio o su valor no es válido.';
}
export type OnlineOrder = {id:string;status:string;payment_method:string;delivery_method:string;preparation_status:string;delivery_status:string;tracking:string|null;refund_required:boolean;operation_revision:number;currency:string;total_cents:number;subtotal_cents:number;shipping_cents:number;created_at:string;contact:Record<string,string>;delivery_snapshot:Record<string,unknown>};
export type OrderEvent = {id:string;order_id:string;kind:string;created_at:string;detail:Record<string,unknown>};
export const orderStatusLabels:Record<string,string>={PENDING:'Pendiente',PAID:'Pagado',CANCELLED:'Cancelado',EXPIRED:'Vencido',PAYMENT_REVIEW:'Pago en revisión',NEW:'Nuevo',PREPARING:'Preparando',READY:'Listo',SHIPPED:'Enviado',DELIVERED:'Entregado',SHIPPING:'Envío',PICKUP:'Recolección',STRIPE:'Tarjeta',WHATSAPP:'WhatsApp · pendiente de pago'};
