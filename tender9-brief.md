# Tender9 — Project Brief for Claude Code

**Owner:** Ron Khumalo
**Domain:** tender9.co.za
**Legal entity:** Tender9 (Pty) Ltd (CIPC registration in progress before launch)
**Timeline to first paying customer:** 4 weeks
**Builder:** Solo (Ron) with Claude Code
**Funding:** Bootstrap
**Status:** Phase 1 codebase scaffolded and pushed to `https://github.com/tontikm/tender9.git`. Supabase project created, `schema.sql` already run. Currently debugging OCDS API integration in `lib/ocds.ts`.

---

## What Tender9 is

A commercial South African SaaS product that helps growing IT/ICT SMEs (a few staff, tenders occasionally) find, apply for, and manage South African government tenders — end to end, from discovery to submitted bid.

Tender9 is its own standalone business. Do not tie it to any other entity in code, copy, or planning.

---

## Target customer (v1)

- Growing IT/ICT SMEs in South Africa
- A few staff, tenders happen occasionally (not full-time bid teams)
- Solo user per account in v1 (no team/multi-user features)

---

## What v1 includes (locked scope, 4 weeks)

The scope was deliberately cut down from a larger vision to make a 4-week solo build realistic. Post-launch expansion is planned but explicitly out of scope for v1.

**In scope for v1:**

1. **Tender discovery — eTenders OCDS API only** (National Treasury). One clean, reliable integration against a documented public API. Confirmed live endpoint: `GET https://ocds-api.etenders.gov.za/api/OCDSReleases` (swagger: `https://ocds-api.etenders.gov.za/swagger/v1/swagger.json`). Filtered to IT/ICT categories via keyword + category matching.
2. **Company profile** — one profile per user, fields for legal name, reg no, VAT no, tax clearance status, B-BBEE level + expiry, CIDB grade + expiry, CSD number, physical/postal address, contact, banking details, signatory.
3. **Standard SBD form auto-fill** — SBD 1, SBD 4, SBD 6.1, SBD 8, SBD 9, SBD 19 mapped once each and reused across all tenders that require them. Fill from the stored company profile. Assemble into a downloadable PDF pack.
4. **Bid workspace** — saved tenders, deadline tracking, per-tender status (new, applying, submitted), and a checklist of items the tender required that Tender9 couldn't auto-fill (must be honest about gaps, never mislead).
5. **Auth** — email/password + Google sign-in via Supabase Auth.
6. **Freemium billing** — free-forever tier with a usage limit (e.g. 3 tender saves + auto-fills per month). Paid tiers unlock higher limits. **Payment provider deferred** — build subscription plumbing provider-agnostic; final provider (PayFast / Paystack / other) decided closer to launch. Free tier can go live before paid tiers do.
7. **Email notifications** — daily digest of matched tenders + deadline reminders. Resend or similar.
8. **Landing page + pricing page + basic docs** on tender9.co.za.

**Explicitly deferred to v2 or later** (do not build in v1):

- SITA scraping
- Municipal (Tshwane, Joburg, Cape Town, eThekwini, Ekurhuleni) scrapers
- SOE (Eskom, Transnet, PRASA, SANRAL, ACSA) scrapers
- Department-specific / non-standard form filling
- AI narrative drafting (methodology, technical approach)
- WhatsApp notifications (requires Meta approval + BSP fees, 1-2 weeks lead time)
- Team collaboration / multi-user accounts / roles
- Mobile apps (web-responsive only in v1)

Post-launch priority order for these will be driven by paying-customer feedback, not upfront assumptions.

---

## Design direction

Modern / clean / tech-startup — reference points are Linear and Vercel. Not the generic corporate-SaaS-template look most SA business tools default to. Distinctive visual identity is a real differentiator, but v1 gets "clean and confident," not fully custom-designed — a proper design pass is post-launch work.

- Web app, desktop-first, mobile-responsive.
- Sans-serif system font stack initially, one accent color, generous whitespace, low-noise UI.
- Avoid stock-photo hero images; prefer product screenshots or restrained abstract graphics.

---

## Technical stack (already set up)

- Next.js 15 (App Router), TypeScript
- Supabase (Postgres + Auth + Storage) — project already created, region **af-south-1 (Cape Town)** for POPIA proximity
- Vercel for hosting + Cron
- Zod for input validation
- Server-side use of Supabase service role key only (never client-side)
- All secrets in `.env.local` (already `.gitignore`d) and Vercel env vars, never in git

Existing files (Phase 1, already on `main`):
- `supabase/schema.sql` — `tenders`, `matching_profiles`, `tender_matches`, `ingestion_runs`
- `lib/supabase.ts`, `lib/ocds.ts`, `lib/match.ts`
- `app/api/ingest/route.ts` — protected by `CRON_SECRET`
- `vercel.json` with hourly cron on `/api/ingest`

---

## Immediate next task (pick up here)

Finish debugging the OCDS integration:

1. `lib/ocds.ts` currently returns `400 Bad Request` when called via `curl http://localhost:3000/api/ingest -H "Authorization: Bearer <CRON_SECRET>"` (auth passes and Supabase connects — the failure is at the external API call).
2. The confirmed swagger says the endpoint takes `PageNumber`, `PageSize`, `dateFrom`, `dateTo`. Verify these are being sent correctly and the response shape matches the OCDS release schema (`{ releases: [...] }` or a bare array).
3. Once one real tender is written to the `tenders` table and matched against the seeded profile, this phase is done.
4. Then move to auth (Supabase Auth: email + Google), then company profile CRUD, then SBD form filling.

---

## Non-negotiables

- **Honesty over false auto-fill.** If a tender uses a form Tender9 hasn't mapped, the UI must clearly say so ("this tender uses forms outside our v1 coverage — you'll need to complete these manually") rather than fill partially or mislead. This is a product-integrity requirement, not just UX polish.
- **POPIA compliance from day one.** Consent for data collection, secure storage of sensitive fields (banking, tax clearance PIN), right-to-delete respected on account deletion. Privacy policy live before first customer.
- **No secrets in git, ever.** Especially the Supabase service role key and any future payment provider keys.
- **Row Level Security on every user-facing table.** Even solo-user v1 gets RLS scoped by `auth.uid()` from the start — retrofitting multi-tenancy without it later is painful and dangerous.
- **Server-side only for anything sensitive.** Service role key, private keys, and any customer PII assembly happen in API routes, never in client components.

---

## Known risks / open items

- **Payment provider not yet chosen.** Build subscription tables provider-agnostic (a `subscriptions` table with `provider`, `provider_customer_id`, `provider_subscription_id`, `plan`, `status`) so switching between PayFast / Paystack / other is a webhook adapter swap, not a schema migration.
- **SBD form PDFs may be flat scans, not fillable AcroForm PDFs.** Download an actual current SBD 4 or SBD 6.1 and check before choosing fill method — see technical spec Section 3.
- **Free tier limits need to be enforced server-side**, not just in the UI, or users will bypass them via API. Middleware or route-level checks against a `usage` table.
- **Solo builder, 4-week timeline is aggressive even with cut scope.** Anything not on the "in scope for v1" list above is a distraction and gets deferred without debate.

---

## Reference documents in this repo

- `tender-system-full-spec.md` — the deeper technical spec (schemas, architecture, full roadmap). v1 brief above overrides anything in that doc where they conflict.
- `README.md` — setup instructions for Phase 1 codebase.
