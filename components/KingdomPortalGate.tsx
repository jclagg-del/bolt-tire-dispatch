"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

export default function KingdomPortalGate({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    fetch("/api/public/kingdom/auth", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => setAuthenticated(Boolean(result.authenticated)))
      .catch(() => setAuthenticated(false));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    const response = await fetch("/api/public/kingdom/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    setWorking(false);
    if (!response.ok) return setError("That PIN is not correct.");
    window.location.reload();
  };

  if (authenticated === null) return <main style={shell}><div style={card}>Loading portal...</div></main>;
  if (authenticated) return <>{children}</>;

  return <main style={shell}><form onSubmit={submit} style={card}>
    <img src="/bolt-logo.png" alt="Bolt Tire" style={logo} />
    <div style={eyebrow}>Kingdom Support Services</div>
    <h1 style={title}>Enter Portal PIN</h1>
    <p style={help}>Enter the four-digit PIN provided by Bolt Tire.</p>
    <input aria-label="Kingdom portal PIN" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} style={input} autoFocus />
    {error ? <div style={errorStyle}>{error}</div> : null}
    <button type="submit" disabled={working || pin.length !== 4} style={button}>{working ? "Checking..." : "Open Portal"}</button>
  </form></main>;
}

const shell: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "#f8fafc" };
const card: React.CSSProperties = { width: "100%", maxWidth: 420, boxSizing: "border-box", padding: 28, borderRadius: 18, border: "1px solid #e2e8f0", background: "white", boxShadow: "0 8px 28px rgba(15,23,42,.08)" };
const logo: React.CSSProperties = { height: 52, width: "auto", marginBottom: 22 };
const eyebrow: React.CSSProperties = { color: "#2563eb", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: .6 };
const title: React.CSSProperties = { margin: "7px 0", fontSize: 28, color: "#111827" };
const help: React.CSSProperties = { color: "#64748b", lineHeight: 1.5 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 14, border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 24, letterSpacing: 10, textAlign: "center" };
const button: React.CSSProperties = { width: "100%", marginTop: 14, padding: 13, border: 0, borderRadius: 10, background: "#2563eb", color: "white", fontSize: 15, fontWeight: 800 };
const errorStyle: React.CSSProperties = { marginTop: 10, color: "#b91c1c", fontSize: 13, fontWeight: 700 };
