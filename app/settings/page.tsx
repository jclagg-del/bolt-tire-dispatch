"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";
import {
  BusinessSettings,
  fallbackBusinessSettings,
} from "@/lib/business-settings";

type Technician = {
  id: string;
  name: string;
  quo_phone_number: string | null;
  active: boolean;
};

type Vehicle = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  sort_order: number;
};

type Section = "pricing" | "team" | "vehicles" | "integrations";

const pricingGroups: Array<{
  title: string;
  description: string;
  fields: Array<{ key: keyof BusinessSettings; label: string; prefix?: string; suffix?: string }>;
}> = [
  {
    title: "Passenger installation",
    description: "Default mobile installation totals used when building jobs and quotes.",
    fields: [
      { key: "passenger_two_install", label: "Two tires", prefix: "$" },
      { key: "passenger_four_install", label: "Four tires", prefix: "$" },
    ],
  },
  {
    title: "Light-truck installation",
    description: "Higher defaults for larger and more difficult truck tires.",
    fields: [
      { key: "truck_two_install", label: "Two tires", prefix: "$" },
      { key: "truck_four_install", label: "Four tires", prefix: "$" },
    ],
  },
  {
    title: "Scheduled commercial service",
    description: "Fleet-yard pricing. These rates do not include emergency roadside work.",
    fields: [
      { key: "commercial_service_call", label: "Service call", prefix: "$" },
      { key: "commercial_17_install", label: "16–17.5 inch per tire", prefix: "$" },
      { key: "commercial_19_install", label: "19.5 inch per tire", prefix: "$" },
      { key: "commercial_22_install", label: "22.5–24.5 inch per tire", prefix: "$" },
      { key: "commercial_super_single_install", label: "Super-single per tire", prefix: "$" },
      { key: "inside_dual_surcharge", label: "Inside-dual surcharge", prefix: "$" },
    ],
  },
  {
    title: "Disposal, tax and travel",
    description: "Default fees remain editable on every individual job or quote.",
    fields: [
      { key: "passenger_disposal_fee", label: "Passenger disposal per tire", prefix: "$" },
      { key: "truck_disposal_fee", label: "Truck disposal per tire", prefix: "$" },
      { key: "commercial_disposal_fee", label: "Commercial disposal per tire", prefix: "$" },
      { key: "ny_state_tire_fee", label: "NY state fee per tire", prefix: "$" },
      { key: "default_sales_tax_rate", label: "Default sales-tax rate", suffix: "%" },
      { key: "included_radius_miles", label: "Included travel radius", suffix: "miles" },
      { key: "extra_mileage_rate", label: "Additional mileage rate", prefix: "$" },
    ],
  },
];

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("pricing");
  const [settings, setSettings] = useState<BusinessSettings>(fallbackBusinessSettings);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [newTechName, setNewTechName] = useState("");
  const [newTechQuo, setNewTechQuo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [quickBooksConnected, setQuickBooksConnected] = useState<boolean | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    const [settingsResult, techResult, vehicleResult] = await Promise.all([
      supabase.from("business_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("technicians").select("id,name,quo_phone_number,active").order("name"),
      supabase.from("vehicles").select("id,name,color,active,sort_order").order("sort_order"),
    ]);

    if (settingsResult.data) setSettings(settingsResult.data as BusinessSettings);
    if (techResult.data) setTechnicians(techResult.data as Technician[]);
    if (vehicleResult.data) setVehicles(vehicleResult.data as Vehicle[]);
    setLoading(false);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (section !== "integrations") return;
    const loadStatus = async () => {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/quickbooks/status", {
        headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
      });
      const result = await response.json().catch(() => ({ connected: false }));
      setQuickBooksConnected(Boolean(result.connected));
    };
    loadStatus();
  }, [section]);

  const updateNumber = (key: keyof BusinessSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: Number(value) || 0 }));
  };

  const savePricing = async () => {
    setSaving(true);
    setMessage("");
    const { id: _id, ...changes } = settings;
    const { error } = await supabase
      .from("business_settings")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSaving(false);
    setMessage(error ? `Could not save: ${error.message}` : "Pricing settings saved.");
  };

  const addTechnician = async () => {
    if (!newTechName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("technicians").insert({
      name: newTechName.trim(),
      quo_phone_number: newTechQuo.trim() || null,
    });
    setSaving(false);
    if (error) {
      setMessage(`Could not add technician: ${error.message}`);
      return;
    }
    setNewTechName("");
    setNewTechQuo("");
    setMessage("Technician added.");
    await loadSettings();
  };

  const saveTechnician = async (technician: Technician) => {
    setSaving(true);
    const { error } = await supabase
      .from("technicians")
      .update({
        name: technician.name.trim(),
        quo_phone_number: technician.quo_phone_number?.trim() || null,
        active: technician.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", technician.id);
    setSaving(false);
    setMessage(error ? `Could not save: ${error.message}` : `${technician.name} saved.`);
  };

  const saveVehicle = async (vehicle: Vehicle) => {
    setSaving(true);
    const { error } = await supabase
      .from("vehicles")
      .update({ name: vehicle.name.trim(), color: vehicle.color, active: vehicle.active })
      .eq("id", vehicle.id);
    setSaving(false);
    setMessage(error ? `Could not save: ${error.message}` : `${vehicle.name} saved.`);
  };

  return (
    <div style={shell}>
      <AppHeader />
      <main style={page}>
        <div style={hero}>
          <div>
            <div style={eyebrow}>Administration</div>
            <h1 style={title}>Settings</h1>
            <p style={subtitle}>Manage the defaults that power jobs, routes, integrations, and future quotes.</p>
          </div>
          {message ? <div style={messageBox}>{message}</div> : null}
        </div>

        <div style={layout} className="settings-layout">
          <nav style={sideNav} className="settings-nav" aria-label="Settings sections">
            {([
              ["pricing", "Pricing & Fees"],
              ["team", "Technicians"],
              ["vehicles", "Service Vehicles"],
              ["integrations", "Integrations"],
            ] as Array<[Section, string]>).map(([key, label]) => (
              <button key={key} type="button" onClick={() => { setSection(key); setMessage(""); }} style={{ ...navButton, ...(section === key ? navButtonActive : {}) }}>
                {label}
              </button>
            ))}
          </nav>

          <section style={content}>
            {loading ? <div style={card}>Loading settings...</div> : null}

            {!loading && section === "pricing" ? (
              <>
                {pricingGroups.map((group) => (
                  <div style={card} key={group.title}>
                    <h2 style={cardTitle}>{group.title}</h2>
                    <p style={cardDescription}>{group.description}</p>
                    <div style={fieldGrid}>
                      {group.fields.map((pricingField) => (
                        <label style={field} key={pricingField.key}>
                          <span style={label}>{pricingField.label}</span>
                          <span style={inputWrap}>
                            {pricingField.prefix ? <span style={affix}>{pricingField.prefix}</span> : null}
                            <input type="number" min="0" step="0.01" value={String(settings[pricingField.key] ?? "")} onChange={(event) => updateNumber(pricingField.key, event.target.value)} style={input} />
                            {pricingField.suffix ? <span style={affix}>{pricingField.suffix}</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={card}>
                  <label style={field}>
                    <span style={label}>Business base address</span>
                    <input value={settings.base_address || ""} onChange={(event) => setSettings((current) => ({ ...current, base_address: event.target.value }))} style={textInput} placeholder="Used for future travel-zone pricing" />
                  </label>
                </div>
                <button type="button" onClick={savePricing} disabled={saving} style={primaryButton}>{saving ? "Saving..." : "Save Pricing Settings"}</button>
              </>
            ) : null}

            {!loading && section === "team" ? (
              <>
                <div style={card}>
                  <h2 style={cardTitle}>Add technician</h2>
                  <div style={fieldGrid}>
                    <label style={field}><span style={label}>Name</span><input value={newTechName} onChange={(e) => setNewTechName(e.target.value)} style={textInput} placeholder="Technician name" /></label>
                    <label style={field}><span style={label}>Quo business line</span><input value={newTechQuo} onChange={(e) => setNewTechQuo(e.target.value)} style={textInput} placeholder="+18455551212" /></label>
                  </div>
                  <button type="button" onClick={addTechnician} disabled={saving || !newTechName.trim()} style={primaryButton}>Add Technician</button>
                </div>
                {technicians.map((technician) => (
                  <div style={card} key={technician.id}>
                    <div style={fieldGrid}>
                      <label style={field}><span style={label}>Name</span><input value={technician.name} onChange={(e) => setTechnicians((items) => items.map((item) => item.id === technician.id ? { ...item, name: e.target.value } : item))} style={textInput} /></label>
                      <label style={field}><span style={label}>Quo business line</span><input value={technician.quo_phone_number || ""} onChange={(e) => setTechnicians((items) => items.map((item) => item.id === technician.id ? { ...item, quo_phone_number: e.target.value } : item))} style={textInput} placeholder="+18455551212" /></label>
                    </div>
                    <label style={checkLabel}><input type="checkbox" checked={technician.active} onChange={(e) => setTechnicians((items) => items.map((item) => item.id === technician.id ? { ...item, active: e.target.checked } : item))} /> Active technician</label>
                    <button type="button" onClick={() => saveTechnician(technician)} disabled={saving} style={secondaryButton}>Save</button>
                  </div>
                ))}
              </>
            ) : null}

            {!loading && section === "vehicles" ? vehicles.map((vehicle) => (
              <div style={card} key={vehicle.id}>
                <div style={vehicleHeader}><span style={{ ...colorDot, background: vehicle.color }} /><h2 style={cardTitle}>{vehicle.name}</h2></div>
                <div style={fieldGrid}>
                  <label style={field}><span style={label}>Vehicle name</span><input value={vehicle.name} onChange={(e) => setVehicles((items) => items.map((item) => item.id === vehicle.id ? { ...item, name: e.target.value } : item))} style={textInput} /></label>
                  <label style={field}><span style={label}>Schedule color</span><input type="color" value={vehicle.color} onChange={(e) => setVehicles((items) => items.map((item) => item.id === vehicle.id ? { ...item, color: e.target.value } : item))} style={colorInput} /></label>
                </div>
                <label style={checkLabel}><input type="checkbox" checked={vehicle.active} onChange={(e) => setVehicles((items) => items.map((item) => item.id === vehicle.id ? { ...item, active: e.target.checked } : item))} /> Available for scheduling</label>
                <button type="button" onClick={() => saveVehicle(vehicle)} disabled={saving} style={secondaryButton}>Save</button>
              </div>
            )) : null}

            {!loading && section === "integrations" ? (
              <>
                <div style={card}><div style={integrationRow}><div><h2 style={cardTitle}>QuickBooks Online</h2><p style={cardDescription}>Customer lookup, invoices, balances, and payment status.</p></div><span style={quickBooksConnected ? connectedBadge : disconnectedBadge}>{quickBooksConnected === null ? "Checking..." : quickBooksConnected ? "Connected" : "Not connected"}</span></div></div>
                <div style={card}><div style={integrationRow}><div><h2 style={cardTitle}>Quo</h2><p style={cardDescription}>Technician calls and texts use the Quo lines assigned under Technicians.</p></div><span style={technicians.some((tech) => tech.quo_phone_number) ? connectedBadge : disconnectedBadge}>{technicians.some((tech) => tech.quo_phone_number) ? "Lines assigned" : "Needs lines"}</span></div></div>
                <div style={card}><h2 style={cardTitle}>Coming with Quotes</h2><p style={cardDescription}>Customer approval links, tire comparison images, PDF quotes, email delivery, and Quo messaging will be managed here.</p></div>
              </>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

const shell: React.CSSProperties = { minHeight: "100vh", background: "#f8fafc" };
const page: React.CSSProperties = { maxWidth: 1250, margin: "0 auto", padding: 20 };
const hero: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" };
const eyebrow: React.CSSProperties = { color: "#64748b", fontWeight: 800, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" };
const title: React.CSSProperties = { margin: "4px 0", fontSize: 34, color: "#0f172a" };
const subtitle: React.CSSProperties = { margin: 0, color: "#475569" };
const messageBox: React.CSSProperties = { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "10px 14px", borderRadius: 10, fontWeight: 700 };
const layout: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px, 230px) minmax(0, 1fr)", gap: 20, alignItems: "start" };
const sideNav: React.CSSProperties = { background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 8, display: "grid", gap: 5, position: "sticky", top: 78 };
const navButton: React.CSSProperties = { border: 0, borderRadius: 9, padding: "11px 12px", background: "transparent", color: "#334155", fontWeight: 700, textAlign: "left", cursor: "pointer" };
const navButtonActive: React.CSSProperties = { background: "#0f172a", color: "white" };
const content: React.CSSProperties = { display: "grid", gap: 14 };
const card: React.CSSProperties = { background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18, boxShadow: "0 2px 8px rgba(15,23,42,.04)" };
const cardTitle: React.CSSProperties = { margin: 0, color: "#0f172a", fontSize: 19 };
const cardDescription: React.CSSProperties = { color: "#64748b", margin: "6px 0 16px", lineHeight: 1.45 };
const fieldGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const field: React.CSSProperties = { display: "grid", gap: 6 };
const label: React.CSSProperties = { color: "#334155", fontWeight: 700, fontSize: 13 };
const inputWrap: React.CSSProperties = { display: "flex", alignItems: "center", border: "1px solid #cbd5e1", borderRadius: 9, overflow: "hidden", background: "white" };
const input: React.CSSProperties = { width: "100%", border: 0, padding: "10px 8px", outline: "none", fontSize: 15, minWidth: 0 };
const textInput: React.CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 9, padding: "10px 11px", fontSize: 15, outline: "none" };
const affix: React.CSSProperties = { color: "#64748b", padding: "0 9px", fontWeight: 700, whiteSpace: "nowrap" };
const primaryButton: React.CSSProperties = { marginTop: 14, border: 0, borderRadius: 9, padding: "11px 15px", background: "#2563eb", color: "white", fontWeight: 800, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 9, padding: "9px 14px", background: "white", color: "#0f172a", fontWeight: 800, cursor: "pointer" };
const checkLabel: React.CSSProperties = { marginTop: 13, display: "flex", gap: 8, alignItems: "center", color: "#334155", fontWeight: 700 };
const vehicleHeader: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, marginBottom: 14 };
const colorDot: React.CSSProperties = { width: 15, height: 15, borderRadius: "50%", border: "1px solid #94a3b8" };
const colorInput: React.CSSProperties = { width: 60, height: 42, border: "1px solid #cbd5e1", borderRadius: 8, padding: 3, background: "white" };
const integrationRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" };
const connectedBadge: React.CSSProperties = { background: "#dcfce7", color: "#166534", padding: "6px 10px", borderRadius: 999, fontWeight: 800, fontSize: 13 };
const disconnectedBadge: React.CSSProperties = { background: "#fef3c7", color: "#92400e", padding: "6px 10px", borderRadius: 999, fontWeight: 800, fontSize: 13 };
