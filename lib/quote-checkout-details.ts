export type QuoteCheckoutDetails = { address: string; email: string; phone: string; requested_date: string };

export function quoteCheckoutDetails(value: Record<string, unknown>): QuoteCheckoutDetails {
  const text = (key: string) => typeof value[key] === "string" ? value[key].trim() : "";
  return { address: text("address"), email: text("email"), phone: text("phone"), requested_date: text("requested_date") };
}

export function quoteCheckoutDetailsError(value: QuoteCheckoutDetails): string | null {
  if (!value.address || value.address.length > 1000) return "Enter your full service address, including city, state and ZIP code.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) || value.email.length > 254) return "Enter a valid email address.";
  const digits = value.phone.replace(/\D/g, "");
  if (!/^[+()\d\s.-]+$/.test(value.phone) || digits.length < 10 || digits.length > 15 || value.phone.length > 50) return "Enter a valid phone number, including the area code.";
  const date = new Date(`${value.requested_date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.requested_date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.requested_date) return "Choose a valid requested service date.";
  return null;
}
