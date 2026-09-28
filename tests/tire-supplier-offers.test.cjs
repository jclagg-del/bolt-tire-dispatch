const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const mod = new Module(__filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../lib/tire-supplier-offers.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, __filename);
const { supplierOffers } = mod.exports;
const {sameTireVariant,uniqueTireCards}=mod.exports;
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

test('conflicting LT/load/speed/sidewall/OE/runflat/fitment variants stay separate even with a reused supplier identifier',()=>{
 const origin={...usaf,sidewall:'BSW',oeMarking:'MO',runFlat:false,fitmentPosition:'front'};
 for(const override of [{size:'LT275/55R20'},{size:'2855520'},{loadSpeed:'117 H'},{loadRange:'E'},{sidewall:'OWL'},{oeMarking:'BMW'},{runFlat:true},{fitmentPosition:'rear'}]){
  const candidate={...origin,id:'different-id',supplier:'ATD',...override};assert.equal(sameTireVariant(origin,candidate),false,JSON.stringify(override));
 }
 assert.equal(sameTireVariant({...usaf,atdProductNumber:'00123',manufacturerProductNumber:''},{...atd,atdProductNumber:'123',manufacturerProductNumber:''}),false);
});
