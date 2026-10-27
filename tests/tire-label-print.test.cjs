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
function render(quantity = 2, overrides = {}) {
  const previous = global.document;
  const body = {};
  global.document = { body };
  try {
    const html = renderToStaticMarkup(React.createElement(Print, { job: { ...job, quantity, ...overrides } }));
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
test('labels show only the destination facility, never the billing customer fallback', () => {
  const html = render(2, { customer: 'Kingdom Support Services', facilityName: ' Wallkill ' });
  assert.match(html, /<small>FACILITY<\/small><strong>Wallkill<\/strong>/);
  assert.doesNotMatch(html, /CUSTOMER|Kingdom Support Services/);
  for (const facilityName of [null, '', '   ']) {
    const missing = render(1, { customer: 'Kingdom Support Services', facilityName });
    assert.match(missing, /Facility not set/);
    assert.match(missing, /CONTACT/);
  }
  const edit = fs.readFileSync(require.resolve('../app/jobs/[id]/page.tsx'), 'utf8');
  assert.match(edit, /setFacilityName\(data\.facility_name \|\| null\)/);
  assert.match(edit, /customer: form\.customer,\s+facilityName,/);
  assert.match(edit, /<BluetoothLabelButton[^\n]*job=\{labelJob\}/);
});
test('label separates facility from the individual, address and contact details', () => {
  const html = render(1, {customer:'HPR', facilityName:'HPR VM Tuxedo', contactName:'Sample Person', address:'1422 Long Meadow Rd, Tuxedo Park, NY 10987', phone:'555-0100',email:'sample@example.com'});
  for (const value of ['HPR VM Tuxedo','Sample Person','1422 Long Meadow Rd','555-0100','sample@example.com']) assert.ok(html.includes(value));
  assert.doesNotMatch(html, /Facility not set|Contact not set|Address not set|Phone not set/);
});
test('no active label job and server rendering do not change normal document printing', () => {
  assert.equal(renderToStaticMarkup(React.createElement(Print, { job: null })), '');
  assert.equal(renderToStaticMarkup(React.createElement(Print, { job })), '');
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
    assert.match(source, /<WifiLabelButton/);
    assert.doesNotMatch(source, /<BluetoothLabelButton connection="wifi"/);
    assert.doesNotMatch(source, /window\.print\(\)/);
  }
});
test('label geometry reserves one safe page and fits all content without clipping', () => {
  const css = fs.readFileSync(require.resolve('../app/globals.css'), 'utf8');
  const label = css.match(/\.tire-receiving-label\{([^}]+)\}/)[1];
  assert.match(css, /width:3\.7in/);
  assert.match(label, /height:5\.4in;min-height:0/);
  assert.match(label, /overflow:hidden/, 'contain unscaled layout after measuring all text to fit');
  assert.match(css, /-webkit-text-size-adjust:100%;text-size-adjust:100%/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
});

test('auto-fit uses full size for ordinary labels and only shrinks when needed to keep the footer', () => {
  const { fitTireLabels } = mod.exports;
  for (const [width, height] of [[355, 480], [355, 1000], [700, 500]]) {
    const content = { scrollWidth: width, scrollHeight: height, offsetWidth: 355, style: {} };
    const label = { clientWidth: 355, clientHeight: 518, querySelector: () => content };
    fitTireLabels({ querySelectorAll: () => [label] });
    const scale = Number(content.style.transform.match(/scale\((.+)\)/)[1]);
    assert.ok(scale <= 1);
    if (width === 355 && height === 480) assert.ok(scale > 0.99, 'ordinary labels must not get an unnecessary 80% reduction');
    assert.ok(height * scale <= 516);
    assert.ok(width * scale <= 353.001);
    assert.ok(parseFloat(content.style.left) + width * scale <= 355.001);
    const previous = content.style.transform;
    fitTireLabels({ querySelectorAll: () => [label] });
    assert.equal(content.style.transform, previous, 'beforeprint must not compound the scale');
  }
  const source = fs.readFileSync(require.resolve('../components/TireLabelPrint.tsx'), 'utf8');
  assert.match(source, /useLayoutEffect/);
  assert.match(source, /addEventListener\("beforeprint", fit\)/);
  assert.match(render(), /class="tire-label-content"/);
});
