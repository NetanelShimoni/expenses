import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * A JWT whose payload is `{"exp":9999999999}` (expires ~year 2286).
 * The app only base64-decodes the payload to check `exp`, so the signature
 * can be anything.
 */
const FAKE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjk5OTk5OTk5OTl9.fakesig';

/** Small set of mock transactions used across tests. */
const MOCK_TXN = [
  {
    id: '1',
    date: '2026-04-15',
    time: '10:32',
    amount: 312.5,
    business: 'שופרסל דיל',
    category: 'מזון',
    card: 'cal',
    originalCurrency: 'ILS',
  },
  {
    id: '2',
    date: '2026-04-15',
    time: '14:15',
    amount: 89.9,
    business: 'NETFLIX',
    category: 'בילויים',
    card: 'isracard',
    originalCurrency: 'USD',
  },
  {
    id: '3',
    date: '2026-04-14',
    time: '20:30',
    amount: 156.0,
    business: 'מסעדת שגב',
    category: 'מזון',
    card: 'cal',
    originalCurrency: 'ILS',
  },
];

/**
 * Fills the login password input in a way that reliably updates React 19's
 * controlled state.  Playwright's fill() and pressSequentially() fire events
 * before React finishes attaching listeners on the first page load; the native
 * setter + InputEvent approach mirrors @testing-library/user-event and works
 * regardless of render timing.
 */
async function fillPassword(page: Page, value: string) {
  // Ensure React has fully mounted before we touch the DOM
  await page.getByRole('button', { name: 'כניסה' }).waitFor({ state: 'visible' });
  await page.evaluate((v: string) => {
    const input = document.querySelector(
      'input[placeholder="סיסמה"]',
    ) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!
      .set!.call(input, v);
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }, value);
}

/**
 * Builds a minimal SSE body that the app's `fetchTransactionsStreaming` will
 * parse.  The app stops reading as soon as it receives an `event: done` block.
 */
function sseBody(transactions: typeof MOCK_TXN): string {
  const payload = JSON.stringify({
    transactions,
    cache: { fromCache: false, cachedAt: null },
    scraperErrors: [],
  });
  return `event: done\ndata: ${payload}\n\n`;
}

/**
 * Intercepts the SSE streaming endpoint and returns `transactions`
 * immediately so tests don't hit a real server.
 */
async function mockStream(page: Page, transactions = MOCK_TXN) {
  await page.route('**/api/transactions/stream**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: sseBody(transactions),
    }),
  );
}

/**
 * Injects the fake JWT into localStorage *before* the page JS runs, so the
 * app considers the user already authenticated and skips the login screen.
 */
async function injectAuth(page: Page) {
  await page.addInitScript((token: string) => {
    localStorage.setItem('auth_token', token);
  }, FAKE_TOKEN);
}

// ---------------------------------------------------------------------------
// Test 1 – Login: wrong password shows an error message
// ---------------------------------------------------------------------------
test('1. login – wrong password shows an inline error', async ({ page }) => {
  // Simulate the server rejecting the password
  await page.route('**/api/login', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'סיסמה שגויה' }),
    }),
  );

  await page.goto('/', { waitUntil: 'networkidle' });
  await fillPassword(page, 'wrong-password');

  const submitBtn = page.getByRole('button', { name: 'כניסה' });
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();

  await expect(page.getByText('סיסמה שגויה')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 2 – Login: correct password navigates to the dashboard
// ---------------------------------------------------------------------------
test('2. login – correct password lands on the main dashboard', async ({ page }) => {
  // Server accepts the password and returns a valid JWT
  await page.route('**/api/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: FAKE_TOKEN }),
    }),
  );

  // The dashboard will call the SSE endpoint; return empty data so the test
  // doesn't depend on a running backend.
  await mockStream(page, []);

  await page.goto('/', { waitUntil: 'networkidle' });
  await fillPassword(page, 'any-valid-password');

  const submitBtn = page.getByRole('button', { name: 'כניסה' });
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();

  // After login the app renders the main header ("FinTrack" brand)
  await expect(page.getByText('FinTrack')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 3 – Transactions page renders mock transaction data
// ---------------------------------------------------------------------------
test('3. transactions page – displays mock business names', async ({ page }) => {
  await injectAuth(page);
  await mockStream(page);

  await page.goto('/transactions');

  // All three mock businesses must appear in the list
  await expect(page.getByText('שופרסל דיל')).toBeVisible();
  await expect(page.getByText('NETFLIX')).toBeVisible();
  await expect(page.getByText('מסעדת שגב')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 4 – Card filter: selecting "כאל" hides Isracard transactions
// ---------------------------------------------------------------------------
test('4. card filter – selecting כאל hides ישראכרט transactions', async ({ page }) => {
  await injectAuth(page);
  await mockStream(page);

  await page.goto('/transactions');

  // Wait for the transactions to appear before interacting with the filter
  await expect(page.getByText('NETFLIX')).toBeVisible();

  // Click the CAL card filter button
  await page.getByRole('button', { name: 'כאל' }).click();

  // CAL transaction stays visible
  await expect(page.getByText('שופרסל דיל')).toBeVisible();

  // Isracard transaction is hidden
  await expect(page.getByText('NETFLIX')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 5 – Search bar: typing filters the transaction list
// ---------------------------------------------------------------------------
test('5. search bar – typing filters transactions by business name', async ({ page }) => {
  await injectAuth(page);
  await mockStream(page);

  await page.goto('/transactions');

  // Wait for all transactions to render
  await expect(page.getByText('NETFLIX')).toBeVisible();

  // Type in the search box
  await page.getByPlaceholder('חיפוש עסקה...').fill('שופרסל');

  // The matching transaction is still visible …
  await expect(page.getByText('שופרסל דיל')).toBeVisible();

  // … but the unrelated one has been filtered out
  await expect(page.getByText('NETFLIX')).not.toBeVisible();
});
