export const paidTiresQueueUrl = "/jobs?queue=paid-tires-to-order";

// Keep identical to the dashboard's paid-tire count. Payment and scheduling
// are separate: an unscheduled or already-paid job can still need tires.
export function isPaidTiresToOrder(job: {
  payment_status?: string | null;
  tires_ordered?: boolean | null;
  archived?: boolean | null;
  source_quote_id?: string | null;
}) {
  return job.payment_status === "paid" && job.tires_ordered === false
    && job.archived === false && job.source_quote_id != null;
}
