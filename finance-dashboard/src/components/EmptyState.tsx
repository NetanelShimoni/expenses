import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  subtitle?: string;
}

export default function EmptyState({
  title = 'אין עסקאות',
  subtitle = 'לא נמצאו עסקאות לתקופה הנבחרת',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
        <Inbox size={28} className="text-slate-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
      <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{subtitle}</p>
    </div>
  );
}
