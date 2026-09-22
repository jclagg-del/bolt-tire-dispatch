const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const mod = new Module(__filename, module);
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/SelectedQuoteTires.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, __filename);
const SelectedQuoteTires = mod.exports.default;
const tires = [
  { id:'atd-1', brand:'GENERAL', model:'Grabber H/T', size:'235/60R18', loadSpeed:'103 H', loadRange:'SL', supplier:'ATD', atdProductNumber:'04493600000', quotePrice:215 },
  { id:'usaf-1', brand:'COOPER', model:'Discoverer', size:'235/60R18', loadSpeed:'103 H', loadRange:'SL', supplier:'USAF', atdProductNumber:'002', quotePrice:225 },
];
test('selected list shows all selected tires independently of search results', () => {
  const html = renderToStaticMarkup(React.createElement(SelectedQuoteTires,{tires,onRemove:()=>{}}));
  for (const text of ['GENERAL Grabber H/T','COOPER Discoverer','235/60R18','103 H','Load SL','U.S. AutoForce','04493600000','$215.00 each']) assert.ok(html.includes(text));
  assert.equal((html.match(/type="checkbox"/g)||[]).length,2);
  assert.equal((html.match(/checked=""/g)||[]).length,2);
});
test('unchecking targets the exact supplier product and rerender updates the list', () => {
  let selected = [...tires];
  const tree = SelectedQuoteTires({tires:selected,onRemove:id=>{selected=selected.filter(tire=>tire.id!==id);}});
  const rows = tree.props.children[2].props.children;
  rows[0].props.children.props.children[0].props.onChange();
  assert.deepEqual(selected.map(tire=>tire.id),['usaf-1']);
  const html = renderToStaticMarkup(React.createElement(SelectedQuoteTires,{tires:selected,onRemove:()=>{}}));
  assert.ok(!html.includes('GENERAL Grabber H/T'));
  assert.ok(html.includes('COOPER Discoverer'));
});
test('no selection leaves no empty list',()=>{
  assert.equal(renderToStaticMarkup(React.createElement(SelectedQuoteTires,{tires:[],onRemove:()=>{}})),'');
});
