import type {
  Currency,
  Category,
  CategoryPayload,
  Profile,
  Transaction,
  TransactionPayload,
  TransferPayload,
  Wallet,
  WalletPayload
} from '../types';
import { supabase } from './supabase';
import { t } from '../i18n';

export interface AppData {
  profile: Profile;
  wallets: Wallet[];
  categories: Category[];
  transactions: Transaction[];
}

function client() {
  if (!supabase) throw new Error(t('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'));
  return supabase;
}

function profileFromRow(row: Record<string, unknown>): Profile {
  return { reportCurrency: (row.report_currency || 'IDR') as Currency, reportRate: Number(row.report_rate ?? 1), id: String(row.id), name: String(row.name || ''), photoUrl: String(row.photo_url || ''), createdAt: String(row.created_at) };
}

function walletFromRow(row: Record<string, unknown>): Wallet {
  return { currency: (row.currency || 'IDR') as Currency, exchangeRate: Number(row.exchange_rate ?? 1), id: String(row.id), name: String(row.name), position: Number(row.position || 0), type: row.type as Wallet['type'], initialBalance: Number(row.initial_balance || 0), createdAt: String(row.created_at) };
}

function categoryFromRow(row: Record<string, unknown>): Category {
  return { id: String(row.id), name: String(row.name), type: row.type as Category['type'], icon: String(row.icon || '✨'), position: Number(row.position || 0), archived: Boolean(row.archived), archivedAt: row.archived_at ? String(row.archived_at) : null, createdAt: String(row.created_at) };
}

function transactionFromRow(row: Record<string, unknown>): Transaction {
  return { currency: (row.currency || 'IDR') as Currency, exchangeRate: Number(row.exchange_rate ?? 1), id: String(row.id), walletId: row.wallet_id ? String(row.wallet_id) : null, categoryId: row.category_id ? String(row.category_id) : null, type: row.type as Transaction['type'], amount: Number(row.amount || 0), note: String(row.note || ''), date: String(row.date), createdAt: String(row.created_at), isTransfer: Boolean(row.is_transfer), transferPairId: row.transfer_pair_id ? String(row.transfer_pair_id) : null };
}

export async function loadAppData(userId: string): Promise<AppData> {
  const db = client();
  const [profileResult, walletsResult, categoriesResult, transactionsResult] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).maybeSingle(),
    db.from('wallets').select('*').eq('user_id', userId).order('position', { ascending: true }).order('created_at', { ascending: true }),
    db.from('categories').select('*').eq('user_id', userId).order('position', { ascending: true }),
    db.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }).order('created_at', { ascending: false })
  ]);
  const error = profileResult.error || walletsResult.error || categoriesResult.error || transactionsResult.error;
  if (error) throw error;

  const profile = profileResult.data || { id: userId, name: '', photo_url: '', created_at: new Date().toISOString() };
  return {
    profile: profileFromRow(profile),
    wallets: (walletsResult.data || []).map(walletFromRow),
    categories: (categoriesResult.data || []).map(categoryFromRow),
    transactions: (transactionsResult.data || []).map(transactionFromRow)
  };
}

/* Create functions take the row id from the caller, so a row shown
 * optimistically before the insert keeps the same id afterwards. */
export async function createWallet(userId: string, payload: WalletPayload, id: string = crypto.randomUUID()) {
  const db = client();
  const { data: lastWallet, error: positionError } = await db.from('wallets')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (positionError) throw positionError;
  const { error } = await db.from('wallets').insert({ id, user_id: userId, name: payload.name.trim(), type: payload.type, initial_balance: payload.initialBalance, currency: payload.currency, exchange_rate: payload.exchangeRate, position: Number(lastWallet?.position ?? -1) + 1 });
  if (error) throw error;
}

export async function updateWallet(id: string, payload: WalletPayload) {
  const { error } = await client().from('wallets').update({ name: payload.name.trim(), type: payload.type, initial_balance: payload.initialBalance, currency: payload.currency, exchange_rate: payload.exchangeRate }).eq('id', id);
  if (error) throw error;
}

export async function deleteWallet(id: string) {
  const { error } = await client().from('wallets').delete().eq('id', id);
  if (error) throw error;
}

export async function createCategory(userId: string, payload: CategoryPayload, id: string = crypto.randomUUID()) {
  const { error } = await client().from('categories').insert({ id, user_id: userId, name: payload.name.trim(), type: payload.type, icon: payload.icon });
  if (error) throw error;
}

export async function updateCategory(id: string, payload: CategoryPayload) {
  const { error } = await client().from('categories').update({ name: payload.name.trim(), type: payload.type, icon: payload.icon }).eq('id', id);
  if (error) throw error;
}

export async function archiveCategory(id: string) {
  const { error } = await client().from('categories').update({ archived: true, archived_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function restoreCategory(id: string) {
  const { error } = await client().from('categories').update({ archived: false, archived_at: null }).eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await client().from('categories').delete().eq('id', id);
  if (error) throw error;
}

/** `ids` sudah berurutan sesuai posisi baru; index-nya jadi `position`. */
export async function reorderCategories(ids: string[]) {
  const results = await Promise.all(
    ids.map((id, index) => client().from('categories').update({ position: index }).eq('id', id))
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

/** `ids` sudah berurutan sesuai posisi baru; index-nya jadi `position`. */
export async function reorderWallets(ids: string[]) {
  const results = await Promise.all(
    ids.map((id, index) => client().from('wallets').update({ position: index }).eq('id', id))
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

export async function createTransaction(userId: string, payload: TransactionPayload, id: string = crypto.randomUUID()) {
  const { error } = await client().from('transactions').insert({ id, user_id: userId, wallet_id: payload.walletId, category_id: payload.categoryId, type: payload.type, amount: payload.amount, currency: payload.currency, exchange_rate: payload.exchangeRate, note: payload.note.trim(), date: payload.date });
  if (error) throw error;
}

export async function updateTransaction(id: string, payload: TransactionPayload) {
  const { error } = await client().from('transactions').update({ wallet_id: payload.walletId, category_id: payload.categoryId, type: payload.type, amount: payload.amount, currency: payload.currency, exchange_rate: payload.exchangeRate, note: payload.note.trim(), date: payload.date }).eq('id', id);
  if (error) throw error;
}

export async function deleteTransaction(id: string) {
  const { error } = await client().from('transactions').delete().eq('id', id);
  if (error) throw error;
}

/** Hapus dua-duanya sekaligus — menghapus satu leg saja akan menyisakan
 *  transfer separuh jalan yang tampil seperti income/expense biasa. */
export async function deleteTransfer(pairId: string) {
  const { error } = await client().from('transactions').delete().eq('transfer_pair_id', pairId);
  if (error) throw error;
}

/** Dua baris tertaut (keluar dari from-wallet, masuk ke to-wallet), sama-sama
 *  `is_transfer` supaya nggak ikut kehitung di total income/expense. Bukan
 *  satu transaksi database (client Supabase JS nggak punya multi-statement
 *  transaction) — kalau leg kedua gagal, leg pertama dihapus lagi supaya
 *  nggak nyisa transfer yang cuma separuh jalan. */
export interface TransferIds { pairId: string; fromId: string; toId: string }

export async function createTransfer(
  userId: string,
  payload: TransferPayload,
  { pairId, fromId, toId }: TransferIds = { pairId: crypto.randomUUID(), fromId: crypto.randomUUID(), toId: crypto.randomUUID() }
) {
  const note = payload.note.trim();

  const { data: fromRow, error: fromError } = await client()
    .from('transactions')
    .insert({
      id: fromId, user_id: userId, wallet_id: payload.fromWalletId, category_id: null, type: 'expense',
      amount: payload.fromAmount, currency: payload.fromCurrency, exchange_rate: payload.fromRate,
      note, date: payload.date, is_transfer: true, transfer_pair_id: pairId
    })
    .select('id')
    .single();
  if (fromError) throw fromError;

  const { error: toError } = await client()
    .from('transactions')
    .insert({
      id: toId, user_id: userId, wallet_id: payload.toWalletId, category_id: null, type: 'income',
      amount: payload.toAmount, currency: payload.toCurrency, exchange_rate: payload.toRate,
      note, date: payload.date, is_transfer: true, transfer_pair_id: pairId
    });
  if (toError) {
    await client().from('transactions').delete().eq('id', fromRow.id);
    throw toError;
  }
}

export async function updateProfile(id: string, name: string, photoUrl?: string) {
  const patch: Record<string, string> = { name: name.trim() };
  if (photoUrl !== undefined) patch.photo_url = photoUrl;
  const { error } = await client().from('profiles').upsert({ id, ...patch });
  if (error) throw error;
}

export async function resetMyData() {
  const { error } = await client().rpc('reset_my_data');
  if (error) throw error;
}

export async function deleteMyAccount() {
  const { error } = await client().rpc('delete_my_account');
  if (error) throw error;
}

export async function updateCurrencySettings(id: string, currency: Currency, rate: number) {
  const { error } = await client().from('profiles').update({ report_currency: currency, report_rate: rate }).eq('id', id);
  if (error) throw error;
}
