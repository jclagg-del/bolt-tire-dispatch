const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function loader(stubs={}) {
  return function load(file) {
    const filename=path.resolve(__dirname,'..',file.endsWith('.ts')?file:`${file}.ts`);
    const mod=new Module(filename,module);mod.paths=module.paths;
    mod.require=id=>Object.hasOwn(stubs,id)?stubs[id]:id==='server-only'?{}:id.startsWith('@/')?load(id.slice(2)):require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
    return mod.exports;
  };
}
const {taxPeriods,nyPaymentDate,quarterlyTaxReport,taxReportCsv}=loader()('lib/quarterly-tax-report');
const quote=(id,overrides={})=>({id,quote_number:id,customer:'QA Customer',payment_status:'paid',paid_at:'2026-10-08T12:00:00Z',amount_paid:108.88,stripe_sales_tax_amount:8.88,stripe_payment_intent_id:`pi_${id}`,...overrides});
const job=(id,overrides={})=>({id,customer:'QA Job',payment_status:'paid',paid_date:'2026-10-08',job_total:108.88,sales_tax_amount:8.88,...overrides});
test('NY filing quarters cross calendar years and include leap day',()=>{
  assert.deepEqual(taxPeriods(2023),[
    {label:'Q1',start:'2023-03-01',end:'2023-06-01'}, {label:'Q2',start:'2023-06-01',end:'2023-09-01'},
    {label:'Q3',start:'2023-09-01',end:'2023-12-01'}, {label:'Q4',start:'2023-12-01',end:'2024-03-01'},
  ]);
  assert.equal(quarterlyTaxReport([quote(1,{paid_at:'2024-02-29'})],[],2023).periods[3].taxCents,888);
  assert.throws(()=>taxPeriods(NaN));assert.throws(()=>taxPeriods(100));
});
test('date boundaries use New York time and preserve date-only stored dates',()=>{
  assert.equal(nyPaymentDate('2026-03-01T04:59:59Z'),'2026-02-28');
  assert.equal(nyPaymentDate('2026-03-01T05:00:00Z'),'2026-03-01');
  assert.equal(nyPaymentDate('2026-06-01T03:59:59Z'),'2026-05-31');
  assert.equal(nyPaymentDate('2026-06-01T04:00:00Z'),'2026-06-01');
  assert.equal(nyPaymentDate('2026-03-01'),'2026-03-01');
  for(const invalid of [null,'','wrong','2026-99-99','2026-02-30'])assert.equal(nyPaymentDate(invalid),null);
  const report=quarterlyTaxReport([quote(1,{paid_at:'2026-06-01T03:59:59Z'}),quote(2,{paid_at:'2026-06-01T04:00:00Z'})],[],2026);
  assert.equal(report.periods[0].count,1);assert.equal(report.periods[1].count,1);
});
test('online quote copied into job is counted once and duplicate invoice/payment IDs are flagged',()=>{
  const report=quarterlyTaxReport([quote(1,{converted_job_id:9}),quote(2,{stripe_payment_intent_id:'pi_1'})], [job(8,{source_quote_id:1}),job(9),job(10,{quickbooks_invoice_id:'invoice'}),job(11,{quickbooks_invoice_id:'invoice'})],2026);
  assert.equal(report.rows.length,2);assert.equal(report.periods[2].taxCents,1776);
  assert.equal(report.periods[2].stripeTaxCents,888);assert.equal(report.periods[2].recordedTaxCents,888);
  assert.equal(report.issues.length,2);
});
test('pending and unpaid excluded, partial/refunded/missing amounts/dates flagged, exemptions stay zero',()=>{
  const report=quarterlyTaxReport([quote(1,{payment_status:'pending'}),quote(2,{payment_status:'refunded'}),quote(3,{stripe_sales_tax_amount:null}),quote(4,{paid_at:null}),quote(5,{stripe_sales_tax_amount:0})], [job(6,{payment_status:'partial'}),job(7,{payment_status:'unpaid'}),job(8,{source_quote_id:99})],2026);
  assert.equal(report.rows.length,1);assert.equal(report.periods[2].taxCents,0);assert.equal(report.issues.length,5);
});
test('CSV includes exact amounts, period and review warnings, escapes spreadsheet formulas',()=>{
  const report=quarterlyTaxReport([quote(1,{customer:'=HYPERLINK("evil")'}),quote(2,{stripe_sales_tax_amount:null})],[],2026);
  const csv=taxReportCsv(report,2);
  assert.ok(csv.includes('2026-09-01'));assert.ok(csv.includes('"8.88"'));assert.ok(csv.includes('"108.88"'));
  assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('Missing or inconsistent'));assert.ok(!csv.includes('NY tire fee'));
});
function apiFixture({user={id:'admin'},role='admin',error=null,quotes=[],jobs=[]}={}) {
  const reads=[];
  const admin={from(table){if(table==='staff_security'){const c={select(){return c},eq(){return c},maybeSingle:async()=>({data:{role}})};return c;}
    const c={select(){return c},in(){return c},order(){return c},range:async(start,end)=>{reads.push({table,start,end});return{data:(table==='quotes'?quotes:jobs).slice(start,end+1),error}}};return c;}};
  const {GET}=loader({'@/lib/supabase/admin':{requireApiUser:async()=>user,createAdminClient:()=>admin}})('app/api/reports/taxes/route');
  return {GET,reads};
}
test('tax endpoint requires verified admin and validates the reporting year',async()=>{
  for(const [options,status] of [[{user:null},401],[{role:'technician'},403]]) {
    const f=apiFixture(options);const r=await f.GET(new Request('http://localhost/api/reports/taxes?year=2026'));assert.equal(r.status,status);assert.equal(f.reads.length,0);
  }
  const f=apiFixture();assert.equal((await f.GET(new Request('http://localhost/api/reports/taxes?year=no'))).status,400);
});
test('tax endpoint paginates past 1000 records and does not return incomplete totals on query error',async()=>{
  const quotes=Array.from({length:1001},(_,i)=>quote(i+1));const f=apiFixture({quotes});
  const response=await f.GET(new Request('http://localhost/api/reports/taxes?year=2026'));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const report=await response.json();assert.equal(report.rows.length,1001);assert.equal(report.periods[2].taxCents,1001*888);
  assert.equal(f.reads.filter(r=>r.table==='quotes').length,3);
  const broken=apiFixture({error:{message:'database failure'}});const bad=await broken.GET(new Request('http://localhost/api/reports/taxes?year=2026'));
  assert.equal(bad.status,500);assert.ok(!(await bad.json()).periods);
});
test('service address prefill is conservative and validates US state, ZIP and required fields',()=>{
  const {serviceTaxAddress,serviceAddressPrefill,formatServiceTaxAddress}=loader()('lib/service-tax-address');
  const address=serviceAddressPrefill('42 Main St, Apt 2, Newburgh, ny 12550, USA');
  assert.equal(formatServiceTaxAddress(address),'42 Main St, Apt 2, Newburgh, NY 12550');
  assert.equal(serviceAddressPrefill('42 Main St Newburgh NY 12550').city,'');
  for (const patch of [{city:''},{state:'XX'},{postal_code:'125'},{country:'CA'},{line1:''}])assert.throws(()=>serviceTaxAddress({...address,...patch}));
});
