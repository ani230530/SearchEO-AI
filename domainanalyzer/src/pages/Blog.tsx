import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, MessageSquare, Share2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import MarketingHeader from "@/components/marketing/MarketingHeader";

const categoryTabs = [
  { label: "All", href: "#blog-hero", active: true },
  { label: "Product", href: "#product-topics" },
  { label: "Guide", href: "#guide" },
  { label: "Case Study", href: "#case-studies" },
  { label: "News", href: "#top-stories" },
] as const;

const featuredUpdates = [
  {
    category: "News",
    title: "SearchEO AI Launches New AI Visibility Dashboard",
    description:
      "See ranking changes, prompt mentions, and new opportunities in one unified view.",
  },
  {
    category: "News",
    title: "SearchEO AI Introduces Competitor Intelligence Suite",
    description:
      "Compare how competing brands show up across Google and AI search assistants.",
  },
  {
    category: "Product",
    title: "New Prompt Library Helps Teams Scale Content Production",
    description:
      "Turn winning prompts into a repeatable workflow for writers, strategists, and editors.",
  },
  {
    category: "Enterprise",
    title: "SearchEO AI Expands Enterprise Reporting Features",
    description:
      "Automate recurring reports for stakeholders without rebuilding the workflow every week.",
  },
] as const;

const topStories = [
  {
    title: "The Future of SEO Is AI Visibility",
    description:
      "The brands that surface in AI answers will own a new layer of demand capture.",
    metrics: ["Visibility +39%", "Featured in 7 surfaces"],
  },
  {
    title: "How a SaaS Company Increased Organic Traffic by 220%",
    description:
      "A practical playbook for connecting prompt discovery with keyword wins and conversion pages.",
    metrics: ["Traffic x2.2", "12-week rollout"],
  },
  {
    title: "From Page 3 to Page 1 in Six Months",
    description:
      "A focused content refresh process that turned stale articles into consistent performers.",
    metrics: ["Avg. rank 26 -> 4", "18 pages updated"],
  },
] as const;

const productTopics = [
  {
    title: "Rank Tracking",
    description:
      "Monitor the keywords, topics, and queries that matter most across Google and AI search.",
  },
  {
    title: "Competitor Intelligence",
    description:
      "See who is winning visibility and where your coverage is still leaving room to grow.",
  },
  {
    title: "Prompt Library",
    description:
      "Store and reuse prompts that consistently generate useful outlines, summaries, and content ideas.",
  },
  {
    title: "Enterprise Reporting",
    description:
      "Package insights for leadership, clients, and content teams in a format they can act on quickly.",
  },
] as const;

const caseStudies = [
  {
    title: "Scaling content production without sacrificing quality",
    description:
      "A content team used structured prompts and visibility tracking to publish more pages while staying on brand.",
    results: ["3x output", "42% faster reviews", "No extra headcount"],
  },
  {
    title: "Improving AI visibility across multiple platforms",
    description:
      "A multi-product SaaS company aligned article briefs, product pages, and FAQ content to improve discoverability.",
    results: ["2.8x mentions", "5 platforms tracked", "48 priority pages"],
  },
] as const;

const guideSections = [
  { id: "guide-overview", label: "Overview" },
  { id: "guide-track", label: "Track rankings" },
  { id: "guide-discover", label: "Discover opportunities" },
  { id: "guide-analyze", label: "Analyze competitors" },
  { id: "guide-improve", label: "Improve visibility" },
] as const;

const similarArticles = [
  {
    title: "AI search reporting for growth teams",
    description:
      "A simple structure for presenting visibility insights to stakeholders without overwhelming them.",
  },
  {
    title: "Building an editorial workflow around prompt data",
    description:
      "Use prompt insights to decide what to create, update, and retire in your content roadmap.",
  },
  {
    title: "The modern SEO stack for SaaS teams",
    description:
      "What to keep, what to replace, and what to measure when AI search starts shaping demand.",
  },
] as const;

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4C89C5]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
        {description}
      </p>
    </div>
  );
}

function VisualPanel({
  title,
  subtitle,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[32px] border border-white/[0.15] bg-gradient-to-br from-[#0f2344] via-[#1f4a7a] to-[#78b2f0] text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]",
        compact ? "min-h-[180px]" : "min-h-[260px]",
      ].join(" ")}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.28),_transparent_45%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.16),_transparent_38%)]" />
      <div className="absolute -right-8 top-10 h-28 w-28 rounded-full border border-white/25 bg-white/10 blur-[2px]" />
      <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full border border-white/20 bg-white/10 blur-[2px]" />
      <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
            SearchEO AI
          </div>
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
            Featured
          </div>
        </div>
        <div className="max-w-md">
          <p className="text-lg font-semibold tracking-[-0.03em] sm:text-xl">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-2 text-sm leading-6 text-slate-100/90">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-white/[0.15] backdrop-blur-sm" />
          <div className="flex-1 rounded-2xl border border-white/[0.15] bg-white/10 px-4 py-3 backdrop-blur-sm">
            <div className="h-2 w-20 rounded-full bg-white/40" />
            <div className="mt-2 h-2 w-36 rounded-full bg-white/30" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStoryRow({
  item,
  index,
}: {
  item: (typeof featuredUpdates)[number];
  index: number;
}) {
  return (
    <article className="flex gap-4 rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)] transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#dce9fb] via-[#edf4ff] to-[#c6ddf9]">
        <span className="text-sm font-semibold text-[#1f4974]">{index + 1}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#4C89C5]">
          {item.category}
        </p>
        <h3 className="mt-2 text-sm font-semibold leading-6 text-slate-950">
          {item.title}
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {item.description}
        </p>
      </div>
    </article>
  );
}

export default function Blog() {
  return (
    <div className="min-h-screen bg-[#FFFFFF] text-slate-900">
      <MarketingHeader />

      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-0 top-0 h-72 w-72 rounded-full bg-[#cfe3ff]/40 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-72 h-96 w-96 rounded-full bg-[#d9e9ff]/35 blur-3xl" />

        <div className="relative mx-auto w-full max-w-[1440px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
          <section className="border-0 border-b border-b-[#DFDFDF] bg-transparent pb-3">
            <div className="grid grid-cols-2 items-end gap-x-3 gap-y-3 sm:grid-cols-5">
              {categoryTabs.map((tab) => (
                <a
                  key={tab.label}
                  href={tab.href}
                  aria-current={tab.active ? "page" : undefined}
                  className={[
                    "inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 sm:px-5",
                    tab.active
                      ? "justify-self-start bg-[#CAD7E9] text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.06)]"
                      : "text-slate-600 hover:text-slate-950",
                  ].join(" ")}
                >
                  {tab.label}
                </a>
              ))}
            </div>
          </section>

          <section id="blog-hero" className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.88fr)]">
            <article className="overflow-hidden rounded-[36px] border border-slate-200/70 bg-[#0f2142] text-white shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
              <div className="grid min-h-full gap-0 lg:grid-cols-[minmax(0,1.02fr)_minmax(340px,0.98fr)]">
                <div className="flex flex-col justify-between gap-8 p-7 sm:p-10 lg:p-12">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-white/[0.15] bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/90">
                      Featured story
                    </span>
                    <span className="rounded-full border border-white/[0.15] bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
                      Guide
                    </span>
                  </div>

                  <div className="max-w-xl">
                    <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl lg:text-[3.4rem] lg:leading-[1.03]">
                      Mastering SEO with AI Powered Search Intelligence
                    </h1>
                    <p className="mt-5 text-base leading-8 text-slate-200 sm:text-lg">
                      Learn how to track rankings, discover content opportunities,
                      analyze competitors, and improve your visibility across
                      Google and AI search engines.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.08] px-4 py-3 backdrop-blur-sm">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
                        Updated
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        June 2026
                      </p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/[0.08] px-4 py-3 backdrop-blur-sm">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
                        Read time
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">8 min</p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/[0.08] px-4 py-3 backdrop-blur-sm">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
                        Format
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        Editorial guide
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      to="/solutions"
                      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-transform hover:-translate-y-0.5"
                    >
                      Explore solutions
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to="/audit"
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.15]"
                    >
                      Book demo
                    </Link>
                  </div>
                </div>

                <div className="relative min-h-[340px] lg:min-h-full">
                  <VisualPanel
                    title="AI visibility tracking in action"
                    subtitle="A unified dashboard for rankings, prompts, mentions, and competitor movement."
                  />
                  <div className="absolute inset-x-5 bottom-5 rounded-[28px] border border-white/[0.15] bg-white/[0.12] p-4 backdrop-blur-md">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/[0.15] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white">
                        SEO
                      </span>
                      <span className="rounded-full bg-white/[0.15] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white">
                        AI search
                      </span>
                      <span className="rounded-full bg-white/[0.15] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white">
                        Reporting
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <aside className="rounded-[36px] border border-slate-200/70 bg-white/[0.85] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#4C89C5]">
                    Latest updates
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                    Top stories
                  </h2>
                </div>
                <div className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#1f4974]">
                  Live
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {featuredUpdates.map((item, index) => (
                  <MiniStoryRow key={item.title} item={item} index={index} />
                ))}
              </div>
            </aside>
          </section>

          <section id="top-stories" className="mt-16 scroll-mt-28">
            <SectionHeader
              eyebrow="Editorial"
              title="Top Stories"
              description="These are the headline stories and frameworks that teams can apply immediately."
            />

            <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {topStories.map((story, index) => (
                <article
                  key={story.title}
                  className="overflow-hidden rounded-[30px] border border-slate-200/70 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
                >
                  <VisualPanel
                    title={story.title}
                    subtitle={story.description}
                    compact
                  />
                  <div className="p-6">
                    <div className="flex flex-wrap gap-2">
                      {story.metrics.map((metric) => (
                        <span
                          key={metric}
                          className="inline-flex items-center rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#1f4974]"
                        >
                          {metric}
                        </span>
                      ))}
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                      {story.title}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {story.description}
                    </p>
                    <div className="mt-5 flex items-center justify-between text-sm">
                      <span className="text-slate-500">Story {index + 1}</span>
                      <a
                        href="#guide"
                        className="inline-flex items-center gap-2 font-semibold text-[#1f4974] transition-colors hover:text-[#4C89C5]"
                      >
                        Read more
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="product-topics" className="mt-16 scroll-mt-28">
            <SectionHeader
              eyebrow="Topics"
              title="Product based topics"
              description="Each product area reflects a different lens on the same visibility story: track it, compare it, and improve it."
            />

            <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {productTopics.map((topic, index) => (
                <article
                  key={topic.title}
                  className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1f4974]">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                    {topic.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {topic.description}
                  </p>
                  <div className="mt-5 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full w-2/3 rounded-full bg-[#4C89C5]" />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="case-studies" className="mt-16 scroll-mt-28">
            <SectionHeader
              eyebrow="Proof"
              title="Case Studies"
              description="A few examples of how a structured SEO and AI visibility workflow turns into measurable growth."
            />

            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              {caseStudies.map((study) => (
                <article
                  key={study.title}
                  className="overflow-hidden rounded-[32px] border border-slate-200/70 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
                >
                  <div className="grid h-full gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="p-6 sm:p-7">
                      <VisualPanel
                        title={study.title}
                        subtitle="Before / after style card used in the Figma layout."
                      />
                    </div>
                    <div className="flex flex-col justify-between p-6 sm:p-7">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#4C89C5]">
                          Case study
                        </p>
                        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                          {study.title}
                        </h3>
                        <p className="mt-3 text-sm leading-7 text-slate-600">
                          {study.description}
                        </p>
                      </div>

                      <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        {study.results.map((result) => (
                          <div
                            key={result}
                            className="rounded-2xl border border-slate-200 bg-[#f8fbff] px-4 py-3 text-sm font-semibold text-slate-700"
                          >
                            {result}
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <Link
                          to="/solutions"
                          className="inline-flex items-center gap-2 rounded-full bg-[#4C89C5] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3d77b3]"
                        >
                          View solution
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                          to="/pricing"
                          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                        >
                          Pricing
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="guide" className="mt-16 scroll-mt-28">
            <SectionHeader
              eyebrow="Guide"
              title="Guide 1"
              description="A long-form, article-style section with a right-side table of contents, matching the Figma layout."
            />

            <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.28fr)_320px]">
              <article className="overflow-hidden rounded-[32px] border border-slate-200/70 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                <div className="p-6 sm:p-8">
                  <VisualPanel
                    title="Guide article cover"
                    subtitle="A lightweight placeholder for the article imagery in the Figma screen."
                  />
                </div>

                <div className="px-6 pb-6 sm:px-8 sm:pb-8">
                  <div
                    id="guide-overview"
                    className="flex flex-wrap items-center gap-3"
                  >
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#1f4974]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Guide 1
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                      <CalendarDays className="h-3.5 w-3.5" />
                      June 2026
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Updated research
                    </span>
                  </div>

                  <h3 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
                    Mastering SEO with AI Powered Search Intelligence
                  </h3>
                  <p className="mt-4 text-base leading-8 text-slate-600">
                    The modern visibility stack is no longer just about ranking
                    on Google. Teams now need to understand how AI engines,
                    answer surfaces, and prompt-driven discovery affect brand
                    demand and content performance.
                  </p>

                  <div className="mt-8 space-y-8">
                    <section id="guide-track" className="scroll-mt-28">
                      <h4 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                        Track rankings
                      </h4>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        Use a consistent tracking rhythm to understand how pages
                        move after each content update, technical fix, or new
                        search trend.
                      </p>
                      <ul className="mt-4 grid gap-3 text-sm leading-7 text-slate-700 sm:grid-cols-2">
                        <li className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                          Monitor the target queries that matter most to revenue.
                        </li>
                        <li className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                          Review rank movement weekly, not just monthly.
                        </li>
                        <li className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                          Compare Google visibility with AI citation patterns.
                        </li>
                        <li className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                          Flag drops before they create pipeline friction.
                        </li>
                      </ul>
                    </section>

                    <section id="guide-discover" className="scroll-mt-28">
                      <h4 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                        Discover opportunities
                      </h4>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        Prompt data and competitor scans reveal the content gaps
                        that should shape your roadmap. This is where product,
                        content, and SEO teams can align on priority topics.
                      </p>
                    </section>

                    <section id="guide-analyze" className="scroll-mt-28">
                      <h4 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                        Analyze competitors
                      </h4>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        Identify which competing brands are consistently present
                        in the answers your buyers read, then close the
                        information gap with stronger pages and clearer proof.
                      </p>
                    </section>

                    <section id="guide-improve" className="scroll-mt-28">
                      <h4 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                        Improve visibility
                      </h4>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        Combine better briefs, refreshed content, and reporting
                        discipline to build a repeatable system instead of a one
                        off campaign.
                      </p>
                    </section>
                  </div>
                </div>
              </article>

              <aside className="h-fit rounded-[32px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] lg:sticky lg:top-24">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#4C89C5]">
                  Contents
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                  Table of contents
                </h3>
                <nav className="mt-5 space-y-2">
                  {guideSections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-white hover:text-slate-950"
                    >
                      <span>{section.label}</span>
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  ))}
                </nav>

                <div className="mt-6 rounded-[28px] bg-[#0f2142] p-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/70">
                    Quick note
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-200">
                    The guide is intentionally long-form so it feels like the
                    article experience shown in the Figma screen.
                  </p>
                </div>
              </aside>
            </div>
          </section>

          <section className="mt-16 grid gap-6 lg:grid-cols-[minmax(0,1.22fr)_minmax(320px,0.78fr)]">
            <article className="rounded-[32px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1f4974]">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#4C89C5]">
                    Feedback
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                    Comments and share
                  </h3>
                </div>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(260px,0.95fr)]">
                <div className="rounded-[28px] bg-[#f8fbff] p-5">
                  <label
                    htmlFor="blog-comment"
                    className="text-sm font-semibold text-slate-800"
                  >
                    Leave a comment
                  </label>
                  <textarea
                    id="blog-comment"
                    rows={5}
                    placeholder="Tell us what you would add, challenge, or test next."
                    className="mt-3 w-full rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#4C89C5] focus:ring-4 focus:ring-[#4C89C5]/10"
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full bg-[#4C89C5] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3d77b3]"
                    >
                      Post comment
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                    >
                      <Share2 className="h-4 w-4" />
                      Share feedback
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] bg-[#0f2142] p-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">
                    Share this article
                  </p>
                  <div className="mt-4 space-y-3">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/[0.15]"
                    >
                      Copy link
                      <Share2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/[0.15]"
                    >
                      Share on LinkedIn
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/[0.15]"
                    >
                      Share on X
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </article>

            <aside className="rounded-[32px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#4C89C5]">
                Contact
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                Need help building this workflow?
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Use this block as the blog-side contact summary from the Figma
                design.
              </p>

              <div className="mt-6 space-y-3">
                <div className="rounded-2xl bg-[#f8fbff] px-4 py-3 text-sm text-slate-700">
                  Call us: +1 (999) 999-99-99
                </div>
                <div className="rounded-2xl bg-[#f8fbff] px-4 py-3 text-sm text-slate-700">
                  Email Us: info@searcheo.ai
                </div>
                <div className="rounded-2xl bg-[#f8fbff] px-4 py-3 text-sm text-slate-700">
                  Book Demo
                </div>
              </div>

              <Link
                to="/audit"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#4C89C5] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3d77b3]"
              >
                Start an audit
                <ArrowRight className="h-4 w-4" />
              </Link>
            </aside>
          </section>

          <section id="similar-articles" className="mt-16 scroll-mt-28">
            <SectionHeader
              eyebrow="More reading"
              title="Similar Articles"
              description="Keep the momentum going with related stories, product thinking, and workflow ideas."
            />

            <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {similarArticles.map((article) => (
                <article
                  key={article.title}
                  className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1f4974]">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Related
                    </div>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                    {article.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {article.description}
                  </p>
                  <a
                    href="#guide"
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#1f4974] transition-colors hover:text-[#4C89C5]"
                  >
                    Read article
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </article>
              ))}
            </div>
          </section>

          <footer
            id="footer-info"
            className="mt-16 rounded-[36px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8"
          >
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr_0.8fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#4C89C5]">
                  Information
                </p>
                <h3 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                  SearchEO AI
                </h3>
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
                  Build visibility for Google and AI search with a clean,
                  repeatable workflow that your whole team can use.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    to="/pricing"
                    className="inline-flex items-center gap-2 rounded-full bg-[#4C89C5] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3d77b3]"
                  >
                    Pricing
                  </Link>
                  <Link
                    to="/solutions"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    Solutions
                  </Link>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#4C89C5]">
                  Links
                </p>
                <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <Link to="/blog" className="transition-colors hover:text-slate-950">
                    Blog
                  </Link>
                  <Link
                    to="/pricing"
                    className="transition-colors hover:text-slate-950"
                  >
                    Pricing
                  </Link>
                  <Link
                    to="/solutions"
                    className="transition-colors hover:text-slate-950"
                  >
                    Solutions
                  </Link>
                  <Link to="/audit" className="transition-colors hover:text-slate-950">
                    Book Demo
                  </Link>
                  <a href="#guide" className="transition-colors hover:text-slate-950">
                    Guide
                  </a>
                  <a
                    href="#case-studies"
                    className="transition-colors hover:text-slate-950"
                  >
                    Case Studies
                  </a>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#4C89C5]">
                  Contact Us
                </p>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                    Call us: +1 (999) 999-99-99
                  </div>
                  <div className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                    Email Us: info@searcheo.ai
                  </div>
                  <div className="rounded-2xl bg-[#f8fbff] px-4 py-3">
                    Copyright 2026. All Rights Reserved. SeachEO AI
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
