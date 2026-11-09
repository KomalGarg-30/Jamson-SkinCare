"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";

type Payment = { id: string; orderId: string; amount: number; status: string; method: string | null; providerPaymentId: string | null; refundedAmount: number; refundStatus: string | null; createdAt: string };

export default function PaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => {
    fetch("/api/payments").then(async (response) => {
      const data = await response.json();
      if (response.status === 401) { router.push("/login?next=/payments"); return; }
      if (!response.ok) setError(data.error || "Unable to load payment history.");
      else setRows(data.payments || []);
    }).catch(() => setError("Unable to load payment history."));
  }, [router]);
  return <main className="container-page py-12"><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Account</p><h1 className="mt-2 font-serif text-4xl">My payments</h1>{error && <p className="mt-5 text-sm text-rose-800">{error}</p>}<div className="mt-8 grid gap-3">{rows.map((payment) => <article key={payment.id} className="rounded-2xl bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-mono text-xs">Order {payment.orderId.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-sm capitalize">{payment.status} {payment.method ? `· ${payment.method}` : ""}</p></div><strong>{formatPrice(payment.amount)}</strong></div><p className="mt-3 text-xs text-ink/55">{new Date(payment.createdAt).toLocaleString()} {payment.refundStatus ? `· Refund ${payment.refundStatus}` : ""}</p>{payment.status === "created" || payment.status === "failed" ? <Link className="mt-3 inline-block text-sm text-sage-dark underline" href={`/orders/${payment.orderId}`}>Retry payment</Link> : null}</article>)}{!rows.length && !error && <p className="text-sm text-ink/55">No payments found.</p>}</div></main>;
}
