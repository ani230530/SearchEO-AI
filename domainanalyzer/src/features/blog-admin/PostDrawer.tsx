import React, { useEffect, useState, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { blogCmsApi } from "./api";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  Eye,
  Code,
  Globe,
  Settings,
  User,
  Image as ImageIcon,
  Plus,
  Check,
  Calendar,
  AlertCircle,
  Sparkles
} from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import type { BlogPost, BlogCategory, BlogPostStatus } from "./types";
import { CategoryDialog } from "./CategoryDialog";

interface PostDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: BlogPost | null; // Null if creating a new post
  categories: BlogCategory[];
  onRefreshCategories: () => void;
  onPostSaved: () => void;
}

export const PostDrawer: React.FC<PostDrawerProps> = ({
  open,
  onOpenChange,
  post,
  categories,
  onRefreshCategories,
  onPostSaved,
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("editor");
  const [editorMode, setEditorMode] = useState<"visual" | "html">("visual");

  // Form states
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [heroImageAlt, setHeroImageAlt] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorTitle, setAuthorTitle] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [status, setStatus] = useState<BlogPostStatus>("DRAFT");
  const [publishedAt, setPublishedAt] = useState("");

  // UI states
  const [isSaving, setIsSaving] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);

  // AI generation settings states
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [tone, setTone] = useState("professional");
  const [wordCount, setWordCount] = useState(800);
  const [categoryTags, setCategoryTags] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");
  const [generatedDraftId, setGeneratedDraftId] = useState<number | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);

  // Initialize form with post data
  useEffect(() => {
    if (post) {
      setTitle(post.title || "");
      setSlug(post.slug || "");
      setExcerpt(post.excerpt || "");
      setContentHtml(post.contentHtml || "");
      setHeroImageUrl(post.heroImageUrl || "");
      setHeroImageAlt(post.heroImageAlt || "");
      setAuthorName(post.authorName || "");
      setAuthorTitle(post.authorTitle || "");
      setSeoTitle(post.seoTitle || "");
      setSeoDescription(post.seoDescription || "");
      setCategoryId(post.categoryId !== null ? post.categoryId : "");
      setStatus(post.status || "DRAFT");

      if (post.publishedAt) {
        // Convert ISO string to date input format (YYYY-MM-DDThh:mm)
        const date = new Date(post.publishedAt);
        const offset = date.getTimezoneOffset();
        const adjustedDate = new Date(date.getTime() - offset * 60 * 1000);
        setPublishedAt(adjustedDate.toISOString().slice(0, 16));
      } else {
        setPublishedAt("");
      }

      // Clear generation state when editing existing post
      setPrimaryKeyword("");
      setTone("professional");
      setWordCount(800);
      setCategoryTags("");
      setIsGenerating(false);
      setGenerationProgress("");
      setGeneratedDraftId(null);
      setIsManualMode(false);
    } else {
      // Clear form for new post
      setTitle("");
      setSlug("");
      setExcerpt("");
      setContentHtml("");
      setHeroImageUrl("");
      setHeroImageAlt("");
      setAuthorName("");
      setAuthorTitle("");
      setSeoTitle("");
      setSeoDescription("");
      setCategoryId("");
      setStatus("DRAFT");
      setPublishedAt("");

      // Clear generation state
      setPrimaryKeyword("");
      setTone("professional");
      setWordCount(800);
      setCategoryTags("");
      setIsGenerating(false);
      setGenerationProgress("");
      setGeneratedDraftId(null);
      setIsManualMode(false);
    }
    setActiveTab("editor");
  }, [post, open]);

  // Handle auto-slugification
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (!post && !slug) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
      );
    }
  };
  // Poll backend for generation completion
  const pollGeneration = async (draftId: number) => {
    let attempts = 0;
    const maxAttempts = 100; // ~5 mins max

    const interval = setInterval(async () => {
      attempts++;

      if (attempts > maxAttempts) {
        clearInterval(interval);
        setIsGenerating(false);
        setGenerationProgress("");
        toast({
          title: "Generation Timed Out",
          description: "AI generation took too long. Please check back in a few minutes.",
          variant: "destructive",
        });
        return;
      }

      try {
        const currentPost = await blogCmsApi.getPostById(draftId);

        // n8n populates contentHtml when complete
        // If contentHtml exists and is not the default "Generation in progress..." placeholder, it is done!
        if (
          currentPost.contentHtml &&
          !currentPost.contentHtml.includes("Generation in progress...")
        ) {
          clearInterval(interval);

          // Populate form states with generated data
          setTitle(currentPost.title || "");
          setSlug(currentPost.slug || "");
          setExcerpt(currentPost.excerpt || "");
          setContentHtml(currentPost.contentHtml || "");
          setHeroImageUrl(currentPost.heroImageUrl || "");
          setHeroImageAlt(currentPost.heroImageAlt || "");
          setAuthorName(currentPost.authorName || "");
          setAuthorTitle(currentPost.authorTitle || "");
          setSeoTitle(currentPost.seoTitle || "");
          setSeoDescription(currentPost.seoDescription || "");
          setCategoryId(currentPost.categoryId !== null ? currentPost.categoryId : "");
          setStatus(currentPost.status || "DRAFT");

          setIsGenerating(false);
          setGenerationProgress("");
          setGeneratedDraftId(draftId);

          toast({
            title: "Blog Post Generated!",
            description: "The AI has finished writing your blog post.",
          });
        }
      } catch (err: any) {
        console.error("Error polling generation:", err);
      }
    }, 3000);
  };

  const handleGenerate = async () => {
    if (!title.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a topic or title for the blog post.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsGenerating(true);
      setGenerationProgress("Contacting n8n writing service...");
      setActiveTab("preview"); // Switch to visual preview tab to show generator animations!

      const tagsArray = categoryTags
        ? categoryTags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      const res = await blogCmsApi.generatePost({
        topic: title.trim(),
        primaryKeyword: primaryKeyword.trim() || undefined,
        tone: tone,
        wordCount: Number(wordCount) || 800,
        categoryTags: tagsArray,
        generateFeaturedImage: true,
      });

      if (!res.success || !res.draftId) {
        throw new Error(res.message || "Failed to start generation");
      }

      setGenerationProgress("AI is drafting your article... (takes 1-2 minutes)");
      pollGeneration(res.draftId);

    } catch (err: any) {
      setIsGenerating(false);
      setGenerationProgress("");
      setActiveTab("editor");
      toast({
        title: "Generation Failed",
        description: err.message || "Could not trigger n8n content generation.",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({
        title: "Validation Error",
        description: "Blog post title is required.",
        variant: "destructive",
      });
      return;
    }

    const payload: Partial<BlogPost> = {
      title: title.trim(),
      slug: slug.trim() || undefined,
      excerpt: excerpt.trim() || null,
      contentHtml: contentHtml,
      heroImageUrl: heroImageUrl.trim() || null,
      heroImageAlt: heroImageAlt.trim() || null,
      authorName: authorName.trim() || null,
      authorTitle: authorTitle.trim() || null,
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
      categoryId: categoryId === "" ? null : Number(categoryId),
      status: status,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : (status === "PUBLISHED" ? new Date().toISOString() : null),
    };

    try {
      setIsSaving(true);
      const idToUpdate = post ? post.id : generatedDraftId;

      if (idToUpdate !== null && idToUpdate !== undefined) {
        await blogCmsApi.updatePost(idToUpdate, payload);
        toast({
          title: "Post Updated",
          description: `Blog post "${title}" has been updated successfully.`,
        });
      } else {
        await blogCmsApi.createPost(payload);
        toast({
          title: "Post Created",
          description: `Blog post "${title}" has been created successfully.`,
        });
      }
      onPostSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Error Saving Post",
        description: err.message || "Failed to save the blog post.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Quill rich text modules configuration
  const quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, 4, false] }],
      ["bold", "italic", "underline", "strike", "blockquote"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link", "image"],
      ["clean"],
    ],
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[768px] w-full h-full flex flex-col p-0 overflow-hidden bg-white">
          <SheetHeader className="px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-xl font-bold text-slate-900">
                  {post ? "📝 Edit Blog Post" : "✨ Create Blog Post"}
                </SheetTitle>
                <SheetDescription className="text-sm text-slate-500 mt-1">
                  {post ? `Editing /${post.slug}` : "Draft a new internal blog post"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {/* Core Content area */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {!post && !generatedDraftId && !isManualMode && !isGenerating ? (
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-blue-600 animate-pulse" />
                  <h3 className="text-base font-bold text-slate-800">Trigger AI Content Generation</h3>
                </div>
                <p className="text-xs text-slate-500 leading-normal">
                  Specify your topic and settings. The generated post will automatically load in this drawer for review and preview.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="drawer-topic" className="text-sm font-semibold text-slate-700">
                    Blog Topic / Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="drawer-topic"
                    placeholder="e.g. Discover the best prompt for your niche"
                    value={title}
                    onChange={handleTitleChange}
                    className="font-semibold text-base border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drawer-keyword" className="text-sm font-semibold text-slate-700">
                    Primary Keyword (Optional)
                  </Label>
                  <Input
                    id="drawer-keyword"
                    value={primaryKeyword}
                    onChange={(e) => setPrimaryKeyword(e.target.value)}
                    placeholder="e.g. SEO prompts"
                    className="border-slate-200"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="drawer-tone" className="text-sm font-semibold text-slate-700">
                      Tone of Voice
                    </Label>
                    <select
                      id="drawer-tone"
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
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
                    <Label htmlFor="drawer-words" className="text-sm font-semibold text-slate-700">
                      Word Count Length
                    </Label>
                    <Input
                      id="drawer-words"
                      type="number"
                      min={100}
                      value={wordCount}
                      onChange={(e) => setWordCount(Number(e.target.value))}
                      className="border-slate-200"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drawer-tags" className="text-sm font-semibold text-slate-700">
                    Category Tags (Comma separated)
                  </Label>
                  <Input
                    id="drawer-tags"
                    placeholder="e.g. SEO Tool, Artificial Intelligence, Digital Marketing"
                    value={categoryTags}
                    onChange={(e) => setCategoryTags(e.target.value)}
                    className="border-slate-200"
                  />
                </div>
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid grid-cols-3 w-full bg-slate-100/80 p-1 rounded-lg shrink-0">
                  <TabsTrigger value="editor" className="flex items-center justify-center gap-2">
                    <Code className="h-4 w-4" />
                    Editor Content
                  </TabsTrigger>
                  <TabsTrigger value="seo" className="flex items-center justify-center gap-2">
                    <Globe className="h-4 w-4" />
                    SEO &amp; Details
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="flex items-center justify-center gap-2">
                    <Eye className="h-4 w-4" />
                    Visual Preview
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Editor Content */}
                <TabsContent value="editor" className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="post-title" className="text-sm font-semibold text-slate-700">
                      Post Title <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="post-title"
                      value={title}
                      onChange={handleTitleChange}
                      placeholder="Enter post title..."
                      className="font-semibold text-base border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="post-slug" className="text-sm font-semibold text-slate-700">
                        URL Slug
                      </Label>
                      <Input
                        id="post-slug"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="e.g. prompt-engineering-tips"
                        className="font-mono text-xs border-slate-200 focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="post-category" className="text-sm font-semibold text-slate-700">
                        Category
                      </Label>
                      <div className="flex gap-2">
                        <select
                          id="post-category"
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
                          className="flex-1 h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Uncategorized</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setIsCategoryDialogOpen(true)}
                          title="Add New Category"
                          className="shrink-0 text-slate-600 hover:text-slate-900 border-slate-200"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="post-excerpt" className="text-sm font-semibold text-slate-700">
                      Excerpt / Short Description
                    </Label>
                    <Textarea
                      id="post-excerpt"
                      value={excerpt}
                      onChange={(e) => setExcerpt(e.target.value)}
                      placeholder="Provide a quick summary of the post..."
                      className="resize-none h-16 border-slate-200"
                    />
                  </div>

                  {/* Editor Module Selector (Visual or HTML) */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-sm font-semibold text-slate-700">Content</Label>
                      <div className="flex border border-slate-200 rounded-md overflow-hidden p-0.5 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => setEditorMode("visual")}
                          className={`px-3 py-1 text-xs font-semibold rounded-sm transition-colors ${
                            editorMode === "visual"
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-900"
                          }`}
                        >
                          Visual Editor
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorMode("html")}
                          className={`px-3 py-1 text-xs font-semibold rounded-sm transition-colors ${
                            editorMode === "html"
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-900"
                          }`}
                        >
                          Raw HTML
                        </button>
                      </div>
                    </div>

                    {editorMode === "visual" ? (
                      <div className="border border-slate-200 rounded-md bg-white">
                        <ReactQuill
                          theme="snow"
                          value={contentHtml}
                          onChange={setContentHtml}
                          modules={quillModules}
                          placeholder="Write something amazing..."
                          className="min-h-[280px] max-h-[400px] overflow-y-auto"
                        />
                      </div>
                    ) : (
                      <Textarea
                        value={contentHtml}
                        onChange={(e) => setContentHtml(e.target.value)}
                        placeholder="<p>Write your raw HTML here...</p>"
                        className="font-mono text-sm min-h-[300px] max-h-[420px] resize-y border-slate-200 focus:border-blue-500"
                      />
                    )}
                  </div>
                </TabsContent>

                {/* Tab 2: SEO & Details */}
                <TabsContent value="seo" className="space-y-5 pt-4">
                  {/* Author Info */}
                  <div className="bg-slate-50/50 p-4 border border-slate-100 rounded-xl space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <User className="h-4 w-4 text-blue-500" />
                      Author Information
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="post-author" className="text-xs font-medium text-slate-600">
                          Author Name
                        </Label>
                        <Input
                          id="post-author"
                          value={authorName}
                          onChange={(e) => setAuthorName(e.target.value)}
                          placeholder="e.g. Jane Smith"
                          className="bg-white border-slate-200"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="post-author-title" className="text-xs font-medium text-slate-600">
                          Author Title
                        </Label>
                        <Input
                          id="post-author-title"
                          value={authorTitle}
                          onChange={(e) => setAuthorTitle(e.target.value)}
                          placeholder="e.g. Senior Content Marketer"
                          className="bg-white border-slate-200"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Hero Image Info */}
                  <div className="bg-slate-50/50 p-4 border border-slate-100 rounded-xl space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-emerald-500" />
                      Hero Image
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="post-hero-url" className="text-xs font-medium text-slate-600">
                          Hero Image URL
                        </Label>
                        <Input
                          id="post-hero-url"
                          value={heroImageUrl}
                          onChange={(e) => setHeroImageUrl(e.target.value)}
                          placeholder="e.g. https://images.unsplash.com/photo-..."
                          className="bg-white border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="post-hero-alt" className="text-xs font-medium text-slate-600">
                          Hero Image Alt Text
                        </Label>
                        <Input
                          id="post-hero-alt"
                          value={heroImageAlt}
                          onChange={(e) => setHeroImageAlt(e.target.value)}
                          placeholder="e.g. Person analyzing search volumes on screen"
                          className="bg-white border-slate-200"
                        />
                      </div>
                      {heroImageUrl && (
                        <div className="mt-2 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 max-h-[140px] flex items-center justify-center">
                          <img
                            src={heroImageUrl}
                            alt={heroImageAlt || "Hero Preview"}
                            className="max-w-full max-h-[140px] object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SEO Settings */}
                  <div className="bg-slate-50/50 p-4 border border-slate-100 rounded-xl space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <Settings className="h-4 w-4 text-violet-500" />
                      SEO Search Engine Preview
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="post-seo-title" className="text-xs font-medium text-slate-600">
                          SEO Meta Title
                        </Label>
                        <Input
                          id="post-seo-title"
                          value={seoTitle}
                          onChange={(e) => setSeoTitle(e.target.value)}
                          placeholder="e.g. Best SEO Strategies in 2026 | SearchEO"
                          className="bg-white border-slate-200"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="post-seo-desc" className="text-xs font-medium text-slate-600">
                          SEO Meta Description
                        </Label>
                        <Textarea
                          id="post-seo-desc"
                          value={seoDescription}
                          onChange={(e) => setSeoDescription(e.target.value)}
                          placeholder="Provide a search snippet meta description..."
                          className="bg-white resize-none h-16 border-slate-200 text-xs"
                        />
                      </div>

                      {/* Google SERP Simulator */}
                      <div className="mt-4 p-4 border border-slate-200 bg-white rounded-lg shadow-sm font-sans max-w-full overflow-hidden">
                        <span className="text-[11px] text-slate-400 font-mono tracking-tight block">
                          Google Search Result Preview:
                        </span>
                        <div className="mt-2 space-y-1">
                          <span className="text-xs text-slate-500 block truncate font-mono">
                            https://searcheo.ai/blog/{slug || "your-post-slug"}
                          </span>
                          <h4 className="text-lg text-blue-800 font-medium hover:underline cursor-pointer leading-tight truncate">
                            {seoTitle || title || "Please enter a title"}
                          </h4>
                          <p className="text-xs text-slate-600 leading-normal line-clamp-2">
                            {seoDescription || excerpt || "Write a compelling SEO description to increase click-through rates from Google search result pages."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Tab 3: Visual Preview */}
                <TabsContent value="preview" className="pt-4">
                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-slate-50 border border-slate-200 border-dashed rounded-xl min-h-[350px] space-y-6">
                      <div className="relative flex items-center justify-center">
                        <div className="h-16 w-16 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
                        <Sparkles className="h-6 w-6 text-blue-500 absolute animate-pulse" />
                      </div>
                      <div className="text-center space-y-2">
                        <h4 className="text-base font-bold text-slate-800 animate-pulse">
                          Generating Blog Post Content
                        </h4>
                        <p className="text-xs text-slate-500 max-w-xs leading-normal px-4">
                          {generationProgress || "n8n is running the writing agents in the background..."}
                        </p>
                      </div>
                      <div className="flex gap-1.5 justify-center">
                        <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  ) : (
                    <article className="prose prose-slate max-w-none bg-slate-50 p-6 rounded-xl border border-slate-200 min-h-[300px]">
                      {heroImageUrl && (
                        <img
                          src={heroImageUrl}
                          alt={heroImageAlt}
                          className="w-full h-48 object-cover rounded-lg mb-6 shadow-sm"
                        />
                      )}
                      <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
                        {title || "Untitled Blog Post"}
                      </h1>
                      <div className="flex items-center space-x-2 text-xs text-slate-400 mb-6 border-b border-slate-200 pb-3">
                        {authorName && <span>By {authorName}</span>}
                        {authorName && authorTitle && <span>• {authorTitle}</span>}
                        <span>• {new Date().toLocaleDateString()}</span>
                      </div>
                      {contentHtml ? (
                        <div
                          className="text-slate-800 leading-relaxed space-y-4"
                          dangerouslySetInnerHTML={{ __html: contentHtml }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                          <AlertCircle className="h-8 w-8 mb-2" />
                          <p className="text-sm font-semibold">No content written yet.</p>
                          <p className="text-xs">Write content in the editor tab to see it render here.</p>
                        </div>
                      )}
                    </article>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>

          {/* Bottom sticky footer */}
          <SheetFooter className="px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50/50 flex flex-row items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <Label htmlFor="post-status" className="text-xs font-semibold text-slate-500">
                  Status
                </Label>
                <select
                  id="post-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as BlogPostStatus)}
                  className="mt-1 h-9 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="SCHEDULED">Scheduled</option>
                </select>
              </div>

              {status === "SCHEDULED" && (
                <div className="flex flex-col">
                  <Label htmlFor="post-schedule-date" className="text-xs font-semibold text-slate-500">
                    Schedule Date
                  </Label>
                  <input
                    type="datetime-local"
                    id="post-schedule-date"
                    value={publishedAt}
                    onChange={(e) => setPublishedAt(e.target.value)}
                    className="mt-1 h-9 rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSaving || isGenerating}
              >
                Discard
              </Button>

              {!post && !generatedDraftId ? (
                !isManualMode ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsManualMode(true);
                        setActiveTab("editor");
                      }}
                      disabled={isSaving || isGenerating}
                      className="border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      Write Manually
                    </Button>
                    <Button
                      type="button"
                      onClick={handleGenerate}
                      disabled={isSaving || isGenerating}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow flex items-center gap-1.5"
                    >
                      <Sparkles className="h-4 w-4" />
                      Generate Blog
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsManualMode(false)}
                      disabled={isSaving || isGenerating}
                      className="border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      Use AI Generator
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving || isGenerating}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow flex items-center gap-1.5"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Save Blog Post
                    </Button>
                  </>
                )
              ) : (
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isGenerating}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Save Blog Post
                    </>
                  )}
                </Button>
              )}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <CategoryDialog
        open={isCategoryDialogOpen}
        onOpenChange={setIsCategoryDialogOpen}
        onCategoryCreated={(newCat) => {
          onRefreshCategories();
          setCategoryId(newCat.id);
        }}
      />
    </>
  );
};
