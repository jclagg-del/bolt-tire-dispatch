const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(relative) {
    const file = path.resolve(__dirname, '..', relative);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2) + '.ts') : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return mod.exports;
  };
}
const helpers = loader()('lib/staff-order-edit.ts');
const base = { id: 1, customer: 'Kingdom Support Services', goodyear_order: false, service_method: 'delivery', submitted_by: 'Dispatcher', contact_name: 'Contact', contact_number: '5550100', facility_id: 1, facility_name: 'Example Facility', address: 'Example Address', requested_date: '2026-11-05', requested_time: '09:30:00', vehicle_year: '2024', vehicle_make: 'Ford', vehicle_model: 'Transit', vehicle_color: 'White', license_plate: 'ABC123', job_number: '001234', mo_number: '005678', tire_position: 'Left rear', qty: 4, tire_size: '235/65R16', tire_product_number: '123456', notes: 'Original notes', order_status: 'new', approved_job_id: null, reviewed_at: null, tires_ordered: false, source_quote_id: null, payment_status: 'unpaid', amount_paid: null, tire_items: null };
const context = { params: Promise.resolve({ id: '1' }) };
function fixture({ role = 'admin', setup = false, row = {}, purchase = null, rpcError = null, queryError = null } = {}) {
  const order = { ...base, ...row }, calls = [];
  const facilities = [{ id: 1, name: 'Example Facility', address: 'Example Address' }, { id: 2, name: 'Second Facility', address: 'Second Address' }];
  const admin = { from(table) {
    const filters = {};
    const run = async single => {
      let data = table === 'staff_security' ? { role, password_change_required: setup } : table === 'customer_orders' ? structuredClone(order) : table === 'supplier_orders' ? purchase : single ? facilities.find(item => item.id === filters.id) : facilities;
      return { data, error: table === queryError ? { message: 'failure' } : null };
    };
    const chain = { select() { return chain; }, eq(k, v) { filters[k] = v; return chain; }, order() { return chain; }, maybeSingle: () => run(true), then: (yes, no) => run(false).then(yes, no) };
    return chain;
  }, rpc: async (name, args) => { calls.push({ name, args }); return { data: null, error: rpcError }; } };
  const route = loader({ '@/lib/supabase/admin': { createAdminClient: () => admin, requireApiUser: async () => role === null ? null : { id: 'actor' } } })('app/api/orders/[id]/edit/route.ts');
  const get = () => route.GET(new Request('https://example.test/api/orders/1/edit'), context);
  const patch = body => route.PATCH(new Request('https://example.test/api/orders/1/edit', { method: 'PATCH', body: JSON.stringify(body) }), context);
  const save = async changes => { const opened = await (await get()).json(); return patch({ version: opened.version, changes: { ...opened.order, ...changes } }); };
  return { route, calls, order, facilities, get, patch, save };
}

test('staff edit GET/PATCH require fully set-up office/admin, not portal PIN or technician access', async () => {
  for (const config of [{ role: null }, { role: 'technician' }, { role: 'customer' }, { setup: true }, { queryError: 'staff_security' }]) {
    const f = fixture(config);
    assert.equal((await f.get()).status, config.role === null ? 401 : 403);
    assert.equal((await f.patch({})).status, config.role === null ? 401 : 403);
    assert.equal(f.calls.length, 0);
  }
  for (const role of ['admin', 'office']) assert.equal((await fixture({ role }).get()).status, 200);
});
test('accepted, claimed, rejected, cancelled, paid and nonportal orders cannot be edited', async () => {
  for (const row of [{ order_status: 'approved' }, { approved_job_id: 5 }, { order_status: 'rejected' }, { order_status: 'cancellation_requested' }, { payment_status: 'paid' }, { amount_paid: 1 }, { source_quote_id: 'quote' }, { customer: 'Website buyer' }, { tire_items: [{ quantity: 4 }] }]) {
    const f = fixture({ row });
    assert.equal((await f.get()).status, 409); assert.equal((await f.patch({})).status, 409); assert.equal(f.calls.length, 0);
  }
});
test('KSS and HPR save all dedicated fields without approval, purchase, payment or facility side effects', async () => {
  for (const customer of helpers.FLEET_CUSTOMERS) {
    const f = fixture({ row: { customer } });
    const result = await f.save({ submitted_by: ' New dispatcher ', contact_name: 'New contact', contact_number: '5550123', address: 'New address', vehicle_year: '2025', vehicle_make: 'Chevrolet', vehicle_model: 'Express', vehicle_color: 'Blue', license_plate: 'NEW123', tire_position: 'Front', requested_date: '2026-11-06', requested_time: '14:00', qty: 2, tire_size: '245/75R16', tire_product_number: '999999', notes: 'Changed' });
    assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
    assert.equal(f.calls.length, 1); const call = f.calls[0]; assert.equal(call.name, 'staff_edit_fleet_order');
    assert.deepEqual(call.args.p_expected, f.order); assert.equal(call.args.p_changes.submitted_by, 'New dispatcher');
    assert.equal(call.args.p_changes.license_plate, 'NEW123'); assert.equal(call.args.p_changes.tire_position, 'Front');
    assert.equal(call.args.p_changes.job_number, '001234'); assert.equal(call.args.p_changes.mo_number, '005678');
    assert.deepEqual(Object.keys(call.args.p_changes).sort(), [...helpers.ORDER_EDIT_FIELDS].sort());
    assert.equal(f.order.order_status, 'new'); assert.equal(f.order.approved_job_id, null);
  }
});
test('invalid field input fails before database writes, including noon and impossible dates', async () => {
  for (const changes of [{ job_number: '' }, { mo_number: '' }, { qty: 0 }, { qty: 1.5 }, { qty: '4' }, { requested_time: '12:15' }, { requested_time: '25:00' }, { requested_date: '2026-02-30' }, { contact_number: '' }, { submitted_by: '' }, { facility_name: '' }, { facility_id: -1 }, { service_method: 'other' }, { goodyear_order: 'true' }, { tire_size: '' }, { vehicle_make: '' }, { notes: 'x'.repeat(10001) }]) {
    const f = fixture(); const res = await f.save(changes); assert.equal(res.status, 400, JSON.stringify(changes)); assert.equal(f.calls.length, 0);
  }
});
test('stale browser data cannot replace newer portal or office changes', async () => {
  const f = fixture(); const opened = await (await f.get()).json(); f.order.notes = 'Changed elsewhere';
  assert.equal((await f.patch({ version: opened.version, changes: opened.order })).status, 409); assert.equal(f.calls.length, 0);
  const conflict = fixture({ rpcError: { code: 'P0001', message: 'This order changed. Reload it.' } });
  assert.equal((await conflict.save({ notes: 'late' })).status, 409);
});
test('supplier purchase locks tire/order references but still permits contact, facility, vehicle and time corrections', async () => {
  for (const config of [{ purchase: { status: 'pending' } }, { purchase: { status: 'placed' } }, { purchase: { status: 'needs_review' } }, { row: { tires_ordered: true } }]) {
    const f = fixture(config); assert.equal((await (await f.get()).json()).purchaseLocked, true);
    for (const changes of [{ qty: 2 }, { tire_size: 'different' }, { tire_product_number: 'different' }, { job_number: 'different' }, { mo_number: 'different' }, { customer: 'HPR' }, { goodyear_order: true }]) assert.equal((await f.save(changes)).status, 409);
    assert.equal(f.calls.length, 0);
    assert.equal((await f.save({ contact_name: 'Correct contact', license_plate: 'NEW', tire_position: 'Rear', requested_time: '11:00', facility_id: 2, facility_name: 'Wrong client name' })).status, 200);
    assert.equal(f.calls[0].args.p_changes.facility_name, 'Second Facility');
  }
});
test('server uses allowlisted changes and preserves paid/supplier/job metadata', async () => {
  const f = fixture(); assert.equal((await f.save({ order_status: 'approved', tires_ordered: true, amount_paid: 100, tax_exempt: true, approved_job_id: 50 })).status, 200);
  for (const key of ['order_status', 'tires_ordered', 'amount_paid', 'tax_exempt', 'approved_job_id']) assert.ok(!(key in f.calls[0].args.p_changes));
});
test('purchase lookup failure fails closed and inactive facility cannot replace current selection', async () => {
  const f = fixture({ queryError: 'supplier_orders' }); assert.equal((await f.get()).status, 500); assert.equal((await f.patch({})).status, 500); assert.equal(f.calls.length, 0);
  const g = fixture(); assert.equal((await g.save({ facility_id: 999 })).status, 400); assert.equal(g.calls.length, 0);
  assert.equal((await g.save({ facility_id: null, facility_name: 'Custom site' })).status, 200);
});
test('edit page renders all dedicated fields, mobile-safe grid and separate save/accept instructions', () => {
  const stateValues = [{ order: base, version: 'test', purchaseLocked: false, facilities: [] }, base, false, false, '', false];
  const Page = loader({ react: { ...React, useEffect() {}, useCallback: fn => fn, useState: () => [stateValues.shift(), () => {}] }, 'next/navigation': { useParams: () => ({ id: '1' }), useRouter: () => ({}) }, '@/components/AppHeader': () => null, '@/lib/supabase': {} })('app/orders/[id]/edit/page.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Page));
  for (const text of ['Submitted by', 'Contact person', 'Service address', 'Facility name', 'License plate', 'Tire position', 'Job / PO number', 'MO number', 'Product / part number', 'Requested time (Eastern)', 'Save order changes', 'Cancel — keep saved order', 'Approve &amp; Create Job']) assert.ok(html.includes(text), text);
  assert.match(html, /minmax\(min\(100%,240px\),1fr\)/);
  assert.doesNotMatch(html, /api\/public\/kingdom/);
});
