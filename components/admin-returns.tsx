"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

type ReturnRecord = {
  id: string; orderId: string; userId: string; reason: string; comment: string | null;
  photos: string[];
  status: string; refundAmount: number; refundedAt: string | null; adminNotes: string | null;
  providerRefundId: string | null;
  createdAt: string; userName: string; userEmail: string; paymentMethod: string;
};
type ReturnItem = { returnId: string; quantity: number; productName: string; unitPrice: number };
const statuses = ["all", "requested", "approved", "rejected", "picked_up", "received", "refunded"];

export function AdminReturns() {
  const [records, setRecords] = useState<ReturnRecord[]>([]);
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [restoreStock, setRestoreStock] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/returns?status=${filter}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load returns.");
      setRecords(result.returns);
      setItems(result.items);
      setNotes(Object.fromEntries(result.returns.map((record: ReturnRecord) => [record.id, record.adminNotes || ""])));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load returns.");
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function update(id: string, values: { status?: string; adminNotes?: string | null; restoreStock?: boolean }) {
    const response = await fetch("/api/admin/returns", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...values }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not update return.");
    await load();
  }

  async function changeStatus(record: ReturnRecord, status: string) {
    const prompt = status === "rejected" ? "Reject this return request?" : `Move this return to ${status.replace("_", " ")}?`;
    if (!window.confirm(prompt)) return;
    try { await update(record.id, { status, adminNotes: notes[record.id] || null, restoreStock: status === "received" && Boolean(restoreStock[record.id]) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update return."); }
  }

  async function saveNotes(record: ReturnRecord) {
    try { await update(record.id, { adminNotes: notes[record.id] || null }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save notes."); }
  }

  async function refund(record: ReturnRecord) {
    const manual = record.paymentMethod === "cod";
    if (!window.confirm(manual ? "Mark the COD refund as issued? Complete the refund manually." : `Issue a Razorpay refund of ${formatPrice(record.refundAmount)}?`)) return;
    try {
      const response = await fetch(`/api/admin/returns/${record.id}/refund`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not issue refund.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not issue refund.");
    }
  }

  return <section>
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Customer care</p>
    <h1 className="mt-2 font-serif text-4xl">Returns & refunds</h1>
    <div className="mt-6 flex flex-wrap gap-2">{statuses.map((status) => <button key={status} onClick={() => setFilter(status)}
      className={`rounded-full px-4 py-2 text-sm capitalize ${filter === status ? "bg-sage text-white" : "bg-white text-ink/65"}`}>{status.replace("_", " ")}</button>)}</div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {loading ? <div className="mt-5 h-56 animate-pulse rounded-2xl bg-sand" /> : records.length ? <div className="mt-5 grid gap-4">
      {records.map((record) => <article key={record.id} className="rounded-2xl bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="font-mono text-sm">Return #{record.id.slice(0, 8).toUpperCase()} · Order #{record.orderId.slice(0, 8).toUpperCase()}</p>
            <p className="mt-1 text-sm"><strong>{record.userName}</strong> · {record.userEmail}</p>
            <p className="mt-1 text-xs capitalize text-ink/55">{record.reason.replace("_", " ")} · {new Date(record.createdAt).toLocaleString()}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs capitalize ${["refunded", "received"].includes(record.status) ? "bg-emerald-100 text-emerald-800" : record.status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{record.status.replace("_", " ")}</span>
        </div>
        {record.comment && <p className="mt-3 text-sm text-ink/65">{record.comment}</p>}
        {record.photos.length > 0 && <div className="mt-3 flex flex-wrap gap-3">{record.photos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer" className="text-sm text-sage-dark underline">View return photo</a>)}</div>}
        <div className="mt-3 grid gap-1 text-sm">{items.filter((item) => item.returnId === record.id).map((item, index) =>
          <p key={`${record.id}-${index}`} className="text-ink/65">{item.productName} × {item.quantity} · {formatPrice(item.unitPrice)}</p>)}</div>
        <p className="mt-3 text-sm">Refund amount: <strong>{formatPrice(record.refundAmount)}</strong>{record.refundedAt ? ` · Refunded ${new Date(record.refundedAt).toLocaleDateString()}` : ""}</p>
        {record.providerRefundId && <p className="mt-1 break-all text-xs text-ink/50">Refund reference: {record.providerRefundId}</p>}
        {record.paymentMethod === "cod" && <p className="mt-1 text-xs text-ink/50">Cash on delivery — issue refund manually.</p>}
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <div><label htmlFor={`notes-${record.id}`} className="text-xs font-semibold text-ink/65">Admin notes</label>
            <textarea id={`notes-${record.id}`} value={notes[record.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [record.id]: event.target.value }))}
              rows={2} className="mt-1 w-full rounded-xl border border-ink/10 p-3 text-sm" />
          </div>
          <button onClick={() => void saveNotes(record)} className="self-end rounded-full border border-ink/15 px-4 py-2 text-sm">Save notes</button>
        </div>
        {record.status === "picked_up" && <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={restoreStock[record.id] ?? false} onChange={(event) => setRestoreStock((current) => ({ ...current, [record.id]: event.target.checked }))} />
          Restore returned stock when received
        </label>}
        <div className="mt-4 flex flex-wrap gap-2">
          {record.status === "requested" && <>
            <button onClick={() => void changeStatus(record, "approved")} className="rounded-full bg-sage px-4 py-2 text-sm text-white">Approve</button>
            <button onClick={() => void changeStatus(record, "rejected")} className="rounded-full bg-rose-700 px-4 py-2 text-sm text-white">Reject</button>
          </>}
          {record.status === "approved" && <button onClick={() => void changeStatus(record, "picked_up")} className="rounded-full bg-sage px-4 py-2 text-sm text-white">Mark picked up</button>}
          {record.status === "picked_up" && <button onClick={() => void changeStatus(record, "received")} className="rounded-full bg-sage px-4 py-2 text-sm text-white">Mark received</button>}
          {record.status === "received" && <button onClick={() => void refund(record)} className="rounded-full bg-sage-dark px-4 py-2 text-sm text-white">{record.paymentMethod === "cod" ? "Mark refunded" : "Issue refund"}</button>}
        </div>
      </article>)}
    </div> : <div className="mt-5 rounded-2xl bg-white py-14 text-center text-sm text-ink/55">No return requests in this status.</div>}
  </section>;
}
