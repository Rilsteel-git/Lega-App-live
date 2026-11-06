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
