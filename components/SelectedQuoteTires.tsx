"use client";

type SelectedTire = {
  id: string;
  brand: string;
  model: string;
  size: string;
  loadSpeed: string;
  loadRange: string;
  supplier?: string;
  atdProductNumber: string;
  quotePrice: number;
  fitmentPosition?: "front" | "rear" | "both";
};

export default function SelectedQuoteTires({ tires, onRemove }: {
  tires: SelectedTire[];
  onRemove: (id: string) => void;
}) {
  if (!tires.length) return null;
  return <section className="tire-beta-quote-selected" aria-label="Selected for quote">
    <strong>Selected for quote</strong>
    <small>Uncheck a tire to remove it from this quote.</small>
    <ul>
      {tires.map((tire) => <li key={tire.id}>
        <label>
          <input type="checkbox" checked onChange={() => onRemove(tire.id)}
            aria-label={`Include ${tire.brand} ${tire.model}, ${tire.size}, ${tire.supplier || "supplier"} ${tire.atdProductNumber} in quote`} />
          <span className="tire-beta-quote-selected-info">
            <strong>{tire.brand} {tire.model}</strong>
            <span>{[tire.size, tire.loadSpeed, tire.loadRange ? `Load ${tire.loadRange}` : "", tire.fitmentPosition === "front" ? "Front" : tire.fitmentPosition === "rear" ? "Rear" : ""].filter(Boolean).join(" · ")}</span>
            <span>{tire.supplier === "USAF" ? "U.S. AutoForce" : tire.supplier || "Supplier"}{tire.atdProductNumber ? ` · #${tire.atdProductNumber}` : ""}</span>
          </span>
          <strong className="tire-beta-quote-selected-price">{tire.quotePrice.toLocaleString("en-US", { style: "currency", currency: "USD" })} each</strong>
        </label>
      </li>)}
    </ul>
  </section>;
}
