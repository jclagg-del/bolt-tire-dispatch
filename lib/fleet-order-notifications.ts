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
  facility_id?: string | number | null;
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
  tire_model?: string | null;
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

const changeFields = {
  customer: "Organization", service_method: "Order type", goodyear_order: "Goodyear order",
  submitted_by: "Submitted by", contact_name: "Contact name", contact_number: "Contact phone",
  facility_name: "Facility", facility_id: "Facility record", address: "Service address",
  requested_date: "Requested date", requested_time: "Requested time",
  job_number: "Job / PO number", mo_number: "MO number",
  vehicle_year: "Vehicle year", vehicle_make: "Vehicle make", vehicle_model: "Vehicle model",
  vehicle_color: "Vehicle color", license_plate: "License plate",
  qty: "Tire quantity", tire_size: "Tire size", tire_model: "Tire model",
  tire_product_number: "Part number", tire_position: "Tire position", notes: "Notes",
} satisfies Partial<Record<keyof FleetOrderNotification, string>>;

function comparableValue(key: keyof typeof changeFields, order: FleetOrderNotification) {
  if (key === "goodyear_order") return order[key] ? "Yes" : "No";
  const value = String(order[key] ?? "").trim().replace(/\r\n?/g, "\n");
  // Postgres returns HH:mm:ss; the form submits HH:mm.
  if (key === "requested_time" && /^\d{2}:\d{2}:00$/.test(value)) return value.slice(0, 5);
  return value;
}

function displayChangeValue(key: keyof typeof changeFields, value: string) {
  if (!value) return "Not provided";
  if (key === "service_method") return serviceLabel(value);
  if (key === "requested_time" && /^\d{2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  }
  return value;
}

export function fleetOrderChanges(before: FleetOrderNotification, after: FleetOrderNotification) {
  return (Object.keys(changeFields) as (keyof typeof changeFields)[]).flatMap(key => {
    const previous = comparableValue(key, before);
    const current = comparableValue(key, after);
    return previous === current ? [] : [{ field: changeFields[key], before: displayChangeValue(key, previous), after: displayChangeValue(key, current) }];
  });
}

function changeSummary(before: FleetOrderNotification | undefined, after: FleetOrderNotification) {
  if (!before) return "<h3>What changed</h3><p>Previous values are unavailable. Current order details are shown below.</p>";
  const changes = fleetOrderChanges(before, after);
  if (!changes.length) return "<h3>What changed</h3><p>No order details changed.</p>";
  const cellStyle = "padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap";
  return `<h3>What changed</h3><table style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr style="background:#fef3c7">${["Field", "Previous", "New"].map(label => `<th scope="col" style="${cellStyle}">${label}</th>`).join("")}</tr></thead><tbody>${changes.map(change => `<tr>${[change.field, change.before, change.after].map(value => `<td style="${cellStyle}">${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table><h3>Updated order details</h3>`;
}

export async function sendFleetOrderNotification(kind: NotificationKind, order: FleetOrderNotification, idempotencyKey?: string, previousOrder?: FleetOrderNotification) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const recipient = process.env.NEW_ORDER_NOTIFICATION_EMAIL || "office@bolttire.com";
  const organization = order.customer || "Kingdom Support Services";
  const organizationCode = organization === "Kingdom Support Services" ? "KSS" : organization;
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
  const changesHtml = kind === "changed" ? changeSummary(previousOrder, order) : "";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: JSON.stringify({
      from: process.env.KINGDOM_NOTIFICATION_FROM || "Bolt Tire <no-reply@bolttire.com>",
      reply_to: "office@bolttire.com",
      to: [recipient],
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:680px;color:#111827"><div style="border-left:6px solid ${accent};padding-left:16px"><h2>${escapeHtml(heading)}</h2><p><strong>Status:</strong> ${escapeHtml(label)}</p></div>${changesHtml}<p><strong>Order type:</strong> ${escapeHtml(serviceLabel(order.service_method))}</p><p><strong>Requested:</strong> ${escapeHtml(order.requested_date || "Not provided")} at ${escapeHtml(order.requested_time || "Not provided")}</p><p><strong>Facility:</strong> ${escapeHtml(order.facility_name || "Not provided")}<br>${escapeHtml(order.address || "")}</p><p><strong>Contact:</strong> ${escapeHtml(order.contact_name || "Not provided")} · ${escapeHtml(order.contact_number || "Not provided")}<br><strong>Submitted by:</strong> ${escapeHtml(order.submitted_by || "Not provided")}</p><p><strong>Vehicle:</strong> ${escapeHtml(vehicle)}${order.vehicle_color ? ` · ${escapeHtml(order.vehicle_color)}` : ""}${order.license_plate ? ` · Plate ${escapeHtml(order.license_plate)}` : ""}</p><p><strong>Job number:</strong> ${escapeHtml(order.job_number || "Not provided")}<br><strong>MO number:</strong> ${escapeHtml(order.mo_number || "Not provided")}</p><p><strong>Tires:</strong> ${escapeHtml(order.qty || "Not provided")} × ${escapeHtml(order.tire_size || "Not provided")}<br><strong>Tire model:</strong> ${escapeHtml(order.tire_model || "Not provided")}<br><strong>Position:</strong> ${escapeHtml(order.tire_position || "Not provided")}<br><strong>Part number:</strong> ${escapeHtml(order.tire_product_number || "Not provided")}<br><strong>Goodyear order:</strong> ${order.goodyear_order ? "Yes" : "No"}</p>${order.notes ? `<p><strong>Notes:</strong><br>${escapeHtml(order.notes).replace(/\n/g, "<br>")}</p>` : ""}<p style="margin-top:24px"><a href="https://app.bolttire.com/orders" style="background:${accent};color:#fff;padding:12px 18px;border-radius:7px;text-decoration:none;font-weight:700">Open Orders</a></p></div>`,
    }),
  });
  const result = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(result.message || `Resend returned ${response.status}`);
}
