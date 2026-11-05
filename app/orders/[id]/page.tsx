"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { StoreImage } from "@/components/store-image";

type OrderDetailData = { order: { id: string; status: string; paymentStatus: string; paymentMethod: string; total: number; subtotal: number; shipping: number; tax: number; discount: number; createdAt: string; shippingAddress: { name: string; phone: string; line1: string; line2: string | null; city: string; state: string; pincode: string; country: string } }; items: { id: string; productName: string; sku: string; quantity: number; unitPrice: number; image: string | null }[] };

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<OrderDetailData | null>(null);
  const router = useRouter();
  useEffect(() => { void params.then(({ id }) => fetch(`/api/orders/${id}`).then((response) => {
    if (response.status === 401) { router.replace(`/login?next=${encodeURIComponent(`/orders/${id}`)}`); return null; }
    return response.ok ? response.json() : null;
  }).then((result: OrderDetailData | null) => setData(result))); }, [params, router]);
  if (!data) return <div className="container-page py-20"><p className="text-ink/60">Loading order details…</p></div>;
  const { order, items } = data;
  const steps = ["pending", "confirmed", "shipped", "delivered"];
  const currentStep = steps.indexOf(order.status);
  return <section className="container-page max-w-4xl py-14"><Link href="/orders" className="text-sm text-sage-dark underline">← All orders</Link><p className="mt-7 text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Order tracking</p><h1 className="mt-3 font-serif text-4xl">Order {order.id.slice(0, 8).toUpperCase()}</h1><p className="mt-3 text-sm capitalize text-ink/60">Status: {order.status} · Payment: {order.paymentStatus}</p>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5"><div className="flex flex-wrap gap-3">
      {order.status === "cancelled" ? <span className="rounded-full bg-rose-100 px-3 py-1 text-sm text-rose-800">Order cancelled</span> : steps.map((step, index) =>
        <span key={step} className={`rounded-full px-3 py-1 text-xs capitalize ${index <= currentStep ? "bg-emerald-100 text-emerald-800" : "bg-sand text-ink/50"}`}>{step}</span>)}
    </div><a href={`/api/orders/${order.id}/invoice`} className="text-sm text-sage-dark underline">Download invoice (PDF)</a></div>
    <div className="mt-8 grid gap-6 md:grid-cols-[1fr_300px]"><div className="rounded-2xl bg-white p-6"><h2 className="font-serif text-xl">Items</h2>{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-ink/10 py-4 text-sm"><div className="flex items-center gap-3"><StoreImage src={item.image} alt={item.productName} width={100} height={100} className="h-14 w-14 rounded-lg object-cover" /><span>{item.productName} × {item.quantity}</span></div><span>{formatPrice(item.unitPrice * item.quantity)}</span></div>)}
      <div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div><div className="flex justify-between"><span>Shipping</span><span>{formatPrice(order.shipping)}</span></div><div className="flex justify-between"><span>Tax</span><span>{formatPrice(order.tax)}</span></div>{order.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{formatPrice(order.discount)}</span></div>}<div className="flex justify-between border-t pt-3 font-semibold"><span>Total</span><span>{formatPrice(order.total)}</span></div></div>
    </div><aside className="rounded-2xl bg-white p-6"><h2 className="font-serif text-xl">Delivery address</h2><p className="mt-4 text-sm leading-6">{order.shippingAddress.name}<br />{order.shippingAddress.phone}<br />{order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}<br />{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}<br />{order.shippingAddress.country}</p></aside></div>
  </section>;
}
