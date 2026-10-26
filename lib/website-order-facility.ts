import type { createAdminClient } from "@/lib/supabase/admin";

type Facility = { id: number; name: string; address: string; active?: boolean };
type CheckoutDestination = { discount_code_label?: string | null; discount_organization?: string | null; address?: string | null };

function normalized(value: string) {
  return value.toLowerCase().replace(/\broad\b/g, "rd").replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave").replace(/\bdrive\b/g, "dr")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// A code identifies an organization, not necessarily a destination. Require a
// unique address match too; never send every HPR order to its first facility.
export function matchWebsiteOrderFacility(quote: CheckoutDestination, facilities: Facility[]) {
  const organization = normalized(quote.discount_organization || "");
  const address = normalized(quote.address || "");
  if (!quote.discount_code_label?.trim() || !organization || !address) return null;
  const matches = facilities.filter(facility => {
    if (facility.active === false) return false;
    const name = normalized(facility.name);
    const destination = normalized(facility.address);
    const sameOrganization = name === organization || name.startsWith(`${organization} `);
    const sameAddress = destination.length >= 10 && /^\d+\s/.test(destination)
      && (address === destination || address.startsWith(`${destination} `));
    return sameOrganization && sameAddress;
  });
  return matches.length === 1 ? { facility_id: matches[0].id, facility_name: matches[0].name } : null;
}

export async function websiteOrderFacility(admin: ReturnType<typeof createAdminClient>, quote: CheckoutDestination) {
  if (!quote.discount_code_label?.trim() || !quote.discount_organization?.trim() || !quote.address?.trim()) return null;
  const { data, error } = await admin.from("kingdom_facilities").select("id,name,address,active").eq("active", true);
  if (error) throw new Error(`Could not match the order facility: ${error.message}`);
  return matchWebsiteOrderFacility(quote, data || []);
}
