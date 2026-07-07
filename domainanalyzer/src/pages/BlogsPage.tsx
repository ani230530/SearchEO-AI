import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import FooterSection from "../components/ui/footer";
import { apiGet } from "@/services/apiClient";
import { Loader2, Calendar, User, Clock } from "lucide-react";

const BLOG_TABS = ["All", "Product", "Guide", "Case Study", "News"] as const;

interface PublishedPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  heroImageUrl: string;
  heroImageAlt: string;
  seoTitle: string;
  seoDescription: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readTimeMinutes: number;
  authorName: string;
  authorTitle: string;
  categoryName: string;
  categorySlug: string;
}

const FEATURED_STORIES = [
  {
    kicker: "Product Features",
    title: "Mastering SEO with AI Powered Search Intelligence",
    description:
      "Learn how to track rankings, discover content opportunities, analyze competitors, and improve your visibility across Google and AI search engines.",
    date: "January 18, 2025",
    readTime: "12 min read",
    image: "/office-bg.png",
    alt: "Team working together in a bright office",
  },
  {
    kicker: "Product Features",
    title: "How to Build an SEO Strategy That Delivers Consistent Growth",
    description:
      "Discover a proven framework for keyword research, content planning, and technical optimization that drives sustainable organic traffic.",
    date: "January 18, 2025",
    readTime: "10 min read",
    image: "/ai-checker.png",
    alt: "Analytics dashboard with SEO performance visuals",
  },
] as const;

const PRESS_ITEMS = [
  "SearchEO AI Launches New AI Visibility Dashboard",
  "SearchEO AI Introduces Competitor Intelligence Suite",
  "New Prompt Library Helps Teams Scale Content Production",
  "SearchEO AI Expands Enterprise Reporting Features",
  "SearchEO AI Rolls Out Advanced Topic Clustering",
  "SearchEO AI Adds Multi-Location Rank Tracking",
  "SearchEO AI Improves AI Search Monitoring Alerts",
  "SearchEO AI Debuts Client-Ready Reporting Templates",
] as const;

const TOP_STORY_HEADLINES = [
  "How Brands Are Winning Traffic Beyond Google",
  "The New Search Landscape: SEO, GEO, and AI Discovery",
  "What Top Performing Websites Do Differently in 2026",
  "Why Traditional Keyword Tracking Is No Longer Enough",
  "From Keywords to Knowledge Graphs: The Future of Visibility",
] as const;

const TRENDING_STORIES = [
  "How to Rank in AI Search Results Without More Backlinks",
  "The Rise of Entity Based SEO and Topical Authority",
  "AI Overviews Are Changing Organic Search Forever",
  "Why Traditional Keyword Tracking Is No Longer Enough",
] as const;

const PRODUCT_TOPICS = [
  {
    label: "AI Visibility",
    title: "Learn how brands are measuring performance across ChatGPT, Gemini, Claude, and Perplexity.",
    author: "By John Doe",
    image: "/ai-checker.png",
    alt: "Analytics dashboard with AI visibility metrics",
  },
  {
    label: "Competitor Intelligence",
    title: "Identify content gaps, ranking opportunities, and competitive advantages using real search data.",
    author: "By John Doe",
    image: "/Campaign.png",
    alt: "Campaign and audience targeting illustration",
  },
  {
    label: "Content Optimization",
    title: "Discover recommendations that improve rankings, engagement, and AI citation potential.",
    author: "By John Doe",
    image: "/office-bg.png",
    alt: "Team collaborating in a modern office",
  },
  {
    label: "Keyword Research",
    title: "Find high-intent keywords with strong ranking opportunities and lower competition.",
    author: "By John Doe",
    image: "/placeholder.svg",
    alt: "Placeholder illustration for keyword research",
  },
] as const;

const CASE_STUDIES = [
  {
    title: "How a SaaS Company Increased Organic Traffic by 220%",
    summary: "A concise look at the content and technical shifts that unlocked sustained growth.",
    image: "/Campaign.png",
    alt: "Team reviewing campaign performance",
  },
  {
    title: "From Page 3 to Page 1 in Six Months",
    summary: "How focused optimization and better search intent mapping transformed visibility.",
    image: "/office-bg.png",
    alt: "Office collaboration scene",
  },
  {
    title: "Improving AI Visibility Across Multiple Platforms",
    summary: "A practical framework for tracking presence in modern AI-powered search surfaces.",
    image: "/ai-checker.png",
    alt: "Analytics dashboard and AI visibility visuals",
  },
  {
    title: "Scaling Content Production Without Sacrificing Quality",
    summary: "A repeatable content workflow that kept output high while protecting standards.",
    image: "/placeholder.svg",
    alt: "Placeholder illustration for scaling content production",
  },
] as const;

const GUIDE_CARDS = [
  {
    label: "Guide 1",
    category: "Analysis",
    title: "Technical SEO Checklist for 2026",
    author: "By John Doe",
    image: "/office-bg.png",
    alt: "Guidebook on a wooden desk",
    topics: [
      "Website Crawlability & Indexing",
      "Core Web Vitals & Performance",
      "On-Page Technical Optimization",
    ],
  },
  {
    label: "Guide 2",
    category: "Analysis",
    title: "Building Topical Authority Through Content Clusters",
    author: "By John Doe",
    image: "/ai-checker.png",
    alt: "Content planning and search performance visuals",
    topics: [
      "What Is Topical Authority and Why It Matters",
      "Building Effective Content Clusters",
      "Internal Linking and Entity Relationships",
    ],
  },
] as const;

const ArrowIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 13 13 3" />
    <path d="M6 3h7v7" />
  </svg>
);

export default function BlogsPage() {
  const [activeTab, setActiveTab] = useState<(typeof BLOG_TABS)[number]>("All");
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const handleReadPost = (post: PublishedPost | null | undefined) => {
    if (post && post.slug) {
      navigate(`/blogs/${post.slug}`);
    }
  };

  useEffect(() => {
    async function loadPosts() {
      try {
        setLoading(true);
        const res = await apiGet<{ posts: PublishedPost[] }>("/blog");
        setPosts(res.posts || []);
      } catch (error) {
        console.error("Failed to load blog posts:", error);
      } finally {
        setLoading(false);
      }
    }
    loadPosts();
  }, []);

  const filteredPosts = posts.filter(post => {
    if (activeTab === "All") return true;
    if (!post.categoryName) return false;
    const catName = post.categoryName.toLowerCase();
    const tabName = activeTab.toLowerCase();
    return catName === tabName || catName.includes(tabName);
  });

  // Dynamic content mapping with fallbacks to static mock data if DB has no published posts
  const displayFeatured = posts.length > 0
    ? posts.slice(0, 2).map(p => ({
        kicker: p.categoryName,
        title: p.title,
        description: p.excerpt,
        date: p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "",
        readTime: `${p.readTimeMinutes || 5} min read`,
        image: p.heroImageUrl || "/office-bg.png",
        alt: p.heroImageAlt || p.title,
        rawPost: p
      }))
    : FEATURED_STORIES;

  const displayPress = posts.length > 2
    ? posts.slice(2, 10).map(p => ({ title: p.title, rawPost: p }))
    : PRESS_ITEMS.map(item => ({ title: item, rawPost: null }));

  const displayProductTopics = posts.filter(p => p.categoryName.toLowerCase() === "product").length > 0
    ? posts.filter(p => p.categoryName.toLowerCase() === "product").slice(0, 4).map(p => ({
        label: p.categoryName,
        title: p.title,
        author: `By ${p.authorName || "Admin"}`,
        image: p.heroImageUrl || "/Campaign.png",
        alt: p.heroImageAlt || p.title,
        rawPost: p
      }))
    : PRODUCT_TOPICS;

  const displayCaseStudies = posts.filter(p => p.categoryName.toLowerCase() === "case study").length > 0
    ? posts.filter(p => p.categoryName.toLowerCase() === "case study").slice(0, 4).map(p => ({
        title: p.title,
        summary: p.excerpt,
        image: p.heroImageUrl || "/Campaign.png",
        alt: p.heroImageAlt || p.title,
        rawPost: p
      }))
    : CASE_STUDIES;

  const displayGuides = posts.filter(p => p.categoryName.toLowerCase() === "guide").length > 0
    ? posts.filter(p => p.categoryName.toLowerCase() === "guide").slice(0, 2).map((p, idx) => ({
        label: `Guide ${idx + 1}`,
        category: p.categoryName,
        title: p.title,
        author: `By ${p.authorName || "Admin"}`,
        image: p.heroImageUrl || "/office-bg.png",
        alt: p.heroImageAlt || p.title,
        topics: [p.excerpt || "General overview", "In-depth guide guidelines", "Implementation steps"],
        rawPost: p
      }))
    : GUIDE_CARDS;

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

          {activeTab === "All" ? (
            <>
              {/* Featured Stories & Announcements Grid */}
              <section className="blogs-page__content" aria-labelledby="blogs-feature-grid-title">
                <div className="blogs-page__feature-column">
                  <div className="blogs-page__section-heading">
                    <p className="blogs-page__section-label">
                      Product Features <ArrowIcon />
                    </p>
                    <h2 id="blogs-feature-grid-title" className="blogs-page__section-title">
                      Featured product stories
                    </h2>
                  </div>

                  <div className="blogs-page__feature-stack">
                    {displayFeatured.map((story, idx) => (
                      <article key={idx} className="blogs-page__feature-card">
                        <div className="blogs-page__feature-copy">
                          <p className="blogs-page__feature-kicker">
                            {story.kicker} <ArrowIcon />
                          </p>
                          <h3 className="blogs-page__feature-title">{story.title}</h3>
                          <p className="blogs-page__feature-description">{story.description}</p>
                          <div className="blogs-page__feature-meta" aria-label="Article metadata">
                            <span>{story.date}</span>
                            <span className="blogs-page__feature-meta-dot" aria-hidden="true" />
                            <span>{story.readTime}</span>
                          </div>
                          <button
                            type="button"
                            className="blogs-page__feature-link"
                            onClick={() => {
                              if ('rawPost' in story && story.rawPost) {
                                handleReadPost(story.rawPost);
                              }
                            }}
                          >
                            Continue Reading <ArrowIcon />
                          </button>
                        </div>

                        <div className="blogs-page__feature-media">
                          <img src={story.image} alt={story.alt} className="blogs-page__feature-image" />
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <aside className="blogs-page__press-panel" aria-labelledby="blogs-press-title">
                  <div className="blogs-page__section-heading blogs-page__section-heading--compact">
                    <p className="blogs-page__section-label">
                      News Release &amp; Press Releases <ArrowIcon />
                    </p>
                    <h2 id="blogs-press-title" className="blogs-page__section-title blogs-page__section-title--compact">
                      Latest company announcements
                    </h2>
                  </div>

                  <ul className="blogs-page__press-list">
                    {displayPress.map((item, index) => (
                      <li key={index} className="blogs-page__press-item">
                        <button
                          type="button"
                          className="blogs-page__press-link"
                          onClick={() => {
                            if (item.rawPost) handleReadPost(item.rawPost);
                          }}
                        >
                          <span className="blogs-page__press-link-text">{item.title}</span>
                          <ArrowIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>
              </section>

              {/* Top Stories Section */}
              <section className="blogs-page__top-stories" aria-labelledby="blogs-top-stories-title">
                <h2 id="blogs-top-stories-title" className="blogs-page__top-stories-title">
                  Top Stories
                </h2>

                <div className="blogs-page__top-stories-grid">
                  <article className="blogs-page__top-story-card">
                    <div className="blogs-page__top-story-art" aria-hidden="true">
                      <span className="blogs-page__top-story-art-letter blogs-page__top-story-art-letter--a">
                        A
                      </span>
                      <span className="blogs-page__top-story-art-letter blogs-page__top-story-art-letter--i">
                        I
                      </span>
                    </div>

                    <div className="blogs-page__top-story-copy">
                      <p className="blogs-page__top-story-category">Analysis</p>
                      <h3 className="blogs-page__top-story-heading">
                        The Future of SEO Is AI Visibility
                      </h3>
                      <p className="blogs-page__top-story-author">By John Doe</p>
                    </div>
                  </article>

                  <div className="blogs-page__top-story-links" aria-label="Top story headlines">
                    {posts.length > 0 ? (
                      posts.slice(0, 5).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="blogs-page__top-story-link"
                          onClick={() => handleReadPost(p)}
                        >
                          <span>{p.title}</span>
                        </button>
                      ))
                    ) : (
                      TOP_STORY_HEADLINES.map((headline) => (
                        <button key={headline} type="button" className="blogs-page__top-story-link">
                          <span>{headline}</span>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="blogs-page__top-story-trending" aria-labelledby="blogs-trending-title">
                    <p id="blogs-trending-title" className="blogs-page__top-story-trending-label">
                      Trending
                    </p>

                    <ol className="blogs-page__top-story-trending-list">
                      {TRENDING_STORIES.map((item, index) => (
                        <li key={item} className="blogs-page__top-story-trending-item">
                          <span className="blogs-page__top-story-trending-index">{index + 1}</span>
                          <span className="blogs-page__top-story-trending-text">{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </section>

              {/* Product Topics Section */}
              <section className="blogs-page__product-topics" aria-labelledby="blogs-product-topics-title">
                <h2 id="blogs-product-topics-title" className="blogs-page__product-topics-title">
                  Product based topics
                </h2>

                <div className="blogs-page__product-topics-grid">
                  {displayProductTopics.map((topic, idx) => (
                    <article
                      key={idx}
                      className="blogs-page__product-topic-card cursor-pointer"
                      onClick={() => {
                        if ('rawPost' in topic && topic.rawPost) handleReadPost(topic.rawPost);
                      }}
                    >
                      <div className="blogs-page__product-topic-copy">
                        <p className="blogs-page__product-topic-label">{topic.label}</p>
                        <h3 className="blogs-page__product-topic-title">{topic.title}</h3>
                        <p className="blogs-page__product-topic-author">{topic.author}</p>
                      </div>

                      <div className="blogs-page__product-topic-media">
                        <img
                          src={topic.image}
                          alt={topic.alt}
                          className="blogs-page__product-topic-image"
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {/* Case Studies Section */}
              <section className="blogs-page__case-studies" aria-labelledby="blogs-case-studies-title">
                <h2 id="blogs-case-studies-title" className="blogs-page__case-studies-title">
                  Case Studies
                </h2>

                <div className="blogs-page__case-studies-grid">
                  {displayCaseStudies.map((study, idx) => (
                    <article
                      key={idx}
                      className="blogs-page__case-study-card cursor-pointer"
                      onClick={() => {
                        if ('rawPost' in study && study.rawPost) handleReadPost(study.rawPost);
                      }}
                    >
                      <div className="blogs-page__case-study-media">
                        <img
                          src={study.image}
                          alt={study.alt}
                          className="blogs-page__case-study-image"
                        />
                      </div>

                      <div className="blogs-page__case-study-copy">
                        <h3 className="blogs-page__case-study-title">{study.title}</h3>
                        <p className="blogs-page__case-study-summary">{study.summary}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {/* Guides Section */}
              <section className="blogs-page__guides" aria-label="Guides">
                <div className="blogs-page__guides-grid">
                  {displayGuides.map((guide, idx) => (
                    <article
                      key={idx}
                      className="blogs-page__guide-card cursor-pointer"
                      onClick={() => {
                        if ('rawPost' in guide && guide.rawPost) handleReadPost(guide.rawPost);
                      }}
                    >
                      <h2 className="blogs-page__guide-card-label">{guide.label}</h2>

                      <div className="blogs-page__guide-card-grid">
                        <div className="blogs-page__guide-card-main">
                          <div className="blogs-page__guide-card-media">
                            <img
                              src={guide.image}
                              alt={guide.alt}
                              className="blogs-page__guide-card-image"
                            />
                          </div>

                          <div className="blogs-page__guide-card-copy">
                            <p className="blogs-page__guide-card-category">{guide.category}</p>
                            <h3 className="blogs-page__guide-card-title">{guide.title}</h3>
                            <p className="blogs-page__guide-card-author">{guide.author}</p>
                          </div>
                        </div>

                        <div className="blogs-page__guide-card-topics" aria-label={`${guide.label} topics`}>
                          {guide.topics.map((topic) => (
                            <div key={topic} className="blogs-page__guide-card-topic">
                              {topic}
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {/* Newsletter Section */}
              <section className="newsletter-cta-section" aria-labelledby="newsletter-cta-title">
                <div className="newsletter-cta">
                  <div className="newsletter-cta__content">
                    <div className="newsletter-cta__copy">
                      <h2 id="newsletter-cta-title" className="newsletter-cta__title">
                        Sign up for Newsletter
                      </h2>
                      <p className="newsletter-cta__description">
                        Sign Up for the newsletter for latest update
                      </p>
                    </div>

                    <form
                      className="newsletter-cta__form"
                      onSubmit={(event) => {
                        event.preventDefault();
                      }}
                    >
                      <label className="newsletter-cta__sr-only" htmlFor="newsletter-email">
                        Your email
                      </label>
                      <div className="newsletter-cta__field">
                        <input
                          id="newsletter-email"
                          className="newsletter-cta__input"
                          type="email"
                          name="email"
                          placeholder="YOUR EMAIL"
                          autoComplete="email"
                        />
                        <button type="submit" className="newsletter-cta__button" aria-label="Subscribe">
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 12h14" />
                            <path d="m13 6 6 6-6 6" />
                          </svg>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </section>
            </>
          ) : (
            /* Selected category view — renders the clean dynamic story list styled exactly like the screenshot */
            <div className="blogs-page__feature-column" style={{ maxWidth: "100%", flex: 1 }}>
              <div className="blogs-page__section-heading">
                <p className="blogs-page__section-label">
                  {activeTab} Articles <ArrowIcon />
                </p>
                <h2 className="blogs-page__section-title">
                  Published {activeTab} Posts
                </h2>
              </div>

              {loading ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-20 text-slate-500 bg-white border border-slate-200 rounded-2xl shadow-sm">
                  <p className="text-lg font-medium">No published blogs found in this category.</p>
                  <p className="text-sm text-slate-400 mt-1">Generate and publish a blog post from the CMS admin panel to see it here.</p>
                </div>
              ) : (
                <div className="blogs-page__feature-stack">
                  {filteredPosts.map((post) => (
                    <article key={post.id} className="blogs-page__feature-card">
                      <div className="blogs-page__feature-copy">
                        <p className="blogs-page__feature-kicker">
                          {post.categoryName} <ArrowIcon />
                        </p>
                        <h3 className="blogs-page__feature-title">{post.title}</h3>
                        <p className="blogs-page__feature-description">{post.excerpt}</p>
                        <div className="blogs-page__feature-meta" aria-label="Article metadata">
                          <span>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}</span>
                          <span className="blogs-page__feature-meta-dot" aria-hidden="true" />
                          <span>{post.readTimeMinutes || 5} min read</span>
                        </div>
                        <button
                          type="button"
                          className="blogs-page__feature-link"
                          onClick={() => handleReadPost(post)}
                        >
                          Continue Reading <ArrowIcon />
                        </button>
                      </div>

                      <div className="blogs-page__feature-media">
                        <img
                          src={
                            post.heroImageUrl ||
                            (post.categoryName?.toLowerCase() === "product"
                              ? "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80"
                              : post.categoryName?.toLowerCase() === "news"
                              ? "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=600&q=80"
                              : "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=600&q=80")
                          }
                          alt={post.heroImageAlt || post.title}
                          className="blogs-page__feature-image h-full w-full object-cover"
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      <FooterSection variant="blogs" />
    </section>
  );
}
