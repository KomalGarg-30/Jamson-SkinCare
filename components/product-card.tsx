"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { formatPrice } from "@/lib/utils";

export type ProductSummary = {
  id: string; name: string; slug: string; description?: string; price: number;
  discountPrice: number | null; image: string | null; rating?: number; reviewCount?: number; stock?: number;
};

export function ProductCard({ product, initialWishlisted = false, onWishlistChanged }: {
  product: ProductSummary; initialWishlisted?: boolean; onWishlistChanged?: (wishlisted: boolean) => void;
}) {
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  useEffect(() => setWishlisted(initialWishlisted), [initialWishlisted]);
  async function addToCart() {
    const response = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.id, quantity: 1 }) });
    if (response.status === 401) { router.push(`/login?next=${encodeURIComponent(`/products/${product.slug}`)}`); return; }
    const data = await response.json();
    toast(response.ok ? "Added to your bag." : data.error, response.ok ? "success" : "error");
  }
  async function toggleWishlist() {
    if (wishlistBusy) return;
    setWishlistBusy(true);
    try {
      const response = await fetch("/api/wishlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.id }) });
      if (response.status === 401) { router.push(`/login?next=${encodeURIComponent(`/products/${product.slug}`)}`); return; }
      const data: { wishlisted: boolean; error?: string } = await response.json();
      toast(response.ok ? (data.wishlisted ? "Saved to your wishlist." : "Removed from your wishlist.") : data.error || "Could not update your wishlist.", response.ok ? "success" : "error");
      if (response.ok) {
        setWishlisted(data.wishlisted);
        onWishlistChanged?.(data.wishlisted);
      }
    } finally {
      setWishlistBusy(false);
    }
  }
  return <article className="group">
    <div className="relative overflow-hidden rounded-2xl bg-sand">
      <Link href={`/products/${product.slug}`} className="block aspect-[4/5]">
        <img src={product.image || "/images/product-default.svg"} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      </Link>
      {product.discountPrice && <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-medium text-sage-dark">Bestseller</span>}
      <button onClick={toggleWishlist} disabled={wishlistBusy} aria-label={wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} aria-pressed={wishlisted} className={`absolute right-3 top-3 rounded-full bg-white/90 p-2.5 transition hover:text-rose disabled:opacity-60 ${wishlisted ? "text-ink" : "text-ink/65"}`}><Heart size={17} className={wishlisted ? "fill-current" : ""} /></button>
      <button onClick={addToCart} disabled={product.stock === 0} className="absolute bottom-3 left-3 right-3 flex translate-y-2 items-center justify-center gap-2 rounded-full bg-white/95 py-3 text-sm font-medium opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 disabled:opacity-50">
        <ShoppingBag size={16} /> {product.stock === 0 ? "Out of stock" : "Add to bag"}
      </button>
    </div>
    <div className="flex items-start justify-between gap-3 pt-4">
      <div><Link href={`/products/${product.slug}`} className="font-medium hover:text-sage-dark">{product.name}</Link>
        {product.rating ? <p className="mt-1 flex items-center gap-1 text-xs text-ink/60"><Star size={13} className="fill-amber-400 text-amber-400" />{(product.rating / 100).toFixed(1)} ({product.reviewCount ?? 0})</p> : null}
      </div>
      <div className="text-right text-sm">{product.discountPrice ? <><p className="font-medium">{formatPrice(product.discountPrice)}</p><p className="text-xs text-ink/45 line-through">{formatPrice(product.price)}</p></> : <p className="font-medium">{formatPrice(product.price)}</p>}</div>
    </div>
  </article>;
}
