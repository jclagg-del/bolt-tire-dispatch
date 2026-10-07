const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return mod.exports;
  };
}
const { quoteOptionsForEditor, emptyQuoteOptions } = loader()('lib/quotes.ts');
test('every subset of saved options gets three unique slots without changing saved identities', () => {
  for (let mask = 0; mask < 8; mask++) {
    const saved = emptyQuoteOptions.filter((_, i) => mask & (1 << i)).map(o => ({ ...o, id: o.tier, brand: 'Example', model: o.tier }));
    const before = structuredClone(saved), result = quoteOptionsForEditor(saved);
    assert.equal(result.length, 3);
    assert.equal(new Set(result.map(o => o.tier)).size, 3);
    assert.deepEqual(result.slice(0, saved.length), saved);
    assert.deepEqual(saved, before);
  }
});
test('older duplicate-slot drafts are repaired without losing filled choices', () => {
  const draft = [
    { ...emptyQuoteOptions[0], brand: 'First', model: 'A' },
    { ...emptyQuoteOptions[2], id: 'saved-best', brand: 'Second', model: 'B' },
    { ...emptyQuoteOptions[2], brand: 'Third', model: 'C' },
  ];
  const result = quoteOptionsForEditor(draft);
  assert.deepEqual(result.map(o => o.tier), ['good', 'best', 'better']);
  assert.deepEqual(result.map(o => o.brand), ['First', 'Second', 'Third']);
  assert.equal(result[1].id, 'saved-best');
  assert.deepEqual(quoteOptionsForEditor(result), result);
});

async function editor({ edit = true, failOptions = false } = {}) {
  const React = require('react'), hooks = [], effects = [], alerts = [], navigations = [], quotes = new Map(), rows = new Map();
  let cursor = 0, insertCount = 0, failures = Number(failOptions);
  const saved = [emptyQuoteOptions[0], emptyQuoteOptions[2]].map(o => ({ ...o, id: o.tier, quote_id: 'q', brand: 'Example', model: o.tier }));
  if (edit) { quotes.set('q', { id: 'q', customer: 'Example', selected_option_id: 'best', payment_status: 'unpaid' }); saved.forEach(o => rows.set(o.tier, o)); }
  const mock = { from(table) {
    let action = 'read', values, filters = [], conflict;
    const query = {
      select() { return query; }, eq(k,v) { filters.push(r => r[k] === v); return query; },
      not(k,op,v) { assert.equal(op,'in'); const excluded = v.slice(1,-1).split(','); filters.push(r => !excluded.includes(r[k])); return query; },
      insert(v) { action = 'insert'; values = v; return query; }, update(v) { action = 'update'; values = v; return query; },
      upsert(v,opts) { action = 'upsert'; values = v; conflict = opts.onConflict; return query; }, delete() { action = 'delete'; return query; },
      single() { return run(); }, maybeSingle() { return run(); }, then(ok,bad) { return run().then(ok,bad); },
    };
    async function run() {
      if (table === 'business_settings') return { data: null };
      if (table === 'quotes') {
        if (action === 'insert') { insertCount++; const row = { ...values, id: 'new-q', selected_option_id: null }; quotes.set(row.id,row); return { data: row }; }
        const row = [...quotes.values()].find(r => filters.every(f => f(r)));
        if (action === 'update') Object.assign(row,values);
        return { data: { ...row, quote_options: [...rows.values()] } };
      }
      assert.equal(table,'quote_options');
      if (action === 'upsert') {
        assert.equal(conflict,'quote_id,tier');
        if (failures-- > 0) return { error: { message: 'Temporary failure' } };
        assert.equal(new Set(values.map(v => v.tier)).size,values.length);
        for (const value of values) rows.set(value.tier,{ ...value, id: rows.get(value.tier)?.id || 'new-' + value.tier });
        return { data: values.map(v => rows.get(v.tier)), error: null };
      }
      if (action === 'delete') for (const [key,row] of rows) if (filters.every(f => f(row))) rows.delete(key);
      return { error: null };
    }
    return query;
  } };
  const hookReact = { ...React,
    useState(initial) { const i=cursor++; if (!(i in hooks)) hooks[i]=initial; return [hooks[i], v => { hooks[i]=typeof v==='function'?v(hooks[i]):v; }]; },
    useRef(initial) { const i=cursor++; return hooks[i] ||= { current: initial }; },
    useEffect(effect) { const i=cursor++; if (!(i in hooks)) { hooks[i]=true; effects.push(effect); } },
    useMemo(fn) { return fn(); },
  };
  const blank = () => null;
  const Page = loader({ react: hookReact, 'next/navigation': { useRouter: () => ({ push: p => navigations.push(p) }), useSearchParams: () => ({ get: key => key === 'edit' && edit ? 'q' : null }) }, '@/lib/supabase': { supabase: mock }, '@/components/AppHeader': { default: blank }, '@/components/QuoteCustomerInput': { default: blank }, '@/components/AdditionalItemsEditor': { default: blank } })('app/quotes/new/page.tsx').default;
  function render() { cursor=0; return Page(); }
  function saveButton(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'button' && ['Save Changes','Save Quote'].includes(node.props.children)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = saveButton(child); if(found) return found; }
  }
  const prev = { alert: global.alert, sessionStorage: global.sessionStorage };
  global.alert = msg => alerts.push(msg); global.sessionStorage = { getItem: () => null, removeItem() {} };
  try {
    render(); effects.forEach(e => e()); await new Promise(setImmediate);
    const form = hooks.find(v => v?.customer !== undefined); form.customer = 'Example';
    const options = hooks.find(Array.isArray);
    for (const o of options) { o.brand = 'Example'; o.model = o.tier; }
    const save = saveButton(render()).props.onClick;
    await Promise.all([save(), save()]); // A rapid double click must be ignored.
    if (failOptions) await saveButton(render()).props.onClick();
    return { rows, quotes, insertCount, alerts, navigations };
  } finally { global.alert=prev.alert; global.sessionStorage=prev.sessionStorage; }
}
test('editing good + best adds the missing choice and preserves the selected saved option', async () => {
  const result = await editor();
  assert.equal(result.rows.size,3); assert.equal(result.rows.get('best').id,'best');
  assert.equal(result.quotes.get('q').selected_option_id,'best');
  assert.deepEqual(result.alerts,[]); assert.equal(result.insertCount,0);
  assert.deepEqual(result.navigations,['/quotes/q']);
});
test('retrying a failed new quote save reuses the quote and suppresses double clicks', async () => {
  const result = await editor({ edit:false, failOptions:true });
  assert.equal(result.insertCount,1); assert.equal(result.rows.size,3);
  assert.equal(result.alerts.length,1); assert.deepEqual(result.navigations,['/quotes/new-q']);
});
