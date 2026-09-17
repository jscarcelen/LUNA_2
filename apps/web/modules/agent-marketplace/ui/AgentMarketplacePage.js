"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  PRICING_TYPE_LABELS,
  STARTER_AGENTS,
  buildAgentFileFromListing,
  listingInitials,
  readListings,
  removeListing
} from "../listings";

const fieldClass = "w-full rounded-xl border border-ink/10 bg-bg/60 px-3 py-2 text-sm text-ink placeholder:text-soft-ink/60 outline-none transition focus:border-teal/60 focus:ring-2 focus:ring-teal/20";
const chipClass = "inline-flex items-center rounded-full bg-ink/5 px-2.5 py-0.5 text-[11px] font-semibold text-soft-ink ring-1 ring-ink/10";

const MODEL_LABELS = { "gpt-4o-mini": "Luna 3 Mini", "gpt-4o": "Luna 3 Pro", "gpt-4.1": "Luna 3 Max" };

function priceLabel(listing) {
  const price = Number(listing.price || 0);
  if (!price) return "Free";
  const suffix = listing.pricingType === "monthly" ? "/mo" : listing.pricingType === "pay-as-you-go" ? "/run" : "";
  return `$${price.toFixed(2)}${suffix}`;
}

function Cover({ listing, size = "md" }) {
  const dimension = size === "lg" ? "size-16 text-2xl" : "size-12 text-lg";
  if (listing.pictureUrl && /^https?:\/\//i.test(listing.pictureUrl)) {
    return <img src={listing.pictureUrl} alt="" className={`${dimension} rounded-2xl object-cover ring-1 ring-ink/10`} />;
  }
  return (
    <span
      className={`grid ${dimension} place-items-center rounded-2xl font-extrabold text-white shadow-lg`}
      style={{ background: `linear-gradient(135deg, ${listing.accent || "#6d4de6"}, color-mix(in srgb, ${listing.accent || "#6d4de6"} 55%, #ffffff))` }}
    >
      {listingInitials(listing.name)}
    </span>
  );
}

function ListingCard({ listing, onPreview, installed, featured }) {
  const fields = listing.agent?.template?.fields || [];
  return (
    <article
      className={`group relative flex flex-col gap-3 rounded-bento border border-ink/8 bg-paper p-5 shadow-glow transition hover:-translate-y-0.5 hover:border-ink/20 animate-rise ${featured ? "md:col-span-2 md:flex-row md:items-start md:gap-6" : ""}`}
    >
      <div className={`flex items-start gap-3 ${featured ? "md:w-64 md:shrink-0 md:flex-col" : ""}`}>
        <Cover listing={listing} size={featured ? "lg" : "md"} />
        <div className="min-w-0">
          <h4 className="m-0 truncate text-base font-bold text-ink">{listing.name}</h4>
          <p className="m-0 text-xs text-soft-ink">by {listing.author || "Community"}{listing.category ? ` · ${listing.category}` : ""}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className={`m-0 text-sm text-ink/85 ${featured ? "" : "line-clamp-3"}`}>{listing.tagline || listing.description || "No description provided."}</p>
        {fields.length ? (
          <div className="flex flex-wrap gap-1.5">
            {fields.slice(0, 5).map((field) => <span key={field.name} className={chipClass}>{field.label || field.name}</span>)}
            {fields.length > 5 ? <span className={chipClass}>+{fields.length - 5}</span> : null}
          </div>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(listing.price) ? "bg-[var(--surface-soft)] text-ink" : "bg-teal/20 text-accent"}`}>{priceLabel(listing)}</span>
            {listing.agent?.model ? <span className={chipClass}>{MODEL_LABELS[listing.agent.model] || listing.agent.model}</span> : null}
            {installed ? <span className={`${chipClass} text-accent ring-accent/40`}>Installed</span> : null}
          </div>
          <button type="button" onClick={() => onPreview(listing)} className="rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-bg transition hover:bg-ink/85">
            {installed ? "Details" : listing.agent ? "Get" : "Details"}
          </button>
        </div>
      </div>
    </article>
  );
}

function DetailsDrawer({ listing, onClose, onInstall, onRemove, onRun, installedDocumentId, canInstall, installing, status }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!listing) return null;
  const agent = listing.agent || null;
  const fields = agent?.template?.fields || [];
  const questions = agent?.questions || [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-bg/50" onClick={onClose} role="presentation">
      <aside
        className="flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-ink/10 bg-paper shadow-glow animate-rise"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${listing.name} details`}
      >
        <div className="flex items-start gap-4 border-b border-ink/10 p-5">
          <Cover listing={listing} size="lg" />
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-xl font-extrabold text-ink">{listing.name}</h3>
            <p className="m-0 mt-0.5 text-sm text-soft-ink">by {listing.author || "Community"}{listing.category ? ` · ${listing.category}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(listing.price) ? "bg-[var(--surface-soft)] text-ink" : "bg-teal/20 text-accent"}`}>{priceLabel(listing)}</span>
              <span className={chipClass}>{PRICING_TYPE_LABELS[listing.pricingType] || listing.pricingType || "Free"}</span>
              {agent?.model ? <span className={chipClass}>{MODEL_LABELS[agent.model] || agent.model}</span> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-soft-ink ring-1 ring-ink/10 transition hover:bg-ink/10 hover:text-ink">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <div className="grid gap-5">
            <section>
              <h6 className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">About</h6>
              <p className="m-0 text-sm leading-relaxed text-ink/90">{listing.description || listing.tagline || "No description provided."}</p>
            </section>
            {agent ? (
              <>
                <section>
                  <h6 className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">What it does</h6>
                  <p className="m-0 rounded-2xl border border-ink/8 bg-ink/[0.04] p-3 text-sm leading-relaxed text-ink/85">{agent.instructions}</p>
                </section>
                <section>
                  <h6 className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">It will ask you</h6>
                  {questions.length ? (
                    <ol className="m-0 grid list-none gap-1.5 p-0">
                      {questions.map((item, index) => (
                        <li key={item.id || index} className="flex items-start gap-2 text-sm text-ink/90">
                          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink/5 text-[10px] font-bold text-soft-ink ring-1 ring-ink/10">{index + 1}</span>
                          <span>{item.text}{item.options?.length ? <span className="text-soft-ink"> — {item.options.join(" / ")}</span> : null}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="m-0 text-sm text-soft-ink">No questions — it runs straight from your documents.</p>}
                </section>
                <section>
                  <h6 className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Output per item</h6>
                  <div className="flex flex-wrap gap-1.5">
                    {fields.map((field) => <span key={field.name} className={chipClass}>{field.label || field.name} <span className="ml-1 opacity-60">{field.type}</span></span>)}
                  </div>
                </section>
              </>
            ) : (
              <p className="m-0 rounded-2xl border border-warn/40 bg-mustard/10 p-3 text-sm text-ink">This listing was published before agents were bundled with listings, so it can&apos;t be installed. Re-publish it from the Agent Builder.</p>
            )}
          </div>
        </div>

        <div className="border-t border-ink/10 p-5">
          {status ? <p className="m-0 mb-3 text-xs text-accent">{status}</p> : null}
          <div className="flex flex-wrap gap-2">
            {installedDocumentId ? (
              <button type="button" onClick={() => onRun(installedDocumentId)} className="flex-1 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0077ed]">Run this agent →</button>
            ) : agent ? (
              <button type="button" disabled={!canInstall || installing} onClick={() => onInstall(listing)} className="flex-1 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-bg transition hover:bg-ink/85 disabled:opacity-50">
                {installing ? "Adding…" : Number(listing.price) ? `Get for ${priceLabel(listing)} (preview — no charge)` : "Add to my AI Tools"}
              </button>
            ) : null}
            {listing.author === "You" ? (
              <button type="button" onClick={() => onRemove(listing)} className="rounded-full px-4 py-2.5 text-sm font-semibold text-danger ring-1 ring-danger/40 transition hover:bg-rose/10">Remove listing</button>
            ) : null}
          </div>
          {!canInstall && agent && !installedDocumentId ? <p className="m-0 mt-2 text-xs text-warn">Select a workspace and subject first — the agent is installed into the current subject.</p> : null}
        </div>
      </aside>
    </div>
  );
}

/**
 * Agent Marketplace: browse starter + community agents, inspect what they do, and install them
 * into the current subject as runnable AI Tools. Payments are not wired yet; prices are shown as
 * a preview and installs are free.
 */
export function AgentMarketplacePage({ onGoBuilder, workspaces = [], selectedWorkspaceId = "", selectedSubjectId = "", onSaveGeneratedQuizDocument, onOpenAgent }) {
  const [communityListings, setCommunityListings] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("featured");
  const [selected, setSelected] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setCommunityListings(readListings());
  }, []);

  const selectedSubject = workspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.subjects?.find((subject) => subject.id === selectedSubjectId) || null;
  const installedByListingId = useMemo(() => {
    const map = {};
    for (const document of selectedSubject?.documents || []) {
      if (document.sourceType !== "generated" || !(document.tags || []).includes("ai-agent")) continue;
      try {
        const parsed = JSON.parse(String(document.content || "{}"));
        if (parsed.installedFrom?.listingId) map[parsed.installedFrom.listingId] = document.id;
      } catch {
        // Not a readable agent document.
      }
    }
    return map;
  }, [selectedSubject]);

  const allListings = useMemo(() => {
    const community = communityListings.map((listing) => ({ ...listing, author: listing.author || "You", category: listing.category || "Community" }));
    return [...STARTER_AGENTS, ...community];
  }, [communityListings]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = allListings.filter((listing) => {
      if (category !== "All" && listing.category !== category) return false;
      if (!term) return true;
      const haystack = [listing.name, listing.tagline, listing.description, listing.author, ...(listing.agent?.template?.fields || []).map((field) => field.label || field.name)].join(" ").toLowerCase();
      return haystack.includes(term);
    });
    if (sort === "newest") list = [...list].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    if (sort === "price-asc") list = [...list].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    if (sort === "price-desc") list = [...list].sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    return list;
  }, [allListings, search, category, sort]);

  const canInstall = Boolean(selectedWorkspaceId && selectedSubjectId && typeof onSaveGeneratedQuizDocument === "function");

  async function handleInstall(listing) {
    if (!canInstall) return;
    setInstalling(true);
    setStatus("");
    try {
      const file = buildAgentFileFromListing(listing, { workspaceId: selectedWorkspaceId, subjectId: selectedSubjectId });
      const saved = await onSaveGeneratedQuizDocument({ folderIds: [], tags: ["ai-agent"], file });
      if (!saved) throw new Error("The agent could not be added to your workspace.");
      setStatus(`"${listing.name}" was added to your AI Tools.`);
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setInstalling(false);
    }
  }

  function handleRemove(listing) {
    setCommunityListings(removeListing(listing.id));
    setSelected(null);
  }

  const featured = visible.find((listing) => listing.id === "starter-flashcards" && category === "All" && !search.trim());

  return (
    <section className="tw-scope grid gap-4">
      <header className="relative overflow-hidden rounded-bento border border-ink/8 bg-paper p-6 shadow-glow animate-rise">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center">
          <div>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-accent ring-1 ring-accent/40">Agent marketplace</span>
            <h3 className="m-0 mt-3 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Ready-made agents for your classroom</h3>
            <p className="m-0 mt-2 max-w-xl text-sm text-soft-ink">Browse agents built by LUNA and the community, see exactly what they ask and produce, and add them to your AI Tools in one click. Agents run on your own documents.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={onGoBuilder} className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-bg transition hover:bg-ink/85">Build &amp; sell your own</button>
              <span className="self-center text-xs text-soft-ink">{allListings.length} agents · {communityListings.length} from the community</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[["1", "Pick an agent"], ["2", "Add to AI Tools"], ["3", "Run on your docs"]].map(([step, label]) => (
              <div key={step} className="rounded-2xl border border-ink/10 bg-ink/[0.04] p-3">
                <span className="grid size-7 place-items-center rounded-full bg-mustard/30 text-xs font-extrabold text-ink">{step}</span>
                <p className="m-0 mt-2 text-xs font-semibold text-ink">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-bento border border-ink/8 bg-paper p-3 shadow-glow">
        <input className={`${fieldClass} sm:max-w-xs`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search agents, outputs, authors…" aria-label="Search agents" />
        <div className="flex flex-wrap gap-1 rounded-full bg-ink/5 p-1 ring-1 ring-ink/10">
          {CATEGORIES.map((item) => (
            <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${category === item ? "bg-ink text-bg shadow" : "text-soft-ink hover:text-ink"}`}>{item}</button>
          ))}
        </div>
        <select className={`${fieldClass.replace("w-full ", "")} ml-auto w-full sm:w-52`} value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort">
          <option value="featured">Featured</option>
          <option value="newest">Newest</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((listing) => (
          <ListingCard key={listing.id} listing={listing} onPreview={setSelected} installed={Boolean(installedByListingId[listing.id])} featured={featured?.id === listing.id} />
        ))}
        {!visible.length ? (
          <div className="col-span-full rounded-bento border border-dashed border-ink/20 p-10 text-center">
            <p className="m-0 text-base font-semibold text-ink">No agents match</p>
            <p className="m-0 mt-1 text-sm text-soft-ink">Try another search, or build one yourself.</p>
            <button type="button" onClick={onGoBuilder} className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-bold text-bg transition hover:bg-ink/85">Open Agent Builder</button>
          </div>
        ) : null}
      </div>

      <DetailsDrawer
        listing={selected}
        onClose={() => {
          setSelected(null);
          setStatus("");
        }}
        onInstall={handleInstall}
        onRemove={handleRemove}
        onRun={(documentId) => {
          setSelected(null);
          onOpenAgent?.(documentId);
        }}
        installedDocumentId={selected ? installedByListingId[selected.id] : ""}
        canInstall={canInstall}
        installing={installing}
        status={status}
      />
    </section>
  );
}
