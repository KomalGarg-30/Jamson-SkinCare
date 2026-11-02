"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";

type Settings = { store_name: string; shipping_charge: string; free_shipping_threshold: string; tax_percent: string };

export function AdminSettings() {
  const [values, setValues] = useState<Settings>({ store_name: "", shipping_charge: "0", free_shipping_threshold: "0", tax_percent: "0" });
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
      <label className="grid gap-2 text-sm">Shipping charge (paise)<input className="field" type="number" min="0" value={values.shipping_charge} onChange={(event) => setValues({ ...values, shipping_charge: event.target.value })} /><small className="text-ink/50">₹{(Number(values.shipping_charge) / 100).toFixed(2)}</small></label>
      <label className="grid gap-2 text-sm">Free shipping threshold (paise)<input className="field" type="number" min="0" value={values.free_shipping_threshold} onChange={(event) => setValues({ ...values, free_shipping_threshold: event.target.value })} /><small className="text-ink/50">₹{(Number(values.free_shipping_threshold) / 100).toFixed(2)}</small></label>
      <label className="grid gap-2 text-sm">Tax percentage<input className="field" type="number" min="0" max="100" step="0.01" value={values.tax_percent} onChange={(event) => setValues({ ...values, tax_percent: event.target.value })} /></label>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}<Button className="w-fit">Save settings</Button>
    </form>
  </section>;
}
