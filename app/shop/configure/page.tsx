"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { shopCustomerError } from "@/lib/shop-customer";
import CheckoutDiscount from "@/components/CheckoutDiscount";
import { cents, paymentMethodPricingEnabled, quotePaymentPrice } from "@/lib/quote-payment-pricing";
import { paymentPricePair } from "@/lib/payment-method-pricing";
import {
  discountLabel,
  discountedTirePrice,
  type AppliedDiscount,
} from "@/lib/discounts";
type Product = {
  id: string;
  brand: string;
  model: string;
  size: string;
  imageUrl: string | null;
  quotePrice: number;
  serviceCategory: "passenger" | "truck";
  fitmentPosition: "front" | "rear" | "both";
};
type Settings = {
  passenger: {
    two: number;
    four: number;
  };
  truck: {
    two: number;
    four: number;
    six: number;
  };
  disposal: {
    passenger: number;
    truck: number;
  };
  stateFee: number;
  taxRate: number;
};
export default function ConfigurePurchase() {
  const router = useRouter();
  const [data, setData] = useState<{
    query: string;
    products: Product[];
    quantity: number;
  } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [service, setService] = useState<"installation" | "tires_only">(
    "installation",
  );
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    vehicle: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [appointment, setAppointment] = useState({ date: "", time: "" });
  const [availableTimes, setAvailableTimes] = useState<
    Array<{
      value: string;
      label: string;
    }>
  >([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("bolt-tire-purchase");
      if (saved) setData(JSON.parse(saved));
    } catch {}
    fetch("/api/public/shop/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => setError("Pricing could not be loaded."));
  }, []);
  useEffect(() => {
    if (service !== "installation" || !appointment.date) {
      setAvailableTimes([]);
      return;
    }
    setAvailabilityLoading(true);
    fetch("/api/public/shop/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: appointment.date }),
    })
      .then(async (r) => {
        const x = await r.json();
        if (!r.ok) throw new Error(x.error);
        setAvailableTimes(x.times || []);
        setAppointment((current) =>
          x.times?.some(
            (item: { value: string }) => item.value === current.time,
          )
            ? current
            : { ...current, time: "" },
        );
      })
      .catch((e) =>
        setError(e.message || "Available times could not be loaded."),
      )
      .finally(() => setAvailabilityLoading(false));
  }, [appointment.date, service]);
  const breakdown = useMemo(() => {
    if (!data || !settings) return null;
    const staggered = data.products.length === 2;
    const quantity = staggered ? 4 : data.quantity;
    const originalTires = data.products.reduce(
      (sum, p) => sum + p.quotePrice * (staggered ? 2 : quantity),
      0,
    );
    const tireSubtotal = data.products.reduce(
      (sum, p) =>
        sum +
        discountedTirePrice(p.quotePrice, discount) *
          (staggered ? 2 : quantity),
      0,
    );
    const discountAmount =
      Math.round((originalTires - tireSubtotal) * 100) / 100;
    const category = data.products.some((p) => p.serviceCategory === "truck")
      ? "truck"
      : "passenger";
    const installation =
      service === "tires_only"
        ? 0
        : category === "truck"
          ? quantity >= 5
            ? settings.truck.six
            : quantity >= 3
              ? settings.truck.four
              : settings.truck.two
          : quantity >= 3
            ? settings.passenger.four
            : settings.passenger.two;
    const disposal =
      service === "tires_only" ? 0 : settings.disposal[category] * quantity;
    const stateFee = settings.stateFee * quantity;
    const estimatedTax = discount?.tax_exempt
      ? 0
      : ((tireSubtotal + installation + disposal) * settings.taxRate) / 100;
    const regular = quotePaymentPrice({ quantity: staggered ? 2 : quantity, rear_quantity: staggered ? 2 : 0, installation_cost: installation, disposal_fee: disposal, service_call_fee: 0, ny_state_tire_fee: stateFee, tax_exempt: Boolean(discount?.tax_exempt) }, { id: "estimate", price_per_tire: discountedTirePrice(data.products[0].quotePrice, discount), rear_price_per_tire: staggered ? discountedTirePrice(data.products[1].quotePrice, discount) : null }, "regular");
    const regularTotal = (regular.subtotalCents + (discount?.tax_exempt ? 0 : Math.round(regular.taxableCents * settings.taxRate / 100))) / 100;
    return {
      quantity,
      originalTires,
      tireSubtotal,
      discountAmount,
      installation,
      disposal,
      stateFee,
      estimatedTax,
      total: tireSubtotal + installation + disposal + stateFee + estimatedTax,
      regularTotal,
    };
  }, [data, service, settings, discount]);
  const checkout = async () => {
    if (!data || !breakdown || loading) return;
    const customerError = shopCustomerError(customer);
    if (customerError) {
      setError(customerError);
      return;
    }
    setLoading(true);
    setError("");
    const r = await fetch("/api/public/shop/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...customer,
        discountCode: discount?.code || "",
        requestedDate: appointment.date,
        requestedTime: appointment.time,
        query: data.query,
        productId: data.products[0].id,
        quantity: breakdown.quantity,
        service,
        selections: data.products.map((p) => ({
          productId: p.id,
          size: p.size,
          position: p.fitmentPosition,
        })),
      }),
    });
    const x = await r.json();
    if (!r.ok) {
      setLoading(false);
      setError(x.error || "Checkout could not be started");
      return;
    }
    router.push(`/q/${x.token}?purchase=1`);
  };
  if (!data)
    return (
      <main className="purchase-builder-page">
        <div className="purchase-builder-empty">
          <h1>Your tire selection expired</h1>
          <button onClick={() => router.push("/shop")}>
            Return to tire search
          </button>
        </div>
      </main>
    );
  return (
    <main className="purchase-builder-page">
      <header className="purchase-builder-header">
        <img src="/bolt-logo.png" alt="Bolt Tire" />
        <div>
          <span>STEP 2 OF 3</span>
          <h1>Build your order</h1>
          <p>Choose your service and review every cost before payment.</p>
        </div>
      </header>
      <div className="purchase-builder-layout">
        <section className="purchase-builder-main">
          <CheckoutDiscount discount={discount} onChange={setDiscount} />
          <div className="purchase-builder-card">
            <div className="purchase-builder-title">
              <span>1</span>
              <div>
                <h2>Your tires</h2>
                <p>{breakdown?.quantity || data.quantity} tires selected</p>
              </div>
              <button onClick={() => router.push("/shop")}>Change</button>
            </div>
            {data.products.map((p) => (
              <div
                className="purchase-builder-tire"
                key={`${p.fitmentPosition}-${p.id}`}
              >
                {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <div />}
                <div>
                  <strong>
                    {p.brand} {p.model}
                  </strong>
                  <span>
                    {p.size}
                    {p.fitmentPosition !== "both"
                      ? ` · ${p.fitmentPosition}`
                      : ""}
                  </span>
                </div>
                <b>{paymentMethodPricingEnabled() ? <>Credit ${(paymentPricePair(cents(p.quotePrice)).regularCents / 100).toFixed(2)} each<br /><small>ACH / debit / prepaid ${p.quotePrice.toFixed(2)}</small></> : <>${p.quotePrice.toFixed(2)} each</>}</b>
              </div>
            ))}
          </div>
          <div className="purchase-builder-card">
            <div className="purchase-builder-title">
              <span>2</span>
              <div>
                <h2>Choose your service</h2>
                <p>
                  You can purchase tires with or without mobile installation.
                </p>
              </div>
            </div>
            <div className="purchase-service-options">
              <button
                className={service === "installation" ? "active" : ""}
                onClick={() => setService("installation")}
              >
                <strong>Mobile installation</strong>
                <span>
                  We come to you and install, balance, and dispose of your old
                  tires.
                </span>
                <b>
                  {breakdown ? paymentMethodPricingEnabled() ? <>Credit ${(paymentPricePair(cents(breakdown.installation)).regularCents / 100).toFixed(2)}<br /><small>ACH / debit / prepaid ${breakdown.installation.toFixed(2)}</small></> : `$${breakdown.installation.toFixed(2)}` : "—"}
                </b>
              </button>
              <button
                className={service === "tires_only" ? "active" : ""}
                onClick={() => setService("tires_only")}
              >
                <strong>Tires only</strong>
                <span>Purchase the tires without installation.</span>
                <b>$0 installation</b>
              </button>
              <button disabled>
                <strong>Additional services</strong>
                <span>Rotations, repairs, and more are coming soon.</span>
                <b>Coming soon</b>
              </button>
            </div>
          </div>
          {service === "installation" ? (
            <div className="purchase-builder-card">
              <div className="purchase-builder-title">
                <span>3</span>
                <div>
                  <h2>Choose an appointment</h2>
                  <p>Available Monday through Friday, 8:00 AM–3:30 PM.</p>
                </div>
              </div>
              <div className="purchase-builder-fields">
                <label>
                  Service date *
                  <input
                    type="date"
                    min={new Date().toLocaleDateString("en-CA", {
                      timeZone: "America/New_York",
                    })}
                    value={appointment.date}
                    onChange={(e) =>
                      setAppointment({ date: e.target.value, time: "" })
                    }
                  />
                </label>
                <label>
                  Available time *
                  <select
                    value={appointment.time}
                    disabled={!appointment.date || availabilityLoading}
                    onChange={(e) =>
                      setAppointment({ ...appointment, time: e.target.value })
                    }
                  >
                    <option value="">
                      {availabilityLoading
                        ? "Checking schedule…"
                        : availableTimes.length
                          ? "Choose a time"
                          : appointment.date
                            ? "No times available"
                            : "Choose a date first"}
                    </option>
                    {availableTimes.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : null}
          <div className="purchase-builder-card">
            <div className="purchase-builder-title">
              <span>{service === "installation" ? "4" : "3"}</span>
              <div>
                <h2>Your information</h2>
                <p>
                  All fields are required for your receipt and scheduling
                  confirmation.
                </p>
              </div>
            </div>
            <div className="purchase-builder-fields">
              <label>
                Name *
                <input
                  required
                  autoComplete="name"
                  value={customer.name}
                  onChange={(e) =>
                    setCustomer({ ...customer, name: e.target.value })
                  }
                />
              </label>
              <label>
                Phone *
                <input
                  required
                  autoComplete="tel"
                  type="tel"
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer({ ...customer, phone: e.target.value })
                  }
                />
              </label>
              <label>
                Email *
                <input
                  required
                  autoComplete="email"
                  type="email"
                  value={customer.email}
                  onChange={(e) =>
                    setCustomer({ ...customer, email: e.target.value })
                  }
                />
              </label>
              <label>
                Vehicle *
                <input
                  required
                  placeholder="Year, make and model"
                  value={customer.vehicle}
                  onChange={(e) =>
                    setCustomer({ ...customer, vehicle: e.target.value })
                  }
                />
              </label>
              <label className="full">
                Service address *
                <input
                  required
                  autoComplete="street-address"
                  value={customer.address}
                  onChange={(e) =>
                    setCustomer({ ...customer, address: e.target.value })
                  }
                />
              </label>
            </div>
          </div>
        </section>
        <aside className="purchase-breakdown">
          <h2>Order summary</h2>
          {breakdown && paymentMethodPricingEnabled() && <><div className="total"><span>Estimated credit total</span><strong>${breakdown.regularTotal.toFixed(2)}</strong></div><div><span>ACH / debit / prepaid</span><strong>${breakdown.total.toFixed(2)}</strong></div><p>Breakdown below shows ACH / debit / prepaid prices. Stripe verifies your payment type before you approve the final total.</p></>}
          {breakdown ? (
            <>
              <div>
                <span>Tires ({breakdown.quantity})</span>
                <strong>${breakdown.originalTires.toFixed(2)}</strong>
              </div>
              {discount ? (
                <div>
                  <span>Discount code ({discountLabel(discount)})</span>
                  <strong>−${breakdown.discountAmount.toFixed(2)}</strong>
                </div>
              ) : null}
              <div>
                <span>Mobile installation</span>
                <strong>${breakdown.installation.toFixed(2)}</strong>
              </div>
              <div>
                <span>Tire disposal</span>
                <strong>${breakdown.disposal.toFixed(2)}</strong>
              </div>
              <div>
                <span>NY state tire fee</span>
                <strong>${breakdown.stateFee.toFixed(2)}</strong>
              </div>
              <div>
                <span>
                  {discount?.tax_exempt
                    ? "Sales tax — exempt"
                    : "Estimated sales tax"}
                </span>
                <strong>${breakdown.estimatedTax.toFixed(2)}</strong>
              </div>
              <div className="total">
                <span>{paymentMethodPricingEnabled() ? "Estimated ACH / debit total" : "Estimated total"}</span>
                <strong>${breakdown.total.toFixed(2)}</strong>
              </div>
              <small>
                {discount?.tax_exempt
                  ? "Approved sales-tax exemption applies to tires and services."
                  : paymentMethodPricingEnabled()
                    ? "Final tax is calculated by Stripe using your service or delivery address."
                    : "Final tax is calculated by Stripe using your billing address."}
              </small>
            </>
          ) : null}
          {error ? <p className="purchase-builder-error">{error}</p> : null}
          <button
            disabled={
              loading ||
              !!shopCustomerError(customer) ||
              (service === "installation" &&
                (!appointment.date || !appointment.time))
            }
            onClick={checkout}
          >
            {loading ? "Preparing checkout…" : "Continue to secure payment"}
          </button>
          <em>Secure payment powered by Stripe</em>
        </aside>
      </div>
    </main>
  );
}
