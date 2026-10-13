"use client";

import { useEffect, useRef } from "react";
import { googleAnalyticsId, googleTrackingEnabled } from "@/components/PublicGoogleAnalytics";
import { hasTrackingCheckout, purchaseTrackingPayload, TrackingQuote } from "@/lib/purchase-tracking";

export default function PurchaseTracking({ quote }: { quote: TrackingQuote | null }) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!googleTrackingEnabled || !quote || window.location.hostname !== "app.bolttire.com" || !hasTrackingCheckout(quote.quote_number)) return;
    const payload = purchaseTrackingPayload(quote);
    if (!payload || sent.current === payload.transaction_id) return;
    const key = `bolt-purchase-tracked-${payload.transaction_id}`;
    try { if (window.localStorage.getItem(key)) return; } catch {}
    // Queueing also works if the network script has not loaded yet.
    window.dataLayer ||= [];
    window.gtag ||= function () { window.dataLayer!.push(arguments); };
    const event = { ...payload, send_to: googleAnalyticsId, page_location: "https://app.bolttire.com/q/checkout", page_referrer: "", page_title: "Bolt Tire Order" };
    window.gtag("event", "purchase", event);
    if (payload.full_set) window.gtag("event", "full_set_purchase", event);
    sent.current = payload.transaction_id;
    try { window.localStorage.setItem(key, "1"); } catch {}
  }, [quote]);
  return null;
}
