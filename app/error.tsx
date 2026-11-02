"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Page render failed:", error); }, [error]);
  const configurationIssue = error.message.includes("DATABASE_URL is required") || error.message.startsWith("Store configuration is incomplete");
  return <section className="container-page py-28 text-center"><p className="text-sm font-semibold uppercase tracking-[.2em] text-sage-dark">{configurationIssue ? "Setup required" : "A little hiccup"}</p><h1 className="mt-4 font-serif text-4xl">{configurationIssue ? "Add your store configuration" : "We couldn’t load this page"}</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink/60">{configurationIssue ? error.message : "Please try again. If it keeps happening, our team can help."}</p>{!configurationIssue && <button className="mt-7 rounded-full bg-sage-dark px-7 py-3 text-sm text-white" onClick={reset}>Try again</button>}</section>;
}
