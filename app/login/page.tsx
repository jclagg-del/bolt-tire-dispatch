"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    window.location.href = "/";
  };

  const handlePasskeyLogin = async () => {
    if (passkeyLoading) return;
    setPasskeyLoading(true);
    const { error } = await supabase.auth.signInWithPasskey();
    setPasskeyLoading(false);
    if (error) {
      alert(error.message === "Passkey authentication is disabled"
        ? "Face ID sign-in is not enabled yet. Use your password for now."
        : error.message);
      return;
    }
    window.location.href = "/";
  };

  return (
    <div style={page}>
      <div style={card}>
        <img
          src="/bolt-logo.png"
          alt="Bolt Tire"
          style={logo}
        />

        <div style={eyebrow}>Secure Access</div>
        <h1 style={title}>Sign In</h1>
        <p style={subtitle}>
          Log in to access the Bolt Tire dispatch system.
        </p>

        <button type="button" onClick={handlePasskeyLogin} style={passkeyButton} disabled={passkeyLoading || loading}>
          {passkeyLoading ? "Checking Face ID..." : "Sign in with Face ID"}
        </button>
        <div style={divider}><span style={dividerLine} /><span>or use password</span><span style={dividerLine} /></div>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
            autoComplete="email"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={input}
            autoComplete="current-password"
          />

          <button type="submit" style={button} disabled={loading}>
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8fafc",
  padding: 20,
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 24,
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const logo: React.CSSProperties = {
  height: 42,
  width: "auto",
  display: "block",
  marginBottom: 18,
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  marginBottom: 6,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  color: "#111827",
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 18,
  color: "#4b5563",
  fontSize: 15,
};

const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 12,
  marginTop: 10,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  boxSizing: "border-box",
  fontSize: 16,
  background: "#fff",
};

const button: React.CSSProperties = {
  width: "100%",
  marginTop: 16,
  padding: 12,
  background: "#111827",
  color: "white",
  border: "none",
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

const passkeyButton: React.CSSProperties = {
  ...button,
  marginTop: 0,
  background: "#2563eb",
};

const divider: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, margin: "18px 0 4px", color: "#64748b", fontSize: 13 };
const dividerLine: React.CSSProperties = { height: 1, background: "#e2e8f0", flex: 1 };
