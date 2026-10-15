// Read-only diagnostics plus rejected validation requests on the authorized test backend.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import Stripe from 'stripe';
const dir=path.resolve('.next/magenta-functional/ephmrsjnpkcgddulvckj');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'));
const env=read('environment'),access=read('access'),origins=read('origins');
assert.equal(env.projectRef,'ephmrsjnpkcgddulvckj');assert.ok(env.stripeTest.startsWith('sk_test_'));
const jar=new Map();const auth=createServerClient(env.url,env.anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});
assert.equal((await auth.auth.signInWithPassword({email:access.email,password:access.password})).error,null);
const route='/api/pos/online-store/operations?brandSlug=magenta-preview';
const headers={'x-vercel-protection-bypass':read('admin-automation').secret,origin:origins.admin,cookie:[...jar].map(([n,v])=>n+'='+v).join('; '),'content-type':'application/json'};
const response=await fetch(origins.admin+route,{headers});assert.equal(response.status,200);const settings=await response.json();
fs.writeFileSync(path.join(dir,'settings-before-fix.json'),JSON.stringify(settings));
console.log(JSON.stringify({get:response.status,revision:settings.revision,keys:Object.keys(settings.document),whatsappFormat:{empty:!settings.document.whatsapp,valid:/^[1-9][0-9]{7,14}$/.test(settings.document.whatsapp)},tiers:settings.document.tiers}));
for(const [name,patch] of (process.argv.includes('--audit-only')?[]:[['whatsapp',{payments:{...settings.document.payments,whatsapp:true}}],['wholesale',{mixProducts:!settings.document.mixProducts}]])){
 const document={...settings.document,...patch};
 // Invalid revision prevents any write even if validation unexpectedly succeeds.
 const r=await fetch(origins.admin+route,{method:'POST',headers,body:JSON.stringify({action:'settings',revision:2147483646,document})});
 console.log(JSON.stringify({case:name,method:'POST',route,status:r.status,requestId:r.headers.get('x-vercel-id'),response:await r.json()}));
}
const stripe=new Stripe(env.stripeTest),account=await stripe.accounts.retrieveCurrent(),payment=read('verified-payment'),pi=await stripe.paymentIntents.retrieve(payment.paymentIntent);
const db=createClient(env.url,env.service,{auth:{persistSession:false,autoRefreshToken:false}});
const order=await db.from('store_orders').select('stripe_account_ref,brand_id').eq('id',payment.order).single();assert.equal(order.error,null);assert.equal(order.data.brand_id,env.fixture.ids.brand);assert.equal(order.data.stripe_account_ref,account.id);
const sellers=await db.from('comu_sellers').select('id,brand_slug').eq('brand_slug','magenta-preview');assert.equal(sellers.error,null);
const audit={account:account.id,chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled,detailsSubmitted:account.details_submitted,test:!pi.livemode,destination:pi.transfer_data?.destination??null,onBehalfOf:pi.on_behalf_of,applicationFee:pi.application_fee_amount,orderAccountMatches:order.data.stripe_account_ref===account.id,comuSellersForBrand:sellers.data.length};
fs.writeFileSync(path.join(dir,'receiving-account-audit.json'),JSON.stringify(audit));console.log(JSON.stringify({stripe:audit}));
for(const [name,url] of [['approved','https://magenta-controlled-preview-hme052ccm-cometa-os-s-projects.vercel.app'],['functional',origins.storefront]]){const r=await fetch(url,{headers:{'x-vercel-protection-bypass':read('automation').secret}});const html=await r.text();fs.writeFileSync(path.join(dir,name+'-before.html'),html);console.log(JSON.stringify({page:name,status:r.status,footers:(html.match(/<footer\b/g)||[]).length,hero:html.includes('mag-hero'),synthetic:html.includes('Catalogo sintetico')}));}
