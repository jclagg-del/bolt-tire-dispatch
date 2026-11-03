# Quote texting through Quo

Staff use **Text Quote → review recipient/message → Send text**. Opening the dialog only reads data. The server builds the recipient and public quote link from the saved quote; callers cannot supply message content, recipient or sender. Only authenticated admin/office users with completed password setup may use the endpoint.

## Deployment and configuration

Apply `20261103221651_quote_text_delivery_guard.sql` before deploying the endpoint. The new table is server-only (RLS enabled, no client grants). It stores the latest delivery attempt per quote, not a complete message archive. Quo remains the message history/delivery source.

Existing server-only variables: `QUO_API_KEY`, `QUO_PHONE_NUMBER_ID`. The latter must match an accessible Quo phone-number ID or E.164 number. Preview verifies it via Quo's phone-numbers API and displays the business number. `NEXT_PUBLIC_APP_URL` must be the trusted HTTPS website origin. Never expose the API key in a public variable.

Uses the documented legacy v1 endpoints at `https://api.quo.com/v1`. API messaging credits apply. A successful API response means **accepted**, not delivered; staff check Quo for delivery and replies. Quote approval, payment and financial statuses are not changed.

## Duplicate prevention and recovery

The server inserts/atomically replaces a per-quote pending claim before contacting Quo. Every send recomputes the reviewed fingerprint; changed contact, content, sender or send history requires a new preview. Accepted messages require explicit resend confirmation and a one-minute cooldown. Definite 4xx rejections can be retried after the cooldown with a fresh preview.

Network failure, timeout, 5xx, malformed acceptance or an interrupted server can leave `unknown` or `pending`. Those states deliberately block resends, without an expiry. **Do not delete the claim or mark it failed merely because time elapsed.** First verify the exact recipient, timestamp and content in Quo, including its error log/provider support if necessary. If acceptance is confirmed, an administrator can conditionally update the matching `quote_id` and `attempt_id` to `accepted`, with the verified provider message ID. Only if non-acceptance is positively established should the matching attempt be marked `failed`. Check the update affected exactly one row; a changed attempt must not be overwritten. No automatic reconciliation or unverified retry is performed.

## Verification

`node --test tests/quote-text.test.cjs tests/quote-sharing.test.cjs`

Tests mock Quo (no actual texts): authenticated role checks, exact saved recipient/content, preview-only GET, stale preview rejection, simultaneous sends, replay, explicit resend, cooldown, missing configuration, provider rejection/ambiguity and database failures. Production smoke check: open the dialog and verify recipient, message and business sender; cancel without sending. A real delivery test requires an explicitly authorized test recipient.
