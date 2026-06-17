import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryBreakdown } from '@/types';
import { formatCurrency, getCategoryIcon } from '@/utils';

interface CategoryChartProps {
  data: CategoryBreakdown[];
}

export default function CategoryChart({ data }: CategoryChartProps) {
  if (data.length === 0) return null;

  const top5 = data.slice(0, 5);
  const rest = data.slice(5);
  const chartData = rest.length > 0
    ? [...top5, { category: 'אחר', total: rest.reduce((s, d) => s + d.total, 0), count: rest.reduce((s, d) => s + d.count, 0), percentage: rest.reduce((s, d) => s + d.percentage, 0), color: '#94a3b8' }]
    : top5;

  const grandTotal = chartData.reduce((s, d) => s + d.total, 0);

  return (
    <div className="animate-fade-in-up rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900" style={{ animationDelay: '0.1s' }}>
      <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
        פילוח לפי קטגוריה
      </h3>

      {/* Donut Chart — full width, taller */}
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="total"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={76}
              paddingAngle={3}
              strokeWidth={0}
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              contentStyle={{
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                fontSize: '12px',
                direction: 'rtl',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — two columns, with ₪ amounts */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {chartData.map((item) => (
          <div key={item.category} className="flex items-center gap-2 min-w-0">
            {/* Color dot */}
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: item.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs text-slate-600 dark:text-slate-400">
                  {getCategoryIcon(item.category)} {item.category}
                </span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                  {((item.total / grandTotal) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                {formatCurrency(item.total)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
