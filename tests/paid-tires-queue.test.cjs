const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react'), {renderToStaticMarkup} = require('react-dom/server');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText, file);
    return mod.exports;
  };
}
const pending = {id:338,customer:'Unscheduled paid customer',payment_status:'paid',job_status:'paid',tires_ordered:false,archived:false,source_quote_id:'quote-38',scheduled:null,complete:false};
const {isPaidTiresToOrder,paidTiresQueueUrl} = loader()('lib/paid-tires-queue');
test('paid tire queue includes unscheduled paid jobs and matches exact dashboard predicates', () => {
  assert.equal(isPaidTiresToOrder(pending),true);
  for (const patch of [{payment_status:'unpaid'},{payment_status:'partial'},{tires_ordered:true},{tires_ordered:null},{tires_ordered:undefined},{archived:true},{archived:null},{source_quote_id:null},{source_quote_id:undefined}]) {
    assert.equal(isPaidTiresToOrder({...pending,...patch}),false,JSON.stringify(patch));
  }
  assert.equal(paidTiresQueueUrl,'/jobs?queue=paid-tires-to-order');
  const dashboard=fs.readFileSync(path.resolve(__dirname,'../app/page.tsx'),'utf8');
  assert.match(dashboard,/label="Paid Tires to Order"[^\n]*router.push\(paidTiresQueueUrl\)/);
});
function renderJobs(queue, status='all') {
  const rows=[pending,{...pending,id:339,customer:'Already ordered customer',tires_ordered:true},{...pending,id:340,customer:'Unpaid customer',payment_status:'unpaid'}];
  const states=[rows,[],false,'','all',status,'paid','all','all','',''];
  let index=0;
  const load=loader({
    react:{...React,useState:()=>[states[index++],()=>{}],useEffect:()=>{},useMemo:fn=>fn()},
    'next/navigation':{useRouter:()=>({push(){}}),useSearchParams:()=>new URLSearchParams(queue?'queue=paid-tires-to-order':'payment=paid')},
    'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
    '@/components/AppHeader':{__esModule:true,default:()=>null},
    '@/lib/supabase':{supabase:{}}
  });
  return renderToStaticMarkup(React.createElement(load('app/jobs/page').default));
}
test('dedicated queue renders only paid purchases awaiting tires, including unscheduled paid-status jobs',()=>{
  for(const status of ['all','open']) {
    const html=renderJobs(true,status);
    for(const text of ['Paid Tires to Order','Unscheduled paid customer','Show All Jobs','1 of 1']) assert.ok(html.includes(text),text);
    assert.ok(!html.includes('Already ordered customer'));
    assert.ok(!html.includes('Unpaid customer'));
  }
});
test('ordinary paid jobs view remains available without the tire-order queue restriction',()=>{
  const html=renderJobs(false);
  assert.ok(html.includes('All Jobs'));
  assert.ok(html.includes('Already ordered customer'));
  assert.ok(!html.includes('Unpaid customer'));
});
