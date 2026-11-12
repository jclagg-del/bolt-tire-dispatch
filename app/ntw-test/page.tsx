"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Result = { environment: string; size: string; elapsedMs: number; count: number; products: { partNumber: string; brand: string; model: string; loadSpeed: string; cost: number | null; currency: string; quantity: number | null; warehouses: { location: string; quantity: number | null }[] }[] };
export default function NtwTestPage() {
  const [size, setSize] = useState("205/75R15"), [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState<Result | null>(null);
  async function test(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setError("Sign in to Bolt Tire first, then return to this page."); return; }
      const response = await fetch("/api/ntw-test", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ size }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Test failed.");
      setResult(payload);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The test could not be completed."); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 850, margin: "24px auto", padding: 20 }}>
    <a href="/">← Dashboard</a>
    <section style={{ background: "white", border: "1px solid #dbe3ef", borderRadius: 18, padding: 24, marginTop: 18 }}>
      <p style={{ color: "#245bca", fontWeight: 800 }}>TEMPORARY · EMPLOYEE ACCESS ONLY</p>
      <h1>NTW connection test</h1>
      <p>Test the NTW QA inventory feed from your regular Bolt Tire login.</p>
      <p style={{ background: "#eff6ff", padding: 14, borderRadius: 10 }}>Inventory lookup only. This cannot purchase tires, charge a customer, change jobs or add QA tires to the live shop. QA stock and prices are not live purchasing information.</p>
      <form onSubmit={test} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 24 }}>
        <label style={{ flex: "1 1 230px" }}>Tire size<input value={size} onChange={event => setSize(event.target.value)} required maxLength={30} placeholder="205/75R15" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #bcc8d8", borderRadius: 8, marginTop: 6 }} /></label>
        <button disabled={busy} style={{ padding: "13px 20px", borderRadius: 8, border: 0, color: "white", background: busy ? "#64748b" : "#245bca" }}>{busy ? "Testing NTW…" : "Test inventory connection"}</button>
      </form>
      <p style={{ color: "#64748b" }}>Metric sizes such as 205/75R15 or LT245/75R16. No part number needed.</p>
      {error && <div role="alert" style={{ background: "#fff1f2", padding: 16, borderRadius: 8 }}><p>{error}</p>{error.startsWith("Sign in") && <a href="/login">Sign in to Bolt Tire</a>}</div>}
      {result && <section aria-live="polite">
        <h2 style={{ color: "#166534" }}>NTW responded successfully</h2>
        <p>{result.environment} · {result.size} · {result.count} results · {(result.elapsedMs / 1000).toFixed(1)} seconds</p>
        {!result.count && <p>No tires were returned for this size. The connection responded, but stock availability is not confirmed.</p>}
        {result.count > 25 && <p>Showing the first 25 results.</p>}
        {result.products.map((tire, index) => <article key={`${tire.partNumber}-${index}`} style={{ borderTop: "1px solid #dbe3ef", padding: "16px 0" }}>
          <h3>{tire.brand} {tire.model}</h3><p>Part # {tire.partNumber || "Not supplied"} · Load / speed: {tire.loadSpeed || "Not supplied"}</p>
          <p>Reported cost: {tire.cost === null ? "Not supplied" : `${tire.cost.toFixed(2)} ${tire.currency}`} · Available: {tire.quantity ?? "Not supplied"}</p>
          {tire.warehouses.map((warehouse, i) => <p key={i}>{warehouse.location}: {warehouse.quantity ?? "Not supplied"} tires</p>)}
        </article>)}
      </section>}
    </section>
  </main>;
}
