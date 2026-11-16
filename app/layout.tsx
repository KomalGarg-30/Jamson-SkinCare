import type { Metadata } from "next";
import "@/app/globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ToastProvider } from "@/components/toast-provider";

export const metadata: Metadata = {
  title: { default: "Decotrin | Thoughtful care, every day", template: "%s | Decotrin" },
  description: "Thoughtfully chosen skincare, haircare, body care and wellness essentials for everyday rituals.",
  openGraph: { title: "Decotrin", description: "Thoughtful care, every day.", type: "website", images: ["/images/skin-care.svg"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ToastProvider><SiteHeader /><main>{children}</main><SiteFooter /></ToastProvider><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "Organization", name: "Decotrin", url: process.env.NEXT_PUBLIC_APP_URL || "https://decotrin.com" }, { "@type": "WebSite", name: "Decotrin", url: process.env.NEXT_PUBLIC_APP_URL || "https://decotrin.com", potentialAction: { "@type": "SearchAction", target: `${process.env.NEXT_PUBLIC_APP_URL || "https://decotrin.com"}/shop?q={search_term_string}`, "query-input": "required name=search_term_string" } }] }) }} /></body></html>;
}
