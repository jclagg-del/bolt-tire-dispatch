// Optional real-browser regression: LABEL_BROWSER_TEST=1 node --test tests/tire-label-pagination.test.cjs
// PLAYWRIGHT_MODULE may point at an installed Playwright package outside this repo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PDFDocument } = require('pdf-lib');

test('real print engine keeps each whole label on one 4x6 page, including long vehicle details', { skip: !process.env.LABEL_BROWSER_TEST }, async () => {
  const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const mod = new Module(__filename, module); mod.paths = module.paths;
  mod.require = name => name === 'react-dom' ? { createPortal: content => content } : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('../components/TireLabelPrint.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, __filename);
  const { default: Print, fitTireLabels } = mod.exports;
  const css = fs.readFileSync(require.resolve('../app/globals.css'), 'utf8');
  const job = {
    id: 'sample', jobNumber: 'SAMPLE-123', moNumber: '(188820) Sample technician',
    serviceType: 'Delivery', tires: '235/65R17 104H SL ASSURANCE MAXLIFE 2',
    productNumber: '110090702', facilityName: 'Wallkill', scheduled: '2026-10-19T12:00:00',
    vehicle: '2025 Toyota Sienna • Color: Grey • Plate: SAMPLE NY',
  };
  const engines = process.env.LABEL_CHROMIUM_ONLY ? [chromium] : [chromium, webkit];
  for (const engine of engines) {
    const browser = await engine.launch(engine === chromium && process.env.LABEL_CHROME_PATH ? { executablePath: process.env.LABEL_CHROME_PATH } : {});
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      for (const [quantity, long] of [[1, false], [2, false], [4, false], [24, false], [2, true]]) {
        global.document = { body: {} };
        let html;
        try { html = renderToStaticMarkup(React.createElement(Print, { job: {
          ...job, quantity,
          ...(long ? { tires: job.tires.repeat(4), moNumber: job.moNumber.repeat(3), vehicle: job.vehicle.repeat(6) } : {}),
        } })); } finally { delete global.document; }
        await page.emulateMedia({ media: 'screen' });
        await page.setContent(`<style>${css}</style><main style="height:5000px">Not printed</main>${html}`);
        await page.evaluate(`(${fitTireLabels.toString()})(document.querySelector('.tire-label-print-root'))`);
        assert.equal(await page.locator('.tire-label-print-root').evaluate(el => getComputedStyle(el).visibility), 'hidden');
        await page.emulateMedia({ media: 'print' });
        await page.evaluate(`(${fitTireLabels.toString()})(document.querySelector('.tire-label-print-root'))`);
        const geometry = await page.locator('.tire-receiving-label').evaluateAll(labels => labels.map(el => {
          const box = el.getBoundingClientRect();
          const content = el.querySelector('.tire-label-content').getBoundingClientRect();
          const footer = el.querySelector('p').getBoundingClientRect();
          return { height: box.height, bottom: box.bottom, right: box.right, contentBottom: content.bottom, footerBottom: footer.bottom, footerRight: footer.right };
        }));
        for (const g of geometry) {
          assert.ok(g.height < 5.7 * 96);
          assert.ok(g.contentBottom <= g.bottom + 1);
          assert.ok(g.footerBottom <= g.bottom + 1);
          assert.ok(g.footerRight <= g.right + 1);
        }
        if (engine === chromium) {
          const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
          const doc = await PDFDocument.load(bytes);
          assert.equal(doc.getPageCount(), quantity, `${quantity} tires / long=${long}`);
          for (const p of doc.getPages()) assert.deepEqual(p.getSize(), { width: 288, height: 432 });
          if (quantity === 2 && !long && process.env.LABEL_PDF_PROOF) fs.writeFileSync(process.env.LABEL_PDF_PROOF, bytes);
        }
      }
    } finally { await browser.close(); }
  }
});
