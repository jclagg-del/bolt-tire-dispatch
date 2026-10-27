const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module'), ts = require('typescript');
const React = require('react');

test('Wi-Fi opens native printing synchronously with current label data, and clears after printing', () => {
  const state = []; let cursor = 0; const events = [], listeners = new Map(); let cleanup;
  const previous = global.window;
  global.window = {
    print() { events.push('print'); assert.equal(state[0].contactName, 'Sample Person'); },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
  };
  try {
    const m = new Module(__filename, module); m.paths = module.paths;
    function Labels() {}
    m.require = name => name === 'react' ? { ...React,
      useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; events.push('labels'); }]; },
      useEffect(fn) { if (!cleanup) cleanup = fn(); },
    } : name === 'react-dom' ? { flushSync(fn) { events.push('flush'); fn(); events.push('fitted'); } }
      : name === './TireLabelPrint' ? { default: Labels } : require(name);
    m._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/WifiLabelButton.tsx'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText, __filename);
    const job = { id: 'sample', quantity: 2, facilityName: 'Facility', contactName: 'Sample Person', address: 'Service address', phone: '555-0100' };
    const render = (disabled = false) => { cursor = 0; return m.exports.default({ job, disabled }); };
    const initial = render();
    assert.equal(initial.props.children[1].props.job, null);
    initial.props.children[0].props.onClick();
    assert.deepEqual(events, ['flush', 'labels', 'fitted', 'print']);
    assert.deepEqual(render().props.children[1].props.job, job);
    assert.equal(render(true).props.children[0].props.disabled, true);
    listeners.get('afterprint')();
    assert.equal(render().props.children[1].props.job, null);
    cleanup(); assert.equal(listeners.size, 0);
  } finally { if (previous === undefined) delete global.window; else global.window = previous; }
});
