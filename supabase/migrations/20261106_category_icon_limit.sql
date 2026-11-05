-- Custom category icons are stored as small data URLs in categories.icon.
-- Clients compress to 96x96 WebP (~3-8 KB); this constraint is the server-side
-- backstop so a modified client cannot store oversized or non-image values.
-- Keep the length in sync with ICON_MAX_STORED_CHARS in src/lib/categoryIcon.ts.

alter table public.categories
  add constraint categories_icon_valid check (
    char_length(icon) <= 24000
    and (
      icon not like 'data:%'
      or icon ~ '^data:image/(webp|png);base64,[A-Za-z0-9+/=]+$'
    )
  );
