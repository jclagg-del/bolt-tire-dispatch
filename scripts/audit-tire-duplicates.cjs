// Read-only public inventory audit. Never submits orders or writes database rows.
// Usage: node scripts/audit-tire-duplicates.cjs 37125022 35125020
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const cp = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(source) {
  const mod = new Module(__filename, module);
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, __filename);
  return mod.exports;
}
const current = load(fs.readFileSync(path.join(root, 'lib/tire-supplier-offers.ts'), 'utf8'));
const baseline = load(cp.execFileSync('git', ['show', 'origin/main:lib/tire-supplier-offers.ts'], { cwd: root, encoding: 'utf8' }));
const sizes = process.argv.slice(2);
const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function specs(p) {
  return { id: p.id, brand: p.brand, model: p.model, size: p.size, loadSpeed: p.loadSpeed, loadRange: p.loadRange, sidewall: p.sidewall, oeMarking: p.oeMarking, runFlat: p.runFlat };
}
async function audit(query) {
  const response = await fetch('https://app.bolttire.com/api/atd', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'size', query }), signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`${query}: HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.products)) throw new Error(`${query}: missing products array`);
  const products = data.products.filter(p => p.availability.local + p.availability.localPlus > 0);
  const pairs = [];
  for (let i = 0; i < products.length; i++) for (const b of products.slice(i + 1)) {
    const a = products[i];
    if (a.supplier === b.supplier || key(a.brand) !== key(b.brand)) continue;
    const ids = [a.atdProductNumber, a.manufacturerProductNumber].map(key).filter(Boolean);
    if (![b.atdProductNumber, b.manufacturerProductNumber].map(key).some(id => ids.includes(id))) continue;
    if (!current.sameTireVariant(a, b)) pairs.push([specs(a), specs(b)]);
  }
  const target = products.filter(p => /toyo|nitto/i.test(p.brand));
  console.log(JSON.stringify({ query, offers: products.length, before: baseline.uniqueTireCards(products).length, after: current.uniqueTireCards(products).length,
    toyoNitto: { offers: target.length, before: baseline.uniqueTireCards(target).length, after: current.uniqueTireCards(target).length },
    unmatchedExactParts: pairs }));
}
async function worker() {
  while (sizes.length) {
    const size = sizes.shift();
    try { await audit(size); } catch (error) { console.log(JSON.stringify({ query: size, error: error.message })); process.exitCode = 1; }
  }
}
Promise.all([worker(), worker(), worker()]);
