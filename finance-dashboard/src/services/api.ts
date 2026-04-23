import type { Transaction, TransactionsResponse, AIInsights } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// ---- Auth helpers ----
export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setToken(token: string) {
  localStorage.setItem('auth_token', token);
}

export function clearToken() {
  localStorage.removeItem('auth_token');
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  // Check if token is expired (JWT payload is base64)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---- Login ----
export async function login(password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'שגיאה בהתחברות');
  }
  const { token } = await res.json();
  setToken(token);
}

export async function fetchTransactions(month: string, card = 'all', forceRefresh = false): Promise<TransactionsResponse> {
  const params = new URLSearchParams({ month, card });
  if (forceRefresh) params.set('forceRefresh', 'true');

  const res = await fetch(`${API_BASE}/transactions?${params}`, {
    headers: authHeaders(),
  });
  if (res.status === 401) { clearToken(); window.location.reload(); throw new Error('לא מחובר'); }
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
  const res = await fetch(`${API_BASE}/health`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function clearCache(): Promise<void> {
  await fetch(`${API_BASE}/cache/clear`, { method: 'POST', headers: authHeaders() });
}

export async function fetchAIInsights(
  currentMonth: string,
  previousMonth: string,
  currentTransactions: Transaction[],
  previousTransactions: Transaction[],
): Promise<AIInsights> {
  const res = await fetch(`${API_BASE}/ai/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ currentMonth, previousMonth, currentTransactions, previousTransactions }),
  });
  if (res.status === 401) { clearToken(); window.location.reload(); throw new Error('לא מחובר'); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `שגיאה בקבלת תובנות AI (${res.status})`);
  }
  return res.json();
}
