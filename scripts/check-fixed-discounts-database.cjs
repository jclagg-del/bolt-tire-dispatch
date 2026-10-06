// Isolated PostgreSQL checks; no production records or codes are created.
const {PGlite}=require(process.argv[2] || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated;
   create table discount_codes(id int primary key,percent numeric(6,3) not null);
   create table quotes(id int primary key,payment_status text,converted_job_id bigint,discount_percent numeric(6,3),discount_amount numeric(12,2),discount_code_id uuid);
   create table jobs(id int primary key,price_tires numeric(10,2));
   insert into jobs values(1,220.99);
   insert into discount_codes values(1,15);insert into quotes values(1,'unpaid',null,15,60,null);
   grant select,update on quotes to authenticated;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006134006_fixed_per_tire_discount_codes.sql'),'utf8'));
  assert.deepEqual((await db.query('select percent,discount_type,fixed_amount from discount_codes')).rows[0],{percent:'15.000',discount_type:'percent',fixed_amount:'0.00'});
  await db.exec("insert into discount_codes values(2,0,'fixed',20.01)");
  assert.equal(Number((await db.query('select price_tires from jobs where id=1')).rows[0].price_tires),220.99);
  await db.exec('insert into jobs values(2,39.995)');
  assert.equal(Number((await db.query('select price_tires * 4 as subtotal from jobs where id=2')).rows[0].subtotal),159.98);
  for(const bad of ["(3,0,'invalid',20)","(3,0,'fixed',-1)","(3,15,'fixed',20)","(3,10,'percent',20)","(3,0,'fixed','NaN')"]){await assert.rejects(db.exec(`insert into discount_codes values ${bad}`));}
  await db.exec("set role authenticated;update quotes set discount_type='fixed',discount_fixed_amount=20.01,discount_percent=0,discount_amount=80.04 where id=1");
  for(const status of ['pending','paid']){
   await db.exec(`update quotes set payment_status='${status}' where id=1`);
   await assert.rejects(db.exec('update quotes set discount_fixed_amount=25 where id=1'),/Discount cannot change/);
   await db.exec('update quotes set discount_fixed_amount=20.01 where id=1');
  }
  await db.exec("update quotes set payment_status='unpaid',converted_job_id=7 where id=1");
  await assert.rejects(db.exec('update quotes set discount_amount=100 where id=1'),/Discount cannot change/);
  console.log('PASS: legacy percentage defaults, exact dollars, constraints and immutable checkout snapshots.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
