import type { Transaction, TransactionsResponse, AIInsights, ScrapeProgress } from '@/types';

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

export async function fetchTransactions(month: string, card = 'all', forceRefresh = false, refreshCard?: string): Promise<TransactionsResponse> {
  const params = new URLSearchParams({ month, card });
  if (forceRefresh) params.set('forceRefresh', 'true');
  if (refreshCard) params.set('refreshCard', refreshCard);

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

/**
 * Streaming version of fetchTransactions — uses Server-Sent Events to receive
 * progress updates while the server scrapes the bank/card sites.
 *
 * onProgress is called with overall (0..100) and per-card phase info.
 */
export async function fetchTransactionsStreaming(
  month: string,
  card = 'all',
  forceRefresh = false,
  refreshCard: string | undefined,
  onProgress: (progress: ScrapeProgress) => void,
  signal?: AbortSignal,
): Promise<TransactionsResponse> {
  const params = new URLSearchParams({ month, card });
  if (forceRefresh) params.set('forceRefresh', 'true');
  if (refreshCard) params.set('refreshCard', refreshCard);

  const res = await fetch(`${API_BASE}/transactions/stream?${params}`, {
    headers: { ...authHeaders(), Accept: 'text/event-stream' },
    signal,
  });

  if (res.status === 401) { clearToken(); window.location.reload(); throw new Error('לא מחובר'); }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `שגיאה בטעינת עסקאות (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  type CardState = {
    percent: number;
    phase: string;
    startedAt: number;
    elapsedMs: number;
    logs: { phase: string; at: number }[];
  };
  const cards: Partial<Record<'cal' | 'isracard', CardState>> = {};
  const refreshingCard = (refreshCard === 'cal' || refreshCard === 'isracard') ? refreshCard : undefined;
  let finalResult: TransactionsResponse | null = null;
  let streamError: string | null = null;

  const toPublicCards = (): ScrapeProgress['cards'] => {
    const out: ScrapeProgress['cards'] = {};
    for (const [k, v] of Object.entries(cards) as ['cal' | 'isracard', CardState][]) {
      out[k] = {
        percent: v.percent,
        phase: v.phase,
        elapsedMs: v.elapsedMs,
        logs: v.logs,
      };
    }
    return out;
  };

  // SSE parser — accumulate `event:` and `data:` lines until a blank line.
  const parseSSEChunk = (chunk: string) => {
    buffer += chunk;
    let sepIdx;
    while ((sepIdx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const rawEvent = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx).replace(/^\r?\n\r?\n/, '');

      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of rawEvent.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue; // comment/heartbeat
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      }
      if (dataLines.length === 0) continue;

      let payload: {
        card?: 'cal' | 'isracard' | string;
        phase?: string;
        cardPercent?: number;
        overall?: number;
        error?: string;
      } & Partial<TransactionsResponse>;
      try {
        payload = JSON.parse(dataLines.join('\n'));
      } catch {
        continue;
      }

      if (eventName === 'progress') {
        const cardName = payload.card as 'cal' | 'isracard';
        if (cardName === 'cal' || cardName === 'isracard') {
          const now = Date.now();
          const existing = cards[cardName];
          const startedAt = existing?.startedAt ?? now;
          const phase = payload.phase ?? '';
          const prevPhase = existing?.phase;
          const logs = existing?.logs ? [...existing.logs] : [];
          if (phase && phase !== prevPhase) {
            logs.push({ phase, at: now - startedAt });
          }
          cards[cardName] = {
            percent: payload.cardPercent ?? 0,
            phase,
            startedAt,
            elapsedMs: now - startedAt,
            logs,
          };
        }
        onProgress({
          overall: payload.overall ?? 0,
          cards: toPublicCards(),
          refreshingCard,
        });
      } else if (eventName === 'done') {
        finalResult = payload as TransactionsResponse;
      } else if (eventName === 'error') {
        streamError = payload?.error || 'שגיאת שרת';
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    parseSSEChunk(decoder.decode(value, { stream: true }));
    if (finalResult || streamError) break;
  }

  if (streamError) throw new Error(streamError);
  if (!finalResult) throw new Error('הסטרים נסגר ללא תוצאה');
  return finalResult;
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
