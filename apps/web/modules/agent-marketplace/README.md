# Agent Marketplace

Browse, inspect and install agents.

- `listings.js` — localStorage-backed community listings (key `luna.agentMarketplaceListings.v1`),
  the curated `STARTER_AGENTS` (fully working configs), and `buildAgentFileFromListing`, which turns
  a listing into the `.agent.json` document AI Tools expects (tag `ai-agent`).
- `ui/AgentMarketplacePage.js` — search, category chips, sort, listing cards, details drawer with
  install / run / remove. Installs go through `onSaveGeneratedQuizDocument` into the current
  subject; installed agents are detected via `installedFrom.listingId` in the saved config.

Publishing from the Agent Builder now bundles the agent config into the listing (`listing.agent`),
so it can be installed into any subject. Listings made before that lack `agent` and show a
re-publish notice.

Payments are not implemented: prices are displayed, installs are free. This will move to Supabase
tables (listings, purchases) once auth exists.
