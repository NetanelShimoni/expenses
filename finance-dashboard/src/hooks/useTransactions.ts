import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { fetchTransactionsStreaming } from '@/services/api';
import { MOCK_TRANSACTIONS } from '@/services/mockData';
import type { Transaction, CacheInfo, ScraperError, ScrapeProgress } from '@/types';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export function useTransactions(month: string, card = 'all') {
  const queryClient = useQueryClient();
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [scraperErrors, setScraperErrors] = useState<ScraperError[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const forceRefreshRef = useRef(false);
  const refreshCardRef = useRef<string | undefined>(undefined);

  const query = useQuery<Transaction[]>({
    queryKey: ['transactions', month, card],
    queryFn: async () => {
      if (USE_MOCK) {
        setProgress({ overall: 0, cards: {} });
        for (let p = 10; p <= 100; p += 15) {
          await new Promise((r) => setTimeout(r, 80));
          setProgress({ overall: p, cards: {} });
        }
        setCacheInfo({ fromCache: false, cachedAt: null });
        setScraperErrors([]);
        setIsRefreshing(false);
        setProgress(null);
        return MOCK_TRANSACTIONS;
      }
      const shouldForce = forceRefreshRef.current;
      const refreshCard = refreshCardRef.current;
      forceRefreshRef.current = false;
      refreshCardRef.current = undefined;

      setProgress({ overall: 0, cards: {} });

      try {
        const response = await fetchTransactionsStreaming(
          month,
          card,
          shouldForce,
          refreshCard,
          (p) => setProgress(p),
        );
        setCacheInfo(response.cache);
        setScraperErrors(response.scraperErrors ?? []);
        return response.transactions;
      } finally {
        setIsRefreshing(false);
        setProgress(null);
      }
    },
    staleTime: 5 * 60 * 1000, // 5 min
    retry: 2,
  });

  const forceRefresh = useCallback((onlyCard?: string) => {
    forceRefreshRef.current = true;
    refreshCardRef.current = onlyCard;
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ['transactions', month, card] });
  }, [queryClient, month, card]);

  return { ...query, cacheInfo, scraperErrors, isRefreshing, progress, forceRefresh };
}
