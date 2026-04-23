import type { Transaction } from '@/types';
import { formatCurrency, getCategoryIcon } from '@/utils';

interface TransactionCardProps {
  transaction: Transaction;
}

export default function TransactionCard({ transaction }: TransactionCardProps) {
  const { business, amount, category, card, originalCurrency, time } = transaction;

  return (
    <div className="group flex items-center gap-3 rounded-xl bg-white px-3 py-3 shadow-sm transition-all hover:shadow-md dark:bg-slate-900 active:scale-[0.98]">
      {/* Category Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-slate-800">
        {getCategoryIcon(category)}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
          {business}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <span>{category}</span>
          <span>·</span>
          <span className="uppercase">{card}</span>
          {time && (
            <>
              <span>·</span>
              <span dir="ltr">{time}</span>
            </>
          )}
        </p>
      </div>

      {/* Amount */}
      <div className="shrink-0 text-left">
        <span className="text-sm font-semibold text-expense">
          -{formatCurrency(amount, originalCurrency)}
        </span>
      </div>
    </div>
  );
}
