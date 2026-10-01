const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function setup(pathname='/settings'){
 const events={},removed=[],focus={called:false};let open=false,refIndex=0,effects=[];
 const menu={contains:node=>node?.inside===true},trigger={focus:()=>{focus.called=true}};
 const document={addEventListener:(key,fn)=>events[key]=fn,removeEventListener:(key,fn)=>removed.push([key,fn])};
 const css=new Proxy({},{get:(_,key)=>String(key)});
 const stubs={'next/navigation':{usePathname:()=>pathname,useRouter:()=>({push(){},replace(){}})},'next/link':{__esModule:true,default:props=>React.createElement('a',props)},'@/lib/supabase':{supabase:{auth:{signOut:async()=>{}}}},'./AppHeader.module.css':{__esModule:true,default:css},react:{...React,useRef:()=>({current:refIndex++===0?menu:trigger}),useId:()=> 'navigation-panel',useState:()=>[open,next=>{open=typeof next==='function'?next(open):next}],useEffect:fn=>effects.push(fn)}};
 const m=new Module(__filename,module);m.paths=module.paths;m.require=id=>Object.hasOwn(stubs,id)?stubs[id]:require(id);
 m._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/AppHeader.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,__filename);
 const render=()=>{refIndex=0;effects=[];return m.exports.default();};
 return {render,menu,document,events,removed,focus,get open(){return open},start:()=>effects[1]()};
}
function find(node,type,result=[]){if(Array.isArray(node))node.forEach(n=>find(n,type,result));else if(node&&typeof node==='object'){if(node.type===type)result.push(node);find(node.props?.children,type,result);}return result;}
const trigger=tree=>find(tree,'button').find(node=>node.props['aria-controls']);
test('navigation uses a real button, exposes all routes and marks the active page',()=>{
 for(const path of ['/settings','/jobs/123','/']){const s=setup(path);const html=renderToStaticMarkup(s.render());assert(!html.includes('<select')&&!html.includes('<details'));assert.match(html,/<button[^>]*aria-expanded="false"/);assert.equal((html.match(/<a /g)||[]).length,14);assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.match(html,/<nav[^>]*hidden=""/);const current=path.startsWith('/jobs')?'/jobs':path;assert(html.includes(`href="${current}" class="link" aria-current="page"`));}
});
test('click opens the panel and a second click closes it with matching accessibility state',()=>{const s=setup();trigger(s.render()).props.onClick();assert(s.open);let tree=s.render();assert.equal(trigger(tree).props['aria-expanded'],true);assert.equal(find(tree,'nav')[0].props.hidden,false);assert.equal(find(tree,'div').some(node=>node.props.onBlur),false);trigger(tree).props.onClick();assert(!s.open);assert.equal(find(s.render(),'nav')[0].props.hidden,true);});
test('Safari-style blur does not dismiss links; outside focus, pointer and Escape close deliberately',()=>{
 const s=setup(),oldDoc=global.document,oldNode=global.Node;global.document=s.document;global.Node=class{};
 try{
  trigger(s.render()).props.onClick();s.render();const cleanup=s.start();const inside=new Node();inside.inside=true;
  s.events.pointerdown({target:inside});s.events.focusin({target:inside});assert(s.open);assert(!s.events.blur);
  s.events.focusin({target:new Node()});assert(!s.open);
  trigger(s.render()).props.onClick();s.render();s.events.pointerdown({target:new Node()});assert(!s.open);
  trigger(s.render()).props.onClick();s.render();let prevented=false;s.events.keydown({key:'Escape',preventDefault(){prevented=true}});assert(!s.open&&s.focus.called&&prevented);
  cleanup();assert.equal(s.removed.length,3);
 }finally{global.document=oldDoc;global.Node=oldNode;}
});
test('a navigation link stays mounted and targets the route when selected',()=>{const s=setup();trigger(s.render()).props.onClick();const links=find(s.render(),'nav')[0].props.children;const shop=links.find(link=>link.props.href==='/tire-shop');assert(shop);shop.props.onClick();assert(!s.open);assert.equal(find(s.render(),'nav')[0].props.children.length,14);});
test('menu is below the trigger, hidden explicitly, scrollable and responsive',()=>{const css=fs.readFileSync(require.resolve('../components/AppHeader.module.css'),'utf8');assert.match(css,/top:calc\(100% \+ 8px\)/);assert.match(css,/\.panel\[hidden\]\{display:none\}/);assert.match(css,/overflow-y:auto/);assert.match(css,/100dvh - 180px/);assert.match(css,/max-width:calc\(100vw - 32px\)/);assert.match(css,/min-height:44px/);});
