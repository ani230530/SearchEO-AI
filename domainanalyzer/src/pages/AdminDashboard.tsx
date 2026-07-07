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
  BarChart2
} from "lucide-react";

import { blogCmsApi } from "@/features/blog-admin/api";
import { PostTable } from "@/features/blog-admin/PostTable";
import { PostDrawer } from "@/features/blog-admin/PostDrawer";
import type { BlogPost, BlogCategory } from "@/features/blog-admin/types";

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
