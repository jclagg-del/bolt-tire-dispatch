import { serviceAddressPrefill, serviceTaxAddress } from "@/lib/service-tax-address";

export function quickBooksServiceAddress(value: string) {
  let address;
  try { address = serviceTaxAddress(serviceAddressPrefill(value)); }
  catch { throw new Error("Enter the full service address on the job before invoicing: street, city, two-letter state and ZIP (separated by commas). QuickBooks needs it to calculate location-specific tax."); }
  return { Line1: address.line1, ...(address.line2 ? { Line2: address.line2 } : {}), City: address.city,
    CountrySubDivisionCode: address.state, PostalCode: address.postal_code, Country: "USA" };
}
