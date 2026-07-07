import React from "react";
import "./TrustAndStatsSection.css";
type LogoItem = {
  src: string;
  alt: string;
  className?: string;
};

const TRUSTED_LOGOS_TOP: LogoItem[] = [
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
];

const TRUSTED_LOGOS_BOTTOM: LogoItem[] = [
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
  { src: "/Searcheo-full-logo.svg", alt: "SearchEO full logo", className: "h-6 w-auto" },
];

const STATS = [
  { value: "12,000+", label: "Biggest Prompt Library" },
  { value: "50,000+", label: "Citations analyzed" },
  { value: "1,500+", label: "Content opportunities identified" },
];

function LogoMarquee({ items, reverse = false }: { items: LogoItem[]; reverse?: boolean }) {
  const repeated = [...items, ...items];

  return (
    <div
      className="logo-marquee"
      style={{
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 16%, black 84%, transparent 100%)",
        maskImage:
          "linear-gradient(to right, transparent 0%, black 16%, black 84%, transparent 100%)",
      }}
    >
      <div className="logo-marquee__fade logo-marquee__fade--left" />
      <div className="logo-marquee__fade logo-marquee__fade--right" />
      <div
        className={`trusted-marquee-track relative z-[1] flex w-max items-center gap-12 py-6 ${
          reverse ? "trusted-marquee-reverse" : "trusted-marquee-forward"
        }`}
      >
        {repeated.map((logo, index) => (
          <div key={`${logo.alt}-${index}`} className="logo-marquee__item">
            <img
              src={logo.src}
              alt={logo.alt}
              className={`logo-marquee__image ${logo.className ?? ""}`}
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TrustedBySection() {
  return (
    <section className="trust-section">
      <div className="trust-section__inner">
        <div className="trust-section__title-wrap">
          <h2 className="trust-section__title">
            Trusted by agencies, SaaS startups, enterprise growth teams, and Fortune 500 brands.
          </h2>
        </div>

        <div className="trust-section__marquees">
          <div className="trust-section__marquee-row">
            <LogoMarquee items={TRUSTED_LOGOS_TOP} />
          </div>
          <div className="trust-section__marquee-row">
            <LogoMarquee items={TRUSTED_LOGOS_BOTTOM} reverse />
          </div>
        </div>
      </div>
    </section>
  );
}

function InnovationSection() {
  return (
    <section className="innovation-section">
      <div className="innovation-section__bg" />
      <div className="innovation-section__glow" />

      <div className="innovation-section__inner">
        <div className="innovation-section__content">
          <div className="innovation-section__title-wrap">
            <h2 className="innovation-section__title">
              <span>Innovation.</span>{" "}
              <span className="innovation-section__title-accent">Engineered.</span>
            </h2>
          </div>

          <div className="innovation-section__stats">
            {STATS.map((stat, index) => (
              <div
                key={stat.label}
                className={`innovation-section__stat ${
                  index < STATS.length - 1 ? "innovation-section__stat--with-right-border" : ""
                }`}
              >
                <div className="innovation-section__stat-content">
                  <div className="innovation-section__stat-value">{stat.value}</div>
                  <div className="innovation-section__stat-label">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function TrustAndStatsSection() {
  return (
    <div>
      <TrustedBySection />
      <InnovationSection />
    </div>
  );
}
