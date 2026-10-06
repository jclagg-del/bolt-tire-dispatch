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
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id === 'server-only' ? {} : id.startsWith('@/') ? load(id.slice(2)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return mod.exports;
  };
}
const details = { address: '123 Example St, Newburgh, NY 12550', email: 'test@example.com', phone: '(201) 555-0123', requested_date: '2026-10-15' };
const option = { id: 'option', brand: 'General', model: 'Grabber', price_per_tire: 100, sort_order: 0 };
const quote = { id: 'quote', public_token: 'token', quote_number: 123, customer: 'Example', payment_status: 'unpaid', purchase_source: 'staff', quantity: 4, installation_cost: 100, disposal_fee: 20, service_call_fee: 0, ny_state_tire_fee: 10, tax_exempt: false, quote_options: [option] };
async function setup(run, { saved = {}, saveError = false, changed = false } = {}) {
  const row = { ...quote, ...saved }, writes = [], calls = [];
  const admin = { from() {
    let values, filters = [];
    const query = { select() { return query; }, eq(k, v) { filters.push(r => r[k] === v); return query; }, is(k, v) { filters.push(r => (r[k] ?? null) === v); return query; }, update(v) { values = v; return query; }, single: () => execute(), maybeSingle: () => execute(), then: (yes, no) => execute().then(yes, no) };
    async function execute() {
      if (!values) return { data: structuredClone(row) };
      if (saveError) return { error: { message: 'Database unavailable' } };
      if (changed || !filters.every(f => f(row))) return { data: null };
      writes.push(values); Object.assign(row, values); return { data: { id: row.id } };
    }
    return query;
  } };
  const old = { fetch: global.fetch, key: process.env.STRIPE_SECRET_KEY, pub: process.env.STRIPE_PUBLISHABLE_KEY };
  process.env.STRIPE_SECRET_KEY = 'mock'; process.env.STRIPE_PUBLISHABLE_KEY = 'mock';
  global.fetch = async (url, init) => {
    calls.push({ url, body: init.body });
    assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.ok(writes.length, 'Save customer details before opening payment');
    return Response.json({ id: 'session', client_secret: 'mock-secret' });
  };
  const route = loader({ '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/discounts-server': { lookupDiscount: async () => { throw new Error('No discount lookup for staff quotes'); } } })('app/api/public/quotes/[token]/checkout/route.ts');
  const post = body => route.POST(new Request('https://example.test/api/public/quotes/token/checkout', { method: 'POST', body: JSON.stringify({ optionId: 'option', ...body }) }), { params: Promise.resolve({ token: 'token' }) });
  try { await run({ post, row, writes, calls }); }
  finally { global.fetch = old.fetch; for (const [name, value] of [['STRIPE_SECRET_KEY', old.key], ['STRIPE_PUBLISHABLE_KEY', old.pub]]) if (value === undefined) delete process.env[name]; else process.env[name] = value; }
}
test('sent quotes cannot bypass any required contact or date field, including direct purchase links', async () => {
  for (const field of Object.keys(details)) await setup(async ({ post, writes, calls }) => {
    for (const purchase of [false, true]) assert.equal((await post({ purchase, customerDetails: { ...details, [field]: ' ' } })).status, 400);
    assert.equal(writes.length, 0); assert.equal(calls.length, 0);
  });
  for (const patch of [{ email: 'bad' }, { phone: '123' }, { requested_date: '2026-02-30' }, { requested_date: 'not a date' }]) await setup(async ({ post, calls }) => {
    assert.equal((await post({ customerDetails: { ...details, ...patch } })).status, 400); assert.equal(calls.length, 0);
  });
  await setup(async ({ post, calls }) => { assert.equal((await post({})).status, 400); assert.equal(calls.length, 0); });
});
test('valid details are saved before payment without accepting client prices or tax changes', async () => {
  await setup(async ({ post, row, calls }) => {
    const response = await post({ customerDetails: { ...details, email: ' test@example.com ', tax_exempt: true, quantity: 1, installation_cost: 0 } });
    assert.equal(response.status, 200);
    for (const [field, value] of Object.entries(details)) assert.equal(row[field], value);
    assert.equal(row.requested_time, null); assert.equal(row.tax_exempt, false); assert.equal(row.quantity, 4);
    assert.equal(calls[0].body.get('customer_email'), details.email);
    assert.equal(calls[0].body.get('line_items[0][price_data][unit_amount]'), '52000');
    assert.equal(calls[0].body.get('automatic_tax[enabled]'), 'true');
  }, { saved: { requested_date: '2026-10-01', requested_time: '09:30' } });
});
test('checkout charges saved additional lines exactly once and ignores customer-supplied extras', async () => {
  const additional_items = [{ description: 'TPMS sensor', quantity: 2, unit_price: 42.50, taxable: true }, { description: 'Non-taxable service', quantity: 1.5, unit_price: 20, taxable: false }];
  for (const tax_exempt of [false, true]) await setup(async ({ post, calls }) => {
    const response = await post({ customerDetails: details, additional_items: [], installation_cost: 0 });
    assert.equal(response.status, 200);
    const body = calls[0].body;
    assert.equal(body.get('line_items[0][price_data][unit_amount]'), '52000');
    assert.equal(body.get('line_items[2][price_data][unit_amount]'), '8500');
    assert.equal(body.get('line_items[3][price_data][unit_amount]'), '3000');
    assert.equal(body.get('line_items[2][price_data][product_data][tax_code]'), 'txcd_99999999');
    assert.equal(body.get('line_items[3][price_data][product_data][tax_code]'), 'txcd_00000000');
    assert.equal(body.get('automatic_tax[enabled]'), tax_exempt ? null : 'true');
  }, { saved: { additional_items, tax_exempt } });
  await setup(async ({ post, calls }) => {
    assert.equal((await post({ customerDetails: details })).status, 400); assert.equal(calls.length, 0);
  }, { saved: { additional_items: [{ ...additional_items[0], quantity: -1 }] } });
});
test('saved complete details work; paid, failed-save, changed and invalid-option requests cannot start payment', async () => {
  await setup(async ({ post }) => { assert.equal((await post({})).status, 200); }, { saved: details });
  for (const [settings, expected] of [[{ saveError: true }, 500], [{ changed: true }, 409], [{ saved: { payment_status: 'paid' } }, 409]]) {
    await setup(async ({ post, calls }) => { assert.equal((await post({ customerDetails: details })).status, expected); assert.equal(calls.length, 0); }, settings);
  }
  await setup(async ({ post, calls, writes }) => { assert.equal((await post({ optionId: 'wrong', customerDetails: details })).status, 400); assert.equal(calls.length, 0); assert.equal(writes.length, 0); });
});
test('customer fields prefill, are required and lock while payment is open', () => {
  const Component = loader()('components/QuoteCheckoutInformation.tsx').default;
  for (const disabled of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(Component, { value: details, disabled, onChange() {} }));
    for (const label of ['Service address *', 'Email *', 'Phone *', 'Requested service date *']) assert.ok(html.includes(label));
    for (const value of Object.values(details)) assert.ok(html.includes(value));
    assert.equal((html.match(/required=""/g) || []).length, 4);
    assert.equal((html.match(/disabled=""/g) || []).length, disabled ? 4 : 0);
    assert.match(html, /subject to confirmation/);
  }
});
test('normal and direct sent-quote pages keep the editable form visible after validation errors', () => {
  for (const purchase of [false, true]) {
    let index = 0;
    const state = [quote, 'Enter a valid phone number.', null, null, details];
    const Page = loader({ react: { ...React, useEffect() {}, useState: initial => [state[index++] ?? initial, () => {}] }, 'next/navigation': { useParams: () => ({ token: 'token' }), useSearchParams: () => new URLSearchParams(purchase ? 'purchase=1' : '') }, '@/components/EmbeddedStripeCheckout': () => null })('app/q/[token]/page.tsx').default;
    const html = renderToStaticMarkup(React.createElement(Page));
    assert.match(html, /Your information/); assert.match(html, /role="alert"/); assert.match(html, /Requested service date/);
    assert.match(html, /value="test@example.com"/);
  }
});
test('staff quote displays requested date and retains it when converting to a job', () => {
  let index = 0; const row = { ...quote, ...details };
  const Page = loader({ react: { ...React, useEffect() {}, useState: initial => [index++ === 0 ? row : index === 2 ? false : initial, () => {}] }, 'next/navigation': { useParams: () => ({ id: 'quote' }), useRouter: () => ({}) }, '@/lib/supabase': { supabase: {} }, '@/components/AppHeader': () => null })('app/quotes/[id]/page.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /Requested service date: October 15, 2026/);
  for (const value of [details.phone, details.email, details.address]) assert.ok(html.includes(value));
  const source = fs.readFileSync(path.join(__dirname, '../app/quotes/[id]/page.tsx'), 'utf8');
  assert.match(source, /Requested service date: \$\{quote.requested_date\}/);
});
