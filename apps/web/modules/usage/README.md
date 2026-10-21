# usage

The usage circle in the top bar of a logged-in account (`UsageMeter.js`): the outer ring is how much of this
month's **AI credits** is left, the inner ring how much **storage** is used. Clicking it lists what used the
credits (by activity) and what takes the space (by kind, plus the five biggest files).

- Server: `lib/usageCore.js` (pure rules, limits), `lib/usageRepository.js` (reads/writes), `lib/aiUsage.js`
  (`meteredAi` wraps every AI route: counts the provider's own token numbers, refuses new AI work when the month's
  credits are used up, except marking answers and reading uploads), `app/api/accounts/usage` (the meter's data).
- 1 AI credit = 1,000 model tokens. Defaults: 1,000 credits a month for students and parents, 3,000 for teachers,
  100 MB of storage each. Env overrides: `LUNA_AI_MONTHLY_CREDITS`, `LUNA_AI_MONTHLY_CREDITS_TEACHER`,
  `LUNA_STORAGE_LIMIT_MB`.
- Needs migration `202610210003_ai_usage_storage.sql`; until then the circle is hidden and nothing is limited.
