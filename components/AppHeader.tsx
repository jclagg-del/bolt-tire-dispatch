"use client";

import { usePathname, useRouter } from "next/navigation";

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", path: "/" },
    { label: "Schedule", path: "/schedule" },
    { label: "Route", path: "/route" },
    { label: "Jobs", path: "/jobs" },
    { label: "Customers", path: "/customers" },
    { label: "Billing", path: "/billing" },
    { label: "Completed", path: "/completed" },
  ];

  return (
    <div style={wrap}>
      <div style={inner}>
        <div onClick={() => router.push("/")} style={logoWrap}>
          <img src="/bolt-logo.png" alt="Bolt Tire" style={logo} />
        </div>

        <div style={nav}>
          {navItems.map((item) => {
            const active = pathname === item.path;

            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                style={{
                  ...navBtn,
                  ...(active ? navBtnActive : {}),
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  background: "white",
  borderBottom: "1px solid #e5e7eb",
};

const inner: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "10px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const logoWrap: React.CSSProperties = {
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
};

const logo: React.CSSProperties = {
  height: 40,
};

const nav: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const navBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: "#e5e7eb",
  cursor: "pointer",
  fontWeight: 600,
};

const navBtnActive: React.CSSProperties = {
  background: "#111827",
  color: "white",
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
};