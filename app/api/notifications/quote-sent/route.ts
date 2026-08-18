import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] || character);
}

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { quoteId } = await request.json();
  const admin = createAdminClient();
  const { data: quote, error } = await admin
    .from("quotes")
    .select("id,quote_number,customer,contact_name,email,vehicle,tire_size,quantity,public_token,status")
    .eq("id", quoteId)
    .single();
  if (error || !quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (!quote.email) return NextResponse.json({ error: "Add a customer email address before sending." }, { status: 400 });
  if (!quote.public_token) return NextResponse.json({ error: "This quote does not have a customer link." }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Quote email is not connected yet." }, { status: 503 });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const quoteUrl = `${appUrl.replace(/\/$/, "")}/q/${quote.public_token}`;
  const recipientName = quote.contact_name || quote.customer || "there";
  const details = [quote.vehicle, quote.tire_size, `${quote.quantity} tire${quote.quantity === 1 ? "" : "s"}`].filter(Boolean).join(" • ");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.QUOTE_NOTIFICATION_FROM || process.env.KINGDOM_NOTIFICATION_FROM || "Bolt Tire <no-reply@bolttire.com>",
      reply_to: "office@bolttire.com",
      to: [quote.email],
      subject: `Your Bolt Tire Quote #${quote.quote_number}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111827"><h1 style="margin-bottom:8px">Your Bolt Tire quote is ready</h1><p>Hi ${escapeHtml(recipientName)},</p><p>Review your tire options, choose the one you want, and complete payment securely online.</p>${details ? `<p style="color:#475569">${escapeHtml(details)}</p>` : ""}<p style="margin:28px 0"><a href="${escapeHtml(quoteUrl)}" style="background:#2563eb;color:white;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:700">Review Quote &amp; Choose Tires</a></p><p>If you have questions, reply to this email or call Bolt Tire.</p><p>— Bolt Tire</p></div>`,
    }),
  });
  const result = await response.json();
  if (!response.ok) return NextResponse.json({ error: result.message || "Quote email could not be sent." }, { status: 502 });

  if (quote.status === "draft") {
    await admin.from("quotes").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", quote.id);
  }
  return NextResponse.json({ sent: true });
}
