export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={body}>
        <div style={container}>
          {children}
        </div>

        {/* 🔥 MOBILE NAV BAR */}
        <div style={nav}>
          <a href="/" style={navItem}>🏠</a>
          <a href="/schedule" style={navItem}>📅</a>
          <a href="/route" style={navItem}>🚚</a>
          <a href="/jobs" style={navItem}>📋</a>
        </div>
      </body>
    </html>
  );
}

const body = {
  margin: 0,
  fontFamily: "system-ui",
  background: "#f3f4f6",
};

const container = {
  paddingBottom: 70, // space for nav
};

const nav = {
  position: "fixed" as const,
  bottom: 0,
  left: 0,
  right: 0,
  height: 60,
  background: "white",
  borderTop: "1px solid #ddd",
  display: "flex",
  justifyContent: "space-around",
  alignItems: "center",
};

const navItem = {
  fontSize: 22,
  textDecoration: "none",
};