import {
  BarChart3,
  Building,
  ChartColumnBig,
  ChartPie,
  ClipboardList,
  FileChartColumnIncreasing,
  Globe,
  Link,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Send,
  Settings,
  Sparkles,
  Target,
  User,
} from "lucide-react";

import type { DashboardTabConfig, TabId } from "@/features/sidebar-dashboard/types";

export const DASHBOARD_DEFAULT_TAB: TabId = "overview";

export const DASHBOARD_TABS: DashboardTabConfig[] = [
  { id: "ai-checker", label: "AI Visibility", icon: Sparkles },
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "analytics", label: "Company", icon: Building },
  { id: "integration", label: "Integration", icon: Link },
  { id: "competitor-intelligence", label: "Competitor Intelligence", icon: Target },
  { id: "knowledge-base", label: "Knowledge Base", icon: Lightbulb },
  { id: "projects", label: "All Projects", icon: Send },
  { id: "publish", label: "Publish", icon: Megaphone },
  { id: "gsc-analytics", label: "GSC Analytics", icon: ChartPie },
  { id: "audit", label: "Website Audit", icon: Globe },
  { id: "analytics-report", label: "Performance Reports", icon: ChartColumnBig },
  { id: "settings", label: "Settings", icon: Settings },
  
];

export const TOOLTIP_INFO = {
  Performance: "Measures how fast your domain loads and responds.",
  SEO: "Shows how well your domain is optimized for search engines.",
  Accessibility: "Indicates how usable the site is for all users, including disabilities.",
  "Best Practices": "Checks if your site follows recommended web development standards.",
} as const;

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  Performance: "Overall speed and responsiveness of the page.",
  SEO: "How well the page is optimized for search engines.",
  Accessibility: "How usable the page is for users with disabilities.",
  "Best Practices": "Adherence to modern web development best practices.",
};

export const METRIC_DESCRIPTIONS: Record<string, string> = {
  fcp: "Time until the first visible content appears on the page.",
  lcp: "Time it takes for the largest visible element to fully render.",
  cls: "Measures visual stability by tracking unexpected layout shifts.",
  tbt: "Total time the page is blocked from responding to user input.",
  speedIndex: "How quickly content is visually displayed during load.",
};
