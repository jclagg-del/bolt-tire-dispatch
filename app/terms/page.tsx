export default function TermsPage() {
  return <main style={page}><h1>Terms of Use</h1><p>Effective July 31, 2026</p>
    <p>Bolt Tire Dispatch is an internal business application used to schedule tire services, maintain job records, and create and synchronize QuickBooks Online invoices.</p>
    <h2>Authorized use</h2><p>Only authorized Bolt Tire personnel may use the private portions of the application. Users are responsible for safeguarding their login credentials and reviewing job, tax, invoice, and payment information for accuracy.</p>
    <h2>QuickBooks connection</h2><p>QuickBooks access is optional and may be disconnected at any time. Users must review invoices before sending them to customers and remain responsible for accounting, tax, and recordkeeping decisions.</p>
    <h2>Availability</h2><p>The application is provided for business use without a guarantee of uninterrupted availability. Features may change as operational needs evolve.</p>
    <h2>Contact</h2><p><a href="mailto:office@bolttire.com">office@bolttire.com</a></p>
  </main>;
}

const page: React.CSSProperties = { maxWidth: 760, margin: "40px auto", padding: 24, background: "white", borderRadius: 16, lineHeight: 1.6, color: "#1f2937" };
