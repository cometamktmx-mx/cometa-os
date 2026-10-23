const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const ts = require('../../cometa-brand-ai/node_modules/typescript');
const root = path.resolve(__dirname, '../../cometa-brand-ai');
function load(relative, mocks = {}, globals = {}) {
  const filename = path.resolve(root, relative);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireMock = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')), mocks, globals);
    if (name.startsWith('@/lib/pos/')) return load('src/lib/pos/' + name.slice('@/lib/pos/'.length) + '.ts', mocks, globals);
    throw Error('Unmocked import blocked: ' + name);
  };
  vm.runInNewContext(code, { exports, require: requireMock, console, Date, Intl, Map, Set, Promise, JSON, Number, Object, Array, String, Error, URL, TextEncoder, crypto: webcrypto, ...globals }, { filename });
  return exports;
}
const { cashCloseReceiptHtml, transferVerificationTotals } = load('src/lib/pos/cash-close-receipt.ts');
const receipt = {
  version: 1, sessionId: '00000000-0000-4000-8000-000000000123', brand: 'TIENDA DEMO · DATOS SINTÉTICOS',
  location: 'Sucursal de prueba', register: 'Caja DEMO 01', operator: 'Operadora sintética', openingOperator: 'Operador de apertura',
  openedAt: '2026-10-23T13:00:00Z', closedAt: '2026-10-23T22:00:00Z', currency: 'MXN', timezone: 'America/Mexico_City',
  opening: 500, expected: 1630.25, counted: 1620.25, difference: -10,
  summary: { cash_sales: 1000.25, card_sales: 800, transfer_sales: 450, wallet_sales: 50, other_sales: 25, cash_income: 100, cash_deposits: 200, cash_expenses: 50, cash_withdrawals: 120, order_cash: 200, order_card: 75, order_transfer: 100 },
  transfers: { verified: 300, pending: 250 },
};
// The fixture is intentionally balanced using integer cents. These tests never
// invoke a financial RPC, a real sale, an external service or a physical printer.
test('synthetic cash reconciliation, verified and pending remain distinct', () => {
  const s = receipt.summary;
  assert.equal(Math.round(receipt.opening * 100) + Math.round(s.cash_sales * 100) + 10000 + 20000 - 5000 - 12000, Math.round(receipt.expected * 100));
  assert.equal(Math.round(receipt.counted * 100) - Math.round(receipt.expected * 100), -1000);
  const totals = transferVerificationTotals([{source:'sale',id:'p1',amount:300},{source:'sale',id:'p2',amount:150},{source:'order',id:'p3',amount:100}], [
    {source:'sale',payment_id:'p1',verified:true,created_at:'2026-10-23T21:00:00Z'},
    {source:'sale',payment_id:'p2',verified:true,created_at:'2026-10-23T23:00:00Z'},
  ], receipt.closedAt);
  assert.equal(totals.verified, 300); assert.equal(totals.pending, 250);
});
test('latest verification before close wins; source IDs cannot cross', () => {
  const v = transferVerificationTotals([{source:'sale',id:'same',amount:'0.10'},{source:'order',id:'same',amount:'0.20'}], [
    {source:'sale',payment_id:'same',verified:true,created_at:'2026-10-23T19:00:00Z'},
    {source:'sale',payment_id:'same',verified:false,created_at:'2026-10-23T20:00:00Z'},
    {source:'order',payment_id:'same',verified:true,created_at:'2026-10-23T20:00:00Z'},
  ], receipt.closedAt);
  assert.equal(v.verified, .2); assert.equal(v.pending, .1);
});
test('reprint preserves all original amounts and escapes user content', () => {
  const before = JSON.stringify(receipt);
  const original = cashCloseReceiptHtml(receipt, false), copy = cashCloseReceiptHtml(receipt, true);
  assert.equal(copy.replace(' · COPIA / REIMPRESIÓN', ''), original);
  assert.equal(JSON.stringify(receipt), before);
  for (const text of ['1,630.25', '1,620.25', '-$10.00', 'Transferencias pendientes', 'width:70mm', 'Abonos tarjeta', 'Folio:']) assert.ok(copy.includes(text), text);
  assert.ok(!copy.includes('P. unit.')); assert.ok(!copy.includes('Subtotal'));
  assert.ok(cashCloseReceiptHtml({...receipt,brand:'<script>alert(1)</script>'},false).includes('&lt;script&gt;'));
});
class ApiError extends Error { constructor(status, code, message) { super(message); this.status=status; this.code=code; } }
const server = { PosApiError: ApiError, assertDatabaseResult: error => {if(error) throw Error('database unavailable');} };
function query(data, error=null) {
  const q = {then(resolve,reject){return Promise.resolve({data,error}).then(resolve,reject);}};
  for(const name of ['select','eq','in','lte','order','limit','update']) q[name]=()=>q;
  q.single=q.maybeSingle=()=>Promise.resolve({data,error});
  return q;
}
function accessHarness({roleDenied=false,accountDenied=false,copyDenied=false,location='loc',deviceDenied=false,status='closed',owner='staff'}={}) {
  const session={id:'session',status,location_id:'loc',closed_by_staff_id:owner,closed_at:new Date().toISOString()};
  const c={brand:{slug:'demo'},user:{isAdmin:false},admin:{from:()=>query(session)}};
  const mocks={
    './server':server,
    './access':{requirePosOperationalAccess:async()=>c},
    './rbac':{requirePosPermission:()=>{if(accountDenied)throw new ApiError(403,'account','denied');}},
    './staff-server':{getPosMode:async()=>'RETAIL',requireStaffSession:async()=>{if(roleDenied)throw new ApiError(403,'staff','denied');return {staff:{id:'staff'},locationId:location};},requireRetailPermission:async()=>{if(copyDenied)throw new ApiError(403,'reprint','denied');}},
    './device-server':{assertDeviceResource:async()=>{if(deviceDenied)throw new ApiError(403,'device','denied');}},
  };
  return {c, api:load('src/lib/pos/cash-close-server.ts',mocks)};
}
test('printing enforces account, staff CASH, reprint and location/device permissions', async () => {
  for(const options of [{roleDenied:true},{accountDenied:true},{copyDenied:true},{location:'other'},{deviceDenied:true},{status:'open'}]) {
    const {c,api}=accessHarness(options);await assert.rejects(()=>api.requireCashPrintAccess(c,'session',true));
  }
  const {c,api}=accessHarness();assert.ok(await api.requireCashPrintAccess(c,'session',true));
  const wrong=accessHarness({owner:'other'});await assert.rejects(()=>wrong.api.requireCashPrintAccess(wrong.c,'session',false));
});
test('persisted snapshot bypasses every live total and is unchanged on reprint', async () => {
  let rpcCalls=0;
  const c={brand:{slug:'demo'},admin:{from:table=>query(table==='pos_cash_sessions'?{status:'closed',closed_at:receipt.closedAt,expected_cash:receipt.expected,counted_cash:receipt.counted,difference:receipt.difference}:{id:'event',metadata:{cashCloseReceipt:receipt}}),rpc:()=>{rpcCalls++;throw Error('Forbidden recalculation');}}};
  const api=load('src/lib/pos/cash-close-server.ts',{'./server':server,'./staff-server':{},'./access':{},'./rbac':{},'./device-server':{}});
  assert.equal(JSON.stringify(await api.savedCashCloseReceipt(c,'session',true)),JSON.stringify(receipt)); assert.equal(rpcCalls,0);
});
test('QZ failure then retry only issues print jobs; same concurrent request is coalesced', async () => {
  const requests=[];let attempts=0;let connected=false;let signature;let sha;let api;
  const qz={websocket:{isActive:()=>connected,connect:async()=>{connected=true;},disconnect:async()=>{connected=false;}},security:{setCertificatePromise(){},setSignatureAlgorithm(){},setSignaturePromise(fn){signature=fn;}},api:{setSha256Type(fn){sha=fn;}},configs:{create:()=>({})},print:async()=>{attempts++;await sha('synthetic QZ message');await new Promise((resolve,reject)=>signature('digest')(resolve,reject));if(attempts===1)throw Error('Synthetic disconnected printer');}};
  const storage=new Map();
  const globals={localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},sessionStorage:{getItem:()=>null},fetch:async(url,options)=>{
    assert.ok(url.startsWith('/api/pos/terminal-print?'));const body=options?.body?JSON.parse(options.body):null;requests.push(body);
    const result=!body?{ready:true,certificate:'SYNTHETIC'}:body.action==='sign'?{signature:'SYNTHETIC'}:body.action==='result'?{recorded:true}:{jobs:[{id:'job-'+requests.length,kind:'receipt',payload:{printer:'SYNTHETIC',width:80,data:[]}}]};
    return {ok:true,json:async()=>result};
  }};
  api=load('src/lib/pos/thermal-client.ts',{'qz-tray':{default:qz}},globals);
  const body={action:'cash-close',cashSessionId:'synthetic',requestKey:'one'};
  const first=api.printOperation('demo',body);assert.equal(first,api.printOperation('demo',body));
  await assert.rejects(first);assert.match(await api.printOperation('demo',{...body,requestKey:'two'}),/Ticket enviado/);
  assert.equal(attempts,2);assert.equal(requests.filter(r=>r?.action==='cash-close').length,2);
  assert.ok(requests.some(r=>r?.status==='failed')); assert.ok(requests.some(r=>r?.status==='spooled'));
});
const previewDir=__dirname;
fs.writeFileSync(path.join(previewDir,'ticket-original.html'),cashCloseReceiptHtml(receipt,false));
fs.writeFileSync(path.join(previewDir,'ticket-reimpresion.html'),cashCloseReceiptHtml(receipt,true));
fs.writeFileSync(path.join(previewDir,'fixture.json'),JSON.stringify(receipt,null,2)+'\n');

test('receipt failure after commit returns a successful saved close, never runs the monetary command twice', async () => {
  let closes=0;
  const c={brand:{slug:'demo'},user:{isAdmin:true,userId:'host'},admin:{rpc:async()=>{closes++;return {data:{id:'session',status:'closed'},error:null};}}};
  const route=load('src/app/api/pos/cash-sessions/route.ts',{
    '@/lib/pos/cash-close-server':{savedCashCloseReceipt:async()=>{throw Error('Synthetic receipt storage outage');}},
    '@/lib/pos/device-server':{assertDeviceResource:async()=>{}},
    '@/lib/pos/mutation-access':{requirePosMutationAccess:async()=>c},
    '@/lib/pos/access':{},'@/lib/pos/rbac':{},
    '@/lib/pos/staff-server':{getPosMode:async()=>'RETAIL',requireStaffSession:async()=>({id:'operator-session'})},
    '@/lib/pos/server':{...server,requiredText:v=>v,uuidValue:v=>v,numberValue:v=>v,optionalText:v=>v,readJsonBody:async()=>({brandSlug:'demo',action:'close',sessionId:'session',countedCash:100,requestKey:'same-key'}),ok:body=>({status:200,body}),handlePosError:e=>{throw e;}},
  });
  const response=await route.POST({});
  assert.equal(response.status,200);assert.equal(response.body.session.status,'closed');assert.ok(response.body.receiptWarning);assert.equal(closes,1);
});
test('new close freezes a full snapshot once using compare-and-set; repeated reads never recalculate', async () => {
  let metadata={payload:{countedCash:receipt.counted},result:{id:receipt.sessionId}};let updates=0;let rpcCalls=0;
  const row={id:receipt.sessionId,status:'closed',closed_at:receipt.closedAt,opened_at:receipt.openedAt,opening_amount:receipt.opening,expected_cash:receipt.expected,counted_cash:receipt.counted,difference:receipt.difference,opening_staff_id:'opener',closed_by_staff_id:'closer',register:{name:'Synthetic register'},location:{name:'Synthetic location',currency:'MXN',timezone:'America/Mexico_City'}};
  const c={brand:{slug:'demo',name:'Synthetic brand'},admin:{
    from:table=>{
      const data=table==='pos_cash_sessions'?row:table==='pos_staff_audit_events'?{id:'event',metadata}:table==='pos_staff'?[{id:'closer',name:'Synthetic closer'}]:table==='pos_branding'?{display_name:'Synthetic store'}:[];
      const q=query(data);
      q.update=values=>{assert.equal(table,'pos_staff_audit_events');metadata=values.metadata;updates++;return query({id:'event'});};return q;
    },
    rpc:async(name)=>{rpcCalls++;return {data:name==='pos_retail_cash_totals_v1'?[{expected:receipt.expected,...receipt.summary}]:[receipt.summary],error:null};},
  }};
  const api=load('src/lib/pos/cash-close-server.ts',{'./server':server,'./staff-server':{getPosMode:async()=>'RETAIL'},'./access':{},'./rbac':{},'./device-server':{}});
  const frozen=await api.savedCashCloseReceipt(c,receipt.sessionId,true);assert.ok(frozen.summary);assert.equal(updates,1);assert.equal(rpcCalls,2);
  assert.equal(metadata.payload.countedCash,receipt.counted);assert.equal(metadata.result.id,receipt.sessionId);
  row.counted_cash=999; // Even later mutable input cannot replace the snapshot.
  assert.equal((await api.savedCashCloseReceipt(c,receipt.sessionId,true)).counted,receipt.counted);assert.equal(updates,1);assert.equal(rpcCalls,2);
});
test('historical close without snapshot prints persisted balances and explicitly omits an unavailable breakdown', async () => {
  let rpcCalls=0;
  const c={brand:{slug:'demo',name:'Synthetic'},admin:{from:table=>query(table==='pos_cash_sessions'?{status:'closed',closed_at:receipt.closedAt,opened_at:receipt.openedAt,expected_cash:100,counted_cash:90,difference:-10,opening_amount:0,location:{currency:'MXN',timezone:'America/Mexico_City'}}:table==='pos_staff_audit_events'?null:table==='pos_staff'?[]:null),rpc:()=>{rpcCalls++;throw Error('No historical recalculation');}}};
  const api=load('src/lib/pos/cash-close-server.ts',{'./server':server,'./staff-server':{},'./access':{},'./rbac':{},'./device-server':{}});
  const saved=await api.savedCashCloseReceipt(c,receipt.sessionId);assert.equal(saved.summary,null);assert.equal(saved.expected,100);assert.equal(rpcCalls,0);
  assert.ok(cashCloseReceiptHtml(saved,true).includes('Desglose original no conservado'));
});

test('existing sale receipt output remains identical and cash tickets use the same Epson transport without drawer commands', () => {
  const source=require('node:child_process').execFileSync('git',['show','b4039f0ee2a7a1612e0574b06ad689c6839bdfee:cometa-brand-ai/src/lib/pos/thermal.ts'],{cwd:root,encoding:'utf8'});
  const baseline={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:baseline,Intl,Map,JSON,Date});
  const thermal=load('src/lib/pos/thermal.ts');
  const sale={sale_number:'SYNTHETIC',sold_at:receipt.closedAt,subtotal:100,discount_total:10,tax_total:0,total:90,currency:'MXN',items:[{product_name:'Synthetic product',variant_name:'Test',sku:'TEST',quantity:1,unit_price:100,line_total:90}],payments:[{payment_method:'cash',amount:90,tendered_amount:100,change_amount:10}]};
  for(const width of [58,80])for(const options of [{},{copy:true,showSku:true,paymentHistory:true}]) assert.equal(thermal.thermalReceipt(sale,'Demo','Operator',width,options),baseline.thermalReceipt(sale,'Demo','Operator',width,options));
  const data=thermal.qzReceiptData(cashCloseReceiptHtml(receipt,true),{width:80,receiptMode:'epson-tm-t20ii'});
  assert.equal(data[1].options.pageWidth,560);assert.equal(data[0].data,'1B40');assert.equal(data[2].data,'1D564200');assert.ok(!JSON.stringify(data).includes('1B70'));
  assert.ok(!cashCloseReceiptHtml(receipt,true).includes('TOTAL MXN'));
});
test('QZ signing authorizes a cash job once and rechecks cash permissions on every request', async () => {
  const thermal=load('src/lib/pos/thermal.ts');let claimed=false;let authorized=true;let signatures=0;
  const payload={printer:'SYNTHETIC',width:80,receiptMode:'driver',data:[],cashClose:true,cashCloseCopy:true};
  const job={id:'job',kind:'reprint',cash_session_id:'session',status:'requested',payload,created_at:new Date().toISOString()};
  const c={brand:{slug:'demo'},user:{userId:'host'},admin:{from:table=>{
    if(table==='pos_terminal_print_settings')return query({config:{printer:'SYNTHETIC',width:80,profile:'driver',autoPrint:false,autoDrawer:false}});
    const q=query({...job});q.update=()=>{const update=query(claimed?null:{id:'job'});claimed=true;return update;};return q;
  }}};
  const route=load('src/app/api/pos/terminal-print/route.ts',{
    'node:crypto':require('node:crypto'),
    '@/lib/pos/server':{...server,getBrandSlugFromUrl:()=> 'demo',requirePosContext:async()=>c,readJsonBody:async r=>r.bodyValue,uuidValue:v=>v,ok:body=>({status:200,body}),handlePosError:e=>({status:e.status||500,body:{code:e.code}})},
    '@/lib/pos/access':{requirePosCommercialAccess:async()=>{}},
    '@/lib/pos/staff-server':{getStaffSession:async()=>({staff:{id:'staff'}}),requireRetailPermission:async()=>{throw Error('Cash jobs must not require selling');}},
    '@/lib/pos/cash-close-server':{requireCashPrintAccess:async()=>{if(!authorized)throw new ApiError(403,'POS_STAFF_PERMISSION_REQUIRED','denied');}},
    '@/lib/pos/retail-orders':{},
    '@/lib/pos/qz-signing':{qzSigningMaterial:()=>({health:{ready:true}}),signQzDigest:()=>{signatures++;return 'SYNTHETIC';}},
  },{process:{env:{}}});
  const message=JSON.stringify({call:'print',params:{printer:{name:'SYNTHETIC'},data:[],options:thermal.qzPrintOptions(80,'driver')},timestamp:Date.now()});
  const bodyValue={action:'sign',jobId:'job',terminalId:'terminal',message,digest:require('node:crypto').createHash('sha256').update(message).digest('hex')};
  const request={url:'https://synthetic.invalid/api/pos/terminal-print',headers:{get:()=> 'https://synthetic.invalid'},bodyValue};
  assert.equal((await route.POST(request)).status,200);assert.equal((await route.POST(request)).status,409);assert.equal(signatures,1);
  authorized=false;assert.equal((await route.POST(request)).status,403);
});
