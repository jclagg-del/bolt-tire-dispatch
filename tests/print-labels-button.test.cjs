const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module'), ts = require('typescript'), React = require('react');

function harness({fail=false, delayed=false, launchThrows=false}={}) {
  const state=[], refs=[], effects=[], calls=[], launches=[], waiting=[];
  let cursor=0, refCursor=0, effectCursor=0, job={id:'sample',quantity:2,contactName:'Sample Person'};
  const previous={window:global.window,document:global.document};
  global.document={body:{}};
  global.window={location:{assign(url){if(launchThrows)throw Error('blocked'); launches.push(url);}}};
  const m=new Module(__filename,module);m.paths=module.paths;
  m.require=name=>name==='react'?{...React,
    useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},
    useRef(initial){return refs[refCursor++]??=( {current:initial} );},
    useEffect(fn,deps){const i=effectCursor++,old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();effects[i]={deps,cleanup:fn()};}},
  }:name==='react-dom'?{createPortal:node=>node}:name==='@/lib/tire-label-pdf'?{
    async tireLabelPdf(snapshot,scale){calls.push({snapshot,scale});if(delayed)await new Promise(r=>waiting.push(r));if(fail)throw Error('PDF failed');return new Uint8Array([snapshot.quantity]);},
    smoothPrintUrl(bytes,filename,gap){return `brotherwebprint://print?qty=${bytes[0]}&gap=${gap}`;},labelCount:q=>q,
  }:require(name);
  m._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/PrintLabelsButton.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,__filename);
  const render=(disabled=false)=>{cursor=refCursor=effectCursor=0;return m.exports.default({job,disabled});};
  const elements=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(elements):[n,...elements(n.props?.children)];
  const nodes=()=>elements(render());
  const button=(disabled=false)=>elements(render(disabled)).find(e=>e.type==='button'&&e.props.children==='Print labels');
  const tick=()=>new Promise(r=>setImmediate(r));
  const cleanup=()=>{effects.forEach(e=>e.cleanup?.());for(const k of ['window','document']){if(previous[k]===undefined)delete global[k];else global[k]=previous[k];}};
  return {render,nodes,button,tick,cleanup,calls,launches,waiting,setJob:value=>{job=value;}};
}

test('one Print labels tap launches Smooth Print synchronously using prebuilt 80% labels',async()=>{
 const h=harness();try{
  assert.equal(h.button().props.disabled,true);
  await h.tick();assert.equal(h.button().props.disabled,false);
  assert.equal(h.calls[0].scale,80);assert.equal(h.calls[0].snapshot.contactName,'Sample Person');
  assert.equal(h.launches.length,0,'preparing must never print automatically');
  h.button().props.onClick();
  assert.equal(h.launches.length,1,'handoff happens before any await');
  assert.match(h.launches[0],/^brotherwebprint:\/\/print\?/);
  assert.ok(h.nodes().some(e=>e.props?.role==='dialog'));
  assert.ok(h.nodes().some(e=>e.type==='a'&&e.props.children==='Backup label PDF'));
  assert.equal(h.button(true).props.disabled,true);
 }finally{h.cleanup();}
});

test('a changed job cannot launch stale labels; late generation is discarded',async()=>{
 const h=harness({delayed:true});try{
  h.render();await h.tick();
  h.setJob({id:'sample',quantity:4,contactName:'Updated Person'});h.render();await h.tick();
  h.waiting[0]();await h.tick();assert.equal(h.button().props.disabled,true);
  h.waiting[1]();await h.tick();assert.equal(h.button().props.disabled,false);
  h.button().props.onClick();assert.match(h.launches[0],/qty=4/);
  const size=h.nodes().find(e=>e.type==='select');size.props.onChange({target:{value:'90'}});
  assert.equal(h.button().props.disabled,true);await h.tick();
  assert.equal(h.calls.at(-1).scale,90);
 }finally{h.cleanup();}
});

test('PDF errors remain visible and provide retry without launching the printer',async()=>{
 const h=harness({fail:true});try{
  h.render();await h.tick();h.button().props.onClick();
  assert.ok(h.nodes().some(e=>e.props?.role==='alert'&&e.props.children==='PDF failed'));
  assert.ok(h.nodes().some(e=>e.type==='button'&&e.props.children==='Retry preparing labels'));
  assert.equal(h.launches.length,0);
 }finally{h.cleanup();}
});

test('failed app launches show help and preserve PDF fallback',async()=>{
 const h=harness({launchThrows:true});try{
  h.render();await h.tick();assert.doesNotThrow(()=>h.button().props.onClick());
  assert.ok(h.nodes().some(e=>e.props?.role==='alert'&&/could not open/.test(e.props.children)));
  assert.ok(h.nodes().some(e=>e.type==='a'&&e.props.children==='Backup label PDF'));
 }finally{h.cleanup();}
});
