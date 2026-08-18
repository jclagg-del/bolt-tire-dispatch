"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string; brand: string; model: string; description: string; size: string; category: string; loadSpeed: string;
  warranty: string; cost?: number; installedPrice: number; imageUrl: string | null; snowRated: boolean;
  loadRange: string; discontinued: boolean; atdProductNumber: string;
  availability: { local: number; localPlus: number; nationwide: number };
};

export default function TireShoppingBeta({ internal = false }: { internal?: boolean }) {
  const [query, setQuery] = useState("2756518");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [snowOnly, setSnowOnly] = useState(false);
  const [sort, setSort] = useState(internal ? "margin" : "price");

  async function search() {
    setLoading(true); setError(""); setSearched(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (internal) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      const response = await fetch("/api/atd", { method: "POST", headers, body: JSON.stringify({ action: "size", query, internal }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ATD search failed");
      setProducts(payload.products || []);
    } catch (reason) {
      setProducts([]); setError(reason instanceof Error ? reason.message : "ATD search failed");
    } finally { setLoading(false); }
  }

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((item) => item.category).filter(Boolean)))], [products]);
  const results = useMemo(() => products.filter((tire) =>
    (category === "All" || tire.category === category) &&
    (!availableOnly || tire.availability.local + tire.availability.localPlus > 0) &&
    (!snowOnly || tire.snowRated)
  ).sort((a, b) => {
    if (sort === "availability") return (b.availability.local + b.availability.localPlus) - (a.availability.local + a.availability.localPlus);
    if (sort === "margin") return (b.installedPrice - (b.cost || 0)) - (a.installedPrice - (a.cost || 0));
    return a.installedPrice - b.installedPrice;
  }), [availableOnly, category, products, snowOnly, sort]);

  return <main className="tire-beta-page">
    <header className="tire-beta-hero"><div><span className="tire-beta-kicker">{internal ? "Bolt Tire staff beta" : "Bolt Tire shopping beta"}</span><h1>{internal ? "Tire Search & Quoting" : "Find the right tires"}</h1><p>Live ATD sandbox products, pricing, images, and inventory.</p></div><span className="tire-beta-badge">ATD sandbox</span></header>
    <section className="tire-beta-search-card">
      <div className="tire-beta-tabs"><button className="active" type="button">Tire size</button><button type="button" disabled>Vehicle fitment · connecting next</button>{internal && <button type="button" disabled>VIN / plate · coming next</button>}</div>
      <label className="tire-beta-search"><span>Enter tire size using digits only</span><div><input value={query} inputMode="numeric" pattern="[0-9]*" onChange={(event) => setQuery(event.target.value.replace(/[^0-9]/g, ""))} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder="2756518" /><button type="button" onClick={search} disabled={loading || !query.trim()}>{loading ? "Searching ATD…" : "Search ATD"}</button></div><small>Example: enter 2756518 for 275/65R18.</small></label>
    </section>
    {error && <div className="tire-beta-error"><strong>ATD sandbox error</strong><span>{error}</span></div>}
    <div className="tire-beta-layout">
      <aside className="tire-beta-filters"><div className="tire-beta-filter-head"><strong>Filters</strong><button type="button" onClick={() => { setCategory("All"); setAvailableOnly(true); setSnowOnly(false); }}>Reset</button></div><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="tire-beta-check"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /> Available nearby</label><label className="tire-beta-check"><input type="checkbox" checked={snowOnly} onChange={(event) => setSnowOnly(event.target.checked)} /> Severe-snow rated</label><div className="tire-beta-coming"><strong>Next filters</strong><span>Brand · price · warranty · load range · speed rating · run-flat · rebates</span></div></aside>
      <section className="tire-beta-results"><div className="tire-beta-result-head"><div><strong>{results.length} tires</strong><span>{searched ? " from ATD sandbox" : " — enter a size above"}</span></div><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="price">Lowest installed price</option><option value="availability">Best availability</option>{internal && <option value="margin">Best gross profit</option>}</select></div>
        {!searched || loading || results.length === 0 ? <div className="tire-beta-empty"><strong>{loading ? "Searching ATD…" : searched ? "No available products matched." : "Search ATD by raw tire size."}</strong><span>{searched && !loading ? "Try turning off Available nearby or changing the size." : "Live sandbox results will appear here."}</span></div> : results.map((tire) => <article className="tire-beta-product" key={tire.id}>
          <div className="tire-beta-image">{tire.imageUrl ? <img src={tire.imageUrl} alt={`${tire.brand} ${tire.model}`} /> : <>TIRE<br /><small>No ATD image</small></>}</div>
          <div className="tire-beta-product-main"><span className="tire-beta-brand">{tire.brand}</span><h2>{tire.model}</h2><strong>{tire.size || tire.description}{tire.loadSpeed ? ` · ${tire.loadSpeed}` : ""}</strong><div className="tire-beta-tags"><span>{tire.category}</span>{tire.warranty && <span>{tire.warranty} warranty</span>}{tire.loadRange && <span>Load {tire.loadRange}</span>}{tire.snowRated && <span>3PMSF</span>}{tire.discontinued && <span>Discontinued</span>}</div><p>{tire.availability.local ? "Available locally" : tire.availability.localPlus ? "Available from Local Plus" : "Special order"}</p>{internal && <div className="tire-beta-stock"><span>Local <strong>{tire.availability.local}</strong></span><span>Local Plus <strong>{tire.availability.localPlus}</strong></span><span>Nationwide <strong>{tire.availability.nationwide}</strong></span></div>}</div>
          <div className="tire-beta-price">{internal && <><span>ATD cost <strong>${(tire.cost || 0).toFixed(2)}</strong></span><span>Gross profit <strong>${(tire.installedPrice - (tire.cost || 0)).toFixed(2)}</strong></span><small>{tire.atdProductNumber}</small></>}<strong className="tire-beta-installed">${tire.installedPrice.toFixed(2)}</strong><span>estimated installed per tire</span><button type="button">{internal ? "Add to quote" : "Choose tire"}</button></div>
        </article>)}
      </section>
    </div>
  </main>;
}
