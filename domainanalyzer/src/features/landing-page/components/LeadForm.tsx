import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2 } from "lucide-react";

export default function LeadForm() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) {
      setError("Please enter a domain URL.");
      return;
    }

    // Clean up domain input for query param (remove http/https and trailing slashes)
    let cleanDomain = domain.trim();
    cleanDomain = cleanDomain.replace(/^(https?:\/\/)?(www\.)?/, "");
    cleanDomain = cleanDomain.split("/")[0];

    setError("");
    setLoading(true);

    // Redirect to the audit wizard with prefillHost
    setTimeout(() => {
      navigate(`/audit?prefillHost=${encodeURIComponent(cleanDomain)}`);
    }, 600);
  };

  const handlePlayClick = () => {
    // Navigate directly to audit as the CTA when play button is clicked
    navigate("/audit");
  };

  return (
    <section className="relative w-full bg-gradient-to-b from-[#EBF2FE] to-[#F5F8FF] pt-12 pb-20 px-5 md:px-10 lg:px-14 xl:px-20 md:pt-14 lg:pt-16 overflow-visible select-none z-0">
      {/* Container for alignment */}
      <div className="relative z-20 max-w-[88rem] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">

        {/* Left column: Header & Input form */}
        <div className="lg:col-span-5 flex flex-col items-start text-left">
          <h3 className="landing-page-section-heading text-slate-900">
            Get your free <span className="text-[#3B82F6]">Visibility Report</span>
          </h3>
          <p className="text-slate-600 text-sm sm:text-base md:text-lg leading-relaxed mt-4 max-w-md">
            See where you rank, who's beating you, and what to fix. Free, in minutes.
          </p>

          <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col sm:flex-row gap-3 mt-8">
            <div className="flex-1 flex flex-col gap-1">
              <label htmlFor="domain-input" className="sr-only">Enter your domain</label>
              <input
                id="domain-input"
                type="text"
                placeholder="Enter your domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                disabled={loading}
                className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-[#EBF2FE] text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition duration-200 shadow-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="h-12 px-6 bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-70 text-white text-sm font-semibold rounded-xl transition duration-200 shadow-md flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                "Get My Report"
              )}
            </button>
          </form>
          {error && (
            <p className="text-[12px] text-red-500 font-medium mt-2">{error}</p>
          )}
        </div>

        {/* Right column: Interactive mock dashboard screenshot */}
        <div className="lg:col-span-7 flex justify-center items-center">
          <div className="relative w-full max-w-[620px] aspect-[16/10] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden select-none">

            {/* Window chrome / header */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              </div>
              <div className="mx-auto w-48 h-4 rounded bg-slate-100 flex items-center justify-center text-[7px] text-slate-400 font-mono">
                app.searcheo.ai/results
              </div>
            </div>

            {/* Mock Dashboard Layout */}
            <div className="flex h-full text-[8px] text-slate-800 bg-white">
              {/* Sidebar */}
              <div className="w-12 border-r border-slate-100 p-2 flex flex-col gap-3 pt-4 bg-slate-50/20">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center font-bold text-blue-500 text-[10px]">S</div>
                <div className="flex flex-col gap-2 mt-2">
                  <div className="w-full h-1.5 rounded-sm bg-slate-200" />
                  <div className="w-full h-1.5 rounded-sm bg-slate-200" />
                  <div className="w-full h-1.5 rounded-sm bg-slate-200" />
                  <div className="w-full h-1.5 rounded-sm bg-slate-200" />
                </div>
              </div>

              {/* Main Workspace content */}
              <div className="flex-1 p-4 flex flex-col gap-3">
                {/* Horizontal navigation tabs */}
                <div className="flex gap-3 border-b border-slate-100 pb-2">
                  <span className="font-semibold text-slate-900 border-b border-blue-500 pb-1 px-1">AI Visibility</span>
                  <span className="text-slate-400">Citations</span>
                  <span className="text-slate-400">Competitor Intelligence</span>
                </div>

                {/* Scorecards */}
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <div className="border border-slate-100 rounded-lg p-2 flex flex-col gap-1 bg-slate-50/30">
                    <span className="text-[6px] text-slate-400 font-medium uppercase">Share of Voice</span>
                    <div className="text-xs font-black text-slate-900">38%</div>
                  </div>
                  <div className="border border-slate-100 rounded-lg p-2 flex flex-col gap-1 bg-slate-50/30">
                    <span className="text-[6px] text-slate-400 font-medium uppercase">Keywords Tracked</span>
                    <div className="text-xs font-black text-slate-900">124</div>
                  </div>
                  <div className="border border-slate-100 rounded-lg p-2 flex flex-col gap-1 bg-slate-50/30">
                    <span className="text-[6px] text-slate-400 font-medium uppercase">Citation Index</span>
                    <div className="text-xs font-black text-slate-900">89%</div>
                  </div>
                </div>

                {/* Data table */}
                <div className="flex-1 border border-slate-100 rounded-lg p-2.5 mt-1 bg-slate-50/10 flex flex-col gap-1.5">
                  <div className="flex justify-between text-[5px] text-slate-400 uppercase font-semibold">
                    <span>Prompt / Keyword</span>
                    <span>Sentiment</span>
                    <span>Ranking</span>
                    <span>SOV</span>
                  </div>
                  <div className="flex justify-between text-[6px] border-b border-slate-100/50 pb-1 text-slate-700">
                    <span className="font-medium text-slate-900">"best domain analyzer"</span>
                    <span className="text-green-600 font-semibold bg-green-50 px-1 rounded">Positive</span>
                    <span>#1</span>
                    <span className="font-bold text-blue-500">42%</span>
                  </div>
                  <div className="flex justify-between text-[6px] border-b border-slate-100/50 pb-1 text-slate-700">
                    <span className="font-medium text-slate-900">"chatgpt seo tools"</span>
                    <span className="text-green-600 font-semibold bg-green-50 px-1 rounded">Positive</span>
                    <span>#2</span>
                    <span className="font-bold text-blue-500">38%</span>
                  </div>
                  <div className="flex justify-between text-[6px] text-slate-700">
                    <span className="font-medium text-slate-900">"ai search rankings"</span>
                    <span className="text-yellow-600 font-semibold bg-yellow-50 px-1 rounded">Neutral</span>
                    <span>#3</span>
                    <span className="font-bold text-blue-500">18%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Play Walkthrough Video overlay */}
            <div
              onClick={handlePlayClick}
              className="absolute inset-0 bg-slate-900/10 backdrop-blur-[0.5px] flex items-center justify-center cursor-pointer group transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-full bg-slate-950/60 flex items-center justify-center text-white shadow-xl transition-all duration-300 group-hover:bg-slate-950/80 group-hover:scale-105">
                {/* Play Triangle SVG */}
                <svg className="w-5 h-5 fill-current ml-1" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
