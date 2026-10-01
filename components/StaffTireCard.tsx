"use client";

import { hasSupplierCost, installedTotal } from "@/lib/tire-shop-pricing";
import { hasTireStock } from "@/lib/tire-stock-filter";
import styles from "./StaffTireCard.module.css";

type Tire = {
  id: string; supplier?: string; brand: string; model: string; size: string; description: string;
  loadSpeed: string; loadRange: string; warranty: string; category: string; snowRated: boolean;
  cost?: number; map?: number; suggestedPrice?: number | null; quotePrice: number;
  installedPrice: number; estimatedTotals: Record<string, number>; imageUrl: string | null;
  atdProductNumber: string; manufacturerProductNumber: string; qaOnly?: boolean;
  fitmentPosition: string; availability: { local: number; localPlus: number; nationwide: number };
  runFlat: boolean; discontinued: boolean; treadDepth: string; utqg: string; sidewall: string;
  oeMarking: string; features?: string; benefits?: string;
  rebates?: Array<{ code: string; description: string; url: string }>;
};
type Warehouse = { name: string; quantity: number; estimatedDelivery: string; shipMethod: string; local?: boolean };
const name = (tire: Tire) => tire.supplier === "USAF" ? "U.S. AutoForce" : tire.supplier || "ATD";
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function StaffTireCard<T extends Tire>({ tire, offers, price, quantity, staggered, selected, quoteFull,
  imageFailed, onImageFailed, onImage, onSupplier, onPrice, onQuantity, onQuote, onOrder, onDetails,
  onWarehouses, warehouses, warehouseLoading, warehouseError,
}: {
  tire: T; offers: T[]; price: string; quantity: number; staggered: boolean; selected: boolean; quoteFull: boolean;
  imageFailed: boolean; onImageFailed: () => void; onImage: () => void; onSupplier: (offer: T) => void;
  onPrice: (value: string) => void; onQuantity: (value: number) => void; onQuote: () => void;
  onOrder: () => void; onDetails: () => void; onWarehouses: () => void;
  warehouses: Warehouse[]; warehouseLoading: boolean; warehouseError: string;
}) {
  const valid = price.trim() !== "" && Number.isFinite(Number(price)) && Number(price) >= 0;
  const priced = offers.filter(hasSupplierCost);
  const map = typeof tire.map === "number" && Number.isFinite(tire.map) && tire.map > 0 ? tire.map : null;
  const canOrder = hasSupplierCost(tire) && hasTireStock(tire) && ["ATD", "USAF"].includes(tire.supplier || "ATD");
  return <article className={`${styles.card} ${selected ? styles.selected : ""}`}>
    <div className={styles.info}>
      <div className={styles.identity}>
        {tire.imageUrl && !imageFailed ? <button className={styles.photo} type="button" onClick={onImage} aria-label={`Enlarge ${tire.brand} ${tire.model} photo`}>
          <img src={`/api/tire-image?url=${encodeURIComponent(tire.imageUrl)}`} alt={`${tire.brand} ${tire.model}`} loading="lazy" onError={event => {
            if (event.currentTarget.dataset.directFallback !== "1") { event.currentTarget.dataset.directFallback = "1"; event.currentTarget.src = tire.imageUrl!; }
            else onImageFailed();
          }} /><span>Enlarge</span>
        </button> : <div className={styles.photo}><span>No image available</span></div>}
        <div><div className={styles.brand}>{tire.brand}</div><h2>{tire.model}</h2><strong>{tire.size || tire.description}{tire.loadSpeed ? ` · ${tire.loadSpeed}` : ""}</strong>
          <div className={styles.tags}>{tire.fitmentPosition !== "both" && <span>{tire.fitmentPosition} fitment</span>}{tire.category && tire.category !== "Undefined" && <span>{tire.category}</span>}{tire.warranty && <span>{tire.warranty} warranty</span>}{tire.loadRange && <span>Load {tire.loadRange}</span>}{tire.snowRated && <span>3PMSF</span>}{tire.runFlat && <span>Run-flat</span>}{tire.discontinued && <span>Discontinued</span>}</div>
        </div>
      </div>
      <div className={styles.supplierHeading}>Suppliers · cost per tire</div>
      {!hasTireStock(tire) && <p className={styles.relation}>Out of stock — availability not confirmed</p>}
      <div className={styles.suppliers} role="group" aria-label="Choose tire supplier">
        {priced.map(offer => <button type="button" className={styles.supplier} key={offer.id} aria-pressed={offer.id === tire.id} onClick={() => onSupplier(offer)}>
          <span className={styles.supplierTop}><strong>{name(offer)}{offer.qaOnly ? " · QA" : ""}</strong><strong>{money(offer.cost!)}</strong></span>
          <span className={styles.stock}>{offer.supplier === "USAF" ? "Croton" : offer.supplier === "NTW" ? "Albany" : "Totowa"} · <b>{offer.availability.local} local</b> · <b>{offer.availability.localPlus} {offer.supplier === "USAF" ? "transfer" : "nearby"}</b> · {offer.availability.nationwide} nationwide</span>
          <span className={styles.stock}>Part #{offer.atdProductNumber}{!hasTireStock(offer) ? " · Out of stock" : ""}</span>
          <span className={styles.selection}>{offer.id === tire.id ? "✓ Selected supplier" : "Select supplier"}</span>
        </button>)}
        {!priced.length && <p>No supplier pricing available for this tire.</p>}
      </div>
      <details key={`warehouses-${tire.id}`} onToggle={event => { if (event.currentTarget.open) onWarehouses(); }}><summary>Warehouse availability &amp; delivery</summary>
        {warehouseLoading ? <p>Checking warehouses…</p> : warehouseError ? <p>{warehouseError}</p> : warehouses.length ? warehouses.map((warehouse, i) => <p key={i}><strong>{warehouse.name}</strong> · {warehouse.quantity} tires{warehouse.estimatedDelivery ? ` · Expected ${warehouse.estimatedDelivery}` : ""}{warehouse.shipMethod ? ` · ${warehouse.shipMethod}` : ""}</p>) : <p>No warehouse breakdown provided. Confirm availability when ordering.</p>}
      </details>
      <details onToggle={event => { if (event.currentTarget.open) onDetails(); }}><summary>Tire details</summary><div className={styles.specs}>
        {[["Manufacturer part", tire.manufacturerProductNumber], ["Tread depth", tire.treadDepth], ["UTQG", tire.utqg], ["Sidewall", tire.sidewall], ["OE marking", tire.oeMarking]].filter(([, value]) => value).map(([label, value]) => <span key={label}>{label}: <strong>{value}</strong></span>)}
        {tire.features && <p>{tire.features}</p>}{tire.benefits && <p>{tire.benefits}</p>}
      </div></details>
      {tire.rebates?.map((rebate, i) => <div className={styles.rebate} key={`${rebate.code}-${i}`}>{rebate.description}{rebate.url && <a href={rebate.url} target="_blank" rel="noreferrer">Rebate details</a>}</div>)}
    </div>
    <div className={styles.pricing}>
      <div className={styles.pair}>
        <label>Our price / tire ($)<input aria-label={`Our price for ${tire.brand} ${tire.model}`} type="number" min="0" step="0.01" value={price} onChange={event => onPrice(event.target.value)} /></label>
        <div><span className={styles.label}>Supplier MAP / tire</span><strong className={styles.map}>{map !== null ? money(map) : "Not provided"}</strong>{map !== null && <button className={styles.useMap} type="button" onClick={() => onPrice(map.toFixed(2))}>Use MAP price</button>}</div>
      </div>
      <p className={styles.relation} aria-live="polite">{!valid ? "Enter a valid selling price" : map === null ? "Supplier MAP not provided" : tire.quotePrice === map ? "Our price matches MAP" : tire.quotePrice < map ? "Our price is below MAP" : "Our price is above MAP"}</p>
      <div className={styles.metrics}><div><span className={styles.label}>Selected cost / tire</span><strong>{hasSupplierCost(tire) ? money(tire.cost!) : "Unavailable"}</strong>{hasSupplierCost(tire) && <small>{name(tire)}</small>}</div><div><span className={styles.label}>Gross profit / tire</span><strong>{valid && hasSupplierCost(tire) ? money(tire.quotePrice - tire.cost!) : "—"}</strong></div></div>
      <details><summary>Suggested price &amp; calculation</summary><p>Markup suggestion: {tire.suggestedPrice != null ? money(tire.suggestedPrice) : "Unavailable"} / tire.</p><p>MAP is supplier-reported. Your entered selling price is used for this quote, not saved as a global price.</p></details>
      {!staggered ? <div className={styles.quantityTotal}><label>Quantity<select value={quantity} onChange={event => onQuantity(Number(event.target.value))}>{[1,2,3,4,5,6].map(qty => <option key={qty} value={qty}>{qty}</option>)}</select></label><div><span className={styles.label}>Tires subtotal</span><strong>{valid ? money(tire.quotePrice * quantity) : "—"}</strong></div></div> : <p>Split fitment · 2 tires per axle on quote</p>}
      {!staggered && <div className={styles.installed}><span>Estimated installed total</span><strong>{valid ? money(installedTotal(tire, quantity)) : "—"}</strong><small>Includes installation &amp; standard fees; tax additional</small></div>}
      <div className={styles.actions}><button type="button" disabled={(!valid || quoteFull) && !selected} aria-pressed={selected} onClick={onQuote}>{selected ? "Added · Remove" : quoteFull ? "3 selected" : "+ Add to quote"}</button><button type="button" disabled={!canOrder} onClick={onOrder}>{!hasTireStock(tire) ? "Out of stock" : "Order tires"}</button></div>
    </div>
  </article>;
}
