import type { Transaction, TransactionGroup, CategoryBreakdown, MonthOption } from '@/types';

const CATEGORY_COLORS: Record<string, string> = {
  'מזון': '#f97316',
  'תחבורה': '#3b82f6',
  'קניות': '#a855f7',
  'בילויים': '#ec4899',
  'חשבונות': '#64748b',
  'בריאות': '#22c55e',
  'חינוך': '#06b6d4',
  'אחר': '#94a3b8',
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['אחר'];
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    'מזון': '🛒',
    'תחבורה': '🚗',
    'קניות': '🛍️',
    'בילויים': '🎬',
    'חשבונות': '📄',
    'בריאות': '💊',
    'חינוך': '📚',
    'אחר': '📌',
    'לא סווג': '📌',
  };
  return icons[category] || '📌';
}

export function formatCurrency(amount: number, currency = '₪'): string {
  if (currency === 'ILS' || currency === '₪') {
    return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === 'USD' || currency === '$') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === 'EUR' || currency === '€') {
    return `€${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${currency} ${amount.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function groupTransactionsByDate(transactions: Transaction[]): TransactionGroup[] {
  const groups: Record<string, Transaction[]> = {};
  for (const txn of transactions) {
    if (!groups[txn.date]) {
      groups[txn.date] = [];
    }
    groups[txn.date].push(txn);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, transactions]) => ({ date, transactions }));
}

export function getCategoryBreakdown(transactions: Transaction[]): CategoryBreakdown[] {
  const map: Record<string, { total: number; count: number }> = {};
  let grandTotal = 0;

  for (const txn of transactions) {
    const cat = txn.category || 'אחר';
    if (!map[cat]) map[cat] = { total: 0, count: 0 };
    map[cat].total += txn.amount;
    map[cat].count += 1;
    grandTotal += txn.amount;
  }

  return Object.entries(map)
    .map(([category, { total, count }]) => ({
      category,
      total,
      count,
      percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      color: getCategoryColor(category),
    }))
    .sort((a, b) => b.total - a.total);
}

export function getMonthOptions(): MonthOption[] {
  const months: MonthOption[] = [];
  const hebrewMonths = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
  ];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${hebrewMonths[d.getMonth()]} ${d.getFullYear()}`;
    months.push({ value, label });
  }
  return months;
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getTopCategory(transactions: Transaction[]): { category: string; total: number } | null {
  const breakdown = getCategoryBreakdown(transactions);
  return breakdown.length > 0 ? { category: breakdown[0].category, total: breakdown[0].total } : null;
}

export function getTotalExpenses(transactions: Transaction[]): number {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}
