export type ShopCustomer = { name: string; phone: string; email: string; vehicle: string; address: string };

export function normalizeShopCustomer(value: Record<string, unknown>): ShopCustomer {
  const text = (key: string) => typeof value[key] === "string" ? value[key].trim() : "";
  return { name: text("name"), phone: text("phone"), email: text("email"), vehicle: text("vehicle"), address: text("address") };
}

// Shared by the form, quote creation, and payment entry so required details
// cannot be skipped by calling the checkout endpoints directly.
export function shopCustomerError(value: Record<string, unknown>): string | null {
  const customer = normalizeShopCustomer(value);
  if (!customer.name) return "Enter your name.";
  if (!customer.phone) return "Enter your phone number.";
  if (!/^[+()\d\s.-]+$/.test(customer.phone) || customer.phone.replace(/\D/g, "").length < 10 || customer.phone.replace(/\D/g, "").length > 15) return "Enter a valid phone number, including the area code.";
  if (!customer.email) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return "Enter a valid email address.";
  if (!customer.vehicle) return "Enter your vehicle year, make and model.";
  if (!customer.address) return "Enter your service address.";
  return null;
}
