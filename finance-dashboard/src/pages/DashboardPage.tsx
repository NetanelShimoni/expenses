import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useTransactions } from '@/hooks/useTransactions';
import { getCurrentMonth, getTotalExpenses, getCategoryBreakdown } from '@/utils';
import AccountSummary from '@/components/AccountSummary';
import CategoryChart from '@/components/CategoryChart';
import InsightCard from '@/components/InsightCard';
import TransactionCard from '@/components/TransactionCard';
import MonthPicker from '@/components/MonthPicker';
import RefreshButton from '@/components/RefreshButton';
import ScraperErrorBanner from '@/components/ScraperErrorBanner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { SummarySkeleton, ChartSkeleton, TransactionCardSkeleton } from '@/components/Skeletons';

export default function DashboardPage() {
  const [month, setMonth] = useState(getCurrentMonth);
  const { data: transactions, isLoading, isError, error, refetch, cacheInfo, scraperErrors, isRefreshing, forceRefresh } = useTransactions(month);

  const total = transactions ? getTotalExpenses(transactions) : 0;
  const categoryBreakdown = transactions ? getCategoryBreakdown(transactions) : [];
  const recentTxns = transactions ? transactions.slice(0, 5) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-24 pt-4">
      {/* Month Picker */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">סקירה כללית</h2>
        <div className="flex items-center gap-2">
          <RefreshButton cacheInfo={cacheInfo} isLoading={isLoading} isRefreshing={isRefreshing} onRefresh={forceRefresh} />
          <MonthPicker value={month} onChange={setMonth} />
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <>
          <SummarySkeleton />
          <ChartSkeleton />
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <TransactionCardSkeleton key={i} />
            ))}
          </div>
        </>
      )}

      {/* Scraper Errors */}
      {scraperErrors.length > 0 && !isLoading && (
        <ScraperErrorBanner errors={scraperErrors} isRetrying={isLoading} onRetry={forceRefresh} />
      )}

      {/* Error State */}
      {isError && (
        <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
      )}

      {/* Data Loaded */}
      {transactions && !isLoading && (
        <>
          {transactions.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* Summary Card */}
              <AccountSummary
                totalExpenses={total}
                transactionCount={transactions.length}
                month={month}
              />

              {/* Category Chart */}
              <CategoryChart data={categoryBreakdown} />

              {/* Insight */}
              <InsightCard
                topCategory={categoryBreakdown[0] ?? null}
                totalExpenses={total}
                transactionCount={transactions.length}
              />

              {/* Recent Transactions */}
              <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    עסקאות אחרונות
                  </h3>
                  <Link
                    to="/transactions"
                    className="flex items-center gap-0.5 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400"
                  >
                    הצג הכל
                    <ChevronLeft size={14} />
                  </Link>
                </div>
                <div className="space-y-2">
                  {recentTxns.map((txn) => (
                    <TransactionCard key={txn.id} transaction={txn} />
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
