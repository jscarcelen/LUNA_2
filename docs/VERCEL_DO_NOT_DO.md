# Vercel Guardrails (Do Not Do)

This project is sensitive to deploy context because it is a monorepo with the web app in apps/web.

## 1) Do not deploy from apps/web using Vercel CLI

Why it breaks:
- The project uses root-level vercel.json with outputDirectory set to apps/web/.next.
- If deployment starts from apps/web, Vercel may still look for apps/web/.next relative to that folder, causing:
  - Next.js output directory not found
  - routes-manifest.json missing errors

Do this instead:
- Deploy from repo root only:
  - npx vercel deploy --prod --yes --scope jonathans-projects-396234a2

## 2) Do not change Output Directory to mismatch build context

Unsafe combinations:
- Deploying from apps/web while outputDirectory is apps/web/.next
- Root deployment with outputDirectory set to .next

Safe combination for this repo:
- Deploy from root
- outputDirectory: apps/web/.next

## 3) Do not override Build Command in Vercel dashboard with plain npm run build

Why it breaks:
- Plain npm run build may run in the wrong workspace context.
- Monorepo build must explicitly target web workspace and webpack mode.

Required build command:
- npm run build --workspace @luna/web -- --webpack

## 4) Do not link this repo root to the wrong Vercel project

Symptom:
- Vercel CLI tries to create/use another project, or project-name validation errors appear.

Check and fix:
- cat .vercel/project.json
- If wrong, relink:
  - npx vercel link --project luna2-share-web --scope jonathans-projects-396234a2 --yes

## 5) Do not trust a failed latest deployment as production status

Important:
- Vercel can have a failed newer deploy while production alias still points to an older ready deploy.

Always verify:
- npx vercel ls luna2-share-web --scope jonathans-projects-396234a2
- npx vercel inspect <deployment-url> --scope jonathans-projects-396234a2
- Confirm alias points to a READY deployment

## Safe Deploy Runbook

1. From repo root (LUNA_2):
   - pwd
   - should be .../LUNA_2
2. Validate root project link:
   - cat .vercel/project.json
   - projectName should be luna2-share-web
3. Validate root vercel.json:
   - outputDirectory: apps/web/.next
   - buildCommand: npm run build --workspace @luna/web -- --webpack
4. Build locally:
   - npm run build --workspace @luna/web
5. Deploy:
   - npx vercel deploy --prod --yes --scope jonathans-projects-396234a2
6. Verify ready + alias:
   - npx vercel inspect <deployment-url> --scope jonathans-projects-396234a2
   - confirm https://luna2-share-web.vercel.app is aliased to READY deploy

## One-line Recovery If Error Returns

- Re-link root + redeploy from root:
  - npx vercel link --project luna2-share-web --scope jonathans-projects-396234a2 --yes
  - npx vercel deploy --prod --yes --scope jonathans-projects-396234a2
