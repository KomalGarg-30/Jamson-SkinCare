"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, LayoutDashboard, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useToast } from "@/components/toast-provider";

type User = { name: string; role: "user" | "admin" } | null;
const nav = [["Shop all", "/shop"], ["Skin Care", "/shop?category=skin-care"], ["Hair Care", "/shop?category=hair-care"], ["Body Care", "/shop?category=body-care"], ["Health Care", "/shop?category=health-care"]];

export function SiteHeader() {
  const [user, setUser] = useState<User>(null); const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; slug: string; image: string | null }[]>([]);
  const pathname = usePathname(); const router = useRouter(); const toast = useToast();
  useEffect(() => { fetch("/api/auth/me").then((response) => response.json()).then((data: { user: User }) => setUser(data.user)).catch(() => undefined); }, [pathname]);
  useEffect(() => { if (!user) { setCartCount(0); return; } fetch("/api/cart").then((response) => response.ok ? response.json() : null).then((data: { items: { quantity: number }[] } | null) => setCartCount(data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0)).catch(() => undefined); }, [user, pathname]);
  useEffect(() => {
    if (!searchOpen || query.trim().length < 2) { setSuggestions([]); return; }
    const timer = window.setTimeout(() => { fetch(`/api/products?q=${encodeURIComponent(query.trim())}&limit=5`).then((response) => response.ok ? response.json() : null).then((data: { products?: typeof suggestions } | null) => setSuggestions(data?.products || [])).catch(() => setSuggestions([])); }, 250);
    return () => window.clearTimeout(timer);
  }, [query, searchOpen]);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); toast("You have signed out."); router.push("/"); }
  function submitSearch(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (query.trim()) router.push(`/shop?q=${encodeURIComponent(query.trim())}`); setSearchOpen(false); setMenuOpen(false); }
  const accountHref = user ? "/account" : `/login?next=${encodeURIComponent(pathname || "/")}`;
  return <header className="sticky top-0 z-40 border-b border-ink/10 bg-cream/95 backdrop-blur">
    <div className="container-page flex min-h-16 items-center justify-between gap-4 py-3">
      <button className="flex min-h-11 min-w-11 items-center justify-center lg:hidden" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      <Link href="/" className="font-serif text-2xl tracking-tight text-ink">decotrin<span className="text-sage">.</span></Link>
      <nav aria-label="Main navigation" className="hidden items-center gap-6 text-sm text-ink/75 lg:flex">{nav.map(([label, href]) => <Link key={href} href={href} className="hover:text-sage-dark">{label}</Link>)}</nav>
      <div className="flex items-center gap-1">
        <button aria-label="Search products" onClick={() => setSearchOpen(!searchOpen)} className="flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-sand"><Search size={19} /></button>
        <Link aria-label="Wishlist" href={user ? "/wishlist" : `/login?next=${encodeURIComponent("/wishlist")}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-sand"><Heart size={19} /></Link>
        <Link aria-label="Shopping bag" href={user ? "/cart" : `/login?next=${encodeURIComponent("/cart")}`} className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-sand"><ShoppingBag size={19} />{cartCount > 0 && <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-sage px-1 text-[10px] text-white">{cartCount}</span>}</Link>
        <div className="group relative hidden sm:block"><button aria-label="Account menu" className="flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-sand"><UserRound size={19} /></button><div className="invisible absolute right-0 top-full w-48 rounded-xl border border-ink/10 bg-white p-2 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">{user ? <><Link className="dropdown-link" href={accountHref}>My account</Link><Link className="dropdown-link" href="/orders">My orders</Link>{user.role === "admin" && <Link className="dropdown-link" href="/admin"><LayoutDashboard size={14} className="mr-2 inline" />Admin</Link>}<button onClick={logout} className="dropdown-link w-full text-left">Logout</button></> : <><Link className="dropdown-link" href="/login">Sign in</Link><Link className="dropdown-link" href="/signup">Create account</Link></>}</div></div>
      </div>
    </div>
    {searchOpen && <div className="border-t border-ink/10 bg-white py-3"><div className="container-page relative"><form onSubmit={submitSearch} className="flex items-center gap-3"><Search size={18} className="text-ink/50" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" aria-label="Search products" className="min-h-11 flex-1 bg-transparent outline-none" /><button type="button" onClick={() => setSearchOpen(false)} className="text-sm text-ink/55">Close</button></form>{suggestions.length > 0 && <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-ink/10 bg-white p-2 shadow-lg">{suggestions.map((item) => <Link key={item.id} href={`/products/${item.slug}`} onClick={() => setSearchOpen(false)} className="flex items-center gap-3 rounded-lg p-2 hover:bg-sand"><img src={item.image || "/images/skin-care.svg"} alt="" width={40} height={40} className="h-10 w-10 rounded object-cover" /><span className="text-sm">{item.name}</span></Link>)}</div>}</div></div>}
    {menuOpen && <div className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto border-t border-ink/10 bg-cream px-6 py-6 lg:hidden"><form onSubmit={submitSearch} className="mb-8 flex items-center gap-3 rounded-xl bg-white px-4"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" aria-label="Search products" className="min-h-12 flex-1 bg-transparent outline-none" /></form><nav className="grid gap-1 text-lg">{nav.map(([label, href]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className="border-b border-ink/10 py-4">{label}</Link>)}</nav><div className="mt-8 grid gap-3">{user ? <><Link href="/account" onClick={() => setMenuOpen(false)} className="button-secondary">Account</Link><Link href="/orders" onClick={() => setMenuOpen(false)} className="button-secondary">My Orders</Link><button onClick={logout} className="button-secondary text-left">Logout</button></> : <><Link href="/login" className="button-primary">Sign in</Link><Link href="/signup" className="button-secondary">Create account</Link></>}</div></div>}
  </header>;
}
