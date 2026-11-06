/* ============================================================
   scan-receipt — Supabase Edge Function (Deno).

   POST { image: <base64 JPEG/PNG/WebP>, mediaType, today: 'YYYY-MM-DD' }
   with the user's Supabase session (supabase.functions.invoke adds it).

   1. Checks the caller is signed in and under the daily scan limit.
   2. Loads the caller's active expense categories.
   3. Asks a vision model to read the receipt into JSON.
   4. Validates the JSON (normalize.ts) and returns it. The app only
      pre-fills the transaction form; the user still reviews and saves.

   The image is never stored: it lives only in this request.

   Secrets (supabase secrets set ...):
     RECEIPT_SCAN_PROVIDER        'claude' (default) or 'cloudflare'
     RECEIPT_SCAN_DAILY_LIMIT     optional, default 30 scans per user per day
   Claude:
     ANTHROPIC_API_KEY            required for 'claude'
     RECEIPT_SCAN_MODEL           optional, default claude-opus-5-5
   Cloudflare Workers AI (free daily allowance):
     CLOUDFLARE_ACCOUNT_ID        required for 'cloudflare'
     CLOUDFLARE_API_TOKEN         required for 'cloudflare' (Workers AI permission)
     CLOUDFLARE_AI_MODEL          optional, default @cf/meta/llama-4-scout-17b-16e-instruct
   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by the Edge runtime.
   ============================================================ */

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  extractJson,
  JSON_ONLY_INSTRUCTIONS,
  normalizeScan,
  receiptPrompt,
  receiptSchema,
  type CategoryChoice,
  type WalletChoice
} from './normalize.ts';

/** Bump on every deploy-worthy change; returned in the response so a deploy can be verified. */
const FUNCTION_VERSION = '2026-11-06.4';
const PROVIDER = Deno.env.get('RECEIPT_SCAN_PROVIDER') === 'cloudflare' ? 'cloudflare' : 'claude';
const DAILY_LIMIT = Number(Deno.env.get('RECEIPT_SCAN_DAILY_LIMIT')) || 30;
/** ~5 MB of base64 is Claude's per-image limit; the app sends ~200-600 KB. */
const MAX_BASE64_CHARS = 5_000_000;
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Give up on the AI provider after this long, so the app never spins forever. */
const AI_TIMEOUT_MS = 45_000;
type MediaType = typeof MEDIA_TYPES[number];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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

/** A failure the app should show as `code`, with this HTTP status. */
class ScanError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

/** Today in Indonesia (UTC+7); the client's own date wins if it is within a day of it. */
function resolveToday(clientToday: unknown): string {
  const server = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  if (typeof clientToday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(clientToday)) return server;
  const diff = Math.abs(Date.parse(clientToday) - Date.parse(server));
  return diff <= 86_400_000 ? clientToday : server;
}

interface ReadRequest {
  image: string;
  mediaType: MediaType;
  prompt: string;
  categoryIds: string[];
  walletIds: string[];
}

/* ---------------- Claude ---------------- */

let anthropic: Anthropic | null = null;

async function readWithClaude({ image, mediaType, prompt, categoryIds, walletIds }: ReadRequest): Promise<unknown> {
  anthropic ??= new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  // Built as a plain object: `fallbacks: "default"` is newer than some SDK typings.
  const params = {
    model: Deno.env.get('RECEIPT_SCAN_MODEL') || 'claude-opus-5-5',
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    // If a safety classifier declines, the API re-runs the request on a fallback model.
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: receiptSchema(categoryIds, walletIds) }
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: prompt }
      ]
    }]
  } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming;

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await anthropic.beta.messages.create(params);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new ScanError(503, 'busy');
    if (error instanceof Anthropic.APIConnectionTimeoutError) throw new ScanError(504, 'timeout');
    if (error instanceof Anthropic.APIError) console.error('Claude API error', error.status, error.message);
    else console.error('Claude request failed', error);
    throw new ScanError(502, 'ai_error');
  }
  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
    console.error('Claude stopped early', message.stop_reason);
    throw new ScanError(422, 'unreadable');
  }
  const text = message.content.find((block) => block.type === 'text');
  return extractJson(text && text.type === 'text' ? text.text : '');
}

/* ---------------- Cloudflare Workers AI ---------------- */

/** Workers AI error code for "daily free allocation used up". */
const CLOUDFLARE_DAILY_ALLOCATION_USED = 3036;

async function readWithCloudflare({ image, mediaType, prompt }: ReadRequest): Promise<unknown> {
  const account = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const token = Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!account || !token) {
    console.error('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set');
    throw new ScanError(500, 'server_error');
  }
  const model = Deno.env.get('CLOUDFLARE_AI_MODEL') || '@cf/meta/llama-4-scout-17b-16e-instruct';

  let response: Response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      body: JSON.stringify({
        max_tokens: 1024,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt + JSON_ONLY_INSTRUCTIONS },
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${image}` } }
          ]
        }]
      })
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      console.error(`Cloudflare AI timed out after ${AI_TIMEOUT_MS} ms`);
      throw new ScanError(504, 'timeout');
    }
    console.error('Cloudflare request failed', error);
    throw new ScanError(502, 'ai_error');
  }

  const body = await response.json().catch(() => null) as {
    success?: boolean;
    result?: { response?: unknown };
    errors?: { code?: number; message?: string }[];
  } | null;
  if (!response.ok || !body?.success) {
    const errors = body?.errors || [];
    console.error('Cloudflare AI error', response.status, JSON.stringify(errors));
    if (errors.some((error) => error.code === CLOUDFLARE_DAILY_ALLOCATION_USED)) throw new ScanError(503, 'quota_exhausted');
    if (response.status === 429) throw new ScanError(503, 'busy');
    throw new ScanError(502, 'ai_error');
  }
  // Text models return a string; some return the parsed object directly.
  const output = body.result?.response;
  return typeof output === 'string' ? extractJson(output) : output ?? null;
}

/* ---------------- handler ---------------- */

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

  // --- the user's wallets (to match the payment method on the receipt) ---------
  const { data: walletRows, error: walletError } = await admin
    .from('wallets')
    .select('id, name, type, currency')
    .eq('user_id', userId)
    .order('position');
  if (walletError) {
    console.error('wallets load failed', walletError.message);
    return reply(500, { code: 'server_error' });
  }
  const wallets = (walletRows || []) as WalletChoice[];

  // --- read the receipt --------------------------------------------------------
  const input: ReadRequest = {
    image,
    mediaType,
    prompt: receiptPrompt(categories, wallets, today),
    categoryIds: categories.map((category) => category.id),
    walletIds: wallets.map((wallet) => wallet.id)
  };
  let raw: unknown;
  const started = Date.now();
  try {
    raw = PROVIDER === 'cloudflare' ? await readWithCloudflare(input) : await readWithClaude(input);
    console.log(`scan read by ${PROVIDER} in ${Date.now() - started} ms (image ${Math.round(image.length * 0.75 / 1024)} KB)`);
  } catch (error) {
    console.error(`scan failed with ${PROVIDER} after ${Date.now() - started} ms`);
    if (error instanceof ScanError) return reply(error.status, { code: error.code });
    console.error('scan failed', error);
    return reply(500, { code: 'server_error' });
  }
  if (raw === null) return reply(422, { code: 'unreadable' });

  const scan = normalizeScan(raw, categories, wallets, today);
  if (!scan.isReceipt) return reply(422, { code: 'not_a_receipt' });
  const categoryName = categories.find((category) => category.id === scan.categoryId)?.name ?? '(none)';
  console.log(`scan result: purchase="${scan.purchaseType}" -> category="${categoryName}", payment="${scan.paymentMethod}" -> wallet=${scan.walletId ? 'matched' : 'none'}`);
  return reply(200, { scan, provider: PROVIDER, version: FUNCTION_VERSION });
});
