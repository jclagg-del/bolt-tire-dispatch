const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id === 'server-only' ? {} : id.startsWith('@/') ? load(id.slice(2)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
    return mod.exports;
  };
}
const pricing = loader()('lib/quote-payment-pricing');
const q = { id:'quote', payment_pricing_version:1, payment_status:'unpaid', quantity:2, rear_quantity:2, installation_cost:299, disposal_fee:14, service_call_fee:0, ny_state_tire_fee:10, tax_exempt:false, address:'123 Example St, New York, NY 10001', email:'example@example.com', phone:'2015550123', requested_date:'2026-10-15', additional_items:[{ description:'TPMS', quantity:2, unit_price:42.5, taxable:true, quickbooks_item_id:'123', quickbooks_company_id:'company' },{description:'Other',quantity:1,unit_price:10,taxable:false}] };
const option = { id:'option', price_per_tire:220.99, rear_price_per_tire:230.55 };
q.quote_options=[option];
test('dual prices round each invoice unit once, preserve fixed state fees and mapped additional services', () => {
  const regular=pricing.quotePaymentPrice(q,option,'regular'), discounted=pricing.quotePaymentPrice(q,option,'discounted');
  assert.equal(regular.option.price_per_tire,227.62); assert.equal(regular.option.rear_price_per_tire,237.47);
  assert.equal(regular.quote.ny_state_tire_fee,10); assert.equal(discounted.quote.ny_state_tire_fee,10);
  assert.equal(regular.quote.additional_items[0].unit_price,43.78);
  assert.equal(regular.quote.additional_items[0].quickbooks_item_id,'123');
  for(const p of [regular,discounted]) {
    assert.equal(p.subtotalCents,p.lines.reduce((sum,line)=>sum+line.amount,0));
    assert.equal(p.taxableCents+p.nonTaxableCents,p.subtotalCents);
    assert.ok(p.lines.every(line=>Number.isSafeInteger(line.amount)));
  }
  assert.equal(discounted.subtotalCents,132108);
  assert.equal(regular.subtotalCents,136043);
  assert.equal(q.installation_cost,299); assert.equal(option.price_per_tire,220.99);
});
test('settled snapshots affect only the paid option, never pending or historical quotes', () => {
  const snapshot=pricing.quotePaymentPrice(q,option,'regular');
  const pending={...q,payment_pricing_snapshot:snapshot};
  assert.equal(pricing.settledQuote(pending),pending);
  const paid=pricing.settledQuote({...pending,payment_status:'paid',quote_options:[option,{id:'other',price_per_tire:10}]});
  assert.equal(paid.installation_cost,307.97); assert.equal(paid.quote_options[0].price_per_tire,227.62); assert.equal(paid.quote_options[1].price_per_tire,10);
  const old={...q,payment_status:'paid'}; assert.equal(pricing.settledQuote(old),old);
  for(const quantity of [0,-1,1.5,Infinity,10001]) assert.throws(()=>pricing.quotePaymentPrice({...q,quantity},option,'regular'));
  assert.throws(()=>pricing.quotePaymentPrice(q,{...option,price_per_tire:-1},'regular'));
});

function fixture({funding='credit',tax=100,active=null,tokenPatch={},rpcError=null,stripeError=null,actualFunding=funding,captureError=null,intentPatch={}}={}) {
  const calls=[], writes=[]; let a, captured=false;
  const preview=funding==='us_bank_account'?{type:funding}:{type:'card',card:{funding}};
  preview.billing_details={address:{line1:'123 Main St',city:'New York',state:'NY',country:'US',postal_code:'10001'}};
  const token={id:'ctoken_test',livemode:false,expires_at:Math.floor(Date.now()/1000)+3600,payment_method_preview:preview,...tokenPatch};
  const admin={from(){const chain={select(){return chain},eq(){return chain},not(){return chain},maybeSingle:async()=>({data:active})};return chain},rpc:async(name,args)=>{
    writes.push({name,args}); if(rpcError)return{error:{message:rpcError}};
    if(name==='reserve_quote_payment')a={...args.p_attempt,quote_id:q.id,option_id:option.id,state:'review'};
    else if(name==='submit_quote_payment'){a.state='submitting';a.submitted_at||=new Date().toISOString();}
    else if(name==='sync_quote_payment'){Object.assign(a,{state:args.p_state,stripe_payment_intent_id:args.p_intent_id,stripe_payment_method_id:args.p_method_id});}
    return{data:structuredClone(a)};
  }};
  const request=async(endpoint,body,key)=>{
    calls.push({endpoint,body,key});
    if(endpoint.startsWith('confirmation_tokens/'))return token;
    if(endpoint==='tax/calculations') {const subtotal=[...body.entries()].filter(([key])=>/^line_items\[\d+\]\[amount\]$/.test(key)).reduce((sum,[_,value])=>sum+Number(value),0);return{id:'taxcalc_test',amount_total:subtotal+tax,tax_amount_exclusive:tax,tax_amount_inclusive:0};}
    if(stripeError)throw stripeError;
    if(endpoint.startsWith('payment_methods/')) return{id:'pm_saved',livemode:false,type:'card',card:{funding:actualFunding}};
    if(endpoint.endsWith('/capture')) {if(captureError)throw captureError;captured=true;}
    return{id:'pi_test',livemode:false,metadata:{quote_id:q.id,option_id:option.id,bolt_payment_attempt:a.id},amount:a.amount_cents,amount_received:captured?a.amount_cents:0,amount_capturable:captured?0:a.amount_cents,capture_method:funding==='us_bank_account'?'automatic':'manual',currency:'usd',status:funding==='us_bank_account'?'processing':captured?'succeeded':'requires_capture',payment_method:'pm_saved',...intentPatch};
  };
  class StripePaymentError extends Error{}
  const service=loader({'@/lib/supabase/admin':{},'@/lib/discounts-server':{lookupDiscount:async()=>null},'@/lib/stripe-payments':{stripePaymentRequest:request,StripePaymentError}})('lib/quote-payment-checkout');
  return{service,admin,calls,writes,token,get attempt(){return a}};
}
test('review trusts Stripe funding and saved prices, calculates tax, and stores a bound snapshot without charging',async()=>{
  for(const funding of ['credit','debit','prepaid','us_bank_account']) {
    const f=fixture({funding});const result=await f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test');
    assert.equal(result.funding,funding);assert.equal(result.total,(funding==='credit'?136043:132108)/100+1);
    assert.equal(f.calls.length,2);assert.ok(!f.calls.some(c=>c.endpoint==='payment_intents'));
    assert.equal(f.writes[0].args.p_attempt.confirmation_token,'ctoken_test');
    assert.deepEqual(f.writes[0].args.p_attempt.source_option,option);
    assert.equal('confirmation_token' in result,false);
  }
});
test('expired/used/live tokens, unknown funding, invalid tax and active payment block review',async()=>{
  for(const config of [{tokenPatch:{expires_at:1}},{tokenPatch:{payment_intent:'pi_used'}},{tokenPatch:{livemode:true}},{funding:'unknown'},{tax:0},{tax:-1},{active:{id:'other',state:'processing'}}]) {
    const f=fixture(config);await assert.rejects(f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test'));assert.equal(f.writes.length,0);
  }
  const f=fixture({rpcError:'Quote changed'});await assert.rejects(f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test'),/Quote changed/);
  assert.ok(!f.calls.some(c=>c.endpoint==='payment_intents'));
});
test('tax uses saved service destination, never a different billing state or ZIP',async()=>{
  for (const billingState of ['FL','NY']) {
    const f=fixture();
    f.token.payment_method_preview.billing_details.address={line1:'999 Billing St',city:'Miami',state:billingState,country:'US',postal_code:'33101'};
    const review=await f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test');
    const tax=f.calls.find(c=>c.endpoint==='tax/calculations').body;
    assert.equal(tax.get('customer_details[address_source]'),'shipping');
    assert.equal(tax.get('customer_details[address][line1]'),'123 Example St');
    assert.equal(tax.get('customer_details[address][state]'),'NY');
    assert.equal(tax.get('customer_details[address][postal_code]'),'10001');
    assert.equal(f.attempt.snapshot.taxAddressSource,'shipping');
    assert.equal(f.attempt.snapshot.taxAddress.postal_code,'10001');
    assert.equal(review.serviceAddress,q.address);
    for (const [reference,code] of [['ny_state_tire_fee','txcd_00000000'],['extra_0','txcd_99999999'],['extra_1','txcd_00000000']]) {
      const entry=[...tax.entries()].find(([key,value])=>key.endsWith('[reference]')&&value===reference);
      assert.ok(entry);assert.equal(tax.get(entry[0].replace('[reference]','[tax_code]')),code);
    }
  }
});
test('incomplete service address cannot fall back to a complete billing address',async()=>{
  for (const address of ['Fallsburg, NY','123 Example Street','123 Example St, New York, NY']) {
    const f=fixture();
    await assert.rejects(f.service.reviewQuotePayment(f.admin,{...q,address},'option','ctoken_test'),/service \/ delivery/);
    assert.equal(f.calls.length,0); assert.equal(f.writes.length,0);
  }
  const f=fixture({tax:0}); f.token.payment_method_preview.billing_details.address.state='FL';
  await assert.rejects(f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test'),/Sales tax could not be verified/);
});
test('corrected destination must save before calculating tax and reserving its snapshot',async()=>{
  const f=fixture(); const updates=[];
  const original=f.admin.from;
  f.admin.from=table=>table==='quotes'?{update(values){updates.push(values);const c={eq(){return c},is(){return c},select(){return c},maybeSingle:async()=>({data:{id:q.id}})};return c}}:original(table);
  const destination={line1:'42 Destination Rd',line2:'Unit 2',city:'Newburgh',state:'ny',postal_code:'12550',country:'US'};
  const review=await f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test',destination);
  assert.equal(updates[0].address,'42 Destination Rd, Unit 2, Newburgh, NY 12550');
  assert.equal(f.writes[0].args.p_attempt.source_quote.address,updates[0].address);
  assert.equal(review.serviceAddress,updates[0].address);
  assert.equal(f.calls.find(c=>c.endpoint==='tax/calculations').body.get('customer_details[address][postal_code]'),'12550');
  const blocked=fixture(); blocked.admin.from=table=>table==='quotes'?{update(){const c={eq(){return c},is(){return c},select(){return c},maybeSingle:async()=>({data:null,error:{message:'locked'}})};return c}}:original(table);
  await assert.rejects(blocked.service.reviewQuotePayment(blocked.admin,q,'option','ctoken_test',destination),/could not be saved/);
  assert.equal(blocked.calls.length,0);assert.equal(blocked.writes.length,0);
});
test('exempt organization does not calculate tax, and changed discounts cannot be charged',async()=>{
  const f=fixture();const review=await f.service.reviewQuotePayment(f.admin,{...q,tax_exempt:true},'option','ctoken_test');
  assert.equal(review.tax,0);assert.equal(f.calls.length,1);
  await assert.rejects(f.service.reviewQuotePayment(f.admin,{...q,discount_code_id:'inactive',discount_code_label:'KSS'},'option','ctoken_test'),/Discount settings changed/);
});
test('submission uses automatic confirmation, verified card capture, pending ACH and stable idempotency',async()=>{
  for(const funding of ['credit','debit','prepaid','us_bank_account']) {
    const f=fixture({funding});const review=await f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test');
    const result=await f.service.confirmQuotePayment(f.admin,q.id,review.reviewId);
    const creation=f.calls.find(c=>c.endpoint==='payment_intents');
    assert.equal(creation.body.get('amount'),String(f.attempt.amount_cents));
    assert.equal(creation.body.get('confirmation_token'),'ctoken_test');
    assert.equal(creation.body.get('confirmation_method'),'automatic');
    assert.equal(creation.body.get('capture_method'),funding==='us_bank_account'?null:'manual');
    assert.equal(creation.body.get('hooks[inputs][tax][calculation]'),'taxcalc_test');
    assert.equal(creation.key,`quote-payment-${review.reviewId}`);
    assert.equal(result.state,funding==='us_bank_account'?'processing':'succeeded');
    await f.service.confirmQuotePayment(f.admin,q.id,review.reviewId);
    assert.equal(f.calls.filter(c=>c.endpoint==='payment_intents').length,1);
    const captures=f.calls.filter(c=>c.endpoint.endsWith('/capture'));
    assert.equal(captures.length,funding==='us_bank_account'?0:1);
    if(captures.length) {
      assert.equal(captures[0].body.get('amount_to_capture'),String(f.attempt.amount_cents));
      assert.equal(captures[0].key,`quote-capture-${review.reviewId}`);
      assert.ok(f.writes.some(w=>w.args.p_state==='processing'));
    }
    assert.ok(!f.writes.some(w=>w.args.payment_status==='paid'));
  }
});
test('unknown network outcomes retain the submitted attempt and use the identical key on retry',async()=>{
  const f=fixture({stripeError:new Error('Network timeout')});const r=await f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test');
  for(let i=0;i<2;i++)await assert.rejects(f.service.confirmQuotePayment(f.admin,q.id,r.reviewId),/Network timeout/);
  const requests=f.calls.filter(c=>c.endpoint==='payment_intents');assert.equal(requests.length,2);assert.equal(requests[0].key,requests[1].key);assert.equal(String(requests[0].body),String(requests[1].body));
  assert.equal(f.attempt.state,'submitting');
});
test('mismatched Stripe amount, metadata or payment method cannot update payment state',async()=>{
  const f=fixture();const r=await f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test');await f.service.confirmQuotePayment(f.admin,q.id,r.reviewId);
  const valid={id:'pi_test',livemode:false,metadata:{quote_id:q.id,option_id:option.id,bolt_payment_attempt:r.reviewId},amount:f.attempt.amount_cents,amount_received:f.attempt.amount_cents,currency:'usd',status:'succeeded',payment_method:'pm_saved'};
  for(const patch of [{amount:1},{amount_received:1},{currency:'eur'},{livemode:true},{payment_method:'pm_changed'},{metadata:{quote_id:'wrong'}},{id:'pi_other'},{status:'unexpected'}]) await assert.rejects(f.service.syncPaymentAttempt(f.admin,f.attempt,{...valid,...patch}));
});
test('authorization is not paid and changed funding or capture amount prevents capture',async()=>{
  for(const config of [{actualFunding:'debit'},{actualFunding:'unknown'},{intentPatch:{amount_capturable:1}},{intentPatch:{capture_method:'automatic'}}]) {
    const f=fixture(config);const r=await f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test');
    await assert.rejects(f.service.confirmQuotePayment(f.admin,q.id,r.reviewId));
    assert.equal(f.attempt.state,'processing');
    assert.ok(!f.calls.some(c=>c.endpoint.endsWith('/capture')));
    assert.ok(!f.writes.some(w=>w.args.p_state==='succeeded'));
  }
});
test('lost capture responses keep the bound intent and retry the same capture key',async()=>{
  const f=fixture({captureError:new Error('Capture timeout')});const r=await f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test');
  for(let i=0;i<2;i++)await assert.rejects(f.service.confirmQuotePayment(f.admin,q.id,r.reviewId),/Capture timeout/);
  assert.equal(f.calls.filter(c=>c.endpoint==='payment_intents').length,1);
  const captures=f.calls.filter(c=>c.endpoint.endsWith('/capture'));
  assert.equal(captures.length,2);assert.equal(captures[0].key,captures[1].key);
  assert.equal(f.attempt.stripe_payment_intent_id,'pi_test');assert.equal(f.attempt.state,'processing');
});
test('3DS returns a secret only after binding the intent and does not capture early',async()=>{
  const f=fixture({intentPatch:{status:'requires_action',client_secret:'pi_test_secret_test'}});
  const r=await f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test');
  const result=await f.service.confirmQuotePayment(f.admin,q.id,r.reviewId);
  assert.equal(result.clientSecret,'pi_test_secret_test');assert.equal(f.attempt.state,'requires_action');
  assert.equal(f.attempt.stripe_payment_method_id,'pm_saved');
  assert.ok(!f.calls.some(c=>c.endpoint.endsWith('/capture')));
});
test('manual ACH stays unpaid and exposes only a validated Stripe verification link',async()=>{
  const next_action={type:'verify_with_microdeposits',verify_with_microdeposits:{hosted_verification_url:'https://payments.stripe.com/test-verification'}};
  const f=fixture({funding:'us_bank_account',intentPatch:{status:'requires_action',next_action}});
  const r=await f.service.reviewQuotePayment(f.admin,q,'option','ctoken_test');
  const result=await f.service.confirmQuotePayment(f.admin,q.id,r.reviewId);
  assert.equal(result.bankVerificationUrl,'https://payments.stripe.com/test-verification');
  assert.equal(result.clientSecret,undefined);assert.equal(f.attempt.state,'requires_action');
  assert.ok(!f.calls.some(c=>c.endpoint.endsWith('/capture')));
  for(const url of ['javascript:alert(1)','https://payments.stripe.com.evil.test/','http://payments.stripe.com/','https://user:pass@payments.stripe.com/','invalid']) {
    assert.throws(()=>f.service.paymentNextAction({status:'requires_action',next_action:{...next_action,verify_with_microdeposits:{hosted_verification_url:url}}}));
  }
});
test('intent receipts require settled exact amounts, while legacy receipts remain compatible',()=>{
  const {normalizeStripeReceipt, stripeReceiptUrl}=loader()('lib/stripe-payments');
  assert.equal(stripeReceiptUrl('pi_test'),'https://api.stripe.com/v1/payment_intents/pi_test');
  assert.equal(stripeReceiptUrl('cs_test_old'),'https://api.stripe.com/v1/checkout/sessions/cs_test_old');
  for(const status of ['processing','requires_action','requires_payment_method','canceled']) assert.equal(normalizeStripeReceipt({object:'payment_intent',status,amount:100,amount_received:100}).payment_status,'unpaid');
  assert.equal(normalizeStripeReceipt({object:'payment_intent',status:'succeeded',amount:100,amount_received:99}).payment_status,'unpaid');
  assert.equal(normalizeStripeReceipt({object:'payment_intent',status:'succeeded',amount:100,amount_received:100}).payment_status,'paid');
  assert.throws(()=>stripeReceiptUrl('pi_bad/secret'));
});
