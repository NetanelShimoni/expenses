import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message = 'שגיאה בטעינת הנתונים',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/30">
        <AlertTriangle size={28} className="text-red-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">{message}</h3>
      <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">נסה שוב מאוחר יותר</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700"
        >
          <RefreshCw size={14} />
          נסה שוב
        </button>
      )}
    </div>
  );
}
