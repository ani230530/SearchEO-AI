export interface WordpressIntegration {
  siteUrl: string;
  username: string;
  lastPublishedAt?: string | null;
  updatedAt?: string;
}

export interface GeneratedArticleContent {
  primaryKeyword: string;
  htmlContent: string;
  featuredImageEnabled: boolean;
  featuredImageUrl?: string | null;
  wordpressPostId?: number | null;
  title?: string;
  metaDescription?: string;
  slug?: string;
  wordpressUrl?: string;
  longtailKeywords?: string;
}

export interface PublishHistoryEntry {
  id: number;
  wordpressUrl: string;
  wordpressPostId?: number | null;
  primaryKeyword?: string | null;
  title?: string | null;
  slug?: string | null;
  status?: string | null;
  createdAt: string;
  response?: Record<string, unknown> | null;
}
