const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const filename = path.resolve(__dirname, '../lib/purchase-tracking.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { purchaseTrackingPayload: payload, trackingPage, trackingLocation, rememberTrackingCheckout, hasTrackingCheckout } = loaded.exports;
const q = { quote_number: 123, payment_status: 'paid', amount_paid: 1080, stripe_sales_tax_amount: 80, quantity: 2, rear_quantity: 2, customer: 'Private Customer', email: 'private@example.com', address: 'Private address', public_token: 'SECRET', notes: 'Private notes' };
test('only confirmed valid payments become purchases; pending ACH, refunds and missing totals do not', () => {
  for (const payment_status of ['pending', 'unpaid', 'failed', 'refunded']) assert.equal(payload({ ...q, payment_status }), null);
  for (const amount_paid of [null, NaN, Infinity, -1, 0]) assert.equal(payload({ ...q, amount_paid }), null);
  assert.equal(payload({ ...q, stripe_sales_tax_amount: 2000 }), null);
});
test('records actual revenue excluding separately reported tax, with stable ID and no customer data', () => {
  const event = payload(q);
  assert.equal(event.value, 1000); assert.equal(event.tax, 80);
  assert.equal(event.transaction_id, 'BT-123'); assert.equal(event.currency, 'USD');
  assert.equal(event.tire_quantity, 4); assert.equal(event.full_set, true);
  assert.equal(event.items[0].price, 1000);
  for (const secret of ['Private Customer', 'private@example.com', 'Private address', 'SECRET', 'Private notes']) assert.ok(!JSON.stringify(event).includes(secret));
  assert.equal(payload({ ...q, quantity: 2, rear_quantity: null }).full_set, false);
});
test('only shopping and sanitized checkout pages are tracked; private URLs are excluded', () => {
  assert.equal(trackingPage('/q/PRIVATE-TOKEN'), '/q/checkout');
  assert.equal(trackingPage('/shop'), '/shop');
  assert.equal(trackingPage('/shop/configure'), '/shop/configure');
  for (const route of ['/jobs', '/login', '/quotes/123', '/customers', '/order/kingdom', '/q/token/other']) assert.equal(trackingPage(route), null);
});
test('historical paid links have no eligible checkout; recent checkout survives reload and delayed ACH', () => {
  const prior = global.window;
  const values = new Map();
  global.window = { localStorage: { setItem: (k,v) => values.set(k,v), getItem: k => values.get(k) ?? null } };
  try {
    assert.equal(hasTrackingCheckout(123), false);
    rememberTrackingCheckout(123);
    assert.equal(hasTrackingCheckout(123), true);
    assert.equal(hasTrackingCheckout(123, Date.now() + 7 * 86400000), true);
    assert.equal(hasTrackingCheckout(123, Date.now() + 31 * 86400000), false);
    global.window.localStorage.getItem = () => { throw new Error('storage blocked'); };
    assert.equal(hasTrackingCheckout(123), false);
  } finally { global.window = prior; }
});
test('ad-click attribution survives while private quote URLs and contact query parameters are removed', () => {
  assert.equal(trackingLocation('/shop', '?gclid=ad-click_123&email=private@example.com&phone=5551234567'), 'https://app.bolttire.com/shop?gclid=ad-click_123');
  assert.equal(trackingLocation('/q/PRIVATE-TOKEN', '?payment=success&session_id=PRIVATE-SESSION'), 'https://app.bolttire.com/q/checkout');
  assert.equal(trackingLocation('/shop', '?gclid=private@example.com'), 'https://app.bolttire.com/shop');
  assert.equal(trackingLocation('/jobs', '?gclid=ad-click'), null);
});
