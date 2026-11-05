import { Suspense } from "react";
import { RecoveryForm } from "@/components/auth-form";

export default function ForgotPasswordPage() {
  return <section className="container-page max-w-lg py-20"><div className="rounded-3xl bg-white p-8 shadow-sm"><h1 className="font-serif text-3xl">Reset your password</h1><p className="mb-6 mt-3 text-sm leading-6 text-ink/60">Enter your email. In local development, a secure reset link appears here; on the live site, it is sent by email.</p><Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-sand" />}><RecoveryForm /></Suspense></div></section>;
}
