import { AdditionalItem, additionalItemAmount } from "@/lib/additional-items";

export default function AdditionalItemsSummary({ items = [] }: { items?: AdditionalItem[] }) {
  if (!items.length) return null;
  return <section className="additional-items-summary" aria-label="Additional items and services"><h3>Additional items &amp; services</h3>{items.map((item, index) => <div key={index} style={{ display: "flex", gap: 16, justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #e2e8f0" }}><span>{item.description}<small style={{ display: "block", color: "#64748b" }}>{item.quantity} × ${Number(item.unit_price).toFixed(2)}{!item.taxable ? " · Non-taxable" : ""}</small></span><strong>${additionalItemAmount(item).toFixed(2)}</strong></div>)}</section>;
}
