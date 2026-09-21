import "server-only";

type NotificationKind = "new" | "changed" | "cancellation";

export type FleetOrderNotification = {
  id?: string | number | null;
  customer?: string | null;
  goodyear_order?: boolean | null;
  service_method?: string | null;
  submitted_by?: string | null;
  contact_name?: string | null;
  contact_number?: string | null;
  facility_name?: string | null;
  address?: string | null;
  vehicle_year?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  license_plate?: string | null;
  requested_date?: string | null;
  requested_time?: string | null;
  job_number?: string | null;
  mo_number?: string | null;
  tire_position?: string | null;
  qty?: number | null;
  tire_size?: string | null;
  tire_product_number?: string | null;
  notes?: string | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>\"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '\"': "&quot;",
  })[character] || character);
}

function serviceLabel(value: unknown) {
  const labels: Record<string, string> = {
    installed: "Installation",
    delivery: "Delivery",
    pickup: "Pickup",
    delivery_pickup: "Delivery and pickup",
  };
  return labels[String(value || "")] || String(value || "Not provided");
}

export async function sendFleetOrderNotification(kind: NotificationKind, order: FleetOrderNotification) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const recipient = process.env.NEW_ORDER_NOTIFICATION_EMAIL || "office@bolttire.com";
  const organization = order.customer === "HPR" ? "HPR" : "Kingdom Support Services";
  const organizationCode = organization === "HPR" ? "HPR" : "KSS";
  const labels: Record<NotificationKind, string> = {
    new: "NEW ORDER",
    changed: "ORDER CHANGED",
    cancellation: "CANCELLATION REQUEST",
  };
  const label = labels[kind];
  const vehicle = [order.vehicle_year, order.vehicle_make, order.vehicle_model].filter(Boolean).join(" ") || "Not provided";
  const subject = `${label} | ${organizationCode} | Job ${order.job_number || "not provided"} | MO ${order.mo_number || "not provided"}`;
  const heading = kind === "new" ? `New ${organization} order` : kind === "changed" ? `${organization} order changed` : `${organization} cancellation requested`;
  const accent = kind === "cancellation" ? "#b91c1c" : kind === "changed" ? "#d97706" : "#1d4ed8";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.KINGDOM_NOTIFICATION_FROM || "Bolt Tire <no-reply@bolttire.com>",
      reply_to: "office@bolttire.com",
      to: [recipient],
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:680px;color:#111827"><div style="border-left:6px solid ${accent};padding-left:16px"><h2>${escapeHtml(heading)}</h2><p><strong>Status:</strong> ${escapeHtml(label)}</p></div><p><strong>Order type:</strong> ${escapeHtml(serviceLabel(order.service_method))}</p><p><strong>Requested:</strong> ${escapeHtml(order.requested_date || "Not provided")} at ${escapeHtml(order.requested_time || "Not provided")}</p><p><strong>Facility:</strong> ${escapeHtml(order.facility_name || "Not provided")}<br>${escapeHtml(order.address || "")}</p><p><strong>Contact:</strong> ${escapeHtml(order.contact_name || "Not provided")} · ${escapeHtml(order.contact_number || "Not provided")}<br><strong>Submitted by:</strong> ${escapeHtml(order.submitted_by || "Not provided")}</p><p><strong>Vehicle:</strong> ${escapeHtml(vehicle)}${order.vehicle_color ? ` · ${escapeHtml(order.vehicle_color)}` : ""}${order.license_plate ? ` · Plate ${escapeHtml(order.license_plate)}` : ""}</p><p><strong>Job number:</strong> ${escapeHtml(order.job_number || "Not provided")}<br><strong>MO number:</strong> ${escapeHtml(order.mo_number || "Not provided")}</p><p><strong>Tires:</strong> ${escapeHtml(order.qty || "Not provided")} × ${escapeHtml(order.tire_size || "Not provided")}<br><strong>Position:</strong> ${escapeHtml(order.tire_position || "Not provided")}<br><strong>Part number:</strong> ${escapeHtml(order.tire_product_number || "Not provided")}<br><strong>Goodyear order:</strong> ${order.goodyear_order ? "Yes" : "No"}</p>${order.notes ? `<p><strong>Notes:</strong><br>${escapeHtml(order.notes).replace(/\n/g, "<br>")}</p>` : ""}<p style="margin-top:24px"><a href="https://app.bolttire.com/orders" style="background:${accent};color:#fff;padding:12px 18px;border-radius:7px;text-decoration:none;font-weight:700">Open Orders</a></p></div>`,
    }),
  });
  const result = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(result.message || `Resend returned ${response.status}`);
}
