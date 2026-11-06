import { useAppData } from '../context/AppDataContext';
import { useUi } from '../context/UiContext';
import { formatCurrency, formatCompact } from '../lib/format';
import { convertedBalance, currencyLabel, reportTransactions } from '../lib/currency';

export function useReport() {
  const { profile, wallets, transactions } = useAppData();
  const { balanceHidden } = useUi();
  const currency = profile?.reportCurrency || 'IDR';
  const rate = profile?.reportRate || 1;
  return {
    currency, rate,
    transactions: reportTransactions(transactions, currency, rate),
    total: convertedBalance(wallets, transactions, rate, currency),
    formatCurrency: (value: number) => formatCurrency(value, currency),
    formatCompact: (value: number) => formatCompact(value, currency),
    formatBalance: (value: number) => balanceHidden ? currencyLabel(currency) + ' ••••••' : formatCurrency(value, currency)
  };
}
