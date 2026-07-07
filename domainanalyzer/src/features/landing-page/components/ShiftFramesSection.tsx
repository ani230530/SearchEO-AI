import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

type FrameItem = {
  id: string;
  image: string;
  imageClassName?: string;
  reverseLayout?: boolean;
  eyebrow: string;
  title: string;
  description: string;
  quote: string;
  highlight: string;
};

const FRAMES: FrameItem[] = [
  {
    id: "agency",
    image: "/Lady-reading.png",
    eyebrow: "Agency teams",
    title: "Move from manual audits to a repeatable AI visibility workflow.",
    description:
      "Build a service your clients can feel every month without stitching together four different tools.",
    quote:
      "Every client is asking about AI SEO. I need to deliver it at scale, not one tool per client.",
    highlight:
      "One white-labelled platform replacing four tools, with a structured AI-visibility deliverable you can bill per client.",
  },
  {
    id: "content",
    image: "/image-man.png",
    reverseLayout: true,
    eyebrow: "Content teams",
    title: "Turn visibility gaps into content that AI can actually cite.",
    description:
      "Know which topics matter first, then ship pages that connect your expertise to the exact questions users ask.",
    quote:
      "My clients want to know why ChatGPT isn't recommending them. I need an answer — and a fix.",
    highlight:
      "One workspace for every client and a white-label visibility report in a click — her logo, her colours, with keyword-to-lead attribution.",
  },
  {
    id: "founders",
    image: "/image-group.png",
    imageClassName: "scale-[1.26] origin-center",
    eyebrow: "Founders and growth",
    title: "See the market shift before your competitors do.",
    description:
      "Get a shared narrative around where AI mentions you, where it misses you, and what to improve next.",
    quote:
      "I can write a great article in my sleep. What I can't do is make a brief for AI search.",
    highlight:
      "One white-labelled platform replacing four tools, with a structured AI-visibility deliverable you can bill per client.",
  },
];

export default function ShiftFramesSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const activeFrame = useMemo(() => FRAMES[activeIndex], [activeIndex]);

  const handlePrevious = () => {
    setDirection(-1);
    setActiveIndex((current) => (current - 1 + FRAMES.length) % FRAMES.length);
  };

  const handleNext = () => {
    setDirection(1);
    setActiveIndex((current) => (current + 1) % FRAMES.length);
  };

  return (
    <section className="w-full bg-white text-slate-900 pt-14 pb-10">
      <div className="mx-auto max-w-[1436px] px-5 sm:px-6 lg:px-[100px]">
        <div className="flex min-h-[720px] flex-col justify-between gap-20">
          <div className="flex flex-col gap-8 pt-14 lg:pt-20">
            <div className="max-w-[760px] space-y-4">
              <p className="text-[16px] font-semibold leading-none text-slate-900">
                Who feels the shift first?
              </p>
              <h2 className="landing-page-section-heading max-w-[760px] text-slate-950">
                AI visibility isn&apos;t an industry problem. It&apos;s a visibility problem.
              </h2>
              <div className="mt-2 flex items-start gap-6">
                <p className="max-w-[760px] pt-0.5 text-[16px] leading-[1.45] text-slate-600 sm:text-[16px]">
                  SEO consultants, agencies, content teams, founders, demand generation leaders, and growth marketers are already seeing buyer behavior shift. These are just some of the teams feeling it first. SearchEO AI is built for anyone whose growth depends on being found.
                </p>

                <div className="flex shrink-0 items-center gap-2 pt-8 lg:pt-10">
                  <button
                    type="button"
                    onClick={handlePrevious}
                    aria-label="Previous frame"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF4FF] text-[#7B95D6] transition hover:bg-[#E5EEFF]"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Next frame"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7B95D6] text-white transition hover:bg-[#6D89CC]"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeFrame.id}
              initial={{ opacity: 0, x: direction * 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -14 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={`grid grid-cols-1 gap-8 lg:items-center ${
                activeFrame.reverseLayout
                  ? "lg:grid-cols-[minmax(0,1fr)_520px]"
                  : "lg:grid-cols-[520px_minmax(0,1fr)]"
              }`}
            >
              <div
                className={`relative flex justify-center ${
                  activeFrame.reverseLayout ? "lg:order-2 lg:justify-end" : "lg:justify-start"
                }`}
              >
                <div className="relative w-full max-w-[430px]">
                  <div className="overflow-visible rounded-[2px] bg-transparent">
                    <div className="aspect-[430/560] w-full">
                      <img
                        src={activeFrame.image}
                        alt={activeFrame.eyebrow}
                        className={`block h-full w-full object-contain object-center grayscale ${activeFrame.imageClassName ?? ""}`}
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`flex justify-center ${
                  activeFrame.reverseLayout ? "lg:order-1 lg:justify-start" : "lg:justify-end"
                }`}
              >
                <div className="w-full max-w-[760px]">
                  <div className="flex min-h-[520px] flex-col gap-10 rounded-[24px] bg-white p-6 sm:p-8 lg:p-10">
                    <div className="w-full max-w-[644px] self-start rounded-[24px] bg-[#F7F7F7] p-6 sm:p-7 lg:p-8 lg:-ml-16">
                      <p className="max-w-[520px] text-[18px] leading-[1.45] text-slate-700 italic sm:text-[20px]">
                        &quot;{activeFrame.quote}&quot;
                      </p>
                    </div>

                    <div className="flex items-end gap-4">
                      <div className="w-full max-w-[620px] self-start rounded-[24px] bg-[#F5F7FF] p-6 sm:p-7 lg:p-8 lg:-ml-4">
                        <p className="max-w-[520px] text-[18px] leading-[1.5] text-[#3B82F6] sm:text-[20px]">
                          {activeFrame.highlight}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3 rounded-2xl bg-[#334155] px-3 py-3 text-white shadow-sm">
                        <img
                          src="/searcheo-logo.png"
                          alt="SearchEO"
                          className="h-6 w-6 object-contain brightness-0 invert"
                          loading="lazy"
                        />
                      </div>
                    </div>

                    <div className="w-fit self-start rounded-[24px] px-4 py-4 lg:-ml-16">
                      <div className="flex items-center gap-1.5" aria-hidden="true">
                        <span
                          className="h-2 w-2 rounded-full bg-slate-300"

                        />
                        <span
                          className="h-2 w-2 rounded-full bg-slate-300"

                        />
                        <span
                          className="h-2 w-2 rounded-full bg-slate-300"

                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
