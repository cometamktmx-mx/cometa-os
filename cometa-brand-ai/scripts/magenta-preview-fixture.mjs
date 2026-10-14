// Synthetic provisioning only; caller must enforce an empty, dedicated test backend.
import {randomUUID,createHash} from 'node:crypto';
export const fixtureEmail='magenta-preview-admin@example.test';
export const fixtureSlug='magenta-preview';
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export async function provisionMagenta({sql,actor,stripeAccount='acct_fixture'}){
 const json=async q=>JSON.parse(await sql(q)),slug=fixtureSlug;
 if(!/^[0-9a-f-]{36}$/.test(actor)||!/^acct_[a-zA-Z0-9]+$/.test(stripeAccount))throw Error('INVALID_FIXTURE_INPUT');
 if(await sql('select count(*) from brands')!=='0')throw Error('EMPTY_APPLICATION_REQUIRED');
 if(await sql(`select count(*) from auth.users where id='${actor}' and email=${quote(fixtureEmail)}`)!=='1')throw Error('SYNTHETIC_AUTH_REQUIRED');
 const ids={actor,brand:randomUUID(),location:randomUUID(),register:randomUUID()};
 await sql(`begin;
 insert into user_profiles(user_id,email,full_name,role,status) values('${actor}',${quote(fixtureEmail)},'Magenta Preview Synthetic','admin','active') on conflict(user_id) do update set role='admin',status='active';
 insert into brands(id,slug,name,status,created_by) values('${ids.brand}','${slug}','Magenta — PRUEBAS SINTETICAS','active','${actor}');
 insert into user_brand_access(user_id,brand_slug,access_role,status) values('${actor}','${slug}','owner','active');
 insert into pos_business_profiles(brand_id,brand_slug,profile_code,onboarding_status,onboarding_completed_at) values('${ids.brand}','${slug}','retail','completed',now());
 insert into pos_locations(id,brand_id,brand_slug,name,code,currency) values('${ids.location}','${ids.brand}','${slug}','Sucursal sintetica','TEST','MXN');
 insert into pos_registers(id,brand_id,brand_slug,location_id,name,code) values('${ids.register}','${ids.brand}','${slug}','${ids.location}','Caja sintetica','TEST');
 insert into pos_units(code,name,symbol,unit_type) values('piece','Pieza','pza','count') on conflict(code) do nothing;
 select pos_manage_complimentary_v1('${slug}','${actor}',null,'save','pro',now()+interval '30 days','SYNTHETIC PREVIEW ONLY');
 select brand_online_store_set_access_a1('${slug}','${actor}','enabled',0);
 commit;`);
 const imported={};
 for(const [kind,values] of [['products',{code:'MAGENTA-TEST-001',name:'Magenta producto sintetico',price:100,cost:40,creation_tax_rate:0}],['inventory',{code:'MAGENTA-TEST-001',quantity:10}]]){
  const records=[{rowNumber:2,values,errors:[]}],location=kind==='inventory'?quote(ids.location):'null';
  const call=(mode,rows,request='null',hash='null',token='null')=>json(`set role service_role;select pos_import_v1('${slug}','${actor}','${kind}',${location},'${mode}',${quote(JSON.stringify(rows))},${request},${hash},${token})`);
  const preview=await call('preview',records);
  if(preview.rows.some(row=>row.errors.length))throw Error('FIXTURE_IMPORT_INVALID');
  imported[kind]=await call('apply',records.map(row=>({...row,decision:'create'})),quote(randomUUID()),quote(createHash('sha256').update(JSON.stringify(records)).digest('hex')),quote(preview.token));
 }
 ids.variant=await sql(`select id from pos_product_variants where brand_slug='${slug}' and sku='MAGENTA-TEST-001'`);
 ids.product=await sql(`select product_id from pos_product_variants where id='${ids.variant}'`);
 const content={colors:[{id:randomUUID(),name:'Rosa',variantIds:[ids.variant],hex:'#b85c7b',swatchPath:'',photos:[]}],benefits:[],details:[{id:randomUUID(),title:'SINTETICO',content:'Producto exclusivo de pruebas, sin venta real.',enabled:true,open:true}],guide:{content:'',columns:[],rows:[],imagePath:''},relatedIds:[],wholesale:{enabled:false,title:'',content:''}};
 const kinds=['hero','marquee','categories','featured','look','videos','testimonials','benefits','wholesale','faq','newsletter'];
 const appearance={name:'Magenta · PRUEBAS',logo:'',announcement:'SINTETICO · SOLO STRIPE TEST',footer:'Entorno de pruebas',paper:'#fff9f5',ink:'#29191f',accent:'#740a32',soft:'#fce5ec',font:'editorial',spacing:64,motion:false,entrance:false,navigation:[{title:'Catalogo',url:'/catalogo'}],sections:kinds.map(kind=>({kind,enabled:kind==='featured',title:kind==='featured'?'Catalogo sintetico':'',text:'',image:'',url:'',entries:kind==='featured'?[{title:'',text:'',image:'',url:'',productId:ids.product}]:[]}))};
 const settings={name:'Magenta · PRUEBAS',email:fixtureEmail,phone:'5555555555',whatsapp:'',address:'Direccion SINTETICA',status:'OPEN',locationId:ids.location,currency:'MXN',shipping:{enabled:true,country:'MX',postalPrefixes:['00'],feeCents:0,freeFromCents:0,minDays:1,maxDays:2},pickup:{enabled:true,address:'Sucursal SINTETICA',hours:'10–18',instructions:'Solo pruebas'},payments:{stripe:true,whatsapp:false},mixProducts:false,tiers:[],policies:{privacy:'Solo datos sinteticos.',returns:'No hay cargos reales.',terms:'Solo entorno de pruebas.'},recipients:[actor]};
 await sql(`set role service_role;
 select pos_set_product_channels_m1('${slug}','${ids.product}','${actor}',true,true,0);
 select pos_save_product_web_m2('${slug}','${ids.product}','${actor}',0,${quote(JSON.stringify(content))},true);
 select brand_storefront_save_m3('${slug}','${actor}',0,${quote(JSON.stringify(appearance))},true);
 select store_settings_save_m7('${slug}','${actor}',0,${quote(JSON.stringify(settings))},'${stripeAccount}');`);
 return {ids,imported};
}

export const expiryCommand="set role service_role; select public.store_orders_expire_m6('magenta-preview');";
export async function verifySyntheticChain({sql,fixture}){
 const {ids}=fixture,slug=fixtureSlug,json=async q=>JSON.parse(await sql(q));
 const stock=()=>json(`select jsonb_build_object('quantity',quantity,'reserved',reserved_quantity) from pos_inventory where location_id='${ids.location}' and variant_id='${ids.variant}'`);
 const cash=randomUUID();
 await sql(`insert into pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id,status,opening_amount) values('${cash}','${ids.brand}','${slug}','${ids.location}','${ids.register}','open',0)`);
 assertStock(await stock(),10,0);
 await sql(`select pos_complete_sale_v4('${slug}','${ids.location}','${ids.register}','${cash}',null,${quote(JSON.stringify([{variant_id:ids.variant,quantity:2,discount_amount:0}]))},'[{"method":"cash","amount":200,"tendered_amount":200}]','SYNTHETIC',null,null,'${randomUUID()}',null)`);
 assertStock(await stock(),8,0);
 const contact={email:'buyer@example.test',name:'Synthetic buyer',phone:'5555555555',line1:'SYNTHETIC',line2:'',city:'TEST',state:'TEST',postalCode:'00000',country:'MX'};
 const create=quantity=>json(`set role service_role;select to_jsonb(store_order_create_m7('${slug}','${randomUUID().replaceAll('-','').repeat(2)}','${randomUUID()}',${quote(JSON.stringify([{productId:ids.product,variantId:ids.variant,quantity}]))},${quote(JSON.stringify(contact))},'PICKUP','STRIPE','${'a'.repeat(64)}'))`);
 const paid=await create(3);assertStock(await stock(),8,3);
 const {certifyWebhook}=await import('./test-store-webhook-local.mjs');await certifyWebhook({sql,quote,brandId:ids.brand,order:paid,slug});
 assertStock(await stock(),5,0);
 const pending=await create(1);assertStock(await stock(),5,1);
 await sql(`update store_orders set expires_at=now()-interval '1 hour' where id in('${paid.id}','${pending.id}')`);
 await Promise.all([sql(expiryCommand),sql(expiryCommand)]);await sql(expiryCommand);
 assertStock(await stock(),5,0);
 if(await sql(`select status from store_orders where id='${paid.id}'`)!=='PAID')throw Error('PAID_ORDER_CHANGED');
 if(await sql(`select status from store_orders where id='${pending.id}'`)!=='EXPIRED')throw Error('PENDING_NOT_EXPIRED');
 if(await sql(`select count(*) from store_notifications n join store_order_events e on e.id=n.event_id where e.order_id='${paid.id}' and n.recipient='${ids.actor}'`)==='0')throw Error('MISSING_NOTIFICATION');
 for(const role of ['anon','authenticated']){let denied=false;try{await sql(`set role ${role};select store_orders_expire_m6('${slug}')`);}catch{denied=true;}if(!denied)throw Error('EXPIRY_AUTH_FAILED');}
 console.log('PASS EMPTY-BASE CHAIN: importer -> same product/variant -> Retail sale 2 -> web reserve 3 -> locally signed webhook -> persistent POS notice -> stock 5; concurrent expiry and retries release pending only, paid stock unchanged, public roles denied. NOT a Stripe provider payment.');
}
function assertStock(actual,quantity,reserved){if(actual.quantity!==quantity||actual.reserved!==reserved)throw Error('STOCK_MISMATCH '+JSON.stringify(actual));}
