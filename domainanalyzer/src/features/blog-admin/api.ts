













import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "@/services/apiClient";
import type { BlogPost, BlogCategory, BlogPostStatus } from "./types";

export const blogCmsApi = {
  async getPosts(): Promise<BlogPost[]> {
    const res = await apiGet<{ posts: BlogPost[] }>("/blog/admin/posts");
    return res.posts || [];
  },

  async getPostById(id: number): Promise<BlogPost> {
    const res = await apiGet<{ post: BlogPost }>(`/blog/admin/posts/${id}`);
    return res.post;
  },

  async createPost(data: Partial<BlogPost>): Promise<BlogPost> {
    const res = await apiPost<{ post: BlogPost }>("/blog/admin/posts", data);
    return res.post;
  },

  async updatePost(id: number, data: Partial<BlogPost>): Promise<BlogPost> {
    const res = await apiPut<{ post: BlogPost }>(`/blog/admin/posts/${id}`, data);
    return res.post;
  },

  async updatePostStatus(id: number, status: BlogPostStatus, publishedAt?: string): Promise<BlogPost> {
    const res = await apiPatch<{ post: BlogPost }>(`/blog/admin/posts/${id}/status`, {
      status,
      publishedAt,
    });
    return res.post;
  },

  async deletePost(id: number): Promise<void> {
    await apiDelete<void>(`/blog/admin/posts/${id}`);
  },

  async getCategories(): Promise<BlogCategory[]> {
    const res = await apiGet<{ categories: BlogCategory[] }>("/blog/admin/categories");
    return res.categories || [];
  },

  async createCategory(data: { name: string; slug?: string; description?: string }): Promise<BlogCategory> {
    const res = await apiPost<{ category: BlogCategory }>("/blog/admin/categories", data);
    return res.category;
  },

  async generatePost(data: {
    topic: string;
    primaryKeyword?: string;
    tone?: string;
    wordCount?: number;
    categoryTags?: string[];
    generateFeaturedImage?: boolean;
  }): Promise<{ success: boolean; message: string; draftId: number }> {
    return await apiPost<{ success: boolean; message: string; draftId: number }>("/blog/admin/generate", data);
  },
};
