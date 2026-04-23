import { TrendingDown } from 'lucide-react';
import { formatCurrency } from '@/utils';

interface AccountSummaryProps {
  totalExpenses: number;
  transactionCount: number;
  month: string;
}

export default function AccountSummary({ totalExpenses, transactionCount, month }: AccountSummaryProps) {
  // Format month label
  const hebrewMonths = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
  ];
  const [year, m] = month.split('-').map(Number);
  const monthLabel = `${hebrewMonths[m - 1]} ${year}`;

  return (
    <div className="animate-fade-in-up rounded-2xl bg-gradient-to-bl from-primary-600 to-primary-800 p-5 text-white shadow-lg shadow-primary-600/20">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-primary-100">הוצאות החודש</span>
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm">
          {monthLabel}
        </span>
      </div>
      <div className="mb-3 text-3xl font-bold tracking-tight">
        {formatCurrency(totalExpenses)}
      </div>
      <div className="flex items-center gap-4 text-sm text-primary-200">
        <div className="flex items-center gap-1">
          <TrendingDown size={14} />
          <span>{transactionCount} עסקאות</span>
        </div>
      </div>
    </div>
  );
}
