"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

type UserRow = {
  id: string; name: string; email: string; phone: string | null; role: "user" | "admin";
  isBlocked: boolean; deletedAt: string | null; createdAt: string; lastLoginAt: string | null;
  totalOrders: number; totalSpent: number;
};
type PageData = {
  users: UserRow[];
  summary: { totalUsers: number; totalAdmins: number; blockedUsers: number; newThisMonth: number };
  pagination: { page: number; pageCount: number; total: number };
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function AdminUsers() {
  const [data, setData] = useState<PageData | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("joined");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ q: query, role, status, sort, page: String(page) });
    let active = true;
    fetch(`/api/admin/users?${params}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load users.");
      if (active) { setData(result); setError(""); }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load users.");
    });
    return () => { active = false; };
  }, [query, role, status, sort, page]);

  function filterChanged(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return <section>
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">People & access</p>
    <h1 className="mt-2 font-serif text-4xl">Users</h1>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Total users", data?.summary.totalUsers],
        ["Admins", data?.summary.totalAdmins],
        ["Blocked users", data?.summary.blockedUsers],
        ["New this month", data?.summary.newThisMonth],
      ].map(([label, count]) => <article key={label} className="rounded-2xl bg-white p-5">
        <p className="text-sm text-ink/55">{label}</p><p className="mt-2 font-serif text-3xl">{count ?? "—"}</p>
      </article>)}
    </div>
    <div className="mt-6 grid gap-3 rounded-2xl bg-white p-4 md:grid-cols-[minmax(200px,1fr)_auto_auto_auto]">
      <input value={query} onChange={(event) => filterChanged(setQuery, event.target.value)}
        placeholder="Search name, email or phone" aria-label="Search users" className="rounded-xl border border-ink/10 px-4 py-2 text-sm" />
      <select aria-label="Filter by role" value={role} onChange={(event) => filterChanged(setRole, event.target.value)} className="rounded-xl border border-ink/10 px-3 py-2 text-sm">
        <option value="all">All roles</option><option value="user">User</option><option value="admin">Admin</option>
      </select>
      <select aria-label="Filter by status" value={status} onChange={(event) => filterChanged(setStatus, event.target.value)} className="rounded-xl border border-ink/10 px-3 py-2 text-sm">
        <option value="all">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option>
      </select>
      <select aria-label="Sort users" value={sort} onChange={(event) => filterChanged(setSort, event.target.value)} className="rounded-xl border border-ink/10 px-3 py-2 text-sm">
        <option value="joined">Joined date</option><option value="spent">Total spent</option><option value="orders">Total orders</option>
      </select>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {!data && !error ? <div className="mt-5 h-56 animate-pulse rounded-2xl bg-sand" /> : data?.users.length ? <>
      <div className="mt-5 hidden overflow-x-auto rounded-2xl bg-white md:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/50"><tr>
            <th className="px-5 py-4">User</th><th className="px-3 py-4">Phone</th><th className="px-3 py-4">Role</th>
            <th className="px-3 py-4">Status</th><th className="px-3 py-4">Joined</th><th className="px-3 py-4">Orders</th>
            <th className="px-3 py-4">Spent</th><th className="px-3 py-4">Last login</th>
          </tr></thead>
          <tbody>{data.users.map((user) => <tr key={user.id} className="border-b border-ink/5 last:border-0">
            <td className="px-5 py-4"><Link className="flex items-center gap-3 hover:text-sage-dark" href={`/admin/users/${user.id}`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sand text-xs font-semibold">{initials(user.name)}</span>
              <span><strong className="block">{user.name}</strong><span className="text-xs text-ink/55">{user.email}</span></span>
            </Link></td>
            <td className="px-3 py-4">{user.phone || "—"}</td>
            <td className="px-3 py-4"><span className="rounded-full bg-sage/10 px-2.5 py-1 text-xs capitalize text-sage-dark">{user.role}</span></td>
            <td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${user.deletedAt ? "bg-ink/10 text-ink/60" : user.isBlocked ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>{user.deletedAt ? "Deleted" : user.isBlocked ? "Blocked" : "Active"}</span></td>
            <td className="px-3 py-4">{new Date(user.createdAt).toLocaleDateString()}</td><td className="px-3 py-4">{user.totalOrders}</td>
            <td className="px-3 py-4">{formatPrice(user.totalSpent)}</td><td className="px-3 py-4">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="mt-5 grid gap-3 md:hidden">{data.users.map((user) => <Link key={user.id} href={`/admin/users/${user.id}`} className="rounded-2xl bg-white p-4">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-sand text-xs font-semibold">{initials(user.name)}</span>
          <div className="min-w-0 flex-1"><strong className="block truncate">{user.name}</strong><span className="block truncate text-xs text-ink/55">{user.email}</span></div>
          <span className={`rounded-full px-2 py-1 text-xs ${user.isBlocked ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>{user.deletedAt ? "Deleted" : user.isBlocked ? "Blocked" : "Active"}</span>
          </div><p className="mt-3 text-xs text-ink/55">{user.phone || "No phone"} · Joined {new Date(user.createdAt).toLocaleDateString()} · Last login {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}</p>
          <p className="mt-1 text-xs capitalize text-ink/55">{user.role} · {user.totalOrders} orders · {formatPrice(user.totalSpent)}</p>
      </Link>)}</div>
      <div className="mt-5 flex items-center justify-between text-sm">
        <p className="text-ink/55">{data.pagination.total} users</p>
        <div className="flex items-center gap-3"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-ink/10 px-3 py-2 disabled:opacity-40">Previous</button>
          <span>Page {page} of {Math.max(data.pagination.pageCount, 1)}</span>
          <button disabled={page >= data.pagination.pageCount} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-ink/10 px-3 py-2 disabled:opacity-40">Next</button>
        </div>
      </div>
    </> : !error && <div className="mt-5 rounded-2xl bg-white py-14 text-center text-sm text-ink/55">No users match these filters.</div>}
  </section>;
}
