/* ============================================================
   scan-receipt — Supabase Edge Function (Deno).

   POST { image: <base64 JPEG/PNG/WebP>, mediaType, today: 'YYYY-MM-DD' }
   with the user's Supabase session (supabase.functions.invoke adds it).

   1. Checks the caller is signed in and under the daily scan limit.
   2. Loads the caller's active expense categories.
   3. Asks Claude to read the receipt into structured JSON.
   4. Validates the JSON (normalize.ts) and returns it. The app only
      pre-fills the transaction form; the user still reviews and saves.

   The image is never stored: it lives only in this request.

   Secrets (supabase secrets set ...):
     ANTHROPIC_API_KEY            required
     RECEIPT_SCAN_MODEL           optional, default claude-opus-5-5
     RECEIPT_SCAN_DAILY_LIMIT     optional, default 30 scans per user per day
   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
   provided by the Edge runtime.
   ============================================================ */

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { normalizeScan, receiptPrompt, receiptSchema, type CategoryChoice } from './normalize.ts';

const MODEL = Deno.env.get('RECEIPT_SCAN_MODEL') || 'claude-opus-5-5';
const DAILY_LIMIT = Number(Deno.env.get('RECEIPT_SCAN_DAILY_LIMIT')) || 30;
/** ~5 MB of base64 is Claude's per-image limit; the app sends ~200-600 KB. */
const MAX_BASE64_CHARS = 5_000_000;
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type MediaType = typeof MEDIA_TYPES[number];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const anthropic = new Anthropic();
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

/** `code` is a stable key the app maps to a translated message. */
function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

/** Today in Indonesia (UTC+7); the client's own date wins if it is within a day of it. */
function resolveToday(clientToday: unknown): string {
  const server = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  if (typeof clientToday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(clientToday)) return server;
  const diff = Math.abs(Date.parse(clientToday) - Date.parse(server));
  return diff <= 86_400_000 ? clientToday : server;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply(405, { code: 'method_not_allowed' });

  // --- who is calling -------------------------------------------------------
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return reply(401, { code: 'unauthorized' });
  const userId = auth.user.id;

  // --- input ------------------------------------------------------------------
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply(400, { code: 'bad_request' }); }
  const image = typeof body.image === 'string' ? body.image : '';
  const mediaType = body.mediaType as MediaType;
  if (!image || !MEDIA_TYPES.includes(mediaType) || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return reply(400, { code: 'bad_request' });
  }
  if (image.length > MAX_BASE64_CHARS) return reply(413, { code: 'image_too_large' });
  const today = resolveToday(body.today);

  // --- daily limit (counts attempts, so retries of a failing scan count too) ---
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countError } = await admin
    .from('receipt_scans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if (countError) {
    console.error('receipt_scans count failed', countError.message);
    return reply(500, { code: 'server_error' });
  }
  if ((count ?? 0) >= DAILY_LIMIT) return reply(429, { code: 'daily_limit', limit: DAILY_LIMIT });
  await admin.from('receipt_scans').insert({ user_id: userId });

  // --- the user's categories ---------------------------------------------------
  const { data: rows, error: categoryError } = await admin
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('archived', false)
    .order('position');
  if (categoryError) {
    console.error('categories load failed', categoryError.message);
    return reply(500, { code: 'server_error' });
  }
  const categories = (rows || []) as CategoryChoice[];
  const categoryIds = categories.map((category) => category.id);

  // --- Claude --------------------------------------------------------------------
  // Built as a plain object: `fallbacks: "default"` is newer than some SDK typings.
  const params = {
    model: MODEL,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    // If a safety classifier declines, the API re-runs the request on a fallback model.
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: receiptSchema(categoryIds) }
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: receiptPrompt(categories, today) }
      ]
    }]
  } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming;

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await anthropic.beta.messages.create(params);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return reply(503, { code: 'busy' });
    if (error instanceof Anthropic.APIError) {
      console.error('Claude API error', error.status, error.message);
      return reply(502, { code: 'ai_error' });
    }
    console.error('Claude request failed', error);
    return reply(502, { code: 'ai_error' });
  }

  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
    console.error('Claude stopped early', message.stop_reason);
    return reply(422, { code: 'unreadable' });
  }
  const text = message.content.find((block) => block.type === 'text');
  let raw: unknown;
  try {
    raw = JSON.parse(text && text.type === 'text' ? text.text : '');
  } catch {
    return reply(422, { code: 'unreadable' });
  }

  const scan = normalizeScan(raw, categoryIds, today);
  if (!scan.isReceipt) return reply(422, { code: 'not_a_receipt' });
  return reply(200, { scan });
});
