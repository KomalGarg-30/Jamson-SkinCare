"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { formatPrice } from "@/lib/utils";
import { StoreImage } from "@/components/store-image";

type CartItem = { id: string; productId: string; name: string; slug: string; quantity: number; price: number; discountPrice: number | null; image: string | null; stock: number };
export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [totals, setTotals] = useState({ subtotal: 0, shipping: 0, tax: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const router = useRouter();
  const load = useCallback(async () => {
    const response = await fetch("/api/cart");
    if (response.status === 401) { router.replace(`/login?next=${encodeURIComponent("/cart")}`); return; }
    const data = await response.json();
    setItems(data.items || []);
    setTotals({ subtotal: data.subtotal || 0, shipping: data.shipping || 0, tax: data.tax || 0, total: data.total || 0 });
    setLoading(false);
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  async function update(item: CartItem, quantity: number) {
    const response = quantity === 0
      ? await fetch(`/api/cart?id=${item.id}`, { method: "DELETE" })
      : await fetch("/api/cart", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, quantity }) });
    const data = await response.json();
    if (!response.ok) { toast(data.error, "error"); return; }
    await load();
    if (quantity === 0) toast("Item removed from your bag.");
  }
  if (loading) return <div className="container-page py-20"><div className="h-10 w-48 animate-pulse rounded bg-sand" /></div>;
  return <section className="container-page py-12 md:py-16">
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Your collection</p><h1 className="mt-3 font-serif text-4xl">Your bag</h1>
    {!items.length ? <div className="mt-10 rounded-3xl bg-white px-6 py-20 text-center"><h2 className="font-serif text-2xl">Your bag is taking a little breather</h2><p className="mt-3 text-sm text-ink/60">Find something lovely for your everyday routine.</p><Link className="mt-6 inline-block rounded-full bg-sage-dark px-7 py-3 text-sm text-white" href="/shop">Explore the collection</Link></div>
      : <div className="mt-9 grid items-start gap-8 lg:grid-cols-[1fr_360px]"><div className="divide-y divide-ink/10 rounded-2xl bg-white px-5">
        {items.map((item) => <article key={item.id} className="flex gap-4 py-5"><Link href={`/products/${item.slug}`} className="h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-sand"><StoreImage src={item.image} alt={item.name} width={240} height={280} className="h-full w-full object-cover" /></Link><div className="flex flex-1 flex-wrap justify-between gap-3"><div><Link href={`/products/${item.slug}`} className="font-medium">{item.name}</Link><p className="mt-2 text-sm">{formatPrice(item.discountPrice ?? item.price)}</p><p className="mt-1 text-xs text-ink/50">{item.stock} in stock</p></div><div className="flex items-center gap-2 self-end"><button aria-label="Decrease quantity" className="rounded-full border p-2" onClick={() => update(item, item.quantity - 1)}>{item.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}</button><span className="min-w-6 text-center text-sm">{item.quantity}</span><button aria-label="Increase quantity" disabled={item.quantity >= item.stock} className="rounded-full border p-2 disabled:opacity-40" onClick={() => update(item, item.quantity + 1)}><Plus size={15} /></button></div></div></article>)}
      </div><aside className="rounded-2xl bg-white p-6"><h2 className="font-serif text-2xl">Order summary</h2><div className="mt-6 flex justify-between text-sm"><span>Subtotal</span><span>{formatPrice(totals.subtotal)}</span></div><div className="mt-3 flex justify-between text-sm"><span>Shipping</span><span>{totals.shipping ? formatPrice(totals.shipping) : "Free"}</span></div>{totals.tax > 0 && <div className="mt-3 flex justify-between text-sm"><span>Tax</span><span>{formatPrice(totals.tax)}</span></div>}<div className="my-5 border-t border-ink/10" /><div className="flex justify-between font-semibold"><span>Total</span><span>{formatPrice(totals.total)}</span></div><p className="mt-2 text-xs text-ink/50">Discount codes can be added at checkout.</p><Link href="/checkout" className="mt-6 block"><Button size="lg" className="w-full">Continue to checkout</Button></Link><Link href="/shop" className="mt-4 block text-center text-sm text-sage-dark underline">Continue shopping</Link></aside></div>}
  </section>;
}
