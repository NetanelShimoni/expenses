import { Moon, Sun, Wallet } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export default function Header() {
  const { isDark, toggle } = useTheme();

  return (
    <header className="glass sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-md">
            <Wallet size={18} />
          </div>
          <span className="text-lg font-semibold tracking-tight">FinTrack</span>
        </div>
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          aria-label="החלפת ערכת נושא"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
