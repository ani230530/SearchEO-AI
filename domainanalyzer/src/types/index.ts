export interface Keyword {
    id: number;
    term: string;
    volume: number;
    difficulty: string;
    intent?: string | null;
    cpc?: number;
    aiMetadata?: any;
}

export type GenerationPageStatus = {
    jobId: string;
    topicId?: number | null;
    pageId: number;
    status: 'pending' | 'generating' | 'completed' | 'failed' | 'published';
    draftId?: number;
    progress?: number;
    primaryKeyword?: string;
    hasHtml?: boolean;
    updatedAt?: string;
    error?: string | null;
    wordpressUrl?: string | null;
    phase?: string | null;
};

export type DraftPreview = {
    htmlContent: string;
    title?: string;
    metaDescription?: string;
    slug?: string;
    featuredImageEnabled: boolean;
    featuredImageUrl?: string | null;
    primaryKeyword?: string;
    longtailKeywords?: string;
    status?: string;
    wordpressUrl?: string | null;
    error?: string | null;
    updatedAt?: string;
};

export type DraftStatusRecord = {
    pageId: number;
    status: string;
    draftId?: number;
    progress?: number;
    primaryKeyword?: string;
    jobId?: string;
    hasHtml?: boolean;
    updatedAt?: string;
    error?: string | null;
    wordpressUrl?: string | null;
};

export type GenerationStreamingEvent = {
    jobId: string;
    topicId?: number | null;
    pageId?: number | null;
    status?: 'pending' | 'generating' | 'completed' | 'failed' | 'published';
    phase?: string | null;
    progress?: number | null;
    message: string;
    sequence?: number | null;
    timestamp: string;
};

export interface KeywordTableItem {
    id: string | number;
    keyword: string;
    volume: number;
    difficulty?: string;
    intent: string;
    cpc: number;
    competition: string;
    trend: string | number;
    date?: string;
    kd?: number;
    organic?: number;
    paid?: number;
    position?: number;
    url?: string;
    updated?: string;
    selected?: boolean;
    isCustom?: boolean;
}
