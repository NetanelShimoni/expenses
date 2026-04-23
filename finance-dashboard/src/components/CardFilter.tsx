interface CardFilterProps {
  selected: string;
  onChange: (card: string) => void;
}

const CARDS = [
  { value: 'all', label: 'הכל' },
  { value: 'cal', label: 'כאל' },
  { value: 'isracard', label: 'ישראכרט' },
];

export default function CardFilter({ selected, onChange }: CardFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none">
      {CARDS.map((card) => (
        <button
          key={card.value}
          onClick={() => onChange(card.value)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
            selected === card.value
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
          }`}
        >
          {card.label}
        </button>
      ))}
    </div>
  );
}
