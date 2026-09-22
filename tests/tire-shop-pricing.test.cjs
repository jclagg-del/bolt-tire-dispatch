const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const mod = new Module(__filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/tire-shop-pricing.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, __filename);
const { installedTotal, tireGrossProfit, supplierCostLabel } = mod.exports;

const tires = [
  { model: 'Weatherready', installedPrice: 280, quotePrice: 251, cost: 200, estimatedTotals: { 1: 280, 4: 1341, 2: 700 } },
  { model: 'Territory', installedPrice: 350, quotePrice: 212, cost: 190, estimatedTotals: { 1: 350, 4: 1235, 2: 720 } },
];
test('price sort follows the displayed total, not supplier-specific unit estimates', () => {
  assert.deepEqual([...tires].sort((a, b) => installedTotal(a, 4) - installedTotal(b, 4)).map(t => t.model), ['Territory', 'Weatherready']);
});
test('quantity changes both ordering and installed price range', () => {
  assert.equal([...tires].sort((a,b) => installedTotal(a,2) - installedTotal(b,2))[0].model, 'Weatherready');
  assert.deepEqual(tires.filter(t => installedTotal(t,4) <= 1300).map(t=>t.model), ['Territory']);
  assert.equal(tires.filter(t => installedTotal(t,2) <= 1300).length, 2);
});
test('fallback matches display and gross profit excludes service charges', () => {
  assert.equal(installedTotal({ installedPrice: 100, quotePrice: 80 }, 3), 300);
  assert.equal(tireGrossProfit(tires[0]), 51);
  assert.equal(tireGrossProfit(tires[1]), 22);
});

test('each supplier cost is per tire with missing prices explicitly unavailable', () => {
  assert.equal(supplierCostLabel(220.99), 'Cost $220.99 / tire');
  assert.equal(supplierCostLabel(208), 'Cost $208.00 / tire');
  for (const missing of [undefined, null, 0, -1, NaN, Infinity]) {
    assert.equal(supplierCostLabel(missing), 'Cost unavailable');
  }
});
