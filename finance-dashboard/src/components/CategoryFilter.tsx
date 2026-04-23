import { getCategoryIcon, getCategoryColor } from '@/utils';

interface CategoryFilterProps {
  categories: string[];
  selected: string | null;
  onChange: (category: string | null) => void;
}

export default function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none">
      <button
        onClick={() => onChange(null)}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
          selected === null
            ? 'bg-primary-600 text-white shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
        }`}
      >
        הכל
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat === selected ? null : cat)}
          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
            cat === selected
              ? 'text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
          }`}
          style={cat === selected ? { backgroundColor: getCategoryColor(cat) } : undefined}
        >
          <span>{getCategoryIcon(cat)}</span>
          <span>{cat}</span>
        </button>
      ))}
    </div>
  );
}
