import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { fetchTransactions } from '@/services/api';
import { MOCK_TRANSACTIONS } from '@/services/mockData';
import type { Transaction, CacheInfo, ScraperError } from '@/types';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export function useTransactions(month: string, card = 'all') {
  const queryClient = useQueryClient();
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [scraperErrors, setScraperErrors] = useState<ScraperError[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const forceRefreshRef = useRef(false);

  const query = useQuery<Transaction[]>({
    queryKey: ['transactions', month, card],
    queryFn: async () => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 800));
        setCacheInfo({ fromCache: false, cachedAt: null });
        setScraperErrors([]);
        setIsRefreshing(false);
        return MOCK_TRANSACTIONS;
      }
      const shouldForce = forceRefreshRef.current;
      forceRefreshRef.current = false;
      const response = await fetchTransactions(month, card, shouldForce);
      setCacheInfo(response.cache);
      setScraperErrors(response.scraperErrors ?? []);
      setIsRefreshing(false);
      return response.transactions;
    },
    staleTime: 5 * 60 * 1000, // 5 min
    retry: 2,
  });

  const forceRefresh = useCallback(() => {
    forceRefreshRef.current = true;
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ['transactions', month, card] });
  }, [queryClient, month, card]);

  return { ...query, cacheInfo, scraperErrors, isRefreshing, forceRefresh };
}
