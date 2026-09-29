import type { QuoteCheckoutDetails } from "@/lib/quote-checkout-details";

export default function QuoteCheckoutInformation({ value, onChange, disabled = false }: {
  value: QuoteCheckoutDetails;
  onChange: (value: QuoteCheckoutDetails) => void;
  disabled?: boolean;
}) {
  return <section className="quote-form-card" id="quote-checkout-information">
    <h2>Your information</h2>
    <p>Required before payment. Your requested service date is subject to confirmation by Bolt Tire.</p>
    <div className="quote-form-grid">
      <label className="quote-field quote-full"><span>Service address *</span>
        <input autoComplete="street-address" required maxLength={1000} placeholder="Street, city, state and ZIP code" value={value.address} disabled={disabled} onChange={event => onChange({ ...value, address: event.target.value })} />
      </label>
      <label className="quote-field"><span>Email *</span>
        <input type="email" autoComplete="email" required maxLength={254} value={value.email} disabled={disabled} onChange={event => onChange({ ...value, email: event.target.value })} />
      </label>
      <label className="quote-field"><span>Phone *</span>
        <input type="tel" autoComplete="tel" required maxLength={50} value={value.phone} disabled={disabled} onChange={event => onChange({ ...value, phone: event.target.value })} />
      </label>
      <label className="quote-field"><span>Requested service date *</span>
        <input type="date" required value={value.requested_date} disabled={disabled} onChange={event => onChange({ ...value, requested_date: event.target.value })} />
      </label>
    </div>
  </section>;
}
