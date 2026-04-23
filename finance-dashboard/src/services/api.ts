import type { Transaction, TransactionsResponse, AIInsights } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

export async function fetchTransactions(month: string, card = 'all', forceRefresh = false): Promise<TransactionsResponse> {
  const params = new URLSearchParams({ month, card });
  if (forceRefresh) params.set('forceRefresh', 'true');

  const res = await fetch(`${API_BASE}/transactions?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `שגיאה בטעינת עסקאות (${res.status})`);
  }

  const body = await res.json();

  // Handle both new format { transactions, cache } and legacy plain array
  if (Array.isArray(body)) {
    return {
      transactions: body as Transaction[],
      cache: { fromCache: false, cachedAt: null },
    };
  }

  return body as TransactionsResponse;
}

export async function fetchHealth(): Promise<{ status: string; cacheSize: number }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function clearCache(): Promise<void> {
  await fetch(`${API_BASE}/cache/clear`, { method: 'POST' });
}

export async function fetchAIInsights(
  currentMonth: string,
  previousMonth: string,
  currentTransactions: Transaction[],
  previousTransactions: Transaction[],
): Promise<AIInsights> {
  const res = await fetch(`${API_BASE}/ai/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentMonth, previousMonth, currentTransactions, previousTransactions }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `שגיאה בקבלת תובנות AI (${res.status})`);
  }
  return res.json();
}
