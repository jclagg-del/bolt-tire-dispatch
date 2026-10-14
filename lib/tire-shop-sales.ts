export const tireShopSalesPath = "/tire-shop-sales";
export const isTireShopSale = (record: { purchase_source?: string | null }) => record.purchase_source === "website";
export const tireShopSalePath = (id: string) => `${tireShopSalesPath}/${encodeURIComponent(id)}`;
export const saleServiceLabel = (service?: string | null) => service === "tires_only" ? "Tires only" : service === "installation" ? "Mobile installation" : "Service not specified";

export type SalePayment = { payment_status?: string | null; amount_paid?: number | string | null; paid_at?: string | null };
// Approval, job creation and the checkout return URL are never evidence of payment.
// This is the payment record maintained by the verified payment flow.
export function salePaymentState(record: SalePayment) {
  switch (record.payment_status) {
    case "paid": return { label: "Paid", color: "#166534", background: "#dcfce7", message: "Online payment confirmed." };
    case "pending": return { label: "Payment pending", color: "#92400e", background: "#fef3c7", message: "Payment has not been confirmed. A started checkout or processing bank transfer is not a paid sale." };
    case "refunded": return { label: "Refunded", color: "#991b1b", background: "#fee2e2", message: "Payment is marked refunded. Review the payment record before fulfillment." };
    case "unpaid": case null: case undefined: return { label: "Not paid", color: "#991b1b", background: "#fee2e2", message: "No confirmed online payment recorded. Selecting tires or creating a job does not mean the customer paid." };
    default: return { label: "Payment needs review", color: "#92400e", background: "#fef3c7", message: "Payment status is not confirmed. Review before fulfillment." };
  }
}
