"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, House, LayoutDashboard, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useToast } from "@/components/toast-provider";

type User = { name: string; role: "user" | "admin" } | null;

export function SiteHeader() {
  const [user, setUser] = useState<User>(null);
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const isAdminPage = pathname.startsWith("/admin");
  useEffect(() => {
    fetch("/api/auth/me").then((response) => response.json()).then((data: { user: User }) => setUser(data.user)).catch(() => undefined);
  }, [pathname]);
  useEffect(() => {
    if (!user) { setCartCount(0); return; }
    fetch("/api/cart").then((response) => response.ok ? response.json() : null)
      .then((data: { items: { quantity: number }[] } | null) => setCartCount(data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0))
      .catch(() => undefined);
  }, [user, pathname]);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    toast("You have signed out.");
    router.push("/");
  }
  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/shop?q=${encodeURIComponent(query)}`);
  }
  const nav = <nav aria-label="Main navigation" className="flex items-center gap-7 text-sm text-ink/75">
    <Link href="/shop">Shop all</Link><Link href="/shop?category=skin-care">Skin care</Link>
    <Link href="/shop?category=hair-care">Hair care</Link><Link href="/shop?category=body-care">Body care</Link>
    <Link href="/shop?category=health-care">Wellness</Link>
  </nav>;
  return <header className="sticky top-0 z-40 border-b border-ink/5 bg-cream/95 backdrop-blur">
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 lg:px-8">
      <button className="lg:hidden" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      <Link href="/" className="font-serif text-2xl font-semibold tracking-tight text-sage-dark">jamson<span className="text-rose">.</span></Link>
      <div className="hidden lg:block">{nav}</div>
      <div className="flex items-center gap-3">
        <form onSubmit={search} className="hidden items-center rounded-full border border-ink/10 bg-white px-3 py-2 xl:flex">
          <Search size={16} className="text-ink/50" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search products" placeholder="Search products" className="w-36 bg-transparent pl-2 text-sm outline-none" />
        </form>
        <Link aria-label="Wishlist" href={user ? "/wishlist" : `/login?next=${encodeURIComponent("/wishlist")}`} className="rounded-full p-2 hover:bg-sand"><Heart size={19} /></Link>
        <Link aria-label="Shopping bag" href={user ? "/cart" : `/login?next=${encodeURIComponent("/cart")}`} className="relative rounded-full p-2 hover:bg-sand"><ShoppingBag size={19} />
          {cartCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sage px-1 text-[10px] text-white">{cartCount}</span>}
        </Link>
        {user?.role === "admin" && <Link
          href={isAdminPage ? "/" : "/admin"}
          aria-label={isAdminPage ? "Go to storefront" : "Go to admin dashboard"}
          title={isAdminPage ? "Go to storefront" : "Go to admin dashboard"}
          className="flex items-center gap-1.5 rounded-full bg-sage px-3 py-2 text-sm text-white hover:bg-sage-dark"
        >
          {isAdminPage ? <House size={17} /> : <LayoutDashboard size={17} />}
          <span className="hidden sm:inline">{isAdminPage ? "Storefront" : "Admin dashboard"}</span>
        </Link>}
        <div className="group relative">
          <button aria-label="Account menu" className="rounded-full p-2 hover:bg-sand"><UserRound size={19} /></button>
          <div className="invisible absolute right-0 top-full w-48 rounded-xl border border-ink/10 bg-white p-2 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
            {user ? <><Link className="dropdown-link" href="/account">My account</Link><Link className="dropdown-link" href="/orders">My orders</Link>{user.role === "admin" && <Link className="dropdown-link" href={isAdminPage ? "/" : "/admin"}>{isAdminPage ? "Go to storefront" : "Admin dashboard"}</Link>}<button onClick={logout} className="dropdown-link w-full text-left">Sign out</button></>
              : <><Link className="dropdown-link" href="/login">Sign in</Link><Link className="dropdown-link" href="/signup">Create account</Link></>}
          </div>
        </div>
      </div>
    </div>
    {menuOpen && <div className="border-t border-ink/10 px-6 py-5 lg:hidden">{nav}</div>}
  </header>;
}
