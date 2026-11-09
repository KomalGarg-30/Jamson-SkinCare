"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

type Payment = { id: string; orderId: string; userEmail: string; amount: number; status: string; method: string | null; providerOrderId: string | null; providerPaymentId: string | null; createdAt: string };

export function AdminPayments() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    fetch(`/api/admin/payments?${params}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) setError(data.error || "Unable to load payments.");
      else setRows(data.payments || []);
    }).catch(() => setError("Unable to load payments."));
  }, [search, status]);
  return <section><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Store management</p><h1 className="mt-2 font-serif text-4xl">Payments</h1></div><a className="text-sm text-sage-dark underline" href="/api/admin/payments?format=csv">Export CSV</a></div>
    <div className="mt-6 flex flex-wrap gap-3"><input className="field max-w-sm" placeholder="Search customer or order" value={search} onChange={(event) => setSearch(event.target.value)} /><select className="field max-w-xs" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="created">Created</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="refunded">Refunded</option><option value="expired">Expired</option></select></div>
    {error && <p className="mt-5 text-sm text-rose-800">{error}</p>}<div className="mt-6 overflow-x-auto rounded-2xl bg-white"><table className="w-full text-left text-sm"><thead><tr className="border-b border-ink/10"><th className="p-4">Payment</th><th className="p-4">Customer</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">Gateway IDs</th><th className="p-4">Date</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-ink/5"><td className="p-4 font-mono text-xs">{row.id.slice(0, 8)}<br />Order {row.orderId.slice(0, 8)}</td><td className="p-4">{row.userEmail}</td><td className="p-4">{formatPrice(row.amount)}</td><td className="p-4 capitalize">{row.status}</td><td className="p-4 font-mono text-xs">{row.providerOrderId || "—"}<br />{row.providerPaymentId || "—"}</td><td className="p-4">{new Date(row.createdAt).toLocaleString()}</td></tr>)}</tbody></table>{!rows.length && <p className="p-8 text-sm text-ink/55">No payments found.</p>}</div></section>;
}
