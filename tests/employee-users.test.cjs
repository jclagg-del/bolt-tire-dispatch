const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function loader(stubs) {
  const cache = new Map();
  return function load(relative) {
    const file = path.resolve(__dirname,'..',relative);
    if(cache.has(file))return cache.get(file).exports;
    const mod=new Module(file,module);mod.paths=module.paths;cache.set(file,mod);
    mod.require=id=>Object.hasOwn(stubs,id)?stubs[id]:id==='server-only'?{}:id.startsWith('@/')?load(id.slice(2)+'.ts'):require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
    return mod.exports;
  };
}
const id='11111111-1111-4111-8111-111111111111';
function fixture({actor='admin',required=false,denied=false,duplicate=false,saveError=false,sendOk=true,confirmed=false,claim=false,profile=null,authEmail='tech@example.com',banned=false,linkWrong=false}={}) {
  const calls=[], mails=[];
  let users=[profile||{user_id:id,email:'tech@example.com',role:'technician',password_change_required:true,updated_at:'2020-01-01T00:00:00Z'}];
  const user={id,email:authEmail,...(confirmed?{email_confirmed_at:'2026-01-01'}:{}),...(banned?{banned_until:'2999-01-01'}:{})};
  const admin={auth:{admin:{
    createUser:async data=>{calls.push(['create',data]);return duplicate?{error:{code:'email_exists'},data:{user:null}}:{data:{user}}},
    generateLink:async data=>{calls.push(['link',data]);return {data:{user:{...user,id:linkWrong?'wrong':id},properties:{hashed_token:'one-time-secret'}},error:null}},
    getUserById:async()=>({data:{user}}),
  }},from(table){
    const filters={}, op={};
    const chain={select(columns){op.columns=columns;return chain},update(data){op.update=data;calls.push(['update',data]);return chain},eq(k,v){filters[k]=v;return chain},lt(k,v){op.lt=[k,v];return chain},order(){return chain},range:async()=>({data:users}),maybeSingle:async()=>{
      if(filters.user_id==='actor')return {data:denied?null:{role:actor,password_change_required:required}};
      if(op.update)return {data:saveError||claim?null:{user_id:id},error:saveError?{}:null};
      return {data:users[0]};
    }};
    return chain;
  }};
  const load=loader({'@/lib/supabase/admin':{createAdminClient:()=>admin,requireApiUser:async()=>actor===null?null:{id:'actor'}}});
  return {admin,calls,mails,load,service:load('lib/employee-users.ts'),route:load('app/api/admin/users/route.ts'),send:async(url,options)=>{mails.push(JSON.parse(options.body));calls.push(['send']);assert.equal(url,'https://api.resend.com/emails');return{ok:sendOk}}};
}
const body={action:'create',name:'Employee',email:' Tech@Example.com ',role:'technician'};
const request=b=>new Request('https://app.bolttire.com/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
async function withMail(f,run){const oldFetch=global.fetch,oldKey=process.env.RESEND_API_KEY;global.fetch=f.send;process.env.RESEND_API_KEY='test-only';try{await run()}finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey}}

test('only a fully set-up admin may list or create employees; auth metadata is not trusted',async()=>{
  for(const config of [{actor:null},{actor:'office'},{actor:'technician'},{denied:true},{required:true}]){
    const f=fixture(config);
    for(const method of ['GET','POST']){
      const res=await f.route[method](method==='POST'?request(body):new Request('https://app.bolttire.com/api/admin/users'));
      assert.equal(res.status,config.actor===null?401:403);assert.equal(res.headers.get('cache-control'),'no-store');
    }
    assert.equal(f.calls.length,0);
  }
});
test('valid employee invitation saves protected role before emailing and returns no password or token',async()=>{
  for(const role of ['technician','office','admin']){
    const f=fixture();await withMail(f,async()=>{
      const res=await f.route.POST(request({...body,role}));assert.equal(res.status,201);
      assert.deepEqual(f.calls.map(c=>c[0]),['create','update','link','send']);
      const input=f.calls[0][1];assert.equal(input.email,'tech@example.com');assert.equal(input.email_confirm,false);assert.ok(input.password.length>=48);
      assert.deepEqual(input.user_metadata,{full_name:'Employee'});assert.equal(f.calls[1][1].role,role);
      assert.equal(f.calls[1][1].password_change_required,true);
      assert.deepEqual(f.mails[0].to,['tech@example.com']);assert.match(f.mails[0].text,/https:\/\/app\.bolttire\.com\/accept-invite#token_hash=/);
      const response=JSON.stringify(await res.json());assert.doesNotMatch(response,/one-time-secret|base64|access_token|hashed_token/);
      assert.ok(!f.mails[0].text.includes(input.password));
    });
  }
});
test('invalid employee inputs and unknown actions cannot create accounts',async()=>{
  for(const patch of [{name:''},{email:'bad'},{role:'owner'},{role:null},{name:'x'.repeat(121)},{email:'x\n@y.com'}]){
    const f=fixture();assert.equal((await f.route.POST(request({...body,...patch}))).status,400);assert.equal(f.calls.length,0);
  }
  const f=fixture();for(const invalid of [null,[],{action:'delete'}])assert.equal((await f.route.POST(request(invalid))).status,400);
});
test('duplicate accounts are not modified and profile/link failures never email an unusable invitation',async()=>{
  for(const config of [{duplicate:true},{saveError:true},{linkWrong:true}]){
    const f=fixture(config);await withMail(f,async()=>{
      const response=await f.route.POST(request(body));assert.ok(response.status>=400);assert.equal(f.mails.length,0);
      if(config.duplicate)assert.deepEqual(f.calls.map(c=>c[0]),['create']);
    });
  }
});
test('mail failures are explicit; lack of email configuration cannot create an account',async()=>{
  const f=fixture({sendOk:false});await withMail(f,async()=>{
    const res=await f.route.POST(request(body));assert.equal(res.status,502);assert.match((await res.json()).error,/account exists/);
  });
  const key=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;
  try{const f=fixture();assert.equal((await f.route.POST(request(body))).status,503);assert.equal(f.calls.length,0)}finally{if(key!==undefined)process.env.RESEND_API_KEY=key}
});
test('resend targets saved email, preserves role and chooses correct invitation/recovery token type',async()=>{
  for(const confirmed of [false,true]){
    const f=fixture({confirmed});await withMail(f,async()=>{
      const res=await f.route.POST(request({action:'resend',user_id:id,email:'attacker@example.com',role:'admin'}));assert.equal(res.status,200);
      assert.deepEqual(f.calls.map(c=>c[0]),['update','link','send']);assert.equal(f.calls[1][1].type,confirmed?'recovery':'invite');
      assert.equal('role' in f.calls[0][1],false);assert.deepEqual(f.mails[0].to,['tech@example.com']);
    });
  }
});
test('completed, disabled, mismatched and concurrently claimed accounts cannot get setup resends',async()=>{
  for(const config of [{profile:{user_id:id,email:'tech@example.com',password_change_required:false}},{authEmail:'other@example.com'},{banned:true},{claim:true}]){
    const f=fixture(config);await withMail(f,async()=>{
      assert.ok((await f.route.POST(request({action:'resend',user_id:id}))).status>=400);assert.equal(f.mails.length,0);assert.ok(!f.calls.some(c=>c[0]==='link'));
    });
  }
});
test('user list is paginated, contains only staff fields and marks the current admin',async()=>{
  const f=fixture(),res=await f.route.GET(new Request('https://app.bolttire.com/api/admin/users'));
  assert.equal(res.status,200);assert.equal((await res.json()).currentUserId,'actor');
  assert.equal((await f.route.GET(new Request('https://app.bolttire.com/api/admin/users?page=NaN'))).status,400);
});
test('settings are admin-only; invitation token stays out of URL queries and requires recipient interaction',()=>{
  const settings=fs.readFileSync(path.resolve(__dirname,'../app/settings/page.tsx'),'utf8');
  assert.match(settings,/section === "users" && currentRole === "admin"/);
  const invite=fs.readFileSync(path.resolve(__dirname,'../app/accept-invite/page.tsx'),'utf8');
  assert.match(invite,/window\.location\.hash/);assert.match(invite,/history\.replaceState/);assert.match(invite,/onClick=\{accept\}/);assert.match(invite,/location\.replace\("\/change-password"\)/);
  assert.match(fs.readFileSync(path.resolve(__dirname,'../components/AuthGate.tsx'),'utf8'),/"\/accept-invite"/);
});
