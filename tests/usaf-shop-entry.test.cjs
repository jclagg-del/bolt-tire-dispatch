const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('USAF order dialog prefills the exact supplier part and shopping quantity', () => {
  const mod = new Module(__filename, module);
  mod.paths = module.paths;
  mod.require = id => id === '@/lib/supabase' ? { supabase: {} } : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/UsafPurchase.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, __filename);
  const html = renderToStaticMarkup(React.createElement(mod.exports.default, {
    initialPart: '00755012001', initialQuantity: 2, onClose() {}, onComplete() {},
  }));
  assert.ok(html.includes('Part #00755012001'));
  assert.ok(!html.includes('Find tire by product number'));
  assert.ok(html.includes('type="number" min="1" max="24" value="2"'));
});

test('production order review has tire, warehouse and priced button without live warnings or checkbox', () => {
  const source = fs.readFileSync(require.resolve('../components/UsafPurchase.tsx'), 'utf8');
  const mod = new Module(__filename, module); mod.paths = module.paths;
  const product = { atdProductNumber:'00755012001',lineCode:'GY',brand:'Goodyear',model:'Wrangler',size:'275/65R18',cost:200,warehouses:[{code:'4853',name:'Croton',quantity:12,local:true,deliveryDate:'2026-09-28'}] };
  let index=0;
  const states = {0:'production',1:true,4:'3024060',6:[product],7:'GY',8:'4853',9:{total:800,deliveryDate:'2026-09-28',shipments:[]},12:'signed-preview',14:false};
  mod.require = id => id === 'react' ? {...React,useState:initial=>{const n=index++;return [Object.hasOwn(states,n)?states[n]:initial,()=>{}];}} : id === '@/lib/supabase' ? {supabase:{}} : require(id);
  mod._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,__filename);
  const html=renderToStaticMarkup(React.createElement(mod.exports.default,{initialPart:'00755012001',initialQuantity:4,onClose(){},onComplete(){}}));
  assert.ok(html.includes('Goodyear'));
  assert.ok(html.includes('Croton'));
  assert.ok(html.includes('Place order · $800.00'));
  assert.ok(!html.includes('type="checkbox"'));
  assert.ok(!html.includes('LIVE PRODUCTION'));
  assert.ok(!html.includes('authorize this LIVE'));
  assert.ok(!html.includes('Find tire by product number'));
  assert.ok(!html.includes('disabled=""'));
  assert.match(source,/const timer = setTimeout\(async/);
  assert.match(source,/if \(!active\) return;/);
});

test('shop USAF choice opens its own flow; ordering remains staff-only and ATD is preserved', () => {
  const source = fs.readFileSync(require.resolve('../components/TireShoppingBeta.tsx'), 'utf8');
  assert.match(source, /internal && usafOrderProduct && <UsafPurchase/);
  assert.match(source, /initialPart=\{usafOrderProduct.atdProductNumber\}/);
  assert.match(source, /initialQuantity=\{orderQuantity\}/);
  assert.match(source, /supplier === "ATD" \|\| supplier === "USAF"/);
  assert.match(source, /if \(supplier === "USAF"\) \{ setUsafOrderProduct\(match\); setOrderProduct\(null\); setOrderChoosingSupplier\(false\); \}/);
  assert.match(source, /else beginOrder\(match\)/);
  assert.ok(!source.includes('Ordering connection next'));
});
