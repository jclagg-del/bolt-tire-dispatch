"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import EmbeddedStripeCheckout from "@/components/EmbeddedStripeCheckout";
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
  quote_number: number;
  customer: string;
  contact_name: string | null;
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
  selected_option_id: string | null;
  expires_at: string | null;
  payment_status: string;
  amount_paid: number | null;
  requested_date: string | null;
  requested_time: string | null;
  quote_options: Option[];
};
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
const total = (q: Quote, o: Option) => {
  const taxable =
    tireSubtotal(q, o) +
    Number(q.installation_cost) +
    Number(q.service_call_fee) +
    Number(q.disposal_fee);
  return (
    taxable +
    Number(q.ny_state_tire_fee) +
    (q.tax_exempt ? 0 : (taxable * Number(q.sales_tax_rate)) / 100)
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
    clientSecret: string;
    publishableKey: string;
  } | null>(null);
  useEffect(() => {
    fetch(`/api/public/quotes/${token}`)
      .then(async (r) => {
        const x = await r.json();
        if (!r.ok) throw new Error(x.error);
        x.quote_options.sort(
          (a: Option, b: Option) => a.sort_order - b.sort_order,
        );
        setQ(x);
      })
      .catch((e) => setError(e.message));
  }, [token]);
  const pay = async (id: string) => {
    setPaying(id);
    setError("");
    const r = await fetch(`/api/public/quotes/${token}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId: id, purchase }),
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
  };
  useEffect(() => {
    if (!q || !purchase || q.payment_status === "paid" || checkout || paying)
      return;
    const option =
      q.quote_options.find((item) => item.id === q.selected_option_id) ||
      q.quote_options[0];
    if (option) pay(option.id);
  }, [q, purchase]);
  if (error)
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
  const paid =
    q.payment_status === "paid" || search.get("payment") === "success";
  const chosen =
    q.quote_options.find((o) => o.id === q.selected_option_id) ||
    q.quote_options[0];
  const options = purchase && chosen ? [chosen] : q.quote_options;
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
        {paid ? (
          <div className="quote-paid-banner">
            <strong>Thank you! Your paid order is confirmed.</strong>
            <span>
              {q.requested_date && q.requested_time
                ? `Appointment: ${new Date(`${q.requested_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${new Date(`2000-01-01T${q.requested_time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`
                : "Bolt Tire will contact you with pickup or delivery details."}
            </span>
          </div>
        ) : (
          <div className="direct-checkout-layout">
            <aside className="direct-order-summary">
              {chosen?.image_url ? (
                <img
                  src={chosen.image_url}
                  alt={`${chosen.brand} ${chosen.model}`}
                />
              ) : null}
              <div>
                <span>{chosen?.brand}</span>
                <h2>{chosen?.model}</h2>
                <p>
                  {q.quantity} tires · $
                  {Number(chosen?.price_per_tire || 0).toFixed(2)} each
                </p>
                {chosen?.rear_model ? <p>{q.rear_quantity} rear tires · {chosen.rear_brand || chosen.brand} {chosen.rear_model} · ${Number(chosen.rear_price_per_tire || 0).toFixed(2)} each</p> : null}
              </div>
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
                <div className="total">
                  <dt>Total before Stripe tax</dt>
                  <dd>${total(q, chosen).toFixed(2)}</dd>
                </div>
              </dl>
              <small>
                Stripe calculates final sales tax from your billing address.
              </small>
            </aside>
            <section className="direct-payment">
              {checkout ? (
                <EmbeddedStripeCheckout
                  {...checkout}
                  onComplete={() => {
                    location.href = `/q/${token}?purchase=1&payment=success`;
                  }}
                />
              ) : (
                <div className="direct-payment-loading">
                  <span></span>
                  <strong>{error || "Loading secure payment…"}</strong>
                  <p>Your checkout will appear here automatically.</p>
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
      {paid ? (
        <div className="quote-paid-banner">
          <strong>Thank you!</strong>
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
      <section className="quote-comparison-grid">
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
            {o.image_url ? (
              <img
                className="quote-tire-image"
                src={o.image_url}
                alt={`${o.brand} ${o.model}`}
              />
            ) : (
              <div className="quote-image-placeholder">Tire image</div>
            )}
            <h2>{o.brand}</h2>
            <h3>{o.model}</h3>
            <div className="quote-price-each">
              ${Number(o.price_per_tire).toFixed(2)} <span>per tire</span>
            </div>
            {o.rear_model ? <div className="quote-split-tire"><strong>Rear: {o.rear_brand || o.brand} {o.rear_model}</strong><span>{q.rear_tire_size} · ${Number(o.rear_price_per_tire || 0).toFixed(2)} each · qty {q.rear_quantity}</span></div> : null}
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
              <span>{purchase ? "Order total" : "Installed total"}</span>
              <strong>${total(q, o).toFixed(2)}</strong>
            </div>
            <button
              className="quote-select-button"
              disabled={paid || Boolean(paying) || Boolean(checkout)}
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
              {q.tax_exempt ? "Exempt" : `${Number(q.sales_tax_rate)}%`}
            </strong>
          </span>
        </div>
      </section>
      {checkout && !paid ? (
        <EmbeddedStripeCheckout
          {...checkout}
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
