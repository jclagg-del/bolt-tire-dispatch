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
const request = (id = 1, extra = {}) => new Request('https://example.test/api/orders/approve', { method: 'POST', body: JSON.stringify({ orderId: id, tireSupplier: 'U.S. AutoForce', estimatedDeliveryDate: '2026-10-01', ...extra }) });
const order = (id, extra = {}) => ({ id, customer: 'Kingdom Support Services', job_number: '3097885', mo_number: `MO-${id}`, tire_product_number: '413134582', qty: 4, tire_size: '235/40R18', contact_name: 'Example', contact_number: '2015550123', address: 'Example St', submitted_by: 'Example', service_method: 'delivery', order_status: 'new', tires_ordered: true, approved_job_id: null, reviewed_at: null, requested_date: '2026-10-01', requested_time: '09:30', ...extra });

// Database boundaries only; every route and filter under test is production code.
function fixture({ orders = [order(1)], jobs = [], authenticated = true, insertError, lostInsertResponse = false, linkError = false } = {}) {
  const tables = structuredClone({ customer_orders: orders, jobs, supplier_orders: [] });
  let insertAttempts = 0, failure = insertError;
  const admin = { from(table) {
    let operation = 'select', values, filters = [], limit = Infinity;
    const query = {
      select() { return query; }, eq(key, val) { filters.push(row => row[key] === val); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
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
  return { admin, tables, approve: (id, extra) => route.POST(request(id, extra)), get insertAttempts() { return insertAttempts; } };
}

test('customer contact edits preserve staff scheduling; explicit appointment edits still reschedule', async () => {
  for (const change of [{ contact_number: '2015559999' }, { requested_date: '2026-10-06', requested_time: '11:00' }]) {
    const original = order('1', { order_status: 'approved', approved_job_id: 5, facility_name: 'Example Facility', vehicle_year: '2020', vehicle_make: 'Ford', vehicle_model: 'Transit', requested_time: '09:30:00' });
    const f = fixture({ orders: [original], jobs: [{ id: 5, scheduled: '2026-10-03T14:45:00', complete: false }] });
    const route = loader({ '@/lib/supabase/admin': { createAdminClient: () => f.admin }, '@/lib/kingdom-auth': { hasKingdomAccess: async () => true }, '@/lib/fleet-order-notifications': { sendFleetOrderNotification: async () => {} } })('app/api/public/kingdom/orders/[id]/route.ts');
    const res = await route.PATCH(new Request('https://example.test', { method: 'PATCH', body: JSON.stringify({ ...original, ...change }) }), { params: Promise.resolve({ id: '1' }) });
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    assert.equal(f.tables.jobs[0].scheduled, change.requested_date ? '2026-10-06T11:00:00' : '2026-10-03T14:45:00');
  }
});
test('customer order detail shows the actual appointment separately from the original requested date', () => {
  const row = order(1, { job: { scheduled: '2026-10-03T18:45:00Z', complete: false } }); let state = 0;
  const hooks = { ...React, useEffect() {}, useState: initial => [state++ === 0 ? row : state === 2 ? false : initial, () => {}] };
  const Page = loader({ react: hooks, 'next/navigation': { useParams: () => ({ id: '1' }), useRouter: () => ({}) }, 'next/link': ({ children, ...props }) => React.createElement('a', props, children), '@/components/KingdomPortalGate': ({ children }) => children })('app/kingdom-orders/[id]/page.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /Scheduled appointment: Oct 3, 2026, 2:45 PM/);
  assert.match(html, /Requested Date/); assert.match(html, /value="2026-10-01"/);
});

test('approval defaults to requested appointment and saves overrides independently of supplier ETA', async () => {
  for (const customer of ['Kingdom Support Services', 'HPR']) {
    const f = fixture({ orders: [order(1, { customer }), order(2, { customer, requested_time: '09:30:00' })] });
    assert.equal((await f.approve(1)).status, 200);
    assert.equal(f.tables.jobs[0].scheduled, '2026-10-01T09:30:00');
    assert.equal((await f.approve(2, { scheduledDate: '2026-10-03', scheduledTime: '14:45' })).status, 200);
    const job = f.tables.jobs[1];
    assert.equal(job.scheduled, '2026-10-03T14:45:00');
    assert.equal(job.job_status, 'scheduled');
    assert.equal(job.estimated_delivery_date, '2026-10-01');
    assert.equal(f.tables.customer_orders[1].requested_date, '2026-10-01');
    assert.equal(f.tables.customer_orders[1].requested_time, '09:30:00');
    assert.equal((await f.approve(2, { scheduledDate: '2026-10-05', scheduledTime: '11:00' })).status, 200);
    assert.equal(f.tables.jobs.length, 2);
    assert.equal(job.scheduled, '2026-10-03T14:45:00', 'retry must not reschedule an existing job');
    assert.equal(f.tables.supplier_orders.length, 0);
  }
});
test('invalid or incomplete appointment cannot claim an order or create a job', async () => {
  for (const extra of [
    { scheduledDate: '2026-02-30', scheduledTime: '09:30' },
    { scheduledDate: '', scheduledTime: '09:30' },
    { scheduledDate: '2026-10-03', scheduledTime: '' },
    { scheduledTime: '24:00' }, { scheduledTime: '12:60' },
    { scheduledDate: '10/03/2026' }, { scheduledDate: null }, { scheduledTime: {} },
  ]) {
    const f = fixture();
    assert.equal((await f.approve(1, extra)).status, 400, JSON.stringify(extra));
    assert.equal(f.insertAttempts, 0); assert.equal(f.tables.customer_orders[0].order_status, 'new');
  }
});
test('unscheduled requests remain supported and can be assigned an appointment on approval', async () => {
  const f = fixture({ orders: [order(1, { requested_date: null, requested_time: null }), order(2, { requested_date: null, requested_time: null })] });
  assert.equal((await f.approve(1)).status, 200); assert.equal(f.tables.jobs[0].scheduled, null);
  assert.equal((await f.approve(2, { scheduledDate: '2028-02-29', scheduledTime: '00:00' })).status, 200);
  assert.equal(f.tables.jobs[1].scheduled, '2028-02-29T00:00:00');
});

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
  assert.equal((html.match(/<input[^>]*type="date"[^>]*value="2026-10-01"/g) || []).length, 2);
  assert.equal((html.match(/<input[^>]*type="time"[^>]*value="09:30"/g) || []).length, 2);
  for (const label of ['Requested:', 'Scheduled date', 'Scheduled time', 'separate from tire delivery']) assert.ok(html.includes(label), label);
});
test('staff can change appointment on the card and approval submits and confirms that appointment', async () => {
  let cursor = 0, sent, confirmation;
  const states = [[order(1)], false];
  const hooks = { ...React, useEffect() {}, useCallback: fn => fn, useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], update => { states[index] = typeof update === 'function' ? update(states[index]) : update; }];
  } };
  const Page = loader({ react: hooks, 'next/navigation': { useRouter: () => ({ push() {} }) }, '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'mock' } } }) } } }, '@/components/AppHeader': () => null, '@/components/CustomerOrderPurchase': { default: () => null } })('app/orders/page.tsx').default;
  function render() {
    cursor = 0; const nodes = [];
    function visit(element) {
      if (!element || typeof element !== 'object') return;
      if (Array.isArray(element)) { element.forEach(visit); return; }
      if (typeof element.type === 'function') { visit(element.type(element.props)); return; }
      nodes.push(element); visit(element.props?.children);
    }
    visit(React.createElement(Page)); return nodes;
  }
  let nodes = render();
  nodes.find(n => n.type === 'input' && n.props.type === 'date' && n.props.value === '2026-10-01').props.onChange({ target: { value: '2026-10-03' } });
  nodes = render();
  nodes.find(n => n.type === 'input' && n.props.type === 'time').props.onChange({ target: { value: '14:45' } });
  nodes = render();
  assert.ok(nodes.some(n => n.type === 'input' && n.props.value === '2026-10-03'));
  const oldWindow = global.window, oldFetch = global.fetch;
  global.window = { confirm: text => { confirmation = text; return true; } };
  global.fetch = async (url, init) => { sent = JSON.parse(init.body); throw new Error('Stop at mocked HTTP boundary'); };
  try { await nodes.find(n => n.type === 'button' && n.props.children === 'Approve & Create Job').props.onClick(); }
  finally { global.window = oldWindow; global.fetch = oldFetch; }
  assert.equal(sent.scheduledDate, '2026-10-03'); assert.equal(sent.scheduledTime, '14:45');
  assert.equal(sent.estimatedDeliveryDate, null);
  assert.match(confirmation, /Oct 3/); assert.match(confirmation, /2:45 PM/);
  assert.equal(states[0][0].requested_date, '2026-10-01');
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
