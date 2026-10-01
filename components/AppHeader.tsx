"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./AppHeader.module.css";

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const navigation = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const panelId = useId();

  useEffect(() => { setNavigationOpen(false); }, [pathname]);

  useEffect(() => {
    const menu = navigation.current;
    if (!menu || !navigationOpen) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menu.contains(event.target)) setNavigationOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setNavigationOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    // Safari can blur the trigger with a null relatedTarget before a link click.
    // Only a known outside focus target should dismiss the panel.
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [navigationOpen]);

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
          <div style={menuLabel}>
            <span style={menuLabelText}>Navigate</span>
            <div ref={navigation} className={styles.navigation}>
              <button ref={trigger} type="button" className={styles.trigger} aria-expanded={navigationOpen} aria-controls={panelId}
                onClick={() => setNavigationOpen(open => !open)}
                aria-label={`Navigate to another page. Current page: ${navItems.find(item => item.path === currentPath)?.label}`}>
                <span>{navItems.find(item => item.path === currentPath)?.label}</span>
                <span className={styles.chevron} aria-hidden="true">▾</span>
              </button>
              <nav id={panelId} hidden={!navigationOpen} className={styles.panel} aria-label="Main navigation">
                {navItems.map(item => <Link key={item.path} href={item.path} className={styles.link}
                  aria-current={currentPath === item.path ? "page" : undefined}
                  onClick={() => setNavigationOpen(false)}>
                  <span>{item.label}</span>{currentPath === item.path && <span aria-hidden="true">✓</span>}
                </Link>)}
              </nav>
            </div>
          </div>

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

const logoutBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
};
