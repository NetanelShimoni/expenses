import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Receipt, Sparkles, type LucideIcon } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',             label: 'ראשי',       icon: LayoutDashboard },
  { to: '/transactions', label: 'עסקאות',     icon: Receipt         },
  { to: '/insights',     label: 'תובנות AI',  icon: Sparkles        },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe">
      {/* Floating bar */}
      <div className="mx-auto mb-3 flex max-w-xs items-center justify-around rounded-3xl border border-slate-200/60 bg-white/90 px-2 py-1.5 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/8 dark:bg-slate-900/90">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-2xl px-5 py-2 text-[11px] font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30'
                  : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

