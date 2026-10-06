"use client";
import { useRef, useState } from "react";
import { discountLabel, normalizeDiscountCode, type AppliedDiscount } from "@/lib/discounts";

export default function CheckoutDiscount({ discount, onChange }: { discount: AppliedDiscount | null; onChange: (value: AppliedDiscount | null) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  async function apply() {
    const attempt = ++generation.current;
    setBusy(true); setError(""); onChange(null);
    try {
      const response = await fetch("/api/public/shop/discount", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json();
      if (attempt !== generation.current) return;
      if (!response.ok) throw new Error(result.error || "That code could not be applied.");
      onChange(result.discount);
    } catch (error) { if (attempt === generation.current) setError(error instanceof Error ? error.message : "Please try again."); }
    finally { if (attempt === generation.current) setBusy(false); }
  }
  return <section className="purchase-builder-card checkout-discount">
    <h2>Discount code</h2>
    <div className="purchase-builder-fields"><label>Discount code<input value={code} maxLength={40} autoComplete="off" onChange={e => { generation.current++; setBusy(false); setCode(normalizeDiscountCode(e.target.value)); onChange(null); setError(""); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (code && !busy) void apply(); } }} /></label></div>
    <button type="button" onClick={apply} disabled={busy || !code}>{busy ? "Checking…" : "Apply code"}</button>
    {discount && <><button type="button" onClick={() => { generation.current++; setBusy(false); setCode(""); onChange(null); }}>Remove code</button><p role="status">{discountLabel(discount)}{discount.organization ? ` · ${discount.organization}` : ""}{discount.tax_exempt ? " · Sales tax exempt on tires and services" : ""}</p>{discount.organization && <p>Pay online by card. Your order will be sent to our team as Paid for tire purchasing and fulfillment.</p>}</>}
    {error && <p role="alert" className="purchase-builder-error">{error}</p>}
  </section>;
}
