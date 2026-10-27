const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, file);
    return mod.exports;
  };
}
const option = { id: 'option', brand: 'Hercules', model: 'Strong Guard LG2', image_url: '/front-test.jpg', price_per_tire: 291, rear_brand: 'Galaxy', rear_model: 'EZ Rider', rear_image_url: '/rear-test.jpg', rear_price_per_tire: 885, sort_order: 0 };
const quote = { id: 'quote', quote_number: 123, customer: 'Test', quantity: 2, tire_size: '12.5/80-18', rear_quantity: 2, rear_tire_size: '21L-24', installation_cost: 299, service_call_fee: 0, disposal_fee: 14, ny_state_tire_fee: 10, sales_tax_rate: 0, tax_exempt: false, payment_status: 'unpaid', status: 'draft', quote_options: [option] };
function page(record, publicView = false) {
  let index = 0;
  const load = loader({
    react: { ...React, useState: initial => { const n = index++; return [n === 0 ? record : !publicView && n === 1 ? false : initial, () => {}]; }, useEffect: () => {}, useMemo: fn => fn() },
    'next/navigation': { useParams: () => ({ id: 'quote', token: 'token' }), useRouter: () => ({}), usePathname: () => '/quotes/quote', useSearchParams: () => new URLSearchParams() },
    '@/components/AppHeader': () => null, '@/components/EmbeddedStripeCheckout': () => null, '@/lib/supabase': { supabase: {} },
  });
  return renderToStaticMarkup(React.createElement(load(publicView ? 'app/q/[token]/page' : 'app/quotes/[id]/page').default));
}
test('saved staff quote shows both axle photos and details without changing the installed total', () => {
  const html = page(quote);
  for (const value of ['quote-comparison-grid split-fitment', 'Front / Steer', 'Rear / Drive', '/front-test.jpg', '/rear-test.jpg', 'Hercules', 'Galaxy', 'Strong Guard LG2', 'EZ Rider', '12.5/80-18', '21L-24', 'Qty 2', '$291.00', '$885.00', '$2675.00', 'Choose this tire set']) assert.ok(html.includes(value), value);
});
test('single-size quotes retain a single panel and normal comparison layout', () => {
  const single = { ...option, rear_brand: null, rear_model: null, rear_image_url: null, rear_price_per_tire: null };
  const html = page({ ...quote, rear_tire_size: null, rear_quantity: 0, quote_options: [single] });
  assert.ok(!html.includes('quote-comparison-grid split-fitment'));
  assert.ok(!html.includes('Rear / Drive'));
  assert.ok(html.includes('Choose this tire</button>'));
});
test('rear size, quantity or photo independently retain the rear panel even without a model', () => {
  const Panels = loader()('components/QuoteTirePanels').default;
  for (const signal of [{ rear_tire_size: '21L-24' }, { rear_quantity: 2 }, { rear_image_url: '/rear-test.jpg' }]) {
    const html = renderToStaticMarkup(React.createElement(Panels, { q: { quantity: 2, ...signal }, option: { price_per_tire: 291, ...signal } }));
    assert.ok(html.includes('Rear / Drive'));
    assert.ok(html.includes('Model not specified'));
  }
  const html = page({ ...quote, quote_options: [{ ...option, rear_image_url: null }] });
  assert.ok(html.includes('Rear tire image'));
  assert.ok(!html.includes('/rear-test.jpg'));
});
test('public panels preserve regular credit and paid pricing for each axle', () => {
  const { quotePaymentPrice } = loader()('lib/quote-payment-pricing');
  const regular = quotePaymentPrice(quote, option, 'regular').option;
  const unpaid = page({ ...quote, payment_pricing_version: 1 }, true);
  for (const price of [regular.price_per_tire, regular.rear_price_per_tire]) assert.ok(unpaid.includes(`$${price.toFixed(2)}`));
  assert.ok(unpaid.includes('per tire · Credit'));
  const paid = page({ ...quote, payment_pricing_version: 1, payment_status: 'paid', selected_option_id: option.id }, true);
  assert.ok(paid.includes('$291.00')); assert.ok(paid.includes('$885.00'));
  assert.ok(!paid.includes('per tire · Credit'));
});
