"use client";

import { useMemo, useState } from "react";
import { betaTires, matchesTireSize } from "@/lib/tire-shopping";

const categories = ["All", "All-Season", "All-Terrain", "Highway"];

export default function TireShoppingBeta({ internal = false }: { internal?: boolean }) {
  const [query, setQuery] = useState("275/65R18");
  const [category, setCategory] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [snowOnly, setSnowOnly] = useState(false);
  const [sort, setSort] = useState(internal ? "margin" : "price");

  const results = useMemo(() => {
    const filtered = betaTires.filter((tire) =>
      matchesTireSize(tire.size, query) &&
      (category === "All" || tire.category === category) &&
      (!availableOnly || tire.availability.local + tire.availability.localPlus > 0) &&
      (!snowOnly || tire.snowRated)
    );
    return filtered.sort((a, b) => {
      if (sort === "availability") return (b.availability.local + b.availability.localPlus) - (a.availability.local + a.availability.localPlus);
      if (sort === "margin") return (b.installedPrice - b.cost) - (a.installedPrice - a.cost);
      return a.installedPrice - b.installedPrice;
    });
  }, [availableOnly, category, query, snowOnly, sort]);

  return (
    <main className="tire-beta-page">
      <header className="tire-beta-hero">
        <div>
          <span className="tire-beta-kicker">{internal ? "Bolt Tire staff beta" : "Bolt Tire shopping beta"}</span>
          <h1>{internal ? "Tire Search & Quoting" : "Find the right tires"}</h1>
          <p>{internal ? "Search raw sizes now. ATD vehicle fitment and live inventory will connect here next." : "Search by tire size while we prepare the new vehicle-fitment experience."}</p>
        </div>
        <span className="tire-beta-badge">Private preview</span>
      </header>

      <section className="tire-beta-search-card">
        <div className="tire-beta-tabs">
          <button className="active" type="button">Tire size</button>
          <button type="button" disabled>Vehicle fitment · coming next</button>
          {internal && <button type="button" disabled>VIN / plate · coming next</button>}
        </div>
        <label className="tire-beta-search">
          <span>Enter any tire size</span>
          <div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="275/65R18, 275 65 18, or 2756518" />
            <button type="button">Search tires</button>
          </div>
          <small>Flexible search accepts slashes, spaces, dashes, or numbers only.</small>
        </label>
      </section>

      <div className="tire-beta-layout">
        <aside className="tire-beta-filters">
          <div className="tire-beta-filter-head"><strong>Filters</strong><button type="button" onClick={() => { setCategory("All"); setAvailableOnly(true); setSnowOnly(false); }}>Reset</button></div>
          <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="tire-beta-check"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /> Available nearby</label>
          <label className="tire-beta-check"><input type="checkbox" checked={snowOnly} onChange={(event) => setSnowOnly(event.target.checked)} /> Severe-snow rated</label>
          <div className="tire-beta-coming"><strong>Next filters</strong><span>Brand · price · warranty · load range · speed rating · run-flat · rebates</span></div>
        </aside>

        <section className="tire-beta-results">
          <div className="tire-beta-result-head"><div><strong>{results.length} tires</strong><span> matching {query || "all sizes"}</span></div><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="price">Lowest installed price</option><option value="availability">Best availability</option>{internal && <option value="margin">Best gross profit</option>}</select></div>
          {results.length === 0 ? <div className="tire-beta-empty"><strong>No beta products match yet.</strong><span>Try 275/65R18, LT245/75R17, or 245/75R17.</span></div> : results.map((tire) => {
            const profit = tire.installedPrice - tire.cost;
            return <article className="tire-beta-product" key={tire.id}>
              <div className="tire-beta-image">TIRE<br /><small>ATD image</small></div>
              <div className="tire-beta-product-main">
                <span className="tire-beta-brand">{tire.brand}</span>
                <h2>{tire.model}</h2>
                <strong>{tire.size} · {tire.loadSpeed}</strong>
                <div className="tire-beta-tags"><span>{tire.category}</span><span>{tire.warranty.toLocaleString()}-mile warranty</span>{tire.snowRated && <span>3PMSF</span>}</div>
                <p>{tire.delivery}</p>
                {internal && <div className="tire-beta-stock"><span>Local <strong>{tire.availability.local}</strong></span><span>Local Plus <strong>{tire.availability.localPlus}</strong></span><span>Nationwide <strong>{tire.availability.nationwide}</strong></span></div>}
              </div>
              <div className="tire-beta-price">
                {internal && <><span>ATD cost <strong>${tire.cost.toFixed(2)}</strong></span><span>Gross profit <strong>${profit.toFixed(2)}</strong></span><small>{tire.atdProductNumber}</small></>}
                <strong className="tire-beta-installed">${tire.installedPrice.toFixed(2)}</strong><span>installed per tire</span>
                <button type="button">{internal ? "Add to quote" : "Choose tire"}</button>
              </div>
            </article>;
          })}
        </section>
      </div>
    </main>
  );
}

