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
  if (id === '@/lib/quo') return { getQuoCallUrl: () => null, getQuoTextUrl: () => null };
  if (id === '@/lib/job-completion') return {};
  return require(id);
};
mod._compile(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText + '\nexports.TestRouteCard = RouteCard;', __filename);
function render(part) {
  return renderToStaticMarkup(React.createElement(mod.exports.TestRouteCard, {
    job: { id: 1, customer: 'Route test', po_number: '3094589', mo_number: 'MO123', tires: 'Goodyear Assurance', size: '225/60R17', qty: 2, tire_product_number: part },
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
