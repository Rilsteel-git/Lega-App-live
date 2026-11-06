/* ============================================================
   receipt.ts — scan struk: kecilkan foto di HP, kirim ke Edge
   Function `scan-receipt` (Claude membaca struknya), lalu kembalikan
   draf transaksi untuk mengisi form. Foto tidak disimpan di mana pun.
   ============================================================ */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { t } from '../i18n';
import type { Currency } from '../types';

export interface ReceiptScan {
  merchant: string;
  date: string | null;
  total: number | null;
  currency: Currency | null;
  items: string[];
  categoryId: string | null;
  note: string;
}

/** Sisi terpanjang setelah dikecilkan. Cukup untuk teks struk, tetap ±200–600 KB. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('Could not open that photo.'))); };
    image.src = url;
  });
}

/** Foto -> JPEG base64 (tanpa prefix data URL), sisi terpanjang maks. MAX_EDGE. */
export async function compressReceipt(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(t('Choose a photo of the receipt.'));
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error(t('Could not open that photo.'));
  // Latar putih supaya PNG transparan tidak jadi hitam di JPEG.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
}

function localToday(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function errorMessage(code: unknown, limit?: unknown): string {
  switch (code) {
    case 'not_a_receipt': return t('That doesn’t look like a receipt. Try another photo.');
    case 'unreadable': return t('Couldn’t read this receipt. Try a sharper, well-lit photo.');
    case 'daily_limit': return t('You’ve reached today’s limit of {limit} scans. Try again tomorrow.', { limit: String(limit ?? '') });
    case 'image_too_large': return t('That photo is too large. Try another one.');
    case 'busy': return t('Receipt scanning is busy right now. Try again in a moment.');
    case 'timeout': return t('Reading the receipt took too long. Try again, or use a smaller, sharper photo.');
    case 'quota_exhausted': return t('Receipt scanning has reached today’s free limit. Try again tomorrow or fill it in manually.');
    case 'unauthorized': return t('Your session has expired. Sign in again.');
    default: return t('Could not scan the receipt. Try again or fill it in manually.');
  }
}

export async function scanReceipt(file: File): Promise<ReceiptScan> {
  if (!supabase) throw new Error(t('Could not scan the receipt. Try again or fill it in manually.'));
  const image = await compressReceipt(file);
  const { data, error } = await supabase.functions.invoke('scan-receipt', {
    body: { image, mediaType: 'image/jpeg', today: localToday() }
  });
  if (error) {
    let body: { code?: string; limit?: number } = {};
    if (error instanceof FunctionsHttpError) {
      try { body = await error.context.json(); } catch { /* bukan JSON */ }
    } else {
      throw new Error(t('Could not reach the server. Check your connection.'));
    }
    throw new Error(errorMessage(body.code, body.limit));
  }
  if (!data?.scan) throw new Error(errorMessage(undefined));
  return data.scan as ReceiptScan;
}
