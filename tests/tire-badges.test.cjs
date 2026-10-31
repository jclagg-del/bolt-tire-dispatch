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
const { catalogFlag, catalogCategory, normalizeTireBadges } = loader()('lib/tire-badges.ts');
const pirelli = { id: '3136900', brand: 'PIRELLI', model: 'Scorpion Zero Asimmetrico', size: '2954022', manufacturerProductNumber: '3136900', category: 'All-Terrain (A/T)', snowRated: true, runFlat: false, cost: 456.99 };
test('only explicit positive catalog flags enable badges; unknown is not false', () => {
  for (const value of [true, 1, '1', 'true', 'TRUE', ' yes ', 'Y']) assert.equal(catalogFlag(value), true);
  for (const value of [false, 0, '0', 'false', 'FALSE', ' no ', 'N']) assert.equal(catalogFlag(value), false);
  for (const value of [null, undefined, '', 'Unknown', 'M+S', 'Not rated', [], {}, 2]) assert.equal(catalogFlag(value), undefined);
});
test('seasonal restrictions take precedence over broad terrain; missing classifications remain unknown', () => {
  assert.equal(catalogCategory({ terrain: 'All-Terrain', season: 'Summer' }), 'Summer');
  assert.equal(catalogCategory({ terrain: 'Highway', season: 'Winter' }), 'Winter');
  assert.equal(catalogCategory({ terrain: 'All-Terrain (A/T)', season: 'All Season' }), 'All-Terrain (A/T)');
  assert.equal(catalogCategory({ terrain: 'Undefined', season: 'All Season' }), 'All Season');
  assert.equal(catalogCategory(null), '');
});
test('verified Pirelli correction is limited to its exact part and size without changing prices or identity', () => {
  const fixed = normalizeTireBadges(pirelli);
  assert.equal(fixed.category, 'Performance All-Season'); assert.equal(fixed.snowRated, false);
  for (const field of ['id', 'model', 'brand', 'size', 'manufacturerProductNumber', 'cost']) assert.equal(fixed[field], pirelli[field]);
  assert.equal(normalizeTireBadges({ ...pirelli, size: '295/40R22' }).category, 'Performance All-Season');
  for (const change of [{ manufacturerProductNumber: 'OTHER' }, { brand: 'OTHER' }, { size: '2754022' }, { model: 'Scorpion All Terrain Plus' }]) {
    assert.equal(normalizeTireBadges({ ...pirelli, ...change }).category, 'All-Terrain (A/T)');
  }
  const allTerrain = normalizeTireBadges({ ...pirelli, brand: 'FALKEN', model: 'Wildpeak A/T4W', manufacturerProductNumber: '28840025' });
  assert.equal(allTerrain.category, 'All-Terrain (A/T)'); assert.equal(allTerrain.snowRated, true);
  assert.equal(normalizeTireBadges({ ...pirelli, manufacturerProductNumber: 'OTHER', category: 'Summer' }).snowRated, false);
});
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
async function fixture(catalog, details, run) {
  const oldFetch = global.fetch, oldKey = process.env.TIRE_LIBRARY_API_KEY;
  process.env.TIRE_LIBRARY_API_KEY = 'test-only';
  global.fetch = async url => {
    url = String(url);
    if (url.includes('/tires/search?')) return json({ data: catalog });
    if (url.includes('/rebate?')) return json({ data: [] });
    const id = url.match(/\/tires\/(\d+)\?/);
    if (id) return json(details[Number(id[1])]);
    if (url.includes('/catalog?')) return json({ results: { data: [] } });
    return new Response(null, { status: 404 });
  };
  try { await run(loader()('lib/tire-library.ts')); }
  finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.TIRE_LIBRARY_API_KEY; else process.env.TIRE_LIBRARY_API_KEY = oldKey; }
}
test('same-model variants keep their own category and boolean values, never representative-SKU badges', async () => {
  const catalog = [
    { id: 1, tire_model_id: 9, item_number: 'A', make_name: 'TEST', model_name: 'Pattern', season: 'All Season', terrain: 'All-Terrain', three_pmsf: true, run_flat: true },
    { id: 2, tire_model_id: 9, item_number: 'B', make_name: 'TEST', model_name: 'Pattern', season: 'All Season', terrain: 'Highway', three_pmsf: 'false', run_flat: '0' },
  ];
  await fixture(catalog, { 1: catalog[0] }, async api => {
    const products = ['A', 'B', 'UNMATCHED'].map(part => ({ id: part, brand: 'TEST', model: 'Pattern', size: '2954022', manufacturerProductNumber: part, category: 'Touring', snowRated: false, runFlat: false }));
    const [a, b, unmatched] = await api.enrichWithTireLibrary(products);
    assert.equal(a.category, 'All-Terrain'); assert.equal(a.snowRated, true); assert.equal(a.runFlat, true);
    assert.equal(b.category, 'Highway'); assert.equal(b.snowRated, false); assert.equal(b.runFlat, false);
    assert.equal(unmatched.category, 'Touring'); assert.equal(unmatched.snowRated, false); assert.equal(unmatched.runFlat, false);
  });
});
test('unknown detail flags fall back to the exact catalog row, while explicit false overrides true', async () => {
  const row = { id: 1, item_number: 'A', make_name: 'TEST', model_name: 'Pattern', three_pmsf: true, run_flat: true };
  for (const flag of ['unknown', 'false']) await fixture([row], { 1: { ...row, three_pmsf: flag, run_flat: flag } }, async api => {
    const [p] = await api.enrichWithTireLibrary([{ id: 'A', manufacturerProductNumber: 'A', brand: 'TEST', model: 'Pattern', size: '2954022' }]);
    assert.equal(p.snowRated, flag === 'unknown'); assert.equal(p.runFlat, flag === 'unknown');
    const detail = await api.tireLibraryTireDetails(1);
    assert.equal(detail.snowRated, flag === 'unknown' ? undefined : false);
  });
});
test('live Pirelli catalog regression is corrected for both supplier cards after enrichment', async () => {
  const record = { id: 285442, item_number: '3136900', make_name: 'PIRELLI', model_name: 'Scorpion Zero Asimmetrico',
    category: 'Passenger Light Truck/SUV, SUV', season: 'All-Season', terrain: 'All-Terrain (A/T)', three_pmsf: true, run_flat: false };
  await fixture([record], { 285442: record }, async api => {
    const products = await api.enrichWithTireLibrary([{ ...pirelli, supplier: 'ATD' }, { ...pirelli, supplier: 'USAF', id: 'USAF-3136900' }]);
    for (const p of products) {
      assert.equal(p.category, 'Performance All-Season'); assert.equal(p.snowRated, false);
      assert.equal(p.tireLibraryId, 285442); assert.equal(p.cost, 456.99);
    }
  });
});
test('Pirelli correction survives unavailable library and string false values stay false on fallback', async () => {
  const oldKey = process.env.TIRE_LIBRARY_API_KEY; delete process.env.TIRE_LIBRARY_API_KEY;
  try {
    const [p, unknown] = await loader()('lib/tire-library.ts').enrichWithTireLibrary([pirelli, { ...pirelli, manufacturerProductNumber: 'OTHER', snowRated: 'false', runFlat: '0' }]);
    assert.equal(p.category, 'Performance All-Season'); assert.equal(p.snowRated, false);
    assert.equal(unknown.snowRated, false); assert.equal(unknown.runFlat, false);
  } finally { if (oldKey !== undefined) process.env.TIRE_LIBRARY_API_KEY = oldKey; }
});
