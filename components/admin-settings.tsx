"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";

type Settings = { store_name: string; free_shipping_threshold: string; tax_percent: string; homepage_headline: string; homepage_subheadline: string; homepage_primary_link: string; homepage_secondary_link: string; support_email: string; support_phone: string; business_address: string; announcement_text: string };

export function AdminSettings() {
  const [values, setValues] = useState<Settings>({ store_name: "", free_shipping_threshold: "0", tax_percent: "0", homepage_headline: "", homepage_subheadline: "", homepage_primary_link: "/shop", homepage_secondary_link: "/shop?category=skin-care", support_email: "", support_phone: "", business_address: "", announcement_text: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const toast = useToast();
  useEffect(() => {
    fetch("/api/admin/settings").then((response) => response.json()).then((data: { settings: Partial<Settings> }) => {
      setValues((current) => ({ ...current, ...data.settings })); setLoading(false);
    }).catch(() => { setError("Could not load store settings."); setLoading(false); });
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not save settings."); return; }
    toast("Store settings saved.");
  }
  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-sand" />;
  return <section><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Store management</p><h1 className="mt-2 font-serif text-4xl">Store settings</h1>
    <form onSubmit={save} className="mt-6 grid max-w-2xl gap-5 rounded-2xl bg-white p-6">
      <label className="grid gap-2 text-sm">Store name<input className="field" value={values.store_name} onChange={(event) => setValues({ ...values, store_name: event.target.value })} /></label>
      <p className="text-sm text-ink/60">Shipping prices are configured per product in the Products section. Products have free shipping unless a shipping price is entered.</p>
      <label className="grid gap-2 text-sm">Free shipping threshold (paise)<input className="field" type="number" min="0" value={values.free_shipping_threshold} onChange={(event) => setValues({ ...values, free_shipping_threshold: event.target.value })} /><small className="text-ink/50">₹{(Number(values.free_shipping_threshold) / 100).toFixed(2)}</small></label>
      <label className="grid gap-2 text-sm">Tax percentage<input className="field" type="number" min="0" max="100" step="0.01" value={values.tax_percent} onChange={(event) => setValues({ ...values, tax_percent: event.target.value })} /></label>
      <div className="border-t border-ink/10 pt-5"><h2 className="font-serif text-2xl">Homepage</h2><div className="mt-4 grid gap-4"><label className="grid gap-2 text-sm">Headline<input className="field" value={values.homepage_headline} onChange={(event) => setValues({ ...values, homepage_headline: event.target.value })} /></label><label className="grid gap-2 text-sm">Subheadline<textarea className="field" value={values.homepage_subheadline} onChange={(event) => setValues({ ...values, homepage_subheadline: event.target.value })} /></label><label className="grid gap-2 text-sm">Primary button link<input className="field" value={values.homepage_primary_link} onChange={(event) => setValues({ ...values, homepage_primary_link: event.target.value })} /></label><label className="grid gap-2 text-sm">Secondary button link<input className="field" value={values.homepage_secondary_link} onChange={(event) => setValues({ ...values, homepage_secondary_link: event.target.value })} /></label><label className="grid gap-2 text-sm">Announcement bar text<input className="field" value={values.announcement_text} onChange={(event) => setValues({ ...values, announcement_text: event.target.value })} /></label></div></div>
      <div className="border-t border-ink/10 pt-5"><h2 className="font-serif text-2xl">Support contact</h2><div className="mt-4 grid gap-4"><label className="grid gap-2 text-sm">Support email<input className="field" type="email" value={values.support_email} onChange={(event) => setValues({ ...values, support_email: event.target.value })} /></label><label className="grid gap-2 text-sm">Phone / WhatsApp<input className="field" value={values.support_phone} onChange={(event) => setValues({ ...values, support_phone: event.target.value })} /></label><label className="grid gap-2 text-sm">Business address<textarea className="field" value={values.business_address} onChange={(event) => setValues({ ...values, business_address: event.target.value })} /></label></div></div>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}<Button className="w-fit">Save settings</Button>
    </form>
  </section>;
}
