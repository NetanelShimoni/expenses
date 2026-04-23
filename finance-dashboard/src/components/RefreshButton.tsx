import type { CacheInfo } from '@/types';

interface RefreshButtonProps {
  cacheInfo: CacheInfo | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'עכשיו';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  return `לפני ${hours} שע׳`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RefreshButton({ cacheInfo, isLoading, isRefreshing, onRefresh }: RefreshButtonProps) {
  const busy = isLoading || isRefreshing;

  return (
    <div className="flex items-center gap-2">
      {/* Cache Info */}
      {!busy && cacheInfo?.fromCache && cacheInfo.cachedAt && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500" title={`נשלף מהקאש בשעה ${formatTime(cacheInfo.cachedAt)}`}>
          🗂️ קאש · {formatTimeAgo(cacheInfo.cachedAt)}
        </span>
      )}

      {/* Refreshing indicator */}
      {isRefreshing && (
        <span className="text-[11px] font-medium text-amber-500 dark:text-amber-400 animate-pulse">
          מביא מידע חדש מהאתרים…
        </span>
      )}

      {/* Refresh Button */}
      <button
        onClick={onRefresh}
        disabled={busy}
        title="רענון מהאתרים — ללא קאש"
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
          busy
            ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            : 'bg-primary-50 text-primary-600 hover:bg-primary-100 active:scale-95 dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/30'
        }`}
      >
        <svg
          className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}
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
        {busy ? 'טוען...' : 'רענן'}
      </button>
    </div>
  );
}
