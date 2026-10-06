// Run against an isolated in-memory PostgreSQL database, never production.
// Usage: node scripts/check-job-jha-database.cjs /absolute/path/to/@electric-sql/pglite
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const technician = '00000000-0000-0000-0000-000000000001';
const valid = () => ({ technician: 'Test Technician', steps: [{ task: 'Unload', hazards: 'Traffic', controls: 'Isolate work area', controlled: true }], glasses: true, hearing: true, gloves: false, acknowledged: true, unsafeReason: '', photos: [] });
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table public.staff_security(user_id uuid,role text);
      create table public.jobs(id bigint primary key,customer text,service_type text,address text,scheduled timestamptz,vehicle text,tires text,size text,qty int,complete boolean default false,archived boolean default false,job_status text default 'scheduled',customer_order_status text,completed_at timestamptz);
      grant select,update on public.jobs to authenticated;
      insert into auth.users values('${technician}'); insert into staff_security values('${technician}','technician');
      insert into jobs(id,complete,job_status,completed_at) values(99,true,'completed',now());
    `);
    const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261006_job_jha.sql'), 'utf8');
    await db.exec(migration); await db.exec(migration);
    await db.exec("insert into jobs(id,service_type,address,scheduled,qty) select n,'Delivery','Example St','2026-10-06T14:00:00Z',4 from generate_series(1,15) n");
    const context = async id => (await db.query('select jha_job_context(to_jsonb(j)) as value from jobs j where id=$1', [id])).rows[0].value;
    const save = async (id, revision = 0, status = 'complete', assessment = valid(), ctx) => db.query('select * from save_job_jha($1,$2,$3,$4::jsonb,$5::uuid,$6::jsonb)', [String(id),revision,status,JSON.stringify(assessment),technician,JSON.stringify(ctx || await context(id))]);
    for (const statement of ["complete=true", "job_status='completed'", "customer_order_status='Work Completed'", 'completed_at=now()']) {
      await assert.rejects(db.exec(`update jobs set ${statement} where id=1`), /Complete the JHA/);
    }
    await assert.rejects(db.exec("insert into jobs(id,complete) values(100,true)"), /Complete the JHA/);
    await db.exec("update jobs set customer='Historical edit',job_status='billed' where id=99");
    for (const patch of [{ glasses: false }, { hearing: false }, { acknowledged: false }, { steps: [] }, { unsafeReason: 'Unresolved traffic' }, { steps: [{ task: 'Unload', hazards: 'Traffic', controls: '', controlled: true }] }]) {
      await assert.rejects(save(1,0,'complete',{ ...valid(), ...patch }), /Complete all JHA/);
    }
    await save(1); await db.exec("update jobs set complete=true,job_status='completed',completed_at=now() where id=1");
    await assert.rejects(save(1,1), /read-only/);
    await db.exec("update jobs set complete=false,job_status='scheduled',completed_at=null where id=1");
    const reopened = (await db.query("select * from job_jhas where job_id='1'")).rows[0];
    assert.equal(reopened.status, 'draft'); assert.equal(reopened.assessment.acknowledged, false); assert.equal(reopened.revision, 2);
    await assert.rejects(db.exec('update jobs set complete=true where id=1'), /Complete the JHA/);
    assert.equal((await db.query("select count(*)::int n from job_jha_history where job_id='1'")).rows[0].n, 2);
    await save(1,2); await db.exec('update jobs set complete=true where id=1');
    await save(2,0,'unsafe',{ ...valid(), unsafeReason: 'Uncontrolled traffic' });
    await assert.rejects(db.exec('update jobs set complete=true where id=2'), /Complete the JHA/);
    await assert.rejects(save(2,0), /changed/);
    await save(2,1); await db.exec('update jobs set complete=true where id=2');
    await save(3); await db.exec("update jobs set address='New site' where id=3");
    await assert.rejects(db.exec('update jobs set complete=true where id=3'), /Complete the JHA/);
    await save(3,1); await db.exec('update jobs set complete=true where id=3');
    const stale = await context(4); await db.exec('update jobs set qty=2 where id=4');
    await assert.rejects(save(4,0,'complete',valid(),stale), /details changed/);
    await save(4); await assert.rejects(db.exec('update jobs set complete=true,qty=8 where id=4'), /Complete the JHA/);
    await db.exec(`insert into job_jha_photos(path,job_id,uploaded_by) values('5/photo.jpg','5','${technician}')`);
    const photo = { path: '5/photo.jpg', caption: 'Work area', category: 'Before work' };
    await assert.rejects(save(6,0,'complete',{ ...valid(), photos: [photo] }), /Photo does not belong/);
    await save(5,0,'complete',{ ...valid(), photos: [photo] });
    await db.exec("update jobs set customer_order_status='Work Completed' where id=5");
    assert.equal((await db.query("select public from storage.buckets where id='job-jha-photos'")).rows[0].public, false);
    await db.exec('set role authenticated');
    await assert.rejects(db.exec('select * from job_jhas'), /permission denied/);
    await assert.rejects(save(7), /permission denied/);
    await assert.rejects(db.exec('update jobs set complete=true where id=7'), /Complete the JHA/);
    await db.exec('reset role');
    // Verify mixed-status legacy records can receive a JHA instead of deadlocking.
    await db.exec('alter table jobs disable trigger require_jha_before_job_complete');
    await db.exec("update jobs set customer_order_status='Work Completed' where id=8");
    await db.exec('alter table jobs enable trigger require_jha_before_job_complete');
    await save(8); await db.exec('update jobs set complete=true where id=8');
    console.log('PASS: migration and repeat application; all completion paths; PPE and acknowledgment; unsafe holds; revisions; reopen; changed context; private storage; cross-job attachment rejection; database permissions; historical records.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
