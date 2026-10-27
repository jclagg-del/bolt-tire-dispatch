const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');

function fixture({ authenticated = true, linked = false, complete = true, balance = 1213.43, missingTires = false, role = 'office', passwordChange = false } = {}) {
  const calls = [], updates = [];
  const job = { id: 418, complete, customer: 'TEST ONLY', address:'123 Test Street, Pine Bush, NY 12566', scheduled:'2026-10-27T10:00:00', qty: 4, price_tires: 200, installation_cost: 299,
    tire_disposal_fee: 14, ny_state_tire_fee: 10, additional_items: [], quickbooks_invoice_id: linked ? 'invoice-test' : null };
  const catalog = [{Id:'tire',Name:'Tires',Type:'NonInventory'},
    {Id:'passenger4',Name:'On-Site Mount & Balance - Passenger Vehicle (3 - 4 Tires)',Type:'Service'},
    {Id:'truck4',Name:'On-Site Mount & Balance - Light/Medium Truck (3 - 4 Tires)',Type:'Service'},
    {Id:'state',Name:'NYS Tire Disposal Fee',Type:'Service'}, {Id:'disposal',Name:'Waste Tire Fee',Type:'Service'},
    {Id:'category',Name:'Mount and balance',Type:'Category'}].filter(i => !missingTires || i.Id !== 'tire');
  const invoice = {Id:'invoice-test',DocNumber:'TEST123',CustomerRef:{name:'TEST ONLY'},TotalAmt:1213.43,Balance:balance,TxnTaxDetail:{TotalTax:90.43},Line:[]};
  const admin = {from:table=>({select(){return this},eq(){return this},single:async()=>({data:job}),maybeSingle:async()=>({data:table==='staff_security'?{role,password_change_required:passwordChange}:null}),update(v){updates.push(v);return this},then(resolve){resolve({})}})};
  const cache = new Map();
  function load(file) {
    file = path.resolve(__dirname,'..', file);
    if (!path.extname(file)) file += fs.existsSync(file+'.ts') ? '.ts' : '.tsx';
    if(cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file,module);mod.paths=module.paths;cache.set(file,mod);
    mod.require = name => name === '@/lib/supabase/admin' ? {createAdminClient:()=>admin,requireApiUser:async()=>authenticated?{id:'staff'}:null}
      : name === '@/lib/quickbooks-items' ? {quickBooksItems:async()=>[]}
      : name === '@/lib/quickbooks' ? {escapeQueryValue:x=>x,getConnection:async()=>({realm_id:'company'}),quickBooksRequest:async(url,init)=>{
        calls.push({url,init});
        if(url==='/invoice' && init?.method==='POST') { invoice.Line=JSON.parse(init.body).Line;return {Invoice:invoice}; }
        if(url==='/invoice/invoice-test') return {Invoice:invoice};
        if(url==='/companyinfo/company') return {CompanyInfo:{CompanyAddr:{Line1:'123 Business St',City:'Pine Bush',CountrySubDivisionCode:'NY',PostalCode:'12566'}}};
        if(decodeURIComponent(url).includes('from Item')) return {QueryResponse:{Item:catalog}};
        if(decodeURIComponent(url).includes('from Customer')) return {QueryResponse:{Customer:[{Id:'test-customer',DisplayName:'TEST ONLY'}]}};
        throw Error('Unexpected call '+url);
      }} : name.startsWith('@/') ? load(name.slice(2)) : require(name);
    mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);
    return mod.exports;
  }
  const route=load('app/api/quickbooks/invoices/route');
  return {calls,updates,invoice,load,post:args=>route.POST(new Request('https://example.test/api/quickbooks/invoices',{method:'POST',body:JSON.stringify({jobId:418,...args})})),get:()=>route.GET(new Request('https://example.test/api/quickbooks/invoices?jobId=418'))};
}
test('manual job asks for an installation service before any customer or invoice write',async()=>{
  const f=fixture();const res=await f.post();const body=await res.json();
  assert.equal(res.status,422);assert.equal(body.code,'INSTALLATION_ITEM_REQUIRED');
  assert.deepEqual(body.installationItems.map(i=>i.id),['passenger4','truck4']);
  assert.ok(f.calls.every(c=>!c.init));assert.equal(f.updates.length,0);
});
test('chosen existing installation service creates the four correct charges at job prices',async()=>{
  const f=fixture();const res=await f.post({installationItemId:'passenger4'});assert.equal(res.status,200);
  const payload=JSON.parse(f.calls.find(c=>c.url==='/invoice').init.body);
  assert.equal(payload.DocNumber,'AUTO_GENERATE');
  assert.equal(payload.ShipAddr.City,'Pine Bush');assert.equal(payload.ShipAddr.CountrySubDivisionCode,'NY');assert.equal(payload.ShipAddr.PostalCode,'12566');
  assert.equal(payload.ShipFromAddr.Line1,'123 Business St');
  assert.equal(payload.Line[0].SalesItemLineDetail.ServiceDate,'2026-10-27');assert.ok(!Object.hasOwn(payload.Line[0],'ServiceDate'));
  assert.deepEqual(payload.Line.map(l=>l.Amount),[800,299,10,14]);
  assert.deepEqual(payload.Line.map(l=>l.SalesItemLineDetail.TaxCodeRef.value),['TAX','TAX','NON','TAX']);
  assert.equal(payload.Line[0].SalesItemLineDetail.Qty,4);assert.equal(payload.Line[0].SalesItemLineDetail.UnitPrice,200);
  assert.equal(payload.Line[1].SalesItemLineDetail.ItemRef.value,'passenger4');
  assert.equal(payload.Line[2].SalesItemLineDetail.UnitPrice,2.5);assert.equal(payload.Line[3].SalesItemLineDetail.UnitPrice,3.5);
  assert.equal(f.updates[0].job_total,1213.43);assert.equal(f.updates[0].sales_tax_amount,90.43);
  assert.equal(f.updates[0].sales_tax_rate,8.125);
  assert.equal(f.updates[0].payment_status,'unpaid');assert.ok(!f.calls.some(c=>/send|payment/.test(c.url)));
});
test('invalid, category, and unrelated installation selections fail without writes',async()=>{
  for(const id of ['missing','category','tire']){const f=fixture();const r=await f.post({installationItemId:id});assert.equal(r.status,500);assert.ok(f.calls.every(c=>!c.init));}
});
test('missing base items fail before creating a customer',async()=>{
  const f=fixture({missingTires:true});assert.equal((await f.post({installationItemId:'passenger4'})).status,500);assert.ok(f.calls.every(c=>!c.init));
});
test('already linked or incomplete jobs cannot create another invoice',async()=>{
  for(const options of [{linked:true},{complete:false}]){const f=fixture(options);assert.equal((await f.post()).status,500);assert.equal(f.calls.length,0);}
});
test('invoice preview reads only the linked invoice and cannot create or sync anything',async()=>{
  const f=fixture({linked:true});const r=await f.get();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal((await r.json()).invoice.DocNumber,'TEST123');assert.deepEqual(f.calls,[{url:'/invoice/invoice-test',init:undefined}]);assert.equal(f.updates.length,0);
  assert.equal((await fixture().get()).status,404);
});
test('unauthenticated invoice reads and creation are blocked',async()=>{
  const f=fixture({authenticated:false});assert.equal((await f.post()).status,401);assert.equal((await f.get()).status,401);assert.equal(f.calls.length,0);
});
test('invoice previews require office/admin and completed password setup',async()=>{
  for(const options of [{role:'technician'},{role:null},{passwordChange:true}]){const f=fixture({...options,linked:true});assert.equal((await f.get()).status,403);assert.equal(f.calls.length,0);}
});
test('a zero QuickBooks balance is not replaced by the invoice total',async()=>{
  const f=fixture({balance:0});assert.equal((await f.post({installationItemId:'passenger4'})).status,200);assert.equal(f.updates[0].quickbooks_balance,0);
});
test('preview shows actual QuickBooks charges, tax and unpaid balance',async()=>{
  const f=fixture();await f.post({installationItemId:'passenger4'});
  const Preview=f.load('components/QuickBooksInvoicePreview').default;
  const html=renderToStaticMarkup(React.createElement(Preview,{invoice:f.invoice,onClose(){}}));
  for(const text of ['TEST123','800.00','299.00','14.00','10.00','90.43','1213.43','1123.00','Unpaid balance','Read directly from QuickBooks'])assert.ok(html.includes(text),text);
});
test('tax rate uses QuickBooks jurisdiction rates or the taxable basis, not state fees',()=>{
  const {quickBooksInvoiceTaxRate:rate}=fixture().load('lib/quickbooks-invoice-tax');
  assert.equal(rate({TxnTaxDetail:{TotalTax:90.43,TaxLine:[{TaxLineDetail:{TaxPercent:4,NetAmountTaxable:1113}},{TaxLineDetail:{TaxPercent:4.125,NetAmountTaxable:1113}}]}}),8.125);
  assert.equal(rate({TxnTaxDetail:{TotalTax:90.43},Line:[{Amount:1113,SalesItemLineDetail:{TaxCodeRef:{value:'TAX'}}},{Amount:10,SalesItemLineDetail:{TaxCodeRef:{value:'NON'}}}]}),8.125);
});
test('taxable invoicing requires a complete structured service address, not a guessed ZIP-only location',()=>{
  const {quickBooksServiceAddress:address}=fixture().load('lib/quickbooks-address');
  assert.deepEqual(address('123 Test Rd, Unit 2, Pine Bush, NY 12566'),{Line1:'123 Test Rd',Line2:'Unit 2',City:'Pine Bush',CountrySubDivisionCode:'NY',PostalCode:'12566',Country:'USA'});
  assert.throws(()=>address('Pine Bush, NY 12566'),/full service address/);
});
