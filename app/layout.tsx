import type { Metadata } from "next";
import Link from "next/link";
import "@/app/globals.css";
import { SiteHeader } from "@/components/site-header";
import { ToastProvider } from "@/components/toast-provider";

export const metadata: Metadata = {
  title: { default: "Jamson Wellness | Thoughtful care, every day", template: "%s | Jamson Wellness" },
  description: "Shop thoughtfully chosen skincare, haircare, bodycare and everyday wellness essentials.",
  openGraph: { title: "Jamson Wellness", description: "Thoughtful care, every day.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const storeName = process.env.STORE_NAME || "Jamson Wellness";
  return <html lang="en"><body>
    <ToastProvider><SiteHeader /><main>{children}</main>
      <footer className="mt-24 bg-ink px-6 py-14 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-3">
          <div><Link href="/" className="font-serif text-3xl">{storeName}<span className="text-rose">.</span></Link><p className="mt-4 max-w-sm text-sm leading-6 text-white/65">Thoughtful essentials for the little rituals that make you feel good.</p></div>
          <div><h3 className="font-medium">Explore</h3><div className="mt-4 grid gap-2 text-sm text-white/65"><Link href="/shop">Shop all</Link><Link href="/shop?category=skin-care">Skin care</Link><Link href="/shop?category=hair-care">Hair care</Link></div></div>
          <div><h3 className="font-medium">We’re here to help</h3><p className="mt-4 text-sm leading-6 text-white/65">Questions about an order or product? Write to our care team and we’ll be happy to help.</p></div>
        </div>
        <div className="mx-auto mt-12 max-w-7xl border-t border-white/15 pt-5 text-xs text-white/50">© {new Date().getFullYear()} {storeName}. All rights reserved.</div>
      </footer>
    </ToastProvider>
  </body></html>;
}
