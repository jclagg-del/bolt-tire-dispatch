const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const mod = new Module(__filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/quote-customer.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, __filename);
const { customerSearchPattern, mergeQuoteCustomers, changeQuoteCustomerName } = mod.exports;

test('local lookup treats wildcard characters as part of the customer name', () => {
  assert.equal(customerSearchPattern(' A_100% '), '%A\\_100\\%%');
  assert.equal(customerSearchPattern('Smith'), '%Smith%');
});
test('saved jobs, quotes and QuickBooks merge without losing the latest contact details', () => {
  assert.deepEqual(mergeQuoteCustomers([
    { customer: ' Bolt ', phone: '555-new', contact_name: 'Jordan' },
    { customer: 'BOLT', phone: '555-old', email: 'office@example.com' },
    { customer: 'Bolt', address: '1 Main Street' },
    { customer: 'Other', phone: '555-other' },
    { customer: '' },
  ]), [
    { customer: 'Bolt', contact_name: 'Jordan', phone: '555-new', email: 'office@example.com', address: '1 Main Street' },
    { customer: 'Other', contact_name: '', phone: '555-other', email: '', address: '' },
  ]);
});
test('changing customers clears autofilled data but retains manual corrections and quote details', () => {
  const selected = { customer: 'Bolt', contact_name: 'Jordan', phone: '555', email: 'office@example.com', address: '1 Main Street' };
  const form = { ...selected, phone: 'manually corrected', vehicle: 'Truck', tire_size: '2756518', installation_cost: '299' };
  const changed = changeQuoteCustomerName(form, 'New customer', selected);
  assert.equal(changed.email, '');
  assert.equal(changed.address, '');
  assert.equal(changed.contact_name, '');
  assert.equal(changed.phone, 'manually corrected');
  assert.equal(changed.tire_size, '2756518');
  assert.equal(changed.installation_cost, '299');
  assert.equal(form.email, 'office@example.com');
  assert.equal(changeQuoteCustomerName(form, 'BOLT', selected).email, 'office@example.com');
});
test('manual and edited quotes are not changed by loading suggestions', () => {
  const form = { customer: 'Existing', contact_name: 'Contact', email: 'saved@example.com', phone: '123', address: 'Saved address' };
  assert.deepEqual(changeQuoteCustomerName(form, 'Existing', null), form);
});
