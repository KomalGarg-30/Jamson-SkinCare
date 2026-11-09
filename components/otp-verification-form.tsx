"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";

type Props = { email: string; purpose: "signup" | "password_reset"; next?: string };

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.slice(0, Math.min(2, name.length))}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
}

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function OtpVerificationForm({ email, purpose, next }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [length, setLength] = useState(6);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const loadStatus = useCallback(async () => {
    const response = await fetch(`/api/auth/otp-status?email=${encodeURIComponent(email)}&purpose=${purpose}`, { cache: "no-store" });
    const result: { error?: string; remainingSeconds?: number; otpLength?: number } = await response.json();
    if (!response.ok) {
      setError(result.error || "This verification session has expired. Start again.");
      return;
    }
    if (result.otpLength && result.otpLength !== length) {
      setLength(result.otpLength);
      setDigits(Array(result.otpLength).fill(""));
    }
    setRemaining(result.remainingSeconds || 0);
  }, [email, length, purpose]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  async function submitCode(code: string) {
    if (busy || code.length !== length) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${purpose === "signup" ? "verify-email" : "verify-otp"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const result: { error?: string; resetToken?: string } = await response.json();
      if (!response.ok) {
        const message = result.error || "We couldn't verify that code.";
        setError(message);
        toast(message);
        return;
      }
      if (purpose === "signup") {
        toast("Your email is verified. Welcome to Decotrin.");
        const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
        router.replace(destination);
        router.refresh();
      } else if (result.resetToken) {
        router.replace(`/reset-password?resetToken=${encodeURIComponent(result.resetToken)}`);
      }
    } catch {
      const message = "We couldn't verify that code. Please try again.";
      setError(message);
      toast(message);
    } finally {
      setBusy(false);
    }
  }

  function updateDigit(index: number, input: string) {
    const value = input.replace(/\D/g, "").slice(-1);
    const updated = [...digits];
    updated[index] = value;
    setDigits(updated);
    setError("");
    if (value && index < length - 1) refs.current[index + 1]?.focus();
    const code = updated.join("");
    if (code.length === length && updated.every(Boolean)) void submitCode(code);
  }

  function pasteCode(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    const updated = Array.from({ length }, (_, index) => pasted[index] || "");
    setDigits(updated);
    setError("");
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
    if (pasted.length === length) void submitCode(pasted);
  }

  async function resend() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, purpose }),
      });
      const result: { error?: string; message?: string; remainingSeconds?: number; lastSentAt?: string } = await response.json();
      if (!response.ok) {
        const message = result.error || "We couldn't send another code.";
        setError(message);
        toast(message);
        if (result.remainingSeconds) setRemaining(result.remainingSeconds);
        return;
      }
      if (purpose === "signup") toast("A new verification code has been sent.");
      const status = await fetch(`/api/auth/otp-status?email=${encodeURIComponent(email)}&purpose=${purpose}`, { cache: "no-store" });
      if (status.ok) {
        const state = await status.json() as { remainingSeconds?: number };
        setRemaining(state.remainingSeconds || 0);
      }
      setDigits(Array(length).fill(""));
      refs.current[0]?.focus();
    } catch {
      const message = "We couldn't send another code. Please try again.";
      setError(message);
      toast(message);
    } finally {
      setBusy(false);
    }
  }

  const changeEmailHref = purpose === "signup" ? "/signup" : "/forgot-password";
  const genericPasswordMessage = "If this email is registered, an OTP has been sent.";

  return <div className="grid gap-5">
    <div>
      <p className="text-sm leading-6 text-ink/60">{purpose === "signup" ? "Enter the code we sent to" : "Enter the code sent to"} <strong className="text-ink">{maskEmail(email)}</strong>.</p>
      {purpose === "password_reset" && <p className="mt-1 text-xs text-ink/50">{genericPasswordMessage}</p>}
    </div>
    <div role="group" aria-label="One-time verification code" className="flex justify-between gap-2">
      {digits.map((digit, index) => <input
        key={index}
        ref={(element) => { refs.current[index] = element; }}
        aria-label={`Digit ${index + 1} of ${length}`}
        aria-invalid={Boolean(error)}
        className="field h-12 w-11 p-0 text-center text-lg font-semibold sm:h-14 sm:w-14"
        value={digit}
        inputMode="numeric"
        autoComplete={index === 0 ? "one-time-code" : "off"}
        pattern="[0-9]*"
        maxLength={1}
        autoFocus={index === 0}
        disabled={busy}
        onChange={(event) => updateDigit(index, event.target.value)}
        onPaste={pasteCode}
        onKeyDown={(event) => {
          if (event.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus();
          if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
          if (event.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
        }}
      />)}
    </div>
    <p aria-live="polite" className="text-center text-sm text-ink/60">
      {remaining > 0 ? `Resend OTP in ${formatTime(remaining)}` : "You can request a new code now."}
    </p>
    {error && <p role="alert" aria-live="assertive" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {busy && <p className="sr-only" aria-live="polite">Please wait while we verify your code.</p>}
    <Button size="lg" type="button" onClick={() => void resend()} disabled={busy || remaining > 0}>
      {busy ? "Please wait…" : "Resend OTP"}
    </Button>
    <Link className="text-center text-sm text-sage-dark underline" href={changeEmailHref}>Change email</Link>
  </div>;
}
