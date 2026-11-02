import Link from "next/link";

export default function NotFound() {
  return <section className="container-page py-28 text-center"><p className="text-sm font-semibold uppercase tracking-[.2em] text-sage-dark">404 · Not found</p><h1 className="mt-4 font-serif text-4xl">This page wandered off</h1><p className="mt-3 text-sm text-ink/60">Let’s find you something lovely instead.</p><Link className="mt-7 inline-block rounded-full bg-sage-dark px-7 py-3 text-sm text-white" href="/">Back home</Link></section>;
}
