import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import FooterSection from "../components/ui/footer";
import { apiGet } from "@/services/apiClient";
import { Loader2, Calendar, User, Clock, ArrowLeft, ChevronRight, RotateCcw } from "lucide-react";

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
  tags: string[];
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<PublishedPost | null>(null);
  const [loading, setLoading] = useState(true);

  interface TocItem {
    id: string;
    text: string;
    level: number;
  }

  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [processedHtml, setProcessedHtml] = useState<string>("");

  const [similarPosts, setSimilarPosts] = useState<PublishedPost[]>([]);

  useEffect(() => {
    async function loadPost() {
      if (!slug) return;
      try {
        setLoading(true);
        const res = await apiGet<{ post: PublishedPost }>(`/blog/${slug}`);
        setPost(res.post);
      } catch (error) {
        console.error("Failed to load blog post:", error);
        setPost(null);
      } finally {
        setLoading(false);
      }
    }
    loadPost();
  }, [slug]);

  useEffect(() => {
    async function loadSimilar() {
      if (!post) return;
      try {
        const res = await apiGet<{ posts: PublishedPost[] }>("/blog?limit=10");
        let filtered = res.posts.filter((p) => p.slug !== slug);

        // If we don't have enough posts in the database, add high-quality fallback items
        if (filtered.length < 3) {
          const fallbacks: PublishedPost[] = [
            {
              id: -1,
              title: "SEO Strategies for Legal Services",
              slug: "seo-strategies-for-legal-services",
              excerpt: "Explore effective SEO techniques tailored to boost visibility for law firms and legal consultants.",
              contentHtml: "",
              heroImageUrl: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80",
              heroImageAlt: "SEO Strategies for Legal Services",
              seoTitle: "",
              seoDescription: "",
              status: "PUBLISHED",
              publishedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              readTimeMinutes: 8,
              authorName: "Jane Doe",
              authorTitle: "SEO Lead",
              categoryName: "Product",
              categorySlug: "product",
              tags: ["SEO", "Legal"]
            },
            {
              id: -2,
              title: "AEO Explained for Websites",
              slug: "aeo-explained-for-websites",
              excerpt: "Learn how Answer Engine Optimization helps your site rank by providing direct, user-focused answers.",
              contentHtml: "",
              heroImageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
              heroImageAlt: "AEO Explained for Websites",
              seoTitle: "",
              seoDescription: "",
              status: "PUBLISHED",
              publishedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              readTimeMinutes: 10,
              authorName: "John Smith",
              authorTitle: "AEO Specialist",
              categoryName: "Product",
              categorySlug: "product",
              tags: ["AEO", "AI Search"]
            },
            {
              id: -3,
              title: "Optimizing Content with SEO & AEO",
              slug: "optimizing-content-with-seo-aeo",
              excerpt: "Combine SEO and AEO tactics to enhance search performance and engage users with relevant content.",
              contentHtml: "",
              heroImageUrl: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=600&q=80",
              heroImageAlt: "Optimizing Content with SEO & AEO",
              seoTitle: "",
              seoDescription: "",
              status: "PUBLISHED",
              publishedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              readTimeMinutes: 12,
              authorName: "Alice Johnson",
              authorTitle: "Content Writer",
              categoryName: "Product",
              categorySlug: "product",
              tags: ["SEO", "AEO", "Content"]
            }
          ];

          // Fill up to 3 posts using fallbacks
          let idx = 0;
          while (filtered.length < 3 && idx < fallbacks.length) {
            if (!filtered.some((p) => p.slug === fallbacks[idx].slug)) {
              filtered.push(fallbacks[idx]);
            }
            idx++;
          }
        }

        setSimilarPosts(filtered.slice(0, 3));
      } catch (err) {
        console.error("Failed to load similar posts:", err);
      }
    }
    loadSimilar();
  }, [post, slug]);

  useEffect(() => {
    if (!post) return;

    // Parse headers to build Table of Contents dynamically
    const parser = new DOMParser();
    const doc = parser.parseFromString(post.contentHtml, "text/html");

    // Remove the duplicate first image inside the body text if it matches the heroImageUrl
    const firstImg = doc.querySelector("img");
    if (firstImg && post.heroImageUrl) {
      const imgUrl = firstImg.getAttribute("src") || "";
      const cleanImgUrl = imgUrl.split('?')[0];
      const cleanHeroUrl = post.heroImageUrl.split('?')[0];
      if (
        imgUrl === post.heroImageUrl ||
        cleanImgUrl === cleanHeroUrl ||
        post.heroImageUrl.endsWith(imgUrl) ||
        imgUrl.endsWith(post.heroImageUrl)
      ) {
        firstImg.remove();
      }
    }

    const headings = doc.querySelectorAll("h2, h3");

    const tocItems: TocItem[] = [];
    headings.forEach((heading, idx) => {
      const text = heading.textContent || "";
      const id = `heading-${idx}`;
      heading.setAttribute("id", id);

      tocItems.push({
        id,
        text,
        level: heading.tagName.toLowerCase() === "h2" ? 2 : 3,
      });
    });

    setToc(tocItems);
    if (tocItems.length > 0) {
      setActiveId(tocItems[0].id);
    }
    setProcessedHtml(doc.body.innerHTML);
  }, [post]);

  useEffect(() => {
    if (toc.length === 0 || !processedHtml) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // Sort by distance to top to get the first visible element
          visibleEntries.sort(
            (a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top
          );
          setActiveId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
      }
    );

    toc.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [processedHtml, toc]);

  return (
    <section className="blogs-page bg-slate-50/50 min-h-screen flex flex-col">
      <SiteHeader />

      <main className="blogs-page__main pb-20">
        {post && (
          <div className="blogs-page__shell mb-10">
            {/* Breadcrumbs aligned with the header logo */}
            <nav className="flex items-center flex-wrap gap-2.5 text-sm text-slate-500 font-medium" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-blue-600 transition-colors">Home</Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <Link to="/blogs" className="hover:text-blue-600 transition-colors">Blogs</Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="capitalize text-slate-500">{post.categoryName}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="text-[#1E3A8A] font-semibold truncate">{post.title}</span>
            </nav>

            {/* Title (exactly 4px below breadcrumbs) */}
            <h1
              style={{
                color: "#222831",
                fontWeight: 700,
                fontSize: "48px",
                lineHeight: "120%",
                letterSpacing: "0%",
                marginTop: "4px",
              }}
              className="text-3xl sm:text-[48px] tracking-tight font-sans text-left mb-0 mt-0"
            >
              {post.title}
            </h1>

            {/* Tags (exactly 4px below heading) */}
            <div className="flex items-center gap-2.5 flex-wrap mt-[4px] mb-0">
              {post.tags && post.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    backgroundColor: "#F0F5FF",
                    color: "#4F75A2",
                  }}
                  className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-full select-none"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Author & Date metadata (exactly 8px below tags) */}
            <div
              style={{ marginTop: "8px" }}
              className="flex items-center justify-between flex-wrap gap-4 py-3 border-y border-slate-200 text-slate-500 text-sm mb-4"
            >
              <div className="font-bold text-[#374151]">
                {post.authorName || "Searcheo Author"}
              </div>
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                {post.publishedAt && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </span>
                )}
                <span className="text-slate-300 select-none">|</span>
                <span className="flex items-center gap-1.5">
                  <RotateCcw className="h-4 w-4 text-slate-400" />
                  Updated {new Date(post.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span className="text-slate-300 select-none">|</span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-400" />
                  {post.readTimeMinutes || 5} min read
                </span>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-40 gap-3 max-w-4xl">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                <p className="text-sm font-semibold text-slate-500">Loading article content...</p>
              </div>
            ) : !post ? (
              <div className="text-center py-32 bg-white border border-slate-200 rounded-3xl shadow-sm p-8 max-w-lg">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Article Not Found</h2>
                <p className="text-slate-500 text-sm mb-6">
                  The article you are trying to access does not exist, is set to draft, or has been moved.
                </p>
                <button
                  onClick={() => navigate("/blogs")}
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all text-sm"
                >
                  Return to Blog List
                </button>
              </div>
            ) : (
              <>
                {/* Featured Image - spans the entire shell */}
                {post.heroImageUrl && (
                  <div className="w-full aspect-[21/9] sm:aspect-[24/9] max-h-[480px] rounded-3xl overflow-hidden mb-6 shadow-sm border border-slate-100 mt-0">
                    <img
                      src={post.heroImageUrl}
                      alt={post.heroImageAlt || post.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Two-Column Grid: Content & Sidebar Table of Contents */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mt-8 items-start">
                  {/* Left Column: Rich Body Content */}
                  <article className="lg:col-span-8 text-left mt-0">
                    <div
                      className="blog-reader-content max-w-none mt-0 space-y-4"
                      dangerouslySetInnerHTML={{ __html: processedHtml || post.contentHtml }}
                    />
                  </article>

                  {/* Right Column: Sidebar Table of Contents */}
                  {toc.length > 0 && (
                    <aside className="lg:col-span-4 hidden lg:block sticky top-[100px] self-start pl-6 border-l border-slate-200">
                      <h4 className="text-sm font-bold text-[#222831] uppercase tracking-wider mb-4">
                        Table of Content
                      </h4>
                      <nav className="space-y-1">
                        {toc.map((item) => {
                          const isActive = activeId === item.id;
                          return (
                            <a
                              key={item.id}
                              href={`#${item.id}`}
                              onClick={(e) => {
                                e.preventDefault();
                                document.getElementById(item.id)?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start"
                                });
                                setActiveId(item.id);
                              }}
                              style={{
                                paddingLeft: item.level === 3 ? "1.5rem" : "0.75rem",
                              }}
                              className={`block py-2.5 pr-3 text-sm transition-all rounded-r-xl border-l-[3px] ${
                                isActive
                                  ? "bg-blue-50/60 border-blue-600 text-[#1E3A8A] font-bold"
                                  : "border-transparent text-slate-500 hover:text-slate-900 font-medium"
                              }`}
                            >
                              {item.text}
                            </a>
                          );
                        })}
                      </nav>
                    </aside>
                  )}
                </div>

                {/* Similar Articles Section */}
                <div className="border-t border-slate-200 pt-16 mt-16">
                  <h3 className="text-2xl sm:text-3xl font-bold text-[#222831] mb-8 text-left">
                    Similar Articles
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {similarPosts.map((simPost) => (
                      <div
                        key={simPost.id}
                        onClick={() => {
                          window.scrollTo(0, 0);
                          navigate(`/blogs/${simPost.slug}`);
                        }}
                        className="relative aspect-[4/5] rounded-[32px] overflow-hidden group cursor-pointer shadow-md hover:shadow-xl transition-all duration-300 border border-slate-100"
                      >
                        {/* Background Hero Image */}
                        <img
                          src={simPost.heroImageUrl || "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=600&q=80"}
                          alt={simPost.heroImageAlt || simPost.title}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />

                        {/* Dark gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

                        {/* Content inside overlay */}
                        <div className="absolute inset-x-0 bottom-0 p-6 flex flex-col justify-end text-left h-3/5">
                          <h4 className="text-white font-bold text-lg sm:text-xl leading-tight mb-2 group-hover:text-blue-300 transition-colors line-clamp-2">
                            {simPost.title}
                          </h4>
                          <p className="text-slate-200 text-xs sm:text-sm line-clamp-2 mb-4 opacity-90 font-normal leading-relaxed">
                            {simPost.excerpt || "Read more about optimizing your visibility in search results and AI-driven platforms."}
                          </p>
                          <div className="inline-flex items-center gap-1 text-sky-400 font-bold text-sm hover:underline">
                            Read More &gt;
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <FooterSection variant="blogs" />
    </section>
  );
}
