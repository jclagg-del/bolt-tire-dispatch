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
const {matchesTireStock}=loader()('lib/tire-stock-filter.ts');
test('only authenticated staff catalog requests include unavailable USAF tires',async()=>{
 let authenticated=false;
 const searches=[];
 const route=loader({
  '@/lib/supabase/admin':{requireApiUser:async()=>authenticated?{id:'staff'}:null},
  '@/lib/atd':{atdEnvironment:'production',searchAtdBySize:async()=>[],searchAtdByPartNumber:async()=>[]},
  '@/lib/usaf-catalog':{searchUsafBySize:async(...args)=>{searches.push(args);return [];},searchUsafByPartNumber:async(...args)=>{searches.push(args);return [];}},
  '@/lib/ntw':{ntwEnvironment:'sandbox',searchNtwBySize:async()=>[],searchNtwByPartNumber:async()=>[]},
  '@/lib/inventory-match-audit':{auditSupplierMatches:async()=>{}},
  '@/lib/tire-library':{enrichWithTireLibrary:async p=>p,sanitizeVehicleFitments:()=>[{position:'both'}],tireLibraryFitmentSize:()=> '2755520'},
 })('app/api/atd/route.ts');
 const request=body=>route.POST(new Request('https://example.test/api/atd',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await request({action:'size',query:'2755520',includeOutOfStock:true})).status,200);
 assert.deepEqual(searches.pop(),['2755520',false,'customer',false]);
 assert.equal((await request({action:'size',query:'2755520',internal:true})).status,401);
 assert.equal(searches.length,0);
 authenticated=true;
 for(const action of ['size','part-number','fitment-products']){
  assert.equal((await request({action,query:'2755520',internal:true})).status,200);
  assert.deepEqual(searches.pop(),['2755520',true,'staff',true]);
 }
});
test('stock filter explicitly includes unavailable tires only when checked',()=>{
 const local={availability:{local:2,localPlus:0,nationwide:0}};
 const distant={availability:{local:0,localPlus:0,nationwide:8}};
 const empty={availability:{local:0,localPlus:0,nationwide:0}};
 assert.equal(matchesTireStock(local,true,false),true);
 assert.equal(matchesTireStock(distant,true,false),false);
 assert.equal(matchesTireStock(distant,false,false),true);
 assert.equal(matchesTireStock(empty,false,false),false);
 assert.equal(matchesTireStock(empty,false,true),true);
 assert.equal(matchesTireStock(empty,true,true),true);
});

test('staff checkbox shows and labels unavailable tires, prefers stocked offers, and stays off the public shop',()=>{
 const base={brand:'GENERAL',model:'Grabber H/T',size:'275/55R20',loadSpeed:'117 T',loadRange:'XL',sidewall:'BSW',category:'Highway',warranty:'70000',snowRated:false,runFlat:false,hasRebate:false,rebates:[],serviceCategory:'passenger',fitmentPosition:'both',imageUrl:null,availability:{local:0,localPlus:0,nationwide:0},quotePrice:200,cost:150,installedPrice:300,estimatedTotals:{4:1200}};
 const empty={...base,id:'empty',supplier:'ATD',atdProductNumber:'empty',manufacturerProductNumber:'empty'};
 const cheap={...base,id:'cheap',supplier:'ATD',atdProductNumber:'stocked',manufacturerProductNumber:'stocked'};
 const stocked={...cheap,id:'USAF-stocked',supplier:'USAF',quotePrice:220,cost:200,availability:{local:4,localPlus:0,nationwide:4},estimatedTotals:{4:1280}};
 for(const internal of [true,false]) for(const showOutOfStock of [false,true]){
  let index=0;
  const Page=loader({'next/navigation':{useRouter:()=>({})},'@/lib/supabase':{supabase:{}},react:{...React,useState:initial=>{const n=index++;const overrides={0:'2755520',1:[empty,cheap,stocked],3:true,6:!internal,12:'size',47:showOutOfStock};return [Object.hasOwn(overrides,n)?overrides[n]:typeof initial==='function'?initial():initial,()=>{}]}}})('components/TireShoppingBeta.tsx').default;
  const html=renderToStaticMarkup(React.createElement(Page,{internal}));
  assert.equal((html.match(/<article /g)||[]).length,internal&&showOutOfStock?2:1);
  if(internal){
   assert.match(html,/Show out-of-stock tires/);
   assert.ok(html.includes('$220.00'));
   if(showOutOfStock){assert.match(html,/Out of stock — availability not confirmed/);assert.match(html,/<button[^>]*disabled=""[^>]*>Out of stock<\/button>/);}
   else assert.doesNotMatch(html,/Out of stock —/);
  }else assert.doesNotMatch(html,/Show out-of-stock tires|Out of stock —|Supplier cost/);
 }
});
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

test('staff and customer shops render two distinct Grabber variants instead of four supplier cards',()=>{
 const base={brand:'GENERAL',model:'Grabber H/T',size:'275/55R20',loadRange:'XL',sidewall:'BSW',category:'Highway',warranty:'70000',snowRated:false,runFlat:false,hasRebate:false,rebates:[],serviceCategory:'passenger',fitmentPosition:'both',imageUrl:null,availability:{local:4,localPlus:20,nationwide:24}};
 const t={...base,id:'04493920000',supplier:'ATD',atdProductNumber:'04493920000',manufacturerProductNumber:'04493920000',loadSpeed:'117 T',quotePrice:215.99,cost:150,installedPrice:300,estimatedTotals:{4:1200}};
 const h={...t,id:'04493930000',atdProductNumber:'04493930000',manufacturerProductNumber:'04493930000',loadSpeed:'117 H',quotePrice:219.99};
 const products=[t,h,{...t,id:'USAF-t',supplier:'USAF',manufacturerProductNumber:'051342174898'},{...h,id:'USAF-h',supplier:'USAF',manufacturerProductNumber:'051342175024'}];
 for(const internal of [false,true]){
  let index=0;
  const Page=loader({'next/navigation':{useRouter:()=>({})},'@/lib/supabase':{supabase:{}},react:{...React,useState:initial=>{const n=index++;const overrides={0:'2755520',1:products,3:true,12:'size'};return [Object.hasOwn(overrides,n)?overrides[n]:typeof initial==='function'?initial():initial,()=>{}]}}})('components/TireShoppingBeta.tsx').default;
  const html=renderToStaticMarkup(React.createElement(Page,{internal}));
  assert.equal((html.match(/<article /g)||[]).length,2);assert.ok(html.includes('117 T'));assert.ok(html.includes('117 H'));assert.ok(html.includes('2 tires'));
  if(internal){assert.ok(html.includes('U.S. AutoForce'));assert.ok(html.includes('ATD'));assert.equal((html.match(/Choose supplier<\/button>/g)||[]).length,2);}
  else{assert.doesNotMatch(html,/Supplier cost|Cost \$150/);assert.equal((html.match(/Customize &amp; buy/g)||[]).length,2);}
 }
});
