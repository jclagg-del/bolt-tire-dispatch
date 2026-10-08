"use client";
import { useEffect, useState } from "react";
import { cents, quotePaymentPrice } from "@/lib/quote-payment-pricing";
import { paymentPricePair } from "@/lib/payment-method-pricing";

type Settings = { passenger: { two: number; four: number }; truck: { two: number; four: number; six: number }; disposal: { passenger: number; truck: number }; stateFee: number };
let settingsRequest: Promise<Settings> | undefined;
const settings = () => settingsRequest ||= fetch("/api/public/shop/settings").then(async response => {
  if (!response.ok) throw new Error("Pricing unavailable");
  return response.json();
}).catch(error => { settingsRequest = undefined; throw error; });

export default function CustomerTirePricing({ price, quantity, category, split }: { price: number; quantity: number; category: "passenger" | "truck"; split: boolean }) {
  const [totals, setTotals] = useState<{ regular: number; discounted: number } | null>(null);
  useEffect(() => {
    let stopped = false;
    setTotals(null);
    settings().then(s => {
      const installation = category === "truck" && quantity >= 5 ? s.truck.six : quantity >= 3 ? s[category].four : s[category].two;
      const q = { quantity, installation_cost: installation, disposal_fee: s.disposal[category] * quantity, ny_state_tire_fee: s.stateFee * quantity, service_call_fee: 0, tax_exempt: false };
      const o = { id: "estimate", price_per_tire: price };
      if (!stopped) setTotals({ regular: quotePaymentPrice(q, o, "regular").subtotalCents / 100, discounted: quotePaymentPrice(q, o, "discounted").subtotalCents / 100 });
    }).catch(() => {});
    return () => { stopped = true; };
  }, [price, quantity, category]);
  return <>
    <div className="tire-beta-customer-price"><span>Credit price / tire</span><strong>${(paymentPricePair(cents(price)).regularCents / 100).toFixed(2)}</strong><small>ACH / debit / prepaid: ${price.toFixed(2)} each</small></div>
    {!split && <div className="tire-beta-total-price"><span>Estimated total for {quantity}</span>{totals ? <><strong>Credit ${totals.regular.toFixed(2)}</strong><span>ACH / debit / prepaid ${totals.discounted.toFixed(2)}</span><small>Includes installation & standard fees; sales tax additional.</small></> : <small>Full totals shown at checkout.</small>}</div>}
  </>;
}
