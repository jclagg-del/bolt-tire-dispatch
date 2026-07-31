export default function PrivacyPage() {
  return <main style={page}><h1>Privacy Policy</h1><p>Effective July 31, 2026</p>
    <h2>Information we use</h2><p>Bolt Tire Dispatch uses customer contact details, service addresses, vehicle and job information, invoice details, and payment status to schedule tire service, create invoices, and manage business records.</p>
    <h2>QuickBooks Online</h2><p>When authorized, the app reads and writes the QuickBooks customer, product/service, invoice, tax, and payment information needed to provide its billing features. It does not sell QuickBooks data or use it for advertising.</p>
    <h2>Storage and security</h2><p>Application data is stored using Supabase. The app is hosted by Vercel. QuickBooks access credentials are stored in a server-only database table protected from browser access. Access is limited to authorized Bolt Tire personnel.</p>
    <h2>Retention and deletion</h2><p>Business and accounting records are retained as needed for operations, legal obligations, and financial reporting. QuickBooks access can be revoked from the Billing page. To request access, correction, or deletion of eligible personal information, contact us.</p>
    <h2>Contact</h2><p><a href="mailto:office@bolttire.com">office@bolttire.com</a></p>
  </main>;
}

const page: React.CSSProperties = { maxWidth: 760, margin: "40px auto", padding: 24, background: "white", borderRadius: 16, lineHeight: 1.6, color: "#1f2937" };
