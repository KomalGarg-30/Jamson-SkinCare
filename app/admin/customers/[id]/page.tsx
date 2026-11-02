"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatPrice } from "@/lib/utils";

type CustomerData = {
  customer: { name: string; email: string; phone: string | null; isBlocked: boolean; createdAt: string };
  orders: { id: string; total: number; status: string; paymentStatus: string; createdAt: string }[];
};

export default function AdminCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CustomerData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/admin/customers/${id}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load customer."));
  }, [id]);
  if (error) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-sand" />;
  return <section><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Customer account</p><h1 className="mt-2 font-serif text-4xl">{data.customer.name}</h1>
    <article className="mt-6 rounded-2xl bg-white p-6 text-sm leading-7"><p>Email: {data.customer.email}</p><p>Phone: {data.customer.phone || "Not provided"}</p><p>Customer since: {new Date(data.customer.createdAt).toLocaleDateString()}</p><p>Status: {data.customer.isBlocked ? "Blocked" : "Active"}</p></article>
    <section className="mt-8 rounded-2xl bg-white p-6"><h2 className="font-serif text-2xl">Order history</h2>{data.orders.length ? <div className="mt-4 divide-y divide-ink/10">{data.orders.map((order) => <div key={order.id} className="flex flex-wrap justify-between gap-3 py-4 text-sm"><div><p className="font-mono">{order.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs capitalize text-ink/50">{order.status} · payment {order.paymentStatus} · {new Date(order.createdAt).toLocaleDateString()}</p></div><strong>{formatPrice(order.total)}</strong></div>)}</div> : <p className="mt-4 text-sm text-ink/55">No orders yet.</p>}</section>
  </section>;
}
