const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const mod = new Module(__filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/tire-shop-pricing.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, __filename);
const { installedTotal, tireGrossProfit, supplierCostLabel, markupPricing } = mod.exports;

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
test('markup suggestion is calculated separately from MAP and does not mutate price', () => {
  const product = { cost: 220.99, map: 302, quotePrice: 302 };
  assert.equal(markupPricing(product.cost,25,50,'passenger').suggestedPrice,277);
  assert.equal(markupPricing(product.cost,25,60,'truck').suggestedPrice,281);
  assert.equal(product.quotePrice,302);
  assert.equal(markupPricing(0,25,60,'truck').suggestedPrice,null);
});

test('USAF size and part searches keep suggestions staff-only and preserve MAP-based selling prices', async () => {
  const settings = { tire_shop_passenger_markup_percent:25, tire_shop_passenger_min_profit:50, tire_shop_truck_markup_percent:25, tire_shop_truck_min_profit:60, truck_disposal_fee:12, passenger_disposal_fee:7, ny_state_tire_fee:2.5 };
  const row = { part_number:'224060', brand:'Nitto', model:'Terra Grappler G3', tire_type:'LIGHT TRUCK', cost:220.99, map_price:302, retail_price:330, tire_size:'2755520', warehouse_inventory:[{warehouse:'4853',quantity:4}] };
  const admin = { from(table) {
    const chain = { then(resolve) { return Promise.resolve({data:table === 'business_settings' ? settings : [row]}).then(resolve); } };
    for (const method of ['select','eq','or','gt','order','limit','maybeSingle']) chain[method] = () => chain;
    return chain;
  } };
  const catalog = new Module(__filename,module);
  const warehouses = new Module(__filename,module);
  warehouses._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/usaf-warehouses.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,__filename);
  const stubs = {
    'server-only': {},
    '@/lib/supabase/admin': {createAdminClient:()=>admin},
    '@/lib/business-settings': {fallbackBusinessSettings:settings, installationDefault:()=>329},
    '@/lib/usaf-warehouses': warehouses.exports,
    '@/lib/tire-shop-pricing': mod.exports,
  };
  catalog.require = name => Object.hasOwn(stubs,name) ? stubs[name] : require(name);
  catalog._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/usaf-catalog.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,__filename);
  for (const search of [catalog.exports.searchUsafBySize,catalog.exports.searchUsafByPartNumber]) {
    const [staff] = await search('224060',true);
    const [customer] = await search('224060',false);
    assert.equal(staff.suggestedPrice,281);
    assert.equal(staff.map,302);
    assert.equal(staff.quotePrice,302);
    assert.equal(customer.quotePrice,302);
    assert.deepEqual(customer.estimatedTotals,staff.estimatedTotals);
    for (const field of ['cost','map','suggestedPrice','pricingMarkupPercent','pricingMinimumProfit','pricingCategory']) assert.equal(Object.hasOwn(customer,field),false);
  }
  row.warehouse_inventory = [{warehouse:'07',quantity:8}];
  for (const search of [catalog.exports.searchUsafBySize,catalog.exports.searchUsafByPartNumber]) {
    const [product] = await search('224060', true);
    assert.equal(product.warehouseInventory[0].warehouse, '07');
    assert.deepEqual(product.availability, {local:0,localPlus:0,nationwide:8});
  }
});
