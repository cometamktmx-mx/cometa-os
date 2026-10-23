// Real local Supabase + compiled Next application; synthetic fixtures only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {createClient}=require('../../cometa-brand-ai/node_modules/@supabase/supabase-js');
const {createServerClient}=require('../../cometa-brand-ai/node_modules/@supabase/ssr');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(url,'http://127.0.0.1:55431');
const app='http://127.0.0.1:55400',slug='cash-close-synthetic-20261023';
const terminal='10000000-0000-4000-8000-000000000001';
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const evidence=[];
const pass=message=>{evidence.push(message);console.log('PASS',message);};
const required=async promise=>{const r=await promise;if(r.error)throw Error(r.error.code+': '+r.error.message);return r.data;};
const insert=(table,data)=>required(admin.from(table).insert(data).select().single());
let cookie='',state;
async function request(route,body,expected=200,customCookie=cookie){
 const r=await fetch(app+route,{method:body?'POST':'GET',headers:{Cookie:customCookie,Origin:'http://localhost:55400','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'manual'});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={text:text.slice(0,180)};}
 assert.equal(r.status,expected,route+' '+JSON.stringify(data));return data;
}
async function login(email,password){const cookies=[];const auth=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>cookies,setAll:values=>{for(const c of values){const i=cookies.findIndex(x=>x.name===c.name);if(i<0)cookies.push(c);else cookies[i]=c;}}}});await required(auth.auth.signInWithPassword({email,password}));return cookies.map(c=>`${c.name}=${c.value}`).join('; ');}
async function setup(){
 const stateFile=path.resolve(__dirname,'../../.env.cash-close-state.json');
 if(fs.existsSync(stateFile)){state=JSON.parse(fs.readFileSync(stateFile));cookie=await login(state.email,state.password);cookie+='; cometa_pos_staff_session='+state.staffToken;return;}
 const email='cash-close-'+Date.now()+'@synthetic.invalid',password=randomBytes(24).toString('hex');
 const user=(await required(admin.auth.admin.createUser({email,password,email_confirm:true}))).user;
 await required(admin.from('user_profiles').upsert({user_id:user.id,email,role:'admin',status:'active'},{onConflict:'user_id'}));
 const brand=await insert('brands',{slug,name:'SYNTHETIC CASH CLOSE — NOT A REAL BUSINESS'});
 await required(admin.rpc('pos_initialize_brand_setup',{p_brand_id:brand.id,p_brand_slug:slug,p_brand_name:brand.name,p_user_id:user.id}));
 await required(admin.from('pos_business_profiles').update({profile_code:'retail'}).eq('brand_slug',slug));
 const location=await insert('pos_locations',{brand_id:brand.id,brand_slug:slug,name:'Synthetic branch',code:'SYNTHETIC',currency:'MXN',timezone:'America/Mexico_City'});
 const otherLocation=await insert('pos_locations',{brand_id:brand.id,brand_slug:slug,name:'Other synthetic branch',code:'OTHER',currency:'MXN',timezone:'America/Mexico_City'});
 const register=await insert('pos_registers',{brand_id:brand.id,brand_slug:slug,location_id:location.id,name:'Synthetic register',code:'SYNTHETIC'});
 const staff=await insert('pos_staff',{brand_id:brand.id,brand_slug:slug,location_id:location.id,name:'Synthetic closing operator',role:'ADMIN',pin_hash:'synthetic-not-a-login-pin',retail_permissions:['CASH','REPRINT','SETTINGS','PRODUCTS_READ','SELL']});
 const staffToken=randomBytes(32).toString('base64url');
 const session=await insert('pos_staff_sessions',{brand_id:brand.id,brand_slug:slug,location_id:location.id,staff_id:staff.id,host_user_id:user.id,token_hash:createHash('sha256').update(staffToken).digest('hex'),expires_at:new Date(Date.now()+86400000).toISOString(),last_human_at:new Date().toISOString()});
 state={email,password,brand:brand.id,host:user.id,location:location.id,otherLocation:otherLocation.id,register:register.id,staff:staff.id,staffSession:session.id,staffToken};
 fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});cookie=await login(email,password);cookie+='; cometa_pos_staff_session='+staffToken;
}
async function qzFailureAndRetry(printing,cash){
 const vm=require('node:vm'),ts=require('../../cometa-brand-ai/node_modules/typescript'),{webcrypto}=require('node:crypto');
 let attempt=0,active=false,signature,hash;const requestActions=[];
 const qz={websocket:{isActive:()=>active,connect:async()=>{active=true;},disconnect:async()=>{active=false;}},security:{setCertificatePromise(){},setSignatureAlgorithm(){},setSignaturePromise:f=>{signature=f;}},api:{setSha256Type:f=>{hash=f;}},configs:{create:(printer,options)=>({printer,options})},print:async(config,data)=>{
   attempt++;const message=JSON.stringify({call:'print',params:{printer:{name:config.printer},options:config.options,data},timestamp:Date.now()});
   const digest=await hash(message);await new Promise((resolve,reject)=>signature(digest)(resolve,reject));
   if(attempt===1)throw Error('Synthetic QZ printer offline after authorized dispatch');
 }};
 function load(name){const file=path.resolve(__dirname,'../../cometa-brand-ai/src/lib/pos',name+'.ts');const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:n=>n==='qz-tray'?{default:qz}:load(n.replace('./','')),Date,Intl,Map,Set,Promise,JSON,TextEncoder,crypto:webcrypto,console,localStorage:{getItem:()=>terminal,setItem(){}},sessionStorage:{getItem:()=> 'true'},fetch:async(route,options)=>{
 const body=options?.body?JSON.parse(options.body):null;if(body)requestActions.push(body.action);
 return fetch(app+route,{...options,headers:{...options?.headers,Cookie:cookie,Origin:'http://localhost:55400'}});
 }});return exports;}
 const client=load('thermal-client');const payload={action:'cash-close-reprint',cashSessionId:cash,requestKey:randomUUID()};
 const pending=client.printOperation(slug,payload);assert.equal(pending,client.printOperation(slug,payload));await assert.rejects(pending);
 const result=await client.printOperation(slug,{...payload,requestKey:randomUUID()});assert.match(result,/Ticket enviado/);assert.equal(attempt,2);
 assert.equal(requestActions.filter(a=>a==='cash-close-reprint').length,2);assert.ok(!requestActions.includes('close'));
 const jobs=await required(admin.from('pos_terminal_print_jobs').select('status').eq('brand_slug',slug).eq('cash_session_id',cash));assert.ok(jobs.some(j=>j.status==='spooled'));assert.ok(jobs.some(j=>j.status==='failed'));
 pass('real persisted QZ jobs: authorized dispatch fails, manual retry spools, concurrent double click coalesces, close never called');
}
async function run(){
 await setup();
 await required(admin.from('user_profiles').update({status:'active'}).eq('user_id',state.host));
 await required(admin.from('pos_staff').update({retail_permissions:['CASH','REPRINT','SETTINGS','PRODUCTS_READ','SELL'],location_id:state.location}).eq('id',state.staff));
 await required(admin.from('pos_staff_sessions').update({location_id:state.location}).eq('id',state.staffSession));
 await required(admin.from('pos_staff_sessions').update({last_human_at:new Date().toISOString()}).eq('id',state.staffSession));
 pass('real Auth session and synthetic tenant in isolated database');
 const history='/api/pos/cash-sessions?brandSlug='+slug,printing='/api/pos/terminal-print?brandSlug='+slug;
 await request(history,null,401,'');pass('unauthenticated cash history denied');
 await request(printing,{action:'configure',terminalId:terminal,config:{printer:'SYNTHETIC NO PHYSICAL PRINTER',width:80,profile:'driver',receiptMode:'epson-tm-t20ii',autoPrint:false,autoDrawer:false}});
 let cash;
 const savedState=path.resolve(__dirname,'../../.env.cash-close-state.json');
 if(state.cash)cash=state.cash;
 else{
 const prior=await required(admin.from('pos_cash_sessions').select('id').eq('brand_slug',slug).eq('register_id',state.register).eq('status','open').maybeSingle());
 const opened=prior?{session:prior}:await request('/api/pos/cash-sessions',{brandSlug:slug,action:'open',registerId:state.register,openingAmount:500,requestKey:randomUUID()},201);cash=opened.session.id;state.cash=cash;fs.writeFileSync(savedState,JSON.stringify(state),{mode:0o600});
 }
 const sales=await required(admin.from('pos_sales').select('id').eq('brand_slug',slug).eq('cash_session_id',cash));
 if(!sales.length){
 // Synthetic sales record only: no inventory, payments or customers from another DB.
 for(const [method,amount] of [['cash',1000.25],['card',800],['transfer',300],['transfer',150]]){
 const sale=await insert('pos_sales',{brand_id:state.brand,brand_slug:slug,location_id:state.location,register_id:state.register,cash_session_id:cash,sale_number:'SYN-'+randomUUID(),subtotal:amount,total:amount,sold_by:state.host,cashier_staff_id:state.staff});
 const payment=await insert('pos_payments',{brand_id:state.brand,brand_slug:slug,sale_id:sale.id,payment_method:method,amount,tendered_amount:amount,change_amount:0});
 if(method==='transfer'&&amount===300)await insert('pos_retail_verifications',{brand_slug:slug,source:'sale',payment_id:payment.id,verified:true,reference:'SYNTHETIC',reason:'Synthetic test',staff_id:state.staff,host_user_id:state.host,request_key:randomUUID()});
 }
 }
 const movements=await required(admin.from('pos_cash_movements').select('movement_type').eq('brand_slug',slug).eq('cash_session_id',cash));
 for(const [movementType,amount] of [['income',100],['deposit',200],['expense',50],['withdrawal',120]]) if(!movements.some(m=>m.movement_type===movementType)) await request('/api/pos/cash-movements?brandSlug='+slug,{cashSessionId:cash,movementType,amount,reason:'Synthetic test only',requestKey:randomUUID()},201);
 state.closeKey ||=randomUUID();fs.writeFileSync(savedState,JSON.stringify(state),{mode:0o600});
 const closeBody={brandSlug:slug,action:'close',sessionId:cash,countedCash:1620.25,requestKey:state.closeKey};
 const closed=await request('/api/pos/cash-sessions',closeBody);
 assert.equal(closed.receiptWarning,null,'snapshot must persist without degraded fallback');
 assert.equal(Number(closed.session.expected_cash),1630.25);assert.equal(Number(closed.session.difference),-10);
 pass('real close committed: expected 1630.25, counted 1620.25, difference -10; snapshot saved');
 const original=await required(admin.from('pos_cash_sessions').select('*').eq('id',cash).single());
 const audit=await required(admin.from('pos_staff_audit_events').select('metadata').eq('cash_session_id',cash).eq('action','CASH_SESSION_CLOSE').single());
 assert.equal(audit.metadata.cashCloseReceipt.transfers.verified,300);assert.equal(audit.metadata.cashCloseReceipt.transfers.pending,150);
 const retry=await request('/api/pos/cash-sessions',closeBody);assert.equal(retry.session.id,cash);
 pass('same close request key returns the saved close, with no second closing');
 const list=await request(history);assert.ok(list.sessions.some(s=>s.id===cash&&s.status==='closed'));pass('authenticated history returns the persisted close');
 const initialAction=Date.now()-Date.parse(closed.session.closed_at)>300000?'cash-close-reprint':'cash-close';
 const first=await request(printing,{action:initialAction,cashSessionId:cash,terminalId:terminal,requestKey:randomUUID()});
 assert.equal(first.jobs.length,1);const data=JSON.stringify(first.jobs[0].payload.data);assert.ok(data.includes('1,630.25'));assert.ok(data.includes('1,620.25'));
 await request(printing,{action:'result',terminalId:terminal,jobId:first.jobs[0].id,status:'failed'});pass('failed print job leaves saved close intact');
 const reprint=await request(printing,{action:'cash-close-reprint',cashSessionId:cash,terminalId:terminal,requestKey:randomUUID()});assert.ok(JSON.stringify(reprint.jobs[0].payload.data).includes('REIMPRESIÓN'));
 fs.writeFileSync(path.join(__dirname,'ticket-database-reprint.html'),reprint.jobs[0].payload.data.find(d=>d.format==='html').data);
 assert.ok(JSON.stringify(reprint.jobs[0].payload.data).includes('1,630.25'));pass('history reprint preserves original balances and carries REIMPRESIÓN');
 await required(admin.from('pos_staff').update({retail_permissions:['CASH']}).eq('id',state.staff));
 await request(printing,{action:'cash-close-reprint',cashSessionId:cash,terminalId:terminal,requestKey:randomUUID()},403);pass('real staff without REPRINT permission denied');
 await required(admin.from('pos_staff').update({retail_permissions:['REPRINT','PRODUCTS_READ']}).eq('id',state.staff));
 await request(history,null,403);pass('real staff without CASH permission denied');
 await required(admin.from('pos_staff').update({retail_permissions:['CASH','REPRINT','SETTINGS','PRODUCTS_READ','SELL']}).eq('id',state.staff));
 await required(admin.from('pos_staff').update({location_id:state.otherLocation}).eq('id',state.staff));
 await required(admin.from('pos_staff_sessions').update({location_id:state.otherLocation}).eq('id',state.staffSession));
 await request(printing,{action:'cash-close-reprint',cashSessionId:cash,terminalId:terminal,requestKey:randomUUID()},403);
 await required(admin.from('pos_staff').update({location_id:state.location}).eq('id',state.staff));
 await required(admin.from('pos_staff_sessions').update({location_id:state.location}).eq('id',state.staffSession));pass('real cross-location reprint denied');
 await required(admin.from('user_profiles').update({status:'inactive'}).eq('user_id',state.host));
 await request(history,null,403);
 await required(admin.from('user_profiles').update({status:'active'}).eq('user_id',state.host));pass('disabled host account denied');
 if(!state.legacy){const legacy=await insert('pos_cash_sessions',{brand_id:state.brand,brand_slug:slug,location_id:state.location,register_id:state.register,status:'closed',opening_amount:50,expected_cash:321,counted_cash:300,difference:-21,opened_at:'2026-01-01T12:00:00Z',closed_at:'2026-01-01T20:00:00Z',opened_by:state.host,closed_by:state.host,closed_by_staff_id:state.staff});state.legacy=legacy.id;fs.writeFileSync(savedState,JSON.stringify(state),{mode:0o600});}
 const legacy=await request(printing,{action:'cash-close-reprint',cashSessionId:state.legacy,terminalId:terminal,requestKey:randomUUID()});
 const legacyHTML=JSON.stringify(legacy.jobs[0].payload.data);assert.ok(legacyHTML.includes('Desglose original no conservado'));assert.ok(legacyHTML.includes('$321.00'));assert.ok(legacyHTML.includes('-$21.00'));pass('legacy close prints saved balances and explicitly omits missing original breakdown');
 await qzFailureAndRetry(printing,cash);
 const after=await required(admin.from('pos_cash_sessions').select('*').eq('id',cash).single());assert.deepEqual(after,original);
 const count=await admin.from('pos_staff_audit_events').select('id',{count:'exact'}).eq('cash_session_id',cash).eq('action','CASH_SESSION_CLOSE');assert.equal(count.count,1);
 pass('database row byte-for-byte unchanged by print/reprint/failure and exactly one close audit event');
 fs.writeFileSync(path.join(__dirname,'release-check/integration-result.json'),JSON.stringify({synthetic:true,baseURL:url,app,tenant:slug,tests:evidence,closeId:cash},null,2)+'\n');
}
run().catch(error=>{console.error('FAIL',error.message);process.exitCode=1;});
