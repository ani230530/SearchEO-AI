import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Login from '@/components/auth/Login';

/**
 * /auth - sign-in page for existing users. Signup is still handled by the
 * anonymous AI Visibility audit funnel.
 */
const Auth: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

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
            />
          </div>
        </section>
      </main>
    </div>
  );
};

export default Auth;
