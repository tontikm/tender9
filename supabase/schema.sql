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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Matches: which tenders matched which profile
create table if not exists tender_matches (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade,
  profile_id uuid references matching_profiles(id) on delete cascade,
  match_score numeric,
  status text default 'new',          -- 'new' | 'saved' | 'dismissed' | 'applied'
  notified_at timestamptz,
  created_at timestamptz default now(),
  unique (tender_id, profile_id)
);

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

-- tender_matches has no user_id of its own — ownership flows through the
-- owning matching_profiles row.
drop policy if exists "Users manage matches for their own profiles" on tender_matches;
create policy "Users manage matches for their own profiles"
  on tender_matches for all
  to authenticated
  using (
    exists (
      select 1 from matching_profiles
      where matching_profiles.id = tender_matches.profile_id
      and matching_profiles.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from matching_profiles
      where matching_profiles.id = tender_matches.profile_id
      and matching_profiles.user_id = auth.uid()
    )
  );

-- tender_drafts: no policy for the authenticated role — this feature is
-- dormant (hidden UI, deferred to v2 per the project brief), so it stays
-- reachable only via the service-role key until it's re-enabled.
