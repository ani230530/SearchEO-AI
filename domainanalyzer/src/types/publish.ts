export interface WordpressIntegration {
  siteUrl: string;
  username: string;
  lastPublishedAt?: string | null;
  updatedAt?: string;
}

export interface GeneratedArticleContent {
  primaryKeyword: string;
  htmlContent: string;
  featuredImage?: string;
  title?: string;
  metaDescription?: string;
  slug?: string;
  wordpressUrl?: string;
  longtailKeywords?: string;
}

export interface PublishHistoryEntry {
  id: number;
  wordpressUrl: string;
  primaryKeyword?: string | null;
  title?: string | null;
  slug?: string | null;
  status?: string | null;
  createdAt: string;
  response?: Record<string, unknown> | null;
}


