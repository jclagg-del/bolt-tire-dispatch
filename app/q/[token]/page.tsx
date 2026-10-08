"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import EmbeddedStripeCheckout from "@/components/EmbeddedStripeCheckout";
import PaymentMethodCheckout from "@/components/PaymentMethodCheckout";
import { quotePaymentPrice } from "@/lib/quote-payment-pricing";
import QuoteCheckoutInformation from "@/components/QuoteCheckoutInformation";
import AdditionalItemsSummary from "@/components/AdditionalItemsSummary";
import { AdditionalItem, additionalItemAmount, additionalItemsTotals } from "@/lib/additional-items";
import { quoteCheckoutDetails, quoteCheckoutDetailsError } from "@/lib/quote-checkout-details";
type Option = {
  id: string;
  tier: string;
  brand: string;
  model: string;
  image_url: string | null;
  price_per_tire: number;
  rear_brand: string | null;
  rear_model: string | null;
  rear_image_url: string | null;
  rear_price_per_tire: number | null;
  warranty_miles: number | null;
  tire_type: string | null;
  load_speed_rating: string | null;
  snow_rating: string | null;
  highlights: string | null;
  availability: string | null;
  recommended: boolean;
  sort_order: number;
};
type Quote = {
  payment_pricing_version?: number | null;
  additional_items?: AdditionalItem[];
  quote_number: number;
  customer: string;
  contact_name: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  purchase_source?: string | null;
  vehicle: string | null;
  tire_size: string | null;
  quantity: number;
  rear_tire_size: string | null;
  rear_quantity: number | null;
  notes: string | null;
  installation_cost: number;
  service_call_fee: number;
  disposal_fee: number;
  ny_state_tire_fee: number;
  sales_tax_rate: number;
  tax_exempt: boolean;
  discount_code_label?: string | null;
  discount_amount?: number;
  discount_organization?: string | null;
  selected_option_id: string | null;
  expires_at: string | null;
  payment_status: string;
  amount_paid: number | null;
  stripe_sales_tax_amount?: number | null;
  requested_date: string | null;
  requested_time: string | null;
  quote_options: Option[];
};
const hasSplitFitment = (q: Quote, o: Option) =>
  Boolean(q.rear_tire_size || q.rear_quantity || o.rear_model);

function QuoteTirePanels({ q, option }: { q: Quote; option: Option }) {
  const split = hasSplitFitment(q, option);
  return (
    <div className={`quote-public-tires ${split ? "split" : ""}`}>
      <div className="quote-public-tire">
        {split ? <div className="quote-public-position">Front / Steer</div> : null}
        {option.image_url ? (
          <img
            className="quote-tire-image"
            src={option.image_url}
            alt={`${option.brand} ${option.model}`}
          />
        ) : (
          <div className="quote-image-placeholder">Tire image</div>
        )}
        <h2>{option.brand}</h2>
        <h3>{option.model}</h3>
        <p className="quote-public-fitment">
          {q.tire_size || "Size TBD"} · Qty {q.quantity}
        </p>
        <div className="quote-price-each">
          {q.payment_pricing_version === 1 && q.payment_status !== "paid" ? <>Credit ${quotePaymentPrice(q, option, "regular").option.price_per_tire.toFixed(2)} <span>per tire</span><small style={{display:"block"}}>ACH / debit / prepaid: ${Number(option.price_per_tire).toFixed(2)} per tire</small></> : <>${Number(option.price_per_tire).toFixed(2)} <span>per tire</span></>}
        </div>
      </div>
      {split ? (
        <div className="quote-public-tire rear">
          <div className="quote-public-position">Rear / Drive</div>
          {option.rear_image_url ? (
            <img
              className="quote-tire-image"
              src={option.rear_image_url}
              alt={`${option.rear_brand || option.brand} ${option.rear_model || "Rear tire"}`}
            />
          ) : (
            <div className="quote-image-placeholder">Rear tire image</div>
          )}
          <h2>{option.rear_brand || option.brand || "Rear tire"}</h2>
          <h3>{option.rear_model || "Model not specified"}</h3>
          <p className="quote-public-fitment">
            {q.rear_tire_size || "Size TBD"} · Qty {q.rear_quantity || 0}
          </p>
          <div className="quote-price-each">
            {q.payment_pricing_version === 1 && q.payment_status !== "paid" ? <>Credit ${Number(quotePaymentPrice(q, option, "regular").option.rear_price_per_tire).toFixed(2)} <span>per tire</span><small style={{display:"block"}}>ACH / debit / prepaid: ${Number(option.rear_price_per_tire || 0).toFixed(2)} per tire</small></> : <>${Number(option.rear_price_per_tire || 0).toFixed(2)} <span>per tire</span></>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
const tireSummary = (q: Quote) =>
  [
    `${q.quantity} front/primary · ${q.tire_size || "size TBD"}`,
    q.rear_tire_size ? `${q.rear_quantity} rear · ${q.rear_tire_size}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
const tireSubtotal = (q: Quote, o: Option) =>
  Number(o.price_per_tire) * q.quantity +
  Number(o.rear_price_per_tire || 0) * Number(q.rear_quantity || 0);
const total = (q: Quote, o: Option, includeEstimatedTax = true) => {
  const extra = additionalItemsTotals(q.additional_items);
  const taxable =
    tireSubtotal(q, o) +
    Number(q.installation_cost) +
    Number(q.service_call_fee) +
    Number(q.disposal_fee) + extra.taxable;
  return (
    taxable + extra.nonTaxable +
    Number(q.ny_state_tire_fee) +
    (q.tax_exempt || !includeEstimatedTax ? 0 : (taxable * Number(q.sales_tax_rate)) / 100)
  );
};
export default function PublicQuote() {
  const { token } = useParams<{ token: string }>();
  const search = useSearchParams();
  const purchase = search.get("purchase") === "1";
  const [q, setQ] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<{
    clientSecret?: string;
    publishableKey: string;
    paymentMode?: string;
    optionId?: string;
    regularCents?: number;
    discountedCents?: number;
    serviceAddress?: string | null;
  } | null>(null);
  const [details, setDetails] = useState(quoteCheckoutDetails({}));
  useEffect(() => {
    fetch(`/api/public/quotes/${token}`)
      .then(async (r) => {
        const x = await r.json();
        if (!r.ok) throw new Error(x.error);
        x.quote_options.sort(
          (a: Option, b: Option) => a.sort_order - b.sort_order,
        );
        setQ(x);
        setDetails(quoteCheckoutDetails(x));
      })
      .catch((e) => setError(e.message));
  }, [token]);
  const pay = async (id: string) => {
    if (!q || paying || checkout || (search.get("payment") && q.payment_pricing_version !== 1)) return;
    if (q.purchase_source !== "website") {
      const message = quoteCheckoutDetailsError(details);
      if (message) {
        setError(message);
        document.getElementById("quote-checkout-information")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    setPaying(id);
    setError("");
    try {
    const r = await fetch(`/api/public/quotes/${token}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId: id, purchase, ...(q.purchase_source !== "website" ? { customerDetails: details } : {}) }),
    });
    const x = await r.json();
    if (!r.ok) {
      setPaying(null);
      return setError(x.error);
    }
    setCheckout(x);
    setPaying(null);
    setTimeout(
      () =>
        document
          .querySelector(".embedded-checkout-shell")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      100,
    );
    } catch {
      setError("Could not start payment. Please check your connection and try again.");
    } finally {
      setPaying(null);
    }
  };
  useEffect(() => {
    if (!q || q.purchase_source !== "website" || !purchase || q.payment_status === "paid" || checkout || paying || (search.get("payment") && q.payment_pricing_version !== 1))
      return;
    const option =
      q.quote_options.find((item) => item.id === q.selected_option_id) ||
      q.quote_options[0];
    if (option) pay(option.id);
  }, [q, purchase]);
  useEffect(() => {
    if (!search.get("payment") || q?.payment_status === "paid") return;
    let stopped = false;
    const timer = setInterval(() => {
      fetch(`/api/public/quotes/${token}`).then(async response => {
        if (!response.ok || stopped) return;
        const current = await response.json();
        if (!stopped) setQ(current);
        if (current.payment_status === "paid") clearInterval(timer);
      }).catch(() => {});
    }, 4000);
    return () => { stopped = true; clearInterval(timer); };
  }, [token, q?.payment_status, search]);
  if (error && !q)
    return (
      <main className="public-quote-page">
        <div className="quote-error">{error}</div>
      </main>
    );
  if (!q)
    return (
      <main className="public-quote-page">
        <div className="quote-empty">Loading...</div>
      </main>
    );
  // A return URL is not proof of payment, especially for delayed ACH payments.
  const paid = q.payment_status === "paid";
  const chosen =
    q.quote_options.find((o) => o.id === q.selected_option_id) ||
    q.quote_options[0];
  const options = (purchase || paid) && chosen ? [chosen] : q.quote_options;
  const information = !paid && q.purchase_source !== "website" ? <QuoteCheckoutInformation value={details} onChange={value => { setDetails(value); setError(""); }} disabled={Boolean(paying || checkout)} /> : null;
  if (purchase)
    return (
      <main className="direct-checkout-page">
        <header className="direct-checkout-header">
          <img src="/bolt-logo.png" alt="Bolt Tire" />
          <div>
            <span>SECURE CHECKOUT</span>
            <h1>{paid ? "Payment received" : "Complete your purchase"}</h1>
            <p>
              {[q.vehicle, tireSummary(q)]
                .filter(Boolean)
                .join(" • ")}
            </p>
          </div>
        </header>
        {information}
        {error && <div role="alert" className="quote-error">{error}</div>}
        {!paid && search.get("payment") && q.payment_pricing_version !== 1 && <p role="status" className="quote-message">Checking payment confirmation. A submitted bank transfer may still be pending. Please do not submit another payment.</p>}
        {paid ? (
          <div className="quote-paid-banner">
            <strong>Thank you! Your paid order is confirmed.</strong>
            {q.amount_paid != null && <span>Amount paid: ${Number(q.amount_paid).toFixed(2)}{q.stripe_sales_tax_amount != null ? ` · Sales tax included: $${Number(q.stripe_sales_tax_amount).toFixed(2)}` : ""}</span>}
            <span>
              {q.requested_date && q.requested_time
                ? `Requested appointment: ${new Date(`${q.requested_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${new Date(`2000-01-01T${q.requested_time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Bolt Tire will confirm your service time.`
                : "Bolt Tire will contact you with pickup or delivery details."}
            </span>
          </div>
        ) : (
          <div className="direct-checkout-layout">
            <aside className="direct-order-summary">
              {chosen ? <QuoteTirePanels q={q} option={chosen} /> : null}
              <dl>
                <div>
                  <dt>Tires</dt>
                  <dd>
                    $
                    {chosen ? tireSubtotal(q, chosen).toFixed(2) : "0.00"}
                  </dd>
                </div>
                <div>
                  <dt>Installation</dt>
                  <dd>${Number(q.installation_cost).toFixed(2)}</dd>
                </div>
                {Number(q.disposal_fee) > 0 ? (
                  <div>
                    <dt>Disposal</dt>
                    <dd>${Number(q.disposal_fee).toFixed(2)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>NY state fee</dt>
                  <dd>${Number(q.ny_state_tire_fee).toFixed(2)}</dd>
                </div>
                {(q.additional_items || []).map((item, index) => <div key={index}><dt>{item.description}<small style={{ display: "block" }}>{item.quantity} × ${item.unit_price.toFixed(2)}{!item.taxable ? " · Non-taxable" : ""}</small></dt><dd>${additionalItemAmount(item).toFixed(2)}</dd></div>)}
                <div className="total">
                  <dt>{q.payment_pricing_version === 1 ? "ACH / debit subtotal before sales tax" : "Subtotal before sales tax"}</dt>
                  <dd>${total(q, chosen, false).toFixed(2)}</dd>
                </div>
              </dl>
              {q.payment_pricing_version === 1 && <p><strong>Credit subtotal: ${(quotePaymentPrice(q, chosen, "regular").subtotalCents / 100).toFixed(2)}</strong><br />ACH/debit/prepaid subtotal: ${(quotePaymentPrice(q, chosen, "discounted").subtotalCents / 100).toFixed(2)}</p>}
              <small>
                {q.tax_exempt ? "Your approved sales-tax exemption applies to tires and services." : q.payment_pricing_version === 1 ? "Stripe calculates final sales tax from your confirmed service / delivery address." : "Stripe calculates final sales tax from your billing address."}
              </small>
            </aside>
            <section className="direct-payment">
              {checkout?.paymentMode === "methods" ? <PaymentMethodCheckout token={token} publishableKey={checkout.publishableKey} optionId={checkout.optionId!} regularCents={checkout.regularCents!} discountedCents={checkout.discountedCents!} serviceAddress={checkout.serviceAddress} onComplete={() => location.reload()} /> : checkout?.clientSecret ? (
                <EmbeddedStripeCheckout
                  publishableKey={checkout.publishableKey} clientSecret={checkout.clientSecret}
                  onComplete={() => {
                    location.href = `/q/${token}?purchase=1&payment=success`;
                  }}
                />
              ) : (
                <div className="direct-payment-loading">
                  <span></span>
                  <strong>{error || (q.purchase_source === "website" || paying ? "Loading secure payment…" : "Complete your information above to continue.")}</strong>
                  {q.purchase_source === "website" ? <p>Your checkout will appear here automatically.</p> : <button className="quote-select-button" disabled={Boolean(paying) || !chosen} onClick={() => chosen && pay(chosen.id)}>{paying ? "Loading secure checkout..." : "Continue to secure payment"}</button>}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    );
  return (
    <main className={`public-quote-page ${purchase ? "purchase-page" : ""}`}>
      <header className="public-quote-header">
        <img src="/bolt-logo.png" alt="Bolt Tire" />
        <div>
          <span>
            {purchase ? "Secure online purchase" : `Quote #${q.quote_number}`}
          </span>
          <h1>
            {paid
              ? "Payment received"
              : purchase
                ? "Review your order"
                : "Choose your tire"}
          </h1>
          <p>
            {[q.customer, q.vehicle, tireSummary(q)]
              .filter(Boolean)
              .join(" • ")}
          </p>
        </div>
      </header>
      {information}
      {error && <div role="alert" className="quote-error">{error}</div>}
      {paid ? (
        <div className="quote-paid-banner">
          <strong>Thank you!</strong>
          {q.amount_paid != null && <span>Amount paid: ${Number(q.amount_paid).toFixed(2)}{q.stripe_sales_tax_amount != null ? ` · Sales tax included: $${Number(q.stripe_sales_tax_amount).toFixed(2)}` : ""}</span>}
          <span>
            Your payment was received. Bolt Tire will contact you to confirm
            scheduling.
          </span>
        </div>
      ) : null}
      {search.get("payment") === "cancelled" ? (
        <div className="quote-message">
          Payment was cancelled. No charge was made.
        </div>
      ) : null}
      <section className={`quote-comparison-grid ${q.quote_options.some(option => hasSplitFitment(q, option)) ? "split-fitment" : ""}`}>
        {options.map((o) => (
          <article
            className={`quote-compare-card ${o.recommended ? "recommended" : ""}`}
            key={o.id}
          >
            {!purchase && o.recommended ? (
              <div className="quote-tier-row">
                <span className="quote-recommended">Bolt recommends</span>
              </div>
            ) : null}
            <QuoteTirePanels q={q} option={o} />
            <dl className="quote-specs">
              <div>
                <dt>Warranty</dt>
                <dd>
                  {o.warranty_miles
                    ? `${Number(o.warranty_miles).toLocaleString()} miles`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{o.tire_type || "—"}</dd>
              </div>
              <div>
                <dt>Load / speed</dt>
                <dd>{o.load_speed_rating || "—"}</dd>
              </div>
              <div>
                <dt>Snow rating</dt>
                <dd>{o.snow_rating || "—"}</dd>
              </div>
              <div>
                <dt>Availability</dt>
                <dd>{o.availability || "Confirm availability"}</dd>
              </div>
            </dl>
            {o.highlights ? (
              <p className="quote-highlights">{o.highlights}</p>
            ) : null}
            <div className="quote-installed-total">
              <span>{paid && q.amount_paid != null ? "Total paid" : q.payment_pricing_version === 1 && !paid ? "Credit total (estimated tax)" : purchase ? "Order total" : "Installed total"}</span>
              <strong>${(paid && q.amount_paid != null ? Number(q.amount_paid) : q.payment_pricing_version === 1 && !paid ? (() => { const p=quotePaymentPrice(q,o,"regular"); return (p.subtotalCents+(q.tax_exempt?0:Math.round(p.taxableCents*Number(q.sales_tax_rate)/100)))/100; })() : total(q, o)).toFixed(2)}</strong>
            </div>
            {q.payment_pricing_version === 1 && !paid && <p>ACH / debit / prepaid: <strong>${total(q,o).toFixed(2)}</strong><br /><small>Final tax and payment type verified before payment.</small></p>}
            <button
              className="quote-select-button"
              disabled={paid || Boolean(paying) || Boolean(checkout) || Boolean(search.get("payment") && q.payment_pricing_version !== 1)}
              onClick={() => pay(o.id)}
            >
              {paid
                ? "Paid"
                : checkout
                  ? "Checkout ready below"
                  : paying === o.id
                    ? "Loading secure checkout..."
                    : purchase
                      ? "Pay Securely"
                      : "Choose & Pay Securely"}
            </button>
          </article>
        ))}
      </section>
      <section className="quote-form-card">
        <h2>{purchase ? "Order details" : "Included in every option"}</h2>
        {q.payment_pricing_version === 1 && !paid && <p>Itemized service prices below are ACH / debit / prepaid prices. Both complete payment totals are shown above.</p>}
        {!paid && search.get("payment") && q.payment_pricing_version !== 1 && <p role="status">Checking payment confirmation. A submitted bank transfer may still be pending. Please do not submit another payment.</p>}
        <AdditionalItemsSummary items={q.additional_items} />
        {q.discount_code_label && <p>Discount code {q.discount_code_label}: ${Number(q.discount_amount || 0).toFixed(2)} tire savings included in the prices above.{q.discount_organization ? ` Organization: ${q.discount_organization}.` : ""}</p>}
        <div className="quote-fee-summary">
          <span>
            Installation{" "}
            <strong>${Number(q.installation_cost).toFixed(2)}</strong>
          </span>
          {Number(q.service_call_fee) > 0 ? (
            <span>
              Service call{" "}
              <strong>${Number(q.service_call_fee).toFixed(2)}</strong>
            </span>
          ) : null}
          <span>
            Disposal <strong>${Number(q.disposal_fee).toFixed(2)}</strong>
          </span>
          <span>
            NY state fee{" "}
            <strong>${Number(q.ny_state_tire_fee).toFixed(2)}</strong>
          </span>
          <span>
            Sales tax{" "}
            <strong>
              {paid && q.stripe_sales_tax_amount != null ? `$${Number(q.stripe_sales_tax_amount).toFixed(2)}` : q.tax_exempt ? "Exempt" : `${Number(q.sales_tax_rate)}%`}
            </strong>
          </span>
        </div>
      </section>
      {checkout?.paymentMode === "methods" && !paid ? <PaymentMethodCheckout token={token} publishableKey={checkout.publishableKey} optionId={checkout.optionId!} regularCents={checkout.regularCents!} discountedCents={checkout.discountedCents!} serviceAddress={checkout.serviceAddress} onComplete={() => location.reload()} /> : checkout?.clientSecret && !paid ? (
        <EmbeddedStripeCheckout
          publishableKey={checkout.publishableKey} clientSecret={checkout.clientSecret}
          onComplete={() => {
            location.href = `/q/${token}?${purchase ? "purchase=1&" : ""}payment=success`;
          }}
        />
      ) : null}
      <footer className="public-quote-footer">
        Secure payment powered by Stripe • Bolt Tire
      </footer>
    </main>
  );
}
