"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Copy, Menu, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DOCS, type DocPage } from "@/lib/docs-content";
import { cn } from "@/lib/utils";

const FLAT = DOCS.flatMap((c) => c.pages.map((p) => ({ ...p, category: c.category })));

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-line bg-black/50">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-faint">{lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(content).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          aria-label="Copy code"
          className="flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-emerald-bright"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-bright" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-emerald-bright/90">
        <code>{content}</code>
      </pre>
    </div>
  );
}

export default function DocsPage() {
  const [active, setActive] = useState("introduction");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);

  const page: DocPage & { category?: string } = FLAT.find((p) => p.slug === active) ?? FLAT[0];
  const idx = FLAT.findIndex((p) => p.slug === page.slug);
  const prev = FLAT[idx - 1];
  const next = FLAT[idx + 1];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOCS;
    return DOCS.map((c) => ({
      ...c,
      pages: c.pages.filter((p) => p.title.toLowerCase().includes(q) || p.body.join(" ").toLowerCase().includes(q)),
    })).filter((c) => c.pages.length > 0);
  }, [query]);

  const sidebar = (
    <nav aria-label="Documentation sections" className="space-y-6">
      {filtered.map((cat) => (
        <div key={cat.category}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">{cat.category}</p>
          <ul className="space-y-0.5">
            {cat.pages.map((p) => (
              <li key={p.slug}>
                <button
                  onClick={() => { setActive(p.slug); setDrawer(false); }}
                  aria-current={p.slug === page.slug ? "page" : undefined}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    p.slug === page.slug
                      ? "bg-emerald/12 font-semibold text-emerald-bright"
                      : "text-muted hover:bg-white/[0.04] hover:text-ink"
                  )}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {filtered.length === 0 && <p className="px-3 text-sm text-muted">No results for “{query}”.</p>}
    </nav>
  );

  return (
    <div className="container pb-24 pt-28 lg:pt-32">
      <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
        {/* desktop sidebar */}
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:h-fit">
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search docs…" className="pl-9" aria-label="Search documentation" />
          </div>
          {sidebar}
        </aside>

        {/* mobile docs drawer trigger */}
        <div className="flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setDrawer(true)}
            className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink"
            aria-label="Open documentation menu"
          >
            <Menu className="h-4 w-4" /> {page.title}
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="pl-9" aria-label="Search documentation" />
          </div>
        </div>

        {/* mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-abyss/80 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <div className="absolute left-0 top-0 h-full w-[84vw] max-w-xs overflow-y-auto border-r border-line bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2 font-heading font-bold text-ink"><BookOpen className="h-4 w-4 text-emerald" /> Docs</span>
                <button onClick={() => setDrawer(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-lg border border-line">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {sidebar}
            </div>
          </div>
        )}

        {/* content */}
        <article className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-bright">{page.category}</p>
          <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-ink sm:text-4xl">{page.title}</h1>
          <div className="mt-6 space-y-4">
            {page.body.map((p, i) => (
              <p key={i} className="leading-[1.85] text-mist">{p}</p>
            ))}
          </div>
          {page.code && <CodeBlock lang={page.code.lang} content={page.code.content} />}

          {/* prev/next */}
          <div className="mt-12 flex items-center justify-between gap-4 border-t border-line pt-6">
            {prev ? (
              <button onClick={() => setActive(prev.slug)} className="group flex items-center gap-2 text-sm text-muted transition-colors hover:text-emerald-bright">
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                <span><span className="block text-[10px] uppercase tracking-wider text-faint">Previous</span>{prev.title}</span>
              </button>
            ) : <span />}
            {next ? (
              <button onClick={() => setActive(next.slug)} className="group flex items-center gap-2 text-right text-sm text-muted transition-colors hover:text-emerald-bright">
                <span><span className="block text-[10px] uppercase tracking-wider text-faint">Next</span>{next.title}</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            ) : <span />}
          </div>
        </article>
      </div>
    </div>
  );
}
