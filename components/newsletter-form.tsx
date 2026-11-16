"use client";

import { useState } from "react";
import { useToast } from "@/components/toast-provider";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch("/api/newsletter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not subscribe.");
      setEmail(""); toast("You're on the list. Welcome.");
    } catch (error) { toast(error instanceof Error ? error.message : "Could not subscribe.", "error"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="flex w-full max-w-xl flex-col gap-2 sm:flex-row"><label htmlFor="newsletter-email" className="sr-only">Email address</label><input id="newsletter-email" type="email" name="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your email address" className="field min-h-12 flex-1 rounded-full border-0" /><button disabled={busy} className="min-h-12 rounded-full bg-ink px-6 text-sm font-medium text-white hover:bg-sage-dark disabled:opacity-60">{busy ? "Joining..." : "Subscribe"}</button></form>;
}
