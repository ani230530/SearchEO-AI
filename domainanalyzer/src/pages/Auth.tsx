import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Login from '@/components/auth/Login';

/**
 * /auth — sign-in page for existing users. Signup no longer lives here;
 * the legacy Register component was removed when the anonymous AI
 * Visibility audit funnel became the single signup entry point. The
 * "switch to register" link on Login.tsx navigates to /audit instead.
 */
const Auth: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect if user is already authenticated
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

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-black border-t-transparent mx-auto"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is authenticated, don't render auth forms
  if (user) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-white">
      <style>{`
        .auth-header{position:fixed;top:0;left:0;right:0;padding:16px 24px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.72);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:0.5px solid rgba(0,0,0,0.1);z-index:50}
        .auth-brand{font-size:17px;font-weight:400;letter-spacing:-0.022em;color:#1d1d1f;text-decoration:none}
        .back-btn{position:absolute;left:12px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;color:#1d1d1f;background:transparent;border:1px solid rgba(0,0,0,0.08);transition:all .2s ease}
        .back-btn:hover{background:rgba(0,0,0,0.04)}
        .auth-container{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:120px 16px 40px}
        .accent-lines{position:fixed;inset:0;pointer-events:none;z-index:0}
        .hline,.vline{position:absolute;background:#d2d2d7;opacity:.6}
        .hline{height:1px;left:0;right:0;transform:scaleX(0);transform-origin:50% 50%;animation:drawX .8s cubic-bezier(.22,.61,.36,1) forwards}
        .hline:nth-child(1){top:20%;animation-delay:.15s}
        .hline:nth-child(2){top:50%;animation-delay:.28s}
        .hline:nth-child(3){top:80%;animation-delay:.41s}
        .vline{width:1px;top:0;bottom:0;transform:scaleY(0);transform-origin:50% 0%;animation:drawY .9s cubic-bezier(.22,.61,.36,1) forwards}
        .vline:nth-child(4){left:20%;animation-delay:.52s}
        .vline:nth-child(5){left:50%;animation-delay:.64s}
        .vline:nth-child(6){left:80%;animation-delay:.76s}
        @keyframes drawX{0%{transform:scaleX(0);opacity:0}60%{opacity:.9}100%{transform:scaleX(1);opacity:.6}}
        @keyframes drawY{0%{transform:scaleY(0);opacity:0}60%{opacity:.9}100%{transform:scaleY(1);opacity:.6}}
      `}</style>

      <header className="auth-header">
        <button
          type="button"
          className="back-btn"
          aria-label="Go back"
          onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/'); } }}
        >
          <ChevronLeft size={18} />
        </button>
        <a className="auth-brand" href="#" aria-label="AI Brand Analyzer">AI Brand Analyzer</a>
      </header>

      <div className="accent-lines" aria-hidden="true">
        <div className="hline" />
        <div className="hline" />
        <div className="hline" />
        <div className="vline" />
        <div className="vline" />
        <div className="vline" />
      </div>

      <main className="auth-container relative z-10">
        <div className="w-full max-w-md">
          {/* Signup is handled by /audit — Login's "switch to register"
              link routes there. We never render Register inline anymore. */}
          <Login onSwitchToRegister={() => navigate('/audit')} />
        </div>
      </main>
    </div>
  );
};

export default Auth; 
