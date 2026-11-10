const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const file = path.join(__dirname, '../lib/fleet-order-notifications.ts');
const mod = new Module(file, module);
mod.require = id => id === 'server-only' ? {} : require(id);
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { fleetOrderChanges, sendFleetOrderNotification } = mod.exports;

test('diff includes only adjusted fields, preserving references and showing removed values', () => {
  assert.deepEqual(fleetOrderChanges({ qty: 4, mo_number: '0012', notes: 'Remove', requested_time: '11:00:00' }, { qty: 2, mo_number: '0013', notes: null, requested_time: '14:00' }), [
    { field: 'Requested time', before: '11:00 AM', after: '2:00 PM' },
    { field: 'MO number', before: '0012', after: '0013' },
    { field: 'Tire quantity', before: '4', after: '2' },
    { field: 'Notes', before: 'Remove', after: 'Not provided' },
  ]);
});

test('null/empty, trimmed text, line endings, numeric serialization and time seconds do not create false changes', () => {
  assert.deepEqual(fleetOrderChanges({ qty: '4', facility_id: '1', notes: ' One\r\nTwo ', requested_time: '09:30:00', license_plate: null, goodyear_order: null }, { qty: 4, facility_id: 1, notes: 'One\nTwo', requested_time: '09:30', license_plate: '', goodyear_order: false }), []);
  assert.deepEqual(fleetOrderChanges({ requested_time: '11:00' }, { requested_time: '11:00:00' }), []);
});

test('all portal-editable fields are covered but internal status/payment/identifiers are not exposed', () => {
  const after = { customer: 'HPR', service_method: 'delivery', goodyear_order: true, submitted_by: 'A', contact_name: 'B', contact_number: '555', facility_name: 'C', facility_id: 2, address: 'D', requested_date: '2026-11-11', requested_time: '14:00', job_number: '001', mo_number: '002', vehicle_year: '2025', vehicle_make: 'Ford', vehicle_model: 'F150', vehicle_color: 'Gray', license_plate: 'ABC', qty: 2, tire_size: '205/75R15', tire_model: 'Strong Guard', tire_product_number: '009', tire_position: 'Rear', notes: 'Call', payment_status: 'paid', id: 123, approved_job_id: 44 };
  const changes = fleetOrderChanges({}, after);
  assert.equal(changes.length, 24);
  assert.ok(changes.some(c => c.field === 'Order type' && c.after === 'Delivery'));
  assert.ok(changes.some(c => c.field === 'Goodyear order' && c.before === 'No' && c.after === 'Yes'));
});

test('email shows escaped before/after above full details and preserves delivery configuration', async t => {
  const env = { ...process.env };
  t.after(() => { process.env = env; });
  process.env.RESEND_API_KEY = 'test-key';
  process.env.NEW_ORDER_NOTIFICATION_EMAIL = 'test@example.invalid';
  process.env.KINGDOM_NOTIFICATION_FROM = 'Test <test@example.invalid>';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ id: 'mock' }) }; });
  const before = { customer: 'HPR', job_number: '001', mo_number: '002', notes: '<script>old</script>', qty: 4 };
  const after = { ...before, notes: '<img src=x onerror="bad">', qty: 2 };
  await sendFleetOrderNotification('changed', after, 'test-idempotency', before);
  const { body, options } = calls[0];
  assert.equal(options.headers['Idempotency-Key'], 'test-idempotency');
  assert.deepEqual(body.to, ['test@example.invalid']);
  assert.equal(body.reply_to, 'office@bolttire.com');
  assert.match(body.subject, /ORDER CHANGED \| HPR \| Job 001 \| MO 002/);
  assert.match(body.html, /What changed/); assert.match(body.html, /Previous/); assert.match(body.html, /New/);
  assert.ok(body.html.indexOf('What changed') < body.html.indexOf('Updated order details'));
  assert.match(body.html, /&lt;script&gt;old&lt;\/script&gt;/);
  assert.match(body.html, /&lt;img src=x onerror=&quot;bad&quot;&gt;/);
  assert.doesNotMatch(body.html, /<script>|<img/);
  assert.match(body.html, /Open Orders/);
  for (const kind of ['new', 'cancellation']) {
    await sendFleetOrderNotification(kind, after);
    assert.doesNotMatch(calls.at(-1).body.html, /What changed|Updated order details/);
  }
  await sendFleetOrderNotification('changed', before, undefined, before);
  assert.match(calls.at(-1).body.html, /No order details changed/);
  await sendFleetOrderNotification('changed', after);
  assert.match(calls.at(-1).body.html, /Previous values are unavailable/);
});
