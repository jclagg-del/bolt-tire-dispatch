const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module'), ts = require('typescript');
const React = require('react');

function harness({ printThrows = false, pdfFails = false, delayed = false } = {}) {
  const state = [], refs = [], events = [], listeners = new Map(), effects = [];
  let cursor = 0, refCursor = 0, effectCursor = 0, resolve;
  const pending = new Promise(r => { resolve = r; });
  const previous = { window: global.window, document: global.document };
  global.document = { body: {} };
  global.window = {
    print() { events.push('print'); assert.equal(state[0].contactName, 'Sample Person'); if (printThrows) throw Error('Unavailable'); },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const m = new Module(__filename, module); m.paths = module.paths;
  function Labels() {}
  m.require = name => name === 'react' ? { ...React,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
    useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; },
    useEffect(fn, deps) {
      const i = effectCursor++, old = effects[i];
      if (!old || deps.some((v,j) => v !== old.deps[j])) { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }
    },
  } : name === 'react-dom' ? {
    flushSync(fn) { fn(); events.push('flush'); }, createPortal(content) { return content; },
  } : name === './TireLabelPrint' ? { default: Labels }
    : name === '@/lib/tire-label-pdf' ? { async tireLabelPdf(job, scale) {
      events.push('pdf'); assert.equal(scale,80); assert.equal(job.contactName,'Sample Person');
      if (delayed) await pending;
      if (pdfFails) throw Error('Sample PDF error');
      return new Uint8Array([1,2,3]);
    } } : require(name);
  m._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/WifiLabelButton.tsx'),'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, __filename);
  const job = { id:'sample', quantity:2, contactName:'Sample Person', address:'Sample address', phone:'555-0100' };
  const render = (disabled = false) => { cursor = refCursor = effectCursor = 0; return m.exports.default({ job, disabled }); };
  const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node,...elements(node.props?.children)];
  const nodes = () => elements(render());
  const click = text => nodes().find(e => e.type === 'button' && e.props.children === text).props.onClick();
  const tick = () => new Promise(r => setImmediate(r));
  const cleanup = () => {
    effects.forEach(e => e.cleanup?.());
    for (const key of ['window','document']) { if (previous[key] === undefined) delete global[key]; else global[key] = previous[key]; }
  };
  return { render, nodes, click, tick, cleanup, listeners, events, resolve };
}

test('native print remains synchronous, with a visible PDF fallback when iPhone does nothing', async () => {
  const h = harness();
  try {
    assert.equal(h.render().props.children[0].props.disabled,false);
    assert.equal(h.render(true).props.children[0].props.disabled,true);
    h.click('Print via Wi-Fi');
    assert.deepEqual(h.events,['flush','flush','print']);
    assert.ok(h.nodes().some(e => e.props?.role === 'dialog'));
    await h.tick();
    const link = h.nodes().find(e => e.type === 'a' && e.props.children === 'Open labels');
    assert.ok(link.props.href.startsWith('blob:'));
    assert.equal(link.props.target,'_blank');
    assert.equal(link.props.rel,'noopener noreferrer');
    h.listeners.get('afterprint')();
    assert.equal(h.render().props.children[1].props.job,null);
    assert.ok(h.nodes().some(e => e.props?.role === 'dialog'), 'afterprint is not success confirmation');
    h.click('Close');
    assert.ok(!h.nodes().some(e => e.props?.role === 'dialog'));
  } finally { h.cleanup(); }
});

test('a thrown native print call still allows PDF printing', async () => {
  const h = harness({ printThrows:true });
  try {
    assert.doesNotThrow(() => h.click('Print via Wi-Fi'));
    await h.tick();
    assert.ok(h.nodes().some(e => e.type === 'a' && e.props.children === 'Open labels'));
  } finally { h.cleanup(); }
});

test('PDF failures show an actionable error and retry without losing native printing', async () => {
  const h = harness({ pdfFails:true });
  try {
    h.click('Print via Wi-Fi'); await h.tick();
    assert.equal(h.nodes().find(e => e.props?.role === 'alert').props.children,'Sample PDF error');
    assert.ok(h.nodes().some(e => e.type === 'button' && e.props.children === 'Retry preparing labels'));
    assert.ok(!h.nodes().some(e => e.type === 'a'));
    h.click('Try print dialog again');
    assert.equal(h.events.filter(e => e === 'print').length,2);
  } finally { h.cleanup(); }
});

test('closing during PDF generation ignores the late result', async () => {
  const h = harness({ delayed:true });
  try {
    h.click('Print via Wi-Fi'); await h.tick();
    h.click('Close'); h.resolve(); await h.tick();
    assert.ok(!h.nodes().some(e => e.type === 'a' || e.props?.role === 'dialog'));
  } finally { h.cleanup(); }
});
