import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopExplorer } from "@/components/shop-explorer";

export const metadata: Metadata = { title: "Shop all care" };

export default function ShopPage() {
  return <section className="container-page py-12 md:py-16">
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">The collection</p>
    <h1 className="mt-3 font-serif text-4xl md:text-5xl">Find your everyday.</h1>
    <p className="mt-4 max-w-xl leading-7 text-ink/65">Explore thoughtful essentials for your skin, hair, body and wellbeing.</p>
    <Suspense fallback={<div className="mt-10 h-96 animate-pulse rounded-2xl bg-sand" />}><ShopExplorer /></Suspense>
  </section>;
}
