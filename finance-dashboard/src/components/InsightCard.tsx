import type { CategoryBreakdown } from '@/types';
import { formatCurrency, getCategoryIcon } from '@/utils';
import { Lightbulb } from 'lucide-react';

interface InsightCardProps {
  topCategory: CategoryBreakdown | null;
  totalExpenses: number;
  transactionCount: number;
}

export default function InsightCard({ topCategory, totalExpenses, transactionCount }: InsightCardProps) {
  if (!topCategory) return null;

  const avgPerTransaction = transactionCount > 0 ? totalExpenses / transactionCount : 0;

  return (
    <div className="animate-fade-in-up rounded-2xl bg-gradient-to-bl from-amber-50 to-orange-50 p-4 shadow-sm dark:from-amber-950/30 dark:to-orange-950/30" style={{ animationDelay: '0.15s' }}>
      <div className="mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <Lightbulb size={16} />
        <h3 className="text-sm font-semibold">תובנות החודש</h3>
      </div>
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          <span className="text-lg">{getCategoryIcon(topCategory.category)}</span>{' '}
          הקטגוריה המובילה: <strong className="text-slate-800 dark:text-slate-200">{topCategory.category}</strong> עם{' '}
          <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(topCategory.total)}</strong>{' '}
          ({topCategory.percentage.toFixed(0)}% מסך ההוצאות)
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          ממוצע לעסקה: {formatCurrency(avgPerTransaction)}
        </p>
      </div>
    </div>
  );
}
