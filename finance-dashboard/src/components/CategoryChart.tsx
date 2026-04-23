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

  return (
    <div className="animate-fade-in-up rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900" style={{ animationDelay: '0.1s' }}>
      <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
        פילוח לפי קטגוריה
      </h3>

      <div className="flex items-center gap-4">
        {/* Donut Chart */}
        <div className="h-32 w-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="total"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius={32}
                outerRadius={56}
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
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  fontSize: '12px',
                  direction: 'rtl',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex flex-1 flex-col gap-2">
          {chartData.map((item) => (
            <div key={item.category} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">{getCategoryIcon(item.category)}</span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {item.category}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {item.percentage.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
