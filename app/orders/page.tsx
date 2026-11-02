"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { formatPrice } from "@/lib/utils";

type Order = { id: string; status: string; paymentStatus: string; total: number; createdAt: string };

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const router = useRouter();
  const load = useCallback(async () => {
    const response = await fetch("/api/orders");
    if (response.status === 401) { router.replace(`/login?next=${encodeURIComponent("/orders")}`); return; }
    const result = await response.json();
    setOrders(result.orders || []); setLoading(false);
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  async function cancel(id: string) {
    const response = await fetch("/api/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: id }) });
    const result = await response.json();
    toast(response.ok ? "Your order has been cancelled." : result.error, response.ok ? "success" : "error");
    if (response.ok) void load();
  }
  return <section className="container-page py-14"><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Your account</p><h1 className="mt-3 font-serif text-4xl">My orders</h1>
    {loading ? <div className="mt-8 h-48 animate-pulse rounded-2xl bg-sand" /> : orders.length ? <div className="mt-8 grid gap-4">{orders.map((order) => <article key={order.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5"><div><p className="font-mono text-sm">Order {order.id.slice(0, 8).toUpperCase()}</p><p className="mt-2 text-xs text-ink/55">{new Date(order.createdAt).toLocaleDateString()} · <span className="capitalize">{order.status}</span> · Payment {order.paymentStatus}</p></div><div className="flex items-center gap-4"><strong>{formatPrice(order.total)}</strong><Link href={`/orders/${order.id}`} className="text-sm text-sage-dark underline">Details</Link>{["pending", "confirmed"].includes(order.status) && <button className="text-sm text-rose-800 underline" onClick={() => cancel(order.id)}>Cancel</button>}</div></article>)}</div>
      : <div className="mt-8 rounded-2xl bg-white py-16 text-center"><h2 className="font-serif text-2xl">No orders, just possibilities</h2><p className="mt-2 text-sm text-ink/60">Your next favourite might be waiting.</p><Link className="mt-5 inline-block text-sm text-sage-dark underline" href="/shop">Explore the collection</Link></div>}
  </section>;
}
