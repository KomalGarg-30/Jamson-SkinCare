"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { passwordSchema } from "@/lib/validation";

const formSchema = z.object({
  name: z.string().optional(),
  email: z.email(),
  phone: z.string().optional(),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof formSchema>;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: "", email: "", phone: "", password: "" } });

  async function submit(values: FormValues) {
    if (mode === "signup" && (!values.name || values.name.trim().length < 2 || !values.phone || values.phone.trim().length < 7)) {
      form.setError("root", { message: "Enter your name and phone number." });
      return;
    }
    if (mode === "signup") {
      const passwordResult = passwordSchema.safeParse(values.password);
      if (!passwordResult.success) {
        form.setError("root", { message: passwordResult.error.issues[0]?.message || "Choose a stronger password." });
        return;
      }
    }
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result: { error?: string; user?: { role: string }; email?: string; verificationRequired?: boolean } = await response.json();
      if (!response.ok) {
        if (mode === "signup" && result.email) {
          toast("Your verification code was sent. Enter it to continue.");
          router.replace(`/verify-email?email=${encodeURIComponent(result.email)}`);
          return;
        }
        if (result.verificationRequired) {
          const email = result.email || values.email.trim().toLowerCase();
          const next = search.get("next");
          const nextQuery = next?.startsWith("/") && !next.startsWith("//") ? `&next=${encodeURIComponent(next)}` : "";
          router.replace(`/verify-email?email=${encodeURIComponent(email)}${nextQuery}`);
          return;
        }
        const message = result.error || "We couldn't complete that request.";
        form.setError("root", { message });
        toast(message);
        return;
      }
      if (mode === "signup" || result.verificationRequired) {
        const email = result.email || values.email.trim().toLowerCase();
        toast("Check your inbox for your verification code.");
        const next = search.get("next");
        const nextQuery = next?.startsWith("/") && !next.startsWith("//") ? `&next=${encodeURIComponent(next)}` : "";
        router.replace(`/verify-email?email=${encodeURIComponent(email)}${nextQuery}`);
        return;
      }
      toast("Welcome back.");
      const next = search.get("next");
      const destination = next?.startsWith("/") && !next.startsWith("//") ? next : result.user?.role === "admin" ? "/admin" : "/";
      router.replace(destination);
      router.refresh();
    } catch {
      const message = "We couldn't complete that request. Please try again.";
      form.setError("root", { message });
      toast(message);
    }
  }

  const googleHref = `/api/auth/google${search.get("next") ? `?next=${encodeURIComponent(search.get("next") || "")}` : ""}`;
  return <div className="grid gap-4"><a href={googleHref} className="flex h-12 items-center justify-center gap-3 rounded-full border border-ink/15 bg-white text-sm font-medium hover:bg-sand"><span className="text-base font-semibold">G</span> Continue with Google</a><div className="flex items-center gap-3 text-xs text-ink/40"><span className="h-px flex-1 bg-ink/10" /><span>or</span><span className="h-px flex-1 bg-ink/10" /></div><form onSubmit={form.handleSubmit(submit)} className="grid gap-4">
    {mode === "signup" && <>
      <label className="grid gap-2 text-sm">Full name<input className="field" autoComplete="name" {...form.register("name")} /></label>
      <label className="grid gap-2 text-sm">Phone number<input className="field" type="tel" autoComplete="tel" {...form.register("phone")} /></label>
    </>}
    <label className="grid gap-2 text-sm">Email address<input className="field" type="email" autoComplete="email" {...form.register("email")} /></label>
    <label className="grid gap-2 text-sm">Password<input className="field" type="password" minLength={mode === "signup" ? 10 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} {...form.register("password")} />{mode === "signup" && <span className="text-xs text-ink/55">Use 10+ characters with uppercase, lowercase, a number, and a special character.</span>}</label>
    {mode === "login" && <div className="text-right text-sm"><Link className="text-sage-dark underline" href="/forgot-password">Forgot password?</Link></div>}
    {form.formState.errors.root && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{form.formState.errors.root.message}</p>}
    <Button size="lg" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</Button>
    <p className="text-center text-sm text-ink/60">{mode === "signup" ? "Already have an account?" : "New to Decotrin?"} <Link className="font-medium text-sage-dark underline" href={mode === "signup" ? "/login" : "/signup"}>{mode === "signup" ? "Sign in" : "Create an account"}</Link></p>
  </form></div>;
}

function passwordStrength(password: string) {
  return [
    password.length >= 10,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
}

export function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const score = passwordStrength(password);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const confirmPassword = String(formData.get("confirmPassword") || "");
      if (reset && password !== confirmPassword) {
        setError("Your passwords don't match.");
        return;
      }
      if (reset) {
        const passwordResult = passwordSchema.safeParse(password);
        if (!passwordResult.success) {
          setError(passwordResult.error.issues[0]?.message || "Choose a stronger password.");
          return;
        }
      }
      const response = await fetch(`/api/auth/${reset ? "reset-password" : "forgot-password"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reset
          ? { resetToken: search.get("resetToken") || "", password }
          : { email }),
      });
      const result: { message?: string; error?: string } = await response.json();
      if (!response.ok) {
        const message = result.error || "Please check your details and try again.";
        setError(message);
        toast(message);
        return;
      }
      if (!reset) {
        toast(result.message || "If this email is registered, an OTP has been sent.");
        router.replace(`/verify-otp?email=${encodeURIComponent(email)}`);
        return;
      }
      toast(result.message || "Your password was changed.");
      router.replace("/login");
    } catch {
      const message = "We couldn't complete that request. Please try again.";
      setError(message);
      toast(message);
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="grid gap-4">
    {!reset ? <label className="grid gap-2 text-sm">Email address<input className="field" name="email" type="email" autoComplete="email" required /></label> : <>
      <label className="grid gap-2 text-sm">New password<input className="field" name="password" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /><span className="text-xs text-ink/55">Use 10+ characters with uppercase, lowercase, a number, and a special character.</span></label>
      <div aria-live="polite" className="text-xs text-ink/60">Password strength: {password.length === 0 ? "Not entered" : ["Weak", "Fair", "Good", "Strong"][Math.max(0, score - 1)]}</div>
      <label className="grid gap-2 text-sm">Confirm new password<input className="field" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label>
    </>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <Button size="lg" disabled={busy}>{busy ? "Please wait…" : reset ? "Update password" : "Send verification code"}</Button>
    <Link className="text-center text-sm text-sage-dark underline" href="/login">Back to sign in</Link>
  </form>;
}
