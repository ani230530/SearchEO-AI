export interface Keyword {
    id: number;
    term: string;
    volume: number;
    difficulty: string;
    intent?: string | null;
    cpc?: number;
    aiMetadata?: any; // For storing isPrimary/isLongtail flags
}

export interface SubPage {
    id: number;
    title: string;
    description?: string | null;
    summary?: string | null;
    keywords: Keyword[];
}

export interface PillarPage {
    id: number;
    title: string;
    description?: string | null;
    summary?: string | null;
    keywords: Keyword[];
}

export interface Topic {
    id: number;
    title: string;
    description?: string | null;
    status?: string;
    source?: string;
    keywords?: Keyword[];
    pillarPage: PillarPage | null;
    subPages: SubPage[];
    referenceUrl?: string; // Add referenceUrl which was seemingly missing in the interface but used in code
}

export interface CampaignStructure {
    topics: Topic[];
}

export type GenerationPageStatus = {
    jobId: string;
    pageId: number;
    pageType: 'pillar' | 'subpage';
    status: 'pending' | 'generating' | 'completed' | 'failed' | 'published';
    draftId?: number;
    progress?: number;
    primaryKeyword?: string;
    hasHtml?: boolean;
    updatedAt?: string;
    error?: string | null;
    wordpressUrl?: string | null;
};

export type DraftPreview = {
    htmlContent: string;
    title?: string;
    metaDescription?: string;
    slug?: string;
    featuredImage?: string;
    primaryKeyword?: string;
};

export type DraftStatusRecord = {
    pageId: number;
    pageType: string;
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
