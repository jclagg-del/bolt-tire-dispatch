"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const PUBLIC_ROUTES = [
  "/login",
  "/order/kingdom",
  "/kingdom-schedule",
];

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