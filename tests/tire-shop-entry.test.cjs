const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(relative) {
    let file = path.resolve(__dirname, '..', relative);
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const m = new Module(file, module); m.paths = module.paths; cache.set(file, m);
    m.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id.endsWith('.css') ? {} : id.startsWith('@/') ? load(id.slice(2)) : id.startsWith('.') ? load(path.resolve(path.dirname(file), id)) : require(id);
    const source = fs.readFileSync(file, 'utf8') + (file.endsWith('/app/orders/page.tsx') ? '\nexport { OrderSection };' : '');
    m._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return m.exports;
  };
}
function nodes(n) { return !n || typeof n !== 'object' ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(nodes)]; }
function harness() {
  const state = [], effects = [], refs = []; let cursor = 0, ref = 0;
  return { effects, react: { ...React,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { return refs[ref++] ||= { current: initial }; },
    useEffect(fn) { effects.push(fn); }, useMemo(fn) { return fn(); }, useCallback(fn) { return fn; },
  }, render(Component, props) { cursor = ref = 0; return nodes(Component(props)); } };
}
const helpers = loader()('lib/tire-shop-entry');
const form = { customer: '', tires: 'Hercules Strong Guard', size: '205/75R15', qty: '2', tire_product_number: '', po_number: '', mo_number: '', tire_supplier: '', tires_ordered: false };
test('size links preserve metric, LT/ST, decimal and flotation sizes and validate quantities', () => {
  for (const size of ['205/75R15', 'LT245/75R16', 'ST205/75R15', '225/70R19.5', '35x12.50R20', '480/80R38']) {
    const link = helpers.tireShopSizeLink(size, 2);
    assert.deepEqual(helpers.tireShopSizeEntry(link.slice(link.indexOf('?'))), { size, quantity: 2, fromOrder: true });
  }
  assert.equal(helpers.tireShopSizeLink('   ', 2), null);
  assert.equal(helpers.tireShopSizeEntry('?quote=existing&size=2057515'), null);
  for (const quantity of ['0', '-1', '2.5', '25', 'bad']) assert.equal(helpers.tireShopSizeEntry('?size=2057515&quantity=' + quantity).quantity, 4);
  assert.equal(helpers.tireShopSizeEntry('?size=2057515&quantity=12').quantity, 12);
  assert.equal(helpers.tireShopSizeLink('x'.repeat(161)), null);
});
test('job without a part opens size search in a new tab without saving, changing status or requiring a PO', async () => {
  const originalWindow = global.window; const opened = []; let saves = 0, changes = 0;
  global.window = { open: (...args) => opened.push(args) };
  try {
    for (const part of ['', '   ']) {
      const h = harness();
      const Component = loader({ react: h.react, './CustomerOrderPurchase': { __esModule: true, default: 'purchase-dialog' } })('components/JobTireOrdering').default;
      const props = { form: { ...form, tire_product_number: part }, disabled: false, onPrepare: async () => { saves++; }, onComplete() { changes++; }, onManualChange() { changes++; } };
      const button = h.render(Component, props).find(n => n.type === 'button');
      assert.equal(button.props.disabled, false); await button.props.onClick();
      assert.equal(opened.at(-1)[0], '/tire-shop?size=205%2F75R15&source=order&quantity=2');
      assert.deepEqual(opened.at(-1).slice(1), ['_blank', 'noopener,noreferrer']);
      assert.ok(!h.render(Component, props).some(n => n.type === 'purchase-dialog'));
      for (const extra of [{ disabled: true }, { form: { ...form, size: '' } }]) {
        const b = h.render(Component, { ...props, ...extra }).find(n => n.type === 'button');
        assert.equal(b.props.disabled, true); await b.props.onClick();
      }
    }
    assert.equal(opened.length, 2); assert.equal(saves, 0); assert.equal(changes, 0);
  } finally { global.window = originalWindow; }
});
test('order cards browse missing parts but preserve existing supplier receipt and pending-order recovery', () => {
  const originalWindow = global.window, opened = [];
  global.window = { open: (...args) => opened.push(args) };
  try {
    for (const purchase of [undefined, { status: 'placed', supplier: 'ATD', confirmation: 'EXAMPLE' }, { status: 'pending' }]) {
      const h = harness();
      const Component = loader({ react: h.react, 'next/navigation': {}, '@/lib/supabase': {}, '@/components/AppHeader': {}, '@/components/CustomerOrderPurchase': { __esModule: true, default: 'purchase-dialog' }, '@/components/OrderDuplicateNotice': {} })('app/orders/page').OrderSection;
      const order = { id: 1, customer: 'Example', order_status: 'new', tire_size: form.size, qty: 2, tire_product_number: ' ', job_number: '', purchase, tires_ordered: Boolean(purchase), requested_date: '', requested_time: '', submitted_at: '2026-11-10T12:00:00Z' };
      const props = { orders: [order], duplicateOrders: [], title: 'Orders', workingId: null, router: {} };
      const button = h.render(Component, props).find(n => n.type === 'button' && ['Order tires', 'View supplier confirmation', 'Check supplier order'].includes(n.props.children));
      assert.ok(button); assert.equal(button.props.disabled, false); button.props.onClick();
      if (purchase) assert.ok(h.render(Component, props).some(n => n.type === 'purchase-dialog'));
    }
    assert.equal(opened.length, 1); assert.match(opened[0][0], /size=205%2F75R15/);
  } finally { global.window = originalWindow; }
});
test('shop entry auto-searches the supplied size, keeps quantity, and does not restore stale shopping selections', async () => {
  const previous = { window: global.window, fetch: global.fetch, sessionStorage: global.sessionStorage };
  const calls = []; let restored = 0;
  global.window = { location: { search: '?size=205%2F75R15&quantity=2&source=order' } };
  global.sessionStorage = { getItem() { restored++; return null; } };
  global.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ products: [] }) }; };
  try {
    const h = harness();
    const Component = loader({ react: h.react, 'next/navigation': { useRouter: () => ({}) }, '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'TEST' } } }) } } }, '@/components/StaffTireCard': {}, '@/components/UsafPurchase': {}, '@/components/CustomerTirePricing': {}, '@/components/SelectedQuoteTires': {}, '@/components/TireResultControls': { __esModule: true, default: 'result-controls' } })('components/TireShoppingBeta').default;
    h.render(Component, { internal: true }); const cleanups = h.effects.splice(0).map(fn => fn());
    await new Promise(resolve => setImmediate(resolve));
    const tree = h.render(Component, { internal: true });
    assert.equal(restored, 0); assert.deepEqual(calls, [{ action: 'size', query: '205/75R15', internal: true }]);
    assert.equal(tree.find(n => n.props?.placeholder === 'Enter tire size').props.value, '205/75R15');
    assert.equal(tree.find(n => n.type === 'result-controls').props.quantity, 2);
    assert.ok(tree.some(n => n.props?.role === 'status' && String(n.props.children).includes('does not mark tires ordered')));
    cleanups.forEach(fn => typeof fn === 'function' && fn());
  } finally { Object.assign(global, previous); }
});
test('larger order quantities remain visibly selected in staff search controls', () => {
  const Controls = loader()('components/TireResultControls').default;
  const tree = nodes(Controls({ internal: true, quantity: 12, sort: 'margin', onQuantityChange() {}, onSortChange() {} }));
  assert.ok(tree.some(n => n.type === 'option' && n.props.value === 12));
});
