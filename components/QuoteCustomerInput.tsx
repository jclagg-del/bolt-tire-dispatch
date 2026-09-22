"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { customerSearchPattern, mergeQuoteCustomers, QuoteCustomer } from "@/lib/quote-customer";

export default function QuoteCustomerInput({ value, onChange, onSelect }: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (customer: QuoteCustomer) => void;
}) {
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<QuoteCustomer[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || search.trim().length < 2) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const localLookup = async (table: "jobs" | "quotes") => {
        const result = await supabase.from(table)
          .select("customer,contact_name,phone,email,address,created_at")
          .ilike("customer", customerSearchPattern(search))
          .order("created_at", { ascending: false, nullsFirst: false }).limit(100);
        if (result.error) throw result.error;
        return result.data || [];
      };
      const quickBooksLookup = async () => {
        const { data } = await supabase.auth.getSession();
        const response = await fetch(`/api/quickbooks/customers?q=${encodeURIComponent(search.trim())}`, {
          headers: { Authorization: `Bearer ${data.session?.access_token || ""}` }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (!response.ok) throw new Error("QuickBooks unavailable");
        const result = await response.json();
        return (result.customers || []).map((customer: { displayName: string; phone: string; email: string; address: string }) => ({
          customer: customer.displayName, phone: customer.phone, email: customer.email, address: customer.address,
        }));
      };
      const [jobs, quotes, quickBooks] = await Promise.allSettled([localLookup("jobs"), localLookup("quotes"), quickBooksLookup()]);
      if (!active) return;
      const local = [...(jobs.status === "fulfilled" ? jobs.value : []), ...(quotes.status === "fulfilled" ? quotes.value : [])]
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setMatches(mergeQuoteCustomers([...local, ...(quickBooks.status === "fulfilled" ? quickBooks.value : [])]));
      setMessage(jobs.status === "rejected" || quotes.status === "rejected"
        ? "Some saved customers could not be loaded. You can still enter details manually."
        : quickBooks.status === "rejected" ? "QuickBooks unavailable; showing saved job and quote customers." : "");
      setLoading(false);
    }, 300);
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [search, open]);

  return <div className="quote-customer-lookup" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <label className="quote-field"><span>Customer</span><input value={value} autoComplete="off"
      placeholder="Type a name to find a previous customer"
      aria-describedby="quote-customer-help"
      onFocus={() => { setSearch(value); setOpen(true); setLoading(value.trim().length >= 2); }}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
      onChange={(event) => {
        const name = event.target.value;
        onChange(name); setSearch(name); setMatches([]); setMessage(""); setOpen(true); setLoading(name.trim().length >= 2);
      }} /></label>
    <small id="quote-customer-help">Choose a saved customer to fill contact details, or enter a new customer.</small>
    {open && search.trim().length >= 2 ? <div className="quote-customer-results" aria-label="Matching customers">
      {loading ? <p role="status">Looking up customers…</p> : <>
        {matches.map((customer) => <button type="button" key={customer.customer.toLowerCase()} onMouseDown={(event) => event.preventDefault()} onClick={() => {
          onSelect(customer); setOpen(false); setMatches([]); setMessage("");
        }}><strong>{customer.customer}</strong><span>{[customer.contact_name, customer.phone, customer.email].filter(Boolean).join(" · ") || "Use saved customer"}</span></button>)}
        {!matches.length ? <p>No matching customers. You can enter their information below.</p> : null}
        {message ? <p role="status">{message}</p> : null}
      </>}
    </div> : null}
  </div>;
}
