import type { CategoryBreakdown, Transaction } from '@/types';
import { formatCurrency, getCategoryIcon } from '@/utils';
import { TrendingUp } from 'lucide-react';

interface InsightCardProps {
  topCategory: CategoryBreakdown | null;
  totalExpenses: number;
  transactionCount: number;
  transactions?: Transaction[];
}

export default function InsightCard({ topCategory, totalExpenses, transactions = [] }: InsightCardProps) {
  if (!topCategory) return null;

  const debitCount = transactions.filter((t) => !t.isCredit).length;
  const avgPerTransaction = debitCount > 0 ? totalExpenses / debitCount : 0;
  const totalCredits = transactions.filter((t) => t.isCredit).reduce((s, t) => s + t.amount, 0);

  return (
    <div
      className="animate-fade-in-up rounded-3xl p-4 shadow-sm"
      style={{
        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        boxShadow: '0 2px 12px rgba(251,191,36,0.15)',
      }}
      // dark mode inline override not possible with inline style — use className for dark
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">💡</span>
        <h3 className="text-sm font-bold text-amber-800">תובנות החודש</h3>
      </div>
      <div className="space-y-2.5">
        <p className="text-xs leading-relaxed text-amber-900/80">
          <span className="text-base">{getCategoryIcon(topCategory.category)}</span>{' '}
          הקטגוריה המובילה:{' '}
          <strong className="text-amber-900">{topCategory.category}</strong>{' '}—{' '}
          <strong className="text-amber-900">{formatCurrency(topCategory.total)}</strong>{' '}
          ({topCategory.percentage.toFixed(0)}%)
        </p>
        <p className="text-xs text-amber-700/70">
          ממוצע לעסקה: {formatCurrency(avgPerTransaction)}
        </p>
        {totalCredits > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2">
            <TrendingUp size={13} className="text-emerald-600" />
            <p className="text-xs font-semibold text-emerald-700">
              זיכויים החזירו לך {formatCurrency(totalCredits)} החודש
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
