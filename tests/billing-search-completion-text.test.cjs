const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript'), React = require('react');
function load(file, stubs={}) {
  const filename=path.resolve(__dirname,'..',file), mod=new Module(filename,module); mod.paths=module.paths;
  mod.require=id=>Object.hasOwn(stubs,id)?stubs[id]:id.startsWith('@/')?load(id.slice(2)+'.ts',stubs):require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);return mod.exports;
}
function nodes(tree) { if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.props?.children)]; }
function hooks() {
  const values=[];let cursor=0;return {reset(){cursor=0},react:{...React,useEffect(){},useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v}]},useRef(initial){const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i]}}};
}
const {matchesBillingSearch}=load('lib/billing-search.ts');
test('billing search handles partial, mixed-case, multi-field and formatted phone searches',()=>{
  const job={id:123,customer:'Brett Colleran',billing_name:'Bolt Test',facility_name:'Wallkill',po_number:'00308757',mo_number:'00906600',invoice_number:'INV-5434',vehicle:'2023 Subaru',email:'brett@example.test',phone:'(305) 609-6858'};
  for(const q of ['', '   ', 'COLLER', 'brett subaru', '00308757', '00906600','5434','Wallkill','example.test','3056096858','305-609-6858','123'])assert.equal(matchesBillingSearch(job,q),true,q);
  for(const q of ['missing','brett ford','undefined','null'])assert.equal(matchesBillingSearch(job,q),false,q);
  assert.equal(matchesBillingSearch({id:0},'0'),true);
});
function textHarness(overrides={}, result={review:{sent:true}}) {
  const h=hooks(),requests=[],confirms=[];let tree;
  const originalFetch=global.fetch,originalWindow=global.window;
  global.window={confirm:message=>{confirms.push(message);return overrides.confirm!==false}};
  global.fetch=async(url,options)=>{requests.push({url,options});if(overrides.networkError)throw new Error('Network unavailable');await overrides.wait;return {ok:overrides.ok!==false,json:async()=>result}};
  const Button=load('components/CompletionTextButton.tsx',{react:h.react,'@/lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:overrides.noSession?null:{access_token:'TEST'}}})}}}}).default;
  const job={id:10,complete:true,customer:'Test Customer',phone:'3056096858',...overrides.job};
  return {requests,confirms,render(){h.reset();return tree=Button({job})},button(){return nodes(tree).find(n=>n.type==='button')},find(fn){return nodes(tree).find(fn)},restore(){global.fetch=originalFetch;global.window=originalWindow}};
}
test('completion action is hidden for unfinished and fleet jobs; invalid phone and sent records are disabled',()=>{
  for(const job of [{complete:false},{customer:'HPR'},{customer:'Kingdom Support Services'}]){const h=textHarness({job});try{assert.equal(h.render(),null)}finally{h.restore()}}
  for(const job of [{phone:''},{phone:'123'},{review_request_sent_at:'2026-10-20'}]){const h=textHarness({job});try{h.render();assert.equal(h.button().props.disabled,true);assert.equal(h.requests.length,0)}finally{h.restore()}}
});
test('confirmation cancellation sends nothing; action stops card navigation and never submits a form',async()=>{
  const h=textHarness({confirm:false});try{const tree=h.render();let stopped=false;tree.props.onClick({stopPropagation(){stopped=true}});assert.equal(stopped,true);assert.equal(h.button().props.type,'button');await h.button().props.onClick();assert.equal(h.requests.length,0)}finally{h.restore()}
});
test('one confirmed click sends the existing manual mode and records success; rapid double-clicks do not send twice',async()=>{
  let release;const wait=new Promise(r=>release=r),h=textHarness({wait});try{
    h.render();const click=h.button().props.onClick;const first=click();await click();await new Promise(r=>setImmediate(r));assert.equal(h.requests.length,1);assert.equal(h.confirms.length,1);
    assert.equal(h.requests[0].url,'/api/notifications/job-completed');assert.deepEqual(JSON.parse(h.requests[0].options.body),{jobId:10,mode:'review_text'});assert.equal(h.requests[0].options.headers.Authorization,'Bearer TEST');
    release();await first;h.render();assert.equal(h.button().props.children,'Text sent');assert.equal(h.button().props.disabled,true);
  }finally{release();h.restore()}
});
test('skips, disconnected messaging, API failure and network failures never display a sent state',async()=>{
  for(const [options,result] of [[{}, {skipped:true}],[{}, {review:{skipped:true,reason:'no-valid-phone'}}],[{}, {review:{skipped:true,reason:'quo-not-connected'}}],[{ok:false},{error:'Provider failed'}],[{networkError:true},{}],[{noSession:true},{}]]){
    const h=textHarness(options,result);try{h.render();await h.button().props.onClick();h.render();assert.equal(h.button().props.children,'Send completion text');assert.ok(h.find(n=>n.props?.role==='alert'));assert.equal(h.button().props.disabled,false)}finally{h.restore()}
  }
});
test('Billing searches all sections without altering summary totals and loads beyond first page',async()=>{
  const h=hooks(),ranges=[];const rows=Array.from({length:500},(_,id)=>({id,customer:'Other',complete:true,job_total:1}));
  const supabase={from(){const q={select(){return q},order(){return q},range:async(a,b)=>{ranges.push([a,b]);return {data:a===0?rows:[{id:501,customer:'Brett Colleran',payment_status:'paid',job_total:762.51,po_number:'PO-38'}]}}};return q}};
  const component=type=>({__esModule:true,default:type});
  const Page=load('app/billing/page.tsx',{react:h.react,'next/navigation':{useRouter:()=>({push(){}})},'@/lib/supabase':{supabase},'@/components/AppHeader':component('header'),'@/components/QuarterlyTaxReport':component('tax-report'),'@/components/BillingReceiptDialog':component('receipt'),'@/components/CompletionTextButton':component('completion-text')}).default;
  const render=()=>{h.reset();return Page()};let tree=render();
  // Capture the mount effect, with all database and network operations stubbed.
  const effects=[];h.react.useEffect=fn=>effects.push(fn);
  const originalFetch=global.fetch;supabase.auth={getSession:async()=>({data:{session:{access_token:'TEST'}}})};global.fetch=async()=>({ok:true,json:async()=>({connected:false})});
  try{render();effects[0]();await new Promise(r=>setImmediate(r));tree=render();assert.deepEqual(ranges,[[0,499],[500,999]]);
    nodes(tree).find(n=>n.props?.id==='billing-search').props.onChange({target:{value:'brett'}});tree=render();
    const trs=nodes(tree).filter(n=>n.type==='tr'&&n.props.onClick);assert.equal(trs.length,1);assert.ok(JSON.stringify(trs[0]).includes('Brett Colleran'));
    assert.ok(JSON.stringify(tree).includes('500'));assert.ok(nodes(tree).some(n=>n.type==='tax-report'));
    nodes(tree).find(n=>n.type==='button'&&n.props.children==='Clear').props.onClick();tree=render();assert.equal(nodes(tree).filter(n=>n.type==='tr'&&n.props.onClick).length,501);
  }finally{global.fetch=originalFetch}
});
test('job cards, saved job details, Billing and Completed share the completion action',()=>{
  for(const file of ['app/jobs/page.tsx','app/jobs/[id]/page.tsx','app/billing/page.tsx','app/completed/page.tsx'])assert.ok(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8').includes('<CompletionTextButton'));
  const detail=fs.readFileSync(path.resolve(__dirname,'../app/jobs/[id]/page.tsx'),'utf8');assert.ok(detail.includes('job={completionTextJob}'),'use saved recipient, not unsaved form edits');
});
