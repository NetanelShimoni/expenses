interface CardFilterProps {
  selected: string;
  onChange: (card: string) => void;
}

const CARDS = [
  { value: 'all', label: 'הכל', dot: null },
  { value: 'cal', label: 'כאל', dot: '#3b82f6' },
  { value: 'isracard', label: 'ישראכרט', dot: '#8b5cf6' },
  { value: 'isracard-hot', label: 'ישראכרט הוט', dot: '#f97316' },
];

export default function CardFilter({ selected, onChange }: CardFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none">
      {CARDS.map((card) => {
        const isActive = selected === card.value;
        return (
          <button
            key={card.value}
            onClick={() => onChange(card.value)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
              isActive
                ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            {card.dot && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: isActive ? 'rgba(255,255,255,0.8)' : card.dot }}
              />
            )}
            {card.label}
          </button>
        );
      })}
    </div>
  );
}
