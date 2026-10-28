import type { Metadata } from "next";

// Static branding only: preview crawlers never need customer details or a DB read.
export const metadata: Metadata = {
  metadataBase: new URL("https://app.bolttire.com"),
  title: "Your tire quote | Bolt Tire",
  description: "Your tire quote is ready. Review your options securely with Bolt Tire.",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Bolt Tire",
    title: "Your tire quote is ready",
    description: "Review your tire options securely with Bolt Tire.",
    images: [{ url: "/quote-preview", width: 1200, height: 630, alt: "Bolt Tire" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your tire quote is ready",
    description: "Review your tire options securely with Bolt Tire.",
    images: ["/quote-preview"],
  },
};

export default function QuoteLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
