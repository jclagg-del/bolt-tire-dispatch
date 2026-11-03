import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { quoteShareText, quoteTextRecipient } from "@/lib/quote-sharing";

export class QuoteTextError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Delivery = { attempt_id: string; status: "pending" | "accepted" | "failed" | "unknown"; requested_at: string };
export type QuoteTextPreview = {
  quoteId: string; quoteNumber: number; customer: string; recipient: string;
  sender: string; content: string; fingerprint: string;
  previous: Delivery | null; blockedReason: string | null;
};
const api = "https://api.quo.com/v1";
function configuration() {
  const key = process.env.QUO_API_KEY?.trim(), from = process.env.QUO_PHONE_NUMBER_ID?.trim();
  if (!key || !from) throw new QuoteTextError("Quo texting is not connected yet. Add the Quo API key and business phone number in the app’s server settings.", 503);
  return { key, from };
}
export function validQuoteId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new QuoteTextError("Choose a valid saved quote.");
  return value;
}
function blockedReason(previous: Delivery | null) {
  if (!previous) return null;
  if (["pending", "unknown"].includes(previous.status)) return "A previous send is still pending or could not be confirmed. Check the conversation in Quo before trying again; automatic retries are blocked to prevent duplicate texts.";
  if (Date.now() - Date.parse(previous.requested_at) < 60_000) return "Please wait one minute after the last attempt, then reopen this preview.";
  return null;
}
async function loadQuote(admin: SupabaseClient, quoteId: string) {
  const { data: quote, error } = await admin.from("quotes").select("id,quote_number,customer,contact_name,phone,public_token,updated_at").eq("id", validQuoteId(quoteId)).maybeSingle();
  if (error) throw new QuoteTextError("Could not load the saved quote.", 503);
  if (!quote) throw new QuoteTextError("Quote not found.", 404);
  const recipient = quoteTextRecipient(quote.phone);
  if (!recipient || !quote.public_token) throw new QuoteTextError("Save a valid customer phone number and quote before texting.");
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://app.bolttire.com");
  if (origin.protocol !== "https:") throw new QuoteTextError("The public quote website address must use HTTPS.", 503);
  const content = quoteShareText(quote, origin.origin);
  if (!content.trim() || content.length > 1600) throw new QuoteTextError("The quote message is too long. Shorten the contact name before texting.");
  const { data: previous, error: deliveryError } = await admin.from("quote_text_deliveries").select("attempt_id,status,requested_at").eq("quote_id", quoteId).maybeSingle();
  if (deliveryError) throw new QuoteTextError("Could not verify previous sends. No text was sent.", 503);
  return { quote, recipient, content, previous: previous as Delivery | null };
}
async function senderDetails() {
  const { key, from } = configuration();
  let response: Response;
  try { response = await fetch(`${api}/phone-numbers`, { headers: { Authorization: key }, cache: "no-store", signal: AbortSignal.timeout(10_000) }); }
  catch { throw new QuoteTextError("Could not connect to Quo. No text was sent. Try opening the preview again.", 503); }
  if (!response.ok) throw new QuoteTextError("Quo could not verify the connected business number. Check the API connection and permissions.", 503);
  const result = await response.json().catch(() => null);
  const phone = Array.isArray(result?.data) ? result.data.find((item: { id: string; number: string }) => item.id === from || item.number === from) : null;
  if (!phone?.number) throw new QuoteTextError("The configured business number is not available to this Quo API key.", 503);
  return { from, sender: String(phone.formattedNumber || phone.number) };
}
export async function quoteTextPreview(admin: SupabaseClient, quoteId: string): Promise<QuoteTextPreview> {
  const { quote, recipient, content, previous } = await loadQuote(admin, quoteId);
  const { from, sender } = await senderDetails();
  const fingerprint = createHash("sha256").update(JSON.stringify([quote.id, quote.updated_at, recipient, content, from, sender, previous])).digest("hex");
  return { quoteId, quoteNumber: quote.quote_number, customer: quote.contact_name || quote.customer || "Customer", recipient, sender, content, fingerprint, previous, blockedReason: blockedReason(previous) };
}

export async function sendQuoteText(admin: SupabaseClient, userId: string, body: { quoteId: string; fingerprint: string; resend?: boolean }) {
  const preview = await quoteTextPreview(admin, body.quoteId);
  if (preview.fingerprint !== body.fingerprint) throw new QuoteTextError("The quote, recipient, or send history changed. Close this window and review the message again.", 409);
  if (preview.blockedReason) throw new QuoteTextError(preview.blockedReason, 409);
  if (preview.previous?.status === "accepted" && body.resend !== true) throw new QuoteTextError("This quote was already submitted to Quo. Confirm that you want to send it again.", 409);
  const attempt = { quote_id: preview.quoteId, attempt_id: randomUUID(), status: "pending", requested_at: new Date().toISOString(), requested_by: userId, recipient: preview.recipient, provider_message_id: null, provider_status: null };
  // Compare-and-swap protects against parallel staff, double-clicks and retries.
  const claim = preview.previous
    ? await admin.from("quote_text_deliveries").update(attempt).eq("quote_id", preview.quoteId).eq("attempt_id", preview.previous.attempt_id).eq("status", preview.previous.status).select("attempt_id").maybeSingle()
    : await admin.from("quote_text_deliveries").insert(attempt).select("attempt_id").maybeSingle();
  if (claim.error || !claim.data) throw new QuoteTextError("Another send may already be in progress, or the send record could not be saved. Close this window and review again. No new text was sent by this attempt.", 409);
  async function record(status: string, messageId: string | null = null, providerStatus: string | null = null) {
    try {
      const result = await admin.from("quote_text_deliveries").update({ status, provider_message_id: messageId, provider_status: providerStatus }).eq("quote_id", preview.quoteId).eq("attempt_id", attempt.attempt_id).select("attempt_id").maybeSingle();
      return !result.error && Boolean(result.data);
    } catch { return false; } // The durable pending claim still blocks another send.
  }
  const { key, from } = configuration();
  let response: Response;
  try {
    response = await fetch(`${api}/messages`, { method: "POST", headers: { Authorization: key, "Content-Type": "application/json" }, body: JSON.stringify({ content: preview.content, from, to: [preview.recipient] }), signal: AbortSignal.timeout(15_000) });
  } catch {
    await record("unknown");
    throw new QuoteTextError("Quo’s response was not received. The text may have been sent. Check Quo; do not resend until this attempt is verified.", 502);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const definiteRejection = response.status >= 400 && response.status < 500 && response.status !== 408;
    await record(definiteRejection ? "failed" : "unknown");
    if (!definiteRejection) throw new QuoteTextError("Quo could not confirm the result. The text may have been sent. Check Quo before retrying.", 502);
    const detail = response.status === 402 ? "Check your Quo API messaging credits." : response.status === 429 ? "Quo is limiting requests; wait before retrying." : "Check the recipient, messaging permissions and Quo connection.";
    throw new QuoteTextError(`Quo rejected this text. ${detail} Close and reopen the preview before retrying.`, 502);
  }
  if (typeof result?.data?.id !== "string" || !result.data.id || ["failed", "undelivered"].includes(result.data.status)) {
    await record("unknown");
    throw new QuoteTextError("Quo did not confirm acceptance. Check its conversation and error log before retrying.", 502);
  }
  const saved = await record("accepted", result.data.id, typeof result.data.status === "string" ? result.data.status : null);
  // Do not change quote approval/payment status or imply delivery from API acceptance.
  return { accepted: true, recipient: preview.recipient, messageId: result.data.id, warning: saved ? null : "Quo accepted the text, but the local status could not be updated. Check Quo before sending again." };
}
