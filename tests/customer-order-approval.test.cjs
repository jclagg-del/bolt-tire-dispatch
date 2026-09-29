const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); cache.set(file, mod); mod.paths = module.paths;
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id === 'server-only' ? {} : id.startsWith('@/') ? load(id.slice(2) + (id.startsWith('@/components/') ? '.tsx' : '')) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return mod.exports;
  };
}
const request = (id = 1) => new Request('https://example.test/api/orders/approve', { method: 'POST', body: JSON.stringify({ orderId: id, tireSupplier: 'U.S. AutoForce', estimatedDeliveryDate: '2026-10-01' }) });
const order = (id, extra = {}) => ({ id, customer: 'Kingdom Support Services', job_number: '3097885', mo_number: `MO-${id}`, tire_product_number: '413134582', qty: 4, tire_size: '235/40R18', contact_name: 'Example', contact_number: '2015550123', address: 'Example St', submitted_by: 'Example', service_method: 'delivery', order_status: 'new', tires_ordered: true, approved_job_id: null, reviewed_at: null, requested_date: '2026-10-01', requested_time: '09:30', ...extra });

// Database boundaries only; every route and filter under test is production code.
function fixture({ orders = [order(1)], jobs = [], authenticated = true, insertError, lostInsertResponse = false, linkError = false } = {}) {
  const tables = structuredClone({ customer_orders: orders, jobs, supplier_orders: [] });
  let insertAttempts = 0, failure = insertError;
  const admin = { from(table) {
    let operation = 'select', values, filters = [], limit = Infinity;
    const query = {
      select() { return query; }, eq(key, val) { filters.push(row => row[key] === val); return query; },
      is(key, val) { filters.push(row => (row[key] ?? null) === val); return query; },
      order() { return query; }, limit(n) { limit = n; return query; },
      update(value) { operation = 'update'; values = value; return query; },
      insert(value) { operation = 'insert'; values = value; return query; },
      single: () => run(true), maybeSingle: () => run(true), then: (yes, no) => run(false).then(yes, no),
    };
    async function run(single) {
      let found = tables[table].filter(row => filters.every(filter => filter(row))).slice(0, limit);
      if (operation === 'insert') {
        insertAttempts++;
        if (failure) { const error = failure; failure = null; return { data: null, error }; }
        const row = { id: Math.max(0, ...tables[table].map(r => r.id)) + 1, ...structuredClone(values) };
        tables[table].push(row); found = [row];
        if (lostInsertResponse) return { data: null, error: { code: '', message: 'Network response lost' } };
      }
      if (operation === 'update') {
        if (table === 'customer_orders' && values.approved_job_id && linkError) return { data: null, error: { message: 'Link write failed' } };
        found.forEach(row => Object.assign(row, structuredClone(values)));
      }
      // Requests must see snapshots, not aliases mutated by concurrent requests.
      return { data: structuredClone(single ? found[0] || null : found), error: null };
    }
    return query;
  } };
  const route = loader({ '@/lib/supabase/admin': { createAdminClient: () => admin, requireApiUser: async () => authenticated ? { id: 'staff' } : null } })('app/api/orders/approve/route.ts');
  return { tables, approve: id => route.POST(request(id)), get insertAttempts() { return insertAttempts; } };
}

test('distinct orders with identical PO and part each create their own job; old completed job is untouched', async () => {
  for (const customer of ['Kingdom Support Services', 'HPR']) {
    const existing = { id: 100, customer, po_number: '3097885', tire_product_number: '413134582', complete: true, archived: false, qty: 2, tire_supplier: 'ATD' };
    const f = fixture({ orders: [order(1, { customer }), order(2, { customer })], jobs: [existing] });
    const a = await f.approve(1), b = await f.approve(2);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    const first = (await a.json()).jobId, second = (await b.json()).jobId;
    assert.notEqual(first, second); assert.notEqual(first, 100); assert.notEqual(second, 100);
    assert.deepEqual(f.tables.jobs[0], existing);
    assert.equal(f.tables.customer_orders[0].approved_job_id, first); assert.equal(f.tables.customer_orders[1].approved_job_id, second);
    for (const job of f.tables.jobs.slice(1)) { assert.equal(job.complete, false); assert.equal(job.qty, 4); assert.equal(job.po_number, '3097885'); assert.match(job.notes, /Order request #[12]/); }
    assert.equal(f.tables.supplier_orders.length, 0);
  }
});
test('same part with different POs or repeated PO with different parts never captures another job', async () => {
  for (const extra of [{ job_number: 'ANOTHER-PO' }, { tire_product_number: 'ANOTHER-PART' }, { job_number: null }]) {
    const f = fixture({ orders: [order(1), order(2, extra)] });
    assert.equal((await f.approve(1)).status, 200); assert.equal((await f.approve(2)).status, 200);
    assert.equal(f.tables.jobs.length, 2); assert.notEqual(f.tables.customer_orders[0].approved_job_id, f.tables.customer_orders[1].approved_job_id);
  }
});
test('repeated and simultaneous approval of the same order creates only one job', async () => {
  const f = fixture();
  const results = await Promise.all([f.approve(1), f.approve(1), f.approve(1)]);
  assert.ok(results.some(r => r.status === 200));
  assert.ok(results.every(r => [200, 409].includes(r.status)));
  for (let i = 0; i < 3; i++) assert.equal((await f.approve(1)).status, 200);
  assert.equal(f.tables.jobs.length, 1); assert.equal(f.insertAttempts, 1);
});
test('an uncertain old approval never expires into another job insert', async () => {
  for (const reviewed_at of ['2026-01-01T00:00:00Z', null]) {
    const f = fixture({ orders: [order(1, { order_status: 'approved', reviewed_at })] });
    const res = await f.approve(1); assert.equal(res.status, 409); assert.match((await res.json()).error, /awaiting review/); assert.equal(f.insertAttempts, 0);
  }
});
test('lost insert responses and failed order links stay locked, without creating replacement jobs', async () => {
  for (const extra of [{ lostInsertResponse: true }, { linkError: true }]) {
    const f = fixture(extra);
    assert.equal((await f.approve(1)).status, 500);
    assert.equal(f.tables.jobs.length, 1); assert.equal(f.tables.customer_orders[0].order_status, 'approved');
    f.tables.customer_orders[0].reviewed_at = '2026-01-01T00:00:00Z';
    assert.equal((await f.approve(1)).status, 409); assert.equal(f.insertAttempts, 1);
  }
});
test('definite rejected inserts release their claim; unknown errors do not', async () => {
  const f = fixture({ insertError: { code: '23502', message: 'Required field missing' } });
  assert.equal((await f.approve(1)).status, 500); assert.equal(f.tables.customer_orders[0].order_status, 'new');
  assert.equal((await f.approve(1)).status, 200); assert.equal(f.tables.jobs.length, 1);
  const uncertain = fixture({ insertError: { code: '', message: 'Timeout' } });
  assert.equal((await uncertain.approve(1)).status, 500); assert.equal((await uncertain.approve(1)).status, 409); assert.equal(uncertain.insertAttempts, 1);
});
test('unauthorized or rejected requests cannot create or capture jobs', async () => {
  assert.equal((await fixture({ authenticated: false }).approve(1)).status, 401);
  const f = fixture({ orders: [order(1, { order_status: 'rejected' })], jobs: [{ id: 99, customer: 'Kingdom Support Services', po_number: '3097885' }] });
  assert.equal((await f.approve(1)).status, 409); assert.equal(f.insertAttempts, 0); assert.equal(f.tables.customer_orders[0].approved_job_id, null);
});

const { possibleDuplicateOrders } = loader()('lib/customer-order-duplicates');
test('duplicate warnings are advisory, customer-specific and never based on part alone', () => {
  const rows = [order(1), order(2), order(3, { customer: 'HPR' }), order(4, { job_number: 'OTHER' }), order(5, { job_number: null })];
  const original = structuredClone(rows);
  assert.deepEqual(possibleDuplicateOrders(rows), { 1: [2], 2: [1] });
  assert.deepEqual(rows, original);
  assert.deepEqual(possibleDuplicateOrders([order(1), order(1)]), {});
  assert.deepEqual(possibleDuplicateOrders([order(1, { job_number: '00123' }), order(2, { job_number: '123' })]), {});
});
test('staff renders separate cards, order IDs and a warning, with both approve actions enabled', () => {
  const rows = [order(1), order(2)]; let state = 0;
  const hooks = { ...React, useEffect() {}, useCallback: fn => fn, useState: initial => [state++ === 0 ? rows : state === 2 ? false : initial, () => {}] };
  const Page = loader({ react: hooks, 'next/navigation': { useRouter: () => ({ push() {} }) }, '@/lib/supabase': { supabase: {} }, '@/components/AppHeader': () => null, '@/components/CustomerOrderPurchase': { default: () => null } })('app/orders/page.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.equal((html.match(/<article/g) || []).length, 2);
  for (const label of ['Order #1', 'Order #2', 'Possible duplicate', 'nothing is automatically combined']) assert.ok(html.includes(label), label);
  assert.equal((html.match(/>Approve &amp; Create Job<\/button>/g) || []).length, 2);
  assert.ok(html.includes('overflow-wrap:anywhere'));
});
test('customer tracking also retains separate entries and links when PO and part match', () => {
  const rows = [order(1), order(2)]; let state = 0;
  const hooks = { ...React, useEffect() {}, useMemo: fn => fn(), useState: initial => [state++ === 0 ? rows : state === 4 ? false : initial, () => {}] };
  const Page = loader({ react: hooks, 'next/link': ({ children, ...props }) => React.createElement('a', props, children), '@/components/KingdomPortalGate': ({ children }) => children })('app/kingdom-orders/page.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.ok(html.includes('href="/kingdom-orders/1"')); assert.ok(html.includes('href="/kingdom-orders/2"'));
  assert.equal((html.match(/Job\/PO 3097885/g) || []).length, 2);
  assert.equal((html.match(/Pending Review/g) || []).length, 2);
});
