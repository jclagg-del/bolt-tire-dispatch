# Payment-method pricing rollout — staged release

## Current launch status — 2026-10-08

This section supersedes the historical checkpoints below. Application publishing and enrollment enablement are tracked separately; do not infer that an earlier test checkpoint is the current production state.

- Applied the additive payment migration to production `pbusihphlqgdiljwvywu` with Supabase's migration tool. Verified RLS, denied anonymous/staff access, and service-only RPC execution. No new advisor warnings; the new private table intentionally adds an RLS-without-policy INFO. No customer payment rows were changed.
- Actual-app quote #6 sandbox test used a New York service address with a Florida billing address and mixed taxable/non-taxable extras. Stripe returned $48.81 sales tax, $624.28 paid; the snapshot retained the NY shipping tax destination. Corrected paid receipt pages to show recorded tax and the actual amount paid, not the old estimate.
- Actual public inventory → configuration → new quote #7 → ACH review/submission passed using a clearly labeled QA catalog fixture, not real supplier inventory. $723.00 subtotal + $63.28 NY tax = $786.28. Stripe's documented insufficient-funds test bank failed after microdeposit verification (`pi_3UONWZP9jgv8gmqF0KOMdhKL`). Reconciliation returned HTTP 200, quote stayed unpaid, payment entry reopened, and no job/order/paid email was created for it. Replayed prior events did not duplicate receipts/jobs.
- All 251 regression tests pass. QA emails stayed captured locally; supplier calls were blocked. The local QA server was stopped after browser tests.
- Live Stripe ACH Direct Debit is now Enabled after its non-binding delayed-payment/webhook notice. No new terms or credentials were accepted/created. A browser mis-target briefly enabled Afterpay; it was restored and verified Disabled before continuing.
- Existing live standard API credentials and the seven-event webhook subscription are configured. Existing legacy deliveries show HTTP 200. External delivery of the newly deployed PaymentIntent handler can only be verified after deployment; local signed reconciliation is not proof of external delivery.
- Stage code deployment with new enrollment OFF, verify the deployed application, then enable `NEXT_PUBLIC_PAYMENT_METHOD_PRICING_ENABLED=true` for Production and rebuild. No real test charge or customer email is authorized for launch verification.

## Agreed behavior

Existing prices are the ACH/debit/prepaid prices. Regular credit prices are 3% higher, rounded per invoice unit. Fixed NY state tire fees are unchanged. Both prices are visible before payment. Only Stripe-verified funding determines the price; unsupported/unknown funding fails closed. New quotes enroll only when `NEXT_PUBLIC_PAYMENT_METHOD_PRICING_ENABLED=true`. Previously enrolled quotes remain recoverable if new enrollment is disabled.

No existing paid quotes are repriced. New settled snapshots feed job conversion, mapped additional invoice items, and confirmation messages. Payment does not order tires. ACH remains pending until Stripe confirms success. Return URL parameters are never payment proof.

## Implemented locally

- Public shopping/configuration/quote price displays and a Stripe payment-detail → final review → confirm flow.
- Server verification of ConfirmationToken, funding, tax and saved quote prices.
- Quote-first database locks, one active attempt, stable Stripe idempotency, and immutable purchased details. No timeout creates a new charge. Old failures cannot clear a newer attempt, and success cannot downgrade to processing.
- Automatic confirmation with server-only manual card capture. The browser's Elements capture mode matches the PaymentIntent. After authorization, the server verifies the bound card, funding and exact capturable amount before capture. Both browser resume and authorization webhooks use the same capture idempotency key. ACH uses automatic capture and deferred settlement.
- PaymentIntent webhook verification, legacy Checkout compatibility, durable idempotent email receipts, and paid snapshot reconciliation.
- Migration generated with Supabase CLI and tested using an isolated in-memory PostgreSQL runtime. Production migration has NOT been applied.

## Verified

- Production build with feature enabled and all existing regression tests (see final test output).
- Unit tests for credit/debit/prepaid/ACH pricing, additional items, state fees, tax rejection, unknown funding, stale details, payment identity, uncertain network outcomes, pending emails, webhook replay and invoice snapshots.
- Actual Stripe test payments: manual credit/debit/prepaid succeeded at the expected totals; ACH remained processing; duplicate requests returned the same intent. Tax hook accepted. Evidence: `tests/stripe-sandbox-verification-results.json`.
- Chrome browser ConfirmationTokens exposed an incompatibility: Payment Element rejects manual confirmation. Replaced that approach with automatic confirmation plus verified manual capture. The corrected sandbox browser flow passed a 3DS credit payment ($1,030), debit ($1,000), and prepaid ($1,000). An insufficient-funds card returned a decline. These are standalone sandbox-verifier results, not full quote/site end-to-end tests. Earlier manual-confirmation results above used API fixture methods only and do not validate Payment Element compatibility.
- A browser-collected Stripe Test Bank account received the $1,000 ACH price and returned `requires_action` (microdeposit verification), not paid. This is not a completed ACH settlement test. The application now provides a validated Stripe-hosted verification link after submission/resume and explains the waiting period; that additional UI still requires actual-app browser QA.
- On 2026-10-08, the user approved the TEST-only New York tax acknowledgment. Test registration `taxreg_1UOGqQP9jgv8gmqFvZtivOSe` is collecting in sandbox only. A New York City test calculation returned 8.875% ($91.41 on $1,030) and the simulated card payment settled the exact $1,121.41 total. This verifies that fixture, not live registration or all service-address tax treatment.
- Isolated PostgreSQL: migration executes, duplicate review blocked, paid price edits blocked, notes editable, submitted attempt cannot be canceled from the review UI, old failures do not clear new attempts, and service-only execution/RLS permissions are correct. This is not a multi-connection load test or a production schema validation.

## Remaining launch gates

### Live configuration check — 2026-10-08

- Stripe LIVE Tax Locations shows New York collecting tax (registration `taxreg_1SrOfIP9jgv8gmqFSL6Cfgj6`). No registration or tax settings changed.
- Existing live webhook `we_1U4QvYP9jgv8gmqFPvTD45Br` targets `https://app.bolttire.com/api/stripe/webhook`, API version `2024-04-10`. Before the update it subscribed only to `checkout.session.completed`; its dashboard showed six deliveries this week, zero failed. That confirms historical legacy delivery only, not the new PaymentIntent flow.
- After the user's action-time approval, saved the six required PaymentIntent events alongside `checkout.session.completed`. Stripe's destination details confirm **Active — 7 events**. No secret, endpoint URL, API version, tax setting, or live payment changed. Evidence: `/tmp/bolt-stripe-notifications-saved.png`. Subscription setup is complete; actual new-event delivery/retry verification still remains. New checkout enrollment and production deployment are unchanged.
- Corrected the new payment review locally to require a structured service/delivery address, save the confirmed destination to the quote, and use Stripe Tax's shipping address source. Billing details remain separate. The immutable payment snapshot includes the tax destination. Unit tests cover differing billing/service states, incomplete addresses, failed address saves, mixed-taxability extra items, and the NY zero-tax guard. Actual Stripe/browser verification of this revised destination flow remains a launch gate.

1. **Additional tax scenarios:** TEST registration, taxable NYC tire/service/disposal lines with unchanged non-taxable state fees, and tax-exempt organization extras are verified. Mixed taxable/non-taxable extras and differing service/billing addresses pass unit tests; still verify both through the revised actual-app Stripe TEST flow. Do not register with a real tax authority or change live tax settings.
2. **Browser verification:** Actual saved-quote checkout passed credit/3DS, website debit, organization prepaid, ACH verification/reload/settlement, and card decline against the isolated database. Still verify public inventory → configuration → quote creation, ACH failure and relevant recovery edge cases. Do not widen restricted-key permissions without action-time approval.
3. Verify the existing LIVE tax configuration read-only and expected billing/service-location tax handling. Never guess a tax registration or silently accept zero NY tax on non-exempt purchases.
4. Apply `supabase/migrations/20261007232206_payment_method_checkout.sql` with the Supabase migration tool, then check advisors and function grants. Public quote GET now selects the new columns, so the schema MUST precede deployment.
5. Live subscriptions are configured for `/api/stripe/webhook`: `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`, `payment_intent.canceled`, `payment_intent.requires_action`, and `payment_intent.amount_capturable_updated`, retaining `checkout.session.completed`. The authorization event is essential for capture if the browser closes. Still verify actual new-event delivery and failure/retry behavior with no real customer emails after the handler is deployed.
6. Verify Stripe live key permissions for ConfirmationToken read, PaymentIntent write, payment-method read, and tax calculation/transaction operations; do not expose credentials in logs, repository or chat.
7. Deploy initially with enrollment false. Verify old quote payments still work. After all tests pass, enable live ACH and rebuild with enrollment true; do not make a real test charge or send test emails to customers.

### Test environment prerequisite (checked 2026-10-08)

The user approved a free ($0/month) separate project after branching required a paid plan. `Bolt Tire Checkout QA` (`duzyyolyevpuobdtvxve`, us-east-2) is active. No plan upgrade was made. Six checkout tables were reconstructed from production column metadata with checkout keys/checks; no production rows were copied. This is a focused checkout baseline, not a complete production clone. Additional-item and payment migrations applied successfully. Anonymous/authenticated access is denied; service-only test access is intentional. Advisor INFO about RLS without policies is expected for these locked-down QA tables.

`scripts/checkout-qa-runner.cjs` runs the actual Next application locally with QA-only Supabase and restricted Stripe TEST credentials held in memory. Outbound server requests are limited to this QA project, Stripe TEST, and loopback. Resend calls are captured locally and never delivered. Supplier requests are blocked. Its reconciliation button signs fixture events based on freshly retrieved Stripe test state and sends them through the real webhook handler; this does NOT verify external Stripe webhook delivery.

Actual-app browser results on 2026-10-08:
- Quote #1, 3DS credit: $539.42 subtotal + $46.99 NYC tax = $586.41. `pi_3UOLzkP9jgv8gmqF1DcMIMyc` succeeded. Quote marked paid, customer/office emails captured, reload stayed paid.
- Quote #2, website debit: $524.00 + $45.62 tax = $569.62. `pi_3UOM1PP9jgv8gmqF1hi2MLmn` succeeded. One paid job created with matching totals and `tires_ordered=false`.
- Quote #3, tax-exempt organization prepaid with two extra item lines: $559.00, no tax. `pi_3UOM2ZP9jgv8gmqF14pR1wqM` succeeded. One new paid customer order created, `tires_ordered=false`, not a supplier purchase. Six locally captured emails across these three payments. Earlier payments were replayed without duplicate receipts/jobs.
- These fixtures start from saved quotes. Public inventory search → shop configuration → quote creation and actual Stripe webhook delivery remain separate launch gates.
- Corrected the paid checkout wording to distinguish a requested appointment from a confirmed service time, and show approved tax exemptions explicitly.
- Quote #4 ACH: actual browser bank entry used Stripe's fake account. $524.00 lower price, `pi_3UOM4pP9jgv8gmqF0zbUXDT9`. Manual verification link survived reload/resume with the same intent. Stripe-hosted TEST verification completed using its [documented test code](https://docs.stripe.com/testing#ach-direct-debit); webhook first reconciled to `processing`, quote stayed `pending`, and no paid receipts were emitted then. Later Stripe reported `succeeded`; reconciliation marked the quote paid at $524.00 and captured exactly two more emails (eight total).
- Quote #5 insufficient-funds credit: `pi_3UOM89P9jgv8gmqF0vLlaBFX` declined. UI displayed the decline and reopened payment entry; attempt `failed`, quote `unpaid`, no paid receipt/order/job.
- All five reconciliation responses were HTTP 200. Final replay retained eight captured emails, one website job, one organization order, and zero supplier tire orders. Isolated PostgreSQL permission/state tests passed again; all 239 regression tests and the feature-enabled production build passed after the wording changes. The local QA server was stopped and in-memory credentials cleared. The free QA project remains for unfinished launch checks; no production migration or deployment occurred.

## Commands

### NY quarterly collection report — implemented locally, not published

Billing now includes an admin-only report using NY filing quarters only: March–May, June–August, September–November, and December–February. It lists recorded fully paid Stripe quote and job tax, separates Stripe from other recorded amounts, and exports a selected-quarter CSV. Linked quote/job records and repeated payment/invoice identifiers are not counted twice. Missing values/dates, refunds and partial payments are flagged for reconciliation rather than estimated. This is not a filed return or net tax liability calculation; historical job amounts and QuickBooks sync dates need reconciliation against source payment records.

On 2026-10-08, read-only production schema inspection confirmed all selected report columns and the staff role fields exist. No production rows were modified. Quarter boundaries, leap years, New York timezone conversion, duplicate records, CSV escaping, authorization, pagination and failed reads are covered by regression tests. All 250 regression tests passed after the reporting and service-address changes. Production publishing and actual browser verification remain outstanding.

```sh
node --test tests/*.test.cjs
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite node tests/payment-checkout-db.cjs
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=build-placeholder NEXT_PUBLIC_PAYMENT_METHOD_PRICING_ENABLED=true npx next build --webpack
node scripts/stripe-pricing-sandbox.cjs
```

The sandbox verifier is loopback-only, accepts restricted TEST keys only, retains credentials only in memory, and has no database or email access. Its browser form uses fake Stripe test payment details only. Stop it when testing ends.

## Rollback

Disable enrollment and rebuild; do not remove the additive migration, stop PaymentIntent webhook delivery, or disable already-submitted ACH processing. Existing version-1 quotes retain their promised dual prices and payment recovery path. Investigate uncertain attempts in Stripe before any manual reset. No automated timeout may release a submitted attempt into a new charge.
