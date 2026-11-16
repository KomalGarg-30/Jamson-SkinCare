"use client";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";

export default function ContactPage() {
  const [busy, setBusy] = useState(false); const toast = useToast();
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); try { const response = await fetch("/api/contact", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not send your message."); event.currentTarget.reset(); toast("Thanks. We will be in touch."); } catch (error) { toast(error instanceof Error ? error.message : "Could not send your message.", "error"); } finally { setBusy(false); } }
  return <main className="container-page max-w-2xl py-16"><p className="eyebrow">Decotrin care team</p><h1 className="mt-3 font-serif text-5xl">Contact us</h1><p className="mt-5 text-lg leading-8 text-ink/65">Questions about an order or product? Send us a note and we will get back to you.</p><form onSubmit={submit} className="mt-10 grid gap-5 rounded-2xl bg-white p-6"><label className="grid gap-2 text-sm">Name<input className="field" name="name" required maxLength={120} /></label><label className="grid gap-2 text-sm">Email<input className="field" type="email" name="email" required /></label><label className="grid gap-2 text-sm">Message<textarea className="field min-h-36" name="message" required maxLength={3000} /></label><button disabled={busy} className="button-primary w-fit">{busy ? "Sending..." : "Send message"}</button></form></main>;
}
