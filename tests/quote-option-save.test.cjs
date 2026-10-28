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

async function editor({ edit = true, failOptions = false, shopDraft, beforeSave } = {}) {
  const React = require('react'), hooks = [], effects = [], alerts = [], navigations = [], quotes = new Map(), rows = new Map();
  let cursor = 0, insertCount = 0, failures = Number(failOptions);
  const saved = [emptyQuoteOptions[0], emptyQuoteOptions[2]].map(o => ({ ...o, id: o.tier, quote_id: 'q', brand: 'Example', model: o.tier }));
  if (edit) { quotes.set('q', { id: 'q', customer: 'Example', selected_option_id: 'best', payment_status: 'unpaid', updated_at: '2026-10-21T10:00:00Z' }); saved.forEach(o => rows.set(o.tier, o)); }
  const mock = { from(table) {
    let action = 'read', values, filters = [], conflict;
    const query = {
      select() { return query; }, eq(k,v) { filters.push(r => r[k] === v); return query; },
      is(k,v) { filters.push(r => (r[k] ?? null) === v); return query; },
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
  const Page = loader({ react: hookReact, 'next/navigation': { useRouter: () => ({ push: p => navigations.push(p) }), useSearchParams: () => ({ get: key => key === 'edit' && edit ? 'q' : key === 'from' && shopDraft ? 'tire-shop' : null }) }, '@/lib/supabase': { supabase: mock }, '@/components/AppHeader': { default: blank }, '@/components/QuoteCustomerInput': { default: blank }, '@/components/AdditionalItemsEditor': { default: blank } })('app/quotes/new/page.tsx').default;
  function render() { cursor=0; return Page(); }
  function saveButton(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'button' && ['Save Changes','Save Quote'].includes(node.props.children)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = saveButton(child); if(found) return found; }
  }
  const prev = { alert: global.alert, sessionStorage: global.sessionStorage };
  global.alert = msg => alerts.push(msg); global.sessionStorage = { getItem: key => shopDraft && key === 'bolt-edit-quote-shop-v1:q' ? JSON.stringify({version:1,savedAt:Date.now(),value:shopDraft}) : null, removeItem() {} };
  try {
    render(); effects.forEach(e => e()); await new Promise(setImmediate);
    const form = hooks.find(v => v?.customer !== undefined); form.customer = 'Example';
    const options = hooks.find(Array.isArray);
    if (!shopDraft) for (const o of options) { o.brand = 'Example'; o.model = o.tier; }
    const button = saveButton(render());
    if (!button) return { rows, quotes, insertCount, alerts, navigations, blocked:true };
    const save = button.props.onClick;
    beforeSave?.(quotes);
    await Promise.all([save(), save()]); // A rapid double click must be ignored.
    if (failOptions) await saveButton(render()).props.onClick();
    return { rows, quotes, insertCount, alerts, navigations };
  } finally { global.alert=prev.alert; global.sessionStorage=prev.sessionStorage; }
}
test('editing good + best adds the missing choice, preserves row IDs and requires fresh approval', async () => {
  const result = await editor();
  assert.equal(result.rows.size,3); assert.equal(result.rows.get('best').id,'best');
  assert.equal(result.quotes.get('q').selected_option_id,null);
  assert.equal(result.quotes.get('q').status,'draft');
  assert.deepEqual(result.alerts,[]); assert.equal(result.insertCount,0);
  assert.deepEqual(result.navigations,['/quotes/q']);
});
test('retrying a failed new quote save reuses the quote and suppresses double clicks', async () => {
  const result = await editor({ edit:false, failOptions:true });
  assert.equal(result.insertCount,1); assert.equal(result.rows.size,3);
  assert.equal(result.alerts.length,1); assert.deepEqual(result.navigations,['/quotes/new-q']);
});
function shoppingDraft() {
  const {quoteShopProducts} = loader()('lib/quote-shop-edit.ts');
  const form = {customer:'Example',contact_name:'Contact',phone:'5551234567',email:'test@example.invalid',vehicle:'Truck',tire_size:'275/65R20',rear_tire_size:'',quantity:'4',rear_quantity:'',address:'Saved address',notes:'Keep notes',service_category:'truck',installation_cost:'329',service_call_fee:'25',disposal_fee:'14',ny_state_tire_fee:'10',sales_tax_rate:'8.125',tax_exempt:true,expires_at:'',additional_items:[{description:'Sensor',quantity:1,unit_price:25,taxable:true}]};
  const options = [0,2].map(i=>({...emptyQuoteOptions[i],id:emptyQuoteOptions[i].tier,quote_id:'q',brand:'Example',model:emptyQuoteOptions[i].tier,price_per_tire:'200'}));
  const products = quoteShopProducts(options,form,false);
  const newTire = {...products[0],id:'new-tire',quoteSnapshot:false,quoteOptionKey:undefined,brand:'New brand',model:'New tire',quotePrice:250,supplier:'USAF',atdProductNumber:'001234',cost:190};
  return {quoteId:'q',version:'2026-10-21T10:00:00Z',form,options,products,splitFitment:false,result:[products[0],newTire]};
}
test('Tire Shop return saves to same quote, removes old choice, and preserves customer, custom fees and extras', async () => {
  const result = await editor({shopDraft:shoppingDraft()});
  assert.equal(result.insertCount,0); assert.deepEqual(result.navigations,['/quotes/q']); assert.deepEqual(result.alerts,[]);
  assert.equal(result.rows.size,2); assert.equal(result.rows.get('good').id,'good'); assert.equal(result.rows.has('best'),false);
  assert.equal(result.rows.get('better').supplier_product_id,'001234'); assert.equal(result.rows.get('better').price_per_tire,250);
  const q=result.quotes.get('q'); assert.equal(q.address,'Saved address'); assert.equal(q.disposal_fee,14); assert.equal(q.installation_cost,329); assert.equal(q.tax_exempt,true); assert.equal(q.additional_items[0].description,'Sensor');
});
test('mixed-size shopping choices save each size to its own database row', async () => {
  const draft=shoppingDraft();
  draft.result[0]={...draft.result[0],size:'30100015'};
  draft.result[1]={...draft.result[1],size:'31105015'};
  const result=await editor({shopDraft:draft});
  assert.deepEqual(result.alerts,[]);
  assert.equal(result.rows.get('good').tire_size,'30100015');
  assert.equal(result.rows.get('better').tire_size,'31105015');
  assert.equal(result.rows.get('better').supplier_product_id,'001234');
  assert.equal(result.rows.get('better').price_per_tire,250);
  assert.equal(result.quotes.get('q').quantity,4);
});
test('changed, paid, payment-pending or converted quotes cannot be overwritten after opening the editor', async () => {
  for(const patch of [{updated_at:'changed'}, {payment_status:'paid'}, {payment_status:'pending'}, {converted_job_id:'job'}]) {
    const result=await editor({beforeSave:quotes=>Object.assign(quotes.get('q'),patch)});
    assert.equal(result.rows.size,2);assert.equal(result.insertCount,0);assert.deepEqual(result.navigations,[]);assert.match(result.alerts[0],/changed or is no longer editable/);
  }
});
test('stale Tire Shop draft cannot overwrite an updated quote', async () => {
  const result=await editor({shopDraft:{...shoppingDraft(),version:'old-version'}});
  assert.equal(result.blocked,true);assert.equal(result.rows.size,2);assert.equal(result.insertCount,0);assert.deepEqual(result.navigations,[]);
});
