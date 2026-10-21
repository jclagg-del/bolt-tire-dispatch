const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function loader() {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
    mod.require = id => id.startsWith('@/') ? load(id.slice(2)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
    return mod.exports;
  };
}
const load = loader();
const { quoteShopProducts, applyQuoteShopSelection, canEditQuoteTires, quoteShopKey, matchesQuoteSnapshot } = load('lib/quote-shop-edit.ts');
const { emptyQuoteOptions, quoteOptionsForEditor } = load('lib/quotes.ts');
const { saveShoppingSession, readShoppingSession, quoteDraftKey } = load('lib/tire-shopping-session.ts');
const form = { customer: 'Example', phone: '5551234567', email: 'example@test.invalid', address: 'Saved address', notes: 'Keep these notes', tire_size: '275/65R20', rear_tire_size: '', quantity: '4', rear_quantity: '', installation_cost: '299', disposal_fee: '14', service_call_fee: '30', ny_state_tire_fee: '10', sales_tax_rate: '8.125', tax_exempt: true, additional_items: [{ description: 'TPMS', quantity: 4, unit_price: 25, taxable: true }] };
const option = (i) => ({ ...emptyQuoteOptions[i], id: 'saved-' + i, quote_id: 'original', brand: 'Falken', model: 'Choice ' + i, price_per_tire: '457', image_url: 'https://example.invalid/custom.jpg', supplier: 'ATD', supplier_product_id: '28840025' + i, manufacturer_product_id: '28840025' + i, wholesale_cost: 347.96, supplier_availability: { local: 2, localPlus: 8, nationwide: 20 }, highlights: 'Custom detail', load_speed_rating: '126/123 S', tire_type: 'All terrain', warranty_miles: '60000' });
function draft(options = [option(0), option(2)], splitFitment = false, fields = {}) {
  const value = { quoteId: 'original', version: '2026-10-21T10:00:00Z', form: { ...structuredClone(form), ...fields }, options: quoteOptionsForEditor(options), splitFitment };
  return { ...value, products: quoteShopProducts(value.options, value.form, splitFitment) };
}
const catalog = (fields = {}) => ({ id: 'catalog-new', brand: 'General', model: 'New model', size: '2756520', imageUrl: 'https://example.invalid/new.jpg', quotePrice: 350, warranty: '50,000 miles', category: 'All Terrain', loadSpeed: '126/123 S', loadRange: 'E', snowRated: true, supplier: 'USAF', atdProductNumber: '001234', manufacturerProductNumber: '01234', cost: 265.50, fitmentPosition: 'both', availability: { local: 4, localPlus: 12, nationwide: 40 }, ...fields });
const filled = result => result.options.filter(o => o.brand && o.model);
test('saved choices round trip without losing prices, IDs, photos, custom details, fees or customer information', () => {
  const value = draft(), before = structuredClone(value);
  const result = applyQuoteShopSelection(value, value.products);
  assert.deepEqual(result.form, value.form);
  for (const saved of value.options.filter(o => o.brand)) {
    const restored = result.options.find(o => o.id === saved.id);
    for (const key of Object.keys(saved).filter(k => !['sort_order', 'recommended'].includes(k))) assert.deepEqual(restored[key], saved[key], key);
  }
  assert.deepEqual(value, before);
  assert.ok(value.products.every(p => p.quoteSnapshot && p.availability.local === 0), 'Do not represent old inventory as live');
});
test('add/remove/replace options retain saved slots and have exactly one recommended choice', () => {
  const value = draft([ { ...option(0), recommended: true }, option(2) ]);
  const added = filled(applyQuoteShopSelection(value, [value.products[0], catalog(), value.products[1]]));
  assert.deepEqual(added.map(o => o.tier), ['good','better','best']);
  assert.equal(added[0].id, 'saved-0'); assert.equal(added[2].id, 'saved-2');
  assert.equal(added.filter(o => o.recommended).length, 1); assert.equal(added[0].recommended, true);
  assert.equal(added[1].supplier_product_id, '001234'); assert.equal(added[1].wholesale_cost, 265.50);
  assert.equal(added[1].warranty_miles, '50000');
  const replaced = filled(applyQuoteShopSelection(value, [catalog(), value.products[1]]));
  assert.deepEqual(replaced.map(o => o.tier), ['good','best']); assert.equal(replaced[1].id, 'saved-2');
  assert.equal(replaced[0].model, 'New model');
});
test('saved price edits and supplier changes carry through to the original option', () => {
  const value = draft();
  const priceOnly = filled(applyQuoteShopSelection(value, [{ ...value.products[0], quotePrice: 410 }]));
  assert.equal(priceOnly[0].price_per_tire, '410'); assert.equal(priceOnly[0].image_url, option(0).image_url);
  const switched = filled(applyQuoteShopSelection(value, [catalog({ quoteOptionKey: value.products[0].quoteOptionKey })]));
  assert.equal(switched[0].id, 'saved-0'); assert.equal(switched[0].supplier, 'USAF');
  assert.equal(switched[0].price_per_tire, '350');
});
test('split fitment replaces only intended axle and preserves independently entered quantities and fees', () => {
  const value = draft([{ ...option(0), rear_brand: 'Continental', rear_model: 'Rear', rear_price_per_tire: '495', rear_image_url: 'rear.jpg', rear_supplier: 'ATD', rear_supplier_product_id: '000123', rear_wholesale_cost: 400 }], true, { tire_size: '285/45R22', rear_tire_size: '325/40R22', quantity: '2', rear_quantity: '3' });
  const result = applyQuoteShopSelection(value, [value.products[0], catalog({ fitmentPosition: 'rear', size: '325/40R22' })]);
  assert.deepEqual(result.form, value.form);
  const o = filled(result)[0]; assert.equal(o.price_per_tire, '457'); assert.equal(o.model, 'Choice 0');
  assert.equal(o.rear_price_per_tire, '350'); assert.equal(o.rear_model, 'New model'); assert.equal(o.rear_supplier_product_id, '001234');
  assert.throws(() => applyQuoteShopSelection(value, [value.products[0]]), /front tire and one rear/);
});
test('invalid prices, too many choices, empty selections and mixed comparison sizes are rejected', () => {
  const value = draft();
  for (const selection of [[], [catalog({quotePrice:NaN})], [catalog({quotePrice:-1})], Array(4).fill(catalog()), [catalog(), catalog({size:'235/60R18'})]]) assert.throws(() => applyQuoteShopSelection(value, selection));
  assert.doesNotThrow(() => applyQuoteShopSelection(value, [catalog(), catalog({size:'LT275/65R20'})]));
});
test('missing catalog specs do not hide selection, but differing part IDs or sizes are never conflated', () => {
  const saved = draft().products[0];
  assert.equal(matchesQuoteSnapshot(saved, catalog({ manufacturerProductNumber: saved.manufacturerProductNumber })), true);
  assert.equal(matchesQuoteSnapshot(saved, catalog({ manufacturerProductNumber: saved.manufacturerProductNumber, size:'285/65R20' })), false);
  assert.equal(matchesQuoteSnapshot(saved, catalog()), false);
  assert.equal(matchesQuoteSnapshot(saved, catalog({ supplier:'ATD', atdProductNumber:saved.atdProductNumber })), true);
});
test('quote shopping drafts are isolated by quote and from new-quote drafts and expire safely', () => {
  const data = new Map(), storage = { getItem:k=>data.get(k)||null, setItem:(k,v)=>data.set(k,v), removeItem:k=>data.delete(k) };
  saveShoppingSession(storage, quoteShopKey('a'), draft()); saveShoppingSession(storage, quoteShopKey('b'), { different:true }); saveShoppingSession(storage, quoteDraftKey, { newQuote:true });
  assert.equal(readShoppingSession(storage, quoteShopKey('a')).quoteId, 'original');
  assert.deepEqual(readShoppingSession(storage, quoteShopKey('b')), { different:true });
  const expired = JSON.parse(data.get(quoteShopKey('a'))); expired.savedAt -= 9*60*60*1000; data.set(quoteShopKey('a'),JSON.stringify(expired));
  assert.equal(readShoppingSession(storage, quoteShopKey('a')), null);
  assert.deepEqual(readShoppingSession(storage, quoteDraftKey), { newQuote:true });
});
test('payment-pending, paid, refunded and converted quotes cannot enter tire editing', () => {
  for (const state of [{ payment_status:'pending' }, {payment_status:'paid'}, {payment_status:'refunded'}, {status:'converted'}, {converted_job_id:'job'}]) assert.equal(canEditQuoteTires(state), false);
  for (const status of ['draft','sent','viewed','approved']) assert.equal(canEditQuoteTires({status,payment_status:'unpaid'}), true);
});
