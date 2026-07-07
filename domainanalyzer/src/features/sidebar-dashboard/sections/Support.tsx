import { useMemo } from "react";
import { ChevronRight, ChevronDown, ExternalLink, Search, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useBlogAnalyticsAggregate } from "@/features/sidebar-dashboard/queries";

const quickLinks = [
  { title: "Terms & Conditions", href: "#" },
  { title: "Privacy policy", href: "#" },
  { title: "AI Transparency Policy", href: "#" },
];

const featuredVideos = [
  {
    id: 1,
    title: "Google Search Console Tutorial",
    description: "How to connect GSC and use it for content and SEO analysis.",
    embedUrl: "https://www.youtube.com/embed/JnX6_YAflt8?si=EvfXp_9hEyyCSI0m",
  },
  {
    id: 2,
    title: "Google Analytics Tutorial",
    description: "How to connect GA4 and use it for reporting.",
    embedUrl: "https://www.youtube.com/embed/pJxNPfwQfHs",
  },
  {
    id: 3,
    title: "WordPress Publishing Tutorial",
    description: "How to connect WordPress and publish content directly.",
    embedUrl: "https://www.youtube.com/embed/pJxNPfwQfHs?si=DmLV-gdgqw9TJUdZ",
  },
  {
    id: 4,
    title: "What the integration area does",
    description: "A quick overview of the key integrations that unlock publishing and reporting.",
    embedUrl: "https://www.youtube.com/embed/JnX6_YAflt8?si=EvfXp_9hEyyCSI0m",
  },
  {
    id: 5,
    title: "Publishing workflow overview",
    description: "How generated content moves through the publishing flow.",
    embedUrl: "https://www.youtube.com/embed/pJxNPfwQfHs",
  },
];

const faqs = [
  {
    question: "How do I generate content for my domain?",
    answer:
      "Start from the dashboard or campaign flow, add a domain, run the audit, and use the generated keywords and page suggestions to build content.",
  },
  {
    question: "How do I publish a blog from the tool?",
    answer:
      "Use the publishing workflow in the workspace. Once a draft is published, it appears in the publish history and can be tracked from the dashboard.",
  },
  {
    question: "Where can I see performance after publishing?",
    answer:
      "Published blogs surface in the blog analytics and GSC views, where you can review clicks, impressions, CTR, and rankings.",
  },
  {
    question: "Why do I need Google Search Console?",
    answer:
      "Search Console gives us the performance data needed to measure how your published content is doing in search after it goes live.",
  },
  {
    question: "Can I manage competitors inside the platform?",
    answer:
      "Yes. The competitor intelligence area helps you compare visibility, keyword overlap, and traffic signals against competing domains.",
  },
  {
    question: "What is AI visibility in this product?",
    answer:
      "AI visibility helps you understand how your content is performing across AI-assisted search experiences and where you can improve coverage.",
  },
  {
    question: "What should I do if I do not see any published blogs yet?",
    answer:
      "That usually means no blog has been published for the connected workspace yet. Once you publish content, the latest published posts will appear here automatically.",
  },
];

type BlogSummary = {
  id: number;
  title: string;
  url: string;
  primaryKeyword?: string | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
};

type BlogAnalyticsRow = {
  id?: number | string;
  title?: string | null;
  url?: string | null;
  primaryKeyword?: string | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
};

const formatNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0";

const formatPosition = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "0.0";

export default function Support() {
  const { data: blogAggregate, isLoading, error, refetch, isFetching } = useBlogAnalyticsAggregate(28);

  const latestPublishedBlogs = useMemo<BlogSummary[]>(() => {
    const source =
      Array.isArray(blogAggregate?.blogs) && blogAggregate.blogs.length > 0
        ? blogAggregate.blogs
        : Array.isArray(blogAggregate?.topPerformingBlogs)
          ? blogAggregate.topPerformingBlogs
          : [];

    return source.slice(0, 4).map((blog: BlogAnalyticsRow) => ({
      id: Number(blog.id ?? 0),
      title: String(blog.title ?? blog.url ?? "Untitled post"),
      url: String(blog.url ?? "#"),
      primaryKeyword: blog.primaryKeyword ?? null,
      clicks: blog.clicks ?? 0,
      impressions: blog.impressions ?? 0,
      ctr: blog.ctr ?? 0,
      position: blog.position ?? 0,
    }));
  }, [blogAggregate]);

  return (
    <div className="min-h-screen bg-[#ffffff] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1530px] flex-col px-5 py-6">
        <section className="rounded-2xl border border-[#dce5f5] bg-[linear-gradient(135deg,#b7ccff_0%,#d5e4ff_52%,#eef4ff_100%)] px-6 py-7 shadow-[0_10px_30px_rgba(120,144,186,0.14)]">
          <div className="mx-auto flex max-w-[700px] flex-col items-center text-center">
            <h2 className="text-[30px] font-semibold tracking-[-0.04em] text-slate-950">Hello, how can we help?</h2>
            <p className="mt-2 text-[13px] text-slate-700">
              Find answers, product guidance, and the latest published content from your workspace.
            </p>

            <div className="mt-5 flex w-full items-center rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-[0_8px_24px_rgba(103,123,167,0.12)] backdrop-blur">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="text"
                placeholder="Search guides, publishing, analytics, or integrations..."
                className="ml-3 w-full bg-transparent text-[14px] text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-3 md:grid-cols-3">
          {quickLinks.map((link) => (
            <a
              key={link.title}
              href={link.href}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
            >
              <span className="text-[15px] font-semibold text-slate-800">{link.title}</span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eef4ff] text-[#4d73c2]">
                <ChevronRight className="h-4 w-4" />
              </span>
            </a>
          ))}
        </section>

        <section className="mt-6">
          <div className="mb-3">
            <h3 className="text-[18px] font-semibold text-slate-900">Featured videos</h3>
            <p className="mt-1 text-[12px] text-slate-500">Short walkthroughs for publishing, analytics, and integrations.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {featuredVideos.map((video) => (
              <article key={video.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                <div className="relative aspect-[16/10] overflow-hidden bg-[linear-gradient(135deg,#cfd8e6_0%,#f3f6fb_48%,#d6dde7_100%)]">
                  <iframe
                    className="absolute inset-0 h-full w-full"
                    src={video.embedUrl}
                    title={video.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.18))]" />
                </div>
                <div className="p-3">
                  <h4 className="text-[14px] font-semibold text-slate-900">{video.title}</h4>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">{video.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[18px] font-semibold text-slate-900">Latest published blogs</h3>
              <p className="mt-1 text-[12px] text-slate-500">
                These are pulled from the live blog analytics feed and only show published content.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-full border border-[#d0dcf2] bg-white px-3 py-2 text-[13px] font-medium text-[#4d73c2] hover:bg-[#f3f7ff]"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-14 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading published blogs...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-rose-700">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertCircle className="h-4 w-4" />
                Could not load published blogs
              </div>
              <p className="mt-1 text-sm text-rose-600">{error instanceof Error ? error.message : "Please try again."}</p>
            </div>
          ) : latestPublishedBlogs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              No published blogs have been found for this workspace yet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {latestPublishedBlogs.map((blog) => (
                <article key={blog.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4d73c2]">Published</p>
                      <h4 className="mt-2 text-[15px] font-semibold leading-5 text-slate-900">{blog.title}</h4>
                    </div>
                    <a
                      href={blog.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[#4d73c2]"
                      aria-label={`Open ${blog.title}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>

                  {blog.primaryKeyword ? (
                    <p className="mt-3 text-[12px] text-slate-500">
                      Primary keyword: <span className="font-medium text-slate-700">{blog.primaryKeyword}</span>
                    </p>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <span className="block uppercase tracking-[0.16em]">Clicks</span>
                      <span className="mt-1 block text-sm font-semibold text-slate-900">{formatNumber(blog.clicks)}</span>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <span className="block uppercase tracking-[0.16em]">Impr.</span>
                      <span className="mt-1 block text-sm font-semibold text-slate-900">{formatNumber(blog.impressions)}</span>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <span className="block uppercase tracking-[0.16em]">CTR</span>
                      <span className="mt-1 block text-sm font-semibold text-slate-900">
                        {typeof blog.ctr === "number" ? `${Math.round(blog.ctr * 100)}%` : "0%"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <span className="block uppercase tracking-[0.16em]">Pos.</span>
                      <span className="mt-1 block text-sm font-semibold text-slate-900">{formatPosition(blog.position)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 pb-4">
          <h3 className="mb-3 text-[18px] font-semibold text-slate-900">Frequently Asked Questions</h3>
          <div className="space-y-2">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.03)]"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-[13px] font-medium text-slate-700">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#eef4ff] text-[#4d73c2] transition group-open:rotate-180">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </span>
                  <span>{faq.question}</span>
                </summary>
                <div className="border-t border-slate-100 px-4 pb-4 pt-2 text-[13px] leading-6 text-slate-500">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
