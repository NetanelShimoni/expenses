import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  subtitle?: string;
}

export default function EmptyState({
  title = 'אין עסקאות',
  subtitle = 'לא נמצאו עסקאות לתקופה הנבחרת',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl"
        style={{
          background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
          boxShadow: '0 4px 24px rgba(139,92,246,0.12)',
        }}
      >
        <PackageOpen size={38} className="text-violet-400" />
      </div>
      <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">{title}</h3>
      <p className="mt-2 max-w-[200px] text-sm leading-relaxed text-slate-400 dark:text-slate-500">{subtitle}</p>
    </div>
  );
}
