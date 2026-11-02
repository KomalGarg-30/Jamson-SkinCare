"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, IndianRupee, ShoppingBag, UsersRound } from "lucide-react";
import { formatPrice } from "@/lib/utils";

type Dashboard = { revenue: number; orders: number; customers: number; lowStock: number; recentOrders: { id: string; total: number; status: string; createdAt: string; userId: string }[]; chart: { date: string; revenue: string | null }[] };

export function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("daily");
  useEffect(() => {
    fetch(`/api/admin/dashboard?period=${period}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load dashboard."));
  }, [period]);
  if (error) return <div className="rounded-2xl bg-rose-50 p-6 text-sm text-rose-800">{error}</div>;
  if (!data) return <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-28 rounded-2xl bg-sand" />)}</div>;
  const cards = [
    { label: "Revenue", value: formatPrice(data.revenue), icon: IndianRupee },
    { label: "Orders", value: data.orders.toLocaleString(), icon: ShoppingBag },
    { label: "Customers", value: data.customers.toLocaleString(), icon: UsersRound },
    { label: "Low-stock products", value: data.lowStock.toLocaleString(), icon: AlertTriangle },
  ];
  const maxRevenue = Math.max(1, ...data.chart.map((item) => Number(item.revenue || 0)));
  return <div><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Store overview</p><h1 className="mt-2 font-serif text-4xl">Good morning, admin.</h1></div><Link href="/admin/orders" className="flex items-center gap-1 text-sm text-sage-dark underline">Manage orders <ArrowUpRight size={15} /></Link></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon }) => <article key={label} className="rounded-2xl bg-white p-5"><div className="flex items-center justify-between"><p className="text-sm text-ink/60">{label}</p><Icon size={18} className="text-sage-dark" /></div><p className="mt-4 font-serif text-3xl">{value}</p></article>)}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]"><section className="rounded-2xl bg-white p-6"><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl">Sales</h2><select aria-label="Sales chart period" className="rounded-lg border border-ink/15 bg-white p-2 text-sm" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div><div className="mt-7 flex h-48 items-end gap-1 overflow-x-auto">{data.chart.map((item) => <div key={item.date} title={`${item.date}: ${formatPrice(Number(item.revenue || 0))}`} className="min-w-2 flex-1 rounded-t bg-sage/70 hover:bg-sage" style={{ height: `${Math.max(4, Number(item.revenue || 0) / maxRevenue * 100)}%` }} />)}</div><p className="mt-3 text-xs text-ink/50">Paid sales · grouped {period}</p></section>
      <section className="rounded-2xl bg-white p-6"><h2 className="font-serif text-xl">Recent orders</h2>{data.recentOrders.length ? <div className="mt-4 divide-y divide-ink/10">{data.recentOrders.map((order) => <div key={order.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-mono text-xs">{order.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs capitalize text-ink/55">{order.status}</p></div><strong>{formatPrice(order.total)}</strong></div>)}</div> : <p className="mt-4 text-sm text-ink/55">No orders just yet.</p>}</section></div>
  </div>;
}
