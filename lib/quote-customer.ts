export type QuoteCustomer = {
  customer: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
};

export const customerContactFields = ["contact_name", "phone", "email", "address"] as const;

export function customerSearchPattern(value: string) {
  return `%${value.trim().replace(/[\\%_]/g, "\\$&")}%`;
}

// Inputs are newest-first. Keep the latest known contact information per name;
// QuickBooks can fill gaps without replacing a more recent local contact.
export function mergeQuoteCustomers(rows: Partial<QuoteCustomer>[]): QuoteCustomer[] {
  const customers = new Map<string, QuoteCustomer>();
  for (const row of rows) {
    const name = row.customer?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const customer = customers.get(key) || { customer: name, contact_name: "", phone: "", email: "", address: "" };
    for (const field of customerContactFields) customer[field] ||= row[field]?.trim() || "";
    customers.set(key, customer);
  }
  return [...customers.values()];
}

export function changeQuoteCustomerName<T extends QuoteCustomer>(form: T, name: string, previous: QuoteCustomer | null): T {
  const next = { ...form, customer: name };
  // Don't leave another customer's auto-filled details behind when changing names.
  // Preserve anything the user has explicitly edited.
  if (previous && name.trim().toLowerCase() !== previous.customer.trim().toLowerCase()) {
    for (const field of customerContactFields) if (next[field] === previous[field]) next[field] = "";
  }
  return next;
}
