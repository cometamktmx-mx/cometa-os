# SYNTHETIC ONLY: fixed Docker container and dedicated database; never production.
import subprocess,json,uuid,time,concurrent.futures
from pathlib import Path
D=['docker','exec','-i','cometa-cash-close-test-db','psql','-X','-U','postgres','-d','cometa_cash_retail_v2','-At','-v','ON_ERROR_STOP=1']
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
 if action=='close':
  key=key or u()
  token=json.loads(run(f"select pos_retail_cash_count_start_v3({q(slug)},{q(host)},{q(ss)},{q(p['sessionId'])},{q(key)});").stdout)
  p={'reservedCash':0,**p,'countId':token['countId']}
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
try:
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
 def shift():
  reg=u();run(f"insert into pos_registers(id,brand_id,brand_slug,location_id,name,code) values({q(reg)},{q(b)},{q(slug)},{q(loc)},{q('SYNTHETIC '+reg[:8])},{q(reg[:8])});")
  r=json.loads(run(cmd('open',{'registerId':reg,'openingAmount':500})).stdout);return reg,r['id']
 reg,c=shift();_,late=races(cmd('close',{'sessionId':c,'countedCash':500}),cmd('movement',{'sessionId':c,'movementType':'income','amount':100,'reason':'SYNTHETIC late'}))
 check(late.returncode!=0 and 'POS_CASH_SESSION_NOT_FOUND' in late.stderr and run(f"select count(*) from pos_cash_movements where cash_session_id={q(c)};").stdout.strip()=='0','close wins concurrent movement: late movement rejected, zero cash entries')
 reg,c=shift();_,after=races(cmd('movement',{'sessionId':c,'movementType':'income','amount':100,'reason':'SYNTHETIC first'}),cmd('close',{'sessionId':c,'countedCash':600}))
 check(after.returncode!=0 and 'POS_CASH_CHANGED_RECOUNT_REQUIRED' in after.stderr,'movement wins concurrent close: stale count requires recount');check(json.loads(run(cmd('close',{'sessionId':c,'countedCash':600})).stdout)['difference']==0,'fresh count after movement closes correctly')
 reg,c=shift();_,late=races(cmd('close',{'sessionId':c,'countedCash':500}),sale(reg,c,u()))
 check(late.returncode!=0 and 'No existe una sesión de caja abierta.' in late.stderr and run(f"select count(*) from pos_sales where cash_session_id={q(c)};").stdout.strip()=='0','close wins concurrent sale: sale rejected atomically with zero payments/sale')
 reg,c=shift();key=u();_,closed=races(sale(reg,c,key),cmd('close',{'sessionId':c,'countedCash':600}))
 check(closed.returncode!=0 and 'POS_CASH_CHANGED_RECOUNT_REQUIRED' in closed.stderr,'sale wins concurrent close: stale count requires recount');check(json.loads(run(cmd('close',{'sessionId':c,'countedCash':600})).stdout)['difference']==0,'fresh count includes cash sale100 once')
 again=run(sale(reg,c,key));check(json.loads(again.stdout)['id']==run(f"select id from pos_sales where cash_session_id={q(c)};").stdout.strip(),'sale same-key retry after close returns original sale without duplicate cash')
 # No permanent schema changes; cleanup is limited to this exact synthetic brand.
 reg,c=shift();key=u();payload={'sessionId':c,'countedCash':500}
 with concurrent.futures.ThreadPoolExecutor() as pool:
  rs=list(pool.map(lambda _:json.loads(run(cmd('close',payload,key)).stdout),range(2)))
 check(rs[0]==rs[1] and run(f"select count(*) from pos_staff_audit_events where brand_slug={q(slug)} and action='CASH_SESSION_CLOSE' and cash_session_id={q(c)};").stdout.strip()=='1','two concurrent same-key closes return same result and one close audit')
 # Reserve consumption races use the real register and pending-reserve locks.
 reg,c=shift();run(cmd('close',{'sessionId':c,'countedCash':500,'reservedCash':500}))
 payload={'registerId':reg,'reserveSessionId':c,'receivedCash':450,'receiptReason':'Synthetic received450','additionalCash':50,'additionalReason':'Synthetic extra50'}
 with concurrent.futures.ThreadPoolExecutor() as pool:
  rs=list(pool.map(lambda _:run(cmd('open',payload),False),range(2)))
 check(sum(r.returncode==0 for r in rs)==1,'simultaneous different-key openings: exactly one consumes reserve')
 got=json.loads(next(r.stdout for r in rs if r.returncode==0))
 check(got['opening_amount']==500 and got['receipt_difference']==-50 and run(f"select target_session_id from pos_retail_cash_reserves where source_session_id={q(c)};").stdout.strip()==got['id'],'one linked receipt450 plus additional50, old reserve500 preserved')
 reg,c=shift();run(cmd('close',{'sessionId':c,'countedCash':500,'reservedCash':500}));key=u()
 payload={'registerId':reg,'reserveSessionId':c,'receivedCash':500,'additionalCash':0}
 with concurrent.futures.ThreadPoolExecutor() as pool:
  rs=list(pool.map(lambda _:json.loads(run(cmd('open',payload,key)).stdout),range(2)))
 check(rs[0]==rs[1] and rs[0]['opening_amount']==500,'simultaneous same-key receipts500 share one opening without duplication')
 # Actual order RPC: initial receipt, installment and settlement, not only seeded rows.
 reg,c=shift();customer=u();oid=u()
 run(f"insert into pos_customers(id,brand_id,brand_slug,first_name) values({q(customer)},{q(b)},{q(slug)},'SYNTHETIC');update pos_retail_rules set minimum_deposit=10,retained_deposit=10 where brand_slug={q(slug)};")
 def order(action,body,key=None,order_id=None):
  sql=f"select pos_retail_order_action_v1({q(slug)},{q(host)},{q(st)},{q(order_id or oid)},{q(action)},{q(key or u())},{q(json.dumps(body))}::jsonb);"
  return json.loads(run(sql).stdout)
 draft={'location_id':loc,'customer_id':customer,'contact':'SYNTHETIC','items':[{'variant_id':var,'quantity':1,'discount_amount':0}]}
 o=order('save',draft)['order'];policy=json.loads(run(f"select to_jsonb(r) from pos_retail_rules r where brand_slug={q(slug)};").stdout)
 body={'revision':o['revision'],'expected_quote':o['quote'],'accepted_policy':policy,'cash_session_id':c,'amount':50,'tendered':60,'method':'cash'};key=u()
 r=order('activate',body,key);o=r['order'];check(order('activate',body,key)['payment_id']==r['payment_id'],'actual order activation retry reuses one receipt')
 o=order('pay',{'revision':o['revision'],'expected_quote':o['quote'],'cash_session_id':c,'amount':25,'method':'card'})['order']
 body={'revision':o['revision'],'expected_quote':o['quote'],'cash_session_id':c,'amount':25,'tendered':30,'method':'cash'};key=u()
 r=order('settle',body,key);check(order('settle',body,key)['order']['sale_id']==r['order']['sale_id'],'actual settlement retry creates only one prepaid sale')
 total=json.loads(run(f"select pos_retail_cash_totals_v1({q(slug)},array[{q(c)}::uuid]);").stdout)[0]
 check(total['expected']==575 and total['order_cash']==75 and total['order_card']==25 and total['cash_sales']==0,'actual order RPC: cash50+25 once, card25 excluded, prepaid sale no extra receipt')
 # A fully prepaid order settles with zero collection and does not add a payment.
 oid=u();o=order('save',draft)['order'];o=order('activate',{'revision':o['revision'],'expected_quote':o['quote'],'accepted_policy':policy,'cash_session_id':c,'amount':50,'method':'cash'})['order']
 # Open-box mode permits paying the full remainder before explicit settlement.
 run(f"update pos_retail_orders set open_box=true where id={q(oid)};")
 o=order('pay',{'revision':o['revision'],'expected_quote':o['quote'],'cash_session_id':c,'amount':50,'method':'cash'})['order']
 before=run(f"select count(*) from pos_retail_order_payments where order_id={q(oid)};").stdout.strip()
 order('settle',{'revision':o['revision'],'expected_quote':o['quote'],'cash_session_id':c,'amount':0,'method':'cash'})
 check(run(f"select count(*) from pos_retail_order_payments where order_id={q(oid)};").stdout.strip()==before,'zero-balance settlement creates no additional receipt/deposit')
finally:
 run(f"""begin;set local session_replication_role=replica;
 do $$ declare t record;begin for t in select table_schema,table_name from information_schema.columns where table_schema='public' and column_name='brand_slug' and table_name not in(select table_name from information_schema.views where table_schema='public') loop execute format('delete from %I.%I where brand_slug=$1',t.table_schema,t.table_name) using {q(slug)};end loop;end $$;
 delete from brands where id={q(b)};delete from auth.users where id={q(host)};commit;""")
 check(run(f"select count(*) from brands where slug={q(slug)};").stdout.strip()=='0','synthetic concurrency fixture removed; existing isolated fixtures untouched')
 Path('/tmp/cometa-retail-cash-v2-concurrency-results.json').write_text(json.dumps({'tests':out,'scope':'Docker cometa-cash-close-test-db only'},indent=2))
