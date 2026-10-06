// Isolated PostgreSQL validation; never touches real quotes or jobs.
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table quotes(id int primary key,payment_status text,converted_job_id bigint);
      create table jobs(id int primary key);
      insert into quotes values(1,'unpaid',null); insert into jobs values(1);
      grant select,update,insert on quotes,jobs to authenticated;`);
    const migration = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006123613_quote_additional_items.sql'),'utf8');
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query('select additional_items from quotes')).rows[0].additional_items,[]);
    const valid=[{description:'Sensor',quantity:2,unit_price:42.5,taxable:true,quickbooks_item_id:'10',quickbooks_company_id:'company'}];
    await db.exec('set role authenticated');
    for (const table of ['quotes','jobs']) {
      for (const value of [{},null,[{}],[{...valid[0],quantity:-1}],[{...valid[0],unit_price:1.005}],[{...valid[0],taxable:'yes'}],Array(51).fill(valid[0])]) {
        await assert.rejects(db.query(`update ${table} set additional_items=$1::jsonb where id=1`,[JSON.stringify(value)]),/check constraint/);
      }
      await db.query(`update ${table} set additional_items=$1::jsonb where id=1`,[JSON.stringify(valid)]);
    }
    for (const status of ['pending','paid']) {
      await db.query('update quotes set payment_status=$1 where id=1',[status]);
      await assert.rejects(db.query('update quotes set additional_items=$1::jsonb where id=1',['[]']),/cannot change/);
      await db.query('update quotes set additional_items=$1::jsonb where id=1',[JSON.stringify(valid)]);
    }
    await db.exec("update quotes set payment_status='unpaid',converted_job_id=1 where id=1");
    await assert.rejects(db.query('update quotes set additional_items=$1::jsonb where id=1',['[]']),/cannot change/);
    console.log('PASS: repeatable migration; existing records unchanged; authenticated validation; malformed charges rejected; pending, paid and converted extras protected.');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
