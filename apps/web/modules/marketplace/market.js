/**
 * The marketplace.
 *
 * Five kinds of thing are sold, because they are the five things Luna makes: agents, whole
 * templates, single template components, one study resource, and a whole study plan with the
 * material and activities it schedules. Everything is sold *by* a store — a seller's brand, with a
 * name, a look and a record: downloads, ratings and what buyers wrote.
 *
 * Until accounts and payments exist this lives in localStorage; the shape is what matters, and it
 * is the shape a server would store.
 */

export const MARKET_KEY = "luna.marketplace.v2";
export const STORE_KEY = "luna.marketplace.stores.v1";

export const KINDS = [
  { id: "agent", label: "AI agents", blurb: "Recipes that generate content from your material.", icon: "✦" },
  { id: "template", label: "Templates", blurb: "Whole documents: exams, worksheets, flashcards, slides.", icon: "▦" },
  { id: "component", label: "Components", blurb: "Single blocks to drop into your own templates.", icon: "◫" },
  { id: "resource", label: "Study resources", blurb: "Ready-made quizzes, summaries and activities.", icon: "◉" },
  { id: "plan", label: "Study plans", blurb: "A full plan: schedule, goals, material and activities.", icon: "◷" }
];

export const PRICING_TYPE_LABELS = {
  "one-time": "One-time",
  "pay-as-you-go": "Pay as you go",
  "per-use": "Per use",
  monthly: "Monthly",
  subscription: "Subscription"
};

export const SUBJECTS = ["Maths", "Science", "Languages", "Humanities", "Primary", "Exam prep", "Other"];

const read = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota or private mode */ }
};

let counter = 0;
const id = (prefix) => `${prefix}_${Date.now().toString(36)}${(counter += 1).toString(36)}`;

/* ---------------------------------------------------------------- stores */

export function readStores() {
  return read(STORE_KEY, []);
}

export function saveStore(store) {
  const stores = readStores();
  const next = store.id && stores.some((entry) => entry.id === store.id)
    ? stores.map((entry) => (entry.id === store.id ? { ...entry, ...store, updatedAt: new Date().toISOString() } : entry))
    : [...stores, { id: store.id || id("store"), createdAt: new Date().toISOString(), ...store }];
  write(STORE_KEY, next);
  return next;
}

export const newStore = ({ name, tagline = "", about = "", colour = "#0071e3", owner = "" }) => ({
  id: id("store"), name: String(name || "My store").trim(), tagline, about, colour, owner, createdAt: new Date().toISOString()
});

/* ---------------------------------------------------------------- listings */

export function readMarket() {
  return read(MARKET_KEY, []);
}

export function writeMarket(listings) {
  write(MARKET_KEY, listings);
  return listings;
}

/**
 * Publishes something. `payload` is whatever the kind needs to be installed: the agent config, the
 * template, the block, the resource, or the plan with its resources.
 */
export function publish({ kind, name, tagline, description, subject, price = 0, pricingType = "one-time", storeId, payload, preview = "", tags = [] }) {
  const listing = {
    id: id("lst"),
    kind,
    name: String(name || "Untitled").trim(),
    tagline,
    description,
    subject,
    price: Number(price) || 0,
    pricingType,
    storeId,
    payload,
    preview,
    tags,
    downloads: 0,
    reviews: [],
    publishedAt: new Date().toISOString()
  };
  writeMarket([listing, ...readMarket()]);
  return listing;
}

export function unpublish(listingId) {
  return writeMarket(readMarket().filter((listing) => listing.id !== listingId));
}

export function recordDownload(listingId) {
  return writeMarket(readMarket().map((listing) => (listing.id === listingId ? { ...listing, downloads: (listing.downloads || 0) + 1 } : listing)));
}

export function addReview(listingId, { rating, comment, author }) {
  const review = { id: id("rev"), rating: Math.max(1, Math.min(5, Number(rating) || 5)), comment: String(comment || "").trim(), author: author || "Anonymous", at: new Date().toISOString() };
  return writeMarket(readMarket().map((listing) => (listing.id === listingId ? { ...listing, reviews: [review, ...(listing.reviews || [])] } : listing)));
}

export const ratingOf = (listing) => {
  const reviews = listing?.reviews || [];
  if (!reviews.length) return { average: 0, count: 0 };
  return { average: reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length, count: reviews.length };
};

/** A store's record: what it sells, how much it was downloaded and how it is rated. */
export function storeStats(storeId, listings = readMarket()) {
  const mine = listings.filter((listing) => listing.storeId === storeId);
  const reviews = mine.flatMap((listing) => listing.reviews || []);
  return {
    listings: mine.length,
    downloads: mine.reduce((sum, listing) => sum + (listing.downloads || 0), 0),
    reviews: reviews.length,
    rating: reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0,
    kinds: [...new Set(mine.map((listing) => listing.kind))]
  };
}

/** Everything a store sells, newest first. */
export const listingsOfStore = (storeId, listings = readMarket()) => listings.filter((listing) => listing.storeId === storeId);
