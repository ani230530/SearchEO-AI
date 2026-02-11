import React from 'react';
import { Topic, GenerationPageStatus } from '../../types';
import { Target, FileText, Sparkles, Plus, Trash2, Search, Zap } from 'lucide-react';
import { ButtonSpinner } from '@/components/ui/button-spinner';
import { StreamingOverlay } from './StreamingOverlay';

interface CampaignTopicDetailProps {
  topic: Topic;
  isGenerating: boolean;
  streamingMessages: Array<{ message: string; timestamp: string }>;
  jobId?: string;
  generationJobs: Map<number, GenerationPageStatus>;
  onGenerateTopic: (topic: Topic) => void;
  onReferenceUrlChange: (topicId: number, url: string) => void;
  onDeletePillar: (topicId: number) => void;
  onDeleteSubPage: (subPageId: number) => void;
  renderStatusPill: (pageId?: number) => React.ReactNode;
  onAddSubPage: (topicId: number) => void;
  onAddKeyword: (type: 'pillar' | 'subpage', topicId: number, pageId: number, isAi: boolean, keywordSection?: 'primary' | 'longtail') => void;
  onDeleteKeyword: (context: { type: 'pillar' | 'subpage'; topicId: number; pageId: number }, keywordId: number) => void;
  onSelectPrimaryKeyword: (keywordId: number) => void;
  onSelectLongtailKeyword: (keywordId: number) => void;
  onDeselectKeyword: (keywordId: number) => void;
  aiLoading: string | null;
}

export const CampaignTopicDetail: React.FC<CampaignTopicDetailProps> = ({
  topic,
  isGenerating,
  streamingMessages,
  jobId,
  generationJobs,
  onGenerateTopic,
  onReferenceUrlChange,
  onDeletePillar,
  onDeleteSubPage,
  renderStatusPill,
  onAddSubPage,
  onAddKeyword,
  onDeleteKeyword,
  onSelectPrimaryKeyword,
  onSelectLongtailKeyword,
  onDeselectKeyword,
  aiLoading
}) => {

const renderKeywords = (
  keywords: any[],
  type: 'pillar' | 'subpage',
  pageId: number
) => {
  const primary = keywords.filter((k) => k.aiMetadata?.isPrimary);
  const longtail = keywords.filter((k) => k.aiMetadata?.isLongtail);
  const others = keywords.filter((k) => !k.aiMetadata?.isPrimary && !k.aiMetadata?.isLongtail);

  const KeywordChip = ({ k }: { k: any }) => {
    // Determine the variant dynamically
    const variant: 'primary' | 'longtail' | 'default' = k.aiMetadata?.isPrimary
      ? 'primary'
      : k.aiMetadata?.isLongtail
      ? 'longtail'
      : 'default';

    return (
      <div
        key={k.id}
        className={`group relative flex items-center pr-3 pl-3 py-1.5 rounded-full text-sm font-medium  border cursor-pointer
          ${variant === 'primary'
            ? 'bg-white text-black border-black shadow-sm'
            : variant === 'longtail'
            ? 'bg-gray-50 text-gray-700 border border-gray-200'
            : 'bg-white text-gray-500 border-dashed border-gray-300'
          }
        `}
        title={k.term}
      >
        {/* Keyword Text */}
        <span className="whitespace-normal">{k.term}</span>

        {/* Action Overlay */}
        <div className="flex items-center gap-1 ml-2">
          {/* Only show Make Primary if not already primary */}
          {!k.aiMetadata?.isPrimary && (
            <button
              onClick={() => onSelectPrimaryKeyword(k.id)}
              title="Make Primary"
              className="p-1 hover:text-blue-500 rounded"
            >
              <Target className="h-4 w-4" />
            </button>
          )}

          {/* Only show Make Longtail if not already longtail */}
          {!k.aiMetadata?.isLongtail && (
            <button
              onClick={() => onSelectLongtailKeyword(k.id)}
              title="Make Longtail"
              className="p-1 hover:text-purple-500 rounded"
            >
              <FileText className="h-4 w-4" />
            </button>
          )}

          <button
            onClick={() => onDeselectKeyword(k.id)}
            title="Reset"
            className="p-1 hover:text-orange-500 rounded"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            onClick={() => onDeleteKeyword({ type, topicId: topic.id, pageId }, k.id)}
            title="Delete"
            className="p-1 hover:text-red-500 rounded"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderGroup = (list: any[], label: string) => (
    <div className="mb-3">
      <div className="text-xs font-semibold text-gray-400 mb-1">{label}</div>
      <div className="flex flex-wrap gap-2">
        {list.map((k) => (
          <KeywordChip key={k.id} k={k} />
        ))}
      </div>
    </div>
  );


      return (
        <div className="space-y-4 mt-6">
             {/* Primary & Longtail Mixed for cleaner look */}
             <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Keywords</span>
                    <div className="flex items-center gap-2">
                         <button onClick={() => onAddKeyword(type, topic.id, pageId, true, 'longtail')} disabled={aiLoading === `keyword-${pageId}`} className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
                            {aiLoading === `keyword-${pageId}` ? <div className="h-3 w-3 text-blue-600 flex items-center justify-center"><ButtonSpinner /></div> : <Sparkles className="h-3 w-3"/>} 
                            AI Suggest
                         </button>
                         <div className="h-3 w-[1px] bg-gray-200"></div>
                         <button onClick={() => onAddKeyword(type, topic.id, pageId, false, 'primary')} className="text-[10px] text-gray-500 hover:text-black flex items-center gap-1 transition-colors">
                            <Plus className="h-3 w-3"/> Add
                         </button>
                     </div>
                </div>

                <div className="flex flex-wrap gap-2">
                     {/* Show message if no keywords */}
                     {keywords.length === 0 && (
                         <div className="text-xs text-gray-400 italic py-1 font-light">No keywords assigned yet.</div>
                     )}
{primary.map(k => <KeywordChip key={k.id} k={k} />)}
{longtail.map(k => <KeywordChip key={k.id} k={k} />)}
{others.map(k => <KeywordChip key={k.id} k={k} />)}

                </div>
             </div>
        </div>
      );
  };


  return (
    <div className="relative h-full flex flex-col min-w-0">
      <StreamingOverlay isVisible={isGenerating} messages={streamingMessages} jobId={jobId} />

      {/* Modern Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider">Topic Cluster</span>
          </div>
          <h2 className="text-3xl font-light text-[#1d1d1f] tracking-tight leading-tight">{topic.title}</h2>
          <p className="text-sm text-gray-400 mt-1 font-light tracking-wide">{topic.subPages?.length || 0} sub-pages configured</p>
        </div>
        <button
          onClick={() => onGenerateTopic(topic)}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-black/90  disabled:opacity-60 transition"
        >
          {isGenerating ? (
             <>
               <div className="scale-75"><ButtonSpinner /></div> <span className="text-xs">Generating...</span>
             </>
          ) : (
             <>
               <Zap className="h-4 w-4 fill-white text-white group-hover:scale-110 transition-transform" /> 
               <span>Generate Content</span>
             </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-10 pb-24 pr-2">
        {/* Pillar Page Card (Hero) */}
        {topic.pillarPage && (
          <section>
            <div className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100/50 p-8 relative overflow-hidden group transition-all duration-300 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
               
               {/* Decorative background element */}
               <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-gray-50 to-white rounded-bl-full -mr-10 -mt-10 opacity-50 pointer-events-none"></div>

               <div className="flex items-start justify-between gap-6 relative z-10">
                 <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                         <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-[10px] font-semibold tracking-wide uppercase">Pillar Page</span>
                    </div>
                    <h4 className="text-xl font-medium text-[#1d1d1f] mb-2 tracking-tight">{topic.pillarPage.title}</h4>
                    <div className="flex items-center gap-2">
                         {renderStatusPill(topic.pillarPage.id)}
                         {topic.pillarPage.publishStatus === 'published' && topic.pillarPage.liveUrl && (
                            <a 
                                href={topic.pillarPage.liveUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Live
                            </a>
                         )}
                    </div>
                    {/* <input
                      type="url"
                      placeholder="Add reference URL..."
                      value={topic.referenceUrl || ''}
                      onChange={(e) => onReferenceUrlChange(topic.id, e.target.value)}
                      className="w-full text-xs text-gray-500 placeholder:text-gray-300 bg-transparent border-none p-0 focus:ring-0 hover:text-gray-900 transition-colors"
                    /> */}
                 </div>
                 
                 <button 
                   onClick={() => onDeletePillar(topic.id)}
                   className="opacity-100  p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                   title="Delete Pillar Page"
                 >
                    <Trash2 className="h-4 w-4" />
                 </button>
               </div>
               
               {renderKeywords(topic.pillarPage.keywords || [], 'pillar', topic.pillarPage.id)}
            </div>
          </section>
        )}

        {/* Sub Pages Grid */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1">
               <h3 className="text-xs uppercase tracking-widest text-gray-400 font-semibold flex items-center gap-2">
                 Sub Pages
               </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {topic.subPages?.map((subPage) => (
                <div key={subPage.id} className="bg-white rounded-2xl border border-gray-100 p-6 hover:border-gray-200 shadow-sm hover:shadow-md transition-all group relative">
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                             <h5 className="font-medium text-[#1d1d1f] text-[15px] mb-1">{subPage.title}</h5>
                             <div className="flex items-center gap-2 mt-2">
                               {renderStatusPill(subPage.id)}
                               {subPage.publishStatus === 'published' && subPage.liveUrl && (
                                  <a 
                                      href={subPage.liveUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors"
                                  >
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      Live
                                  </a>
                               )}
                             </div>
                        </div>
                        <button 
                            onClick={() => onDeleteSubPage(subPage.id)}
                            className="opacity-100  p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    {renderKeywords(subPage.keywords || [], 'subpage', subPage.id)}
                </div>
            ))}
            
            {/* Elegant Add Button */}
            <button
               onClick={() => onAddSubPage(topic.id)}
               className="group flex flex-col items-center justify-center p-6 rounded-2xl border border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50/30 transition-all min-h-[200px]"
            >
               <div className="h-10 w-10 rounded-full bg-gray-50 group-hover:bg-white border border-gray-100 flex items-center justify-center mb-3 transition-colors shadow-sm">
                 <Plus className="h-5 w-5 text-gray-400 group-hover:text-black transition-colors" />
               </div>
               <span className="text-xs font-medium text-gray-500 group-hover:text-gray-900 transition-colors">Add New Sub Page</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
