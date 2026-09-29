const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const mod = new Module(__filename, module); mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/TireResultControls.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, __filename);
const Controls = mod.exports.default;

test('staff and customer controls have visible labels and preserve their sort choices', () => {
  for (const internal of [true, false]) {
    const html = renderToStaticMarkup(React.createElement(Controls, { internal, quantity: 2, sort: internal ? 'margin' : 'price', onQuantityChange() {}, onSortChange() {} }));
    assert.match(html, /<label>Quantity<select/); assert.match(html, /<label>Sort by<select/);
    assert.match(html, /value="2" selected=""/);
    assert.match(html, /Lowest installed price/); assert.match(html, /Best availability/);
    assert.equal(html.includes('Best gross profit'), internal);
  }
});
test('larger controls still update quantity and sort without changing their meaning', () => {
  let quantity = 2, sort = 'price';
  const tree = Controls({ internal: true, quantity, sort, onQuantityChange: value => quantity = value, onSortChange: value => sort = value });
  tree.props.children[0].props.children[1].props.onChange({ target: { value: '4' } });
  tree.props.children[1].props.children[1].props.onChange({ target: { value: 'availability' } });
  assert.equal(quantity, 4); assert.equal(sort, 'availability');
});
test('shared shopping controls have readable touch sizing and mobile wrapping', () => {
  const css = fs.readFileSync(require.resolve('../app/globals.css'), 'utf8');
  assert.match(css, /\.tire-beta-result-controls select \{[^}]*min-height: 44px;[^}]*16px/);
  assert.match(css, /\.tire-beta-result-controls \{[^}]*flex-wrap: wrap/);
  assert.match(css, /@media \(max-width: 560px\) \{ \.tire-beta-result-controls label:first-child, \.tire-beta-result-controls label:last-child \{ width: 100%;/);
  const source = fs.readFileSync(require.resolve('../components/TireShoppingBeta.tsx'), 'utf8');
  assert.match(source, /<TireResultControls internal=\{internal\} quantity=\{quantity\} sort=\{sort\}/);
  for (const file of ['../app/tire-shop/page.tsx', '../app/shop/page.tsx']) assert.match(fs.readFileSync(require.resolve(file), 'utf8'), /<TireShoppingBeta/);
});
