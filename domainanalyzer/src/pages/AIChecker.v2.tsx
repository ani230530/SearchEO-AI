import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "@/services/apiClient";
import { WizardShell } from "@/features/wizard-v2/WizardShell";
import { Step1AddDomain } from "@/features/wizard-v2/Step1AddDomain";
import { Step2Crawling } from "@/features/wizard-v2/Step2Crawling";
import { Step3Competitors } from "@/features/wizard-v2/Step3Competitors";
import { Step4SelectTopics } from "@/features/wizard-v2/Step4SelectTopics";
import { Step5RunQueries } from "@/features/wizard-v2/Step5RunQueries";
import { PHASE_TO_STEP, type WizardProfile, type WizardStateResponse, type WizardStep } from "@/features/wizard-v2/types";

const HEADINGS: Record<WizardStep, { eyebrow: string; heading: string; description?: string }> = {
  1: {
    eyebrow: "Get to know us",
    heading: "Add your domain",
    description: "We will analyze your public pages to pre-fill your brand profile. You can review and edit everything.",
  },
  2: {
    eyebrow: "Get to know us",
    heading: "Add your domain",
    description: "Hang tight — we're reading your site and extracting structured context.",
  },
  3: {
    eyebrow: "Get to know us",
    heading: "Track Your Competitors in AI Search",
    description: "Add competitor domains that matter most to your industry.",
  },
  4: {
    eyebrow: "Select for precise results",
    heading: "Select prompts & keywords in your niche",
    description: "Choose backend-generated keywords and prompts for the full AI visibility analysis.",
  },
  5: {
    eyebrow: "Almost there",
    heading: "Generating your report",
    description: "Querying ChatGPT, Gemini, and Claude with the prompts you selected.",
  },
};

export default function AICheckerV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState<WizardStep>(1);
  const [domainId, setDomainId] = useState<number | null>(null);
  const [normalizedUrl, setNormalizedUrl] = useState<string>("");
  const [profile, setProfile] = useState<WizardProfile>({
    country: "",
    state: "",
    industry: "",
    customKeywords: "",
    customPrompts: "",
  });
  const [restoredDraft, setRestoredDraft] = useState<{ keywordIds?: number[]; promptIds?: number[] } | null>(null);
  const [restoredCompetitors, setRestoredCompetitors] = useState<string[]>([]);
  const [loadingState, setLoadingState] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Resume from URL ?domain=:id
  useEffect(() => {
    const idParam = searchParams.get("domain");
    if (!idParam) return;
    const id = Number(idParam);
    if (!Number.isFinite(id)) return;
    setDomainId(id);
    setLoadingState(true);
    apiGet<WizardStateResponse>(`/wizard/domain/${id}/state`)
      .then((res) => {
        setNormalizedUrl(res.url);
        setProfile({
          country: res.profile.country ?? "",
          state: res.profile.state ?? "",
          industry: res.profile.industry ?? "",
          customKeywords: (res.customSeeds?.keywords ?? []).join(", "),
          customPrompts: (res.customSeeds?.prompts ?? []).join(", "),
        });
        setRestoredCompetitors(res.selectedCompetitors ?? []);
        setRestoredDraft(res.selectionDraft ?? null);
        const target = res.canResumeAt ? PHASE_TO_STEP[res.canResumeAt] ?? 1 : 1;
        setStep(target);
      })
      .catch(() => setGlobalError("Could not resume — please start over."))
      .finally(() => setLoadingState(false));
  }, [searchParams]);

  const advanceTo = (target: WizardStep, id?: number) => {
    if (id) {
      setDomainId(id);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("domain", String(id));
        return next;
      }, { replace: true });
    }
    setStep(target);
  };

  const heading = HEADINGS[step];

  return (
    <WizardShell step={step} eyebrow={heading.eyebrow} heading={heading.heading} description={heading.description}>
      {globalError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {globalError}
        </div>
      )}
      {loadingState ? (
        <p className="text-sm text-[#717680]">Restoring your session…</p>
      ) : step === 1 ? (
        <Step1AddDomain
          initialUrl={normalizedUrl}
          onContinue={({ normalizedUrl: u, profile: p, existingDomainId }) => {
            setNormalizedUrl(u);
            setProfile(p);
            if (existingDomainId) {
              advanceTo(2, existingDomainId);
            } else {
              setStep(2);
            }
          }}
        />
      ) : step === 2 ? (
        <Step2Crawling
          url={normalizedUrl}
          profile={profile}
          onComplete={(id) => advanceTo(3, id)}
          onError={(msg) => {
            setGlobalError(msg);
            setStep(1);
          }}
        />
      ) : step === 3 && domainId ? (
        <Step3Competitors
          domainId={domainId}
          initialSelected={restoredCompetitors}
          onContinue={() => advanceTo(4)}
        />
      ) : step === 4 && domainId ? (
        <Step4SelectTopics
          domainId={domainId}
          initialDraft={restoredDraft}
          onContinue={() => advanceTo(5)}
        />
      ) : step === 5 && domainId ? (
        <Step5RunQueries
          domainId={domainId}
          onError={(msg) => {
            setGlobalError(msg);
            setStep(4);
          }}
        />
      ) : null}
    </WizardShell>
  );
}
