import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { formatCurrency } from '@/utils';
import type { Transaction } from '@/types';

interface AccountSummaryProps {
  totalExpenses: number;
  transactionCount: number;
  month: string;
  transactions?: Transaction[];
}

export default function AccountSummary({ totalExpenses, transactionCount, month, transactions = [] }: AccountSummaryProps) {
  const hebrewMonths = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const [year, m] = month.split('-').map(Number);
  const monthLabel = `${hebrewMonths[m - 1]} ${year}`;

  const grossExpenses = transactions.filter((t) => !t.isCredit).reduce((s, t) => s + t.amount, 0);
  const totalCredits  = transactions.filter((t) =>  t.isCredit).reduce((s, t) => s + t.amount, 0);
  const hasCredits    = totalCredits > 0;
  const creditCount   = transactions.filter((t) =>  t.isCredit).length;
  const debitCount    = transactionCount - creditCount;

  return (
    <div
      className="animate-fade-in-up relative overflow-hidden rounded-3xl p-5 text-white"
      style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #9333ea 100%)',
        boxShadow: '0 8px 32px rgba(79,70,229,0.35), 0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <div className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full bg-white/8" />
      <div className="pointer-events-none absolute -bottom-12 -right-4 h-52 w-52 rounded-full bg-white/6" />
      <div className="pointer-events-none absolute top-4 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-white/5" />

      <div className="relative mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-white/60">
          {hasCredits ? 'נטו לתשלום' : 'הוצאות החודש'}
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
          {monthLabel}
        </span>
      </div>

      <div className="relative mb-4 mt-2">
        <span className="text-4xl font-extrabold tracking-tight">{formatCurrency(totalExpenses)}</span>
      </div>

      <div className="relative flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-white/70">
          <TrendingDown size={14} />
          <span>{debitCount} חיובים</span>
        </div>
        {hasCredits && (
          <>
            <div className="h-3 w-px bg-white/20" />
            <div className="flex items-center gap-1.5 text-emerald-300">
              <TrendingUp size={14} />
              <span>{creditCount} זיכויים</span>
            </div>
          </>
        )}
      </div>

      {hasCredits && (
        <div className="relative mt-4 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-white/70"><Minus size={11} /><span>הוצאות</span></div>
            <span className="font-semibold">{formatCurrency(grossExpenses)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-emerald-300"><TrendingUp size={11} /><span>זיכויים</span></div>
            <span className="font-semibold text-emerald-300">−{formatCurrency(totalCredits)}</span>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-emerald-400/80 transition-all duration-700"
              style={{ width: `${Math.min(100, (totalCredits / grossExpenses) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
