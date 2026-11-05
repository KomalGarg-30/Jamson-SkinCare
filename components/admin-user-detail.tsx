"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatPrice } from "@/lib/utils";

type Data = {
  user: {
    id: string; name: string; email: string; phone: string | null; role: "user" | "admin";
    isBlocked: boolean; deletedAt: string | null; createdAt: string; lastLoginAt: string | null;
  };
  addresses: { id: string; name: string; phone: string; line1: string; line2: string | null; city: string; state: string; pincode: string; country: string; isDefault: boolean }[];
  orders: { id: string; status: string; paymentStatus: string; paymentMethod: string; total: number; createdAt: string }[];
  items: { orderId: string; productName: string; quantity: number; unitPrice: number }[];
  returns: { id: string; orderId: string; reason: string; status: string; refundAmount: number; providerRefundId: string | null; refundedAt: string | null; createdAt: string; photos: string[] }[];
  payments: { id: string; orderId: string; provider: string; providerPaymentId: string | null; amount: number; status: string; createdAt: string }[];
  cart: { productId: string; name: string; quantity: number; price: number; discountPrice: number | null }[];
  wishlist: { productId: string; name: string; price: number; slug: string }[];
  reviews: { id: string; productId: string; productName: string; rating: number; title: string | null; body: string; isApproved: boolean; createdAt: string }[];
  activity: { id: string; actorUserId: string | null; actorName: string | null; actorEmail: string | null; action: string; oldValue: unknown; newValue: unknown; createdAt: string }[];
  stats: { lifetimeValue: number; averageOrderValue: number; returnCount: number; returnRate: number };
  returnItems: { returnId: string; orderItemId: string; quantity: number }[];
};

const tabs = ["Profile", "Orders", "Returns & Refunds", "Payments", "Cart & Wishlist", "Reviews", "Activity log", "Stats"] as const;
type Tab = typeof tabs[number];

export function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("Profile");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch(`/api/admin/users/${id}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load user.");
    setData(result);
    setName(result.user.name);
    setPhone(result.user.phone || "");
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/users/${id}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load user.");
      if (active) { setData(result); setName(result.user.name); setPhone(result.user.phone || ""); }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load user.");
    });
    return () => { active = false; };
  }, [id]);

  async function mutate(payload: Record<string, unknown>, confirmation: string) {
    if (!window.confirm(confirmation)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update user.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update user.");
    } finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!window.confirm("Send a password reset email to this user?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send reset email.");
      setError("");
      window.alert("Password reset email sent.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send reset email.");
    } finally { setBusy(false); }
  }

  if (error && !data) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-sand" />;
  const { user } = data;
  const itemsFor = (orderId: string) => data.items.filter((item) => item.orderId === orderId);

  return <section>
    <Link href="/admin/users" className="text-sm text-sage-dark underline">← All users</Link>
    <p className="mt-5 text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">User account</p>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="font-serif text-4xl">{user.name}</h1><p className="mt-1 text-sm text-ink/55">{user.email}</p></div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy || Boolean(user.deletedAt)} onClick={() => void mutate({ action: "status", isBlocked: !user.isBlocked }, `Are you sure you want to ${user.isBlocked ? "unblock" : "block"} this user? Existing sessions will be invalidated.`)}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm disabled:opacity-50">{user.isBlocked ? "Unblock" : "Block"} user</button>
        <button disabled={busy || Boolean(user.deletedAt)} onClick={() => void resetPassword()} className="rounded-full border border-ink/15 px-4 py-2 text-sm disabled:opacity-50">Send reset email</button>
        <button disabled={busy || Boolean(user.deletedAt)} onClick={() => void mutate({ action: "delete" }, "Soft-delete this account? Order history will be retained and all sessions invalidated.")}
          className="rounded-full bg-rose-700 px-4 py-2 text-sm text-white disabled:opacity-50">Delete user</button>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="mt-6 flex gap-2 overflow-x-auto border-b border-ink/10 pb-2">
      {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`shrink-0 rounded-full px-3 py-2 text-sm ${tab === item ? "bg-sage text-white" : "bg-white text-ink/65"}`}>{item}</button>)}
    </div>
    {tab === "Profile" && <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl bg-white p-5">
        <h2 className="font-serif text-2xl">Profile</h2>
        <div className="mt-4 grid gap-3 text-sm">
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-ink/10 px-3 py-2" /></label>
          <label>Email<input readOnly value={user.email} className="mt-1 block w-full rounded-lg border border-ink/10 bg-sand px-3 py-2" /></label>
          <label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 block w-full rounded-lg border border-ink/10 px-3 py-2" /></label>
          <button disabled={busy || Boolean(user.deletedAt)} onClick={() => void mutate({ action: "edit", name, phone: phone || null }, "Save these profile changes?")}
            className="justify-self-start rounded-full bg-sage px-4 py-2 text-sm text-white disabled:opacity-50">Save profile</button>
        </div>
        <div className="mt-5 border-t border-ink/10 pt-4 text-sm leading-7">
          <p>Role: <strong className="capitalize">{user.role}</strong></p><p>Status: <strong>{user.deletedAt ? "Deleted" : user.isBlocked ? "Blocked" : "Active"}</strong></p>
          <p>Joined: {new Date(user.createdAt).toLocaleString()}</p><p>Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</p>
        </div>
        <label className="mt-5 block text-sm">Role
          <select value={user.role} disabled={busy || Boolean(user.deletedAt)} onChange={(event) => void mutate({ action: "role", role: event.target.value }, `Change this user's role to ${event.target.value === "admin" ? "Admin" : "User"}? Existing sessions will be invalidated.`)}
            className="mt-1 block rounded-lg border border-ink/10 px-3 py-2">
            <option value="user">User</option><option value="admin">Admin</option>
          </select>
        </label>
      </article>
      <article className="rounded-2xl bg-white p-5"><h2 className="font-serif text-2xl">Saved addresses</h2>
        {data.addresses.length ? <div className="mt-3 grid gap-3">{data.addresses.map((address) => <div key={address.id} className="rounded-xl bg-cream p-4 text-sm leading-6">
          <p className="font-semibold">{address.name}{address.isDefault ? " · Default" : ""}</p><p>{address.phone}</p>
          <p>{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} {address.pincode}, {address.country}</p>
        </div>)}</div> : <p className="mt-3 text-sm text-ink/55">No saved addresses.</p>}
      </article>
    </div>}
    {tab === "Orders" && <div className="mt-5 grid gap-3">{data.orders.length ? data.orders.map((order) => <article key={order.id} className="rounded-2xl bg-white p-5">
      <div className="flex flex-wrap justify-between gap-3"><div><Link href={`/admin/orders/${order.id}`} className="font-mono text-sm underline">#{order.id.slice(0, 8).toUpperCase()}</Link>
        <p className="mt-1 text-xs capitalize text-ink/55">{new Date(order.createdAt).toLocaleDateString()} · {order.status} · {order.paymentMethod} · payment {order.paymentStatus}</p></div><strong>{formatPrice(order.total)}</strong></div>
      <ul className="mt-3 list-inside list-disc text-sm text-ink/65">{itemsFor(order.id).map((item, index) => <li key={`${order.id}-${index}`}>{item.productName} × {item.quantity} · {formatPrice(item.unitPrice)}</li>)}</ul>
    </article>) : <Empty>No orders yet.</Empty>}</div>}
    {tab === "Returns & Refunds" && <div className="mt-5 grid gap-3">{data.returns.length ? data.returns.map((item) => <article key={item.id} className="rounded-2xl bg-white p-5 text-sm">
      <div className="flex flex-wrap justify-between gap-3"><div><p className="font-mono">Return #{item.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-ink/55">Order #{item.orderId.slice(0, 8).toUpperCase()} · {item.reason}</p></div><strong className="capitalize">{item.status.replace("_", " ")}</strong></div>
      <p className="mt-3">Refund: {formatPrice(item.refundAmount)}{item.refundedAt ? ` · ${new Date(item.refundedAt).toLocaleDateString()}` : ""}</p>
      {item.providerRefundId && <p className="mt-1 break-all text-xs text-ink/50">Refund reference: {item.providerRefundId}</p>}
      <p className="mt-2 text-xs text-ink/50">{data.returnItems.filter((row) => row.returnId === item.id).length} returned item line(s)</p>
      {item.photos.length > 0 && <div className="mt-2 flex gap-3">{item.photos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer" className="text-xs text-sage-dark underline">View photo</a>)}</div>}
    </article>) : <Empty>No returns or refunds.</Empty>}</div>}
    {tab === "Payments" && <div className="mt-5 grid gap-3">{data.payments.length ? data.payments.map((payment) => <article key={payment.id} className="flex flex-wrap justify-between gap-3 rounded-2xl bg-white p-5 text-sm">
      <div><p className="font-mono">Order #{payment.orderId.slice(0, 8).toUpperCase()}</p><p className="mt-1 capitalize text-ink/55">{payment.provider} · {payment.providerPaymentId || "COD"} · {payment.status}</p><p className="text-xs text-ink/50">{new Date(payment.createdAt).toLocaleString()}</p></div><strong>{formatPrice(payment.amount)}</strong>
    </article>) : <Empty>No payment transactions yet.</Empty>}</div>}
    {tab === "Cart & Wishlist" && <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl bg-white p-5"><h2 className="font-serif text-2xl">Cart</h2>{data.cart.length ? data.cart.map((item) => <p key={item.productId} className="border-b border-ink/5 py-3 text-sm">{item.name} × {item.quantity} · {formatPrice(item.discountPrice ?? item.price)}</p>) : <p className="mt-3 text-sm text-ink/55">Cart is empty.</p>}</article>
      <article className="rounded-2xl bg-white p-5"><h2 className="font-serif text-2xl">Wishlist</h2>{data.wishlist.length ? data.wishlist.map((item) => <p key={item.productId} className="border-b border-ink/5 py-3 text-sm">{item.name} · {formatPrice(item.price)}</p>) : <p className="mt-3 text-sm text-ink/55">Wishlist is empty.</p>}</article>
    </div>}
    {tab === "Reviews" && <div className="mt-5 grid gap-3">{data.reviews.length ? data.reviews.map((review) => <article key={review.id} className="flex flex-wrap justify-between gap-4 rounded-2xl bg-white p-5">
      <div><p className="font-semibold">{review.productName} · {review.rating}/5 {review.isApproved ? "" : "· Pending approval"}</p><p className="mt-1 text-sm">{review.title}</p><p className="mt-1 text-sm text-ink/65">{review.body}</p></div>
      <button onClick={async () => {
        if (!window.confirm("Delete this review?")) return;
        const response = await fetch(`/api/admin/reviews?id=${review.id}`, { method: "DELETE" });
        if (!response.ok) { const result = await response.json(); setError(result.error || "Could not delete review."); return; }
        await load();
      }} className="self-start text-sm text-rose-800 underline">Delete review</button>
    </article>) : <Empty>No reviews yet.</Empty>}</div>}
    {tab === "Activity log" && <div className="mt-5 overflow-x-auto rounded-2xl bg-white p-5">
      {data.activity.length ? <div className="divide-y divide-ink/10">{data.activity.map((event) => <div key={event.id} className="py-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong className="capitalize">{event.action.replaceAll("_", " ")}</strong><time className="text-xs text-ink/50">{new Date(event.createdAt).toLocaleString()}</time></div>
        <p className="mt-1 text-xs text-ink/50">Changed by {event.actorName || (event.actorUserId ? "Unknown user" : "System")} {event.actorEmail ? `(${event.actorEmail})` : ""}{event.oldValue ? ` · ${JSON.stringify(event.oldValue)} → ${JSON.stringify(event.newValue)}` : ""}</p>
      </div>)}</div> : <Empty>No activity recorded.</Empty>}
    </div>}
    {tab === "Stats" && <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Lifetime value" value={formatPrice(data.stats.lifetimeValue)} /><Stat label="Average order value" value={formatPrice(data.stats.averageOrderValue)} />
      <Stat label="Returns" value={String(data.stats.returnCount)} /><Stat label="Return rate" value={`${data.stats.returnRate}%`} />
    </div>}
  </section>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white py-12 text-center text-sm text-ink/55">{children}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <article className="rounded-2xl bg-white p-5"><p className="text-sm text-ink/55">{label}</p><p className="mt-2 font-serif text-2xl">{value}</p></article>;
}
