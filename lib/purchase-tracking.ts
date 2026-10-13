// Only allowlisted, non-contact fields enter the advertising payload.
export type TrackingQuote = {
  quote_number: number;
  payment_status: string;
  amount_paid: number | null;
  stripe_sales_tax_amount?: number | null;
  quantity: number;
  rear_quantity: number | null;
};

export function purchaseTrackingPayload(q: TrackingQuote) {
  const amount = Number(q.amount_paid);
  const tax = Number(q.stripe_sales_tax_amount ?? 0);
  const quantity = Number(q.quantity) + Number(q.rear_quantity ?? 0);
  if (q.payment_status !== "paid" || q.amount_paid == null ||
      !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(tax) ||
      tax < 0 || tax > amount || !Number.isSafeInteger(q.quote_number) ||
      q.quote_number <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
  const value = Math.round((amount - tax) * 100) / 100;
  return {
    transaction_id: `BT-${q.quote_number}`,
    currency: "USD",
    value,
    tax,
    tire_quantity: quantity,
    full_set: quantity >= 4,
    items: [{ item_id: "tire-order", item_name: "Tires and on-site service", price: value, quantity: 1 }],
  };
}

export function trackingPage(pathname: string) {
  if (pathname === "/shop" || pathname === "/shop/configure") return pathname;
  if (/^\/q\/[^/]+$/.test(pathname)) return "/q/checkout";
  return null;
}

export function rememberTrackingCheckout(quoteNumber: number) {
  if (typeof window === "undefined" || !Number.isSafeInteger(quoteNumber)) return;
  try { window.localStorage.setItem(`bolt-checkout-${quoteNumber}`, String(Date.now())); } catch {}
}

export function trackingLocation(pathname: string, search: string) {
  const page = trackingPage(pathname);
  if (!page) return null;
  const original = new URLSearchParams(search);
  const safe = new URLSearchParams();
  // Preserve Google's ad-click identifiers, never arbitrary query/contact fields.
  for (const key of ["gclid", "dclid", "gbraid", "wbraid"]) {
    const value = original.get(key);
    if (value && /^[A-Za-z0-9_-]{1,512}$/.test(value)) safe.set(key, value);
  }
  return `https://app.bolttire.com${page}${safe.size ? `?${safe}` : ""}`;
}

export function hasTrackingCheckout(quoteNumber: number, now = Date.now()) {
  if (typeof window === "undefined") return false;
  try {
    const saved = Number(window.localStorage.getItem(`bolt-checkout-${quoteNumber}`));
    return saved > 0 && now >= saved && now - saved < 30 * 24 * 60 * 60 * 1000;
  } catch { return false; }
}
