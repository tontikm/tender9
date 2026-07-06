# Tender9 — Phase 1

Ingestion pipeline: pulls tenders from the National Treasury eTenders OCDS API,
stores them in Supabase, and matches them against your business profile(s).

## What's included in this phase

- Supabase schema (`supabase/schema.sql`)
- OCDS API fetch + normalize logic (`lib/ocds.ts`)
- Matching logic (`lib/match.ts`)
- Ingestion API route (`app/api/ingest/route.ts`), meant to be called hourly by Vercel Cron
- Minimal placeholder homepage (dashboard comes in Phase 2)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. In your Supabase project dashboard, go to **SQL Editor → New query**.
2. Paste the entire contents of `supabase/schema.sql` and run it.
3. Confirm five tables now exist: `tenders`, `matching_profiles`, `tender_matches`, `tender_drafts`, `ingestion_runs` — and that a starter row exists in `matching_profiles`.

### 3. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — same page, the service_role secret. **Never commit this.**
- `CRON_SECRET` — any random string (`openssl rand -hex 16`), protects the ingest endpoint from public access
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com/settings/keys, powers the "Draft response"
  button on saved tenders. Optional: without it, drafting saves a visible error instead of crashing.

### 4. IMPORTANT — verify the OCDS API details before running

`lib/ocds.ts` has placeholder values for the exact endpoint path and query
parameter names, marked with `TODO` comments. Before running ingestion:

1. Open https://ocds-api.etenders.gov.za/swagger/index.html
2. Find the endpoint that returns releases/tenders
3. Update `OCDS_RELEASES_PATH` and the query param names in `fetchOcdsReleases()`
   in `lib/ocds.ts` to match exactly what the Swagger UI shows
4. Check one real response to confirm the field paths in `normalizeRelease()`
   (e.g. `tender.title`, `tender.value.amount`) match what the API actually returns —
   these follow standard OCDS conventions but the SA implementation may have quirks

### 5. Run locally

```bash
npm run dev
```

Test ingestion manually (don't wait for the cron):

```bash
curl http://localhost:3000/api/ingest -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Check the `ingestion_runs` table in Supabase to confirm it logged a run, and
check `tenders` / `tender_matches` for results.

### 6. Deploy to Vercel

1. Push this repo to GitHub (already done).
2. Import the repo in Vercel.
3. Add the same environment variables from `.env.local` in Vercel's project settings (Environment Variables).
4. Deploy. The `vercel.json` cron config will automatically run `/api/ingest` hourly once deployed — Vercel Cron only runs on deployed projects, not locally.

## Response drafting

On any tender you've marked **Saved**, a "Draft response" button generates a
cover-letter/EOI narrative via the Claude API (`lib/draft.ts`), stored in
`tender_drafts` (one draft per tender — regenerating overwrites it).

## Next steps

Fixed-form filling (auto-populating standard SBD forms) is the remaining
item from the original roadmap.
