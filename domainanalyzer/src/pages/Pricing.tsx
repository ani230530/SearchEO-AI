import { Link } from "react-router-dom";

import MarketingHeader from "@/components/marketing/MarketingHeader";

const plans = [
  {
    name: "Starter",
    price: "Best for small teams",
    bullets: ["Core audit flow", "Basic competitor visibility", "Manual review workflow"],
    cta: "Start audit",
    highlight: false,
  },
  {
    name: "Growth",
    price: "Recommended",
    bullets: ["Tracked prompts", "Reporting dashboard", "Priority insights"],
    cta: "Get started",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "For larger orgs",
    bullets: ["Multi-brand coverage", "Custom onboarding", "Team collaboration"],
    cta: "Talk to us",
    highlight: false,
  },
] as const;

export default function Pricing() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fbff_0%,_#ffffff_38%,_#f7f7f8_100%)] text-slate-900">
      <MarketingHeader />

      <main className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 lg:px-8">
        <section className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#4C89C5]">
            Pricing
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
            Flexible plans that fit the way teams actually buy software
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            Start small with the audit flow, then expand into tracking,
            reporting, and collaboration as your needs grow.
          </p>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={
                plan.highlight
                  ? "rounded-[30px] border border-[#4C89C5]/25 bg-[#0f2742] p-6 text-white shadow-[0_18px_60px_rgba(15,39,66,0.18)]"
                  : "rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
              }
            >
              <p
                className={
                  plan.highlight
                    ? "text-sm font-semibold text-white/70"
                    : "text-sm font-semibold text-slate-500"
                }
              >
                {plan.price}
              </p>
              <h2
                className={
                  plan.highlight
                    ? "mt-4 text-2xl font-semibold tracking-[-0.03em] text-white"
                    : "mt-4 text-2xl font-semibold tracking-[-0.03em] text-slate-950"
                }
              >
                {plan.name}
              </h2>
              <ul
                className={
                  plan.highlight
                    ? "mt-5 space-y-3 text-sm leading-7 text-white/80"
                    : "mt-5 space-y-3 text-sm leading-7 text-slate-600"
                }
              >
                {plan.bullets.map((bullet) => (
                  <li key={bullet}>• {bullet}</li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  to={plan.highlight ? "/audit" : "/auth"}
                  className={
                    plan.highlight
                      ? "inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0f2742] transition-colors hover:bg-slate-100"
                      : "inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  }
                >
                  {plan.cta}
                </Link>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
