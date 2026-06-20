import { useState } from "react";
import { SiteHeader } from "../components/SiteHeader";

const BLOG_TABS = ["All", "Product", "Guide", "Case Study", "News"] as const;

export default function BlogsPage() {
  const [activeTab, setActiveTab] = useState<(typeof BLOG_TABS)[number]>("All");

  return (
    <section className="blogs-page">
      <SiteHeader />

      <main className="blogs-page__main">
        <div className="blogs-page__shell">
          <nav className="blogs-page__tabs" aria-label="Blog categories">
            {BLOG_TABS.map((tab) => {
              const isActive = tab === activeTab;

              return (
                <button
                  key={tab}
                  type="button"
                  className={`blogs-page__tab${isActive ? " blogs-page__tab--active" : ""}`}
                  aria-pressed={isActive}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              );
            })}
          </nav>

          <div className="blogs-page__content" aria-live="polite">
            <p className="blogs-page__content-eyebrow">Blogs</p>
            <h1 className="blogs-page__content-title">{activeTab} posts coming soon.</h1>
            <p className="blogs-page__content-copy">
              Blog content will appear here.
            </p>
          </div>
        </div>
      </main>
    </section>
  );
}
