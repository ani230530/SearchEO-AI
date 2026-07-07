import React, { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CircleHelp } from "lucide-react";

import monitorBezelFrame from "../assets/monitor-bezel-frame.png";
import googleIcon from "../assets/google.svg";
import chatgptIcon from "../assets/chatgpt.svg";
import geminiIcon from "../assets/gemini.svg";
import claudeIcon from "../assets/claude.svg";
import statsCounterScreen from "../assets/stats-counter-screen.png";

const TABS = [
  {
    id: "visibility",
    label: "AI Visibility Intelligence",
    title: "AI Visibility Intelligence",
    description: "See where AI recommends your brand—and where it recommends competitors instead.",
    features: [
      "Sentiment analysis",
      "AI Share of Voice",
      "Citation frequency",
      "Historical trends",
      "Competitor benchmarking",
      "Alerts"
    ]
  },
  {
    id: "discovery",
    label: "Prompt & Opportunity Discovery",
    title: "Prompt & Opportunity Discovery",
    description: "Uncover what drives AI answers. Identify high-value prompts and search intent before your competitors do.",
    features: [
      "Prompt tracking & clustering",
      "Search intent mapping",
      "Keyword/prompt gap analysis",
      "Click-through-rate (CTR) modeling",
      "Competitor prompt analysis",
      "Trend forecasting"
    ]
  },
  {
    id: "generation",
    label: "AI Content Generation",
    title: "AI Content Generation",
    description: "Produce content tailored to rank in AI responses. Automatically write paragraphs and key sections targeting specific AI guidelines.",
    features: [
      "Citations-optimized writing",
      "Structured formatting engine",
      "Fact-checking & entity density control",
      "Tone & brand voice tuning",
      "Automated content briefing",
      "Real-time LLM validation"
    ]
  },
  {
    id: "publishing",
    label: "CMS Publishing & Attribution",
    title: "CMS Publishing & Attribution",
    description: "Seamlessly push optimized content to your CMS and track the direct ROI of your AI visibility campaigns.",
    features: [
      "One-click CMS publishing",
      "Referral traffic tracking",
      "AI ranking attribution",
      "Conversion mapping",
      "Automated SEO sync",
      "Brand impact reports"
    ]
  }
];

const SCREEN_STYLE = {
  top: "2.7%",
  left: "2.1%",
  width: "95.6%",
  height: "70.4%"
} as const;

const GLASS_STYLE = {
  backdropFilter: "blur(19.2px)",
  WebkitBackdropFilter: "blur(19.2px)",
  boxShadow: "0px 0px 6.6px 0px #52525230",
  backgroundColor: "rgba(255, 255, 255, 0.56)",
} as const;

function InfoIcon() {
  return <CircleHelp className="h-3 w-3 lg:h-3.5 lg:w-3.5 xl:h-4 xl:w-4 text-[#7B828D]" strokeWidth={2.1} />;
}

function CardShell({
  children,
  className = "",
  style = GLASS_STYLE
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[12px] lg:rounded-[14px] xl:rounded-[18px] border border-white/55 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function PromptsCard() {
  return (
    <div className="relative">
      <CardShell className="w-full">
      <div className="px-3 py-2.5 lg:px-4 lg:py-3 xl:px-5 xl:py-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] lg:text-[13px] xl:text-[16px] font-semibold tracking-[-0.02em] text-[#545B66]">
            Prompts
          </h4>
          <InfoIcon />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 lg:gap-3">
          <div className="rounded-[10px]  px-2 py-2">
            <p className="text-[8px] lg:text-[10px] xl:text-[12px] font-semibold tracking-[-0.01em] text-[#717680]">
              Total
            </p>
            <p className="mt-0.5 text-[16px] lg:text-[20px] xl:text-[24px] font-bold leading-none tracking-[-0.03em] text-[#3390FF]">
              89
            </p>
          </div>
          <div className="rounded-[10px]  px-2 py-2">
            <p className="text-[8px] lg:text-[10px] xl:text-[12px] font-semibold tracking-[-0.01em] text-[#717680]">
              Tracked
            </p>
            <p className="mt-0.5 text-[16px] lg:text-[20px] xl:text-[24px] font-bold leading-none tracking-[-0.03em] text-[#3390FF]">
              45
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex items-end justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <p className="text-[8px] lg:text-[10px] xl:text-[12px] font-medium tracking-[-0.01em] text-[#717680]">
              Visibility
            </p>
            <p className="text-[8px] lg:text-[10px] xl:text-[12px] font-semibold tracking-[-0.01em] text-[#3390FF]">
              27%
            </p>
          </div>

        </div>
      </div>
      </CardShell>
      <div
        className="absolute right-[-10px] top-[-10px] lg:right-[-14px] lg:top-[-14px] xl:right-[-18px] xl:top-[-18px] flex h-[28px] w-[28px] lg:h-[34px] lg:w-[34px] xl:h-[42px] xl:w-[42px] items-center justify-center rounded-full bg-[#FFFFFF]"
        style={{ boxShadow: "0px 0px 6.7px 0px #0000000A" }}
      >
        <img src={claudeIcon} alt="" aria-hidden="true" className="h-[16px] w-[16px] lg:h-[20px] lg:w-[20px] xl:h-[24px] xl:w-[24px]" />
      </div>
    </div>
  );
}

function AICitationsCard() {
  return (
    <CardShell className="w-full">
      <div className="px-3 py-2.5 lg:px-4 lg:py-3 xl:px-5 xl:py-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] lg:text-[13px] xl:text-[16px] font-semibold tracking-[-0.02em] text-[#545B66]">
            AI Citations
          </h4>
          <InfoIcon />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3.5 lg:gap-x-5 lg:gap-y-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-[8px] lg:text-[10px] xl:text-[12px] font-semibold tracking-[-0.01em] text-[#717680]">
              AI Overview
            </p>
            <div className="flex items-center gap-2">
              <img src={googleIcon} alt="" aria-hidden="true" className="h-5 w-5 shrink-0 object-contain" />
              <span className="text-[15px] lg:text-[18px] xl:text-[22px] font-bold leading-none tracking-[-0.03em] text-[#3390FF]">
                56
              </span>
            </div>
            <span className="text-[7px] lg:text-[8px] xl:text-[9px] text-[#717680]">Pages 1</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[8px] lg:text-[10px] xl:text-[12px] font-semibold tracking-[-0.01em] text-[#717680]">
              ChatGPT
            </p>
            <div className="flex items-center gap-2">
              <img src={chatgptIcon} alt="" aria-hidden="true" className="h-5 w-5 shrink-0 object-contain brightness-0" />
              <span className="text-[15px] lg:text-[18px] xl:text-[22px] font-bold leading-none tracking-[-0.03em] text-[#3390FF]">
                56
              </span>
            </div>
            <span className="text-[7px] lg:text-[8px] xl:text-[9px] text-[#717680]">Pages 1</span>
            <div className="hidden items-end justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="flex h-3.5 w-3.5 lg:h-4 lg:w-4 items-center justify-center rounded-full border border-[#111827] text-[7px] lg:text-[8px] xl:text-[9px] font-bold text-[#111827]">◎</div>
                <span className="text-[7px] lg:text-[8px] xl:text-[9px] text-[#717680]">Pages 1</span>
              </div>
              <span className="text-[15px] lg:text-[18px] xl:text-[22px] font-bold leading-none tracking-[-0.03em] text-[#3390FF]">
                56
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[8px] lg:text-[10px] xl:text-[12px] font-semibold tracking-[-0.01em] text-[#717680]">
              Gemini
            </p>
            <div className="flex items-center gap-2">
              <img src={geminiIcon} alt="" aria-hidden="true" className="h-5 w-5 shrink-0 object-contain" />
              <span className="text-[15px] lg:text-[18px] xl:text-[22px] font-bold leading-none tracking-[-0.03em] text-[#3390FF]">
                3
              </span>
            </div>
            <span className="text-[7px] lg:text-[8px] xl:text-[9px] text-[#717680]">Pages 3</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[8px] lg:text-[10px] xl:text-[12px] font-semibold tracking-[-0.01em] text-[#717680]">
              Claude
            </p>
            <div className="flex items-center gap-2">
              <img src={claudeIcon} alt="" aria-hidden="true" className="h-5 w-5 shrink-0 object-contain" />
              <span className="text-[15px] lg:text-[18px] xl:text-[22px] font-bold leading-none tracking-[-0.03em] text-[#3390FF]">
                4
              </span>
            </div>
            <span className="text-[7px] lg:text-[8px] xl:text-[9px] text-[#717680]">Pages 1</span>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

function MentionsCard() {
  return (
    <CardShell className="w-full">
      <div className="px-3 py-2.5 lg:px-4 lg:py-3 xl:px-5 xl:py-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] lg:text-[13px] xl:text-[16px] font-semibold tracking-[-0.02em] text-[#545B66]">
            Mentions
          </h4>
          <InfoIcon />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 lg:gap-3">
          <div>
            <p className="text-[8px] lg:text-[10px] xl:text-[12px] font-semibold tracking-[-0.01em] text-[#717680]">
              Brand
            </p>
            <p className="mt-0.5 text-[15px] lg:text-[20px] xl:text-[24px] font-bold leading-none tracking-[-0.03em] text-[#3390FF]">
              36%
            </p>
            <p className="mt-1 text-[7px] lg:text-[8px] xl:text-[9px] text-[#717680]">
              No. of Pages 45
            </p>
          </div>

          <div>
            <p className="text-[8px] lg:text-[10px] xl:text-[12px] font-semibold tracking-[-0.01em] text-[#717680]">
              Competitors
            </p>
            <p className="mt-0.5 text-[15px] lg:text-[20px] xl:text-[24px] font-bold leading-none tracking-[-0.03em] text-[#3390FF]">
              64%
            </p>
            <p className="mt-1 text-[7px] lg:text-[8px] xl:text-[9px] text-[#717680]">
              No. of Pages 354
            </p>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

function MockupStack({
  className = "",
  showShareOfVoiceCard = false,
  showPromptsCard = false,
  showAICitationsCard = false,
  showMentionsCard = false
}: {
  className?: string;
  showShareOfVoiceCard?: boolean;
  showPromptsCard?: boolean;
  showAICitationsCard?: boolean;
  showMentionsCard?: boolean;
}) {
  return (
    <div className={`relative mx-auto w-full aspect-[678/520] ${className}`}>
      <img
        src={statsCounterScreen}
        alt="Dashboard preview"
        className="absolute object-contain select-none"
        style={SCREEN_STYLE}
      />
      <img
        src={monitorBezelFrame}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-contain select-none pointer-events-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
      />
      {showPromptsCard ? (
        <div
          aria-hidden="true"
          className="absolute left-[5%] top-[-10%] z-20 w-[170px] lg:w-[214px] xl:w-[264px] select-none pointer-events-none"
        >
          <PromptsCard />
        </div>
      ) : null}
      {showAICitationsCard ? (
        <div
          aria-hidden="true"
          className="absolute right-[-14%] top-[-28%] z-20 w-[170px] lg:w-[214px] xl:w-[264px] select-none pointer-events-none"
        >
          <AICitationsCard />
        </div>
      ) : null}
      {showShareOfVoiceCard ? (
        <div
          aria-hidden="true"
          className="absolute left-[-14%] lg:left-[-18%] xl:left-[-22%] bottom-[18%] z-20 flex w-[144px] lg:w-[182px] xl:w-[228px] select-none flex-col items-start pointer-events-none"
        >
          <div
            className="ml-0 translate-x-[38px] lg:translate-x-[48px] xl:translate-x-[60px] flex h-[28px] w-[28px] lg:h-[34px] lg:w-[34px] xl:h-[42px] xl:w-[42px] items-center justify-center rounded-full bg-[#FFFFFF]"
            style={{
              boxShadow: "0px 0px 6.7px 0px #0000000A",
            }}
          >
            <img src={googleIcon} alt="" aria-hidden="true" className="h-[16px] w-[16px] lg:h-[20px] lg:w-[20px] xl:h-[24px] xl:w-[24px]" />
          </div>
          <div className="mt-[7px] lg:mt-[9px] xl:mt-[12px]">
            <CardShell className="w-full" style={GLASS_STYLE}>
              <div className="px-2.5 py-2 lg:px-3.5 lg:py-3 xl:px-4 xl:py-4">
                <div className="flex items-start justify-between gap-2.5 lg:gap-3 xl:gap-3.5">
                  <h4 className="text-[11px] lg:text-[14px] xl:text-[18px] font-semibold leading-tight tracking-[-0.02em] text-[#545B66]">
                    AI Share of Voice
                  </h4>
                  <InfoIcon />
                </div>

                <p className="mt-1.5 lg:mt-2.5 xl:mt-3 text-[8px] lg:text-[10px] xl:text-[13px] font-semibold leading-tight tracking-[-0.02em] text-[#5E6672]">
                  Across all AI Models
                </p>
                <p className="mt-0.5 lg:mt-1 xl:mt-1 text-[15px] lg:text-[22px] xl:text-[28px] font-bold leading-none tracking-[-0.03em] text-[#3390FF]">
                  34%
                </p>
              </div>
            </CardShell>
          </div>
        </div>
      ) : null}
      {showMentionsCard ? (
        <div
          aria-hidden="true"
          className="absolute right-[-5%] lg:right-[-7%] xl:right-[-9%] bottom-[14%] z-20 w-[144px] lg:w-[182px] xl:w-[228px] select-none pointer-events-none"
        >
          <MentionsCard />
        </div>
      ) : null}
    </div>
  );
}

export default function StatsCounter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [isDesktop, setIsDesktop] = useState(true);

  // Resize listener to toggle mobile/desktop views
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Tabs now only switch content state; they no longer drive page scroll.
  const handleTabClick = (index: number) => {
    setActiveTab(index);
  };

  if (!isDesktop) {
    // Mobile & Tablet view: Interactive tab layout (no sticky scroll physics)
    return (
      <section className="w-full bg-white py-16 px-6 md:px-16 overflow-hidden">
        <div className="flex flex-col gap-8 items-center max-w-4xl mx-auto">

          {/* Header */}
          <div className="text-left pt-6 w-full">
            <span className="text-sm font-semibold tracking-widest text-slate-500 uppercase">The platform</span>
            <h2 className="landing-page-section-heading mt-1 text-slate-900">
              Everything you need to win AI recommendations.
            </h2>
          </div>

          {/* Tab Selector Pills */}
          <div className="w-full overflow-x-auto flex justify-start gap-2 pb-2 custom-scrollbar">
            {TABS.map((tab, idx) => {
              const active = idx === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(idx)}
                  className={`whitespace-nowrap px-4 py-2.5 rounded-[10px] border bg-transparent text-xs font-semibold transition-all duration-300 ${active
                    ? "border-[#D9E4F7] bg-[#F1F6FF] text-[#7E9BD7] shadow-[inset_0_-2px_0_0_#7E9BD7]"
                    : "border-transparent text-[#64748B] hover:text-slate-900"
                    }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Active Tab Panel */}
          <div className="flex flex-col gap-12 mt-4 items-center w-full">
            {/* Text details */}
            <div className="w-full max-w-lg flex flex-col gap-4 text-left">
              <h3 className="text-2xl font-bold text-slate-900">{TABS[activeTab].title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                {TABS[activeTab].description}
              </p>
              <ul className="flex flex-col gap-4 mt-6">
                {TABS[activeTab].features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-900 font-semibold text-sm">
                    <div className="w-[18px] h-[18px] rounded-full bg-[#3B82F6] flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5 text-white stroke-[3.5]" />
                    </div>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Monitor Image Container */}
            <MockupStack className="max-w-sm" />
          </div>

        </div>
      </section>
    );
  }

  // Desktop view: Sticky Scroll
  return (
    <section ref={containerRef} className="relative w-full bg-white overflow-hidden z-10">
      <div className="relative w-full flex flex-col justify-start overflow-x-clip overflow-y-visible pt-10 md:pt-14 lg:pt-[90px] px-6 md:px-16 lg:px-20 xl:px-[150px] pb-16">

        {/* 3D Perspective Grid Background - absolute container behind everything */}
        <div
          className="absolute inset-0 overflow-visible pointer-events-none z-0"
          style={{ perspective: "1000px" }}
        >
          <div
            className="absolute top-[45%] left-[-50%] w-[200%] h-[165vh] opacity-25"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(15, 23, 42, 0.12) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(15, 23, 42, 0.12) 1px, transparent 1px)
              `,
              backgroundSize: "50px 50px",
              transform: "rotateX(60deg) scale(1.6)",
              transformOrigin: "center top",
              WebkitMaskImage: "radial-gradient(circle at 50% 50%, black 25%, transparent 75%)",
              maskImage: "radial-gradient(circle at 50% 50%, black 25%, transparent 75%)"
            }}
          />
          {/* Soft blue radial glow overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(59,130,246,0.06),transparent_60%)]" />
        </div>

        {/* Header - relative z-10 for drawing above the grid background */}
        <div className="w-full text-left mb-6 lg:mb-10 relative z-10 flex-shrink-0">
          <span className="text-sm font-semibold text-slate-500 block uppercase tracking-wider">The platform</span>
          <h2 className="landing-page-section-heading mt-1 max-w-3xl text-slate-900">
            Everything you need to win AI recommendations.
          </h2>
        </div>

        {/* Navigation Tabs Pills - spaced exactly 40px below the header - relative z-10 */}
        <div className="w-full flex justify-start gap-4 mb-10 overflow-x-auto custom-scrollbar pb-1 relative z-10 flex-shrink-0">
          {TABS.map((tab, idx) => {
            const active = idx === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(idx)}
                className={`px-5 py-3.5 rounded-[12px] border text-sm font-semibold transition-all duration-300 cursor-pointer whitespace-nowrap ${active
                  ? "border-[#D9E4F7] bg-[#F1F6FF] text-[#7E9BD7] shadow-[inset_0_-2px_0_0_#7E9BD7]"
                  : "border-transparent text-[#64748B] hover:text-slate-900"
                  }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Interactive Split Grid - relative z-10 */}
        <div className="grid grid-cols-12 gap-10 items-start mt-0 relative z-10">

          {/* Left side details */}
          <div className="col-span-5 h-[340px] flex flex-col justify-start pt-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex flex-col text-left"
              >
                <h3 className="text-2xl sm:text-[28px] font-bold text-slate-900 leading-tight tracking-tight">
                  {TABS[activeTab].title}
                </h3>
                <p className="text-slate-600 text-sm md:text-base leading-relaxed mt-2.5 max-w-md">
                  {TABS[activeTab].description}
                </p>

                {/* Bullet list: single column vertical stack */}
                <ul className="flex flex-col gap-4 mt-6">
                  {TABS[activeTab].features.map((feature, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center gap-3 text-slate-900 font-semibold text-sm"
                    >
                      <div className="w-[18px] h-[18px] rounded-full bg-[#3B82F6] flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Check className="w-2.5 h-2.5 text-white stroke-[3.5]" />
                      </div>
                      <span>{feature}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right side mock illustration */}
          <div className="col-span-7 flex justify-center items-start relative pt-36">
            <MockupStack
              className="max-w-[600px] lg:max-w-[640px] xl:max-w-[680px]"
              showPromptsCard
              showShareOfVoiceCard
              showAICitationsCard
              showMentionsCard
            />
          </div>

        </div>
      </div>
    </section>
  );
}
