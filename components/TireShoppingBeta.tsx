"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string; brand: string; model: string; description: string; size: string; category: string; loadSpeed: string;
  warranty: string; cost?: number; quotePrice: number; installedPrice: number; estimatedTotals:Record<string,number>; imageUrl: string | null; snowRated: boolean;
  loadRange: string; discontinued: boolean; runFlat:boolean; hasRebate:boolean; atdProductNumber: string;
  availability: { local: number; localPlus: number; nationwide: number };
};
type FitmentOption={trim:string;trimoption:string;vehicleid:string;staggeredfitment:string;position:Array<{front?:{trimspecs?:{Size?:string}};rear?:{trimspecs?:{Size?:string}};both?:{trimspecs?:{Size?:string}}}>};

export default function TireShoppingBeta({ internal = false }: { internal?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("2756518");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [snowOnly, setSnowOnly] = useState(false);
  const [sort, setSort] = useState(internal ? "margin" : "price");
  const [quantity,setQuantity]=useState(4);
  const [selected, setSelected] = useState<Product[]>([]);
  const [mode,setMode]=useState<"size"|"vehicle">("size");
  const [vehicle,setVehicle]=useState({year:"",make:"",model:"",trim:"",trimoption:"",vehicleid:""});
  const [years,setYears]=useState<string[]>([]),[makes,setMakes]=useState<string[]>([]),[models,setModels]=useState<string[]>([]),[trims,setTrims]=useState<string[]>([]),[fitmentOptions,setFitmentOptions]=useState<FitmentOption[]>([]);
  const [fitmentLoading,setFitmentLoading]=useState("");
  const [brand,setBrand]=useState("All"),[minPrice,setMinPrice]=useState(""),[maxPrice,setMaxPrice]=useState(""),[minWarranty,setMinWarranty]=useState("0"),[loadRange,setLoadRange]=useState("All"),[speedRating,setSpeedRating]=useState("All");
  const [runFlatOnly,setRunFlatOnly]=useState(false),[rebateOnly,setRebateOnly]=useState(false);

  async function atdApi(body:Record<string,unknown>){const headers:Record<string,string>={"Content-Type":"application/json"};if(internal){const{data}=await supabase.auth.getSession();if(data.session?.access_token)headers.Authorization=`Bearer ${data.session.access_token}`;}const response=await fetch("/api/atd",{method:"POST",headers,body:JSON.stringify({...body,internal})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"ATD search failed");return payload;}
  async function loadFitment(action:string,selection:Record<string,string>={}){setFitmentLoading(action);setError("");try{const payload=await atdApi({action,selection});if(action==="years")setYears(payload.years||[]);if(action==="makes")setMakes(payload.makes||[]);if(action==="models")setModels(payload.models||[]);if(action==="trims")setTrims(payload.trims||[]);if(action==="options")setFitmentOptions(payload.trimoptions||[]);}catch(reason){setError(reason instanceof Error?reason.message:"ATD fitment failed");}finally{setFitmentLoading("");}}

  async function search() {
    setLoading(true); setError(""); setSearched(true);
    try {
      const payload = await atdApi({ action: "size", query });
      setProducts(payload.products || []); setSelected([]);
    } catch (reason) {
      setProducts([]); setError(reason instanceof Error ? reason.message : "ATD search failed");
    } finally { setLoading(false); }
  }
  async function searchVehicle(){const option=fitmentOptions.find((item)=>item.vehicleid===vehicle.vehicleid);if(!option)return;setLoading(true);setError("");setSearched(true);try{const payload=await atdApi({action:"fitment-products",vehicle:{year:vehicle.year,make:vehicle.make,model:vehicle.model,trim:vehicle.trim,trimoption:option.trimoption}});setProducts(payload.products||[]);setSelected([]);const position=option.position?.[0];setQuery((position?.both?.trimspecs?.Size||position?.front?.trimspecs?.Size||"").replace(/[^0-9]/g,""));}catch(reason){setProducts([]);setError(reason instanceof Error?reason.message:"ATD fitment search failed");}finally{setLoading(false);}}

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((item) => item.category).filter(Boolean)))], [products]);
  const brands=useMemo(()=>["All",...Array.from(new Set(products.map(item=>item.brand).filter(Boolean))).sort()],[products]);
  const loadRanges=useMemo(()=>["All",...Array.from(new Set(products.map(item=>item.loadRange).filter(Boolean))).sort()],[products]);
  const speedRatings=useMemo(()=>["All",...Array.from(new Set(products.map(item=>item.loadSpeed.split(/\s+/).pop()||"").filter(Boolean))).sort()],[products]);
  const results = useMemo(() => products.filter((tire) =>
    (category === "All" || tire.category === category) &&
    (!availableOnly || tire.availability.local + tire.availability.localPlus > 0) &&
    (!snowOnly || tire.snowRated) && (brand==="All"||tire.brand===brand) && (!minPrice||tire.installedPrice>=Number(minPrice)) && (!maxPrice||tire.installedPrice<=Number(maxPrice)) && (Number((tire.warranty.match(/[\d,]+/)?.[0]||"0").replace(/,/g,""))>=Number(minWarranty)) && (loadRange==="All"||tire.loadRange===loadRange) && (speedRating==="All"||tire.loadSpeed.split(/\s+/).pop()===speedRating) && (!runFlatOnly||tire.runFlat) && (!rebateOnly||tire.hasRebate)
  ).sort((a, b) => {
    if (sort === "availability") return (b.availability.local + b.availability.localPlus) - (a.availability.local + a.availability.localPlus);
    if (sort === "margin") return (b.installedPrice - (b.cost || 0)) - (a.installedPrice - (a.cost || 0));
    return a.installedPrice - b.installedPrice;
  }), [availableOnly, brand, category, loadRange, maxPrice, minPrice, minWarranty, products, rebateOnly, runFlatOnly, snowOnly, sort, speedRating]);

  function toggleSelected(tire: Product) {
    setSelected((items) => {
      if (items.some((item) => item.id === tire.id)) return items.filter((item) => item.id !== tire.id);
      if (items.length >= 3) return items;
      return [...items, tire];
    });
  }

  function buildQuote() {
    if (!selected.length) return;
    sessionStorage.setItem("bolt-tire-quote-selection", JSON.stringify({ tireSize: query, products: selected }));
    router.push("/quotes/new?from=tire-shop");
  }

  return <main className="tire-beta-page">
    <header className="tire-beta-hero"><div><span className="tire-beta-kicker">{internal ? "Bolt Tire staff beta" : "Bolt Tire shopping beta"}</span><h1>{internal ? "Tire Search & Quoting" : "Find the right tires"}</h1><p>Live ATD sandbox products, pricing, images, and inventory.</p></div><span className="tire-beta-badge">ATD sandbox</span></header>
    <section className="tire-beta-search-card">
      <div className="tire-beta-tabs"><button className={mode==="size"?"active":""} type="button" onClick={()=>setMode("size")}>Tire size</button><button className={mode==="vehicle"?"active":""} type="button" onClick={()=>{setMode("vehicle");if(!years.length)loadFitment("years")}}>Vehicle fitment</button>{internal && <button type="button" disabled>VIN / plate · coming next</button>}</div>
      {mode==="size"?<label className="tire-beta-search"><span>Enter tire size using digits only</span><div><input value={query} inputMode="numeric" pattern="[0-9]*" onChange={(event) => setQuery(event.target.value.replace(/[^0-9]/g, ""))} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder="2756518" /><button type="button" onClick={search} disabled={loading || !query.trim()}>{loading ? "Searching ATD…" : "Search ATD"}</button></div><small>Example: enter 2756518 for 275/65R18.</small></label>:<div className="tire-beta-fitment"><div className="tire-beta-fitment-grid"><label><span>Year</span><select value={vehicle.year} onChange={async e=>{const year=e.target.value;setVehicle({year,make:"",model:"",trim:"",trimoption:"",vehicleid:""});setMakes([]);setModels([]);setTrims([]);setFitmentOptions([]);if(year)await loadFitment("makes",{year})}}><option value="">{fitmentLoading==="years"?"Loading years…":"Select year"}</option>{years.map(item=><option key={item}>{item}</option>)}</select></label><label><span>Make</span><select disabled={!vehicle.year} value={vehicle.make} onChange={async e=>{const make=e.target.value;setVehicle(v=>({...v,make,model:"",trim:"",trimoption:"",vehicleid:""}));setModels([]);setTrims([]);setFitmentOptions([]);if(make)await loadFitment("models",{year:vehicle.year,make})}}><option value="">{fitmentLoading==="makes"?"Loading makes…":"Select make"}</option>{makes.map(item=><option key={item}>{item}</option>)}</select></label><label><span>Model</span><select disabled={!vehicle.make} value={vehicle.model} onChange={async e=>{const model=e.target.value;setVehicle(v=>({...v,model,trim:"",trimoption:"",vehicleid:""}));setTrims([]);setFitmentOptions([]);if(model)await loadFitment("trims",{year:vehicle.year,make:vehicle.make,model})}}><option value="">{fitmentLoading==="models"?"Loading models…":"Select model"}</option>{models.map(item=><option key={item}>{item}</option>)}</select></label><label><span>Trim</span><select disabled={!vehicle.model} value={vehicle.trim} onChange={async e=>{const trim=e.target.value;setVehicle(v=>({...v,trim,trimoption:"",vehicleid:""}));setFitmentOptions([]);if(trim)await loadFitment("options",{year:vehicle.year,make:vehicle.make,model:vehicle.model,trim})}}><option value="">{fitmentLoading==="trims"?"Loading trims…":"Select trim"}</option>{trims.map(item=><option key={item}>{item}</option>)}</select></label><label className="tire-beta-fitment-option"><span>Factory tire option</span><select disabled={!vehicle.trim} value={vehicle.vehicleid} onChange={e=>{const option=fitmentOptions.find(item=>item.vehicleid===e.target.value);setVehicle(v=>({...v,vehicleid:e.target.value,trimoption:option?.trimoption||""}))}}><option value="">{fitmentLoading==="options"?"Loading tire options…":"Select tire option"}</option>{fitmentOptions.map(item=><option value={item.vehicleid} key={item.vehicleid}>{item.trimoption}</option>)}</select></label></div><button type="button" className="tire-beta-fitment-search" disabled={!vehicle.vehicleid||loading} onClick={searchVehicle}>{loading?"Searching ATD…":"Find tires for this vehicle"}</button></div>}
    </section>
    {error && <div className="tire-beta-error"><strong>ATD sandbox error</strong><span>{error}</span></div>}
    <div className="tire-beta-layout">
      <aside className="tire-beta-filters"><div className="tire-beta-filter-head"><strong>Filters</strong><button type="button" onClick={() => { setCategory("All");setBrand("All");setMinPrice("");setMaxPrice("");setMinWarranty("0");setLoadRange("All");setSpeedRating("All");setAvailableOnly(true);setSnowOnly(false);setRunFlatOnly(false);setRebateOnly(false); }}>Reset</button></div><label>Brand<select value={brand} onChange={e=>setBrand(e.target.value)}>{brands.map(item=><option key={item}>{item}</option>)}</select></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><div className="tire-beta-price-range"><label>Min installed<input type="number" min="0" inputMode="numeric" placeholder="$0" value={minPrice} onChange={e=>setMinPrice(e.target.value)}/></label><label>Max installed<input type="number" min="0" inputMode="numeric" placeholder="Any" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)}/></label></div><label>Minimum warranty<select value={minWarranty} onChange={e=>setMinWarranty(e.target.value)}><option value="0">Any warranty</option><option value="40000">40,000+ miles</option><option value="50000">50,000+ miles</option><option value="60000">60,000+ miles</option><option value="70000">70,000+ miles</option></select></label><label>Load range<select value={loadRange} onChange={e=>setLoadRange(e.target.value)}>{loadRanges.map(item=><option key={item}>{item}</option>)}</select></label><label>Speed rating<select value={speedRating} onChange={e=>setSpeedRating(e.target.value)}>{speedRatings.map(item=><option key={item}>{item}</option>)}</select></label><label className="tire-beta-check"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /> Available nearby</label><label className="tire-beta-check"><input type="checkbox" checked={snowOnly} onChange={(event) => setSnowOnly(event.target.checked)} /> Severe-snow rated</label><label className="tire-beta-check"><input type="checkbox" checked={runFlatOnly} onChange={e=>setRunFlatOnly(e.target.checked)}/> Run-flat only</label><label className="tire-beta-check"><input type="checkbox" checked={rebateOnly} onChange={e=>setRebateOnly(e.target.checked)}/> Rebate available</label></aside>
      <section className="tire-beta-results"><div className="tire-beta-result-head"><div><strong>{results.length} tires</strong><span>{searched ? " from ATD sandbox" : " — enter a size above"}</span></div><div className="tire-beta-result-controls"><label>Quantity <select value={quantity} onChange={e=>setQuantity(Number(e.target.value))}>{[1,2,3,4,5,6].map(item=><option key={item} value={item}>{item}</option>)}</select></label><select aria-label="Sort tires" value={sort} onChange={(event) => setSort(event.target.value)}><option value="price">Lowest installed price</option><option value="availability">Best availability</option>{internal && <option value="margin">Best gross profit</option>}</select></div></div>
        {internal && searched && <div className="tire-beta-quote-tray"><div><strong>{selected.length} of 3 selected</strong><span>Choose up to three tires for a Good / Better / Best quote.</span></div><button type="button" disabled={!selected.length} onClick={buildQuote}>Generate Quote</button></div>}
        {!searched || loading || results.length === 0 ? <div className="tire-beta-empty"><strong>{loading ? "Searching ATD…" : searched ? "No available products matched." : "Search ATD by raw tire size."}</strong><span>{searched && !loading ? "Try turning off Available nearby or changing the size." : "Live sandbox results will appear here."}</span></div> : results.map((tire) => { const isSelected=selected.some((item)=>item.id===tire.id); return <article className={`tire-beta-product ${isSelected ? "selected" : ""}`} key={tire.id}>
          <div className="tire-beta-image">{tire.imageUrl ? <img src={tire.imageUrl} alt={`${tire.brand} ${tire.model}`} /> : <>TIRE<br /><small>No ATD image</small></>}</div>
          <div className="tire-beta-product-main"><span className="tire-beta-brand">{tire.brand}</span><h2>{tire.model}</h2><strong>{tire.size || tire.description}{tire.loadSpeed ? ` · ${tire.loadSpeed}` : ""}</strong><div className="tire-beta-tags"><span>{tire.category}</span>{tire.warranty && <span>{tire.warranty} warranty</span>}{tire.loadRange && <span>Load {tire.loadRange}</span>}{tire.snowRated && <span>3PMSF</span>}{tire.runFlat&&<span>Run-flat</span>}{tire.hasRebate&&<span>Rebate</span>}{tire.discontinued && <span>Discontinued</span>}</div><p>{tire.availability.local ? "Available locally" : tire.availability.localPlus ? "Available from Local Plus" : "Special order"}</p>{internal && <div className="tire-beta-stock"><span>Local <strong>{tire.availability.local}</strong></span><span>Local Plus <strong>{tire.availability.localPlus}</strong></span><span>Nationwide <strong>{tire.availability.nationwide}</strong></span></div>}</div>
          <div className="tire-beta-price">{internal && <><span>ATD cost <strong>${(tire.cost || 0).toFixed(2)}</strong></span><span>Gross profit <strong>${(tire.quotePrice - (tire.cost || 0)).toFixed(2)}</strong></span><small>{tire.atdProductNumber}</small></>}<div className="tire-beta-customer-price"><span>Tire price</span><strong>${tire.quotePrice.toFixed(2)} <small>each</small></strong></div><div className="tire-beta-total-price"><span>Estimated total for {quantity}</span><strong>${Number(tire.estimatedTotals?.[String(quantity)]??tire.installedPrice*quantity).toFixed(2)}</strong><small>tires, installation & standard fees</small></div><button className={isSelected?"selected":""} type="button" disabled={internal&&!isSelected&&selected.length>=3} onClick={()=>internal?toggleSelected(tire):undefined}>{internal ? isSelected ? "✓ Selected" : selected.length>=3 ? "3 selected" : "Select for quote" : "Choose tire"}</button></div>
        </article>})}
      </section>
    </div>
  </main>;
}
