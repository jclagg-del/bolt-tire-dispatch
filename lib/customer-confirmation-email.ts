type ConfirmationEmail = {
  amount: string;
  orderNumber: string;
  details: string[][];
  tires: string[];
  extras: string[];
  next: string;
};

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Email-safe tables and inline styles keep the essentials usable even when a
// mail client blocks images or ignores the optional small-screen styles.
export function renderCustomerConfirmationEmail({ amount, orderNumber, details, tires, extras, next }: ConfirmationEmail) {
  const h = escapeHtml;
  const appointment = details.find(([key]) => key === "Requested appointment")?.[1] || "We will contact you to arrange the next steps.";
  const contact = details.filter(([key]) => ["Customer", "Vehicle", "Service address"].includes(key));
  const quote = details.find(([key]) => key === "Quote reference")?.[1] || "";
  const contactUrl = `mailto:sales@bolttire.com?subject=${encodeURIComponent(`Order ${orderNumber}`)}`;
  const itemRows = (items: string[]) => items.map(item => `<tr><td style="padding:15px 18px;border-bottom:1px solid #e2e8f0;font-size:15px;line-height:23px;color:#172033;word-break:break-word;">${h(item)}</td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Bolt Tire order confirmation</title>
<style>@media only screen and (max-width:480px){.email-pad{padding-left:22px!important;padding-right:22px!important}.email-title{font-size:32px!important}.email-total{font-size:30px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#eef1f5;color:#172033;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;color:#eef1f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Order ${h(orderNumber)} · ${h(amount)} paid. Thank you for choosing Bolt Tire.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f5;"><tr><td align="center" style="padding:24px 8px;">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
  <tr><td class="email-pad" style="padding:28px 34px 24px;background-color:#ffffff;"><img src="https://app.bolttire.com/bolt-logo.png" width="244" alt="Bolt Tire" style="display:block;width:244px;max-width:100%;height:auto;border:0;"><p style="margin:17px 0 0;font-size:10px;line-height:15px;font-weight:bold;letter-spacing:2px;color:#64748b;">ORDER CONFIRMATION</p></td></tr>
  <tr><td height="5" style="height:5px;background-color:#f4d20b;font-size:1px;line-height:1px;">&nbsp;</td></tr>
  <tr><td class="email-pad" style="padding:30px 34px 32px;background-color:#111827;color:#ffffff;">
    <span style="display:inline-block;padding:6px 10px;background-color:#f4d20b;color:#111827;font-size:11px;font-weight:bold;letter-spacing:1px;border-radius:4px;">PAYMENT RECEIVED</span>
    <h1 class="email-title" style="margin:18px 0 10px;font-size:38px;line-height:1.1;letter-spacing:-1px;color:#ffffff;">Order received.</h1>
    <p style="margin:0 0 25px;font-size:16px;line-height:24px;color:#cbd5e1;">Thank you for choosing Bolt Tire.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #364152;"><tr>
      <td width="54%" valign="top" style="padding-top:20px;"><p style="margin:0 0 7px;font-size:10px;letter-spacing:1.4px;color:#cbd5e1;">AMOUNT PAID</p><p class="email-total" style="margin:0;font-size:36px;font-weight:bold;line-height:42px;color:#ffffff;">${h(amount)}</p></td>
      <td width="46%" valign="top" align="right" style="padding-top:20px;"><p style="margin:0 0 9px;font-size:10px;letter-spacing:1.4px;color:#cbd5e1;">ORDER NUMBER</p><p style="margin:0;font-size:23px;font-weight:bold;line-height:30px;color:#f4d20b;">${h(orderNumber)}</p><p style="margin:3px 0 0;font-size:11px;color:#cbd5e1;">Quote ${h(quote)}</p></td>
    </tr></table>
  </td></tr>
  <tr><td class="email-pad" style="padding:28px 34px 0;">
    <h2 style="margin:0 0 12px;font-size:19px;color:#111827;">Your tires</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f9fc;border:1px solid #e2e8f0;border-radius:8px;">${itemRows(tires)}</table>
    ${extras.length ? `<h2 style="margin:24px 0 12px;font-size:19px;color:#111827;">Additional items &amp; services</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f9fc;border:1px solid #e2e8f0;border-radius:8px;">${itemRows(extras)}</table>` : ""}
  </td></tr>
  <tr><td class="email-pad" style="padding:25px 34px 0;"><h2 style="margin:0 0 14px;font-size:19px;color:#111827;">Your details</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${contact.map(([key,value]) => `<tr><td style="padding:0 0 15px;"><p style="margin:0 0 4px;font-size:10px;line-height:15px;text-transform:uppercase;letter-spacing:1px;font-weight:bold;color:#64748b;">${h(key)}</p><p style="margin:0;font-size:15px;line-height:22px;word-break:break-word;color:#172033;">${h(value)}</p></td></tr>`).join("")}</table>
  </td></tr>
  <tr><td class="email-pad" style="padding:8px 34px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fffbea;border-left:4px solid #f4d20b;"><tr><td style="padding:17px 18px;"><h2 style="margin:0 0 7px;font-size:16px;color:#111827;">What happens next?</h2><p style="margin:0;font-size:14px;line-height:22px;color:#374151;"><strong>Requested appointment:</strong><br>${h(appointment)}</p></td></tr></table></td></tr>
  <tr><td class="email-pad" style="padding:22px 34px 28px;"><p style="margin:0 0 20px;font-size:13px;line-height:21px;color:#64748b;">${h(next)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#f4d20b;border-radius:7px;"><a href="${h(contactUrl)}" style="display:inline-block;padding:14px 21px;border:1px solid #f4d20b;border-radius:7px;font-size:14px;font-weight:bold;color:#111827;text-decoration:none;">Questions? Contact Bolt Tire &rarr;</a></td></tr></table>
  </td></tr>
  <tr><td class="email-pad" style="padding:20px 34px;background-color:#f7f9fc;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;line-height:20px;color:#64748b;">Keep this email for your records. Please include <strong style="color:#172033;">${h(orderNumber)}</strong> when contacting us.<br><a href="mailto:sales@bolttire.com" style="color:#172033;text-decoration:underline;">sales@bolttire.com</a></p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}
