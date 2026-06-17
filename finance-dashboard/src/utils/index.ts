import type { Transaction, TransactionGroup, CategoryBreakdown, MonthOption } from '@/types';

const CATEGORY_COLORS: Record<string, string> = {
  'מזון':    '#f97316',
  'תחבורה':  '#3b82f6',
  'קניות':   '#a855f7',
  'בילויים': '#ec4899',
  'חשבונות': '#64748b',
  'בריאות':  '#22c55e',
  'חינוך':   '#06b6d4',
  'שונות':   '#8b5cf6',
  'אחר':     '#94a3b8',
  'לא סווג': '#94a3b8',
};

const CATEGORY_BG: Record<string, string> = {
  'מזון':    'linear-gradient(135deg,#fff7ed,#ffedd5)',
  'תחבורה':  'linear-gradient(135deg,#eff6ff,#dbeafe)',
  'קניות':   'linear-gradient(135deg,#faf5ff,#f3e8ff)',
  'בילויים': 'linear-gradient(135deg,#fdf2f8,#fce7f3)',
  'חשבונות': 'linear-gradient(135deg,#f8fafc,#f1f5f9)',
  'בריאות':  'linear-gradient(135deg,#f0fdf4,#dcfce7)',
  'חינוך':   'linear-gradient(135deg,#ecfeff,#cffafe)',
  'שונות':   'linear-gradient(135deg,#f5f3ff,#ede9fe)',
  'אחר':     'linear-gradient(135deg,#f8fafc,#f1f5f9)',
  'לא סווג': 'linear-gradient(135deg,#f8fafc,#f1f5f9)',
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['אחר'];
}

export function getCategoryBg(category: string): string {
  return CATEGORY_BG[category] || CATEGORY_BG['אחר'];
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    'מזון':    '🛒',
    'תחבורה':  '🚗',
    'קניות':   '🛍️',
    'בילויים': '🎬',
    'חשבונות': '📄',
    'בריאות':  '💊',
    'חינוך':   '📚',
    'שונות':   '🔀',
    'אחר':     '💳',
    'לא סווג': '💳',
  };
  return icons[category] || '💳';
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
    if (txn.isCredit) continue; // credits are refunds, exclude from expense breakdown
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
  return transactions.reduce((sum, t) => sum + (t.isCredit ? -t.amount : t.amount), 0);
}
