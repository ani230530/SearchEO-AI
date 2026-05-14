/**
 * Step 3 of the anonymous audit funnel — the signup wall.
 *
 * The signup form here REPLACES the legacy Register.tsx component. There
 * is no longer a path in the app that renders a bare signup form outside
 * of this flow; an existing user who lands here can switch to the login
 * page via the "Already have an account?" link, but new accounts are
 * only ever created in the context of an in-flight audit.
 *
 * On successful registration:
 *   1. AuthContext.register() POSTs to /api/auth/register with the
 *      anonymous wizard cookie attached (credentials: 'include').
 *   2. The backend's maybeLinkWizardSession reads the cookie, materializes
 *      a Domain shell for this new user, clears the cookie, returns
 *      { wizardLink: { primaryDomainId } } on the response.
 *   3. We surface primaryDomainId back to the orchestrator via onRegistered,
 *      which redirects into the dashboard for the just-bound report.
 *
 * Design system: same rounded-3xl border-gray-100 card. Inputs follow
 * the dashboard's neutral-50 → focus:white pattern from
 * AnalyticsIntegrationSection's GA4 ID input. Primary button is the
 * navy bg-[#2D4059]. No floating labels, no Apple chrome — plain stack
 * matching the rest of the dashboard.
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from 'lucide-react';

import { useAuth, type RegisterResult } from '@/contexts/AuthContext';

import type { DomainSnapshot } from './types';

interface SignupWallStepProps {
  snapshot: DomainSnapshot;
  /** Fired after a successful POST /api/auth/register. The orchestrator
   *  redirects based on wizardLink.primaryDomainId. */
  onRegistered: (result: RegisterResult) => void;
}

export function SignupWallStep({ snapshot, onRegistered }: SignupWallStepProps) {
  const { register, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
    if (password !== confirm) {
      setError('Passwords do not match.');
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

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
          <Lock className="h-6 w-6 text-gray-500" />
        </div>
        <div>
          <h2 className="text-2xl font-light text-black tracking-tight">
            Sign up to see your report
          </h2>
          <p className="text-sm font-light text-gray-600">
            We&apos;ll attach your {snapshot.host} audit to the new account.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
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

        <div>
          <label className="text-sm font-medium text-gray-900 mb-2 block">
            Confirm password <span className="text-red-700">*</span>
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter your password"
            disabled={loading}
            required
            className="w-full h-12 px-4 text-sm rounded-md border border-neutral-200 bg-neutral-50 focus:bg-white focus:border-black/20 focus:ring-4 focus:ring-black/5 outline-none transition-all placeholder:text-neutral-400 font-light"
          />
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
              Create account &amp; view report
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs font-light text-gray-500">
          <span>
            Already have an account?{' '}
            <Link to="/auth" className="text-[#2D4059] underline-offset-2 hover:underline">
              Sign in
            </Link>
          </span>
          <span>
            By signing up you agree to our Terms &amp; Privacy.
          </span>
        </div>
      </form>
    </div>
  );
}
