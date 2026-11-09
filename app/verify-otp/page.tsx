import { Suspense } from "react";
import { OtpVerificationPage } from "@/components/otp-verification-page";

export default function VerifyOtpPage() {
  return <Suspense fallback={<div className="container-page max-w-lg py-20"><div className="h-64 animate-pulse rounded-3xl bg-sand" /></div>}>
    <OtpVerificationPage purpose="password_reset" />
  </Suspense>;
}
