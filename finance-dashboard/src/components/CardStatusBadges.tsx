import type { Transaction, ScraperError } from '@/types';

interface CardStatusBadgesProps {
  transactions: Transaction[] | undefined;
  scraperErrors: ScraperError[];
  isLoading: boolean;
}

const CARDS = [
  { id: 'isracard', label: 'ישראכרט' },
  { id: 'isracard-hot', label: 'ישראכרט הוט' },
];

export default function CardStatusBadges({ transactions, scraperErrors, isLoading }: CardStatusBadgesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CARDS.map(({ id, label }) => {
        const hasError = scraperErrors.some((e) => e.card === id);
        const count = transactions?.filter((t) => t.card === id).length ?? 0;

        let dotClass = '';
        let text = '';
        let containerClass = '';

        if (isLoading) {
          dotClass = 'animate-pulse bg-slate-400';
          text = 'טוען…';
          containerClass = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
        } else if (hasError) {
          dotClass = 'bg-red-500';
          text = 'נכשל';
          containerClass = 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400';
        } else if (count > 0) {
          dotClass = 'bg-green-500';
          text = `${count} עסקאות`;
          containerClass = 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400';
        } else if (transactions !== undefined) {
          // loaded but 0 transactions
          dotClass = 'bg-amber-400';
          text = 'אין עסקאות';
          containerClass = 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400';
        } else {
          return null;
        }

        return (
          <div
            key={id}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${containerClass}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
            <span>{label}</span>
            <span className="opacity-50">·</span>
            <span>{text}</span>
          </div>
        );
      })}
    </div>
  );
}
