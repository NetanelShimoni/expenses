import express from 'express';
import cors from 'cors';
import { CompanyTypes, createScraper } from 'israeli-bank-scrapers';
import dotenv from 'dotenv';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json());

// Keep connections alive during long scraping operations
app.use((req, res, next) => {
  res.setTimeout(180000); // 3 min
  next();
});

const PORT = process.env.SERVER_PORT || 3001;

// ---- Auth config ----
const JWT_SECRET = process.env.JWT_SECRET;
const PASSWORD_HASH = process.env.PASSWORD_HASH;

if (!JWT_SECRET || !PASSWORD_HASH) {
  console.warn('[Auth] WARNING: JWT_SECRET or PASSWORD_HASH not set. Auth will reject all requests.');
}

// Auth middleware — checks Bearer token
function authMiddleware(req, res, next) {
  // Allow login and ping/health without auth
  if (req.path === '/api/login' || req.path === '/api/ping' || req.path === '/api/health') {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'לא מחובר. נדרשת הזדהות.' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'טוקן לא תקין או פג תוקף.' });
  }
}

app.use(authMiddleware);

// ---- Login endpoint ----
app.post('/api/login', async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'חסרה סיסמה.' });
  }
  try {
    const match = await bcrypt.compare(password, PASSWORD_HASH);
    if (!match) {
      return res.status(401).json({ error: 'סיסמה שגויה.' });
    }
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'שגיאת שרת.' });
  }
});

// ---- Category classification ----
const CATEGORY_KEYWORDS = {
  'מזון': ['שופרסל', 'רמי לוי', 'יוחננוף', 'אושר עד', 'מחסני', 'קפה', 'מקדונלד', 'דומינו', 'פיצה', 'מסעדה', 'סושי', 'בורגר', 'אוכל', 'מזון', 'סופר', 'מאפ', 'בייקר', 'קונדיטוריה', 'ברד', 'פלאפל', 'שווארמה', 'חומוס', 'KFC', 'MCDONALD', 'ויקטורי', 'mega', 'מגה'],
  'תחבורה': ['סונול', 'פז', 'דלק', 'רכבת', 'מונית', 'גט', 'bolt', 'דור אלון', 'ten', 'אלון', 'חניה', 'חנייה', 'parking', 'רב קו', 'אגד', 'דן', 'GETT', 'BOLT'],
  'קניות': ['זארה', 'H&M', 'קסטרו', 'פוקס', 'איקאה', 'עלי אקספרס', 'אמזון', 'AMAZON', 'ALIEXPRESS', 'IKEA', 'ZARA', 'SHEIN', 'שיין', 'TEMU', 'טמו', 'נייק', 'NIKE'],
  'בילויים': ['סינמה', 'יס פלנט', 'נטפליקס', 'ספוטיפיי', 'NETFLIX', 'SPOTIFY', 'HOT', 'YES', 'APPLE.COM', 'GOOGLE', 'DISNEY', 'קולנוע', 'סרט'],
  'חשבונות': ['חשמל', 'מים', 'ארנונה', 'אינטרנט', 'פלאפון', 'ביטוח', 'סלקום', 'פרטנר', 'HOT NET', 'בזק', 'cellcom', 'partner', 'bezeq', 'עירייה'],
  'בריאות': ['סופר-פארם', 'סופרפארם', 'בי פארם', 'מכבי', 'כללית', 'מאוחדת', 'לאומית', 'בית מרקחת', 'פארם', 'SUPER-PHARM', 'כושר', 'gym', 'GYM'],
  'חינוך': ['אוניברסיטה', 'קורס', 'ספרים', 'אודמי', 'UDEMY', 'COURSERA', 'מכללה', 'בית ספר'],
};

function classifyCategory(description) {
  const lower = (description || '').toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  return 'אחר';
}

// ---- Detect Chrome path for Puppeteer ----
function findChromePath() {
  // 1. Check PUPPETEER_EXECUTABLE_PATH env var
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  // 2. Try common Render/Linux paths
  const commonPaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  for (const p of commonPaths) {
    if (existsSync(p)) return p;
  }
  // 3. Try puppeteer's cache inside the project (.puppeteerrc.cjs config)
  const projectCache = resolve(__dirname, '..', '.cache', 'puppeteer');
  try {
    const result = execSync(`find "${projectCache}" -name chrome -type f 2>/dev/null || find /opt/render/.cache/puppeteer -name chrome -type f 2>/dev/null || true`, { encoding: 'utf8' }).trim();
    if (result) return result.split('\n')[0];
  } catch { /* ignore */ }
  // 4. Return undefined — puppeteer will use its default
  return undefined;
}

const CHROME_PATH = findChromePath();
if (CHROME_PATH) {
  console.log(`[Chrome] Found at: ${CHROME_PATH}`);
} else {
  console.log('[Chrome] No custom path found, using puppeteer default');
}

// ---- Scraper functions ----

async function scrapeIsracard(startDate) {
  console.log('[Isracard] Starting scrape...');
  const start = Date.now();

  const options = {
    companyId: CompanyTypes.isracard,
    startDate,
    combineInstallments: false,
    showBrowser: false,
    timeout: 120000,
    defaultTimeout: 120000,
    ...(CHROME_PATH && { executablePath: CHROME_PATH, args: ['--no-sandbox', '--disable-setuid-sandbox'] }),
  };

  const credentials = {
    id: process.env.ISRACARD_ID,
    card6Digits: process.env.ISRACARD_CARD6,
    password: process.env.ISRACARD_PASSWORD,
  };

  if (!credentials.id || !credentials.card6Digits || !credentials.password) {
    throw new Error('Missing Isracard credentials in .env');
  }

  const scraper = createScraper(options);
  const result = await scraper.scrape(credentials);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Isracard] Scrape completed in ${elapsed}s - success: ${result.success}`);

  if (!result.success) {
    throw new Error(`Isracard scrape failed: ${result.errorType} - ${result.errorMessage}`);
  }

  return result;
}

async function scrapeCal(startDate) {
  console.log('[CAL] Starting scrape...');
  const start = Date.now();

  const options = {
    companyId: CompanyTypes.visaCal,
    startDate,
    combineInstallments: false,
    showBrowser: false,
    timeout: 120000,
    defaultTimeout: 120000,
    ...(CHROME_PATH && { executablePath: CHROME_PATH, args: ['--no-sandbox', '--disable-setuid-sandbox'] }),
  };

  const credentials = {
    username: process.env.CAL_USERNAME,
    password: process.env.CAL_PASSWORD,
  };

  if (!credentials.username || !credentials.password) {
    throw new Error('Missing CAL credentials in .env');
  }

  const scraper = createScraper(options);
  const result = await scraper.scrape(credentials);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[CAL] Scrape completed in ${elapsed}s - success: ${result.success}`);

  if (!result.success) {
    throw new Error(`CAL scrape failed: ${result.errorType} - ${result.errorMessage}`);
  }

  return result;
}

// ---- Map scraper data to Transaction format ----

function mapTransactions(scrapeResult, cardType, monthFilter) {
  const transactions = [];
  const [filterYear, filterMonth] = monthFilter.split('-').map(Number);

  for (const account of scrapeResult.accounts) {
    for (const txn of account.txns) {
      const d = new Date(txn.date);
      // Filter by requested month
      if (d.getMonth() + 1 !== filterMonth || d.getFullYear() !== filterYear) {
        continue;
      }

      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const amount = Math.abs(txn.chargedAmount);
      const business = txn.description || 'לא ידוע';

      // Use the scraper's native category if available, otherwise classify by keywords
      // If no native category and keyword classification returns 'אחר', mark as 'לא סווג'
      const nativeCategory = txn.category && txn.category.trim() ? txn.category.trim() : null;
      const keywordCategory = classifyCategory(business);
      const category = nativeCategory || keywordCategory;
      const originalCurrency = txn.originalCurrency || '₪';

      transactions.push({
        id: `${cardType}-${dateStr}-${transactions.length}-${Math.random().toString(36).substring(2, 7)}`,
        date: dateStr,
        amount,
        business,
        category,
        card: cardType,
        originalCurrency,
      });
    }
  }

  return transactions;
}

// ---- In-memory cache ----
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCacheKey(card, month) {
  return `${card}-${month}`;
}

function getCached(card, month) {
  const key = getCacheKey(card, month);
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    console.log(`[Cache] HIT for ${key}`);
    return entry;
  }
  if (entry) {
    cache.delete(key);
  }
  return null;
}

function invalidateCache(card, month) {
  if (card === 'all') {
    cache.delete(getCacheKey('cal', month));
    cache.delete(getCacheKey('isracard', month));
  } else {
    cache.delete(getCacheKey(card, month));
  }
  console.log(`[Cache] Invalidated ${card} for ${month}`);
}

function setCache(card, month, data) {
  const key = getCacheKey(card, month);
  cache.set(key, { data, timestamp: Date.now() });
  console.log(`[Cache] SET for ${key} (${data.length} transactions)`);
}

// ---- API Routes ----

/**
 * GET /api/transactions?month=YYYY-MM&card=all|cal|isracard
 * 
 * Scrapes both cards in PARALLEL when card=all.
 * Each scrape takes ~6+ seconds, so parallel execution saves significant time.
 */
app.get('/api/transactions', async (req, res) => {
  const { month, card = 'all', forceRefresh, refreshCard } = req.query;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
  }

  // If forceRefresh requested, invalidate cache first.
  // If refreshCard is provided (e.g. 'cal' or 'isracard'), only invalidate that one
  // — keeps the other card's cached data intact so we don't re-scrape it unnecessarily.
  if (forceRefresh === 'true') {
    const cardToInvalidate = (refreshCard === 'cal' || refreshCard === 'isracard') ? refreshCard : card;
    invalidateCache(cardToInvalidate, month);
    console.log(`[API] Force refresh requested for ${cardToInvalidate} / ${month}`);
  }

  console.log(`\n[API] GET /api/transactions - month: ${month}, card: ${card}`);
  const startTime = Date.now();

  // Calculate start date (first day of month)
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);

  try {
    let allTransactions = [];

    const cacheInfo = {};
    const scraperErrors = [];

    if (card === 'all') {
      // ===== PARALLEL SCRAPING — both at the same time! =====
      const cachedCal = getCached('cal', month);
      const cachedIsracard = getCached('isracard', month);

      const promises = [];
      const labels = [];

      if (!cachedCal) {
        promises.push(
          scrapeCal(startDate)
            .then((result) => {
              const txns = mapTransactions(result, 'cal', month);
              setCache('cal', month, txns);
              cacheInfo.cal = { fromCache: false, cachedAt: Date.now() };
              return txns;
            })
            .catch((err) => {
              console.error('[CAL] Error:', err.message);
              scraperErrors.push({ card: 'cal', message: err.message });
              return []; // Don't fail everything if one card fails
            })
        );
        labels.push('cal');
      } else {
        promises.push(Promise.resolve(cachedCal.data));
        cacheInfo.cal = { fromCache: true, cachedAt: cachedCal.timestamp };
        labels.push('cal (cached)');
      }

      if (!cachedIsracard) {
        promises.push(
          scrapeIsracard(startDate)
            .then((result) => {
              const txns = mapTransactions(result, 'isracard', month);
              setCache('isracard', month, txns);
              cacheInfo.isracard = { fromCache: false, cachedAt: Date.now() };
              return txns;
            })
            .catch((err) => {
              console.error('[Isracard] Error:', err.message);
              scraperErrors.push({ card: 'isracard', message: err.message });
              return []; // Don't fail everything if one card fails
            })
        );
        labels.push('isracard');
      } else {
        promises.push(Promise.resolve(cachedIsracard.data));
        cacheInfo.isracard = { fromCache: true, cachedAt: cachedIsracard.timestamp };
        labels.push('isracard (cached)');
      }

      console.log(`[API] Scraping in parallel: [${labels.join(', ')}]`);
      const results = await Promise.all(promises);
      allTransactions = results.flat();

    } else if (card === 'cal') {
      const cached = getCached('cal', month);
      if (cached) {
        allTransactions = cached.data;
        cacheInfo.cal = { fromCache: true, cachedAt: cached.timestamp };
      } else {
        try {
          const result = await scrapeCal(startDate);
          allTransactions = mapTransactions(result, 'cal', month);
          setCache('cal', month, allTransactions);
          cacheInfo.cal = { fromCache: false, cachedAt: Date.now() };
        } catch (err) {
          console.error('[CAL] Error:', err.message);
          scraperErrors.push({ card: 'cal', message: err.message });
        }
      }

    } else if (card === 'isracard') {
      const cached = getCached('isracard', month);
      if (cached) {
        allTransactions = cached.data;
        cacheInfo.isracard = { fromCache: true, cachedAt: cached.timestamp };
      } else {
        try {
          const result = await scrapeIsracard(startDate);
          allTransactions = mapTransactions(result, 'isracard', month);
          setCache('isracard', month, allTransactions);
          cacheInfo.isracard = { fromCache: false, cachedAt: Date.now() };
        } catch (err) {
          console.error('[Isracard] Error:', err.message);
          scraperErrors.push({ card: 'isracard', message: err.message });
        }
      }
    }

    // Sort by date descending
    allTransactions.sort((a, b) => b.date.localeCompare(a.date));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[API] Response: ${allTransactions.length} transactions in ${elapsed}s`);

    const fromCache = Object.values(cacheInfo).some((c) => c.fromCache);
    const oldestCachedAt = Object.values(cacheInfo)
      .filter((c) => c.fromCache)
      .reduce((oldest, c) => Math.min(oldest, c.cachedAt), Infinity);

    res.json({
      transactions: allTransactions,
      cache: {
        fromCache,
        cachedAt: fromCache ? oldestCachedAt : null,
        details: cacheInfo,
      },
      scraperErrors: scraperErrors.length > 0 ? scraperErrors : undefined,
    });
  } catch (err) {
    console.error('[API] Fatal error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/ping — lightweight health-check for polling
 */
app.get('/api/ping', (_req, res) => {
  res.status(200).send('OK');
});

/**
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    cacheSize: cache.size,
    env: {
      hasIsracardCreds: !!(process.env.ISRACARD_ID && process.env.ISRACARD_CARD6 && process.env.ISRACARD_PASSWORD),
      hasCalCreds: !!(process.env.CAL_USERNAME && process.env.CAL_PASSWORD),
    }
  });
});

/**
 * POST /api/cache/clear
 */
app.post('/api/cache/clear', (req, res) => {
  cache.clear();
  console.log('[Cache] Cleared');
  res.json({ status: 'cleared' });
});

// ---- AI Insights ----

/**
 * POST /api/ai/insights
 * Body: { currentMonth: "YYYY-MM", previousMonth: "YYYY-MM", currentTransactions: [...], previousTransactions: [...] }
 * 
 * Uses Groq LLM to generate insights comparing two months + detect card fees.
 */
app.post('/api/ai/insights', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured in .env' });
  }

  const { currentMonth, previousMonth, currentTransactions, previousTransactions } = req.body;

  if (!currentTransactions || !previousTransactions) {
    return res.status(400).json({ error: 'Missing transaction data' });
  }

  // Determine today's day-of-month for partial comparison
  const today = new Date();
  const [curYear, curMonthNum] = currentMonth.split('-').map(Number);
  const isCurrentMonth = today.getFullYear() === curYear && today.getMonth() + 1 === curMonthNum;
  const dayOfMonth = isCurrentMonth ? today.getDate() : 31; // If viewing past month, use all days

  console.log(`[AI] Generating insights: ${currentMonth} (day ${dayOfMonth}) vs ${previousMonth} (${currentTransactions.length} + ${previousTransactions.length} txns)`);

  // Build summary data to send to AI (don't send raw data — summarize it)
  function summarize(txns) {
    const total = txns.reduce((s, t) => s + t.amount, 0);
    const byCategory = {};
    const byCard = {};
    const cardFees = [];

    for (const t of txns) {
      const cat = t.category || 'אחר';
      byCategory[cat] = (byCategory[cat] || 0) + t.amount;

      const card = t.card || 'unknown';
      byCard[card] = (byCard[card] || 0) + t.amount;

      // Detect card fees
      const desc = (t.business || '').toLowerCase();
      if (
        desc.includes('דמי כרטיס') ||
        desc.includes('עמלת כרטיס') ||
        desc.includes('דמי שימוש') ||
        desc.includes('דמי ניהול') ||
        desc.includes('card fee') ||
        desc.includes('עמלה שנתית') ||
        desc.includes('דמי חבר') ||
        desc.includes('membership') ||
        desc.includes('annual fee')
      ) {
        cardFees.push({ business: t.business, amount: t.amount, card: t.card, date: t.date });
      }
    }

    return { total: Math.round(total * 100) / 100, byCategory, byCard, count: txns.length, cardFees };
  }

  // Split previous month: same period (1..dayOfMonth) vs full month
  const prevSamePeriod = previousTransactions.filter((t) => {
    const d = new Date(t.date);
    return d.getDate() <= dayOfMonth;
  });

  const currentSummary = summarize(currentTransactions);
  const prevSamePeriodSummary = summarize(prevSamePeriod);
  const prevFullSummary = summarize(previousTransactions);

  const prompt = `אתה יועץ פיננסי אישי חכם. נתח את ההוצאות שלי והחזר תובנות בעברית.

חשוב! אנחנו נמצאים ביום ${dayOfMonth} בחודש ${currentMonth}.
ההשוואה צריכה להיות בין הימים 1-${dayOfMonth} של החודש הנוכחי לעומת הימים 1-${dayOfMonth} של החודש הקודם.

=== חודש נוכחי (${currentMonth}) — ימים 1 עד ${dayOfMonth} ===
סה"כ הוצאות: ₪${currentSummary.total.toLocaleString()}
מספר עסקאות: ${currentSummary.count}
פילוח לפי קטגוריה: ${JSON.stringify(currentSummary.byCategory)}
פילוח לפי כרטיס: ${JSON.stringify(currentSummary.byCard)}
${currentSummary.cardFees.length > 0 ? `⚠️ דמי כרטיס שזוהו: ${JSON.stringify(currentSummary.cardFees)}` : 'לא זוהו דמי כרטיס החודש'}

=== חודש קודם (${previousMonth}) — אותה תקופה (ימים 1 עד ${dayOfMonth}) ===
סה"כ הוצאות באותה תקופה: ₪${prevSamePeriodSummary.total.toLocaleString()}
מספר עסקאות באותה תקופה: ${prevSamePeriodSummary.count}
פילוח לפי קטגוריה (אותה תקופה): ${JSON.stringify(prevSamePeriodSummary.byCategory)}

=== חודש קודם (${previousMonth}) — סה"כ כל החודש ===
סה"כ הוצאות בכל החודש: ₪${prevFullSummary.total.toLocaleString()}
מספר עסקאות בכל החודש: ${prevFullSummary.count}
פילוח לפי קטגוריה (כל החודש): ${JSON.stringify(prevFullSummary.byCategory)}
פילוח לפי כרטיס (כל החודש): ${JSON.stringify(prevFullSummary.byCard)}
${prevFullSummary.cardFees.length > 0 ? `⚠️ דמי כרטיס שזוהו בחודש הקודם: ${JSON.stringify(prevFullSummary.cardFees)}` : ''}

=== הנחיות ===
החזר תשובה בפורמט JSON בלבד (ללא markdown, ללא backticks) עם המבנה הבא:
{
  "summary": "סיכום קצר של מצב ההוצאות — האם אנחנו בקצב גבוה/נמוך יותר מחודש שעבר",
  "comparison": {
    "totalDiff": מספר (הפרש בשקלים בין אותה תקופה, חיובי = הוצאנו יותר),
    "totalDiffPercent": מספר (הפרש באחוזים),
    "text": "טקסט השוואה: כמה הוצאנו עד עכשיו לעומת אותה תקופה בחודש שעבר",
    "isOverspending": true/false (האם אנחנו בגריעה — הוצאנו יותר מאותה תקופה בחודש שעבר)
  },
  "previousMonthFull": {
    "total": מספר (סה"כ הוצאות כל החודש הקודם),
    "text": "סיכום קצר של כל החודש הקודם"
  },
  "projection": {
    "estimatedTotal": מספר (הערכה כמה נוציא עד סוף החודש הנוכחי לפי הקצב הנוכחי),
    "text": "טקסט הסבר על ההקרנה"
  },
  "categoryInsights": [
    { "category": "שם קטגוריה", "insight": "תובנה על הקטגוריה — השוואה בין אותה תקופה", "trend": "up" | "down" | "same" | "new" }
  ],
  "cardFeeAlert": {
    "hasAlert": true/false,
    "alerts": [
      { "card": "cal/isracard", "description": "תיאור", "amount": מספר, "recommendation": "המלצה" }
    ]
  },
  "tips": ["טיפ 1", "טיפ 2", "טיפ 3"],
  "score": מספר 1-100 (ציון ניהול פיננסי — 100 = מצוין)
}

חשוב:
- ההשוואה הראשית חייבת להיות בין אותה תקופה (ימים 1-${dayOfMonth}) בשני החודשים
- ציין בבירור אם אנחנו בגריעה (הוצאנו יותר מאותה תקופה בחודש שעבר) או בעודף
- תן הקרנה כמה נוציא עד סוף החודש בקצב הנוכחי
- ציין כמה הוצאנו בסה"כ בכל החודש הקודם
- אם זוהו דמי כרטיס, תתריע בבירור ותמליץ לבדוק אם אפשר לבטל
- השווה קטגוריות בין אותה תקופה ותן תובנות על שינויים חריגים
- תן טיפים פרקטיים לחיסכון על בסיס הדאטה
- החזר JSON תקין בלבד`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'אתה עוזר פיננסי שמחזיר תשובות בפורמט JSON בלבד. בעברית.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error('[AI] Groq API error:', groqRes.status, errBody);
      return res.status(502).json({ error: `Groq API error: ${groqRes.status}` });
    }

    const groqData = await groqRes.json();
    const content = groqData.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: 'Empty response from Groq' });
    }

    console.log('[AI] Got response from Groq, parsing...');

    // Parse JSON response
    let insights;
    try {
      insights = JSON.parse(content);
    } catch {
      console.error('[AI] Failed to parse Groq response:', content);
      return res.status(502).json({ error: 'Invalid JSON from AI', raw: content });
    }

    // Also check for card fees ourselves (in case LLM missed some)
    const allCardFees = [...currentSummary.cardFees, ...prevFullSummary.cardFees];
    if (allCardFees.length > 0 && !insights.cardFeeAlert?.hasAlert) {
      insights.cardFeeAlert = {
        hasAlert: true,
        alerts: allCardFees.map((f) => ({
          card: f.card,
          description: f.business,
          amount: f.amount,
          recommendation: 'בדוק אם ניתן לבטל את דמי הכרטיס או לעבור לכרטיס ללא עמלה',
        })),
      };
    }

    res.json(insights);
  } catch (err) {
    console.error('[AI] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve the dashboard static build in production
const dashboardDist = resolve(__dirname, '..', 'finance-dashboard', 'dist');
if (existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get('{*path}', (req, res) => {
    res.sendFile(join(dashboardDist, 'index.html'));
  });
  console.log('[Server] Serving dashboard from', dashboardDist);
}

app.listen(PORT, () => {
  console.log(`\n🏦  Bank Scraper Server running on http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`   GET  /api/transactions?month=YYYY-MM&card=all|cal|isracard`);
  console.log(`   GET  /api/health`);
  console.log(`   POST /api/cache/clear\n`);
});
