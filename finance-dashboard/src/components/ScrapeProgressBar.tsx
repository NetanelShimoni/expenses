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
  cal: 'כאל',
  isracard: 'ישראכרט',
};

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ScrapeProgressBar({ progress, isLoading }: ScrapeProgressBarProps) {
  if (!isLoading || !progress) return null;

  const focusCard = progress.refreshingCard;
  const allEntries = Object.entries(progress.cards) as [
    'cal' | 'isracard',
    NonNullable<ScrapeProgress['cards']['cal']>,
  ][];

  // When refreshing a single card, show only that card. Otherwise show all.
  const cardEntries = focusCard
    ? allEntries.filter(([name]) => name === focusCard)
    : allEntries;

  const focusInfo = focusCard ? progress.cards[focusCard] : undefined;
  const overall = focusInfo
    ? Math.max(0, Math.min(100, Math.round(focusInfo.percent)))
    : Math.max(0, Math.min(100, Math.round(progress.overall)));

  const headerLabel = focusCard
    ? `מרענן ${CARD_LABELS[focusCard]}…`
    : 'טוען עסקאות מהאתרים…';

  return (
    <div
      className="animate-fade-in-up rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900"
      role="status"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {headerLabel}
        </span>
        <div className="flex items-center gap-2">
          {focusInfo && (
            <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
              {formatElapsed(focusInfo.elapsedMs)}
            </span>
          )}
          <span className="text-sm font-bold tabular-nums text-primary-600 dark:text-primary-400">
            {overall}%
          </span>
        </div>
      </div>

      {/* Overall / focused bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-l from-primary-500 to-primary-700 transition-all duration-500 ease-out"
          style={{ width: `${overall}%` }}
        />
      </div>

      {/* Per-card breakdown / focused logs */}
      {cardEntries.length > 0 && (
        <div className="mt-3 space-y-3">
          {cardEntries.map(([cardName, info]) => {
            const pct = Math.max(0, Math.min(100, Math.round(info.percent)));
            const label = PHASE_LABELS[info.phase] || info.phase;
            const showSubBar = !focusCard;
            return (
              <div key={cardName}>
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-medium">
                    {CARD_LABELS[cardName] || cardName} · {label}
                  </span>
                  <span className="tabular-nums">
                    {formatElapsed(info.elapsedMs)} · {pct}%
                  </span>
                </div>
                {showSubBar && (
                  <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-primary-400 transition-all duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}

                {/* Phase log — only when focused on this card */}
                {focusCard === cardName && info.logs.length > 0 && (
                  <ol
                    className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded-lg bg-slate-50 p-2 font-mono text-[10.5px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"
                    dir="ltr"
                  >
                    {info.logs.map((entry, i) => (
                      <li key={i}>
                        [{formatElapsed(entry.at)}] {PHASE_LABELS[entry.phase] || entry.phase}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
