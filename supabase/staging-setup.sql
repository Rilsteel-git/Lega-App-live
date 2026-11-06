-- ============================================================
-- Lega — setup database STAGING (sekali jalan)
--
-- Gabungan supabase/schema.sql + semua file supabase/migrations/
-- (sampai 20261106_category_icon_limit.sql), berurutan, dalam satu
-- transaksi. Jalankan di Supabase Dashboard > SQL Editor pada project
-- STAGING yang masih kosong. Kalau ada yang gagal, semuanya dibatalkan.
--
-- Aman dijalankan ulang. Saat menambah migrasi baru di
-- supabase/migrations/, tambahkan juga isinya di akhir file ini.
--
-- Setelah ini, atur juga di Dashboard project staging:
--   - Authentication > URL Configuration: Site URL & Redirect URLs
--     ke domain dev/preview Vercel (bukan domain production).
--   - Authentication > Email Templates: isi dari supabase/email-templates/.
-- ============================================================

begin;

-- ############################################################
-- supabase/schema.sql
-- ############################################################

-- ============================================================
-- Mani App — skema Supabase (Postgres + RLS)
-- Jalankan sekali di Supabase Dashboard > SQL Editor.
-- Aman dijalankan ulang: semua objek memakai IF NOT EXISTS / OR REPLACE.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABEL
-- ------------------------------------------------------------

-- Profil tampilan (nama + foto). Satu baris per akun auth.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text        not null default '',
  photo_url   text        not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.wallets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  name            text        not null check (length(btrim(name)) > 0),
  type            text        not null default 'cash' check (type in ('bank', 'e-wallet', 'cash')),
  -- Urutan tampil wallet (drag & drop di halaman Wallets).
  position        integer     not null default 0,
  -- Saldo berjalan TIDAK disimpan. Yang disimpan hanya saldo awal;
  -- saldo = initial_balance + income − expense (dihitung ulang di client).
  initial_balance numeric(16, 2) not null default 0,
  created_at      timestamptz not null default now()
);
alter table public.wallets add column if not exists position integer not null default 0;
create index if not exists wallets_user_id_idx on public.wallets (user_id);
create index if not exists wallets_user_position_idx on public.wallets (user_id, position);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  type        text        not null check (type in ('income', 'expense')),
  icon        text        not null default '✨',
  -- Urutan tampil kategori aktif per tipe (drag & drop di halaman Categories).
  position    integer     not null default 0,
  -- Kategori yang masih dipakai transaksi diarsipkan, bukan dihapus, supaya
  -- histori tetap menyimpan nama & ikonnya (soft reference, FR-3.4).
  archived    boolean     not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists categories_user_id_idx on public.categories (user_id);

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  -- Hapus wallet ikut menghapus transaksinya (cascade eksplisit, FR-1.5).
  wallet_id   uuid        references public.wallets (id) on delete cascade,
  -- Hapus kategori permanen hanya terjadi saat kategori belum dipakai; kalau
  -- pun terjadi, transaksi tetap ada dan tampil sebagai "Deleted category".
  category_id uuid        references public.categories (id) on delete set null,
  type        text        not null check (type in ('income', 'expense')),
  amount      numeric(16, 2) not null check (amount >= 0),
  note        text        not null default '',
  date        date        not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists transactions_user_id_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_wallet_id_idx on public.transactions (wallet_id);
create index if not exists transactions_category_id_idx on public.transactions (category_id);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY — tiap orang hanya melihat datanya sendiri
-- ------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.wallets      enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "profiles are self-service" on public.profiles;
create policy "profiles are self-service" on public.profiles
  for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "wallets are self-service" on public.wallets;
create policy "wallets are self-service" on public.wallets
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "categories are self-service" on public.categories;
create policy "categories are self-service" on public.categories
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "transactions are self-service" on public.transactions;
create policy "transactions are self-service" on public.transactions
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- AKUN BARU: buat profil + 11 kategori bawaan
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, type, icon, position)
  values
    (new.id, 'Food',          'expense', '🍜', 0),
    (new.id, 'Transport',     'expense', '🛵', 1),
    (new.id, 'Shopping',      'expense', '🛒', 2),
    (new.id, 'Bills',         'expense', '🧾', 3),
    (new.id, 'Health',        'expense', '💊', 4),
    (new.id, 'Entertainment', 'expense', '🎬', 5),
    (new.id, 'Other',         'expense', '✨', 6),
    (new.id, 'Salary',        'income',  '💼', 0),
    (new.id, 'Bonus',         'income',  '🎁', 1),
    (new.id, 'Freelance',     'income',  '📈', 2),
    (new.id, 'Other',         'income',  '✨', 3);

  return new;
end;
$func$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- RESET DATA (tombol "Reset all data" di halaman Profile).
-- Profil sengaja dipertahankan; kategori kembali ke bawaan.
-- ------------------------------------------------------------
create or replace function public.reset_my_data()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.transactions where user_id = uid;
  delete from public.wallets      where user_id = uid;
  delete from public.categories   where user_id = uid;

  insert into public.categories (user_id, name, type, icon, position)
  values
    (uid, 'Food',          'expense', '🍜', 0),
    (uid, 'Transport',     'expense', '🛵', 1),
    (uid, 'Shopping',      'expense', '🛒', 2),
    (uid, 'Bills',         'expense', '🧾', 3),
    (uid, 'Health',        'expense', '💊', 4),
    (uid, 'Entertainment', 'expense', '🎬', 5),
    (uid, 'Other',         'expense', '✨', 6),
    (uid, 'Salary',        'income',  '💼', 0),
    (uid, 'Bonus',         'income',  '🎁', 1),
    (uid, 'Freelance',     'income',  '📈', 2),
    (uid, 'Other',         'income',  '✨', 3);
end;
$func$;

revoke all on function public.reset_my_data() from public;
grant execute on function public.reset_my_data() to authenticated;

-- ------------------------------------------------------------
-- STORAGE: foto profil. Tiap file wajib berada di folder <user-id>/
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar images are public" on storage.objects;
create policy "avatar images are public" on storage.objects
  for select to public using (bucket_id = 'avatars');

drop policy if exists "users manage their own avatar" on storage.objects;
create policy "users manage their own avatar" on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ############################################################
-- supabase/migrations/20260921_multi_currency.sql
-- ############################################################

-- Multi-currency v1. Run once in Supabase SQL Editor after schema.sql.
-- Additive migration: existing entries remain IDR with rate 1.
alter table public.profiles
  add column if not exists report_currency text not null default 'IDR',
  add column if not exists report_rate numeric(20,8) not null default 1;
alter table public.wallets
  add column if not exists currency text not null default 'IDR',
  add column if not exists exchange_rate numeric(20,8) not null default 1;
alter table public.transactions
  add column if not exists currency text not null default 'IDR',
  add column if not exists exchange_rate numeric(20,8) not null default 1;

create or replace function public.validate_currency_record()
returns trigger language plpgsql set search_path = public as $$
declare
  code text;
  rate numeric;
  wallet_currency text;
begin
  if tg_table_name = 'profiles' then
    code := new.report_currency;
    rate := new.report_rate;
  else
    code := new.currency;
    rate := new.exchange_rate;
  end if;
  if code not in ('IDR','KRW','USD','EUR','JPY','SGD','MYR') then
    raise exception 'Unsupported currency';
  end if;
  if rate <= 0 or rate >= 1000000000 or rate::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Exchange rate must be positive and finite';
  end if;
  if code = 'IDR' and rate <> 1 then
    raise exception 'IDR rate must equal 1';
  end if;
  if tg_table_name = 'wallets' then
    if tg_op = 'UPDATE' then
      if new.currency is distinct from old.currency then
        raise exception 'Wallet currency is fixed; create another wallet';
      end if;
    end if;
    if abs(new.initial_balance) >= 1000000000000 or new.initial_balance::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Invalid opening balance';
    end if;
    if code in ('IDR','KRW','JPY') and new.initial_balance <> trunc(new.initial_balance) then
      raise exception 'This currency requires whole amounts';
    end if;
  elsif tg_table_name = 'transactions' then
    -- The lock serializes wallet deletion against transaction writes.
    select currency into wallet_currency from public.wallets
      where id = new.wallet_id and user_id = new.user_id for share;
    if wallet_currency is null or wallet_currency <> new.currency then
      raise exception 'Choose your own wallet with the same currency';
    end if;
    if new.category_id is not null and not exists (
      select 1 from public.categories where id = new.category_id and user_id = new.user_id
    ) then
      raise exception 'Choose your own category';
    end if;
    if new.amount <= 0 or new.amount >= 1000000000000 or new.amount::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Amount must be positive and finite';
    end if;
    if code in ('IDR','KRW','JPY') and new.amount <> trunc(new.amount) then
      raise exception 'This currency requires whole amounts';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_profile_currency on public.profiles;
create trigger validate_profile_currency before insert or update on public.profiles
  for each row execute function public.validate_currency_record();
drop trigger if exists validate_wallet_currency on public.wallets;
create trigger validate_wallet_currency before insert or update on public.wallets
  for each row execute function public.validate_currency_record();
drop trigger if exists validate_transaction_currency on public.transactions;
create trigger validate_transaction_currency before insert or update on public.transactions
  for each row execute function public.validate_currency_record();

-- ############################################################
-- supabase/migrations/20260922_delete_account.sql
-- ############################################################

-- Self-service account deletion. Run once in the Supabase SQL Editor
-- after schema.sql (and multi_currency.sql, if already applied).
-- profiles/wallets/categories/transactions all reference auth.users(id)
-- with "on delete cascade" (see schema.sql), so deleting the auth.users
-- row is enough to wipe every table belonging to this user in one go.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from auth.users where id = uid;
end;
$func$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ############################################################
-- supabase/migrations/20260922_wallet_transfers.sql
-- ############################################################

-- Wallet-to-wallet transfers. Run once in the Supabase SQL Editor after
-- schema.sql (and the earlier migrations, if already applied).
-- A transfer is stored as two ordinary rows (one expense leg on the source
-- wallet, one income leg on the destination wallet) so wallet balances stay
-- correct with zero extra logic. `is_transfer` lets reports exclude both
-- legs from income/expense totals and category breakdowns; `transfer_pair_id`
-- links the two rows together.
alter table public.transactions
  add column if not exists is_transfer boolean not null default false,
  add column if not exists transfer_pair_id uuid;

create index if not exists transactions_transfer_pair_idx
  on public.transactions (transfer_pair_id)
  where transfer_pair_id is not null;

-- ############################################################
-- supabase/migrations/20260925_wallet_position.sql
-- ############################################################

-- Simpan urutan wallet yang dapat diubah di halaman Wallets.
alter table public.wallets
  add column if not exists position integer;

with ordered_wallets as (
  select id, row_number() over (partition by user_id order by created_at, id) - 1 as position
  from public.wallets
)
update public.wallets as wallet
set position = ordered_wallets.position
from ordered_wallets
where wallet.id = ordered_wallets.id
  and wallet.position is null;

alter table public.wallets
  alter column position set default 0,
  alter column position set not null;

create index if not exists wallets_user_position_idx on public.wallets (user_id, position);

-- ############################################################
-- supabase/migrations/20261106_category_icon_limit.sql
-- ############################################################

-- Custom category icons are stored as small data URLs in categories.icon.
-- Clients compress to 96x96 WebP (~3-8 KB); this constraint is the server-side
-- backstop so a modified client cannot store oversized or non-image values.
-- Keep the length in sync with ICON_MAX_STORED_CHARS in src/lib/categoryIcon.ts.

alter table public.categories
  drop constraint if exists categories_icon_valid;
alter table public.categories
  add constraint categories_icon_valid check (
    char_length(icon) <= 24000
    and (
      icon not like 'data:%'
      or icon ~ '^data:image/(webp|png);base64,[A-Za-z0-9+/=]+$'
    )
  );

-- ############################################################
-- supabase/migrations/20261106120000_receipt_scans.sql
-- ############################################################

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

-- ############################################################
-- supabase/migrations/20261106130000_profile_photo_limit.sql
-- ############################################################

-- Profile photos are stored as small data URLs in profiles.photo_url.
-- The app resizes them to a 256x256 JPEG (quality 0.88): a typical photo is
-- 15-40K characters, and even a worst-case image of pure noise is about 68K.
-- This constraint is the server-side backstop, so a modified client cannot
-- store an oversized value or one that is not an image.
-- Keep the length in sync with PHOTO_MAX_STORED_CHARS in src/components/Modals.tsx.
--
-- Allowed: '' (no photo), a base64 JPEG/PNG/WebP data URL, or an https:// URL
-- (in case an older version of the app saved a Storage link).
--
-- Before running, check that no existing row breaks the rule (expect 0):
--   select count(*) from public.profiles
--   where not (char_length(photo_url) <= 120000 and (photo_url = ''
--     or photo_url ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
--     or photo_url ~ '^https://'));

alter table public.profiles
  drop constraint if exists profiles_photo_url_valid;
alter table public.profiles
  add constraint profiles_photo_url_valid check (
    char_length(photo_url) <= 120000
    and (
      photo_url = ''
      or photo_url ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
      or photo_url ~ '^https://'
    )
  );

commit;
