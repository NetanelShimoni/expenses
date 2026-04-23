import { useState, useMemo, useCallback } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { fetchAIInsights } from '@/services/api';
import { getCurrentMonth, getMonthOptions, formatCurrency } from '@/utils';
import MonthPicker from '@/components/MonthPicker';
import type { AIInsights } from '@/types';

function getPreviousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(month: string): string {
  const opts = getMonthOptions();
  return opts.find((o) => o.value === month)?.label || month;
}

const TREND_ICONS: Record<string, string> = {
  up: '📈',
  down: '📉',
  same: '➡️',
  new: '🆕',
};

export default function InsightsPage() {
  const [month, setMonth] = useState(getCurrentMonth);
  const previousMonth = useMemo(() => getPreviousMonth(month), [month]);

  const { data: currentTxns, isLoading: loadingCurrent } = useTransactions(month);
  const { data: prevTxns, isLoading: loadingPrev } = useTransactions(previousMonth);

  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const canAnalyze = !!currentTxns && !!prevTxns && !loadingCurrent && !loadingPrev;

  const analyze = useCallback(async () => {
    if (!currentTxns || !prevTxns) return;
    setIsAnalyzing(true);
    setAiError(null);
    setInsights(null);
    try {
      const result = await fetchAIInsights(month, previousMonth, currentTxns, prevTxns);
      setInsights(result);
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentTxns, prevTxns, month, previousMonth]);

  const dataLoading = loadingCurrent || loadingPrev;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-24 pt-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
          🤖 תובנות AI
        </h2>
        <MonthPicker value={month} onChange={(m) => { setMonth(m); setInsights(null); }} />
      </div>

      {/* Comparison Header */}
      <div className="rounded-xl bg-gradient-to-l from-violet-500/10 to-indigo-500/10 px-4 py-3 dark:from-violet-500/20 dark:to-indigo-500/20">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          משווה: <span className="font-semibold">{getMonthLabel(month)}</span> (עד היום) מול{' '}
          <span className="font-semibold">אותה תקופה ב{getMonthLabel(previousMonth)}</span>
        </p>
        {!dataLoading && currentTxns && prevTxns && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {currentTxns.length} עסקאות החודש · {prevTxns.length} עסקאות בחודש הקודם (כל החודש)
          </p>
        )}
      </div>

      {/* Loading transactions */}
      {dataLoading && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary-500"></div>
          <p className="text-sm text-slate-500 dark:text-slate-400">טוען עסקאות...</p>
        </div>
      )}

      {/* Analyze Button */}
      {canAnalyze && !insights && !isAnalyzing && (
        <button
          onClick={analyze}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-violet-600 to-indigo-600 px-4 py-4 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
        >
          <span className="text-lg">✨</span>
          <span>נתח את ההוצאות שלי עם AI</span>
        </button>
      )}

      {/* Analyzing Spinner */}
      {isAnalyzing && (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white py-10 shadow-sm dark:bg-slate-900">
          <div className="relative">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-violet-200 border-t-violet-500"></div>
            <span className="absolute inset-0 flex items-center justify-center text-lg">🧠</span>
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            AI מנתח את ההוצאות שלך...
          </p>
          <p className="text-xs text-slate-400">זה לוקח כמה שניות</p>
        </div>
      )}

      {/* Error */}
      {aiError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/40 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">שגיאה בניתוח AI</p>
          <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/70">{aiError}</p>
          <button
            onClick={analyze}
            className="mt-2 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300"
          >
            נסה שוב
          </button>
        </div>
      )}

      {/* ===== Results ===== */}
      {insights && (
        <div className="space-y-4 animate-fade-in-up">
          {/* Card Fee Alert — TOP PRIORITY */}
          {insights.cardFeeAlert?.hasAlert && insights.cardFeeAlert.alerts?.length > 0 && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-4 shadow-md dark:border-amber-500/50 dark:bg-amber-900/20">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">⚠️</span>
                <h3 className="text-base font-bold text-amber-800 dark:text-amber-300">
                  התראת דמי כרטיס!
                </h3>
              </div>
              {insights.cardFeeAlert.alerts.map((alert, i) => (
                <div key={i} className="mt-2 rounded-lg bg-amber-100/50 px-3 py-2 dark:bg-amber-900/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
                      {alert.card === 'cal' ? 'כאל' : alert.card === 'isracard' ? 'ישראכרט' : alert.card}
                    </span>
                    <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                      {formatCurrency(alert.amount)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{alert.description}</p>
                  <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                    💡 {alert.recommendation}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Score + Summary */}
          <div className="rounded-xl bg-white px-4 py-4 shadow-sm dark:bg-slate-900">
            <div className="flex items-center gap-4">
              {/* Score Circle */}
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="5" />
                  <circle
                    cx="32" cy="32" r="28" fill="none"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${(insights.score / 100) * 175.9} 175.9`}
                    className={
                      insights.score >= 70 ? 'stroke-green-500' :
                      insights.score >= 40 ? 'stroke-amber-500' : 'stroke-red-500'
                    }
                  />
                </svg>
                <span className="absolute text-lg font-bold text-slate-800 dark:text-slate-200">
                  {insights.score}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {insights.summary}
                </p>
              </div>
            </div>
          </div>

          {/* Comparison */}
          <div className="rounded-xl bg-white px-4 py-4 shadow-sm dark:bg-slate-900">
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              📊 השוואה — אותה תקופה בחודש
            </h3>
            <div className="flex items-center gap-3">
              <div className={`rounded-lg px-3 py-2 text-center ${
                insights.comparison.totalDiff > 0
                  ? 'bg-red-50 dark:bg-red-900/20'
                  : 'bg-green-50 dark:bg-green-900/20'
              }`}>
                <span className={`text-lg font-bold ${
                  insights.comparison.totalDiff > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
                }`}>
                  {insights.comparison.totalDiff > 0 ? '↑' : '↓'}
                  {Math.abs(insights.comparison.totalDiffPercent).toFixed(1)}%
                </span>
              </div>
              <p className="flex-1 text-sm text-slate-600 dark:text-slate-400">
                {insights.comparison.text}
              </p>
            </div>
            {insights.comparison.isOverspending && (
              <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  ⚠️ אתה בגריעה — הוצאת יותר מאותה תקופה בחודש שעבר
                </p>
              </div>
            )}
          </div>

          {/* Previous Month Full + Projection */}
          <div className="grid grid-cols-2 gap-3">
            {insights.previousMonthFull && (
              <div className="rounded-xl bg-white px-3 py-3 shadow-sm dark:bg-slate-900">
                <p className="text-[11px] text-slate-400 dark:text-slate-500">כל החודש הקודם</p>
                <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-200">
                  {formatCurrency(insights.previousMonthFull.total)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                  {insights.previousMonthFull.text}
                </p>
              </div>
            )}
            {insights.projection && (
              <div className="rounded-xl bg-white px-3 py-3 shadow-sm dark:bg-slate-900">
                <p className="text-[11px] text-slate-400 dark:text-slate-500">הקרנה לסוף החודש</p>
                <p className={`mt-1 text-lg font-bold ${
                  insights.projection.estimatedTotal > (insights.previousMonthFull?.total || 0)
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
                }`}>
                  {formatCurrency(insights.projection.estimatedTotal)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                  {insights.projection.text}
                </p>
              </div>
            )}
          </div>

          {/* Category Insights */}
          {insights.categoryInsights?.length > 0 && (
            <div className="rounded-xl bg-white px-4 py-4 shadow-sm dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                📁 תובנות לפי קטגוריה
              </h3>
              <div className="space-y-2">
                {insights.categoryInsights.map((ci, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                    <span className="mt-0.5 shrink-0">{TREND_ICONS[ci.trend] || '📊'}</span>
                    <div>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {ci.category}
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ci.insight}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          {insights.tips?.length > 0 && (
            <div className="rounded-xl bg-white px-4 py-4 shadow-sm dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                💡 טיפים לחיסכון
              </h3>
              <ul className="space-y-2">
                {insights.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="mt-0.5 shrink-0 text-primary-500">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Re-analyze */}
          <button
            onClick={analyze}
            disabled={isAnalyzing}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-500 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <span>🔄</span>
            <span>נתח שוב</span>
          </button>
        </div>
      )}
    </div>
  );
}
