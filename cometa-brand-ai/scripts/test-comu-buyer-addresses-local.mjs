// Local PostgreSQL only. Uses a disposable schema; never applies a remote migration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import vm from 'node:vm';

const wire = readFileSync('scripts/test-comu-postgres-concurrency-v1.mjs', 'utf8');
const context = { net, crypto, Buffer, console, process: { env: {} }, PgWire: null };
vm.runInNewContext(wire.slice(wire.indexOf('const cfg ='), wire.indexOf('const sqlQuote =')) + '\nthis.PgWire = PgWire;', context);
const db = await new context.PgWire().connect();
const second = await new context.PgWire().connect();
async function query(connection, sql) {
  try { return await connection.query(sql); }
  catch (error) { while ((await connection.next()).type !== 'Z') { /* drain failed query */ } throw error; }
}
const q = sql => query(db, sql);
const schema = 'comu_address_test_' + crypto.randomUUID().replaceAll('-', '');
assert.match(schema, /^comu_address_test_[a-f0-9]{32}$/);
const userA = crypto.randomUUID(), userB = crypto.randomUUID(), buyerA = crypto.randomUUID(), buyerB = crypto.randomUUID();
const input = { label: 'Fixture', recipient_name: 'Fixture', phone: '5550000000', line1: 'Fixture', city: 'Fixture', state: 'Fixture', postal_code: '01000', country: 'MX' };
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const rpc = (action, id = null, fields = {}) => `select ${schema}.comu_mutate_address_v1(${quote(action)},${id ? quote(id) : 'null'},${quote(JSON.stringify({ ...input, ...fields }))}::jsonb) as result`;
const login = user => `set role authenticated; select set_config('request.jwt.claim.sub',${quote(user)},false)`;
const rows = () => q(`select id,is_default,label from ${schema}.comu_buyer_addresses order by created_at,id`);
const invariant = async count => { const result = await rows(); assert.equal(result.length, count); assert.equal(result.filter(row => row.is_default === 't').length, count ? 1 : 0); return result; };
let created = false;
try {
  const base = readFileSync('supabase/migrations/20260920110000_comu_buyers_cart.sql', 'utf8').split('create table if not exists public.comu_carts')[0];
  const migration = readFileSync('supabase/migrations/20260928180000_comu_buyer_experience_v1.sql', 'utf8');
  const addressSql = migration.slice(migration.indexOf('-- Reuses checkout\'s canonical address table.'));
  const localize = sql => sql.replaceAll('public.', schema + '.').replaceAll('search_path=public', 'search_path=' + schema);
  await q(`begin; create schema ${schema}; ${localize(base)}
    create function ${schema}.is_cometa_admin() returns boolean language sql as 'select false';
    alter table ${schema}.comu_buyers enable row level security;
    create policy owner on ${schema}.comu_buyers for select to authenticated using(user_id=auth.uid());
    alter table ${schema}.comu_buyer_addresses enable row level security;
    create policy comu_addresses_self on ${schema}.comu_buyer_addresses for all to authenticated using(true);
    grant usage on schema ${schema} to authenticated;
    grant select,insert,update,delete on all tables in schema ${schema} to authenticated;
    ${localize(addressSql)}
    insert into ${schema}.comu_buyers(id,user_id) values('${buyerA}','${userA}'),('${buyerB}','${userB}'); commit;`);
  created = true;
  await q(login(userA));
  const first = JSON.parse((await q(rpc('create')))[0].result).id;
  await invariant(1);
  const other = JSON.parse((await q(rpc('create')))[0].result).id;
  assert.equal((await invariant(2)).find(row => row.id === first).is_default, 't');
  await q(`select ${schema}.comu_set_default_address_v1('${other}')`);
  assert.equal((await invariant(2)).find(row => row.id === other).is_default, 't');
  await assert.rejects(() => q(rpc('edit', other, { is_default: false })), /COMU_ADDRESS_SELECT_REPLACEMENT/);
  await q(rpc('edit', other, { label: 'Edited' }));
  assert.equal((await rows()).find(row => row.id === other).label, 'Edited');
  await q(rpc('delete', first)); await invariant(1);
  const third = JSON.parse((await q(rpc('create', null, { is_default: true })))[0].result).id;
  assert.equal((await invariant(2)).find(row => row.id === third).is_default, 't');
  await q(rpc('delete', third)); await invariant(1);
  await q(login(userB)); assert.equal((await rows()).length, 0);
  for (const action of ['edit','default','delete']) await assert.rejects(() => q(rpc(action, other)), /COMU_ADDRESS_NOT_FOUND/);
  await assert.rejects(() => q(`update ${schema}.comu_buyer_addresses set is_default=false where id='${other}'`), /permission denied/);
  const bAddress = JSON.parse((await q(rpc('create')))[0].result).id;
  await q(login(userA));
  assert.equal((await q(`select id from ${schema}.comu_buyer_addresses where id='${bAddress}'`)).length, 0);
  const fourth = JSON.parse((await q(rpc('create')))[0].result).id;
  await query(second, login(userA));
  await q('begin'); await q(rpc('default', other));
  let completed = false;
  const concurrent = query(second, rpc('default', fourth)).then(() => { completed = true; });
  await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(completed, false, 'Second primary mutation waits for buyer lock');
  await q('commit'); await concurrent;
  assert.equal((await invariant(2)).find(row => row.id === fourth).is_default, 't');
  await q(rpc('delete', fourth)); await invariant(1);
  await q(rpc('delete', other)); await invariant(0);
  // Independent transactions concurrently create primaries, including first-address race.
  await Promise.all([q(rpc('create', null, { is_default: true })), query(second, rpc('create', null, { is_default: true }))]);
  const concurrentRows = await invariant(2);
  for (const row of concurrentRows) await q(rpc('delete', row.id));
  await invariant(0);
  await assert.rejects(() => q(`select ${schema}.comu_mutate_address_v1('create',null,null)`), /COMU_ADDRESS_INVALID/);
  await q(rpc('create'));
  await q('reset role');
  await assert.rejects(() => q(`insert into ${schema}.comu_buyer_addresses(buyer_id,label,recipient_name,phone,line1,city,state,postal_code,is_default)
    select buyer_id,label,recipient_name,phone,line1,city,state,postal_code,true from ${schema}.comu_buyer_addresses where buyer_id='${buyerA}' limit 1`), /comu_addresses_one_primary/);
  await assert.rejects(() => q(`update ${schema}.comu_buyer_addresses set is_default=false where buyer_id='${buyerA}'`), /COMU_ADDRESS_PRIMARY_REQUIRED/);
  console.log('PASS local PostgreSQL: CRUD, first-primary, create-primary, atomic selection, demotion rejection, deletion replacement, concurrent primary changes, authenticated A/B isolation and deferred invariant. No remote calls.');
} finally {
  await query(second, 'rollback; reset role');
  await q('rollback; reset role');
  if (created) await q(`drop schema ${schema} cascade`);
  await db.close(); await second.close();
}
