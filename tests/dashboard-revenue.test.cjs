const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function loader(stubs = {}) {
  return function load(relative) {
    let file = path.resolve(__dirname, '..', relative);
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    const mod = new Module(file, module); mod.paths = module.paths;
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return mod.exports;
  };
}
const { revenueDateKey, completedRevenueForDay } = loader()('lib/dashboard-revenue');
const day = '2026-10-14';
const job = (patch = {}) => ({ id: 1, complete: true, completed_at: '2026-10-14T19:00:00Z', job_total: '100.25', ...patch });
test('revenue uses actual completion date, includes paid/unpaid and archived completed work', () => {
  assert.equal(completedRevenueForDay([
    job({ scheduled: '2026-10-13', payment_status: 'paid' }),
    job({ id: 2, scheduled: '2026-10-20', payment_status: 'unpaid', archived: true }),
    job({ id: 3, scheduled: '2026-10-14', complete: false, job_total: 9999 }),
    job({ id: 4, scheduled: '2026-10-14', completed_at: '2026-10-13T19:00:00Z' }),
    job({ id: 5, completed_at: null }),
  ], day), 200.50);
});
test('New York midnight boundaries and daylight saving do not depend on browser timezone', () => {
  for (const timezone of ['UTC', 'America/Los_Angeles', 'Pacific/Honolulu']) {
    const previous = process.env.TZ; process.env.TZ = timezone;
    try {
      assert.equal(revenueDateKey('2026-10-14T03:59:59Z'), '2026-10-13');
      assert.equal(revenueDateKey('2026-10-14T04:00:00Z'), day);
      assert.equal(revenueDateKey('2026-10-15T03:59:59Z'), day);
      assert.equal(revenueDateKey('2026-10-15T04:00:00Z'), '2026-10-15');
      assert.equal(revenueDateKey('2026-11-01T05:30:00Z'), '2026-11-01');
      assert.equal(revenueDateKey('2026-11-01T06:30:00Z'), '2026-11-01');
      assert.equal(revenueDateKey('2026-01-14T04:59:59Z'), '2026-01-13');
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  }
});
test('missing dates never fall back to scheduled dates and invalid money cannot corrupt the total', () => {
  for (const completed_at of [null, '', 'bad', '2026-10-14', '2026-10-14T12:00:00']) {
    assert.equal(completedRevenueForDay([job({ completed_at, scheduled: day })], day), 0);
  }
  assert.equal(completedRevenueForDay([job({job_total:'0.10'}), job({job_total:'0.20'}), job({job_total:'NaN'}), job({job_total:'Infinity'}), job({job_total:null})], day), 0.30);
  assert.equal(completedRevenueForDay([job()], ''), 0);
});
test('dashboard renders completed revenue independently of the open route and exposes read failures', () => {
  for (const failure of [false, true]) {
    const states = [[job({ customer: 'Completed example', scheduled: '2026-10-13T12:00:00' })], [], {}, 0, 0, false, day, failure];
    let index = 0;
    const Component = loader({
      react: { ...React, useState: () => [states[index++], () => {}], useMemo: fn => fn(), useEffect() {}, useRef: () => ({ current: 0 }) },
      'next/navigation': { useRouter: () => ({ push() {} }) },
      '@/components/AppHeader': { __esModule: true, default: () => null },
      '@/lib/supabase': { supabase: {} },
    })('app/page.tsx').default;
    const html = renderToStaticMarkup(React.createElement(Component));
    assert.match(html, /Revenue Today/);
    assert.match(html, /Completed today · includes tax/);
    assert.match(html, failure ? /Unavailable/ : /\$100.25/);
    assert.match(html, /No jobs scheduled for today/);
  }
});
test('dashboard loads completion timestamps with pagination and refreshes on return and at midnight', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/page.tsx'), 'utf8');
  assert.match(source, /complete,\s+completed_at,/);
  assert.match(source, /\.order\("id", \{ ascending: true \}\)\.range\(offset, offset \+ 499\)/);
  assert.match(source, /completedRevenueForDay\(jobs, todayKey\)/);
  assert.match(source, /setTodayKey\(revenueDateKey\(new Date\(\)\)\)/);
  assert.match(source, /addEventListener\("focus", refresh\)/);
  assert.match(source, /setInterval\(refresh, 60000\)/);
  assert.match(source, /setJobsError\(true\)/);
});
