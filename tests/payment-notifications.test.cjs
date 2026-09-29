const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function load(file) {
  const filename = path.resolve(__dirname, '..', `${file}.ts`);
  const m = new Module(filename, module); m.paths = module.paths;
  m.require = id => id === 'server-only' ? {} : id.startsWith('@/') ? load(id.slice(2)) : require(id);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return m.exports;
}
const { sendPaymentNotification } = load('lib/payment-notifications');
const quote = { id: 'quote-1', quote_number: 123, customer: '<script>A&B</script>', contact_name: 'Jane', phone: '2015550123', email: 'example@example.com', vehicle: '2020 Ford', address: '123 Example St', quantity: 2, tire_size: '275/65R18', rear_quantity: 2, rear_tire_size: '285/65R18', amount_paid: 510, requested_date: '2026-10-01', requested_time: '09:30', purchase_source: 'website' };
const option = { id: 'option', brand: 'Goodyear', model: 'Front', price_per_tire: 100, supplier_product_id: '1234', rear_model: 'Rear', rear_supplier_product_id: '5678', rear_price_per_tire: 110 };

async function mocked(run, tweaks = {}) {
  const envNames = ['STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'NEW_ORDER_NOTIFICATION_EMAIL', 'KINGDOM_NOTIFICATION_FROM'];
  const prior = Object.fromEntries(envNames.map(k => [k, process.env[k]]));
  const oldFetch = global.fetch;
  process.env.STRIPE_SECRET_KEY = 'test-only'; process.env.RESEND_API_KEY = 'test-only';
  delete process.env.NEW_ORDER_NOTIFICATION_EMAIL; delete process.env.KINGDOM_NOTIFICATION_FROM;
  const session = { payment_status: 'paid', metadata: { quote_id: quote.id }, currency: 'usd', amount_total: 51000, ...tweaks.session };
  const calls = [], emails = new Map(); let receiptFailures = tweaks.receiptFailures || 0;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://api.resend.com/emails') {
      if (tweaks.emailFailure) return Response.json({ error: 'rejected' }, { status: 503 });
      const key = options.headers['Idempotency-Key'];
      if (emails.has(key)) assert.equal(options.body, emails.get(key), 'Retry must send the identical message');
      emails.set(key, options.body);
      return Response.json({ id: 'email-accepted' });
    }
    assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions/cs_test_example');
    if (options.method === 'POST') {
      assert.deepEqual([...options.body.keys()], ['metadata[bolt_office_payment_email]']);
      if (receiptFailures-- > 0) return Response.json({}, { status: 503 });
      session.metadata.bolt_office_payment_email = options.body.get('metadata[bolt_office_payment_email]');
    }
    return Response.json(session);
  };
  try { await run({ calls, emails, session }); }
  finally { global.fetch = oldFetch; for (const name of envNames) if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; }
}

test('payment alert includes amount, customer, both axles, appointment and safe record links', async () => {
  await mocked(async ({ calls, emails, session }) => {
    await sendPaymentNotification('cs_test_example', quote, option);
    const email = JSON.parse([...emails.values()][0]);
    assert.deepEqual(email.to, ['office@bolttire.com']);
    assert.match(email.subject, /ONLINE PURCHASE PAID.*#123.*\$510\.00/);
    assert.match(email.html, /&lt;script&gt;A&amp;B&lt;\/script&gt;/); assert.doesNotMatch(email.html, /<script>/);
    for (const text of ['275/65R18', '285/65R18', '1234', '5678', '2026-10-01', '09:30', 'does not purchase tires', 'quotes/quote-1']) assert.ok(email.text.includes(text), text);
    assert.equal(session.metadata.bolt_office_payment_email, 'email-accepted');
    // Even when the mail provider's short-term key cache is gone, the durable
    // Stripe receipt prevents another send (including a later async event).
    emails.clear(); calls.length = 0;
    await sendPaymentNotification('cs_test_example', quote, option);
    assert.equal(calls.length, 1); assert.equal(emails.size, 0);
  });
});
test('paid quotes and organization purchases have distinct subjects and appropriate links', async () => {
  for (const organization of [null, 'HPR']) {
    await mocked(async ({ emails }) => {
      await sendPaymentNotification('cs_test_example', { ...quote, purchase_source: organization ? 'website' : 'staff', discount_organization: organization }, option);
      const email = JSON.parse([...emails.values()][0]);
      assert.match(email.subject, organization ? /^ONLINE PURCHASE PAID/ : /^QUOTE PAID/);
      assert.equal(email.text.includes('Open Orders:'), Boolean(organization));
    });
  }
});
test('unpaid or mismatched canonical sessions never send an alert or write a receipt', async () => {
  for (const session of [{ payment_status: 'unpaid', metadata: { quote_id: quote.id } }, { payment_status: 'paid', metadata: { quote_id: 'another-quote' } }]) {
    await mocked(async ({ calls, emails }) => {
      await assert.rejects(sendPaymentNotification('cs_test_example', quote, option), /does not match/);
      assert.equal(calls.length, 1); assert.equal(emails.size, 0);
    }, { session });
  }
});
test('email failure leaves no sent receipt and propagates so Stripe can retry', async () => {
  await mocked(async ({ calls, session }) => {
    await assert.rejects(sendPaymentNotification('cs_test_example', quote, option), /not accepted/);
    assert.equal(session.metadata.bolt_office_payment_email, undefined);
    assert.equal(calls.length, 2);
  }, { emailFailure: true });
});
test('receipt-write failure retries with the same email idempotency key and body', async () => {
  await mocked(async ({ calls, emails, session }) => {
    await assert.rejects(sendPaymentNotification('cs_test_example', quote, option), /Could not save/);
    await sendPaymentNotification('cs_test_example', quote, option);
    assert.equal(calls.filter(c => c.url.includes('resend.com')).length, 2);
    assert.equal(emails.size, 1); assert.ok(emails.has('paid-checkout-cs_test_example'));
    assert.equal(session.metadata.bolt_office_payment_email, 'email-accepted');
  }, { receiptFailures: 1 });
});
test('simultaneous notifications use the same provider key, without making purchases', async () => {
  await mocked(async ({ emails }) => {
    await Promise.all([sendPaymentNotification('cs_test_example', quote, option), sendPaymentNotification('cs_test_example', quote, option)]);
    assert.equal(emails.size, 1);
  });
});
