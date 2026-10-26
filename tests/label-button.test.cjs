const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const React=require('react');

function harness(connection, fail=false) {
 const state=[];let cursor=0;const calls=[];
 const m=new Module(__filename,module);m.paths=module.paths;
 m.require=name=>name==='react'?{...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useEffect(){}}:name==='@/lib/tire-label-pdf'?{
  async tireLabelPdf(job,scale){calls.push({job,scale});if(fail)throw new Error('Sample preparation error');return new Uint8Array([1,2,3]);},
  labelCount:()=>4,smoothPrintUrl:()=> 'brotherwebprint://print?sample=1',
 }:require(name);
 m._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/BluetoothLabelButton.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,__filename);
 const job={id:'sample',quantity:4,contactName:'Sample Person',address:'Sample address',phone:'555-0100'};
 const render=()=>{cursor=0;return m.exports.default({job,connection});};
 const elements=(node)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(elements):[node,...elements(node.props?.children)];
 return {render,elements,calls};
}

test('Wi-Fi and Bluetooth clicks prepare the same labels and expose working PDF/handoff links',async()=>{
 for(const connection of ['wifi','bluetooth']) {
  const h=harness(connection);
  const button=h.elements(h.render()).find(e=>e.type==='button');
  await button.props.onClick();
  const dialog=h.elements(h.render());
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].scale,80);
  assert.equal(h.calls[0].job.contactName,'Sample Person');
  assert.ok(dialog.some(e=>e.props?.role==='dialog'));
  const pdf=dialog.find(e=>e.type==='a'&&e.props.target==='_blank');
  assert.ok(pdf.props.href.startsWith('blob:'));assert.equal(pdf.props.rel,'noopener noreferrer');
  assert.ok(dialog.some(e=>e.type==='a'&&e.props.href.startsWith('brotherwebprint:')));
  const scale=dialog.find(e=>e.type==='select');
  scale.props.onChange({target:{value:'90'}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.at(-1).scale,90);
  URL.revokeObjectURL(pdf.props.href);
  const updated=h.elements(h.render()).find(e=>e.type==='a'&&e.props.target==='_blank');
  URL.revokeObjectURL(updated.props.href);
 }
});

test('preparation failures show an error rather than a silent print-button failure',async()=>{
 const h=harness('wifi',true);
 await h.elements(h.render()).find(e=>e.type==='button').props.onClick();
 const dialog=h.elements(h.render());
 assert.equal(dialog.find(e=>e.props?.role==='alert').props.children,'Sample preparation error');
 assert.ok(!dialog.some(e=>e.type==='a'));
});
