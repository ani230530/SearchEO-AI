'use client';

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { PDFDownloadLink } from '@react-pdf/renderer';
import ReportPDF from '@/components/ReportPDF';
import CompetitorAnalysis from '@/components/CompetitorAnalysis';
import type { ReportData as ReportDataType, AIQueryResult as AIQueryResultType } from '@/types/report';

interface Step4Props {
  domainId: number;
  onBack: () => void;
  onComplete: () => void;
}

interface LoadingTask {
  name: string;
  status: 'pending' | 'running' | 'completed';
  progress: number;
  description: string;
}

export default function Step4Report({ domainId, onBack, onComplete }: Step4Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [isBackLoading, setIsBackLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<ReportDataType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFormula, setShowFormula] = useState(false);
  const navigate = useNavigate();

  // AI Analysis streaming state
  const [aiResults, setAiResults] = useState<AIQueryResultType[]>([]);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('');
  const [stats, setStats] = useState<{
    totalResults: number;
    overall: {
      avgOverall: number;
      presenceRate: number;
      avgDomainRank?: number;
      bestDomainRank?: number;
    };
  } | null>(null);

  // Carousel control state
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [currentLoadingIndex, setCurrentLoadingIndex] = useState(0);

  const [loadingTasks, setLoadingTasks] = useState<LoadingTask[]>([
    { name: 'AI Model Initialization', status: 'pending', progress: 0, description: 'Initializing AI analysis engines and preparing domain context' },
    { name: 'Phrase Analysis', status: 'pending', progress: 0, description: 'Analyzing selected intent phrases with multiple AI models' },
    { name: 'Response Scoring', status: 'pending', progress: 0, description: 'Evaluating AI responses for domain presence and SEO potential' },
    { name: 'Competitive Analysis', status: 'pending', progress: 0, description: 'Analyzing competitor positioning and market gaps' },
    { name: 'Report Generation', status: 'pending', progress: 0, description: 'Compiling comprehensive analysis report with recommendations' }
  ]);

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

  // Auto-advance loading carousel
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLoadingIndex(prev => (prev + 1) % 3);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Load existing AI results on component mount
  useEffect(() => {
    loadExistingAIResults();
  }, [domainId]);

  // Load existing AI results from database
  const loadExistingAIResults = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      setAiResults([]);
      setStats(null);
      
      console.log('Loading existing AI results for domain');
      const url = `${import.meta.env.VITE_API_URL}/api/ai-queries/results/${domainId}?limit=1000`;
      console.log('Loading AI results from API');
      
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log('No existing AI results found, creating fallback report');
          // Create fallback report instead of throwing error
          await generateReportFromAIResults([]);
          
          // Complete all tasks
          setLoadingTasks(prev => prev.map(task => ({
            ...task,
            status: 'completed',
            progress: 100
          })));
          
          setIsGenerating(false);
          setIsLoading(false);
          return;
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      const data = await response.json();
      console.log('Existing AI results loaded:', data);
      
      // Transform the data to match expected format
      if (data.results && Array.isArray(data.results)) {
        const results: AIQueryResultType[] = data.results;
        setAiResults(results);
        setStats(data.stats);
        
        // Generate report from existing results
        await generateReportFromAIResults(results);
      } else {
        throw new Error('No results found in response');
      }
      
      setIsGenerating(false);
      setIsLoading(false);
    } catch (err) {
      console.error('Error loading AI results:', err);
      setError(err instanceof Error ? err.message : 'Failed to load AI results');
      setIsGenerating(false);
      
      // Create fallback report
      await generateReportFromAIResults([]);
      setIsLoading(false);
    }
  };

  const generateReportFromAIResults = async (inputResults: AIQueryResultType[]) => {
    try {
      // Always compute from provided input to avoid stale state
      const results = inputResults && inputResults.length ? inputResults : aiResults;
      const totalResults = results.length;

      // Fetch domain details for accurate URL/location
      let domainUrl = 'example.com';
      let domainContext = 'Global';
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          const domainRes = await fetch(`${import.meta.env.VITE_API_URL}/api/domain/${domainId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          if (domainRes.ok) {
            const domainData = await domainRes.json();
            domainUrl = domainData.url || domainUrl;
            domainContext = domainData.location || domainContext;
          }
        }
      } catch (e) {
        // ignore domain fetch errors
      }

      // Domain rank metrics based on actual URLs in responses
      const domainRanks = results
        .map(r => r.scores.domainRank || 0)
        .filter(rank => rank > 0);
      const avgDomainRank = domainRanks.length ? (domainRanks.reduce((s, v) => s + v, 0) / domainRanks.length) : 0;
      const bestDomainRank = domainRanks.length ? Math.min(...domainRanks) : 0;
      
      if (totalResults === 0) {
        setReportData({
          domain: {
            id: domainId,
            url: domainUrl,
            context: 'Analysis completed with partial results due to AI model timeouts',
            location: domainContext
          },
          selectedKeywords: [],
          intentPhrases: [],
          llmResults: [],
          overallScore: 50, // Neutral score for partial results
          scoreBreakdown: {
            phrasePerformance: { weight: 40, score: 50 },
            keywordOpportunity: { weight: 25, score: 50 },
            domainAuthority: { weight: 20, score: 50 },
            onPageOptimization: { weight: 10, score: 50 },
            competitorGaps: { weight: 5, score: 50 }
          },
          recommendations: [{
            priority: 'Medium',
            type: 'System Optimization',
            description: 'Consider reducing the number of phrases or using fewer AI models for faster analysis',
            impact: 'Could improve analysis speed by 40-60%'
          }],
          analysis: {
            semanticAnalysis: {},
            keywordAnalysis: {},
            searchVolumeClassification: {},
            intentClassification: {}
          }
        });
        return;
      }
      
      // Averages from 0-5 scales -> 0-100
      const avgOverall0to5 = results.reduce((sum, r) => sum + (Number(r.scores.overall) || 0), 0) / totalResults;
      const avgPresence0to1 = results.reduce((sum, r) => sum + (Number(r.scores.presence) || 0), 0) / totalResults; // already 0..1
      const avgRelevance0to5 = results.reduce((sum, r) => sum + (Number(r.scores.relevance) || 0), 0) / totalResults;
      const avgAccuracy0to5 = results.reduce((sum, r) => sum + (Number(r.scores.accuracy) || 0), 0) / totalResults;
      const avgSentiment0to5 = results.reduce((sum, r) => sum + (Number(r.scores.sentiment) || 0), 0) / totalResults;

      // Safety checks for NaN values
      const safeAvgOverall = isNaN(avgOverall0to5) ? 0 : avgOverall0to5;
      const safeAvgPresence = isNaN(avgPresence0to1) ? 0 : avgPresence0to1;
      const safeAvgRelevance = isNaN(avgRelevance0to5) ? 0 : avgRelevance0to5;
      const safeAvgAccuracy = isNaN(avgAccuracy0to5) ? 0 : avgAccuracy0to5;
      const safeAvgSentiment = isNaN(avgSentiment0to5) ? 0 : avgSentiment0to5;

      console.log('Step4Report score calculations:', {
        totalResults,
        avgOverall0to5: safeAvgOverall,
        avgPresence0to1: safeAvgPresence,
        avgRelevance0to5: safeAvgRelevance,
        avgAccuracy0to5: safeAvgAccuracy,
        avgSentiment0to5: safeAvgSentiment
      });

      // Model grouping for llmResults
      const modelResults = results.reduce((acc, result) => {
        if (!acc[result.model]) {
          acc[result.model] = { results: [], totalConfidence: 0, totalResponses: 0 };
        }
        acc[result.model].results.push(result);
        acc[result.model].totalConfidence += (Number(result.scores.confidence) || 0);
        acc[result.model].totalResponses++;
        return acc;
      }, {} as Record<string, { results: AIQueryResultType[]; totalConfidence: number; totalResponses: number }>);

      const llmResults = Object.entries(modelResults).map(([model, data]) => ({
        model,
        avgConfidence: data.totalResponses ? Math.round(data.totalConfidence / data.totalResponses) : 0,
        responses: data.totalResponses,
        topSource: data.results[0]?.scores.sources?.[0] || 'AI Analysis'
      }));

      // Additional insights
      const allCompetitorUrls = results.flatMap(r => r.scores.competitorUrls || []);
      const competitorDomains = allCompetitorUrls.map(url => {
        try { return new URL(url).hostname; } catch { return ''; }
      }).filter(Boolean);
      const competitorFrequency = competitorDomains.reduce((acc, domain) => {
        acc[domain] = (acc[domain] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // New: aggregate detailed competitor mentions with context
      type CompetitorDetail = { domain: string; name: string; frequency: number; sampleContext: string; mentionType?: string };
      const allCompetitorMentions = results.flatMap(r => (r.scores.competitors?.mentions || []));
      const competitorDetailsMap = allCompetitorMentions.reduce((acc, mention) => {
        const key = mention.domain || mention.name;
        if (!key) return acc;
        if (!acc[key]) {
          acc[key] = {
            domain: mention.domain || mention.name,
            name: mention.name || mention.domain,
            frequency: 0,
            sampleContext: '',
            mentionType: mention.mentionType
          } as CompetitorDetail;
        }
        acc[key].frequency += 1;
        // Only set a sample context if it's meaningful and not the AI-declared placeholder
        if (!acc[key].sampleContext) {
          const ctx = String(mention.context || '').trim();
          if (ctx && ctx.toLowerCase() !== 'ai_declared') {
            acc[key].sampleContext = ctx;
          }
        }
        return acc;
      }, {} as Record<string, CompetitorDetail>);

      // Merge URL frequency (fallback) with detailed mentions (primary)
      Object.entries(competitorFrequency).forEach(([domain, freq]) => {
        if (!competitorDetailsMap[domain]) {
          competitorDetailsMap[domain] = {
            domain,
            name: domain.split('.')[0],
            frequency: freq,
            sampleContext: '',
            mentionType: 'url'
          } as CompetitorDetail;
        } else {
          // If exists, boost frequency by URL detections as well
          competitorDetailsMap[domain].frequency += freq;
        }
      });

      const topCompetitors = (Object.values(competitorDetailsMap) as CompetitorDetail[])
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5)
        .map((item: CompetitorDetail) => ({
          domain: item.domain,
          name: item.name,
          frequency: item.frequency,
          sampleContext: item.sampleContext,
          url: `https://${item.domain.replace(/^https?:\/\//, '')}`
        }));

      // Fallback: if no competitors found via mentions/urls, query backend competitors endpoint
      let finalTopCompetitors = topCompetitors;
      if (finalTopCompetitors.length === 0) {
        try {
          const token = localStorage.getItem('authToken');
          if (token) {
            const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/ai-queries/competitors/${domainId}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
              const compData = await resp.json();
              if (compData && Array.isArray(compData.topCompetitors)) {
                finalTopCompetitors = compData.topCompetitors.slice(0, 5).map((c: { name?: string; domain?: string; mentions?: number; contexts?: string[] }) => ({
                  domain: c.domain || c.name || '',
                  name: c.name || c.domain || '',
                  frequency: c.mentions || 0,
                  sampleContext: (c.contexts && c.contexts[0]) || '',
                  url: `https://${(c.domain || c.name || '').replace(/^https?:\/\//, '')}`
                }));
              }
            }
          }
        } catch (e) {
          // ignore fallback errors
        }
      }

      const modelInsights = Object.entries(modelResults).map(([model, data]) => {
        const avgScore05 = data.results.reduce((sum, r) => sum + (Number(r.scores.overall) || 0), 0) / data.results.length;
        const avgPresence01 = data.results.reduce((sum, r) => sum + (Number(r.scores.presence) || 0), 0) / data.results.length;
        
        // Safety checks for NaN values
        const safeAvgScore05 = isNaN(avgScore05) ? 0 : avgScore05;
        const safeAvgPresence01 = isNaN(avgPresence01) ? 0 : avgPresence01;
        
        let insight = '';
        if (safeAvgScore05 >= 4.0) insight = `${model} shows excellent performance with high recommendation scores.`;
        else if (safeAvgScore05 >= 3.0) insight = `${model} shows good performance with room for optimization.`;
        else insight = `${model} shows lower performance and needs targeted improvements.`;
        return {
          model,
          insight,
          avgScore: Math.round(safeAvgScore05 * 20),
          presenceRate: Math.round(safeAvgPresence01 * 100)
        };
      });

      // Extract unique keywords from results
      const keywordMap = new Map<string, { count: number; avgPresence: number }>();
      for (const r of results) {
        const kw = r.keyword || 'unknown';
        const existing = keywordMap.get(kw) || { count: 0, avgPresence: 0 };
        existing.count++;
        existing.avgPresence += Number(r.scores.presence) || 0;
        keywordMap.set(kw, existing);
      }
      const selectedKeywords = Array.from(keywordMap.entries()).map(([keyword, data], idx) => ({
        id: idx + 1,
        keyword,
        volume: 0,
        difficulty: data.avgPresence / data.count > 0.5 ? 'Low' : 'Medium',
        cpc: 0,
        isSelected: true,
      }));

      // Generate recommendations based on actual scores
      const recommendations: Array<{ priority: string; type: string; description: string; impact: string }> = [];
      const presenceRate = Math.round((safeAvgPresence || 0) * 100);
      const overallPct = Math.round((safeAvgOverall || 0) * 20);

      if (presenceRate < 30) {
        recommendations.push({
          priority: 'High',
          type: 'AI Visibility',
          description: `Your domain appears in only ${presenceRate}% of AI responses. Focus on creating authoritative, structured content that AI models can easily reference.`,
          impact: 'Could increase AI visibility by 40-60%'
        });
      }
      if (safeAvgSentiment < 3) {
        recommendations.push({
          priority: 'High',
          type: 'Brand Sentiment',
          description: 'AI models are not consistently portraying your brand positively. Ensure public reviews, case studies, and documentation reflect well on your offering.',
          impact: 'Improved sentiment leads to higher recommendation rates'
        });
      }
      if (finalTopCompetitors.length > 0) {
        const topComp = finalTopCompetitors[0];
        recommendations.push({
          priority: 'Medium',
          type: 'Competitive Positioning',
          description: `${topComp.domain || topComp.name} appears frequently in AI responses. Analyze their content strategy and create comparison content highlighting your advantages.`,
          impact: 'Differentiation can capture competitive mention share'
        });
      }
      if (overallPct < 60) {
        recommendations.push({
          priority: 'Medium',
          type: 'Content Optimization',
          description: 'Create FAQ-style and how-to content that directly answers the types of prompts AI models receive. Structure content with clear headings and concise answers.',
          impact: 'Structured content improves AI citation rates by 30-50%'
        });
      }
      if (recommendations.length === 0) {
        recommendations.push({
          priority: 'Low',
          type: 'Maintenance',
          description: 'Your AI visibility is strong. Continue publishing fresh, authoritative content and monitor competitor movements.',
          impact: 'Sustained visibility in AI-powered search'
        });
      }

      const reportDataComputed: ReportDataType = {
        domain: {
          id: domainId,
          url: domainUrl,
          context: 'AI analysis completed successfully with comprehensive insights',
          location: domainContext
        },
        selectedKeywords,
        intentPhrases: results.map(r => ({
          id: r.phrase,
          phrase: r.phrase,
          relevance: Math.round((Number(r.scores.relevance) || 0) * 20),
          trend: 'Rising',
          sources: r.scores.sources || [],
          parentKeyword: r.keyword
        })),
        llmResults,
        overallScore: Math.round((safeAvgOverall || 0) * 20),
        scoreBreakdown: {
          phrasePerformance: { weight: 40, score: Math.round((safeAvgRelevance || 0) * 20) },
          keywordOpportunity: { weight: 25, score: Math.round((safeAvgPresence || 0) * 100) },
          domainAuthority: { weight: 20, score: Math.round((safeAvgAccuracy || 0) * 20) },
          onPageOptimization: { weight: 10, score: Math.round((safeAvgSentiment || 0) * 20) },
          competitorGaps: { weight: 5, score: Math.round((safeAvgOverall || 0) * 20) }
        },
        recommendations,
        analysis: {
          semanticAnalysis: {},
          keywordAnalysis: {},
          searchVolumeClassification: {},
          intentClassification: {}
        }
      };

      const reportDataWithInsights: ReportDataType = {
        ...reportDataComputed,
        additionalInsights: {
          topCompetitors: finalTopCompetitors,
          modelInsights,
          totalQueries: totalResults,
          avgResponseTime: results.reduce((sum, r) => sum + (Number(r.latency) || 0), 0) / totalResults,
          totalCost: results.reduce((sum, r) => sum + (Number(r.cost) || 0), 0),
          sourceDistribution: results.flatMap(r => r.scores.sources || []).reduce((acc, source) => {
            acc[source] = (acc[source] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        },
        aiResults: results
      };

      setReportData(reportDataWithInsights);
    } catch (error) {
      console.error('Error generating report from AI results:', error);
      setError('Failed to generate report from AI results');
    }
  };

  const handleBackClick = async () => {
    setIsBackLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    onBack();
  };

  const handleDownloadReport = async () => {
    setIsLoading(true);
    
    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsLoading(false);
    alert('Report downloaded successfully!');
  };

  const handleDownloadPDF = () => {
    // Simulate PDF download
    alert('PDF report download started');
  };

  const handleDownloadCSV = () => {
    // Simulate CSV download
    alert('CSV data export started');
  };

  const handleScheduleReport = () => {
    alert('Report scheduling setup');
  };

  const handleSaveToDashboard = () => {
    alert('Report saved to dashboard');
    onComplete();
  };

  // Updated loading screen with Apple-style aesthetic
  if (isLoading || isGenerating) {
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
              {isGenerating ? 'AI Analysis in Progress' : 'Loading Analysis'}
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              {isGenerating 
                ? 'Our AI is analyzing your domain with enterprise models'
                : 'Retrieving your analysis results from secure storage'
              }
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
          {isGenerating && currentProgress > 0 && (
            <div className="w-full max-w-md mx-auto mb-8">
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gray-800 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${currentProgress}%` }}
                />
              </div>
              <div className="text-sm text-gray-600 mt-3 font-medium">
                {currentProgress.toFixed(0)}% complete
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center text-gray-600">
              <svg className="w-6 h-6 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-base font-medium">Your data is being securely processed and encrypted</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isBackLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-12">
            <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-gray-900 mb-3">
              Loading Analysis
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Retrieving your LLM analysis results from our secure servers
            </p>
          </div>

          {/* Apple-style Carousel */}
          <div className="relative h-24 mb-8 overflow-hidden">
            <div 
              className="flex transition-transform duration-1000 ease-out"
              style={{ transform: `translateX(-${currentLoadingIndex * 100}%)` }}
            >
              <div className="w-full flex-shrink-0 text-center">
                <h3 className="text-xl font-medium text-gray-900 mb-2 transition-opacity duration-700">
                  Connecting to Cloud Storage
                </h3>
                <p className="text-base text-gray-600 transition-opacity duration-700">
                  Establishing secure connection to our servers
                </p>
              </div>
              <div className="w-full flex-shrink-0 text-center">
                <h3 className="text-xl font-medium text-gray-900 mb-2 transition-opacity duration-700">
                  Retrieving Analysis Data
                </h3>
                <p className="text-base text-gray-600 transition-opacity duration-700">
                  Loading your saved analysis results
                </p>
              </div>
              <div className="w-full flex-shrink-0 text-center">
                <h3 className="text-xl font-medium text-gray-900 mb-2 transition-opacity duration-700">
                  Preparing Results
                </h3>
                <p className="text-base text-gray-600 transition-opacity duration-700">
                  Organizing your analysis data
                </p>
              </div>
            </div>
          </div>

          {/* Apple-style Progress Dots */}
          <div className="flex justify-center space-x-3 mb-8">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className={`w-3 h-3 rounded-full transition-all duration-700 ease-out ${
                  index === currentLoadingIndex
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
              <span className="text-base font-medium">AI analysis data secured with enterprise encryption</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-12">
            <div className="w-16 h-16 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-gray-900 mb-3">
              Analysis Issue
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              {error || 'Failed to load report data'}
            </p>
          </div>

          {/* Show timeout-specific guidance */}
          {error && error.includes('timeout') && (
            <div className="bg-yellow-50 rounded-2xl p-6 mb-8 border border-yellow-200">
              <div className="flex items-center text-yellow-800">
                <svg className="w-6 h-6 mr-3 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-base font-medium">
                  AI models are experiencing delays. Try with fewer phrases or retry the analysis.
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={onBack}
              className="px-6 py-3 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-2xl hover:border-gray-400 transition-all duration-300 font-medium"
            >
              Go Back
            </button>
            
            {/* Retry button for timeout errors */}
            {error && error.includes('timeout') && (
              <button
                onClick={() => {
                  setError(null);
                  setIsGenerating(false);
                  setIsLoading(false);
                  // Restart the analysis
                  window.location.reload();
                }}
                className="px-6 py-3 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-all duration-300 font-medium"
              >
                Retry Analysis
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const summaryData = [
    {
      category: 'Keywords',
      items: reportData.selectedKeywords.map((kw) => ({
        name: kw.keyword,
        volume: kw.volume,
        difficulty: kw.difficulty,
        opportunity: parseFloat(kw.difficulty) < 50 ? 'High' : parseFloat(kw.difficulty) < 70 ? 'Medium' : 'Low'
      }))
    },
    {
      category: 'Intent Phrases',
      items: reportData.intentPhrases.map((phrase) => ({
        name: phrase.phrase,
        relevance: phrase.relevance,
        trend: phrase.trend,
        sources: phrase.sources.join(', ')
      }))
    },
    {
      category: 'Model Performance',
      items: reportData.llmResults.map((result) => ({
        model: result.model,
        avgConfidence: result.avgConfidence,
        responses: result.responses,
        topSource: result.topSource
      }))
    }
  ];

  // Main report UI with white/black design
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        
        {/* Hero header */}
        <div className="bg-white rounded-3xl shadow-lg border-0 p-8 sm:p-12 backdrop-blur-sm bg-opacity-95 mb-8">
          <div className="text-center">
            {/* Logo */}
            <div className="mb-6">
              <img 
                src="https://www.blueoceanglobaltech.com/wp-content/uploads/2019/07/bogt-logo-min.png" 
                alt="Blue Ocean Global Technology Logo" 
                className="h-16 mx-auto"
              />
            </div>
            <h1 className="text-3xl font-light text-black mb-6 tracking-tight">
              Domain Analysis Report
            </h1>
            <p className="text-base text-gray-600 font-light mb-4">
              {reportData.domain.url}
            </p>
            <p className="text-sm text-gray-500 font-light">
              Generated {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Main score section */}
        <div className="bg-white rounded-3xl shadow-lg border-0 p-8 sm:p-12 backdrop-blur-sm bg-opacity-95 mb-8">
          <div className="text-center">
            <div className="text-6xl font-light text-black mb-6 tracking-tight">
              {reportData.overallScore}
            </div>
            <div className="text-xl text-gray-600 font-light mb-8 tracking-wide">
              Overall Score
            </div>
            
            {/* Score breakdown in cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
              {Object.entries(reportData.scoreBreakdown).map(([key, item]) => (
                <div key={key} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                  <div className="text-2xl font-light text-black mb-3">{item.score}</div>
                  <div className="text-sm text-gray-600 font-light leading-relaxed mb-4">
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div
                      className={`h-1 rounded-full transition-all duration-2000 ${
                        item.score >= 80 ? 'bg-green-500' : 
                        item.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stats section */}
        {stats && (
          <div className="bg-white rounded-3xl shadow-lg border-0 p-8 sm:p-12 backdrop-blur-sm bg-opacity-95 mb-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-light text-black mb-4 tracking-tight">
                Analysis Results
              </h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center p-6 bg-gray-50 rounded-2xl">
                <div className="text-3xl font-light text-black mb-2">
                  {stats.totalResults}
                </div>
                <div className="text-sm text-gray-600 font-light">Total Queries</div>
              </div>
              <div className="text-center p-6 bg-gray-50 rounded-2xl">
                <div className="text-3xl font-light text-green-600 mb-2">
                  {stats.overall?.avgOverall || 0}%
                </div>
                <div className="text-sm text-gray-600 font-light">Average Score</div>
              </div>
              <div className="text-center p-6 bg-gray-50 rounded-2xl">
                <div className="text-3xl font-light text-blue-600 mb-2">
                  {stats.overall?.presenceRate || 0}%
                </div>
                <div className="text-sm text-gray-600 font-light">Domain Presence</div>
              </div>
              <div className="text-center p-6 bg-gray-50 rounded-2xl">
                <div className="text-3xl font-light text-purple-600 mb-2">
                  {stats.overall?.avgDomainRank ? `#${stats.overall.avgDomainRank}` : '—'}
                </div>
                <div className="text-sm text-gray-600 font-light">Avg Domain Rank</div>
              </div>
            </div>
          </div>
        )}

        {/* Insights section */}
        {reportData?.additionalInsights && (
          <div className="bg-white rounded-3xl shadow-lg border-0 p-8 sm:p-12 backdrop-blur-sm bg-opacity-95 mb-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-light text-black mb-4 tracking-tight">
                Insights
              </h2>
            </div>
            <div className="grid lg:grid-cols-2 gap-8">
              
              {/* Competitors */}
              <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
                <h3 className="text-xl font-light text-black mb-6">Top Competitors</h3>
                <div className="space-y-4">
                  {reportData.additionalInsights.topCompetitors.slice(0, 3).map((competitor, idx) => (
                    <div key={idx} className="flex items-start justify-between py-3 border-b border-gray-200 last:border-b-0">
                      <div className="flex items-start space-x-3">
                        <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center mt-0.5">
                          <span className="text-sm font-medium text-gray-700">{idx + 1}</span>
                        </div>
                        <div>
                          <div className="text-black font-light flex items-center gap-2">
                            <a href={competitor.url} target="_blank" rel="noreferrer" className="hover:underline">{competitor.domain}</a>
                            {idx === 0 && (
                              <span className="px-2 py-0.5 text-[10px] rounded-full bg-green-100 text-green-800 border border-green-200">Top</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 break-words">
                            {competitor.url}
                          </div>
                          {competitor.sampleContext && (
                            <div className="text-sm text-gray-600 mt-2 line-clamp-2">
                              “{competitor.sampleContext}”
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600">{competitor.frequency} mentions</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Model Performance */}
              <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
                <h3 className="text-xl font-light text-black mb-6">Model Performance</h3>
                <div className="space-y-4">
                  {reportData.additionalInsights.modelInsights.map((insight, idx) => (
                    <div key={idx} className="py-3 border-b border-gray-200 last:border-b-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-black font-light">{insight.model}</span>
                        <span className="text-sm text-gray-600">{insight.avgScore}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 mb-2">
                        <div 
                          className={`h-1 rounded-full transition-all duration-2000 ${
                            insight.avgScore >= 80 ? 'bg-green-500' : 
                            insight.avgScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${insight.avgScore}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-600 font-light leading-relaxed">{insight.insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Results expandable section */}
        {aiResults.length > 0 && (
          <div className="bg-white rounded-3xl shadow-lg border-0 p-8 sm:p-12 backdrop-blur-sm bg-opacity-95 mb-8">
            <div className="max-w-6xl mx-auto">
              <details className="group">
                <summary className="cursor-pointer list-none">
                  <div className="bg-gray-50 rounded-2xl p-6 hover:bg-gray-100 transition-all duration-300 border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-light text-black mb-2">
                          Detailed AI Responses
                        </h3>
                        <p className="text-gray-600 font-light">
                          {aiResults.length} individual AI model responses and scoring details
                        </p>
                      </div>
                      <div className="transform transition-transform group-open:rotate-180">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </summary>
                
                <div className="mt-6 space-y-4">
                  {aiResults.slice(0, 5).map((result, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <span className="text-base font-light text-black">{result.model}</span>
                          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full font-light">
                            Score: {Math.round((Number(result.scores.overall) || 0) * 20)}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full font-light ${Number(result.scores.presence) === 1 ? 'bg-green-100 text-green-800' : Number(result.scores.presence) > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                            {Number(result.scores.presence) === 1 ? 
                              (result.scores.detectionMethod === 'url_mention' ? 'URL Found' :
                               result.scores.detectionMethod === 'text_mention' ? 'Text Found' :
                               result.scores.detectionMethod === 'brand_name' ? 'Brand Found' :
                               result.scores.detectionMethod === 'partial_match' ? 'Partial Match' :
                               'Featured') : 
                              Number(result.scores.presence) > 0 ? 'Mentioned' : 'Not Found'}
                          </span>
                          {result.scores.domainRank && result.scores.domainRank > 0 && (
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full font-light">Rank #{result.scores.domainRank}</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 font-light">
                          {Math.round(Number(result.latency) * 1000)}ms
                        </span>
                      </div>
                      <p className="text-gray-700 font-light mb-4 leading-relaxed">
                        {result.phrase}
                      </p>
                      {/* AI Response (Markdown) */}
                      {result.response && (
                        <div className="mt-4">
                          <h4 className="text-base font-light text-black mb-3">AI Response:</h4>
                          <div className="prose prose-sm max-w-none bg-white p-4 rounded-xl border border-gray-100">
                            <ReactMarkdown>{result.response}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                      {/* Competitor badges */}
                      {result.scores.competitors && result.scores.competitors.mentions && result.scores.competitors.mentions.length > 0 && (
                        <div className="mb-4">
                          <div className="flex flex-wrap gap-2">
                            {result.scores.competitors.mentions.slice(0, 8).map((m, mIdx) => (
                              <span key={mIdx} className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full border border-gray-200">
                                {m.domain || m.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                       {/* Scoring grid */}
                       <div className="grid grid-cols-2 gap-3">
                         <div className="text-center p-3 bg-white rounded-xl border border-gray-100">
                           <div className="text-base font-light text-black">{(Number(result.scores.presence) * 100).toFixed(0)}%</div>
                           <div className="text-xs text-gray-500 mt-1">Presence</div>
                         </div>
                         <div className="text-center p-3 bg-white rounded-xl border border-gray-100">
                           <div className="text-base font-light text-black">{(Number(result.scores.sentiment) * 20).toFixed(0)}%</div>
                           <div className="text-xs text-gray-500 mt-1">Sentiment</div>
                         </div>

                       </div>

                       {/* Domain Analysis */}
                       {result.scores.domainRank && result.scores.domainRank > 0 && (
                         <div>
                           <h4 className="text-base font-light text-black mb-3">Domain Ranking:</h4>
                           <div className="text-sm text-green-700 bg-green-50 px-4 py-3 rounded-xl font-light border border-green-100">
                             Your domain ranked #{result.scores.domainRank} in this AI response
                           </div>
                         </div>
                       )}

                       {/* Enhanced Domain Detection Info */}
                       {result.scores.highlightContext && (
                         <div>
                           <h4 className="text-base font-light text-black mb-3">Domain Detection Analysis:</h4>
                           <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
                             <div className="flex items-center justify-between mb-3">
                               <span className="text-sm font-medium text-gray-900">
                                 Detection Method: {result.scores.detectionMethod || 'Unknown'}
                               </span>
                               <span className="px-2.5 py-1 text-xs rounded-full font-light bg-gray-100 text-gray-800 border border-gray-200">
                                 {result.scores.detectionMethod === 'url_mention' ? 'URL Found' :
                                  result.scores.detectionMethod === 'text_mention' ? 'Text Mention' :
                                  result.scores.detectionMethod === 'brand_name' ? 'Brand Name' :
                                  result.scores.detectionMethod === 'partial_match' ? 'Partial Match' :
                                  'Unknown'}
                               </span>
                             </div>
                             <div className="text-sm text-gray-800 bg-white p-4 rounded-xl border border-gray-200">
                               <strong className="font-medium text-gray-900">Context Found</strong>
                               <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                 <div className="prose prose-sm max-w-none text-gray-800">
                                   <ReactMarkdown>{result.scores.highlightContext}</ReactMarkdown>
                                 </div>
                               </div>
                             </div>
                             
                             {/* Show ranking factors if available */}
                             {result.scores.rankingFactors && (
                               <div className="mt-3 grid grid-cols-2 gap-2">
                                 <div className="text-xs text-blue-600">
                                   <span>Position Score: {result.scores.rankingFactors.position || 0}%</span>
                                 </div>
                                 <div className="text-xs text-blue-600">
                                   <span>Prominence: {result.scores.rankingFactors.prominence || 0}%</span>
                                 </div>
                                 <div className="text-xs text-blue-600">
                                   <span>Context Quality: {result.scores.rankingFactors.contextQuality || 0}%</span>
                                 </div>
                                 <div className="text-xs text-blue-600">
                                   <span>Mention Type: {result.scores.rankingFactors.mentionType || 0}%</span>
                                 </div>
                               </div>
                             )}
                             
                             {result.scores.mentions && result.scores.mentions > 1 && (
                               <div className="text-xs text-blue-600 mt-2">
                                 Mentioned {result.scores.mentions} times in this response
                               </div>
                             )}
                           </div>
                         </div>
                       )}

                       {/* Performance Metrics */}
                       <div>
                         <h4 className="text-base font-light text-black mb-3">Performance Metrics:</h4>
                         <div className="grid grid-cols-2 gap-3">
                           <div className="text-center p-3 bg-white rounded-xl border border-gray-100">
                             <div className="text-base font-light text-black">{Math.round(Number(result.latency) * 1000)}ms</div>
                             <div className="text-xs text-gray-500 mt-1">Response Time</div>
                           </div>
                           <div className="text-center p-3 bg-white rounded-xl border border-gray-100">
                             <div className="text-base font-light text-black">${Number(result.cost).toFixed(4)}</div>
                             <div className="text-xs text-gray-500 mt-1">Cost</div>
                           </div>
                         </div>
                       </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-white rounded-3xl shadow-lg border-0 p-6 sm:p-8 backdrop-blur-sm bg-opacity-95">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <button
              onClick={handleBackClick}
              className="text-gray-600 hover:text-gray-900 font-light text-base transition-colors duration-300"
            >
              ← Back to Results
            </button>
            
            <div className="flex items-center space-x-4">
              <PDFDownloadLink
                document={reportData ? <ReportPDF reportData={reportData} /> : undefined}
                fileName={`domain_analysis_${reportData?.domain?.url?.replace(/https?:\/\//, '').replace(/\W+/g, '_') || 'report'}.pdf`}
              >
                {({ loading }) => (
                  <span className="px-6 py-3 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-2xl hover:border-gray-400 transition-all duration-300 font-light cursor-pointer">
                    {loading ? 'Preparing PDF…' : 'Export PDF'}
                  </span>
                )}
              </PDFDownloadLink>
              <button
                onClick={onComplete}
                className="px-8 py-3 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-all duration-300 font-medium"
              >
                Complete Analysis
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Add this new component for AI Results Dropdown
interface AIResultsDropdownProps {
  results: AIQueryResultType[];
}

function AIResultsDropdown({ results }: AIResultsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<AIQueryResultType | null>(null);

  return (
    <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 text-left hover:bg-gray-100 transition-all duration-300 flex items-center justify-between"
      >
        <div>
          <h3 className="text-xl font-light text-black mb-2">
            View Detailed AI Responses ({results.length} results)
          </h3>
          <p className="text-gray-600 font-light">
            Individual AI model responses and scoring details
          </p>
        </div>
        <div className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      
      {isOpen && (
        <div className="border-t border-gray-200 bg-white">
          <div className="p-6 space-y-4">
            {/* Results List */}
            <div className="grid gap-4">
              {results.map((result, idx) => (
                <div 
                  key={idx}
                  className="p-4 bg-gray-50 border border-gray-100 rounded-2xl hover:border-gray-200 cursor-pointer transition-all duration-300"
                  onClick={() => setSelectedResult(selectedResult?.phrase === result.phrase && selectedResult?.model === result.model ? null : result)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <span className="text-base font-light text-black">
                        {result.model}
                      </span>
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full font-light">
                        Score: {result.scores.overall.toFixed(1)}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-full font-light ${Number(result.scores.presence) === 1 ? 'bg-green-100 text-green-800' : Number(result.scores.presence) > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                        {Number(result.scores.presence) === 1 ? 
                          (result.scores.detectionMethod === 'url_mention' ? 'URL Found' :
                           result.scores.detectionMethod === 'text_mention' ? 'Text Found' :
                           result.scores.detectionMethod === 'brand_name' ? 'Brand Found' :
                           result.scores.detectionMethod === 'partial_match' ? 'Partial Match' :
                           'Featured') : 
                          Number(result.scores.presence) > 0 ? 'Mentioned' : 'Not Found'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 font-light">
                      {result.latency}ms
                    </span>
                  </div>
                  <p className="text-gray-700 font-light leading-relaxed">
                    {result.phrase}
                  </p>
                  
                  {selectedResult?.phrase === result.phrase && selectedResult?.model === result.model && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                      {/* Response with Markdown */}
                      <div>
                        <h4 className="text-base font-light text-black mb-3">AI Response:</h4>
                        <div className="prose prose-sm max-w-none bg-white p-4 rounded-xl border border-gray-100">
                          <ReactMarkdown>{result.response}</ReactMarkdown>
                        </div>
                      </div>
                      
                      {/* Detailed Scores */}
                      <div>
                        <h4 className="text-base font-light text-black mb-3">Scoring Breakdown:</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="text-center p-3 bg-white rounded-xl border border-gray-100">
                            <div className="text-base font-light text-black">{(Number(result.scores.presence) * 100).toFixed(0)}%</div>
                            <div className="text-xs text-gray-500 mt-1">Presence</div>
                          </div>
                          <div className="text-center p-3 bg-white rounded-xl border border-gray-100">
                            <div className="text-base font-light text-black">{(Number(result.scores.sentiment) * 20).toFixed(0)}%</div>
                            <div className="text-xs text-gray-500 mt-1">Sentiment</div>
                          </div>

                        </div>
                      </div>
                      
                      {/* Real Citations from LLM Web Search */}
                      {result.citations && result.citations.length > 0 ? (
                        <div>
                          <h4 className="text-base font-light text-black mb-3">
                            Sources ({result.citations.length})
                          </h4>
                          <div className="space-y-2">
                            {result.citations.map((citation, citIdx) => (
                              <a
                                key={citIdx}
                                href={citation.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group"
                              >
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center mt-0.5">
                                  {citIdx + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-blue-700 group-hover:text-blue-800 truncate">
                                    {citation.title || new URL(citation.url).hostname}
                                  </div>
                                  <div className="text-xs text-gray-400 truncate mt-0.5">
                                    {citation.url}
                                  </div>
                                  {citation.citedText && (
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                                      "{citation.citedText}"
                                    </p>
                                  )}
                                  {citation.confidenceScore !== undefined && citation.confidenceScore !== null && (
                                    <div className="mt-1">
                                      <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full">
                                        {(citation.confidenceScore * 100).toFixed(0)}% confidence
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </a>
                            ))}
                          </div>
                          {result.searchQueries && result.searchQueries.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              <span className="text-xs text-gray-400">Searched:</span>
                              {result.searchQueries.map((q, qIdx) => (
                                <span key={qIdx} className="text-xs px-2 py-0.5 bg-gray-50 text-gray-500 rounded-full border border-gray-100">
                                  {q}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : result.scores.sources && result.scores.sources.length > 0 ? (
                        <div>
                          <h4 className="text-base font-light text-black mb-3">Sources:</h4>
                          <div className="flex flex-wrap gap-2">
                            {result.scores.sources.map((source, srcIdx) => (
                              <div key={srcIdx} className="text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-full font-light border border-blue-100">
                                {source}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      
                      {/* Competitor Data */}
                      {result.scores.competitorUrls && result.scores.competitorUrls.length > 0 && (
                        <div>
                          <h4 className="text-base font-light text-black mb-3">Competitor Analysis:</h4>
                          <div className="space-y-2">
                            {result.scores.competitorUrls.map((url, urlIdx) => (
                              <div key={urlIdx} className="flex items-center justify-between text-sm bg-white px-3 py-2 rounded-xl border border-gray-100">
                                <span className="text-gray-600 truncate font-light">{url}</span>
                                <span className="text-gray-500 ml-3 font-light">Competitor</span>
                              </div>
                            ))}
                          </div>
                          <div className="text-sm text-gray-500 mt-2 font-light">
                            Match Score: {result.scores.competitorMatchScore?.toFixed(1) || 'N/A'}
                          </div>
                        </div>
                      )}

                      {/* Enhanced Competitor Mentions */}
                      {result.scores.competitors && result.scores.competitors.mentions && result.scores.competitors.mentions.length > 0 && (
                        <div>
                          <h4 className="text-base font-light text-black mb-3">Competitor Mentions:</h4>
                          <div className="space-y-2">
                            {result.scores.competitors.mentions.map((mention, mentionIdx) => (
                              <div key={mentionIdx} className="bg-white p-3 rounded-xl border border-gray-100">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-black">{mention.name}</span>
                                  <div className="flex space-x-2">
                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                      mention.sentiment === 'positive' ? 'bg-green-100 text-green-800' :
                                      mention.sentiment === 'negative' ? 'bg-red-100 text-red-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {mention.sentiment}
                                    </span>
                                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                                      {mention.mentionType}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-sm text-gray-600 mb-2">"{mention.context}"</p>
                                <div className="text-xs text-gray-500">
                                  Position: {mention.position}% | Domain: {mention.domain}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Domain Rank */}
                      {result.scores.domainRank && result.scores.domainRank > 0 && (
                        <div>
                          <h4 className="text-base font-light text-black mb-3">Domain Ranking:</h4>
                          <div className="text-sm text-green-700 bg-green-50 px-4 py-3 rounded-xl font-light border border-green-100">
                            Your domain ranked #{result.scores.domainRank} in this AI response
                          </div>
                        </div>
                      )}

                      {/* Enhanced Domain Detection Info */}
                      {result.scores.highlightContext && (
                        <div>
                          <h4 className="text-base font-light text-black mb-3">Domain Detection Analysis:</h4>
                          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-medium text-gray-900">
                                Detection Method: {result.scores.detectionMethod || 'Unknown'}
                              </span>
                              <span className="px-2.5 py-1 text-xs rounded-full font-light bg-gray-100 text-gray-800 border border-gray-200">
                                {result.scores.detectionMethod === 'url_mention' ? 'URL Found' :
                                 result.scores.detectionMethod === 'text_mention' ? 'Text Mention' :
                                 result.scores.detectionMethod === 'brand_name' ? 'Brand Name' :
                                 result.scores.detectionMethod === 'partial_match' ? 'Partial Match' :
                                 'Unknown'}
                              </span>
                            </div>
                            <div className="text-sm text-gray-800 bg-white p-4 rounded-xl border border-gray-200">
                              <strong className="font-medium text-gray-900">Context Found</strong>
                              <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="prose prose-sm max-w-none text-gray-800">
                                  <ReactMarkdown>{result.scores.highlightContext}</ReactMarkdown>
                                </div>
                              </div>
                            </div>
                            
                            {/* Show ranking factors if available */}
                            {result.scores.rankingFactors && (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <div className="text-xs text-blue-600">
                                  <span>Position Score: {result.scores.rankingFactors.position || 0}%</span>
                                </div>
                                <div className="text-xs text-blue-600">
                                  <span>Prominence: {result.scores.rankingFactors.prominence || 0}%</span>
                                </div>
                                <div className="text-xs text-blue-600">
                                  <span>Context Quality: {result.scores.rankingFactors.contextQuality || 0}%</span>
                                </div>
                                <div className="text-xs text-blue-600">
                                  <span>Mention Type: {result.scores.rankingFactors.mentionType || 0}%</span>
                                </div>
                              </div>
                            )}
                            
                            {result.scores.mentions && result.scores.mentions > 1 && (
                              <div className="text-xs text-blue-600 mt-2">
                                Mentioned {result.scores.mentions} times in this response
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Performance Metrics */}
                      <div>
                        <h4 className="text-base font-light text-black mb-3">Performance Metrics:</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="text-center p-3 bg-white rounded-xl border border-gray-100">
                            <div className="text-base font-light text-black">{Math.round(Number(result.latency) * 1000)}ms</div>
                            <div className="text-xs text-gray-500 mt-1">Response Time</div>
                          </div>
                          <div className="text-center p-3 bg-white rounded-xl border border-gray-100">
                            <div className="text-base font-light text-black">${Number(result.cost).toFixed(4)}</div>
                            <div className="text-xs text-gray-500 mt-1">Cost</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 