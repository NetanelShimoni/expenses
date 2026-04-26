import type { ScrapeProgress } from '@/types';

interface ScrapeProgressBarProps {
  progress: ScrapeProgress | null;
  isLoading: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  START_SCRAPING: 'מתחיל…',
  INITIALIZING: 'מאתחל דפדפן…',
  LOGGING_IN: 'מתחבר…',
  LOGIN_SUCCESS: 'התחברות הצליחה',
  CHANGE_PASSWORD: 'נדרשת החלפת סיסמה',
  LOGIN_FAILED: 'התחברות נכשלה',
  FETCHING_DATA: 'מושך עסקאות…',
  TERMINATING: 'מסיים…',
  END_SCRAPING: 'הושלם',
  ERROR: 'שגיאה',
};

const CARD_LABELS: Record<string, string> = {
  cal: 'CAL',
  isracard: 'Isracard',
};

export default function ScrapeProgressBar({ progress, isLoading }: ScrapeProgressBarProps) {
  if (!isLoading || !progress) return null;

  const overall = Math.max(0, Math.min(100, Math.round(progress.overall)));
  const cardEntries = Object.entries(progress.cards) as [
    'cal' | 'isracard',
    { percent: number; phase: string },
  ][];

  return (
    <div
      className="animate-fade-in-up rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900"
      role="status"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          טוען עסקאות מהאתרים…
        </span>
        <span className="text-sm font-bold tabular-nums text-primary-600 dark:text-primary-400">
          {overall}%
        </span>
      </div>

      {/* Overall bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-l from-primary-500 to-primary-700 transition-all duration-500 ease-out"
          style={{ width: `${overall}%` }}
        />
      </div>

      {/* Per-card breakdown */}
      {cardEntries.length > 0 && (
        <div className="mt-3 space-y-2">
          {cardEntries.map(([cardName, info]) => {
            const pct = Math.max(0, Math.min(100, Math.round(info.percent)));
            const label = PHASE_LABELS[info.phase] || info.phase;
            return (
              <div key={cardName}>
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-medium">
                    {CARD_LABELS[cardName] || cardName} · {label}
                  </span>
                  <span className="tabular-nums">{pct}%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-primary-400 transition-all duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
