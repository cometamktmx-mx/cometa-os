import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';

// Invoked only by the disposable local PostgreSQL harness, never production.
export async function testProductDiscount({sql,q,items,call,ids,brand,quote}){
 const migration='supabase/migrations/20261019193000_pos_product_discount_override.sql';
 ids.session=randomUUID();
 await sql(`begin;set local session_replication_role=replica;
 insert into pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id) values('${ids.session}','${ids.brand}','${brand}','${ids.location}','${ids.register}');
 update pos_product_variants set price=case when product_id='${ids.productA}' then 15 else 100 end where brand_slug='${brand}';
 update pos_inventory set quantity=10000 where brand_slug='${brand}';
 update pos_retail_rules set pricing_mode='per_piece_discount',per_piece_discount=10,minimum_pieces=50,grouping='product',combine_variants=true,wholesale_enabled=true,open_box=true where brand_slug='${brand}';commit;`);
 const draft={location_id:ids.location,customer_id:ids.customer,contact:'SYNTHETIC BANDITAS',items:items([['v1',50]])};
 const oldNoteId=randomUUID(),oldBoxId=randomUUID();
 const oldNote=(await call(oldNoteId,'save',draft)).order;
 let oldBox=(await call(oldBoxId,'save',draft)).order;
 const policy=JSON.parse(await sql(`select to_jsonb(r) from pos_retail_rules r where brand_slug='${brand}'`));
 oldBox=(await call(oldBoxId,'activate',{revision:oldBox.revision,expected_quote:oldBox.quote,accepted_policy:policy,cash_session_id:ids.session,amount:500,tendered:500,method:'cash'})).order;
 assert.equal(oldNote.total,250);assert.equal(oldBox.total,250);
 const digest=async()=>sql(`select md5(string_agg(to_jsonb(t)::text,'' order by id)) from pos_sales t`);
 const history=await digest();
 const stored=await sql(`select md5(string_agg(to_jsonb(t)::text,'' order by id)) from pos_retail_orders t`);
 const otherBefore=await q(items([['v4',50]]));
 await sql(fs.readFileSync(migration,'utf8'));
 const configure=async(product,discount)=>JSON.parse(await sql(`set role service_role;select pos_retail_rules_save_v1('${brand}','${ids.owner}',${quote(JSON.stringify({action:'product-discount',product_id:product,discount}))}::jsonb)`));
 await configure(ids.productA,5);
 assert.equal(await sql(`select md5(string_agg(to_jsonb(t)::text,'' order by id)) from pos_retail_orders t`),stored,'migration/configuration never changes saved agreements');
 assert.deepEqual(await q(items([['v4',50]])),otherBefore,'unconfigured product is unchanged');
 for(const [quantity,total] of [[49,735],[50,500],[51,510]]){
  const result=await q(items([['v1',quantity]]));assert.equal(result.total,total);assert.equal(result.discount_total,quantity<50?0:quantity*5);assert.equal(result.items[0].unit_price,quantity<50?15:10);
  const id=randomUUID();let note=(await call(id,'save',{...draft,items:items([['v1',quantity]])})).order;assert.equal(note.total,total);
  const converted=await call(id,'convert',{revision:note.revision,expected_quote:note.quote,cash_session_id:ids.session,amount:total,tendered:total,method:'card'});
  assert.equal(converted.order.total,total);
  assert.equal(await sql(`select total from pos_sales where id='${converted.order.sale_id}'`),total.toFixed(2));
 }
 assert.equal((await q(items([['v1',20],['v2',15],['v3',15]]))).total,500,'sizes/colors combine by product ID');
 assert.equal((await q(items([['v1',49],['v4',1]]))).total,835,'other model cannot complete threshold');
 assert.equal((await q(items([['v1',50],['v4',50]]))).total,5000,'replacement 5 and business 10 once each');
 await assert.rejects(configure(ids.productA,-1));await assert.rejects(configure(ids.productA,5.001));await assert.rejects(configure(ids.productA,'5'));await assert.rejects(configure(randomUUID(),5));
 await configure(ids.productA,0);assert.equal((await q(items([['v1',50]]))).total,750,'explicit zero is not missing');
 await configure(ids.productA,null);assert.equal((await q(items([['v1',50]]))).total,250,'removal restores general rule');await configure(ids.productA,5);
 const directQuote=await q(items([['v1',50]])),directKey=randomUUID();
 const directSql=expected=>`set role service_role;select pos_complete_retail_sale_v1('${brand}','${ids.location}','${ids.register}','${ids.session}','${ids.customer}',${quote(JSON.stringify(draft.items))}::jsonb,'[{"method":"card","amount":500,"tendered_amount":500}]'::jsonb,'SYNTHETIC DIRECT','${ids.owner}',null,'${directKey}',null,null,'${ids.staff}',${quote(JSON.stringify(expected))}::jsonb)`;
 await assert.rejects(sql(directSql({...directQuote,total:250})),'stale direct checkout rejected');
 const direct=JSON.parse(await sql(directSql(directQuote)));assert.equal(direct.total,500);
 assert.equal(JSON.parse(await sql(directSql(directQuote))).id,direct.id,'direct sale retry returns original');
 const newQuote=await q(draft.items);
 const deniedSave=await call(oldNoteId,'save',{...draft,revision:oldNote.revision,expected_quote:newQuote});assert.equal(deniedSave.prices_changed,true);
 const deniedPay=await call(oldBoxId,'pay',{revision:oldBox.revision,expected_quote:newQuote,cash_session_id:ids.session,amount:1,method:'card'});assert.equal(deniedPay.prices_changed,true,'auto-preview is not consent');
 assert.equal(await sql(`select total from pos_retail_orders where id='${oldNoteId}'`),'250.00');assert.equal(await sql(`select total from pos_retail_orders where id='${oldBoxId}'`),'250.00');
 assert.equal(await sql(`select count(*) from pos_retail_order_payments where order_id='${oldBoxId}'`),'1');
 const confirmedNote=(await call(oldNoteId,'save',{...draft,revision:oldNote.revision,expected_quote:newQuote,confirmed_quote:newQuote})).order;assert.equal(confirmedNote.total,500);
 const expiry=oldBox.expires_at,snapshot=JSON.stringify(oldBox.policy_snapshot);
 for(const [quantity,total] of [[49,735],[50,500],[51,510]]){
  const changedItems=items([['v1',quantity]]),reviewed=await q(changedItems);
  oldBox=(await call(oldBoxId,'save',{...draft,items:changedItems,revision:oldBox.revision,expected_quote:reviewed,confirmed_quote:reviewed})).order;
  assert.equal(oldBox.total,total);assert.equal(oldBox.paid,500);assert.equal(oldBox.expires_at,expiry);assert.equal(JSON.stringify(oldBox.policy_snapshot),snapshot);
 }
 const stale=await q(items([['v1',51]]));await configure(ids.productA,4);
 const staleSave=await call(oldBoxId,'save',{...draft,items:items([['v1',51]]),revision:oldBox.revision,expected_quote:stale,confirmed_quote:stale});assert.equal(staleSave.prices_changed,true);assert.equal(await sql(`select total from pos_retail_orders where id='${oldBoxId}'`),'510.00');await configure(ids.productA,5);
 const finishKey=randomUUID(),finish={revision:oldBox.revision,expected_quote:oldBox.quote,cash_session_id:ids.session,amount:10,tendered:10,method:'card'};
 const completed=await Promise.all([call(oldBoxId,'settle',finish,finishKey),call(oldBoxId,'settle',finish,finishKey)]);assert.equal(completed[0].order.sale_id,completed[1].order.sale_id);
 assert.equal(await sql(`select total from pos_sales where id='${completed[0].order.sale_id}'`),'510.00');
 // Historical rows predating this scenario have identical bytes after all work.
 const newSales=await sql(`select string_agg(quote_literal(sale_id::text),',') from pos_retail_orders where contact='SYNTHETIC BANDITAS' and sale_id is not null`);
 assert.equal(await sql(`select md5(string_agg(to_jsonb(t)::text,'' order by id)) from pos_sales t where id::text not in (${newSales},'${direct.id}')`),history);
 await sql(`begin;set local session_replication_role=replica;update pos_business_profiles set profile_code='restaurant' where brand_slug='${brand}';commit;`);
 await assert.rejects(configure(ids.productA,7));
 console.log('PASS product override: 49=735,50=500,51=510 in quotes/notes/completed sales; model grouping/mixed cart; 5 replaces 10; zero/remove/validation; unchanged other model/history; saved note/box requires exact consent; stale quote rejected; editable boxes preserve deposits/policy/expiry; settlement retry once; FOOD denied');
}
