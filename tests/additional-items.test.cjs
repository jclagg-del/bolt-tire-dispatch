const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (file.endsWith('.module.css')) return { __esModule: true, default: {} };
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id === 'server-only' ? {} : id.startsWith('@/') ? load(id.slice(2)) : id.startsWith('.') ? load(path.resolve(path.dirname(file), id)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return mod.exports;
  };
}
const items = [
  { description: 'TPMS sensor', quantity: 2, unit_price: 42.50, taxable: true, quickbooks_item_id: '10', quickbooks_item_name: 'Sensors', quickbooks_company_id: 'company' },
  { description: 'Additional service', quantity: 1.5, unit_price: 20, taxable: false, quickbooks_item_id: '11', quickbooks_item_name: 'Labor', quickbooks_company_id: 'company' },
];
const rules = loader()('lib/additional-items');
test('additional item validation rejects missing, negative, nonfinite and malformed charges', () => {
  assert.equal(rules.additionalItemsError(items), null);
  assert.equal(rules.additionalItemsError([]), null);
  for (const patch of [{description:''},{description:'x'.repeat(501)},{quantity:0},{quantity:-1},{quantity:Infinity},{unit_price:-1},{unit_price:NaN},{unit_price:1.234},{taxable:'true'},{quickbooks_item_id:42}]) assert.ok(rules.additionalItemsError([{...items[0],...patch}]));
  assert.ok(rules.additionalItemsError({})); assert.ok(rules.additionalItemsError(Array(51).fill(items[0])));
});
test('taxable and exempt extra amounts round per line and apply once to standard and split quotes', () => {
  assert.deepEqual(rules.additionalItemsTotals(items), { total:115, taxable:85, nonTaxable:30 });
  assert.equal(rules.additionalItemAmount({quantity:3,unit_price:.1}),.3);
  const { quoteOptionTotal } = loader()('lib/quotes');
  const fees = { installation:100,serviceCall:0,disposal:14,stateFee:10,taxRate:8,taxExempt:false,additionalItems:items };
  assert.equal(quoteOptionTotal({price_per_tire:'100'},4,fees),686.92);
  assert.equal(quoteOptionTotal({price_per_tire:'100',rear_price_per_tire:'110'},2,fees,2),708.52);
  assert.equal(quoteOptionTotal({price_per_tire:'100'},4,{...fees,taxExempt:true}),639);
});
test('QuickBooks lines retain mapping, quantity, rate, description and exemption', () => {
  const catalog = items.map(i => ({id:i.quickbooks_item_id,company_id:'company',name:i.quickbooks_item_name}));
  const lines = rules.additionalInvoiceLines(items,catalog,false,'2026-10-06');
  assert.deepEqual(lines[0],{Amount:85,Description:'TPMS sensor',DetailType:'SalesItemLineDetail',SalesItemLineDetail:{ItemRef:{value:'10',name:'Sensors'},Qty:2,UnitPrice:42.50,TaxCodeRef:{value:'TAX'},ServiceDate:'2026-10-06'}});
  assert.equal(lines[1].SalesItemLineDetail.TaxCodeRef.value,'NON');
  assert.equal(rules.additionalInvoiceLines(items,catalog,true)[0].SalesItemLineDetail.TaxCodeRef.value,'NON');
  for(const bad of [[],catalog.map(p=>({...p,company_id:'other'}))]) assert.throws(()=>rules.additionalInvoiceLines(items,bad,false),/Map.*TPMS sensor/);
});
test('current QuickBooks installation and state-fee names match quoted category, not unrelated catalog items', () => {
  const {quickBooksBaseItems}=loader()('lib/quickbooks-base-items');
  const items=['Tires','On-Site Mount & Balance - Passenger Vehicle (3 - 4 Tires)','On-Site Mount & Balance - Light/Medium Truck (3 - 4 Tires)','NYS Tire Disposal Fee','Waste Tire Fee'].map((Name,i)=>({Id:String(i),Name,Type:'Service'}));
  assert.equal(quickBooksBaseItems(items,'passenger',4).installationItem.Id,'1');
  assert.equal(quickBooksBaseItems(items,'truck',4).installationItem.Id,'2');
  assert.equal(quickBooksBaseItems(items,'passenger',4).stateTireFeeItem.Id,'3');
  assert.equal(quickBooksBaseItems(items,null,4).installationItem,undefined);
  assert.equal(quickBooksBaseItems(items,'passenger',2).installationItem,undefined);
});
test('paid job conversion retains extra lines and keeps their non-taxable amount out of the tax basis', () => {
  const {websitePaymentFields} = loader()('lib/paid-website-order');
  const job = websitePaymentFields({id:'q',quantity:4,installation_cost:100,service_call_fee:0,disposal_fee:14,ny_state_tire_fee:10,additional_items:items,stripe_sales_tax_amount:47.92,amount_paid:686.92}, {brand:'Brand',model:'Model',price_per_tire:100});
  assert.deepEqual(job.additional_items,items); assert.equal(job.subtotal,639); assert.equal(job.sales_tax_rate,8); assert.equal(job.job_total,686.92);
});
test('staff editor and customer summary show explicit line quantities and totals without internal mappings', () => {
  const load=loader({'@/lib/supabase':{supabase:{}}});
  const Editor=load('components/AdditionalItemsEditor').default;
  const html=renderToStaticMarkup(React.createElement(Editor,{items,onChange(){}}));
  for(const text of ['QuickBooks product / service','Description','Quantity','Unit price','Taxable','85.00','115.00','Add item or service']) assert.ok(html.includes(text),text);
  const Summary=load('components/AdditionalItemsSummary').default;
  const publicHtml=renderToStaticMarkup(React.createElement(Summary,{items}));
  for(const text of ['TPMS sensor','85.00','30.00','Non-taxable']) assert.ok(publicHtml.includes(text));
  assert.ok(!publicHtml.includes('company')); assert.ok(!publicHtml.includes('Sensors'));
});
test('QuickBooks catalog paginates and excludes categories and groups', async () => {
  const calls=[];
  const load=loader({'@/lib/quickbooks':{getConnection:async()=>({realm_id:'company'}),quickBooksRequest:async url=>{
    calls.push(decodeURIComponent(url));
    return {QueryResponse:{Item:calls.length===1?Array.from({length:1000},(_,i)=>({Id:String(i),Name:`Item ${i}`,Type:i===0?'Category':'Service',UnitPrice:10})): [{Id:'1001',Name:'Sensor',Type:'Inventory'},{Id:'1002',Name:'Bundle',Type:'Group'}]}};
  }}});
  const catalog=await load('lib/quickbooks-items').quickBooksItems();
  assert.equal(catalog.length,1000); assert.match(calls[1],/startposition 1001/); assert.ok(catalog.every(p=>p.company_id==='company')); assert.ok(!catalog.some(p=>p.name==='Bundle'));
});
test('staff and both customer quote views show the same extras and tax-inclusive totals', () => {
  const quote={id:'q',quote_number:123,customer:'Example',quantity:4,installation_cost:100,service_call_fee:0,disposal_fee:14,ny_state_tire_fee:10,sales_tax_rate:8,tax_exempt:false,additional_items:items,quote_options:[{id:'opt',brand:'Test',model:'Tire',price_per_tire:100,sort_order:0}],selected_option_id:'opt'};
  for(const surface of ['staff','customer','direct']) {
    let index=0;
    const Page=loader({react:{...React,useEffect(){},useState:initial=>[index++===0?quote:index===2&&surface==='staff'?false:initial,()=>{}]},'next/navigation':{useParams:()=>({id:'q',token:'token'}),useRouter:()=>({}),useSearchParams:()=>new URLSearchParams(surface==='direct'?'purchase=1':'')},'@/components/AppHeader':()=>null,'@/lib/supabase':{supabase:{}}})
      (surface==='staff'?'app/quotes/[id]/page':'app/q/[token]/page').default;
    const html=renderToStaticMarkup(React.createElement(Page));
    for(const text of ['TPMS sensor','85.00','Additional service','30.00',surface==='direct'?'639.00':'686.92']) assert.ok(html.includes(text),`${surface}: ${text}`);
  }
});
test('paid quote and website receipts show collected tax and actual payment instead of stale estimates', () => {
  const quote={quote_number:6,customer:'QA',quantity:4,installation_cost:103,service_call_fee:0,disposal_fee:14.42,ny_state_tire_fee:10,sales_tax_rate:0,tax_exempt:false,additional_items:[],payment_pricing_version:1,payment_status:'paid',amount_paid:624.28,stripe_sales_tax_amount:48.81,selected_option_id:'chosen',quote_options:[{id:'chosen',brand:'Paid tire',model:'Selected',price_per_tire:103},{id:'other',brand:'Unpurchased tire',model:'Other',price_per_tire:200}]};
  for (const purchase of [false,true]) {
    let index=0;
    const Page=loader({react:{...React,useEffect(){},useState:initial=>[index++===0?quote:initial,()=>{}]},'next/navigation':{useParams:()=>({token:'test'}),useSearchParams:()=>new URLSearchParams(purchase?'purchase=1':'')},'@/lib/supabase':{supabase:{}}})('app/q/[token]/page').default;
    const html=renderToStaticMarkup(React.createElement(Page));
    assert.ok(html.includes('Amount paid: $624.28'));
    assert.ok(html.includes('Sales tax included: $48.81'));
    assert.ok(!html.includes('Unpurchased tire'));
    assert.ok(!html.includes('0%'));
    if (!purchase) assert.ok(html.includes('Total paid'));
  }
});
test('invoice route fails before any external writes for an unmapped extra and sends mapped lines once', async () => {
  for (const [mapped, modernCatalog] of [[false,false],[true,false],[true,true]]) {
    const job={id:1,complete:true,customer:'Example',qty:4,price_tires:100,installation_cost:100,tire_disposal_fee:0,ny_state_tire_fee:10,additional_items:items};
    const calls=[],updates=[];
    const admin={from:()=>({select(){return this},eq(){return this},single:async()=>({data:job}),maybeSingle:async()=>({data:{service_category:'passenger'}}),update(v){updates.push(v);return this},then(resolve){resolve({})}})};
    const catalog=items.map(i=>({id:i.quickbooks_item_id,company_id:'company',name:i.quickbooks_item_name}));
    const route=loader({'@/lib/supabase/admin':{requireApiUser:async()=>({id:'staff'}),createAdminClient:()=>admin},'@/lib/quickbooks-items':{quickBooksItems:async()=>mapped?catalog:[]},'@/lib/quickbooks':{escapeQueryValue:x=>x,quickBooksRequest:async(url,init)=>{
      calls.push({url,init});
      if(init?.method==='POST'){assert.equal(url,'/invoice');return {Invoice:{Id:'inv',TotalAmt:639,Balance:639}};}
      if(decodeURIComponent(url).includes('from Customer'))return {QueryResponse:{Customer:[{Id:'customer',DisplayName:'Example'}]}};
      return {QueryResponse:{Item:(modernCatalog?['Tires','On-Site Mount & Balance - Passenger Vehicle (3 - 4 Tires)','NYS Tire Disposal Fee','Waste Tire Fee']:['Tires','On-site Mount and Balance','NY State Tire Tax','Waste Tire Fee']).map((Name,i)=>({Id:String(i),Name,Type:'Service'}))}};
    }}})('app/api/quickbooks/invoices/route');
    const response=await route.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({jobId:1})}));
    assert.equal(response.status,mapped?200:500);
    if(!mapped){assert.equal(calls.length,0);assert.equal(updates.length,0);continue;}
    const invoice=JSON.parse(calls.find(c=>c.url==='/invoice').init.body);
    assert.equal(invoice.Line.filter(l=>l.Description==='TPMS sensor').length,1);
    assert.equal(invoice.Line.reduce((s,l)=>s+l.Amount,0),625);
    assert.ok(!invoice.Line.some(l=>l.Description==='Waste tire fee'));
  }
});
