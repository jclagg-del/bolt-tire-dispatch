"use client";
import { useState } from "react";
import { quoteQuoDraftUrl, quoteShareText, quoteTextRecipient } from "@/lib/quote-sharing";

export default function TextQuoteButton({ quote, disabled, onMessage }: {
  quote: { public_token: string; quote_number: number; contact_name?: string | null; phone?: string | null };
  disabled?: boolean;
  onMessage: (message: string) => void;
}) {
  const [showCopy, setShowCopy] = useState(false);
  const canText = Boolean(quote.public_token && quoteTextRecipient(quote.phone));
  function openQuo() {
    const url = quoteQuoDraftUrl(quote, window.location.origin);
    if (!url) return;
    setShowCopy(true);
    onMessage("Review the recipient and message in Quo, then tap Send. Nothing is sent automatically. If Quo does not open, use Copy Quote Text and paste it into Quo.");
    window.location.assign(url);
  }
  async function copyText() {
    const text = quoteShareText(quote, window.location.origin);
    try {
      await navigator.clipboard.writeText(text);
      onMessage("Quote text copied. Paste it into Quo and tap Send. The quote has not been marked as sent.");
    } catch {
      window.prompt("Copy this quote text and paste it into Quo:", text);
    }
  }
  return <>
    <button type="button" className="quote-primary" disabled={disabled || !canText} onClick={openQuo} title={canText ? "Open a prefilled message in Quo; tap Send there" : "Add a valid customer phone number before texting"}>Text Quote</button>
    {showCopy ? <button type="button" onClick={copyText}>Copy Quote Text</button> : null}
  </>;
}
