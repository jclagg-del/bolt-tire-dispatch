const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Compile the actual server modules in memory, with supplier/database boundaries
// replaced for route tests. No test is allowed to send a real supplier purchase.
function loader(stubs = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(__dirname, '..', filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module);
    cache.set(filename, mod);
    mod.filename = filename;
    mod.paths = module.paths;
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
const helpers = loader()('lib/customer-order-purchasing.ts');
test('request ids are stable across sessions and distinct between requests', () => {
  assert.equal(helpers.purchasingRequestId(18), helpers.purchasingRequestId(18));
  assert.notEqual(helpers.purchasingRequestId(18), helpers.purchasingRequestId(19));
});
test('part matching preserves leading zeros and does not merge different sizes or suffixes', () => {
  assert.equal(helpers.matchesProductNumber('04493730000', { atdProductNumber: '9000', manufacturerProductNumber: '04493730000' }), true);
  assert.equal(helpers.matchesProductNumber('04493730000', { atdProductNumber: '4493730000' }), false);
  assert.equal(helpers.matchesProductNumber('123', { atdProductNumber: '1234' }), false);
});
test('delivery uses the latest shipment and leaves incomplete dates unknown', () => {
  assert.equal(helpers.deliveryDate('2026-09-23'), '2026-09-23');
  assert.equal(helpers.deliveryDate('2026-09-23T01:00:00Z'), '2026-09-22');
  assert.equal(helpers.deliveryDate('0001-01-01T00:00:00'), null);
  const result = { supplier: 'U.S. AutoForce', order: { confirmationnumber: 'A123', orderlines: [{ fulfillments: [{ estimateddelivery: '2026-09-23' }, { estimateddelivery: '2026-09-24' }] }] } };
  assert.equal(helpers.supplierOrderDetails(result).deliveryDate, '2026-09-24');
  assert.equal(helpers.supplierOrderDetails(result).supplier, 'U.S. AutoForce');
  result.order.orderlines[0].fulfillments.push({});
  assert.equal(helpers.supplierOrderDetails(result).deliveryDate, null);
});
test('SOAP parser respects empty fields and namespaced result elements', () => {
  const xml = loader()('lib/usaf.ts');
  assert.equal(xml.first('<errorCode/><parts><errorCode>failure</errorCode></parts>', 'errorCode'), null);
  assert.equal(xml.first('<u:partNumber>00123</u:partNumber>', 'partNumber'), '00123');
  assert.deepEqual(xml.blocks('<x:PartDto><x:lineCode>GY</x:lineCode></x:PartDto>', 'PartDto'), ['<x:lineCode>GY</x:lineCode>']);
  assert.equal(xml.escapeXml('MO<&"'), 'MO&lt;&amp;&quot;');
});

const stock = '<StockCheckResult><errorCode/><parts><PartDto><lineCode>GY</lineCode><partNumber>110822702</partNumber><description>Goodyear Assurance</description><cost>100</cost><fet>2</fet><quantityAvailable><BranchDto><code>4853</code><quantityAvailable>12</quantityAvailable><deliveryDate>2026-09-23T15:00:00Z</deliveryDate></BranchDto><BranchDto><code>07</code><quantityAvailable>999</quantityAvailable></BranchDto></quantityAvailable><errorCode>success</errorCode></PartDto></parts></StockCheckResult>';
const deadline = '<OrderDeadlineResult><errorCode>success</errorCode><branches><BranchDto><code>4853</code><deliveryCost>0</deliveryCost><deliveryDate>2026-09-23T15:00:00Z</deliveryDate></BranchDto></branches></OrderDeadlineResult>';
test('USAF looks up exact part and Croton, previews and submits PO/MO with fill-or-kill', async () => {
  const requests = [];
  const actualUsaf = loader()('lib/usaf.ts');
  const usaf = loader({ './usaf': { ...actualUsaf, usaForceOrderingStatus: () => ({ production: true }), call: async (method, body) => {
    requests.push({ method, body });
    return { xml: method === 'StockCheck' ? stock : method === 'OrderDeadline' ? deadline : method === 'Order' ? '<OrderResult><orderNumber>CONF1</orderNumber><status>ordered</status><comment>Accepted</comment></OrderResult>' : '<OrderStatusDetailResult><orderNumber>CONF1</orderNumber><totalCost>205</totalCost><deliveryDate>2026-09-24T15:00:00Z</deliveryDate></OrderStatusDetailResult>' };
  } } })('lib/usaf-ordering.ts');
  const input = { part: '110822702', lineCode: 'GY', branch: '4853', quantity: 2, po: '3094589', mo: 'M<&123', transaction: 'stable-id' };
  const products = await usaf.searchUsafOrderProduct(input.part, 2);
  assert.equal(products[0].warehouses.length, 1);
  assert.equal(products[0].warehouses[0].name, 'Croton-on-Hudson, NY');
  const preview = await usaf.previewUsafOrder(input);
  assert.equal(preview.order.ordertotal, 204);
  const placed = await usaf.placeUsafOrder(input, preview);
  assert.equal(placed.order.confirmationnumber, 'CONF1');
  assert.equal(placed.order.ordertotal, 205);
  assert.equal(helpers.supplierOrderDetails(placed).deliveryDate, '2026-09-24');
  const purchase = requests.filter(r => r.method === 'Order');
  assert.equal(purchase.length, 1);
  assert.match(purchase[0].body, /<poNumber>3094589<\/poNumber>/);
  assert.match(purchase[0].body, /<fillFlag>cancelorder<\/fillFlag>/);
  assert.match(purchase[0].body, /<lineCode>GY<\/lineCode>/);
  assert.match(purchase[0].body, /M&lt;&amp;123/);
  await assert.rejects(usaf.previewUsafOrder({ ...input, quantity: 20 }), /cannot fill/);
  await assert.rejects(usaf.previewUsafOrder({ ...input, po: '1234567890123456' }), /15 characters/);
});

function routeFixture({ supplierError = false, production = true, authenticated = true } = {}) {
  let saved = null, placements = 0;
  const order = { id: 42, customer: 'Kingdom Support Services', job_number: '3094589', mo_number: 'MO123', qty: 2, tire_product_number: '110822702', tire_size: '2256017', order_status: 'new', approved_job_id: null, tires_ordered: false };
  const admin = { from(table) {
    let operation = 'select', values;
    const query = {
      select() { return query; }, eq() { return query; },
      update(value) { operation = 'update'; values = value; return query; },
      insert(value) { operation = 'insert'; values = value; return query; },
      single() { return query; }, maybeSingle() { return query; },
      then(resolve, reject) {
        try {
          if (operation === 'insert') {
            if (saved) return Promise.resolve({ error: { code: '23505' } }).then(resolve, reject);
            saved = { ...values };
          }
          if (operation === 'update') Object.assign(table === 'customer_orders' ? order : saved, values);
          return Promise.resolve({ data: table === 'customer_orders' ? order : saved, error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    }; return query;
  } };
  const preview = { order: { ordertotal: 200, orderlines: [{ fulfillments: [{ quantity: 2, estimateddelivery: '2026-09-23' }] }] } };
  const api = loader({
    '@/lib/supabase/admin': { requireApiUser: async () => authenticated ? { id: 'staff' } : null, createAdminClient: () => admin },
    '@/lib/atd': { atdEnvironment: production ? 'production' : 'sandbox', searchAtdByPartNumber: async () => [{ atdProductNumber: '110822702' }], previewAtdOrder: async () => preview, placeAtdOrder: async input => { placements++; assert.equal(input.customerPoNumber, order.job_number); assert.equal(input.quantity, 2); if (supplierError) throw new Error('timeout'); return { order: { ...preview.order, confirmationnumber: 'ATD123' } }; } },
  })('app/api/orders/purchase/route.ts');
  const request = extra => api.POST(new Request('http://localhost/api/orders/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'place', orderId: 42, supplier: 'ATD', productNumber: '110822702', expectedTotal: 200, expectedPo: order.job_number, expectedQuantity: 2, expectedDeliveryDate: '2026-09-23', ...extra }) }));
  return { request, order, get saved() { return saved; }, get placements() { return placements; } };
}
test('confirmed purchases persist and retries return confirmation without purchasing twice', async () => {
  const fixture = routeFixture();
  const first = await fixture.request({});
  assert.equal(first.status, 200);
  assert.equal((await first.json()).completed.confirmation, 'ATD123');
  assert.equal(fixture.saved.status, 'placed');
  assert.equal(fixture.order.tires_ordered, true);
  const again = await fixture.request({});
  assert.equal(again.status, 200);
  assert.equal(fixture.placements, 1);
});
test('uncertain supplier outcomes remain blocked across retries and supplier switches', async () => {
  const fixture = routeFixture({ supplierError: true });
  assert.equal((await fixture.request({})).status, 502);
  assert.equal(fixture.saved.status, 'needs_review');
  assert.equal(fixture.order.tires_ordered, false);
  assert.equal((await fixture.request({ supplier: 'USAF' })).status, 409);
  assert.equal(fixture.placements, 1);
});
test('changed totals, stale quantities, test credentials and unsigned requests never purchase', async () => {
  const fixture = routeFixture();
  assert.equal((await fixture.request({ expectedTotal: 100 })).status, 409);
  assert.equal((await fixture.request({ expectedQuantity: 4 })).status, 409);
  assert.equal((await fixture.request({ expectedDeliveryDate: '2026-09-25' })).status, 409);
  assert.equal(fixture.placements, 0);
  const sandbox = routeFixture({ production: false });
  assert.equal((await sandbox.request({})).status, 409);
  assert.equal(sandbox.placements, 0);
  const noAuth = routeFixture({ authenticated: false });
  assert.equal((await noAuth.request({})).status, 401);
  assert.equal(noAuth.placements, 0);
});
