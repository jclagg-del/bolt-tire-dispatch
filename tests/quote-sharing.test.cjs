const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const React = require('react');
function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
    mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith('@/') ? load(id.slice(2)) : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, file);
    return mod.exports;
  };
}
const quote={id:'11111111-1111-4111-8111-111111111111',public_token:'test-token',quote_number:123,phone:'(845) 555-0123',contact_name:'Pat Example'};
test('Quo draft contains the exact recipient and complete encoded quote message',()=>{
 const {quoteQuoDraftUrl,quoteShareText,quoteTextRecipient}=loader()('lib/quote-sharing');
 const url=new URL(quoteQuoDraftUrl(quote,'https://app.bolttire.com'));
 assert.equal(url.protocol,'openphone:');assert.equal(url.hostname,'message');
 assert.equal(url.searchParams.get('number'),'+18455550123');
 assert.equal(url.searchParams.get('text'),quoteShareText(quote,'https://app.bolttire.com'));
 assert.ok(url.searchParams.get('text').endsWith('https://app.bolttire.com/q/test-token'));
 assert.match(url.searchParams.get('text'),/Hi Pat, your Bolt Tire quote #123/);
 for(const phone of [null,'','abc','123','8455550123 ext 4','8455550123,2125550123'])assert.equal(quoteQuoDraftUrl({...quote,phone},'https://app.bolttire.com'),null);
 assert.equal(quoteTextRecipient('+1 845 555 0123'),'+18455550123');
 assert.equal(quoteTextRecipient('+44 20 7946 0958'),'+442079460958');
 assert.equal(quoteQuoDraftUrl({...quote,public_token:''},'https://app.bolttire.com'),null);
});
test('Text Quote opens an in-app preview without deep links, copying or sending',async()=>{
 let open=false;const messages=[];
 const Button=loader({react:{...React,useState:()=>[open,v=>{open=v;}]},'@/lib/supabase':{supabase:{}}})('components/TextQuoteButton').default;
 const render=q=>Button({quote:q||quote,onMessage:m=>messages.push(m)}).props.children;
  assert.equal(render()[0].props.disabled,false);assert.equal(render({...quote,phone:''})[0].props.disabled,true);
  assert.equal(render()[1],false);
  render()[0].props.onClick();assert.equal(open,true);assert.equal(messages.length,0);
  assert.equal(render()[1].props.quoteId,quote.id);
  render()[1].props.onClose();assert.equal(open,false);
});
test('quote previews are static public branding with no customer lookup or indexing',()=>{
 const {metadata}=loader()('app/q/layout');
 assert.equal(metadata.openGraph.siteName,'Bolt Tire');
 assert.equal(metadata.openGraph.images[0].url,'/quote-preview');
 assert.equal(metadata.openGraph.images[0].width,1200);
 assert.deepEqual(metadata.robots,{index:false,follow:false});
 assert.equal(metadata.twitter.card,'summary_large_image');
 for(const file of ['app/q/layout.tsx','app/quote-preview/route.tsx']){
  const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
  assert.ok(!/supabase|public_token|customer|quote_number/.test(source.replace(/\/\/[^\n]*/g,'')));
 }
});
