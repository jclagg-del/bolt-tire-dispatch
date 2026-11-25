const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {PDFDocument,decodePDFRawStream}=require('pdf-lib');
function loader(stubs={}) {
 const cache=new Map();
 return function load(file) {
  const filename=path.resolve(__dirname,'..',file.endsWith('.ts')||file.endsWith('.tsx')?file:file+'.ts');
  if(cache.has(filename))return cache.get(filename).exports;
  const mod=new Module(filename,module);cache.set(filename,mod);mod.paths=module.paths;
  mod.require=id=>Object.hasOwn(stubs,id)?stubs[id]:id.startsWith('@/')?load(id.slice(2)):require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,filename);
  return mod.exports;
 };
}
const load=loader(),{dailyDeliveryGroups,deliveryJobsForDate,createDeliveryManifest,deliveryQuantity}=load('lib/delivery-manifest');
const {deliveryManifestPdf}=load('lib/delivery-manifest-pdf');
const date='2026-11-25';
const job=(id,patch={})=>({id,customer:'Kingdom Support Services',facility_name:'Wallkill',address:'Example receiving address',scheduled:date+'T09:00:00',service_type:'Delivery',complete:false,archived:false,job_status:'scheduled',po_number:'30988'+String(id).padStart(2,'0'),mo_number:'9231'+String(id).padStart(2,'0'),tires:'Goodyear Assurance All-Season',size:'205/55R16',qty:4,...patch});
const textOf=(doc,page)=>page.node.Contents().asArray().map(ref=>Buffer.from(decodePDFRawStream(doc.context.lookup(ref)).decode()).toString()).join('\n');
const words=(doc,page)=>[...textOf(doc,page).matchAll(/<([0-9A-F]+)>\s*Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(' ');

test('daily delivery selection is organization/date scoped and includes completed but not cancelled/installation/pickup jobs',()=>{
 const rows=[job(1),job(2,{complete:true,archived:true}),job(3,{customer:'HPR'}),job(4,{customer:'Other customer'}),job(5,{service_type:'Pickup'}),job(6,{service_type:'Installation'}),job(7,{service_type:'Delivery and installation'}),job(8,{scheduled:'2026-11-26T09:00:00'}),job(9,{archived:true}),job(10,{job_status:'Cancelled'}),job(11,{scheduled:null})];
 assert.deepEqual(deliveryJobsForDate(rows,date).map(j=>j.id),[1,2,3]);
 assert.deepEqual(deliveryJobsForDate(rows,'bad'),[]);
 assert.equal(deliveryJobsForDate([job(20,{scheduled:'2026-11-26T02:00:00Z'})],date).length,1,'timezone-bearing timestamps use NY date');
});
test('grouping never mixes organizations or distinct site addresses, and never combines unknown facilities',()=>{
 const groups=dailyDeliveryGroups([job(1),job(2,{complete:true}),job(3,{facility_name:'Patterson'}),job(4,{customer:'HPR'}),job(5,{address:'Different street'}),job(6,{facility_name:null}),job(7,{facility_name:null})],date);
 assert.equal(groups.length,6);assert.equal(groups.find(g=>g.jobs.some(j=>j.id===1)).jobs.length,2);
});
test('one receiving-site document can list onward-shuttle destinations without changing jobs or quantities',()=>{
 const jobs=[job(1),job(2,{facility_name:'Warwick',qty:2}),job(3,{facility_name:'Patterson'})];
 const snapshot=JSON.stringify(jobs);
 const manifest=createDeliveryManifest(date,'Kingdom Support Services','Wallkill',jobs);
 assert.equal(manifest.total,10);assert.deepEqual(manifest.lines.map(l=>l.finalSite),['Wallkill','Warwick','Patterson']);
 assert.equal(JSON.stringify(jobs),snapshot);
 assert.equal(manifest.reference,createDeliveryManifest(date,'Kingdom Support Services',' wallkill ',jobs).reference);
 assert.notEqual(manifest.reference,createDeliveryManifest(date,'Kingdom Support Services','Patterson',jobs).reference);
 assert.throws(()=>createDeliveryManifest(date,'HPR','Wallkill',jobs),/one organization/);
 assert.throws(()=>createDeliveryManifest(date,'Kingdom Support Services','Wallkill',[...jobs,job(4,{scheduled:'2026-11-26T09:00:00'})]),/one organization/);
 assert.throws(()=>createDeliveryManifest(date,'Kingdom Support Services','Wallkill',[jobs[0],jobs[0]]),/Duplicate/);
 assert.throws(()=>createDeliveryManifest(date,'Kingdom Support Services','',jobs),/receiving site/);
 assert.throws(()=>createDeliveryManifest(date,'Kingdom Support Services','Wallkill',[]),/at least one/);
});
test('unknown quantities never silently default to one or print a false total',()=>{
 for(const qty of [null,'',0,-1,'bad',1.5,Infinity]) {
  assert.equal(deliveryQuantity(job(1,{qty})),null);
  assert.throws(()=>createDeliveryManifest(date,'Kingdom Support Services','Wallkill',[job(1,{qty})]),/valid tire quantity/);
 }
 assert.equal(deliveryQuantity(job(1,{qty:'6'})),6);
});
test('approved 4x6 portrait layout prints three jobs, bold job/MO references, blank verification fields and one document total',async()=>{
 const manifest=createDeliveryManifest(date,'Kingdom Support Services','Wallkill',[job(1),job(2,{qty:2,facility_name:'Warwick',tires:'Goodyear Wrangler Workhorse AT',size:'LT245/75R16'}),job(3,{facility_name:'Patterson',tires:'Falken Wildpeak A/T4W',size:'LT275/65R20'})]);
 const result=await deliveryManifestPdf(manifest,100,new Uint8Array(fs.readFileSync(path.join(__dirname,'../public/bolt-logo.png'))));
 const doc=await PDFDocument.load(result.bytes);assert.equal(result.pages,1);assert.equal(doc.getPageCount(),1);
 const page=doc.getPage(0),text=words(doc,page);
 assert.deepEqual(page.getSize(),{width:288,height:432});
 for(const expected of ['BILL OF LADING','KINGDOM / WALLKILL','Final: Warwick','Final: Patterson','TOTAL EXPECTED: 10 TIRES','Received qty: ______','Signature:','PAGE 1 OF 1'])assert.ok(text.includes(expected),expected);
 assert.match(textOf(doc,page),/Helvetica-Bold-\d+ 10\.5 Tf/);
 assert.doesNotMatch(text,/PAID|DELIVERED|SAMPLE/);
 if(process.env.DELIVERY_PDF_PROOF)fs.writeFileSync(process.env.DELIVERY_PDF_PROOF,result.bytes);
});
test('larger deliveries paginate into one numbered document, no job disappears, and totals distinguish each page',async()=>{
 const jobs=Array.from({length:8},(_,i)=>job(i+1,{facility_name:i%2?'Warwick':'Wallkill'}));
 const manifest=createDeliveryManifest(date,'Kingdom Support Services','Wallkill',jobs);
 const result=await deliveryManifestPdf(manifest),doc=await PDFDocument.load(result.bytes);
 assert.equal(result.pages,3);assert.equal(doc.getPageCount(),3);
 let all='';for(const [index,page] of doc.getPages().entries()){
  assert.deepEqual(page.getSize(),{width:288,height:432});const text=words(doc,page);all+=text;
  assert.ok(text.includes(`PAGE ${index+1} OF 3`));assert.ok(text.includes(manifest.reference));assert.ok(text.includes('SHIPMENT: 32'));assert.ok(text.includes('Received on this page'));
 }
 for(const row of manifest.lines)assert.equal(all.split('JOB '+row.jobNumber).length-1,1,row.jobNumber);
 if(process.env.DELIVERY_PDF_PROOF)fs.writeFileSync(process.env.DELIVERY_PDF_PROOF.replace('.pdf','-continuation.pdf'),result.bytes);
});
test('long metadata wraps without clipping and oversized records fail visibly instead of dropping information',async()=>{
 const manifest=createDeliveryManifest(date,'HPR','HPR receiving',[job(1,{customer:'HPR',mo_number:'MO 923101 - Example technician reference',facility_name:'Long destination facility name for receiving team'})]);
 const result=await deliveryManifestPdf(manifest,80),doc=await PDFDocument.load(result.bytes);
 assert.match(textOf(doc,doc.getPage(0)),/0\.8 0 0 0\.8 0 0 cm/);
 assert.ok(words(doc,doc.getPage(0)).includes('Example technician reference'));
 await assert.rejects(deliveryManifestPdf({...manifest,total:999}),/quantities/);
 await assert.rejects(deliveryManifestPdf({...manifest,lines:[{...manifest.lines[0],tires:'word '.repeat(300)}]}),/too much text/);
 await assert.rejects(deliveryManifestPdf(manifest,110),/print size/);
});
test('Smooth Print transfer uses portrait 4x6, one copy of each page and no public customer URL',async()=>{
 const {smoothPrintUrl}=load('lib/tire-label-pdf');
 const result=await deliveryManifestPdf(createDeliveryManifest(date,'Kingdom Support Services','Wallkill',[job(1)]));
 const url=new URL(smoothPrintUrl(result.bytes,'bolt-labels-bol-test.pdf'));
 for(const [key,value] of [['copies','1'],['orientation','portrait'],['tapeWidth','101.6'],['tapeLength','152.4']])assert.equal(url.searchParams.get(key),value);
 assert.deepEqual(Buffer.from(url.searchParams.get('fileattach'),'base64'),Buffer.from(result.bytes));
 assert.doesNotMatch(url.toString(),/https|access_token/);
});

function apiHarness({user=true,role='technician',staffError=false,failPage=-1,total=2}={}) {
 const calls=[];let page=0;
 const db={from(table){calls.push({table});const entry=calls.at(-1);const q={select(v){entry.fields=v;return q},eq(k,v){entry[k]=v;return q},in(k,v){entry[k]=v;return q},gte(k,v){entry.from=v;return q},lt(k,v){entry.to=v;return q},order(k){entry.order=k;return q},range(a,b){entry.range=[a,b];return q},maybeSingle(){return Promise.resolve({data:role?{role}:null,error:staffError?{}:null})},then(ok,no){const at=page++;return Promise.resolve({data:Array.from({length:Math.max(0,Math.min(500,total-at*500))},(_,i)=>job(at*500+i+1)),error:at===failPage?{}:null}).then(ok,no)}};return q;}};
 const route=loader({'@/lib/supabase/admin':{requireApiUser:async()=>user?{id:'staff'}:null,createAdminClient:()=>db}})('app/api/delivery-manifest/route');
 return {calls,get:(day=date)=>route.GET(new Request('https://example.test/api/delivery-manifest?date='+day))};
}
test('manifest endpoint requires verified staff, allows technicians, and returns no private billing data',async()=>{
 for(const config of [{user:false},{role:null},{role:'customer'},{staffError:true}]){const h=apiHarness(config);assert.ok([401,403].includes((await h.get()).status));assert.ok(!h.calls.some(c=>c.table==='jobs'));}
 for(const role of ['admin','office','technician']){const h=apiHarness({role});const response=await h.get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).jobs.length,2);}
 const h=apiHarness();const response=await h.get('2026-02-30');assert.equal(response.status,400);assert.ok(!h.calls.some(c=>c.table==='jobs'));
});
test('manifest endpoint reads all pages for only the selected NY day and organizations, and fails closed on a partial read',async()=>{
 const h=apiHarness({total:1001});const response=await h.get();assert.equal(response.status,200);assert.equal((await response.json()).jobs.length,1001);
 const reads=h.calls.filter(c=>c.table==='jobs');assert.equal(reads.length,3);
 for(const [index,read] of reads.entries()) {
  assert.deepEqual(read.customer,['Kingdom Support Services','HPR']);assert.equal(read.from,date+'T00:00:00');assert.equal(read.to,'2026-11-26T00:00:00');assert.deepEqual(read.range,[index*500,index*500+499]);
  assert.doesNotMatch(read.fields,/price|email|phone|payment|notes/);
 }
 const failed=await apiHarness({total:1001,failPage:1}).get();assert.equal(failed.status,503);assert.ok(!(await failed.json()).jobs);
});
test('route and expandable schedule summaries expose printing without hiding installation jobs or mutating completion',()=>{
 const route=fs.readFileSync(path.join(__dirname,'../app/route/page.tsx'),'utf8'),schedule=fs.readFileSync(path.join(__dirname,'../app/schedule/page.tsx'),'utf8');
 assert.match(route,/<DeliveryManifestButton date=\{selectedDate\}/);
 assert.match(schedule,/dayJobs.filter\(job => !isFleetDelivery\(job\)\)/);
 assert.match(schedule,/serviceJobs.map\(renderJob\)/);assert.match(schedule,/active.map\(renderJob\)/);
 assert.match(schedule,/<details[^>]*><summary/);assert.match(schedule,/<DeliveryManifestButton date=\{day.dateKey\}/);
 const client=fs.readFileSync(path.join(__dirname,'../components/DeliveryManifestButton.tsx'),'utf8');
 assert.doesNotMatch(client,/\.update\(|\.insert\(|\.upsert\(/);
 assert.match(client,/source\?\.date === date/);assert.match(client,/prepared\?\.key === key/);assert.match(client,/URL.revokeObjectURL/);
});
