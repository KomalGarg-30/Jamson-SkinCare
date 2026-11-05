"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { addressSchema } from "@/lib/validation";

type Address = { id: string; name: string; phone: string; line1: string; line2: string | null; city: string; state: string; pincode: string; country: string; isDefault: boolean };
type Profile = { id: string; name: string; email: string; phone: string | null };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [error, setError] = useState("");
  const [addressError, setAddressError] = useState("");
  const toast = useToast();
  const router = useRouter();
  const load = useCallback(async () => {
    const [profileResponse, addressResponse] = await Promise.all([fetch("/api/profile"), fetch("/api/addresses")]);
    if (profileResponse.status === 401) { router.replace(`/login?next=${encodeURIComponent("/profile")}`); return; }
    const [profileData, addressData] = await Promise.all([profileResponse.json(), addressResponse.json()]);
    setProfile(profileData.user); setAddresses(addressData.addresses || []);
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
    const result = await response.json();
    if (!response.ok) { setError(result.error); return; }
    setProfile(result.user); toast("Your profile has been updated.");
  }
  async function removeAddress(id: string) {
    const response = await fetch(`/api/addresses?id=${id}`, { method: "DELETE" });
    if (response.ok) { setAddresses((current) => current.filter((address) => address.id !== id)); toast("Address removed."); }
  }
  async function makeDefault(address: Address) {
    const response = await fetch("/api/addresses", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: address.id, isDefault: true }) });
    const result = await response.json();
    if (!response.ok) { toast(result.error, "error"); return; }
    setAddresses((current) => current.map((item) => ({ ...item, isDefault: item.id === address.id })));
    toast("Default address updated.");
  }
  async function addAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = addressSchema.safeParse({
      name: String(data.get("name") || ""), phone: String(data.get("phone") || ""),
      line1: String(data.get("line1") || ""), line2: String(data.get("line2") || ""),
      city: String(data.get("city") || ""), state: String(data.get("state") || ""),
      pincode: String(data.get("pincode") || ""), country: String(data.get("country") || "India"),
      isDefault: data.get("isDefault") === "on",
    });
    if (!parsed.success) { setAddressError(parsed.error.issues[0]?.message || "Check the address details."); return; }
    const response = await fetch("/api/addresses", {
      method: editingAddress ? "PATCH" : "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(editingAddress ? { id: editingAddress.id, ...parsed.data } : parsed.data),
    });
    const result = await response.json();
    if (!response.ok) { setAddressError(result.error || "Address could not be saved."); return; }
    setAddresses((current) => {
      const updated = current.map((item) => item.id === result.address.id ? result.address : item);
      const list = editingAddress && current.some((item) => item.id === result.address.id) ? updated : [...current, result.address];
      return parsed.data.isDefault ? list.map((item) => ({ ...item, isDefault: item.id === result.address.id })) : list;
    });
    setEditingAddress(null);
    form.reset();
    setAddressError("");
    toast(editingAddress ? "Address updated." : "Address saved.");
  }
  return <section className="container-page max-w-4xl py-14"><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Your account</p><h1 className="mt-3 font-serif text-4xl">Profile & addresses</h1>
    {!profile ? <div className="mt-8 h-64 animate-pulse rounded-2xl bg-sand" /> : <div className="mt-8 grid gap-8">
      <form onSubmit={saveProfile} className="grid gap-4 rounded-2xl bg-white p-6 sm:grid-cols-2"><h2 className="font-serif text-2xl sm:col-span-2">Your details</h2><label className="grid gap-2 text-sm">Name<input className="field" name="name" defaultValue={profile.name} required minLength={2} /></label><label className="grid gap-2 text-sm">Email<input className="field" name="email" type="email" defaultValue={profile.email} required /></label><label className="grid gap-2 text-sm sm:col-span-2">Phone<input className="field" name="phone" defaultValue={profile.phone || ""} /></label><div className="border-t border-ink/10 pt-4 sm:col-span-2"><p className="mb-3 text-sm font-medium">Change password (optional)</p><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm">Current password<input className="field" name="currentPassword" type="password" autoComplete="current-password" /></label><label className="grid gap-2 text-sm">New password<input className="field" name="newPassword" type="password" minLength={10} autoComplete="new-password" /></label></div></div>{error && <p role="alert" className="text-sm text-rose-800 sm:col-span-2">{error}</p>}<Button className="sm:col-span-2">Save changes</Button></form>
      <div className="rounded-2xl bg-white p-6"><h2 className="font-serif text-2xl">Saved addresses</h2>{addresses.length ? <div className="mt-4 grid gap-3">{addresses.map((address) => <article key={address.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-4"><p className="text-sm leading-6"><strong>{address.name} · {address.phone}</strong><br />{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} {address.pincode}, {address.country}{address.isDefault && <span className="ml-2 text-sage-dark">Default</span>}</p><div className="flex gap-3 text-xs"><button className="text-sage-dark underline" onClick={() => setEditingAddress(address)}>Edit</button><button className="text-sage-dark underline" onClick={() => makeDefault(address)}>Make default</button><button className="text-rose-800 underline" onClick={() => removeAddress(address.id)}>Remove</button></div></article>)}</div> : <p className="mt-4 text-sm text-ink/60">No saved addresses yet.</p>}
        <form key={editingAddress?.id || "new-address"} onSubmit={addAddress} className="mt-6 grid gap-3 border-t border-ink/10 pt-6 sm:grid-cols-2"><h3 className="font-serif text-xl sm:col-span-2">{editingAddress ? "Edit address" : "Add an address"}</h3><input className="field" name="name" defaultValue={editingAddress?.name || ""} required minLength={2} placeholder="Full name" /><input className="field" name="phone" defaultValue={editingAddress?.phone || ""} required minLength={7} placeholder="Phone" /><input className="field sm:col-span-2" name="line1" defaultValue={editingAddress?.line1 || ""} required minLength={3} placeholder="Address line 1" /><input className="field sm:col-span-2" name="line2" defaultValue={editingAddress?.line2 || ""} placeholder="Address line 2 (optional)" /><input className="field" name="city" defaultValue={editingAddress?.city || ""} required minLength={2} placeholder="City" /><input className="field" name="state" defaultValue={editingAddress?.state || ""} required minLength={2} placeholder="State" /><input className="field" name="pincode" defaultValue={editingAddress?.pincode || ""} required minLength={3} placeholder="Pincode" /><input className="field" name="country" defaultValue={editingAddress?.country || "India"} required /><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isDefault" defaultChecked={editingAddress?.isDefault || false} /> Set as default address</label>{addressError && <p role="alert" className="text-sm text-rose-800 sm:col-span-2">{addressError}</p>}<Button className="sm:col-span-2">{editingAddress ? "Update address" : "Save address"}</Button>{editingAddress && <button type="button" onClick={() => setEditingAddress(null)} className="sm:col-span-2 text-sm text-ink/60 underline">Cancel edit</button>}</form>
      </div>
    </div>}
  </section>;
}
