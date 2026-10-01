const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function setup(pathname='/settings'){
 const events={},removed=[],focus={called:false};let effect;
 const menu={open:false,contains:node=>node?.inside===true,querySelector:()=>({focus:()=>{focus.called=true}})};
 const document={addEventListener:(key,fn)=>events[key]=fn,removeEventListener:(key,fn)=>removed.push([key,fn])};
 const css=new Proxy({},{get:(_,key)=>String(key)});
 const stubs={'next/navigation':{usePathname:()=>pathname,useRouter:()=>({push(){},replace(){}})},'next/link':{__esModule:true,default:props=>React.createElement('a',props)},'@/lib/supabase':{supabase:{auth:{signOut:async()=>{}}}},'./AppHeader.module.css':{__esModule:true,default:css},react:{...React,useRef:()=>({current:menu}),useEffect:fn=>effect=fn}};
 const m=new Module(__filename,module);m.paths=module.paths;m.require=id=>Object.hasOwn(stubs,id)?stubs[id]:require(id);
 m._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/AppHeader.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,__filename);
 return {Header:m.exports.default,menu,document,events,removed,focus,start:()=>effect()};
}
function find(node,type,result=[]){if(Array.isArray(node))node.forEach(n=>find(n,type,result));else if(node&&typeof node==='object'){if(node.type===type)result.push(node);find(node.props?.children,type,result);}return result;}
test('navigation uses a disclosure with all 14 links instead of Safari native select',()=>{
 for(const path of ['/settings','/jobs/123','/']){const s=setup(path);const html=renderToStaticMarkup(React.createElement(s.Header));assert(!html.includes('<select'));assert.match(html,/<details/);assert.match(html,/<summary[^>]*Navigate to another page/);assert.equal((html.match(/<a /g)||[]).length,14);assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert(html.includes('Tire Receiving'));assert(html.includes('Supplier Orders'));assert.match(html,/href="\/settings"/);const current=path.startsWith('/jobs')?'/jobs':path;assert(html.includes(`href="${current}" class="link" aria-current="page"`));}
});
test('escape closes and restores focus, outside pointer closes, and listeners are cleaned up',()=>{
 const s=setup(),oldDoc=global.document,oldNode=global.Node;global.document=s.document;global.Node=class{};
 try{s.Header();const cleanup=s.start();s.menu.open=true;let prevented=false;s.events.keydown({key:'Escape',preventDefault(){prevented=true}});assert(!s.menu.open&&s.focus.called&&prevented);s.menu.open=true;const inside=new Node();inside.inside=true;s.events.pointerdown({target:inside});assert(s.menu.open);s.events.pointerdown({target:new Node()});assert(!s.menu.open);cleanup();assert.equal(s.removed.length,2);}finally{global.document=oldDoc;global.Node=oldNode;}
});
test('tabbing outside closes while moving focus within keeps navigation open',()=>{const s=setup();const tree=s.Header();const details=find(tree,'details')[0];s.menu.open=true;details.props.onBlur({currentTarget:s.menu,relatedTarget:{inside:true}});assert(s.menu.open);details.props.onBlur({currentTarget:s.menu,relatedTarget:{inside:false}});assert(!s.menu.open);});
test('menu is anchored below the trigger and remains scrollable on desktop and mobile',()=>{const css=fs.readFileSync(require.resolve('../components/AppHeader.module.css'),'utf8');assert.match(css,/top:calc\(100% \+ 8px\)/);assert.match(css,/overflow-y:auto/);assert.match(css,/100dvh - 180px/);assert.match(css,/max-width:calc\(100vw - 32px\)/);assert.match(css,/min-height:44px/);assert.match(css,/focus-visible/);});
