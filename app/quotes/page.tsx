"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";
import { QuoteStatus } from "@/lib/quotes";

type QuoteRow = {
  id: string;
  quote_number: number;
  status: QuoteStatus;
  customer: string;
  vehicle: string | null;
  tire_size: string | null;
  quantity: number;
  created_at: string;
  expires_at: string | null;
};

const statusColors: Record<QuoteStatus, { background: string; color: string }> = {
  draft: { background: "#e2e8f0", color: "#334155" },
  sent: { background: "#dbeafe", color: "#1d4ed8" },
  viewed: { background: "#ede9fe", color: "#6d28d9" },
  approved: { background: "#dcfce7", color: "#166534" },
  declined: { background: "#fee2e2", color: "#991b1b" },
  expired: { background: "#fef3c7", color: "#92400e" },
  converted: { background: "#ccfbf1", color: "#115e59" },
};

export default function QuotesPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | QuoteStatus>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data, error: loadError } = await supabase
        .from("quotes")
        .select("id,quote_number,status,customer,vehicle,tire_size,quantity,created_at,expires_at")
        .order("created_at", { ascending: false });
      setLoading(false);
      if (loadError) {
        setError(loadError.message);
        return;
      }
      setQuotes((data as QuoteRow[]) || []);
    };
    load();
  }, []);

  const visibleQuotes = filter === "all"
    ? quotes.filter((quote) => quote.status !== "converted")
    : quotes.filter((quote) => quote.status === filter);

  return (
    <div className="quote-shell">
      <AppHeader />
      <main className="quote-page">
        <div className="quote-page-header">
          <div>
            <div className="quote-eyebrow">Sales</div>
            <h1>Quotes</h1>
            <p>Create tire comparisons and turn approved quotes into scheduled jobs.</p>
          </div>
          <button className="quote-primary" onClick={() => router.push("/quotes/new")}>+ New Quote</button>
        </div>

        <div className="quote-filter-row">
          {(["all", "draft", "sent", "approved", "converted"] as const).map((status) => (
            <button key={status} onClick={() => setFilter(status)} className={filter === status ? "quote-filter active" : "quote-filter"}>
              {status[0].toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {error ? <div className="quote-error">Run the new quotes migration in Supabase, then reload. {error}</div> : null}
        {loading ? <div className="quote-empty">Loading quotes...</div> : null}
        {!loading && !error && visibleQuotes.length === 0 ? (
          <div className="quote-empty"><h2>No quotes yet</h2><p>Create your first tire comparison.</p></div>
        ) : null}

        <div className="quote-list">
          {visibleQuotes.map((quote) => (
            <button className="quote-list-card" key={quote.id} onClick={() => router.push(`/quotes/${quote.id}`)}>
              <div>
                <div className="quote-number">Quote #{quote.quote_number}</div>
                <h2>{quote.customer}</h2>
                <p>{[quote.vehicle, quote.tire_size, `${quote.quantity} tires`].filter(Boolean).join(" • ")}</p>
              </div>
              <div className="quote-list-meta">
                <span className="quote-status" style={statusColors[quote.status]}>{quote.status}</span>
                <span>{new Date(quote.created_at).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
