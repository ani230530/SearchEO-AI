import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Globe, Shield, TrendingUp, Plus, Upload, ArrowRight, MapPin, Settings, Info, Lightbulb } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import Select from 'react-select';
import countryList from 'react-select-country-list';
import { City, Country, State } from 'country-state-city';
import type { CSSObjectWithLabel } from 'react-select';
import type { ParsedDomainInput } from '@/lib/domainValidation';
import { validateDomainInput } from '@/lib/domainValidation';

interface DomainSubmissionProps {
  domain: string;
  setDomain: (domain: string) => void;
  onNext: (domainId?: number) => void;
  customPaths?: string[];
  setCustomPaths?: (paths: string[]) => void;
  subdomains?: string[];
  setSubdomains?: (subdomains: string[]) => void;
  priorityUrls?: string[];
  setPriorityUrls?: (urls: string[]) => void;
  priorityPaths?: string[];
  setPriorityPaths?: (paths: string[]) => void;
  location?: string;
  setLocation?: (location: string) => void;
}

interface DomainCheckResult {
  exists: boolean;
  domainId?: number;
  url?: string;
  hasCurrentAnalysis?: boolean;
  lastAnalyzed?: string;
}

const DomainSubmission: React.FC<DomainSubmissionProps> = ({ 
  domain, 
  setDomain, 
  onNext,
  customPaths: customPathsProp,
  setCustomPaths: setCustomPathsProp,
  subdomains,
  setSubdomains,
  priorityUrls: priorityUrlsProp,
  setPriorityUrls: setPriorityUrlsProp,
  priorityPaths: priorityPathsProp,
  setPriorityPaths: setPriorityPathsProp,
  location: locationProp,
  setLocation: setLocationProp
}) => {
  const [customPaths, setCustomPathsState] = useState<string[]>(customPathsProp || []);
  const [priorityUrls, setPriorityUrlsState] = useState<string[]>(priorityUrlsProp || []);
  const [priorityPaths, setPriorityPathsState] = useState<string[]>(priorityPathsProp || []);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [selectedCountry, setSelectedCountry] = useState<{ value: string; label: string } | null>(null);
  const [selectedState, setSelectedState] = useState<{ value: string; label: string } | null>(null);
  const [selectedCity, setSelectedCity] = useState<{ value: string; label: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customKeywords, setCustomKeywords] = useState('');
  const [intentPhrases, setIntentPhrases] = useState('');
  const [chatModel, setChatModel] = useState('GPT-4o');
  const [runAllModels, setRunAllModels] = useState(false);
  const [domainError, setDomainError] = useState('');
  const [loadingSteps, setLoadingSteps] = useState([
    { name: 'Domain Validation', status: 'pending', progress: 0 },
    { name: 'SSL Certificate Check', status: 'pending', progress: 0 },
    { name: 'Server Response Analysis', status: 'pending', progress: 0 },
    { name: 'Geo-location Configuration', status: 'pending', progress: 0 }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Carousel control state
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

  const chatModels = ['GPT-4o', 'Claude 3', 'Gemini 1.5'];
  const [location, setLocationState] = useState<string>(locationProp || '');

  // Load custom keywords and phrases from localStorage on component mount
  useEffect(() => {
    const savedCustomKeywords = localStorage.getItem('customKeywords');
    const savedIntentPhrases = localStorage.getItem('intentPhrases');
    
    if (savedCustomKeywords) {
      setCustomKeywords(savedCustomKeywords);
    }
    
    if (savedIntentPhrases) {
      setIntentPhrases(savedIntentPhrases);
    }
  }, []);

  // Save custom keywords and phrases to localStorage when they change
  useEffect(() => {
    if (customKeywords) {
      localStorage.setItem('customKeywords', customKeywords);
    }
  }, [customKeywords]);

  useEffect(() => {
    if (intentPhrases) {
      localStorage.setItem('intentPhrases', intentPhrases);
    }
  }, [intentPhrases]);

  // Get real country, state, and city data
  const countryOptions = Country.getAllCountries().map(country => ({
    value: country.isoCode,
    label: country.name
  }));

  const stateOptions = selectedCountry
    ? State.getStatesOfCountry(selectedCountry.value).map(state => ({
        value: state.isoCode,
        label: state.name
      }))
    : [];

  const cityOptions = selectedState && selectedCountry
    ? City.getCitiesOfState(selectedCountry.value, selectedState.value).map(city => ({
        value: city.name,
        label: city.name
      }))
    : [];

  // Sync with parent state
  useEffect(() => {
    if (setCustomPathsProp) setCustomPathsProp(customPaths);
    if (setPriorityUrlsProp) setPriorityUrlsProp(priorityUrls);
    if (setPriorityPathsProp) setPriorityPathsProp(priorityPaths);
    if (setLocationProp) setLocationProp(location);
  }, [customPaths, priorityUrls, priorityPaths, setCustomPathsProp, setPriorityUrlsProp, setPriorityPathsProp, location, setLocationProp]);

  // Update location state when location fields are selected
  useEffect(() => {
    const locationParts: string[] = [];
    if (selectedCity) locationParts.push(selectedCity.label);
    if (selectedState) locationParts.push(selectedState.label);
    if (selectedCountry) locationParts.push(selectedCountry.label);
    
    setLocationState(locationParts.join(', '));
  }, [selectedCountry, selectedState, selectedCity]);

  // Auto-advance carousel to show running task
  useEffect(() => {
    const interval = setInterval(() => {
      const runningTaskIndex = loadingSteps.findIndex(task => task.status === 'running');
      if (runningTaskIndex !== -1) {
        setCurrentTaskIndex(runningTaskIndex);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [loadingSteps]);

  const validateDomain = (value: string): ParsedDomainInput | null => {
    const result = validateDomainInput(value);
    setDomainError(result.error);
    return result.parsed;
  };

  const handleDomainChange = (value: string) => {
    setDomain(value);
    if (value) {
      validateDomain(value);
      return;
    }

    setDomainError('');
  };

  const checkDomain = async (
    parsedDomain?: ParsedDomainInput | null
  ): Promise<DomainCheckResult | null> => {
    if (!domain.trim()) {
      toast({
        title: "Domain required",
        description: "Please enter a domain",
        variant: "destructive"
      });
      return null;
    }

    const normalizedDomain = parsedDomain || validateDomain(domain.trim());
    if (!normalizedDomain) {
      return null;
    }

    // Don't show loading state for domain check - it should be silent
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/domain/check/${encodeURIComponent(normalizedDomain.hostname)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });
      const result: DomainCheckResult = await response.json();
      
      // Don't show toast messages for domain check - they will be shown in handleSubmit
      return result;
    } catch (error) {
      console.error('Error checking domain:', error);
      toast({
        title: "Error",
        description: "Failed to check domain status",
        variant: "destructive"
      });
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedDomain = validateDomain(domain);
    if (!parsedDomain || !selectedCountry) {
      toast({
        title: "Required fields missing",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    const submittedDomain = parsedDomain.normalizedUrl;
    setDomain(parsedDomain.normalizedHostname);

    // Validate advanced filters if shown
    if (showAdvanced) {
      const keywords = customKeywords.split(',').map(k => k.trim()).filter(k => k);
      const phrases = intentPhrases.split(',').map(p => p.trim()).filter(p => p);

      if (keywords.length > 5 || phrases.length > 5) {
        toast({
          title: "Too many items",
          description: "Maximum 5 items allowed for keywords and phrases",
          variant: "destructive"
        });
        return;
      }
    }

    // Save custom keywords and phrases to localStorage before proceeding
    if (customKeywords.trim()) {
      localStorage.setItem('customKeywords', customKeywords.trim());
    }
    if (intentPhrases.trim()) {
      localStorage.setItem('intentPhrases', intentPhrases.trim());
    }
    
    // Save advanced keywords from advanced options to localStorage for processing in DomainExtraction
    if (showAdvanced && customKeywords.trim()) {
      localStorage.setItem('advancedKeywords', customKeywords.trim());
    }

    // Begin submitting state for silent domain check + fast paths
    setIsSubmitting(true);

    // First check if domain exists BEFORE showing any loading
    console.log('Checking domain existence before proceeding...');
    const domainCheck = await checkDomain(parsedDomain);
    if (!domainCheck) {
      setIsSubmitting(false);
      return;
    }

    // If domain already exists, proceed directly without any loading
    if (domainCheck.exists && domainCheck.domainId) {
      console.log('Existing domain found, proceeding directly');
      
      // Process custom keywords for existing domains before proceeding
      if (customKeywords.trim()) {
        console.log('Processing custom keywords for existing domain...');
        try {
          const keywords = customKeywords.split(',').map(k => k.trim()).filter(k => k);
          
          // Process each custom keyword with AI analysis
          for (const keyword of keywords) {
            try {
              // First analyze the keyword using AI
              const analyzeResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/analyze`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({
                  keyword: keyword,
                  domain: submittedDomain,
                  location: location || 'Global',
                  domainId: domainCheck.domainId
                })
              });

              if (!analyzeResponse.ok) {
                console.error(`Failed to analyze custom keyword "${keyword}"`);
                continue;
              }

              const analysisResult = await analyzeResponse.json();
              
              if (!analysisResult.success) {
                console.error(`Analysis failed for custom keyword "${keyword}":`, analysisResult.error);
                continue;
              }

              // Save the analyzed keyword to the database
              const saveResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/keywords/${domainCheck.domainId}/custom`, {
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
                console.error(`Failed to save custom keyword "${keyword}"`);
                continue;
              }

              const saveResult = await saveResponse.json();
              
              if (!saveResult.success) {
                console.error(`Save failed for custom keyword "${keyword}":`, saveResult.error);
                continue;
              }

              console.log(`Successfully analyzed and saved custom keyword "${keyword}" to database`);
            } catch (error) {
              console.error(`Failed to process custom keyword "${keyword}":`, error);
            }
          }
        } catch (error) {
          console.error('Error processing custom keywords for existing domain:', error);
        }
      }
      
      // Process custom phrases for existing domains before proceeding
      if (intentPhrases.trim()) {
        console.log('Processing custom phrases for existing domain...');
        try {
          const phrases = intentPhrases.split(',').map(p => p.trim()).filter(p => p);
          
          // Process each custom phrase with AI analysis
          for (const phrase of phrases) {
            try {
              const response = await fetch(`${import.meta.env.VITE_API_URL}/api/enhanced-phrases/${domainCheck.domainId}/custom-phrase`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({
                  phrase: phrase
                })
              });

              if (response.ok) {
                const result = await response.json();
                if (result.success) {
                  console.log(`Successfully analyzed custom phrase "${phrase}" with AI, extracted keyword, and saved to database`);
                }
              }
            } catch (error) {
              console.error(`Failed to process custom phrase "${phrase}":`, error);
            }
          }
        } catch (error) {
          console.error('Error processing custom phrases for existing domain:', error);
        }
      }
      
      // Show success message
      toast({
        title: "Domain Found",
        description: "Continuing with existing domain analysis",
      });
      
      setIsSubmitting(false);
      // Proceed directly to next step with existing domain ID
      onNext(domainCheck.domainId);
      return;
    }

    // For new domains, show loading and run validation steps
    console.log('New domain detected, starting validation process...');
    setIsLoading(true);
    setIsSubmitting(false);

    // Run step-by-step validation for new domains only
    const steps = [...loadingSteps];
    let domainId: number | null = null;
    
    try {
      // Step 1: Domain Validation
      steps[0] = { ...steps[0], status: 'running' };
      setLoadingSteps([...steps]);
      
      for (let progress = 0; progress <= 100; progress += 20) {
        steps[0] = { ...steps[0], progress };
        setLoadingSteps([...steps]);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const validationResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/domain-validation/validate-domain`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain: submittedDomain })
      });
      
      const validationResult = await validationResponse.json();
      
      if (!validationResult.success) {
        steps[0] = { ...steps[0], status: 'failed', progress: 100 };
        setLoadingSteps([...steps]);
        toast({
          title: "Domain Validation Failed",
          description: validationResult.error,
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }
      
      steps[0] = { ...steps[0], status: 'completed', progress: 100 };
      setLoadingSteps([...steps]);
      await new Promise(resolve => setTimeout(resolve, 300));

      // Step 2: SSL Certificate Check
      steps[1] = { ...steps[1], status: 'running' };
      setLoadingSteps([...steps]);
      
      for (let progress = 0; progress <= 100; progress += 20) {
        steps[1] = { ...steps[1], progress };
        setLoadingSteps([...steps]);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const sslResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/domain-validation/check-ssl`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain: submittedDomain })
      });
      
      const sslResult = await sslResponse.json();
      
      if (!sslResult.success) {
        steps[1] = { ...steps[1], status: 'failed', progress: 100 };
        setLoadingSteps([...steps]);
        toast({
          title: "SSL Check Failed",
          description: sslResult.error,
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }
      
      steps[1] = { ...steps[1], status: 'completed', progress: 100 };
      setLoadingSteps([...steps]);
      await new Promise(resolve => setTimeout(resolve, 300));

      // Step 3: Server Response Analysis
      steps[2] = { ...steps[2], status: 'running' };
      setLoadingSteps([...steps]);
      
      for (let progress = 0; progress <= 100; progress += 20) {
        steps[2] = { ...steps[2], progress };
        setLoadingSteps([...steps]);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const serverResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/domain-validation/analyze-server`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain: submittedDomain })
      });
      
      const serverResult = await serverResponse.json();
      
      if (!serverResult.success) {
        steps[2] = { ...steps[2], status: 'failed', progress: 100 };
        setLoadingSteps([...steps]);
        toast({
          title: "Server Analysis Failed",
          description: serverResult.error,
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }
      
      steps[2] = { ...steps[2], status: 'completed', progress: 100 };
      setLoadingSteps([...steps]);
      await new Promise(resolve => setTimeout(resolve, 300));

      // Step 4: Geo-location Configuration with AI Analysis (This creates the domain in DB)
      steps[3] = { ...steps[3], status: 'running' };
      setLoadingSteps([...steps]);
      
      for (let progress = 0; progress <= 100; progress += 20) {
        steps[3] = { ...steps[3], progress };
        setLoadingSteps([...steps]);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const geoResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/domain-validation/configure-geo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          domain: submittedDomain, 
          location, 
          customKeywords, 
          intentPhrases, 
          chatModel, 
          runAllModels 
        })
      });
      
      const geoResult = await geoResponse.json();
      
      if (!geoResult.success) {
        steps[3] = { ...steps[3], status: 'failed', progress: 100 };
        setLoadingSteps([...steps]);
        toast({
          title: "Geo-location Configuration Failed",
          description: geoResult.error,
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }
      
      const createdDomainId: number = geoResult.domainId;
      console.log('DomainSubmission - Created domain ID:', createdDomainId);
      domainId = createdDomainId;
      steps[3] = { ...steps[3], status: 'completed', progress: 100 };
      setLoadingSteps([...steps]);
      await new Promise(resolve => setTimeout(resolve, 300));

      // All steps completed successfully
      toast({
        title: "Domain Setup Complete",
        description: "All validation steps completed successfully",
      });

      // Proceed to next step with new domain ID
      console.log('DomainSubmission - Calling onNext with domain ID:', createdDomainId);
      onNext(createdDomainId);
      
    } catch (error) {
      console.error('Error during domain validation:', error);
      toast({
        title: "Validation Error",
        description: "An error occurred during domain validation",
        variant: "destructive"
      });
      setIsLoading(false);
      return;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const selectMenuPortalTarget = typeof window !== 'undefined' ? document.body : undefined;
  const selectStyles = {
    menuPortal: (base: CSSObjectWithLabel, _props: unknown): CSSObjectWithLabel => ({ ...base, zIndex: 9999 }),
    control: (base: CSSObjectWithLabel) => ({ 
      ...base, 
      minHeight: '48px', 
      fontSize: '14px',
      borderColor: '#d1d5db',
      '&:hover': {
        borderColor: '#3b82f6'
      },
      '&:focus-within': {
        borderColor: '#3b82f6',
        boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.1)'
      }
    }),
    option: (base: CSSObjectWithLabel, state: { isSelected?: boolean; isFocused?: boolean }) => ({
      ...base,
      backgroundColor: state.isSelected ? '#3b82f6' : state.isFocused ? '#eff6ff' : 'white',
      color: state.isSelected ? 'white' : '#374151',
      '&:hover': {
        backgroundColor: state.isSelected ? '#3b82f6' : '#eff6ff'
      }
    }),
    placeholder: (base: CSSObjectWithLabel) => ({
      ...base,
      color: '#9ca3af'
    })
  };

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
              Domain Setup in Progress
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Setting up your domain for analysis
            </p>
          </div>

          {/* Domain Info */}
          <div className="mb-8 p-6 bg-blue-50 rounded-2xl border border-blue-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-base font-medium text-blue-900">Target Domain: {domain}</span>
              <span className="text-sm text-blue-700 font-medium">{selectedCountry?.label}</span>
            </div>
            {customKeywords && (
              <div className="text-sm text-blue-800 font-medium">
                Focus Keywords: {customKeywords}
              </div>
            )}
          </div>

          {/* Apple-style Carousel */}
          <div className="relative h-24 mb-8 overflow-hidden">
            <div 
              className="flex transition-transform duration-1000 ease-out"
              style={{ transform: `translateX(-${currentTaskIndex * 100}%)` }}
            >
              {loadingSteps.map((task, index) => (
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
            {loadingSteps.map((task, index) => (
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
              <span className="text-base font-medium">Your data is being securely processed and encrypted</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Apple-like Hero */}
      <div className="text-center mb-8 sm:mb-10">
        <h1 className="text-4xl sm:text-5xl font-thin text-black leading-tight tracking-tight">Start your analysis</h1>
        <p className="text-base sm:text-lg text-gray-600 font-light mt-3">Enter your domain and target location</p>
      </div>

      <div className="rounded-[28px] border border-gray-100 bg-white p-6 sm:p-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
          {/* Domain Input */}
          <div className="space-y-3">
            <label className="block text-base font-light text-black">
              Domain
            </label>
            <div className="relative">
              <input
                type="text"
                value={domain}
                onChange={(e) => handleDomainChange(e.target.value)}
                placeholder="example.org or brand.co.uk"
                className={`w-full px-4 py-3 text-base font-light rounded-2xl border ${domainError ? 'border-red-300' : 'border-gray-200'} bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all`}
                required
              />
            </div>
            {domainError && <p className="text-red-500 text-sm font-light mt-2">{domainError}</p>}
          </div>

          {/* Location Input */}
          <div className="space-y-3">
            <label className="block text-base font-light text-black">
              Target Location
            </label>
            <select
              value={selectedCountry?.value || ''}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const country = countryOptions.find(c => c.value === e.target.value);
                setSelectedCountry(country || null);
                setSelectedState(null);
                setSelectedCity(null);
              }}
              className="w-full px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
              required
            >
              <option value="">Select country</option>
              {countryOptions.map(country => (
                <option key={country.value} value={country.value}>{country.label}</option>
              ))}
            </select>
          </div>

          {/* Optional State/City - Only show if country is selected */}
          {selectedCountry && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-light text-gray-700">
                  State
                </label>
                <select
                  value={selectedState?.value || ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const state = stateOptions.find(s => s.value === e.target.value);
                    setSelectedState(state || null);
                    setSelectedCity(null);
                  }}
                className="w-full px-3 py-2 text-sm font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                >
                  <option value="">Optional</option>
                  {stateOptions.map(state => (
                    <option key={state.value} value={state.value}>{state.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-light text-gray-700">
                  City
                </label>
                <select
                  value={selectedCity?.value || ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const city = cityOptions.find(c => c.value === e.target.value);
                    setSelectedCity(city || null);
                  }}
                  disabled={!selectedState}
                className="w-full px-3 py-2 text-sm font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all disabled:opacity-40"
                >
                  <option value="">Optional</option>
                  {cityOptions.map(city => (
                    <option key={city.value} value={city.value}>{city.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Advanced Options - Simplified */}
          <div className="border-t border-gray-100 pt-5 sm:pt-6">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-gray-600 hover:text-gray-900 font-light text-base transition-colors"
            >
              Advanced Options
              <ArrowRight className={`w-5 h-5 ml-3 transition-transform duration-300 ${showAdvanced ? 'rotate-90' : ''}`} />
            </button>

            {showAdvanced && (
              <div className="mt-6 space-y-4 animate-fadeIn">
                <div className="space-y-2">
                  <label className="block text-sm font-light text-gray-700">
                    Keywords
                  </label>
                  <input
                    type="text"
                    value={customKeywords}
                    onChange={(e) => setCustomKeywords(e.target.value)}
                    placeholder="keyword1, keyword2"
                    className="w-full px-3 py-2 text-sm font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-gray-500">
                    Enter keywords separated by commas. These will be analyzed with AI and added to your keyword analysis.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-light text-gray-700">
                    Intent Phrases
                  </label>
                  <input
                    type="text"
                    value={intentPhrases}
                    onChange={(e) => setIntentPhrases(e.target.value)}
                    placeholder="how to, best way to"
                    className="w-full px-3 py-2 text-sm font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-gray-500">
                    Enter intent phrases separated by commas. These will be used to guide the AI analysis.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-light text-gray-700">
                    Model
                  </label>
                  <select
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-light border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 appearance-none bg-gray-50 focus:bg-white transition-all duration-300"
                  >
                    {chatModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={runAllModels}
                    onChange={(e) => setRunAllModels(e.target.checked)}
                    className="w-4 h-4 text-black border border-gray-300 rounded-md focus:ring-black focus:ring-2 transition-all"
                  />
                  <span className="text-sm font-light text-gray-700">Run all models</span>
                </label>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-3 sm:pt-4">
            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className={`w-full py-3 px-5 bg-black text-white text-base font-medium rounded-full hover:bg-black/90 focus:outline-none focus:ring-4 focus:ring-black/10 transition-all shadow ${
                isSubmitting || isLoading ? 'opacity-60 cursor-not-allowed hover:-translate-y-0' : ''
              }`}
            >
              {isSubmitting && (
                <span className="inline-flex items-center">
                  <svg className="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                  </svg>
                  Starting...
                </span>
              )}
              {!isSubmitting && 'Start Analysis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DomainSubmission;
