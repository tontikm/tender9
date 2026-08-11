# Tender9

Tender9 helps South African companies find government tenders they qualify for and prepare the paperwork to bid.

It pulls tender data from the National Treasury eTenders OCDS API, stores it in Supabase, matches each tender against a company profile, and auto fills the standard SBD bid forms from stored company details.

Live: https://tender9.vercel.app

![Tender9 dashboard](docs/screenshot.png)

## Why

Government tenders in South Africa are published across scattered portals with inconsistent formats, and every bid needs the same set of SBD forms filled in by hand. Small suppliers either miss tenders they qualify for or spend hours on paperwork per bid. Tender9 automates both parts.

## Stack

Next.js 15 (App Router), TypeScript, Supabase, PostgreSQL, Vercel

## How it works

1. A scheduled Vercel Cron job hits the ingestion route
2. The route fetches from the eTenders OCDS API and normalises the response
3. Tenders are stored in Supabase
4. Matching logic scores each tender against the saved company profile
5. Matched tenders are surfaced in the dashboard and sent by email
6. SBD forms are generated from the stored company profile

## Structure

| Path | What it does |
|---|---|
| `lib/ocds.ts` | eTenders OCDS API fetch and normalisation |
| `lib/match.ts` | Tender to company profile matching logic |
| `app/api/ingest/route.ts` | Ingestion endpoint, called by Vercel Cron |
| `supabase/schema.sql` | Database schema and row level security policies |
| `middleware.ts` | Auth and route protection |

## Database

Five tables: `tenders`, `matching_profiles`, `tender_matches`, `tender_drafts`, `ingestion_runs`.

Row level security is enabled on all tables. The service role key is used server side only.

## Running locally

```bash
npm install
```

Set up the database. In your Supabase project, open SQL Editor, then New query, then paste and run the contents of `supabase/schema.sql`.

Set environment variables.

```bash
cp .env.local.example .env.local
```

Fill in your Supabase URL, anon key, service role key, and Resend API key.

```bash
npm run dev
```

## Status

In active development. Ingestion, matching, notifications and SBD form generation are working. Currently covers eTenders only.
