"use client";

import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", path: "/" },
    { label: "Schedule", path: "/schedule" },
    { label: "Route", path: "/route" },
    { label: "Jobs", path: "/jobs" },
    { label: "Tasks", path: "/tasks" },
    { label: "Quotes", path: "/quotes" },
    { label: "Tire Shop", path: "/tire-shop" },
    { label: "Supplier Orders", path: "/supplier-orders" },
    { label: "Tire Receiving", path: "/tire-receiving" },
    { label: "Orders", path: "/orders" },
    { label: "Customers", path: "/customers" },
    { label: "Billing", path: "/billing" },
    { label: "Completed", path: "/completed" },
    { label: "Settings", path: "/settings" },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const currentPath =
    navItems.find(
      (item) =>
        pathname === item.path ||
        (item.path !== "/" && pathname.startsWith(`${item.path}/`)),
    )?.path ?? "/";

  return (
    <div style={wrap}>
      <div style={inner}>
        <div
          onClick={() => router.push("/")}
          style={logoWrap}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              router.push("/");
            }
          }}
        >
          <img
            src="/bolt-logo.png"
            alt="Bolt Tire"
            style={logo}
          />
        </div>

        <div style={rightSide}>
          <label style={menuLabel}>
            <span style={menuLabelText}>Navigate</span>
            <select
              aria-label="Navigate to another page"
              value={currentPath}
              onChange={(event) => router.push(event.target.value)}
              style={menuSelect}
            >
              {navItems.map((item) => (
                <option key={item.path} value={item.path}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleLogout}
            style={logoutBtn}
          >
            Logout
          </button>
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
  maxWidth: 1200,
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

const rightSide: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const menuLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const menuLabelText: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const menuSelect: React.CSSProperties = {
  minWidth: 190,
  padding: "9px 38px 9px 12px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  color: "#111827",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 700,
};

const logoutBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
};
