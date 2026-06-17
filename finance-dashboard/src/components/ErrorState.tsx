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
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-50 shadow-inner shadow-rose-100 dark:bg-rose-950/30">
        <AlertTriangle size={32} className="text-rose-500" />
      </div>
      <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">{message}</h3>
      <p className="mt-1.5 text-sm text-slate-400 dark:text-slate-500">נסה שוב מאוחר יותר</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }}
        >
          <RefreshCw size={14} />
          נסה שוב
        </button>
      )}
    </div>
  );
}
