import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Login from '@/components/auth/Login';

interface FromLocation {
  from?: { pathname?: string; search?: string; hash?: string };
}

/**
 * /auth - sign-in page for existing users. Signup is still handled by the
 * anonymous AI Visibility audit funnel.
 */
const Auth: React.FC = () => {
  const { user, loading, exchangeGoogleCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const handledGoogleCodeRef = useRef<string | null>(null);

  const googleError = searchParams.get('google');
  const googleReason = searchParams.get('reason');
  const verifiedStatus = searchParams.get('verified');
  const resetStatus = searchParams.get('reset');
  const isGoogleCallback = searchParams.has('googleCode');

  // Where to send the user after login completes. ProtectedRoute populates
  // `location.state.from` when a deep-link redirected here. Fall back to
  // the older localStorage flag, then /newdashboard.
  const computeRedirect = useMemo(() => {
    return (): string => {
      const fromState = (location.state as FromLocation | null)?.from;
      if (fromState?.pathname && fromState.pathname !== '/auth') {
        return `${fromState.pathname}${fromState.search ?? ''}${fromState.hash ?? ''}`;
      }
      const stored = localStorage.getItem('postAuthRedirect');
      if (stored) {
        localStorage.removeItem('postAuthRedirect');
        return stored;
      }
      return '/newdashboard';
    };
  }, [location.state]);

  useEffect(() => {
    const code = searchParams.get('googleCode');
    if (!code) return;
    if (handledGoogleCodeRef.current === code) return;
    handledGoogleCodeRef.current = code;

    let cancelled = false;
    const run = async () => {
      try {
        await exchangeGoogleCode(code);
        if (cancelled) return;
        navigate(computeRedirect(), { replace: true });
      } catch {
        if (cancelled) return;
        setSearchParams({ google: 'failed' }, { replace: true });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [exchangeGoogleCode, navigate, searchParams, setSearchParams, computeRedirect]);

  useEffect(() => {
    if (user && !loading && !isGoogleCallback) {
      navigate(computeRedirect(), { replace: true });
    }
  }, [user, loading, navigate, computeRedirect, isGoogleCallback]);

  // Short-lived banners — translation of the redirect query-string flags.
  const statusBanner = useMemo(() => {
    if (verifiedStatus === '1') return { kind: 'success' as const, text: 'Email verified. You can now sign in.' };
    if (verifiedStatus === 'expired') return { kind: 'error' as const, text: 'Verification link has expired. Request a new one after signing in.' };
    if (verifiedStatus === 'invalid') return { kind: 'error' as const, text: 'Verification link is invalid.' };
    if (resetStatus === 'success') return { kind: 'success' as const, text: 'Password reset. Sign in with your new password.' };
    return null;
  }, [verifiedStatus, resetStatus]);

  // Translate Google error reasons into something the user can act on.
  const googleErrorText = useMemo(() => {
    if (!googleError) return undefined;
    if (googleReason === 'state_mismatch') {
      return 'Sign-in could not be verified. Please try again from this device.';
    }
    if (googleReason === 'access_denied') {
      return 'You cancelled the Google sign-in. Try again when you\'re ready.';
    }
    return 'Google sign-in failed. Please try again.';
  }, [googleError, googleReason]);

  if (user) {
    return null;
  }

  if (isGoogleCallback) {
    return (
      <div className="min-h-screen bg-[#f7f7f8] px-4 py-8 sm:px-6 lg:px-8">
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <section className="grid w-full max-w-[1000px] overflow-hidden rounded-[14px] bg-white shadow-[0_22px_70px_rgba(17,24,39,0.12)] lg:grid-cols-[1fr_1fr]">
            <div className="hidden min-h-[638px] lg:block">
              <img
                src="/auth-side-visual.svg"
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex min-h-[560px] w-full flex-col px-6 py-9 sm:px-8 lg:min-h-[638px] lg:px-10">
              <div className="mx-auto flex h-full w-full max-w-[428px] flex-col items-center justify-center">
                <div className="w-full">
                  <div className="mb-10 flex flex-col items-center justify-center space-y-4">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#f4f4f5] border-t-[#2D4059]"></div>
                    <p className="text-[13px] font-medium text-[#717885]">Logging in with Google...</p>
                  </div>

                  {/* Skeleton that mimics the Login component */}
                  <div className="space-y-6 w-full opacity-60">
                    <div className="mb-5 space-y-3">
                      <div className="h-8 w-2/3 animate-pulse rounded bg-[#f4f4f5]"></div>
                      <div className="h-4 w-full animate-pulse rounded bg-[#f4f4f5]"></div>
                    </div>

                    <div className="h-8 w-full animate-pulse rounded-[5px] bg-[#f4f4f5]"></div>

                    <div className="my-5 flex w-full items-center gap-2">
                      <div className="h-px flex-1 bg-[#d9dce1]" />
                      <span className="shrink-0 text-[11px] font-normal leading-none text-[#9ca3af]">or</span>
                      <div className="h-px flex-1 bg-[#d9dce1]" />
                    </div>

                    <div className="space-y-4">
                      <div className="h-12 w-full animate-pulse rounded-[5px] bg-[#f4f4f5]"></div>
                      <div className="h-8 w-full animate-pulse rounded-[5px] bg-[#f4f4f5]"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8] px-4 py-8 sm:px-6 lg:px-8">
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <section className="grid w-full max-w-[1000px] overflow-hidden rounded-[14px] bg-white shadow-[0_22px_70px_rgba(17,24,39,0.12)] lg:grid-cols-[1fr_1fr]">
          <div className="hidden min-h-[638px] lg:block">
            <img
              src="/auth-side-visual.svg"
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="flex min-h-[560px] flex-col items-stretch lg:min-h-[638px]">
            {statusBanner && (
              <div
                className={`mx-6 mt-6 rounded-md px-3 py-2 text-sm ${
                  statusBanner.kind === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-800'
                }`}
              >
                {statusBanner.text}
              </div>
            )}
            <Login
              onSwitchToRegister={() => navigate('/audit')}
              externalError={googleErrorText}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

export default Auth;
