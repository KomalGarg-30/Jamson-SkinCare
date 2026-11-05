"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { ReturnRequestForm } from "@/components/return-request-form";
import { StoreImage } from "@/components/store-image";

const sections = ["Overview", "My Orders", "My Returns", "My Payments", "Addresses", "Wishlist", "My Reviews", "Profile & Security"] as const;
type Section = typeof sections[number];
type AccountData = {
  user: { id: string; name: string; email: string; phone: string | null; role: string; createdAt: string; lastLoginAt: string | null };
  orders: { id: string; status: string; paymentStatus: string; paymentMethod: string; total: number; createdAt: string }[];
  items: { id: string; orderId: string; productId: string | null; productName: string; quantity: number; unitPrice: number; image: string | null }[];
  addresses: { id: string; name: string; phone: string; line1: string; line2: string | null; city: string; state: string; pincode: string; country: string; isDefault: boolean }[];
  cart: { productId: string; name: string; slug: string; quantity: number; price: number; discountPrice: number | null; stock: number }[];
  wishlist: { productId: string; name: string; slug: string; price: number; image: string | null }[];
  reviews: { id: string; productId: string; orderId: string; productName: string; rating: number; title: string | null; body: string; isApproved: boolean; createdAt: string }[];
  returns: { id: string; orderId: string; reason: string; comment: string | null; photos: string[]; status: string; refundAmount: number; providerRefundId: string | null; refundedAt: string | null; adminNotes: string | null; createdAt: string }[];
  returnItems: { returnId: string; productName: string; quantity: number; unitPrice: number }[];
  payments: { id: string; orderId: string; provider: string; providerPaymentId: string | null; amount: number; status: string; createdAt: string }[];
  activity: { id: string; action: string; createdAt: string }[];
  stats: { totalOrders: number; totalSpent: number; activeReturns: number; averageOrderValue: number };
};

const orderSteps = ["pending", "confirmed", "shipped", "delivered"];
const returnSteps = ["requested", "approved", "picked_up", "received", "refunded"];

export function AccountDashboard() {
  const [data, setData] = useState<AccountData | null>(null);
  const [section, setSection] = useState<Section>("Overview");
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const response = await fetch("/api/account");
    if (response.status === 401) { router.replace(`/login?next=${encodeURIComponent("/account")}`); return; }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load your account.");
    setData(result);
    setError("");
  }, [router]);

  useEffect(() => {
    let active = true;
    load().catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load your account."); });
    return () => { active = false; };
  }, [load]);

  async function runAction(action: () => Promise<void>, success?: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); if (success) setNotice(success); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The request could not be completed."); }
    finally { setBusy(false); }
  }

  async function cancelOrder(orderId: string) {
    if (!window.confirm("Cancel this order?")) return;
    await runAction(async () => {
      const response = await fetch("/api/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "This order cannot be cancelled.");
    }, "Order cancelled.");
  }

  async function reorder(orderId: string) {
    await runAction(async () => {
      const items = data?.items.filter((item) => item.orderId === orderId) ?? [];
      for (const item of items) {
        if (!item.productId) continue;
        const response = await fetch("/api/cart", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ productId: item.productId, quantity: Math.min(item.quantity, 20) }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Could not add ${item.productName} to your cart.`);
      }
    }, "Available items have been added to your cart.");
  }

  async function updateAddressDefault(addressId: string) {
    await runAction(async () => {
      const response = await fetch("/api/addresses", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: addressId, isDefault: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update address.");
    }, "Default address updated.");
  }

  async function deleteAddress(addressId: string) {
    if (!window.confirm("Delete this saved address?")) return;
    await runAction(async () => {
      const response = await fetch(`/api/addresses?id=${addressId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete address.");
    }, "Address deleted.");
  }

  async function removeWishlist(productId: string) {
    await runAction(async () => {
      const response = await fetch("/api/wishlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update wishlist.");
    }, "Item removed from wishlist.");
  }

  async function removeReview(reviewId: string) {
    if (!window.confirm("Delete this review?")) return;
    await runAction(async () => {
      const response = await fetch(`/api/reviews?id=${reviewId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete review.");
    }, "Review deleted.");
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const payload: Record<string, string> = {
      name: String(values.name || ""), email: String(values.email || ""), phone: String(values.phone || ""),
    };
    if (values.currentPassword) payload.currentPassword = String(values.currentPassword);
    if (values.newPassword) payload.newPassword = String(values.newPassword);
    await runAction(async () => {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update your profile.");
      form.reset();
    }, "Profile updated.");
  }

  async function deleteAccount() {
    if (!window.confirm("Request account deletion? You will be signed out and your order records will be retained.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not request account deletion.");
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not request account deletion."); }
    finally { setBusy(false); }
  }

  if (!data) return <section className="container-page py-14"><div className="h-64 animate-pulse rounded-2xl bg-sand" /></section>;

  return <section className="container-page py-12">
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Your account</p>
    <h1 className="mt-2 font-serif text-4xl">Welcome, {data.user.name}</h1>
    <div className="mt-7 grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Account sections" className="grid h-fit grid-cols-2 gap-1 rounded-2xl bg-white p-3 sm:grid-cols-4 lg:sticky lg:top-24 lg:grid-cols-1">
        {sections.map((item) => <button key={item} role="tab" aria-selected={section === item} onClick={() => setSection(item)}
          className={`rounded-xl px-3 py-2.5 text-left text-sm ${section === item ? "bg-sage text-white" : "text-ink/65 hover:bg-sand"}`}>{item}</button>)}
      </nav>
      <div className="min-w-0">
        {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
        {section === "Overview" && <div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Total orders" value={String(data.stats.totalOrders)} />
            <Summary label="Total spent" value={formatPrice(data.stats.totalSpent)} />
            <Summary label="Active returns" value={String(data.stats.activeReturns)} />
          </div>
          <div className="mt-5 rounded-2xl bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-serif text-2xl">Recent orders</h2><button className="text-sm text-sage-dark underline" onClick={() => setSection("My Orders")}>View all</button></div>
            {data.orders.slice(0, 3).map((order) => <OrderCard key={order.id} order={order} items={data.items.filter((item) => item.orderId === order.id)} onCancel={() => void cancelOrder(order.id)} onReorder={() => void reorder(order.id)} />)}
            {!data.orders.length && <Empty>No orders yet.</Empty>}
          </div>
        </div>}
        {section === "My Orders" && <div className="grid gap-4">
          <h2 className="font-serif text-2xl">My orders</h2>
          {data.orders.length ? data.orders.map((order) => <div key={order.id} className="rounded-2xl bg-white p-5">
            <OrderCard order={order} items={data.items.filter((item) => item.orderId === order.id)} onCancel={() => void cancelOrder(order.id)} onReorder={() => void reorder(order.id)} />
            {order.status === "delivered" && <button onClick={() => setReturnOrderId(returnOrderId === order.id ? null : order.id)} className="mt-4 text-sm text-sage-dark underline">Start a return</button>}
            {returnOrderId === order.id && <ReturnRequestForm orderId={order.id} onCancel={() => setReturnOrderId(null)} onSubmitted={() => { setReturnOrderId(null); setNotice("Return request submitted."); void load(); }} />}
          </div>) : <Empty>No orders yet. <Link href="/shop" className="text-sage-dark underline">Shop skincare essentials</Link></Empty>}
        </div>}
        {section === "My Returns" && <div>
          <h2 className="font-serif text-2xl">My returns</h2>
          {data.returns.length ? <div className="mt-4 grid gap-3">{data.returns.map((item) => <article key={item.id} className="rounded-2xl bg-white p-5">
            <div className="flex flex-wrap justify-between gap-3"><div><p className="font-mono text-sm">Return #{item.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs text-ink/55">Order #{item.orderId.slice(0, 8).toUpperCase()} · {item.reason.replace("_", " ")}</p></div><Status value={item.status} /></div>
            <div className="mt-4 flex flex-wrap gap-2">{item.status === "rejected" ? <span className="text-sm text-rose-800">Return request rejected</span> : returnSteps.map((step, index) => {
              const statusIndex = returnSteps.indexOf(item.status);
              return <span key={step} className={`rounded-full px-2.5 py-1 text-xs capitalize ${index <= statusIndex ? "bg-emerald-100 text-emerald-800" : "bg-sand text-ink/50"}`}>{step.replace("_", " ")}</span>;
            })}</div>
            <div className="mt-3 grid gap-1 text-sm text-ink/65">{data.returnItems.filter((row) => row.returnId === item.id).map((row, index) => <p key={`${item.id}-${index}`}>{row.productName} × {row.quantity}</p>)}</div>
            {item.photos.length > 0 && <div className="mt-2 flex flex-wrap gap-3">{item.photos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer" className="text-xs text-sage-dark underline">View photo</a>)}</div>}
            <p className="mt-3 text-sm">Refund amount: {formatPrice(item.refundAmount)}{item.refundedAt ? ` · Refunded ${new Date(item.refundedAt).toLocaleDateString()}` : ""}</p>
            {item.providerRefundId && <p className="mt-1 break-all text-xs text-ink/50">Refund reference: {item.providerRefundId}</p>}
            {item.adminNotes && <p className="mt-2 text-sm text-ink/60">Update: {item.adminNotes}</p>}
          </article>)}</div> : <Empty>No returns yet. You can start one from a delivered order.</Empty>}
        </div>}
        {section === "My Payments" && <div>
          <h2 className="font-serif text-2xl">My payments</h2>
          <div className="mt-4 grid gap-3">{data.payments.map((payment) => <article key={payment.id} className="flex flex-wrap justify-between gap-3 rounded-2xl bg-white p-5 text-sm">
            <div><p>Order #{payment.orderId.slice(0, 8).toUpperCase()}</p><p className="mt-1 capitalize text-ink/55">{payment.provider} · {payment.providerPaymentId || "COD"} · {payment.status}</p><p className="mt-1 text-xs text-ink/50">{new Date(payment.createdAt).toLocaleDateString()}</p></div><strong>{formatPrice(payment.amount)}</strong>
          </article>)}
            {data.returns.filter((item) => item.status === "refunded").map((item) => <article key={item.id} className="flex justify-between rounded-2xl bg-emerald-50 p-5 text-sm"><span>Refund for order #{item.orderId.slice(0, 8).toUpperCase()}</span><strong>-{formatPrice(item.refundAmount)}</strong></article>)}
            {!data.payments.length && !data.returns.some((item) => item.status === "refunded") && <Empty>No payments or refunds yet.</Empty>}
          </div>
        </div>}
        {section === "Addresses" && <div>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl">Saved addresses</h2><Link href="/profile" className="text-sm text-sage-dark underline">Add or edit addresses</Link></div>
          <div className="mt-4 grid gap-3">{data.addresses.map((address) => <article key={address.id} className="rounded-2xl bg-white p-5">
            <p className="font-semibold">{address.name} · {address.phone} {address.isDefault && <span className="ml-1 text-xs text-sage-dark">Default</span>}</p>
            <p className="mt-1 text-sm text-ink/65">{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} {address.pincode}, {address.country}</p>
            <div className="mt-3 flex gap-4 text-xs">{!address.isDefault && <button disabled={busy} onClick={() => void updateAddressDefault(address.id)} className="text-sage-dark underline">Set as default</button>}<button disabled={busy} onClick={() => void deleteAddress(address.id)} className="text-rose-800 underline">Delete</button></div>
          </article>)}
            {!data.addresses.length && <Empty>No saved addresses yet. <Link href="/profile" className="text-sage-dark underline">Add an address</Link></Empty>}
          </div>
        </div>}
        {section === "Wishlist" && <div><h2 className="font-serif text-2xl">Wishlist</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.wishlist.map((item) => <article key={item.productId} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4"><div className="flex items-center gap-3"><StoreImage src={item.image} alt={item.name} width={100} height={100} className="h-14 w-14 rounded-lg object-cover" /><div><Link href={`/products/${item.slug}`} className="font-medium underline">{item.name}</Link><p className="mt-1 text-sm text-ink/55">{formatPrice(item.price)}</p></div></div><button disabled={busy} onClick={() => void removeWishlist(item.productId)} className="text-xs text-rose-800 underline">Remove</button></article>)}
          {!data.wishlist.length && <Empty>Your wishlist is empty.</Empty>}
        </div></div>}
        {section === "My Reviews" && <div><h2 className="font-serif text-2xl">My reviews</h2><div className="mt-4 grid gap-3">
          {data.reviews.map((review) => <article key={review.id} className="rounded-2xl bg-white p-5">
            <div className="flex justify-between gap-3"><div><Link href={`/products/${review.productId}`} className="font-medium underline">{review.productName}</Link><p className="mt-1 text-sm">{review.rating}/5 · {review.title || "Review"}</p></div><button disabled={busy} onClick={() => void removeReview(review.id)} className="text-sm text-rose-800 underline">Delete</button></div>
            <p className="mt-2 text-sm text-ink/65">{review.body}</p><p className="mt-2 text-xs text-ink/50">{review.isApproved ? "Published" : "Awaiting approval"} · {new Date(review.createdAt).toLocaleDateString()}</p>
          </article>)}
          {!data.reviews.length && <Empty>No reviews yet.</Empty>}
        </div></div>}
        {section === "Profile & Security" && <div>
          <h2 className="font-serif text-2xl">Profile & security</h2>
          <form onSubmit={saveProfile} className="mt-4 grid gap-4 rounded-2xl bg-white p-5 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Name<input className="field" name="name" defaultValue={data.user.name} required minLength={2} /></label>
            <label className="grid gap-1 text-sm">Email<input className="field" name="email" type="email" defaultValue={data.user.email} required /></label>
            <label className="grid gap-1 text-sm sm:col-span-2">Phone<input className="field" name="phone" defaultValue={data.user.phone || ""} /></label>
            <div className="grid gap-3 border-t border-ink/10 pt-4 sm:col-span-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Current password<input className="field" name="currentPassword" type="password" autoComplete="current-password" /></label>
              <label className="grid gap-1 text-sm">New password<input className="field" name="newPassword" type="password" minLength={10} autoComplete="new-password" /></label>
            </div>
            <p className="text-xs text-ink/55 sm:col-span-2">Last login: {data.user.lastLoginAt ? new Date(data.user.lastLoginAt).toLocaleString() : "Not available"}</p>
            <button disabled={busy} className="rounded-full bg-sage px-4 py-2 text-sm text-white sm:col-span-2">Save changes</button>
          </form>
          <div className="mt-5 rounded-2xl bg-white p-5"><h3 className="font-serif text-xl">Recent account activity</h3>
            {data.activity.length ? <ul className="mt-3 grid gap-2 text-sm">{data.activity.map((item) => <li key={item.id} className="flex justify-between gap-3"><span className="capitalize">{item.action.replaceAll("_", " ")}</span><time className="text-xs text-ink/50">{new Date(item.createdAt).toLocaleString()}</time></li>)}</ul> : <p className="mt-3 text-sm text-ink/55">No recent activity.</p>}
          </div>
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5"><h3 className="font-serif text-xl">Delete account</h3><p className="mt-2 text-sm text-ink/65">Your access will be disabled. Order records will be retained for store records.</p><button disabled={busy} onClick={() => void deleteAccount()} className="mt-4 rounded-full bg-rose-700 px-4 py-2 text-sm text-white">Request account deletion</button></div>
        </div>}
      </div>
    </div>
  </section>;
}

function OrderCard({ order, items, onCancel, onReorder }: {
  order: AccountData["orders"][number]; items: AccountData["items"]; onCancel: () => void; onReorder: () => void;
}) {
  const currentStep = orderSteps.indexOf(order.status);
  return <article className="mt-4 rounded-xl border border-ink/5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/orders/${order.id}`} className="font-mono text-sm underline">Order #{order.id.slice(0, 8).toUpperCase()}</Link>
      <p className="mt-1 text-xs text-ink/55">{new Date(order.createdAt).toLocaleDateString()} · <Status value={order.status} /></p></div><strong>{formatPrice(order.total)}</strong></div>
    {order.status === "cancelled" ? <p className="mt-3 text-xs text-rose-800">Order cancelled</p> : <div className="mt-3 flex flex-wrap gap-2">{orderSteps.map((step, index) => <span key={step} className={`rounded-full px-2.5 py-1 text-[11px] capitalize ${index <= currentStep ? "bg-emerald-100 text-emerald-800" : "bg-sand text-ink/50"}`}>{step}</span>)}</div>}
    <div className="mt-3 grid gap-2 text-sm text-ink/65">{items.map((item) => <div key={item.id} className="flex items-center gap-2"><StoreImage src={item.image} alt={item.productName} width={80} height={80} className="h-10 w-10 rounded object-cover" /><span>{item.productName} × {item.quantity}</span></div>)}</div>
    <div className="mt-4 flex flex-wrap gap-4 text-xs"><a href={`/api/orders/${order.id}/invoice`} className="text-sage-dark underline">Download invoice PDF</a>
      {["pending", "confirmed"].includes(order.status) && <button onClick={onCancel} className="text-rose-800 underline">Cancel order</button>}
      <button onClick={onReorder} className="text-sage-dark underline">Re-order</button>
    </div>
  </article>;
}

function Status({ value }: { value: string }) {
  const tone = ["delivered", "paid", "refunded", "received"].includes(value) ? "text-emerald-800" :
    ["cancelled", "rejected", "failed"].includes(value) ? "text-rose-800" : "text-amber-800";
  return <span className={`capitalize ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <article className="rounded-2xl bg-white p-5"><p className="text-sm text-ink/55">{label}</p><p className="mt-2 font-serif text-2xl">{value}</p></article>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white py-12 text-center text-sm text-ink/55">{children}</div>;
}
