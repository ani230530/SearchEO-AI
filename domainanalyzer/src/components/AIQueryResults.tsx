import React, { useState, useEffect, useRef, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useToast } from '@/components/ui/use-toast';
import { Trophy, Medal, Award, Star, CheckCircle, XCircle, TrendingUp, Target, Zap, ChevronDown, ChevronRight, ExternalLink, Search, Globe, MapPin, ChevronUp, Lightbulb, Users, Plus, Minus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export interface AIQueryResult {
  model: string;
  phrase: string;
  keyword: string;
  response: string;
  latency: number;
  cost: number;
  progress: number;
  scores: {
    presence: number;
    relevance: number;
    accuracy: number;
    sentiment: number;
    overall: number;
    domainRank?: number;
    foundDomains?: string[];
    confidence?: number;
    sources?: string[];
    competitorUrls?: string[];
    competitorMatchScore?: number;
    comprehensiveness?: number;
    context?: string;
    mentions?: number;
    highlightContext?: string;
    detectionMethod?: string;
    competitors?: {
      names: string[];
      mentions: Array<{
        name: string;
        domain: string;
        position: number;
        context: string;
        sentiment: 'positive' | 'neutral' | 'negative';
        mentionType: 'url' | 'text' | 'brand';
      }>;
      totalMentions: number;
    };
  };
  domainRank?: number;
  foundDomains?: string[];
  domainPresence?: string;
  overallScore?: number;
  position?: number;
  url?: string;
  confidence?: number;
  sources?: string[];
  competitorUrls?: string[];
  competitorMatchScore?: number;
  comprehensiveness?: number;
  context?: string;
  mentions?: number;
  highlightContext?: string;
  detectionMethod?: string;
  expanded?: boolean;
}

export interface AIQueryStats {
  models: Array<{
    model: string;
    presenceRate: number;
    avgRelevance: number;
    avgAccuracy: number;
    avgSentiment: number;
    avgOverall: number;
    avgComprehensiveness?: number;
    avgConfidence?: number;
  }>;
  overall: {
    presenceRate: number;
    avgRelevance: number;
    avgAccuracy: number;
    avgSentiment: number;
    avgOverall: number;
    avgDomainRank?: number;
  };
  totalResults: number;
  competitors?: Array<{
    domain: string;
    frequency: number;
    threatLevel: string;
    marketShare: number;
    lastSeen: Date;
  }>;
  insights?: {
    strengths: Array<{
      area: string;
      score: number;
      description: string;
    }>;
    weaknesses: Array<{
      area: string;
      score: number;
      description: string;
    }>;
    opportunities: Array<{
      area: string;
      potential: string;
      action: string;
    }>;
    threats: Array<{
      area: string;
      risk: string;
      mitigation: string;
    }>;
  };
}

interface LoadingTask {
  name: string;
  status: 'pending' | 'running' | 'completed';
  progress: number;
  description: string;
}

interface AIQueryResultsProps {
  domainId: number;
  setQueryResults: (results: AIQueryResult[]) => void;
  setQueryStats?: (stats: AIQueryStats) => void;
  onNext: () => void;
  onPrev: () => void;
  location?: string;
}

const AIQueryResults: React.FC<AIQueryResultsProps> = ({
  domainId,
  setQueryResults,
  setQueryStats,
  onNext,
  onPrev,
  location
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [isReturning, setIsReturning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<{
    tableData?: Array<{
      phrase: string;
      keyword?: string;
      model: string;
      response: string;
      domainPresence: string;
      overallScore: number;
      position?: number;
      url?: string;
      confidence?: number;
      sources?: string[];
      competitorUrls?: string[];
      competitorMatchScore?: number;
      comprehensiveness?: number;
      context?: string;
      mentions?: number;
      highlightContext?: string;
      detectionMethod?: string;
      competitorsMentions?: Array<{
        name: string;
        domain: string;
        position: number;
        context: string;
        sentiment: 'positive' | 'neutral' | 'negative';
        mentionType: 'url' | 'text' | 'brand';
        rank: number;
      }>;
    }>;
    chatgpt?: { ranked: number; total: number };
    claude?: { ranked: number; total: number };
    gemini?: { ranked: number; total: number };
  }>({});
  const [selectedModel, setSelectedModel] = useState('all');
  const [progress, setProgress] = useState(0);
  const [currentPhrase, setCurrentPhrase] = useState('');
  const [rawResults, setRawResults] = useState<AIQueryResult[]>([]);
  const [stats, setStats] = useState<AIQueryStats | null>(null);
  const resultsRef = useRef<AIQueryResult[]>([]);
  const [modelStatus, setModelStatus] = useState<{[model: string]: string}>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedResponses, setExpandedResponses] = useState<{[key: string]: boolean}>({});
  // NEW: simple pagination for card list
  const [page, setPage] = useState(1);
  const pageSize = 10;
  
  type CompetitorMentionWithRank = {
    name: string;
    domain: string;
    position: number;
    context: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    mentionType: 'url' | 'text' | 'brand';
    rank: number;
  };
  
  // Apple-inspired design state
  const [selectedView, setSelectedView] = useState<'overview' | 'detailed'>('overview');
  const [expandedCards, setExpandedCards] = useState<{[key: string]: boolean}>({});
  const [expandedInsights, setExpandedInsights] = useState(false);

  // Add ref for detailed results section
  const detailedResultsRef = useRef<HTMLDivElement>(null);

  // Carousel control state
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [currentLoadingIndex, setCurrentLoadingIndex] = useState(0);

  // Loading tasks for AI analysis
  const [loadingTasks, setLoadingTasks] = useState<LoadingTask[]>([
    { name: 'AI Model Initialization', status: 'pending', progress: 0, description: 'Initializing AI analysis engines and preparing domain context' },
    { name: 'Phrase Analysis', status: 'pending', progress: 0, description: 'Analyzing selected intent phrases with multiple AI models' },
    { name: 'Response Scoring', status: 'pending', progress: 0, description: 'Evaluating AI responses for domain presence and SEO potential' },
    { name: 'Competitive Analysis', status: 'pending', progress: 0, description: 'Analyzing competitor positioning and market gaps' },
    { name: 'Report Generation', status: 'pending', progress: 0, description: 'Compiling comprehensive analysis report with recommendations' }
  ]);

  const { toast } = useToast();

  const models = [
    { id: 'gemini', name: 'Gemini', color: 'bg-blue-500', icon: 'ri-google-fill' },
    { id: 'claude', name: 'Claude', color: 'bg-purple-500', icon: 'ri-robot-fill' },
    { id: 'chatgpt', name: 'ChatGPT', color: 'bg-green-500', icon: 'ri-openai-fill' }
  ];

  // Add scroll to top function
  const scrollToDetailedResults = () => {
    if (detailedResultsRef.current) {
      detailedResultsRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  };

  // Add useEffect to scroll when page changes
  useEffect(() => {
    if (selectedView === 'detailed' && page > 1) {
      scrollToDetailedResults();
    }
  }, [page, selectedView]);

  const querySteps = [
    { id: 1, text: 'Connecting to GPT-4', model: 'ChatGPT-4', description: 'Establishing connection with OpenAI\'s latest model' },
    { id: 2, text: 'Connecting to Gemini Pro', model: 'Gemini Pro', description: 'Accessing Google\'s advanced language model' },
    { id: 3, text: 'Connecting to Claude 3', model: 'Claude 3 Sonnet', description: 'Linking to Anthropic\'s sophisticated AI model' },
    { id: 4, text: 'Preparing search queries', model: 'Query Processor', description: 'Formatting your selected keywords into optimized queries' },
    { id: 5, text: 'Querying ChatGPT-4', model: 'GPT-4 Analysis', description: 'Testing search phrases against OpenAI\'s model' },
    { id: 6, text: 'Querying Gemini Pro', model: 'Gemini Analysis', description: 'Running analysis through Google\'s language model' },
    { id: 7, text: 'Querying Claude 3 Sonnet', model: 'Claude Analysis', description: 'Processing queries through Anthropic\'s model' },
    { id: 8, text: 'Analyzing response patterns', model: 'Pattern Analysis', description: 'Comparing how each AI ranks your domain content' },
    { id: 9, text: 'Calculating performance metrics', model: 'Metrics Engine', description: 'Computing success rates and position rankings' },
    { id: 10, text: 'Generating comparison report', model: 'Report Generator', description: 'Compiling results into actionable insights' }
  ];

  // Calculate exact expected results - will be determined by the backend
  const [totalExpected, setTotalExpected] = useState(0); // Dynamic total from backend

  // Transform raw results to match enhanced format
  const transformResults = (rawResults: AIQueryResult[]) => {
    console.log('TransformResults called with:', rawResults.length, 'results');
    console.log('All model names received:', rawResults.map(r => r.model));
    
    const tableData = rawResults.map(result => {
      // Determine domain presence based on presence score
      let domainPresence = 'Not Found';
      if (result.scores.presence === 1) {
        domainPresence = 'Featured';
      } else if (result.scores.presence > 0) {
        domainPresence = 'Mentioned';
      }
      
      // Both Featured and Mentioned should be considered as Mentioned for ranking purposes
      const isMentioned = result.scores.presence > 0;
      
      // Calculate confidence score
      let confidence = undefined;
      if (typeof result.scores.confidence === 'number') {
        confidence = result.scores.confidence;
      } else if (typeof result.scores.overall === 'number') {
        confidence = result.scores.overall * 20; // Convert 0-5 to 0-100
      }

      // Helper: derive highlight context if missing (first domain/url snippet in response)
      const deriveHighlight = () => {
        if (result.scores?.highlightContext && result.scores.highlightContext.trim().length > 0) return result.scores.highlightContext;
        const text = result.response || '';
        const urlRegex = /https?:\/\/[^\s\n]+/g;
        const urls = text.match(urlRegex) || [];
        if (urls.length > 0) {
          const first = urls[0];
          const idx = text.indexOf(first);
          const start = Math.max(0, idx - 100);
          const end = Math.min(text.length, idx + first.length + 100);
          return text.slice(start, end);
        }
        // Try domain words from foundDomains
        const domains = (result.scores?.foundDomains || []).filter(Boolean);
        if (domains.length > 0) {
          const needle = domains[0];
          const idx = text.toLowerCase().indexOf(String(needle).toLowerCase());
          if (idx >= 0) {
            const start = Math.max(0, idx - 100);
            const end = Math.min(text.length, idx + String(needle).length + 100);
            return text.slice(start, end);
          }
        }
        return result.scores?.highlightContext || '';
      };
      
      // Prepare competitor mentions with ranks (ordered by earliest position)
      const competitorMentionsRaw = (result.scores?.competitors?.mentions || []) as Array<{
        name: string;
        domain: string;
        position: number;
        context: string;
        sentiment: 'positive' | 'neutral' | 'negative';
        mentionType: 'url' | 'text' | 'brand';
      }>;
      
      // Fallback: if mentions array is empty but names exist, synthesize basic mentions
      let mentionsForDisplay = competitorMentionsRaw;
      if ((!mentionsForDisplay || mentionsForDisplay.length === 0) && Array.isArray(result.scores?.competitors?.names) && result.scores!.competitors!.names!.length > 0) {
        const names = result.scores!.competitors!.names as string[];
        mentionsForDisplay = names.map((n, i) => ({
          name: n,
          domain: n,
          position: i + 1,
          context: 'reference',
          sentiment: 'neutral' as const,
          mentionType: 'text' as const
        }));
      }
      
      const competitorsMentions = (mentionsForDisplay || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((mention, index) => ({
          ...mention,
          rank: index + 1
        }));
      
      return {
        phrase: result.phrase,
        keyword: result.keyword,
        model: result.model === 'GPT-4o' ? 'chatgpt' : 
               result.model === 'Claude 3' ? 'claude' : 'gemini',
        response: result.response,
        domainPresence: domainPresence,
        overallScore: Math.round((result.scores.overall || 0) * 20), // Convert 0-5 to 0-100
        position: result.scores.domainRank || result.domainRank,
        url: result.url,
        confidence: confidence,
        sources: result.scores.sources || [],
        competitorUrls: result.scores.competitorUrls || [],
        competitorMatchScore: result.scores.competitorMatchScore,
        comprehensiveness: result.scores.comprehensiveness,
        context: result.scores.context,
        mentions: result.scores.mentions,
        highlightContext: deriveHighlight(),
        detectionMethod: result.scores.detectionMethod,
        competitorsMentions
      };
    });

    const modelStats = {
      chatgpt: { ranked: 0, total: 0 },
      claude: { ranked: 0, total: 0 },
      gemini: { ranked: 0, total: 0 }
    };

    // Calculate stats per model with correct model name matching
    rawResults.forEach(result => {
      let modelKey = 'gemini'; // default
      
      // Map the display model names to frontend keys
      if (result.model === 'GPT-4o') {
        modelKey = 'chatgpt';
      } else if (result.model === 'Claude 3') {
        modelKey = 'claude';
      } else if (result.model === 'Gemini 1.5') {
        modelKey = 'gemini';
      } else {
        modelKey = 'claude';
      }
      
      modelStats[modelKey].total++;
      // Consider ranked if presence score is greater than 0 (both Featured and Mentioned count as ranked)
      if (result.scores.presence && result.scores.presence > 0) {
        modelStats[modelKey].ranked++;
      }
    });

    return {
      tableData,
      ...modelStats
    };
  };

  // Add this function before the useEffect
  const checkExistingResults = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/ai-queries/results/${domainId}?limit=1000`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          // Use results as returned by the API (already shaped for AIQueryResult)
          const existingResults = data.results as AIQueryResult[];
          return existingResults;
        }
      }
      return [];
    } catch (error) {
      console.error('Error checking existing results:', error);
      return [];
    }
  };

  // Helper: normalize backend model names to frontend keys
  const normalizeModel = (model: string) => {
    if (model === 'GPT-4o') return 'chatgpt';
    if (model === 'Claude 3') return 'claude';
    if (model === 'Gemini 1.5') return 'gemini';
    return 'chatgpt';
  };

  // Helper: fetch selected phrases stored in DB during Step 3
  const fetchSelectedPhrases = async (): Promise<string[]> => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/intent-phrases/${domainId}?selected=true`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) return [];
      const data = await res.json();
      // Expecting array of phrases; adjust if API returns different shape
      const phrases: string[] = Array.isArray(data?.phrases)
        ? data.phrases.map((p: { phrase?: string } | string) => typeof p === 'string' ? p : p.phrase || '')
        : Array.isArray(data) ? data.map((p: { phrase?: string } | string) => typeof p === 'string' ? p : p.phrase || '') : [];
      return phrases.filter(Boolean);
    } catch (e) {
      console.warn('Could not fetch selected phrases, proceeding without:', e);
      return [];
    }
  };

  useEffect(() => {
    // Start the analysis process only if needed
    const initializeAnalysis = async () => {
      // Load any existing results from DB
      const existingResults = await checkExistingResults();

      if (existingResults.length > 0) {
        setRawResults(existingResults);
        resultsRef.current = existingResults;
        const transformed = transformResults(existingResults);
        setResults(transformed);
        setQueryResults(existingResults);
      }

      // Determine if we actually need to run analysis
      // Fetch selected phrases saved in Step 3
      const selectedPhrases = await fetchSelectedPhrases();
      const expectedModelKeys = ['chatgpt', 'claude', 'gemini'];

      // Build coverage map: phrase -> Set(models present)
      const coverage = new Map<string, Set<string>>();
      existingResults.forEach(r => {
        const key = (r.phrase || '').trim();
        if (!key) return;
        const set = coverage.get(key) || new Set<string>();
        set.add(normalizeModel(r.model));
        coverage.set(key, set);
      });

      // Find phrases that are missing any model results
      const missingPhrases = selectedPhrases.filter(phrase => {
        const set = coverage.get((phrase || '').trim()) || new Set<string>();
        return expectedModelKeys.some(m => !set.has(m));
      });

      if (selectedPhrases.length > 0 && missingPhrases.length === 0) {
        // All selected phrases fully covered for all models → do not run analysis again
        setIsAnalyzing(false);
        setCurrentPhrase('Analysis already completed for all selected phrases.');
        setModelStatus({ 'GPT-4o': 'Done', 'Claude 3': 'Done', 'Gemini 1.5': 'Done' });
        return;
      }

      // Otherwise, start analysis ONLY for missing phrases (backend already skips existing)
      startNewAnalysis();
    };

    const startNewAnalysis = () => {
      // Reset streaming state but keep existing results in resultsRef to merge seamlessly
      setIsAnalyzing(true);
      setProgress(0);
      setCurrentPhrase('Initializing analysis...');
      setError(null);
      // Keep resultsRef with existing results; do not clear it to avoid losing coverage
      // resultsRef.current already seeded by initializeAnalysis
      setStats(null);
      setModelStatus({ 'GPT-4o': 'Waiting', 'Claude 3': 'Waiting', 'Gemini 1.5': 'Waiting' });

      // Initialize loading tasks
      setLoadingTasks([
        { name: 'AI Model Initialization', status: 'running', progress: 0, description: 'Initializing AI analysis engines and preparing domain context' },
        { name: 'Phrase Analysis', status: 'pending', progress: 0, description: 'Analyzing selected intent phrases with multiple AI models' },
        { name: 'Response Scoring', status: 'pending', progress: 0, description: 'Evaluating AI responses for domain presence and SEO potential' },
        { name: 'Competitive Analysis', status: 'pending', progress: 0, description: 'Analyzing competitor positioning and market gaps' },
        { name: 'Report Generation', status: 'pending', progress: 0, description: 'Compiling comprehensive analysis report with recommendations' }
      ]);

      const ctrl = new AbortController();

      const connectionTimeout = setTimeout(() => {
        if (resultsRef.current.length === 0) {
          setError('Connection timeout. The analysis engine took too long to start. For large jobs, please wait a few minutes before retrying.');
          setIsAnalyzing(false);
          ctrl.abort();
        }
      }, 300000);

      // Keep a conservative overall timeout
      const overallTimeout = setTimeout(() => {
        if (isAnalyzing) {
          setError(`Analysis timeout. Processed ${resultsRef.current.length} queries.`);
          setIsAnalyzing(false);
          ctrl.abort();
        }
      }, 1200000);

      const url = `${import.meta.env.VITE_API_URL}/api/ai-queries/${domainId}`;
      
      fetchEventSource(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ location }),
        signal: ctrl.signal,
        onmessage(ev) {
          clearTimeout(connectionTimeout);
          
          if (ev.event === 'complete') {
            clearTimeout(overallTimeout);
            setIsAnalyzing(false);
            setCurrentPhrase(`Analysis complete! Processed ${resultsRef.current.length} queries.`);
            // Results already accumulated in resultsRef
            setRawResults(resultsRef.current);
            setQueryResults(resultsRef.current);
            if (setQueryStats && stats) setQueryStats(stats);
            setModelStatus({ 'GPT-4o': 'Done', 'Claude 3': 'Done', 'Gemini 1.5': 'Done' });
            const transformed = transformResults(resultsRef.current);
            setResults(transformed);
            ctrl.abort();
            toast({ title: 'Analysis Complete', description: `Successfully processed ${resultsRef.current.length} queries.` });
            return;
          }
          if (ev.event === 'result') {
            const data: AIQueryResult = JSON.parse(ev.data);
            // Prevent duplicates
            const isDuplicate = resultsRef.current.some(r => 
              r.model === data.model && r.phrase === data.phrase && r.keyword === data.keyword
            );
            if (!isDuplicate) {
              resultsRef.current.push(data);
              setRawResults(prev => [...prev, data]);
              // Calculate real progress from totalExpected, fallback to +2% increment
              setTotalExpected(prev => {
                if (prev > 0) {
                  setProgress(Math.min(95, Math.round((resultsRef.current.length / prev) * 100)));
                } else {
                  setProgress(p => Math.min(95, p + 2));
                }
                return prev;
              });
              setModelStatus(prev => ({ ...prev, [data.model]: 'Querying...' }));
            }
          } else if (ev.event === 'stats') {
            const data: AIQueryStats = JSON.parse(ev.data);
            setStats(data);
            if (setQueryStats) setQueryStats(data);
            setLoadingTasks(prev => {
              const newTasks = [...prev];
              newTasks[3] = { ...newTasks[3], status: 'completed', progress: 100 };
              newTasks[4] = { ...newTasks[4], status: 'running', progress: 80 };
              return newTasks;
            });
          } else if (ev.event === 'progress') {
            const data = JSON.parse(ev.data);
            setCurrentPhrase(data.message);
            if (data.totalExpected && data.totalExpected > 0) {
              setTotalExpected(data.totalExpected);
            }
          } else if (ev.event === 'error') {
            clearTimeout(overallTimeout);
            try {
              const data = JSON.parse(ev.data);
              setError(data.error || 'An error occurred during analysis.');
            } catch {
              setError('An error occurred during analysis.');
            }
            setIsAnalyzing(false);
            ctrl.abort();
          }
        },
        onerror(err) {
          clearTimeout(connectionTimeout);
          console.error('EventSource error:', err);
          // Allow @microsoft/fetch-event-source built-in retry (up to 3 reconnection attempts)
          // Only abort permanently if we've had no results at all (likely auth/server error)
          if (resultsRef.current.length === 0) {
            clearTimeout(overallTimeout);
            setError('Connection error. Please check your internet connection and try again.');
            setIsAnalyzing(false);
            ctrl.abort();
          }
          // Otherwise, the library will auto-retry and we keep the existing results
        }
      });

      return () => {
        clearTimeout(connectionTimeout);
        clearTimeout(overallTimeout);
        ctrl.abort();
      };
    };

    initializeAnalysis();
  // Run only when domain or location changes to avoid continuous re-analysis
  }, [domainId, location]);

  // Simulate step progression during analysis
  useEffect(() => {
    if (isAnalyzing && !isReturning) {
      const stepTimer = setInterval(() => {
        setCurrentStep(prev => {
          if (prev < querySteps.length - 1) {
            return prev + 1;
          } else {
            clearInterval(stepTimer);
            return prev;
          }
        });
      }, 600);

      return () => clearInterval(stepTimer);
    }
  }, [isAnalyzing, isReturning]);

  // Carousel animation for returning state
  useEffect(() => {
    if (isReturning) {
      const carouselTimer = setInterval(() => {
        setCurrentLoadingIndex(prev => {
          if (prev < loadingTasks.length - 1) {
            return prev + 1;
          } else {
            clearInterval(carouselTimer);
            return prev;
          }
        });
      }, 800);

      return () => clearInterval(carouselTimer);
    }
  }, [isReturning]);

  const getModelData = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    const data = results[modelId];
    
    // Ensure we have valid data with defaults
    const safeData = {
      ranked: data?.ranked || 0,
      total: data?.total || 0
    };
    
    return { ...model, ...safeData } as { id: string; name: string; ranked: number; total: number };
  };

  const getFilteredTableData = () => {
    if (!results.tableData) return [];
    
    if (selectedModel === 'all') {
      return results.tableData;
    }
    
    return results.tableData.filter(row => row.model === selectedModel);
  };

  // NEW: reset page when filter or results change
  useEffect(() => {
    setPage(1);
  }, [selectedModel, results.tableData?.length]);



  const getDomainPresenceColor = (presence: string) => {
    switch (presence) {
      case 'Featured':
      case 'Highlighted':
        return 'bg-green-100 text-green-800';
      case 'Listed':
      case 'Referenced':
        return 'bg-blue-100 text-blue-800';
      case 'Mentioned':
        return 'bg-yellow-100 text-yellow-800';
      case 'Not Found':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getOverallScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 font-bold';
    if (score >= 80) return 'text-blue-600 font-semibold';
    if (score >= 70) return 'text-yellow-600 font-medium';
    if (score > 0) return 'text-orange-600';
    return 'text-red-600';
  };

  // Enhanced UI helper functions
  const getContextBadge = (context?: string) => {
    if (!context) return null;
    
    const contextConfig = {
      'recommendation': { color: 'bg-green-100 text-green-800', icon: '⭐', label: 'Recommended' },
      'comparison': { color: 'bg-blue-100 text-blue-800', icon: '⚖️', label: 'Compared' },
      'example': { color: 'bg-purple-100 text-purple-800', icon: '📝', label: 'Example' },
      'url_mention': { color: 'bg-orange-100 text-orange-800', icon: '🔗', label: 'Linked' },
      'text_mention': { color: 'bg-yellow-100 text-yellow-800', icon: '📄', label: 'Mentioned' },
      'not_found': { color: 'bg-gray-100 text-gray-800', icon: '❌', label: 'Not Found' }
    };
    
    const config = contextConfig[context as keyof typeof contextConfig] || contextConfig.not_found;
    
    return (
      <Badge className={`${config.color} text-xs font-medium`}>
        <span className="mr-1">{config.icon}</span>
        {config.label}
      </Badge>
    );
  };

  const getScoreColor = (score: number, maxScore: number = 100) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-blue-600';
    if (percentage >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBackground = (score: number, maxScore: number = 100) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return 'bg-green-100';
    if (percentage >= 60) return 'bg-blue-100';
    if (percentage >= 40) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getPresenceColor = (presence: string) => {
    switch (presence) {
      case 'Featured':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'Mentioned':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'Not Found':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  // Helper functions to extract URLs and domains from response
  const extractUrlsFromResponse = (response: string): string[] => {
    const urlRegex = /https?:\/\/[^\s\n]+/g;
    const urls = response.match(urlRegex) || [];
    return [...new Set(urls)]; // Remove duplicates
  };

  const extractDomainsFromResponse = (response: string): string[] => {
    const urlRegex = /https?:\/\/[^\s\n]+/g;
    const urls = response.match(urlRegex) || [];
    const domains = urls.map(url => {
      try {
        return new URL(url).hostname;
      } catch {
        return '';
      }
    }).filter(domain => domain.length > 0);
    return [...new Set(domains)]; // Remove duplicates
  };

  const toggleExpandedResponse = (responseId: string) => {
    setExpandedResponses(prev => ({
      ...prev,
      [responseId]: !prev[responseId]
    }));
  };

  // Show error state if there's an error
  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            AI Query Results
          </h2>
        </div>
        <Card className="shadow-sm border border-red-200">
          <CardContent className="py-12">
            <div className="text-center space-y-6">
              <div className="text-red-600 text-6xl">⚠️</div>
              <div>
                <h3 className="text-xl font-semibold text-red-900">Analysis Error</h3>
                <p className="text-red-700 mb-4">{error}</p>
                <div className="text-sm text-red-600 mb-4">
                  Processed: {rawResults.length} / {totalExpected > 0 ? totalExpected : 'Unknown'} queries
                </div>
                <div className="flex gap-4 justify-center">
                  <Button variant="outline" onClick={onPrev}>
                    Go Back
                  </Button>
                  <Button 
                    onClick={onPrev}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Retry Analysis
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isReturning) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-12">
            <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-gray-900 mb-3">
              Loading Your AI Query Results
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Retrieving your secure analysis results from our protected cloud environment
            </p>
          </div>

          {/* Apple-style Carousel */}
          <div className="relative h-24 mb-8 overflow-hidden">
            <div 
              className="flex transition-transform duration-1000 ease-out"
              style={{ transform: `translateX(-${currentLoadingIndex * 100}%)` }}
            >
              {loadingTasks.map((task, index) => (
                <div key={index} className="w-full flex-shrink-0 text-center">
                  <h3 className="text-xl font-medium text-gray-900 mb-2 transition-opacity duration-700">
                    {task.name}
                  </h3>
                  <p className="text-base text-gray-600 transition-opacity duration-700">
                    {task.status === 'completed' ? 'Completed successfully' : 
                     task.status === 'running' ? 'In progress...' : 'Pending'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Apple-style Progress Dots */}
          <div className="flex justify-center space-x-3 mb-8">
            {loadingTasks.map((task, index) => (
              <div
                key={index}
                className={`w-3 h-3 rounded-full transition-all duration-700 ease-out ${
                  task.status === 'completed'
                    ? 'bg-gray-800 scale-110 shadow-md'
                    : index === currentLoadingIndex
                    ? 'bg-gray-600 scale-125 shadow-lg'
                    : 'bg-gray-300'
                }`}
              ></div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center text-gray-600">
              <svg className="w-6 h-6 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-base font-medium">Your analysis is being processed securely</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-12">
            <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-gray-900 mb-3">
              Analyzing Domain Performance
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              {currentPhrase || 'Preparing AI analysis engines...'}
            </p>
          </div>

          {/* Apple-style Carousel */}
          <div className="relative h-24 mb-8 overflow-hidden">
            <div 
              className="flex transition-transform duration-1000 ease-out"
              style={{ transform: `translateX(-${currentTaskIndex * 100}%)` }}
            >
              {loadingTasks.map((task, index) => (
                <div key={index} className="w-full flex-shrink-0 text-center">
                  <h3 className="text-xl font-medium text-gray-900 mb-2 transition-opacity duration-700">
                    {task.name}
                  </h3>
                  <p className="text-base text-gray-600 transition-opacity duration-700">
                    {task.status === 'completed' ? 'Completed successfully' : 
                     task.status === 'running' ? 'In progress...' : 'Pending'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Apple-style Progress Dots */}
          <div className="flex justify-center space-x-3 mb-8">
            {loadingTasks.map((task, index) => (
              <div
                key={index}
                className={`w-3 h-3 rounded-full transition-all duration-700 ease-out ${
                  task.status === 'completed'
                    ? 'bg-gray-800 scale-110 shadow-md'
                    : index === currentTaskIndex
                    ? 'bg-gray-600 scale-125 shadow-lg'
                    : 'bg-gray-300'
                }`}
              ></div>
            ))}
          </div>

          {/* Progress Bar */}
          {rawResults.length > 0 && (
            <div className="w-full max-w-md mx-auto mb-8">
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-1 rounded-full transition-all duration-500"
                  style={{ width: totalExpected > 0 ? `${Math.min(100, (rawResults.length / totalExpected) * 100)}%` : `${Math.min(95, progress)}%` }}
                />
              </div>
              <div className="text-sm text-gray-600 mt-3 font-medium">
                {rawResults.length}{totalExpected > 0 ? ` / ${totalExpected}` : ''} queries processed
              </div>
            </div>
          )}

          {/* Incremental Results Preview */}
          {rawResults.length > 0 && (
            <div className="w-full max-w-md mx-auto mb-8">
              <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Latest Results</div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {rawResults.slice(-5).reverse().map((r, idx) => {
                  const presence = Math.round(Number(r.scores.presence) * 100);
                  return (
                    <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <div className="truncate flex-1 mr-2">
                        <span className="text-gray-700 font-medium">{r.model}</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className="text-gray-500 truncate">{r.phrase.slice(0, 40)}{r.phrase.length > 40 ? '...' : ''}</span>
                      </div>
                      <span className={`font-semibold ${presence > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {presence > 0 ? `${presence}%` : 'Not found'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center text-gray-600">
              <svg className="w-6 h-6 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-base font-medium">Your analysis is being processed securely</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper to map frontend model key to backend stats model label
  const mapModelIdToStatsName = (id: string) => {
    if (id === 'chatgpt') return 'GPT-4o';
    if (id === 'claude') return 'Claude 3';
    return 'Gemini 1.5';
  };

  // Helper to get accurate model performance data
  const getModelPerformanceData = (modelId: string) => {
    const data = results[modelId];
    const statsName = mapModelIdToStatsName(modelId);
    const modelStatsFromServer = stats?.models?.find(m => m.model === statsName);
    
    // Use server stats if available, otherwise calculate from results
    if (modelStatsFromServer) {
      return {
        avgOverall: modelStatsFromServer.avgOverall, // Already 0-100 from backend
        presenceRate: modelStatsFromServer.presenceRate, // Already 0-100 from backend
        totalQueries: data?.total || 0,
        rankedQueries: data?.ranked || 0
      };
    }
    
    // Fallback calculation from results
    const safeData = {
      ranked: data?.ranked || 0,
      total: data?.total || 0
    };
    
    return {
      avgOverall: safeData.total > 0 ? Math.round((safeData.ranked / safeData.total) * 100) : 0,
      presenceRate: safeData.total > 0 ? Math.round((safeData.ranked / safeData.total) * 100) : 0,
      totalQueries: safeData.total,
      rankedQueries: safeData.ranked
    };
  };



  return (
    <div className="min-h-screen bg-white">
      {/* Apple-style Hero Section - Centered */}
      <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-white"></div>
        
        {/* Main Content */}
        <div className="relative z-10 text-center max-w-3xl w-full">
          <div className="space-y-6">
            {/* Title Section */}
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl font-thin text-gray-900 tracking-tight">
                AI Query
                <span className="block font-light">Analysis</span>
              </h1>
              <p className="text-lg md:text-xl font-light text-gray-600 max-w-xl mx-auto leading-relaxed">
                Advanced intelligence across language models
              </p>
            </div>

            {/* Model Performance Cards - Horizontal Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-8">
              {models.map(model => {
                const performanceData = getModelPerformanceData(model.id);
                
                return (
                  <div key={model.id} className="group">
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 hover:bg-gray-50 transition-all duration-300 hover:shadow-lg">
                      <div className="text-center space-y-4">
                        <div className={`w-12 h-12 mx-auto rounded-xl ${model.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg relative overflow-hidden`}>
                          <div className="absolute inset-0 bg-white/10 rounded-xl"></div>
                          <i className={`${model.icon} text-white text-xl relative z-10 drop-shadow-sm`} style={{ fontSize: '1.25rem' }}></i>
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-lg font-medium text-gray-900">{model.name}</h3>
                          <p className="text-gray-500 text-xs">{performanceData.totalQueries} queries</p>
                        </div>
                        <div className="space-y-3">
                          <div className="text-3xl font-thin text-gray-900">{performanceData.avgOverall}%</div>
                          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gray-900 rounded-full transition-all duration-1000"
                              style={{ width: `${performanceData.avgOverall}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary Stats */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 mb-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-thin text-gray-900 mb-1">{stats.totalResults}</div>
                  <div className="text-xs text-gray-600">Total Queries</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-thin text-green-600 mb-1">
                    {stats.overall ? stats.overall.presenceRate : 0}%
                  </div>
                  <div className="text-xs text-gray-600">Domain Presence</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-thin text-blue-600 mb-1">
                    {stats.overall ? stats.overall.avgOverall : 0}%
                  </div>
                  <div className="text-xs text-gray-600">Average Score</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-thin text-purple-600 mb-1">
                    {stats.overall?.avgDomainRank ? `#${stats.overall.avgDomainRank}` : '—'}
                  </div>
                  <div className="text-xs text-gray-600">Avg Domain Rank</div>
                </div>
              </div>
            )}



            {/* Navigation */}
            <div className="flex items-center justify-center space-x-4 mt-8">
              <button
                onClick={onPrev}
                className="px-6 py-3 text-gray-600 font-medium rounded-full border border-gray-300 hover:bg-gray-50 transition-all duration-200"
              >
                Back
              </button>
              <button
                onClick={() => setSelectedView(selectedView === 'overview' ? 'detailed' : 'overview')}
                className="px-8 py-3 bg-gray-900 text-white font-medium rounded-full hover:bg-gray-800 transition-all duration-200 shadow-lg"
              >
                {selectedView === 'overview' ? 'View Details' : 'Overview'}
              </button>
              <button
                onClick={onNext}
                className="px-6 py-3 bg-blue-500 text-white font-medium rounded-full hover:bg-blue-600 transition-all duration-200"
              >
                Continue
              </button>
            </div>
          </div>
        </div>



        {/* Scroll Indicator */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <div className="animate-bounce">
            <ChevronDown className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Detailed Results Section - Only shown when requested */}
      {selectedView === 'detailed' && (
        <div ref={detailedResultsRef} className="min-h-screen bg-white py-20">
          <div className="max-w-6xl mx-auto px-6">
            {/* Section Header */}
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-thin text-gray-900 mb-6">
                Detailed Analysis
              </h2>
              <div className="inline-flex bg-white rounded-full p-1 shadow-sm border border-gray-200">
                <button
                  onClick={() => setSelectedModel('all')}
                  className={`px-6 py-2 text-sm font-medium rounded-full transition-all ${
                    selectedModel === 'all'
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All Models
                </button>
                {models.map(model => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={`px-6 py-2 text-sm font-medium rounded-full transition-all ${
                      selectedModel === model.id
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Compact Results Grid */}
            <div className="grid gap-6">
              {getFilteredTableData().slice((page - 1) * pageSize, page * pageSize).map((row, index) => {
                const model = models.find(m => m.id === row.model);
                const cardId = `${row.phrase}-${row.model}-${index}`;
                const isExpanded = expandedCards[cardId];
                
                return (
                  <div key={cardId} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300">
                    <div className="p-8">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center space-x-4">
                          <div className={`w-10 h-10 rounded-lg ${model?.color} flex items-center justify-center shadow-md relative overflow-hidden`}>
                            <div className="absolute inset-0 bg-white/10 rounded-lg"></div>
                            <i className={`${model?.icon} text-white text-lg relative z-10 drop-shadow-sm`}></i>
                          </div>
                          <div>
                            <h3 className="text-xl font-medium text-gray-900">{model?.name}</h3>
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                row.domainPresence === 'Featured' ? 'bg-green-100 text-green-800' :
                                row.domainPresence === 'Mentioned' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {row.domainPresence}
                              </span>
                              {typeof row.position === 'number' && row.position > 0 && (
                                <span className="px-2 py-1 text-xs rounded-full font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                  #{row.position}
                                </span>
                              )}
                              {row.detectionMethod && (
                                <span className="px-2 py-1 text-xs rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                  {row.detectionMethod.replace('_', ' ')}
                                </span>
                              )}
                              {row.sources && row.sources.length > 0 && (
                                <span className="text-xs text-gray-500">
                                  {row.sources.length} sources
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-thin text-gray-900">{row.overallScore}</div>
                          <div className="text-sm text-gray-500">Score</div>
                        </div>
                      </div>

                      {/* Competitor Badges (top) */}
                      {row.competitorsMentions && row.competitorsMentions.length > 0 && (
                        <div className="mb-4">
                          <div className="flex flex-wrap gap-2">
                            {row.competitorsMentions.slice(0, 6).map((m: CompetitorMentionWithRank, i: number) => (
                              <span key={i} className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full border border-gray-200">
                                #{m.rank} {m.domain || m.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Query */}
                      <div className="mb-6">
                        <p className="text-lg text-gray-800 font-medium leading-relaxed">
                          {row.phrase}
                        </p>
                        {row.keyword && (
                          <p className="text-sm text-gray-500 mt-2">
                            Keyword: {row.keyword}
                          </p>
                        )}
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-3 gap-4 mb-6">

                        {row.position && row.position > 0 ? (
                          <div className="text-center p-3 bg-gray-50 rounded-xl">
                            <div className="text-2xl font-medium text-gray-900">#{row.position}</div>
                            <div className="text-xs text-gray-600">Rank</div>
                          </div>
                        ) : (
                          <div className="text-center p-3 bg-gray-50 rounded-xl">
                            <div className="text-2xl font-medium text-gray-900">—</div>
                            <div className="text-xs text-gray-600">Not Ranked</div>
                          </div>
                        )}
                        <div className="text-center p-3 bg-gray-50 rounded-xl">
                          <div className="text-2xl font-medium text-gray-900">{row.overallScore}</div>
                          <div className="text-xs text-gray-600">Score</div>
                        </div>
                      </div>

                      {/* Expandable Response */}
                      <div className="border-t border-gray-100 pt-6">
                        <button
                          onClick={() => setExpandedCards(prev => ({ ...prev, [cardId]: !prev[cardId] }))}
                          className="flex items-center justify-between w-full text-left"
                        >
                          <span className="text-sm font-medium text-gray-900">AI Response</span>
                          {isExpanded ? 
                            <Minus className="w-5 h-5 text-gray-400" /> : 
                            <Plus className="w-5 h-5 text-gray-400" />
                          }
                        </button>
                        
                        {isExpanded && (
                          <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                            <div className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none">
                              <ReactMarkdown>{row.response}</ReactMarkdown>
                            </div>
                            
                            {/* Competitors (badges + minimal list) */}
                            {row.competitorsMentions && row.competitorsMentions.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-gray-200">
                                <h5 className="text-sm font-medium text-gray-900 mb-2">Competitors Mentioned:</h5>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {row.competitorsMentions.slice(0, 8).map((m: CompetitorMentionWithRank, i: number) => (
                                    <span key={i} className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full border border-gray-200">
                                      #{m.rank} {m.domain || m.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Domain Analysis */}
                            {row.sources && row.sources.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-gray-200">
                                <h5 className="text-sm font-medium text-gray-900 mb-2">Sources Found:</h5>
                                <div className="flex flex-wrap gap-2">
                                  {row.sources.map((source, idx) => (
                                    <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                      {source}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Competitor URLs */}
                            {row.competitorUrls && row.competitorUrls.length > 0 && (
                              <div className="mt-3">
                                <h5 className="text-sm font-medium text-gray-900 mb-2">Competitor URLs:</h5>
                                <div className="space-y-1">
                                  {row.competitorUrls.slice(0, 3).map((url, idx) => (
                                    <div key={idx} className="text-xs text-gray-600 bg-white p-2 rounded border">
                                      {url}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Enhanced Domain Detection Info */}
                            {row.highlightContext && (
                              <div className="mt-3">
                                <h5 className="text-sm font-medium text-gray-900 mb-2">Domain Detection:</h5>
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-green-800">
                                      Detection Method: {row.detectionMethod || 'Unknown'}
                                    </span>

                                  </div>
                                  <div className="text-sm text-green-700 bg-white p-2 rounded border border-green-100">
                                    <strong>Context:</strong> {row.highlightContext}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {getFilteredTableData().length > pageSize && (
              <div className="flex items-center justify-center space-x-4 mt-12">
                <button
                  onClick={() => {
                    setPage(prev => Math.max(1, prev - 1));
                    scrollToDetailedResults();
                  }}
                  disabled={page === 1}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-full hover:border-gray-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                
                <div className="flex items-center space-x-2">
                  {Array.from({ length: Math.ceil(getFilteredTableData().length / pageSize) }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => {
                        setPage(pageNum);
                        scrollToDetailedResults();
                      }}
                      className={`w-10 h-10 rounded-full transition-all duration-200 ${
                        page === pageNum
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => {
                    setPage(prev => Math.min(Math.ceil(getFilteredTableData().length / pageSize), prev + 1));
                    scrollToDetailedResults();
                  }}
                  disabled={page === Math.ceil(getFilteredTableData().length / pageSize)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-full hover:border-gray-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
            
            {/* Results Info */}
            <div className="text-center mt-6 text-sm text-gray-600">
              Showing {Math.min((page - 1) * pageSize + 1, getFilteredTableData().length)} to {Math.min(page * pageSize, getFilteredTableData().length)} of {getFilteredTableData().length} results
            </div>
          </div>
        </div>
      )}

      {/* Insights Section - Collapsible */}
      {stats?.insights && (
        <div className="bg-white py-20">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-12">
              <button
                onClick={() => setExpandedInsights(!expandedInsights)}
                className="inline-flex items-center space-x-3 text-3xl font-thin text-gray-900 hover:text-gray-700 transition-colors"
              >
                <span>Key Insights</span>
                {expandedInsights ? 
                  <ChevronUp className="w-8 h-8" /> : 
                  <ChevronDown className="w-8 h-8" />
                }
              </button>
            </div>

            {expandedInsights && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Strengths */}
                {stats.insights.strengths && stats.insights.strengths.length > 0 && (
                  <div className="bg-green-50 rounded-2xl p-8">
                    <h3 className="text-2xl font-medium text-green-900 mb-6 flex items-center">
                      <CheckCircle className="w-6 h-6 mr-3" />
                      Strengths
                    </h3>
                    <div className="space-y-4">
                      {stats.insights.strengths.slice(0, 3).map((strength, index) => (
                        <div key={index} className="bg-white/70 rounded-xl p-4">
                          <div className="font-medium text-green-900">{strength.area}</div>
                          <div className="text-sm text-green-700 mt-1">{strength.description}</div>
                          <div className="text-xs text-green-600 mt-2">Score: {strength.score}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Opportunities */}
                {stats.insights.opportunities && stats.insights.opportunities.length > 0 && (
                  <div className="bg-blue-50 rounded-2xl p-8">
                    <h3 className="text-2xl font-medium text-blue-900 mb-6 flex items-center">
                      <Lightbulb className="w-6 h-6 mr-3" />
                      Opportunities
                    </h3>
                    <div className="space-y-4">
                      {stats.insights.opportunities.slice(0, 3).map((opportunity, index) => (
                        <div key={index} className="bg-white/70 rounded-xl p-4">
                          <div className="font-medium text-blue-900">{opportunity.area}</div>
                          <div className="text-sm text-blue-700 mt-1">{opportunity.action}</div>
                          <div className="text-xs text-blue-600 mt-2">Potential: {opportunity.potential}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIQueryResults;
