export function TransactionCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 dark:bg-slate-900">
      <div className="skeleton h-10 w-10 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3.5 w-3/4 rounded-md" />
        <div className="skeleton h-3 w-1/2 rounded-md" />
      </div>
      <div className="skeleton h-4 w-16 rounded-md" />
    </div>
  );
}

export function SummarySkeleton() {
  return (
    <div className="rounded-2xl bg-gradient-to-bl from-primary-600 to-primary-800 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="skeleton h-4 w-24 rounded-md !bg-white/20" />
        <div className="skeleton h-5 w-20 rounded-full !bg-white/20" />
      </div>
      <div className="skeleton mb-3 h-8 w-40 rounded-md !bg-white/20" />
      <div className="skeleton h-3 w-28 rounded-md !bg-white/20" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-2xl bg-white p-4 dark:bg-slate-900">
      <div className="skeleton mb-3 h-4 w-32 rounded-md" />
      <div className="flex items-center gap-4">
        <div className="skeleton h-32 w-32 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-4 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
