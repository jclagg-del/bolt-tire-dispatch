const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../lib/payment-method-pricing.ts');
const mod = new Module(filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { paymentPricePair, verifiedPaymentPricing, verifiedPaymentAmount } = mod.exports;

test('preserves the approved $1,000 ACH/debit and $1,030 regular example', () => {
  assert.deepEqual(paymentPricePair(100000), {
    regularCents: 103000, discountedCents: 100000, differenceCents: 3000,
  });
  assert.equal(verifiedPaymentAmount(100000, { type: 'card', card: { funding: 'credit' } }).amountCents, 103000);
  for (const preview of [
    { type: 'us_bank_account' },
    { type: 'card', card: { funding: 'debit' } },
    { type: 'card', card: { funding: 'prepaid' } },
  ]) {
    const result = verifiedPaymentAmount(100000, preview);
    assert.equal(result.amountCents, 100000);
    assert.equal(result.discountCents, 3000);
    assert.equal(result.regularCents - result.discountCents, result.amountCents);
  }
});

test('cent rounding never reduces the existing base or applies a second 3% discount', () => {
  assert.deepEqual(paymentPricePair(76251), { regularCents: 78539, discountedCents: 76251, differenceCents: 2288 });
  assert.equal(paymentPricePair(50).differenceCents, 2);
  for (let cents = 0; cents < 100000; cents += 17) {
    const result = paymentPricePair(cents);
    assert.equal(result.regularCents - result.differenceCents, cents);
    assert.ok(Number.isInteger(result.regularCents));
    assert.ok(result.regularCents >= cents);
  }
});

test('unknown card funding cannot be charged as credit; unsupported methods are explicit', () => {
  for (const funding of ['unknown', '', null, undefined, 'DEBIT', 'customer_says_debit']) {
    assert.throws(() => verifiedPaymentPricing({ type: 'card', card: { funding } }), /could not verify/);
  }
  assert.throws(() => verifiedPaymentPricing({ type: 'card' }), /could not verify/);
  for (const type of [undefined, 'link', 'cashapp', 'klarna', 'debit', 'ach']) {
    assert.throws(() => verifiedPaymentPricing({ type }), /not supported/);
  }
});

test('rejects malformed amounts and Stripe amount overflow', () => {
  for (const amount of [-1, NaN, Infinity, 1.1, '1000', null, 100000000, 99999999]) {
    assert.throws(() => paymentPricePair(amount), /Payment price/);
  }
  assert.deepEqual(paymentPricePair(0), { regularCents: 0, discountedCents: 0, differenceCents: 0 });
});
