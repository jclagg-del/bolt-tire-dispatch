import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character] || character);
}

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await request.json();
  const admin = createAdminClient();
  const { data: job, error: jobError } = await admin.from("jobs").select("id,customer,po_number,mo_number,vehicle,unit_number,service_type,completed_at,complete").eq("id", jobId).single();
  if (jobError || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.customer !== "Kingdom Support Services" || !job.complete) return NextResponse.json({ skipped: true });

  const { data: order } = await admin.from("customer_orders").select("id,completion_notification_sent_at").eq("approved_job_id", job.id).maybeSingle();
  if (order?.completion_notification_sent_at) return NextResponse.json({ sent: true, duplicate: true });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Completion email is not connected yet" }, { status: 503 });

  const recipient = process.env.KINGDOM_NOTIFICATION_EMAIL || "ksspartsorders@jw.org";
  const status = "COMPLETED";
  const jobNumber = job.po_number || "Not provided";
  const moNumber = job.mo_number || "Not provided";
  const subject = `${status} | Job/PO ${jobNumber} | MO ${moNumber}`;
  const completed = job.completed_at ? new Date(job.completed_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "Completed";
  const vehicle = [job.vehicle, job.unit_number && `Unit ${job.unit_number}`].filter(Boolean).join(" • ") || "Not provided";
  const service = job.service_type || "Tire service";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.KINGDOM_NOTIFICATION_FROM || "Bolt Tire <no-reply@bolttire.com>",
      reply_to: "office@bolttire.com",
      to: [recipient],
      subject,
      html: `<h2>Kingdom Support Services job completed</h2><p><strong>Status:</strong> Completed</p><p><strong>Job/PO:</strong> ${escapeHtml(jobNumber)}</p><p><strong>MO:</strong> ${escapeHtml(moNumber)}</p><p><strong>Vehicle:</strong> ${escapeHtml(vehicle)}</p><p><strong>Service:</strong> ${escapeHtml(service)}</p><p><strong>Completed:</strong> ${escapeHtml(completed)} ET</p>`,
    }),
  });
  const result = await response.json();
  if (!response.ok) return NextResponse.json({ error: result.message || "Email could not be sent" }, { status: 502 });
  if (order) await admin.from("customer_orders").update({ completion_notification_sent_at: new Date().toISOString() }).eq("id", order.id);
  return NextResponse.json({ sent: true });
}
