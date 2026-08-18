"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const PUBLIC_ROUTES = [
  "/login",
  "/order/kingdom",
  "/kingdom-schedule",
  "/kingdom-orders",
  "/privacy",
  "/terms",
  "/quickbooks/disconnected",
  "/change-password",
  "/q",
];

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

export default function AuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) =>
      pathname === route || pathname.startsWith(`${route}/`)
  );

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      if (isPublicRoute) {
        if (mounted) {
          setChecking(false);
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        router.replace("/login");
        setChecking(false);
        return;
      }

      const { data: security } = await supabase.from("staff_security").select("password_change_required").eq("user_id", session.user.id).maybeSingle();
      if (security?.password_change_required && pathname !== "/change-password") {
        router.replace("/change-password"); setChecking(false); return;
      }

      setChecking(false);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isPublicRoute) {
        return;
      }

      if (!session) {
        router.replace("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isPublicRoute, pathname, router]);

  useEffect(() => {
    if (isPublicRoute) return;
    let timeout: ReturnType<typeof setTimeout>;

    const lockSession = async () => {
      await supabase.auth.signOut({ scope: "local" });
      router.replace("/login?locked=1");
    };
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(lockSession, IDLE_TIMEOUT_MS);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      clearTimeout(timeout);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isPublicRoute, router]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 18,
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          Checking login...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
