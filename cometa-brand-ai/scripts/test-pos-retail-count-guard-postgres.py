# SYNTHETIC ONLY: fixed Docker container and dedicated database; never production.
import subprocess,json,uuid,time,concurrent.futures,sys
from pathlib import Path
D=['docker','exec','-i','cometa-cash-close-test-db','psql','-X','-U','postgres','-d','cometa_cash_count_guard_v3','-At','-v','ON_ERROR_STOP=1']
def run(s,check=True):
 r=subprocess.run(D,input=s,text=True,capture_output=True,timeout=25)
 if check and r.returncode: raise RuntimeError(r.stderr)
 return r
q=lambda x:"'"+str(x).replace("'","''")+"'"
u=lambda:str(uuid.uuid4())
b,host,loc,st,ss,prod,var=[u() for _ in range(7)]
slug='synthetic-cash-race-'+b[:8]; out=[]
def cmd(action,p,key=None):
 if action=='open' and 'additionalCash' not in p:
  p={'registerId':p['registerId'],'additionalCash':p.get('openingAmount',0),'additionalReason':'Synthetic physical contribution','reserveSessionId':None,'receivedCash':None}
 if action=='movement' and p.get('movementType') in ('income','deposit'):p={'physicalContributionConfirmed':True,**p}
 if action=='close':p={'reservedCash':0,**p}
 return f"select pos_retail_cash_command_v1({q(slug)},{q(host)},{q(ss)},{q(action)},{q(json.dumps(p))}::jsonb,{q(key or u())});"
def sale(reg,cash,key):return f"select pos_complete_retail_sale_v1({q(slug)},{q(loc)},{q(reg)},{q(cash)},null,{q(json.dumps([{'variant_id':var,'quantity':1,'discount_amount':0}]))}::jsonb,{q(json.dumps([{'method':'cash','amount':100,'tendered':150}]))}::jsonb,'SYNTHETIC',{q(host)},null,{q(key)},null,null,{q(st)},null);"
def check(ok,label):
 if not ok:raise AssertionError(label)
 out.append(label);print('PASS '+label,flush=True)
def races(first,second):
 marker='cash_audit_'+u().replace('-','')
 with concurrent.futures.ThreadPoolExecutor() as pool:
  a=pool.submit(run,f"set application_name={q(marker)}; begin; {first} select pg_sleep(1.5); commit;")
  for _ in range(60):
   status=run(f"select count(*) from pg_stat_activity where application_name={q(marker)} and wait_event='PgSleep';").stdout.strip()
   if status=='1':break
   if a.done():a.result();raise RuntimeError('first transaction finished too early')
   time.sleep(.025)
  else:raise RuntimeError('lock synchronization failed')
  z=pool.submit(run,second,False)
  r1=a.result();r2=z.result()
  return r1,r2

def raw(action,p,key=None):return f"select pos_retail_cash_command_v1({q(slug)},{q(host)},{q(ss)},{q(action)},{q(json.dumps(p))}::jsonb,{q(key or u())});"
def start(c,key=None):return json.loads(run(f"select pos_retail_cash_count_start_v3({q(slug)},{q(host)},{q(ss)},{q(c)},{q(key or u())});").stdout)
def close(c,count,amount,key=None,reserve=0):return raw('close',{'sessionId':c,'countId':count['countId'],'countedCash':amount,'reservedCash':reserve},key)
def shift():
 reg=u();run(f"insert into pos_registers(id,brand_id,brand_slug,location_id,name,code) values({q(reg)},{q(b)},{q(slug)},{q(loc)},{q('SYNTHETIC '+reg[:8])},{q(reg[:8])});")
 r=json.loads(run(cmd('open',{'registerId':reg,'openingAmount':500})).stdout);return reg,r['id']
def reject(statement,code,label):
 r=run(statement,False);check(r.returncode!=0 and code in r.stderr,label)
def expected(c):return json.loads(run(f"select pos_retail_cash_totals_v1({q(slug)},array[{q(c)}::uuid]);").stdout)[0]['expected']
def historical():return json.loads(run("select coalesce(json_agg(row_to_json(x) order by id),'[]') from (select c.id,c.opening_amount,c.expected_cash,c.counted_cash,c.difference,c.opened_at,c.closed_at,(select metadata->'cashCloseReceipt' from pos_staff_audit_events a where a.cash_session_id=c.id and a.action='CASH_SESSION_CLOSE' order by a.created_at limit 1) receipt from pos_cash_sessions c where c.status='closed') x;").stdout)
context_file=Path('/tmp/cometa-cash-count-migration-fixture.json')
if '--prepare-legacy-open' in sys.argv:
 if run("select to_regclass('public.pos_retail_cash_documents') is null;").stdout.strip()!='t':raise SystemExit('Preparation requires a fresh synthetic copy BEFORE BOTH migrations; nothing was changed.')
 run(f"""begin;
 insert into auth.users(id,email) values({q(host)},{q(slug+'@example.test')});
 insert into brands(id,slug,name) values({q(b)},{q(slug)},'SYNTHETIC CASH RACE');
 insert into pos_business_profiles(brand_id,brand_slug,profile_code) values({q(b)},{q(slug)},'retail');
 insert into pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values({q(loc)},{q(b)},{q(slug)},'SYNTHETIC','AUDIT','MXN',true);
 insert into pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash,retail_permissions) values({q(st)},{q(b)},{q(slug)},{q(loc)},'SYNTHETIC','ADMIN','synthetic-not-a-pin',array['CASH','SETTINGS','SELL']);
 insert into pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,expires_at,last_human_at) values({q(ss)},repeat('b',64),{q(host)},{q(st)},{q(b)},{q(slug)},clock_timestamp()+interval '1 hour',clock_timestamp());
 insert into pos_products(id,brand_id,brand_slug,name) values({q(prod)},{q(b)},{q(slug)},'SYNTHETIC');
 insert into pos_product_variants(id,brand_id,brand_slug,product_id,name,price,variant_signature) values({q(var)},{q(b)},{q(slug)},{q(prod)},'SYNTHETIC',100,'synthetic');
 insert into pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity) values({q(b)},{q(slug)},{q(loc)},{q(var)},100);
 insert into pos_retail_rules(brand_slug,wholesale_enabled,orders_enabled) values({q(slug)},false,true);
 commit;""")

 reg=u();run(f"insert into pos_registers(id,brand_id,brand_slug,location_id,name,code) values({q(reg)},{q(b)},{q(slug)},{q(loc)},'SYNTHETIC LEGACY OPEN','LEGACY');")
 c=json.loads(run(raw('open',{'registerId':reg,'openingAmount':500})).stdout)['id'];run(sale(reg,c,u()))
 financial=json.loads(run(f"select json_build_object('id',id,'opening',opening_amount,'status',status,'opened_at',opened_at,'expected',expected_cash,'counted',counted_cash,'difference',difference) from pos_cash_sessions where id={q(c)};").stdout)
 context_file.write_text(json.dumps({'b':b,'host':host,'loc':loc,'st':st,'ss':ss,'prod':prod,'var':var,'slug':slug,'reg':reg,'cash':c,'financial':financial,'historical':historical()},indent=2));context_file.chmod(0o600)
 print('PASS legacy turn OPEN with opening500 and cash sale100 prepared BEFORE both migrations',flush=True)
 sys.exit(0)
ctx=json.loads(context_file.read_text());b,host,loc,st,ss,prod,var,slug=[ctx[k] for k in ['b','host','loc','st','ss','prod','var','slug']]
try:
 run(f"update pos_staff_sessions set last_human_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour' where id={q(ss)};")
 check(historical()==ctx['historical'],'both migrations preserve every pre-existing synthetic historical financial row and original receipt')
 c=ctx['cash'];financial=json.loads(run(f"select json_build_object('id',id,'opening',opening_amount,'status',status,'opened_at',opened_at,'expected',expected_cash,'counted',counted_cash,'difference',difference) from pos_cash_sessions where id={q(c)};").stdout)
 check(financial==ctx['financial'],'pre-existing OPEN turn remains open and its opening/timestamps/balances are unchanged by migrations')
 count=start(c);check(set(count)=={'countId','cashSessionId','startedAt'},'count-start response contains only opaque token, session and time; no expected/revision/amounts')
 closed=json.loads(run(close(c,count,600,reserve=500)).stdout)
 check(closed['expected_cash']==600 and closed['difference']==0 and closed['reserved_cash']==500 and closed['declared_delivery']==100,'legacy turn closes through new flow after both migrations: counted600 reserve500 delivery100')
 doc=json.loads(run(f"select document from pos_retail_cash_documents where session_id={q(c)};").stdout)
 check(doc['fundReceipt']['receivedCash'] is None and doc['fundReceipt']['additionalCash'] is None,'legacy opening components remain unknown in the new saved snapshot, without assumptions')
 # Reproduce and reject the same stale500/charge100 accepted by508cbc5.
 reg,c=shift();k=u();count=start(c,k);run(sale(reg,c,u()));ck=u()
 reject(close(c,count,500,ck),'POS_CASH_CHANGED_RECOUNT_REQUIRED','cash sale between start and confirm rejects stale count instead of recording false shortage100')
 reject(close(c,count,500,ck),'POS_CASH_CHANGED_RECOUNT_REQUIRED','retry of stale close still rejects; never silently refreshes the token')
 check(start(c,k)==count,'start-count retry after money changed returns ORIGINAL token, not a fresh baseline')
 check(run(f"select status='open' and counted_cash is null and reserved_cash is null from pos_cash_sessions where id={q(c)};").stdout.strip()=='t' and run(f"select count(*) from pos_retail_cash_documents where session_id={q(c)};").stdout.strip()=='0','stale rejection leaves session open, no allocation/document/close')
 fresh=start(c);key=u();r=json.loads(run(close(c,fresh,600,key,reserve=500)).stdout)
 check(r['difference']==0 and r['declared_delivery']==100,'explicit recount after charge closes with current cash600')
 check(json.loads(run(close(c,fresh,600,key,reserve=500)).stdout)==r,'committed close retry returns identical result after token consumption')
 reject(close(c,fresh,600,u()),'POS_CASH_SESSION_NOT_FOUND','new-key second close cannot consume the same count twice')
 # Each cash movement and a net-zero pair must invalidate the count.
 for kind,delta in [('income',100),('deposit',100),('expense',-100),('withdrawal',-100)]:
  reg,c=shift();count=start(c);mk=u();payload={'sessionId':c,'movementType':kind,'amount':100,'reason':'SYNTHETIC during count'}
  run(cmd('movement',payload,mk));reject(close(c,count,500),'POS_CASH_CHANGED_RECOUNT_REQUIRED',kind+' during count requires recount')
  fresh=start(c);run(cmd('movement',payload,mk))
  check(json.loads(run(close(c,fresh,500+delta)).stdout)['difference']==0,kind+' retry changes no cash/revision and fresh count closes once')
 reg,c=shift();count=start(c)
 for kind in ['income','expense']:run(cmd('movement',{'sessionId':c,'movementType':kind,'amount':100,'reason':'SYNTHETIC net zero'}))
 check(expected(c)==500,'net-zero pair returns expected to500')
 reject(close(c,count,500),'POS_CASH_CHANGED_RECOUNT_REQUIRED','net-zero money changes still invalidate the count (no amount-based shortcut)')
 # Actual order activation and installment commands, including retries.
 def order(oid,action,body,key=None):return json.loads(run(f"select pos_retail_order_action_v1({q(slug)},{q(host)},{q(st)},{q(oid)},{q(action)},{q(key or u())},{q(json.dumps(body))}::jsonb);").stdout)
 customer=u();run(f"insert into pos_customers(id,brand_id,brand_slug,first_name) values({q(customer)},{q(b)},{q(slug)},'SYNTHETIC');update pos_retail_rules set minimum_deposit=10,retained_deposit=10 where brand_slug={q(slug)};")
 policy=json.loads(run(f"select to_jsonb(r) from pos_retail_rules r where brand_slug={q(slug)};").stdout)
 for phase in ['activate','pay']:
  reg,c=shift();oid=u();o=order(oid,'save',{'location_id':loc,'customer_id':customer,'contact':'SYNTHETIC','items':[{'variant_id':var,'quantity':1,'discount_amount':0}]})['order']
  activate={'revision':o['revision'],'expected_quote':o['quote'],'accepted_policy':policy,'cash_session_id':c,'amount':50,'method':'cash'}
  if phase=='pay':o=order(oid,'activate',activate)['order']
  count=start(c);key=u();body=activate if phase=='activate' else {'revision':o['revision'],'expected_quote':o['quote'],'cash_session_id':c,'amount':25,'method':'cash'}
  paid=order(oid,phase,body,key)
  reject(close(c,count,500 if phase=='activate' else 550),'POS_CASH_CHANGED_RECOUNT_REQUIRED',phase+' cash order payment during count requires recount')
  fresh=start(c);check(order(oid,phase,body,key)['payment_id']==paid['payment_id'],phase+' payment retry reuses original receipt')
  amount=550 if phase=='activate' else 575
  check(json.loads(run(close(c,fresh,amount)).stdout)['difference']==0,phase+' payment retry after fresh count does not invalidate or double-count linked deposit')
 # Real transaction waits: sale commits while close is blocked on its row.
 reg,c=shift();count=start(c);_,late=races(sale(reg,c,u()),close(c,count,500))
 check(late.returncode!=0 and 'POS_CASH_CHANGED_RECOUNT_REQUIRED' in late.stderr,'sale wins simultaneous close: revision checked AFTER waiting, stale close rejected atomically')
 fresh=start(c);check(json.loads(run(close(c,fresh,600)).stdout)['difference']==0,'recount after blocked close sees committed sale once')
 reg,c=shift();_,started=races(sale(reg,c,u()),f"select pos_retail_cash_count_start_v3({q(slug)},{q(host)},{q(ss)},{q(c)},{q(u())});")
 count=json.loads(started.stdout);check(json.loads(run(close(c,count,600)).stdout)['difference']==0,'count-start waits for in-flight sale and captures the completed baseline')
 reg,c=shift();count=start(c);_,late=races(close(c,count,500),cmd('movement',{'sessionId':c,'movementType':'income','amount':100,'reason':'SYNTHETIC late'}))
 check(late.returncode!=0 and 'POS_CASH_SESSION_NOT_FOUND' in late.stderr,'close wins: subsequent movement rejected, no post-close cash')
 reg,c=shift();count=start(c);key=u()
 with concurrent.futures.ThreadPoolExecutor() as pool:rs=list(pool.map(lambda _:json.loads(run(close(c,count,500,key)).stdout),range(2)))
 check(rs[0]==rs[1] and run(f"select count(*) from pos_staff_audit_events where cash_session_id={q(c)} and action='CASH_SESSION_CLOSE';").stdout.strip()=='1','simultaneous same-key closes return one saved closure with one audit')
 # Token belongs to this PIN session, not just the host account.
 reg,c=shift();count=start(c);newss=u();run(f"insert into pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,location_id,expires_at,last_human_at) values({q(newss)},repeat('c',64),{q(host)},{q(st)},{q(b)},{q(slug)},{q(loc)},clock_timestamp()+interval '1 hour',clock_timestamp());")
 originalss=ss;ss=newss;reject(close(c,count,500),'POS_CASH_COUNT_REQUIRED','another PIN session cannot reuse an uncommitted count token');fresh=start(c);check(json.loads(run(close(c,fresh,500)).stdout)['difference']==0,'fresh count in new PIN session closes correctly');ss=originalss
 check(run("select not has_function_privilege('authenticated','pos_retail_cash_count_start_v3(text,uuid,uuid,uuid,uuid)','execute') and not has_function_privilege('service_role','pos_retail_cash_allocation_v2(text,uuid,uuid,text,jsonb,uuid,text)','execute') and not has_table_privilege('authenticated','pos_retail_cash_counts','select');").stdout.strip()=='t','host/direct RPC cannot read revisions or bypass the new count guard')
finally:
 run(f"""begin;set local session_replication_role=replica;
 do $$ declare t record;begin for t in select table_schema,table_name from information_schema.columns where table_schema='public' and column_name='brand_slug' and table_name not in(select table_name from information_schema.views where table_schema='public') loop execute format('delete from %I.%I where brand_slug=$1',t.table_schema,t.table_name) using {q(slug)};end loop;end $$;
 delete from brands where id={q(b)};delete from auth.users where id={q(host)};commit;""")
 check(run(f"select count(*) from brands where slug={q(slug)};").stdout.strip()=='0','own synthetic fixture removed, other isolated data preserved')
 Path('/tmp/cometa-retail-cash-count-v3-results.json').write_text(json.dumps({'tests':out,'database':'cometa_cash_count_guard_v3'},indent=2))
