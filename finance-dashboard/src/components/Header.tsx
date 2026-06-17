import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export default function Header() {
  const { isDark, toggle } = useTheme();

  return (
    <header className="glass sticky top-0 z-50 border-b border-slate-200/60 dark:border-white/5">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-2xl text-base shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: '0 0 16px rgba(99,102,241,0.35)',
            }}
          >
            💳
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-slate-800 dark:text-white">FinTrack</span>
          </div>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/80 text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-700 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
          aria-label="החלפת ערכת נושא"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
}
