import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Input,
} from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';

const EMAIL_REGEX = /\S+@\S+\.\S+/;
const MOCK_DELAY_MS = 900;
const MESSAGE_TIMEOUT_MS = 3000;
const ACTION_BUTTON_STYLE = {
  background: 'linear-gradient(90deg, #2D4059 0%, #4C74C2 100%)',
  boxShadow: '0px 1px 2px 0px #0A0D120D',
};

type LoginStep = 'email' | 'password' | 'forgot-password';

interface LoginProps {
  onSwitchToRegister: () => void;
  onStepChange?: (step: LoginStep) => void;
  externalError?: string;
}

const Login: React.FC<LoginProps> = ({ onSwitchToRegister, onStepChange, externalError }) => {
  const { login, startGoogleAuth } = useAuth();
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedEmail = email.trim();
  const isEmailValid = useMemo(() => EMAIL_REGEX.test(trimmedEmail), [trimmedEmail]);
  const isPasswordValid = password.length >= 6;
  const isBusy = isSendingCode || isSubmittingPassword || isGoogleLoading || isResetting;

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!externalError) return;
    setErrorMessage(externalError);
    showErrorToast(externalError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalError]);

  const showTemporarySuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage(null);
    setToastMessage(null);

    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }

    successTimerRef.current = setTimeout(() => {
      setSuccessMessage(null);
    }, MESSAGE_TIMEOUT_MS);
  };

  const showErrorToast = (message: string) => {
    setToastMessage(message);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, MESSAGE_TIMEOUT_MS);
  };

  const handleContinue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isEmailValid || isBusy) return;

    setIsSendingCode(true);
    setErrorMessage(null);
    setToastMessage(null);

    // In a real app, we might check if user exists here
    // For now, just transition to password step
    window.setTimeout(() => {
      setStep('password');
      setPassword('');
      setSuccessMessage(null);
      setIsSendingCode(false);
    }, 400);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isPasswordValid || isBusy) return;

    setIsSubmittingPassword(true);
    setErrorMessage(null);
    setToastMessage(null);

    try {
      await login(trimmedEmail, password);
      showTemporarySuccess('Login successful!');
      // Redirect is handled by AuthContext/App level usually, 
      // but if not, it will be handled by the user state change
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setErrorMessage(message);
      showErrorToast(message);
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const handleGoogleLogin = () => {
    if (isBusy) return;

    const run = async () => {
      setIsGoogleLoading(true);
      setErrorMessage(null);
      setToastMessage(null);
      try {
        await startGoogleAuth('login');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Google sign-in failed';
        setErrorMessage(message);
        showErrorToast(message);
      } finally {
        setIsGoogleLoading(false);
      }
    };
    run();
  };

  const handleBackToEmail = () => {
    if (isBusy) return;

    setStep('email');
    setPassword('');
    setSuccessMessage(null);
    setErrorMessage(null);
    setToastMessage(null);
  };

  const getActionButtonClass = (enabled: boolean) =>
    `h-8 w-full rounded-[5px] text-xs font-medium text-white shadow-none transition-opacity ${
      enabled ? 'hover:opacity-95' : 'cursor-not-allowed bg-[#cfd2d6] opacity-100 hover:bg-[#cfd2d6]'
    }`;

  const renderHeader = () => (
    <div className="mb-5">
      <h1 className="text-[26px] font-semibold leading-tight text-[#444853]">
        {step === 'email' ? 'Great to see you again!' : 
         step === 'password' ? 'Welcome back!' : 
         'Sorry to hear that :('}
      </h1>
      <p className="mt-2 text-[13px] leading-5 text-[#717885]">
        {step === 'email'
          ? 'Log in to your account to continue where you left off.'
          : step === 'password'
          ? 'Please enter your password to access your dashboard.'
          : "We'll help you fix that. Enter your email to receive a password recovery key and regain access to your dashboard."}
      </p>
    </div>
  );

  const renderGoogleButton = () => {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleLogin}
        disabled={isBusy}
        className={`h-8 w-full rounded-[5px] border-0 bg-[#f4f4f5] text-[13px] font-medium text-[#6b7280] shadow-none hover:bg-[#eeeeef] hover:text-[#4b5563] ${
          isBusy ? 'cursor-not-allowed opacity-60' : ''
        }`}
      >
        {isGoogleLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Connecting...
          </>
        ) : (
          <>
            <img src="/google.svg" alt="" aria-hidden="true" className="mr-2 h-4 w-4" />
            Continue with Google
          </>
        )}
      </Button>
    );
  };

  const renderMessages = () => (
    <>
      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2">
          <p className="text-xs font-medium text-green-700">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs font-medium text-red-600">{errorMessage}</p>
        </div>
      )}
    </>
  );

  const renderFooterLinks = () => {
    return (
      <>
        <div className="my-5 flex w-full items-center gap-2">
          <div className="h-px flex-1 bg-[#d9dce1]" />
          <span className="shrink-0 text-[11px] font-normal leading-none text-[#9ca3af]">or</span>
          <div className="h-px flex-1 bg-[#d9dce1]" />
        </div>

        <div className="text-center text-[11px] leading-5 text-[#7b8491]">
          <span>Need an account? </span>
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="font-medium text-[#7fa6e6] transition-colors hover:text-[#4f7fd2]"
            disabled={isBusy}
          >
            Join the Team
          </button>
        </div>
      </>
    );
  };

  const renderEmailStep = () => {
    const canContinue = isEmailValid && !isBusy;

    return (
      <form onSubmit={handleContinue} className="mt-4 space-y-3">
        {renderMessages()}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="email" className="text-[11px] font-semibold text-[#4b5563]">
              Enter email <span className="text-red-500">*</span>
            </Label>
          </div>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setErrorMessage(null);
              setSuccessMessage(null);
              setToastMessage(null);
            }}
            placeholder="you@example.com"
            className="h-8 rounded-[5px] border-[#d9dce1] bg-white px-3 text-xs text-[#4b5563] shadow-none placeholder:text-[#c7cbd1] focus-visible:ring-1 focus-visible:ring-[#c8ccd2]"
            disabled={isBusy}
            autoComplete="email"
          />
        </div>

        <Button
          type="submit"
          disabled={!canContinue}
          className={getActionButtonClass(canContinue)}
          style={canContinue ? ACTION_BUTTON_STYLE : undefined}
        >
          {isSendingCode ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Processing...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </form>
    );
  };

  const renderForgotPasswordStep = () => {
    const canReset = isEmailValid && !isBusy;

    const handleResetSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canReset) return;

      setIsResetting(true);
      setErrorMessage(null);

      window.setTimeout(() => {
        showTemporarySuccess("Success! If your email exists in our system, you will receive a reset link shortly.");
        setIsResetting(false);
      }, MOCK_DELAY_MS);
    };

    return (
      <form onSubmit={handleResetSubmit} className="mt-4 space-y-4">
        {renderMessages()}

        <div className="space-y-1.5">
          <Label htmlFor="reset-email" className="text-[11px] font-semibold text-[#4b5563]">
            Enter email <span className="text-red-500">*</span>
          </Label>
          <Input
            id="reset-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setErrorMessage(null);
              setSuccessMessage(null);
              setToastMessage(null);
            }}
            placeholder="John@gmail.com"
            className="h-8 rounded-[5px] border-[#d9dce1] bg-white px-3 text-xs text-[#4b5563] shadow-none placeholder:text-[#c7cbd1] focus-visible:ring-1 focus-visible:ring-[#c8ccd2]"
            disabled={isBusy}
            autoComplete="email"
          />
        </div>

        <Button
          type="submit"
          disabled={!canReset}
          className={getActionButtonClass(canReset)}
          style={canReset ? ACTION_BUTTON_STYLE : undefined}
        >
          {isResetting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Processing...
            </>
          ) : (
            'Reset Password'
          )}
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setStep('email')}
            className="text-[11px] font-medium text-[#7fa6e6] transition-colors hover:text-[#4f7fd2]"
            disabled={isBusy}
          >
            Back to Login
          </button>
        </div>
      </form>
    );
  };
  const renderPasswordStep = () => {
    const canLogin = isPasswordValid && !isBusy;

    return (
      <form onSubmit={handleLogin} className="mt-4 space-y-3">
        {renderMessages()}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[11px] font-semibold text-[#4b5563]">
              Enter password <span className="text-red-500">*</span>
            </Label>
            <button
              type="button"
              className="text-[10px] font-medium text-[#7fa6e6] transition-colors hover:text-[#4f7fd2]"
              onClick={() => {
                setStep('forgot-password');
                setErrorMessage(null);
                setSuccessMessage(null);
                setToastMessage(null);
              }}
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrorMessage(null);
                setSuccessMessage(null);
                setToastMessage(null);
              }}
              placeholder="••••••••"
              className="h-8 rounded-[5px] border-[#d9dce1] bg-white pl-3 pr-10 text-xs text-[#4b5563] shadow-none placeholder:text-[#c7cbd1] focus-visible:ring-1 focus-visible:ring-[#c8ccd2]"
              disabled={isBusy}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280]"
              disabled={isBusy}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={!canLogin}
          className={getActionButtonClass(canLogin)}
          style={canLogin ? ACTION_BUTTON_STYLE : undefined}
        >
          {isSubmittingPassword ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Logging in...
            </>
          ) : (
            'Login'
          )}
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleBackToEmail}
            disabled={isBusy}
            className="text-[11px] font-medium text-[#7fa6e6] transition-colors hover:text-[#4f7fd2] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use a different email
          </button>
        </div>
      </form>
    );
  };

  return (
    <>
      {toastMessage && (
        <div className="fixed right-4 top-6 z-50 flex min-h-[72px] w-[calc(100vw-2rem)] max-w-[368px] items-center gap-3 rounded-[6px] bg-[#b92318] p-4 text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)] sm:right-6">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#b92318]">
            <X className="h-4 w-4 stroke-[3]" aria-hidden="true" />
          </div>
          <p className="min-w-0 flex-1 text-sm font-medium leading-5 tracking-normal">
            {toastMessage}
          </p>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="flex h-6 w-6 shrink-0 items-center justify-center text-white transition-opacity hover:opacity-80"
            aria-label="Dismiss notification"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="flex w-full flex-col px-6 py-9 sm:px-8 lg:px-10">
        <div className="mx-auto flex h-full w-full max-w-[428px] flex-col">
          <div>
            {renderHeader()}
            {renderGoogleButton()}
            {step === 'email' ? renderEmailStep() : step === 'password' ? renderPasswordStep() : renderForgotPasswordStep()}
            {renderFooterLinks()}
          </div>

          <p className="mt-auto pb-2 text-center text-[11px] leading-5 text-[#7b8491]">
            &copy; 2026 SearchEO AI. All rights reserved.
          </p>
        </div>
      </div>
    </>
  );
};

export default Login;
