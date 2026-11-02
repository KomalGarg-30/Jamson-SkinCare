"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

type AdminOrder = { order: { id: string; status: string; paymentStatus: string; paymentMethod: string; subtotal: number; shipping: number; tax: number; discount: number; total: number; createdAt: string; customerName: string; customerEmail: string; shippingAddress: { name: string; phone: string; line1: string; line2: string | null; city: string; state: string; pincode: string; country: string } }; items: { id: string; productName: string; sku: string; quantity: number; unitPrice: number }[] };

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AdminOrder | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/admin/orders/${id}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load order."));
  }, [id]);
  if (error) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-sand" />;
  const { order, items } = data;
  return <section><div className="flex flex-wrap items-end justify-between gap-4 print:hidden"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Order management</p><h1 className="mt-2 font-serif text-4xl">Order {order.id.slice(0, 8).toUpperCase()}</h1></div><Button variant="secondary" onClick={() => window.print()}>Print invoice / packing slip</Button></div>
    <article className="mt-6 rounded-2xl bg-white p-6 print:mt-0 print:shadow-none"><div className="grid gap-8 md:grid-cols-2"><div><h2 className="font-serif text-xl">Customer</h2><p className="mt-3 text-sm leading-6">{order.customerName}<br />{order.customerEmail}<br />Order placed {new Date(order.createdAt).toLocaleString()}</p></div><div><h2 className="font-serif text-xl">Ship to</h2><p className="mt-3 text-sm leading-6">{order.shippingAddress.name}<br />{order.shippingAddress.phone}<br />{order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}<br />{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}<br />{order.shippingAddress.country}</p></div></div>
      <div className="mt-8 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-3">Item</th><th className="py-3">SKU</th><th className="py-3">Qty</th><th className="py-3 text-right">Amount</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-ink/10"><td className="py-3">{item.productName}</td><td className="py-3">{item.sku}</td><td className="py-3">{item.quantity}</td><td className="py-3 text-right">{formatPrice(item.unitPrice * item.quantity)}</td></tr>)}</tbody></table></div>
      <div className="ml-auto mt-5 max-w-xs space-y-2 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></p><p className="flex justify-between"><span>Shipping</span><span>{formatPrice(order.shipping)}</span></p><p className="flex justify-between"><span>Tax</span><span>{formatPrice(order.tax)}</span></p><p className="flex justify-between"><span>Discount</span><span>-{formatPrice(order.discount)}</span></p><p className="flex justify-between border-t pt-3 font-semibold"><span>Total</span><span>{formatPrice(order.total)}</span></p></div>
      <p className="mt-6 text-sm capitalize">Order status: {order.status} · Payment: {order.paymentStatus} via {order.paymentMethod}</p>
    </article>
  </section>;
}
