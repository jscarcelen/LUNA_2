# LUNA usage and feedback loop — proposal

Goal: know what users do, where they struggle, what they value and what each change we ship did, so every iteration starts from evidence. Mock of the screen: `docs/usage-insights-mock.html` (sample data, open it in a browser).

Status today: there is a beta feedback widget (`modules/feedback`) and learning analytics for students (attempts, mastery). There is **no product analytics**: nothing records what people click, how long they stay on a screen or whether a download happens. That is the gap this fills.

## 1. Principles (these decide what we may build)

1. **First-party and cookieless.** Events go to our own database. No Google Analytics, Hotjar or similar, no advertising or analytics cookies. This keeps the promise on the Trust page ("no analytics cookies") and avoids a cookie banner.
2. **Pseudonymous.** Events carry a random per-account id, never name, email or typed content. Free text, answers and document content are never logged.
3. **Minors are protected.** Accounts under 14 (guardian-consent accounts): aggregate-only, no per-session replay, no click paths stored beyond 30 days. Under 18: no experiments that change pricing or lunas. Parents can see and switch off usage analytics for a child.
4. **Say it in the Privacy Policy** (service improvement, legitimate interest, 13-month retention of raw events, then aggregates only) and add the new processing to the record in `docs/DPIA_RAT.md` before launch. A lawyer should confirm the legal basis for minors.
5. **Measure outcomes, not just activity.** Time on a screen is not value: a student stuck for 10 minutes and a student learning for 10 minutes look the same. Pair every activity metric with an outcome (finished, scored, came back).
6. **Every metric has an owner question and a decision.** If no decision changes with a number, do not build the chart.

## 2. What to track — metric catalogue

Priority: **P0** first release, **P1** next, **P2** later.

### A. Acquisition and activation
| # | Metric | Definition | Why | P |
|---|---|---|---|---|
| A1 | Visit → sign-up rate | Sign-ups ÷ landing visits (first-party counter) | Is the landing page convincing? Compare tabs (Home, Demo, Trust, Pricing) | P0 |
| A2 | Demo → sign-up rate | Accounts created by people who opened `/app` first | How much the live demo sells | P1 |
| A3 | Activation rate | % of new accounts that, within 7 days, upload a document **and** do one generated activity | The first "aha": material turned into practice | P0 |
| A4 | Time to first value | Minutes from sign-up to first completed activity | The shorter, the better the onboarding | P0 |
| A5 | Onboarding step drop-off | Where first-run checklist / tour steps are abandoned | Shows which step to fix | P0 |
| A6 | Role mix and role-specific activation | Student / teacher / parent each have their own activation event | Needs different fixes per role | P1 |

### B. Engagement and where time goes
| # | Metric | Definition | Why | P |
|---|---|---|---|---|
| B1 | Active users | DAU / WAU / MAU and stickiness (DAU÷MAU) | The basic health number | P0 |
| B2 | Time per feature | Foreground time per area: Home, Study, Progress, Create, Plans, Reader, Chat, Marketplace, Settings | Answers "what do they spend most time on" | P0 |
| B3 | Feature adoption | % of active users who used each feature at least once per week; and first-use curve | Finds features nobody discovers | P0 |
| B4 | Depth | Sessions per week, activities per session, documents opened per session | Casual vs engaged | P1 |
| B5 | Agent usage | Runs per built-in agent, share of custom agents, re-runs and "Update…" use | Which generators earn their place | P0 |
| B6 | Plan usage | Plans created, steps completed on time, replans, plans abandoned | Whether the planning tool is "key", as the vision says | P1 |
| B7 | Chat usage | Chats opened per reader view, questions per chat, share with citations, "not in your material" rate | Whether Chat with Luna is found and useful | P0 |

### C. Usability: what works and what struggles
| # | Metric | Definition | Why | P |
|---|---|---|---|---|
| C1 | Click map per screen | Which controls are clicked, how often, in what order (element id + screen, no content) | Which buttons work; which are ignored | P0 |
| C2 | Dead clicks | Clicks on something that does nothing | Missing affordance | P1 |
| C3 | Rage clicks | 3+ clicks on one spot within 2 s | Frustration, broken controls | P0 |
| C4 | Error rate | Friendly-error shown ÷ sessions, by screen and by cause | Reliability as users feel it | P0 |
| C5 | Task completion rate | Started ÷ finished for key tasks: upload, generate, save, export, answer a quiz, create a plan | The core usability number | P0 |
| C6 | Time on task | Median time to complete each key task, vs a target | Finds slow steps | P0 |
| C7 | Abandonment point | The last screen/step before leaving a task | Where to fix | P0 |
| C8 | Back-and-forth | Same two screens alternated 3+ times, repeated undo/cancel | Confusion | P1 |
| C9 | Search / help use | Help "?" opens, tour restarts, searches with no result | Things users cannot find | P1 |
| C10 | Wait experience | Time from "Generate" to result; share who leave while waiting | Perceived speed (the app is slow today) | P0 |
| C11 | Mobile vs desktop | Every usability metric split by device and by iPhone app/PWA use | Phone layout problems | P1 |
| C12 | Satisfaction pulse | One question after a key task ("Was this useful? 👍/👎 + why") | Subjective, tied to a task | P0 |
| C13 | SUS / NPS survey | Quarterly 10-question usability score and "would you recommend" | Trend over time | P2 |

### D. Output and value
| # | Metric | Definition | Why | P |
|---|---|---|---|---|
| D1 | Download rate | Downloads ÷ generated resources, by format (PDF, Word, HTML, PPTX, original file) | Whether people take Luna's output out of the app, and in which form | P0 |
| D2 | Save rate | Generated results saved ÷ generated | Output quality signal: unsaved means unwanted | P0 |
| D3 | Use-in-app rate | Generated activities that are actually done (started, finished) | Quality and fit | P0 |
| D4 | Regeneration rate | Results regenerated or iterated ÷ generated | High means the first result misses | P0 |
| D5 | Edit rate | Results edited by hand before use | What the agents get wrong | P1 |
| D6 | Grounding quality | Share of items Stated / Inferred / Could not be confirmed; items dropped; chat answers flagged | Hallucination as a tracked number | P0 |
| D7 | Teacher override rate | AI marks changed after a review request ÷ review requests | Is the AI marking trusted | P0 |
| D8 | Learning outcome | Score change on repeated topics, mistakes repeated on the same topic, plan on-track share | The point of the product | P1 |
| D9 | Share / assign rate | Items shared or assigned per teacher, per parent | Network effect | P1 |

### E. Retention and revenue
| # | Metric | Definition | P |
|---|---|---|---|
| E1 | Retention | D1 / D7 / D30 and weekly cohort curves, by role and by activation | P0 |
| E2 | Churn signals | No activity in 14 days after weekly use; inactivity warnings sent and answered | P1 |
| E3 | Resurrection | Returned after 30+ days inactive | P2 |
| E4 | Subscription funnel | Trial → paid → renewed (once payments exist) | P1 |
| E5 | Lunas economy | Lunas bought, spent per feature, marketplace purchases and earnings, balance at 0 | P1 |
| E6 | Cost per active user | AI tokens and cost per user and per feature (already estimated in the dashboard doc) | P0 |
| E7 | Cost per successful output | Cost ÷ outputs that were saved/done: efficiency of each agent | P1 |

### F. Feedback and iteration
| # | Metric | Definition | P |
|---|---|---|---|
| F1 | Feedback volume and type | Items per week by kind (idea, problem, look, AI result), by screen and role | P0 |
| F2 | Themes | Feedback clustered by topic with counts, so the loudest problem is visible | P0 |
| F3 | Time to first response / to ship | Days from feedback to "queued" to "done" (statuses already exist) | P0 |
| F4 | Feedback → shipped rate | Share of items that led to a change, and what the user said after | P1 |
| F5 | Change impact | For every shipped change: metric before vs after (see §4) | P0 |
| F6 | Experiments | A/B or staged rollouts with a primary metric, guardrails and a result | P1 |
| F7 | Bug and crash rate | Client errors per 1,000 sessions, by release | P0 |
| F8 | Release health | Metrics per release, with rollback trigger if errors rise | P1 |

## 3. Features of the platform

1. **Event tracking layer (P0).** A tiny client helper `track(name, props)` and automatic capture of screen views, clicks on elements marked with `data-track`, errors, and performance timings. Batched to `POST /api/events`; the server stamps the account (never taken from the body) and drops anything outside an allow-list of property names.
2. **Event taxonomy and schema (P0).** A fixed list: `screen_view`, `click`, `task_start`, `task_done`, `task_abandon`, `error_shown`, `agent_run`, `agent_result`, `save`, `download`, `chat_open`, `chat_question`, `review_requested`, `feedback_sent`, `plan_created`, `plan_step_done`, `share`, `onboarding_step`. Documented in one file so product, code and dashboard agree.
3. **Insights dashboard (P0)**, owner-only: KPI strip, feature time-share, funnel, click map per screen, struggle signals, downloads by format, grounding quality, cost per user. Filters: date range, role, device, plan, cohort.
4. **Funnels and journeys (P0).** Named funnels (sign-up → upload → generate → do → return) with drop-off at each step and a "show me sessions that stopped here" list (pseudonymous, no content).
5. **Struggle detector (P0).** Rage clicks, dead clicks, repeated errors, long waits, back-and-forth: each ranked by users affected, with the screen and element, so the top 5 problems are always on one list.
6. **Retention cohorts (P0).** Weekly cohorts by sign-up week, role and activation, with a retention grid.
7. **In-context feedback (P0, extends today's widget).** Pulse question after a key task, "Was this result useful?" on each generated item, "Report a problem" that auto-attaches screen, role, release and the last 10 events (no content). Replaces free-floating feedback with feedback that has context.
8. **Feedback inbox with themes (P1).** Existing board plus automatic clustering into themes, counts, sentiment, linking to the usage data of that screen, and a status that follows the idea to shipped.
9. **Iteration tracker (P0).** Each shipped change is a card: hypothesis, metric, baseline, release date, result after 7 and 28 days, decision (keep, tweak, revert). This is the "feedback loop" made visible.
10. **Experiments and flags (P1).** Feature flags with percentage rollout and an A/B result view (primary metric, guardrail, confidence). Never on minors' accounts for anything that changes grading, prices or lunas.
11. **Alerts (P1).** Daily email or message when a metric breaks a threshold: error rate up, activation down, generation time up, rage clicks on a new release.
12. **Session samples (P2).** Optional, owner-only, adults only and opt-in: a sequence of events of a session as a timeline. No screen recording.
13. **Privacy controls (P0).** Per-account switch "Help improve Luna with anonymous usage data" (default on for adults, off pending guardian choice for under-14); the data export includes the account's events; erase on account deletion; raw events deleted after 13 months.
14. **Public changelog and "you said, we did" (P2).** Shows users which feedback shipped; raises feedback quality and trust.

## 4. The loop (how we use it every two weeks)

1. **Observe.** Open the dashboard: top struggle signals, biggest funnel drop, lowest-rated results, loudest feedback theme.
2. **Pick one problem** with a number attached ("38 % of new accounts never upload a document").
3. **Write the hypothesis and the metric** ("a one-click sample document raises first-week activation from 31 % to 40 %") and create the iteration card.
4. **Ship small**, behind a flag where it makes sense.
5. **Read the result** after 7 and 28 days against the baseline and the guardrails (errors, cost, satisfaction).
6. **Decide** keep, tweak or revert, and write it in the card. Tell the users who asked.

## 5. Build plan

| Phase | Scope | Rough effort |
|---|---|---|
| 1 (about 1 week) | `track()` helper, `/api/events`, `events` table, screen views, clicks on `data-track`, errors, task start/done for the 6 key tasks, download/save/regenerate events, privacy switch, retention job | small |
| 2 (about 1 week) | Owner dashboard: KPIs, feature time, funnels, struggle list, downloads, grounding quality, cost per user; iteration tracker | medium |
| 3 | In-context pulse and result ratings, feedback themes, cohorts, alerts | medium |
| 4 | Flags and experiments, session timelines, changelog | medium |

Data model (Supabase, service-role only, RLS on): `events(id, at, account_id_hash, role, device, release, screen, name, props jsonb)`, `iteration_cards`, `pulse_answers`. Account ids are hashed with a server secret so the dashboard cannot be joined back to a person without the key; props are validated against the allow-list.

## 6. Open decisions for you

- Default for adults: on with an easy switch (recommended) or ask first.
- Under-14: no usage analytics at all, or aggregate-only (recommended).
- Who sees the dashboard: only you, or also a future team (needs roles).
- Whether to also put a first-party visit counter on the landing page (no cookies, counts only).
