export type BlogPostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

export interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  contentHtml: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  status: BlogPostStatus;
  publishedAt: string | null;
  scheduledAt: string | null;
  readTimeMinutes: number;
  authorName: string | null;
  authorTitle: string | null;
  categoryId: number | null;
  tagIds: number[];
  createdById: number;
  updatedById: number | null;
  createdAt: string;
  updatedAt: string;
  category?: BlogCategory | null;
}
