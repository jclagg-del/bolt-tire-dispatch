"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackingPage, trackingLocation } from "@/lib/purchase-tracking";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    boltGoogleInitialized?: boolean;
  }
}

// Existing Bolt Tire property verified through the company's administrator account.
export const googleAnalyticsId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID ?? "G-4G9QWB81EZ";
export const googleTrackingEnabled = /^G-[A-Z0-9]+$/.test(googleAnalyticsId);

export default function PublicGoogleAnalytics() {
  const pathname = usePathname();
  const page = trackingPage(pathname);
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    if (!googleTrackingEnabled || !page || window.location.hostname !== "app.bolttire.com") return;
    window.dataLayer ||= [];
    window.gtag ||= function () { window.dataLayer!.push(arguments); };
    if (!window.boltGoogleInitialized) {
      window.gtag("js", new Date());
      window.boltGoogleInitialized = true;
    }
    const location = trackingLocation(pathname, window.location.search)!;
    // Never expose the quote token, search parameters, or private referring URL.
    window.gtag("set", { page_location: location, page_referrer: "", page_title: "Bolt Tire Shop" });
    window.gtag("config", googleAnalyticsId, {
      send_page_view: false, page_location: location, page_referrer: "",
      page_title: "Bolt Tire Shop", allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    if (lastPage.current !== page) {
      window.gtag("event", "page_view", { send_to: googleAnalyticsId, page_location: location, page_referrer: "", page_title: "Bolt Tire Shop" });
      lastPage.current = page;
    }
  }, [page]);
  // No tag on staff, login, or other public partner pages. Local QA cannot send production events.
  if (!googleTrackingEnabled || !page || typeof window === "undefined" || window.location.hostname !== "app.bolttire.com") return null;
  return <Script id="bolt-google-analytics" src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`} strategy="afterInteractive" />;
}
