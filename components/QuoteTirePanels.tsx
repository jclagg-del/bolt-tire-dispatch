import { quoteOptionSize } from "@/lib/quote-tire-size";
type TireOption = {
  tire_size?: string | null;
  brand?: string | null; model?: string | null; image_url?: string | null;
  price_per_tire: number | string;
  rear_brand?: string | null; rear_model?: string | null; rear_image_url?: string | null;
  rear_price_per_tire?: number | string | null;
};
type Fitment = { tire_size?: string | null; quantity: number; rear_tire_size?: string | null; rear_quantity?: number | null };

export const hasSplitFitment = (q: Fitment, o: TireOption) =>
  Boolean(q.rear_tire_size || Number(q.rear_quantity) > 0 || o.rear_model || o.rear_image_url);

export default function QuoteTirePanels({ q, option, creditPricing = false }: {
  q: Fitment; option: TireOption; creditPricing?: boolean;
}) {
  const split = hasSplitFitment(q, option);
  return (
    <div className={`quote-public-tires ${split ? "split" : ""}`}>
      <div className="quote-public-tire">
        {split ? <div className="quote-public-position">Front / Steer</div> : null}
        {option.image_url ? (
          <img
            className="quote-tire-image"
            src={option.image_url}
            alt={`${option.brand} ${option.model}`}
          />
        ) : (
          <div className="quote-image-placeholder">Tire image</div>
        )}
        <h2>{option.brand}</h2>
        <h3>{option.model}</h3>
        <p className="quote-public-fitment">
          {quoteOptionSize(q, option) || "Size TBD"} · Qty {q.quantity}
        </p>
        <div className="quote-price-each">
          ${Number(option.price_per_tire).toFixed(2)} <span>{creditPricing ? "per tire · Credit" : "per tire"}</span>
        </div>
      </div>
      {split ? (
        <div className="quote-public-tire rear">
          <div className="quote-public-position">Rear / Drive</div>
          {option.rear_image_url ? (
            <img
              className="quote-tire-image"
              src={option.rear_image_url}
              alt={`${option.rear_brand || option.brand} ${option.rear_model || "Rear tire"}`}
            />
          ) : (
            <div className="quote-image-placeholder">Rear tire image</div>
          )}
          <h2>{option.rear_brand || option.brand || "Rear tire"}</h2>
          <h3>{option.rear_model || "Model not specified"}</h3>
          <p className="quote-public-fitment">
            {q.rear_tire_size || "Size TBD"} · Qty {q.rear_quantity || 0}
          </p>
          <div className="quote-price-each">
            ${Number(option.rear_price_per_tire || 0).toFixed(2)} <span>{creditPricing ? "per tire · Credit" : "per tire"}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
