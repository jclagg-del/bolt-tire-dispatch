const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function loader(stubs = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(__dirname, '..', filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module); cache.set(filename, mod);
    mod.filename = filename; mod.paths = module.paths;
    mod.require = id => {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`);
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), `${id}.ts`));
      return require(id);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
    return mod.exports;
  }
  return load;
}
const helpers = loader()('lib/usaf-purchase-preview.ts');
const input = { part: '110571702', quantity: 1, po: 'TEST-0925A', mo: '', lineCode: 'GY', branch: '4853', mode: 'test' };
const key = 'unit-test-only-not-a-real-secret';
test('signed previews bind user, inputs, total and expiry; test and live POs cannot be confused', () => {
  const signed = { ...input, userId: 'staff', total: 151.23, deliveryDate: null, expiresAt: Date.now() + 60000 };
  const token = helpers.signUsafPreview(signed, key);
  assert.deepEqual(helpers.readUsafPreview(token, key, 'staff'), signed);
  assert.throws(() => helpers.readUsafPreview(token, key, 'someone-else'));
  const [payload, mac] = token.split('.');
  const altered = Buffer.from(JSON.stringify({ ...signed, quantity: 4 })).toString('base64url');
  assert.throws(() => helpers.readUsafPreview(`${altered}.${mac}`, key, 'staff'));
  assert.throws(() => helpers.readUsafPreview(helpers.signUsafPreview({ ...signed, expiresAt: 0 }, key), key, 'staff'));
  assert.throws(() => helpers.validateUsafPurchase({ ...input, po: '3094589' }));
  assert.throws(() => helpers.validateUsafPurchase({ ...input, mode: 'production' }));
  assert.throws(() => helpers.validateUsafPurchase({ ...input, quantity: 1.5 }));
  assert.equal(helpers.usafPurchaseId('test', 'test-0925a'), helpers.usafPurchaseId('test', input.po));
  assert.notEqual(helpers.usafPurchaseId('test', input.po), helpers.usafPurchaseId('production', input.po));
});

test('test order SOAP is staging-only, visibly labeled and never allowed on live or unknown connections', async () => {
  const actual = loader()('lib/usaf.ts');
  let connection = { test: true, production: false }; const calls = [];
  const lib = loader({ './usaf': { ...actual, usaForceOrderingStatus: () => connection, call: async (method, body) => {
    calls.push({ method, body });
    return { xml: method === 'Order' ? '<OrderResult><orderNumber>TESTCONF</orderNumber><status>ordered</status></OrderResult>' : '<OrderStatusDetailResult><orderNumber>TESTCONF</orderNumber><totalCost>151.23</totalCost></OrderStatusDetailResult>' };
  } } })('lib/usaf-ordering.ts');
  const preview = { product: { atdProductNumber: input.part, model: 'Assurance MaxLife 2' }, lineCode: 'GY', branch: '4853', order: { ordertotal: 151.23, orderlines: [{ fulfillments: [{ quantity: 1, estimateddelivery: null }] }] } };
  const purchase = { ...input, transaction: 'stable', testMode: true };
  await lib.placeUsafOrder(purchase, preview);
  assert.match(calls[0].body, /TEST ONLY - DO NOT FULFILL/);
  assert.match(calls[0].body, /<poNumber>TEST-0925A<\/poNumber>/);
  assert.match(calls[0].body, /<fillFlag>cancelorder<\/fillFlag>/);
  for (const state of [{ test: false, production: true }, { test: false, production: false }]) {
    connection = state; await assert.rejects(lib.placeUsafOrder(purchase, preview));
  }
  connection = { test: true, production: false };
  await assert.rejects(lib.placeUsafOrder({ ...purchase, po: '123' }, preview));
  await assert.rejects(lib.placeUsafOrder({ ...purchase, quantity: 2 }, preview));
  await assert.rejects(lib.placeUsafOrder({ ...purchase, testMode: false }, preview));
  assert.equal(calls.filter(c => c.method === 'Order').length, 1);
});

function fixture({ authenticated = true, staff = true, fail = false, saveFail = false } = {}) {
  let saved, placements = 0, total = 151.23, mode = 'test';
  const admin = { from(table) {
    assert.ok(['staff_security', 'supplier_orders'].includes(table), 'No jobs or customer orders may be touched');
    let op = 'read', values;
    const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return q; },
      insert(value) { op = 'insert'; values = value; return q; }, update(value) { op = 'update'; values = value; return q; },
      then(resolve, reject) {
        if (table === 'staff_security') return Promise.resolve({ data: staff ? { role: 'admin' } : null }).then(resolve, reject);
        if (op === 'insert') { if (saved) return Promise.resolve({ error: { code: '23505' } }).then(resolve, reject); saved = values; }
        if (op === 'update') { if (saveFail && values.status === 'placed') return Promise.resolve({ error: { message: 'write unavailable' } }).then(resolve, reject); Object.assign(saved, values); }
        return Promise.resolve({ data: saved || null, error: null }).then(resolve, reject);
      } }; return q;
  } };
  const preview = () => ({ supplier: 'U.S. AutoForce', product: { model: 'Assurance MaxLife 2', atdProductNumber: input.part }, order: { ordertotal: total, orderlines: [{ description: 'Assurance MaxLife 2', fulfillments: [{ quantity: 1, estimateddelivery: '2026-09-28' }] }] } });
  const route = loader({
    '@/lib/supabase/admin': { requireApiUser: async () => authenticated ? { id: 'staff' } : null, createAdminClient: () => admin },
    '@/lib/usaf': { usaForceOrderingStatus: () => ({ configured: true, production: mode === 'production', test: mode === 'test' }) },
    '@/lib/usaf-ordering': { previewUsafOrder: async () => preview(), searchUsafOrderProduct: async () => [], placeUsafOrder: async args => { placements++; assert.equal(args.testMode, mode === 'test'); if (fail) throw new Error('timeout'); return { ...preview(), order: { ...preview().order, confirmationnumber: 'USAF-TEST1' } }; } },
  })('app/api/supplier-orders/usaf/route.ts');
  async function request(body) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    const response = await route.POST(new Request('http://localhost/api/supplier-orders/usaf', { method: 'POST', body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  }
  return { request, get saved() { return saved; }, get placements() { return placements; }, set total(value) { total = value; }, set mode(value) { mode = value; }, async token() { return (await request({ ...input, action: 'preview' })).body.token; } };
}
test('confirmed test saved as TEST with receipt; repeated submissions cannot purchase twice', async () => {
  const f = fixture(); const token = await f.token();
  const body = { action: 'place', token, confirmation: 'SEND TEST ORDER' };
  const a = await f.request(body); const b = await f.request(body);
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(f.placements, 1);
  assert.equal(f.saved.response.testOnly, true); assert.equal(f.saved.status, 'placed');
  assert.match(f.saved.customer_comment, /DO NOT FULFILL/);
  assert.equal(b.body.receipt.part, input.part); assert.equal(b.body.completed.confirmation, 'USAF-TEST1');
});
test('concurrent submissions claim a single PO before any supplier order', async () => {
  const f = fixture(); const token = await f.token();
  await Promise.all([1, 2].map(() => f.request({ action: 'place', token, confirmation: 'SEND TEST ORDER' })));
  assert.equal(f.placements, 1);
});
test('timeouts and failed confirmation saves stay locked; never auto retry', async () => {
  for (const options of [{ fail: true }, { saveFail: true }]) {
    const f = fixture(options); const token = await f.token();
    const body = { action: 'place', token, confirmation: 'SEND TEST ORDER' };
    const first = await f.request(body); const again = await f.request(body);
    assert.equal(first.status, options.fail ? 502 : 200); assert.equal(again.status, 409); assert.equal(f.placements, 1);
    if (options.saveFail) assert.match(first.body.warning, /USAF-TEST1/);
  }
});
test('auth, staff membership, environment, price and explicit confirmation are mandatory', async () => {
  assert.equal((await fixture({ authenticated: false }).request({ action: 'configuration' })).status, 401);
  assert.equal((await fixture({ staff: false }).request({ action: 'configuration' })).status, 403);
  const f = fixture(); const token = await f.token();
  assert.equal((await f.request({ action: 'place', token })).status, 400);
  f.mode = 'production'; assert.equal((await f.request({ action: 'place', token, confirmation: 'SEND TEST ORDER' })).status, 409);
  f.mode = 'test'; f.total = 200;
  assert.equal((await f.request({ action: 'place', token, confirmation: 'SEND TEST ORDER' })).status, 409);
  assert.equal(f.placements, 0);
});
