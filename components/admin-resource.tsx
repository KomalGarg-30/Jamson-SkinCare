"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

type Resource = "categories" | "orders" | "customers" | "reviews" | "coupons" | "banners";
type RecordRow = Record<string, string | number | boolean | null | undefined>;

const config: Record<Resource, { title: string; endpoint: string; dataKey: string; create?: boolean }> = {
  categories: { title: "Categories", endpoint: "/api/admin/categories", dataKey: "categories", create: true },
  orders: { title: "Orders", endpoint: "/api/admin/orders", dataKey: "orders" },
  customers: { title: "Customers", endpoint: "/api/admin/customers", dataKey: "customers" },
  reviews: { title: "Reviews", endpoint: "/api/admin/reviews", dataKey: "reviews" },
  coupons: { title: "Coupons & discounts", endpoint: "/api/admin/coupons", dataKey: "coupons", create: true },
  banners: { title: "Home banners", endpoint: "/api/admin/banners", dataKey: "banners", create: true },
};

export function AdminResource({ resource }: { resource: Resource }) {
  const definition = config[resource];
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const toast = useToast();
  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (resource === "customers" && search) params.set("q", search);
    if (resource === "orders" && statusFilter) params.set("status", statusFilter);
    const url = params.size ? `${definition.endpoint}?${params}` : definition.endpoint;
    const response = await fetch(url);
    const data: Record<string, RecordRow[]> & { error?: string } = await response.json();
    if (!response.ok) { setError(data.error || "Unable to load records."); return; }
    setRows(data[definition.dataKey] || []);
    setError("");
    setLoading(false);
  }, [definition.dataKey, definition.endpoint, resource, search, statusFilter]);
  useEffect(() => { void load(); }, [load]);

  async function mutate(url: string, method: string, body?: Record<string, string | number | boolean | null>) {
    const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result: { error?: string } = await response.json();
    if (!response.ok) { toast(result.error || "That change could not be saved.", "error"); return; }
    toast("Changes saved.");
    await load();
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const method = editing ? "PATCH" : "POST";
    const prefix: Record<string, string | number | boolean | null> = editing ? { id: String(editing.id) } : {};
    if (resource === "categories") await mutate(definition.endpoint, method, {
      ...prefix,
      name: String(values.name), description: String(values.description || ""),
      ...(values.imageUrl ? { imageUrl: String(values.imageUrl) } : {}),
    });
    if (resource === "coupons") await mutate(definition.endpoint, method, {
      ...prefix,
      code: String(values.code), type: String(values.type),
      value: values.type === "fixed" ? Math.round(Number(values.value) * 100) : Number(values.value),
      minOrder: Math.round(Number(values.minOrder || 0) * 100), maxUses: values.maxUses ? Number(values.maxUses) : null,
      expiresAt: values.expiresAt ? new Date(String(values.expiresAt)).toISOString() : null,
    });
    if (resource === "banners") await mutate(definition.endpoint, method, {
      ...prefix,
      title: String(values.title), subtitle: String(values.subtitle || ""), imageUrl: String(values.imageUrl),
      ...(values.linkUrl ? { linkUrl: String(values.linkUrl) } : {}), position: Number(values.position || 0),
    });
    setEditing(null);
    form.reset();
  }
  const columns = rows.length ? Object.keys(rows[0]).filter((key) => !["id", "passwordHash", "userId"].includes(key)) : [];
  const filteredRows = useMemo(() => rows
    .filter((row) => resource === "customers" || !search || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(search.toLowerCase())))
    .sort((left, right) => {
      if (!sortKey) return 0;
      const a = String(left[sortKey] ?? "").toLowerCase();
      const b = String(right[sortKey] ?? "").toLowerCase();
      return (a < b ? -1 : a > b ? 1 : 0) * (sortDirection === "asc" ? 1 : -1);
    }), [rows, resource, search, sortKey, sortDirection]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  return <section><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Store management</p><h1 className="mt-2 font-serif text-4xl">{definition.title}</h1></div>
    <div className="flex flex-wrap gap-2"><input className="field max-w-xs" placeholder={`Search ${definition.title.toLowerCase()}`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} aria-label={`Search ${definition.title.toLowerCase()}`} />
      {resource === "orders" && <select className="field max-w-xs" aria-label="Filter by order status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select>}
    </div>
  </div>
    {definition.create && <form key={String(editing?.id || "new")} onSubmit={create} className="mt-6 grid gap-3 rounded-2xl bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
      {editing && <h2 className="font-serif text-xl sm:col-span-2 lg:col-span-4">Editing record</h2>}
      {resource === "categories" && <><input className="field" name="name" required placeholder="Category name" defaultValue={String(editing?.name || "")} /><input className="field" name="description" placeholder="Description" defaultValue={String(editing?.description || "")} /><input className="field" name="imageUrl" placeholder="Image URL (optional)" defaultValue={String(editing?.imageUrl || "")} /><Button>{editing ? "Save category" : "Create category"}</Button></>}
      {resource === "coupons" && <><input className="field" name="code" required placeholder="Coupon code" defaultValue={String(editing?.code || "")} /><select className="field" name="type" defaultValue={String(editing?.type || "percentage")}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select><input className="field" name="value" type="number" min="1" required placeholder="Value (% or ₹)" defaultValue={editing ? String(editing.type === "fixed" ? Number(editing.value) / 100 : editing.value) : ""} /><input className="field" name="minOrder" type="number" min="0" placeholder="Minimum order ₹" defaultValue={editing ? String(Number(editing.minOrder || 0) / 100) : ""} /><input className="field" name="maxUses" type="number" min="1" placeholder="Usage limit" defaultValue={String(editing?.maxUses || "")} /><input className="field" name="expiresAt" type="datetime-local" aria-label="Coupon expiry" defaultValue={editing?.expiresAt ? new Date(String(editing.expiresAt)).toISOString().slice(0, 16) : ""} /><Button>{editing ? "Save coupon" : "Create coupon"}</Button></>}
      {resource === "banners" && <><input className="field" name="title" required placeholder="Banner title" defaultValue={String(editing?.title || "")} /><input className="field" name="subtitle" placeholder="Subtitle" defaultValue={String(editing?.subtitle || "")} /><input className="field" name="imageUrl" type="url" required placeholder="ImageKit image URL" defaultValue={String(editing?.imageUrl || "")} /><input className="field" name="linkUrl" type="url" placeholder="Link URL (optional)" defaultValue={String(editing?.linkUrl || "")} /><input className="field" name="position" type="number" min="0" placeholder="Display order" defaultValue={String(editing?.position || 0)} /><Button>{editing ? "Save banner" : "Create banner"}</Button></>}
      {editing && <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>}
    </form>}
    {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {loading ? <div className="mt-6 h-64 animate-pulse rounded-2xl bg-sand" /> : <div className="mt-6 overflow-x-auto rounded-2xl bg-white">
      {!rows.length ? <p className="p-10 text-center text-sm text-ink/55">Nothing here yet.</p> : <table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-ink/10 bg-sand/50"><tr>{columns.map((key) => <th key={key} className="px-4 py-3 font-medium capitalize"><button onClick={() => { setSortKey(key); setSortDirection(sortDirection === "asc" ? "desc" : "asc"); }} aria-label={`Sort by ${key}`}>{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}{sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}</button></th>)}<th className="px-4 py-3 font-medium">Actions</th></tr></thead><tbody className="divide-y divide-ink/10">{visibleRows.map((row) => <tr key={String(row.id)}>{columns.map((key) => <td key={key} className="max-w-56 truncate px-4 py-3">{key === "total" ? formatPrice(Number(row[key])) : typeof row[key] === "boolean" ? (row[key] ? "Yes" : "No") : key.toLowerCase().includes("date") && row[key] ? new Date(String(row[key])).toLocaleDateString() : String(row[key] ?? "—")}</td>)}<td className="px-4 py-3">
        {resource === "orders" && <div className="flex flex-wrap items-center gap-3"><Link className="text-xs text-sage-dark underline" href={`/admin/orders/${row.id}`}>Details / invoice</Link><select aria-label="Change order status" className="rounded-lg border p-2 text-xs" value={String(row.status)} onChange={(event) => mutate(definition.endpoint, "PATCH", { id: String(row.id), status: event.target.value })}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select><select aria-label="Change payment status" className="rounded-lg border p-2 text-xs" value={String(row.paymentStatus)} onChange={(event) => mutate(definition.endpoint, "PATCH", { id: String(row.id), paymentStatus: event.target.value })}><option value="pending">Unpaid</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="refunded">Refunded</option></select></div>}
        {resource === "customers" && <div className="flex gap-3"><Link className="text-xs text-sage-dark underline" href={`/admin/customers/${row.id}`}>Details / history</Link><button className="text-xs text-sage-dark underline" onClick={() => mutate(definition.endpoint, "PATCH", { id: String(row.id), isBlocked: !row.isBlocked })}>{row.isBlocked ? "Unblock" : "Block"}</button></div>}
        {resource === "reviews" && <div className="flex gap-3"><button className="text-xs text-sage-dark underline" onClick={() => mutate(definition.endpoint, "PATCH", { id: String(row.id), isApproved: !row.isApproved })}>{row.isApproved ? "Unapprove" : "Approve"}</button><button className="text-xs text-rose-800 underline" onClick={() => mutate(`${definition.endpoint}?id=${row.id}`, "DELETE")}>Delete</button></div>}
        {resource === "coupons" && <div className="flex gap-3"><button className="text-xs text-sage-dark underline" onClick={() => setEditing(row)}>Edit</button><button className="text-xs text-sage-dark underline" onClick={() => mutate(definition.endpoint, "PATCH", { id: String(row.id), isActive: !row.isActive })}>{row.isActive ? "Deactivate" : "Activate"}</button><button className="text-xs text-rose-800 underline" onClick={() => mutate(`${definition.endpoint}?id=${row.id}`, "DELETE")}>Delete</button></div>}
        {resource === "banners" && <div className="flex gap-3"><button className="text-xs text-sage-dark underline" onClick={() => setEditing(row)}>Edit</button><button className="text-xs text-sage-dark underline" onClick={() => mutate(definition.endpoint, "PATCH", { id: String(row.id), isActive: !row.isActive })}>{row.isActive ? "Deactivate" : "Activate"}</button><button className="text-xs text-rose-800 underline" onClick={() => mutate(`${definition.endpoint}?id=${row.id}`, "DELETE")}>Delete</button></div>}
        {resource === "categories" && <div className="flex gap-3"><button className="text-xs text-sage-dark underline" onClick={() => setEditing(row)}>Edit</button><button className="text-xs text-rose-800 underline" onClick={() => mutate(`${definition.endpoint}?id=${row.id}`, "DELETE")}>Delete</button></div>}
      </td></tr>)}</tbody></table>}
    </div>}
    {!loading && filteredRows.length > pageSize && <div className="mt-4 flex items-center justify-center gap-4"><button className="rounded-full border px-4 py-2 text-sm disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="text-sm text-ink/60">Page {page} of {pageCount}</span><button className="rounded-full border px-4 py-2 text-sm disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button></div>}
  </section>;
}
