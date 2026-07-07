/**
 * Signup wall — modal shown when an anonymous user hits the Step 4 →
 * Step 5 boundary (the "Run AI Analysis" click).
 *
 * Server gate
 * -----------
 * The actual gate lives on the backend: POST /api/wizard/domain/:id/run
 * returns 402 with `code: SIGNUP_REQUIRED` when the caller has no JWT.
 * This modal is just the UX surface — it short-circuits the click on
 * the frontend so the user doesn't see a transient SSE error before
 * being asked to sign up.
 *
 * On success
 * ----------
 * AuthContext.register POSTs to /api/auth/register with
 * `credentials: 'include'`, attaching the anonymous wizard cookie. The
 * backend's maybeLinkWizardSession reads the cookie, transfers Domain
 * ownership from the shadow user to the real new user, clears the
 * cookie, returns wizardLink.primaryDomainId. The modal's parent then
 * advances to Step 5; the next request carries the new Bearer token
 * and the run proceeds.
 *
 * Design system: dashboard tokens. rounded-3xl card, bg-[#2D4059]
 * primary button, neutral-50 → focus:white inputs, red-50 error pills.
 */

import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, X } from 'lucide-react';

import { useAuth, type RegisterResult } from '@/contexts/AuthContext';
import { saveGoogleSignupResume } from './googleSignupResume';

interface SignupWallModalProps {
  /** Host being audited — shown in the headline copy so the wall feels
   *  contextual. Optional; falls back to "your site". */
  host?: string;
  /** Close handler — dismisses the modal without signing up. The wizard
   *  stays on Step 4 with the user's prompt selections intact. */
  onClose: () => void;
  /** Domain currently being audited. Persisted before Google redirect so
   *  the wizard can resume after returning from the OAuth round-trip. */
  resumeDomainId?: number | null;
  /** Fired after successful registration. The wizard advances to Step 5;
   *  the parent passes through wizardLink so a redirect can target the
   *  bound Domain id if needed. */
  onRegistered: (result: RegisterResult) => void;
}

export function SignupWallModal({ host, onClose, resumeDomainId, onRegistered }: SignupWallModalProps) {
  const { register, startGoogleAuth, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and a password to continue.');
      return;
    }
    if (!trimmedEmail.includes('@')) {
      setError('That email address does not look right.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      const result = await register(trimmedEmail, password, name || undefined);
      localStorage.setItem('lastLoginEmail', trimmedEmail);
      onRegistered(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed.';
      if (/already exists/i.test(message)) {
        setError(
          'An account with this email already exists. Sign in to attach this audit to it.'
        );
        return;
      }
      setError(message);
    }
  };

  const onGoogleSignup = async () => {
    setError(null);
    try {
      saveGoogleSignupResume(resumeDomainId);
      await startGoogleAuth('signup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign up failed.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-wall-title"
    >
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-700 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 pr-8">
          <h2 id="signup-wall-title" className="text-2xl font-light text-black tracking-tight mb-2">
            Sign up to see your report
          </h2>
          <p className="text-sm font-light text-gray-600">
            We&apos;ll attach your{' '}
            {host ? <span className="font-medium">{host}</span> : 'site\'s'} audit to the new
            account and run your AI Visibility analysis next.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <button
            type="button"
            onClick={onGoogleSignup}
            disabled={loading}
            className="h-12 px-6 w-full inline-flex items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <img src="/google.svg" alt="" aria-hidden="true" className="h-4 w-4" />
            Continue with Google
          </button>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs font-light text-neutral-400">or</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-900 mb-2 block">
              Full name <span className="text-gray-400 font-light">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              disabled={loading}
              className="w-full h-12 px-4 text-sm rounded-md border border-neutral-200 bg-neutral-50 focus:bg-white focus:border-black/20 focus:ring-4 focus:ring-black/5 outline-none transition-all placeholder:text-neutral-400 font-light"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-900 mb-2 block">
              Email <span className="text-red-700">*</span>
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              disabled={loading}
              required
              className="w-full h-12 px-4 text-sm rounded-md border border-neutral-200 bg-neutral-50 focus:bg-white focus:border-black/20 focus:ring-4 focus:ring-black/5 outline-none transition-all placeholder:text-neutral-400 font-light"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-900 mb-2 block">
              Password <span className="text-red-700">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                disabled={loading}
                required
                className="w-full h-12 pl-4 pr-12 text-sm rounded-md border border-neutral-200 bg-neutral-50 focus:bg-white focus:border-black/20 focus:ring-4 focus:ring-black/5 outline-none transition-all placeholder:text-neutral-400 font-light"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-light text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-12 px-6 w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#2D4059] text-md font-medium text-white shadow-md hover:shadow-lg active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating your account…
              </>
            ) : (
              <>
                Create account &amp; run analysis
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <p className="text-xs font-light text-gray-500 text-center pt-1">
            Already have an account?{' '}
            <a href="/auth" className="text-[#2D4059] underline-offset-2 hover:underline">
              Sign in
            </a>{' '}
            · By signing up you agree to our Terms &amp; Privacy.
          </p>
        </form>
      </div>
    </div>
  );
}
