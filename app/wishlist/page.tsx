"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductCard, type ProductSummary } from "@/components/product-card";

export default function WishlistPage() {
  const [items, setItems] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  useEffect(() => {
    fetch("/api/wishlist").then((response) => {
      if (response.status === 401) { router.replace(`/login?next=${encodeURIComponent("/wishlist")}`); return null; }
      return response.json();
    }).then((data: { items: ProductSummary[] } | null) => { if (data) setItems(data.items); }).finally(() => setLoading(false));
  }, [router]);
  return <section className="container-page py-14"><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Saved for later</p><h1 className="mt-3 font-serif text-4xl">Your wishlist</h1>
    {loading ? <div className="mt-8 h-64 animate-pulse rounded-2xl bg-sand" />     : items.length ? <div className="mt-9 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{items.map((product) => <ProductCard key={product.id} product={product} initialWishlisted onWishlistChanged={(wishlisted) => { if (!wishlisted) setItems((current) => current.filter((item) => item.id !== product.id)); }} />)}</div>
      : <div className="mt-8 rounded-2xl bg-white py-16 text-center"><p className="font-serif text-2xl">Your saved shelf is waiting</p><Link className="mt-5 inline-block text-sm text-sage-dark underline" href="/shop">Find a new favourite</Link></div>}
  </section>;
}
