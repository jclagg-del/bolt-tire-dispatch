# KSS/HPR order-to-job mapping review

## Scope and implementation

The November 2, 2026 review confirmed the Work notes report. Portal submission
already stores the structured values; job approval omitted seven existing job
columns. The approved-order edit route had the same omissions.

`lib/customer-order-job-fields.ts` is now shared by both routes. Approval fills
all seven columns, trimming text and normalizing empty optional values to NULL.
Portal edits propagate only structured fields explicitly changed compared with
the saved order. An unrelated contact edit therefore does not overwrite a
technician's structured-field correction or silently backfill an old job.

| Portal source | Job destination / behavior |
| --- | --- |
| submitted_by | submitted_by (new mapping) |
| tire_position | tire_position (new mapping) |
| license_plate | license_plate (new mapping) |
| vehicle_year, vehicle_make, vehicle_model, vehicle_color | Same-named job columns (new mapping) |
| Vehicle fields and plate | Existing human-readable `vehicle` summary retained for cards, labels and integrations |
| customer, contact_name, contact_number, address | customer, contact_name, phone, address (unchanged) |
| facility_id, facility_name | Selected destination preserved; existing paid-quote address matching unchanged |
| job_number, mo_number | po_number, mo_number; leading zeros retained, never used as job identity |
| requested_date, requested_time | Existing appointment conversion / staff override preserved; unrelated portal edits do not reschedule |
| qty, tire_size, tire_product_number | qty, size, tire_product_number (unchanged) |
| Manufacturer part | Existing verified USAF lookup / paid-quote snapshot preserved at approval |
| service_method | Existing Installation/Delivery/Pickup mapping retained |
| notes, goodyear_order | Existing notes and legacy Submitted By/Tire Position lines retained; no separate Goodyear column exists |
| Paid source quote | Verified payment snapshot remains last in the insert; totals, taxes, email, vehicle, split tire lines and payment status are unchanged |
| Supplier purchase / ETA | Existing confirmed purchase status, supplier and delivery-date handling unchanged; this fix never purchases tires |

No schema migration, grant, policy, authentication or payment changes are needed.
The job editor already reads/writes the three reported dedicated fields.
No fields absent from the portal (such as email on an unpaid fleet order) are
invented. Existing approval claims, retry safeguards, source-quote recovery and
completed/paid portal-edit restrictions remain in place. Existing-job recovery
deliberately does not reapply submitted fields over possible manual edits.

## Historical records: assessment, not an automatic repair

A read-only production check on November 2 found 158 approved KSS/HPR orders with
linked jobs. Nonblank source values were missing from 155 job `submitted_by`
fields, 142 `tire_position` fields, and 122 `license_plate` fields. These counts
overlap; they are not a sum of affected jobs. 153 linked jobs were completed or
archived, and one order was linked to a paid quote.

The schema has no general job-field edit history or job/order `updated_at`
column. The JHA history is not a general job audit log. Consequently even NULL
cannot prove the value was never deliberately cleared. Current order data may
also differ from the original approval. **A blanket blank-only backfill cannot
guarantee preservation of subsequent manual decisions.**

`scripts/audit-customer-order-job-fields.sql` provides a read-only, per-field
candidate report. It joins only through `approved_job_id`, never PO, MO, part,
name or approximate vehicle matching. Populated differences are marked for
preservation, not replacement. Multiple links, changed customers, paid-quote
links and closed jobs receive separate review dispositions.

Executing that report as an aggregate also found five jobs with multiple order
links and eleven populated-field differences to preserve. Only five open jobs
fell into the unambiguous blank-field review bucket (30 fields); even those need
office confirmation. Disposition counts are per field and can overlap by job.

Recommended repair process, requiring separate approval:

1. Export a restricted-access before-image and review exact order/job/field
   pairs with the office. Treat intentional clears as edits to preserve.
2. Skip populated fields, ambiguous links, source conflicts and any unapproved
   historical corrections. Review completed/archived/paid jobs separately.
3. If approved, repair only explicitly selected fields in a transaction. Lock
   both rows in a consistent order and compare the current link, source value
   and exact old target value with the reviewed before-image. Skip any changed
   pair instead of overwriting it. No financial, scheduling, destination,
   status, notes or vehicle-summary updates belong in that repair.
4. Record old/new values and reviewer, verify the result, and retain a rollback
   record. Any rollback must likewise refuse to overwrite newer edits.

No historical data has been updated; no write-capable repair or automatic
migration is included. Existing portal edits still follow their prior broader
customer/vehicle-summary/notes update policy; only these seven new structured
fields receive the change-only safeguard. This is not a general audit-history
or concurrency redesign.

## Verification

Regression tests execute the production routes with an in-memory Supabase
boundary (no real orders, messages, supplier purchases or payments):

- KSS and HPR portal submission through approval, seven structured fields,
  selected facility/contact/address, string PO/MO references and all service modes.
- Optional NULL/blank values, staff scheduling override vs supplier ETA.
- Approved portal edits, explicit optional-field clearing, preservation of
  unrelated manual structured-field edits.
- Repeat/concurrent approvals, lost insert responses and failed links.
- Authorization, completed jobs and paid-order editing restrictions.
- Paid job creation, original financials, destination matching and recovery
  of an existing paid-source job without replacing manual fields.

Validation completed: all 424 tests passed and the production build succeeded.
Rerun `node --test tests/*.test.cjs` and the existing production build before merge.
Production verification so far is read-only schema/candidate assessment; no
production approval was exercised with this unpublished change.
