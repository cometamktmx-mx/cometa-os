import {publicStore} from '../../../lib/public-store';
export const dynamic='force-dynamic';
export async function GET(){const store=publicStore();if(!store)return Response.json({error:'Tienda no disponible'},{status:503});const r=await store.client.rpc('store_public_settings_m7',{p_brand:store.slug});return Response.json(r.error?{error:'Configuración no disponible'}:{settings:r.data},{status:r.error?503:200,headers:{'Cache-Control':'no-store'}});}
