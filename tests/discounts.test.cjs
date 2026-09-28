const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
function loader(stubs={}){const cache=new Map();return function load(file){file=path.resolve(__dirname,'..',file);if(!path.extname(file))file+='.ts';if(cache.has(file))return cache.get(file).exports;const m=new Module(file,module);cache.set(file,m);m.paths=module.paths;m.require=id=>id==='server-only'?{}:Object.hasOwn(stubs,id)?stubs[id]:id.startsWith('@/')?load(id.slice(2)):id.startsWith('.')?load(path.resolve(path.dirname(file),id)):require(id);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;};}
const rules=loader()('lib/discounts');
const code={id:'example',code:'HPR-SAMPLE',description:'Sample only',percent:10,organization:'HPR',tax_exempt:true,exemption_reference:'Approved record',active:true,expires_on:null};
test('discount settings require approval reference, valid rates and dates; disabled or expired codes fail closed',()=>{
 assert.equal(rules.normalizeDiscountCode(' hpr-sample '),'HPR-SAMPLE');
 assert.equal(rules.discountCodeError(code),null);
 for(const change of [{percent:-1},{percent:101},{percent:NaN},{code:'*'},{expires_on:'2026-02-30'},{organization:null},{exemption_reference:''}])assert.ok(rules.discountCodeError({...code,...change}));
 assert.equal(rules.discountIsAvailable({...code,active:false},'2026-09-28'),false);
 assert.equal(rules.discountIsAvailable({...code,expires_on:'2026-09-27'},'2026-09-28'),false);
 assert.equal(rules.discountIsAvailable({...code,expires_on:'2026-09-28'},'2026-09-28'),true);
});
test('per-tire rounding preserves cents and cannot create a negative price',()=>{
 assert.equal(rules.discountedTirePrice(220.99,10),198.89);
 assert.equal(rules.discountedTirePrice(220.99,0),220.99);
 assert.equal(rules.discountedTirePrice(220.99,100),0);
 for(const percent of [-1,101,NaN,Infinity])assert.throws(()=>rules.discountedTirePrice(220.99,percent));
});
test('public code response excludes exemption records and administration metadata',async()=>{
 const route=loader({'@/lib/discounts-server':{lookupDiscount:async()=>code}})('app/api/public/shop/discount/route');
 const result=await route.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({code:'HPR-SAMPLE'})}));
 assert.equal(result.status,200);const body=await result.json();assert.deepEqual(Object.keys(body.discount).sort(),['code','organization','percent','tax_exempt']);assert.ok(!JSON.stringify(body).includes('Approved record'));
});
test('unauthorized code administration cannot query or write the database',async()=>{
 const route=loader({'@/lib/discounts-server':{requireDiscountAdmin:async()=>null},'@/lib/supabase/admin':{createAdminClient:()=>{throw Error('Unexpected database access');}}})('app/api/admin/discount-codes/route');
 const request=new Request('https://example.test',{method:'POST',body:JSON.stringify(code)});
 assert.equal((await route.GET(request)).status,403);assert.equal((await route.POST(request)).status,403);
});
