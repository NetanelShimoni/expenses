import type { Transaction } from "@/types";
import { formatCurrency, getCategoryIcon, getCategoryColor, getCategoryBg } from "@/utils";

const CARD_LABELS: Record<string, string> = {
  cal: "כאל",
  isracard: "ישראכרט",
  "isracard-hot": "הוט",
};

interface TransactionCardProps {
  transaction: Transaction;
}

export default function TransactionCard({ transaction }: TransactionCardProps) {
  const { business, amount, isCredit, category, card, originalCurrency, time } = transaction;

  const iconBg    = isCredit ? "linear-gradient(135deg,#ecfdf5,#d1fae5)" : getCategoryBg(category);
  const iconColor = isCredit ? "#059669" : getCategoryColor(category);

  return (
    <div className="group flex items-center gap-3.5 rounded-2xl bg-white px-4 py-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900/80 dark:hover:bg-slate-900">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl shadow-sm"
        style={{ background: iconBg }}
      >
        {isCredit ? "↩️" : getCategoryIcon(category)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
            {business}
          </p>
          {isCredit && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              זיכוי
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-1.5">
          {!isCredit && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: `${iconColor}18`, color: iconColor }}
            >
              {category}
            </span>
          )}
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {CARD_LABELS[card] || card.toUpperCase()}
          </span>
          {time && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500" dir="ltr">{time}</span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <span
          className="text-[15px] font-bold tabular-nums"
          style={{ color: isCredit ? "#059669" : "#f43f5e" }}
        >
          {isCredit ? "+" : "-"}{formatCurrency(amount, originalCurrency)}
        </span>
      </div>
    </div>
  );
}
