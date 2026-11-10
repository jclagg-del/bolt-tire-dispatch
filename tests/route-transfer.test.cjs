const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function load(file, stubs = {}) {
  const filename = path.resolve(__dirname, '..', file), mod = new Module(filename, module); mod.paths = module.paths;
  mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2) + '.ts', stubs) : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  return mod.exports;
}
const { routeDate } = load('lib/route-order.ts');
function fixture({ authenticated = true, role = 'office', active = true, failure = '', changeBeforeSave, sourceVehicle = 'stepvan' } = {}) {
  const today = routeDate(new Date()), writes = [];
  const job = { id: '71', vehicle_id: sourceVehicle, scheduled: today + 'T09:30:00', complete: false, archived: false, vehicle: 'Customer pickup', amount_paid: 0 };
  const admin = { from(table) {
    let values, filters = [];
    const query = {
      select() { return query; }, eq(key, value) { filters.push(row => String(row[key]) === String(value)); return query; },
      is(key, value) { filters.push(row => (row[key] ?? null) === value); return query; },
      or(expression) { const key = expression.split('.')[0]; assert.equal(expression, `${key}.is.null,${key}.eq.false`); filters.push(row => row[key] == null || row[key] === false); return query; },
      update(v) { assert.equal(table, 'jobs'); values = v; return query; }, maybeSingle() { return query; },
      then(resolve, reject) {
        let data;
        if (table === 'staff_security') data = { role, user_id: 'staff' };
        else if (table === 'vehicles') data = { id: 'service', active };
        else { assert.equal(table, 'jobs'); data = job; }
        if (failure === table || (failure === 'save' && values)) return Promise.resolve({ error: { message: 'test failure' } }).then(resolve, reject);
        if (values) changeBeforeSave?.(job);
        if (!filters.every(filter => filter(data))) data = null;
        if (values && data) { writes.push(values); Object.assign(job, values); }
        return Promise.resolve({ data: data ? { ...data } : null }).then(resolve, reject);
      },
    }; return query;
  } };
  const api = load('app/api/route-transfer/route.ts', { '@/lib/supabase/admin': { requireApiUser: async () => authenticated ? { id: 'staff' } : null, createAdminClient: () => admin } });
  const body = { date: today, jobId: '71', fromVehicleId: 'stepvan', toVehicleId: 'service', expectedScheduled: job.scheduled };
  return { job, body, writes, post: (patch = {}) => api.POST(new Request('http://localhost/api/route-transfer', { method: 'POST', body: JSON.stringify({ ...body, ...patch }) })) };
}
test('transfer saves only service vehicle and persists without changing appointment or other job data', async () => {
  for (const sourceVehicle of ['stepvan', null]) {
    const f = fixture({ sourceVehicle }), original = { ...f.job };
    const response = await f.post({ scheduled: '2000-01-01T00:00', complete: true, amount_paid: 999 });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).job.vehicle_id, 'service');
    assert.deepEqual(f.writes, [{ vehicle_id: 'service' }]);
    assert.deepEqual(f.job, { ...original, vehicle_id: 'service' });
    assert.equal((await f.post()).status, 409, 'retry cannot perform a second transfer from stale source');
  }
});
test('malformed payloads, wrong days, unavailable vehicles, completed and archived jobs do not move', async () => {
  for (const patch of [{ date: '2000-01-01' }, { jobId: 'abc' }, { jobId: null }, { fromVehicleId: '' }, { toVehicleId: 'stepvan' }, { toVehicleId: 'missing' }, { expectedScheduled: 'bad' }, { expectedScheduled: routeDate(new Date()) + 'T11:00:00' }]) {
    const f = fixture(); assert.ok([400, 409].includes((await f.post(patch)).status)); assert.equal(f.writes.length, 0);
  }
  for (const field of ['complete', 'archived']) { const f = fixture(); f.job[field] = true; assert.equal((await f.post()).status, 409); assert.equal(f.writes.length, 0); }
  const f = fixture({ active: false }); assert.equal((await f.post()).status, 400); assert.equal(f.writes.length, 0);
});
test('stale vehicle, schedule, completion or archive changes are detected in the conditional save', async () => {
  for (const patch of [{ vehicle_id: 'sprinter' }, { scheduled: routeDate(new Date()) + 'T10:00:00' }, { complete: true }, { archived: true }]) {
    const f = fixture({ changeBeforeSave: job => Object.assign(job, patch) });
    assert.equal((await f.post()).status, 409); assert.equal(f.writes.length, 0);
    for (const [field, value] of Object.entries(patch)) assert.equal(f.job[field], value);
  }
});
test('transfer retains existing staff authorization and database errors never claim success', async () => {
  for (const options of [{ authenticated: false }, { role: 'customer' }, { failure: 'staff_security' }]) {
    const f = fixture(options); assert.equal((await f.post()).status, 403); assert.equal(f.writes.length, 0);
  }
  for (const role of ['admin', 'office', 'technician']) assert.equal((await fixture({ role }).post()).status, 200);
  for (const failure of ['jobs', 'vehicles', 'save']) {
    const f = fixture({ failure }); assert.equal((await f.post()).status, 503); assert.equal(f.writes.length, 0);
  }
});
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function pointerFixture(disabled = false) {
  const refs = [], transfers = [], reorders = [], hover = [];
  const react = { ...React, useRef: value => { const ref = { current: value }; refs.push(ref); return ref; }, useState: value => [value, () => {}], useEffect() {} };
  const List = load('components/RouteStopList.tsx', { react }).default;
  const tree = List({ jobs: [{ id: '71' }], disabled, vehicleId: 'stepvan', transferVehicles: [{ id: 'stepvan', name: 'Stepvan' }, { id: 'service', name: 'Service Truck' }], onTransfer: (...args) => transfers.push(args), onTransferHover: id => hover.push(id), onReorder: (...args) => reorders.push(args), renderJob: () => null });
  const column = { dataset: { routeVehicle: 'service', routeDropEnabled: 'true' } };
  const board = { contains: candidate => candidate === column };
  refs[0].current = { closest: () => board, contains: () => false };
  const target = { closest: selector => selector === '[data-route-vehicle]' ? column : null };
  const handle = nodes(tree).find(n => n.props?.onPointerDown);
  const event = { isPrimary: true, button: 0, pointerId: 1, clientX: 10, clientY: 10, currentTarget: { setPointerCapture() {} } };
  return { tree, column, target, handle, event, transfers, reorders, hover };
}
test('single-stop routes can drag to empty or populated vehicle columns and use the accessible selector', () => {
  const previous = global.document;
  try {
    for (const dropEnabled of ['true', 'false']) {
      const f = pointerFixture(); f.column.dataset.routeDropEnabled = dropEnabled;
      global.document = { elementFromPoint: () => f.target };
      assert.equal(f.handle.props.disabled, false, 'one job must still be draggable to a different vehicle');
      f.handle.props.onPointerDown(f.event);
      f.handle.props.onPointerMove({ ...f.event, clientX: 30 });
      f.handle.props.onPointerUp({ ...f.event, clientX: 30 });
      assert.deepEqual(f.transfers, dropEnabled === 'true' ? [['71', 'service']] : []);
      assert.deepEqual(f.reorders, []);
      assert.equal(f.hover.at(-1), null);
    }
    const f = pointerFixture();
    const select = nodes(f.tree).find(n => n.type === 'select');
    select.props.onChange({ target: { value: 'service' } });
    assert.deepEqual(f.transfers, [['71', 'service']]);
    const html = renderToStaticMarkup(f.tree);
    assert.match(html, /Move job 71 to another vehicle/); assert.match(html, /Service Truck/);
  } finally { global.document = previous; }
});
test('cancelled gestures, drops outside the board and disabled controls never transfer', () => {
  const previous = global.document;
  try {
    for (const mode of ['cancel', 'outside', 'disabled']) {
      const f = pointerFixture(mode === 'disabled');
      global.document = { elementFromPoint: () => mode === 'outside' ? null : f.target };
      f.handle.props.onPointerDown(f.event);
      f.handle.props.onPointerMove({ ...f.event, clientX: 30 });
      if (mode === 'cancel') f.handle.props.onPointerCancel();
      f.handle.props.onPointerUp({ ...f.event, clientX: 30 });
      assert.deepEqual(f.transfers, []);
    }
  } finally { global.document = previous; }
});
