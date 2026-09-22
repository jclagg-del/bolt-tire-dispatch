const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const mod = new Module(__filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/tire-brand-filter.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, __filename);
const { tireBrands, matchesBrands } = mod.exports;

test('brand options combine supplier capitalization and exclude blank names', () => {
  assert.deepEqual(tireBrands([{brand:'Goodyear'}, {brand:'GOODYEAR'}, {brand:' Cooper '}, {brand:''}]), ['COOPER','GOODYEAR']);
});
test('multiple selections include either brand, not unrelated brands', () => {
  assert.equal(matchesBrands('Goodyear', ['COOPER','GOODYEAR']), true);
  assert.equal(matchesBrands('COOPER', ['COOPER','GOODYEAR']), true);
  assert.equal(matchesBrands('Michelin', ['COOPER','GOODYEAR']), false);
});
test('clearing selections restores all brands, and a single selection still works', () => {
  assert.equal(matchesBrands('Michelin', []), true);
  assert.equal(matchesBrands('Goodyear', ['GOODYEAR']), true);
  assert.equal(matchesBrands('Cooper', ['GOODYEAR']), false);
});
