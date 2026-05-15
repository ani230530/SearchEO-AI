import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { Loader2, X } from 'lucide-react';

const EMAIL_REGEX = /\S+@\S+\.\S+/;
const MOCK_DELAY_MS = 900;
const MESSAGE_TIMEOUT_MS = 3000;
const OTP_LENGTH = 6;
const VALID_TEST_EMAIL = 'test@email.com';
const ACTION_BUTTON_STYLE = {
  background: 'linear-gradient(90deg, #2D4059 0%, #4C74C2 100%)',
  boxShadow: '0px 1px 2px 0px #0A0D120D',
};

type LoginStep = 'email' | 'otp' | 'forgot-password';

interface LoginProps {
  onSwitchToRegister: () => void;
  onStepChange?: (step: LoginStep) => void;
}

const Login: React.FC<LoginProps> = ({ onSwitchToRegister, onStepChange }) => {
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmittingOtp, setIsSubmittingOtp] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedEmail = email.trim();
  const isEmailValid = useMemo(() => EMAIL_REGEX.test(trimmedEmail), [trimmedEmail]);
  const isOtpComplete = otp.length === OTP_LENGTH;
  const isBusy = isSendingCode || isSubmittingOtp || isGoogleLoading || isResetting;

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

  const showTemporarySuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage(null);

    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }

    successTimerRef.current = setTimeout(() => {
      setSuccessMessage(null);
    }, MESSAGE_TIMEOUT_MS);
  };

  const showEmailNotFoundToast = () => {
    setToastMessage("Seems this email doesn’t exist in our server");

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, MESSAGE_TIMEOUT_MS);
  };

  const isMockDatabaseEmailMissing = (value: string) => value.toLowerCase() !== VALID_TEST_EMAIL;

  const handleSendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isEmailValid || isBusy) return;

    setIsSendingCode(true);
    setErrorMessage(null);

    window.setTimeout(() => {
      if (isMockDatabaseEmailMissing(trimmedEmail)) {
        showEmailNotFoundToast();
        setIsSendingCode(false);
        return;
      }

      setStep('otp');
      setOtp('');
      setSuccessMessage(null);
      setIsSendingCode(false);
    }, MOCK_DELAY_MS);
  };

  const handleSubmitOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isOtpComplete || isBusy) return;

    setIsSubmittingOtp(true);
    setErrorMessage(null);

    window.setTimeout(() => {
      showTemporarySuccess('Verification code accepted.');
      setIsSubmittingOtp(false);
    }, MOCK_DELAY_MS);
  };

  const handleGoogleLogin = () => {
    if (isBusy) return;

    setIsGoogleLoading(true);
    setErrorMessage(null);

    window.setTimeout(() => {
      showTemporarySuccess('Google login mocked successfully.');
      setIsGoogleLoading(false);
    }, MOCK_DELAY_MS);
  };

  const handleBackToEmail = () => {
    if (isBusy) return;

    setStep('email');
    setOtp('');
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const getActionButtonClass = (enabled: boolean) =>
    `h-8 w-full rounded-[5px] text-xs font-medium text-white shadow-none transition-opacity ${
      enabled ? 'hover:opacity-95' : 'cursor-not-allowed bg-[#cfd2d6] opacity-100 hover:bg-[#cfd2d6]'
    }`;

  const renderHeader = () => (
    <div className="mb-5">
      <h1 className="text-[26px] font-semibold leading-tight text-[#444853]">
        {step === 'email' ? 'Great to see you again!' : 
         step === 'otp' ? 'Almost there!' : 
         'Sorry to hear that :('}
      </h1>
      <p className="mt-2 text-[13px] leading-5 text-[#717885]">
        {step === 'email'
          ? 'Access your dashboard in seconds with a quick email code.'
          : step === 'otp'
          ? 'Enter the code we sent to your email to continue.'
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
    const canSendCode = isEmailValid && !isBusy;

    return (
      <form onSubmit={handleSendCode} className="mt-4 space-y-3">
        {renderMessages()}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="email" className="text-[11px] font-semibold text-[#4b5563]">
              Enter email <span className="text-red-500">*</span>
            </Label>
            <button
              type="button"
              className="text-[10px] font-medium text-[#7fa6e6] transition-colors hover:text-[#4f7fd2]"
              onClick={() => {
                setStep('forgot-password');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
            >
              Reset password?
            </button>
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
          disabled={!canSendCode}
          className={getActionButtonClass(canSendCode)}
          style={canSendCode ? ACTION_BUTTON_STYLE : undefined}
        >
          {isSendingCode ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Sending code...
            </>
          ) : (
            'Send Verification code'
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
        if (isMockDatabaseEmailMissing(trimmedEmail)) {
          showEmailNotFoundToast();
          setIsResetting(false);
          return;
        }

        showTemporarySuccess("Success! We have sent you an email to reset your password");
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
  const renderOtpStep = () => {
    const canSubmitOtp = isOtpComplete && !isBusy;

    return (
      <form onSubmit={handleSubmitOtp} className="mt-4 space-y-3">
        {renderMessages()}

        <div className="space-y-1.5">
          <Label htmlFor="otp" className="text-[11px] font-semibold text-[#4b5563]">
            Enter OTP <span className="text-red-500">*</span>
          </Label>
          <InputOTP
            id="otp"
            maxLength={OTP_LENGTH}
            value={otp}
            onChange={(value) => {
              setOtp(value);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            disabled={isBusy}
            containerClassName="gap-2"
          >
            <InputOTPGroup className="gap-2">
              {Array.from({ length: OTP_LENGTH }).map((_, index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="h-8 w-8 rounded-[5px] border border-[#d9dce1] text-xs text-[#4b5563] shadow-none first:rounded-[5px] first:border last:rounded-[5px]"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          type="submit"
          disabled={!canSubmitOtp}
          className={getActionButtonClass(canSubmitOtp)}
          style={canSubmitOtp ? ACTION_BUTTON_STYLE : undefined}
        >
          {isSubmittingOtp ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Submitting...
            </>
          ) : (
            'Submit'
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
      {toastMessage && step === 'email' && (
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
            {step === 'email' ? renderEmailStep() : step === 'otp' ? renderOtpStep() : renderForgotPasswordStep()}
            {renderFooterLinks()}
          </div>

          <p className="mt-auto pb-2 text-center text-[11px] leading-5 text-[#7b8491]">
            &copy; 2026 SearchEO.AI. All rights reserved.
          </p>
        </div>
      </div>
    </>
  );
};

export default Login;
