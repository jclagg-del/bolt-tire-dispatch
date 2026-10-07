const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const source = fs.readFileSync(require.resolve('../app/route/page.tsx'), 'utf8');
const mod = new Module(__filename, module);
mod.paths = module.paths;
mod.require = id => {
  if (id === 'next/navigation') return { useRouter: () => ({ push() {} }) };
  if (id === '@/lib/supabase') return { supabase: {} };
  if (id === '@/components/AppHeader') return { default: () => null };
  if (id === '@/components/JobJhaButton') return { __esModule: true, default: () => React.createElement('button', null, 'Complete JHA') };
  if (id === '@/lib/job-jha-client') return {};
  if (id === '@/lib/quo') return { getQuoCallUrl: () => null, getQuoTextUrl: () => null };
  if (id === '@/lib/job-completion') {
    const completion = new Module(__filename, module);
    completion._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/job-completion.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText, __filename);
    return completion.exports;
  }
  if (id === '@/lib/route-order') return {};
  if (id === '@/components/RouteStopList') return { default: () => null };
  return require(id);
};
mod._compile(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText + '\nexports.TestRouteCard = RouteCard;', __filename);
function render(part, service_type) {
  return renderToStaticMarkup(React.createElement(mod.exports.TestRouteCard, {
    job: { id: 1, customer: 'Route test', po_number: '3094589', mo_number: 'MO123', tires: 'Goodyear Assurance', size: '225/60R17', qty: 2, tire_product_number: part, service_type },
    stopNumber: 1, onComplete() {}, isCompleting: false,
  }));
}
test('route query loads the stored tire part number and card preserves leading zeros', () => {
  assert.match(source, /\.select\(`[\s\S]*?tire_product_number,[\s\S]*?`\)/);
  const html = render('  00110822702  ');
  for (const value of ['Part number', '00110822702', '3094589', 'MO123', 'Goodyear Assurance', '225/60R17']) assert.ok(html.includes(value));
});
test('missing part number is explicit without hiding other route details', () => {
  for (const value of [null, undefined, '', '   ']) {
    const html = render(value);
    assert.ok(html.includes('Not provided'));
    assert.ok(html.includes('Goodyear Assurance'));
  }
});
test('multiple part numbers remain visible as stored without HTML interpretation', () => {
  const html = render('00123 / 00456 <rear>');
  assert.ok(html.includes('00123 / 00456 &lt;rear&gt;'));
  assert.ok(html.includes('word-break:break-word'));
});
test('delivery route cards omit JHA while service and unknown jobs retain it', () => {
  for (const service of ['Delivery', 'delivery', 'delivered', 'delivery_pickup']) assert.doesNotMatch(render('00123', service), /Complete JHA/);
  for (const service of ['Installation', 'repair', 'Delivery and Installation', null]) assert.match(render('00123', service), /Complete JHA/);
});
