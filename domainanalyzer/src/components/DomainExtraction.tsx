'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Globe, Brain, FileText, AlertCircle, Loader2, ChevronDown, ChevronUp, ExternalLink, ArrowRight, Search, Users, TrendingUp, Target, Plus, X, Grid3X3, List, ArrowUpDown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { maskDomainId } from '@/lib/domainUtils';

const additionalStyles = `
  .border-3 {
    border-width: 3px;
  }
  .backdrop-blur-sm {
    backdrop-filter: blur(4px);
  }
`;

interface DomainExtractionProps {
  domain: string;
  subdomains?: string[];
  setDomainId: (id: number) => void;
  domainId: number;
  setBrandContext: (context: string) => void;
  onNext: () => void;
  onPrev: () => void;
  customPaths?: string[];
  priorityUrls?: string[];
  priorityPaths?: string[];
  location?: string;
  embedded?: boolean;
}

interface Keyword {
  id: string;
  keyword: string;
  intent: string;
  volume: number;
  kd: number;
  competition: string;
  cpc: number;
  organic: number;
  paid: number;
  trend: string;
  position: number;
  url: string;
  updated: string;
  isCustom?: boolean;
  selected?: boolean;
}

interface ApiKeyword {
  id: number;
  term: string;
  volume: number;
  difficulty: string;
  cpc: number;
  domainId: number;
  isSelected: boolean;
  createdAt: string;
  updatedAt: string;
  isCustom?: boolean;
}

interface LoadingTask {
  name: string;
  status: 'pending' | 'running' | 'completed';
  progress: number;
  description: string;
}

const DomainExtraction: React.FC<DomainExtractionProps> = ({ 
  domain, 
  subdomains = [],
  setDomainId,
  domainId,
  setBrandContext, 
  onNext, 
  onPrev,
  customPaths,
  priorityUrls,
  priorityPaths,
  location,
  embedded
}) => {

  const [isLoading, setIsLoading] = useState(false); // Start as false, will be set to true only if analysis is needed
  const [isCheckingData, setIsCheckingData] = useState(domainId === 0); // Only check data if no domainId provided
  const [isBackLoading, setIsBackLoading] = useState(false);
  const [customKeywordsLoading, setCustomKeywordsLoading] = useState(false);
  const [customKeywordsProcessed, setCustomKeywordsProcessed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedContext, setExtractedContext] = useState('');
  const [responseTime, setResponseTime] = useState(0);
  const startTimeRef = useRef(Date.now());
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = additionalStyles;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Simplified loading tasks - only domain extraction and keyword generation
  const [loadingTasks, setLoadingTasks] = useState<LoadingTask[]>([
    { name: 'Domain Discovery & Crawling', status: 'pending', progress: 0, description: 'Scanning website structure and extracting content' },
    { name: 'Enhanced AI Keyword Generation', status: 'pending', progress: 0, description: 'Generating keywords using advanced AI with location context' }
  ]);

  // Keyword management (Step2Analysis-style)
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [autoRedirectAttempted, setAutoRedirectAttempted] = useState(false);
  const [isNewAnalysisRun, setIsNewAnalysisRun] = useState(false);
  const [filters, setFilters] = useState({
    competition: '',
    intent: '',
    volume: '',
    trends: '',
    date: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [showColumns, setShowColumns] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    keyword: true,
    intent: true,
    volume: true,
    kd: true,
    competition: true,
    cpc: true,
    organic: true,
    paid: true,
    trend: true,
    position: true,
    url: true,
    updated: true
  });

  const [showAddKeyword, setShowAddKeyword] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [isAddingKeyword, setIsAddingKeyword] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  // Pagination for keyword grid
  const [page, setPage] = useState(1);
  const pageSize = 24; // show 24 cards per page

  // View mode and sorting state
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Keyword;
    direction: 'asc' | 'desc';
  } | null>(null);

  // Pagination state for table view
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Carousel control state
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [currentLoadingIndex, setCurrentLoadingIndex] = useState(0);
  const [currentTableLoadingIndex, setCurrentTableLoadingIndex] = useState(0);
  const finalizeAndRedirect = useCallback(async () => {
    if (domainId <= 0) {
      return;
    }

    setAutoRedirectAttempted(true);
    setIsLoading(true);

    const token = localStorage.getItem('authToken');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let keywordIds: string[] = [];

      const preselected = keywords.filter(kw => kw.selected);
      if (preselected.length > 0) {
        keywordIds = preselected.map(kw => kw.id);
      } else if (keywords.length > 0) {
        const sortedKeywords = [...keywords].sort((a, b) => {
          const volA = typeof a.volume === 'number' ? a.volume : 0;
          const volB = typeof b.volume === 'number' ? b.volume : 0;
          return volB - volA;
        });
        keywordIds = sortedKeywords.slice(0, Math.min(5, sortedKeywords.length)).map(kw => kw.id);
      }

      if (keywordIds.length > 0) {
        setSelectedKeywords(keywordIds);
        const selectResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/${domainId}/select`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ keywordIds, selected: true }),
        });

        if (!selectResponse.ok) {
          throw new Error('Failed to save keyword selections');
        }
      }

      const stepResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/domain/${domainId}/current-step`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ currentStep: 2 }),
      });

      if (!stepResponse.ok) {
        throw new Error('Failed to update onboarding progress');
      }

      const masked = maskDomainId(domainId);
      navigate(`/new-dashboard/${masked}`, { replace: true });
    } catch (error) {
      console.error('Failed to finalize onboarding automatically:', error);
      toast({
        title: 'Automatic redirect unavailable',
        description: 'Keywords were generated, but we could not continue automatically. Review them below and continue when ready.',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  }, [domainId, keywords, navigate, toast]);

  useEffect(() => {
    // Only redirect if analysis completed, we have keywords, and haven't redirected yet
    if (analysisComplete && !autoRedirectAttempted && domainId > 0 && keywords.length > 0) {
      finalizeAndRedirect();
    }
  }, [analysisComplete, autoRedirectAttempted, domainId, keywords.length, finalizeAndRedirect]);

  const [showDebug, setShowDebug] = useState(false);

  // Replace global pagination with per-competition "Show more"
  const initialShowCount = 8;
  const [showCountByCompetition, setShowCountByCompetition] = useState<Record<string, number>>({
    Low: initialShowCount,
    Medium: initialShowCount,
    High: initialShowCount,
  });


  // Helper functions to check for existing data at each phase
  const checkExistingData = async (domainId: number) => {
    const existingData = {
      domainExtraction: false,
      keywords: false,
      keywordsCount: 0
    };

    try {
      // Check for existing keywords
      const keywordsResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/${domainId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (keywordsResponse.ok) {
        const keywordsData = await keywordsResponse.json();
        if (keywordsData.keywords && keywordsData.keywords.length > 0) {
          existingData.keywords = true;
          existingData.keywordsCount = keywordsData.keywords.length;
        }
      }

      // Check for domain extraction data by looking at the domain table and analysis phases
      const domainResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/domain/${domainId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (domainResponse.ok) {
        const domainData = await domainResponse.json();
        
        // Check if domain has been processed (has context, location, etc.)
        if (domainData.domain && (domainData.domain.context || domainData.domain.location || domainData.domain.processedAt)) {
          existingData.domainExtraction = true;
          console.log('Domain extraction detected via domain context/location/processedAt');
        }
        
        // Check analysis phases to see if domain_extraction is completed
        if (domainData.analysisPhases && Array.isArray(domainData.analysisPhases)) {
          const domainExtractionPhase = domainData.analysisPhases.find((phase: { phase: string; status: string }) => 
            phase.phase === 'domain_extraction' && phase.status === 'completed'
          );
          if (domainExtractionPhase) {
            existingData.domainExtraction = true;
            console.log('Domain extraction detected via analysis phase');
          }
          
          const keywordGenerationPhase = domainData.analysisPhases.find((phase: { phase: string; status: string }) => 
            phase.phase === 'keyword_generation' && phase.status === 'completed'
          );
          if (keywordGenerationPhase) {
            existingData.keywords = true;
            console.log('Keywords detected via analysis phase');
          }
        }
        
        // Check if there are crawl results (indicates domain extraction was done)
        if (domainData.crawlResults && domainData.crawlResults.length > 0) {
          existingData.domainExtraction = true;
          console.log('Domain extraction detected via crawl results');
        }
        
        // Check if there are semantic analyses (indicates domain extraction was done)
        if (domainData.semanticAnalyses && domainData.semanticAnalyses.length > 0) {
          existingData.domainExtraction = true;
          console.log('Domain extraction detected via semantic analyses');
        }
      }

      // If we have keywords but no domain extraction data, assume domain extraction is complete
      // (since keywords can't be generated without domain extraction)
      if (existingData.keywords && !existingData.domainExtraction) {
        existingData.domainExtraction = true;
      }

    } catch (error) {
      console.error('Error checking existing data:', error);
    }

    console.log('Existing data check result for domain', domainId, ':', existingData);
    return existingData;
  };

  const loadExistingKeywords = async (domainId: number) => {
    console.log('Loading existing keywords for domain:', domainId);
    try {
      const keywordsResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/${domainId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      console.log('Keywords response status:', keywordsResponse.status);

      if (keywordsResponse.ok) {
        const keywordsData = await keywordsResponse.json();
        console.log('Keywords data:', keywordsData);
        
        if (keywordsData.keywords && keywordsData.keywords.length > 0) {
          console.log('Found', keywordsData.keywords.length, 'keywords');
          // Determine custom keywords list from localStorage (Advanced Options)
          const lsCustom = (localStorage.getItem('customKeywords') || '')
            .split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
          const lsAdvanced = (localStorage.getItem('advancedKeywords') || '')
            .split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
          const customSet = new Set([...lsCustom, ...lsAdvanced]);

          // Convert API keywords to the format expected by the component
          const realKeywords: Keyword[] = keywordsData.keywords.map((kw: ApiKeyword, index: number) => ({
            id: kw.id.toString(),
            keyword: kw.term,
            intent: determineIntent(kw.term), // Determine intent based on keyword content
            volume: kw.volume,
            kd: parseInt(kw.difficulty) || 50, // Use difficulty as KD score
            competition: kw.difficulty === 'High' ? 'High' : kw.difficulty === 'Low' ? 'Low' : 'Medium',
            cpc: kw.cpc,
            organic: Math.floor(kw.volume * 0.1), // Estimate organic traffic based on volume
            paid: Math.floor(kw.volume * 0.05), // Estimate paid traffic based on volume
            trend: 'Stable', // Default trend (no random data)
            position: 0, // No position data from Google API
            url: `https://${domain}/${kw.term.toLowerCase().replace(/\s+/g, '-')}`,
            updated: new Date().toISOString().split('T')[0],
            selected: kw.isSelected || false,
            isCustom: kw.isCustom === true || customSet.has(kw.term.toLowerCase())
          }));

          setKeywords(realKeywords);
          
          // Mark all loading tasks as completed since we're loading existing data
          setLoadingTasks(prev => prev.map(task => ({
            ...task,
            status: 'completed',
            progress: 100
          })));
          
          setIsLoading(false);
          setIsCheckingData(false);
          setResponseTime(Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)));
          
          toast({
            title: "Keywords Loaded",
            description: `Loaded ${realKeywords.length} existing keywords for ${domain}`,
          });
          
          // After loading existing keywords, process any advanced keywords from DomainSubmission
          await processAdvancedKeywordsFromStorage(domainId);
          // Don't set analysisComplete here - this is just loading existing data, not a new analysis
          
          return true;
        } else {
          // No existing keywords found, but still process advanced keywords if any
          console.log('No existing keywords found, checking for advanced keywords from DomainSubmission');
          await processAdvancedKeywordsFromStorage(domainId);
          
          // Set empty keywords array
          setKeywords([]);
          
          // Mark all loading tasks as completed
          setLoadingTasks(prev => prev.map(task => ({
            ...task,
            status: 'completed',
            progress: 100
          })));
          
          setIsLoading(false);
          setIsCheckingData(false);
          setResponseTime(Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)));
          
          toast({
            title: "No Keywords Found",
            description: `No existing keywords found for ${domain}. Advanced keywords from DomainSubmission will be processed.`,
          });
          
          // Don't set analysisComplete here - this is just loading existing data, not a new analysis
          return true;
        }
      }
    } catch (error) {
      console.error('Error loading existing keywords:', error);
    }
    return false;
  };

  // Helper function to process advanced keywords from localStorage
  const processAdvancedKeywordsFromStorage = async (domainId: number) => {
    const savedAdvancedKeywords = localStorage.getItem('advancedKeywords');
    if (savedAdvancedKeywords && domainId > 0) {
      const advancedKeywordsList = savedAdvancedKeywords.split(',').map(k => k.trim()).filter(k => k);
      
      console.log(`Processing ${advancedKeywordsList.length} advanced keywords from DomainSubmission`);
      
      for (const keyword of advancedKeywordsList) {
        try {
          // Check if keyword already exists (case-insensitive)
          const exists = keywords.some(kw => normalizeTerm(kw.keyword) === normalizeTerm(keyword));
          if (exists) {
            console.log(`Advanced keyword "${keyword}" already exists, skipping...`);
            toast({
              title: "Duplicate Keyword Skipped",
              description: `"${keyword}" is already in your list`,
            });
            continue;
          }

          // Analyze the advanced keyword using AI
          const analyzeResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/analyze`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
              keyword: keyword,
              domain: domain,
              location: location || 'Global',
              domainId: domainId
            })
          });

          if (!analyzeResponse.ok) {
            console.error(`Failed to analyze advanced keyword "${keyword}"`);
            continue;
          }

          const analysisResult = await analyzeResponse.json();
          
          if (!analysisResult.success) {
            console.error(`Analysis failed for advanced keyword "${keyword}":`, analysisResult.error);
            continue;
          }

          // Save the analyzed keyword to the database
          const saveResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/${domainId}/custom`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
              keyword: analysisResult.keyword,
              volume: analysisResult.volume,
              kd: analysisResult.kd,
              competition: analysisResult.competition,
              cpc: analysisResult.cpc,
              intent: analysisResult.intent,
              organic: analysisResult.organic,
              paid: analysisResult.paid,
              trend: analysisResult.trend,
              position: analysisResult.position,
              url: analysisResult.url,
              analysis: analysisResult.analysis
            })
          });

          if (!saveResponse.ok) {
            console.error(`Failed to save advanced keyword "${keyword}"`);
            continue;
          }

          const saveResult = await saveResponse.json();
          
          if (!saveResult.success) {
            console.error(`Save failed for advanced keyword "${keyword}":`, saveResult.error);
            continue;
          }

          // Final duplicate guard before adding to state
          const existsAfter = keywords.some(kw => normalizeTerm(kw.keyword) === normalizeTerm(saveResult.keyword.term));
          if (existsAfter) {
            continue;
          }

          console.log(`Successfully added advanced keyword "${keyword}" from DomainSubmission`);
          
          // Add the new keyword to the local state
          const newKeyword: Keyword = {
            id: saveResult.keyword.id.toString(),
            keyword: saveResult.keyword.term,
            intent: saveResult.keyword.intent || 'Commercial',
            volume: saveResult.keyword.volume,
            kd: parseInt(saveResult.keyword.difficulty) || 50,
            competition: saveResult.keyword.difficulty === 'High' ? 'High' : saveResult.keyword.difficulty === 'Low' ? 'Low' : 'Medium',
            cpc: saveResult.keyword.cpc,
            organic: Math.floor(saveResult.keyword.volume * 0.1),
            paid: Math.floor(saveResult.keyword.volume * 0.05),
            trend: 'Stable',
            position: 0,
            url: `https://${domain}/${saveResult.keyword.term.toLowerCase().replace(/\s+/g, '-')}`,
            updated: new Date().toISOString().split('T')[0],
            selected: false,
            isCustom: true
          };

          setKeywords(prev => [newKeyword, ...prev]);
          
        } catch (error) {
          console.error(`Error processing advanced keyword "${keyword}":`, error);
        }
      }

      // Clear localStorage after processing
      localStorage.removeItem('advancedKeywords');
      
      // Show success toast for advanced keywords
      if (advancedKeywordsList.length > 0) {
        toast({
          title: "Advanced Keywords Added",
          description: `Successfully processed and added ${advancedKeywordsList.length} advanced keywords from DomainSubmission`,
        });
      }
    }
  };

  // Load custom keywords from localStorage and add them to database
  useEffect(() => {
    const loadCustomKeywordsFromStorage = async () => {
      const savedCustomKeywords = localStorage.getItem('customKeywords');
      if (savedCustomKeywords && domainId > 0) {
        const customKeywordsList = savedCustomKeywords.split(',').map(k => k.trim()).filter(k => k);
        
        if (customKeywordsList.length > 0) {
          setCustomKeywordsLoading(true);
          console.log(`Processing ${customKeywordsList.length} custom keywords from localStorage`);
          
          for (const keyword of customKeywordsList) {
          try {
            // Check if keyword already exists (case-insensitive)
            const exists = keywords.some(kw => normalizeTerm(kw.keyword) === normalizeTerm(keyword));
            if (exists) {
              console.log(`Keyword "${keyword}" already exists, skipping...`);
              toast({
                title: "Duplicate Keyword Skipped",
                description: `"${keyword}" is already in your list`,
              });
              continue;
            }

            // Analyze the custom keyword using AI
            const analyzeResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/analyze`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
              },
              body: JSON.stringify({
                keyword: keyword,
                domain: domain,
                location: location || 'Global',
                domainId: domainId
              })
            });

            if (!analyzeResponse.ok) {
              console.error(`Failed to analyze keyword "${keyword}"`);
              continue;
            }

            const analysisResult = await analyzeResponse.json();
            
            if (!analysisResult.success) {
              console.error(`Analysis failed for keyword "${keyword}":`, analysisResult.error);
              continue;
            }

            // Save the analyzed keyword to the database
            const saveResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/${domainId}/custom`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
              },
              body: JSON.stringify({
                keyword: analysisResult.keyword,
                volume: analysisResult.volume,
                kd: analysisResult.kd,
                competition: analysisResult.competition,
                cpc: analysisResult.cpc,
                intent: analysisResult.intent,
                organic: analysisResult.organic,
                paid: analysisResult.paid,
                trend: analysisResult.trend,
                position: analysisResult.position,
                url: analysisResult.url,
                analysis: analysisResult.analysis
              })
            });

            if (!saveResponse.ok) {
              console.error(`Failed to save keyword "${keyword}"`);
              continue;
            }

            const saveResult = await saveResponse.json();
            
            if (!saveResult.success) {
              console.error(`Save failed for keyword "${keyword}":`, saveResult.error);
              continue;
            }

            // Final duplicate guard before adding to state
            const existsAfter = keywords.some(kw => normalizeTerm(kw.keyword) === normalizeTerm(saveResult.keyword.term));
            if (existsAfter) {
              continue;
            }

            console.log(`Successfully added custom keyword "${keyword}" from localStorage`);
            
            // Add the new keyword to the local state
            const newKeyword: Keyword = {
              id: saveResult.keyword.id.toString(),
              keyword: saveResult.keyword.term,
              intent: saveResult.keyword.intent || 'Commercial',
              volume: saveResult.keyword.volume,
              kd: parseInt(saveResult.keyword.difficulty) || 50,
              competition: saveResult.keyword.difficulty === 'High' ? 'High' : saveResult.keyword.difficulty === 'Low' ? 'Low' : 'Medium',
              cpc: saveResult.keyword.cpc,
              organic: Math.floor(saveResult.keyword.volume * 0.1),
              paid: Math.floor(saveResult.keyword.volume * 0.05),
              trend: 'Stable',
              position: 0,
              url: `https://${domain}/${saveResult.keyword.term.toLowerCase().replace(/\s+/g, '-')}`,
              updated: new Date().toISOString().split('T')[0],
              selected: false,
              isCustom: true
            };

            setKeywords(prev => [newKeyword, ...prev]);
            
          } catch (error) {
            console.error(`Error processing custom keyword "${keyword}":`, error);
          }
        }

        // Clear localStorage after processing
        localStorage.removeItem('customKeywords');
        setCustomKeywordsLoading(false);
        setCustomKeywordsProcessed(true);
        }
      }
    };

    if (domainId > 0 && !isLoading && !isCheckingData) {
      loadCustomKeywordsFromStorage();
    }
  }, [domainId, domain, location, keywords, isLoading, isCheckingData]);

  // Main analysis effect
  useEffect(() => {
    if (!domain) {
      setError('Domain not provided.');
      setIsLoading(false);
      setIsCheckingData(false);
      return;
    }

    setAnalysisComplete(false);
    setAutoRedirectAttempted(false);
    setIsNewAnalysisRun(false);

    const runAnalysis = async () => {
      try {
        console.log('Starting analysis with domainId:', domainId, 'domain:', domain);
        
        // If we have a domain ID, check for existing data first
        // BUT: If this is a new analysis run (isNewAnalysisRun will be set when we actually start),
        // we should still run the analysis even if data exists
        if (domainId > 0) {
          console.log('Domain ID found:', domainId, 'checking for existing data...');
          
          const existingData = await checkExistingData(domainId);
          console.log('Existing data check result:', existingData);

          // Only skip analysis if we're NOT in a new analysis flow
          // For "New Analysis" flow, we want to run analysis even if data exists
          // Check if we're coming from a fresh start (no domainId was pre-set from URL)
          const urlParams = new URLSearchParams(window.location.search);
          const urlDomainId = urlParams.get('domainId');
          const isResumingFromUrl = urlDomainId && parseInt(urlDomainId) === domainId;
          const shouldForceReanalysis = !isResumingFromUrl; // If domainId wasn't from URL, it's a new analysis
          
          // If we have complete data AND we're resuming (not a new analysis), load it and skip
          if (existingData.domainExtraction && existingData.keywords && !shouldForceReanalysis) {
            console.log('Complete existing data found, loading and skipping analysis (resuming from saved state)...');
            const loaded = await loadExistingKeywords(domainId);
            if (loaded) {
              setIsCheckingData(false);
              return; // Exit early, no need to run analysis
            }
          }

          // If we have domain extraction but no keywords, skip domain extraction and only run keyword generation
          if (existingData.domainExtraction && !existingData.keywords) {
            console.log('Domain extraction completed but no keywords found, skipping domain extraction...');
            setLoadingTasks(prev => {
              const newTasks = [...prev];
              newTasks[0] = { ...newTasks[0], status: 'completed', progress: 100 };
              return newTasks;
            });
          }

          // If we have keywords but no domain extraction, load keywords and skip analysis
          // BUT: Only skip if we're resuming, not if it's a new analysis
          if (existingData.keywords && !existingData.domainExtraction && !shouldForceReanalysis) {
            console.log('Keywords found but domain extraction incomplete, loading keywords and skipping analysis...');
            const loaded = await loadExistingKeywords(domainId);
            if (loaded) {
              setIsCheckingData(false);
              return; // Exit early, no need to run analysis
            }
          }

          // If we have domain extraction (context exists), skip analysis entirely and just load keywords if they exist
          // BUT: Only skip if we're resuming, not if it's a new analysis
          if (existingData.domainExtraction && !shouldForceReanalysis) {
            console.log('Domain extraction detected, skipping analysis and loading existing data (resuming from saved state)...');
            if (existingData.keywords) {
              const loaded = await loadExistingKeywords(domainId);
              if (loaded) {
                setIsCheckingData(false);
                return; // Exit early, no need to run analysis
              }
            } else {
              // No keywords but domain extraction exists, just skip analysis
              setIsCheckingData(false);
              setKeywords([]);
              toast({
                title: "Domain Already Analyzed",
                description: "Domain extraction completed but no keywords found. Please add custom keywords.",
              });
              // Don't set analysisComplete here - we're skipping analysis, not completing it
              return; // Exit early, no need to run analysis
            }
          }
          
          // If we're forcing reanalysis, log it
          if (shouldForceReanalysis && (existingData.domainExtraction || existingData.keywords)) {
            console.log('Existing data found but forcing reanalysis for new analysis flow...');
          }
        } else {
          console.log('No domain ID found, checking if domain already exists...');
          
          // Try to find existing domain by URL
          try {
            const domainCheckResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/domain/check/${encodeURIComponent(domain)}`, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
              }
            });
            
            if (domainCheckResponse.ok) {
              const domainCheck = await domainCheckResponse.json();
              if (domainCheck.exists && domainCheck.domainId) {
                console.log('Found existing domain with ID:', domainCheck.domainId);
                setDomainId(domainCheck.domainId);
                
                // Since there's no domainId in URL, this is a "new analysis" flow
                // Even if data exists, we should run the analysis
                console.log('No domainId in URL - this is a new analysis flow, will run analysis even if data exists');
                
                // Check for existing data but don't skip analysis - we'll run it anyway
                const existingData = await checkExistingData(domainCheck.domainId);
                console.log('Existing data check result for found domain:', existingData);
                
                if (existingData.domainExtraction || existingData.keywords) {
                  console.log('Existing data found but continuing with new analysis flow...');
                }
              }
            }
          } catch (error) {
            console.error('Error checking for existing domain:', error);
          }
        }

        // Only run analysis if we don't have complete data
        console.log('Running analysis for missing data...');
        
        // Mark this as a new analysis run
        setIsNewAnalysisRun(true);
        
        // Set loading state only if we need to run analysis
        setIsLoading(true);
        setIsCheckingData(false);
        
        // Run the actual analysis (either full or partial based on existing data)
        const runRealAnalysis = async () => {
          try {
            // Start real analysis with backend
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/domain`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
              },
              body: JSON.stringify({
                url: domain,
                location: location || 'Global',
                customPaths: customPaths || [],
                priorityUrls: priorityUrls || [],
                priorityPaths: priorityPaths || []
              })
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
              throw new Error('No response body');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    
                    if (data.type === 'progress') {
                      // Update task progress based on phase
                      const phase = data.phase;
                      const step = data.step;
                      const progress = data.progress;
                      
                      // Map backend phases to frontend tasks - simplified for domain extraction and Google API
                      const phaseToTaskMap: { [key: string]: number } = {
                        'domain_extraction': 0,
                        'keyword_generation': 1
                      };

                      // Mark all previous phases as completed when a new phase starts
                      if (phase && phaseToTaskMap[phase] !== undefined) {
                        const currentPhaseIndex = phaseToTaskMap[phase];
                        
                        // Mark all previous phases as completed
                        setLoadingTasks(prev => {
                          const newTasks = [...prev];
                          for (let i = 0; i < currentPhaseIndex; i++) {
                            if (newTasks[i].status !== 'completed') {
                              newTasks[i] = {
                                ...newTasks[i],
                                status: 'completed',
                                progress: 100
                              };
                            }
                          }
                          return newTasks;
                        });
                      }

                      if (phase && phaseToTaskMap[phase] !== undefined) {
                        const taskIndex = phaseToTaskMap[phase];
                        setLoadingTasks(prev => {
                          const newTasks = [...prev];
                          newTasks[taskIndex] = {
                            ...newTasks[taskIndex],
                            status: progress === 100 ? 'completed' : 'running',
                            progress: progress
                          };
                          return newTasks;
                        });

                      }
                    } else if (data.type === 'complete') {
                        // Analysis completed, process results - simplified metrics

                        // Set domain ID if available
                        if (data.result && data.result.domain && data.result.domain.id) {
                          setDomainId(data.result.domain.id);
                          
                          // Set extracted context and brand context
                          if (data.result.extraction) {
                            setExtractedContext(data.result.extraction.extractedContext || 'Analysis completed successfully.');
                            setBrandContext(data.result.extraction.extractedContext || 'Analysis completed successfully.');
                          }

                          // Wait a moment for all phases to be properly marked as completed
                          await new Promise(resolve => setTimeout(resolve, 1000));
                          
                          // Ensure all phases are marked as completed
                          setLoadingTasks(prev => prev.map(task => ({
                            ...task,
                            status: 'completed',
                            progress: 100
                          })));
                          
                          // Fetch keywords from the keywords API
                          try {
                            const keywordsResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/${data.result.domain.id}`, {
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                              }
                            });

                            if (keywordsResponse.ok) {
                              const keywordsData = await keywordsResponse.json();
                              
                              if (keywordsData.keywords && keywordsData.keywords.length > 0) {
                                // Determine custom keywords list from localStorage (Advanced Options)
                                const lsCustom = (localStorage.getItem('customKeywords') || '')
                                  .split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                                const lsAdvanced = (localStorage.getItem('advancedKeywords') || '')
                                  .split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                                const customSet = new Set([...lsCustom, ...lsAdvanced]);

                                // Convert API keywords to the format expected by the component
                                const realKeywords: Keyword[] = keywordsData.keywords.map((kw: ApiKeyword, index: number) => ({
                                  id: kw.id.toString(),
                                  keyword: kw.term,
                                  intent: determineIntent(kw.term), // Determine intent based on keyword content
                                  volume: kw.volume,
                                  kd: parseInt(kw.difficulty) || 50, // Use difficulty as KD score
                                  competition: kw.difficulty === 'High' ? 'High' : kw.difficulty === 'Low' ? 'Low' : 'Medium',
                                  cpc: kw.cpc,
                                  organic: Math.floor(kw.volume * 0.1), // Estimate organic traffic based on volume
                                  paid: Math.floor(kw.volume * 0.05), // Estimate paid traffic based on volume
                                  trend: 'Stable', // Default trend (no random data)
                                  position: 0, // No position data from Google API
                                  url: `https://${domain}/${kw.term.toLowerCase().replace(/\s+/g, '-')}`,
                                  updated: new Date().toISOString().split('T')[0],
                                  selected: kw.isSelected || false,
                                  isCustom: kw.isCustom === true || customSet.has(kw.term.toLowerCase())
                                }));

                                setKeywords(realKeywords);
                                
                                // Only now set loading to false and show keywords
                                setIsLoading(false);
                                setResponseTime(Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)));

                                // Show success toast
                                toast({
                                  title: "Analysis Complete",
                                  description: `Domain extraction and enhanced AI keyword generation completed successfully. Found ${realKeywords.length} keywords.`,
                                });
                                
                                // Only set analysisComplete if this was a new analysis run and we have keywords
                                if (isNewAnalysisRun && realKeywords.length > 0) {
                                  setAnalysisComplete(true);
                                }
                              } else {
                                // No keywords found
                                setKeywords([]);
                                setIsLoading(false);
                                setResponseTime(Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)));
                                
                                toast({
                                  title: "Analysis Complete",
                                  description: "Analysis completed but no keywords were generated.",
                                });
                                // Don't set analysisComplete if no keywords were generated
                              }
                            } else {
                              console.error('Failed to fetch keywords:', keywordsResponse.status);
                              setKeywords([]);
                              setIsLoading(false);
                              setResponseTime(Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)));
                              
                              toast({
                                title: "Analysis Complete",
                                description: "Analysis completed but failed to fetch keywords.",
                              });
                              // Don't set analysisComplete if we failed to fetch keywords
                            }
                          } catch (error) {
                            console.error('Error fetching keywords:', error);
                            setKeywords([]);
                            setIsLoading(false);
                            setResponseTime(Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)));
                            
                            toast({
                              title: "Analysis Complete",
                              description: "Analysis completed but failed to load keywords.",
                            });
                            // Don't set analysisComplete if we failed to load keywords
                          }
                        } else {
                          // No domain ID available
                          setKeywords([]);
                          setIsLoading(false);
                          setResponseTime(Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)));
                          
                          toast({
                            title: "Analysis Complete",
                            description: "Analysis completed successfully.",
                          });
                          // Don't set analysisComplete if we don't have a domain ID
                        }
                    }
                  } catch (parseError) {
                    console.error('Error parsing SSE data:', parseError);
                  }
                }
              }

            }

          } catch (error) {
            console.error('Analysis error:', error);
            setError(error instanceof Error ? error.message : 'Analysis failed');
            setIsLoading(false);
            
            toast({
              title: "Analysis Failed",
              description: "Failed to complete analysis. Please try again.",
              variant: "destructive",
            });
          }
        };

        runRealAnalysis();
      } catch (error) {
        console.error('Main analysis error:', error);
        setError(error instanceof Error ? error.message : 'Analysis failed');
        setIsLoading(false);
        setIsCheckingData(false);
        
        toast({
          title: "Analysis Failed",
          description: "Failed to start analysis. Please try again.",
          variant: "destructive",
        });
      }
    };

    runAnalysis();
  }, [domain, location, customPaths, priorityUrls, priorityPaths, setBrandContext, setDomainId, toast]);

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

  // Auto-advance table loading carousel
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTableLoadingIndex(prev => (prev + 1) % 4);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // Step2Analysis-style handlers
  const handleBackClick = async () => {
    setIsBackLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    onPrev();
  };

  const handleKeywordSelect = React.useCallback((keywordId: string) => {
    if (selectedKeywords.includes(keywordId)) {
      setSelectedKeywords(prev => prev.filter(id => id !== keywordId));
    } else if (selectedKeywords.length < 5) {
      setSelectedKeywords(prev => [...prev, keywordId]);
    }
  }, [selectedKeywords]);



  const handleNext = async () => {
    if (selectedKeywords.length === 0) {
      toast({
        title: "Selection Required",
        description: "Please select at least one keyword to continue",
        variant: "destructive",
      });
      return;
    }

    setIsContinuing(true);

    try {
      // Save selected keywords to database
      console.log('Saving selected keywords:', selectedKeywords);
      console.log('Domain ID:', domainId);
      
      const requestBody = {
        keywordIds: selectedKeywords,
        selected: true
      };
      
      console.log('Request body:', requestBody);
      
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/${domainId}/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const selectedKeywordData = keywords.filter(kw => selectedKeywords.includes(kw.id));
      
      toast({
        title: "Keywords Saved",
        description: `Successfully saved ${selectedKeywordData.length} selected keywords`,
      });

    onNext();
    } catch (error) {
      console.error('Error saving selected keywords:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save selected keywords. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsContinuing(false);
    }
  };

  const handleAddCustomKeyword = async () => {
    if (!newKeyword.trim()) return;

    // Prevent duplicates before analyzing/saving
    const exists = keywords.some(kw => normalizeTerm(kw.keyword) === normalizeTerm(newKeyword));
    if (exists) {
      toast({
        title: "Already Added",
        description: `"${newKeyword.trim()}" is already in your list`,
      });
      setNewKeyword('');
      setShowAddKeyword(false);
      return;
    }

    setIsAddingKeyword(true);

    try {
      // Step 1: Analyze the custom keyword using AI
      const analyzeResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          keyword: newKeyword.trim(),
          domain: domain,
          location: location || 'Global',
          domainId: domainId
        })
      });

      if (!analyzeResponse.ok) {
        throw new Error(`Analysis failed! status: ${analyzeResponse.status}`);
      }

      const analysisResult = await analyzeResponse.json();
      
      if (!analysisResult.success) {
        throw new Error(analysisResult.error || 'Analysis failed');
      }

      // Step 2: Save the analyzed keyword to the database
      const saveResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/${domainId}/custom`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          keyword: analysisResult.keyword,
          volume: analysisResult.volume,
          kd: analysisResult.kd,
          competition: analysisResult.competition,
          cpc: analysisResult.cpc,
          intent: analysisResult.intent,
          organic: analysisResult.organic,
          paid: analysisResult.paid,
          trend: analysisResult.trend,
          position: analysisResult.position,
          url: analysisResult.url,
          analysis: analysisResult.analysis
        })
      });

      if (!saveResponse.ok) {
        throw new Error(`Save failed! status: ${saveResponse.status}`);
      }

      const saveResult = await saveResponse.json();
      
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Save failed');
      }

      // Avoid duplicates due to race conditions
      const existsAfter = keywords.some(kw => normalizeTerm(kw.keyword) === normalizeTerm(saveResult.keyword.term));
      if (existsAfter) {
        setNewKeyword('');
        setShowAddKeyword(false);
        setIsAddingKeyword(false);
        toast({
          title: "Already Added",
          description: `"${saveResult.keyword.term}" is already in your list`,
        });
        return;
      }

      // Add the new keyword to the list
      setKeywords(prev => [saveResult.keyword, ...prev]);
      setNewKeyword('');
      setShowAddKeyword(false);
      setIsAddingKeyword(false);

      toast({
        title: "Keyword Added Successfully",
        description: `Successfully analyzed and added "${newKeyword.trim()}" with comprehensive AI data`,
      });

    } catch (error) {
      console.error('Custom keyword analysis error:', error);
      
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze keyword with AI. Please try again.",
        variant: "destructive",
      });
      
      setNewKeyword('');
      setShowAddKeyword(false);
      setIsAddingKeyword(false);
    }
  };

  const filteredKeywords = keywords.filter(keyword => {
    const matchesSearch = keyword.keyword.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCompetition = !filters.competition || keyword.competition === filters.competition;
    const matchesIntent = !filters.intent || keyword.intent === filters.intent;
    
    // Debug logging for intent filtering
    if (filters.intent && !matchesIntent) {
      console.log(`Intent filter mismatch: keyword.intent="${keyword.intent}", filter.intent="${filters.intent}"`);
    }
    
    return matchesSearch && matchesCompetition && matchesIntent;
  });

  // Reset page when filters/search change
  useEffect(() => {
    setShowCountByCompetition({ Low: initialShowCount, Medium: initialShowCount, High: initialShowCount });
    // Reset table pagination when filters change
    setCurrentPage(1);
  }, [searchTerm, filters.competition, filters.intent]);

  const clusterTypes: Array<'Low' | 'Medium' | 'High'> = ['Low', 'Medium', 'High'];

  // Helper function to determine intent based on keyword content
  const determineIntent = (keyword: string): string => {
    const lowerKeyword = keyword.toLowerCase();
    
    // Transactional intent keywords
    if (lowerKeyword.includes('buy') || lowerKeyword.includes('purchase') || 
        lowerKeyword.includes('order') || lowerKeyword.includes('shop') ||
        lowerKeyword.includes('price') || lowerKeyword.includes('cost') ||
        lowerKeyword.includes('deal') || lowerKeyword.includes('discount') ||
        lowerKeyword.includes('sale') || lowerKeyword.includes('offer')) {
      return 'Transactional';
    }
    
    // Informational intent keywords
    if (lowerKeyword.includes('what') || lowerKeyword.includes('how') || 
        lowerKeyword.includes('why') || lowerKeyword.includes('when') ||
        lowerKeyword.includes('where') || lowerKeyword.includes('guide') ||
        lowerKeyword.includes('tutorial') || lowerKeyword.includes('tips') ||
        lowerKeyword.includes('learn') || lowerKeyword.includes('information') ||
        lowerKeyword.includes('explain') || lowerKeyword.includes('definition')) {
      return 'Informational';
    }
    
    // Default to Commercial for business-related terms
    return 'Commercial';
  };

  // Helper to normalize keyword terms for duplicate detection
  const normalizeTerm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

  // Sorting function
  const handleSort = React.useCallback((key: keyof Keyword) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  const sortedKeywords = React.useMemo(() => {
    const sortableKeywords = [...filteredKeywords];
    if (sortConfig !== null) {
      sortableKeywords.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }
        
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        
        if (aStr < bStr) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aStr > bStr) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableKeywords;
  }, [filteredKeywords, sortConfig]);

  // Optimized KeywordTable component - moved outside main component
  const KeywordTable = React.memo(({ 
    keywords, 
    selectedKeywords, 
    handleKeywordSelect, 
    sortConfig, 
    handleSort, 
    currentPage, 
    setCurrentPage, 
    itemsPerPage 
  }: { 
    keywords: Keyword[];
    selectedKeywords: string[];
    handleKeywordSelect: (id: string) => void;
    sortConfig: { key: keyof Keyword; direction: 'asc' | 'desc'; } | null;
    handleSort: (key: keyof Keyword) => void;
    currentPage: number;
    setCurrentPage: (page: number) => void;
    itemsPerPage: number;
  }) => {
    const getSortIcon = React.useCallback((key: keyof Keyword) => {
      if (!sortConfig || sortConfig.key !== key) {
        return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
      }
      return sortConfig.direction === 'asc' ? 
        <ChevronUp className="w-4 h-4 text-gray-700" /> : 
        <ChevronDown className="w-4 h-4 text-gray-700" />;
    }, [sortConfig]);

    const getCompetitionBadge = React.useCallback((competition: string) => {
      const baseClasses = "px-2.5 py-1 rounded-full text-xs font-semibold";
      switch (competition) {
        case 'High':
          return `${baseClasses} bg-red-100 text-red-800`;
        case 'Medium':
          return `${baseClasses} bg-yellow-100 text-yellow-800`;
        case 'Low':
          return `${baseClasses} bg-green-100 text-green-800`;
        default:
          return `${baseClasses} bg-gray-100 text-gray-800`;
      }
    }, []);

    // Memoized pagination calculations
    const paginationData = React.useMemo(() => {
      const totalPages = Math.max(1, Math.ceil(keywords.length / itemsPerPage));
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const currentKeywords = keywords.slice(startIndex, endIndex);
      
      return { totalPages, startIndex, endIndex, currentKeywords };
    }, [keywords, currentPage, itemsPerPage]);

          // Reset to first page when keywords change and ensure current page is valid
    React.useEffect(() => {
      const totalPages = Math.max(1, Math.ceil(keywords.length / itemsPerPage));
      if (currentPage > totalPages) {
        setCurrentPage(1);
      } else if (currentPage < 1) {
        setCurrentPage(1);
      }
    }, [keywords, currentPage, itemsPerPage, setCurrentPage]);

    const handlePageChange = React.useCallback((page: number) => {
      const totalPages = Math.max(1, Math.ceil(keywords.length / itemsPerPage));
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page);
      }
    }, [keywords.length, itemsPerPage, setCurrentPage]);

    const getPageNumbers = React.useCallback(() => {
      const pages = [];
      const maxVisiblePages = 5;
      const { totalPages } = paginationData;
      
      if (totalPages <= maxVisiblePages) {
        for (let i = 1; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        if (currentPage <= 3) {
          for (let i = 1; i <= 4; i++) {
            pages.push(i);
          }
          pages.push('...');
          pages.push(totalPages);
        } else if (currentPage >= totalPages - 2) {
          pages.push(1);
          pages.push('...');
          for (let i = totalPages - 3; i <= totalPages; i++) {
            pages.push(i);
          }
        } else {
          pages.push(1);
          pages.push('...');
          for (let i = currentPage - 1; i <= currentPage + 1; i++) {
            pages.push(i);
          }
          pages.push('...');
          pages.push(totalPages);
        }
      }
      
      return pages;
    }, [paginationData.totalPages, currentPage]);

    return (
      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="bg-gray-50/80 border-b border-gray-200">
          <div className="grid grid-cols-11 gap-4 px-6 py-4 text-sm font-semibold text-gray-700">
            <div className="col-span-1 flex items-center justify-center">
              <span className="text-xs">Select</span>
            </div>
            
            <div 
              className="col-span-3 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors"
              onClick={() => handleSort('keyword')}
            >
              <span>Keyword</span>
              {getSortIcon('keyword')}
            </div>
            
            <div 
              className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
              onClick={() => handleSort('volume')}
            >
              <span>Volume</span>
              {getSortIcon('volume')}
            </div>
            
            <div 
              className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
              onClick={() => handleSort('competition')}
            >
              <span>Competition</span>
              {getSortIcon('competition')}
            </div>
            
            <div
              className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
              onClick={() => handleSort('intent')}
            >
              <span>Intent</span>
              {getSortIcon('intent')}
            </div>

            <div
              className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
              onClick={() => handleSort('organic')}
            >
              <span>Organic</span>
              {getSortIcon('organic')}
            </div>
            
            <div 
              className="col-span-1 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
              onClick={() => handleSort('intent')}
            >
              <span>Intent</span>
              {getSortIcon('intent')}
            </div>
            
            <div 
              className="col-span-2 flex items-center space-x-2 cursor-pointer hover:text-gray-900 transition-colors justify-center"
              onClick={() => handleSort('trend')}
            >
              <span>Trend</span>
              {getSortIcon('trend')}
            </div>
          </div>
        </div>
        
        {/* Table Body */}
        <div className="divide-y divide-gray-100">
          {paginationData.currentKeywords.map((keyword, index) => {
            const isSelected = selectedKeywords.includes(keyword.id);
            const isDisabled = !isSelected && selectedKeywords.length >= 5;
            
            return (
              <div
                key={keyword.id}
                className={`grid grid-cols-11 gap-4 px-6 py-4 hover:bg-gray-50/80 transition-all duration-200 cursor-pointer ${
                  isSelected ? 'bg-blue-50/50 border-l-4 border-blue-500' : ''
                } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => !isDisabled && handleKeywordSelect(keyword.id)}
              >
                {/* Select Column */}
                <div className="col-span-1 flex items-center justify-center">
                  <div className={`w-6 h-6 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
                    isSelected 
                      ? 'bg-white border-gray-300' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}>
                    {isSelected && (
                      <CheckCircle className="w-6 h-6 text-gray-700 -ml-0.5 -mt-0.5" />
                    )}
                  </div>
                </div>
                
                {/* Keyword Column */}
                <div className="col-span-3 flex items-center space-x-3">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm flex items-center space-x-2">
                      <span>{keyword.keyword}</span>
                      {keyword.isCustom && (
                        <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-xs font-semibold">
                          Custom
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                      {keyword.url}
                    </div>
                  </div>
                </div>
                
                {/* Volume Column */}
                <div className="col-span-1 flex items-center justify-center">
                  <span className="font-semibold text-gray-900 text-sm">
                    {keyword.volume >= 1000 ? `${(keyword.volume/1000).toFixed(1)}K` : keyword.volume.toLocaleString()}
                  </span>
                </div>
                
                {/* Competition Column */}
                <div className="col-span-1 flex items-center justify-center">
                  <span className={getCompetitionBadge(keyword.competition)}>
                    {keyword.competition}
                  </span>
                </div>
                
                {/* Intent Column */}
                <div className="col-span-1 flex items-center justify-center">
                  <span className="font-semibold text-gray-700 text-xs">
                    {keyword.intent || 'Commercial'}
                  </span>
                </div>

                {/* Organic Column */}
                <div className="col-span-1 flex items-center justify-center">
                  <span className="text-gray-700 text-sm">
                    {keyword.organic.toLocaleString()}
                  </span>
                </div>
                
                {/* Intent Column */}
                <div className="col-span-1 flex items-center justify-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    keyword.intent === 'Commercial' ? 'bg-blue-100 text-blue-800' :
                    keyword.intent === 'Transactional' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {keyword.intent}
                  </span>
                </div>
                
                {/* Trend Column */}
                <div className="col-span-2 flex items-center justify-center">
                  <div className="flex items-center space-x-1">
                    <TrendingUp className={`w-4 h-4 ${
                      keyword.trend === 'Rising' ? 'text-green-500' : 
                      keyword.trend === 'Falling' ? 'text-red-500' : 'text-gray-500'
                    }`} />
                    <span className="text-sm text-gray-700">{keyword.trend}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Apple-style Pagination */}
        {paginationData.totalPages > 1 && (
          <div className="bg-gray-50/50 border-t border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Results info */}
              <div className="text-sm text-gray-600">
                Showing {paginationData.startIndex + 1} to {Math.min(paginationData.endIndex, keywords.length)} of {keywords.length} keywords
              </div>
              
              {/* Pagination controls */}
              <div className="flex items-center space-x-2">
                {/* Previous button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    currentPage === 1
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <ChevronUp className="w-4 h-4 rotate-90" />
                  <span>Previous</span>
                </button>
                
                {/* Page numbers */}
                <div className="flex items-center space-x-1">
                  {getPageNumbers().map((page, index) => (
                    <React.Fragment key={index}>
                      {page === '...' ? (
                        <span className="px-2 py-2 text-gray-400">...</span>
                      ) : (
                        <button
                          onClick={() => handlePageChange(page as number)}
                          className={`w-8 h-8 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center ${
                            currentPage === page
                              ? 'bg-gray-900 text-white shadow-sm'
                              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                          }`}
                        >
                          {page}
                        </button>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                
                {/* Next button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= paginationData.totalPages}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    currentPage >= paginationData.totalPages
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <span>Next</span>
                  <ChevronUp className="w-4 h-4 -rotate-90" />
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Empty state */}
        {keywords.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-gray-500">No keywords match your current filters.</p>
          </div>
        )}
      </div>
    );
  });

  // Step2Analysis-style back loading state (compact)
  if (isBackLoading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 rounded-full animate-spin border-t-transparent mx-auto mb-5"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Fetching Your Data</h2>
            <p className="text-gray-600 mb-5">Retrieving your saved configuration from our secure cloud servers</p>

            {/* Carousel Container with Smooth Transitions */}
            <div className="relative h-20 mb-6 overflow-hidden">
              <div 
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${currentLoadingIndex * 100}%)` }}
              >
                <div className="w-full flex-shrink-0 text-center">
                  <h3 className="text-base text-gray-900 mb-1 transition-opacity duration-500">
                    Connecting to Cloud Storage
                  </h3>
                  <p className="text-gray-500 text-sm transition-opacity duration-500">
                    Establishing secure connection to our servers
                  </p>
                </div>
                <div className="w-full flex-shrink-0 text-center">
                  <h3 className="text-base text-gray-900 mb-1 transition-opacity duration-500">
                    Retrieving Configuration
                  </h3>
                  <p className="text-gray-500 text-sm transition-opacity duration-500">
                    Loading your saved domain settings
                  </p>
                </div>
                <div className="w-full flex-shrink-0 text-center">
                  <h3 className="text-base text-gray-900 mb-1 transition-opacity duration-500">
                    Preparing Data
                  </h3>
                  <p className="text-gray-500 text-sm transition-opacity duration-500">
                    Organizing your analysis results
                  </p>
                </div>
              </div>
            </div>

            {/* Progress Dots */}
            <div className="flex justify-center space-x-2 mb-5">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-all duration-500 ease-out ${
                    index === currentLoadingIndex
                      ? 'bg-blue-600 scale-125'
                      : 'bg-gray-300'
                  }`}
                ></div>
              ))}
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-w-md mx-auto">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                <span className="text-green-800 text-sm">Your data is secured with 256-bit encryption</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step2Analysis-style loading state (compact)
  if (isCheckingData) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 rounded-full animate-spin border-t-transparent mx-auto mb-5"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Checking Existing Data</h2>
            <p className="text-gray-600 mb-5">Looking for existing analysis data for {domain}</p>

            {/* Carousel Container with Smooth Transitions */}
            <div className="relative h-20 mb-6 overflow-hidden">
              <div 
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${currentLoadingIndex * 100}%)` }}
              >
                <div className="w-full flex-shrink-0 text-center">
                  <h3 className="text-base text-gray-900 mb-1 transition-opacity duration-500">
                    Checking Domain Database
                  </h3>
                  <p className="text-gray-500 text-sm transition-opacity duration-500">
                    Searching for existing domain analysis records
                  </p>
                </div>
                <div className="w-full flex-shrink-0 text-center">
                  <h3 className="text-base text-gray-900 mb-1 transition-opacity duration-500">
                    Verifying Keywords
                  </h3>
                  <p className="text-gray-500 text-sm transition-opacity duration-500">
                    Checking for previously generated keywords
                  </p>
                </div>
                <div className="w-full flex-shrink-0 text-center">
                  <h3 className="text-base text-gray-900 mb-1 transition-opacity duration-500">
                    Loading Analysis Data
                  </h3>
                  <p className="text-gray-500 text-sm transition-opacity duration-500">
                    Retrieving cached analysis results
                  </p>
                </div>
              </div>
            </div>

            {/* Progress Dots */}
            <div className="flex justify-center space-x-2 mb-5">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-all duration-500 ease-out ${
                    index === currentLoadingIndex
                      ? 'bg-blue-600 scale-125'
                      : 'bg-gray-300'
                  }`}
                ></div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 max-w-md mx-auto">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-blue-500 mr-3" />
                <span className="text-blue-800 text-sm">Checking for existing domain extraction and keywords</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Apple-style loading state
  if (isLoading) {
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
              Domain Extraction & AI Analysis
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Analyzing your domain with advanced AI models
            </p>
          </div>

          {/* Domain Info */}
          <div className="mb-8 p-6 bg-blue-50 rounded-2xl border border-blue-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-base font-medium text-blue-900">Analyzing: {domain}</span>
              <span className="text-sm text-blue-700 font-medium">{location || 'Global'}</span>
            </div>
            {(customPaths?.length > 0 || priorityUrls?.length > 0) && (
              <div className="text-sm text-blue-800 font-medium">
                Custom Configuration: {customPaths?.length || 0} paths, {priorityUrls?.length || 0} priority URLs
              </div>
            )}
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

          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center text-gray-600">
              <svg className="w-6 h-6 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-base font-medium">Your domain analysis is being processed securely</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step2Analysis-style results view
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className={`${embedded ? 'bg-transparent border-0 shadow-none' : 'bg-white border border-gray-100 shadow-lg'} rounded-3xl overflow-hidden backdrop-blur-sm`}>
        <div className="p-4 sm:p-6 border-b border-gray-100 bg-gradient-to-b from-gray-50/50 to-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-light text-gray-900 tracking-tight">Keyword Selection</h2>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-600">{selectedKeywords.length}/5 selected</span>
              </div>
              <button
                onClick={() => setShowDebug(prev => !prev)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full hover:shadow-md transition-all duration-200 text-xs flex items-center font-medium"
                title="Show debug info"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Debug
              </button>
            </div>
          </div>

          {showDebug && (
            <div className="mb-6 border border-gray-100 rounded-2xl p-5 bg-gradient-to-br from-gray-50 to-gray-100/50 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-gray-900">Debug Info</h3>
                <button onClick={() => setShowDebug(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-2">Domain Context Extract</div>
                  <pre className="text-[11px] bg-white border border-gray-200 rounded p-3 max-h-40 overflow-auto whitespace-pre-wrap break-words">{(() => { try { return JSON.stringify(JSON.parse(extractedContext || ''), null, 2) } catch { return extractedContext || 'No context extracted yet'; } })()}</pre>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-2">Keywords Extracted ({keywords.length})</div>
                  {keywords.length > 0 ? (
                    <ul className="text-[11px] list-disc ml-5 max-h-40 overflow-auto">
                      {keywords.slice(0, 20).map((k) => (
                        <li key={k.id}>{k.keyword}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-gray-600">No keywords loaded yet</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Add Custom Keywords Section - Simplified */}
          <div className="mb-6 border-t border-gray-100 pt-6">
            <button
              onClick={() => setShowAddKeyword(!showAddKeyword)}
              className="flex items-center text-gray-700 hover:text-gray-900 font-medium text-sm mb-4 px-3 py-2 rounded-full hover:bg-gray-100 transition-all duration-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Custom Keyword
            </button>

            {showAddKeyword && (
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Enter keyword to analyze"
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200"
                    disabled={isAddingKeyword}
                  />
                  <button
                    onClick={handleAddCustomKeyword}
                    disabled={!newKeyword.trim() || isAddingKeyword}
                    className="px-5 py-2.5 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 disabled:bg-gray-300 transition-all duration-200 text-sm font-medium shadow hover:shadow-md"
                  >
                    {isAddingKeyword ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2 inline-block" />
                        Analyzing...
                      </>
                    ) : (
                      'Add'
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddKeyword(false);
                      setNewKeyword('');
                    }}
                    className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-50 text-sm font-medium transition-all duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Search and Filters - Enhanced with View Toggle */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search keywords..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200 w-72"
                />
              </div>

              <select
                value={filters.competition}
                onChange={(e) => setFilters(prev => ({ ...prev, competition: e.target.value }))}
                className="px-3 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200 appearance-none cursor-pointer"
              >
                <option value="">All Competition</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>

              <select
                value={filters.intent}
                onChange={(e) => setFilters(prev => ({ ...prev, intent: e.target.value }))}
                className="px-3 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50/50 transition-all duration-200 appearance-none cursor-pointer"
              >
                <option value="">All Intent</option>
                <option value="Informational">Informational</option>
                <option value="Commercial">Commercial</option>
                <option value="Transactional">Transactional</option>
              </select>
            </div>

            {/* View Mode Toggle + Rows per page */}
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-gray-100 rounded-2xl p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                    viewMode === 'cards'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                  <span>Cards</span>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                    viewMode === 'table'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List className="w-4 h-4" />
                  <span>Table</span>
                </button>
              </div>

              {/* Enhanced Rows per page control */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Rows</span>
                <div className="flex items-center bg-white border border-gray-200 rounded-2xl px-1 shadow-sm">
                  <button
                    onClick={() => { const next = Math.max(5, itemsPerPage - 5); setItemsPerPage(next); setCurrentPage(1); }}
                    className="px-2 py-1 text-gray-700 hover:text-gray-900 disabled:text-gray-300"
                    disabled={itemsPerPage <= 5}
                    aria-label="Decrease rows"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={5}
                    max={200}
                    step={5}
                    value={itemsPerPage}
                    onChange={(e) => {
                      const raw = parseInt(e.target.value, 10);
                      if (Number.isNaN(raw)) return;
                      const clamped = Math.max(5, Math.min(200, raw));
                      setItemsPerPage(clamped);
                      setCurrentPage(1);
                    }}
                    className="w-16 text-center px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-0 bg-transparent"
                  />
                  <button
                    onClick={() => { const next = Math.min(200, itemsPerPage + 5); setItemsPerPage(next); setCurrentPage(1); }}
                    className="px-2 py-1 text-gray-700 hover:text-gray-900 disabled:text-gray-300"
                    disabled={itemsPerPage >= 200}
                    aria-label="Increase rows"
                  >
                    +
                  </button>
                </div>

              </div>
            </div>
          </div>

          {/* Warning Message - Simplified */}
          {selectedKeywords.length >= 5 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-4 shadow-sm">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-3" />
                <p className="text-red-700 text-sm font-medium">Maximum 5 keywords can be selected</p>
              </div>
            </div>
          )}

          {/* Custom Keywords Loading Indicator */}
          {customKeywordsLoading && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <div>
                  <h4 className="text-sm font-medium text-blue-900">Processing Custom Keywords</h4>
                  <p className="text-xs text-blue-700">AI is analyzing your custom keywords and saving them to the database...</p>
                </div>
              </div>
            </div>
          )}

          {/* Custom Keywords Success Message */}
          {customKeywordsProcessed && !customKeywordsLoading && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4 shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-green-900">Custom Keywords Processed</h4>
                  <p className="text-xs text-green-700">Your custom keywords have been analyzed and are ready for selection</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Keyword Display - Cards or Table */}
        <div className="p-4 sm:p-6">
          {sortedKeywords.length === 0 ? (
            <div className="py-12 text-center">
              {/* Loading Carousel for Empty Table - keep existing carousel */}
              <div className="relative h-28 mb-6 overflow-hidden">
                <div
                  className="flex transition-transform duration-700 ease-in-out"
                  style={{ transform: `translateX(-${currentTableLoadingIndex * 100}%)` }}
                >
                  <div className="w-full flex-shrink-0 text-center">
                    <div className="w-8 h-8 border-2 border-gray-300 rounded-full animate-spin border-t-gray-800 mx-auto mb-3"></div>
                    <h3 className="text-base text-gray-900 mb-1 transition-opacity duration-500">
                      Loading Keywords
                    </h3>
                    <p className="text-gray-500 text-sm transition-opacity duration-500">
                      Preparing keyword analysis data
                    </p>
                  </div>
                  <div className="w-full flex-shrink-0 text-center">
                    <div className="w-8 h-8 border-2 border-gray-300 rounded-full animate-spin border-t-gray-800 mx-auto mb-3"></div>
                    <h3 className="text-base text-gray-900 mb-1 transition-opacity duration-500">
                      Analyzing Volume Data
                    </h3>
                    <p className="text-gray-500 text-sm transition-opacity duration-500">
                      Calculating search volumes and competition
                    </p>
                  </div>
                  <div className="w-full flex-shrink-0 text-center">
                    <div className="w-8 h-8 border-2 border-gray-300 rounded-full animate-spin border-t-gray-800 mx-auto mb-3"></div>
                    <h3 className="text-base text-gray-900 mb-1 transition-opacity duration-500">
                      Processing Metrics
                    </h3>
                    <p className="text-gray-500 text-sm transition-opacity duration-500">
                      Computing difficulty and intent values
                    </p>
                  </div>
                  <div className="w-full flex-shrink-0 text-center">
                    <div className="w-8 h-8 border-2 border-gray-300 rounded-full animate-spin border-t-gray-800 mx-auto mb-3"></div>
                    <h3 className="text-base text-gray-900 mb-1 transition-opacity duration-500">
                      Finalizing Results
                    </h3>
                    <p className="text-gray-500 text-sm transition-opacity duration-500">
                      Organizing keyword data for selection
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Dots for Table Loading */}
              <div className="flex justify-center space-x-2 mb-4">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-all duration-500 ease-out ${
                      index === currentTableLoadingIndex
                        ? 'bg-gray-600 scale-125'
                        : 'bg-gray-300'
                    }`}
                  ></div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {viewMode === 'table' ? (
                <KeywordTable 
                  keywords={sortedKeywords} 
                  selectedKeywords={selectedKeywords} 
                  handleKeywordSelect={handleKeywordSelect} 
                  sortConfig={sortConfig} 
                  handleSort={handleSort} 
                  currentPage={currentPage} 
                  setCurrentPage={setCurrentPage} 
                  itemsPerPage={itemsPerPage} 
                />
              ) : (
                /* Existing Cards Layout - keep all the existing card logic */
                <div className="space-y-8">
                  {clusterTypes.map((competition) => {
                    const clusterKeywordsAll = sortedKeywords.filter(k => k.competition === competition);
                    if (clusterKeywordsAll.length === 0) return null;

                    const showCount = showCountByCompetition[competition] || initialShowCount;
                    const clusterKeywords = clusterKeywordsAll.slice(0, showCount);

                    return (
                      <div key={competition} className="space-y-4">
                        {/* Cluster Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <h3 className="text-xl font-semibold text-gray-900 tracking-tight">
                              {competition} Competition
                            </h3>
                            <div className={`${
                              competition === 'High' ? 'bg-red-100 text-red-800 border border-red-200' :
                              competition === 'Medium' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                              'bg-green-100 text-green-800 border border-green-200'
                            } px-3 py-1.5 rounded-full text-xs font-medium`}>
                              {clusterKeywordsAll.length} keywords
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {showCount > initialShowCount && (
                              <button
                                onClick={() => setShowCountByCompetition(prev => ({ ...prev, [competition]: initialShowCount }))}
                                className="px-3 py-1.5 text-xs border border-gray-200 rounded-2xl hover:bg-gray-50 text-gray-700"
                              >
                                Show less
                              </button>
                            )}
                            {showCount < clusterKeywordsAll.length && (
                              <button
                                onClick={() => setShowCountByCompetition(prev => ({ ...prev, [competition]: Math.min(clusterKeywordsAll.length, showCount + initialShowCount) }))}
                                className="px-3 py-1.5 text-xs border border-gray-200 rounded-2xl hover:bg-gray-50 text-gray-700"
                              >
                                Show more
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Keywords Grid - Compact Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {clusterKeywords.map((keyword) => {
                            const isSelected = selectedKeywords.includes(keyword.id);
                            const isDisabled = !isSelected && selectedKeywords.length >= 5;

                            return (
                              <div
                                key={keyword.id}
                                onClick={() => !isDisabled && handleKeywordSelect(keyword.id)}
                                className={`relative group cursor-pointer h-full transition-all duration-300 ease-out ${
                                  isDisabled ? 'cursor-not-allowed opacity-50' : ''
                                }`}
                              >
                                {/* Card */}
                                <div className={`
                                  relative overflow-hidden rounded-3xl border-2 h-full min-h-[160px] flex flex-col transition-all duration-300 ease-out
                                  ${isSelected 
                                    ? 'border-gray-300 bg-gradient-to-br from-white to-gray-50 text-gray-900 shadow ring-2 ring-gray-300' 
                                    : keyword.isCustom
                                      ? 'border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100/50 hover:border-purple-300 hover:shadow'
                                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow'
                                  }
                                  ${isDisabled ? 'hover:shadow-none' : ''}
                                `}>

                                  {/* Selection Indicator */}
                                  <div className={`absolute top-3 right-3 w-6 h-6 rounded-full border-2 transition-all duration-200 ${
                                    isSelected 
                                      ? 'bg-white border-gray-300' 
                                      : 'border-gray-300 group-hover:border-gray-400'
                                  }`}>
                                    {isSelected && (
                                      <CheckCircle className="w-6 h-6 text-gray-700 -ml-0.5 -mt-0.5" />
                                    )}
                                  </div>

                                  {/* Custom Badge */}
                                  {keyword.isCustom && (
                                    <div className="absolute top-3 left-3">
                                      <div className={`${
                                        isSelected 
                                          ? 'bg-gray-200 text-gray-700' 
                                          : 'bg-purple-500 text-white'
                                      } px-2.5 py-1 rounded-full text-[10px] font-semibold`}>
                                        Custom
                                      </div>
                                    </div>
                                  )}

                                  <div className="p-5 pt-10 flex-1 flex flex-col">
                                    {/* Keyword */}
                                    <h4 className={`text-base font-semibold mb-3 leading-tight min-h-[40px] ${
                                      isSelected ? 'text-gray-900' : 'text-gray-900'
                                    }`}>
                                      {keyword.keyword}
                                    </h4>

                                    {/* Metrics Row (compact) */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                          <TrendingUp className="text-gray-500" style={{ width: 16, height: 16 }} />
                                          <span className="text-xs font-medium text-gray-600">Volume</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900">
                                          {keyword.volume >= 1000 ? `${(keyword.volume/1000).toFixed(1)}K` : keyword.volume.toLocaleString()}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Hover Glow Effect */}
                                  {!isSelected && !isDisabled && (
                                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-gray-900/5 to-gray-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer - Simplified */}
        <div className="p-6 border-t border-gray-100 bg-gradient-to-t from-gray-50/30 to-white flex items-center justify-between">
          <button
            onClick={handleBackClick}
            className="px-7 py-2.5 border border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-50 hover:shadow-sm transition-all duration-200 font-medium text-sm"
          >
            Back
          </button>

          <div className="flex items-center space-x-3">
            {selectedKeywords.length > 0 && (
              <span className="text-sm text-gray-600">
                {selectedKeywords.length} keywords selected
              </span>
            )}
            <button
              onClick={handleNext}
              disabled={selectedKeywords.length === 0 || isContinuing}
              className="px-8 py-2.5 bg-gray-900 text-white font-medium rounded-2xl hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 flex items-center shadow hover:shadow-md text-sm"
            >
              {isContinuing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Saving...
                </>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DomainExtraction;