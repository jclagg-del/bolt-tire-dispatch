"use client";
import { useEffect, useRef, useState } from "react";
import { serviceAddressPrefill, serviceTaxAddress } from "@/lib/service-tax-address";

type Review = { reviewId: string; state: string; funding: string; pricing: string; subtotal: number; tax: number; total: number; expiresAt: string; serviceAddress?: string | null };
type Result = Review & { status?: string; clientSecret?: string; bankVerificationUrl?: string; error?: string };
type StripeElement = { mount: (element: HTMLElement) => void; destroy: () => void; on: (event: string, callback: (event?: any) => void) => void };
type Elements = { create: (type: string, options: Record<string, unknown>) => StripeElement; submit: () => Promise<{ error?: { message: string } }> };
type StripeClient = {
  elements: (options: Record<string, unknown>) => Elements;
  createConfirmationToken: (options: Record<string, unknown>) => Promise<{ confirmationToken?: { id: string }; error?: { message: string } }>;
  handleNextAction: (options: { clientSecret: string }) => Promise<{ error?: { message: string }; paymentIntent?: { status: string } }>;
};
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
let stripeLoading: Promise<void> | null = null;
function loadStripe() {
  if (window.Stripe) return Promise.resolve();
  return stripeLoading ||= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/endive/stripe.js";
    script.onload = () => resolve(); script.onerror = () => { stripeLoading = null; reject(new Error("Secure payment could not load. Please refresh or try another browser.")); };
    document.head.appendChild(script);
  });
}
export default function PaymentMethodCheckout({ token, optionId, publishableKey, regularCents, discountedCents, serviceAddress: savedServiceAddress, onComplete }: {
  token: string; optionId: string; publishableKey: string; regularCents: number; discountedCents: number; serviceAddress?: string | null; onComplete: () => void;
}) {
  const [serviceAddress, setServiceAddress] = useState(() => serviceAddressPrefill(savedServiceAddress));
  const paymentHost = useRef<HTMLDivElement>(null), addressHost = useRef<HTMLDivElement>(null);
  const stripe = useRef<StripeClient | null>(null), elements = useRef<Elements | null>(null);
  const done = useRef(onComplete); done.current = onComplete;
  const [review, setReview] = useState<Review | null>(null);
  const [bankVerification, setBankVerification] = useState<{ reviewId: string; url: string } | null>(null);
  const [methodFamily, setMethodFamily] = useState<"card" | "us_bank_account">("card");
  const [ready, setReady] = useState(false), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const url = `/api/public/quotes/${token}/payment`;
  async function request(data: Record<string, unknown>) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Payment could not be completed. Check its status before trying again.");
    return result;
  }
  useEffect(() => {
    let canceled = false, payment: StripeElement | undefined, address: StripeElement | undefined;
    setReady(false); setChecked(false);
    const timeout = setTimeout(() => { if (!canceled) setError("The secure payment form is taking longer than expected. Refresh or try another browser; do not submit another payment if one is processing."); }, 25000);
    request({ action: "status" }).then(result => {
      if (canceled) return;
      if (result.paid) return done.current();
      setReview(result.payment); setChecked(true);
    }).catch(reason => { if (!canceled) setError(reason.message); });
    (async () => {
      try {
        await loadStripe();
        if (canceled || !paymentHost.current || !addressHost.current) return;
        const factory = (window as unknown as { Stripe: (key: string) => StripeClient }).Stripe;
        stripe.current = factory(publishableKey);
        elements.current = stripe.current.elements({ mode: "payment", amount: methodFamily === "card" ? regularCents : discountedCents, currency: "usd", captureMethod: methodFamily === "card" ? "manual" : "automatic", allowedPaymentMethodTypes: [methodFamily], appearance: { theme: "stripe", variables: { colorPrimary: "#285cff", borderRadius: "8px" } } });
        address = elements.current.create("address", { mode: "billing" }); address.mount(addressHost.current);
        payment = elements.current.create("payment", { layout: "tabs" });
        payment.on("ready", () => { clearTimeout(timeout); if (!canceled) setReady(true); });
        payment.on("loaderror", () => { clearTimeout(timeout); if (!canceled) setError("Secure payment could not load. Refresh or try another browser."); });
        payment.mount(paymentHost.current);
      } catch (reason) { if (!canceled) setError(reason instanceof Error ? reason.message : "Secure payment could not load."); }
    })();
    return () => { canceled = true; clearTimeout(timeout); payment?.destroy(); address?.destroy(); };
  }, [token, optionId, publishableKey, regularCents, discountedCents, methodFamily]);

  const submitted = Boolean(review && review.state !== "review");
  useEffect(() => {
    if (!submitted) return;
    let canceled = false;
    const timer = setInterval(() => {
      request({ action: "status" }).then(result => {
        if (canceled) return;
        if (result.paid) { clearInterval(timer); done.current(); }
        else if (result.payment) setReview(result.payment);
        else { setReview(null); setError("Payment did not complete. Review your details before trying again."); }
      }).catch(() => { /* Keep the pending state; a network error is not a declined payment. */ });
    }, 4000);
    return () => { canceled = true; clearInterval(timer); };
  }, [submitted, token]);

  async function reviewPayment() {
    if (busy || !checked || !ready || !elements.current || !stripe.current) return;
    setBusy(true); setError("");
    try {
      const destination = serviceTaxAddress(serviceAddress);
      const submitted = await elements.current.submit();
      if (submitted.error) throw new Error(submitted.error.message);
      const result = await stripe.current.createConfirmationToken({ elements: elements.current, params: { return_url: `${location.origin}/q/${token}?purchase=1&payment=return` } });
      if (result.error || !result.confirmationToken) throw new Error(result.error?.message || "Could not verify payment details.");
      setReview(await request({ action: "review", optionId, confirmationToken: result.confirmationToken.id, serviceAddress: destination }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not review payment.");
      // A lost review response may still have reserved the quote. Recover that
      // review instead of leaving the customer unable to change or confirm it.
      try { const status = await request({ action: "status" }); if (status.paid) done.current(); else if (status.payment) setReview(status.payment); } catch { /* Keep the form disabled from charging without a saved review. */ }
    }
    finally { setBusy(false); }
  }
  async function confirmPayment() {
    if (!review || busy) return;
    setBusy(true); setError("");
    try {
      let result: Result = await request({ action: "confirm", reviewId: review.reviewId });
      setReview(result);
      if (result.bankVerificationUrl) setBankVerification({ reviewId: result.reviewId, url: result.bankVerificationUrl });
      if (result.status === "requires_action" && result.clientSecret && stripe.current) {
        const next = await stripe.current.handleNextAction({ clientSecret: result.clientSecret });
        if (next.error) throw new Error(next.error.message);
        result = await request({ action: "confirm", reviewId: review.reviewId });
        if (result.bankVerificationUrl) setBankVerification({ reviewId: result.reviewId, url: result.bankVerificationUrl });
      }
      setReview(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Check the payment status before retrying.");
      // A lost response might follow a successful charge. Recover the existing
      // attempt rather than returning to a form that can start a second one.
      try { const status = await request({ action: "status" }); if (status.paid) done.current(); else setReview(status.payment); } catch { /* Retain the existing review ID for an idempotent retry. */ }
    } finally { setBusy(false); }
  }
  async function changePayment() {
    if (!review || busy) return;
    setBusy(true); setError("");
    try { await request({ action: "cancel-review", reviewId: review.reviewId }); setReview(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change payment."); }
    finally { setBusy(false); }
  }
  return <div className="embedded-checkout-shell">
    <div className="embedded-checkout-heading"><strong>Secure payment</strong><span>Pay by credit card, debit/prepaid card, or ACH bank transfer.</span></div>
    <div style={{ padding: 16, background: "#f3f6ff", borderRadius: 10, marginBottom: 20 }}>
      <strong>Credit: {money(regularCents / 100)}</strong><br />
      <span>ACH / debit / prepaid: {money(discountedCents / 100)}</span><br />
      <small>Before sales tax. Stripe verifies your payment type automatically. Final total is shown before you pay.</small>
    </div>
    {error && <p role="alert" className="quote-error">{error}</p>}
    <div style={{ display: review ? "none" : "block" }}>
      <fieldset disabled={busy} style={{ marginBottom: 20 }}>
        <legend>Service / delivery address</legend>
        <p>Confirm where we will install or deliver your tires. Sales tax uses this location, not your billing address.</p>
        <div className="quote-form-grid">
          {([['line1', 'Street address', 'address-line1'], ['line2', 'Apartment / unit (optional)', 'address-line2'], ['city', 'City', 'address-level2'], ['state', 'State (two letters)', 'address-level1'], ['postal_code', 'ZIP code', 'postal-code']] as const).map(([field, label, autocomplete]) => <label className="quote-field" key={field}><span>{label}</span><input required={field !== 'line2'} value={serviceAddress[field]} autoComplete={`section-service shipping ${autocomplete}`} maxLength={field === 'state' ? 2 : field === 'postal_code' ? 10 : field === 'city' ? 100 : 200} onChange={event => setServiceAddress({ ...serviceAddress, [field]: event.target.value })} /></label>)}
        </div>
      </fieldset>
      <fieldset disabled={busy}><legend>How would you like to pay?</legend>
        <label><input type="radio" name="payment-family" checked={methodFamily === "card"} onChange={() => setMethodFamily("card")} /> Credit, debit or prepaid card</label>
        <label><input type="radio" name="payment-family" checked={methodFamily === "us_bank_account"} onChange={() => setMethodFamily("us_bank_account")} /> ACH bank transfer</label>
      </fieldset><h3>Billing address</h3><div ref={addressHost} /><h3>Payment method</h3><div ref={paymentHost} />
    </div>
    {!review ? <button className="quote-select-button" disabled={busy || !ready || !checked} onClick={reviewPayment}>{busy ? "Verifying payment details…" : "Review final total"}</button> : <section aria-label="Payment review">
      <h3>{submitted ? "Payment status" : "Review your payment"}</h3>
      {review.serviceAddress && <p><strong>Service / delivery address:</strong> {review.serviceAddress}<br /><small>Sales tax is based on this location.</small></p>}
      <p>{review.funding === "us_bank_account" ? "ACH bank transfer" : `${review.funding.charAt(0).toUpperCase()}${review.funding.slice(1)} card`}{review.pricing === "discounted" ? " — lower price applied" : " — regular price"}</p>
      <dl><div><dt>Subtotal</dt><dd>{money(review.subtotal)}</dd></div><div><dt>Sales tax</dt><dd>{money(review.tax)}</dd></div><div><dt>Total</dt><dd><strong>{money(review.total)}</strong></dd></div></dl>
      {review.state === "review" ? <><button className="quote-select-button" disabled={busy} onClick={confirmPayment}>{busy ? "Submitting…" : `Pay ${money(review.total)}`}</button><button disabled={busy} onClick={changePayment}>Change payment method</button><p><small>ACH payments can take several business days to clear. Your appointment remains subject to confirmation.</small></p></> : <>
        <p role="status">{review.state === "requires_action" && review.funding === "us_bank_account" ? "Your bank account needs verification before payment can proceed. If you entered bank details manually, Stripe’s small verification deposits can take 1–2 business days to appear. This order is not paid yet; do not submit another payment." : review.state === "processing" && review.funding === "us_bank_account" ? "Your bank transfer was submitted and is pending. It is not yet marked paid. Please do not submit another payment." : review.state === "succeeded" ? "Payment received by Stripe. Confirming your order…" : "Your payment is being verified. Please do not start another payment."}</p>
        {review.state === "requires_action" && bankVerification?.reviewId === review.reviewId ? <a className="quote-select-button" href={bankVerification.url} target="_blank" rel="noopener noreferrer">Verify bank account with Stripe</a> : ["requires_action", "requires_confirmation", "submitting"].includes(review.state) && <button disabled={busy} className="quote-select-button" onClick={confirmPayment}>{busy ? "Checking…" : review.funding === "us_bank_account" ? "Continue bank verification" : "Resume existing payment"}</button>}
      </>}
    </section>}
  </div>;
}
