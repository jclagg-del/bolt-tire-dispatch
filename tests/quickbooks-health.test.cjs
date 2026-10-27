const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');

function fixture({ authenticated = true, connectionError, company = { Id: '1', CompanyName: 'Sample company' }, failures = {}, malformed = '' } = {}) {
  const calls = [], cache = new Map();
  function load(file) {
    file = path.resolve(__dirname, '..', file + '.ts');
    if (cache.has(file)) return cache.get(file).exports;
    const m = new Module(file, module); m.paths = module.paths; cache.set(file, m);
    m.require = name => name === '@/lib/supabase/admin' ? { requireApiUser: async () => authenticated ? { id: 'staff' } : null }
      : name === '@/lib/quickbooks' ? {
        quickBooksConfig: () => ({ environment: 'production' }),
        getConnection: async () => { if (connectionError) throw new Error(connectionError); return { realm_id: 'company-realm', access_token: 'never-expose', refresh_token: 'never-expose' }; },
        quickBooksRequest: async (url, init) => {
          assert.equal(init, undefined, 'only GET calls are allowed'); calls.push(decodeURIComponent(url));
          if (url.startsWith('/companyinfo/')) return { CompanyInfo: company };
          const query = new URL('https://example.com' + url).searchParams.get('query');
          const match = /^select \* from (Customer|Invoice|Item) maxresults 1$/.exec(query);
          assert.ok(match, 'query must be bounded and read-only'); const entity = match[1];
          if (failures[entity]) throw new Error(failures[entity]);
          return malformed === entity ? {} : { QueryResponse: { [entity]: [{ Id: 'sample', privateData: 'must-not-leak' }] } };
        },
      } : name.startsWith('@/') ? load(name.slice(2)) : require(name);
    m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
    return m.exports;
  }
  const route = load('app/api/quickbooks/status/route');
  return { calls, run: (full = false) => route.GET(new Request('https://example.com/api/quickbooks/status' + (full ? '?test=1' : ''))) };
}

test('status verifies the actual company, rather than only the saved tokens', async () => {
  const f = fixture(); const response = await f.run(); const result = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(result.connected, true); assert.equal(result.companyName, 'Sample company');
  assert.equal(result.environment, 'production'); assert.equal(result.healthy, true);
  assert.deepEqual(f.calls, ['/companyinfo/company-realm']);
  assert.ok(!JSON.stringify(result).includes('never-expose'));
});
test('full test reads company, customers, invoices and items without returning private records', async () => {
  const f = fixture(); const result = await (await f.run(true)).json();
  assert.equal(f.calls.length, 4); assert.equal(result.checks.length, 4);
  assert.ok(result.checks.every(c => c.ok)); assert.equal(result.healthy, true);
  assert.ok(!JSON.stringify(result).includes('must-not-leak'));
});
test('failed API check identifies the problem but continues the remaining read-only tests', async () => {
  const f = fixture({ failures: { Invoice: 'Invoice access denied' } });
  const result = await (await f.run(true)).json();
  assert.equal(result.connected, true); assert.equal(result.healthy, false);
  assert.equal(result.checks[2].error, 'Invoice access denied'); assert.equal(result.checks[3].ok, true);
});
test('missing connection and malformed company data do not claim connected', async () => {
  for (const input of [{ connectionError: 'QuickBooks is not connected.' }, { company: null }, { company: {} }]) {
    const response = await fixture(input).run(); const result = await response.json();
    assert.equal(response.status, 503); assert.equal(result.connected, false); assert.ok(result.error);
  }
});
test('malformed successful API responses do not produce a passing test', async () => {
  const result = await (await fixture({ malformed: 'Item' }).run(true)).json();
  assert.equal(result.healthy, false); assert.equal(result.checks[3].ok, false);
});
test('unauthenticated requests cannot run connection tests', async () => {
  const f = fixture({ authenticated: false }); const response = await f.run(true);
  assert.equal(response.status, 401); assert.equal(f.calls.length, 0);
});
test('billing exposes a separate read-only test and displays connection errors', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/billing/page.tsx'), 'utf8');
  assert.match(source, /onClick=\{\(\) => checkQuickBooks\(true\)\}/);
  assert.match(source, /\?test=1/); assert.match(source, /quickBooksError && <p role="alert"/);
  assert.match(source, /finally \{ setCheckingQuickBooks\(false\); \}/);
  assert.match(source, /Read-only test\. No invoices were created/);
});
