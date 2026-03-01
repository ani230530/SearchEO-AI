export const normalizeKeyword = (value?: string | null): string => {
  if (!value) return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
};

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

export const extractPrimaryKeyword = (page: Record<string, unknown>): string =>
  firstString(
    page['Primary Keyword'],
    page.primaryKeyword,
    page.primary_keyword,
    page['primary_keyword']
  );

export const extractHtmlContent = (page: Record<string, unknown>): string =>
  firstString(
    page['Html Content'],
    page.htmlContent,
    page.html_content,
    page['html_content']
  );

export const extractTitle = (page: Record<string, unknown>): string =>
  firstString(page.Title, page.title);

export const extractMetaDescription = (page: Record<string, unknown>): string =>
  firstString(
    page['Meta Description'],
    page.metaDescription,
    page.meta_description,
    page['meta_description']
  );

export const extractSlug = (page: Record<string, unknown>): string =>
  firstString(page.slug, page.Slug);

export const extractFeaturedImage = (page: Record<string, unknown>): string =>
  firstString(
    page['Featured Image'],
    page.featuredImage,
    page.featured_image,
    page['featured_image']
  );
