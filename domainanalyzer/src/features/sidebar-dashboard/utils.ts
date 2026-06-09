import type {
  CompanySubTabId,
  DashboardSearchState,
  TabId,
} from "@/features/sidebar-dashboard/types";
import type { SettingsSubTab } from "@/features/sidebar-dashboard/sections/settings/types";
import type { Keyword, KeywordTableItem } from "@/types";
import { DASHBOARD_QUERY_TABS } from "@/features/sidebar-dashboard/navigation";

const VALID_TABS: readonly TabId[] = [
  "overview",
  "analytics",
  "integration",
  "projects",
  "settings",
  "ai-visibility",
  "gsc-analytics",
  "attribution",
  "audit",
  "analytics-report",
  "knowledge-base",
  "domain-history",
  "competitor-intelligence",
];

const VALID_COMPANY_SUB_TABS: readonly CompanySubTabId[] = [
  "company-info",
  "integration",
];

const VALID_SETTINGS_SUB_TABS: readonly SettingsSubTab[] = [
  "profile",
  "knowledge-base",
  "privacy-security",
  "notifications",
  "subscription",
  "integrations",
];

export function summarizeDomainContext(
  input: string,
  maxLines = 6,
  maxChars = 800
) {
  if (!input) return "";

  const normalized = input.replace(/\r\n/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const limited = lines.slice(0, maxLines).join("\n");

  if (limited.length <= maxChars) {
    return limited;
  }

  return `${limited.slice(0, maxChars)}â€¦`;
}

export function getStoredActiveTab(value: string | null, fallback: TabId = "overview"): TabId {
  if (value === "profile") {
    return "settings";
  }

  return value && VALID_TABS.includes(value as TabId) ? (value as TabId) : fallback;
}

export function parseDashboardSearchState(search: string): DashboardSearchState {
  const params = new URLSearchParams(search);
  const tabParam = params.get("tab");
  const subtabParam = params.get("subtab");
  const wordpressParam = params.get("wordpress");
  const actionParam = params.get("action");
  const campaignParam = params.get("campaign");
  const parsedCampaignId = campaignParam ? Number(campaignParam) : undefined;
  const isLegacyProfileTab = tabParam === "profile";
  const activeSettingsSubTab = isLegacyProfileTab
    ? "profile"
    : tabParam === "settings" && subtabParam && VALID_SETTINGS_SUB_TABS.includes(subtabParam as SettingsSubTab)
      ? (subtabParam as SettingsSubTab)
      : undefined;

  if (tabParam === "ai-checker") {
    return { redirectToAiVisibility: true };
  }

  return {
    redirectToAiVisibility: false,
    activeTab:
      isLegacyProfileTab
        ? "settings"
        : tabParam && DASHBOARD_QUERY_TABS.includes(tabParam as TabId)
        ? (tabParam as TabId)
        : undefined,
    activeCompanySubTab:
      subtabParam && VALID_COMPANY_SUB_TABS.includes(subtabParam as CompanySubTabId)
        ? (subtabParam as CompanySubTabId)
        : undefined,
    activeSettingsSubTab,
    activeCampaignId:
      typeof parsedCampaignId === "number" && Number.isFinite(parsedCampaignId)
        ? parsedCampaignId
        : undefined,
    openWordpressConnection: wordpressParam === "1" || wordpressParam === "true",
    action: actionParam || undefined,
  };
}

export function normalizeDomain(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
}

export function extractOrgName(context: string) {
  if (!context) return "";

  const lines = context.split("\n");
  for (const line of lines) {
    const match =
      line.match(/(?:Organization|Company|Brand)\s*:\s*([^\n]+)/i) ||
      line.match(/###\s*(?:Brand Analysis for|Company Profile:)\s*([^\n]+)/i);
    if (match?.[1]) {
      return match[1].trim().replace(/\*+/g, "");
    }
  }

  return "";
}

export function determineIntent(keyword: string): string {
  const lowerKeyword = keyword.toLowerCase();

  if (
    lowerKeyword.includes("buy") ||
    lowerKeyword.includes("purchase") ||
    lowerKeyword.includes("order") ||
    lowerKeyword.includes("shop") ||
    lowerKeyword.includes("price") ||
    lowerKeyword.includes("cost") ||
    lowerKeyword.includes("deal") ||
    lowerKeyword.includes("discount") ||
    lowerKeyword.includes("sale") ||
    lowerKeyword.includes("offer")
  ) {
    return "Transactional";
  }

  if (
    lowerKeyword.includes("what") ||
    lowerKeyword.includes("how") ||
    lowerKeyword.includes("why") ||
    lowerKeyword.includes("when") ||
    lowerKeyword.includes("where") ||
    lowerKeyword.includes("guide") ||
    lowerKeyword.includes("tutorial") ||
    lowerKeyword.includes("tips") ||
    lowerKeyword.includes("learn") ||
    lowerKeyword.includes("information") ||
    lowerKeyword.includes("explain") ||
    lowerKeyword.includes("definition")
  ) {
    return "Informational";
  }

  return "Commercial";
}

export function normalizeTerm(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

export function buildKeywordTableData(
  keywords: Array<Pick<Keyword, "id" | "term" | "volume" | "difficulty" | "cpc" | "intent">>,
  companyDomain: string,
  customKeywordValues: string[] = []
): KeywordTableItem[] {
  const customSet = new Set(customKeywordValues.map((value) => value.toLowerCase()));

  return keywords.map((kw) => ({
    id: kw.id.toString(),
    keyword: kw.term,
    intent: kw.intent || determineIntent(kw.term),
    volume: kw.volume,
    kd: kw.difficulty === "High" ? 75 : kw.difficulty === "Low" ? 25 : 50,
    competition:
      kw.difficulty === "High"
        ? "High"
        : kw.difficulty === "Low"
          ? "Low"
          : "Medium",
    cpc: kw.cpc || 0,
    organic: Math.floor(kw.volume * 0.1),
    paid: Math.floor(kw.volume * 0.05),
    trend: "Stable",
    position: 0,
    url: `https://${companyDomain}/${kw.term.toLowerCase().replace(/\s+/g, "-")}`,
    updated: new Date().toISOString().split("T")[0],
    selected: false,
    isCustom: customSet.has(kw.term.toLowerCase()),
  }));
}

export function filterKeywordTableData(
  keywords: KeywordTableItem[],
  searchTerm: string,
  filters: { competition?: string; intent?: string }
) {
  return keywords.filter((keyword) => {
    const matchesSearch = keyword.keyword.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCompetition =
      !filters.competition || keyword.competition === filters.competition;
    const matchesIntent = !filters.intent || keyword.intent === filters.intent;

    return matchesSearch && matchesCompetition && matchesIntent;
  });
}

export function sortKeywordTableData(
  keywords: KeywordTableItem[],
  sortConfig: { key: keyof KeywordTableItem; direction: "asc" | "desc" } | null
) {
  const sortableKeywords = [...keywords];

  if (!sortConfig) {
    return sortableKeywords;
  }

  sortableKeywords.sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
    }

    const aStr = String(aValue).toLowerCase();
    const bStr = String(bValue).toLowerCase();

    if (aStr < bStr) {
      return sortConfig.direction === "asc" ? -1 : 1;
    }
    if (aStr > bStr) {
      return sortConfig.direction === "asc" ? 1 : -1;
    }

    return 0;
  });

  return sortableKeywords;
}

export function paginateItems<T>(items: T[], currentPage: number, itemsPerPage: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  return {
    totalPages,
    startIndex,
    endIndex,
    currentItems: items.slice(startIndex, endIndex),
  };
}

export function buildPageNumbers(totalPages: number, currentPage: number) {
  const pages: Array<number | string> = [];
  const maxVisiblePages = 5;

  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i += 1) {
      pages.push(i);
    }
    return pages;
  }

  if (currentPage <= 3) {
    for (let i = 1; i <= 4; i += 1) {
      pages.push(i);
    }
    pages.push("...");
    pages.push(totalPages);
    return pages;
  }

  if (currentPage >= totalPages - 2) {
    pages.push(1);
    pages.push("...");
    for (let i = totalPages - 3; i <= totalPages; i += 1) {
      pages.push(i);
    }
    return pages;
  }

  pages.push(1);
  pages.push("...");
  for (let i = currentPage - 1; i <= currentPage + 1; i += 1) {
    pages.push(i);
  }
  pages.push("...");
  pages.push(totalPages);

  return pages;
}

export function getCompetitionBadgeClassName(competition: string) {
  const baseClasses = "px-2.5 py-1 rounded-full text-xs font-semibold";

  switch (competition) {
    case "High":
      return `${baseClasses} bg-red-100 text-red-800`;
    case "Medium":
      return `${baseClasses} bg-yellow-100 text-yellow-800`;
    case "Low":
      return `${baseClasses} bg-green-100 text-green-800`;
    default:
      return `${baseClasses} bg-gray-100 text-gray-800`;
  }
}

export function getDomainContextPreview(trimmedDomainContext: string) {
  if (!trimmedDomainContext) return "";

  const paragraphs = trimmedDomainContext
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) {
    const firstBlocks = paragraphs.slice(0, 2).join("\n\n");
    if (firstBlocks.length >= 600) {
      return `${firstBlocks.slice(0, 600)}â€¦`;
    }
    if (paragraphs.length > 2) {
      return `${firstBlocks}â€¦`;
    }
    if (firstBlocks.length < trimmedDomainContext.length) {
      return `${firstBlocks}â€¦`;
    }
    return firstBlocks;
  }

  if (trimmedDomainContext.length > 600) {
    return `${trimmedDomainContext.slice(0, 600)}â€¦`;
  }

  return trimmedDomainContext;
}

export function hasAdditionalDomainContext(
  trimmedDomainContext: string,
  domainContextPreview: string
) {
  if (!trimmedDomainContext) return false;
  return trimmedDomainContext.length > domainContextPreview.length + 20;
}
