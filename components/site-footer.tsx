import Link from "next/link";
import { inArray } from "drizzle-orm";
import { Instagram, Mail, MessageCircle } from "lucide-react";
import { settings } from "@/db/schema";
import { db } from "@/lib/db";

const shopLinks = [["Shop all", "/shop"], ["Skin Care", "/shop?category=skin-care"], ["Hair Care", "/shop?category=hair-care"], ["Body Care", "/shop?category=body-care"], ["Health Care", "/shop?category=health-care"]];
const helpLinks = [["Contact", "/contact"], ["Shipping Policy", "/shipping-policy"], ["Returns & Refunds", "/returns-policy"], ["FAQ", "/faq"], ["Track order", "/orders"]];

export async function SiteFooter() {
  const rows = await db.select().from(settings).where(inArray(settings.key, ["support_email", "support_phone", "business_address"]));
  const values = Object.fromEntries(rows.map((item) => [item.key, item.value]));
  const email = values.support_email || "support@decotrin.com";
  const phone = values.support_phone || "WhatsApp support available";
  const address = values.business_address || "India";
  return <footer className="mt-20 border-t border-ink/10 bg-sand">
    <div className="container-page grid gap-10 py-14 md:grid-cols-4">
      <div><Link href="/" className="font-serif text-3xl">decotrin<span className="text-sage">.</span></Link><p className="mt-4 max-w-xs text-sm leading-6 text-ink/65">Thoughtful essentials for the little rituals that make you feel good.</p><div className="mt-5 flex gap-2"><a className="flex h-11 w-11 items-center justify-center rounded-full bg-white" href={`mailto:${email}`} aria-label="Email us"><Mail size={17} /></a><a className="flex h-11 w-11 items-center justify-center rounded-full bg-white" href="#" aria-label="Instagram"><Instagram size={17} /></a><a className="flex h-11 w-11 items-center justify-center rounded-full bg-white" href="#" aria-label="WhatsApp"><MessageCircle size={17} /></a></div></div>
      <FooterColumn title="Shop" links={shopLinks} /><FooterColumn title="Help" links={helpLinks} />
      <div><h2 className="font-medium">Contact</h2><p className="mt-4 text-sm leading-7 text-ink/65">{email}<br />{phone}<br />{address}</p><div className="mt-6 flex flex-wrap gap-2 text-xs text-ink/55"><span className="rounded border border-ink/15 px-2 py-1">UPI</span><span className="rounded border border-ink/15 px-2 py-1">Cards</span><span className="rounded border border-ink/15 px-2 py-1">Netbanking</span><span className="rounded border border-ink/15 px-2 py-1">COD</span></div></div>
    </div>
    <div className="container-page flex flex-col gap-3 border-t border-ink/10 py-5 text-xs text-ink/55 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Decotrin</span><span><Link href="/privacy-policy">Privacy Policy</Link> · <Link href="/terms">Terms & Conditions</Link></span></div>
  </footer>;
}
function FooterColumn({ title, links }: { title: string; links: string[][] }) {
  return <div><h2 className="font-medium">{title}</h2><nav className="mt-4 grid gap-3 text-sm text-ink/65">{links.map(([label, href]) => <Link key={href} href={href} className="hover:text-sage-dark">{label}</Link>)}</nav></div>;
}
