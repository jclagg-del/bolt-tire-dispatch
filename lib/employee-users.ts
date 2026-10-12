import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
export class EmployeeUserError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const employeeRoles = ["technician", "office", "admin"] as const;
export function employeeInput(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role;
  if (!name || name.length > 120) throw new EmployeeUserError("Enter the employee’s name (up to 120 characters).");
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new EmployeeUserError("Enter a valid employee email address.");
  if (!employeeRoles.includes(role as typeof employeeRoles[number])) throw new EmployeeUserError("Choose Technician, Office, or Admin.");
  return { name, email, role: role as typeof employeeRoles[number] };
}
function mailConfiguration() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new EmployeeUserError("Employee invitation email is not configured. No invitation was sent.", 503);
  return key;
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

async function sendSetupEmail(admin: Admin, user: { id: string; email: string; email_confirmed_at?: string }, key: string) {
  const type = user.email_confirmed_at ? "recovery" : "invite";
  const { data, error } = await admin.auth.admin.generateLink({ type, email: user.email });
  if (error || data.user?.id !== user.id || !data.properties?.hashed_token) {
    throw new EmployeeUserError("The employee account exists, but a setup link could not be created. Try Send setup email again.", 502);
  }
  // The fragment never reaches web-server logs. Email scanners cannot consume
  // the token: the recipient must press Continue on the setup page.
  const link = `https://app.bolttire.com/accept-invite#${new URLSearchParams({ token_hash: data.properties.hashed_token, type })}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.KINGDOM_NOTIFICATION_FROM || "Bolt Tire <no-reply@bolttire.com>",
      to: [user.email], reply_to: "office@bolttire.com", subject: "Set up your Bolt Tire employee login",
      text: `Your Bolt Tire employee login is ready. Set your own password using this secure, one-time link:\n${link}\n\nIf the link expires, ask your administrator to resend it from Settings → Users. Do not forward this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;padding:28px;color:#142449"><img src="https://app.bolttire.com/bolt-logo.png" alt="Bolt Tire" width="200"><h1>Your employee login is ready</h1><p>Set your own password to sign in to Bolt Tire.</p><p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#2563eb;color:white;padding:14px 20px;border-radius:8px;text-decoration:none">Set up my login</a></p><p>This link is for you only. If it expires, ask your administrator to send a new setup email from Settings → Users.</p></div>`,
    }),
  });
  if (!response.ok) throw new EmployeeUserError("The employee account exists, but the setup email was not accepted for delivery. Try Send setup email again in a minute.", 502);
}

export async function createEmployee(admin: Admin, body: Record<string, unknown>) {
  const { name, email, role } = employeeInput(body);
  const key = mailConfiguration();
  // Auth's email uniqueness protects against retries and concurrent creation.
  // An unshared random password means only the emailed setup link grants access.
  const { data, error } = await admin.auth.admin.createUser({ email, password: randomBytes(48).toString("base64url"), email_confirm: false, user_metadata: { full_name: name } });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.code === "user_already_exists") throw new EmployeeUserError("That email already has an account. Use the employee list below; existing access was not changed.", 409);
    throw new EmployeeUserError("Could not create this employee account. Check whether the email already has a login and try again.", 400);
  }
  // Authorization is stored in protected staff_security, never user_metadata.
  const { data: profile, error: profileError } = await admin.from("staff_security")
    .update({ role, password_change_required: true, updated_at: new Date().toISOString() })
    .eq("user_id", data.user.id).select("user_id").maybeSingle();
  if (profileError || !profile) throw new EmployeeUserError("Account created, but its role could not be saved. No email was sent. Contact your administrator before inviting this account.", 500);
  await sendSetupEmail(admin, { ...data.user, email }, key);
  return { message: "Employee account created. Password-setup email sent." };
}

export async function resendEmployeeSetup(admin: Admin, body: Record<string, unknown>, actorId: string) {
  if (typeof body.user_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.user_id) || body.user_id === actorId) throw new EmployeeUserError("Choose another employee who is awaiting password setup.");
  const key = mailConfiguration();
  const { data: profile, error } = await admin.from("staff_security").select("user_id,email,password_change_required,updated_at").eq("user_id", body.user_id).maybeSingle();
  if (error) throw new EmployeeUserError("Could not check the employee account.", 500);
  if (!profile || !profile.password_change_required) throw new EmployeeUserError("This account is not awaiting password setup.", 409);
  const { data: auth, error: authError } = await admin.auth.admin.getUserById(profile.user_id);
  if (authError || !auth.user?.email || auth.user.email.toLowerCase() !== profile.email.toLowerCase()) throw new EmployeeUserError("Employee email could not be verified. No email was sent.", 409);
  if (auth.user.banned_until && Date.parse(auth.user.banned_until) > Date.now()) throw new EmployeeUserError("This employee account is disabled.", 409);
  // A durable compare-and-set prevents concurrent resends from invalidating
  // each other's one-time links. No roles or existing passwords are changed.
  const { data: claimed, error: claimError } = await admin.from("staff_security").update({ updated_at: new Date().toISOString() })
    .eq("user_id", profile.user_id).eq("updated_at", profile.updated_at).eq("password_change_required", true)
    .lt("updated_at", new Date(Date.now() - 60000).toISOString()).select("user_id").maybeSingle();
  if (claimError) throw new EmployeeUserError("Could not prepare the setup email.", 500);
  if (!claimed) throw new EmployeeUserError("Please wait a minute before resending, then refresh the employee list.", 429);
  await sendSetupEmail(admin, { ...auth.user, email: auth.user.email }, key);
  return { message: "Password-setup email sent. Ask the employee to use the newest email." };
}
