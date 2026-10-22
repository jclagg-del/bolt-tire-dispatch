const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
test('Sales Tax has its own page with one existing quarterly report and a link back to Billing',()=>{
 const file=require.resolve('../app/sales-tax/page.tsx'),mod=new Module(file,module);mod.paths=module.paths;
 let reportCount=0;
 const stubs={
  'next/link':{__esModule:true,default:props=>React.createElement('a',props)},
  '@/components/AppHeader':{__esModule:true,default:()=>React.createElement('header',null,'Navigation')},
  '@/components/QuarterlyTaxReport':{__esModule:true,default:()=>{reportCount++;return React.createElement('section',{'aria-label':'NY quarterly tax report'});}},
 };
 mod.require=id=>Object.hasOwn(stubs,id)?stubs[id]:require(id);
 mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);
 const html=renderToStaticMarkup(React.createElement(mod.exports.default));
 assert.match(html,/<h1[^>]*>Sales Tax<\/h1>/);assert.equal(reportCount,1);assert.match(html,/href="\/billing"/);assert.match(html,/NY quarterly tax report/);
 const billing=fs.readFileSync(require.resolve('../app/billing/page.tsx'),'utf8');assert.ok(!billing.includes('QuarterlyTaxReport'));
 const header=fs.readFileSync(require.resolve('../components/AppHeader.tsx'),'utf8');assert.match(header,/label: "Sales Tax", path: "\/sales-tax"/);
});
