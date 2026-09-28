const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');

function render(customer,complete=false){
 const source=fs.readFileSync(require.resolve('../components/CustomerOrderPurchase.tsx'),'utf8');
 const product={atdProductNumber:'110822702',lineCode:'GY',brand:'Goodyear',model:'Assurance',size:'225/60R17',loadSpeed:'99 H',cost:100,warehouses:[{code:'4853',name:'Croton',quantity:12,local:true,deliveryDate:'2026-09-30'}]};
 const details={supplier:'U.S. AutoForce',confirmation:'CONFIRMED',total:200,deliveryDate:'2026-09-30',shipments:[]};
 const states={0:[product],1:'USAF',2:'GY',4:'4853',5:product.atdProductNumber,6:details,7:complete?details:null,8:false};let index=0;
 const mod=new Module(__filename,module);mod.paths=module.paths;
 mod.require=id=>id==='react'?{...React,useState:initial=>{const n=index++;return [Object.hasOwn(states,n)?states[n]:initial,()=>{}]}}:id==='@/lib/supabase'?{supabase:{}}:require(id);
 mod._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,__filename);
 return renderToStaticMarkup(React.createElement(mod.exports.default,{order:{id:42,customer,job_number:'3094589',mo_number:'MO123',qty:2,tire_product_number:product.atdProductNumber,tire_size:'225/60R17'},onClose(){},onComplete(){}}));
}
test('KSS and HPR cards review the exact tire, warehouse, PO and MO in an enabled in-page ordering dialog',()=>{
 for(const customer of ['Kingdom Support Services','HPR']){
  const html=render(customer);
  for(const text of [customer,'3094589','MO123','110822702','Croton','Place U.S. AutoForce order · $200.00'])assert.ok(html.includes(text));
  assert.match(html,/role="dialog"/);assert.doesNotMatch(html,/disabled=""|href=|test access/);
  const completed=render(customer,true);assert.ok(completed.includes('Done — back to order card'));assert.ok(completed.includes('Tires are marked ordered.'));assert.ok(completed.includes('CONFIRMED'));assert.doesNotMatch(completed,/Place U.S. AutoForce order/);
 }
});
test('Order tires on the staff card opens the local dialog and confirmation updates the original card',()=>{
 const page=fs.readFileSync(require.resolve('../app/orders/page.tsx'),'utf8');
 assert.match(page,/onClick=\{\(\) => setPurchasingOrder\(order\)\}/);
 assert.match(page,/: "Order tires"/);
 assert.match(page,/<CustomerOrderPurchase order=\{purchasingOrder\}/);
 assert.match(page,/onClose=\{\(\) => setPurchasingOrder\(null\)\}/);
 assert.match(page,/updateTireOrderDraft\(purchasingOrder.id, \{ supplier: details.supplier, deliveryDate: details.deliveryDate/);
 assert.match(page,/tires_ordered: true, purchase: \{ \.\.\.details, status: "placed" \}/);
 const dialog=fs.readFileSync(require.resolve('../components/CustomerOrderPurchase.tsx'),'utf8');
 assert.doesNotMatch(dialog,/window\.open|window\.location|router\.push/);
});
