"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
type Employee = { user_id: string; email: string; role: string; password_change_required: boolean };
export default function EmployeeUsersSettings() {
  const [users, setUsers] = useState<Employee[]>([]), [currentId, setCurrentId] = useState("");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [role, setRole] = useState("technician");
  const [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const pending = useRef(false);
  async function request(body?: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Please sign in again.");
    const response = await fetch(`/api/admin/users?page=${page}`, { method: body ? "POST" : "GET", cache: "no-store", headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? {"Content-Type":"application/json"} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load employee accounts.");
    return result;
  }
  async function load() {
    setLoading(true);
    try { const result = await request(); setUsers(result.users); setHasMore(result.hasMore); setCurrentId(result.currentUserId); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load users."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [page]);
  async function submit(body: Record<string, unknown>) {
    if (pending.current) return;
    if (body.action === "create" && role === "admin" && !confirm("Give this employee administrator access, including the ability to create employee logins?")) return;
    if (body.action === "resend" && !confirm("Send a new password-setup email to this employee? They should use the newest email.")) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try { const result = await request(body); setMessage(result.message); if (body.action === "create") { setName(""); setEmail(""); setRole("technician"); } }
    catch (e) { setError(e instanceof Error ? e.message : "Could not send the invitation. Refresh before trying again."); }
    finally { await load(); pending.current = false; setBusy(false); }
  }
  return <>
    <section className="quote-form-card">
      <h2>Employee logins</h2>
      <p>Create a separate login for each employee. They receive an email to set their own password. These accounts use the app’s existing staff permissions, not customer access.</p>
      <form onSubmit={event => { event.preventDefault(); submit({ action:"create", name, email, role }); }}>
        <fieldset disabled={busy} style={{border:0,padding:0,margin:0}}>
          <div className="quote-form-grid">
            <label className="quote-field">Employee name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} autoComplete="off" /></label>
            <label className="quote-field">Employee email<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="off" /></label>
            <label className="quote-field">Role<select value={role} onChange={e=>setRole(e.target.value)}><option value="technician">Technician</option><option value="office">Office</option><option value="admin">Admin</option></select></label>
          </div>
          {role === "admin" && <p>Admins can manage employee logins and other admin-only settings.</p>}
          <button className="quote-select-button" type="submit" style={{marginTop:16}}>{busy ? "Please wait…" : "Create login & send email"}</button>
        </fieldset>
      </form>
      <p><small>The Technicians section separately controls the names available for job assignments.</small></p>
    </section>
    {error && <div role="alert" className="quote-error">{error}</div>}
    {message && <div role="status" className="quote-message">{message}</div>}
    <section className="quote-form-card">
      <h2>Employee accounts</h2>
      <button type="button" disabled={busy || loading} onClick={load}>Refresh list</button>
      {loading ? <p>Loading employees…</p> : !users.length ? <p>No employee accounts found.</p> : users.map(user=><div key={user.user_id} style={{display:"flex",flexWrap:"wrap",gap:12,justifyContent:"space-between",alignItems:"center",padding:"16px 0",borderBottom:"1px solid #e2e8f0"}}>
        <div style={{overflowWrap:"anywhere"}}><strong>{user.email}</strong>{user.user_id === currentId ? " (you)" : ""}<div style={{textTransform:"capitalize"}}>{user.role}</div><small>{user.password_change_required ? "Password setup required" : "Password setup complete"}</small></div>
        {user.password_change_required && user.user_id !== currentId && <button type="button" disabled={busy} onClick={()=>submit({action:"resend",user_id:user.user_id})}>Send setup email</button>}
      </div>)}
      <div style={{display:"flex",gap:12,marginTop:16}}><button disabled={busy || loading || page===0} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page+1}</span><button disabled={busy || loading || !hasMore} onClick={()=>setPage(page+1)}>Next</button></div>
    </section>
  </>;
}
