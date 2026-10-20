const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, stubs = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const mod = new Module(filename, module); mod.paths = module.paths;
  mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2) + '.ts', stubs) : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  return mod.exports;
}
const helpers = load('lib/route-order.ts');
test('move route stops before and after without changing jobs or duplicating ids', () => {
  const original = ['a', 'b', 'c'];
  assert.deepEqual(helpers.moveRouteStop(original, 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(helpers.moveRouteStop(original, 'a', 'c', true), ['b', 'c', 'a']);
  assert.deepEqual(helpers.moveRouteStop(original, 'a', 'b', false), original);
  assert.equal(helpers.moveRouteStop(original, 'a', 'missing'), original);
  assert.deepEqual(original, ['a', 'b', 'c']);
});
test('saved ordering survives reloading and completing stops, with new jobs appended', () => {
  const jobs = [{id:1,scheduled:'9am'}, {id:2,scheduled:'10am'}, {id:3,scheduled:'11am'}];
  const saved = JSON.parse(JSON.stringify(['3', '1', '2']));
  assert.deepEqual(helpers.applyRouteOrder(jobs,saved).map(j => j.id), [3,1,2]);
  assert.deepEqual(helpers.applyRouteOrder([jobs[0],jobs[2],{id:4}],saved).map(j=>j.id),[3,1,4]);
  assert.deepEqual(jobs.map(j=>j.scheduled),['9am','10am','11am']);
  assert.deepEqual(helpers.applyRouteOrder(jobs,[]),jobs);
});
test('invalid, duplicate and excessive order payloads are rejected', () => {
  const value={date:'2026-09-28',vehicleId:'stepvan',jobIds:['a','b'],revision:0};
  assert.equal(helpers.validRouteChange(value),true);
  for(const change of [{revision:-1},{jobIds:['a','a']},{jobIds:[]},{jobIds:[null]},{vehicleId:''},{date:'yesterday'}, {jobIds:Array(501).fill('a')}]) assert.equal(helpers.validRouteChange({...value,...change}),false);
  assert.equal(helpers.routeDate('2026-09-29T01:00:00Z'),'2026-09-28');
});
function fixture({authenticated=true, role='admin', failure=false, rpcError=null}={}) {
  let saved=null;
  const rpcCalls=[], readDates=[];
  const today=helpers.routeDate(new Date());
  const jobs=[{id:'a',vehicle_id:'stepvan',scheduled:today+'T16:00:00Z'}, {id:'b',vehicle_id:null,scheduled:today+'T17:00:00Z'}, {id:'c',vehicle_id:'service',scheduled:today+'T18:00:00Z'}];
  const admin={async rpc(name,args){rpcCalls.push({name,args});return rpcError?{error:{code:rpcError}}:{data:{order:{vehicle_id:args.p_vehicle_id,job_ids:args.p_job_ids,revision:args.p_revision+1},job:{id:args.p_job_id,scheduled:args.p_scheduled}}}},from(table){
    let op='select', values, filters={};
    const q={select(){return q},eq(k,v){filters[k]=v;return q},maybeSingle(){return q},insert(v){op='insert';values=v;return q},update(v){op='update';values=v;return q},then(resolve,reject){
      let result;
      if(table==='staff_security') result={data:{role}};
      else if(table==='jobs') {assert.equal(op,'select','Jobs must never be mutated by reordering');result={data:jobs};}
      else {
        assert.equal(table,'route_day_orders');
        if(failure) result={error:{code:'unavailable'}};
        else if(op==='select') {readDates.push(filters.route_date);result={data:saved?[saved]:[]};}
        else if(op==='insert') {if(saved) result={error:{code:'23505'}};else {saved={...values};result={data:saved};}}
        else if(saved?.revision!==filters.revision) result={data:null};
        else {saved={...saved,...values};result={data:saved};}
      }
      return Promise.resolve(result).then(resolve,reject);
    }};return q;
  }};
  const api=load('app/api/route-order/route.ts',{'@/lib/supabase/admin':{requireApiUser:async()=>authenticated?{id:'staff'}:null,createAdminClient:()=>admin}});
  const body={date:today,vehicleId:'stepvan',jobIds:['b','a'],revision:0};
  return {jobs, body, rpcCalls, readDates, get saved(){return saved},get:(date=today)=>api.GET(new Request(`http://localhost/api/route-order?date=${date}`)),put:(changes={})=>api.PUT(new Request('http://localhost/api/route-order',{method:'PUT',body:JSON.stringify({...body,...changes})}))};
}
test('staff can read past/future day orders, while non-today writes remain blocked',async()=>{
  const f=fixture();
  for(const date of ['2025-12-31','2027-01-01']) {
    assert.equal((await f.get(date)).status,200);
    assert.equal(f.readDates.at(-1),date);
    assert.equal((await f.put({date})).status,400);
  }
  for(const date of ['', '2026-02-30', '2026-13-01', 'tomorrow', '2026-10-20T12:00']) assert.equal((await f.get(date)).status,400);
  assert.equal(f.readDates.length,2);assert.equal(f.rpcCalls.length,0);
  assert.equal((await fixture({authenticated:false}).get('2027-01-01')).status,403);
});

test('route day navigation is calendar-based across DST, months and leap years',()=>{
  for(const [day,offset,expected] of [['2026-03-08',1,'2026-03-09'],['2026-11-01',-1,'2026-10-31'],['2026-12-31',1,'2027-01-01'],['2028-02-28',1,'2028-02-29'],['2026-03-01',-1,'2026-02-28']]) assert.equal(helpers.shiftRouteDate(day,offset),expected);
  assert.equal(helpers.shiftRouteDate('invalid',1),'invalid');
  assert.equal(helpers.routeDayLabel('2026-10-20'),'Tuesday, October 20, 2026');
});

test('past route views include completed archived stops, but not cancelled archived stops',()=>{
  const rows=[{id:1,scheduled:'2026-10-19T09:00:00',complete:true,archived:true},{id:2,scheduled:'2026-10-19T10:00:00',complete:false,archived:false},{id:3,scheduled:'2026-10-19T11:00:00',complete:false,archived:true},{id:4,scheduled:'2026-10-20T09:00:00',complete:true},{id:5,scheduled:'2026-10-20T10:00:00',complete:false}];
  assert.deepEqual(helpers.routeJobsForDate(rows,'2026-10-19','2026-10-20').map(j=>j.id),[1,2]);
  assert.deepEqual(helpers.routeJobsForDate(rows,'2026-10-20','2026-10-20').map(j=>j.id),[5]);
  assert.deepEqual(helpers.routeJobsForDate(rows,'2026-10-21','2026-10-20'),[]);
});
test('route API persists per-day vehicle ordering and rejects stale concurrent saves',async()=>{
  const f=fixture();
  assert.equal((await f.put()).status,200);
  assert.deepEqual((await (await f.get()).json()).orders[0].job_ids,['b','a']);
  assert.equal((await f.put()).status,409);
  assert.equal((await f.put({revision:1,jobIds:['a','b']})).status,200);
  assert.equal(f.saved.revision,2);
  assert.equal((await f.put({revision:1})).status,409);
});
test('cross-vehicle jobs, missing stops, completed jobs and old dates cannot change route order',async()=>{
  const f=fixture();
  assert.equal((await f.put({jobIds:['a','c']})).status,409);
  assert.equal((await f.put({jobIds:['a']})).status,409);
  assert.equal((await f.put({date:'2001-01-01'})).status,400);
  f.jobs[0].complete=true;
  assert.equal((await f.put()).status,409);
  assert.equal(f.saved,null);
});
test('staff authorization and database failures fail closed',async()=>{
  for(const opts of [{authenticated:false},{role:'customer'}]) {const f=fixture(opts);assert.equal((await f.get()).status,403);assert.equal((await f.put()).status,403);assert.equal(f.saved,null);}
  const f=fixture({failure:true});assert.equal((await f.get()).status,503);assert.equal((await f.put()).status,503);
});
test('drag handles support pointer touch input and accessible arrow alternatives',()=>{
  const List=load('components/RouteStopList.tsx').default;
  const html=renderToStaticMarkup(React.createElement(List,{jobs:[{id:'a',po_number:'123'},{id:'b',po_number:'456'}],disabled:false,onReorder(){},renderJob:j=>React.createElement('span',null,j.po_number)}));
  assert.ok(html.includes('touch-action:none'));
  assert.ok(html.includes('Move job 123 up'));
  assert.ok(html.includes('Move job 456 down'));
  assert.equal((html.match(/disabled=""/g)||[]).length,2);
  const source=fs.readFileSync(path.resolve(__dirname,'../components/RouteStopList.tsx'),'utf8');
  for(const handler of ['onPointerUp','onPointerCancel','onLostPointerCapture','onKeyDown']) assert.ok(source.includes(handler));
  assert.ok(source.includes('root.current?.contains(element)'));
  assert.ok(source.includes('onReorder(next, source, destination.id)'));
});

test('New York wall-clock jobs do not shift with browser or server timezone',()=>{
  const previous=process.env.TZ;
  try { for(const zone of ['UTC','America/New_York','America/Los_Angeles']) {
    process.env.TZ=zone;
    assert.equal(helpers.routeDate('2026-10-13T00:30:00'),'2026-10-13');
    assert.equal(helpers.routeDateTimeInput('2026-10-13 14:30:00.123456'),'2026-10-13T14:30');
    assert.equal(helpers.routeDateTimeInput('2026-07-01T14:30:00Z'),'2026-07-01T10:30');
    assert.equal(helpers.routeDateTimeInput('2026-01-01T14:30:00Z'),'2026-01-01T09:30');
    assert.equal(helpers.routeDateTimeInput('2026-10-13T04:00:00Z'),'2026-10-13T00:00');
  }} finally {if(previous===undefined) delete process.env.TZ;else process.env.TZ=previous;}
  for(const value of ['','2026-02-30T10:00','2026-10-13T25:00','2026-10-13T12:60','2026-10-13T12:00:60','tomorrow']) assert.equal(helpers.validRouteDateTime(value),false,value);
});

function appointmentBody(f) {return {jobIds:['2','1'],appointment:{jobId:'1',expectedScheduled:f.body.date+'T09:00:00',scheduled:f.body.date+'T11:30:00'}};}
test('appointment and route save through a single atomic RPC with original schedule and revision',async()=>{
  const f=fixture(), body=appointmentBody(f);
  const response=await f.put(body);
  assert.equal(response.status,200);
  assert.equal((await response.json()).job.scheduled,body.appointment.scheduled);
  assert.deepEqual(f.rpcCalls,[{name:'reschedule_route_stop',args:{p_date:f.body.date,p_vehicle_id:'stepvan',p_job_ids:['2','1'],p_revision:0,p_job_id:'1',p_expected_scheduled:body.appointment.expectedScheduled,p_scheduled:body.appointment.scheduled}}]);
  assert.equal(f.saved,null,'No separate non-atomic route write');
});
test('malformed appointments, other jobs, past dates and unauthorized users never call RPC',async()=>{
  for(const change of [{jobId:'3'},{jobId:'abc'},{scheduled:'2026-02-30T11:00'},{scheduled:'2001-01-01T11:00'},{expectedScheduled:'2001-01-01T11:00'},{scheduled:'2026-10-13T11:00:00Z'}]) {
    const f=fixture(), body=appointmentBody(f);body.appointment={...body.appointment,...change};
    assert.equal((await f.put(body)).status,400);assert.equal(f.rpcCalls.length,0);
  }
  for(const opts of [{authenticated:false},{role:'customer'}]) {const f=fixture(opts);assert.equal((await f.put(appointmentBody(f))).status,403);assert.equal(f.rpcCalls.length,0);}
});
test('atomic save conflicts and database failures are surfaced without fallback writes',async()=>{
  for(const [rpcError,status] of [['40001',409],['22023',400],['42883',503]]) {
    const f=fixture({rpcError});assert.equal((await f.put(appointmentBody(f))).status,status);assert.equal(f.saved,null);
  }
});
test('appointment dialog cancel does not save and confirmation submits local wall-clock time',()=>{
  let saves=[],cancels=0;
  const reactStub={...React,useRef:()=>({current:null}),useEffect:()=>{},useState:initial=>[initial,()=>{}]};
  const Dialog=load('components/RouteAppointmentDialog.tsx',{react:reactStub}).default;
  const props={customer:'Test job',current:'2026-10-13T09:00',suggested:'2026-10-13T11:30',today:'2026-10-13',saving:false,onCancel:()=>cancels++,onSave:v=>saves.push(v)};
  const tree=Dialog(props),form=tree.props.children;
  const children=React.Children.toArray(form.props.children);
  const buttons=React.Children.toArray(children.at(-1).props.children);
  buttons[0].props.onClick();assert.equal(cancels,1);assert.deepEqual(saves,[]);
  form.props.onSubmit({preventDefault(){}});assert.deepEqual(saves,['2026-10-13T11:30:00']);
  Dialog({...props,saving:true}).props.children.props.onSubmit({preventDefault(){}});assert.equal(saves.length,1);
  const html=renderToStaticMarkup(tree);assert.ok(html.includes('type="datetime-local"'));assert.ok(html.includes('Save time &amp; route'));
});
