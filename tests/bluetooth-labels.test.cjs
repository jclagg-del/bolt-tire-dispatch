const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {PDFDocument,decodePDFRawStream}=require('pdf-lib');
const mod=new Module(__filename,module);mod.paths=module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/tire-label-pdf.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,__filename);
const {tireLabelPdf,smoothPrintUrl,labelCount}=mod.exports;
const job={id:'sample',jobNumber:'3097885',moNumber:'919205',customer:'Sample Fleet',facilityName:'North Facility',serviceType:'Delivery',tires:'GOODYEAR Assurance ComfortDrive',size:'235/40R18 95W XL',productNumber:'413134582',quantity:2,vehicle:'2017 Honda Civic - White',scheduled:'2026-10-08T16:00:00Z'};
function content(doc,page){return page.node.Contents().asArray().map(ref=>Buffer.from(decodePDFRawStream(doc.context.lookup(ref)).decode()).toString()).join('\n');}
test('Bluetooth labels have exact 4x6 pages, default 80% content and no spacer pages',async()=>{
 const bytes=await tireLabelPdf(job);const doc=await PDFDocument.load(bytes);
 assert.equal(doc.getPageCount(),2);
 for(const page of doc.getPages()){
  assert.deepEqual(page.getSize(),{width:288,height:432});
  assert.match(content(doc,page),/0\.8 0 0 0\.8 0 0 cm/);
 }
 if(process.env.LABEL_PDF_PROOF)fs.writeFileSync(process.env.LABEL_PDF_PROOF,bytes);
 for(const [input,count] of [[0,1],[1,1],[4,4],[99,24]])assert.equal(labelCount(input),count);
 const max=await PDFDocument.load(await tireLabelPdf({...job,quantity:24}));assert.equal(max.getPageCount(),24);
});
test('print size changes only content, not label/page dimensions, and invalid values fail closed',async()=>{
 for(const scale of [75,80,90,100]){
  const doc=await PDFDocument.load(await tireLabelPdf({...job,quantity:1},scale));
  assert.deepEqual(doc.getPage(0).getSize(),{width:288,height:432});
  assert.ok(content(doc,doc.getPage(0)).includes(`${scale/100} 0 0 ${scale/100} 0 0 cm`));
 }
 await assert.rejects(tireLabelPdf(job,101),/supported label print size/);
 await assert.rejects(tireLabelPdf({...job,tires:'VERY LONG '.repeat(300)}),/too much text/);
 await tireLabelPdf({...job,customer:'José — Fleet 🚚',productNumber:'A(123)\\456'});
});
test('Smooth Print receives the PDF locally, exact media dimensions and one copy of each numbered page',async()=>{
 const bytes=await tireLabelPdf(job);
 const url=new URL(smoothPrintUrl(bytes,'bolt-labels-test.pdf'));
 assert.equal(url.protocol,'brotherwebprint:');assert.equal(url.hostname,'print');
 const p=url.searchParams;
 assert.equal(p.get('copies'),'1');assert.equal(p.get('paperType'),'dieCut');
 assert.equal(p.get('tapeWidth'),'101.6');assert.equal(p.get('tapeLength'),'152.4');assert.equal(p.get('unit'),'mm');assert.equal(p.get('gapLength'),'3');
 assert.equal(p.get('printMode'),'original');assert.equal(p.get('orientation'),'portrait');
 assert.deepEqual(Buffer.from(p.get('fileattach'),'base64'),Buffer.from(bytes));
 assert.ok(!url.toString().includes('https'));assert.ok(!url.toString().includes('access_token'));
 for(const gap of [-1,11,NaN,Infinity])assert.throws(()=>smoothPrintUrl(bytes,'bolt-labels-test.pdf',gap));
 assert.throws(()=>smoothPrintUrl(bytes,'https://example.com/customer.pdf'));
 assert.equal(new URL(smoothPrintUrl(bytes,'bolt-labels-test.pdf',2)).searchParams.get('gapLength'),'2');
});
test('both staff label screens offer Bluetooth while retaining existing AirPrint behavior',()=>{
 for(const file of ['app/jobs/[id]/page.tsx','app/tire-receiving/page.tsx']){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert.ok(source.includes('<BluetoothLabelButton'));assert.ok(source.includes('window.print()'));
 }
 const source=fs.readFileSync(path.join(__dirname,'../components/BluetoothLabelButton.tsx'),'utf8');
 assert.ok(source.includes('URL.revokeObjectURL'));assert.ok(source.includes('useState(80)'));
 assert.ok(source.includes('Returning here does not mean the labels printed'));
 assert.ok(!source.includes('fetch('));assert.ok(!source.includes('supabase'));
});
