# Office editing before accepting fleet orders

Orders → Edit order opens a separate staff editor for unpaid, unaccepted Kingdom
Support Services and HPR portal submissions. Saving returns to Orders; acceptance
remains a separate action. No customer notifications, purchases, jobs, payments,
or shared facility updates are performed by Save.

Only verified admin/office users with completed password setup may read or save.
Approved/in-progress, rejected, cancellation, paid, website-quote and multi-item
orders are excluded. Facility changes use active saved facilities or a custom
entry; existing inactive facility selections are preserved until changed.

The API validates a full allowlist, required job/MO references, integer quantity,
real appointment dates, Eastern local time and the noon–1 PM restriction. It
compares a full-row fingerprint, then passes that server-read snapshot to a
service-role-only, security-invoker RPC. The RPC locks the order and compares the
snapshot again before updating only dedicated editable columns. `reviewed_at`
changes on office save to invalidate the existing approval route's optimistic
claim; order status stays `new`. No schema columns or historical rows change.

Tire, quantity, organization and reference fields cannot change after a supplier
claim or manual ordered flag. A narrowly scoped supplier-claim insert trigger
locks the same customer order and verifies part/quantity/PO before purchasing.
It affects customer-order claims with a `customerOrderId` and no `jobId`; job and
standalone supplier purchases are unchanged. No lock spans a supplier call.

## Verification

- `node --test tests/staff-order-edit.test.cjs`
- `node --test --test-reporter=dot tests/*.test.cjs`
- Production build with placeholder public Supabase configuration.
- Database regression: execute one transaction that creates
  `bolt_staff_order_edit_qa`, copies empty `customer_orders` and `supplier_orders`
  table shapes (`LIKE public.<table> INCLUDING DEFAULTS`), replaces `public.`
  with `bolt_staff_order_edit_qa.` in this feature's migration, executes
  `tests/staff-order-edit.sql`, then **ROLLBACK**. Never replace/delete an existing
  schema; CREATE must fail if the probe name already exists. All fixture rows
  and triggers are isolated, and nothing contacts a supplier or customer.
  Alternatively, run that same isolated probe inside the migration transaction,
  drop only the newly created QA schema after its assertions pass, then install
  the public functions. This was the deployment verification used here.

Verified November 3, 2026: 444 application tests passed (one unrelated optional
test skipped), production build passed, isolated SQL assertions passed, temporary
QA schema removed, browser roles denied RPC execution, and security advisor
findings unchanged. No real customer order was edited during verification.

Deploy the migration before the application. Reverting the application hides the
editor; the RPC remains inaccessible to browsers. Historical orders are untouched.
