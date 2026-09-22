const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const mod = new Module(__filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/tire-supplier-offers.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, __filename);
const { supplierOffers } = mod.exports;
const base = { brand: 'NITTO', model: 'Terra Grappler G3', size: '2755520', loadSpeed: '117 T', loadRange: 'XL', tireLibraryId: 1 };
const usaf = { ...base, id:'USAF-224060', supplier:'USAF', atdProductNumber:'224060', manufacturerProductNumber:'4981910570769', cost:220.99 };
const atd = { ...base, id:'ATD-224060', supplier:'ATD', size:'275/55R20XL', atdProductNumber:'224060', manufacturerProductNumber:'224060', cost:228 };
const lt = { ...base, id:'USAF-223800', supplier:'USAF', atdProductNumber:'223800', manufacturerProductNumber:'4981910571018', loadSpeed:'120/117 T', loadRange:'E', cost:246.49 };
test('Nitto XL comparison never takes the cost of the LT version with the same model/size', () => {
  const offers = supplierOffers(usaf, [usaf, atd, lt]);
  assert.deepEqual(offers.map(t=>t.cost), [228,220.99]);
  assert.deepEqual(supplierOffers(atd,[usaf,atd,lt]).map(t=>t.cost), [228,220.99]);
  assert.deepEqual(supplierOffers(lt,[usaf,atd,lt]).map(t=>t.id), ['USAF-223800']);
});
test('exact identifiers win over specification fallback independent of source order', () => {
  const fallback = {...atd, id:'ATD-other', atdProductNumber:'other', manufacturerProductNumber:'other', cost:100};
  assert.equal(supplierOffers(usaf,[fallback,usaf,atd])[0].id,atd.id);
  assert.equal(supplierOffers(usaf,[atd,usaf,fallback])[0].id,atd.id);
});
test('shared model-library ID alone never merges tires, and missing specs are not a match', () => {
  assert.deepEqual(supplierOffers(usaf,[usaf,{...atd,id:'different',atdProductNumber:'different',manufacturerProductNumber:'different',loadSpeed:''}]).map(t=>t.id),[usaf.id]);
});
test('LT prefix is not ignored when all other specifications happen to match', () => {
  const other = {...atd,id:'LT-other',atdProductNumber:'LT-other',manufacturerProductNumber:'LT-other',size:'LT275/55R20',loadRange:''};
  assert.deepEqual(supplierOffers(usaf,[usaf,other]).map(t=>t.id),[usaf.id]);
});
