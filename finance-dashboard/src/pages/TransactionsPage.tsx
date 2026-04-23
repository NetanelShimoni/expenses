import { useState, useMemo } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { getCurrentMonth, groupTransactionsByDate, formatFullDate, formatCurrency, getCategoryBreakdown } from '@/utils';
import TransactionCard from '@/components/TransactionCard';
import MonthPicker from '@/components/MonthPicker';
import CategoryFilter from '@/components/CategoryFilter';
import CardFilter from '@/components/CardFilter';
import SearchBar from '@/components/SearchBar';
import RefreshButton from '@/components/RefreshButton';
import ScraperErrorBanner from '@/components/ScraperErrorBanner';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { TransactionCardSkeleton } from '@/components/Skeletons';

export default function TransactionsPage() {
  const [month, setMonth] = useState(getCurrentMonth);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { data: transactions, isLoading, isError, error, refetch, cacheInfo, scraperErrors, isRefreshing, forceRefresh } = useTransactions(month);

  // Get unique categories
  const categories = useMemo(() => {
    if (!transactions) return [];
    const breakdown = getCategoryBreakdown(transactions);
    return breakdown.map((b) => b.category);
  }, [transactions]);

  // Filter transactions
  const filtered = useMemo(() => {
    if (!transactions) return [];
    let result = transactions;
    if (selectedCard !== 'all') {
      result = result.filter((t) => t.card === selectedCard);
    }
    if (selectedCategory) {
      result = result.filter((t) => t.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.business.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.card.toLowerCase().includes(q) ||
          String(t.amount).includes(q),
      );
    }
    return result;
  }, [transactions, selectedCategory, selectedCard, searchQuery]);

  const grouped = useMemo(() => groupTransactionsByDate(filtered), [filtered]);

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, t) => sum + t.amount, 0),
    [filtered],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-24 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">כל העסקאות</h2>
        <div className="flex items-center gap-2">
          <RefreshButton cacheInfo={cacheInfo} isLoading={isLoading} isRefreshing={isRefreshing} onRefresh={forceRefresh} />
          <MonthPicker value={month} onChange={setMonth} />
        </div>
      </div>

      {/* Search Bar */}
      <SearchBar value={searchQuery} onChange={setSearchQuery} />

      {/* Card Provider Filter */}
      <CardFilter selected={selectedCard} onChange={setSelectedCard} />

      {/* Category Filter */}
      {categories.length > 0 && (
        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onChange={setSelectedCategory}
        />
      )}

      {/* Scraper Errors */}
      {scraperErrors.length > 0 && (
        <ScraperErrorBanner errors={scraperErrors} isRetrying={isLoading} onRetry={forceRefresh} />
      )}

      {/* Summary Bar */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {filtered.length} עסקאות{selectedCategory ? ` ב${selectedCategory}` : ''}
          </span>
          <span className="text-sm font-semibold text-expense">
            {formatCurrency(filteredTotal)}
          </span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <TransactionCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
      )}

      {/* Transactions Grouped by Date */}
      {!isLoading && !isError && filtered.length === 0 && transactions && (
        <EmptyState
          title={selectedCategory ? `אין עסקאות ב${selectedCategory}` : 'אין עסקאות'}
          subtitle="נסה לבחור חודש אחר או קטגוריה אחרת"
        />
      )}

      {grouped.map((group) => (
        <div key={group.date} className="animate-fade-in-up">
          <h4 className="mb-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
            {formatFullDate(group.date)}
          </h4>
          <div className="space-y-2">
            {group.transactions.map((txn) => (
              <TransactionCard key={txn.id} transaction={txn} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
