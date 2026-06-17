import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { login } from '@/services/api';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    try {
      await login(password);
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4" style={{
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    }}>
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-600/10 blur-3xl" />
      </div>

      <div className="animate-scale-in relative w-full max-w-sm">
        {/* Glass card */}
        <div className="rounded-3xl border border-white/10 bg-white/8 p-8 shadow-2xl backdrop-blur-2xl" style={{ background: 'rgba(255,255,255,0.07)' }}>
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl shadow-xl" style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: '0 0 40px rgba(99,102,241,0.5), 0 8px 32px rgba(0,0,0,0.3)',
            }}>
              <span className="text-3xl">💳</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">FinTrack</h1>
            <p className="mt-1.5 text-sm text-white/50">ניהול פיננסי חכם</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="הזן סיסמה"
                autoFocus
                dir="rtl"
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 pr-4 pl-12 text-white placeholder-white/30 backdrop-blur-sm transition-all focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-right text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="relative w-full overflow-hidden rounded-2xl py-3.5 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                boxShadow: '0 4px 24px rgba(99,102,241,0.4)',
              }}
            >
              {loading ? (
                <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                'כניסה'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
