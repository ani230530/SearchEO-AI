import React, { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { StatusBadge } from "./StatusBadge";
import { blogCmsApi } from "./api";
import { useToast } from "@/components/ui/use-toast";
import {
  Search,
  Edit2,
  Trash2,
  Calendar,
  Tag,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  FolderOpen,
  FilterX,
  Globe
} from "lucide-react";
import type { BlogPost, BlogCategory, BlogPostStatus } from "./types";

interface PostTableProps {
  posts: BlogPost[];
  categories: BlogCategory[];
  isLoading: boolean;
  onRefresh: () => void;
  onEditPost: (post: BlogPost) => void;
}

type SortKey = "title" | "createdAt" | "updatedAt" | "publishedAt";
type SortOrder = "asc" | "desc";

export const PostTable: React.FC<PostTableProps> = ({
  posts,
  categories,
  isLoading,
  onRefresh,
  onEditPost,
}) => {
  const { toast } = useToast();

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Sorting states
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Delete dialog states
  const [postToDelete, setPostToDelete] = useState<BlogPost | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);

  const handlePublishPost = async (post: BlogPost) => {
    try {
      setPublishingId(post.id);
      await blogCmsApi.updatePostStatus(post.id, "PUBLISHED", new Date().toISOString());
      toast({
        title: "Post Published",
        description: `Blog post "${post.title}" has been published successfully.`,
      });
      onRefresh();
    } catch (err: any) {
      toast({
        title: "Publish Failed",
        description: err.message || "Failed to publish post.",
        variant: "destructive",
      });
    } finally {
      setPublishingId(null);
    }
  };

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Handle delete operation
  const handleDeletePost = async () => {
    if (!postToDelete) return;

    try {
      setIsDeleting(true);
      await blogCmsApi.deletePost(postToDelete.id);
      toast({
        title: "Post Deleted",
        description: `Blog post "${postToDelete.title}" has been deleted successfully.`,
      });
      onRefresh();
    } catch (err: any) {
      toast({
        title: "Delete Failed",
        description: err.message || "Failed to delete post.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setPostToDelete(null);
    }
  };

  // Sort helper
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  // Filtered & Sorted posts
  const filteredAndSortedPosts = useMemo(() => {
    let result = [...posts];

    // 1. Apply Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          p.slug.toLowerCase().includes(term) ||
          (p.excerpt && p.excerpt.toLowerCase().includes(term)) ||
          p.contentHtml.toLowerCase().includes(term)
      );
    }

    // 2. Apply Status Filter
    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }

    // 3. Apply Category Filter
    if (categoryFilter !== "ALL") {
      if (categoryFilter === "UNCATEGORIZED") {
        result = result.filter((p) => p.categoryId === null);
      } else {
        result = result.filter((p) => p.categoryId === Number(categoryFilter));
      }
    }

    // 4. Apply Sorting
    result.sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];

      if (sortKey === "createdAt" || sortKey === "updatedAt" || sortKey === "publishedAt") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      } else {
        aVal = (aVal || "").toString().toLowerCase();
        bVal = (bVal || "").toString().toLowerCase();
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [posts, searchTerm, statusFilter, categoryFilter, sortKey, sortOrder]);

  // Paginated posts
  const paginatedPosts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedPosts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedPosts, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedPosts.length / itemsPerPage);

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setCategoryFilter("ALL");
    setCurrentPage(1);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
    if (sortKey !== colKey) return null;
    return sortOrder === "asc" ? (
      <ChevronUp className="ml-1 h-3.5 w-3.5 inline" />
    ) : (
      <ChevronDown className="ml-1 h-3.5 w-3.5 inline" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
          <Input
            placeholder="Search title, slug, content..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 bg-white border-slate-200 focus-visible:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1.5">
            <span className="text-xs font-semibold text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs bg-transparent focus:outline-none font-medium text-slate-700 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1.5">
            <span className="text-xs font-semibold text-slate-500">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs bg-transparent focus:outline-none font-medium text-slate-700 cursor-pointer max-w-[140px]"
            >
              <option value="ALL">All Categories</option>
              <option value="UNCATEGORIZED">Uncategorized</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {(searchTerm || statusFilter !== "ALL" || categoryFilter !== "ALL") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-8 text-xs text-blue-600 hover:text-blue-800 font-semibold"
            >
              <FilterX className="mr-1.5 h-3.5 w-3.5" />
              Reset Filters
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-9 w-9 shrink-0 border-slate-200 text-slate-600 hover:text-slate-900 bg-white"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Main Table view */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50/75">
            <TableRow>
              <TableHead
                className="font-bold text-slate-700 cursor-pointer select-none py-3"
                onClick={() => handleSort("title")}
              >
                Post Title <SortIcon colKey="title" />
              </TableHead>
              <TableHead className="font-bold text-slate-700">Slug</TableHead>
              <TableHead className="font-bold text-slate-700">Category</TableHead>
              <TableHead className="font-bold text-slate-700">Status</TableHead>
              <TableHead
                className="font-bold text-slate-700 cursor-pointer select-none"
                onClick={() => handleSort("createdAt")}
              >
                Created <SortIcon colKey="createdAt" />
              </TableHead>
              <TableHead
                className="font-bold text-slate-700 cursor-pointer select-none"
                onClick={() => handleSort("updatedAt")}
              >
                Updated <SortIcon colKey="updatedAt" />
              </TableHead>
              <TableHead
                className="font-bold text-slate-700 cursor-pointer select-none"
                onClick={() => handleSort("publishedAt")}
              >
                Published/Scheduled <SortIcon colKey="publishedAt" />
              </TableHead>
              <TableHead className="w-[100px] text-right font-bold text-slate-700">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
                    <span className="text-sm font-medium">Loading blog posts...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : paginatedPosts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-48 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2 py-6">
                    <FolderOpen className="h-10 w-10 text-slate-300" />
                    <span className="text-base font-bold text-slate-500">No blog posts found</span>
                    <span className="text-xs text-slate-400">
                      {posts.length === 0
                        ? "Start by creating a new post or triggering n8n callback generation."
                        : "No posts match the current search filters."}
                    </span>
                    {(searchTerm || statusFilter !== "ALL" || categoryFilter !== "ALL") && (
                      <Button variant="outline" size="sm" onClick={resetFilters} className="mt-3">
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedPosts.map((post) => (
                <TableRow key={post.id} className="hover:bg-slate-50/60 transition-colors">
                  <TableCell className="font-semibold text-slate-900 py-3.5 max-w-[240px] truncate">
                    <button
                      onClick={() => onEditPost(post)}
                      className="text-left font-semibold hover:text-blue-600 focus:outline-none transition-colors"
                    >
                      {post.title}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500 max-w-[140px] truncate">
                    /{post.slug}
                  </TableCell>
                  <TableCell>
                    {post.category ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                        <Tag className="h-3 w-3" />
                        {post.category.name}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Uncategorized</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={post.status} />
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 font-medium">
                    {formatDate(post.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 font-medium">
                    {formatDate(post.updatedAt)}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {post.publishedAt || post.scheduledAt ? (
                      <span className="flex items-center gap-1 text-slate-700">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        {formatDate(post.publishedAt || post.scheduledAt)}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {post.status !== "PUBLISHED" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePublishPost(post)}
                          disabled={publishingId === post.id}
                          className="h-8 w-8 text-slate-500 hover:text-green-600 hover:bg-green-50 disabled:opacity-50"
                          title="Publish Post"
                        >
                          {publishingId === post.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Globe className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditPost(post)}
                        className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                        title="Edit Post"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPostToDelete(post)}
                        className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50"
                        title="Delete Post"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-2 px-1">
          <span className="text-xs text-slate-500 font-medium">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, filteredAndSortedPosts.length)} of{" "}
            {filteredAndSortedPosts.length} posts
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 px-2"
            >
              Previous
            </Button>
            {Array.from({ length: totalPages }).map((_, index) => (
              <Button
                key={index}
                variant={currentPage === index + 1 ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(index + 1)}
                className="h-8 w-8 p-0"
              >
                {index + 1}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 px-2"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={postToDelete !== null} onOpenChange={(open) => !open && setPostToDelete(null)}>
        <AlertDialogContent className="sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-900">
              Delete Blog Post?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500">
              Are you sure you want to delete the blog post{" "}
              <strong className="text-slate-800">"{postToDelete?.title}"</strong>?
              This action is permanent and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeletePost();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "Deleting..." : "Yes, Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
