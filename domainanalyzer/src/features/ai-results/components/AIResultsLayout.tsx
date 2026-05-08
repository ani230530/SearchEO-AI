import { Bell, ChevronDown, Globe2, HelpCircle, LayoutDashboard, Settings, ShieldCheck, Sparkles, Star, Users } from "lucide-react";
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
};

type AIResultsLayoutProps = {
  activeItem: AIResultsNavItemId;
  allDomains: DomainOption[];
  children: React.ReactNode;
  currentDomainId?: number | null;
  currentDomainUrl?: string | null;
  maskedDomainId?: string;
  title: string;
};

const sidebarItems: Array<{
  icon: typeof Sparkles;
  id: AIResultsNavItemId;
  label: string;
}> = [
  { id: "ai-results", label: "AI Results", icon: Sparkles },
  { id: "competitors", label: "Competitors", icon: Users },
  { id: "track-prompts", label: "Track Prompts", icon: Star },
  { id: "top-keywords", label: "Top Keywords", icon: Star },
  { id: "analytics", label: "Analytics", icon: LayoutDashboard },
];

const HeaderProfileButton = () => (
  <button
    type="button"
    aria-label="Profile"
    className="flex h-10 items-center rounded-full border border-slate-200 bg-white px-2 shadow-sm"
  >
    <span className="grid h-6 w-6 place-items-center rounded-full bg-[#2f4462] text-[11px] font-semibold text-white">
      S
    </span>
  </button>
);

export function AIResultsLayout({
  activeItem,
  allDomains,
  children,
  currentDomainId,
  currentDomainUrl,
  maskedDomainId,
  title,
}: AIResultsLayoutProps) {
  const navigate = useNavigate();

  const navigateToItem = (itemId: AIResultsNavItemId, nextMaskedId = maskedDomainId) => {
    if (!nextMaskedId) return;

    if (itemId === "ai-results" || itemId === "top-keywords") {
      navigate(`/ai-results/${nextMaskedId}`);
      return;
    }

    if (itemId === "track-prompts") {
      navigate(`/ai-results/${nextMaskedId}/track-prompts`);
      return;
    }

    if (itemId === "competitors") {
      navigate(`/dashboard?tab=analytics&subtab=competitors&domain=${nextMaskedId}`);
      return;
    }

    navigate(`/dashboard?tab=analytics&domain=${nextMaskedId}`);
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f5f5f7] text-slate-900 lg:flex-row">
      <aside className="min-h-[220px] w-full shrink-0 basis-auto border-b border-slate-300 bg-white p-4 lg:min-h-screen lg:basis-[18%] lg:min-w-[260px] lg:max-w-[342px] lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">logo</span>
            <button
              type="button"
              aria-label="Settings"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold text-gray-700">Domain</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs shadow-sm transition hover:bg-gray-50">
                  <span className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-rose-50 text-rose-600">
                      <Globe2 className="h-3.5 w-3.5" />
                    </span>
                    <span className="max-w-[140px] truncate">{currentDomainUrl || "Loading..."}</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[260px] p-1" align="start">
                {allDomains.length > 0 ? (
                  allDomains.map((domain) => {
                    const nextMaskedId = maskDomainId(domain.id);

                    return (
                      <DropdownMenuItem
                        key={domain.id}
                        onClick={() => navigateToItem(activeItem, nextMaskedId)}
                        className={`flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2 ${domain.id === currentDomainId ? "bg-gray-50" : ""}`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="truncate text-xs font-semibold text-gray-900">
                            {domain.url}
                          </span>
                          {domain.id === currentDomainId ? (
                            <Sparkles className="h-3 w-3 text-emerald-600" />
                          ) : null}
                        </div>
                        <span className="text-[10px] text-gray-500">
                          Last analyzed: {new Date(domain.createdAt).toLocaleDateString()}
                        </span>
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
              const Icon = item.icon;
              const isActive = item.id === activeItem;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToItem(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition ${isActive ? "bg-[#2f4462] text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto hidden space-y-3 pt-8 lg:block">
            {[LayoutDashboard, Sparkles, ShieldCheck, Settings].map((Icon, index) => (
              <button
                key={index}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="ml-0 flex min-h-screen min-w-0 flex-1 flex-col gap-2.5 bg-white">
        <header className="w-full bg-white px-6 py-6">
          <div className="flex min-h-[3.75rem] w-full items-center justify-between gap-2.5 py-2.5 pr-2.5">
            <button
              onClick={() => navigate("/ai-visibility")}
              className="inline-flex items-center gap-2.5 text-left text-2xl font-semibold leading-[1.35] tracking-normal text-gray-950"
            >
              <span className="text-2xl leading-none">←</span>
              {title}
            </button>

            <div className="flex h-8 items-center">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Help"
                  className="inline-flex h-5 w-5 items-center justify-center bg-transparent text-[#8D9199]"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Notifications"
                  className="inline-flex h-5 w-5 items-center justify-center bg-transparent text-[#8D9199]"
                >
                  <Bell className="h-4 w-4" />
                </button>
              </div>
              <div className="ml-6">
                <HeaderProfileButton />
              </div>
            </div>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
