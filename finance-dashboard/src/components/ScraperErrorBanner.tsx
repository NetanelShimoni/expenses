import type { ScraperError } from '@/types';

const CARD_LABELS: Record<string, string> = {
  cal: 'כאל',
  isracard: 'ישראכרט',
};

interface ScraperErrorBannerProps {
  errors: ScraperError[];
  isRetrying: boolean;
  onRetry: () => void;
}

export default function ScraperErrorBanner({ errors, isRetrying, onRetry }: ScraperErrorBannerProps) {
  if (errors.length === 0) return null;

  return (
    <div className="space-y-2">
      {errors.map((err) => (
        <div
          key={err.card}
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/40 dark:bg-red-900/20"
        >
          {/* Error Icon */}
          <div className="mt-0.5 shrink-0">
            <svg className="h-5 w-5 text-red-500 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1" dir="rtl">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              שגיאה בטעינת {CARD_LABELS[err.card] || err.card}
            </p>
            <p className="mt-0.5 text-xs text-red-600/80 dark:text-red-400/70 break-words">
              {err.message}
            </p>
          </div>

          {/* Retry Button */}
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              isRetrying
                ? 'cursor-not-allowed bg-red-100 text-red-300 dark:bg-red-900/30 dark:text-red-500'
                : 'bg-red-100 text-red-700 hover:bg-red-200 active:scale-95 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-800/40'
            }`}
          >
            <span className="flex items-center gap-1">
              <svg
                className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
              {isRetrying ? 'טוען...' : 'נסה שוב'}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
