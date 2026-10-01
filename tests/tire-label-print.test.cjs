const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const mod = new Module(__filename, module); mod.paths = module.paths;
let portalTarget;
mod.require = name => name === 'react-dom' ? {
  createPortal(content, target) { portalTarget = target; return content; },
} : require(name);
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/TireLabelPrint.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, __filename);
const Print = mod.exports.default;
const job = { id: 'test-label-job', jobNumber: '3097885', moNumber: '919205', quantity: 2,
  serviceType: 'Delivery', tires: 'Goodyear Assurance ComfortDrive', size: '235/40R18', productNumber: '413134582' };
function render(quantity = 2) {
  const previous = global.document;
  const body = {};
  global.document = { body };
  try {
    const html = renderToStaticMarkup(React.createElement(Print, { job: { ...job, quantity } }));
    assert.equal(portalTarget, body);
    return html;
  } finally {
    if (previous === undefined) delete global.document; else global.document = previous;
  }
}

test('two tires render exactly two label pages directly under body, with all identifying fields', () => {
  const html = render();
  assert.equal((html.match(/<section class="tire-receiving-label"/g) || []).length, 2);
  assert.match(html, /1 OF 2/); assert.match(html, /2 OF 2/);
  for (const text of ['3097885', '919205', 'DELIVERY', 'Goodyear Assurance ComfortDrive', '235/40R18', '413134582']) assert.ok(html.includes(text));
  assert.match(html, /<style media="print">@page \{ size: 4in 6in; margin: 0\.15in; \}<\/style>/);
});
test('one, four and maximum label counts do not add spacer labels', () => {
  for (const [quantity, count] of [[1, 1], [4, 4], [24, 24], [99, 24], [0, 1]]) {
    assert.equal((render(quantity).match(/<section /g) || []).length, count);
  }
});
test('no active label job and server rendering do not change normal document printing', () => {
  assert.equal(Print({ job: null }), null);
  assert.equal(Print({ job }), null);
  const css = fs.readFileSync(require.resolve('../app/globals.css'), 'utf8');
  assert.doesNotMatch(css, /@page\s*\{/);
  assert.doesNotMatch(css, /body \*\s*\{visibility:hidden/);
});
test('print CSS removes surrounding layout and only breaks before subsequent labels', () => {
  const css = fs.readFileSync(require.resolve('../app/globals.css'), 'utf8');
  assert.match(css, /body:has\(>\.tire-label-print-root\)>:not\(\.tire-label-print-root\)\{display:none!important\}/);
  assert.match(css, /\.tire-label-print-root\{display:block!important;position:static!important/);
  assert.doesNotMatch(css, /height:5\.98in/);
  assert.match(css, /\.tire-receiving-label\+\.tire-receiving-label\{break-before:page;page-break-before:always\}/);
  assert.doesNotMatch(css, /break-after:page|page-break-after:always/);
  for (const file of ['../app/tire-receiving/page.tsx', '../app/jobs/[id]/page.tsx']) {
    const source = fs.readFileSync(require.resolve(file), 'utf8');
    assert.match(source, /<TireLabelPrint job=\{labelJob\}/);
    assert.match(source, /flushSync\(\(\) => setLabelJob/);
  }
});
test('label geometry fits inside printable margins without a full-page fixed height or clipping', () => {
  const css = fs.readFileSync(require.resolve('../app/globals.css'), 'utf8');
  const label = css.match(/\.tire-receiving-label\{([^}]+)\}/)[1];
  assert.match(css, /width:3\.7in;max-width:100%/);
  assert.match(label, /height:auto;min-height:0/);
  assert.match(label, /overflow:visible/);
  assert.doesNotMatch(label, /height:[\d.]+in|overflow:hidden/);
  assert.match(css, /-webkit-text-size-adjust:100%;text-size-adjust:100%/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
});
