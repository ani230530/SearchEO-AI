// Import centralized API client
import { apiGet, apiPost, apiPatch, apiDelete, apiRequest, tokenManager } from './apiClient';

const API_BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3002/api';

// Legacy helper functions for backward compatibility (deprecated - use apiClient instead)
const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

export interface DomainResponse {
  domain: {
    id: number;
    url: string;
    context: string | null;
    createdAt: string;
    updatedAt: string;
  };
  extraction: {
    pagesScanned: number;
    analyzedUrls: string[];
    extractedContext: string;
  } | null;
}

export interface Keyword {
  id: number;
  term: string;
  volume: number;
  difficulty: string;
  cpc: number;
  category: string;
  isSelected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KeywordAnalysis {
  semanticAnalysis?: Record<string, unknown>;
  keywordAnalysis?: Record<string, unknown>;
  searchVolumeClassification?: Record<string, unknown>;
  intentClassification?: Record<string, unknown>;
}

export const apiService = {
  async submitDomain(url: string): Promise<DomainResponse> {
    return apiPost<DomainResponse>('/domain', { url });
  },

  async getDomain(id: number): Promise<DomainResponse> {
    return apiGet<DomainResponse>(`/domain/${id}`);
  },

  async submitDomainForStreaming(url: string): Promise<Response> {
    // For streaming, we need the raw Response object
    // This is a special case - use apiRequest but return Response
    const token = tokenManager.getAuthToken();
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch(`${API_BASE_URL}/domain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.details || error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  },

  async getKeywords(domainId: number): Promise<{ keywords: Keyword[], analysis?: KeywordAnalysis }> {
    const result = await apiGet<{ keywords: Keyword[], analysis?: KeywordAnalysis }>(`/keywords/${domainId}`);
    console.log('getKeywords response:', result);
    return result;
  },

  async updateKeywordSelection(domainId: number, selectedKeywords: string[]): Promise<void> {
    return apiPatch<void>(`/keywords/${domainId}/selection`, { selectedKeywords });
  },

  async getGeneratedPhrases(domainId: number): Promise<{ generatedPhrases: Array<{keyword: string, phrases: string[]}> }> {
    return apiGet<{ generatedPhrases: Array<{keyword: string, phrases: string[]}> }>(`/phrases/${domainId}`);
  },

  async addPhrase(domainId: number, keyword: string, phrase: string): Promise<{ success: boolean, phrase: { id: number, text: string, keywordId: number } }> {
    return apiPost<{ success: boolean, phrase: { id: number, text: string, keywordId: number } }>(`/phrases/${domainId}`, { keyword, phrase });
  },
};