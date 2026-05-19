import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const VerifyEmailPending = () => {
  const { user, resendVerificationEmail, logout } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onResend = async () => {
    if (!user?.email || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await resendVerificationEmail(user.email);
      setMessage('Verification email sent. Check your inbox.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not resend');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] p-6">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 shadow-sm text-center">
        <h1 className="text-xl font-semibold text-[#444853]">Confirm your email</h1>
        <p className="mt-2 text-sm text-[#717885]">
          We sent a verification link to <strong>{user?.email ?? 'your inbox'}</strong>.
          Click the link to activate your account, then refresh this page.
        </p>

        {message && (
          <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {message}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={onResend} disabled={submitting}>
            {submitting ? 'Sending…' : 'Resend verification email'}
          </Button>
          <Button variant="ghost" onClick={() => logout()}>
            Use a different account
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPending;
