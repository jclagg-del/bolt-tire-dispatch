const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const mod = new Module(__filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/tire-shopping-session.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, __filename);
const { readShoppingSession, saveShoppingSession, shopSessionKey, quoteDraftKey } = mod.exports;
const storage = () => { const values=new Map(); return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}; };
test('shopping and quote drafts round-trip independently without dropping details',()=>{
  const store=storage();
  const shop={query:'2356018',selectedBrands:['GENERAL','COOPER'],quantity:4,selected:[{id:'ATD-123'}],products:[{id:'ATD-123',quotePrice:215}]};
  const draft={form:{customer:'Example',email:'example@example.com',notes:'Keep these notes',installation_cost:'299'},options:[{price_per_tire:'210',image_url:'custom.jpg'}],splitFitment:false,selection:JSON.stringify(shop.selected)};
  saveShoppingSession(store,shopSessionKey,shop); saveShoppingSession(store,quoteDraftKey,draft);
  assert.deepEqual(readShoppingSession(store,shopSessionKey),shop);
  assert.deepEqual(readShoppingSession(store,quoteDraftKey),draft);
  store.removeItem(quoteDraftKey);
  assert.deepEqual(readShoppingSession(store,shopSessionKey),shop);
});
test('expired, invalid and malformed snapshots cannot restore stale drafts',()=>{
  const store=storage();
  for(const data of ['not json',JSON.stringify({version:1,value:{}}),JSON.stringify({version:1,savedAt:Date.now()-9*60*60*1000,value:{customer:'Old'}})]) {
    store.setItem(quoteDraftKey,data); assert.equal(readShoppingSession(store,quoteDraftKey),null);
  }
});
test('storage failure is surfaced so navigation can stop before losing the draft',()=>{
  assert.throws(()=>saveShoppingSession({setItem:()=>{throw new Error('Full');}},quoteDraftKey,{customer:'Example'}),/Full/);
});
