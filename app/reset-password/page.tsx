import { Suspense } from "react";
import { RecoveryForm } from "@/components/auth-form";

export default function ResetPasswordPage() {
  return <section className="container-page max-w-lg py-20"><div className="rounded-3xl bg-white p-8 shadow-sm"><h1 className="font-serif text-3xl">Choose a new password</h1><p className="mb-6 mt-3 text-sm text-ink/60">Use 10+ characters with uppercase, lowercase, a number, and a special character. This reset session expires after 10 minutes.</p><Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-sand" />}><RecoveryForm reset /></Suspense></div></section>;
}
