const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {createHmac}=require('node:crypto');
function loader(stubs={}){stubs={'@/lib/customer-payment-confirmation':{sendCustomerPaymentConfirmation:async()=>{}},...stubs};const cache=new Map();return function load(file){file=path.resolve(__dirname,'..',file);if(!path.extname(file))file+='.ts';if(cache.has(file))return cache.get(file).exports;const m=new Module(file,module);cache.set(file,m);m.paths=module.paths;m.require=id=>id==='server-only'?{}:Object.hasOwn(stubs,id)?stubs[id]:id.startsWith('@/')?load(id.slice(2)):id.startsWith('.')?load(path.resolve(path.dirname(file),id)):require(id);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;};}
const option={id:'option',brand:'Goodyear',model:'Example',price_per_tire:90,supplier:'USAF',supplier_product_id:'1234'};
const quote={id:'quote',quote_number:123,customer:'Example Person',contact_name:'Example Person',phone:'2015550123',email:'example@example.com',vehicle:'2020 Ford Transit',address:'123 Example St',quantity:4,tire_size:'275/65R18',installation_cost:100,service_call_fee:20,disposal_fee:20,ny_state_tire_fee:10,tax_exempt:true,amount_paid:510,stripe_sales_tax_amount:0,paid_at:'2026-09-28T12:00:00Z',discount_code_label:'EXAMPLE',discount_organization:'HPR',discount_amount:40,checkout_service:'tires_only',purchase_source:'website',selected_option_id:option.id,quote_options:[option]};
// Small in-memory database exercises route behavior, including unique constraints.
function database(seed={}){
 const tables={quotes:[structuredClone(quote)],customer_orders:[],jobs:[],supplier_orders:[],business_settings:[],...structuredClone(seed)};const writes=[];
 const api={tables,writes,failTable:null,from(table){let op='select',value,filters=[];const q={
 select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},or(){return q},order(){return q},limit(){return q},
 insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},delete(){op='delete';return q},
 single:()=>run(true),maybeSingle:()=>run(true),then:(yes,no)=>run(false).then(yes,no)};
 async function run(single){if(api.failTable===table)return {data:null,error:{message:'Database unavailable'}};const rows=tables[table]||(tables[table]=[]);let selected=rows.filter(r=>filters.every(f=>f(r)));
 if(op==='insert'){if(value.source_quote_id&&rows.some(r=>r.source_quote_id===value.source_quote_id))return {data:null,error:{code:'23505',message:'duplicate'}};const row={id:rows.length+1,...value};if(table==='quotes')row.public_token='public-token';rows.push(row);selected=[row];writes.push({table,op,value:structuredClone(value)});}
 if(op==='update'){selected.forEach(r=>Object.assign(r,value));writes.push({table,op,value:structuredClone(value)});}
 return {data:single?selected[0]||null:selected,error:null};}
 return q;}};return api;
}
test('paid order snapshot keeps payment separate from supplier fulfillment and preserves staggered lines',()=>{
 const {paidWebsiteOrder,websitePaymentFields}=loader()('lib/paid-website-order');
 const order=paidWebsiteOrder(quote,option);
 assert.equal(order.payment_status,'paid');assert.equal(order.tires_ordered,false);assert.equal(order.order_status,'new');assert.equal(order.amount_paid,510);assert.equal(order.goodyear_order,false);assert.equal(order.service_method,null);assert.equal(order.requested_date,null);
 const fields=websitePaymentFields(quote,option);assert.equal(fields.tax_exempt,true);assert.equal(fields.sales_tax_amount,0);assert.equal(fields.subtotal,510);assert.equal(fields.price_tires,90);assert.equal(fields.installation_cost,120);
 const staggered={...quote,quantity:2,rear_quantity:2,rear_tire_size:'285/65R18'};const rear={...option,rear_model:'Rear Example',rear_price_per_tire:110,rear_supplier_product_id:'5678'};
 const mixed=paidWebsiteOrder(staggered,rear);assert.equal(mixed.qty,4);assert.equal(mixed.tire_items.length,2);assert.equal(mixed.tire_product_number,null);assert.match(mixed.notes,/5678/);assert.equal(websitePaymentFields(staggered,rear).price_tires,100);
 assert.equal(paidWebsiteOrder({...quote,discount_organization:'KSS'},option).customer,'Kingdom Support Services');
});
function signedEvent(paid=true,type='checkout.session.completed'){const body=JSON.stringify({type,data:{object:{id:'cs_test_example',payment_status:paid?'paid':'unpaid',metadata:{quote_id:'quote',option_id:'option'},amount_total:51000,total_details:{amount_tax:0},payment_intent:'pi_example'}}});const t=Math.floor(Date.now()/1000);return new Request('https://example.test/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${createHmac('sha256','unit-test-secret').update(`${t}.${body}`).digest('hex')}`},body});}
test('signed paid webhook creates one visible paid order, not a job or supplier purchase, even on retries',async()=>{
 const previous=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='unit-test-secret';const db=database();let notifications=0;
 const route=loader({'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/payment-notifications':{sendPaymentNotification:async(sessionId,paidQuote)=>{notifications++;assert.equal(paidQuote.payment_status,'paid');assert.equal(sessionId,'cs_test_example');}}})('app/api/stripe/webhook/route');
 try{assert.equal((await route.POST(signedEvent(false))).status,200);assert.equal(db.writes.length,0);
 assert.equal((await route.POST(new Request('https://example.test',{method:'POST',body:'{}'}))).status,400);
 for(let i=0;i<3;i++)assert.equal((await route.POST(signedEvent())).status,200);
 assert.equal(db.tables.customer_orders.length,1);assert.equal(db.tables.customer_orders[0].tires_ordered,false);assert.equal(db.tables.jobs.length,0);assert.equal(db.tables.supplier_orders.length,0);assert.equal(notifications,1);
 db.failTable='quotes';assert.equal((await route.POST(signedEvent())).status,500);
 }finally{if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;}
});
test('regular website purchase emails after job creation; failed email retries without duplicate jobs',async()=>{
 const previous=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='unit-test-secret';
 const db=database({quotes:[{...quote,discount_organization:null}]});let calls=0;
 const route=loader({'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/payment-notifications':{sendPaymentNotification:async(id,q)=>{calls++;assert.equal(id,'cs_test_example');assert.equal(q.amount_paid,510);assert.equal(db.tables.jobs.length,1);if(calls===1)throw new Error('Email temporarily unavailable');}}})('app/api/stripe/webhook/route');
 try {
  assert.equal((await route.POST(signedEvent())).status,500);
  assert.equal(db.tables.quotes[0].payment_status,'paid');assert.ok(db.tables.quotes[0].converted_job_id);
  assert.equal((await route.POST(signedEvent(true,'checkout.session.async_payment_succeeded'))).status,200);
  assert.equal(calls,2);assert.equal(db.tables.jobs.length,1);assert.equal(db.tables.customer_orders.length,0);assert.equal(db.tables.supplier_orders.length,0);
 }finally{if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;}
});
test('paid staff quote sends a payment alert without automatically creating a job',async()=>{
 const previous=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='unit-test-secret';
 const db=database({quotes:[{...quote,purchase_source:'staff',discount_organization:null}]});let calls=0;
 const route=loader({'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/payment-notifications':{sendPaymentNotification:async()=>{calls++;}}})('app/api/stripe/webhook/route');
 try{
  assert.equal((await route.POST(signedEvent(false))).status,200);assert.equal(calls,0);
  assert.equal((await route.POST(signedEvent())).status,200);assert.equal(calls,1);
  assert.equal(db.tables.quotes[0].payment_status,'paid');assert.equal(db.tables.jobs.length,0);assert.equal(db.tables.customer_orders.length,0);
 }finally{if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;}
});
test('all paid checkout paths attempt customer confirmation, including office-already-notified orders',async()=>{
 const previous=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='unit-test-secret';
 try {for(const variant of ['staff','website','organization','converted','organization-notified']) {
  const row={...quote,purchase_source:variant==='staff'?'staff':'website',discount_organization:variant.startsWith('organization')?'HPR':null,...(variant==='converted'?{converted_job_id:55}:{})};
  const db=database({quotes:[row],customer_orders:variant==='organization-notified'?[{id:10,source_quote_id:quote.id,payment_notification_sent_at:'2026-10-01'}]:[]});
  let customerCalls=0;
  const route=loader({'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/payment-notifications':{sendPaymentNotification:async()=>{}},'@/lib/customer-payment-confirmation':{sendCustomerPaymentConfirmation:async(id,q,o)=>{customerCalls++;assert.equal(id,'cs_test_example');assert.equal(q.payment_status,'paid');assert.equal(o.id,'option');}}})('app/api/stripe/webhook/route');
  assert.equal((await route.POST(signedEvent(false))).status,200);assert.equal(customerCalls,0);
  assert.equal((await route.POST(signedEvent())).status,200,variant);assert.equal(customerCalls,1,variant);
 }} finally {if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;}
});
test('customer mail failure retries without duplicating jobs; office failure still waits for customer attempt',async()=>{
 const previous=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='unit-test-secret';
 try {for(const failing of ['customer','office']) {
  const db=database({quotes:[{...quote,discount_organization:null}]});let customerCalls=0,officeCalls=0;
  const route=loader({'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/payment-notifications':{sendPaymentNotification:async()=>{officeCalls++;if(failing==='office'&&officeCalls===1)throw Error('Office mail failed');}},'@/lib/customer-payment-confirmation':{sendCustomerPaymentConfirmation:async()=>{await new Promise(resolve=>setImmediate(resolve));customerCalls++;if(failing==='customer'&&customerCalls===1)throw Error('Customer mail failed');}}})('app/api/stripe/webhook/route');
  assert.equal((await route.POST(signedEvent())).status,500);assert.equal(customerCalls,1);assert.equal(officeCalls,1);
  assert.equal((await route.POST(signedEvent())).status,200);assert.equal(customerCalls,2);
  assert.equal(db.tables.jobs.length,1);assert.equal(db.tables.supplier_orders.length,0);
 }} finally {if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;}
});
test('previously notified organization purchase does not email again after job conversion',async()=>{
 const previous=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='unit-test-secret';
 const db=database({quotes:[{...quote,converted_job_id:5}],customer_orders:[{id:1,source_quote_id:'quote',payment_notification_sent_at:'2026-09-28T12:00:00Z'}]});
 const route=loader({'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/payment-notifications':{sendPaymentNotification:async()=>{assert.fail('Already notified');}}})('app/api/stripe/webhook/route');
 try{assert.equal((await route.POST(signedEvent())).status,200);assert.equal(db.tables.customer_orders.length,1);}
 finally{if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;}
});
test('approval creates one paid job with original financials; identical unrelated PO does not capture it',async()=>{
 const {paidWebsiteOrder}=loader()('lib/paid-website-order');const order={id:9,...paidWebsiteOrder(quote,option)};
 const db=database({quotes:[{...quote,payment_status:'paid'}],customer_orders:[order],jobs:[{id:100,customer:'HPR',po_number:'WEB-123'}]});
 const route=loader({'@/lib/supabase/admin':{createAdminClient:()=>db,requireApiUser:async()=>({id:'staff'})}})('app/api/orders/approve/route');
 const req=(extra={})=>new Request('https://example.test',{method:'POST',body:JSON.stringify({orderId:9,serviceMethod:'delivery',...extra})});
 assert.equal((await route.POST(req({serviceMethod:null}))).status,400);
 const response=await route.POST(req({scheduledDate:'2026-10-03',scheduledTime:'14:45'}));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const job=db.tables.jobs.find(j=>j.source_quote_id==='quote');assert.ok(job);assert.equal(job.payment_status,'paid');assert.equal(job.job_total,510);assert.equal(job.tax_exempt,true);assert.equal(job.price_tires,90);assert.equal(job.tires_ordered,false);assert.equal(job.tire_supplier,null);assert.equal(job.service_type,'Delivery');
 assert.equal(job.scheduled,'2026-10-03T14:45:00');assert.equal(db.tables.customer_orders[0].requested_date,null);
 assert.equal((await route.POST(req())).status,200);assert.equal(db.tables.jobs.length,2);assert.equal(db.tables.quotes[0].converted_job_id,job.id);assert.equal(db.tables.jobs[0].source_quote_id,undefined);
});
test('server quote creation discounts tires only, ignores supplied prices/exemption, and snapshots benefits',async()=>{
 const product={id:'tire',size:'275/65R18',brand:'Goodyear',model:'Example',quotePrice:100,serviceCategory:'passenger',supplier:'USAF',atdProductNumber:'1234',warranty:'60000',availability:{local:10,localPlus:10}};
 for(const taxExempt of [false,true]){
 const db=database({quotes:[],quote_options:[]});const discount={id:'code',code:'EXAMPLE',percent:10,organization:'HPR',tax_exempt:taxExempt};
 const checkPricing=(results)=>async(size,includeCost,audience)=>{assert.equal(includeCost,true);assert.equal(audience,'customer');return results;};
 const route=loader({'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/discounts-server':{lookupDiscount:async()=>discount},'@/lib/atd':{searchAtdBySize:checkPricing([])},'@/lib/usaf-catalog':{searchUsafBySize:checkPricing([product])},'@/lib/shop-availability':{availableShopTimes:async()=>[{value:'09:30'}]}})('app/api/public/shop/quote/route');
 const response=await route.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({name:quote.customer,phone:quote.phone,email:quote.email,vehicle:quote.vehicle,address:quote.address,query:'2756518',productId:'tire',quantity:4,discountCode:'EXAMPLE',service:'installation',requestedDate:'2026-10-01',requestedTime:'09:30',tax_exempt:!taxExempt,discount_percent:99,quotePrice:1})}));
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const saved=db.tables.quotes[0];assert.equal(saved.tax_exempt,taxExempt);assert.equal(saved.discount_amount,40);assert.equal(saved.discount_percent,10);assert.equal(db.tables.quote_options[0].price_per_tire,90);assert.equal(db.tables.quote_options[0].original_price_per_tire,100);assert.ok(saved.installation_cost>0);assert.ok(saved.ny_state_tire_fee>0);
 }
});
test('Stripe charges net tires plus full service/fees and disables sales tax only on approved exemption',async()=>{
 const prior={key:process.env.STRIPE_SECRET_KEY,pub:process.env.STRIPE_PUBLISHABLE_KEY,fetch:global.fetch};process.env.STRIPE_SECRET_KEY='unit-test';process.env.STRIPE_PUBLISHABLE_KEY='unit-test';
 try{for(const taxExempt of [true,false]){const db=database({quotes:[{...quote,public_token:'token',tax_exempt:taxExempt,discount_code_id:'code',discount_percent:10,payment_status:'unpaid'}]});let sent;
 global.fetch=async(url,options)=>{assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');sent=options.body;return Response.json({id:'session',client_secret:'test-only'});};
 const route=loader({'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/discounts-server':{lookupDiscount:async()=>({id:'code',percent:10,tax_exempt:taxExempt,organization:'HPR'})}})('app/api/public/quotes/[token]/checkout/route');
 const res=await route.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({optionId:'option'})}),{params:Promise.resolve({token:'token'})});assert.equal(res.status,200);assert.equal(sent.get('line_items[0][price_data][unit_amount]'),'50000');assert.equal(sent.get('line_items[1][price_data][unit_amount]'),'1000');assert.equal(sent.get('automatic_tax[enabled]'),taxExempt?null:'true');
 }}finally{global.fetch=prior.fetch;for(const [env,value] of [['STRIPE_SECRET_KEY',prior.key],['STRIPE_PUBLISHABLE_KEY',prior.pub]])if(value===undefined)delete process.env[env];else process.env[env]=value;}
});
test('fixed per-tire savings survive standard/split checkout and paid job conversion without discounting fees',async()=>{
 const {websitePaymentFields}=loader()('lib/paid-website-order');
 for(const split of [false,true]) for(const exempt of [false,true]) {
  const discount={id:'code',code:'FIXED20',percent:0,discount_type:'fixed',fixed_amount:20.01,organization:'HPR',tax_exempt:exempt};
  const base={size:'275/65R18',brand:'Example',model:'Tire',serviceCategory:'passenger',supplier:'USAF',atdProductNumber:'1234',warranty:'60000',availability:{local:10,localPlus:10}};
  const front={...base,id:'front',quotePrice:100}; const rear={...base,id:'rear',quotePrice:10};
  const db=database({quotes:[],quote_options:[]});
  const route=loader({'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/discounts-server':{lookupDiscount:async()=>discount},'@/lib/atd':{searchAtdBySize:async()=>[]},'@/lib/usaf-catalog':{searchUsafBySize:async()=>[front,rear]},'@/lib/shop-availability':{availableShopTimes:async()=>[{value:'09:30'}]}})('app/api/public/shop/quote/route');
  const res=await route.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({name:quote.customer,phone:quote.phone,email:quote.email,vehicle:quote.vehicle,address:quote.address,query:'2756518',productId:'front',quantity:4,discountCode:'FIXED20',fixed_amount:99,discount_type:'percent',service:'installation',requestedDate:'2026-10-01',requestedTime:'09:30',...(split?{selections:[{productId:'front',size:'2756518',position:'front'},{productId:'rear',size:'2756518',position:'rear'}]}:{})})}));
  assert.equal(res.status,200,JSON.stringify(await res.clone().json()));
  const saved=db.tables.quotes[0],o=db.tables.quote_options[0];
  assert.equal(saved.discount_type,'fixed');assert.equal(saved.discount_fixed_amount,20.01);assert.equal(saved.discount_percent,0);
  assert.equal(o.price_per_tire,79.99);assert.equal(o.rear_price_per_tire,split?0:null);assert.equal(saved.discount_amount,split?60.02:80.04);
  const tireTotal=split?159.98:319.96;
  const expected=tireTotal+saved.installation_cost+saved.disposal_fee+saved.ny_state_tire_fee;
  const job=websitePaymentFields({...saved,amount_paid:expected,stripe_sales_tax_amount:0},o);
  assert.equal(job.subtotal,Math.round(expected*100)/100);assert.equal(job.price_tires*4,tireTotal);
  assert.equal(job.installation_cost,saved.installation_cost);assert.equal(job.tire_disposal_fee,saved.disposal_fee);assert.equal(job.ny_state_tire_fee,saved.ny_state_tire_fee);
  const prior={key:process.env.STRIPE_SECRET_KEY,pub:process.env.STRIPE_PUBLISHABLE_KEY,fetch:global.fetch};
  process.env.STRIPE_SECRET_KEY='unit-test';process.env.STRIPE_PUBLISHABLE_KEY='unit-test';
  saved.quote_options=[o];saved.payment_status='unpaid';let sent;
  try {
   global.fetch=async(url,options)=>{sent=options.body;return Response.json({id:'session',client_secret:'test-only'});};
   const checkout=loader({'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/discounts-server':{lookupDiscount:async()=>discount}})('app/api/public/quotes/[token]/checkout/route');
   const request=()=>new Request('https://example.test',{method:'POST',body:JSON.stringify({optionId:o.id})});
   assert.equal((await checkout.POST(request(),{params:Promise.resolve({token:'public-token'})})).status,200);
   assert.equal(Number(sent.get('line_items[0][price_data][unit_amount]')),Math.round((tireTotal+saved.installation_cost+saved.disposal_fee)*100));
   assert.equal(Number(sent.get('line_items[1][price_data][unit_amount]')),Math.round(saved.ny_state_tire_fee*100));
   assert.equal(sent.get('automatic_tax[enabled]'),exempt?null:'true');
   for(const change of [{fixed_amount:25},{discount_type:'percent'}]){
    const current={...discount};Object.assign(discount,change);sent=null;
    assert.equal((await checkout.POST(request(),{params:Promise.resolve({token:'public-token'})})).status,409);assert.equal(sent,null);
    Object.assign(discount,current);
   }
  }finally{global.fetch=prior.fetch;for(const [env,value] of [['STRIPE_SECRET_KEY',prior.key],['STRIPE_PUBLISHABLE_KEY',prior.pub]])if(value===undefined)delete process.env[env];else process.env[env]=value;}
 }
});
