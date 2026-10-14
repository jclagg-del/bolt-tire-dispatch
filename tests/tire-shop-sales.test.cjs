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
const { salePaymentState, isTireShopSale } = loader()('lib/tire-shop-sales');
const Status = loader()('components/SalePaymentStatus').default;
const sample = {
  id: 'sale-48', quote_number: 48, purchase_source: 'website', status: 'converted', payment_status: 'unpaid', amount_paid: null,
  customer: 'Sample John', vehicle: '2022 Ford', tire_size: '275/60R20', quantity: 4, installation_cost: 0, service_call_fee: 0, disposal_fee: 0,
  ny_state_tire_fee: 10, sales_tax_rate: 0, tax_exempt: false, selected_option_id: 'option', converted_job_id: 364,
  checkout_service: 'tires_only', public_token: 'token', email: 'sample@example.com', created_at: '2026-10-13T12:00:00Z',
  quote_options: [{ id: 'option', brand: 'LAUFENN', model: 'X FIT HT LD01', price_per_tire: 176.99, sort_order: 0, supplier: 'ATD', supplier_product_id: '1023990' }],
};
test('approval, converted jobs, amounts and unknown statuses never masquerade as payment', () => {
  for (const status of ['approved', 'converted', 'draft']) assert.equal(salePaymentState({ status, payment_status: 'unpaid', amount_paid: 999 }).label, 'Not paid');
  assert.equal(salePaymentState({ payment_status: 'pending' }).label, 'Payment pending');
  assert.equal(salePaymentState({ payment_status: 'refunded' }).label, 'Refunded');
  assert.equal(salePaymentState({ payment_status: 'paid' }).label, 'Paid');
  assert.equal(salePaymentState({ payment_status: 'unexpected' }).label, 'Payment needs review');
  assert.equal(isTireShopSale(sample), true); assert.equal(isTireShopSale({ purchase_source: null }), false);
});
test('payment badge shows actual confirmed amount and date, not a calculated quote total', () => {
  const html = renderToStaticMarkup(React.createElement(Status, { record: { payment_status: 'paid', amount_paid: 762.51, paid_at: '2026-10-06T13:02:00Z' } }));
  assert.match(html, /Paid · \$762.51/); assert.match(html, /Online payment confirmed/); assert.match(html, /10\/6\/2026/);
  for (const payment_status of ['unpaid', 'pending', 'refunded']) {
    const html = renderToStaticMarkup(React.createElement(Status, { record: { payment_status, amount_paid: 762.51 } }));
    assert.ok(!html.includes('$762.51')); assert.ok(!html.includes('Online payment confirmed'));
  }
});
function detail(record = sample, salesView = true) {
  const state = [record, false, false, '']; let index = 0; const effects = [], redirected = [], written = [];
  const query = { select() { return this; }, eq() { return this; }, async single() { return { data: record, error: null }; }, update(...args) { written.push(args); return this; } };
  const load = loader({
    react: { ...React, useState: () => [state[index++], () => {}], useEffect: fn => effects.push(fn), useMemo: fn => fn() },
    'next/navigation': { useParams: () => ({ id: record.id }), useRouter: () => ({ replace: url => redirected.push(url), push() {} }), usePathname: () => salesView ? '/tire-shop-sales/sale-48' : '/quotes/sale-48' },
    '@/components/AppHeader': { __esModule: true, default: () => null }, '@/lib/supabase': { supabase: { from: () => query } },
  });
  const html = renderToStaticMarkup(React.createElement(load('app/quotes/[id]/page').default));
  return { html, effects, redirected, written };
}
test('unpaid website sale is not an approved quote and linked unpaid job does not change payment', () => {
  const { html } = detail();
  for (const text of ['Tire Shop Sale · BT-48', 'Not paid', 'Open Job #364', 'Tires only', 'Selected tire', '$717.96']) assert.ok(html.includes(text), text);
  for (const text of ['Email Quote', 'Edit Quote', 'Convert to Job', 'Approved choice', 'Online payment confirmed']) assert.ok(!html.includes(text), text);
});
test('paid and pending sale details are distinct; ordinary quotes keep their existing controls', () => {
  const paid = detail({ ...sample, payment_status: 'paid', amount_paid: 762.51 }).html;
  assert.match(paid, /Paid · \$762.51/); assert.match(paid, /Amount paid/);
  const pending = detail({ ...sample, payment_status: 'pending', converted_job_id: null }).html;
  assert.match(pending, /Payment pending/); assert.ok(!pending.includes('Convert to Job'));
  const quote = detail({ ...sample, purchase_source: null }, false).html;
  assert.match(quote, /Quote #48/); assert.match(quote, /Email Quote/);
});
test('old website quote links redirect to sales without writing or duplicating records', async () => {
  const result = detail(sample, false); result.effects[0](); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(result.redirected, ['/tire-shop-sales/sale-48']); assert.equal(result.written.length, 0);
  const ordinary = detail({ ...sample, purchase_source: null }, true); ordinary.effects[0](); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ordinary.redirected, ['/quotes/sale-48']);
});
test('list separates sales server-side, includes converted records, and supports refresh and pagination', () => {
  const sales = fs.readFileSync(path.resolve(__dirname, '../app/tire-shop-sales/page.tsx'), 'utf8');
  assert.match(sales, /eq\("purchase_source", "website"\)/); assert.match(sales, /range\(0, limit - 1\)/);
  assert.match(sales, /payment_status,amount_paid,paid_at/); assert.match(sales, /setInterval\(visibleRefresh, 30000\)/);
  assert.ok(!sales.includes('.neq("status", "converted")')); assert.ok(!/\.update\(|\.insert\(/.test(sales));
  const quotes = fs.readFileSync(path.resolve(__dirname, '../app/quotes/page.tsx'), 'utf8');
  assert.match(quotes, /purchase_source.is.null,purchase_source.neq.website/);
  for (const file of ['components/AppHeader.tsx', 'app/page.tsx']) assert.ok(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').includes('Tire Shop Sales'));
});
