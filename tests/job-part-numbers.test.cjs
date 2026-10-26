const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const m=new Module(__filename,module);m.paths=module.paths;
m._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/job-part-numbers.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,__filename);
const {quoteManufacturerParts:parts}=m.exports;
test('manufacturer snapshots preserve ATD MPN, correct legacy USAF UPC and keep leading zeros',()=>{
 assert.equal(parts({supplier:'ATD',supplier_product_id:'12345',manufacturer_product_id:'00481103004'}),'00481103004');
 assert.equal(parts({supplier:'USAF',supplier_product_id:'481103004',manufacturer_product_id:'697662162124'}),'481103004');
 assert.equal(parts({supplier:'ATD',supplier_product_id:'12345'}),null);
 assert.equal(parts({supplier:'USAF',manufacturer_product_id:'697662162124'}),null);
 assert.equal(parts({supplier:'ATD',manufacturer_product_id:'front',rear_supplier:'USAF',rear_supplier_product_id:'rear',rear_manufacturer_product_id:'barcode'},2),'Front: front / Rear: rear');
 assert.equal(parts({supplier:'ATD',manufacturer_product_id:'front'},2),'Front: front / Rear: Not recorded');
});
test('all job card surfaces expose the separate manufacturer number',()=>{
 for (const path of ['app/jobs/page.tsx','app/route/page.tsx','app/page.tsx','app/completed/page.tsx']) {
  const source=fs.readFileSync(require.resolve('../'+path),'utf8');
  assert.ok(source.includes('tire_manufacturer_part_number'));
  assert.ok(source.includes('Manufacturer part #'));
 }
 for (const path of ['app/jobs/new/page.tsx','app/jobs/[id]/page.tsx']) {
  const source=fs.readFileSync(require.resolve('../'+path),'utf8');
  assert.ok(source.includes('name="tire_manufacturer_part_number"'));
  assert.ok(source.includes('form.tire_manufacturer_part_number.trim() || null'));
 }
});
