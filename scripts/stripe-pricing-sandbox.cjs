/* Local-only Stripe sandbox verifier. Never accepts a live or unrestricted key.
 * Credentials stay in process memory; no database, email, or production app calls.
 * Run: node scripts/stripe-pricing-sandbox.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../lib/payment-method-pricing.ts');
const pricingModule = new Module(filename, module);
pricingModule._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { verifiedPaymentAmount } = pricingModule.exports;
const port = 43871;
const origin = `http://127.0.0.1:${port}`;
const nonce = crypto.randomBytes(24).toString('hex');
let key = '';
let publishableKey = '';
const reviews = new Map();
let running = false;
let completed = false;
const results = [];
const intents = [];
function clean(value) {
  return String(value).replace(/(?:rk|sk|pk)_(?:test|live)_[A-Za-z0-9]+/g, '[redacted]');
}
async function stripe(endpoint, data, idempotencyKey) {
  if (!/^rk_test_[A-Za-z0-9]+$/.test(key)) throw new Error('Restricted test key required.');
  const headers = { Authorization: `Bearer ${key}` };
  if (data) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: data ? 'POST' : 'GET', headers,
    body: data ? new URLSearchParams(data) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(clean(`${response.status}: ${body.error?.message || 'Stripe request failed'}`));
  if (body.livemode === true) throw new Error('Live object rejected.');
  return body;
}
async function record(name, action) {
  try { results.push({ name, passed: true, ...await action() }); }
  catch (error) { results.push({ name, passed: false, error: clean(error.message) }); }
  console.log(JSON.stringify(results.at(-1)));
}
async function run() {
  running = true;
  const runId = crypto.randomUUID();
  for (const [name, pm, expected, amount] of [
    ['Credit', 'pm_card_visa', 'credit', 103000],
    ['Debit', 'pm_card_visa_debit', 'debit', 100000],
    ['Prepaid', 'pm_card_mastercard_prepaid', 'prepaid', 100000],
    ['ACH pending', 'pm_usBankAccount_processing', 'us_bank_account', 100000],
  ]) {
    await record(name, async () => {
      // These Stripe-provided methods verify account capabilities and pricing.
      // The separate browser/ConfirmationToken workflow still needs end-to-end QA.
      const verified = await stripe(`payment_methods/${pm}`);
      const funding = verified.card?.funding || verified.type;
      if (funding !== expected) throw new Error(`Expected ${expected}, received ${funding}`);
      const price = verifiedPaymentAmount(100000, verified);
      if (price.amountCents !== amount) throw new Error('Incorrect verified price');
      const params = {
        amount: String(price.amountCents), currency: 'usd', confirm: 'true',
        confirmation_method: verified.type === 'card' ? 'manual' : 'automatic',
        payment_method: pm,
        'payment_method_types[0]': verified.type,
        'metadata[bolt_sandbox_verification]': runId,
        description: `TEST ONLY — payment-method pricing ${name}`,
      };
      if (funding === 'us_bank_account') {
        params['mandate_data[customer_acceptance][type]'] = 'offline';
      }
      const idempotencyKey = `bolt-sandbox-${runId}-${expected}`;
      const intent = await stripe('payment_intents', params, idempotencyKey);
      intents.push(intent.id);
      const replay = await stripe('payment_intents', params, idempotencyKey);
      if (replay.id !== intent.id) throw new Error('Idempotent retry created a second payment');
      const expectedStatus = funding === 'us_bank_account' ? 'processing' : 'succeeded';
      if (intent.status !== expectedStatus) throw new Error(`Expected ${expectedStatus}, received ${intent.status}`);
      if (intent.amount !== amount) throw new Error('Stripe amount mismatch');
      return { funding, amount: intent.amount / 100, status: intent.status, confirmationMethod: intent.confirmation_method, intent: intent.id, duplicatePrevented: true };
    });
  }
  await record('New York sandbox tax calculation and payment', async () => {
    const calculation = await stripe('tax/calculations', {
      currency: 'usd', 'line_items[0][amount]': '103000',
      'line_items[0][reference]': 'sandbox-test', 'line_items[0][tax_code]': 'txcd_99999999',
      'customer_details[address][line1]': '123 Main St',
      'customer_details[address][city]': 'New York',
      'customer_details[address][state]': 'NY',
      'customer_details[address][postal_code]': '10001',
      'customer_details[address][country]': 'US', 'customer_details[address_source]': 'billing',
    });
    if (!(calculation.tax_amount_exclusive > 0) || calculation.amount_total !== 103000 + calculation.tax_amount_exclusive) {
      throw new Error('Expected positive New York tax and an exact subtotal-plus-tax total');
    }
    const intent = await stripe('payment_intents', {
      amount: String(calculation.amount_total), currency: 'usd', confirm: 'true', confirmation_method: 'manual',
      payment_method: 'pm_card_visa', 'payment_method_types[0]': 'card',
      'hooks[inputs][tax][calculation]': calculation.id,
      description: 'TEST ONLY — manual confirmation with tax hook',
      'metadata[bolt_sandbox_verification]': runId,
    }, `bolt-sandbox-tax-${runId}`);
    if (intent.status !== 'succeeded') throw new Error('Tax-hook test payment did not succeed');
    if (intent.amount_received !== calculation.amount_total) throw new Error('Settled test amount differs from tax-inclusive total');
    return { calculation: calculation.id, subtotal: 1030, total: calculation.amount_total / 100, tax: calculation.tax_amount_exclusive / 100, taxBreakdown: calculation.tax_breakdown, positiveTaxAndTotalValidated: true, taxHookAccepted: true, intent: intent.id };
  });
  running = false;
  completed = true;
}
const page = `<!doctype html><html><head><meta charset="utf-8"><title>Bolt Tire — Stripe sandbox verification</title><script src="https://js.stripe.com/endive/stripe.js"></script>
<style>body{font:17px system-ui;margin:45px auto;max-width:850px;padding:20px;color:#172039}h1{font-size:30px}.notice{padding:20px;background:#fff6bf;border-radius:12px}label{display:block;margin:24px 0 8px}input{padding:12px;width:95%}button{margin:18px 0;padding:13px 20px;background:#255dee;color:white;border:0;border-radius:8px;font:inherit}pre{white-space:pre-wrap;background:#f3f6fa;padding:18px;border-radius:12px}</style></head>
<body><h1>Bolt Tire payment verification</h1><p class="notice">TEST MODE ONLY · No real charges · No customer emails · Live checkout unchanged</p>
<p>Verify $1,030 credit and $1,000 ACH/debit/prepaid pricing with Stripe-provided test methods.</p>
<form id="setup"><label for="key">Restricted test key</label><input type="password" id="key" autocomplete="off" required><label for="publishable">Publishable test key</label><input id="publishable" autocomplete="off" required><button>Connect test key</button></form>
<button id="run" hidden>Run simulated payment checks</button><pre id="result">Waiting for the restricted test connection.</pre>
<section id="interactive" hidden><h2>Browser payment test</h2><p>Regular credit price: $1,030 · ACH/debit/prepaid price: $1,000<br>This sample is tax-exclusive and is not a customer order.</p><label for="family">Payment method</label><select id="family"><option value="card">Card</option><option value="us_bank_account">ACH bank transfer</option></select><div id="payment"></div><button id="review">Review verified price</button><pre id="review-result"></pre><button id="confirm" hidden>Confirm simulated payment</button></section>
<script>
const nonce=${JSON.stringify(nonce)};
let stripeClient,elements,paymentElement,reviewId;
function mountPayment(){paymentElement?.destroy();const family=document.querySelector('#family').value;elements=stripeClient.elements({mode:'payment',amount:family==='card'?103000:100000,currency:'usd',captureMethod:family==='card'?'manual':'automatic',allowedPaymentMethodTypes:[family]});paymentElement=elements.create('payment',{layout:'tabs'});paymentElement.mount('#payment');document.querySelector('#confirm').hidden=true;}
document.querySelector('#family').onchange=mountPayment;
async function post(url,data){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Sandbox-Nonce':nonce},body:JSON.stringify(data)});const b=await r.json();if(!r.ok)throw new Error(b.error);return b;}
document.querySelector('#setup').onsubmit=async e=>{e.preventDefault();try{const config=await post('/connect',{key:document.querySelector('#key').value,publishableKey:document.querySelector('#publishable').value});document.querySelector('#key').value='';document.querySelector('#setup').hidden=true;document.querySelector('#run').hidden=false;document.querySelector('#result').textContent='Restricted test connection ready.';stripeClient=Stripe(config.publishableKey);mountPayment();document.querySelector('#interactive').hidden=false;}catch(e){document.querySelector('#result').textContent=e.message;}};
document.querySelector('#run').onclick=async()=>{document.querySelector('#run').disabled=true;try{await post('/run',{});const timer=setInterval(async()=>{const r=await fetch('/status');const s=await r.json();document.querySelector('#result').textContent=JSON.stringify(s,null,2);if(s.completed)clearInterval(timer);},1000);}catch(e){document.querySelector('#result').textContent=e.message;}};
document.querySelector('#review').onclick=async()=>{const button=document.querySelector('#review');button.disabled=true;document.querySelector('#confirm').hidden=true;try{const submitted=await elements.submit();if(submitted.error)throw new Error(submitted.error.message);const token=await stripeClient.createConfirmationToken({elements,params:{return_url:location.origin,payment_method_data:{billing_details:{name:'Bolt Sandbox Test'}}}});if(token.error)throw new Error(token.error.message);const review=await post('/review',{confirmationToken:token.confirmationToken.id});reviewId=review.reviewId;document.querySelector('#review-result').textContent=JSON.stringify(review,null,2);document.querySelector('#confirm').hidden=false;}catch(e){document.querySelector('#review-result').textContent=e.message;}finally{button.disabled=false;}};
document.querySelector('#confirm').onclick=async()=>{const button=document.querySelector('#confirm');button.disabled=true;try{let result=await post('/confirm',{reviewId});if(result.status==='requires_action'){const next=await stripeClient.handleNextAction({clientSecret:result.clientSecret});if(next.error)throw new Error(next.error.message);result=await post('/confirm',{reviewId});}delete result.clientSecret;document.querySelector('#review-result').textContent=JSON.stringify(result,null,2);}catch(e){document.querySelector('#review-result').textContent=e.message;}finally{button.disabled=false;button.hidden=true;}};
</script></body></html>`;
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); res.end(); return; }
  if (req.method === 'GET' && req.url === '/') { res.setHeader('Content-Type','text/html');res.end(page);return; }
  res.setHeader('Content-Type','application/json');
  if (req.method === 'GET' && req.url === '/status') { res.end(JSON.stringify({ running, completed, results }));return; }
  if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-sandbox-nonce'] !== nonce) {
    res.writeHead(403);res.end(JSON.stringify({error:'Forbidden'}));return;
  }
  try {
    let raw='';for await (const chunk of req) {raw+=chunk;if(raw.length>4096)throw new Error('Request too large');}
    const data=JSON.parse(raw);
    if(req.url==='/connect') {
      if(key || !/^rk_test_[A-Za-z0-9]+$/.test(data.key || '') || !/^pk_test_[A-Za-z0-9]+$/.test(data.publishableKey || ''))throw new Error('Use TEST keys, once only.');
      key=data.key;publishableKey=data.publishableKey;res.end(JSON.stringify({connected:true,publishableKey}));return;
    }
    if(req.url==='/run') {
      if(!key||running||completed)throw new Error('Checks require a connected key and can run once.');
      void run();res.end(JSON.stringify({started:true}));return;
    }
    if(req.url==='/review') {
      if(!/^ctoken_[A-Za-z0-9]+$/.test(data.confirmationToken || ''))throw new Error('Confirmation token required');
      const token=await stripe(`confirmation_tokens/${data.confirmationToken}`);
      const price=verifiedPaymentAmount(100000,token.payment_method_preview);
      const reviewId=crypto.randomUUID();
      const funding=token.payment_method_preview.card?.funding || token.payment_method_preview.type;
      reviews.set(reviewId,{token:token.id,price,funding});
      res.end(JSON.stringify({reviewId,funding,amount:price.amountCents/100,discount:price.discountCents/100}));return;
    }
    if(req.url==='/confirm') {
      const review=reviews.get(data.reviewId);
      if(!review)throw new Error('Review required');
      // Same server-retrieved token and amount; no client payment method or amount accepted.
      review.promise ||= stripe('payment_intents',{
        amount:String(review.price.amountCents),currency:'usd',confirm:'true',confirmation_method:'automatic',...(review.funding==='us_bank_account'?{}:{capture_method:'manual'}),use_stripe_sdk:'true',
        confirmation_token:review.token,'payment_method_types[0]':review.funding==='us_bank_account'?'us_bank_account':'card',
        description:'TEST ONLY — browser funding verification',
        'metadata[bolt_sandbox_verification]':data.reviewId,
      },`bolt-browser-${data.reviewId}`);
      const created=await review.promise;
      review.paymentMethod ||= created.payment_method;
      let intent=await stripe(`payment_intents/${created.id}`);
      if(intent.payment_method!==review.paymentMethod)throw new Error('Payment method changed after review');
      if(intent.status==='requires_capture') {
        const method=await stripe(`payment_methods/${review.paymentMethod}`);
        if(method.card?.funding!==review.funding||intent.amount_capturable!==review.price.amountCents)throw new Error('Capture funding or amount mismatch');
        intent=await stripe(`payment_intents/${created.id}/capture`,{
          amount_to_capture:String(review.price.amountCents),
        },`bolt-browser-capture-${data.reviewId}`);
      }
      if(intent.amount!==review.price.amountCents)throw new Error('Reviewed amount changed');
      if(intent.status==='succeeded'&&intent.amount_received!==intent.amount)throw new Error('Settlement mismatch');
      const result={funding:review.funding,amount:intent.amount/100,status:intent.status,intent:intent.id,confirmationMethod:intent.confirmation_method,captureMethod:intent.capture_method,clientSecret:intent.status==='requires_action'?intent.client_secret:undefined};
      if(review.recordedState!==intent.status){results.push({name:'Browser verified payment',passed:intent.status===(review.funding==='us_bank_account'?'processing':'succeeded'),...result,clientSecret:undefined});console.log(JSON.stringify(results.at(-1)));review.recordedState=intent.status;}
      res.end(JSON.stringify(result));return;
    }
    res.writeHead(404);res.end('{}');
  } catch(e) {res.writeHead(400);res.end(JSON.stringify({error:clean(e.message)}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Sandbox verifier: ${origin}`));
process.on('SIGINT',()=>{key='';server.close();process.exit(0);});
