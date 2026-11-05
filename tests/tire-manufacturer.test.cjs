const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function loader() {
  const cache = new Map();
  return function load(relative) {
    let file = path.resolve(__dirname, '..', relative);
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
    mod.require = id => id === 'server-only' ? {} : id.startsWith('@/') ? load(id.slice(2)) : id.startsWith('.') ? load(path.resolve(path.dirname(file), id)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return mod.exports;
  };
}
test('only explicit BKT aliases are expanded, across every size and product line', () => {
  const load = loader(), { tireManufacturerName } = load('lib/tire-manufacturer');
  const { normalizeTireProductName } = load('lib/tire-product-name');
  for (const brand of ['BK', ' bk ', 'BKT', 'B.K.T.', 'BKT Tires', 'BKT Tyres']) {
    assert.equal(tireManufacturerName(brand), 'BKT');
    for (const model of ['Agrimax RT-855', 'TR 171', 'AT 171', 'Other BKT pattern']) {
      for (const size of ['480/80R38', '340/85R24', '18.4-26', '26X12-12']) {
        const source = { brand, model, size, part: '123', price: 1288.60, loadSpeed: '149 A8', imageUrl: '/tire.jpg' };
        const result = normalizeTireProductName(source);
        assert.deepEqual(result, { ...source, brand: 'BKT' });
        assert.equal(source.brand, brand);
      }
    }
  }
  for (const brand of ['BKX', 'BKT Other', 'KT', 'Alliance', 'Titan', 'Carlisle', 'CARLSTAR', 'BFGOODRICH', 'GOODYEAR', 'HERCULES', 'TOYO', 'Unknown']) assert.equal(tireManufacturerName(brand), brand);
  assert.equal(tireManufacturerName(null), '');
});
test('both staff and public shared panels show BKT on front/rear headings and image descriptions', () => {
  const Panels = loader()('components/QuoteTirePanels').default;
  const html = renderToStaticMarkup(React.createElement(Panels, {
    q: { quantity: 2, rear_quantity: 2, tire_size: '480/80R38', rear_tire_size: '340/85R24' },
    option: { brand: 'BK', model: 'Agrimax RT-855', price_per_tire: 1288.60, image_url: '/front.jpg', rear_brand: 'bk', rear_model: 'TR 171', rear_price_per_tire: 500, rear_image_url: '/rear.jpg' },
  }));
  assert.equal((html.match(/<h2>BKT<\/h2>/g) || []).length, 2);
  assert.match(html, /alt="BKT Agrimax RT-855"/);
  assert.match(html, /alt="BKT TR 171"/);
  assert.match(html, /1288\.60/);
  assert.doesNotMatch(html, /<h2>BK<\/h2>/);
});
test('supplier enrichment repairs BKT even when the optional catalog is unavailable', async () => {
  const previousKey = process.env.TIRE_LIBRARY_API_KEY;
  delete process.env.TIRE_LIBRARY_API_KEY;
  try {
    const source = { brand: 'BK', model: 'Agrimax RT-855', size: '480/80R38', imageUrl: null, quotePrice: 1288.60, manufacturerProductNumber: '123', atdProductNumber: '123', category: '', loadSpeed: '149 A8', utqg: '' };
    const [result] = await loader()('lib/tire-library').enrichWithTireLibrary([source]);
    assert.equal(result.brand, 'BKT');
    for (const field of ['model', 'size', 'quotePrice', 'manufacturerProductNumber', 'atdProductNumber', 'loadSpeed']) assert.equal(result[field], source[field]);
    assert.equal(source.brand, 'BK');
  } finally {
    if (previousKey === undefined) delete process.env.TIRE_LIBRARY_API_KEY; else process.env.TIRE_LIBRARY_API_KEY = previousKey;
  }
});
test('quote saves normalize manufacturers on both axles, without changing model or price fields', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/quotes/new/page.tsx'), 'utf8');
  assert.match(source, /brand: tireManufacturerName\(option.brand\)/);
  assert.match(source, /rear_brand: tireManufacturerName\(option.rear_brand\)/);
  assert.match(source, /model: option.model.trim\(\)/);
  assert.match(source, /price_per_tire: Number\(option.price_per_tire\)/);
});
