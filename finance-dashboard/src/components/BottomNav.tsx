import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Receipt, Sparkles, type LucideIcon } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'ראשי', icon: LayoutDashboard },
  { to: '/transactions', label: 'עסקאות', icon: Receipt },
  { to: '/insights', label: 'תובנות AI', icon: Sparkles },
];

export default function BottomNav() {
  return (
    <nav className="glass fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-slate-800 pb-safe">
      <div className="mx-auto flex max-w-2xl items-center justify-around px-4 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
