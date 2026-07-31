export default function QuickBooksDisconnectedPage() {
  return <main style={page}><h1>QuickBooks disconnected</h1><p>Bolt Tire Dispatch no longer has access to the QuickBooks company. An authorized user can reconnect from the Billing page.</p><p>Questions? <a href="mailto:office@bolttire.com">office@bolttire.com</a></p></main>;
}

const page: React.CSSProperties = { maxWidth: 620, margin: "80px auto", padding: 28, background: "white", borderRadius: 16, lineHeight: 1.6, color: "#1f2937" };
