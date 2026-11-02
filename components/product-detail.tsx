"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Minus, Plus, ShieldCheck, Star, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { formatPrice } from "@/lib/utils";

type Detail = {
  products: { id: string; name: string; description: string; ingredients: string | null; howToUse: string | null; price: number; discountPrice: number | null; stock: number; rating: number; reviewCount: number; brand: string };
  categories: { name: string; slug: string };
  images: { id: string; url: string; alt: string }[];
  reviews: { id: string; rating: number; title: string | null; body: string; customer: string; createdAt: string }[];
};

export function ProductDetail({ slug }: { slug: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [image, setImage] = useState("");
  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [eligibleOrders, setEligibleOrders] = useState<{ id: string; createdAt: string }[]>([]);
  const [reviewError, setReviewError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    fetch(`/api/products/${encodeURIComponent(slug)}`).then(async (response) => {
      if (!response.ok) throw new Error("We couldn't find that product.");
      return response.json();
    }).then(async (data: Detail) => {
      setDetail(data);
      setImage(data.images[0]?.url || "/images/product-default.svg");
      setWishlisted(false);
      void fetch("/api/wishlist").then(async (response) => {
        if (!response.ok) return;
        const wishlist: { items: { id: string }[] } = await response.json();
        setWishlisted(wishlist.items.some((item) => item.id === data.products.id));
      }).catch(() => toast("Your saved items couldn't be loaded.", "error"));
      const eligibility = await fetch(`/api/reviews?productId=${data.products.id}`);
      if (eligibility.ok) {
        const result: { orders: { id: string; createdAt: string }[] } = await eligibility.json();
        setEligibleOrders(result.orders);
      }
    })
      .catch(() => setDetail(null)).finally(() => setLoading(false));
  }, [slug, toast]);
  async function addToCart(buyNow: boolean) {
    if (!detail) return;
    const response = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: detail.products.id, quantity }) });
    if (response.status === 401) { router.push(`/login?next=${encodeURIComponent(`/products/${slug}`)}`); return; }
    const result = await response.json();
    if (!response.ok) { toast(result.error, "error"); return; }
    if (buyNow) router.push("/checkout");
    else toast("Added to your bag.");
  }
  async function wishlist() {
    if (!detail || wishlistBusy) return;
    setWishlistBusy(true);
    try {
      const response = await fetch("/api/wishlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: detail.products.id }) });
      if (response.status === 401) { router.push(`/login?next=${encodeURIComponent(`/products/${slug}`)}`); return; }
      const result: { wishlisted: boolean; error?: string } = await response.json();
      toast(response.ok ? (result.wishlisted ? "Saved to your wishlist." : "Removed from your wishlist.") : result.error || "Could not update your wishlist.", response.ok ? "success" : "error");
      if (response.ok) setWishlisted(result.wishlisted);
    } finally {
      setWishlistBusy(false);
    }
  }
  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const form = event.currentTarget;
    setReviewError("");
    setReviewBusy(true);
    const formData = new FormData(form);
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: detail.products.id,
        orderId: String(formData.get("orderId")),
        rating: Number(formData.get("rating")),
        title: String(formData.get("title") || ""),
        body: String(formData.get("body") || ""),
      }),
    });
    const result = await response.json();
    setReviewBusy(false);
    if (response.status === 401) { router.push(`/login?next=${encodeURIComponent(`/products/${slug}`)}`); return; }
    if (!response.ok) { setReviewError(result.error || "Your review could not be submitted."); return; }
    toast(result.message || "Review submitted.");
    setEligibleOrders((current) => current.filter((order) => order.id !== String(formData.get("orderId"))));
    form.reset();
  }
  if (loading) return <div className="container-page grid animate-pulse gap-10 py-14 md:grid-cols-2"><div className="aspect-square rounded-3xl bg-sand" /><div className="h-96 rounded-3xl bg-sand" /></div>;
  if (!detail) return <div className="container-page py-24 text-center"><h1 className="font-serif text-3xl">We couldn&apos;t find that product</h1><a className="mt-5 inline-block text-sage-dark underline" href="/shop">Browse the collection</a></div>;
  const product = detail.products;
  return <div className="container-page py-10 md:py-16">
    <div className="grid gap-10 md:grid-cols-2 md:gap-16">
      <div><div className="overflow-hidden rounded-[2rem] bg-sand"><img src={image} alt={product.name} className="aspect-square w-full object-cover" /></div>
        {detail.images.length > 1 && <div className="mt-4 flex gap-3">{detail.images.map((item) => <button key={item.id} onClick={() => setImage(item.url)} className="h-20 w-20 overflow-hidden rounded-xl border-2 border-transparent hover:border-sage"><img src={item.url} alt={item.alt} className="h-full w-full object-cover" /></button>)}</div>}
      </div>
      <div className="py-2">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-sage-dark">{detail.categories.name} · {product.brand}</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">{product.name}</h1>
        <div className="mt-4 flex items-center gap-2 text-sm"><span className="flex items-center gap-1"><Star className="fill-amber-400 text-amber-400" size={16} />{(product.rating / 100).toFixed(1)}</span><span className="text-ink/50">({product.reviewCount} reviews)</span></div>
        <div className="mt-6 flex items-baseline gap-3">{product.discountPrice ? <><span className="text-2xl font-semibold">{formatPrice(product.discountPrice)}</span><span className="text-base text-ink/45 line-through">{formatPrice(product.price)}</span></> : <span className="text-2xl font-semibold">{formatPrice(product.price)}</span>}</div>
        <p className="mt-6 leading-7 text-ink/70">{product.description}</p>
        <p className={`mt-4 text-sm ${product.stock > 0 ? "text-sage-dark" : "text-rose"}`}>{product.stock > 0 ? `${product.stock > 10 ? "In stock" : `Only ${product.stock} left`}` : "Currently out of stock"}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-full border border-ink/15 bg-white"><button className="p-3" aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={16} /></button><span className="min-w-8 text-center">{quantity}</span><button className="p-3" aria-label="Increase quantity" onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}><Plus size={16} /></button></div>
          <Button size="lg" className="flex-1" disabled={product.stock === 0} onClick={() => addToCart(false)}>Add to bag</Button>
          <Button size="lg" variant="secondary" aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={wishlisted} disabled={wishlistBusy} onClick={wishlist}><Heart size={18} className={wishlisted ? "fill-ink text-ink" : "text-ink/60"} /></Button>
        </div>
        <Button size="lg" variant="dark" className="mt-3 w-full" disabled={product.stock === 0} onClick={() => addToCart(true)}>Buy now</Button>
        <div className="mt-7 grid gap-3 border-t border-ink/10 pt-5 text-sm text-ink/65 sm:grid-cols-2"><p className="flex items-center gap-2"><Truck size={17} />Free shipping over ₹2,000</p><p className="flex items-center gap-2"><ShieldCheck size={17} />Secure checkout</p></div>
        {product.ingredients && <div className="mt-9 border-t border-ink/10 pt-6"><h2 className="font-serif text-xl">Ingredients</h2><p className="mt-3 text-sm leading-6 text-ink/65">{product.ingredients}</p></div>}
        {product.howToUse && <div className="mt-6 border-t border-ink/10 pt-6"><h2 className="font-serif text-xl">How to use</h2><p className="mt-3 text-sm leading-6 text-ink/65">{product.howToUse}</p></div>}
      </div>
    </div>
    <section className="mt-20 border-t border-ink/10 pt-12"><h2 className="font-serif text-3xl">Kind words & honest thoughts</h2>
      {detail.reviews.length ? <div className="mt-7 grid gap-5 md:grid-cols-2">{detail.reviews.map((review) => <article key={review.id} className="rounded-2xl bg-white p-6"><p className="flex items-center gap-1 text-amber-500">{Array.from({ length: review.rating }, (_, index) => <Star key={index} size={15} className="fill-current" />)}</p><h3 className="mt-3 font-medium">{review.title || "A customer review"}</h3><p className="mt-2 text-sm leading-6 text-ink/65">{review.body}</p><p className="mt-4 text-xs text-ink/50">{review.customer}</p></article>)}</div>
        : <p className="mt-4 text-sm text-ink/60">No reviews yet. Your experience could help someone find their new favourite.</p>}
      {eligibleOrders.length > 0 && <form onSubmit={submitReview} className="mt-8 grid max-w-2xl gap-4 rounded-2xl bg-white p-6">
        <h3 className="font-serif text-xl">Share your experience</h3>
        <label className="grid gap-2 text-sm">Verified purchase<select className="field" name="orderId" required>{eligibleOrders.map((order) => <option key={order.id} value={order.id}>Order {order.id.slice(0, 8).toUpperCase()} · {new Date(order.createdAt).toLocaleDateString()}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Rating<select className="field" name="rating" defaultValue="5"><option value="5">5 — Loved it</option><option value="4">4 — Really liked it</option><option value="3">3 — It was good</option><option value="2">2 — Not for me</option><option value="1">1 — Disappointed</option></select></label>
        <label className="grid gap-2 text-sm">Title (optional)<input className="field" name="title" maxLength={160} /></label>
        <label className="grid gap-2 text-sm">Your review<textarea className="field" name="body" minLength={10} maxLength={3000} rows={4} required /></label>
        {reviewError && <p role="alert" className="text-sm text-rose-800">{reviewError}</p>}
        <button disabled={reviewBusy} className="w-fit rounded-full bg-sage-dark px-6 py-3 text-sm text-white disabled:opacity-50">{reviewBusy ? "Submitting…" : "Submit review"}</button>
      </form>}
    </section>
  </div>;
}
