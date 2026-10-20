const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); cache.set(file, mod); mod.paths = module.paths;
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
    return mod.exports;
  };
}
const rules = loader()('lib/fleet-order-requirements.ts');
const valid = { customer: 'Kingdom Support Services', submitted_by: 'QA', contact_name: 'QA', contact_number: '2015550100', facility_id: 1, facility_name: 'QA Facility', address: 'QA Address', vehicle_year: '2024', vehicle_make: 'Ford', vehicle_model: 'Transit', requested_date: '2026-10-26', requested_time: '11:00', service_method: 'installed', job_number: '00123', mo_number: '00456', tire_position: 'All', qty: 4, tire_size: '225/60R17' };
function fixture({ allowed = true, existing = {} } = {}) {
  const writes = [], notifications = [];
  const order = { id: '1', ...valid, payment_status: 'unpaid', approved_job_id: 4, ...existing };
  const admin = { from(table) {
    let operation, value;
    const q = { select() { return q; }, eq() { return q; }, in() { return q; },
      insert(v) { operation = 'insert'; value = v; return q; }, update(v) { operation = 'update'; value = v; return q; },
      single: () => run(), then: (yes, no) => run().then(yes, no) };
    async function run() {
      if (operation) { writes.push({ table, operation, value }); return { data: { id: '1', ...value }, error: null }; }
      return { data: table === 'jobs' ? { id: 4, complete: false } : structuredClone(order), error: null };
    }
    return q;
  } };
  const load = loader({ '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/kingdom-auth': { hasKingdomAccess: async () => allowed }, '@/lib/fleet-order-notifications': { sendFleetOrderNotification: async (...args) => notifications.push(args) } });
  const create = load('app/api/public/kingdom/orders/route.ts');
  const edit = load('app/api/public/kingdom/orders/[id]/route.ts');
  return { writes, notifications, async call(method, body) {
    const req = new Request('https://example.test/api/public/kingdom/orders', { method, body: JSON.stringify(body) });
    return method === 'POST' ? create.POST(req) : edit.PATCH(req, { params: Promise.resolve({ id: '1' }) });
  } };
}

test('all noon-hour starts are blocked; 11:59 and 13:00 remain outside the block', () => {
  for (let minute = 0; minute < 60; minute++) {
    const time = `12:${String(minute).padStart(2, '0')}`;
    for (const requested_time of [time, `${time}:00`]) assert.match(rules.fleetOrderRequirementsError({ ...valid, requested_time }), /12:00 PM and 1:00 PM/);
  }
  for (const requested_time of ['11:59', '13:00', '13:00:00', '14:00']) assert.equal(rules.fleetOrderRequirementsError({ ...valid, requested_time }), '');
  assert.deepEqual(rules.FLEET_APPOINTMENT_TIMES.map(t => t.value), ['08:00','09:30','11:00','14:00']);
});

test('time validation rejects malformed values instead of truncating them', () => {
  for (const requested_time of ['', null, '24:00', '12:60', '12:30junk', '12:30:59', '12:30Z', '1:00 PM', {}, 1230]) {
    assert.match(rules.fleetOrderRequirementsError({ ...valid, requested_time }), /valid requested service time/);
  }
  assert.equal(rules.fleetRequestedTime(' 09:30:00 '), '09:30');
});

test('create and edit enforce both references and the lunch block for every org/service', async () => {
  for (const method of ['POST','PATCH']) for (const customer of ['Kingdom Support Services','HPR']) for (const service_method of ['installed','delivery','pickup','delivery_pickup']) {
    const f = fixture();
    for (const change of [{ job_number: '' }, { job_number: '  ' }, { job_number: null }, { mo_number: '' }, { mo_number: '  ' }, { mo_number: null }, { requested_time: '12:00' }, { requested_time: '12:30' }, { requested_time: '12:59:00' }, { requested_time: '12:30junk' }]) {
      const response = await f.call(method, { ...valid, customer, service_method, ...change });
      assert.equal(response.status, 400, `${method} ${customer} ${service_method} ${JSON.stringify(change)}`);
    }
    assert.equal(f.writes.length, 0, 'invalid requests cannot modify order, facility or linked job');
    assert.equal(f.notifications.length, 0);
  }
});

test('valid requests trim references, preserve leading zeros and accept the 1 PM boundary', async () => {
  for (const method of ['POST','PATCH']) for (const customer of ['Kingdom Support Services','HPR']) {
    const f = fixture();
    const response = await f.call(method, { ...valid, customer, job_number: ' 00123 ', mo_number: ' 00456 ', requested_time: '13:00:00' });
    assert.equal(response.status, method === 'POST' ? 201 : 200);
    const saved = f.writes.find(w => w.table === 'customer_orders').value;
    assert.equal(saved.job_number, '00123'); assert.equal(saved.mo_number, '00456'); assert.equal(saved.requested_time, '13:00');
    assert.equal(f.notifications.length, 1);
  }
});

test('cancellation of an older incomplete/noon order is not blocked', async () => {
  const f = fixture({ existing: { job_number: null, mo_number: null, requested_time: '12:30:00' } });
  const response = await f.call('PATCH', { action: 'request_cancellation' });
  assert.equal(response.status, 200);
  assert.equal(f.writes[0].value.order_status, 'cancellation_requested');
});

test('portal authorization still protects create and edit', async () => {
  const f = fixture({ allowed: false });
  for (const method of ['POST','PATCH']) assert.equal((await f.call(method, valid)).status, 401);
  assert.equal(f.writes.length, 0);
});

test('both forms use the shared rule and visibly require job and MO', () => {
  const create = fs.readFileSync(path.join(__dirname, '../app/order/kingdom/page.tsx'), 'utf8');
  const edit = fs.readFileSync(path.join(__dirname, '../app/kingdom-orders/[id]/page.tsx'), 'utf8');
  for (const source of [create, edit]) {
    assert.match(source, /fleetOrderRequirementsError/); assert.match(source, /FLEET_APPOINTMENT_TIMES/);
    assert.doesNotMatch(source, /value[=:]\s*"12:30"/);
    assert.match(source, /12:00 PM and 1:00 PM/);
  }
  for (const name of ['job_number','mo_number']) assert.match(create, new RegExp(`name="${name}"\\s+required`));
  for (const label of ['Job / PO Number','MO Number']) assert.ok(edit.includes(`label="${label}" required`));
});
