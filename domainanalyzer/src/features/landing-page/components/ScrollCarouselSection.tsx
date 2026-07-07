import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Radar, Search, Sparkles, Target, TrendingUp } from "lucide-react";

type CarouselStep = {
  step: string;
  title: string;
  eyebrow: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
};

const STEPS: CarouselStep[] = [
  {
    step: "01",
    title: "Measure",
    eyebrow: "The platform",
    body: "See where AI recommends your brand and where it leaves you out.",
    icon: Sparkles,
    accent: "from-[#C9D9FF] to-[#EEF4FF]",
  },
  {
    step: "02",
    title: "Discover",
    eyebrow: "The signals",
    body: "Uncover the prompts, topics, and competitors shaping AI answers.",
    icon: Search,
    accent: "from-[#D9F0FF] to-[#F3FAFF]",
  },
  {
    step: "03",
    title: "Prioritize",
    eyebrow: "The gaps",
    body: "Focus on the opportunities that can move visibility the fastest.",
    icon: Target,
    accent: "from-[#E6E8FF] to-[#F6F7FF]",
  },
  {
    step: "04",
    title: "Improve",
    eyebrow: "The content",
    body: "Turn the insights into pages, answers, and citations AI can use.",
    icon: Radar,
    accent: "from-[#E2F7EE] to-[#F7FFFB]",
  },
  {
    step: "05",
    title: "Track",
    eyebrow: "The momentum",
    body: "Watch the recommendation mix change as your brand earns more share.",
    icon: TrendingUp,
    accent: "from-[#FFF2D9] to-[#FFFDF5]",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function ScrollCarouselSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateActiveIndex = (source: HTMLDivElement | null) => {
    if (!source) return;
    const totalScrollableDistance = Math.max(1, source.scrollHeight - source.clientHeight);
    const progress = clamp(source.scrollTop, 0, totalScrollableDistance) / totalScrollableDistance;
    setActiveIndex(clamp(Math.round(progress * (STEPS.length - 1)), 0, STEPS.length - 1));
  };

  const syncScroll = (source: HTMLDivElement | null) => {
    if (!source || syncingRef.current) return;
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    const nextTop = source.scrollTop;

    syncingRef.current = true;
    if (left && left !== source) left.scrollTop = nextTop;
    if (right && right !== source) right.scrollTop = nextTop;
    updateActiveIndex(source);

    window.requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  useEffect(() => {
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;

    const syncCurrentScroll = () => {
      const source = right.scrollTop >= left.scrollTop ? right : left;
      const targetTop = source.scrollTop;

      syncingRef.current = true;
      left.scrollTop = targetTop;
      right.scrollTop = targetTop;
      updateActiveIndex(source);

      window.requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    };

    syncCurrentScroll();
    window.addEventListener("resize", syncCurrentScroll);

    return () => {
      window.removeEventListener("resize", syncCurrentScroll);
    };
  }, []);

  const activeStep = STEPS[activeIndex];

  return (
    <section ref={sectionRef} className="relative w-full overflow-hidden bg-white text-slate-900">
      <div className="relative mx-auto max-w-[88rem] px-5 py-14 md:px-10 lg:px-14 xl:px-20 lg:py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_68px_minmax(440px,0.98fr)] lg:items-center">
          <div className="flex items-center justify-center lg:justify-start">
            <div
              ref={leftScrollRef}
              onScroll={(e) => syncScroll(e.currentTarget)}
              className="carousel-scrollbar h-[520px] w-full max-w-[560px] overflow-y-auto rounded-[2px]"
            >
              {STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.step} className="flex h-[520px] items-center px-2 py-4">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`${step.step}-left`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: step.step === activeStep.step ? 1 : 0.5 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="max-w-[520px] space-y-5"
                      >
                        <p className="text-lg font-semibold text-slate-700">{step.eyebrow}</p>
                        <h2 className="carousel-figma-heading landing-page-section-heading max-w-xl text-slate-950 lg:max-w-4xl">
                          AI might not be mentioning your brand.
                        </h2>
                        <p className="max-w-lg text-lg leading-relaxed text-slate-600 sm:text-xl">
                          {step.body}
                        </p>
                        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-900">
                            {step.step}
                          </span>
                          <span>{step.title}</span>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="hidden justify-center lg:flex">
            <div className="h-[340px] border-l-2 border-dashed border-[#AFC0F3]" />
          </div>

          <div className="flex items-center justify-center lg:justify-end">
            <div
              ref={rightScrollRef}
              onScroll={(e) => syncScroll(e.currentTarget)}
              className="carousel-scrollbar h-[520px] w-full max-w-[404px] overflow-y-auto rounded-[2px]"
            >
              {STEPS.map((step, index) => {
                const isActive = index === activeIndex;
                const Icon = step.icon;

                return (
                  <div
                    key={step.step}
                    className="flex h-[520px] items-center justify-center px-4 py-4"
                  >
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={step.step}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: isActive ? 1 : 0.72 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className={`relative h-[369px] w-full max-w-[383px] overflow-hidden rounded-[2px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] ${
                          isActive ? "ring-1 ring-[#D9E6FF]" : ""
                        }`}
                      >
                        <div className="absolute left-[45px] top-[62px] h-[222px] w-px bg-slate-200" aria-hidden="true" />

                        <div className="flex h-[78px] items-center gap-4 border-b border-slate-200 px-6">
                          <div className="relative z-10 flex h-[46px] w-[46px] items-center justify-center border border-slate-200 bg-white text-lg font-medium text-slate-900">
                            {step.step}
                          </div>
                          <h3 className="text-[20px] font-semibold tracking-[-0.03em] text-slate-800">
                            {step.title}
                          </h3>
                        </div>

                        <div className="relative flex h-[206px] items-center justify-center px-6 py-8">
                          <div className={`flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br ${step.accent}`}>
                            <Icon className="h-16 w-16 text-slate-300" />
                          </div>
                        </div>

                        <div className="border-t border-slate-200 px-6 py-5">
                          <p className="max-w-sm text-[15px] leading-6 text-slate-600">
                            {step.body}
                          </p>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pointer-events-none mt-8 flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-medium text-slate-500 shadow-sm backdrop-blur md:hidden">
          <ChevronDown className="h-4 w-4" />
          Scroll inside either column
        </div>
      </div>
    </section>
  );
}
