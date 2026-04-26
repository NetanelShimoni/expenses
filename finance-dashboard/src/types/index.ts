export interface Transaction {
  id: string;
  date: string;
  time?: string;       // "HH:MM"
  amount: number;
  business: string;
  category: string;
  card: 'cal' | 'isracard' | string;
  originalCurrency: string;
}

export interface TransactionGroup {
  date: string;
  transactions: Transaction[];
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  count: number;
  percentage: number;
  color: string;
}

export interface MonthOption {
  value: string;     // "2026-04"
  label: string;     // "אפריל 2026"
}

export interface CacheInfo {
  fromCache: boolean;
  cachedAt: number | null;   // epoch ms
}

export interface ScraperError {
  card: 'cal' | 'isracard' | string;
  message: string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  cache: CacheInfo;
  scraperErrors?: ScraperError[];
}

export interface ScrapeProgress {
  overall: number;                                  // 0..100 average across active cards
  cards: Partial<Record<'cal' | 'isracard', { percent: number; phase: string }>>;
}

// ---- AI Insights ----

export interface CategoryInsight {
  category: string;
  insight: string;
  trend: 'up' | 'down' | 'same' | 'new';
}

export interface CardFeeAlert {
  card: string;
  description: string;
  amount: number;
  recommendation: string;
}

export interface AIInsights {
  summary: string;
  comparison: {
    totalDiff: number;
    totalDiffPercent: number;
    text: string;
    isOverspending?: boolean;
  };
  previousMonthFull?: {
    total: number;
    text: string;
  };
  projection?: {
    estimatedTotal: number;
    text: string;
  };
  categoryInsights: CategoryInsight[];
  cardFeeAlert: {
    hasAlert: boolean;
    alerts: CardFeeAlert[];
  };
  tips: string[];
  score: number;
}
