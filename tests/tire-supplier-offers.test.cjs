const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const mod = new Module(__filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/tire-supplier-offers.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, __filename);
const { supplierOffers } = mod.exports;
const {sameTireVariant,uniqueTireCards}=mod.exports;
const {tireSizeIdentity}=mod.exports;
const base = { brand: 'NITTO', model: 'Terra Grappler G3', size: '2755520', loadSpeed: '117 T', loadRange: 'XL', tireLibraryId: 1 };
const usaf = { ...base, id:'USAF-224060', supplier:'USAF', atdProductNumber:'224060', manufacturerProductNumber:'4981910570769', cost:220.99 };
const atd = { ...base, id:'ATD-224060', supplier:'ATD', size:'275/55R20XL', atdProductNumber:'224060', manufacturerProductNumber:'224060', cost:228 };
const lt = { ...base, id:'USAF-223800', supplier:'USAF', atdProductNumber:'223800', manufacturerProductNumber:'4981910571018', loadSpeed:'120/117 T', loadRange:'E', cost:246.49 };
test('Nitto XL comparison never takes the cost of the LT version with the same model/size', () => {
  const offers = supplierOffers(usaf, [usaf, atd, lt]);
  assert.deepEqual(offers.map(t=>t.cost), [228,220.99]);
  assert.deepEqual(supplierOffers(atd,[usaf,atd,lt]).map(t=>t.cost), [228,220.99]);
  assert.deepEqual(supplierOffers(lt,[usaf,atd,lt]).map(t=>t.id), ['USAF-223800']);
});
test('exact identifiers win over specification fallback independent of source order', () => {
  const fallback = {...atd, id:'ATD-other', atdProductNumber:'other', manufacturerProductNumber:'other', cost:100};
  assert.equal(supplierOffers(usaf,[fallback,usaf,atd])[0].id,atd.id);
  assert.equal(supplierOffers(usaf,[atd,usaf,fallback])[0].id,atd.id);
});
test('shared model-library ID alone never merges tires, and missing specs are not a match', () => {
  assert.deepEqual(supplierOffers(usaf,[usaf,{...atd,id:'different',atdProductNumber:'different',manufacturerProductNumber:'different',loadSpeed:''}]).map(t=>t.id),[usaf.id]);
});
test('LT prefix is not ignored when all other specifications happen to match', () => {
  const other = {...atd,id:'LT-other',atdProductNumber:'LT-other',manufacturerProductNumber:'LT-other',size:'LT275/55R20',loadRange:''};
  assert.deepEqual(supplierOffers(usaf,[usaf,other]).map(t=>t.id),[usaf.id]);
});

test('four Grabber supplier listings become two cards, with both supplier choices and separate T/H ratings',()=>{
 const t={...atd,brand:'GENERAL',model:'Grabber H/T',id:'04493920000',atdProductNumber:'04493920000',manufacturerProductNumber:'04493920000',quotePrice:215.99};
 const h={...t,id:'04493930000',atdProductNumber:'04493930000',manufacturerProductNumber:'04493930000',loadSpeed:'117 H',quotePrice:219.99};
 const products=[t,h,{...t,id:'USAF-t',supplier:'USAF',manufacturerProductNumber:'051342174898'},{...h,id:'USAF-h',supplier:'USAF',manufacturerProductNumber:'051342175024'}];
 const cards=uniqueTireCards(products);assert.equal(cards.length,2);assert.deepEqual(cards.map(p=>p.loadSpeed),['117 T','117 H']);
 for(const card of cards)assert.deepEqual(supplierOffers(card,products).map(p=>p.supplier),['ATD','USAF']);
 assert.equal(uniqueTireCards([...products].reverse())[0].id,'USAF-h');
});

test('different parts are not merged simply because names and visible specifications match',()=>{
 const other={...atd,id:'other',atdProductNumber:'other',manufacturerProductNumber:'other'};
 assert.equal(sameTireVariant(usaf,other),false);assert.equal(uniqueTireCards([usaf,other]).length,2);
 assert.deepEqual(supplierOffers(usaf,[usaf,other]).map(p=>p.id),[usaf.id]);
});

test('supplier abbreviations for black sidewall do not create duplicate exact-part cards',()=>{
 const a={...atd,sidewall:'BSW'};
 for(const sidewall of ['BW','BLK','Black Sidewall']) assert.equal(uniqueTireCards([a,{...usaf,sidewall}]).length,1);
 assert.equal(uniqueTireCards([a,{...usaf,sidewall:'OWL'}]).length,2);
 assert.equal(uniqueTireCards([{...atd,loadSpeed:'100 Y'},{...usaf,loadSpeed:'100 (Y)'}]).length,2);
});

test('conflicting LT/load/speed/sidewall/OE/runflat/fitment variants stay separate even with a reused supplier identifier',()=>{
 const origin={...usaf,sidewall:'BSW',oeMarking:'MO',runFlat:false,fitmentPosition:'front'};
 for(const override of [{size:'LT275/55R20'},{size:'2855520'},{loadSpeed:'117 H'},{loadRange:'E'},{sidewall:'OWL'},{oeMarking:'BMW'},{runFlat:true},{fitmentPosition:'rear'}]){
  const candidate={...origin,id:'different-id',supplier:'ATD',...override};assert.equal(sameTireVariant(origin,candidate),false,JSON.stringify(override));
 }
 assert.equal(sameTireVariant({...usaf,atdProductNumber:'00123',manufacturerProductNumber:''},{...atd,atdProductNumber:'123',manufacturerProductNumber:''}),false);
});

test('live Falken A/T4W and R/T01 metric ply suffixes produce one card per exact tire with both suppliers',()=>{
 for(const [part,model] of [['28847593','Wildpeak A/T4W'],['28757716','Wildpeak R/T01']]){
  const a={...atd,id:part,brand:'FALKEN',model,size:'LT285/60R20/10',loadSpeed:'125/122 R',loadRange:'E',sidewall:'BSW',atdProductNumber:part,manufacturerProductNumber:part};
  const b={...a,id:`USAF-${part}`,supplier:'USAF',size:'2856020',loadRange:'',manufacturerProductNumber:'848983026040'};
  for(const products of [[a,b],[b,a]]){
   assert.equal(uniqueTireCards(products).length,1);
   assert.deepEqual(supplierOffers(products[0],products).map(p=>p.supplier),['ATD','USAF']);
   assert.equal(uniqueTireCards(products)[0],products[0],'Keep the sorted price/purchase target');
  }
 }
});
test('metric size matching handles the same supplier notation across brands and sizes, without ignoring ply conflicts',()=>{
 for(const [size,compact] of [['LT275/65R18/10','2756518'],['LT245/75R17/10PR','2457517'],['LT285/60R20/12','2856020']]){
  const a={...atd,size,loadSpeed:'125/122 R',loadRange:''};
  const b={...usaf,size:compact,loadSpeed:'125/122 R',loadRange:''};
  assert.equal(uniqueTireCards([a,b]).length,1,size);
  assert.equal(uniqueTireCards([a,{...b,size:size.replace(/\/\d+(PR)?$/,'/14')}]).length,2,'Conflicting explicit ply ratings');
 }
 assert.deepEqual(tireSizeIdentity(' LT285/60R20/10 '),{dimensions:'285/60R20',ply:'10'});
 assert.deepEqual(tireSizeIdentity('2856020'),{dimensions:'285/60R20',ply:null});
 assert.notEqual(tireSizeIdentity('225/70R19.5').dimensions,tireSizeIdentity('225/70R195').dimensions);
});
test('ply suffix fix keeps differing parts, loads, speeds, OE, sidewalls, construction and unknown annotations separate',()=>{
 const a={...atd,size:'LT285/60R20/10',loadSpeed:'125/122 R',loadRange:'E',sidewall:'BSW',oeMarking:'MO',runFlat:false};
 const b={...usaf,size:'2856020',loadSpeed:'125/122 R',loadRange:'E',sidewall:'BSW',oeMarking:'MO',runFlat:false};
 for(const overrides of [{atdProductNumber:'other',manufacturerProductNumber:'other'},{loadRange:'F'},{loadSpeed:'125/122 S'},{sidewall:'OWL'},{oeMarking:'BMW'},{runFlat:true},{size:'2856022'},{size:'285/60R20/UNKNOWN'},{size:'285/60R20/10/EXTRA'},{size:'285/60R20',loadSpeed:'116 T',loadRange:'SL'}]){
  assert.equal(uniqueTireCards([a,{...b,...overrides}]).length,2,JSON.stringify(overrides));
 }
});
test('staff and customer shops share the corrected card grouping and supplier matching',()=>{
 const root=require('node:path').resolve(__dirname,'..');
 const staff=fs.readFileSync(require('node:path').join(root,'app/tire-shop/page.tsx'),'utf8');
 const customer=fs.readFileSync(require('node:path').join(root,'app/shop/page.tsx'),'utf8');
 const shared=fs.readFileSync(require('node:path').join(root,'components/TireShoppingBeta.tsx'),'utf8');
 assert.match(staff,/<TireShoppingBeta internal/);assert.match(customer,/<TireShoppingBeta/);
 assert.match(shared,/uniqueTireCards\(products/);assert.match(shared,/return supplierOffers\(tire, products\)/);
});

test('Toyo flotation exact parts group across suppliers, preserving both M/T ply versions',()=>{
 const products=[];
 for(const [part,model,ply,speed] of [['360340','Open Country M/T','10','118 Q'],['360810','Open Country M/T','12','122 Q'],['355930','Open Country A/T III','12','122 Q'],['354370','Open Country R/T Trail','12','122 Q'],['358140','Open Country R/T Pro','12','122 Q']]){
  const a={...atd,brand:'Toyo',id:part,atdProductNumber:part,manufacturerProductNumber:part,model,size:`33X12.50R18LT/${ply}`,loadSpeed:speed,loadRange:ply==='10'?'E':'F',sidewall:'BW'};
  const b={...a,id:`USAF-${part}`,supplier:'USAF',brand:'TOYO',size:'33125018',model:model==='Open Country M/T'?'Toyo OPEN COUNTRY MT FLOTATION':model,loadSpeed:`${ply} ply`,loadRange:'',sidewall:'BSW',manufacturerProductNumber:`upc-${part}`};
  assert.equal(sameTireVariant(a,b),true);products.push(a,b);
 }
 for(const source of [products,[...products].reverse()]){
  assert.equal(uniqueTireCards(source).length,5);
  for(const card of uniqueTireCards(source))assert.deepEqual(supplierOffers(card,source).map(p=>p.supplier),['ATD','USAF']);
 }
});

test('flotation aliases work across brands while part, ply, service rating and dimensions remain protected',()=>{
 for(const size of ['33X12.50R18/10','33x12.5R18LT/10PR','LT33X1250R18/10','33125018'])assert.equal(tireSizeIdentity(size).dimensions,'33X12.50R18');
 assert.equal(tireSizeIdentity('22570195').dimensions,'225/70R19.5');
 const a={...atd,brand:'Toyo',size:'33X12.50R18/10',loadSpeed:'118 Q',loadRange:'E',sidewall:'BW'};
 const b={...usaf,brand:'TOYO',size:'33125018',loadSpeed:'10 ply',loadRange:'',sidewall:'BSW'};
 assert.equal(sameTireVariant(a,b),true);
 assert.equal(sameTireVariant(a,{...b,loadSpeed:'Load E · 10 ply'}),true);
 for(const change of [{loadSpeed:'12 ply'},{loadRange:'F'},{loadSpeed:'122 Q'},{size:'35125018'},{size:'33135018'},{size:'33125020'},{size:'33X12.50R18/10/UNKNOWN'},{atdProductNumber:'different',manufacturerProductNumber:'different'},{sidewall:'OWL'},{oeMarking:'BMW',runFlat:true}])assert.equal(sameTireVariant({...a,runFlat:false},{...b,...change}),false,JSON.stringify(change));
 for(const brand of ['Nitto','General','Kumho'])assert.equal(sameTireVariant({...a,brand},{...b,brand}),true);
});

test('compact commercial half-inch sizes match formatted sizes without merging different parts or ply ratings',()=>{
 for(const [compact,formatted] of [['22570195','225/70R19.5'],['21575175','215/75R17.5'],['25570225','255/70R22.5'],['28575245','285/75R24.5'],['23575165','235/75R16.5']]) {
  assert.equal(tireSizeIdentity(compact).dimensions,formatted);
  assert.deepEqual(tireSizeIdentity(compact+'/14PR'),{dimensions:formatted,ply:'14'});
  const a={...atd,size:formatted+'/14',loadSpeed:'128/126 N',loadRange:'G'};
  const b={...usaf,size:compact,loadSpeed:'14 ply',loadRange:''};
  assert.equal(sameTireVariant(a,b),true);
  for(const patch of [{loadSpeed:'16 ply'},{loadRange:'H'},{atdProductNumber:'different',manufacturerProductNumber:'different'}]) assert.equal(sameTireVariant(a,{...b,...patch}),false);
 }
 for(const size of ['225/70R195','22570195/14/EXTRA','22570185','22570195UNKNOWN']) assert.notEqual(tireSizeIdentity(size).dimensions,'225/70R19.5');
 assert.notEqual(tireSizeIdentity('22570195').dimensions,tireSizeIdentity('22570225').dimensions);
});

test('live 37-inch Toyo and Nitto exact parts group when USAF omits LT, ply and load range',()=>{
 const records = [
  ['TOYO','354470','Open Country R/T Trail','22','12','127 Q'],
  ['TOYO','358400','Open Country R/T Pro','22','12','127 Q'],
  ['TOYO','356030','Open Country A/T III','22','12','127 Q'],
  ['NITTO','224740','Terra Grappler G3','22','12','127 R'],
  ['NITTO','217280','Ridge Grappler','22','12','127 Q'],
  ['TOYO','356020','Open Country A/T III','20','10','126 Q'],
  ['TOYO','360750','Open Country M/T','20','10','126 Q'],
  ['TOYO','358280','Open Country R/T Pro','20','10','126 Q'],
  ['TOYO','354210','Open Country R/T Trail','20','10','126 Q'],
  ['NITTO','218030','Recon Grappler A/T','20','10','126 R'],
  ['NITTO','224720','Terra Grappler G3','20','10','126 R'],
  ['NITTO','217030','Ridge Grappler','20','10','126 Q'],
  ['NITTO','205800','Trail Grappler M/T','20','10','126 Q'],
 ];
 const products = records.flatMap(([brand,part,model,rim,ply,speed])=>{
  const a={...atd,brand,id:part,atdProductNumber:part,manufacturerProductNumber:part,model,size:`37X12.50R${rim}LT/${ply}`,loadSpeed:speed,loadRange:ply==='10'?'E':'F',sidewall:'BSW',runFlat:false};
  const b={...a,id:`USAF-${part}`,supplier:'USAF',size:`371250${rim}`,loadRange:''};
  for(const source of [[a,b],[b,a]]) {
   assert.equal(uniqueTireCards(source).length,1,part);
   assert.deepEqual(supplierOffers(source[0],source).map(p=>p.supplier),['ATD','USAF'],part);
   assert.equal(uniqueTireCards(source)[0],source[0],'Preserve price, availability, rating and purchasing target');
   assert.equal(b.loadRange,'','Do not invent missing supplier specifications');
  }
  return [a,b];
 });
 assert.equal(uniqueTireCards(products).length,records.length);
 assert.equal(uniqueTireCards([...products].reverse()).length,records.length);
});

test('unknown flotation load range never merges conflicting or unidentified variants',()=>{
 const a={...atd,brand:'TOYO',size:'37X12.50R22LT/12',loadSpeed:'127 Q',loadRange:'F',sidewall:'BSW',runFlat:false,oeMarking:'MO'};
 const b={...usaf,brand:'TOYO',size:'37125022',loadSpeed:'127 Q',loadRange:'',sidewall:'BSW',runFlat:false,oeMarking:'MO'};
 for(const patch of [{loadRange:'E'},{loadRange:'XL'},{loadRange:'SL'},{loadSpeed:'10 ply'},{loadSpeed:'126 Q'},{loadSpeed:'127 R'},{size:'37125020'},{size:'37135022'},{sidewall:'OWL'},{oeMarking:'BMW'},{runFlat:true},{fitmentPosition:'rear'},{brand:'NITTO'},{atdProductNumber:'different',manufacturerProductNumber:'different'},{atdProductNumber:'',manufacturerProductNumber:''},{size:'37X12.50R22/UNKNOWN'}]) {
  assert.equal(sameTireVariant(a,{...b,...patch}),false,JSON.stringify(patch));
  assert.equal(sameTireVariant({...b,...patch},a),false,JSON.stringify(patch));
 }
 assert.equal(sameTireVariant({...a,size:'LT275/65R20',loadRange:'E'}, {...b,size:'2756520',loadRange:'SL'}),false,'Explicit passenger construction remains separate');
});

test('metric and commercial exact-part records tolerate missing construction metadata, not explicit conflicts',()=>{
 for(const [brand,part,size,compact,speed,range] of [
  ['TOYO','360410','LT275/65R20/10','2756520','126 P','E'],
  ['NITTO','206950','LT275/65R20/10','2756520','126 Q','E'],
  ['NITTO','206600','LT275/65R20/10','2756520','126 Q','E'],
  ['NITTO','205340','LT305/55R20/10','3055520','121 R','E'],
  ['NEXEN','1A325NXK','LT305/55R20/12','3055520','125/122 S','F'],
  ['NEXEN','15929NXK','LT275/65R20/10','2756520','126/123 Q','E'],
  ['NEXEN','18766NXK','315/70R17','3157017','126/123 S','E'],
  ['NEXEN','18767NXK','285/70R17','2857017','126/123 S','E'],
  ['CONTINENTAL','05226360000','225/70R19.5/14','22570195','128/126 N','G'],
  ['CONTINENTAL','15582830000','LT275/65R20/E','2756520','126/123 S','E'],
 ]) {
  const a={...atd,brand,id:part,atdProductNumber:part,manufacturerProductNumber:part,size,loadSpeed:speed,loadRange:range};
  const b={...a,id:`USAF-${part}`,supplier:'USAF',size:compact,loadSpeed:brand==='NEXEN'?'':speed,loadRange:''};
  assert.equal(sameTireVariant(a,b),true,part);
  assert.equal(uniqueTireCards([a,b]).length,1,part);
  assert.deepEqual(supplierOffers(b,[a,b]).map(p=>p.supplier),['ATD','USAF']);
  for(const patch of [{loadRange:'SL'},{loadRange:'XL'},{size:`P${compact}`},{atdProductNumber:'other',manufacturerProductNumber:'other'},{loadSpeed:'99 T'}]) assert.equal(sameTireVariant(a,{...b,...patch}),false,part+JSON.stringify(patch));
 }
 assert.equal(sameTireVariant(atd,{...usaf,loadRange:''}),true,'Known passenger tire and its exact part with unknown load range stay grouped');
});

test('letter load-range suffixes normalize across sizes but cannot hide conflicting ply ratings',()=>{
 for(const [range,ply] of Object.entries({C:'6',D:'8',E:'10',F:'12',G:'14',H:'16'})) {
  for(const size of ['LT275/65R20','37X12.50R22LT','225/70R19.5']) {
   assert.deepEqual(tireSizeIdentity(`${size}/${range}`),tireSizeIdentity(`${size}/${ply}`));
   const a={...atd,size:`${size}/${range}`,loadRange:range};
   const b={...usaf,size:`${size}/${ply}`,loadRange:range};
   assert.equal(sameTireVariant(a,b),true);
   assert.equal(sameTireVariant(a,{...b,size:`${size}/${Number(ply)+2}`}),false);
  }
 }
 for(const size of ['LT275/65R20/UNKNOWN','LT275/65R20/E/EXTRA','275/65R200/E']) assert.equal(tireSizeIdentity(size).dimensions,size);
});

test('General supplier LT after the ply suffix matches the exact part without losing its ply',()=>{
 const a={...atd,brand:'GENERAL',id:'04492680000',atdProductNumber:'04492680000',manufacturerProductNumber:'04492680000',model:'Grabber A/TX',size:'37X12.50R20/10LT',loadSpeed:'126 R',loadRange:'E'};
 const b={...a,id:'USAF-04492680000',supplier:'USAF',size:'37125020',loadRange:''};
 assert.deepEqual(tireSizeIdentity(a.size),{dimensions:'37X12.50R20',ply:'10'});
 assert.equal(uniqueTireCards([a,b]).length,1);
 assert.deepEqual(supplierOffers(b,[a,b]).map(p=>p.supplier),['ATD','USAF']);
 assert.equal(sameTireVariant(a,{...b,size:'37X12.50R20/12LT'}),false);
 assert.equal(tireSizeIdentity('37X12.50R20/10LT/EXTRA').dimensions,'37X12.50R20/10LT/EXTRA');
});
