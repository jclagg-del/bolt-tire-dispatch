import { getQuoTextUrl } from "@/lib/quo";

type ShareQuote = { public_token: string; quote_number: number; contact_name?: string | null; phone?: string | null };

export function quoteShareText(quote: ShareQuote, origin: string) {
  const firstName = quote.contact_name?.trim().split(/\s+/)[0];
  const link = `${new URL(origin).origin}/q/${encodeURIComponent(quote.public_token)}`;
  return `${firstName ? `Hi ${firstName},` : "Hi,"} your Bolt Tire quote #${quote.quote_number} is ready. Review your tire options here:\n${link}`;
}

export function quoteTextRecipient(phone?: string | null) {
  const raw = phone?.trim() || "";
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  return null;
}

export function quoteQuoDraftUrl(quote: ShareQuote, origin: string) {
  const phone = quoteTextRecipient(quote.phone);
  if (!phone || !quote.public_token) return null;
  return getQuoTextUrl(phone, quoteShareText(quote, origin));
}
