const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function loader() {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (cache.has(file)) return cache.get(file).exports;
    const m = new Module(file, module); cache.set(file, m); m.paths = module.paths;
    m.require = id => id === 'server-only' ? {} : id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id);
    m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
    return m.exports;
  };
}
const { normalizeTireProductName } = loader()('lib/tire-product-name.ts');
const product = (extra = {}) => ({ id: 'USAF-360800', brand: 'TOYO', model: 'Toyo OPEN COUNTRY MT FLOTATION',
  size: '35125020', supplier: 'USAF', atdProductNumber: '360800', manufacturerProductNumber: '360800',
  cost: 447.78, fet: 1.32, quotePrice: 568.40, loadSpeed: '12 ply', loadRange: 'F', sidewall: 'BSW',
  availability: { local: 4, localPlus: 1, nationwide: 18 }, ...extra });

test('Toyo Open Country M/T has one display name across sizes and supplier spellings', () => {
  for (const size of ['35125020', '33125018', '35X12.50R20LT', '33X12.50R18/10', 'LT275/65R20', 'LT245/75R16']) {
    for (const model of ['Toyo OPEN COUNTRY MT FLOTATION', 'Open Country M/T Flotation', 'OPEN COUNTRY M-T', 'Open Country M/T', 'Toyo Tires Open Country MT Flotation']) {
      for (const supplier of ['ATD', 'USAF', 'NTW']) {
        const source = product({ size, model, supplier });
        const result = normalizeTireProductName(source);
        assert.deepEqual(result, { ...source, model: 'Open Country M/T' });
        assert.equal(source.model, model); // No mutation of supplier records.
        assert.deepEqual(normalizeTireProductName(result), result);
      }
    }
  }
});
test('other Toyo patterns, variants and genuine flotation product names remain intact', () => {
  for (const model of ['Open Country A/T III', 'Open Country R/T Trail', 'Open Country M/T-R', 'Open Country M/T II', 'Flotation Implement', 'Open Country MT Flotation Special']) {
    const source = product({ model }); assert.equal(normalizeTireProductName(source), source);
  }
  const otherBrand = product({ brand: 'OTHER' });
  assert.equal(normalizeTireProductName(otherBrand), otherBrand);
  assert.equal(normalizeTireProductName(product({ brand: 'Toyo Tires' })).model, 'Open Country M/T');
});

const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
for (const mode of ['configured', 'unavailable', 'unconfigured']) test(`shop enrichment uses the corrected name with library ${mode}`, async () => {
  const oldFetch = global.fetch, oldKey = process.env.TIRE_LIBRARY_API_KEY;
  if (mode === 'unconfigured') delete process.env.TIRE_LIBRARY_API_KEY;
  else process.env.TIRE_LIBRARY_API_KEY = 'test-only';
  let calls = 0;
  global.fetch = async url => {
    calls++;
    if (mode === 'unavailable') throw new Error('test catalog unavailable');
    url = String(url);
    if (url.includes('/tires/search?')) return json({ data: [{ id: 1, item_number: '360800', make_name: 'TOYO', model_name: 'Open Country M/T Flotation' }] });
    if (url.includes('/rebate?')) return json({ data: [] });
    if (url.includes('/tires/1?')) return json({ id: 1, model_name: 'Open Country MT Flotation', make_name: 'TOYO' });
    return new Response(null, { status: 404 });
  };
  try {
    // Metric syntax also exercises catalog matching, unlike compact inch sizes.
    const source = [product(), product({ id: 'ATD-360800', supplier: 'ATD', size: 'LT275/65R20' })];
    const result = await loader()('lib/tire-library.ts').enrichWithTireLibrary(source);
    for (let i = 0; i < source.length; i++) {
      assert.equal(result[i].model, 'Open Country M/T');
      for (const field of ['id', 'size', 'supplier', 'atdProductNumber', 'manufacturerProductNumber', 'cost', 'fet', 'quotePrice', 'loadSpeed', 'loadRange', 'sidewall', 'availability']) {
        assert.deepEqual(result[i][field], source[i][field]);
      }
    }
    assert.equal(source[0].model, 'Toyo OPEN COUNTRY MT FLOTATION');
    if (mode === 'unconfigured') assert.equal(calls, 0);
    else assert.ok(calls > 0);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.TIRE_LIBRARY_API_KEY;
    else process.env.TIRE_LIBRARY_API_KEY = oldKey;
  }
});
