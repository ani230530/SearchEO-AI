import React from 'react';

interface TimelinePage {
  pageId: number;
  pageType: 'pillar' | 'subpage';
  status: 'pending' | 'generating' | 'completed' | 'failed';
  primaryKeyword?: string;
  progress?: number;
  hasHtml?: boolean;
  streamingMessage?: string;
}

interface GenerationTimelineProps {
  topicId: number;
  topicTitle: string;
  jobId: string;
  pages: TimelinePage[];
  streamingMessage?: string;
}

const GenerationTimeline: React.FC<GenerationTimelineProps> = ({
  topicTitle,
  pages,
  streamingMessage,
}) => {
  const completedCount = pages.filter(p => p.status === 'completed' || p.hasHtml).length;
  const totalCount = pages.length;

  return (
    <div className="relative">
      {/* Background with purple gradient */}
      <div className="relative bg-gradient-to-br from-purple-50 via-indigo-50 to-purple-50 rounded-3xl border border-purple-100/50 p-6 backdrop-blur-sm overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-purple-200 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-indigo-200 rounded-full blur-3xl" />
        </div>

        {/* Content */}
        <div className="relative z-10">
          {/* Topic Title */}
          <div className="mb-6">
            <h3 
              className="text-2xl font-extralight text-gray-900 mb-2"
              style={{ 
                letterSpacing: '-0.011em',
                background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #8b5cf6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              {topicTitle}
            </h3>
            <div className="flex items-center gap-3 text-xs font-light text-gray-500">
              <span>{completedCount} of {totalCount} pages complete</span>
              {streamingMessage && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-purple-600 truncate max-w-md">{streamingMessage}</span>
                </>
              )}
            </div>
          </div>

          {/* Horizontal Timeline */}
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute top-6 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-200 via-purple-300 to-purple-200" />
            
            {/* Page Nodes */}
            <div className="relative flex items-center justify-between gap-4">
              {pages.map((page, index) => {
                const isCompleted = page.status === 'completed' || page.hasHtml;
                const isGenerating = page.status === 'generating' || page.status === 'pending';
                const isFailed = page.status === 'failed';
                
                return (
                  <div key={page.pageId} className="flex-1 flex flex-col items-center">
                    {/* Node */}
                    <div className="relative z-20">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                          isCompleted
                            ? 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-200'
                            : isGenerating
                            ? 'bg-gradient-to-br from-purple-400 to-indigo-500 shadow-md shadow-purple-200 animate-pulse'
                            : isFailed
                            ? 'bg-red-400'
                            : 'bg-gray-200'
                        }`}
                      >
                        {isCompleted ? (
                          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : isGenerating ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : isFailed ? (
                          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <div className="w-3 h-3 bg-gray-400 rounded-full" />
                        )}
                      </div>
                      
                      {/* Progress ring for generating */}
                      {isGenerating && (
                        <div className="absolute inset-0 rounded-full border-2 border-purple-300 animate-ping opacity-75" />
                      )}
                    </div>

                    {/* Page Label */}
                    <div className="mt-3 text-center min-w-0">
                      <div className={`text-xs font-light truncate max-w-[120px] ${
                        isCompleted ? 'text-purple-700' : 
                        isGenerating ? 'text-purple-600' : 
                        isFailed ? 'text-red-600' : 
                        'text-gray-500'
                      }`}>
                        {page.pageType === 'pillar' ? 'Pillar' : `Sub ${index}`}
                      </div>
                      {page.primaryKeyword && (
                        <div className="text-[10px] text-gray-400 font-extralight truncate max-w-[120px] mt-0.5">
                          {page.primaryKeyword}
                        </div>
                      )}
                      {page.progress !== undefined && page.progress < 100 && (
                        <div className="text-[10px] text-purple-500 font-light mt-1">
                          {page.progress}%
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500 transition-all duration-500 ease-out"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenerationTimeline;

