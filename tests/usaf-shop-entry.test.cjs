const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('USAF order dialog prefills the exact supplier part and shopping quantity', () => {
  const mod = new Module(__filename, module);
  mod.paths = module.paths;
  mod.require = id => id === '@/lib/supabase' ? { supabase: {} } : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/UsafPurchase.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, __filename);
  const html = renderToStaticMarkup(React.createElement(mod.exports.default, {
    initialPart: '00755012001', initialQuantity: 2, onClose() {}, onComplete() {},
  }));
  assert.ok(html.includes('value="00755012001"'));
  assert.ok(html.includes('type="number" min="1" max="24" value="2"'));
});

test('shop USAF choice opens its own flow; ordering remains staff-only and ATD is preserved', () => {
  const source = fs.readFileSync(require.resolve('../components/TireShoppingBeta.tsx'), 'utf8');
  assert.match(source, /internal && usafOrderProduct && <UsafPurchase/);
  assert.match(source, /initialPart=\{usafOrderProduct.atdProductNumber\}/);
  assert.match(source, /initialQuantity=\{orderQuantity\}/);
  assert.match(source, /supplier === "ATD" \|\| supplier === "USAF"/);
  assert.match(source, /if \(supplier === "USAF"\) \{ setUsafOrderProduct\(match\); setOrderProduct\(null\); setOrderChoosingSupplier\(false\); \}/);
  assert.match(source, /else beginOrder\(match\)/);
  assert.ok(!source.includes('Ordering connection next'));
});
