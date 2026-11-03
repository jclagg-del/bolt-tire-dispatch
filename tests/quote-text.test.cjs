const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function loader(stubs = {}) {
 const cache = new Map();
 return function load(file) {
  file = path.resolve(__dirname, '..', file);
  if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
  mod.require = id => Object.hasOwn(stubs,id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2)) : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);
  return mod.exports;
 };
}
const id='11111111-1111-4111-8111-111111111111';
const oldAttempt=()=>({quote_id:id,attempt_id:'old',status:'accepted',requested_at:'2020-01-01T00:00:00Z'});
function fixture(t) {
 const savedEnv={...process.env}, savedFetch=global.fetch;
 process.env.QUO_API_KEY='test-key';process.env.QUO_PHONE_NUMBER_ID='PNtest';process.env.NEXT_PUBLIC_APP_URL='https://app.bolttire.com';
 t.after(()=>{global.fetch=savedFetch;for(const key of ['QUO_API_KEY','QUO_PHONE_NUMBER_ID','NEXT_PUBLIC_APP_URL']){if(savedEnv[key]===undefined)delete process.env[key];else process.env[key]=savedEnv[key];}});
 const state={quote:{id,quote_number:123,customer:'Test company',contact_name:'Pat Example',phone:'8455550123',public_token:'test-token',updated_at:'2026-11-03'},delivery:null,role:'office',password_change_required:false,user:{id:'test-staff'},calls:[],writes:[],failRead:false,failClaim:false,failRecord:false};
 const admin={from(table){let action='select',value,filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},update(v){action='update';value=v;return q},insert(v){action='insert';value=v;return q},async maybeSingle(){
  if(table==='staff_security')return {data:{role:state.role,password_change_required:state.password_change_required}};
  if(table==='quotes'){assert.equal(action,'select');return {data:state.quote};}
  assert.equal(table,'quote_text_deliveries');
  if(action==='select')return state.failRead?{error:{message:'offline'}}:{data:state.delivery?{attempt_id:state.delivery.attempt_id,status:state.delivery.status,requested_at:state.delivery.requested_at}:null};
  state.writes.push({action,value});
  if((value.status==='pending'&&state.failClaim)||(value.status!=='pending'&&state.failRecord))return {error:{message:'write failed'}};
  if(action==='insert'){if(state.delivery)return {error:{code:'23505'}};state.delivery={...value};}
  else{if(!state.delivery||filters.some(([k,v])=>state.delivery[k]!==v))return {data:null};state.delivery={...state.delivery,...value};}
  return {data:{attempt_id:state.delivery.attempt_id}};
 }};return q;}};
 global.fetch=async(url,options={})=>{state.calls.push({url,options});if(url.endsWith('/phone-numbers'))return Response.json({data:[{id:'PNtest',number:'+18455550100',formattedNumber:'(845) 555-0100'}]});if(state.provider)return state.provider(url,options);return Response.json({data:{id:'ACtest',status:'queued'}},{status:202});};
 const load=loader({'@/lib/supabase/admin':{createAdminClient:()=>admin,requireApiUser:async()=>state.user}});
 const lib=load('lib/quote-text');const route=load('app/api/quotes/text/route');
 const preview=()=>lib.quoteTextPreview(admin,id);
 const send=async(p,resend=false)=>lib.sendQuoteText(admin,'test-staff',{quoteId:id,fingerprint:p.fingerprint,resend});
 const posts=()=>state.calls.filter(c=>c.options.method==='POST');
 return {state,admin,lib,route,preview,send,posts};
}
test('preview verifies business sender and saved recipient, with no send or database mutation',async t=>{
 const f=fixture(t),p=await f.preview();assert.equal(p.recipient,'+18455550123');assert.equal(p.sender,'(845) 555-0100');assert.match(p.content,/Hi Pat, your Bolt Tire quote #123/);assert.match(p.content,/https:\/\/app.bolttire.com\/q\/test-token$/);assert.equal(f.posts().length,0);assert.equal(f.state.writes.length,0);assert.ok(!JSON.stringify(p).includes('test-key'));
});
test('send uses server-generated message and records acceptance without changing quote/payment status',async t=>{
 const f=fixture(t),p=await f.preview(),r=await f.send(p);assert.equal(r.accepted,true);assert.equal(f.posts().length,1);assert.deepEqual(JSON.parse(f.posts()[0].options.body),{content:p.content,from:'PNtest',to:[p.recipient]});assert.equal(f.state.delivery.status,'accepted');assert.equal(f.state.delivery.provider_message_id,'ACtest');assert.equal(f.state.delivery.requested_by,'test-staff');assert.deepEqual(f.state.writes.map(w=>w.value.status),['pending','accepted']);
});
test('parallel first sends make only one provider request; replay is rejected',async t=>{
 const f=fixture(t),p=await f.preview();const results=await Promise.allSettled([f.send(p),f.send(p)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.posts().length,1);await assert.rejects(f.send(p),/changed/);assert.equal(f.posts().length,1);
});
test('stale phone, contact, sender or quote preview cannot send',async t=>{
 const f=fixture(t),p=await f.preview();f.state.quote.phone='2125550123';await assert.rejects(f.send(p),/changed/);assert.equal(f.posts().length,0);assert.equal(f.state.writes.length,0);
});
test('existing accepted messages require explicit resend and atomic claim',async t=>{
 const f=fixture(t);f.state.delivery=oldAttempt();const p=await f.preview();await assert.rejects(f.send(p),/already submitted/);const results=await Promise.allSettled([f.send(p,true),f.send(p,true)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.posts().length,1);
});
test('accepted cooldown and pending/unknown attempts block all sends',async t=>{
 const f=fixture(t);for(const status of ['pending','unknown','accepted','failed']){f.state.delivery={...oldAttempt(),status,requested_at:new Date().toISOString()};const p=await f.preview();assert.ok(p.blockedReason);await assert.rejects(f.send(p,true));}assert.equal(f.posts().length,0);
});
test('network ambiguity and 5xx never automatically retry',async t=>{
 const f=fixture(t);for(const provider of [async()=>{throw Error('network')},async()=>Response.json({error:'unavailable'},{status:500}),async()=>Response.json({data:{}},{status:202})]){
  f.state.delivery=null;f.state.provider=provider;await assert.rejects(f.send(await f.preview()));assert.equal(f.state.delivery.status,'unknown');await assert.rejects(f.send(await f.preview()),/pending|confirmed/);
 }assert.equal(f.posts().length,3);
});
test('definite provider rejection is saved and only a fresh explicit attempt can retry',async t=>{
 const f=fixture(t);f.state.provider=async()=>Response.json({error:'credits'},{status:402});const p=await f.preview();await assert.rejects(f.send(p),/credits/);assert.equal(f.state.delivery.status,'failed');await assert.rejects(f.send(p),/changed/);f.state.delivery.requested_at='2020-01-01T00:00:00Z';f.state.provider=null;await f.send(await f.preview());assert.equal(f.posts().length,2);
});
test('guard database failures prevent sending; result-write failure retains pending protection',async t=>{
 const f=fixture(t);f.state.failRead=true;await assert.rejects(f.preview());f.state.failRead=false;f.state.failClaim=true;await assert.rejects(f.send(await f.preview()));assert.equal(f.posts().length,0);f.state.failClaim=false;f.state.failRecord=true;const r=await f.send(await f.preview());assert.equal(r.accepted,true);assert.ok(r.warning);assert.equal(f.state.delivery.status,'pending');await assert.rejects(f.send(await f.preview()));assert.equal(f.posts().length,1);
});
test('missing configuration, invalid recipient and wrong sender fail closed',async t=>{
 const f=fixture(t);delete process.env.QUO_API_KEY;await assert.rejects(f.preview(),/not connected/);process.env.QUO_API_KEY='test-key';process.env.QUO_PHONE_NUMBER_ID='PNwrong';await assert.rejects(f.preview(),/not available/);process.env.QUO_PHONE_NUMBER_ID='PNtest';f.state.quote.phone='8455550123 ext 2';await assert.rejects(f.preview(),/valid customer phone/);assert.equal(f.posts().length,0);
});
test('route requires authenticated office/admin with completed password setup',async t=>{
 const f=fixture(t);const req=()=>new Request(`https://app.bolttire.com/api/quotes/text?quoteId=${id}`);f.state.user=null;assert.equal((await f.route.GET(req())).status,401);f.state.user={id:'staff'};for(const role of ['technician',null,'customer']){f.state.role=role;assert.equal((await f.route.GET(req())).status,403);}f.state.role='office';f.state.password_change_required=true;assert.equal((await f.route.GET(req())).status,403);f.state.password_change_required=false;const r=await f.route.GET(req());assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(f.posts().length,0);
});
test('POST rejects malformed/stale requests and ignores supplied recipient, message and sender',async t=>{
 const f=fixture(t);const request=body=>new Request('https://app.bolttire.com/api/quotes/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await f.route.POST(request({quoteId:id}))).status,400);assert.equal((await f.route.POST(request({quoteId:'bad',fingerprint:'a'.repeat(64)}))).status,400);const p=await f.preview();const r=await f.route.POST(request({quoteId:id,fingerprint:p.fingerprint,recipient:'+12125550123',content:'injected',from:'PNother'}));assert.equal(r.status,200);assert.equal(JSON.parse(f.posts()[0].options.body).content,p.content);assert.deepEqual(JSON.parse(f.posts()[0].options.body).to,[p.recipient]);
});
test('server-only delivery table denies public access and keys duplicate protection by quote',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261103221651_quote_text_delivery_guard.sql'),'utf8');assert.match(sql,/quote_id uuid primary key/);assert.match(sql,/enable row level security/);assert.match(sql,/revoke all .* from public, anon, authenticated/);assert.match(sql,/grant select, insert, update .* to service_role/);
});
test('dialog loads GET only, requires a separate Send, and locks rapid double clicks',async t=>{
 const React=require('react');let cursor=0,refCursor=0;const values=[],refs=[],effects=[],messages=[],calls=[];const oldFetch=global.fetch;t.after(()=>{global.fetch=oldFetch});
 const preview={quoteId:id,quoteNumber:123,customer:'Pat',recipient:'+18455550123',sender:'8455550100',content:'Test preview',fingerprint:'a'.repeat(64),previous:null,blockedReason:null};
 global.fetch=async(url,options)=>{calls.push(options);return Response.json(options.method==='GET'?preview:{accepted:true,recipient:preview.recipient});};
 const react={...React,useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=v}]},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial})},useEffect(fn){if(!effects.length)effects.push(fn)}};
 const Dialog=loader({react,'@/lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'staff-token'}}})}}}})('components/TextQuoteButton').QuoteTextDialog;
 function render(){cursor=0;refCursor=0;return Dialog({quoteId:id,onClose(){},onMessage:m=>messages.push(m)});}
 function buttons(node){if(!node||typeof node!=='object')return[];return[node.type==='button'?node:null,...[node.props?.children].flat(Infinity).flatMap(buttons)].filter(Boolean);}
 render();effects[0]();await new Promise(setImmediate);assert.deepEqual(calls.map(c=>c.method),['GET']);const send=buttons(render()).find(b=>b.props.children==='Send text');assert.equal(send.props.disabled,false);await Promise.all([send.props.onClick(),send.props.onClick()]);assert.deepEqual(calls.map(c=>c.method),['GET','POST']);assert.equal(messages.length,1);assert.match(messages[0],/submitted to Quo/);assert.ok(!buttons(render()).some(b=>b.props.children==='Send text'));
});
