const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function load(file,stubs={}) {
  const filename=path.resolve(__dirname,'..',file), mod=new Module(filename,module);mod.paths=module.paths;
  mod.require=id=>id==='server-only'?{}:Object.hasOwn(stubs,id)?stubs[id]:id.startsWith('@/')?load(id.slice(2)+'.ts',stubs):require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);return mod.exports;
}
function fixture(overrides={}) {
  const job={id:1,customer:'Brett Test',contact_name:'Brett Test',email:'test@example.com',source_quote_id:'quote-1',payment_status:'paid',job_total:800,paid_date:'2026-10-06T13:02:00Z',sales_tax_amount:60,...overrides.job};
  const quote=overrides.noQuote?null:{id:'quote-1',quote_number:38,payment_status:'paid',amount_paid:'762.51',paid_at:'2026-10-06T13:02:00Z',stripe_sales_tax_amount:'56.55',stripe_payment_intent_id:'pi_test',email:'quote@example.com',...overrides.quote};
  const payment={id:'pi_test',livemode:true,status:'succeeded',currency:'usd',amount_received:76251,metadata:{quote_id:'quote-1'},...overrides.payment};
  payment.latest_charge={id:'ch_test',payment_intent:'pi_test',paid:true,captured:true,currency:'usd',amount:76251,amount_refunded:0,refunded:false,disputed:false,receipt_url:'https://pay.stripe.com/receipts/payment/test',...overrides.charge};
  const calls=[];
  const admin={from(table){const query={select(){return query},eq(){return query},maybeSingle:async()=>table==='jobs'?{data:job}:table==='staff_security'?{data:{role:overrides.role||'admin',password_change_required:!!overrides.setupRequired}}:{data:quote,error:overrides.quoteError}};return query}};
  const stubs={'@/lib/supabase/admin':{requireApiUser:async()=>overrides.unauthenticated?null:{id:'staff'},createAdminClient:()=>admin},'@/lib/stripe-payments':{stripePaymentRequest:async(...args)=>{calls.push(args);return payment}},'@/lib/quickbooks':{quickBooksRequest:async path=>path.startsWith('/payment/')?{Payment:overrides.qbPayment}:{Invoice:overrides.invoice}}};
  const helpers=load('lib/billing-receipt.ts',stubs);
  const api=load('app/api/billing/receipts/route.ts',stubs);
  return {job,quote,payment,calls,helpers,receipt:()=>helpers.billingReceipt(admin,'1'),get:()=>api.GET(new Request('http://localhost/api/billing/receipts?jobId=1')),post:body=>api.POST(new Request('http://localhost/api/billing/receipts',{method:'POST',body:JSON.stringify(body)}))};
}
test('Stripe receipt uses settled payment and tax, not an edited job total',async()=>{
  const f=fixture(),r=await f.receipt();assert.equal(r.amountCents,76251);assert.equal(r.taxCents,5655);assert.equal(r.reference,'BT-38');assert.equal(r.source,'Stripe');assert.equal(f.calls.length,1);assert.equal(f.calls[0].length,1,'Stripe is read-only: no charge/capture/refund');
});
test('pending, test-mode, refunded, disputed and mismatched Stripe charges fail closed',async()=>{
  for(const overrides of [{payment:{status:'processing'}},{payment:{livemode:false}},{payment:{metadata:{quote_id:'other'}}},{payment:{amount_received:100}},{charge:{amount_refunded:1}},{charge:{refunded:true}},{charge:{disputed:true}},{charge:{paid:false}},{charge:{captured:false}},{charge:{payment_intent:'pi_other'}},{charge:{receipt_url:'https://evil.example/receipt'}},{payment:{currency:'eur'}}]) await assert.rejects(fixture(overrides).receipt(),/review|valid receipt/);
});
test('unpaid job, missing email and unverified linked quote cannot produce a receipt',async()=>{
  for(const overrides of [{job:{payment_status:'unpaid'}},{job:{email:''},quote:{email:''}},{noQuote:true},{quoteError:{message:'not available'}},{quote:{payment_status:'refunded'}}]) await assert.rejects(fixture(overrides).receipt());
});
test('manual paid records use saved total and identify their recorded source',async()=>{
  const r=await fixture({noQuote:true,job:{source_quote_id:null}}).receipt();assert.equal(r.amountCents,80000);assert.equal(r.source,'Recorded payment');assert.equal(r.receiptUrl,null);
  await assert.rejects(fixture({noQuote:true,job:{source_quote_id:null,job_total:null}}).receipt());
});
test('QuickBooks must confirm a fully paid USD invoice; sync timestamp is not presented as payment date',async()=>{
  const overrides={noQuote:true,job:{source_quote_id:null,quickbooks_invoice_id:'123'},invoice:{Id:'123',DocNumber:'INV-1',Balance:0,TotalAmt:100,TxnTaxDetail:{TotalTax:8},CurrencyRef:{value:'USD'},LinkedTxn:[{TxnType:'Payment',TxnId:'456'}]},qbPayment:{Id:'456',Line:[{Amount:100,LinkedTxn:[{TxnType:'Invoice',TxnId:'123'}]}]}};
  const r=await fixture(overrides).receipt();assert.equal(r.source,'QuickBooks');assert.equal(r.amountCents,10000);assert.equal(r.paidDate,'');
  for(const invoice of [{...overrides.invoice,Balance:1},{...overrides.invoice,Id:'wrong'},{...overrides.invoice,CurrencyRef:{value:'EUR'}}]) await assert.rejects(fixture({...overrides,invoice}).receipt());
  await assert.rejects(fixture({...overrides,invoice:{...overrides.invoice,LinkedTxn:[{TxnType:'CreditMemo',TxnId:'456'}]}}).receipt(),/credits/);
  await assert.rejects(fixture({...overrides,qbPayment:{Id:'456',Line:[]}}).receipt(),/do not match/);
});
test('receipt preview requires office/admin and completed account setup; no sends on GET',async()=>{
  for(const [overrides,status] of [[{unauthenticated:true},401],[{role:'technician'},403],[{role:'customer'},403],[{setupRequired:true},403]]) {const f=fixture(overrides);assert.equal((await f.get()).status,status);assert.equal((await f.post({jobId:1,fingerprint:'x'})).status,status);assert.equal(f.calls.length,0);}
  const f=fixture({role:'office'}),response=await f.get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).receipt.email,'test@example.com');
});
test('receipt sending rejects stale preview and request-supplied recipient or price is never trusted',async()=>{
  const f=fixture();assert.equal((await f.post({jobId:1,fingerprint:'old',email:'other@example.com',amountCents:1})).status,409);
  assert.equal((await f.post({jobId:1})).status,400);
});
test('receipt email is escaped, branded, includes tax without adding it again and is not a payment request',async()=>{
  const f=fixture({job:{customer:'<script>bad</script>',contact_name:'<script>bad</script>'}}),r=await f.receipt();const email=f.helpers.renderBillingReceipt(r);
  assert.ok(email.html.includes('/bolt-logo.png'));assert.ok(email.html.includes('&lt;script&gt;'));assert.ok(!email.html.includes('<script>'));
  for(const text of ['$762.51','$56.55','Sales tax included','$0.00','No additional payment is required','View / print Stripe receipt']) assert.ok(email.html.includes(text),text);
});
test('provider acceptance, failure and repeated-send idempotency are handled',async()=>{
  const oldFetch=global.fetch,oldKey=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='test-only';const sends=[];
  try {
    global.fetch=async(url,options)=>{sends.push({url,options});return {ok:true,json:async()=>({id:'email-test'})}};
    const f=fixture(),r=await f.receipt(),fingerprint=f.helpers.receiptFingerprint(r);
    assert.equal((await f.post({jobId:1,fingerprint,email:'not-used@example.com',amountCents:1})).status,200);
    await f.helpers.sendBillingReceipt(r);
    assert.equal(sends.length,2);assert.equal(sends[0].options.headers['Idempotency-Key'],sends[1].options.headers['Idempotency-Key']);
    assert.deepEqual(JSON.parse(sends[0].options.body).to,['test@example.com']);assert.ok(JSON.parse(sends[0].options.body).subject.includes('$762.51'));
    global.fetch=async()=>({ok:false,json:async()=>({})});await assert.rejects(f.helpers.sendBillingReceipt(r),/could not confirm/);
  } finally {global.fetch=oldFetch;if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;}
});
test('Billing places tax below every job section, offers receipts only for paid jobs and stops row navigation',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../app/billing/page.tsx'),'utf8');assert.equal(source.match(/<QuarterlyTaxReport/g).length,1);assert.ok(source.indexOf('<QuarterlyTaxReport')>source.indexOf('Send Completion Text'));
  assert.match(source,/isPaid && <button[\s\S]*?stopPropagation\(\)[\s\S]*?>Send receipt<\/button>/);
  const modal=fs.readFileSync(path.resolve(__dirname,'../components/BillingReceiptDialog.tsx'),'utf8');assert.ok(modal.includes('sendingLock.current'));assert.ok(modal.includes('request("GET")'));assert.ok(modal.includes('fingerprint: preview.fingerprint'));
});
