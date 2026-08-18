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

function cleanPhoneNumber(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

async function sendReviewRequest(admin: ReturnType<typeof createAdminClient>, job: {
  id: string | number;
  customer: string | null;
  contact_name: string | null;
  phone: string | null;
  review_request_sent_at: string | null;
}) {
  if (job.customer === "Kingdom Support Services") return { skipped: true, reason: "fleet-account" };
  if (job.review_request_sent_at) return { sent: true, duplicate: true };

  const to = cleanPhoneNumber(job.phone);
  if (!to) return { skipped: true, reason: "no-valid-phone" };

  const apiKey = process.env.QUO_API_KEY;
  const from = process.env.QUO_PHONE_NUMBER_ID;
  if (!apiKey || !from) return { skipped: true, reason: "quo-not-connected" };

  const google = process.env.GOOGLE_REVIEW_URL || "https://maps.app.goo.gl/DjpassNHco6CA78B8?g_st=ic";
  const yelp = process.env.YELP_REVIEW_URL || "https://m.yelp.com/biz/bolt-tire-pine-bush-2";
  const firstName = String(job.contact_name || "").trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName}!` : "Hi!";
  const content = `${greeting} Thanks for choosing Bolt Tire. We hope you are happy with your service. A couple of reminders: please re-torque your lug nuts to factory specifications after 50 miles, and rotate your tires after 500 miles. If you have a moment, we would appreciate a review. Google: ${google} Yelp: ${yelp} If you need anything, reply here. Reply STOP to opt out.`;

  const response = await fetch("https://api.openphone.com/v1/messages", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ content, from, to: [to] }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || result.error || "Quo review text could not be sent");

  const messageId = result.data?.id || null;
  await admin.from("jobs").update({
    review_request_sent_at: new Date().toISOString(),
    review_request_message_id: messageId,
  }).eq("id", job.id);
  return { sent: true, messageId };
}

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await request.json();
  const admin = createAdminClient();
  const { data: job, error: jobError } = await admin.from("jobs").select("id,customer,contact_name,phone,po_number,mo_number,vehicle,unit_number,service_type,completed_at,complete,review_request_sent_at").eq("id", jobId).single();
  if (jobError || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!job.complete) return NextResponse.json({ skipped: true });

  if (job.customer !== "Kingdom Support Services") {
    try {
      return NextResponse.json({ review: await sendReviewRequest(admin, job) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Review text could not be sent" }, { status: 502 });
    }
  }

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
