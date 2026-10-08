/* Isolated actual-app QA. Credentials live only in memory. No live payments,
 * emails, supplier calls or production Supabase access are permitted. */
const http=require('node:http'), crypto=require('node:crypto');
const PROJECT='duzyyolyevpuobdtvxve', setupOrigin='http://127.0.0.1:43872', appOrigin='http://localhost:43873';
const nonce=crypto.randomBytes(24).toString('hex'), webhookSecret=crypto.randomBytes(32).toString('hex');
const originalFetch=global.fetch;
let credentials, app, appServer, admin, started=false;
const mail=new Map();
const page=`<!doctype html><title>Bolt checkout QA</title><style>body{font:18px system-ui;max-width:760px;margin:40px auto}label{display:block;margin-top:20px}input{width:95%;padding:12px}button{padding:14px;margin:20px 0}pre{white-space:pre-wrap}</style><h1>Bolt checkout — isolated test environment</h1><p>Only the free QA database and Stripe TEST mode. Emails are captured locally, never sent.</p><form id="setup"><label>Supabase QA server key<input id="server" type="password" autocomplete="off" required></label><label>Supabase QA public key<input id="public" type="password" autocomplete="off" required></label><label>Stripe restricted TEST key<input id="stripe" type="password" autocomplete="off" required></label><label>Stripe publishable TEST key<input id="stripePublic" type="password" autocomplete="off" required></label><button>Start isolated checkout</button></form><button id="reconcile" hidden>Reconcile test payments</button><pre id="status"></pre><script>const nonce=${JSON.stringify(nonce)};async function post(url,data){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-QA-Nonce':nonce},body:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw Error(j.error);return j;}document.querySelector('#setup').onsubmit=async e=>{e.preventDefault();try{const values=Object.fromEntries(['server','public','stripe','stripePublic'].map(k=>[k,document.getElementById(k).value]));document.querySelector('#status').textContent='Starting test checkout…';const result=await post('/start',values);document.querySelectorAll('input').forEach(i=>i.value='');document.querySelector('#setup').hidden=true;document.querySelector('#reconcile').hidden=false;document.querySelector('#status').textContent=JSON.stringify(result,null,2);}catch(e){document.querySelector('#status').textContent=e.message;}};document.querySelector('#reconcile').onclick=async()=>{try{document.querySelector('#status').textContent=JSON.stringify(await post('/reconcile',{}),null,2);}catch(e){document.querySelector('#status').textContent=e.message;}};</script>`;
function reject(message){throw Error(message);}
function verifyJwt(key,role){try{const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));return payload.ref===PROJECT&&payload.role===role;}catch{return false;}}
async function guardedFetch(input,init={}){
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 const headers=new Headers(init.headers||input?.headers);
 if(url.hostname==='api.resend.com'&&url.pathname==='/emails'){
  const body=JSON.parse(init.body);const idempotency=headers.get('Idempotency-Key');
  if(!idempotency||!body.subject||!body.html||!body.text)reject('Invalid test email');
  if(!mail.has(idempotency))mail.set(idempotency,{id:`qa_mail_${mail.size+1}`,subject:body.subject,text:body.text,html:body.html,to:body.to});
  return Response.json({id:mail.get(idempotency).id});
 }
 if(url.hostname==='api.stripe.com'){
  if(headers.get('Authorization')!==`Bearer ${credentials.stripe}`||!credentials.stripe.startsWith('rk_test_'))reject('Non-test Stripe call blocked');
 }else if(url.hostname!==`${PROJECT}.supabase.co`&&!(url.hostname==='localhost'&&url.port==='43873')){
  reject(`QA network blocked: ${url.hostname}`);
 }
 return originalFetch(input,init);
}
async function start(data){
 if(started)reject('QA already started');
 if(!/^rk_test_[A-Za-z0-9]+$/.test(data.stripe)||!/^pk_test_[A-Za-z0-9]+$/.test(data.stripePublic))reject('Restricted TEST Stripe keys only');
 if(!verifyJwt(data.server,'service_role')||!verifyJwt(data.public,'anon'))reject('Only legacy keys belonging to the isolated QA project are accepted');
 credentials=data;
 const safeEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:`https://${PROJECT}.supabase.co`,NEXT_PUBLIC_SUPABASE_ANON_KEY:data.public,SUPABASE_SERVICE_ROLE_KEY:data.server,STRIPE_SECRET_KEY:data.stripe,STRIPE_PUBLISHABLE_KEY:data.stripePublic,NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:data.stripePublic,STRIPE_WEBHOOK_SECRET:webhookSecret,RESEND_API_KEY:'qa-capture-not-a-real-key',NEXT_PUBLIC_PAYMENT_METHOD_PRICING_ENABLED:'true',NEXT_PUBLIC_SITE_URL:appOrigin};
 for(const name of Object.keys(process.env))if(!(name in safeEnv))delete process.env[name];
 Object.assign(process.env,safeEnv);global.fetch=guardedFetch;
 const {createClient}=require('@supabase/supabase-js');admin=createClient(safeEnv.NEXT_PUBLIC_SUPABASE_URL,data.server,{auth:{persistSession:false,autoRefreshToken:false}});
 const check=await admin.from('quote_payment_attempts').select('id').limit(1);if(check.error)reject(check.error.message);
 app=require('next')({dev:true,hostname:'localhost',port:43873});await app.prepare();
 const handle=app.getRequestHandler();appServer=http.createServer((req,res)=>{if(req.headers.host!=='localhost:43873'){res.writeHead(403);return res.end();}handle(req,res);});
 await new Promise(resolve=>appServer.listen(43873,'127.0.0.1',resolve));started=true;
 return {ready:true,appOrigin,project:PROJECT,emailDelivery:'captured locally only'};
}
async function reconcile(){
 if(!started)reject('Start QA first');
 const {data,error}=await admin.from('quote_payment_attempts').select('id,stripe_payment_intent_id').not('stripe_payment_intent_id','is',null);if(error)reject(error.message);
 const results=[];
 for(const attempt of data){
  const response=await guardedFetch(`https://api.stripe.com/v1/payment_intents/${attempt.stripe_payment_intent_id}`,{headers:{Authorization:`Bearer ${credentials.stripe}`}});const intent=await response.json();if(!response.ok||intent.livemode!==false)reject('Test intent check failed');
  const type=intent.status==='requires_capture'?'payment_intent.amount_capturable_updated':intent.status==='succeeded'?'payment_intent.succeeded':intent.status==='requires_payment_method'?'payment_intent.payment_failed':intent.status==='requires_action'?'payment_intent.requires_action':'payment_intent.processing';
  const payload=JSON.stringify({id:`evt_qa_${attempt.id}`,type,data:{object:intent}}),t=Math.floor(Date.now()/1000),sig=crypto.createHmac('sha256',webhookSecret).update(`${t}.${payload}`).digest('hex');
  const sent=await guardedFetch(`${appOrigin}/api/stripe/webhook`,{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':`t=${t},v1=${sig}`},body:payload});
  results.push({attempt:attempt.id,intent:intent.id,stripeStatus:intent.status,webhookStatus:sent.status,result:await sent.json()});
 }
 const quotes=await admin.from('quotes').select('quote_number,payment_status,amount_paid,converted_job_id');
 return {results,quotes:quotes.data,emailCount:mail.size,emails:[...mail.values()].map(({subject,to})=>({subject,to}))};
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');
 try{
  if(req.headers.host!=='127.0.0.1:43872')reject('Invalid host');
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(page);}
  if(req.method!=='POST'||req.headers.origin!==setupOrigin||req.headers['x-qa-nonce']!==nonce)reject('Invalid request');
  let body='';for await(const chunk of req){body+=chunk;if(body.length>15000)reject('Request too large');}
  const data=JSON.parse(body);res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(req.url==='/start'?await start(data):req.url==='/reconcile'?await reconcile():reject('Unknown action')));
 }catch(error){res.writeHead(400);res.end(JSON.stringify({error:String(error.message).replace(/(?:rk|sk|pk)_(?:test|live)_[A-Za-z0-9]+/g,'[redacted]')}));}
});
server.listen(43872,'127.0.0.1',()=>console.log(`Isolated QA setup: ${setupOrigin}`));
process.on('SIGINT',async()=>{credentials=null;for(const k of ['STRIPE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','STRIPE_WEBHOOK_SECRET'])delete process.env[k];appServer?.close();await app?.close();server.close();process.exit(0);});
