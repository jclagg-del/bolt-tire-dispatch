const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),React=require('react');
function harness({delayed=false,fail=false}={}) {
 const state=[],effects=[],refs=[],waiting=[],launches=[],calls=[];let cursor=0,ec=0,rc=0,date='2026-11-25';
 const saved=Object.fromEntries(['window','document','fetch'].map(k=>[k,global[k]]));
 global.document={body:{}};global.window={location:{assign:url=>launches.push(url)}};
 const row=(id,customer,site)=>({id,customer,facility_name:site,scheduled:date+'T09:00:00',service_type:'Delivery',qty:4,tires:'Test tire',size:'205/55R16'});
 global.fetch=async url=>url==='/bolt-logo.png'?{ok:false}:{ok:!fail,json:async()=>fail?{error:'Unable to load'}:{date,jobs:[row(1,'Kingdom Support Services','Wallkill'),row(2,'Kingdom Support Services','Warwick'),row(3,'HPR','HPR')]}};
 const stubs={react:{...React,useId:()=> 'test-id',useMemo:fn=>fn(),useRef:x=>refs[rc++]??={current:x},
  useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v]},
  useEffect(fn,deps){const i=ec++,old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();effects[i]={deps,cleanup:fn()}}}},
  'react-dom':{createPortal:n=>n},'@/lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}}},
  '@/lib/delivery-manifest-pdf':{async deliveryManifestPdf(manifest){calls.push(manifest);if(delayed)await new Promise(r=>waiting.push(r));return {bytes:new Uint8Array([manifest.total]),pages:1}}},
  '@/lib/tire-label-pdf':{smoothPrintUrl:bytes=>'brotherwebprint://print?qty='+bytes[0]},
 };
 const cache=new Map();function load(file){const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;const m=new Module(filename,module);m.paths=module.paths;cache.set(filename,m);m.require=n=>Object.hasOwn(stubs,n)?stubs[n]:n.startsWith('@/')?load(n.slice(2)+'.ts'):require(n);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,filename);return m.exports;}
 const Component=load('components/DeliveryManifestButton.tsx').default;
 const elements=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(elements):[n,...elements(n.props?.children)];
 const nodes=()=>{cursor=ec=rc=0;return elements(Component({date}))};
 const button=name=>nodes().find(n=>n.type==='button'&&n.props.children===name);
 const tick=()=>new Promise(r=>setImmediate(r));
 return{nodes,button,tick,calls,launches,waiting,setDate:x=>date=x,async open(){button('Print bill of lading').props.onClick({stopPropagation(){}});nodes();await tick();nodes();await tick()},cleanup(){effects.forEach(e=>e.cleanup?.());for(const [k,v]of Object.entries(saved)){if(v===undefined)delete global[k];else global[k]=v}}};
}
test('delivery print prepares without launching, isolates organizations, and handoff is synchronous',async()=>{
 const h=harness();try{await h.open();assert.equal(h.launches.length,0);assert.equal(h.calls[0].organization,'HPR');
  const group=h.nodes().find(n=>n.type==='select');const options=group.props.children;const kingdom=options.find(n=>n.props.children.flat(Infinity).includes('Wallkill'));
  group.props.onChange({target:{value:kingdom.props.value}});assert.equal(h.button('Print with Smooth Print').props.disabled,true);await h.tick();
  assert.equal(h.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox').length,2);
  h.button('Print with Smooth Print').props.onClick();assert.equal(h.launches.length,1);assert.match(h.launches[0],/qty=4/);
  const checks=h.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox');checks.find(n=>!n.props.checked).props.onChange({target:{checked:true}});
  assert.equal(h.button('Print with Smooth Print').props.disabled,true);await h.tick();h.button('Print with Smooth Print').props.onClick();assert.match(h.launches[1],/qty=8/);
 }finally{h.cleanup()}
});
test('late PDFs cannot print a previous date and closing does not launch',async()=>{
 const h=harness({delayed:true});try{await h.open();h.setDate('2026-11-26');h.nodes();await h.tick();h.nodes();await h.tick();
 h.waiting[0]();await h.tick();assert.equal(h.button('Print with Smooth Print').props.disabled,true);
 h.waiting[1]();await h.tick();assert.equal(h.button('Print with Smooth Print').props.disabled,false);
 h.button('Close').props.onClick();h.nodes();assert.equal(h.launches.length,0);
 }finally{h.cleanup()}
});
test('load errors expose retry and never offer a stale print',async()=>{
 const h=harness({fail:true});try{await h.open();assert.ok(h.nodes().some(n=>n.props?.role==='alert'&&n.props.children==='Unable to load'));assert.ok(h.button('Reload deliveries'));assert.equal(h.button('Print with Smooth Print'),undefined);assert.equal(h.launches.length,0)}finally{h.cleanup()}
});
