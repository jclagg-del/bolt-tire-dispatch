import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import QuarterlyTaxReport from "@/components/QuarterlyTaxReport";

export default function SalesTaxPage() {
  return <>
    <AppHeader />
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: "0 0 8px" }}>Sales Tax</h1>
          <p style={{ margin: 0, color: "#64748b" }}>Review New York sales tax collected by quarter and download your records.</p>
        </div>
        <Link href="/billing" style={{ color: "#285cff", fontWeight: 700 }}>Back to Billing</Link>
      </div>
      <QuarterlyTaxReport />
    </main>
  </>;
}
