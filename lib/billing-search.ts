type SearchableBillingJob = {
  id: string | number;
  customer?: string | null; billing_name?: string | null; facility_name?: string | null;
  contact_name?: string | null; phone?: string | null; contact_number?: string | null; email?: string | null;
  po_number?: string | null; mo_number?: string | null; invoice_number?: string | null;
  vehicle?: string | null; unit_number?: string | null; license_plate?: string | null; address?: string | null;
};

export function matchesBillingSearch(job: SearchableBillingJob, search: string) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const fields = [job.id, job.customer, job.billing_name, job.facility_name, job.contact_name,
    job.phone, job.contact_number, job.email, job.po_number, job.mo_number, job.invoice_number,
    job.vehicle, job.unit_number, job.license_plate, job.address]
    .filter(value => value !== null && value !== undefined).map(value => String(value).toLowerCase());
  const phones = [job.phone, job.contact_number].map(value => String(value || "").replace(/\D/g, ""));
  return terms.every(term => fields.some(field => field.includes(term)) ||
    (/^[\d()+.-]+$/.test(term) && term.replace(/\D/g, "").length >= 3 && phones.some(phone => phone.includes(term.replace(/\D/g, "")))));
}
