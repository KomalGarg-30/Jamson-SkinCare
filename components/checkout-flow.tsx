"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addressSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { formatPrice } from "@/lib/utils";

type Address = z.infer<typeof addressSchema> & { id: string };
type Item = { id: string; name: string; quantity: number; price: number; discountPrice: number | null };
type Quote = { subtotal: number; shipping: number; tax: number; discount: number; total: number };
type RazorpayOptions = {
  key: string; amount: number; currency: string; name: string; description: string; order_id: string;
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void };
  prefill?: { name?: string; email?: string; contact?: string };
};
declare global { interface Window { Razorpay?: new (options: RazorpayOptions) => { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void } } }
const checkoutAddressSchema = addressSchema.extend({});
type AddressInput = z.input<typeof checkoutAddressSchema>;
type AddressValues = z.output<typeof checkoutAddressSchema>;

export function CheckoutFlow() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [step, setStep] = useState(1);
  const [showAddress, setShowAddress] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [quote, setQuote] = useState<Quote>({ subtotal: 0, shipping: 0, tax: 0, discount: 0, total: 0 });
  const [baseQuote, setBaseQuote] = useState<Quote>({ subtotal: 0, shipping: 0, tax: 0, discount: 0, total: 0 });
  const [paymentMethod, setPaymentMethod] = useState<"razorpay" | "cod">("razorpay");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const toast = useToast();
  const form = useForm<AddressInput, unknown, AddressValues>({ resolver: zodResolver(checkoutAddressSchema), defaultValues: { name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", country: "India", isDefault: false } });
  useEffect(() => {
    Promise.all([fetch("/api/addresses"), fetch("/api/cart")]).then(async ([addressResponse, cartResponse]) => {
      if (addressResponse.status === 401 || cartResponse.status === 401) { router.replace(`/login?next=${encodeURIComponent("/checkout")}`); return; }
      const [addressData, cartData] = await Promise.all([addressResponse.json(), cartResponse.json()]);
      setAddresses(addressData.addresses || []);
      setSelectedAddress(addressData.addresses?.find((item: Address) => item.isDefault)?.id || addressData.addresses?.[0]?.id || "");
      setItems(cartData.items || []);
      const initialQuote = { subtotal: cartData.subtotal || 0, shipping: cartData.shipping || 0, tax: cartData.tax || 0, discount: 0, total: cartData.total || 0 };
      setQuote(initialQuote);
      setBaseQuote(initialQuote);
      setLoaded(true);
      if (!addressData.addresses?.length) setShowAddress(true);
    }).catch(() => { setError("We couldn't load your checkout details. Please refresh and try again."); setLoaded(true); });
  }, [router]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + (item.discountPrice ?? item.price) * item.quantity, 0), [items]);
  async function applyCoupon() {
    if (!couponCode.trim()) { setError("Enter a coupon code first."); return; }
    const response = await fetch("/api/coupons/validate", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: couponCode.trim() }),
    });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "That coupon could not be applied."); return; }
    setQuote(result);
    setError("");
    toast("Coupon applied.");
  }
  async function saveAddress(values: AddressValues) {
    const response = await fetch("/api/addresses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
    const result = await response.json();
    if (!response.ok) { form.setError("root", { message: result.error }); return; }
    const next = values.isDefault ? [result.address, ...addresses.map((item) => ({ ...item, isDefault: false }))] : [...addresses, result.address];
    setAddresses(next);
    setSelectedAddress(result.address.id);
    setShowAddress(false);
    form.reset();
    toast("Delivery address saved.");
  }
  async function placeOrder() {
    setBusy(true); setError("");
    const response = await fetch("/api/checkout/create-order", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ addressId: selectedAddress, paymentMethod, couponCode: couponCode.trim() || undefined }),
    });
    const result: { error?: string; orderId?: string; amount?: number; currency?: string; razorpayOrderId?: string | null; publicKeyId?: string | null } = await response.json();
    if (!response.ok || !result.orderId) { setBusy(false); setError(result.error || "We couldn't create your order."); return; }
    if (paymentMethod === "cod") { router.push(`/checkout/success/${result.orderId}`); return; }
    if (!window.Razorpay || !result.razorpayOrderId || !result.publicKeyId || !result.amount || !result.currency) {
      setBusy(false);
      setError("The secure payment window is still loading. Please try again in a moment.");
      return;
    }
    const razorpay = new window.Razorpay({
      key: result.publicKeyId, amount: result.amount, currency: result.currency,
      name: "Decotrin", description: "Your thoughtful everyday care", order_id: result.razorpayOrderId,
      handler: async (payment) => {
        setError("Confirming your payment…");
        const verification = await fetch("/api/payments/verify", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: result.orderId, ...payment }),
        });
        const verificationResult = await verification.json();
        if (!verification.ok) { setBusy(false); setError(verificationResult.error || "Payment verification failed. Contact support with your payment reference."); return; }
        router.push(`/checkout/success/${result.orderId}`);
      },
      prefill: { name: addresses.find((address) => address.id === selectedAddress)?.name, contact: addresses.find((address) => address.id === selectedAddress)?.phone },
      modal: { ondismiss: () => { setBusy(false); setError("Payment was not completed. Your order remains pending. You can retry it from My Orders."); } },
    });
    razorpay.on("payment.failed", (failure) => {
      setBusy(false);
      setError(`Payment failed: ${failure.error?.description || "no money was deducted, or it will be refunded in 5-7 working days if it was."}`);
    });
    razorpay.open();
  }
  if (!loaded) return <div className="container-page py-20"><div className="h-10 w-48 animate-pulse rounded bg-sand" /></div>;
  if (!items.length && !error) return <div className="container-page py-20"><h1 className="font-serif text-3xl">Your bag is empty</h1><a href="/shop" className="mt-4 inline-block text-sage-dark underline">Find something lovely</a></div>;
  return <div className="container-page py-12 md:py-16">
    {step === 3 && paymentMethod === "razorpay" && <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onLoad={() => setScriptLoaded(true)} onError={() => setError("The secure payment window could not load. Please check your connection and try again.")} />}
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Almost yours</p><h1 className="mt-3 font-serif text-4xl">Checkout</h1>
    <div className="mt-8 flex gap-2 text-sm"><span className={step >= 1 ? "font-semibold text-sage-dark" : "text-ink/40"}>01 Delivery</span><span className="text-ink/30">—</span><span className={step >= 2 ? "font-semibold text-sage-dark" : "text-ink/40"}>02 Review</span><span className="text-ink/30">—</span><span className={step >= 3 ? "font-semibold text-sage-dark" : "text-ink/40"}>03 Payment</span></div>
    <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_360px]"><div className="rounded-2xl bg-white p-6 sm:p-8">
      {step === 1 && <><div className="flex items-center justify-between"><h2 className="font-serif text-2xl">Delivery address</h2><button className="text-sm text-sage-dark underline" onClick={() => setShowAddress(!showAddress)}>{showAddress ? "Choose saved address" : "Add a new address"}</button></div>
        {showAddress ? <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit(saveAddress)}>
          <label className="grid gap-1 text-sm">Full name<input className="field" {...form.register("name")} /></label><label className="grid gap-1 text-sm">Phone<input className="field" {...form.register("phone")} /></label>
          <label className="grid gap-1 text-sm sm:col-span-2">Address line 1<input className="field" {...form.register("line1")} /></label><label className="grid gap-1 text-sm sm:col-span-2">Address line 2 (optional)<input className="field" {...form.register("line2")} /></label>
          <label className="grid gap-1 text-sm">City<input className="field" {...form.register("city")} /></label><label className="grid gap-1 text-sm">State<input className="field" {...form.register("state")} /></label><label className="grid gap-1 text-sm">Pincode<input className="field" {...form.register("pincode")} /></label><label className="grid gap-1 text-sm">Country<input className="field" {...form.register("country")} /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" {...form.register("isDefault")} /> Make this my default address</label>
          {form.formState.errors.root && <p className="text-sm text-rose-800 sm:col-span-2">{form.formState.errors.root.message}</p>}
          <Button className="sm:col-span-2" disabled={form.formState.isSubmitting}>Save address</Button>
        </form> : <div className="mt-5 grid gap-3">{addresses.map((address) => <label key={address.id} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selectedAddress === address.id ? "border-sage bg-sage/5" : "border-ink/10"}`}><input type="radio" name="address" checked={selectedAddress === address.id} onChange={() => setSelectedAddress(address.id)} /><span className="text-sm leading-6"><strong>{address.name}</strong> · {address.phone}<br />{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} {address.pincode}, {address.country}{address.isDefault && <span className="ml-2 text-sage-dark">Default</span>}</span></label>)}</div>}
        {!showAddress && <Button className="mt-6" disabled={!selectedAddress} onClick={() => setStep(2)}>Continue to review</Button>}
      </>}
      {step === 2 && <><h2 className="font-serif text-2xl">Review your order</h2><div className="mt-5 divide-y divide-ink/10">{items.map((item) => <div key={item.id} className="flex justify-between gap-4 py-4 text-sm"><span>{item.name} × {item.quantity}</span><span>{formatPrice((item.discountPrice ?? item.price) * item.quantity)}</span></div>)}</div><div className="my-5 border-t border-ink/10" /><div className="space-y-3 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{formatPrice(quote.subtotal)}</span></p><p className="flex justify-between"><span>Shipping</span><span>{quote.shipping ? formatPrice(quote.shipping) : "Free"}</span></p><p className="flex justify-between"><span>Tax</span><span>{formatPrice(quote.tax)}</span></p>{quote.discount > 0 && <p className="flex justify-between text-sage-dark"><span>Coupon discount</span><span>-{formatPrice(quote.discount)}</span></p>}<p className="flex justify-between border-t pt-3 font-semibold"><span>Total</span><span>{formatPrice(quote.total)}</span></p></div><div className="mt-5 flex gap-3"><Button variant="secondary" onClick={() => setStep(1)}>Back</Button><Button onClick={() => setStep(3)}>Choose payment</Button></div></>}
      {step === 3 && <><h2 className="font-serif text-2xl">Payment method</h2><div className="mt-5 grid gap-3">
        <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${paymentMethod === "razorpay" ? "border-sage bg-sage/5" : "border-ink/10"}`}><input type="radio" checked={paymentMethod === "razorpay"} onChange={() => setPaymentMethod("razorpay")} /><span><strong>Pay online</strong><small className="mt-1 block text-ink/60">Secure payment by card, UPI or net banking.</small></span></label>
        <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${paymentMethod === "cod" ? "border-sage bg-sage/5" : "border-ink/10"}`}><input type="radio" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} /><span><strong>Cash on delivery</strong><small className="mt-1 block text-ink/60">Pay when your order arrives.</small></span></label>
      </div>{paymentMethod === "razorpay" && !scriptLoaded && <p className="mt-4 text-sm text-ink/60">Loading secure payment…</p>}<p className="mt-4 text-xs text-ink/55">Do not refresh or close this page while payment is being confirmed.</p><div className="mt-5 flex gap-3"><Button variant="secondary" onClick={() => setStep(2)}>Back</Button><Button disabled={busy || !selectedAddress || (paymentMethod === "razorpay" && !scriptLoaded)} onClick={placeOrder}>{busy ? "Preparing your order…" : `Place order · ${formatPrice(quote.total || subtotal)}`}</Button></div></>}
      {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-800">{error}</p>}
    </div><aside className="rounded-2xl bg-white p-6"><h2 className="font-serif text-2xl">Order summary</h2><div className="mt-5 space-y-3 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{formatPrice(quote.subtotal || subtotal)}</span></p><p className="flex justify-between"><span>Shipping</span><span>{quote.shipping ? formatPrice(quote.shipping) : "Free"}</span></p><p className="flex justify-between"><span>Tax</span><span>{formatPrice(quote.tax)}</span></p>{quote.discount > 0 && <p className="flex justify-between text-sage-dark"><span>Coupon discount</span><span>-{formatPrice(quote.discount)}</span></p>}<p className="flex justify-between border-t pt-3 font-semibold"><span>Total</span><span>{formatPrice(quote.total)}</span></p></div><label className="mt-5 block text-sm">Coupon code<input className="field mt-2" value={couponCode} onChange={(event) => { setCouponCode(event.target.value); setQuote(baseQuote); setError(""); }} placeholder="Enter code" /></label><Button variant="secondary" className="mt-3 w-full" onClick={applyCoupon}>Apply coupon</Button><p className="mt-4 text-xs leading-5 text-ink/55">Your final order amount is recalculated securely on the server.</p></aside></div>
  </div>;
}
