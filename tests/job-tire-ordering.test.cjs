const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const m = new Module(file, module); cache.set(file, m); m.paths = module.paths;
    m.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id === 'server-only' ? {} : id.startsWith('@/') ? load(id.slice(2)) : id.startsWith('.') ? load(path.resolve(path.dirname(file), id)) : require(id);
    m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return m.exports;
  };
}
const helpers = loader()('lib/customer-order-purchasing');
const job = { id: 81, customer: 'Example', po_number: 'JOB123', mo_number: 'MO321', qty: 4, size: '2755520', tire_product_number: '04493930000', tires_ordered: false, complete: false, archived: false };
function fixture({ role = 'office', authenticated = true, supplierFailure = false, jobValues = {}, linked = [], purchases = [], saveFailure = false } = {}) {
  const tables = structuredClone({ jobs: [{ ...job, ...jobValues }], customer_orders: linked, supplier_orders: purchases, staff_security: [{ user_id: 'staff', role }] });
  const calls = [];
  const admin = { from(table) {
    let op = 'select', value, filters = [], limit = Infinity;
    const query = { select() { return query; }, eq(k, v) { filters.push(r => String(r[k]) === String(v)); return query; }, limit(n) { limit = n; return query; }, insert(v) { op = 'insert'; value = v; return query; }, update(v) { op = 'update'; value = v; return query; }, single: () => run(true), maybeSingle: () => run(true), then: (yes, no) => run(false).then(yes, no) };
    async function run(single) {
      let selected = tables[table].filter(r => filters.every(f => f(r))).slice(0, limit);
      if (op === 'insert') {
        if (tables[table].some(r => r.request_id === value.request_id)) return { data: null, error: { code: '23505' } };
        const r = structuredClone(value); tables[table].push(r); selected = [r];
      }
      if (op === 'update') {
        if (saveFailure && table === 'jobs') return { data: null, error: { message: 'Save failed' } };
        selected.forEach(r => Object.assign(r, structuredClone(value)));
      }
      return { data: structuredClone(single ? selected[0] || null : selected), error: null };
    }
    return query;
  } };
  const preview = { order: { ordertotal: 500, orderlines: [{ fulfillments: [{ quantity: 4, estimateddelivery: '2026-10-01' }] }] } };
  const product = { atdProductNumber: job.tire_product_number, lineCode: 'GY', model: 'Grabber H/T', brand: 'General', size: '275/55R20' };
  const route = loader({
    '@/lib/supabase/admin': { createAdminClient: () => admin, requireApiUser: async () => authenticated ? { id: 'staff' } : null },
    '@/lib/atd': { atdEnvironment: 'production', searchAtdByPartNumber: async part => { calls.push({ action: 'search', part }); return [product]; }, previewAtdOrder: async input => { calls.push({ action: 'preview', input }); return preview; }, placeAtdOrder: async input => { calls.push({ action: 'place', input }); if (supplierFailure) throw new Error('Timeout'); return { order: { ...preview.order, confirmationnumber: 'ATD-CONFIRMED' } }; } },
    '@/lib/usaf': { usaForceOrderingStatus: () => ({ production: true }) },
    '@/lib/usaf-ordering': { searchUsafOrderProduct: async (part, qty) => { calls.push({ action: 'search', part, qty }); return [product]; }, previewUsafOrder: async input => { calls.push({ action: 'preview', input }); return { supplier: 'U.S. AutoForce', ...preview }; }, placeUsafOrder: async input => { calls.push({ action: 'place', input }); if (supplierFailure) throw new Error('Timeout'); return { supplier: 'U.S. AutoForce', order: { ...preview.order, confirmationnumber: 'USAF-CONFIRMED' } }; } },
  })('app/api/orders/purchase/route');
  const request = extra => route.POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ jobId: 81, action: 'place', supplier: 'USAF', productNumber: job.tire_product_number, lineCode: 'GY', branch: '4853', expectedTotal: 500, expectedQuantity: 4, expectedPo: 'JOB123', expectedDeliveryDate: '2026-10-01', ...extra }) }));
  return { tables, calls, request };
}
test('job button looks up the saved exact part; preview does not buy; USAF/ATD confirmation fills job details', async () => {
  for (const supplier of ['USAF', 'ATD']) {
    const f = fixture();
    assert.equal((await f.request({ action: 'search', supplier })).status, 200);
    assert.equal(f.calls[0].part, '04493930000');
    assert.equal((await f.request({ action: 'preview', supplier })).status, 200);
    assert.equal(f.calls.filter(c => c.action === 'place').length, 0);
    const result = await f.request({ supplier }); assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
    assert.equal(f.tables.jobs[0].tires_ordered, true);
    assert.equal(f.tables.jobs[0].tire_supplier, supplier === 'USAF' ? 'U.S. AutoForce' : 'ATD');
    assert.equal(f.tables.jobs[0].estimated_delivery_date, '2026-10-01');
    const input = f.calls.find(c => c.action === 'place').input;
    assert.equal(input.quantity, 4); assert.equal(input.po || input.customerPoNumber, 'JOB123');
    if (supplier === 'USAF') assert.equal(input.mo, 'MO321');
    assert.equal(f.tables.jobs.length, 1); assert.equal(f.tables.customer_orders.length, 0);
    assert.equal((await f.request({ supplier })).status, 200);
    assert.equal(f.calls.filter(c => c.action === 'place').length, 1);
  }
});
test('simultaneous job requests and an uncertain supplier response cannot purchase twice', async () => {
  for (const supplierFailure of [false, true]) {
    const f = fixture({ supplierFailure });
    await Promise.all([f.request({}), f.request({})]);
    await f.request({});
    assert.equal(f.calls.filter(c => c.action === 'place').length, 1);
    assert.equal(f.tables.supplier_orders.length, 1);
    assert.equal(f.tables.jobs[0].tires_ordered, !supplierFailure);
  }
});
test('job and originating customer request share one supplier purchase and sync both statuses', async () => {
  const linked = [{ id: 42, approved_job_id: 81, qty: 4, tire_product_number: job.tire_product_number, order_status: 'approved', tires_ordered: false }];
  const f = fixture({ linked });
  assert.equal((await f.request({})).status, 200);
  assert.equal(f.tables.supplier_orders[0].request_id, helpers.purchasingRequestId(42));
  assert.equal(f.tables.customer_orders[0].tires_ordered, true);
  // Reopening the job recovers the existing receipt, even if its status update was lost.
  f.tables.jobs[0].tires_ordered = false;
  assert.equal((await f.request({ action: 'search' })).status, 200);
  assert.equal(f.calls.filter(c => c.action === 'place').length, 1);
  assert.equal(f.tables.jobs[0].tires_ordered, true);
});
test('a purchase already made on Orders is shown from the job without submitting any supplier order', async () => {
  const response = { supplier: 'U.S. AutoForce', order: { confirmationnumber: 'EARLIER', ordertotal: 500, fulfillments: [{ quantity: 4, estimateddelivery: '2026-10-01' }] } };
  const f = fixture({ linked: [{ id: 42, approved_job_id: 81, qty: 4, tire_product_number: job.tire_product_number, tires_ordered: true, order_status: 'approved' }], purchases: [{ request_id: helpers.purchasingRequestId(42), status: 'placed', response }] });
  const result = await f.request({ action: 'search' }); assert.equal(result.status, 200);
  assert.equal((await result.json()).completed.confirmation, 'EARLIER'); assert.equal(f.calls.length, 0);
  assert.equal(f.tables.jobs[0].tires_ordered, true);
});
test('different jobs sharing a PO and part use distinct purchase IDs', async () => {
  assert.notEqual(helpers.jobPurchasingRequestId(81), helpers.jobPurchasingRequestId(82));
  assert.notEqual(helpers.jobPurchasingRequestId(81), helpers.purchasingRequestId(81));
  const f = fixture(); f.tables.jobs.push({ ...job, id: 82 });
  assert.equal((await f.request({})).status, 200); assert.equal((await f.request({ jobId: 82 })).status, 200);
  assert.equal(f.calls.filter(c => c.action === 'place').length, 2);
});
test('auth, saved job, exact part, PO, quantity, and fresh price are required; completed and already-ordered jobs cannot buy', async () => {
  for (const options of [{ authenticated: false }, { role: 'customer' }, { jobValues: { complete: true } }, { jobValues: { archived: true } }, { jobValues: { tires_ordered: true } }, { jobValues: { po_number: '' } }, { jobValues: { qty: 0 } }, { jobValues: { tire_product_number: '123 / 456' } }]) {
    const f = fixture(options); assert.ok((await f.request({})).status >= 400); assert.equal(f.calls.filter(c => c.action === 'place').length, 0);
  }
  for (const input of [{ expectedTotal: 1 }, { expectedQuantity: 3 }, { expectedPo: 'changed' }, { productNumber: '4493930000' }, { jobId: null, orderId: null }]) {
    const f = fixture(); assert.ok((await f.request(input)).status >= 400); assert.equal(f.calls.filter(c => c.action === 'place').length, 0);
  }
});
test('failed job sync reports supplier confirmation, and retry never reorders', async () => {
  const f = fixture({ saveFailure: true });
  const first = await (await f.request({})).json(); assert.match(first.warning, /Do not reorder/); assert.ok(first.completed.confirmation);
  await f.request({}); assert.equal(f.calls.filter(c => c.action === 'place').length, 1);
});

const form = { customer: 'Example', tires: 'GENERAL Grabber H/T', size: '2755520', qty: '4', tire_product_number: '04493930000', po_number: 'JOB123', mo_number: 'MO321', tire_supplier: 'USAF', tires_ordered: false };
test('job form replaces the status checkbox with a review button and preserves manual ordering as an option', () => {
  const Component = loader({ '@/lib/supabase': {} })('components/JobTireOrdering').default;
  const props = { form, disabled: false, onPrepare: async () => 81, onComplete() {}, onManualChange() {} };
  const html = renderToStaticMarkup(React.createElement(Component, props));
  for (const text of ['Order tires', '04493930000', 'GENERAL Grabber H/T', 'Already ordered elsewhere?', 'before placing the order']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /Tires Not Ordered/);
  const incomplete = renderToStaticMarkup(React.createElement(Component, { ...props, form: { ...form, po_number: '' } }));
  assert.match(incomplete, /Enter the job \/ PO number first/); assert.match(incomplete, /disabled=""/);
});
test('clicking Order tires saves first and populates the dialog without purchasing', async () => {
  let stateIndex = 0, refIndex = 0, saves = 0, completed;
  const states = [], refs = [];
  const Dialog = () => null;
  const hooks = { ...React, useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; }, useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; } };
  const Component = loader({ react: hooks, './CustomerOrderPurchase': { __esModule: true, default: Dialog } })('components/JobTireOrdering').default;
  const props = { form, disabled: false, onPrepare: async () => { saves++; return 81; }, onComplete: details => { completed = details; }, onManualChange() {} };
  const nodes = element => !element || typeof element !== 'object' ? [] : [element, ...React.Children.toArray(element.props?.children).flatMap(nodes)];
  const render = () => { stateIndex = 0; refIndex = 0; return nodes(Component(props)); };
  const button = render().find(n => n.type === 'button');
  assert.equal(saves, 0); await button.props.onClick(); assert.equal(saves, 1);
  const dialog = render().find(n => n.type === Dialog);
  assert.equal(dialog.props.jobContext, true); assert.equal(dialog.props.order.id, 81);
  assert.equal(dialog.props.order.tire_product_number, '04493930000'); assert.equal(dialog.props.order.qty, 4);
  assert.equal(dialog.props.order.job_number, 'JOB123'); assert.equal(dialog.props.order.mo_number, 'MO321');
  dialog.props.onComplete({ supplier: 'U.S. AutoForce', deliveryDate: '2026-10-01' }); assert.equal(completed.supplier, 'U.S. AutoForce');
});
test('new and edit job pages both use the shared flow, stay on the job and never create a second saved job', () => {
  const fresh = fs.readFileSync(path.resolve(__dirname, '../app/jobs/new/page.tsx'), 'utf8');
  const edit = fs.readFileSync(path.resolve(__dirname, '../app/jobs/[id]/page.tsx'), 'utf8');
  for (const source of [fresh, edit]) { assert.match(source, /<JobTireOrdering form=\{form\}/); assert.match(source, /tire_supplier: details\.supplier, estimated_delivery_date: details\.deliveryDate/); assert.doesNotMatch(source, /Tires Not Ordered/); }
  assert.match(fresh, /savedJobId != null \? supabase\.from\("jobs"\)\.update\(payload\)/);
  assert.match(fresh, /if \(stayForPurchase\) \{ setSaving\(false\); return saved\.id/);
  assert.match(edit, /if \(stayForPurchase\) return id/);
  assert.match(edit, /!stayForPurchase \? \{/);
});
