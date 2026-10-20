const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react');

function load(file, stubs) {
  const filename = path.resolve(__dirname,'..',file);
  const mod = new Module(filename,module); mod.paths=module.paths;
  mod.require=id=>Object.hasOwn(stubs,id)?stubs[id]:id.startsWith('@/')?load(id.slice(2)+'.ts',stubs):require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);
  return mod.exports;
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree,...nodes(tree.props?.children)];
}
const helpers=load('lib/route-order.ts',{});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function harness() {
  let cursor=0,tree;const hooks=[], effects=[], reads=[], writes=[], barriers=new Map();
  const originalFetch=global.fetch;
  const today=helpers.routeDate(new Date());
  function barrier(date) {
    if(!barriers.has(date)) {let release;const promise=new Promise(r=>release=r);barriers.set(date,{promise,release});}
    return barriers.get(date);
  }
  const react={...React,
    useState(initial){const i=cursor++;if(!(i in hooks)) hooks[i]=typeof initial==='function'?initial():initial;return [hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value}];},
    useRef(initial){const i=cursor++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
    useMemo(fn){cursor++;return fn();},
    useEffect(fn,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){effects.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}},
  };
  const supabase={auth:{getSession:async()=>({data:{session:{access_token:'TEST'}}})},from(table){
    let date,write;const q={select(){return q},eq(key,value){if(key==='assignment_date')date=value;return q},order(){return q},gte(key,value){date=helpers.shiftRouteDate(value.slice(0,10),1);return q},lt(){return q},upsert(value){write=value;return q},then(yes,no){
      if(write){writes.push({table,value:write});return Promise.resolve({error:null}).then(yes,no);}
      if(table==='vehicles')return Promise.resolve({data:[{id:'stepvan',name:'Stepvan',color:'#2563eb',active:true,sort_order:1}]}).then(yes,no);
      reads.push({table,date});
      return barrier(date).promise.then(()=>({data:table==='jobs'?[{id:date,customer:date,scheduled:date+'T09:00:00',vehicle_id:'stepvan',complete:false}]:[{vehicle_id:'stepvan',technician_name:'Tech '+date}]})).then(yes,no);
    }};return q;
  }};
  global.fetch=async url=>{const date=new URL(url,'https://example.test').searchParams.get('date');reads.push({table:'route_day_orders',date});await barrier(date).promise;return {ok:true,json:async()=>({orders:[{vehicle_id:'stepvan',job_ids:[date],revision:date===today?1:2}]})};};
  const component=type=>({__esModule:true,default:type});
  const Page=load('app/route/page.tsx',{react,'next/navigation':{useRouter:()=>({push(){}})},'@/lib/supabase':{supabase},'@/components/AppHeader':component('app-header'),'@/components/JobJhaButton':component('jha-button'),'@/components/RouteStopList':component('route-stop-list'),'@/components/RouteAppointmentDialog':component('appointment-dialog'),'@/components/WheelTorqueInput':component('wheel-torque'),'@/lib/job-jha-client':{},'@/lib/quo':{}}).default;
  function render(){cursor=0;tree=Page();for(const effect of effects.splice(0))effect();return tree;}
  const find=predicate=>nodes(tree).find(predicate);
  return {today,reads,writes,render,find,barrier,
    change(date){find(n=>n.props?.['aria-label']==='Route date').props.onChange({target:{value:date}});render();},
    async release(date){barrier(date).release();await tick();await tick();render();},
    close(){global.fetch=originalFetch;for(const hook of hooks)hook?.cleanup?.();},
  };
}

test('date navigation loads each day independently and ignores older responses arriving last',async()=>{
  const h=harness();try{
    h.render();await tick();
    const tomorrow=helpers.shiftRouteDate(h.today,1);
    h.change(tomorrow);await tick();
    await h.release(tomorrow);
    assert.equal(h.find(n=>n.type==='route-stop-list').props.jobs[0].id,tomorrow);
    assert.equal(h.find(n=>n.type==='route-stop-list').props.disabled,true);
    assert.ok(h.find(n=>n.type==='input'&&n.props.value==='Tech '+tomorrow).props.disabled);
    await h.release(h.today);
    assert.equal(h.find(n=>n.type==='route-stop-list').props.jobs[0].id,tomorrow,'stale response must not replace selected-day jobs');
    assert.ok(h.find(n=>n.type==='input'&&n.props.value==='Tech '+tomorrow));
    assert.equal(h.find(n=>n.props?.['aria-label']==='Route date').props.value,tomorrow);
    for(const table of ['jobs','vehicle_daily_assignments','route_day_orders'])for(const date of [h.today,tomorrow])assert.ok(h.reads.some(r=>r.table===table&&r.date===date));
    assert.equal(h.writes.length,0,'browsing dates must not write assignments or jobs');
    h.find(n=>n.type==='button'&&n.props.children==='Today').props.onClick();h.render();await h.release(h.today);
    assert.equal(h.find(n=>n.props?.['aria-label']==='Route date').props.value,h.today);
    assert.equal(h.find(n=>n.type==='route-stop-list').props.disabled,false);
  }finally{h.close();}
});

test('previous/next days and a picked date work while a date is still loading',async()=>{
  const h=harness();try{
    h.render();
    h.find(n=>n.props?.['aria-label']==='Previous day').props.onClick();h.render();
    assert.equal(h.find(n=>n.props?.['aria-label']==='Route date').props.value,helpers.shiftRouteDate(h.today,-1));
    h.find(n=>n.props?.['aria-label']==='Next day').props.onClick();h.render();
    assert.equal(h.find(n=>n.props?.['aria-label']==='Route date').props.value,h.today);
    h.change('2027-01-04');await h.release('2027-01-04');
    assert.equal(h.find(n=>n.type==='route-stop-list').props.jobs[0].id,'2027-01-04');
    h.change('');assert.equal(h.find(n=>n.props?.['aria-label']==='Route date').props.value,'2027-01-04');
  }finally{h.close();}
});
