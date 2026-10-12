"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
export default function AcceptInvite() {
  const token = useRef<{token_hash:string;type:"invite"|"recovery"}|null>(null);
  const pending = useRef(false);
  const [ready,setReady] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState("");
  useEffect(()=>{
    const params = new URLSearchParams(window.location.hash.slice(1));
    const hash = params.get("token_hash"), type = params.get("type");
    if (hash && hash.length <= 512 && (type === "invite" || type === "recovery")) {
      token.current = {token_hash:hash,type}; setReady(true);
      window.history.replaceState(null,"","/accept-invite");
    } else if (!token.current) setError("Open the setup link from your newest Bolt Tire invitation email. If it expired, ask your administrator to resend it.");
  },[]);
  async function accept() {
    if (!token.current || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const {data,error} = await supabase.auth.verifyOtp(token.current);
      if (error || !data.session) { setError("This link could not be verified. Use the newest invitation email or ask your administrator for a new one."); return; }
      window.location.replace("/change-password");
    } catch { setError("Could not connect. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:20,background:"#f8fafc"}}><section className="quote-form-card" style={{maxWidth:460}}><img src="/bolt-logo.png" alt="Bolt Tire" style={{width:200,maxWidth:"100%"}}/><h1>Set up your employee login</h1><p>Continue to securely sign in with your invitation and choose your own password.</p>{error && <p role="alert" className="quote-error">{error}</p>}<button className="quote-select-button" disabled={!ready || busy} onClick={accept}>{busy ? "Verifying invitation…" : "Continue to password setup"}</button><p><small>Only continue if this invitation was sent to you.</small></p></section></main>;
}
