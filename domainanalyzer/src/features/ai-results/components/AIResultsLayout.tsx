import {
  ArrowLeft,
  Bell,
  ChevronDown,
  Globe2,
  HelpCircle,
  Settings2,
  Sparkles,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { maskDomainId } from "@/lib/domainUtils";

type AIResultsNavItemId =
  | "ai-results"
  | "competitors"
  | "track-prompts"
  | "top-keywords"
  | "analytics";

type DomainOption = {
  id: number;
  url: string;
  createdAt: string;
  /** Optional — backend supplies these via /wizard/domains for display. */
  host?: string;
  companyName?: string | null;
};

type AIResultsLayoutProps = {
  activeItem: AIResultsNavItemId;
  allDomains: DomainOption[];
  children: React.ReactNode;
  currentDomainId?: number | null;
  currentDomainUrl?: string | null;
  /** Optional — used in the trigger button next to the logo. */
  currentDomainHost?: string | null;
  currentDomainName?: string | null;
  maskedDomainId?: string;
  title: string;
};

/** Friendly display name for a domain row — falls back gracefully. */
const displayDomainName = (d: { companyName?: string | null; host?: string; url: string }): string => {
  if (d.companyName && d.companyName.trim()) return d.companyName.trim();
  if (d.host && d.host.trim()) return d.host.trim();
  // Last-resort: strip protocol + www + path off the url.
  return d.url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0];
};

/** logo.dev URL for a host. Returns null if host is missing. */
const logoUrlFor = (host: string | null | undefined): string | null => {
  if (!host) return null;
  const clean = host.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  if (!clean) return null;
  return `https://img.logo.dev/${clean}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64`;
};

const sidebarItems: Array<{
  id: AIResultsNavItemId;
  iconSrc: string;
  label: string;
}> = [
  { id: "ai-results", label: "AI Results", iconSrc: "/sidebar-icons/ai-results.svg" },
  { id: "competitors", label: "Competitors", iconSrc: "/sidebar-icons/competitors.svg" },
  { id: "track-prompts", label: "Track Prompts", iconSrc: "/sidebar-icons/track-prompts.svg" },
  { id: "top-keywords", label: "Track Keyword", iconSrc: "/sidebar-icons/track-keyword.svg" },
  { id: "analytics", label: "Opportunities", iconSrc: "/sidebar-icons/analytics.svg" },
];

const railItems = [
  { id: "ai", iconSrc: "/sidebar-icons/content.svg", label: "AI Results", action: "ai-results" as const },
  { id: "create", iconSrc: "/sidebar-icons/create-project.svg", label: "Create Project", action: "projects" as const },
  { id: "projects", iconSrc: "/sidebar-icons/content-1.svg", label: "All Projects", action: "projects" as const },
  { id: "domain-info", iconSrc: "/sidebar-icons/text-and-icon-1.svg", label: "Domain Info", action: "analytics" as const },
  { id: "global", icon: Globe2, label: "Global" },
];

export function AIResultsLayout({
  activeItem,
  allDomains,
  children,
  currentDomainId,
  currentDomainUrl,
  currentDomainHost,
  currentDomainName,
  maskedDomainId,
  title,
}: AIResultsLayoutProps) {
  // Resolve the trigger button's display name. Prefer explicit props, then
  // look up the current domain in allDomains, then fall back to the host
  // sliced out of currentDomainUrl.
  const currentDomainEntry = allDomains.find((d) => d.id === currentDomainId);
  const triggerHost =
    currentDomainHost ??
    currentDomainEntry?.host ??
    (currentDomainUrl ?? "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] ??
    null;
  const triggerName =
    currentDomainName ??
    (currentDomainEntry ? displayDomainName(currentDomainEntry) : null) ??
    triggerHost ??
    "Loading…";
  const triggerLogo = logoUrlFor(triggerHost);
  const navigate = useNavigate();
  const resolvedMaskedDomainId = maskedDomainId ?? (currentDomainId ? maskDomainId(currentDomainId) : undefined);

  const navigateToItem = (itemId: AIResultsNavItemId, nextMaskedId = resolvedMaskedDomainId) => {
    if (!nextMaskedId) return;

    if (itemId === "ai-results") {
      navigate(`/ai-results/${nextMaskedId}`);
      return;
    }

    if (itemId === "top-keywords") {
      navigate(`/ai-results/${nextMaskedId}/track-keywords`);
      return;
    }

    if (itemId === "track-prompts") {
      navigate(`/ai-results/${nextMaskedId}/track-prompts`);
      return;
    }

    if (itemId === "competitors") {
      navigate(`/airesults-competitors-preview`);
      return;
    }

    navigate(`/dashboard?tab=analytics&domain=${nextMaskedId}`);
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f5f5f7] text-slate-900 lg:flex-row">
      <aside className="hidden min-h-[220px] w-[72px] shrink-0 basis-auto border-b border-slate-300 bg-white px-0 py-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:max-h-screen lg:flex-col lg:items-center lg:border-b-0 lg:border-r lg:self-start">
        <div className="flex h-full w-full flex-col items-center overflow-hidden">
          <div className="flex w-full flex-col items-center gap-3">
            <div className="flex h-10 w-full items-center justify-center text-sm font-semibold text-slate-900">
              logo
            </div>

            <nav className="mt-1 flex flex-1 flex-col items-center gap-1.5 pt-1">
              {railItems.map((item) => {
                const isActive = item.id === "ai";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.action === "dashboard") navigate("/dashboard");
                      if (item.action === "ai-results" && resolvedMaskedDomainId) navigate(`/ai-results/${resolvedMaskedDomainId}`);
                      if (item.action === "projects") navigate("/dashboard?tab=projects");
                      if (item.action === "analytics") navigate(`/dashboard?tab=analytics&domain=${resolvedMaskedDomainId ?? ""}`);
                    }}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${
                      isActive ? "bg-[#2f4462] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    }`}
                    aria-label={item.label}
                    title={item.label}
                  >
                    {item.iconSrc ? (
                      <img src={item.iconSrc} alt="" aria-hidden="true" className={`h-8 w-8 ${isActive ? "" : ""}`} />
                    ) : (
                      <item.icon className="h-4 w-4" strokeWidth={1.8} />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto flex w-full flex-col items-center gap-2 pb-1">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Account"
              title="Account"
            >
              <User className="h-4 w-4" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Settings"
              title="Settings"
            >
              <Settings2 className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </aside>

      <aside className="min-h-[220px] w-full shrink-0 basis-auto border-b border-slate-300 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:max-h-screen lg:basis-[18%] lg:min-w-[260px] lg:max-w-[342px] lg:border-b-0 lg:border-r lg:self-start">
        <div className="flex h-full flex-col overflow-hidden">
          {/* Top of the sidebar — domain logo on the left, back button on the right.
              The logo replaces the "logo" placeholder; the back button replaces
              the Settings icon and goes to the user's domain history. The main
              content header no longer has its own back arrow. */}
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
              {triggerLogo ? (
                <img
                  src={triggerLogo}
                  alt={triggerName}
                  className="h-9 w-9 object-contain"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                />
              ) : (
                <Globe2 className="h-5 w-5 text-slate-400" />
              )}
            </span>
            <button
              type="button"
              aria-label="Back to domain history"
              onClick={() => navigate("/dashboard?tab=domain-history")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
              title="Back to domain history"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold text-gray-700">Domain</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs shadow-sm transition hover:bg-gray-50">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-50">
                      {triggerLogo ? (
                        <img
                          src={triggerLogo}
                          alt=""
                          className="h-5 w-5 object-contain"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                      ) : (
                        <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                      )}
                    </span>
                    <span className="truncate font-medium text-slate-900">{triggerName}</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[280px] p-1 max-h-[60vh] overflow-y-auto custom-scrollbar"
                align="start"
              >
                {allDomains.length > 0 ? (
                  allDomains.map((domain) => {
                    const nextMaskedId = maskDomainId(domain.id);
                    const name = displayDomainName(domain);
                    const logo = logoUrlFor(domain.host ?? domain.url);
                    const isCurrent = domain.id === currentDomainId;
                    return (
                      <DropdownMenuItem
                        key={domain.id}
                        onClick={() => navigateToItem(activeItem, nextMaskedId)}
                        className={`flex cursor-pointer items-center gap-2.5 px-2.5 py-2 ${isCurrent ? "bg-gray-50" : ""}`}
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-50">
                          {logo ? (
                            <img
                              src={logo}
                              alt=""
                              className="h-6 w-6 object-contain"
                              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                            />
                          ) : (
                            <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-gray-900">{name}</span>
                            {isCurrent ? <Sparkles className="h-3 w-3 shrink-0 text-emerald-600" /> : null}
                          </div>
                          <span className="block truncate text-[10px] text-gray-500">
                            {domain.host ?? domain.url.replace(/^https?:\/\//, '')}
                            {' · '}
                            {new Date(domain.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    );
                  })
                ) : (
                  <div className="p-3 text-center text-xs text-gray-500">No other domains found</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav className="mt-5 space-y-1">
            {sidebarItems.map((item) => {
              const isActive = item.id === activeItem;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToItem(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition ${isActive ? "bg-[#2f4462] text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                >
                  <img
                    src={item.iconSrc}
                    alt=""
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 ${
                      item.id === "ai-results"
                        ? isActive
                          ? "opacity-100"
                          : "brightness-0 opacity-80"
                        : isActive
                          ? "brightness-0 invert"
                          : "opacity-80"
                    }`}
                  />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="ml-0 flex min-h-screen min-w-0 flex-1 flex-col gap-2.5 bg-white">
        <header className="w-full bg-white px-6 py-4">
          <div className="flex min-h-[2.25rem] w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Back"
                onClick={() => navigate("/dashboard?tab=domain-history")}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#101828] transition hover:text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h1 className="truncate text-base font-semibold leading-[1.35] tracking-normal text-gray-950 sm:text-lg">
                {title}
              </h1>
            </div>

            <div className="flex items-center gap-3 text-[#98A2B3]">
              <button
                type="button"
                aria-label="Help"
                className="inline-flex h-5 w-5 items-center justify-center bg-transparent transition-colors hover:text-slate-700"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Notifications"
                className="inline-flex h-5 w-5 items-center justify-center bg-transparent transition-colors hover:text-slate-700"
              >
                <Bell className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Profile"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F2F4F7] text-[#667085] transition hover:text-slate-700"
              >
                <User className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
