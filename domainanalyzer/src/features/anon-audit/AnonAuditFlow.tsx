/**
 * Orchestrator for the anonymous AI Visibility audit funnel.
 *
 * Owns the three-step state machine and the DomainSnapshot that survives
 * across steps. Knows nothing about page chrome — the host page wraps
 * this in whatever header / background / branding it likes.
 *
 *   domain  → user enters URL, /validate runs (cookie minted)
 *   preview → staged "we did X" animation + blurred chart wall
 *   signup  → register form; on success → redirect handler fires
 *   done    → renders nothing; navigation is delegated to onDone
 *
 * Navigation happens via `onDone`, fired exactly once after a successful
 * signup. The host page is responsible for the actual redirect — usually
 * `navigate(/dashboard?tab=ai-visibility&domain=<host>)` or similar.
 */

import { useCallback, useState } from 'react';

import { AnalysisPreviewStep } from './AnalysisPreviewStep';
import { DomainEntryStep } from './DomainEntryStep';
import { SignupWallStep } from './SignupWallStep';
import type { AnonAuditStep, DomainSnapshot } from './types';
import type { RegisterResult } from '@/contexts/AuthContext';

export interface AnonAuditFlowProps {
  /**
   * Fired once registration succeeds. Receives both the validated domain
   * and the wizardLink result (which holds the materialized
   * primaryDomainId for the new user).
   */
  onDone: (input: {
    snapshot: DomainSnapshot;
    registration: RegisterResult;
  }) => void;
}

export function AnonAuditFlow({ onDone }: AnonAuditFlowProps) {
  const [step, setStep] = useState<AnonAuditStep>('domain');
  const [snapshot, setSnapshot] = useState<DomainSnapshot | null>(null);

  const handleValidated = useCallback((next: DomainSnapshot) => {
    setSnapshot(next);
    setStep('preview');
  }, []);

  const handlePreviewContinue = useCallback(() => {
    setStep('signup');
  }, []);

  const handleRegistered = useCallback(
    (registration: RegisterResult) => {
      if (!snapshot) return;
      setStep('done');
      onDone({ snapshot, registration });
    },
    [onDone, snapshot]
  );

  if (step === 'domain' || !snapshot) {
    return <DomainEntryStep onValidated={handleValidated} />;
  }

  if (step === 'preview') {
    return (
      <AnalysisPreviewStep
        snapshot={snapshot}
        onContinue={handlePreviewContinue}
      />
    );
  }

  if (step === 'signup') {
    return <SignupWallStep snapshot={snapshot} onRegistered={handleRegistered} />;
  }

  return null;
}
