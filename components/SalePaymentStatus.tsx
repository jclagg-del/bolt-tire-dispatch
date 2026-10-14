import { salePaymentState, type SalePayment } from "@/lib/tire-shop-sales";

export default function SalePaymentStatus({ record, compact = false }: { record: SalePayment; compact?: boolean }) {
  const state = salePaymentState(record);
  const amount = record.amount_paid == null ? null : Number(record.amount_paid);
  const paidAmount = record.payment_status === "paid" && amount != null && Number.isFinite(amount) && amount >= 0 ? amount.toLocaleString("en-US", { style: "currency", currency: "USD" }) : null;
  const date = record.paid_at ? new Date(record.paid_at) : null;
  return <div role="status" style={{ padding: compact ? "8px 12px" : 18, borderRadius: 12, background: state.background, color: state.color, marginBottom: compact ? 0 : 16 }}>
    <strong>{state.label}{paidAmount ? ` · ${paidAmount}` : ""}</strong>
    {!compact && <><p style={{ margin: "8px 0 0" }}>{state.message}</p>{record.payment_status === "paid" && date && Number.isFinite(date.getTime()) && <p style={{ margin: "8px 0 0" }}>Paid {date.toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>}</>}
  </div>;
}
