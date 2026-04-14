import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useToast } from '@/components/ui/use-toast';
import { 
  Trophy, Medal, Award, Star, CheckCircle, XCircle, TrendingUp, Target, Zap, 
  ChevronDown, ChevronRight, ExternalLink, Search, Globe, MapPin, ChevronUp,
  BarChart3, Users, Shield, AlertTriangle, Lightbulb, ArrowUpRight, Eye,
  MessageSquare, Calendar, Clock, Activity, Target as TargetIcon
} from 'lucide-react';
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

    sources?: string[];
    competitorUrls?: string[];
    competitorMatchScore?: number;
    comprehensiveness?: number;
    context?: string;
    mentions?: number;
  };
  domainRank?: number;
  foundDomains?: string[];
  domainPresence?: string;
  overallScore?: number;
  position?: number;
  url?: string;

  sources?: string[];
  competitorUrls?: string[];
  competitorMatchScore?: number;
  comprehensiveness?: number;
  context?: string;
  mentions?: number;
  expanded?: boolean;
  citations?: Array<{
    url: string;
    title: string;
    citedText?: string;
    startIndex?: number;
    endIndex?: number;
    confidenceScore?: number;
  }>;
  searchQueries?: string[];
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

  }>;
  overall: {
    presenceRate: number;
    avgRelevance: number;
    avgAccuracy: number;
    avgSentiment: number;
    avgOverall: number;
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

const AIQueryResultsNew: React.FC<AIQueryResultsProps> = ({
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
  const [selectedTab, setSelectedTab] = useState<'overview' | 'results' | 'insights' | 'competitors'>('overview');

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
    { id: 'claude', name: 'Claude', color: 'bg-purple-500', icon: 'ri-robot-line' },
    { id: 'chatgpt', name: 'ChatGPT', color: 'bg-green-500', icon: 'ri-openai-fill' }
  ];

  // Calculate exact expected results - will be determined by the backend
  const [totalExpected, setTotalExpected] = useState(0); // Dynamic total from backend

  // Transform raw results to match new format
  const transformResults = (rawResults: AIQueryResult[]) => {
    console.log('TransformResults called with:', rawResults.length, 'results');
    console.log('All model names received:', rawResults.map(r => r.model));
    
    const tableData = rawResults.map(result => {
      // Ensure all scores are valid numbers with fallbacks
      const presence = Number(result.scores.presence) || 0;
      const overall = Number(result.scores.overall) || 0;
      
      // Additional safety check for NaN values
      const safeOverall = isNaN(overall) ? 0 : overall;
      
      console.log('Transform debug for result:', {
        phrase: result.phrase,
        model: result.model,
        originalScores: result.scores,
        presence,
        overall: safeOverall
      });
      
      return {
        phrase: result.phrase,
        keyword: result.keyword,
        model: result.model === 'GPT-4o' ? 'chatgpt' : 
               result.model === 'Claude 3' ? 'claude' : 'gemini',
        response: result.response,
        domainPresence: presence === 1 ? 'Featured' : 
                       presence > 0 ? 'Mentioned' : 'Not Found',
        overallScore: Math.round(safeOverall * 20), // Convert 0-5 to 0-100
        position: result.domainRank,
        url: result.url,
        sources: result.scores.sources || [],
        competitorUrls: result.scores.competitorUrls || [],
        competitorMatchScore: result.scores.competitorMatchScore,
        comprehensiveness: result.scores.comprehensiveness,
        context: result.scores.context,
        mentions: result.scores.mentions,
        citations: result.citations || [],
        searchQueries: result.searchQueries || []
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
      const presence = Number(result.scores.presence) || 0;
      if (presence > 0) {
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
          // Convert database results to AIQueryResult format
          const existingResults: AIQueryResult[] = data.results.map((result: {
            model: string;
            phrase: { phrase: string; keyword?: { term: string } };
            response: string;
            latency: number;
            cost: number;
            presence: number;
            relevance: number;
            accuracy: number;
            sentiment: number;
            overall: number;
            comprehensiveness?: number;
            context?: string;
            mentions?: number;
          }) => ({
            model: result.model,
            phrase: result.phrase.phrase,
            keyword: result.phrase.keyword?.term || '',
            response: result.response,
            latency: result.latency,
            cost: result.cost,
            progress: 100,
            scores: {
              presence: result.presence,
              relevance: result.relevance,
              accuracy: result.accuracy,
              sentiment: result.sentiment,
              overall: result.overall,
              comprehensiveness: result.comprehensiveness,
              context: result.context,
              mentions: result.mentions
            }
          }));
          
          return existingResults;
        }
      }
      return [];
    } catch (error) {
      console.error('Error checking existing results:', error);
      return [];
    }
  };

  // Helper functions for UI
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

  // Continue with the rest of the component...
  // (I'll continue in the next part due to length limits) 
  useEffect(() => {
    // Check if we have existing results
    const hasExistingResults = rawResults.length > 0;

    if (hasExistingResults) {
      setIsReturning(true);
      setTimeout(() => {
        const transformedResults = transformResults(rawResults);
        setResults(transformedResults);
        setIsAnalyzing(false);
        setIsReturning(false);
      }, 2500);
      return;
    }

    // Check for existing results in database before starting new analysis
    const initializeAnalysis = async () => {
      const existingResults = await checkExistingResults();
      
      if (existingResults.length > 0) {
        setRawResults(existingResults);
        resultsRef.current = existingResults;
        
        // Transform and set results immediately
        const transformedResults = transformResults(existingResults);
        setResults(transformedResults);
        setQueryResults(existingResults);
        
        // Show completion message
        setIsAnalyzing(false);
        setCurrentPhrase(`Analysis complete! Found ${existingResults.length} existing results.`);
        setModelStatus({ 'GPT-4o': 'Done', 'Claude 3': 'Done', 'Gemini 1.5': 'Done' });
        
        toast({
          title: "Analysis Complete",
          description: `Found ${existingResults.length} existing results from previous analysis.`,
        });
        return;
      }

      // No existing results, start new analysis
      startNewAnalysis();
    };

    const startNewAnalysis = () => {
      // Reset all state
      setIsAnalyzing(true);
      setProgress(0);
      setCurrentPhrase('Initializing analysis... (This may take a few minutes for large jobs)');
      setError(null);
      resultsRef.current = [];
      setRawResults([]);
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

      // Add connection timeout
      const connectionTimeout = setTimeout(() => {
        if (resultsRef.current.length === 0) {
          setError('Connection timeout. The analysis engine took too long to start. For large jobs, please wait a few minutes before retrying.');
          setIsAnalyzing(false);
          ctrl.abort();
        }
      }, 300000); // 5 minute connection timeout

      // Add overall timeout for large datasets
      const overallTimeout = setTimeout(() => {
        if (isAnalyzing) {
          const expectedTotal = totalExpected > 0 ? totalExpected : 30; // Fallback to reasonable default
          setError(`Analysis timeout. Processed ${resultsRef.current.length}/${expectedTotal} queries.`);
          setIsAnalyzing(false);
          ctrl.abort();
        }
      }, Math.max(1200000, (totalExpected > 0 ? totalExpected : 30) * 3000)); // 20 minutes minimum, or 3 seconds per query

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
          clearTimeout(connectionTimeout); // Clear timeout on first message
          
          if (ev.event === 'complete') {
            clearTimeout(overallTimeout);
            setIsAnalyzing(false);
            setCurrentPhrase(`Analysis complete! Processed ${resultsRef.current.length} queries.`);
            setRawResults(resultsRef.current);
            setQueryResults(resultsRef.current);
            if (setQueryStats && stats) setQueryStats(stats);
            setModelStatus({ 'GPT-4o': 'Done', 'Claude 3': 'Done', 'Gemini 1.5': 'Done' });
            
            // Transform and set results
            const transformedResults = transformResults(resultsRef.current);
            setResults(transformedResults);
            
            ctrl.abort();
            toast({
              title: "Analysis Complete",
              description: `Successfully processed ${resultsRef.current.length} queries.`,
            });
            return;
          }
          if (ev.event === 'result') {
            const data: AIQueryResult = JSON.parse(ev.data);
            
            // Prevent duplicate results
            const isDuplicate = resultsRef.current.some(r => 
              r.model === data.model && r.phrase === data.phrase && r.keyword === data.keyword
            );
            
            if (!isDuplicate) {
              resultsRef.current.push(data);
              setRawResults(prev => [...prev, data]);
              
              // Calculate accurate progress
              const currentProgress = totalExpected > 0 
                ? Math.min(100, Math.round((resultsRef.current.length / totalExpected) * 100))
                : Math.min(100, Math.round((resultsRef.current.length / 10) * 100)); // Fallback
              setProgress(currentProgress);
              
              // Update model status
              setModelStatus(prev => ({ ...prev, [data.model]: 'Querying...' }));
            }
          } else if (ev.event === 'stats') {
            const data: AIQueryStats = JSON.parse(ev.data);
            setStats(data);
            if (setQueryStats) setQueryStats(data);
            
            // Update report generation task
            setLoadingTasks(prev => {
              const newTasks = [...prev];
              newTasks[3] = { ...newTasks[3], status: 'completed', progress: 100 };
              newTasks[4] = { ...newTasks[4], status: 'running', progress: 80 };
              return newTasks;
            });
          } else if (ev.event === 'progress') {
            const data = JSON.parse(ev.data);
            const msg: string = data.message;
            
            // Check if this is the initialization message with total queries info
            if (msg.includes('Processing') && msg.includes('queries')) {
              const match = msg.match(/Processing (\d+) queries/);
              if (match) {
                const total = parseInt(match[1]);
                setTotalExpected(total);
              }
            }
            
            setCurrentPhrase(msg);
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
          clearTimeout(overallTimeout);
          console.error('EventSource error:', err);
          setError('Connection error. Please check your internet connection and try again.');
          setIsAnalyzing(false);
          ctrl.abort();
        }
      });

      return () => {
        clearTimeout(connectionTimeout);
        clearTimeout(overallTimeout);
        ctrl.abort();
      };
    };

    // Start the analysis process
    initializeAnalysis();
  }, [domainId, location, setQueryResults, setQueryStats, toast, totalExpected, stats]);

  // Auto-advance loading carousel
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLoadingIndex(prev => (prev + 1) % 3);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Auto-advance carousel to show running task
  useEffect(() => {
    const interval = setInterval(() => {
      const runningTaskIndex = loadingTasks.findIndex(task => task.status === 'running');
      if (runningTaskIndex !== -1) {
        setCurrentTaskIndex(runningTaskIndex);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [loadingTasks]);

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
      <div className="bg-white rounded-lg shadow-sm p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Loading Your AI Query Results
            </h2>
            <p className="text-gray-600 mb-4">
              Retrieving your secure analysis results from our protected cloud environment
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 max-w-md mx-auto">
              <div className="flex items-center justify-center mb-2">
                <Globe className="text-blue-600 mr-2 text-xl" />
                <span className="text-blue-800 font-medium">Secure Cloud Access</span>
              </div>
              <p className="text-blue-600 text-sm">
                Your AI model results are safely stored and encrypted on our servers
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-center space-x-8 mb-8">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2 animate-pulse">
                  <i className="ri-openai-fill text-green-600 text-xl"></i>
                </div>
                <div className="text-xs text-gray-600">ChatGPT-4</div>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2 animate-pulse">
                  <i className="ri-google-fill text-blue-600 text-xl"></i>
                </div>
                <div className="text-xs text-gray-600">Gemini Pro</div>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-2 animate-pulse">
                  <i className="ri-robot-line text-purple-600 text-xl"></i>
                </div>
                <div className="text-xs text-gray-600">Claude 3</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-4 mt-0.5 bg-blue-500">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                </div>
                <div>
                  <div className="font-semibold text-blue-800">
                    Retrieving AI model comparison results
                    <span className="ml-2 animate-pulse">...</span>
                  </div>
                  <div className="text-sm text-blue-600 mt-1">
                    Loading ChatGPT-4, Gemini Pro, and Claude 3 analysis data
                  </div>
                </div>
              </div>

              <div className="flex items-start p-4 rounded-lg border-2 border-green-200 bg-green-50">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-4 mt-0.5 bg-green-500">
                  <TrendingUp className="text-white text-sm" />
                </div>
                <div>
                  <div className="font-semibold text-green-800">
                    Reconstructing performance metrics
                  </div>
                  <div className="text-sm text-green-600 mt-1">
                    Rebuilding ranking positions and success rates
                  </div>
                </div>
              </div>

              <div className="flex items-start p-4 rounded-lg border-2 border-purple-200 bg-purple-50">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-4 mt-0.5 bg-purple-500">
                  <Target className="text-white text-sm" />
                </div>
                <div>
                  <div className="font-semibold text-purple-800">
                    Preparing detailed result tables
                  </div>
                  <div className="text-sm text-purple-600 mt-1">
                    Organizing URL rankings and query performance
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mt-6">
              <div className="flex items-center justify-center text-sm text-gray-600">
                <CheckCircle className="text-green-500 mr-2" />
                Your query results are protected with enterprise-grade security
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Loading Progress</span>
              <span>Retrieving...</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full animate-pulse" style={{ width: '75%' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center space-y-8">
          <div className="space-y-3">
            <div className="w-8 h-8 border-2 border-gray-200 rounded-full animate-spin border-t-gray-900 mx-auto"></div>
            <h2 className="text-xl font-medium text-gray-900">Analyzing Domain Performance</h2>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              {currentPhrase || 'Preparing AI analysis engines...'}
            </p>
          </div>

          {location && (
            <div className="inline-flex items-center px-3 py-1.5 bg-gray-50 rounded-full text-xs text-gray-600">
              <MapPin className="w-3 h-3 mr-1.5" />
              {location}
            </div>
          )}

          <div className="max-w-md mx-auto">
            <div className="flex justify-center space-x-1 mb-4">
              {loadingTasks.map((task, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-all duration-500 ${
                    task.status === 'completed'
                      ? 'bg-gray-900'
                      : index === currentTaskIndex
                      ? 'bg-gray-600'
                      : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-900">
                {loadingTasks[currentTaskIndex]?.name}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                {loadingTasks[currentTaskIndex]?.description}
              </p>
              
              {/* Show progress when we have results */}
              {rawResults.length > 0 && totalExpected > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>{rawResults.length} / {totalExpected}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div 
                      className="bg-blue-500 h-1 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (rawResults.length / totalExpected) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
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

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header Section */}
      <div className="border-b border-gray-100 pb-8 mb-8">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              AI Query Analysis
            </h1>
            <p className="text-gray-500 text-sm max-w-2xl leading-relaxed">
              Comprehensive domain performance analysis across multiple AI models with enhanced scoring and actionable insights
            </p>
          </div>
          {location && (
            <div className="text-right space-y-1">
              <div className="flex items-center text-gray-700 text-sm font-medium">
                <MapPin className="w-4 h-4 mr-1.5" />
                {location}
              </div>
              <p className="text-xs text-gray-400">Analysis region</p>
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'results', label: 'Results', icon: Search },
              { id: 'insights', label: 'Insights', icon: Lightbulb },
              { id: 'competitors', label: 'Competitors', icon: Users }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id as any)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    selectedTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {selectedTab === 'overview' && (
        <div className="space-y-8">
          {/* Model Performance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {models.map(model => {
              const data = getModelData(model.id);
              const statsName = mapModelIdToStatsName(model.id);
              const modelStatsFromServer = stats?.models?.find(m => m.model === statsName);
              const avgOverallPct = modelStatsFromServer ? modelStatsFromServer.avgOverall : (data.total > 0 ? Math.round((data.ranked / data.total) * 100) : 0);
              const presenceRate = modelStatsFromServer ? modelStatsFromServer.presenceRate : (data.total > 0 ? Math.round((data.ranked / data.total) * 100) : 0);
              const avgConfidence = modelStatsFromServer?.avgConfidence || 0;
              
              return (
                <Card key={model.id} className="relative overflow-hidden">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${model.color}`}>
                          <i className={`${model.icon} text-white text-lg`}></i>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{model.name}</h3>
                          <p className="text-sm text-gray-500">{data.total} queries analyzed</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900">{avgOverallPct}%</div>
                        <div className="text-xs text-gray-500">Overall Score</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Domain Presence</span>
                        <span className="text-sm font-medium text-gray-900">{presenceRate}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${presenceRate}%` }}
                        ></div>
                      </div>
                    </div>
                    


                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Ranked: {data.ranked}</span>
                        <span>Total: {data.total}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Overall Performance Summary */}
          {stats && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5" />
                  <span>Overall Performance Summary</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">{stats.overall.presenceRate}%</div>
                    <div className="text-sm text-gray-600">Domain Presence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">{stats.overall.avgRelevance}%</div>
                    <div className="text-sm text-gray-600">Avg Relevance</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600">{stats.overall.avgAccuracy}%</div>
                    <div className="text-sm text-gray-600">Avg Accuracy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-orange-600">{stats.overall.avgOverall}%</div>
                    <div className="text-sm text-gray-600">Overall Score</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Continue with other tabs... */}
      {/* (I'll continue in the next part due to length limits) */}
    </div>
  );
};

export default AIQueryResultsNew; 