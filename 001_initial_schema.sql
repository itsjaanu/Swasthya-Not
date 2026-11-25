-- Swasthya Connect AI: starter schema for Supabase/PostgreSQL.
-- Apply only after reviewing privacy, consent, retention and clinical governance requirements.
create extension if not exists pgcrypto;

create type public.app_role as enum (
  'citizen','doctor','facility','pharmacy','organizer','asha','district','admin'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null default 'citizen',
  preferred_language text not null default 'te',
  district text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  facility_type text not null,
  district text not null,
  mandal text,
  address text,
  latitude double precision,
  longitude double precision,
  source text not null default 'provider_submitted',
  external_reference text,
  verification_status text not null default 'pending',
  services jsonb not null default '[]'::jsonb,
  contact_phone text,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.provider_availability (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  provider_user_id uuid references auth.users(id),
  service_label text not null,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  capacity integer not null default 1 check (capacity > 0),
  booked_count integer not null default 0 check (booked_count >= 0),
  status text not null default 'open',
  updated_at timestamptz not null default now(),
  check (slot_end > slot_start),
  check (booked_count <= capacity)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_user_id uuid not null references auth.users(id),
  facility_id uuid not null references public.facilities(id),
  availability_id uuid references public.provider_availability(id),
  requested_service text,
  notes text,
  status text not null default 'requested',
  consent_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medical_camps (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  district text not null,
  mandal text,
  village text,
  venue text,
  starts_at timestamptz not null,
  category text not null,
  organizer_user_id uuid not null references auth.users(id),
  status text not null default 'draft',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.camp_registrations (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.medical_camps(id) on delete cascade,
  citizen_user_id uuid not null references auth.users(id),
  status text not null default 'registered',
  created_at timestamptz not null default now(),
  unique(camp_id, citizen_user_id)
);

create table public.facility_status_updates (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  metric text not null check (metric in ('beds_total','beds_available','service_status','pharmacy_stock')),
  value jsonb not null,
  reported_by uuid not null references auth.users(id),
  reported_at timestamptz not null default now(),
  expires_at timestamptz,
  verification_status text not null default 'unverified'
);

alter table public.profiles enable row level security;
alter table public.facilities enable row level security;
alter table public.provider_availability enable row level security;
alter table public.appointments enable row level security;
alter table public.medical_camps enable row level security;
alter table public.camp_registrations enable row level security;
alter table public.facility_status_updates enable row level security;

-- Profiles: users can view and edit their own profile. Admin role assignment must be
-- performed through a trusted server-side workflow, never from a public client.
create policy "profile self read" on public.profiles for select using (auth.uid() = id);
create policy "profile self update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Public facility directory only exposes approved records. Writes require an authenticated provider.
create policy "approved facilities readable" on public.facilities for select using (verification_status = 'approved');
create policy "authenticated facility submission" on public.facilities for insert to authenticated with check (created_by = auth.uid());
create policy "creator can update pending facility" on public.facilities for update to authenticated using (created_by = auth.uid() and verification_status = 'pending') with check (created_by = auth.uid());

create policy "availability readable" on public.provider_availability for select using (true);
create policy "provider manages own availability" on public.provider_availability for all to authenticated
  using (provider_user_id = auth.uid()) with check (provider_user_id = auth.uid());

create policy "patient reads own appointments" on public.appointments for select to authenticated using (patient_user_id = auth.uid());
create policy "patient creates own appointment request" on public.appointments for insert to authenticated with check (patient_user_id = auth.uid());
create policy "patient can cancel own request" on public.appointments for update to authenticated using (patient_user_id = auth.uid()) with check (patient_user_id = auth.uid());

create policy "published camps readable" on public.medical_camps for select using (status = 'published' or organizer_user_id = auth.uid());
create policy "organizer creates camp" on public.medical_camps for insert to authenticated with check (organizer_user_id = auth.uid());
create policy "organizer updates own draft" on public.medical_camps for update to authenticated using (organizer_user_id = auth.uid()) with check (organizer_user_id = auth.uid());

create policy "citizen reads own camp registrations" on public.camp_registrations for select to authenticated using (citizen_user_id = auth.uid());
create policy "citizen registers self" on public.camp_registrations for insert to authenticated with check (citizen_user_id = auth.uid());

create policy "verified facility updates readable" on public.facility_status_updates for select using (verification_status = 'verified');
create policy "reporter creates own status update" on public.facility_status_updates for insert to authenticated with check (reported_by = auth.uid());

-- Production hardening still required:
-- 1. Trusted server-side role assignment and facility verification.
-- 2. Transactional slot reservation to prevent overbooking.
-- 3. Stronger provider/facility ownership checks on all writes.
-- 4. Audit events, consent records, retention/deletion policy and encryption strategy.
-- 5. Never expose service_role keys in browser code.
