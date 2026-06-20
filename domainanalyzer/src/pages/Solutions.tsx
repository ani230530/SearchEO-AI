import { Link } from "react-router-dom";

import MarketingHeader from "@/components/marketing/MarketingHeader";

const solutions = [
  {
    title: "AI visibility audits",
    description:
      "See how your brand appears across AI answers, search engines, and recommendation surfaces.",
  },
  {
    title: "Competitor intelligence",
    description:
      "Understand who AI prefers in your category and where your content needs to catch up.",
  },
  {
    title: "Prompt tracking",
    description:
      "Track the prompts that matter to your business and use them to shape content strategy.",
  },
] as const;

export default function Solutions() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_55%,#f7f7f8_100%)] text-slate-900">
      <MarketingHeader />

      <main className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 lg:px-8">
        <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#4C89C5]">
              Solutions
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
              A simple stack for understanding and improving AI visibility
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Our product is designed to help marketing teams see the gap,
              prioritize the next move, and measure progress without extra
              complexity.
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold text-slate-900">What you get</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
              <li>• Visibility audits across key AI models and search surfaces</li>
              <li>• Competitive comparisons that highlight missed opportunities</li>
              <li>• Tracking and reporting to keep the team aligned</li>
            </ul>
          </div>
        </section>

        <section className="mt-12 grid gap-6 md:grid-cols-3">
          {solutions.map((solution) => (
            <article
              key={solution.title}
              className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
            >
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                {solution.title}
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                {solution.description}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-12 rounded-[32px] bg-[#0f2742] px-6 py-8 text-white shadow-[0_18px_60px_rgba(15,39,66,0.18)] sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/70">
                Next step
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                Start with an AI visibility audit
              </h2>
            </div>
            <Link
              to="/audit"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0f2742] transition-colors hover:bg-slate-100"
            >
              Launch audit
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
