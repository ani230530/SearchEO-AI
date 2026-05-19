import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

const ResetPassword = () => {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const token = search.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Mirror the backend policy (8 chars, letter + number) so the user gets
  // feedback before submission instead of round-tripping for it.
  const policyError = useMemo(() => {
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return 'Password must include a letter and a number';
    }
    if (password !== confirm) return 'Passwords do not match';
    return null;
  }, [password, confirm]);

  useEffect(() => {
    if (!token) setError('Missing reset token — please use the link from your email.');
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (policyError || submitting || !token) return;
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/auth?reset=success', { replace: true }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] p-6">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[#444853]">Reset your password</h1>
        <p className="mt-1 text-sm text-[#717885]">
          Choose a new password for your account.
        </p>

        {done ? (
          <p className="mt-6 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Password reset. Redirecting to sign in…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs font-semibold">
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs font-semibold">
                Confirm password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {(error || (password && policyError)) && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error ?? policyError}
              </p>
            )}

            <Button
              type="submit"
              disabled={Boolean(policyError) || submitting || !token}
              className="w-full"
              style={{ background: 'linear-gradient(90deg, #2D4059 0%, #4C74C2 100%)' }}
            >
              {submitting ? 'Resetting…' : 'Reset password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
