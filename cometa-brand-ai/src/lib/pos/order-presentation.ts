import 'server-only';
import {PosApiError,type PosRequestContext} from './server';
type Item={id:string;product_id:string;variant_id:string;quantity:number;unit_cents:number;snapshot:Record<string,unknown>};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
function currentPhoto(value:unknown,variant:string){const colors=record(value).colors;if(!Array.isArray(colors))return null;const color=colors.map(record).find(c=>Array.isArray(c.variantIds)&&c.variantIds.includes(variant));const photos=color?.photos;return Array.isArray(photos)?record(photos[0]).path:null;}
export async function presentOrderItems(c:PosRequestContext,items:Item[]){
 if(!items.length)return [];
 const [variants,web]=await Promise.all([
  c.admin.from('pos_product_variants').select('id,sku,barcode').eq('brand_slug',c.brand.slug).in('id',items.map(i=>i.variant_id)),
  c.admin.from('pos_product_web_content').select('product_id,published').eq('brand_id',c.brand.id).in('product_id',[...new Set(items.map(i=>i.product_id))]),
 ]);
 if(variants.error||web.error)throw new PosApiError(503,'POS_WEB_LOOKUP_FAILED','No se pudieron consultar las referencias actuales del catálogo.');
 const photoUrl=(value:unknown)=>typeof value==='string'&&value.startsWith(c.brand.slug+'/web/')&&/^[a-z0-9-]+\/web\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(value)?c.admin.storage.from('pos-products').getPublicUrl(value).data.publicUrl:null;
 return items.map(item=>{
  const variant=variants.data?.find(v=>v.id===item.variant_id),published=web.data?.find(w=>w.product_id===item.product_id)?.published;
  return {...item,current:{sku:variant?.sku??null,barcode:variant?.barcode??null},imageUrl:photoUrl(item.snapshot.imagePath),fallbackImageUrl:photoUrl(currentPhoto(published,item.variant_id))};
 });
}
