-- Log of receipt scans, used only to rate-limit the `scan-receipt` Edge Function
-- per user per day (each scan is a paid Claude API call).
-- Receipt images and their contents are NOT stored anywhere: only who scanned
-- and when. RLS is on with no policies, so only the Edge Function (service
-- role) can read or write this table.

create table if not exists public.receipt_scans (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists receipt_scans_user_created_idx
  on public.receipt_scans (user_id, created_at desc);

alter table public.receipt_scans enable row level security;
