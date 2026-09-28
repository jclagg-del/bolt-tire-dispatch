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
function fixture({authenticated=true, role='admin', failure=false}={}) {
  let saved=null;
  const today=helpers.routeDate(new Date());
  const jobs=[{id:'a',vehicle_id:'stepvan',scheduled:today+'T16:00:00Z'}, {id:'b',vehicle_id:null,scheduled:today+'T17:00:00Z'}, {id:'c',vehicle_id:'service',scheduled:today+'T18:00:00Z'}];
  const admin={from(table){
    let op='select', values, filters={};
    const q={select(){return q},eq(k,v){filters[k]=v;return q},maybeSingle(){return q},insert(v){op='insert';values=v;return q},update(v){op='update';values=v;return q},then(resolve,reject){
      let result;
      if(table==='staff_security') result={data:{role}};
      else if(table==='jobs') {assert.equal(op,'select','Jobs must never be mutated by reordering');result={data:jobs};}
      else {
        assert.equal(table,'route_day_orders');
        if(failure) result={error:{code:'unavailable'}};
        else if(op==='select') result={data:saved?[saved]:[]};
        else if(op==='insert') {if(saved) result={error:{code:'23505'}};else {saved={...values};result={data:saved};}}
        else if(saved?.revision!==filters.revision) result={data:null};
        else {saved={...saved,...values};result={data:saved};}
      }
      return Promise.resolve(result).then(resolve,reject);
    }};return q;
  }};
  const api=load('app/api/route-order/route.ts',{'@/lib/supabase/admin':{requireApiUser:async()=>authenticated?{id:'staff'}:null,createAdminClient:()=>admin}});
  const body={date:today,vehicleId:'stepvan',jobIds:['b','a'],revision:0};
  return {jobs, body, get saved(){return saved},get:()=>api.GET(new Request(`http://localhost/api/route-order?date=${today}`)),put:(changes={})=>api.PUT(new Request('http://localhost/api/route-order',{method:'PUT',body:JSON.stringify({...body,...changes})}))};
}
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
});
