import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default async function CheckoutSuccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <section className="container-page max-w-2xl py-20 text-center"><CheckCircle2 className="mx-auto text-sage-dark" size={60} /><p className="mt-6 text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">It’s on its way</p><h1 className="mt-3 font-serif text-4xl">Thank you for your order</h1><p className="mt-4 text-sm leading-6 text-ink/60">Your order reference is <span className="font-mono">{id.slice(0, 8).toUpperCase()}</span>. You can follow its progress in your account.</p><div className="mt-8 flex justify-center gap-3"><Link className="rounded-full bg-sage-dark px-6 py-3 text-sm text-white" href={`/orders/${id}`}>View order</Link><Link className="rounded-full border border-ink/20 px-6 py-3 text-sm" href="/shop">Continue shopping</Link></div></section>;
}
