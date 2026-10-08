export type ServiceTaxAddress = { line1: string; line2: string; city: string; state: string; postal_code: string; country: "US" };
const states = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
export function serviceTaxAddress(value: unknown): ServiceTaxAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter your complete service / delivery address before reviewing payment.");
  const input = value as Record<string, unknown>;
  const text = (key: string) => typeof input[key] === "string" ? input[key].trim().replace(/\s+/g, " ") : "";
  const result = { line1: text("line1"), line2: text("line2"), city: text("city"), state: text("state").toUpperCase(), postal_code: text("postal_code"), country: "US" as const };
  if (input.country && input.country !== "US") throw new Error("Enter a US service / delivery address.");
  if (!result.line1 || result.line1.length > 200 || result.line2.length > 200 || !result.city || result.city.length > 100 || !states.has(result.state) || !/^\d{5}(-\d{4})?$/.test(result.postal_code)) throw new Error("Complete the service / delivery street, city, two-letter state and ZIP code. Billing address is separate.");
  return result;
}
export function formatServiceTaxAddress(address: ServiceTaxAddress) {
  return [address.line1, address.line2, address.city, `${address.state} ${address.postal_code}`].filter(Boolean).join(", ");
}
/** Prefill only: never guess city, state or ZIP when the saved free text is ambiguous. */
export function serviceAddressPrefill(value?: string | null): ServiceTaxAddress {
  const blank: ServiceTaxAddress = { line1: value || "", line2: "", city: "", state: "", postal_code: "", country: "US" };
  const parts = (value || "").split(/[,\n]+/).map(part => part.trim()).filter(Boolean);
  if (/^(US|USA|United States)$/i.test(parts.at(-1) || "")) parts.pop();
  if (parts.length < 3) return blank;
  const tail = parts.pop()!.match(/^([a-z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (!tail) return blank;
  const city = parts.pop()!;
  try { return serviceTaxAddress({ line1: parts[0], line2: parts.slice(1).join(", "), city, state: tail[1], postal_code: tail[2] }); } catch { return blank; }
}
