"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { OtpVerificationForm } from "@/components/otp-verification-form";

export function OtpVerificationPage({ purpose }: { purpose: "signup" | "password_reset" }) {
  const search = useSearchParams();
  const email = search.get("email")?.trim().toLowerCase() || "";
  const next = search.get("next") || undefined;
  const title = purpose === "signup" ? "Verify your email" : "Check your email";

  return <section className="container-page max-w-lg py-16 md:py-24">
    <div className="rounded-3xl bg-white p-8 shadow-sm sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">A little more personal</p>
      <h1 className="mt-3 font-serif text-3xl">{title}</h1>
      {email ? <div className="mt-6"><OtpVerificationForm email={email} purpose={purpose} next={next} /></div> : <>
        <p className="mt-4 text-sm leading-6 text-ink/60">Start again to request a verification code.</p>
        <Link className="mt-5 inline-block text-sm text-sage-dark underline" href={purpose === "signup" ? "/signup" : "/forgot-password"}>Continue</Link>
      </>}
    </div>
  </section>;
}
