/* ============================================================
   categoryIcon.ts — ikon kategori bergambar (custom upload).

   Ikon kategori disimpan di kolom `categories.icon` (text). Emoji
   tetap disimpan apa adanya; gambar custom disimpan sebagai data URL
   kecil (`data:image/webp;base64,...`) — tanpa Storage bucket, jadi
   tidak ada file terpisah yang perlu dikelola server.

   Validasi + kompresi dilakukan di client supaya server tidak terbebani:
     - format  : PNG, JPG, WebP (SVG/GIF ditolak)
     - input   : maksimal 2 MB, sisi terpendek minimal 64 px
     - output  : dikompres otomatis ke 96×96 WebP (± 3–8 KB)
   ============================================================ */

import { t } from '../i18n';

export const ICON_ACCEPT = 'image/png,image/jpeg,image/webp';
export const ICON_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const ICON_MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const ICON_MIN_SIDE = 64;
export const ICON_SIZE = 96;
/** Batas panjang string tersimpan (≈ 18 KB). Harus sama dengan check di migration. */
export const ICON_MAX_STORED_CHARS = 24000;

/** Ikon pengganti saat ikon custom dihapus (sama dengan default kolom di database). */
export const DEFAULT_CATEGORY_ICON = '✨';

export function isImageIcon(icon: string): boolean {
  return icon.startsWith('data:image/');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('We could not read that image.'))); };
    image.src = url;
  });
}

/** Validasi file sebelum masuk ke langkah atur posisi. Melempar Error berisi pesan siap tampil. */
export async function validateIconFile(file: File): Promise<void> {
  if (!ICON_ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(t('Use a PNG, JPG or WebP image.'));
  }
  if (file.size > ICON_MAX_INPUT_BYTES) {
    throw new Error(t('That image is larger than 2 MB.'));
  }
  const image = await loadImage(file);
  if (Math.min(image.width, image.height) < ICON_MIN_SIDE) {
    throw new Error(t('That image is too small. Use at least {size} × {size} px.', { size: ICON_MIN_SIDE }));
  }
}

/** Kompres canvas hasil crop (ICON_SIZE × ICON_SIZE) ke WebP kecil. */
export function encodeIconCanvas(canvas: HTMLCanvasElement): string {
  for (const quality of [0.85, 0.65, 0.45]) {
    const result = canvas.toDataURL('image/webp', quality);
    if (result.length <= ICON_MAX_STORED_CHARS) return result;
  }
  throw new Error(t('That image is too detailed to use as an icon. Try a simpler one.'));
}
