const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const { EventEmitter } = require('node:events');
function load(file, stubs = {}) {
  const name = path.resolve(__dirname, '..', file), mod = new Module(name, module); mod.paths = module.paths;
  mod.require = id => id === 'server-only' ? {} : Object.hasOwn(stubs, id) ? stubs[id] : id === './ntw-inventory-request' ? load('lib/ntw-inventory-request.ts') : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, name);
  return mod.exports;
}
const helper = load('lib/ntw-test.ts');
test('supplier error detail is bounded and strips credentials and URLs', () => {
  const value = helper.ntwTestFailureDetail({ message: 'Invalid account qa-secret https://example.test/?token=secret', headers: { secret: 'hidden' } }, ['qa-secret']);
  assert.match(value, /Invalid account/); assert.doesNotMatch(value, /qa-secret|https:|token=|hidden/);
  assert.equal(helper.ntwTestFailureDetail({ product: [], internal: 'do not show' }, []), '');
});
test('only metric size lookups are accepted, including LT', () => {
  assert.deepEqual(helper.testSize('LT245/75R16'), { width: '245', ratio: '75', diameter: '16' });
  assert.deepEqual(helper.testSize('2057515'), { width: '205', ratio: '75', diameter: '15' });
  for (const bad of [null, {}, '', '35x12.50R20', '205/75R15 ORDER', 'https://example.test']) assert.throws(() => helper.testSize(bad));
});
test('response is allowlisted; supplier internals and credentials never returned', () => {
  const value = helper.summarizeNtwTest({ secret: 'hidden', product: [{ partNo: '123', brandName: 'Example', modelName: 'AT', loadIndexRange: '120', speedRating: 'R', productCost: { amount: '99.50' }, estimatedAvailability: 4, secret: 'hidden', availableSource: [{ locationId: '1', quantityAvailable: 4, address: { city: 'Albany', state: 'NY', streetName: 'private' } }] }] });
  assert.equal(value.products[0].cost, 99.5); assert.equal(value.products[0].warehouses[0].location, 'Albany, NY');
  assert.equal(value.products[0].loadSpeed, '120 R'); assert.doesNotMatch(JSON.stringify(value), /hidden|private/);
});
test('empty inventory is distinct from invalid or error payload', () => {
  assert.equal(helper.summarizeNtwTest({ product: [] }).count, 0);
  for (const bad of [null, {}, { error: 'failure' }, { product: {} }]) assert.throws(() => helper.summarizeNtwTest(bad));
  assert.equal(helper.summarizeNtwTest({ product: [{}] }).products[0].cost, null);
});
function routeFixture({ user = true, role = 'admin', setup = false, lookupError = false, enabled = true } = {}) {
  process.env.NTW_TEST_ENABLED = enabled ? 'true' : 'false'; let calls = 0;
  const chain = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: role ? { role, password_change_required: setup } : null, error: lookupError }; } };
  const route = load('app/api/ntw-test/route.ts', { '@/lib/supabase/admin': { requireApiUser: async () => user ? { id: 'employee' } : null, createAdminClient: () => ({ from(name) { assert.equal(name, 'staff_security'); return chain; } }) }, '@/lib/ntw-test': { ...helper, runNtwTest: async () => { calls++; return { count: 0, products: [] }; } } });
  return { post: value => route.POST(new Request('https://app.bolttire.com/api/ntw-test', { method: 'POST', body: typeof value === 'string' ? value : JSON.stringify(value) })), calls: () => calls };
}
test('anonymous, non-staff, incomplete setup, failed lookup and disabled mode cannot call NTW', async () => {
  for (const [options, status] of [[{ user: false }, 401], [{ role: 'customer' }, 403], [{ role: null }, 403], [{ setup: true }, 403], [{ setup: null }, 403], [{ lookupError: true }, 503], [{ enabled: false }, 503]]) {
    const f = routeFixture(options); assert.equal((await f.post({ size: '205/75R15' })).status, status); assert.equal(f.calls(), 0);
  }
});
test('valid staff may test; invalid input cannot reach NTW; results are not cacheable', async () => {
  for (const role of ['admin', 'office', 'technician']) {
    const f = routeFixture({ role });
    assert.equal((await f.post('not json')).status, 400);
    assert.equal((await f.post({ size: 'bad' })).status, 400); assert.equal(f.calls(), 0);
    const response = await f.post({ size: '205/75R15' }); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await f.post({ size: '205/75R15' })).status, 429); assert.equal(f.calls(), 1);
  }
});
test('transport uses QA-only credentials and fixed inventory endpoint with TLS verification', async t => {
  const keys = ['NTW_TEST_CLIENT_ID', 'NTW_TEST_CLIENT_SECRET', 'NTW_TEST_CUSTOMER_ID', 'NTW_DEALER_CODE', 'NTW_TEST_DEALER_CODE', 'NTW_TEST_SHIP_TO_ADDRESS_JSON', 'NTW_CA_CERT', 'NTW_TEST_CA_CERT'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  t.after(() => { for (const k of keys) saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k]; });
  Object.assign(process.env, { NTW_TEST_CLIENT_ID: 'qa-id', NTW_TEST_CLIENT_SECRET: 'qa-secret', NTW_TEST_CUSTOMER_ID: '0037317114' });
  delete process.env.NTW_DEALER_CODE; delete process.env.NTW_CA_CERT; delete process.env.NTW_TEST_CA_CERT;
  delete process.env.NTW_TEST_DEALER_CODE; delete process.env.NTW_TEST_SHIP_TO_ADDRESS_JSON;
  process.env.NTW_DEALER_CODE = 'unverified-normal-code';
  let captured;
  const api = load('lib/ntw-test.ts', { 'node:https': { request(url, options, callback) {
    const request = new EventEmitter(); request.setTimeout = () => {}; request.end = body => {
      captured = { url, options, body: JSON.parse(body) }; const response = new EventEmitter(); response.statusCode = 200;
      callback(response); response.emit('data', Buffer.from('{"product":[]}')); response.emit('end');
    }; return request;
  } } });
  assert.equal((await api.runNtwTest('205/75R15')).count, 0);
  assert.equal(captured.url.hostname, 'tbcservicesqa.tbccorp.com'); assert.equal(captured.url.pathname, '/tbccorp/qa/tbc/api/v2/products/tires');
  assert.equal(captured.body.customerId, '37317114'); assert.equal(captured.body.searchType, 'ByTireSize');
  assert.equal(process.env.NTW_TEST_CUSTOMER_ID, '0037317114');
  assert.equal(captured.body.shipTo[0].address.city, 'Pine Bush');
  assert.equal(captured.body.shipTo[0].address.zipCode, '12566');
  assert.equal(captured.body.isDropShip, false); assert.equal(captured.url.search, '');
  assert.equal(captured.options.headers['X-IBM-Client-Secret'], 'qa-secret'); assert.notEqual(captured.options.rejectUnauthorized, false);
  delete process.env.NTW_TEST_CLIENT_SECRET;
  await assert.rejects(() => api.runNtwTest('205/75R15'), /not configured/);
});
const contract = load('lib/ntw-inventory-request.ts');
test('SAP Ship-to zeros survive and legacy eight-digit IDs are padded', () => {
  assert.equal(contract.ntwCustomerId('0037317114'), '0037317114');
  assert.equal(contract.ntwCustomerId('37317114'), '0037317114');
  for (const value of ['', undefined, '12x34', '12345678901']) assert.throws(() => contract.ntwCustomerId(value));
});
test('size and product searches use separate documented criteria', () => {
  const address = contract.ntwShopAddress();
  const size = contract.ntwInventoryBody('0037317114', address, { tireSize: { width: '205', ratio: '75', diameter: '15' } });
  assert.equal(size.searchType, 'ByTireSize'); assert.equal('brandName' in size.criteria[0], false); assert.equal('partNo' in size.criteria[0], false);
  const part = contract.ntwInventoryBody('0037317114', address, { partNo: '2001834', brandName: 'Hankook' });
  assert.equal(part.searchType, 'ByProductId'); assert.deepEqual(part.criteria, [{ partNo: '2001834', brandName: 'Hankook', requestedQty: 4 }]);
  assert.throws(() => contract.ntwInventoryBody('0037317114', address, { partNo: '2001834', brandName: '' }));
  assert.throws(() => contract.ntwShopAddress('{"name":"Incomplete"}'));
});
test('documented errorMsg is displayed safely instead of a generic 400', () => {
  assert.equal(helper.ntwTestFailureDetail({ errorCd: 1006, errorDesc: 'NOT_FOUND', errorMsg: 'Could not get any inventory from backend, check your request' }, []), 'Could not get any inventory from backend, check your request');
  assert.equal(helper.ntwTestFailureDetail({ errorMsg: 'Invalid qa-secret account 0037317114' }, ['qa-secret', '0037317114']), 'Invalid [redacted] account [redacted]');
});
test('temporary page and route do not invoke orders, payments, or database writes', () => {
  for (const file of ['app/ntw-test/page.tsx', 'app/api/ntw-test/route.ts', 'lib/ntw-test.ts']) {
    const code = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(code, /\.insert\(|\.update\(|\.upsert\(|\.rpc\(|placeAtdOrder|OrderService|NTW_CLIENT_SECRET/);
  }
});
