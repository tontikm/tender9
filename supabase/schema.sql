-- Tender9 — Phase 1 schema
-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run

-- Raw normalized tender records, one row per contracting process
create table if not exists tenders (
  id uuid primary key default gen_random_uuid(),
  source text not null,               -- 'etenders_ocds' | 'sita' | 'tshwane' | etc.
  external_id text not null,          -- OCID for Treasury records, source-specific ID otherwise
  title text not null,
  description text,
  buyer_name text,
  category text,
  province text,
  value_estimate numeric,
  currency text default 'ZAR',
  status text,
  closing_date timestamptz,
  briefing_date timestamptz,
  published_date timestamptz,
  document_urls text[],
  raw_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (source, external_id)
);

create index if not exists idx_tenders_closing_date on tenders (closing_date);
create index if not exists idx_tenders_category on tenders (category);
create index if not exists idx_tenders_status on tenders (status);

-- Business profiles used to define what counts as "relevant".
-- Each belongs to one signed-up account (user_id) — this is the
-- multi-tenancy boundary: every query scopes matching_profiles (and,
-- through it, tender_matches) to the authenticated user.
create table if not exists matching_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  keywords text[],
  categories text[],
  provinces text[],
  min_value numeric,
  max_value numeric,
  cidb_grade text,
  active boolean default true,
  created_at timestamptz default now(),
  unique (user_id, name)
);

create index if not exists idx_matching_profiles_user_id on matching_profiles (user_id);

-- Company profile: the signed-up account's own business details, used to
-- pre-fill bid paperwork (SBD forms etc.). One row per user. Distinct from
-- matching_profiles, which describe what tenders the user wants — this
-- describes who the user is.
create table if not exists company_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  legal_name text,
  trading_name text,
  registration_number text,      -- CIPC registration number
  vat_number text,
  csd_number text,               -- Central Supplier Database (MAAA) number
  tax_compliance_pin text,       -- SARS Tax Compliance Status PIN
  bbbee_level text,              -- '1'..'8' | 'Non-compliant' | 'Exempt Micro Enterprise'
  bbbee_expiry date,
  cidb_grade text,
  cidb_expiry date,
  physical_address text,
  contact_email text,
  contact_phone text,
  bank_name text,
  bank_account_holder text,
  bank_account_number text,
  bank_branch_code text,
  signatory_name text,           -- person authorised to sign bids
  signatory_capacity text,       -- their role, e.g. "Director"
  logo_data_url text,            -- company logo, stored as a data: URL (resized client-side)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table company_profiles add column if not exists logo_data_url text;

-- Bid workspace: per-user, per-tender bid-preparation state — the checklist
-- of SBD forms/documents/tasks the user has ticked off, plus free-text notes.
-- One row per (user, tender). The checklist item *definitions* live in code
-- (lib/bid-workspace.ts); only the ticked state + custom tasks are stored here.
create table if not exists bid_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tender_id uuid not null references tenders(id) on delete cascade,
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, tender_id)
);

create index if not exists idx_bid_workspaces_user_id on bid_workspaces (user_id);

-- In-progress document fills: lets a user save an unfinished filled document
-- and resume it later on any device (instead of downloading + re-uploading).
-- `placements` is the fill tool's overlay (text/signature/marks/pen). For
-- tender documents the PDF is re-fetched from the tender, so only uploads
-- store their bytes (base64) in pdf_base64. One row per (user, doc_key).
create table if not exists document_fills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tender_id uuid references tenders(id) on delete set null,
  doc_key text not null,
  doc_name text not null,
  placements jsonb not null default '[]'::jsonb,
  pdf_base64 text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, doc_key)
);

create index if not exists idx_document_fills_user_id on document_fills (user_id);

-- Requests for quotation: a document a user builds to send to suppliers
-- asking them to price a list of items, generated with the user's company
-- details/logo. Not tied to submitting a bid — a sourcing tool the user
-- fills in once and can revisit to adjust items or re-send to another
-- supplier. tender_id is nullable since a user may want to source quotes
-- before (or without) linking the request to a specific tender.
create table if not exists rfqs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tender_id uuid references tenders(id) on delete set null,
  title text not null default 'Request for Quotation',
  recipient_name text,
  recipient_email text,
  due_date date,
  notes text,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_rfqs_user_id on rfqs (user_id);

-- Matches: which tenders matched which profile. profile_id is nullable so a
-- tender can also be manually saved straight from Browse, with no profile
-- behind it — user_id is the real ownership column either way.
create table if not exists tender_matches (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade,
  profile_id uuid references matching_profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  match_score numeric,
  status text default 'new',          -- 'new' | 'saved' | 'dismissed' | 'applied'
  notified_at timestamptz,
  viewed_at timestamptz,              -- first time the owning user opened the tender detail
  created_at timestamptz default now(),
  unique (tender_id, profile_id)
);

alter table tender_matches add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists idx_tender_matches_user_id on tender_matches (user_id);

-- Backfill user_id on existing rows from their owning profile, before the
-- RLS policy below switches to relying on user_id directly.
update tender_matches tm
set user_id = mp.user_id
from matching_profiles mp
where tm.profile_id = mp.id and tm.user_id is null;

-- Drafted response narratives (Claude-generated cover letter / EOI text).
-- One draft per tender — regenerating overwrites the previous draft.
create table if not exists tender_drafts (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade unique,
  content text not null,
  model text,
  created_at timestamptz default now()
);

-- Ingestion run log
create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  records_fetched int,
  records_new int,
  records_updated int,
  status text,                        -- 'running' | 'success' | 'partial' | 'failed'
  error_message text
);

-- Enable RLS on everything. User-facing pages/actions use a
-- session-bound client (anon key + the signed-in user's JWT), so these
-- policies are the real enforcement boundary, not just defense in depth.
-- The service-role key (which bypasses RLS) is reserved for the
-- ingestion cron and cross-tenant matching logic — the only things that
-- legitimately need to read/write across every account at once.
alter table tenders enable row level security;
alter table matching_profiles enable row level security;
alter table company_profiles enable row level security;
alter table bid_workspaces enable row level security;
alter table document_fills enable row level security;
alter table rfqs enable row level security;
alter table tender_matches enable row level security;
alter table tender_drafts enable row level security;
alter table ingestion_runs enable row level security;

-- Tenders and ingestion run status are shared, non-sensitive system data —
-- any signed-in user can read them, but only server-side code (service
-- role) writes them.
drop policy if exists "Authenticated users can read tenders" on tenders;
create policy "Authenticated users can read tenders"
  on tenders for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read ingestion runs" on ingestion_runs;
create policy "Authenticated users can read ingestion runs"
  on ingestion_runs for select
  to authenticated
  using (true);

-- matching_profiles: an account only ever sees/manages its own profiles.
drop policy if exists "Users manage their own matching profiles" on matching_profiles;
create policy "Users manage their own matching profiles"
  on matching_profiles for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- company_profiles: an account only ever sees/manages its own company.
drop policy if exists "Users manage their own company profile" on company_profiles;
create policy "Users manage their own company profile"
  on company_profiles for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- bid_workspaces: an account only ever sees/manages its own bid workspaces.
drop policy if exists "Users manage their own bid workspaces" on bid_workspaces;
create policy "Users manage their own bid workspaces"
  on bid_workspaces for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- rfqs: an account only ever sees/manages its own requests for quotation.
drop policy if exists "Users manage their own rfqs" on rfqs;
create policy "Users manage their own rfqs"
  on rfqs for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- document_fills: an account only ever sees/manages its own saved fills.
drop policy if exists "Users manage their own document fills" on document_fills;
create policy "Users manage their own document fills"
  on document_fills for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- tender_matches: ownership is user_id directly (works for both
-- profile-scored matches and manually-saved ones, which have no profile).
drop policy if exists "Users manage matches for their own profiles" on tender_matches;
drop policy if exists "Users manage their own tender matches" on tender_matches;
create policy "Users manage their own tender matches"
  on tender_matches for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- tender_drafts: no policy for the authenticated role — this feature is
-- dormant (hidden UI, deferred to v2 per the project brief), so it stays
-- reachable only via the service-role key until it's re-enabled.
