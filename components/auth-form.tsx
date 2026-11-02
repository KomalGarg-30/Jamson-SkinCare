"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";

const formSchema = z.object({ name: z.string().optional(), email: z.email(), password: z.string().min(1) });
type FormValues = z.infer<typeof formSchema>;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: "", email: "", password: "" } });
  async function submit(values: FormValues) {
    if (mode === "signup" && (!values.name || values.name.trim().length < 2 || values.password.length < 10)) {
      form.setError("root", { message: "Enter your name and choose a password with at least 10 characters." });
      return;
    }
    const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
    const result: { error?: string; user?: { role: string } } = await response.json();
    if (!response.ok) { form.setError("root", { message: result.error || "We couldn't complete that request." }); return; }
    toast(mode === "signup" ? "Your account is ready. Welcome!" : "Welcome back.");
    const next = search.get("next");
    const destination = next?.startsWith("/") && !next.startsWith("//") ? next : result.user?.role === "admin" ? "/admin" : "/";
    router.replace(destination);
    router.refresh();
  }
  return <form onSubmit={form.handleSubmit(submit)} className="grid gap-4">
    {mode === "signup" && <label className="grid gap-2 text-sm">Full name<input className="field" autoComplete="name" {...form.register("name")} /></label>}
    <label className="grid gap-2 text-sm">Email address<input className="field" type="email" autoComplete="email" {...form.register("email")} /></label>
    <label className="grid gap-2 text-sm">Password<input className="field" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} {...form.register("password")} /></label>
    {mode === "login" && <div className="text-right text-sm"><Link className="text-sage-dark underline" href="/forgot-password">Forgot password?</Link></div>}
    {form.formState.errors.root && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{form.formState.errors.root.message}</p>}
    <Button size="lg" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</Button>
    <p className="text-center text-sm text-ink/60">{mode === "signup" ? "Already have an account?" : "New to Jamson?"} <Link className="font-medium text-sage-dark underline" href={mode === "signup" ? "/login" : "/signup"}>{mode === "signup" ? "Sign in" : "Create an account"}</Link></p>
  </form>;
}

export function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const formData = new FormData(event.currentTarget);
    const body = reset
      ? { token: search.get("token") || "", password: String(formData.get("password") || "") }
      : { email: String(formData.get("email") || "") };
    const response = await fetch(`/api/auth/${reset ? "reset-password" : "forgot-password"}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const result: { message?: string; error?: string } = await response.json();
    setBusy(false);
    if (!response.ok) { setError(result.error || "Please check your details and try again."); return; }
    toast(result.message || "Done.");
    if (reset) router.replace("/login");
  }
  return <form onSubmit={submit} className="grid gap-4">
    {!reset ? <label className="grid gap-2 text-sm">Email address<input className="field" name="email" type="email" required /></label>
      : <label className="grid gap-2 text-sm">New password<input className="field" name="password" type="password" minLength={10} required /></label>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <Button size="lg" disabled={busy}>{busy ? "Please wait…" : reset ? "Update password" : "Send reset link"}</Button>
    <Link className="text-center text-sm text-sage-dark underline" href="/login">Back to sign in</Link>
  </form>;
}

import React from "react";
