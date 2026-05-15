import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Login from '@/components/auth/Login';

/**
 * /auth - sign-in page for existing users. Signup is still handled by the
 * anonymous AI Visibility audit funnel.
 */
const Auth: React.FC = () => {
  const { user, loading, exchangeGoogleCode } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const handledGoogleCodeRef = useRef<string | null>(null);

  const googleError = searchParams.get('google');

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
        const postAuthRedirect = localStorage.getItem('postAuthRedirect');
        if (postAuthRedirect) {
          localStorage.removeItem('postAuthRedirect');
          navigate(postAuthRedirect, { replace: true });
          return;
        }
        navigate('/dashboard', { replace: true });
      } catch {
        if (cancelled) return;
        setSearchParams({ google: 'failed' }, { replace: true });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [exchangeGoogleCode, navigate, searchParams, setSearchParams]);

  useEffect(() => {
    if (user && !loading) {
      const postAuthRedirect = localStorage.getItem('postAuthRedirect');
      if (postAuthRedirect) {
        localStorage.removeItem('postAuthRedirect');
        navigate(postAuthRedirect);
        return;
      }
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (user) {
    return null;
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

          <div className="flex min-h-[560px] items-stretch lg:min-h-[638px]">
            <Login 
              onSwitchToRegister={() => navigate('/audit')} 
              externalError={
                googleError === 'not_found'
                  ? 'No account exists for that Google email. Start from the report signup flow to create one.'
                  : googleError
                    ? 'Google sign-in failed. Please try again.'
                    : undefined
              }
            />
          </div>
        </section>
      </main>
    </div>
  );
};

export default Auth;
