"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

type OrderItem = { id: string; productName: string; quantity: number; unitPrice: number };
type Props = { orderId: string; onSubmitted: () => void; onCancel?: () => void };

export function ReturnRequestForm({ orderId, onSubmitted, onCancel }: Props) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("damaged");
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/orders/${orderId}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load order items.");
      setItems(result.items);
    }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Could not load order items."))
      .finally(() => setLoading(false));
  }, [orderId]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const selectedFiles = Array.from(files);
    if (selectedFiles.length + photos.length > 4) { setError("You can upload up to four photos."); return; }
    if (selectedFiles.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setError("Choose JPG, PNG, or WEBP images."); return;
    }
    setSaving(true);
    try {
      const uploaded: string[] = [];
      for (const file of selectedFiles) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/uploads/return-photos", { method: "POST", body });
        const result = await response.json();
        if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "A photo could not be uploaded.");
        uploaded.push(result.url);
      }
      setPhotos((current) => [...current, ...uploaded]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "A photo could not be uploaded.");
    } finally { setSaving(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const returnItems = Object.entries(selected).filter(([, quantity]) => quantity > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (!returnItems.length) { setError("Select at least one item to return."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/returns", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, reason, comment, photos, items: returnItems }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit return request.");
      onSubmitted();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not submit return request.");
    } finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="mt-4 grid gap-4 rounded-xl border border-ink/10 bg-cream p-4">
    <h3 className="font-serif text-xl">Request a return</h3>
    {loading ? <div className="h-20 animate-pulse rounded-lg bg-sand" /> : <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Choose items and quantities</legend>
      {items.map((item) => <label key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 text-sm">
        <input type="checkbox" checked={Boolean(selected[item.id])} onChange={(event) => setSelected((current) => ({
          ...current, [item.id]: event.target.checked ? 1 : 0,
        }))} />
        <span className="min-w-0 flex-1">{item.productName} · {formatPrice(item.unitPrice)} · ordered {item.quantity}</span>
        {selected[item.id] > 0 && <input aria-label={`Quantity of ${item.productName} to return`} type="number" min={1} max={item.quantity}
          value={selected[item.id]} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: Math.max(1, Math.min(item.quantity, Number(event.target.value))) }))}
          className="w-20 rounded-lg border border-ink/10 px-2 py-1" />}
      </label>)}
    </fieldset>}
    <label className="grid gap-1 text-sm">Reason
      <select value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-lg border border-ink/10 bg-white px-3 py-2">
        <option value="damaged">Arrived damaged</option><option value="wrong_item">Wrong item</option>
        <option value="quality_issue">Quality issue</option><option value="changed_mind">Changed my mind</option><option value="other">Other</option>
      </select>
    </label>
    <label className="grid gap-1 text-sm">Comment (optional)
      <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={3} className="rounded-lg border border-ink/10 bg-white p-3" />
    </label>
    <label className="grid gap-1 text-sm">Photos (optional, up to 4 images · 5 MB each)
      <input type="file" accept="image/*" multiple disabled={saving || photos.length >= 4} onChange={(event) => void uploadFiles(event.target.files)} className="text-sm" />
    </label>
    {photos.length > 0 && <div className="flex flex-wrap gap-2">{photos.map((photo) => <div key={photo} className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs">
      <span>Photo added</span><button type="button" aria-label="Remove photo" onClick={() => setPhotos((current) => current.filter((url) => url !== photo))}>×</button>
    </div>)}</div>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    <div className="flex flex-wrap gap-2"><button disabled={saving || loading} className="rounded-full bg-sage px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "Please wait…" : "Submit return request"}</button>
      {onCancel && <button type="button" onClick={onCancel} className="rounded-full border border-ink/15 px-4 py-2 text-sm">Close</button>}
    </div>
  </form>;
}
