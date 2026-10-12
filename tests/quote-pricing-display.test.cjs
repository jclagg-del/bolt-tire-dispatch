const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function renderQuote(quote) {
  let stateIndex = 0;
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(__dirname, '..', relative);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module); mod.paths = module.paths; cache.set(file, mod);
    mod.require = id => {
      if (id === 'react') return { ...React, useEffect() {}, useState(initial) {
        return [stateIndex++ === 0 ? quote : typeof initial === 'function' ? initial() : initial, () => {}];
      }};
      if (id === 'next/navigation') return { useParams: () => ({token:'test'}), useSearchParams: () => new URLSearchParams() };
      if (['@/components/EmbeddedStripeCheckout', '@/components/PaymentMethodCheckout', '@/components/QuoteCheckoutInformation'].includes(id)) return {__esModule:true,default: () => null};
      if (id.startsWith('@/')) return load(id.slice(2) + (id.startsWith('@/components/') ? '.tsx' : '.ts'));
      return require(id);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);
    return mod.exports;
  }
  return renderToStaticMarkup(load('app/q/[token]/page.tsx').default());
}
const option = { id:'one', brand:'FALKEN', model:'Aklimate', price_per_tire:150, warranty_miles:65000 };
const quote = { quote_number:1, customer:'Example', payment_pricing_version:1, payment_status:'unpaid', quantity:2, installation_cost:189, service_call_fee:0, disposal_fee:7, ny_state_tire_fee:5, sales_tax_rate:8.125, tax_exempt:false, quote_options:[option], additional_items:[] };

test('quote comparisons show a single credit price and matching fees, without repeated dual-price blocks', () => {
  const html = renderQuote(quote);
  assert.match(html, /\$154\.50 <span>per tire · Credit/);
  assert.match(html, /Estimated total · Credit/);
  assert.match(html, /Installation <strong>\$194\.67/);
  assert.match(html, /Disposal <strong>\$7\.21/);
  assert.match(html, /NY state fee <strong>\$5\.00/);
  assert.match(html, /Lower ACH, debit and prepaid prices are available at payment/);
  assert.doesNotMatch(html, /ACH \/ debit \/ prepaid:|Both complete payment totals|Credit \$/);
});
test('split fitment and extra services use credit prices without changing saved base prices', () => {
  const q = {...quote, rear_quantity:2, rear_tire_size:'225/50R17', quote_options:[{...option,rear_price_per_tire:200,rear_model:'Rear'}], additional_items:[{description:'TPMS',quantity:2,unit_price:10,taxable:true}]};
  const saved = JSON.stringify(q), html = renderQuote(q);
  assert.match(html, /\$206\.00 <span>per tire · Credit/);
  assert.match(html, /2 × \$10\.30/);
  assert.match(html, /\$20\.60/);
  assert.equal(JSON.stringify(q),saved);
});
test('paid quotes retain settled prices and actual paid totals without applying credit uplift again', () => {
  const html=renderQuote({...quote,payment_status:'paid',amount_paid:556.75,installation_cost:194.67,quote_options:[{...option,price_per_tire:154.5}]});
  assert.match(html,/\$154\.50 <span>per tire<\/span>/);
  assert.match(html,/Total paid/);
  assert.match(html,/\$556\.75/);
  assert.match(html,/Installation <strong>\$194\.67/);
  assert.doesNotMatch(html,/per tire · Credit|Prices shown are credit-card prices/);
});
test('legacy quotes keep original pricing and approved tax exemptions still remove estimated tax', () => {
  const legacy=renderQuote({...quote,payment_pricing_version:null});
  assert.match(legacy,/\$150\.00 <span>per tire<\/span>/);
  assert.match(legacy,/Installation <strong>\$189\.00/);
  assert.doesNotMatch(legacy,/Estimated total · Credit/);
  const exempt=renderQuote({...quote,tax_exempt:true});
  assert.match(exempt,/\$515\.88/);
  assert.match(exempt,/Exempt/);
});
test('payment checkout still defaults to card and verifies debit or ACH before confirming the total', () => {
  const source=fs.readFileSync(path.resolve(__dirname,'../components/PaymentMethodCheckout.tsx'),'utf8');
  assert.match(source,/useState<"card" \| "us_bank_account">\("card"\)/);
  assert.match(source,/Stripe verifies your payment type automatically/);
  assert.match(source,/Review final total/);
});
