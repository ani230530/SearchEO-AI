import React from "react";
import {
  ArrowUpRight,
  Blocks,
  Globe,
  LineChart,
  PencilLine,
  Send,
  Sparkles,
  Target,
  FileText,
} from "lucide-react";

type PhaseCard = {
  text: React.ReactNode;
  icon: React.ReactNode;
};

type Phase = {
  label: string;
  sublabel: string;
  accent: string;
  accentColor: string;
  line: string;
  dot: string;
  offset: string;
  cards: PhaseCard[];
};

const PHASES: Phase[] = [
  {
    label: "DAY 1",
    sublabel: "Your baseline, instantly",
    accent: "text-[#2D7FF9]",
    accentColor: "#2D7FF9",
    line: "bg-[#2D7FF9]",
    dot: "bg-[#2D7FF9]",
    offset: "lg:ml-0",
    cards: [
      {
        icon: <Globe className="h-4 w-4" strokeWidth={2} />,
        text: (
          <>
            <strong>Add your domain:</strong> We generate your prompt library automatically
          </>
        ),
      },
      {
        icon: <LineChart className="h-4 w-4" strokeWidth={2} />,
        text: (
          <>
            <strong>Visibility score &amp; share of voice</strong> across all major AI search engines
          </>
        ),
      },
      {
        icon: <Target className="h-4 w-4" strokeWidth={2} />,
        text: (
          <>
            <strong>Competitor gaps revealed</strong> find out exactly who&apos;s beating you, and where
          </>
        ),
      },
    ],
  },
  {
    label: "WEEK 1",
    sublabel: "First opportunities, closed",
    accent: "text-[#D28A00]",
    accentColor: "#D28A00",
    line: "bg-[#D28A00]",
    dot: "bg-[#D28A00]",
    offset: "lg:ml-[72px]",
    cards: [
      {
        icon: <Sparkles className="h-4 w-4" strokeWidth={2} />,
        text: (
          <>
            <strong>Prioritised prompt gaps</strong> ranked by opportunity
          </>
        ),
      },
      {
        icon: <PencilLine className="h-4 w-4" strokeWidth={2} />,
        text: (
          <>
            <strong>Approve AI-generated drafts GEO-optimised,</strong> in your brand voice
          </>
        ),
      },
      {
        icon: <Send className="h-4 w-4" strokeWidth={2} />,
        text: (
          <>
            <strong>Publish straight to your CMS</strong> - UTM-tagged, no dev handoff
          </>
        ),
      },
    ],
  },
  {
    label: "MONTH 1",
    sublabel: "AI visibility, in numbers",
    accent: "text-[#1F8E2A]",
    accentColor: "#1F8E2A",
    line: "bg-[#1F8E2A]",
    dot: "bg-[#1F8E2A]",
    offset: "lg:ml-[144px]",
    cards: [
      {
        icon: <ArrowUpRight className="h-4 w-4" strokeWidth={2} />,
        text: (
          <>
            <strong>Visibility gains</strong> compound across every AI engine
          </>
        ),
      },
      {
        icon: <Blocks className="h-4 w-4" strokeWidth={2} />,
        text: (
          <>
            <strong>Trace URLs to traffic,</strong> leads &amp; pipeline
          </>
        ),
      },
      {
        icon: <FileText className="h-4 w-4" strokeWidth={2} />,
        text: (
          <>
            <strong>Board-ready report</strong> white-label for agencies
          </>
        ),
      },
    ],
  },
];

function PhaseCards({ phase }: { phase: Phase }) {
  return (
    <div className="relative flex-1">
      <div className={`absolute left-[10px] top-0 bottom-0 w-px ${phase.line}`} />
      <div className="space-y-4 pl-5 sm:pl-6 lg:pl-7">
        {phase.cards.map((card, index) => (
          <div key={`${phase.label}-${index}`} className="relative">
            {index === 0 ? (
              <div className={`absolute left-[-22px] top-[15px] h-3.5 w-3.5 rounded-full border-4 border-white ${phase.dot}`} />
            ) : (
              <div className={`absolute left-[-17px] top-[22px] h-1.5 w-1.5 rounded-full ${phase.dot}`} />
            )}

            <div
              className="rounded-[16px] border border-l-[3px] border-[#E7EAF0] bg-[#F9F9F9] px-4 py-3.5 sm:px-5 sm:py-4"
              style={{
                borderLeftColor: phase.accentColor,
                boxShadow: "inset 1px 0 0 rgba(255,255,255,0.9), inset -1px 0 0 rgba(0,0,0,0.04)",
              }}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 shrink-0 ${phase.accent}`}>{card.icon}</div>
                <p className="text-[14px] leading-[1.45] text-[#4B5563] sm:text-[16px]">
                  {card.text}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhaseRow({ phase }: { phase: Phase }) {
  return (
    <div className={`grid grid-cols-1 gap-5 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-10 ${phase.offset}`}>
      <div className="flex flex-col items-start justify-start text-left lg:items-end lg:text-right">
        <p className={`text-[22px] font-extrabold leading-none tracking-[-0.04em] ${phase.accent}`}>{phase.label}</p>
        <p className="mt-2 max-w-[160px] text-[14px] leading-[1.35] text-[#1F2937] sm:text-[15px] lg:max-w-[180px]">
          {phase.sublabel}
        </p>
      </div>

      <PhaseCards phase={phase} />
    </div>
  );
}

export default function FoundationSection() {
  return (
    <section className="w-full bg-white text-slate-900 pt-16 pb-20 sm:pt-20 sm:pb-24">
      <div className="mx-auto max-w-[1436px] px-5 sm:px-6 lg:px-[100px]">
        <div className="max-w-[1240px]">
          <p className="text-[20px] font-semibold leading-none text-slate-900">The Foundation</p>
          <h2 className="landing-page-section-heading mt-5 max-w-[1120px] text-slate-950">
            How your first 30 days with SearchEO AI look like...
          </h2>
        </div>

        <div className="mt-14 space-y-10 sm:mt-16 sm:space-y-12 lg:mt-20 lg:space-y-16">
          {PHASES.map((phase) => (
            <PhaseRow key={phase.label} phase={phase} />
          ))}
        </div>
      </div>
    </section>
  );
}
