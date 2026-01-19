import React from 'react';
import { Topic, GenerationPageStatus } from '@/types';
import { Target, FileText, Sparkles, Plus, Trash2, Search } from 'lucide-react';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
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

      const KeywordChip = ({ k, variant }: { k: any, variant: 'primary' | 'longtail' | 'default' }) => (
        <div
          key={k.id}
          className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-all ${
            variant === 'primary' 
                ? 'bg-black text-white border-black'
                : variant === 'longtail'
                ? 'bg-gray-100 text-gray-900 border-gray-200'
                : 'bg-white text-gray-500 border-dashed border-gray-300'
          }`}
        >
          <span className="font-medium truncate max-w-[120px]" title={k.term}>
            {k.term}
          </span>
          <div className="flex items-center gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {variant !== 'primary' && (
                 <button onClick={() => onSelectPrimaryKeyword(k.id)} title="Make Primary"><Target className="h-3 w-3" /></button>
            )}
            {variant !== 'longtail' && (
                 <button onClick={() => onSelectLongtailKeyword(k.id)} title="Make Longtail"><FileText className="h-3 w-3" /></button>
            )}
             <button onClick={() => onDeselectKeyword(k.id)} title="Deselect/Reset"><Search className="h-3 w-3" /></button>
            <button onClick={() => onDeleteKeyword({ type, topicId: topic.id, pageId }, k.id)} className="text-red-500 hover:text-red-700">
               <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      );

      return (
        <div className="space-y-3 mt-3">
             {/* Primary Section */}
             <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Primary Keyword</span>
                    <button onClick={() => onAddKeyword(type, topic.id, pageId, false, 'primary')} className="text-[10px] text-gray-400 hover:text-black flex items-center gap-1"><Plus className="h-3 w-3"/> Add</button>
                </div>
                {primary.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {primary.map(k => <KeywordChip key={k.id} k={k} variant="primary" />)}
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic py-1">No primary keyword set</div>
                )}
             </div>

             {/* Longtail Section */}
             <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Longtail Keywords</span>
                     <div className="flex items-center gap-2">
                        <button onClick={() => onAddKeyword(type, topic.id, pageId, true, 'longtail')} disabled={aiLoading === `keyword-${pageId}`} className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1">
                            {aiLoading === `keyword-${pageId}` ? <ButtonSpinner className="h-3 w-3 text-blue-600"/> : <Sparkles className="h-3 w-3"/>} AI Suggest
                        </button>
                        <button onClick={() => onAddKeyword(type, topic.id, pageId, false, 'longtail')} className="text-[10px] text-gray-400 hover:text-black flex items-center gap-1"><Plus className="h-3 w-3"/> Add</button>
                     </div>
                </div>
                {longtail.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {longtail.map(k => <KeywordChip key={k.id} k={k} variant="longtail" />)}
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic py-1">No longtail keywords</div>
                )}
             </div>

             {/* Unallocated */}
             {others.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-gray-100 border-dashed">
                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Unallocated</span>
                    <div className="flex flex-wrap gap-2">
                        {others.map(k => <KeywordChip key={k.id} k={k} variant="default" />)}
                    </div>
                </div>
             )}
        </div>
      );
  };


  return (
    <div className="relative h-full flex flex-col min-w-0">
      <StreamingOverlay isVisible={isGenerating} messages={streamingMessages} jobId={jobId} />

      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-light text-black tracking-tight">{topic.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{topic.subPages?.length || 0} sub-pages configured</p>
        </div>
        <button
          onClick={() => onGenerateTopic(topic)}
          disabled={isGenerating}
          className="px-6 py-2.5 bg-black text-white rounded-full hover:bg-black/90 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/5"
        >
          {isGenerating ? (
             <>
               <ButtonSpinner /> Generating...
             </>
          ) : (
             <>
               <Sparkles className="h-4 w-4" /> Generate Topic Content
             </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-8 pb-20">
        {/* Pillar Page Card */}
        {topic.pillarPage && (
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
               <h3 className="text-xs uppercase tracking-widest text-gray-500 font-semibold flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                 Pillar Page
               </h3>
               {renderStatusPill(topic.pillarPage.id)}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 relative overflow-hidden group hover:shadow-md transition-all duration-300">
               <div className="flex items-start justify-between gap-4">
                 <div className="flex-1">
                    <h4 className="text-lg font-medium text-gray-900 mb-1">{topic.pillarPage.title}</h4>
                    <input
                      type="url"
                      placeholder="Reference URL (optional)"
                      value={topic.referenceUrl || ''}
                      onChange={(e) => onReferenceUrlChange(topic.id, e.target.value)}
                      className="w-full text-xs text-gray-500 bg-transparent border-none p-0 focus:ring-0 placeholder:text-gray-300"
                    />
                 </div>
                 <button 
                   onClick={() => onDeletePillar(topic.id)}
                   className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
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
          <div className="flex items-center justify-between mb-3 px-1">
               <h3 className="text-xs uppercase tracking-widest text-gray-500 font-semibold flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                 Sub Pages
               </h3>
               <button 
                  onClick={() => onAddSubPage(topic.id)}
                  className="text-xs font-medium text-black hover:underline flex items-center gap-1"
               >
                 <Plus className="h-3 w-3" /> Add Page
               </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {topic.subPages?.map((subPage) => (
                <div key={subPage.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-200 hover:shadow-sm transition-all group relative">
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <h5 className="font-medium text-gray-900 text-sm">{subPage.title}</h5>
                        <div className="flex items-center gap-2">
                          {renderStatusPill(subPage.id)}
                           <button 
                            onClick={() => onDeleteSubPage(subPage.id)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                           >
                            <Trash2 className="h-3.5 w-3.5" />
                           </button>
                        </div>
                    </div>
                    {renderKeywords(subPage.keywords || [], 'subpage', subPage.id)}
                </div>
            ))}
            
            {/* Add Button Card */}
            <button
               onClick={() => onAddSubPage(topic.id)}
               className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-gray-100 text-gray-400 hover:border-gray-300 hover:text-gray-600 hover:bg-gray-50/50 transition-all min-h-[160px]"
            >
               <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                 <Plus className="h-4 w-4" />
               </div>
               <span className="text-xs font-medium">Add Sub Page</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
