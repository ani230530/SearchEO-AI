import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Country, State } from 'country-state-city';
import { ChevronDown, Sparkles, Check, Plus, RefreshCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { validateDomainInput } from '@/lib/domainValidation';
import { maskDomainId } from '@/lib/domainUtils';

type StreamEvent = {
  event: string;
  data: any;
};

type CompetitorOption = {
  id: string;
  name: string;
  url: string;
  selected: boolean;
};

type AnalysisItem = {
  id: string;
  type: 'prompt' | 'keyword';
  label: string;
  phraseId?: number;
  keywordId?: number;
  isCustom?: boolean;
  parentKeyword?: string;
  sources?: string[];
  createdAt?: string;
};

type DomainWorkspace = {
  domainId: number;
  normalizedHostname: string;
  normalizedUrl: string;
  location: string;
};

type LoadedStepData = {
  keywordCount: number;
  promptCount: number;
  itemCount: number;
};

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';
const MIN_PROMPTS_BEFORE_STEP_THREE = 3;
const BASE_STEP_ITEM_LIMIT = 7;

const industryOptions = [
  'Agriculture',
  'Mining & Quarrying',
  'Manufacturing',
  'Construction',
  'Technology & IT',
  'Healthcare & Pharmaceuticals',
  'Financial Services & Insurance',
  'Energy & Utilities',
  'Transportation & Logistics',
  'Telecommunications',
  'Education & Training',
  'Hospitality & Tourism',
  'Media & Entertainment',
  'Retail & Consumer Goods',
  'Aerospace & Defense',
];

const modelOptions = [
  { id: 'GPT-4o', name: 'GPT-4o', icon: '/chatgpt.png' },
  { id: 'Claude 3', name: 'Claude 3', icon: '/claude.png' },
  { id: 'Gemini 1.5', name: 'Gemini 1.5', icon: '/gemini.png' },
];

const genericAnalysisKeywords = new Set([
  'business analysis',
  'market trends',
  'seo strategy',
  'competitive analysis',
  'industry insights',
  'customer profiling',
  'brand positioning',
  'content strategy',
  'market dynamics',
  'seo opportunities',
  'local seo',
  'market leaders',
  'value proposition',
  'competitive gaps',
  'industry classification',
  'customer journey',
  'geographic scope',
  'solution categories',
  'local market',
  'content themes',
  'market size',
  'decision factors',
  'authority building',
  'direct competitors',
  'indirect competitors',
  'competitive advantages',
  'vulnerability areas',
  'seasonal patterns',
  'cultural considerations',
  'local search behavior',
  'content gaps',
  'keyword opportunities',
  'content opportunities',
  'long-tail opportunities',
  'local seo strategy',
  'market positioning',
  'key benefits',
  'expertise areas',
  'geographic considerations',
]);

const isGenericAnalysisKeyword = (term: string) => genericAnalysisKeywords.has(term.trim().toLowerCase());

const AIChecker = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [domain, setDomain] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [industry, setIndustry] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customKeywords, setCustomKeywords] = useState('');
  const [customPrompts, setCustomPrompts] = useState('');
  const [keywordTags, setKeywordTags] = useState<string[]>([]);
  const [promptTags, setPromptTags] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>(['GPT-4o', 'Claude 3', 'Gemini 1.5']);
  const [selectedTab, setSelectedTab] = useState<'all' | 'prompt' | 'keyword'>('all');
  const [selectedStepItems, setSelectedStepItems] = useState<string[]>([]);
  const [step, setStep] = useState(1);
  const [competitors, setCompetitors] = useState<CompetitorOption[]>([]);
  const [newCompetitor, setNewCompetitor] = useState('');
  const [stepItems, setStepItems] = useState<AnalysisItem[]>([]);
  const [workspace, setWorkspace] = useState<DomainWorkspace | null>(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingCompetitors, setIsLoadingCompetitors] = useState(false);
  const [isLoadingStepItems, setIsLoadingStepItems] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  // Load initial data from domainId query param
  useEffect(() => {
    const domainId = searchParams.get('domainId');
    const reanalyze = searchParams.get('reanalyze') === '1';
    
    if (domainId && !workspace) {
      const initDomain = async () => {
        setIsInitializing(true);
        try {
          const headers = getAuthHeaders();
          const response = await fetch(`${API_BASE_URL}/api/domain/${domainId}`, { headers });
          
          if (!response.ok) {
            throw new Error('Could not load existing domain data.');
          }
          
          const data = await response.json();
          if (data) {
            const nextWorkspace = {
              domainId: Number(data.id),
              normalizedHostname: data.url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
              normalizedUrl: data.url,
              location: data.location || 'Global'
            };
            
            setDomain(data.url);
            setCountry(''); // We don't have isoCode here easily, but normalizedHostname is set
            setWorkspace(nextWorkspace);
            
            // Load competitors
            await loadSuggestedCompetitors(nextWorkspace.domainId);
            
            if (reanalyze) {
              setStep(1);
            } else if (data.currentStep >= 3) {
              setStep(3);
              await loadKeywordsAndPhrases(nextWorkspace);
            } else if (data.currentStep >= 2) {
              setStep(3); // Go to step 3 if we already have competitors
              await loadKeywordsAndPhrases(nextWorkspace);
            } else if (data.currentStep >= 1) {
              setStep(2);
            }
          }
        } catch (err) {
          console.error('Initialization error:', err);
          toast({
            title: 'Failed to load domain',
            description: err instanceof Error ? err.message : 'Unknown error',
            variant: 'destructive'
          });
        } finally {
          setIsInitializing(false);
        }
      };
      
      initDomain();
    }
  }, [searchParams]);

  const countryOptions = useMemo(
    () => Country.getAllCountries().map((item) => ({ code: item.isoCode, name: item.name })),
    []
  );
  const stateOptions = useMemo(
    () => country ? State.getStatesOfCountry(country).map((item) => ({ code: item.isoCode, name: item.name })) : [],
    [country]
  );

  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    if (!token) throw new Error('Please log in before generating a report.');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const getUserFacingStatus = (message: string) => {
    const normalized = message.toLowerCase();

    if (
      normalized.includes('ready') ||
      normalized.includes('loaded') ||
      normalized.includes('complete') ||
      normalized.includes('opening report')
    ) {
      return 'Ready';
    }

    if (
      normalized.includes('competitor') ||
      normalized.includes('competitors')
    ) {
      return 'Finding competitors';
    }

    if (
      normalized.includes('keyword') ||
      normalized.includes('keywords') ||
      normalized.includes('prompt') ||
      normalized.includes('prompts') ||
      normalized.includes('phrase') ||
      normalized.includes('phrases')
    ) {
      if (normalized.includes('saving')) return 'Saving your inputs';
      return 'Preparing prompts and keywords';
    }

    if (
      normalized.includes('ai visibility') ||
      normalized.includes('ai responses') ||
      normalized.includes('report') ||
      normalized.includes('compiling')
    ) {
      return 'Generating your report';
    }

    if (
      normalized.includes('domain') ||
      normalized.includes('analyzing') ||
      normalized.includes('fetching') ||
      normalized.includes('candidate') ||
      normalized.includes('crawl') ||
      normalized.includes('page')
    ) {
      return 'Preparing your domain';
    }

    return 'Working on it';
  };

  const setAnalysisState = (message: string, nextProgress: number) => {
    setStatus(getUserFacingStatus(message));
    setProgress(Math.max(0, Math.min(100, nextProgress)));
  };

  const hasCustomSource = (sources?: string[]) => (sources || []).some((source) => source.toLowerCase().includes('custom'));
  const normalizeInput = (value: string) => value.trim().replace(/\s+/g, ' ');
  const uniqueInputs = (items: string[]) => Array.from(new Map(items.map((item) => [normalizeInput(item).toLowerCase(), normalizeInput(item)])).values()).filter(Boolean);

  const getLocationLabel = () => {
    const countryLabel = countryOptions.find((item) => item.code === country)?.name || '';
    const stateLabel = stateOptions.find((item) => item.code === state)?.name || '';
    return [stateLabel, countryLabel].filter(Boolean).join(', ') || 'Global';
  };

  const parseStream = async (response: Response, onEvent: (streamEvent: StreamEvent) => void | Promise<void>) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The server did not return a readable stream.');

    const decoder = new TextDecoder();
    let buffer = '';

    const parseBlock = async (block: string) => {
      const lines = block.split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return;

      let event = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim() || 'message';
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }

      if (dataLines.length === 0) return;

      const rawData = dataLines.join('\n');
      let data: any = rawData;
      try {
        data = JSON.parse(rawData);
      } catch {
        data = rawData;
      }

      await onEvent({ event, data });
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\n\s*\n/);
      buffer = blocks.pop() || '';

      for (const block of blocks) await parseBlock(block);
    }

    if (buffer.trim()) await parseBlock(buffer);
  };

  const normalizeCompetitor = (value: string, fallbackName?: string): CompetitorOption | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
      const parsed = new URL(withProtocol);
      const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
      return {
        id: hostname,
        name: fallbackName?.trim() || hostname.split('.')[0] || hostname,
        url: `https://${hostname}`,
        selected: true,
      };
    } catch {
      return { id: trimmed.toLowerCase(), name: fallbackName?.trim() || trimmed, url: withProtocol, selected: true };
    }
  };

  const resetWorkspaceData = () => {
    setWorkspace(null);
    setCompetitors([]);
    setStepItems([]);
    setSelectedStepItems([]);
    setError('');
    setStatus('');
    setProgress(0);
  };

  const ensureDomain = async () => {
    const validation = validateDomainInput(domain);
    if (!validation.valid || !validation.parsed) throw new Error(validation.error);

    const { normalizedHostname, normalizedUrl } = validation.parsed;
    const location = getLocationLabel();
    const headers = getAuthHeaders();

    setAnalysisState('Checking domain status...', 10);
    const checkResponse = await fetch(`${API_BASE_URL}/api/domain/check/${encodeURIComponent(normalizedHostname)}`, { headers });
    if (!checkResponse.ok) throw new Error('Unable to check this domain.');

    const checkData = await checkResponse.json();
    if (checkData.exists && checkData.domainId) {
      setAnalysisState('Existing domain found.', 45);
      return { domainId: Number(checkData.domainId), normalizedHostname, normalizedUrl, location };
    }

    setAnalysisState('Creating domain analysis...', 20);
    const createResponse = await fetch(`${API_BASE_URL}/api/domain`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: normalizedUrl, location, customPaths: [], priorityUrls: [], priorityPaths: [] }),
    });
    if (!createResponse.ok) throw new Error('Unable to create the domain analysis.');

    let createdDomainId: number | null = null;
    await parseStream(createResponse, ({ data }) => {
      if (data?.type === 'progress') {
        const backendProgress = typeof data.progress === 'number' ? data.progress : 0;
        setAnalysisState(data.step || 'Analyzing domain...', 20 + Math.round(backendProgress * 0.25));
      }
      if (data?.type === 'error') throw new Error(data.error || 'Domain analysis failed.');
      if (data?.type === 'complete') {
        createdDomainId = Number(data.result?.domain?.id);
        setAnalysisState('Domain analysis ready.', 48);
      }
    });

    if (!createdDomainId) throw new Error('Domain analysis finished without returning a domain ID.');
    return { domainId: createdDomainId, normalizedHostname, normalizedUrl, location };
  };

  const loadSuggestedCompetitors = async (domainId: number) => {
    setIsLoadingCompetitors(true);
    setCompetitors([]);

    try {
      setAnalysisState('Loading suggested competitors...', 55);
      const response = await fetch(`${API_BASE_URL}/api/dashboard/${domainId}/suggested-competitors`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        console.warn('Suggested competitor request failed:', await response.json().catch(() => ({})));
        return;
      }

      const data = await response.json();
      const normalized = (data.suggestedCompetitors || data.competitors || [])
        .map((item: any) => normalizeCompetitor(item.domain || item.url || item.name || '', item.name))
        .filter(Boolean) as CompetitorOption[];
      setCompetitors(Array.from(new Map(normalized.map((item) => [item.id, item])).values()));
    } catch (competitorError) {
      console.warn('Unable to load competitors:', competitorError);
    } finally {
      setIsLoadingCompetitors(false);
    }
  };

  const loadKeywordsAndPhrases = async (currentWorkspace: DomainWorkspace): Promise<LoadedStepData> => {
    setIsLoadingStepItems(true);
    setStepItems([]);
    setSelectedStepItems([]);
    setError('');

    let keywordCount = 0;
    let promptCount = 0;

    try {
      setAnalysisState('Loading domain keywords...', 60);
      const keywordsResponse = await fetch(`${API_BASE_URL}/api/keywords/${currentWorkspace.domainId}`, {
        headers: getAuthHeaders(),
      });
      if (!keywordsResponse.ok) throw new Error('Unable to load domain keywords.');

      const keywordsData = await keywordsResponse.json();
      const allKeywordItems: AnalysisItem[] = (keywordsData.keywords || [])
        .filter((keyword: any) => keyword.term && !isGenericAnalysisKeyword(keyword.term))
        .map((keyword: any) => ({
          id: `keyword-${keyword.id}`,
          type: 'keyword',
          label: keyword.term,
          keywordId: Number(keyword.id),
          isCustom: Boolean(keyword.isCustom),
          createdAt: keyword.createdAt,
        }));
      keywordCount = allKeywordItems.length;

      setAnalysisState('Loading generated prompts...', 68);
      let promptItems: AnalysisItem[] = [];
      try {
        const phrasesResponse = await fetch(`${API_BASE_URL}/api/enhanced-phrases/${currentWorkspace.domainId}/step3`, {
          headers: getAuthHeaders(),
        });
        if (phrasesResponse.ok) {
          const phrasesData = await phrasesResponse.json();
          promptItems = (phrasesData.existingPhrases || []).map((phrase: any) => ({
            id: `phrase-${phrase.id}`,
            type: 'prompt',
            label: phrase.phrase,
            phraseId: Number(phrase.id),
            keywordId: Number(phrase.keywordId),
            isCustom: hasCustomSource(phrase.sources) || Boolean(phrase.parentKeywordIsCustom),
            parentKeyword: phrase.parentKeyword,
            sources: Array.isArray(phrase.sources) ? phrase.sources : [],
            createdAt: phrase.createdAt,
          }));
        }
      } catch (phraseError) {
        console.warn('Unable to load existing prompts:', phraseError);
      }
      promptCount = promptItems.length;

      const customPromptItems = promptItems.filter((item) => hasCustomSource(item.sources));
      const customKeywordPromptItems = promptItems.filter((item) => item.isCustom && !hasCustomSource(item.sources));
      const backendPromptItems = promptItems.filter((item) => !item.isCustom);
      const customKeywordItems = allKeywordItems.filter((item) => item.isCustom);
      const backendKeywordItems = allKeywordItems.filter((item) => !item.isCustom);

      const prioritizedItems = [
        ...customPromptItems,
        ...customKeywordPromptItems,
        ...customKeywordItems,
        ...backendPromptItems,
        ...backendKeywordItems,
      ];
      const uniquePrioritizedItems = prioritizedItems.filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);
      const customItemCount = uniquePrioritizedItems.filter((item) => item.isCustom || hasCustomSource(item.sources)).length;
      const combined = uniquePrioritizedItems.slice(0, Math.max(BASE_STEP_ITEM_LIMIT, customItemCount));
      const customSelectionIds = combined
        .filter((item) => item.isCustom || hasCustomSource(item.sources))
        .map((item) => item.id);
      const defaultSelectionIds = combined
        .filter((item) => !customSelectionIds.includes(item.id))
        .slice(0, Math.max(0, 6 - customSelectionIds.length))
        .map((item) => item.id);
      setStepItems(combined);
      setSelectedStepItems([...customSelectionIds, ...defaultSelectionIds]);
      setAnalysisState(combined.length ? 'Backend keywords and prompts loaded.' : 'No backend keywords or prompts found yet.', 75);
      return { keywordCount, promptCount, itemCount: combined.length };
    } finally {
      setIsLoadingStepItems(false);
    }
  };

  const generatePromptsForWorkspace = async (currentWorkspace: DomainWorkspace, reloadAfter = true) => {
    setIsLoadingStepItems(true);
    setError('');

    try {
      setAnalysisState('Generating prompts...', 62);
      const response = await fetch(`${API_BASE_URL}/api/enhanced-phrases/${currentWorkspace.domainId}/step3/generate`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Unable to generate prompts right now.');

      await parseStream(response, ({ event, data }) => {
        if (event === 'progress') setAnalysisState(data?.message || 'Generating prompts...', 65);
        if (event === 'phrase-generated') {
          const phrase = data?.phrase && typeof data.phrase === 'object' ? data.phrase : data;
          const phraseId = Number(phrase?.id);
          const label = phrase?.phrase || phrase?.text;
          if (!phraseId || !label) return;

          const item: AnalysisItem = {
            id: `phrase-${phraseId}`,
            type: 'prompt',
            label,
            phraseId,
            keywordId: Number(phrase.keywordId),
            isCustom: hasCustomSource(phrase.sources) || Boolean(phrase.parentKeywordIsCustom),
            parentKeyword: phrase.parentKeyword,
            sources: Array.isArray(phrase.sources) ? phrase.sources : [],
            createdAt: phrase.createdAt,
          };
          setStepItems((prev) => prev.some((existing) => existing.id === item.id) ? prev : [item, ...prev]);
        }
      });

      if (reloadAfter) await loadKeywordsAndPhrases(currentWorkspace);
    } catch (promptError) {
      const message = promptError instanceof Error ? promptError.message : 'Prompt generation failed.';
      setError(message);
      toast({ title: 'Prompt generation failed', description: message, variant: 'destructive' });
      throw promptError;
    } finally {
      setIsLoadingStepItems(false);
    }
  };

  const generatePromptsAndReload = async () => {
    if (!workspace) {
      setError('Finish domain setup before generating prompts.');
      return;
    }

    await generatePromptsForWorkspace(workspace, true).catch(() => undefined);
  };

  const saveSelectedCompetitors = async () => {
    if (!workspace) return;
    const selected = competitors
      .filter((competitor) => competitor.selected)
      .map((competitor) => competitor.url.replace(/^https?:\/\//, '').replace(/^www\./, ''));
    if (selected.length === 0) return;

    await fetch(`${API_BASE_URL}/api/competitor/${workspace.domainId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ competitors: selected }),
    }).catch((saveError) => console.warn('Unable to save selected competitors:', saveError));
  };

  const analyzeAndSaveKeyword = async (keyword: string) => {
    if (!workspace) return null;

    const analyzeResponse = await fetch(`${API_BASE_URL}/api/keywords/analyze`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ keyword, domain: workspace.normalizedUrl, location: workspace.location, domainId: workspace.domainId }),
    });
    if (!analyzeResponse.ok) throw new Error('Unable to analyze a custom keyword.');

    const analysis = await analyzeResponse.json();
    const saveResponse = await fetch(`${API_BASE_URL}/api/keywords/${workspace.domainId}/custom`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        keyword: analysis.keyword || keyword,
        volume: analysis.volume,
        kd: analysis.kd,
        competition: analysis.competition,
        cpc: analysis.cpc,
        intent: analysis.intent,
        organic: analysis.organic,
        paid: analysis.paid,
        trend: analysis.trend,
        position: analysis.position,
        url: analysis.url,
        analysis: analysis.analysis,
      }),
    });

    if (!saveResponse.ok) {
      const existingResponse = await fetch(`${API_BASE_URL}/api/keywords/${workspace.domainId}`, { headers: getAuthHeaders() });
      const existingData = existingResponse.ok ? await existingResponse.json() : null;
      const existingKeyword = existingData?.keywords?.find((item: any) => item.term?.toLowerCase().trim() === keyword.toLowerCase().trim());
      return existingKeyword?.id ? Number(existingKeyword.id) : null;
    }

    const saved = await saveResponse.json();
    return saved?.keyword?.id ? Number(saved.keyword.id) : null;
  };

  const saveCustomPrompt = async (phrase: string) => {
    if (!workspace) return null;

    const response = await fetch(`${API_BASE_URL}/api/enhanced-phrases/${workspace.domainId}/custom-phrase`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ phrase }),
    });
    if (!response.ok) {
      console.warn('Custom prompt save failed:', await response.json().catch(() => ({})));
      throw new Error('Unable to save a custom prompt.');
    }

    const data = await response.json();
    return data?.phrase?.id ? Number(data.phrase.id) : null;
  };

  const savePendingCustomInputs = async () => {
    const pendingKeywords = customKeywords.split(',').map(normalizeInput).filter(Boolean);
    const pendingPrompts = customPrompts.split(',').map(normalizeInput).filter(Boolean);
    const keywordsToSave = uniqueInputs([...keywordTags, ...pendingKeywords]);
    const promptsToSave = uniqueInputs([...promptTags, ...pendingPrompts]);
    const keywordIds: number[] = [];
    const phraseIds: number[] = [];

    if (keywordsToSave.length > 0) {
      setAnalysisState('Saving custom keywords...', 70);
      for (const keyword of keywordsToSave) {
        const keywordId = await analyzeAndSaveKeyword(keyword);
        if (keywordId) keywordIds.push(keywordId);
      }
      setKeywordTags(keywordsToSave);
      setCustomKeywords('');
    }

    if (promptsToSave.length > 0) {
      setAnalysisState('Saving custom prompts...', 74);
      for (const phrase of promptsToSave) {
        const phraseId = await saveCustomPrompt(phrase);
        if (phraseId) phraseIds.push(phraseId);
      }
      setPromptTags(promptsToSave);
      setCustomPrompts('');
    }

    return {
      keywordIds: Array.from(new Set(keywordIds)),
      phraseIds: Array.from(new Set(phraseIds)),
    };
  };

  const selectKeywords = async (keywordIds: number[]) => {
    if (!workspace || keywordIds.length === 0) return;
    const response = await fetch(`${API_BASE_URL}/api/keywords/${workspace.domainId}/select`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ keywordIds: Array.from(new Set(keywordIds)), selected: true }),
    });
    if (!response.ok) throw new Error('Unable to select keywords for analysis.');
  };

  const selectPhrases = async (phraseIds: number[]) => {
    if (!workspace) return;
    const response = await fetch(`${API_BASE_URL}/api/intent-phrases/${workspace.domainId}/select`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ selectedPhrases: Array.from(new Set(phraseIds)) }),
    });
    if (!response.ok) throw new Error('Unable to select prompts for analysis.');
  };

  const runFullAnalysis = async () => {
    if (!workspace) return;

    setAnalysisState('Running AI visibility analysis...', 82);
    const response = await fetch(`${API_BASE_URL}/api/ai-queries/${workspace.domainId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ location: workspace.location }),
    });
    if (!response.ok) throw new Error('Unable to start AI visibility analysis.');

    let completed = false;
    await parseStream(response, ({ event, data }) => {
      if (event === 'progress') setAnalysisState(data?.message || 'Analyzing AI responses...', 88);
      if (event === 'result') setProgress((current) => Math.min(96, current + 1));
      if (event === 'stats') setAnalysisState('Compiling report...', 98);
      if (event === 'error') throw new Error(data?.error || 'AI visibility analysis failed.');
      if (event === 'complete') completed = true;
    });
    if (!completed) throw new Error('AI visibility analysis ended before completion.');
  };

  const handleRemoveTag = (tag: string) => setKeywordTags((prev) => prev.filter((item) => item !== tag));
  const handleRemovePromptTag = (tag: string) => setPromptTags((prev) => prev.filter((item) => item !== tag));

  const addTags = (value: string, existing: string[], setter: (value: string[]) => void, reset: () => void) => {
    const tags = value.split(',').map((item) => item.trim()).filter((item) => item && !existing.includes(item));
    if (tags.length > 0) {
      setter([...existing, ...tags]);
      reset();
    }
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTags(customKeywords, keywordTags, setKeywordTags, () => setCustomKeywords(''));
    }
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTags(customPrompts, promptTags, setPromptTags, () => setCustomPrompts(''));
    }
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) => prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId]);
  };

  const getFilteredStepItems = () => selectedTab === 'all' ? stepItems : stepItems.filter((item) => item.type === selectedTab);
  const toggleStepItem = (id: string) => setSelectedStepItems((prev) => prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]);
  const handleAutoSelectAll = () => setSelectedStepItems(stepItems.map((item) => item.id));

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCountry(e.target.value);
    setState('');
  };

  const handleToggleCompetitor = (id: string) => {
    setCompetitors((prev) => prev.map((competitor) => competitor.id === id ? { ...competitor, selected: !competitor.selected } : competitor));
  };

  const handleAddCompetitor = () => {
    const competitor = normalizeCompetitor(newCompetitor);
    if (!competitor) return;

    setCompetitors((prev) => {
      if (prev.some((item) => item.id === competitor.id)) {
        return prev.map((item) => item.id === competitor.id ? { ...item, selected: true } : item);
      }
      return [...prev, competitor];
    });
    setNewCompetitor('');
  };

  const setupDomainAndContinue = async () => {
    setIsBusy(true);
    setError('');

    try {
      const nextWorkspace = await ensureDomain();
      setWorkspace(nextWorkspace);
      await loadSuggestedCompetitors(nextWorkspace.domainId);
      setStep(2);
      setAnalysisState('Competitor suggestions loaded.', 60);
    } catch (setupError) {
      const message = setupError instanceof Error ? setupError.message : 'Unable to prepare this domain.';
      setError(message);
      toast({ title: 'Domain setup failed', description: message, variant: 'destructive' });
    } finally {
      setIsBusy(false);
    }
  };

  const saveCompetitorsAndContinue = async () => {
    if (!workspace) {
      setStep(1);
      setError('Complete domain setup before selecting prompts and keywords.');
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      await saveSelectedCompetitors();
      await savePendingCustomInputs();
      let loadedStepData = await loadKeywordsAndPhrases(workspace);
      if (loadedStepData.keywordCount > 0 && loadedStepData.promptCount < MIN_PROMPTS_BEFORE_STEP_THREE) {
        await generatePromptsForWorkspace(workspace, false);
        await loadKeywordsAndPhrases(workspace);
      }
      setStep(3);
    } catch (stepError) {
      const message = stepError instanceof Error ? stepError.message : 'Unable to load backend keywords and prompts.';
      setError(message);
      toast({ title: 'Unable to load suggestions', description: message, variant: 'destructive' });
    } finally {
      setIsBusy(false);
    }
  };

  const generateReport = async () => {
    if (!workspace) {
      setStep(1);
      setError('Complete domain setup before generating a report.');
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const selectedItems = stepItems.filter((item) => selectedStepItems.includes(item.id));
      const selectedKeywordIds = selectedItems
        .filter((item) => item.type === 'keyword')
        .map((item) => item.keywordId)
        .filter((id): id is number => typeof id === 'number' && !Number.isNaN(id));
      const selectedPhraseIds = selectedItems
        .filter((item) => item.type === 'prompt')
        .map((item) => item.phraseId)
        .filter((id): id is number => typeof id === 'number' && !Number.isNaN(id));

      const pendingKeywords = customKeywords.split(',').map((item) => item.trim()).filter(Boolean);
      const pendingPrompts = customPrompts.split(',').map((item) => item.trim()).filter(Boolean);
      const keywordIds = [...selectedKeywordIds];
      const phraseIds = [...selectedPhraseIds];

      if (pendingKeywords.length > 0 || pendingPrompts.length > 0 || keywordTags.length > 0 || promptTags.length > 0) {
        const savedCustomInputs = await savePendingCustomInputs();
        keywordIds.push(...savedCustomInputs.keywordIds);
        phraseIds.push(...savedCustomInputs.phraseIds);
      }

      if (keywordIds.length === 0 && phraseIds.length === 0) throw new Error('Select at least one backend keyword, prompt, or custom input.');

      await selectKeywords(keywordIds);
      await selectPhrases(phraseIds);
      await runFullAnalysis();
      setAnalysisState('Opening report...', 100);
      navigate(`/dashboard/${maskDomainId(workspace.domainId)}`);
    } catch (reportError) {
      const message = reportError instanceof Error ? reportError.message : 'Unable to generate report.';
      setError(message);
      toast({ title: 'Report generation failed', description: message, variant: 'destructive' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleContinue = () => {
    if (isBusy) return;
    if (step === 1) return setupDomainAndContinue();
    if (step === 2) return saveCompetitorsAndContinue();
    return generateReport();
  };

  const handleStepClick = (targetStep: number) => {
    if (isBusy || targetStep > 3) return;
    if (targetStep > 1 && !workspace) {
      setError('Complete domain setup before moving forward.');
      return;
    }
    setStep(targetStep);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="pt-8 px-[8%]">
        <div className="flex gap-2 w-full max-w-xs ml-6">
          {[1, 2, 3].map((index) => (
            <button key={index} type="button" onClick={() => handleStepClick(index)} disabled={isBusy} className="flex-1">
              <div className={`h-1 rounded transition ${step >= index ? 'bg-blue-500' : 'bg-slate-300'}`} />
            </button>
          ))}
        </div>

        {status && (
          <div className="mt-5 ml-6 max-w-xl rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-slate-700">{status}</span>
              <span className="text-slate-500">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-12 px-6 py-12 max-w-7xl mx-auto">
        <div className="w-1/2 max-w-none">
          {step === 1 ? (
            <>
              <div className="mb-8">
                <p className="text-sm font-medium text-blue-600 mb-2">Get to know us</p>
                <h1 className="text-4xl font-bold text-slate-900 mb-3">Add your domain</h1>
                <p className="text-slate-600 text-sm leading-relaxed">
                  We will analyze your public pages to pre-fill your brand profile. You can review and edit everything.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Enter URL</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400">
                      <img src="/domain-icon.png" alt="" />
                    </span>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => {
                        setDomain(e.target.value);
                        resetWorkspaceData();
                      }}
                      placeholder="domain.com"
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Country</label>
                    <div className="relative">
                      <select value={country} onChange={handleCountryChange} className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="">Select Country</option>
                        {countryOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">State/Region</label>
                    <div className="relative">
                      <select value={state} onChange={(e) => setState(e.target.value)} disabled={!country} className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400">
                        <option value="">Select State/Region</option>
                        {stateOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Industry</label>
                  <div className="relative">
                    <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      <option value="">Select Industry</option>
                      {industryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    Advanced Options
                    <ChevronDown className={`h-4 w-4 transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  </button>

                  {showAdvanced && (
                    <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-6">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Add custom keywords</h3>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {keywordTags.map((tag) => (
                            <div key={tag} className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
                              {tag}
                              <button type="button" onClick={() => handleRemoveTag(tag)} className="text-blue-700 hover:text-blue-900">x</button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input type="text" value={customKeywords} onChange={(e) => setCustomKeywords(e.target.value)} onKeyDown={handleKeywordKeyDown} placeholder="Enter keywords separated by commas" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                          <button type="button" onClick={() => addTags(customKeywords, keywordTags, setKeywordTags, () => setCustomKeywords(''))} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">Add</button>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Add custom prompts</h3>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {promptTags.map((tag) => (
                            <div key={tag} className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium">
                              {tag}
                              <button type="button" onClick={() => handleRemovePromptTag(tag)} className="text-indigo-700 hover:text-indigo-900">x</button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input type="text" value={customPrompts} onChange={(e) => setCustomPrompts(e.target.value)} onKeyDown={handlePromptKeyDown} placeholder="Enter prompts separated by commas" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                          <button type="button" onClick={() => addTags(customPrompts, promptTags, setPromptTags, () => setCustomPrompts(''))} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">Add</button>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Select Model preferences</h3>
                        <p className="mb-3 text-xs text-slate-500">The backend currently runs its fixed supported model set.</p>
                        <div className="grid grid-cols-3 gap-5 justify-items-center">
                          {modelOptions.map((model) => (
                            <button key={model.id} type="button" onClick={() => toggleModel(model.id)} aria-label={model.name} className={`w-16 h-16 flex items-center justify-center rounded-xl border ${selectedModels.includes(model.id) ? 'border-blue-500 bg-blue-50' : 'border-transparent'}`}>
                              <img src={model.icon} alt={model.name} className="w-10 h-10 object-contain" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <div className="mb-8">
                <p className="text-sm font-medium text-blue-600 mb-2">Get to know us</p>
                <h1 className="text-4xl font-bold text-slate-900 mb-3">Track Your Competitors in AI Search</h1>
                <p className="text-slate-600 text-sm leading-relaxed">Add competitor domains that matter most to your industry.</p>
              </div>

              <div className="space-y-6">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="space-y-4">
                    {isLoadingCompetitors && <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">Loading suggested competitors from backend...</div>}
                    {!isLoadingCompetitors && competitors.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">No backend competitors found yet. Add competitor domains manually to continue.</div>}
                    {!isLoadingCompetitors && competitors.map((competitor) => (
                      <button key={competitor.id} type="button" onClick={() => handleToggleCompetitor(competitor.id)} className={`w-full flex items-center justify-between gap-4 rounded-3xl border px-4 py-4 text-left transition ${competitor.selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                        <div className="flex items-center gap-4">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-sm border ${competitor.selected ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5" /></span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{competitor.name}</p>
                            <p className="truncate text-sm text-slate-500">{competitor.url}</p>
                          </div>
                        </div>
                        <a href={competitor.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 truncate">{competitor.url}</a>
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <input type="text" value={newCompetitor} onChange={(e) => setNewCompetitor(e.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleAddCompetitor(); } }} placeholder="Add Competitor" className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                      <button type="button" onClick={handleAddCompetitor} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"><Plus className="h-5 w-5" /></button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-8">
                <p className="text-sm font-medium text-blue-600 mb-2">Select for precise results</p>
                <h1 className="text-4xl font-bold text-slate-900 mb-3">Select prompts & keywords in your niche</h1>
                <p className="text-slate-600 text-sm leading-relaxed">Choose backend-generated keywords and prompts for the full AI visibility analysis.</p>
              </div>

              <div className="mb-6 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-4">
                  {['all', 'prompt', 'keyword'].map((tab) => (
                    <button key={tab} type="button" onClick={() => setSelectedTab(tab as 'all' | 'prompt' | 'keyword')} className={`px-5 py-2 text-base font-semibold rounded-full transition ${selectedTab === tab ? 'bg-[#c7d6f2] text-[#2d4059]' : 'text-gray-500 hover:text-gray-700'}`}>
                      {tab === 'all' ? 'All' : tab === 'prompt' ? 'Prompts' : 'Keywords'}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={generatePromptsAndReload} disabled={isBusy || isLoadingStepItems || !workspace} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"><RefreshCcw className="h-4 w-4" /></button>
                <button type="button" onClick={handleAutoSelectAll} disabled={isLoadingStepItems || stepItems.length === 0} className="inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" style={{ background: 'linear-gradient(90deg, rgb(45, 64, 89) 0%, rgb(78, 118, 199) 100%)' }}>
                  <Sparkles className="h-4 w-4" /> Auto-select (all)
                </button>
              </div>

              <div className="space-y-3">
                {isLoadingStepItems && <div className="rounded-lg border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">Loading backend keywords and prompts...</div>}
                {!isLoadingStepItems && getFilteredStepItems().length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">No backend prompts or keywords are available yet. Use refresh to generate prompts or add custom inputs in Advanced Options.</div>}
                {!isLoadingStepItems && getFilteredStepItems().map((item) => (
                  <button key={item.id} type="button" onClick={() => toggleStepItem(item.id)} className={`w-full flex items-center justify-between gap-4 rounded-[8px] border px-4 py-4 text-left transition ${selectedStepItems.includes(item.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-4">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-lg border ${selectedStepItems.includes(item.id) ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5" /></span>
                      <div className="min-w-0"><p className="text-sm text-slate-900 truncate">{item.label}</p></div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{item.type === 'prompt' ? 'Prompt' : 'Keyword'}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <button onClick={handleContinue} disabled={isBusy} className="w-full rounded-[10px] bg-slate-400 px-4 py-4 text-sm font-semibold text-white hover:bg-slate-500 transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70">
              {isBusy ? step === 1 ? 'Preparing domain...' : step === 2 ? 'Loading backend data...' : 'Generating report...' : step < 3 ? 'Continue' : 'Generate report'}
              <span>→</span>
            </button>
            {step === 3 && <p className="text-center text-xs text-slate-500">{selectedStepItems.length} items selected</p>}
          </div>
        </div>

        <div className="w-1/2 space-y-6">
          <div className="mb-6"><img src="/ai-checker.png" alt="AI Checker" className="w-full h-auto rounded-lg shadow-sm" /></div>
        </div>
      </div>
    </div>
  );
};

export default AIChecker;
