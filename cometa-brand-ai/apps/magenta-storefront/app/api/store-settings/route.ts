import {publicStore} from '../../../lib/public-store';
import {paymentAvailability} from '../../../lib/payment-availability';
export const dynamic='force-dynamic';
export async function GET(){const store=publicStore();if(!store)return Response.json({error:'Tienda no disponible'},{status:503});const [r,context]=await Promise.all([store.client.rpc('store_public_settings_m7',{p_brand:store.slug}),store.client.rpc('store_brand_context_m6',{p_brand:store.slug})]);if(r.error||context.error||!context.data?.brandId)return Response.json({error:'Configuración no disponible'},{status:503});return Response.json({settings:r.data,payment:await paymentAvailability(context.data.brandId)},{headers:{'Cache-Control':'no-store'}});}
