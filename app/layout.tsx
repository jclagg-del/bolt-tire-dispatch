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
      </body>
    </html>
  );
}

const body: React.CSSProperties = {
  margin: 0,
  fontFamily: "system-ui",
  background: "#f3f4f6",
};

const container: React.CSSProperties = {
  paddingBottom: 0, // removed space for nav
};