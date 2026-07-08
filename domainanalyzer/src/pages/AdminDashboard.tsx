import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  PenTool,
  LogOut,
  Loader2,
  FileText,
  CheckCircle,
  AlertCircle,
  Plus,
  Compass,
  FileCode,
  Sparkles,
  BarChart2,
  DollarSign,
  Users,
  Bot,
  Database,
  Download,
  RefreshCw,
} from "lucide-react";

import { blogCmsApi } from "@/features/blog-admin/api";
import { PostTable } from "@/features/blog-admin/PostTable";
import { PostDrawer } from "@/features/blog-admin/PostDrawer";
import type { BlogPost, BlogCategory } from "@/features/blog-admin/types";

type UsageSummary = {
  totalCostUsd: number;
  totalCalls: number;
  failedCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  uniquePrompts: number;
  avgCostPerPromptUsd: number;
};

type UsageUserRow = {
  userId: number | null;
  email: string | null;
  name: string | null;
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
};

type UsagePromptRow = {
  promptId: number | null;
  promptText: string | null;
  domainHost: string | null;
  userId: number | null;
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
};

type UsageModelRow = {
  provider: string;
  model: string | null;
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
};

type UsageLogRow = {
  id: number;
  createdAt: string;
  provider: string;
  feature: string;
  operation: string;
  status: string;
  userId: number | null;
  domainId: number | null;
  domainHost: string | null;
  promptId: number | null;
  modelUsed: string | null;
  totalTokens: number | null;
  costUsd: number;
  costSource: string;
  latencyMs: number | null;
  errorMessage: string | null;
};

type UsageFilters = {
  from: string;
  to: string;
  userId: string;
  domainId: string;
  provider: string;
  feature: string;
  model: string;
  status: string;
};

type UsageFilterOption = {
  value: string;
  label: string;
  description?: string;
};

type UsageFilterOptions = {
  users: UsageFilterOption[];
  domains: UsageFilterOption[];
  providers: UsageFilterOption[];
  features: UsageFilterOption[];
  models: UsageFilterOption[];
  statuses: UsageFilterOption[];
};

const emptyUsageFilters: UsageFilters = {
  from: "",
  to: "",
  userId: "",
  domainId: "",
  provider: "",
  feature: "",
  model: "",
  status: "",
};

const emptyUsageFilterOptions: UsageFilterOptions = {
  users: [],
  domains: [],
  providers: [],
  features: [],
  models: [],
  statuses: [],
};

const fallbackProviderOptions: UsageFilterOption[] = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai", label: "OpenAI" },
  { value: "serpapi", label: "SerpAPI" },
  { value: "serper", label: "Serper" },
  { value: "n8n", label: "n8n" },
  { value: "pagespeed", label: "PageSpeed" },
];

const fallbackStatusOptions: UsageFilterOption[] = [
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "timeout", label: "Timeout" },
  { value: "skipped", label: "Skipped" },
];

const formatUsd = (value: number | null | undefined) =>
  `$${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;

const formatCompactNumber = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString();

const formatUsageDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const AdminDashboard: React.FC = () => {
  const { user, token, logout, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState("cms");

  // Blog CMS states
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // AI Generator form states
  const [topic, setTopic] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [tone, setTone] = useState("professional");
  const [wordCount, setWordCount] = useState(800);
  const [categoryTags, setCategoryTags] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

  // Usage ledger states
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [usageUsers, setUsageUsers] = useState<UsageUserRow[]>([]);
  const [usagePrompts, setUsagePrompts] = useState<UsagePromptRow[]>([]);
  const [usageModels, setUsageModels] = useState<UsageModelRow[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLogRow[]>([]);
  const [usageFilters, setUsageFilters] = useState<UsageFilters>(emptyUsageFilters);
  const [usageFilterOptions, setUsageFilterOptions] = useState<UsageFilterOptions>(emptyUsageFilterOptions);
  const [usagePage, setUsagePage] = useState(1);
  const [usageTotal, setUsageTotal] = useState(0);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [isExportingUsage, setIsExportingUsage] = useState(false);
  const [usageError, setUsageError] = useState("");
  const usagePageSize = 25;

  // Fetch all categories
  const fetchCategories = useCallback(async () => {
    try {
      const data = await blogCmsApi.getCategories();
      setCategories(data);
    } catch (err) {
      console.error("Failed to fetch blog categories:", err);
    }
  }, []);

  // Fetch all posts
  const fetchPosts = useCallback(async () => {
    try {
      setIsLoadingPosts(true);
      const data = await blogCmsApi.getPosts();
      setPosts(data);
    } catch (err: any) {
      console.error("Failed to fetch blog posts:", err);
      toast({
        title: "Failed to Fetch Posts",
        description: err.message || "An error occurred while loading posts.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPosts(false);
    }
  }, [toast]);

  const buildUsageParams = useCallback(
    (page = usagePage) => {
      const params = new URLSearchParams();
      Object.entries(usageFilters).forEach(([key, value]) => {
        const trimmed = value.trim();
        if (trimmed) params.set(key, trimmed);
      });
      params.set("page", String(page));
      params.set("pageSize", String(usagePageSize));
      return params;
    },
    [usageFilters, usagePage]
  );

  const fetchUsageData = useCallback(
    async (page = usagePage) => {
      if (!token) return;
      try {
        setIsLoadingUsage(true);
        setUsageError("");
        const params = buildUsageParams(page);
        const request = async <T,>(path: string, query = params): Promise<T> => {
          const res = await fetch(`${API_BASE_URL}/api/admin/usage/${path}?${query.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Usage request failed: ${res.status}`);
          }
          return res.json();
        };
        const [summary, users, prompts, models, logs, filterOptions] = await Promise.all([
          request<UsageSummary>("summary"),
          request<{ rows: UsageUserRow[] }>("users"),
          request<{ rows: UsagePromptRow[] }>("prompts"),
          request<{ rows: UsageModelRow[] }>("models"),
          request<{ rows: UsageLogRow[]; total: number }>("logs"),
          request<UsageFilterOptions>("filter-options", new URLSearchParams()),
        ]);
        setUsageSummary(summary);
        setUsageUsers(users.rows);
        setUsagePrompts(prompts.rows);
        setUsageModels(models.rows);
        setUsageLogs(logs.rows);
        setUsageTotal(logs.total);
        setUsageFilterOptions(filterOptions);
      } catch (err: any) {
        const message = err?.message || "Failed to load usage ledger.";
        setUsageError(message);
        toast({ title: "Usage Ledger Error", description: message, variant: "destructive" });
      } finally {
        setIsLoadingUsage(false);
      }
    },
    [API_BASE_URL, buildUsageParams, token, toast, usagePage]
  );

  // Load initial data
  useEffect(() => {
    if (!loading) {
      if (!user || !token) {
        navigate("/auth");
        return;
      }
      if (user.role !== "admin") {
        toast({
          title: "Access Denied",
          description: "Admin role required to access this portal.",
          variant: "destructive",
        });
        navigate("/dashboard/overview");
        return;
      }
      fetchPosts();
      fetchCategories();
    }
  }, [user, token, loading, navigate, fetchPosts, fetchCategories, toast]);

  useEffect(() => {
    if (activeTab === "usage" && user?.role === "admin" && token) {
      fetchUsageData(usagePage);
    }
  }, [activeTab, fetchUsageData, token, usagePage, user?.role]);

  // Handle new post creation click
  const handleCreatePostClick = () => {
    setSelectedPost(null);
    setIsDrawerOpen(true);
  };

  // Handle post edit selection
  const handleEditPost = (post: BlogPost) => {
    setSelectedPost(post);
    setIsDrawerOpen(true);
  };

  // Trigger n8n legacy AI generator callback flow
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      toast({
        title: "Validation Error",
        description: "Blog topic is required.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsGenerating(true);
      setErrorMessage("");
      setSuccessMessage("");

      const tagsArray = categoryTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const res = await fetch(`${API_BASE_URL}/api/blog/admin/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: topic.trim(),
          primaryKeyword: primaryKeyword.trim() || undefined,
          tone,
          wordCount: Number(wordCount),
          categoryTags: tagsArray.length ? tagsArray : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMessage(
          `Successfully triggered generation! A draft blog post has been created. n8n is writing the content.`
        );
        toast({
          title: "Generation Triggered",
          description: "n8n content generation in progress.",
        });
        // Clear input form
        setTopic("");
        setPrimaryKeyword("");
        setCategoryTags("");

        // Refresh posts list to see the generated placeholder draft
        setTimeout(fetchPosts, 2000);
      } else {
        setErrorMessage(data.error || "Failed to trigger blog generation");
      }
    } catch (err) {
      setErrorMessage("Network error occurred while calling the generator API.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/auth");
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleUsageFilterChange = (key: keyof UsageFilters, value: string) => {
    setUsagePage(1);
    setUsageFilters((current) => ({ ...current, [key]: value }));
  };

  const handleExportUsageCsv = async () => {
    if (!token) return;
    try {
      setIsExportingUsage(true);
      const params = buildUsageParams(1);
      params.delete("page");
      params.delete("pageSize");
      const res = await fetch(`${API_BASE_URL}/api/admin/usage/export.csv?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`CSV export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "usage-ledger.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: "Export Failed",
        description: err?.message || "Could not export usage CSV.",
        variant: "destructive",
      });
    } finally {
      setIsExportingUsage(false);
    }
  };

  // CMS Blog Statistics
  const stats = React.useMemo(() => {
    const total = posts.length;
    const published = posts.filter(p => p.status === "PUBLISHED").length;
    const drafts = posts.filter(p => p.status === "DRAFT").length;
    const scheduled = posts.filter(p => p.status === "SCHEDULED").length;
    return { total, published, drafts, scheduled };
  }, [posts]);

  if (loading || !user || user.role !== "admin") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center space-x-3">
          <PenTool className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            SearchEO.ai <span className="font-medium text-slate-500">Editorial Portal</span>
          </h1>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{user.name || "Administrator"}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Log Out"
            className="text-slate-500 hover:bg-slate-100 hover:text-slate-900 rounded-full"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Statistics Panels */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Posts</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.total}</h3>
            </div>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Published</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.published}</h3>
            </div>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Drafts</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.drafts}</h3>
            </div>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Scheduled</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.scheduled}</h3>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-200/60 p-1 rounded-xl w-fit mb-6">
            <TabsTrigger value="cms" className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm">
              <Compass className="h-4 w-4" />
              Blog CMS Manager
            </TabsTrigger>
            <TabsTrigger value="generator" className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm">
              <Sparkles className="h-4 w-4" />
              AI Post Writer (n8n)
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm">
              <Database className="h-4 w-4" />
              Usage
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Blog CMS Manager */}
          <TabsContent value="cms" className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">CMS Blog Posts</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Manage, review, publish, and delete internal blog posts and categories.</p>
                </div>
                <Button
                  onClick={handleCreatePostClick}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow flex items-center gap-1.5"
                >
                  <Plus className="h-4.5 w-4.5" />
                  Create Blog Post
                </Button>
              </div>

              <PostTable
                posts={posts}
                categories={categories}
                isLoading={isLoadingPosts}
                onRefresh={fetchPosts}
                onEditPost={handleEditPost}
              />
            </div>
          </TabsContent>

          {/* Tab 2: AI Post Writer (n8n Generator) */}
          <TabsContent value="generator">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-2xl">
              <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                Trigger AI Content Generation
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Send a generation instruction to the n8n pipeline. The generated blog post will be sent back to this CMS portal automatically as a Draft for your final human review before publishing.
              </p>

              <form onSubmit={handleGenerate} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="topic" className="text-sm font-semibold text-slate-700">
                    Blog Topic / Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="topic"
                    placeholder="e.g. Discover the best prompt for your niche"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    required
                    disabled={isGenerating}
                    className="border-slate-200 focus-visible:ring-blue-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="primaryKeyword" className="text-sm font-semibold text-slate-700">
                    Primary Keyword (Optional)
                  </Label>
                  <Input
                    id="primaryKeyword"
                    placeholder="e.g. SEO prompts"
                    value={primaryKeyword}
                    onChange={(e) => setPrimaryKeyword(e.target.value)}
                    disabled={isGenerating}
                    className="border-slate-200 focus-visible:ring-blue-500"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tone" className="text-sm font-semibold text-slate-700">
                      Tone of Voice
                    </Label>
                    <select
                      id="tone"
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      disabled={isGenerating}
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="professional">Professional</option>
                      <option value="educational">Educational</option>
                      <option value="casual">Casual</option>
                      <option value="inspirational">Inspirational</option>
                      <option value="witty">Witty</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="wordCount" className="text-sm font-semibold text-slate-700">
                      Word Count Length
                    </Label>
                    <Input
                      id="wordCount"
                      type="number"
                      min={100}
                      max={10000}
                      value={wordCount}
                      onChange={(e) => setWordCount(Number(e.target.value))}
                      disabled={isGenerating}
                      className="border-slate-200 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoryTags" className="text-sm font-semibold text-slate-700">
                    Category Tags (Comma separated)
                  </Label>
                  <Input
                    id="categoryTags"
                    placeholder="e.g. SEO Tool, Artificial Intelligence, Digital Marketing"
                    value={categoryTags}
                    onChange={(e) => setCategoryTags(e.target.value)}
                    disabled={isGenerating}
                    className="border-slate-200 focus-visible:ring-blue-500"
                  />
                </div>

                {errorMessage && (
                  <div className="flex items-start space-x-2 rounded-lg bg-red-50 p-3 text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-xs">{errorMessage}</p>
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-start space-x-2 rounded-lg bg-emerald-50 p-3 text-emerald-800">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-xs">{successMessage}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isGenerating}
                  className="w-full bg-blue-600 text-white hover:bg-blue-700 font-semibold shadow py-2.5"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Triggering n8n Generator...
                    </>
                  ) : (
                    "🚀 Generate Blog Post"
                  )}
                </Button>
              </form>
            </div>
          </TabsContent>

          {/* Tab 3: Usage Ledger */}
          <TabsContent value="usage" className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Central Usage Ledger</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Track paid API usage across users, domains, prompts, providers, and models.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fetchUsageData(usagePage)}
                    disabled={isLoadingUsage}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingUsage ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  <Button
                    onClick={handleExportUsageCsv}
                    disabled={isExportingUsage}
                    className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {isExportingUsage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Export CSV
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-500">From</Label>
                  <Input
                    type="date"
                    value={usageFilters.from}
                    onChange={(e) => handleUsageFilterChange("from", e.target.value)}
                    className="border-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-500">To</Label>
                  <Input
                    type="date"
                    value={usageFilters.to}
                    onChange={(e) => handleUsageFilterChange("to", e.target.value)}
                    className="border-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-500">Provider</Label>
                  <select
                    value={usageFilters.provider}
                    onChange={(e) => handleUsageFilterChange("provider", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All providers</option>
                    {(usageFilterOptions.providers.length ? usageFilterOptions.providers : fallbackProviderOptions).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-500">Status</Label>
                  <select
                    value={usageFilters.status}
                    onChange={(e) => handleUsageFilterChange("status", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All statuses</option>
                    {(usageFilterOptions.statuses.length ? usageFilterOptions.statuses : fallbackStatusOptions).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-500">User</Label>
                  <select
                    value={usageFilters.userId}
                    onChange={(e) => handleUsageFilterChange("userId", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All users</option>
                    {usageFilterOptions.users.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.description ? `${option.label} (${option.description})` : option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-500">Domain</Label>
                  <select
                    value={usageFilters.domainId}
                    onChange={(e) => handleUsageFilterChange("domainId", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All domains</option>
                    {usageFilterOptions.domains.map((option) => (
                      <option key={option.value || option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-500">Workflow</Label>
                  <select
                    value={usageFilters.feature}
                    onChange={(e) => handleUsageFilterChange("feature", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All workflows</option>
                    {usageFilterOptions.features.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-500">Model</Label>
                  <select
                    value={usageFilters.model}
                    onChange={(e) => handleUsageFilterChange("model", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All models</option>
                    {usageFilterOptions.models.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.description && option.description !== option.label
                          ? `${option.label} (${option.description})`
                          : option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {usageError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-xs">{usageError}</p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm">
                <DollarSign className="mb-3 h-5 w-5 text-emerald-600" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Spend</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">{formatUsd(usageSummary?.totalCostUsd)}</h3>
              </div>
              <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm">
                <Database className="mb-3 h-5 w-5 text-blue-600" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Calls</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">{formatCompactNumber(usageSummary?.totalCalls)}</h3>
              </div>
              <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm">
                <Bot className="mb-3 h-5 w-5 text-indigo-600" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tokens</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">{formatCompactNumber(usageSummary?.totalTokens)}</h3>
              </div>
              <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm">
                <AlertCircle className="mb-3 h-5 w-5 text-red-600" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Failures</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">{formatCompactNumber(usageSummary?.failedCalls)}</h3>
              </div>
              <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm">
                <FileText className="mb-3 h-5 w-5 text-amber-600" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Avg / Prompt</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">{formatUsd(usageSummary?.avgCostPerPromptUsd)}</h3>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-950">
                  <Users className="h-4 w-4 text-blue-600" />
                  Users
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="pb-2">User</th>
                        <th className="pb-2 text-right">Calls</th>
                        <th className="pb-2 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {usageUsers.slice(0, 8).map((row) => (
                        <tr key={row.userId ?? "anonymous"}>
                          <td className="py-3">
                            <p className="font-medium text-slate-900">{row.email || row.name || `User ${row.userId ?? "unknown"}`}</p>
                            <p className="text-xs text-slate-500">{formatCompactNumber(row.totalTokens)} tokens</p>
                          </td>
                          <td className="py-3 text-right font-medium">{formatCompactNumber(row.totalCalls)}</td>
                          <td className="py-3 text-right font-semibold">{formatUsd(row.totalCostUsd)}</td>
                        </tr>
                      ))}
                      {!usageUsers.length && (
                        <tr>
                          <td className="py-5 text-sm text-slate-500" colSpan={3}>No user usage yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-950">
                  <Bot className="h-4 w-4 text-indigo-600" />
                  Models and Providers
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="pb-2">Model</th>
                        <th className="pb-2 text-right">Calls</th>
                        <th className="pb-2 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {usageModels.slice(0, 8).map((row) => (
                        <tr key={`${row.provider}-${row.model ?? "none"}`}>
                          <td className="py-3">
                            <p className="max-w-52 truncate font-medium text-slate-900">{row.model || "External API"}</p>
                            <p className="text-xs capitalize text-slate-500">{row.provider}</p>
                          </td>
                          <td className="py-3 text-right font-medium">{formatCompactNumber(row.totalCalls)}</td>
                          <td className="py-3 text-right font-semibold">{formatUsd(row.totalCostUsd)}</td>
                        </tr>
                      ))}
                      {!usageModels.length && (
                        <tr>
                          <td className="py-5 text-sm text-slate-500" colSpan={3}>No model usage yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-950">
                  <FileText className="h-4 w-4 text-amber-600" />
                  Prompts
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="pb-2">Prompt</th>
                        <th className="pb-2 text-right">Calls</th>
                        <th className="pb-2 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {usagePrompts.slice(0, 8).map((row) => (
                        <tr key={row.promptId ?? `${row.domainHost}-prompt`}>
                          <td className="py-3">
                            <p className="line-clamp-2 max-w-60 font-medium text-slate-900">
                              {row.promptText || `Prompt ${row.promptId ?? "unknown"}`}
                            </p>
                            <p className="text-xs text-slate-500">{row.domainHost || "No domain"}</p>
                          </td>
                          <td className="py-3 text-right font-medium">{formatCompactNumber(row.totalCalls)}</td>
                          <td className="py-3 text-right font-semibold">{formatUsd(row.totalCostUsd)}</td>
                        </tr>
                      ))}
                      {!usagePrompts.length && (
                        <tr>
                          <td className="py-5 text-sm text-slate-500" colSpan={3}>No prompt usage yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">Raw Usage Logs</h3>
                  <p className="text-xs text-slate-500">{formatCompactNumber(usageTotal)} matching ledger rows</p>
                </div>
                {isLoadingUsage && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1100px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Time</th>
                      <th className="px-5 py-3">Provider</th>
                      <th className="px-5 py-3">Feature</th>
                      <th className="px-5 py-3">Operation</th>
                      <th className="px-5 py-3">Model</th>
                      <th className="px-5 py-3">Context</th>
                      <th className="px-5 py-3 text-right">Tokens</th>
                      <th className="px-5 py-3 text-right">Cost</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usageLogs.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3 text-slate-600">{formatUsageDate(row.createdAt)}</td>
                        <td className="px-5 py-3 font-medium capitalize text-slate-900">{row.provider}</td>
                        <td className="px-5 py-3 text-slate-700">{row.feature}</td>
                        <td className="px-5 py-3 text-slate-700">{row.operation}</td>
                        <td className="px-5 py-3 max-w-52 truncate text-slate-700">{row.modelUsed || "-"}</td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          <p>{row.domainHost || `Domain ${row.domainId ?? "-"}`}</p>
                          <p>User {row.userId ?? "-"} · Prompt {row.promptId ?? "-"}</p>
                        </td>
                        <td className="px-5 py-3 text-right font-medium">{formatCompactNumber(row.totalTokens)}</td>
                        <td className="px-5 py-3 text-right font-semibold">{formatUsd(row.costUsd)}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.status === "success"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}>
                            {row.status}
                          </span>
                          {row.errorMessage && <p className="mt-1 max-w-44 truncate text-xs text-red-500">{row.errorMessage}</p>}
                        </td>
                      </tr>
                    ))}
                    {!usageLogs.length && (
                      <tr>
                        <td className="px-5 py-8 text-center text-sm text-slate-500" colSpan={9}>
                          No usage ledger rows match the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                <p className="text-xs text-slate-500">
                  Page {usagePage} of {Math.max(1, Math.ceil(usageTotal / usagePageSize))}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={usagePage <= 1 || isLoadingUsage}
                    onClick={() => setUsagePage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    disabled={usagePage >= Math.max(1, Math.ceil(usageTotal / usagePageSize)) || isLoadingUsage}
                    onClick={() => setUsagePage((page) => page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Editor Drawer */}
      <PostDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        post={selectedPost}
        categories={categories}
        onRefreshCategories={fetchCategories}
        onPostSaved={fetchPosts}
      />
    </div>
  );
};

export default AdminDashboard;
