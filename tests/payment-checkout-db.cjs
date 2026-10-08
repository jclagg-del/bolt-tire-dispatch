// Isolated PostgreSQL execution; no credentials, network or production records.
// PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite node tests/payment-checkout-db.cjs
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs'), path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
 const db = new PGlite();
 try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table public.quotes(id uuid primary key, payment_status text default 'unpaid', converted_job_id uuid,
      stripe_checkout_session_id text, expires_at date, selected_option_id uuid, updated_at timestamptz,
      quantity integer default 4, installation_cost numeric default 100, status text default 'draft', notes text);
    create table public.quote_options(id uuid primary key, quote_id uuid references public.quotes(id), price_per_tire numeric);
    grant usage on schema public,auth to service_role,authenticated,anon;
    grant select,update on public.quotes,public.quote_options to service_role;
  `);
  await db.exec(fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20261007232206_payment_method_checkout.sql'),'utf8'));
  console.log('PASS migration executes in isolated PostgreSQL');
  const quoteId=randomUUID(), optionId=randomUUID();
  await db.query('insert into public.quotes(id,payment_pricing_version) values($1,1)',[quoteId]);
  await db.query('insert into public.quote_options(id,quote_id,price_per_tire) values($1,$2,100)',[optionId,quoteId]);
  async function reserve(overrides={}){
    const id=randomUUID();
    const attempt={id,confirmation_token:`ctoken_${id.replaceAll('-','')}`,funding:'debit',payment_method_type:'card',snapshot:{pricing:'discounted'},amount_cents:50000,tax_cents:0,expires_at:new Date(Date.now()+600000).toISOString(),source_quote:{quantity:4,installation_cost:100},source_option:{id:optionId,quote_id:quoteId,price_per_tire:100},...overrides};
    return (await db.query('select * from public.reserve_quote_payment($1,$2,$3)',[quoteId,optionId,attempt])).rows[0];
  }
  const state=async()=> (await db.query('select payment_status from public.quotes where id=$1',[quoteId])).rows[0].payment_status;
  await assert.rejects(reserve({source_quote:{quantity:1}}),/Quote changed/);
  let a=await reserve(); assert.equal(await state(),'pending');
  await assert.rejects(reserve(),/already being reviewed/);
  await assert.rejects(db.query('update public.quotes set quantity=2 where id=$1',[quoteId]),/cannot change/);
  await db.query('update public.quotes set notes=$2 where id=$1',[quoteId,'Staff may still add an internal note']);
  await assert.rejects(db.query('update public.quote_options set price_per_tire=1 where id=$1',[optionId]),/cannot change/);
  await db.query('select * from public.cancel_quote_payment_review($1,$2)',[quoteId,a.id]);assert.equal(await state(),'unpaid');
  console.log('PASS changed quotes, duplicate reviews, price edits and cancel-review state');
  a=await reserve();
  const submitted=(await db.query('select * from public.submit_quote_payment($1,$2)',[quoteId,a.id])).rows[0];assert.equal(submitted.state,'submitting');assert.ok(submitted.submitted_at);
  await assert.rejects(db.query('select * from public.cancel_quote_payment_review($1,$2)',[quoteId,a.id]),/already been submitted/);
  await db.query('select * from public.sync_quote_payment($1,$2,$3,$4,$5)',[quoteId,a.id,'failed','pi_old','pm_one']);assert.equal(await state(),'unpaid');
  const newer=await reserve();
  await db.query('select * from public.sync_quote_payment($1,$2,$3,$4,$5)',[quoteId,a.id,'failed','pi_old',null]);assert.equal(await state(),'pending','Old failed event must not clear new pending attempt');
  await db.query('select * from public.submit_quote_payment($1,$2)',[quoteId,newer.id]);
  await db.query('select * from public.sync_quote_payment($1,$2,$3,$4,$5)',[quoteId,newer.id,'processing','pi_new','pm_two']);
  await assert.rejects(reserve(),/already being reviewed/);
  await db.query('select * from public.sync_quote_payment($1,$2,$3,$4,$5)',[quoteId,newer.id,'succeeded','pi_new','pm_two']);
  const replay=(await db.query('select * from public.sync_quote_payment($1,$2,$3,$4,$5)',[quoteId,newer.id,'processing','pi_new','pm_two'])).rows[0];assert.equal(replay.state,'succeeded');
  await assert.rejects(db.query('select * from public.sync_quote_payment($1,$2,$3,$4,$5)',[quoteId,newer.id,'succeeded','pi_wrong','pm_two']),/does not match/);
  console.log('PASS submission lock, delayed failure isolation, no paid downgrade, payment identity binding');
  const permissions=await db.query(`select has_function_privilege('anon','public.reserve_quote_payment(uuid,uuid,jsonb)','execute') as anon_execute,
    has_function_privilege('authenticated','public.submit_quote_payment(uuid,uuid)','execute') as staff_execute,
    has_table_privilege('authenticated','public.quote_payment_attempts','select') as staff_read,
    has_function_privilege('service_role','public.reserve_quote_payment(uuid,uuid,jsonb)','execute') as server_execute,
    (select relrowsecurity from pg_class where oid='public.quote_payment_attempts'::regclass) as rls`);
  assert.deepEqual(permissions.rows[0],{anon_execute:false,staff_execute:false,staff_read:false,server_execute:true,rls:true});
  console.log('PASS service-only execution and row-level security');
 } finally { await db.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
