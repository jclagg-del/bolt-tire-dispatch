const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function load(file) {
  const filename = path.resolve(__dirname, '..', `${file}.ts`);
  const m = new Module(filename, module); m.paths = module.paths;
  m.require = id => id === 'server-only' ? {} : id.startsWith('@/') ? load(id.slice(2)) : require(id);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return m.exports;
}
const { sendCustomerPaymentConfirmation: send } = load('lib/customer-payment-confirmation');
const quote = { id:'quote-1', quote_number:38, customer:'<script>Customer</script>', email:'customer@example.com', phone:'2015550123', vehicle:'2017 Acura RDX', address:'123 Example St', quantity:2, tire_size:'235/60R18', rear_quantity:2, rear_tire_size:'255/60R18', requested_date:'2026-10-10', requested_time:'09:30', notes:'PRIVATE OFFICE NOTES', additional_items:[{quantity:1,description:'Wheel service <front>',unit_price:20}], purchase_source:'website' };
const option = { id:'option',brand:'GT Radial',model:'Maxtour LX',supplier:'PRIVATE SUPPLIER',supplier_product_id:'100UA3552',price_per_tire:120,rear_model:'Rear tire',rear_price_per_tire:130,rear_supplier_product_id:'rear-part' };
async function mock(run, tweaks={}) {
  const oldFetch=global.fetch, prior={STRIPE_SECRET_KEY:process.env.STRIPE_SECRET_KEY,RESEND_API_KEY:process.env.RESEND_API_KEY};
  process.env.STRIPE_SECRET_KEY='fake';process.env.RESEND_API_KEY='fake';
  const session={payment_status:'paid',amount_total:76251,currency:'usd',metadata:{quote_id:quote.id,option_id:option.id},...tweaks.session};
  const calls=[],emails=new Map();let receiptFailures=tweaks.receiptFailures||0;
  global.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url==='https://api.resend.com/emails') {
      if(tweaks.emailFailure)return Response.json({}, {status:503});
      const key=options.headers['Idempotency-Key'];
      if(emails.has(key))assert.equal(emails.get(key),options.body);
      emails.set(key,options.body);return Response.json({id:'accepted-customer-mail'});
    }
    assert.equal(url,'https://api.stripe.com/v1/checkout/sessions/cs_test_example');
    if(options.method==='POST') {
      assert.deepEqual([...options.body.keys()],['metadata[bolt_customer_payment_email]']);
      if(receiptFailures-->0)return Response.json({}, {status:503});
      session.metadata.bolt_customer_payment_email=options.body.get('metadata[bolt_customer_payment_email]');
    }
    return Response.json(session);
  };
  try {await run({calls,emails,session});} finally {global.fetch=oldFetch;for(const [key,value]of Object.entries(prior))if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
test('customer receipt includes paid total, stable order reference, both axles and requested—not confirmed—appointment',async()=>{
  await mock(async({emails,session})=>{
    await send('cs_test_example',quote,option);
    const email=JSON.parse([...emails.values()][0]);
    assert.deepEqual(email.to,['customer@example.com']);assert.equal(email.reply_to,'sales@bolttire.com');
    for(const value of ['BT-38','$762.51','235/60R18','255/60R18','100UA3552','rear-part','Wheel service','pending confirmation','not a shipment','order-status update'])assert.ok(email.text.includes(value),value);
    assert.match(email.html,/&lt;script&gt;Customer&lt;\/script&gt;/);assert.doesNotMatch(email.html,/<script>/);
    assert.match(email.html, /src="https:\/\/app\.bolttire\.com\/bolt-logo\.png"/);
    assert.match(email.html, /alt="Bolt Tire"/);
    assert.match(email.html, /role="presentation"/);
    assert.match(email.html, /mailto:sales@bolttire\.com\?subject=Order%20BT-38/);
    assert.match(email.html, /What happens next\?/);
    assert.doesNotMatch(email.html, /<script|<iframe|display:grid|display:flex/);
    for (const value of ['BT-38','$762.51','100UA3552','rear-part','pending confirmation','not a shipment']) assert.ok(email.html.includes(value),value);
    for(const value of ['PRIVATE OFFICE NOTES','PRIVATE SUPPLIER','/quotes/'])assert.ok(!email.text.includes(value));
    assert.equal(session.metadata.bolt_customer_payment_email,'accepted-customer-mail');
  });
});
test('independent customer receipt prevents duplicate sends beyond provider retention and across concurrent events',async()=>{
  await mock(async({emails,calls,session})=>{
    session.metadata.bolt_office_payment_email='office-already-sent';
    await Promise.all([send('cs_test_example',quote,option),send('cs_test_example',quote,option)]);
    assert.equal(emails.size,1);assert.ok(emails.has('customer-paid-checkout-cs_test_example'));
    emails.clear();calls.length=0;
    await send('cs_test_example',quote,option);assert.equal(emails.size,0);assert.equal(calls.length,1);
    assert.equal(session.metadata.bolt_office_payment_email,'office-already-sent');
  });
});
test('unpaid, wrong quote, wrong option and invalid amount never send confirmation',async()=>{
  for(const session of [{payment_status:'unpaid'},{metadata:{quote_id:'wrong'}},{metadata:{quote_id:quote.id,option_id:'wrong'}},{amount_total:-1}])await mock(async({emails})=>{
    await assert.rejects(send('cs_test_example',quote,option));assert.equal(emails.size,0);
  },{session});
});
test('missing contact uses checkout email; missing/invalid addresses fail rather than claim sent',async()=>{
  await mock(async({emails})=>{
    await send('cs_test_example',{...quote,email:null,requested_date:null,requested_time:null},option);
    const email=JSON.parse([...emails.values()][0]);assert.deepEqual(email.to,['checkout@example.com']);assert.match(email.text,/Not scheduled/);
  },{session:{customer_details:{email:'checkout@example.com'}}});
  for(const email of [null,'bad','customer@example.com\r\nBcc: bad@example.com'])await mock(async({emails})=>{
    await assert.rejects(send('cs_test_example',{...quote,email},option),/valid customer email/);assert.equal(emails.size,0);
  });
});
test('send failure and receipt-write failure remain retryable without duplicate email bodies',async()=>{
  await mock(async({session})=>{await assert.rejects(send('cs_test_example',quote,option),/not accepted/);assert.equal(session.metadata.bolt_customer_payment_email,undefined);},{emailFailure:true});
  await mock(async({emails,session})=>{
    await assert.rejects(send('cs_test_example',quote,option),/Could not save/);
    await send('cs_test_example',quote,option);assert.equal(emails.size,1);assert.ok(session.metadata.bolt_customer_payment_email);
  },{receiptFailures:1});
});
