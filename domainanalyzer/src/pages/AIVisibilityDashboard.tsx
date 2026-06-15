import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Plus,
  Globe,
  Check,
  Search,
  CalendarDays,
  ArrowUpDown,
  ChevronDown,
  Loader2,
  ExternalLink,
  Users,
  MessageSquareText,
  X
} from 'lucide-react';
import { useDomains } from '@/features/ai-results/queries';
import { logoUrl } from '@/lib/logoUrl';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { maskDomainId } from "@/lib/domainUtils";
import { resolveAIResultsNavigation } from "@/features/sidebar-dashboard/navigation";

const AIVisibilityDashboard = () => {
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { data: domainsResp, isLoading } = useDomains();
  const domains = domainsResp?.domains || [];

  const handleCheckDomain = () => {
    if (!domain.trim()) {
      setError('Domain is required');
      return;
    }
    setError('');
    // Navigate to the domain wizard, passing the prefillHost parameter
    navigate(`/audit?prefillHost=${encodeURIComponent(domain.trim())}`);
  };

  return (
    <div className="max-w-[1590px] py-4 mx-auto w-full flex-1">
      {/* Hero Banner */}
      <div className="bg-[#F9F9F9] rounded-[12px] px-10 py-10 mb-6 flex flex-col items-center justify-center text-center">
        <div className="flex-shrink-0 flex items-center justify-center mb-6">
          <img
            src="/searcheo-logo.png"
            alt="SearchEO AI Logo"
            className="w-[120px] h-[120px] object-contain"
          />
        </div>

        <div className="w-full max-w-2xl flex flex-col items-center">
          <h2 className="text-[28px] font-semibold text-[#2D3748] tracking-tight mb-2">See how AI ranks your domain</h2>
          <p className="text-[14px] text-[#718096] mb-6 font-normal">Uncover how your content appears in AI search, which keywords you're visible for, and where you're missing opportunities.</p>

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center w-full max-w-[560px]">
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Globe className={`w-5 h-5 ${error ? 'text-red-400' : 'text-[#A0AEC0]'}`} />
              </div>
              <input
                type="text"
                placeholder={error || "https://domain.com/"}
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCheckDomain();
                }}
                className={`w-full pl-11 pr-4 py-3 bg-white border ${error ? 'border-red-500 placeholder:text-red-500 focus:ring-red-500' : 'border-[#E2E8F0] placeholder:text-[#A0AEC0] focus:ring-[#3B5B9C]'} rounded-[8px] text-[15px] text-[#2D3748] focus:outline-none focus:ring-2 focus:border-transparent transition-all shadow-sm leading-normal h-12`}
              />
            </div>
            <button 
              onClick={handleCheckDomain}
              className="px-6 h-12 text-white text-[15px] font-medium rounded-[8px] transition-opacity hover:opacity-90 flex items-center justify-center gap-2 flex-shrink-0"
              style={{
                background: 'linear-gradient(90deg, #2D4059 0%, #4C74C2 100%)',
                boxShadow: '0px 1px 2px 0px #1018280D',
                border: 'none'
              }}
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} />
              Check your domain
            </button>
          </div>
        </div>
      </div>

      {/* Recent Queries Section */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-base font-bold text-gray-900">Your recent queries</h3>

          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search Domains..."
                className="w-[240px] pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4361EE] focus:border-transparent transition-all shadow-sm"
              />
            </div>

            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm">
              <CalendarDays className="w-4 h-4 text-gray-400" />
              Select Duration
            </button>

            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm">
              <ArrowUpDown className="w-4 h-4 text-gray-400" />
              Sort
            </button>
          </div>
        </div>

        {/* Query Cards List */}
        <div className="flex flex-col gap-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-[#4361EE] animate-spin" />
            </div>
          ) : domains.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No recent queries found. Check your domain above to get started!
            </div>
          ) : (
            domains.map((d) => {
              const health = d.metrics?.overallHealth ?? 0;
              const sov = d.metrics?.shareOfVoice ?? 0;
              const accuracy = d.metrics?.brandAccuracy ?? 0;
              const mentions = d.metrics?.mentions ?? 0;
              const sentimentVal = d.metrics?.brandSentiment ?? 5;
              
              let sentimentText = 'Neutral';
              let sentimentColor = 'text-gray-900';
              if (sentimentVal > 6) {
                sentimentText = 'Positive';
                sentimentColor = 'text-green-600';
              } else if (sentimentVal < 4) {
                sentimentText = 'Negative';
                sentimentColor = 'text-red-600';
              }

              const logo = logoUrl(d.host || d.url, 64) || null;

              return (
                <div key={d.id} onClick={() => navigate(`/ai-results/${d.id}`)} className="bg-white rounded-xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 transition-all hover:shadow-md cursor-pointer">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      {logo ? (
                        <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 border border-gray-100 overflow-hidden">
                          <img src={logo} alt={d.host || d.url} className="w-full h-full object-contain" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center shrink-0 border border-blue-100/50">
                          <Globe className="w-6 h-6 text-blue-500" />
                        </div>
                      )}
                      <div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -ml-1 transition-colors group" onClick={(e) => e.stopPropagation()}>
                              <h4 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{d.companyName || d.host || d.url}</h4>
                              <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                            </div>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-64 p-2 rounded-xl border border-gray-100 shadow-lg" align="start" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center px-2 py-2 mb-1 border-b border-gray-50">
                              <span className="text-sm font-semibold text-gray-900">{d.companyName || d.host || d.url}</span>
                              <DropdownMenuItem className="p-1 cursor-pointer rounded-full hover:bg-gray-100 flex-shrink-0 !h-auto" onSelect={(e) => e.preventDefault()}>
                                <X className="w-4 h-4 text-gray-500" />
                              </DropdownMenuItem>
                            </div>
                            <DropdownMenuItem 
                              className="flex items-center gap-3 px-2 py-2.5 text-sm font-medium text-gray-700 cursor-pointer rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(resolveAIResultsNavigation("ai-results", maskDomainId(d.id)));
                              }}
                            >
                              <Sparkles className="w-4 h-4 text-gray-400" />
                              AI Results
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="flex items-center gap-3 px-2 py-2.5 text-sm font-medium text-gray-700 cursor-pointer rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(resolveAIResultsNavigation("competitors", maskDomainId(d.id)));
                              }}
                            >
                              <Users className="w-4 h-4 text-gray-400" />
                              Competitor Intelligence
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="flex items-center gap-3 px-2 py-2.5 text-sm font-medium text-gray-700 cursor-pointer rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(resolveAIResultsNavigation("prompts", maskDomainId(d.id)));
                              }}
                            >
                              <MessageSquareText className="w-4 h-4 text-gray-400" />
                              Prompts Research
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <a href={d.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 mt-1 text-[11px] text-blue-500 font-medium bg-blue-50 hover:bg-blue-100 transition-colors px-2 py-0.5 rounded">
                          {d.url}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {!d.lastAnalyzed ? (
                      <div className="w-8 h-8 rounded-full border border-yellow-100 bg-yellow-50 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center border border-green-100">
                        <Check className="w-5 h-5 text-green-500" />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-5 gap-6 pt-6 border-t border-gray-100">
                    <div className="col-span-2">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-xs font-semibold text-gray-600">Overall Website health</span>
                        <span className="text-xl font-bold text-[#4361EE]">{health}%</span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#4361EE] rounded-full" style={{ width: `${health}%` }}></div>
                      </div>
                    </div>

                    <div className="flex flex-col justify-between">
                      <span className="text-xs font-semibold text-gray-600">Share Of Voice</span>
                      <span className="text-xl font-bold text-gray-900 mt-1">{sov}</span>
                    </div>

                    <div className="flex flex-col justify-between">
                      <span className="text-xs font-semibold text-gray-600">Brand Sentiment</span>
                      <span className={`text-xl font-bold ${sentimentColor} mt-1`}>{sentimentText}</span>
                    </div>

                    <div className="flex flex-col justify-between">
                      <span className="text-xs font-semibold text-gray-600">Brand accuracy</span>
                      <span className="text-xl font-bold text-gray-600 mt-1">{accuracy}%</span>
                    </div>

                    <div className="flex flex-col justify-between text-right">
                      <span className="text-xs font-semibold text-gray-600">Mentions</span>
                      <span className="text-xl font-bold text-gray-600 mt-1">{mentions}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
};

export default AIVisibilityDashboard;
