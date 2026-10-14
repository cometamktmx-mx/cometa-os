// Explicitly scoped to the authorized synthetic backend; no product-photo substitution.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {createClient} from '@supabase/supabase-js';
const ref='ephmrsjnpkcgddulvckj',slug='magenta-preview',dir=path.resolve('.next/magenta-functional',ref);
const cli=args=>JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const project=cli(['projects','list']).find(p=>p.id===ref);assert.equal(project.name,'magenta-preview-test');assert.equal(project.status,'ACTIVE_HEALTHY');
const env=JSON.parse(fs.readFileSync(path.join(dir,'environment.json'),'utf8'));assert.equal(env.projectRef,ref);assert.equal(env.url,'https://'+ref+'.supabase.co');
if(!process.argv.includes('--apply')){console.log('PLAN ONLY: restore Atelier on magenta-preview-test');process.exit(0);}
const db=createClient(env.url,env.service,{auth:{persistSession:false,autoRefreshToken:false}}),ids=env.fixture.ids;
const checked=r=>{assert.equal(r.error,null);return r.data;};
assert.equal(checked(await db.from('brands').select('slug').eq('id',ids.brand).single()).slug,slug);
const previous=checked(await db.from('brand_storefront_appearance').select('*').eq('brand_id',ids.brand).single());
const preserve=async()=>({inventory:checked(await db.from('pos_inventory').select('*').eq('brand_slug',slug).order('id')),orders:checked(await db.from('store_orders').select('*').eq('brand_id',ids.brand).order('id')),products:checked(await db.from('pos_product_web_content').select('*').eq('brand_id',ids.brand).order('product_id'))});
const before=await preserve();
const buckets=checked(await db.storage.listBuckets());
if(!buckets.some(b=>b.id==='pos-products'))checked(await db.storage.createBucket('pos-products',{public:true,fileSizeLimit:10485760,allowedMimeTypes:['image/jpeg','image/png','image/webp']}));
if(!fs.existsSync(path.join(dir,'atelier-before.json')))fs.writeFileSync(path.join(dir,'atelier-before.json'),JSON.stringify(previous));
const assets={};for(const name of ['hero-demo.jpg','campaign-demo.png','look-demo-v4.png','magenta-logo.png']){
 const bytes=fs.readFileSync(path.join(dir,'atelier-assets',name)),hash=createHash('sha256').update(bytes).digest('hex');const target=slug+'/web/atelier-demo/'+hash+path.extname(name);
 const upload=await db.storage.from('pos-products').upload(target,bytes,{contentType:name.endsWith('.jpg')?'image/jpeg':'image/png',upsert:false,cacheControl:'31536000'});
 if(upload.error&&!/already exists|duplicate/i.test(upload.error.message))throw Error('ASSET_UPLOAD_FAILED: '+upload.error.message);assets[name]=target;
}
const document={...previous.published,name:'MAGENTA',logo:assets['magenta-logo.png'],paper:'#FFF9F5',ink:'#29191F',accent:'#620D30',soft:'#F2D8DF',motion:true,entrance:false,announcement:'ENTORNO DE PRUEBAS · STRIPE TEST · Fotografías editoriales demo del ZIP Atelier',footer:'Fotografía editorial de demostración Atelier. No representa al producto sintético del catálogo.',navigation:[{title:'Inicio',url:'/'},{title:'Colección',url:'/catalogo'}],headerDesign:{identity:'logo',centered:true,logoWidth:170,mobileLogoWidth:145,showAnnouncement:true,showNavigation:true}};
document.sections=document.sections.map(s=>({...s,enabled:false}));
const entry=(title,text,image='',url='',productId='')=>({title,text,image,url,productId});
const set=(kind,extra)=>Object.assign(document.sections.find(s=>s.kind===kind),{enabled:true,...extra});
set('hero',{title:'Tu nueva\nobsesión.',text:'Looks que quieres llevar a todas partes. Imagen editorial demo.',image:assets['hero-demo.jpg'],url:'/catalogo',buttonLabel:'Explorar la colección'});
set('marquee',{text:'THE MAGENTA EDIT · ATELIER · DEMOSTRACIÓN EDITORIAL'});
set('categories',{title:'Encuentra tu movimiento',entries:[entry('La colección','Fotografía demo del ZIP Atelier',assets['campaign-demo.png'],'/catalogo'),entry('Tu próximo look','Fotografía demo del ZIP Atelier',assets['look-demo-v4.png'],'/catalogo')]});
set('featured',{title:'Favoritos del momento',text:'Catálogo real del backend de pruebas. Los productos sintéticos no tienen fotografía comercial.',entries:[entry('','','','',ids.product)]});
set('look',{title:'Completa el look',text:'Composición editorial demo; la imagen no representa al producto sintético mostrado junto a ella.',image:assets['look-demo-v4.png'],entries:[entry('','','','',ids.product)]});
set('faq',{title:'Antes de empezar',entries:[entry('¿Qué puedo probar?','Catálogo, variantes, bolsa, checkout y pedidos con datos sintéticos. Usa exclusivamente Stripe test.'),entry('¿Cómo se calcula el envío?','La cobertura y las tarifas se consultan en checkout según la configuración actual de la tienda.'),entry('¿Las imágenes son del producto?','No. Las fotografías editoriales provienen del ZIP Atelier y son demostrativas; el producto sintético conserva su información real.')]});
if(!process.argv.includes('--apply')){console.log('Prepared Atelier document and demo assets on authorized test backend; pass --apply to publish.');process.exit(0);}
checked(await db.rpc('brand_storefront_save_m3',{p_brand_slug:slug,p_actor:ids.actor,p_revision:previous.revision,p_document:document,p_publish:true}));
assert.deepEqual(await preserve(),before);const home=checked(await db.rpc('brand_storefront_home_m3',{p_brand_slug:slug}));assert.ok(home.appearance.sections.find(s=>s.kind==='hero').enabled);assert.ok(!home.products[0].image);
fs.writeFileSync(path.join(dir,'atelier-restored.json'),JSON.stringify({assets,document,inventoryOrdersProductContentUnchanged:true}));
console.log('PASS persisted Atelier home, logo, hero, editorial sections and motion; real catalog references; demo media not assigned to product. Orders/inventory/product snapshots unchanged.');
