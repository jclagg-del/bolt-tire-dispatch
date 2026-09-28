const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
function loader(){const cache=new Map();return function load(file){file=path.resolve(__dirname,'..',file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file,module);cache.set(file,m);m.paths=module.paths;m.require=id=>id==='server-only'?{}:id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;};}
const bad='https://storage.googleapis.com/autosync_tires/broken.webp';
const good='https://tireweb.tirelibrary.com/images/Products/good.jpg';
const product=(extra={})=>({id:'USAF-123',brand:'GOODYEAR',model:'Wrangler Steadfast HT',size:'2755022',atdProductNumber:'123',cost:200,loadSpeed:'115 H',...extra});
async function withFetch(handler,run){const old=global.fetch,oldKey=process.env.TIRE_LIBRARY_API_KEY;global.fetch=handler;process.env.TIRE_LIBRARY_API_KEY='isolated-test-only';try{await run(loader());}finally{global.fetch=old;if(oldKey===undefined)delete process.env.TIRE_LIBRARY_API_KEY;else process.env.TIRE_LIBRARY_API_KEY=oldKey;}}
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});

test('same-model tires retain exact SKU speed, load, sidewall and dimensions rather than the first model record',async()=>{
 const variants=[{id:1,item_number:'04493920000',speed_rating:'T',load_rating:'117',load_range:'XL',sidewall:'BSW',weight:'37.7',utqg:'720 B B'},
 {id:2,item_number:'04493930000',speed_rating:'H',load_rating:'117',load_range:'XL',sidewall:'BSW',weight:'38',utqg:'720 B A'},
 {id:3,item_number:'LT-OTHER',speed_rating:'S',load_rating:'120/117',load_range:'E',sidewall:'OWL',weight:'50',utqg:''}];
 const catalog=variants.map(v=>({...v,tire_model_id:99,make_name:'GENERAL',model_name:'Grabber H/T',thumbnail_image:good}));
 await withFetch(async url=>{
  url=String(url);if(url.includes('/tires/search?'))return json({data:catalog});if(url.includes('/rebate?'))return json({data:[]});
  const id=url.match(/\/tires\/(\d+)\?/);if(id)return json({...catalog.find(v=>v.id===Number(id[1])),tire_model:{name:'Grabber H/T',image_url:good}});
  return new Response(null,{headers:{'content-type':'image/jpeg'}});
 },async load=>{
  const result=await load('lib/tire-library.ts').enrichWithTireLibrary(variants.map(v=>product({id:String(v.id),brand:'GENERAL',model:'Grabber H/T',size:'2755520',atdProductNumber:v.item_number,sidewall:v.sidewall,weight:v.weight})));
  for(let i=0;i<variants.length;i++){assert.equal(result[i].loadSpeed,`${variants[i].load_rating} ${variants[i].speed_rating}`);assert.equal(result[i].loadRange,variants[i].load_range);assert.equal(result[i].sidewall,variants[i].sidewall);assert.equal(result[i].weight,variants[i].weight);assert.equal(result[i].tireLibraryId,variants[i].id);}
  const missing=await load('lib/tire-library.ts').enrichWithTireLibrary(variants.map(v=>product({id:String(v.id),brand:'GENERAL',model:'Grabber H/T',atdProductNumber:v.item_number})));
  assert.equal(missing[1].weight,undefined);assert.equal(missing[1].sidewall,undefined); // Don't copy the representative tire's values.
 });
});

test('model-only photo matches never copy another SKU specifications or expose its detail record',async()=>{
 await withFetch(async url=>{
  url=String(url);if(url.includes('/tires/search?'))return json({data:[{id:1,item_number:'OTHER',tire_model_id:99,make_name:'GOODYEAR',model_name:'Wrangler Steadfast HT',load_rating:'999',speed_rating:'Z',load_range:'E',thumbnail_image:good}]});
  if(url.includes('/rebate?'))return json({data:[]});if(url.includes('/tires/1?'))return json({id:1,load_rating:'999',speed_rating:'Z',load_range:'E',sidewall:'OWL',tire_model:{image_url:good}});
  return new Response(null,{headers:{'content-type':'image/jpeg'}});
 },async load=>{
  const [result]=await load('lib/tire-library.ts').enrichWithTireLibrary([product({loadSpeed:'115 H',loadRange:'XL',sidewall:'BSW'})]);
  assert.equal(result.loadSpeed,'115 H');assert.equal(result.loadRange,'XL');assert.equal(result.sidewall,'BSW');assert.equal(result.imageUrl,good);assert.equal(result.tireLibraryId,undefined);
 });
});

test('photo ranking favors supplied angle and tread views over profiles without inventing URLs',()=>{
 const urls=['https://images.atdonline.com/tire_sidewall.jpg',good,'https://images.atdonline.com/tire_tread.jpg','https://images.atdonline.com/tire_quarterview.jpg'];
 assert.deepEqual(loader()('lib/tire-image-health.ts').rankTireImages([...urls,urls[2],null]),[urls[3],urls[2],urls[1],urls[0]]);
});

test('a healthy profile is replaced by an exact-model angle, falling back to front then the existing photo',async()=>{
 const angle='https://storage.googleapis.com/autosync_tires/angle.webp';
 const front='https://storage.googleapis.com/autosync_tires/front.webp';
 for(const failed of [[],[angle],[angle,front]]){
  await withFetch(async(url)=>{
   url=String(url);
   if(url.includes('/tires/search?'))return json({data:[{id:1,tire_model_id:10,item_number:'123',make_name:'Goodyear',model_name:'Wrangler Steadfast HT',thumbnail_image:good}]});
   if(url.includes('/rebate?'))return json({data:[]});
   if(url.includes('/tires/1?'))return json({id:1,tire_model:{image_url:good},angle_image:angle,front_image:front});
   return new Response(null,{status:failed.includes(url)?404:200,headers:{'content-type':'image/jpeg'}});
  },async load=>{
   const [result]=await load('lib/tire-library.ts').enrichWithTireLibrary([product({imageUrl:good})]);
   assert.equal(result.imageUrl,failed.length===0?angle:failed.length===1?front:good);
   assert.equal(result.cost,200);assert.equal(result.atdProductNumber,'123');assert.equal(result.imageVerified,true);
  });
 }
});

test('alternate views are applied after the first 60 models and detail requests stay bounded',async()=>{
 const source=Array.from({length:65},(_,i)=>product({id:String(i+1),atdProductNumber:String(i+1),model:`Pattern ${i+1}`,imageUrl:good}));
 const catalog=source.map((p,i)=>({id:i+1,tire_model_id:i+1,item_number:p.atdProductNumber,make_name:'GOODYEAR',model_name:p.model,thumbnail_image:good}));
 const angle='https://storage.googleapis.com/autosync_tires/alternate.webp';
 let active=0,peak=0,count=0;
 await withFetch(async(url)=>{
  url=String(url);
  if(url.includes('/tires/search?'))return json({data:catalog});
  if(url.includes('/rebate?'))return json({data:[]});
  const id=url.match(/\/tires\/(\d+)\?/);
  if(id){active++;count++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return json({id:Number(id[1]),angle_image:angle});}
  return new Response(null,{headers:{'content-type':'image/jpeg'}});
 },async load=>{
  const result=await load('lib/tire-library.ts').enrichWithTireLibrary(source);
  assert.equal(count,65);assert.ok(peak<=8);assert.equal(result[64].imageUrl,angle);
 });
});

test('large searches recover detail photos beyond the metadata cap using the exact SKU tread variant',async()=>{
 const source=Array.from({length:61},(_,i)=>product({id:String(i+1),atdProductNumber:String(i+1),model:i===60?'Wrangler Territory AT':`Pattern ${i+1}`}));
 const catalog=source.map((p,i)=>({id:i+1,tire_model_id:i+1,item_number:p.atdProductNumber,make_name:'GOODYEAR',model_name:i===60?'Wrangler Territory AT (Tread Design B)':p.model,thumbnail_image:i===60?bad:good}));
 let fetchedLast=false;
 await withFetch(async(url)=>{
  url=String(url);
  if(url.includes('/tires/search?'))return json({data:catalog});
  if(url.includes('/rebate?'))return json({data:[]});
  const id=url.match(/\/tires\/(\d+)\?/);
  if(id){if(Number(id[1])===61)fetchedLast=true;return json({id:Number(id[1]),tire_model:{image_url:good}});}
  if(url.includes('/catalog?'))throw new Error('Exact SKU detail should resolve the image');
  return new Response(null,{status:url===bad?404:200,headers:{'content-type':'image/jpeg'}});
 },async load=>{
  const result=await load('lib/tire-library.ts').enrichWithTireLibrary(source);
  assert.equal(fetchedLast,true);assert.equal(result[60].imageUrl,good);assert.equal(result[60].atdProductNumber,'61');
 });
});

test('image checks skip 404 and non-image responses, deduplicate requests, and block unsafe hosts and redirects',async()=>{
 const calls=[];
 await withFetch(async(url,options)=>{calls.push(url);assert.equal(options.redirect,'manual');assert.ok(!options.headers?.['x-api-key']);if(url===bad)return new Response(null,{status:404});if(url.endsWith('redirect.jpg'))return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});return new Response(null,{headers:{'content-type':url===good?'image/jpeg':'text/html'}});},async load=>{
  const h=load('lib/tire-image-health.ts');
  assert.equal(await h.firstHealthyTireImage([bad,'https://storage.googleapis.com/not-image',good]),good);
  assert.deepEqual(await Promise.all([h.healthyTireImage(good),h.healthyTireImage(good)]),[true,true]);
  assert.equal(calls.filter(x=>x===good).length,1);
  assert.equal(await h.healthyTireImage('https://tireweb.tirelibrary.com/redirect.jpg'),false);
  for(const url of ['http://images.atdonline.com/x','https://images.atdonline.com.attacker.com/x','https://user:secret@images.atdonline.com/x','https://127.0.0.1/x'])assert.equal(await h.healthyTireImage(url),false);
  assert.ok(!calls.some(x=>x.includes('127.0.0.1')));
 });
});

test('detail photo recovery tries another angle after a dead pattern image',async()=>{
 await withFetch(async(url)=>String(url).includes('/tires/1?')?json({id:1,tire_model:{image_url:bad},front_image:good}):new Response(null,{status:url===bad?404:200,headers:{'content-type':'image/jpeg'}}),async load=>{
  assert.equal((await load('lib/tire-library.ts').tireLibraryTireDetails(1)).imageUrl,good);
 });
});

test('unmatched SKUs recover exact-model photos across sizes without importing other sizes specs or prices',async()=>{
 let catalogCalls=0;
 await withFetch(async(url)=>{
  url=String(url);
  if(url.includes('/tires/search?')||url.includes('/rebate?'))return json({data:[],last_page:1});
  if(url.includes('/tires/catalog?')){catalogCalls++;return json({results:{data:[{id:88,make_name:'Goodyear',model_name:'Wrangler Steadfast HT',thumbnail_image:good,load_rating:'999',item_number:'OTHER-SIZE'}]}});}
  return new Response(null,{headers:{'content-type':'image/jpeg'}});
 },async load=>{
  const source=[product(),product({id:'USAF-456',atdProductNumber:'456',size:'2457017',cost:150})];
  const result=await load('lib/tire-library.ts').enrichWithTireLibrary(source);
  assert.equal(catalogCalls,1);
  result.forEach((p,i)=>{assert.equal(p.imageUrl,good);assert.equal(p.imageVerified,true);assert.equal(p.cost,source[i].cost);assert.equal(p.atdProductNumber,source[i].atdProductNumber);assert.equal(p.loadSpeed,'115 H');assert.equal(p.tireLibraryMatched,undefined);});
 });
});

test('fallback never picks a different brand, generation, tread variant, or vaguely similar model',async()=>{
 await withFetch(async(url)=>{
  url=String(url);if(url.includes('/tires/search?')||url.includes('/rebate?'))return json({data:[]});
  if(url.includes('/tires/catalog?'))return json({results:{data:[{make_name:'Other',model_name:'Wrangler Duratrac RT',thumbnail_image:good},{make_name:'Goodyear',model_name:'Wrangler Duratrac',thumbnail_image:good},{make_name:'Goodyear',model_name:'Wrangler Duratrac RT-LT',thumbnail_image:good}]}});
  if(url.includes('/tire-patterns/catalog?'))return json({results:{data:[{make_name:'Goodyear',name:'Wrangler Duratrac RT2',image_url:good}]}});
  throw new Error('Unexpected image request');
 },async load=>{const [result]=await load('lib/tire-library.ts').enrichWithTireLibrary([product({model:'Goodyear WRANGLER DURATRAC RT'})]);assert.equal(result.imageUrl,null);assert.equal(result.imageVerified,false);});
});

test('a broken supplier photo can use the verified detail image and unmatched suppliers share only exact model photos',async()=>{
 await withFetch(async(url)=>{
  url=String(url);
  if(url.includes('/tires/search?'))return json({data:[{id:1,tire_model_id:10,item_number:'123',make_name:'Goodyear',model_name:'Wrangler Steadfast HT',thumbnail_image:bad}]});
  if(url.includes('/rebate?'))return json({data:[]});
  if(url.includes('/tires/1?'))return json({id:1,tire_model:{image_url:bad},front_image:good});
  if(url.includes('/catalog?'))return json({results:{data:[]}});
  return new Response(null,{status:url===bad?404:200,headers:{'content-type':'image/jpeg'}});
 },async load=>{
  const [result]=await load('lib/tire-library.ts').enrichWithTireLibrary([product({imageUrl:bad})]);assert.equal(result.imageUrl,good);
 });
 const keys=loader()('lib/tire-image-health.ts');
 assert.equal(keys.tireImageKey('ADVANTA','Advanta ATX-850'),keys.tireImageKey('ARGUS ADVANTA','ATX-850'));
 assert.notEqual(keys.tireImageKey('Goodyear','Wrangler Territory AT (Tread Design B)'),keys.tireImageKey('Goodyear','Wrangler Territory AT'));
});
