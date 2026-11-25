-- Swasthya Connect AI
-- Supabase PostgreSQL schema.
-- Apply only after reviewing privacy, consent, retention and clinical governance requirements.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Roles and shared helpers
-- ---------------------------------------------------------------------

create type public.app_role as enum (
  'citizen',
  'doctor',
  'facility',
  'diagnostic',
  'ambulance',
  'pharmacy',
  'organizer',
  'asha',
  'district',
  'admin'
);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and verification_status = 'verified'
  )
$$;

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null default 'citizen',
  preferred_language text not null default 'te',
  district text,
  phone text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected','suspended')),
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Users cannot change their own role or verification status.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    new.role := old.role;
    new.verification_status := old.verification_status;
    new.verification_notes := old.verification_notes;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_profile_privileges_trigger
before update on public.profiles
for each row execute function public.protect_profile_privileges();

-- ---------------------------------------------------------------------
-- Facilities and provider directory
-- ---------------------------------------------------------------------

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  facility_type text not null,
  district text not null,
  mandal text,
  village text,
  address text,
  latitude double precision,
  longitude double precision,
  source text not null default 'provider_submitted'
    check (source in ('provider_submitted','public_directory','admin_verified','demo')),
  external_reference text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','approved','rejected','suspended')),
  services jsonb not null default '[]'::jsonb,
  departments jsonb not null default '[]'::jsonb,
  contact_phone text,
  contact_email text,
  website text,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.facility_members (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'staff',
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','suspended')),
  created_at timestamptz not null default now(),
  unique(facility_id, user_id)
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
  status text not null default 'open'
    check (status in ('open','closed','full','cancelled')),
  updated_at timestamptz not null default now(),
  check (slot_end > slot_start),
  check (booked_count <= capacity)
);

-- ---------------------------------------------------------------------
-- Patient profiles, family and consent
-- ---------------------------------------------------------------------

create table public.patient_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  date_of_birth date,
  relationship text not null default 'self',
  sex text,
  district text,
  emergency_contact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patient_consents (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete cascade,
  granted_to uuid not null references auth.users(id) on delete cascade,
  purpose text not null,
  scope jsonb not null default '[]'::jsonb,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete cascade,
  record_type text not null,
  title text not null,
  description text,
  storage_path text,
  source_user_id uuid references auth.users(id),
  visibility text not null default 'private'
    check (visibility in ('private','shared')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Appointments and admissions
-- ---------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id),
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

create table public.admission_requests (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id),
  patient_user_id uuid not null references auth.users(id),
  facility_id uuid not null references public.facilities(id),
  reason text,
  urgency text not null default 'routine'
    check (urgency in ('routine','urgent','emergency')),
  status text not null default 'requested',
  facility_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Diagnostic centres and test bookings
-- ---------------------------------------------------------------------

create table public.diagnostic_services (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  test_name text not null,
  description text,
  preparation_instructions text,
  price numeric(10,2),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.diagnostic_bookings (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id),
  patient_user_id uuid not null references auth.users(id),
  diagnostic_service_id uuid not null references public.diagnostic_services(id),
  facility_id uuid not null references public.facilities(id),
  scheduled_at timestamptz,
  status text not null default 'requested',
  report_storage_path text,
  report_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Ambulance coordination
-- ---------------------------------------------------------------------

create table public.ambulance_operators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organisation_name text not null,
  contact_phone text,
  verification_status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(user_id)
);

create table public.ambulance_requests (
  id uuid primary key default gen_random_uuid(),
  patient_user_id uuid not null references auth.users(id),
  patient_profile_id uuid references public.patient_profiles(id),
  operator_id uuid references public.ambulance_operators(id),
  destination_facility_id uuid references public.facilities(id),
  pickup_description text not null,
  pickup_latitude double precision,
  pickup_longitude double precision,
  urgency text not null default 'urgent'
    check (urgency in ('routine','urgent','emergency')),
  status text not null default 'requested',
  estimated_arrival timestamptz,
  hospital_acknowledged_at timestamptz,
  dispatched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pharmacy catalogue and inventory
-- ---------------------------------------------------------------------

create table public.pharmacy_items (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  item_name text not null,
  description text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  stock_updated_at timestamptz,
  availability_status text not null default 'unverified',
  created_at timestamptz not null default now()
);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id),
  doctor_user_id uuid not null references auth.users(id),
  pharmacy_facility_id uuid references public.facilities(id),
  prescription_data jsonb not null,
  status text not null default 'issued',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Medical camps and ASHA referrals
-- ---------------------------------------------------------------------

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

create table public.asha_referrals (
  id uuid primary key default gen_random_uuid(),
  asha_user_id uuid not null references auth.users(id),
  patient_profile_id uuid references public.patient_profiles(id),
  district text not null,
  village text,
  referral_reason text,
  referred_facility_id uuid references public.facilities(id),
  status text not null default 'open',
  follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Facility status updates: reported values are not automatically verified
-- ---------------------------------------------------------------------

create table public.facility_status_updates (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  metric text not null check (
    metric in (
      'beds_total',
      'beds_available',
      'service_status',
      'pharmacy_stock'
    )
  ),
  value jsonb not null,
  reported_by uuid not null references auth.users(id),
  reported_at timestamptz not null default now(),
  expires_at timestamptz,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','verified','rejected'))
);

-- ---------------------------------------------------------------------
-- Notifications and audit events
-- ---------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  category text not null default 'general',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.facilities enable row level security;
alter table public.facility_members enable row level security;
alter table public.provider_availability enable row level security;
alter table public.patient_profiles enable row level security;
alter table public.patient_consents enable row level security;
alter table public.medical_records enable row level security;
alter table public.appointments enable row level security;
alter table public.admission_requests enable row level security;
alter table public.diagnostic_services enable row level security;
alter table public.diagnostic_bookings enable row level security;
alter table public.ambulance_operators enable row level security;
alter table public.ambulance_requests enable row level security;
alter table public.pharmacy_items enable row level security;
alter table public.prescriptions enable row level security;
alter table public.medical_camps enable row level security;
alter table public.camp_registrations enable row level security;
alter table public.asha_referrals enable row level security;
alter table public.facility_status_updates enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;

-- Profiles
create policy "profile self read"
on public.profiles for select
using (auth.uid() = id or public.is_admin());

create policy "profile self update"
on public.profiles for update
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

-- Approved public directory
create policy "approved facilities readable"
on public.facilities for select
using (verification_status = 'approved' or created_by = auth.uid() or public.is_admin());

create policy "authenticated facility submission"
on public.facilities for insert to authenticated
with check (created_by = auth.uid());

create policy "creator can update pending facility"
on public.facilities for update to authenticated
using (created_by = auth.uid() and verification_status = 'pending')
with check (created_by = auth.uid() and verification_status = 'pending');

-- Facility memberships
create policy "members read own memberships"
on public.facility_members for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "users request facility membership"
on public.facility_members for insert to authenticated
with check (user_id = auth.uid());

-- Provider availability
create policy "availability readable"
on public.provider_availability for select
using (true);

create policy "provider manages own availability"
on public.provider_availability for all to authenticated
using (provider_user_id = auth.uid() or public.is_admin())
with check (provider_user_id = auth.uid() or public.is_admin());

-- Patient profiles
create policy "patient owner reads profiles"
on public.patient_profiles for select to authenticated
using (owner_user_id = auth.uid() or public.is_admin());

create policy "patient owner creates profiles"
on public.patient_profiles for insert to authenticated
with check (owner_user_id = auth.uid());

create policy "patient owner updates profiles"
on public.patient_profiles for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

-- Patient consent
create policy "patient manages consent"
on public.patient_consents for all to authenticated
using (
  exists (
    select 1 from public.patient_profiles p
    where p.id = patient_profile_id
      and p.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.patient_profiles p
    where p.id = patient_profile_id
      and p.owner_user_id = auth.uid()
  )
);

create policy "consented provider reads consent"
on public.patient_consents for select to authenticated
using (granted_to = auth.uid() and revoked_at is null);

-- Medical records
create policy "patient reads own records"
on public.medical_records for select to authenticated
using (
  exists (
    select 1 from public.patient_profiles p
    where p.id = patient_profile_id
      and p.owner_user_id = auth.uid()
  )
);

create policy "patient creates own records"
on public.medical_records for insert to authenticated
with check (
  exists (
    select 1 from public.patient_profiles p
    where p.id = patient_profile_id
      and p.owner_user_id = auth.uid()
  )
);

create policy "consented provider reads records"
on public.medical_records for select to authenticated
using (
  exists (
    select 1
    from public.patient_consents c
    where c.patient_profile_id = medical_records.patient_profile_id
      and c.granted_to = auth.uid()
      and c.revoked_at is null
      and (c.expires_at is null or c.expires_at > now())
  )
);

-- Appointments
create policy "patient reads own appointments"
on public.appointments for select to authenticated
using (patient_user_id = auth.uid() or public.is_admin());

create policy "patient creates own appointment request"
on public.appointments for insert to authenticated
with check (patient_user_id = auth.uid());

create policy "patient can update own appointment"
on public.appointments for update to authenticated
using (patient_user_id = auth.uid())
with check (patient_user_id = auth.uid());

-- Admissions
create policy "patient reads own admission requests"
on public.admission_requests for select to authenticated
using (patient_user_id = auth.uid() or public.is_admin());

create policy "patient creates admission request"
on public.admission_requests for insert to authenticated
with check (patient_user_id = auth.uid());

-- Diagnostic catalogue and bookings
create policy "active diagnostic services readable"
on public.diagnostic_services for select
using (active = true);

create policy "patient reads own diagnostic bookings"
on public.diagnostic_bookings for select to authenticated
using (patient_user_id = auth.uid() or public.is_admin());

create policy "patient creates diagnostic booking"
on public.diagnostic_bookings for insert to authenticated
with check (patient_user_id = auth.uid());

-- Ambulance
create policy "patient reads own ambulance requests"
on public.ambulance_requests for select to authenticated
using (patient_user_id = auth.uid() or public.is_admin());

create policy "patient creates ambulance request"
on public.ambulance_requests for insert to authenticated
with check (patient_user_id = auth.uid());

create policy "operator reads own ambulance profile"
on public.ambulance_operators for select to authenticated
using (user_id = auth.uid() or public.is_admin());

-- Pharmacy
create policy "pharmacy inventory readable"
on public.pharmacy_items for select
using (true);

create policy "patient reads own prescriptions"
on public.prescriptions for select to authenticated
using (
  exists (
    select 1
    from public.patient_profiles p
    where p.id = patient_profile_id
      and p.owner_user_id = auth.uid()
  )
);

-- Camps
create policy "published camps readable"
on public.medical_camps for select
using (status = 'published' or organizer_user_id = auth.uid() or public.is_admin());

create policy "organizer creates camp"
on public.medical_camps for insert to authenticated
with check (organizer_user_id = auth.uid());

create policy "organizer updates own camp"
on public.medical_camps for update to authenticated
using (organizer_user_id = auth.uid())
with check (organizer_user_id = auth.uid());

create policy "citizen reads own camp registrations"
on public.camp_registrations for select to authenticated
using (citizen_user_id = auth.uid());

create policy "citizen registers self"
on public.camp_registrations for insert to authenticated
with check (citizen_user_id = auth.uid());

-- ASHA referrals
create policy "asha reads own referrals"
on public.asha_referrals for select to authenticated
using (asha_user_id = auth.uid() or public.is_admin());

create policy "asha creates referrals"
on public.asha_referrals for insert to authenticated
with check (asha_user_id = auth.uid());

-- Facility status
create policy "verified facility updates readable"
on public.facility_status_updates for select
using (verification_status = 'verified');

create policy "reporter creates own status update"
on public.facility_status_updates for insert to authenticated
with check (reported_by = auth.uid());

-- Notifications
create policy "users read own notifications"
on public.notifications for select to authenticated
using (user_id = auth.uid());

create policy "users update own notifications"
on public.notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Audit events: only admins can read. Writes should be done through trusted server workflows.
create policy "admins read audit events"
on public.audit_events for select to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------------
-- Production hardening still required
-- ---------------------------------------------------------------------
-- 1. Assign privileged roles and verify providers only through trusted server-side workflows.
-- 2. Review every RLS policy with security testing before production use.
-- 3. Add transactional slot reservation to prevent appointment overbooking.
-- 4. Add facility membership and operator authorization checks to all provider writes.
-- 5. Enforce patient consent and purpose limitation in trusted server-side workflows.
-- 6. Add audit-event writes through a trusted server-side function.
-- 7. Configure private Storage buckets and policies for reports and medical records.
-- 8. Define retention, deletion, encryption, backup and breach-response policies.
-- 9. Never expose Supabase service_role keys in browser code.
-- 10. GitHub Pages hosts only the static frontend; it does not provide secure backend services.
