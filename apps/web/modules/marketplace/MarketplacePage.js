"use client";

import { useEffect, useMemo, useState } from "react";
import { KINDS, PRICING_TYPE_LABELS, SUBJECTS, addReview, listingsOfStore, newStore, publish, ratingOf, readMarket, readStores, recordDownload, saveStore, storeStats, unpublish } from "./market";
import { parsePlan, PLAN_TAG } from "../plans/plan";
import { parseResource, RESOURCE_TAG } from "../resources/resource";
import { builtInBlocks, readBlockLibrary } from "../template-studio/engine/blocks";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const field = "w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm text-ink";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";

const priceLabel = (listing) => (listing.price ? `€${Number(listing.price).toFixed(2)}${listing.pricingType && listing.pricingType !== "one-time" ? ` · ${PRICING_TYPE_LABELS[listing.pricingType]}` : ""}` : "Free");

function Stars({ value, size = 12 }) {
  return <span className="whitespace-nowrap text-[#f5a623]" style={{ fontSize: size }}>{"★★★★★".slice(0, Math.round(value))}<span className="text-ink/15">{"★★★★★".slice(Math.round(value))}</span></span>;
}

/**
 * The marketplace: five shelves — agents, templates, components, single resources and whole study
 * plans — each sold by a store. A store is the seller's brand: a name, a look, and the record that
 * makes it worth buying from (how much was downloaded, how it was rated, what buyers said).
 */
export function MarketplacePage({
  role = "student",
  profileName = "",
  workspaces = [],
  selectedWorkspaceId,
  selectedSubjectId,
  templates = [],
  onInstallAgent,
  onInstallTemplate,
  onInstallResource,
  onGoBuilder
}) {
  const subject = workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects?.find((s) => s.id === selectedSubjectId) || null;
  const documents = subject?.documents || [];
  const [listings, setListings] = useState([]);
  const [stores, setStores] = useState([]);
  const [kind, setKind] = useState("agent");
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [openStore, setOpenStore] = useState("");
  const [selling, setSelling] = useState(false);
  const [storeForm, setStoreForm] = useState(false);
  const [status, setStatus] = useState("");
  const [reviewFor, setReviewFor] = useState("");
  const [reviewDraft, setReviewDraft] = useState({ rating: 5, comment: "" });

  useEffect(() => { setListings(readMarket()); setStores(readStores()); }, []);

  const myStore = stores.find((store) => store.owner === profileName) || stores[0] || null;
  const visible = useMemo(() => listings
    .filter((listing) => listing.kind === kind)
    .filter((listing) => (subjectFilter ? listing.subject === subjectFilter : true))
    .filter((listing) => {
      const term = query.trim().toLowerCase();
      if (!term) return true;
      const store = stores.find((entry) => entry.id === listing.storeId);
      return `${listing.name} ${listing.tagline} ${listing.description} ${(listing.tags || []).join(" ")} ${store?.name || ""}`.toLowerCase().includes(term);
    }), [listings, kind, subjectFilter, query, stores]);

  function install(listing) {
    try {
      if (listing.kind === "agent") onInstallAgent?.(listing);
      else if (listing.kind === "template" || listing.kind === "component") onInstallTemplate?.(listing);
      else onInstallResource?.(listing);
      setListings(recordDownload(listing.id));
      setStatus(`“${listing.name}” added to your workspace.`);
    } catch (error) {
      setStatus(String(error.message || error));
    }
  }

  /* ---------------------------------------------------------------- one store */
  if (openStore) {
    const store = stores.find((entry) => entry.id === openStore);
    const stats = storeStats(openStore, listings);
    const mine = listingsOfStore(openStore, listings);
    if (!store) return null;
    return (
      <section className="tw-scope grid gap-4">
        <div className={`${card} p-5`} style={{ borderTop: `4px solid ${store.colour}` }}>
          <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setOpenStore("")}>← Marketplace</button>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-black text-white" style={{ background: store.colour }}>{store.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <h3 className="m-0 text-2xl font-bold tracking-tight text-ink">{store.name}</h3>
                <p className="m-0 mt-0.5 text-sm text-soft-ink">{store.tagline}</p>
                {store.about ? <p className="m-0 mt-2 max-w-xl text-sm text-ink">{store.about}</p> : null}
              </div>
            </div>
            <div className="flex gap-5">
              <div><p className={kicker}>Downloads</p><p className="m-0 text-xl font-bold text-ink">{stats.downloads}</p></div>
              <div><p className={kicker}>Rating</p><p className="m-0 text-xl font-bold text-ink">{stats.rating ? stats.rating.toFixed(1) : "—"}</p><Stars value={stats.rating} /></div>
              <div><p className={kicker}>For sale</p><p className="m-0 text-xl font-bold text-ink">{stats.listings}</p></div>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {mine.map((listing) => <ListingCard key={listing.id} listing={listing} store={store} onInstall={install} onReview={() => setReviewFor(listing.id)} onOpenStore={setOpenStore} onRemove={myStore?.id === store.id ? () => setListings(unpublish(listing.id)) : undefined} />)}
        </div>
      </section>
    );
  }

  /* ---------------------------------------------------------------- the shelves */
  return (
    <section className="tw-scope grid gap-4">
      <div className={`${card} grid gap-3 p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={kicker}>Marketplace</p>
            <h3 className="m-0 mt-1 text-xl font-bold text-ink">{listings.length} thing{listings.length === 1 ? "" : "s"} for sale</h3>
            <p className="m-0 mt-1 max-w-2xl text-sm text-soft-ink">Agents, templates, single components, ready-made resources and whole study plans — each from a store you can look up before you buy.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ghostBtn} onClick={() => setStoreForm(true)}>{myStore ? "Edit my store" : "Open my store"}</button>
            <button type="button" className={primaryBtn} onClick={() => setSelling(true)}>＋ Sell something</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
          {KINDS.map((entry) => (
            <button key={entry.id} type="button" onClick={() => setKind(entry.id)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${kind === entry.id ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>
              <span className="mr-1" aria-hidden>{entry.icon}</span>{entry.label}
            </button>
          ))}
        </div>
        <p className="m-0 text-xs text-soft-ink">{KINDS.find((entry) => entry.id === kind)?.blurb}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-52 flex-1 rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, tag or store…" />
          <select className="rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-sm" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
            <option value="">Any subject</option>
            {SUBJECTS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </div>
      </div>

      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}

      {stores.length ? (
        <section className={`${card} p-5`}>
          <p className={kicker}>Stores</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stores.map((store) => {
              const stats = storeStats(store.id, listings);
              return (
                <button key={store.id} type="button" onClick={() => setOpenStore(store.id)} className="flex items-center gap-2 rounded-2xl border border-ink/10 px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black text-white" style={{ background: store.colour }}>{store.name.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{store.name}</span>
                    <span className="block text-[11px] text-soft-ink">{stats.listings} for sale · {stats.downloads} downloads{stats.rating ? ` · ${stats.rating.toFixed(1)}★` : ""}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            store={stores.find((entry) => entry.id === listing.storeId)}
            onInstall={install}
            onReview={() => setReviewFor(listing.id)}
            onOpenStore={setOpenStore}
            onRemove={myStore && listing.storeId === myStore.id ? () => setListings(unpublish(listing.id)) : undefined}
          />
        ))}
        {!visible.length ? (
          <p className={`${card} col-span-full p-6 text-center text-sm text-soft-ink`}>
            Nothing here yet. {kind === "agent" ? "Build an agent in Agent Studio and sell it." : kind === "template" || kind === "component" ? "Design it in Template Studio and sell it." : kind === "plan" ? "Build a study plan and sell it with its material." : "Generate a resource and sell it."}
          </p>
        ) : null}
      </div>

      {reviewFor ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setReviewFor("")}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
            <h4 className="m-0 text-lg font-bold text-ink">How was it?</h4>
            <div className="mt-3 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={`text-2xl ${value <= reviewDraft.rating ? "text-[#f5a623]" : "text-ink/20"}`} onClick={() => setReviewDraft({ ...reviewDraft, rating: value })}>★</button>)}
            </div>
            <textarea className={`${field} mt-3`} rows={3} value={reviewDraft.comment} onChange={(event) => setReviewDraft({ ...reviewDraft, comment: event.target.value })} placeholder="What worked, what did not — other teachers read this." />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={() => setReviewFor("")}>Cancel</button>
              <button type="button" className={primaryBtn} onClick={() => { setListings(addReview(reviewFor, { ...reviewDraft, author: profileName || "A teacher" })); setReviewFor(""); setReviewDraft({ rating: 5, comment: "" }); setStatus("Thanks — your review is on the listing."); }}>Post review</button>
            </div>
          </div>
        </div>
      ) : null}

      {storeForm ? (
        <StoreDialog
          store={myStore}
          owner={profileName}
          onCancel={() => setStoreForm(false)}
          onSave={(store) => { setStores(saveStore(store)); setStoreForm(false); setStatus(`Store “${store.name}” saved.`); }}
        />
      ) : null}

      {selling ? (
        <SellDialog
          store={myStore}
          documents={documents}
          templates={templates}
          onCancel={() => setSelling(false)}
          onNeedStore={() => { setSelling(false); setStoreForm(true); }}
          onPublish={(listing) => { publish(listing); setListings(readMarket()); setSelling(false); setKind(listing.kind); setStatus(`“${listing.name}” is on sale.`); }}
        />
      ) : null}
    </section>
  );
}

function ListingCard({ listing, store, onInstall, onReview, onOpenStore, onRemove }) {
  const rating = ratingOf(listing);
  const kind = KINDS.find((entry) => entry.id === listing.kind);
  return (
    <article className={`${card} flex flex-col gap-2 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="m-0 truncate text-base font-bold text-ink">{listing.name}</h4>
          <p className="m-0 mt-0.5 text-xs text-soft-ink">{listing.tagline}</p>
        </div>
        <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{kind?.icon} {kind?.label.replace(/s$/, "")}</span>
      </div>
      {listing.description ? <p className="m-0 line-clamp-3 text-xs text-soft-ink">{listing.description}</p> : null}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-soft-ink">
        {store ? <button type="button" className="flex items-center gap-1 font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => onOpenStore(store.id)}><span className="size-2 rounded-full" style={{ background: store.colour }} />{store.name}</button> : null}
        {listing.subject ? <span>· {listing.subject}</span> : null}
        <span>· {listing.downloads || 0} download{listing.downloads === 1 ? "" : "s"}</span>
      </div>
      <div className="flex items-center gap-2">
        <Stars value={rating.average} />
        <span className="text-[11px] text-soft-ink">{rating.count ? `${rating.average.toFixed(1)} · ${rating.count} review${rating.count === 1 ? "" : "s"}` : "No reviews yet"}</span>
      </div>
      {(listing.reviews || []).slice(0, 1).map((review) => (
        <p key={review.id} className="m-0 rounded-lg bg-[var(--surface-soft)] px-2.5 py-1.5 text-[11px] text-ink">“{review.comment || "Recommended."}” <span className="text-soft-ink">— {review.author}</span></p>
      ))}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <span className="text-sm font-bold text-ink">{priceLabel(listing)}</span>
        <button type="button" className={`${primaryBtn} ml-auto py-1.5 text-xs`} onClick={() => onInstall(listing)}>Get it</button>
        <button type="button" className={ghostBtn} onClick={onReview}>Review</button>
        {onRemove ? <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={onRemove}>Unlist</button> : null}
      </div>
    </article>
  );
}

function StoreDialog({ store, owner, onCancel, onSave }) {
  const [draft, setDraft] = useState(store || newStore({ name: "", owner }));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">{store ? "Your store" : "Open your store"}</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">Buyers see this before they see anything you sell: the name, what you are known for, and your record.</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Store name<input autoFocus className={field} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Rivera Classroom" /></label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">One line<input className={field} value={draft.tagline} onChange={(event) => setDraft({ ...draft, tagline: event.target.value })} placeholder="Secondary maths, made printable." /></label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">About<textarea className={field} rows={3} value={draft.about} onChange={(event) => setDraft({ ...draft, about: event.target.value })} placeholder="Who you are and who your material is for." /></label>
          <div className="flex flex-wrap items-center gap-1.5">
            {["#0071e3", "#2f9e5b", "#b25e00", "#8e44ad", "#d7003a", "#0aa2c0"].map((colour) => (
              <button key={colour} type="button" aria-label={`Colour ${colour}`} className={`size-6 rounded-full ${draft.colour === colour ? "ring-2 ring-offset-2 ring-ink/40" : ""}`} style={{ background: colour }} onClick={() => setDraft({ ...draft, colour })} />
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={primaryBtn} disabled={!draft.name.trim()} onClick={() => onSave({ ...draft, owner: draft.owner || owner })}>Save store</button>
        </div>
      </div>
    </div>
  );
}

/** What can be sold is whatever the person already has: their agents, templates, blocks, resources and plans. */
function SellDialog({ store, documents = [], templates = [], onCancel, onPublish, onNeedStore }) {
  const [kind, setKind] = useState("agent");
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState({ name: "", tagline: "", description: "", subject: "", price: 0, pricingType: "one-time" });

  const parse = (document) => { try { return JSON.parse(String(document.content || "{}")); } catch { return null; } };
  const options = useMemo(() => {
    if (kind === "agent") return documents.filter((document) => (document.tags || []).includes("ai-agent")).map((document) => ({ id: document.id, name: document.name.replace(/\.agent\.json$/, ""), payload: parse(document) }));
    if (kind === "template") return templates.map((template) => ({ id: template.id, name: template.name, payload: template }));
    if (kind === "component") return [...builtInBlocks(), ...readBlockLibrary()].filter((block) => !block.builtIn).map((block) => ({ id: block.id, name: block.name, payload: block }));
    if (kind === "plan") return documents.filter((document) => (document.tags || []).includes(PLAN_TAG)).map((document) => ({ id: document.id, name: parsePlan(document)?.name || document.name, payload: parsePlan(document) }));
    return documents.filter((document) => (document.tags || []).includes(RESOURCE_TAG)).map((document) => ({ id: document.id, name: parseResource(document)?.name || document.name, payload: parseResource(document) }));
  }, [kind, documents, templates]);

  const chosen = options.find((option) => option.id === source) || null;

  if (!store) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
          <h4 className="m-0 text-lg font-bold text-ink">You need a store first</h4>
          <p className="m-0 mt-1 text-xs text-soft-ink">Everything is sold under a store, so buyers know who made it.</p>
          <button type="button" className={`${primaryBtn} mt-4`} onClick={onNeedStore}>Open my store</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">Sell something</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">From <strong>{store.name}</strong>. A study plan is sold with its schedule, its goals and the resources it built.</p>
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {KINDS.map((entry) => <button key={entry.id} type="button" onClick={() => { setKind(entry.id); setSource(""); }} className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${kind === entry.id ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{entry.label}</button>)}
          </div>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">What are you selling
            <select className={field} value={source} onChange={(event) => { setSource(event.target.value); const option = options.find((item) => item.id === event.target.value); if (option) setDraft((current) => ({ ...current, name: current.name || option.name })); }}>
              <option value="">Choose…</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Name<input className={field} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Subject
              <select className={field} value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })}>
                <option value="">Any</option>
                {SUBJECTS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">One line<input className={field} value={draft.tagline} onChange={(event) => setDraft({ ...draft, tagline: event.target.value })} placeholder="What it does, in a sentence." /></label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Description<textarea className={field} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What the buyer gets and who it is for." /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Price (€)<input type="number" min="0" step="0.5" className={field} value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} /></label>
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">How it is charged
              <select className={field} value={draft.pricingType} onChange={(event) => setDraft({ ...draft, pricingType: event.target.value })}>
                {Object.entries(PRICING_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={primaryBtn}
            disabled={!chosen || !draft.name.trim()}
            onClick={() => onPublish({ ...draft, kind, storeId: store.id, payload: chosen.payload, price: Number(draft.price) || 0 })}
          >
            Put it on sale
          </button>
        </div>
      </div>
    </div>
  );
}
