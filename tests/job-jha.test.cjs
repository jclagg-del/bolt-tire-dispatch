const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); cache.set(file, mod); mod.paths = module.paths;
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id === 'server-only' ? {} : id.startsWith('@/') ? load(id.slice(2)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
    return mod.exports;
  };
}
const jha = loader()('lib/job-jha.ts');
const complete = () => ({ ...jha.emptyJha(), technician: 'Example Technician', steps: [{ task: 'Unload tires', hazards: 'Moving vehicles', controls: 'Park safely; establish an exclusion area', controlled: true }], glasses: true, hearing: true, acknowledged: true });
test('JHA requires actual hazards, controls, PPE and acknowledgment; gloves and photos are optional', () => {
  assert.equal(jha.jhaValidation(complete(), 'complete'), null);
  for (const patch of [{ technician: '' }, { steps: [] }, { steps: [{ ...complete().steps[0], task: '' }] }, { steps: [{ ...complete().steps[0], hazards: '' }] }, { steps: [{ ...complete().steps[0], controls: '' }] }, { steps: [{ ...complete().steps[0], controlled: false }] }, { glasses: false }, { hearing: false }, { acknowledged: false }, { unsafeReason: 'Traffic not controlled' }]) {
    assert.equal(typeof jha.jhaValidation({ ...complete(), ...patch }, 'complete'), 'string');
  }
  assert.equal(jha.jhaValidation(jha.emptyJha(), 'draft'), null);
  assert.match(jha.jhaValidation(jha.emptyJha(), 'unsafe'), /Describe/);
  assert.equal(jha.jhaValidation({ ...jha.emptyJha(), unsafeReason: 'Uncontrolled traffic' }, 'unsafe'), null);
});
test('normalization rejects truthy strings and strips client-supplied URL/extra metadata', () => {
  const value = jha.normalizeJha({ ...complete(), technician: '  Tech  ', glasses: 'true', photos: [{ path: '1/photo.jpg', url: 'https://evil.example', caption: ' hello ', category: 'other', latitude: 42 }] });
  assert.equal(value.technician, 'Tech'); assert.equal(value.glasses, false);
  assert.deepEqual(value.photos, [{ path: '1/photo.jpg', caption: 'hello', category: 'Before work' }]);
  assert.doesNotThrow(() => jha.normalizeJha({ steps: [null, 4], photos: [null, false] }));
});
test('completion requires matching job context and valid completed assessment', () => {
  const job = { service_type: 'Delivery', address: 'Example St', qty: 4, scheduled: '2026-10-06' };
  const record = { status: 'complete', assessment: complete(), context: jha.jhaContext(job) };
  assert.equal(jha.jhaReady(record, job), true);
  for (const field of ['service_type', 'address', 'scheduled', 'vehicle', 'tires', 'size', 'qty']) assert.equal(jha.jhaReady(record, { ...job, [field]: 'changed' }), false, field);
  assert.equal(jha.jhaReady(record, { ...job, payment_status: 'paid' }), true);
  assert.equal(jha.jhaReady({ ...record, status: 'unsafe' }, job), false);
  assert.equal(jha.jhaReady({ ...record, assessment: jha.emptyJha() }, job), false);
  assert.equal(jha.jhaReady(null, job), false);
});
test('uploads allow raster signatures, never SVG or arbitrary files', () => {
  assert.equal(jha.jhaImageType(new Uint8Array([255,216,255,0])), 'image/jpeg');
  assert.equal(jha.jhaImageType(new Uint8Array([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(jha.jhaImageType(Buffer.from('RIFF1234WEBP')), 'image/webp');
  for (const value of ['', '<svg onload="bad()">', '%PDF', 'not a photo']) assert.equal(jha.jhaImageType(Buffer.from(value)), null);
});

function fixture({ user = { id: 'staff-id' }, role = 'technician', job = { id: '1', complete: false }, record = null, missingSchema = false, rpcError = null } = {}) {
  const calls = { rpc: [], signed: [], uploads: [], photoRows: [], removed: [] };
  const admin = {
    from(table) {
      const query = { select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
        insert(value) { calls.photoRows.push(value); return query; },
        maybeSingle: () => Promise.resolve(result()), then: (yes, no) => Promise.resolve(result()).then(yes, no) };
      function result() {
        if (table === 'staff_security') return { data: role ? { role } : null };
        if (table === 'jobs') return { data: job };
        return { data: table === 'job_jha_history' ? [] : record && structuredClone(record), error: missingSchema ? { code: '42P01' } : null };
      }
      return query;
    },
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: { revision: args.p_revision + 1 }, error: rpcError }; },
    storage: { from(bucket) { assert.equal(bucket, 'job-jha-photos'); return { createSignedUrl: async (path, seconds) => { calls.signed.push({ path, seconds }); return { data: { signedUrl: 'https://private.example/signed' } }; }, upload: async (...args) => { calls.uploads.push(args); return {}; }, remove: async paths => { calls.removed.push(...paths); return {}; } }; } },
  };
  const load = loader({ '@/lib/supabase/admin': { createAdminClient: () => admin, requireApiUser: async () => user } });
  const route = load('app/api/jobs/[id]/jha/route.ts');
  const photos = load('app/api/jobs/[id]/jha/photos/route.ts');
  const params = { params: Promise.resolve({ id: '1' }) };
  return { calls, get: (suffix = '') => route.GET(new Request(`https://example.test/api/jobs/1/jha${suffix}`), params),
    put: (body = {}) => route.PUT(new Request('https://example.test/api/jobs/1/jha', { method: 'PUT', body: JSON.stringify({ status: 'complete', revision: 0, context: jha.jhaContext(job || {}), assessment: complete(), ...body }) }), params),
    photo: body => photos.POST(new Request('https://example.test/api/jobs/1/jha/photos', { method: 'POST', body }), params),
  };
}
test('all JHA endpoints require authenticated staff and an existing job', async () => {
  for (const [options, status] of [[{ user: null },401], [{ role: 'customer' },403], [{ role: null },403], [{ job: null },404]]) {
    const f = fixture(options);
    assert.equal((await f.get()).status, status); assert.equal((await f.put()).status, status);
    assert.equal((await f.photo(new FormData())).status, status); assert.equal(f.calls.rpc.length, 0);
  }
});
test('missing schema fails closed and GET does not infer readiness', async () => {
  assert.equal((await fixture({ missingSchema: true }).get()).status, 503);
  assert.equal((await fixture({ rpcError: { code: '42883' } }).put()).status, 503);
  const response = await fixture().get();
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal((await response.json()).ready, false);
});
test('save ignores forged author/time and binds to authenticated identity and revision', async () => {
  const f = fixture();
  assert.equal((await f.put({ updated_by: 'somebody-else', completed_at: '2000-01-01' })).status, 200);
  assert.equal(f.calls.rpc[0].name, 'save_job_jha');
  assert.equal(f.calls.rpc[0].args.p_user, 'staff-id'); assert.equal(f.calls.rpc[0].args.p_revision, 0);
  assert.equal(f.calls.rpc[0].args.completed_at, undefined);
  assert.equal((await f.put({ assessment: jha.emptyJha() })).status, 400);
  assert.equal((await f.put({ revision: -1 })).status, 400);
  assert.equal(f.calls.rpc.length, 1);
});
test('completed and archived jobs cannot alter assessments or upload new evidence', async () => {
  for (const job of [{ id: '1', complete: true }, { id: '1', archived: true }]) {
    const f = fixture({ job }); assert.equal((await f.put()).status, 409);
    assert.equal((await f.photo(new FormData())).status, 409); assert.equal(f.calls.rpc.length, 0);
    assert.equal((await (await f.get()).json()).readOnly, true);
  }
});
test('private photo links expire after fifteen minutes; invalid revision is rejected', async () => {
  const f = fixture({ record: { revision: 1, status: 'complete', context: jha.jhaContext({}), assessment: { ...complete(), photos: [{ path: '1/photo.jpg', caption: 'Site', category: 'Before work' }] } } });
  const data = await (await f.get()).json();
  assert.equal(data.record.assessment.photos[0].url, 'https://private.example/signed');
  assert.deepEqual(f.calls.signed, [{ path: '1/photo.jpg', seconds: 900 }]);
  assert.equal((await f.get('?revision=bogus')).status, 400);
});
test('photo endpoint rejects empty, oversized and misleading content before uploading', async () => {
  const f = fixture();
  assert.equal((await f.photo(new FormData())).status, 400);
  const bad = new FormData(); bad.append('photo', new Blob(['<svg>'], { type: 'image/jpeg' }), 'photo.jpg');
  assert.equal((await f.photo(bad)).status, 400);
  const big = new FormData(); big.append('photo', new Blob([new Uint8Array(jha.JHA_MAX_PHOTO_BYTES + 1)]), 'photo.jpg');
  assert.equal((await f.photo(big)).status, 400);
  assert.equal(f.calls.uploads.length, 0);
});
test('Route, job details and Tasks expose the JHA and recheck before completion', () => {
  for (const file of ['app/route/page.tsx', 'app/jobs/[id]/page.tsx', 'app/tasks/page.tsx']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(source, /<JobJhaButton jobId=/); assert.match(source, /await requireCompletedJha\(/);
  }
});
test('valid photo receives a server-generated job path and failed metadata save removes only that upload', async () => {
  for (const missingSchema of [false, true]) {
    const f = fixture({ missingSchema });
    const form = new FormData(); form.append('photo', new Blob([new Uint8Array([255,216,255,0])], { type: 'image/jpeg' }), '../../another-job.jpg');
    const response = await f.photo(form); assert.equal(response.status, missingSchema ? 503 : 200);
    const [storagePath, , options] = f.calls.uploads[0];
    assert.match(storagePath, /^1\/staff-id\/[a-f0-9-]+\.jpg$/); assert.equal(options.upsert, false);
    assert.deepEqual(f.calls.photoRows[0], { path: storagePath, job_id: '1', uploaded_by: 'staff-id' });
    assert.deepEqual(f.calls.removed, missingSchema ? [storagePath] : []);
  }
});

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function nodes(node, type, result = []) {
  if (Array.isArray(node)) node.forEach(n => nodes(n, type, result));
  else if (node && typeof node === 'object') { if (node.type === type) result.push(node); nodes(node.props?.children, type, result); }
  return result;
}
const button = (tree, label) => nodes(tree, 'button').findLast(n => n.props.children === label);
function uiFixture({ ready = false, readOnly = false, value = jha.emptyJha() } = {}) {
  const states = []; let index = 0;
  let snapshot = { job: { customer: 'Example', service_type: 'Delivery' }, record: { revision: 1, status: ready ? 'complete' : 'draft', assessment: value, updated_at: '2026-10-06T12:00:00Z' }, context: {}, ready, readOnly, history: [] };
  const saves = [];
  const hooks = { ...React, useState(initial) { const key = index++; if (!(key in states)) states[key] = typeof initial === 'function' ? initial() : initial; return [states[key], next => { states[key] = typeof next === 'function' ? next(states[key]) : next; }]; }, useRef: () => ({ current: null }), useEffect() {}, useCallback: fn => fn };
  const Component = loader({ react: hooks, 'react-dom': { createPortal: tree => tree }, './JobJhaButton.module.css': { __esModule: true, default: {} }, '@/lib/job-jha-client': {
    jhaRequest: async (_id, _suffix, options) => {
      if (options?.method === 'PUT') { const body = JSON.parse(options.body); saves.push(body); snapshot = { ...snapshot, record: { ...snapshot.record, revision: body.revision + 1, status: body.status, assessment: body.assessment }, ready: body.status === 'complete' }; }
      return structuredClone(snapshot);
    }, prepareJhaPhoto: async () => { throw Error('Not used'); },
  } })('components/JobJhaButton.tsx').default;
  return { saves, render() { index = 0; return Component({ jobId: '1' }); } };
}
test('guided JHA opens, offers camera/library, validates, and only saves after explicit confirmation', async () => {
  const old = global.document; global.document = { body: {} };
  try {
    const ui = uiFixture(); await button(ui.render(), 'Complete JHA').props.onClick();
    let tree = ui.render(); assert.equal(nodes(tree, 'dialog').length, 1);
    const html = renderToStaticMarkup(tree);
    assert.match(html, /Safety glasses — required/); assert.match(html, /Hearing protection — required/); assert.match(html, /Gloves — optional/);
    button(tree, '2. Photos').props.onClick(); tree = ui.render();
    assert.equal(nodes(tree, 'input').some(n => n.props.capture === 'environment'), true);
    assert.equal(nodes(tree, 'input').some(n => n.props.multiple === true), true);
    button(tree, '3. Review').props.onClick(); tree = ui.render();
    await button(tree, 'Complete JHA').props.onClick(); assert.equal(ui.saves.length, 0);
    assert.match(renderToStaticMarkup(ui.render()), /Enter the technician/);
    const ready = uiFixture({ value: complete() }); await button(ready.render(), 'Complete JHA').props.onClick();
    button(ready.render(), '3. Review').props.onClick();
    assert.equal(ready.saves.length, 0); await button(ready.render(), 'Complete JHA').props.onClick();
    assert.equal(ready.saves[0].status, 'complete'); assert.match(renderToStaticMarkup(ready.render()), /JHA complete. You can now complete/);
  } finally { global.document = old; }
});
test('reassessment revokes prior completion and resets confirmations; historical view cannot save', async () => {
  const old = global.document; global.document = { body: {} };
  try {
    const ui = uiFixture({ ready: true, value: complete() }); await button(ui.render(), 'Complete JHA').props.onClick();
    assert.equal(nodes(ui.render(), 'fieldset')[0].props.disabled, true);
    await button(ui.render(), 'Reassess — reopen JHA').props.onClick();
    const saved = ui.saves[0]; assert.equal(saved.status, 'draft'); assert.equal(saved.assessment.acknowledged, false);
    assert.equal(saved.assessment.glasses, false); assert.equal(saved.assessment.hearing, false); assert.equal(saved.assessment.steps[0].controlled, false);
    const historical = uiFixture({ readOnly: true, value: complete() }); await button(historical.render(), 'Complete JHA').props.onClick();
    button(historical.render(), '3. Review').props.onClick(); const tree = historical.render();
    assert.equal(nodes(tree, 'fieldset')[0].props.disabled, true); assert.equal(button(tree, 'Save draft'), undefined);
    assert.equal(button(tree, 'Complete JHA'), undefined);
  } finally { global.document = old; }
});
