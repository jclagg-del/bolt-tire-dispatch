const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript'), React = require('react');
function harness(file, stubs={}) {
  const hooks=[]; let cursor=0;
  const mockReact={...React,useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v];},useRef(initial){const i=cursor++;return hooks[i]??={current:initial};},useEffect(){},useMemo(fn){return fn();}};
  const cache=new Map();
  function load(file){
    file=path.resolve(__dirname,'..',file);if(!path.extname(file))file+=fs.existsSync(file+'.ts')?'.ts':'.tsx';
    if(cache.has(file))return cache.get(file).exports;
    const m=new Module(file,module);m.paths=module.paths;cache.set(file,m);
    m.require=id=>id==='react'?mockReact:Object.hasOwn(stubs,id)?stubs[id]:id.startsWith('@/')?load(id.slice(2)):require(id);
    m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);return m.exports;
  }
  const Component=load(file).default;
  return {hooks,render(props){cursor=0;return Component(props);}};
}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const tick=()=>new Promise(setImmediate);
const png={name:'tire.png',type:'image/png',size:100};

test('photo control accepts clipboard images, file drops, and picker replacement',async()=>{
 const calls=[],h=harness('components/QuoteTirePhoto.tsx');
 const props={label:'Rear tire photo',src:'old.png',alt:'Rear tire',onUpload:async f=>calls.push(f)};
 const box=()=>nodes(h.render(props)).find(n=>n.props?.role==='button');
 let prevented=0;
 box().props.onPaste({preventDefault(){prevented++;},clipboardData:{items:[{type:'text/plain'},{type:'image/png',getAsFile:()=>png}]}});
 await tick();assert.equal(calls[0],png);assert.equal(prevented,1);
 box().props.onDrop({preventDefault(){},dataTransfer:{files:[{type:'text/plain'},png]}});await tick();assert.equal(calls.length,2);
 const target={files:[png],value:'photo.png'};
 nodes(h.render(props)).find(n=>n.type==='input').props.onChange({target});await tick();assert.equal(calls.length,3);assert.equal(target.value,'');
 assert.equal(box().props['aria-label'],'Rear tire photo');
 assert(!nodes(h.render(props)).some(n=>n.type==='input'&&n.props.type==='text'));
});

test('photo validation, concurrent taps, errors and retry retain the existing image',async()=>{
 let resolve,fail=false,count=0;
 const h=harness('components/QuoteTirePhoto.tsx');
 const props={label:'Rear tire photo',src:'old.png',alt:'Rear',onUpload:async()=>{count++;await new Promise(r=>resolve=r);if(fail)throw Error('Connection lost');}};
 const box=()=>nodes(h.render(props)).find(n=>n.props?.role==='button');
 const drop=f=>box().props.onDrop({preventDefault(){},dataTransfer:{files:[f]}});
 drop({...png,type:'image/gif'});assert.equal(count,0);
 drop({...png,size:9*1024*1024});assert.equal(count,0);
 drop(png);drop(png);assert.equal(count,1);assert.equal(box().props['aria-busy'],true);
 fail=true;resolve();await tick();assert.equal(box().props['aria-busy'],false);
 assert(nodes(h.render(props)).some(n=>n.props?.role==='alert'&&/Connection lost/.test(n.props.children)));
 assert(nodes(h.render(props)).some(n=>n.type==='img'&&n.props.src==='old.png'));
 fail=false;drop(png);resolve();await tick();assert.equal(count,2);
 assert(!nodes(h.render(props)).some(n=>n.props?.role==='alert'));
 props.disabled=true;drop(png);assert.equal(count,2);
});

test('staggered editor keeps axle photos separate, synchronizes sizes, and waits for both uploads before saving',async()=>{
 const pending=[],written={},alerts=[];
 const blank=()=>null;
 const supabase={storage:{from(bucket){assert.equal(bucket,'quote-images');return{
   upload(path,file,opts){assert.equal(opts.upsert,false);return new Promise(resolve=>pending.push({path,resolve}));},
   getPublicUrl(path){return{data:{publicUrl:'https://images.example/'+path}};}
 };}},from(table){let values;const q={update(v){values=v;return q;},insert(v){values=v;written.quote=v;return q;},upsert(v){written.options=v;return q;},delete(){return q;},eq(){return q;},not(){return q;},select(){return q;},single:async()=>({data:{id:'test'}}),then(ok){return Promise.resolve({data:table==='quote_options'?[{id:'option'}]:null,error:null}).then(ok);}};return q;}};
 const h=harness('app/quotes/new/page.tsx',{'next/navigation':{useRouter:()=>({push(){}}),useSearchParams:()=>({get:()=>null})},'@/lib/supabase':{supabase},'@/components/AppHeader':{default:blank},'@/components/QuoteCustomerInput':{default:blank},'@/components/AdditionalItemsEditor':{default:blank},'@/components/QuoteTirePhoto':{default:blank}});
 const previous={alert:global.alert,sessionStorage:global.sessionStorage};global.alert=m=>alerts.push(m);global.sessionStorage={removeItem(){}};
 try{
 const all=()=>nodes(h.render());
 all().find(n=>n.props?.className==='quote-split-toggle').props.children[0].props.onChange({target:{checked:true}});
 const form=h.hooks.find(v=>v?.customer!==undefined);form.customer='Test';
 const options=h.hooks.find(Array.isArray);options[0].brand='Front';options[0].model='A';options[0].rear_brand='Rear';options[0].rear_model='B';
 const front=()=>all().find(n=>n.props?.label==='Front tire photo'),rear=()=>all().find(n=>n.props?.label==='Rear tire photo');
 assert(front());assert(rear());assert(!all().some(n=>/image url/i.test(n.props?.label||'')));
 all().find(n=>n.props?.label==='Front tire size').props.onChange('285/45R22');
 all().filter(n=>n.props?.label==='Rear tire size').at(-1).props.onChange('325/40R22');
 assert.equal(all().find(n=>n.props?.label==='Front / primary tire size').props.value,'285/45R22');
 assert(all().filter(n=>n.props?.label==='Rear tire size').every(n=>n.props.value==='325/40R22'));
 const a=front().props.onUpload(png),b=rear().props.onUpload(png);
 const save=()=>all().find(n=>n.props?.className==='quote-primary');
 assert.equal(save().props.disabled,true);await save().props.onClick();assert.equal(written.quote,undefined);
 pending[1].resolve({error:null});await b;assert.equal(save().props.disabled,true);
 assert.equal(rear().props.src,'https://images.example/'+pending[1].path);assert.equal(front().props.src,'');
 pending[0].resolve({error:null});await a;assert.equal(save().props.disabled,false);
 await save().props.onClick();
 assert.equal(written.quote.tire_size,'285/45R22');assert.equal(written.quote.rear_tire_size,'325/40R22');
 assert.equal(written.options[0].image_url,'https://images.example/'+pending[0].path);
 assert.equal(written.options[0].rear_image_url,'https://images.example/'+pending[1].path);
 }finally{global.alert=previous.alert;global.sessionStorage=previous.sessionStorage;}
});
