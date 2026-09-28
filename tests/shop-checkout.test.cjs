const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); cache.set(file, mod); mod.paths = module.paths;
    mod.require = id => id === 'server-only' ? {} : Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2)) : id.startsWith('.') ? load(path.resolve(path.dirname(file), id)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return mod.exports;
  }
  return load;
}
const valid = { name: 'Test Customer', phone: '(201) 555-0123', email: 'customer@example.com', vehicle: '2020 Ford Transit', address: '123 Example Street' };
const { shopCustomerError, normalizeShopCustomer } = loader()('lib/shop-customer.ts');
test('all five checkout fields are required; whitespace and invalid phone/email are rejected', () => {
  assert.equal(shopCustomerError(valid), null);
  for (const field of Object.keys(valid)) for (const value of ['', '   ', null, undefined, {}]) {
    assert.ok(shopCustomerError({ ...valid, [field]: value }), `${field} must not be empty`);
  }
  for (const phone of ['123', 'abcdefghij', '+1234567890123456']) assert.ok(shopCustomerError({ ...valid, phone }));
  for (const email of ['abc', 'a@', 'a b@example.com']) assert.ok(shopCustomerError({ ...valid, email }));
  assert.deepEqual(normalizeShopCustomer(Object.fromEntries(Object.entries(valid).map(([k,v]) => [k, `  ${v}  `]))), valid);
});

test('quote endpoint rejects missing checkout info before any supplier calls or database writes', async () => {
  const unexpected = () => { throw new Error('No side effects allowed for invalid customer'); };
  const route = loader({
    '@/lib/atd': { searchAtdBySize: unexpected }, '@/lib/usaf-catalog': { searchUsafBySize: unexpected },
    '@/lib/supabase/admin': { createAdminClient: unexpected }, '@/lib/shop-availability': { availableShopTimes: unexpected },
  })('app/api/public/shop/quote/route.ts');
  for (const service of ['installation', 'tires_only']) for (const field of Object.keys(valid)) {
    const response = await route.POST(new Request('https://example.test/api/public/shop/quote', { method:'POST', body:JSON.stringify({ ...valid, [field]:' ', service }) }));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).error);
  }
});

test('website quotes with incomplete details cannot proceed to Stripe payment', async () => {
  const previous = { secret: process.env.STRIPE_SECRET_KEY, public: process.env.STRIPE_PUBLISHABLE_KEY };
  process.env.STRIPE_SECRET_KEY = 'unit-test-only'; process.env.STRIPE_PUBLISHABLE_KEY = 'unit-test-only';
  let quote;
  const query = { select(){return query;}, eq(){return query;}, single:async()=>({data:quote}) };
  const route = loader({ '@/lib/supabase/admin': { createAdminClient:()=>({from:()=>query}) } })('app/api/public/quotes/[token]/checkout/route.ts');
  try {
    for (const field of Object.keys(valid)) {
      quote = {...valid, customer:valid.name, contact_name:valid.name, purchase_source:'website', [field]:' '};
      if(field==='name') quote.customer=quote.contact_name=' ';
      const response = await route.POST(new Request('https://example.test/api/public/quotes/example/checkout', { method:'POST',body:JSON.stringify({optionId:'unused'}) }), {params:Promise.resolve({token:'example'})});
      assert.equal(response.status,400);
      assert.match((await response.json()).error,/before payment/);
    }
  } finally {
    if(previous.secret===undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY=previous.secret;
    if(previous.public===undefined) delete process.env.STRIPE_PUBLISHABLE_KEY; else process.env.STRIPE_PUBLISHABLE_KEY=previous.public;
  }
});

function renderCheckout(customer, service = 'installation') {
  let index=0;
  const states = {0:{query:'2457017',quantity:4,products:[{id:'tire',brand:'Example',model:'Tire',size:'245/70R17',quotePrice:100,serviceCategory:'passenger',fitmentPosition:'both'}]},1:{passenger:{two:100,four:200},truck:{two:150,four:250,six:350},disposal:{passenger:5,truck:10},stateFee:2.5,taxRate:8},2:service,3:customer,6:{date:'2026-10-01',time:'09:00'}};
  const Page=loader({'next/navigation':{useRouter:()=>({})},react:{...React,useState:initial=>{const n=index++;return [Object.hasOwn(states,n)?states[n]:initial,()=>{}];}}})('app/shop/configure/page.tsx').default;
  return renderToStaticMarkup(React.createElement(Page));
}
test('checkout visibly marks all fields required and blocks incomplete installation and tires-only forms', () => {
  for(const service of ['installation','tires_only']) {
    const html=renderCheckout(valid,service);
    for(const label of ['Name','Phone','Email','Vehicle','Service address']) assert.ok(html.includes(`${label} *`));
    assert.equal((html.match(/required=""/g)||[]).length,5);
    assert.doesNotMatch(html,/<button disabled="">Continue to secure payment/);
    for(const field of Object.keys(valid)) assert.match(renderCheckout({...valid,[field]:''},service),/<button disabled="">Continue to secure payment/);
  }
});

test('staff and public size searches start empty while saved quote searches remain restorable', () => {
  for(const internal of [true,false]) {
    let index=0;
    const Page=loader({
      'next/navigation':{useRouter:()=>({})}, '@/lib/supabase':{supabase:{}},
      react:{...React,useState:initial=>{const n=index++;return [n===12?'size':typeof initial==='function'?initial():initial,()=>{}];}},
    })('components/TireShoppingBeta.tsx').default;
    const html=renderToStaticMarkup(React.createElement(Page,{internal}));
    assert.match(html,/placeholder="Enter tire size" value=""/);
    assert.doesNotMatch(html,/value="2756518"|placeholder="2756518"/);
  }
  const source=fs.readFileSync(path.join(__dirname,'../components/TireShoppingBeta.tsx'),'utf8');
  assert.match(source,/setQuery\(saved.query\)/);
});
