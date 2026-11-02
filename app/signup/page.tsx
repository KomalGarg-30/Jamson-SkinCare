import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return <section className="container-page max-w-xl py-16 md:py-24"><div className="rounded-3xl bg-white p-7 shadow-sm sm:p-10">
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">A little more personal</p><h1 className="mt-3 font-serif text-4xl">Create your account</h1><p className="mb-8 mt-3 text-sm leading-6 text-ink/60">Save your favourites, keep track of orders and make checkout a breeze.</p><Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-sand" />}><AuthForm mode="signup" /></Suspense>
  </div></section>;
}
