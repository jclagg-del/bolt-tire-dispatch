const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file) {
  const mod = new Module(__filename, module);
  mod.paths = module.paths;
  mod._compile(ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, __filename);
  return mod.exports;
}
const { isDeliveryService, jobCompletionError, completionMileageUpdate } = load('../lib/job-completion.ts');
const CompletionModal = load('../components/CompletionModal.tsx').default;
const props = { show: true, completing: false, mileageMissing: true, mileageConfirmed: false, torqueConfirmed: false, onMileageChange() {}, onTorqueChange() {}, onCancel() {}, onConfirm() {} };
test('delivery service variants complete without odometer or wheel torque and preserve saved mileage', () => {
  for (const value of ['Delivery', ' delivered ', 'DELIVERY', 'delivery_pickup', 'Delivery / Pickup', 'Delivery and pickup']) {
    assert.equal(isDeliveryService(value), true);
    assert.equal(jobCompletionError(value, '', false, false), null);
    assert.deepEqual(completionMileageUpdate(value, ''), {});
    assert.deepEqual(completionMileageUpdate(value, '99999'), {});
  }
});
test('installations and unrecognized services retain every completion check', () => {
  for (const value of ['Installation', 'New Tires - Installed', 'Delivery and installation', '', null, undefined]) {
    assert.equal(isDeliveryService(value), false);
    assert.match(jobCompletionError(value, '', true, true), /enter vehicle mileage/);
    assert.match(jobCompletionError(value, '100', false, true), /confirm mileage and wheel torque/);
    assert.match(jobCompletionError(value, '100', true, false), /confirm mileage and wheel torque/);
    assert.equal(jobCompletionError(value, '100', true, true), null);
  }
  assert.deepEqual(completionMileageUpdate('Installation', ' 01234 '), { vehicle_mileage: '01234' });
});
test('delivery modal hides installation fields and permits explicit completion only when not saving', () => {
  const html = renderToStaticMarkup(React.createElement(CompletionModal, { ...props, deliveryOnly: true }));
  assert.ok(html.includes('Complete this delivery'));
  assert.ok(!html.includes('type="checkbox"'));
  assert.ok(!html.includes('disabled=""'));
  assert.ok(html.includes('Confirm Complete'));
  const busy = renderToStaticMarkup(React.createElement(CompletionModal, { ...props, deliveryOnly: true, completing: true }));
  assert.ok(busy.includes('disabled=""'));
});
test('installation modal still requires both confirmations and mileage', () => {
  const html = renderToStaticMarkup(React.createElement(CompletionModal, props));
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2);
  assert.ok(html.includes('All wheels have been torqued properly'));
  assert.ok(html.includes('disabled=""'));
  const ready = renderToStaticMarkup(React.createElement(CompletionModal, { ...props, mileageMissing: false, mileageConfirmed: true, torqueConfirmed: true }));
  assert.ok(!ready.includes('disabled=""'));
});
test('route and job completion both use the shared delivery rules and mileage preservation', () => {
  for (const file of ['../app/route/page.tsx', '../app/jobs/[id]/page.tsx']) {
    const source = fs.readFileSync(require.resolve(file), 'utf8');
    assert.match(source, /const completionError = jobCompletionError\(/);
    assert.match(source, /\.\.\.completionMileageUpdate\(/);
    assert.match(source, /complete: true/);
    assert.match(source, /\/api\/notifications\/job-completed/);
  }
});
