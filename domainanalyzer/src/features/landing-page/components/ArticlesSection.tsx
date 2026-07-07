import React, { useEffect, useRef } from "react";
import articleImage from "../assets/dashboard-full.png";
import "./ArticlesSection.css";

type Article = {
  title: string;
  excerpt: string;
  href: string;
};

const ARTICLES: Article[] = [
  {
    title: "800 million weekly users and rising: ChatGPT is clearly the world's go-to AI companion",
    excerpt:
      "ChatGPT's meteoric rise continues. OpenAI CEO Sam Altman announced that the AI chatbot now boasts 800 million weekly active users.",
    href: "#",
  },
  {
    title: "How AI recommendation engines are shaping brand discovery across search and assistants",
    excerpt:
      "From prompt-driven queries to answer engines, brands now need visibility in the systems that summarize, cite, and recommend.",
    href: "#",
  },
  {
    title: "The new content race: winning citations, mentions, and market share in AI search",
    excerpt:
      "Modern content performance is no longer just about rankings. It's about earning references in the responses people trust.",
    href: "#",
  },
  {
    title: "Why enterprise teams are tracking prompts, citations, and competitor share in one workflow",
    excerpt:
      "AI search has created a new operating layer for growth teams, where prompt monitoring and citation intelligence work together.",
    href: "#",
  },
];

const LOOPED_ARTICLES = [...ARTICLES, ...ARTICLES, ...ARTICLES];
const DESKTOP_CARD_WIDTH = 558;
const DESKTOP_CARD_GAP = 10;
const EDGE_PEEK = 96;

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {direction === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}

export default function ArticlesSection() {
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = trackRef.current;

    if (!node) {
      return;
    }

    const getLoopMetrics = () => {
      const firstCard = node.children[0] as HTMLElement | undefined;
      const middleFirstCard = node.children[ARTICLES.length] as HTMLElement | undefined;

      if (!firstCard || !middleFirstCard) {
        return null;
      }

      return {
        segmentWidth: middleFirstCard.offsetLeft - firstCard.offsetLeft,
        middleStart: middleFirstCard.offsetLeft,
      };
    };

    const syncLoopPosition = () => {
      const metrics = getLoopMetrics();

      if (!metrics || metrics.segmentWidth <= 0) {
        return;
      }

      const { segmentWidth, middleStart } = metrics;

      if (node.scrollLeft < middleStart - segmentWidth / 2) {
        node.scrollLeft += segmentWidth;
      } else if (node.scrollLeft > middleStart + segmentWidth / 2) {
        node.scrollLeft -= segmentWidth;
      }
    };

    const setStartingPosition = () => {
      const metrics = getLoopMetrics();

      if (!metrics) {
        return;
      }

      const peekOffset =
        window.innerWidth >= 1024 ? DESKTOP_CARD_GAP + EDGE_PEEK : 0;

      node.scrollLeft = metrics.middleStart - peekOffset;
    };

    setStartingPosition();
    node.addEventListener("scroll", syncLoopPosition, { passive: true });
    window.addEventListener("resize", setStartingPosition);

    return () => {
      node.removeEventListener("scroll", syncLoopPosition);
      window.removeEventListener("resize", setStartingPosition);
    };
  }, []);

  const scrollCards = (direction: "left" | "right") => {
    const node = trackRef.current;

    if (!node) {
      return;
    }

    const amount = Math.min(node.clientWidth * 0.82, 568);
    node.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <section className="articles-section">
      <div className="articles-section__inner">
        <div className="articles-section__header">
          <div className="articles-section__copy">
            <p className="articles-section__eyebrow">Articles</p>
            <h2 className="articles-section__title">Stay ahead of what's next</h2>
            <p className="articles-section__subtitle">Everything you need to win AI recommendations.</p>
          </div>

          <div className="articles-section__controls">
            <button
              type="button"
              onClick={() => scrollCards("left")}
              className="articles-section__arrow articles-section__arrow--previous"
              aria-label="Previous articles"
            >
              <ArrowIcon direction="left" />
            </button>
            <button
              type="button"
              onClick={() => scrollCards("right")}
              className="articles-section__arrow articles-section__arrow--next"
              aria-label="Next articles"
            >
              <ArrowIcon direction="right" />
            </button>
          </div>
        </div>

        <div className="articles-section__rail-wrap">
          <div className="articles-section__edge-fade articles-section__edge-fade--left" />
          <div className="articles-section__edge-fade articles-section__edge-fade--right" />
          <div
            ref={trackRef}
            className="articles-section__rail carousel-scrollbar snap-x snap-mandatory"
          >
            {LOOPED_ARTICLES.map((article, index) => (
              <article
                key={`${article.title}-${index}`}
                className="articles-section__card snap-start"
              >
                <div className="articles-section__image-wrap">
                  <img
                    src={articleImage}
                    alt=""
                    className="articles-section__image"
                    loading="lazy"
                  />
                </div>

                <div className="articles-section__card-body">
                  <h3 className="articles-section__card-title">{article.title}</h3>
                  <p className="articles-section__card-excerpt">{article.excerpt}</p>
                  <a
                    href={article.href}
                    className="articles-section__card-link"
                  >
                    Read Full Article
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
