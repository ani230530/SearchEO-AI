import React from 'react';
import { Topic, GenerationPageStatus, GenerationStreamingEvent } from '../../types';
import { Target, FileText, Sparkles, Plus, Trash2, Search, Zap, Pencil, Check, X, AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { ButtonSpinner } from '@/components/ui/button-spinner';
import { useState } from 'react';

interface CampaignTopicDetailProps {
  topic: Topic;
  isGenerating: boolean;
  streamingEvents: GenerationStreamingEvent[];
  generationJobs: Map<number, GenerationPageStatus>;
  onGenerateTopic: (topic: Topic) => void;
  onReferenceUrlChange: (topicId: number, url: string) => void;
  onDeletePillar: (topicId: number) => void;
  onDeleteSubPage: (subPageId: number) => void;
  onUpdatePageTitle: (pageId: number, title: string) => void;
  renderStatusPill: (pageId?: number) => React.ReactNode;
  onAddSubPage: (topicId: number) => void;
  onCreatePillar: (topicId: number) => void;
  onGenerateAiPillar: (topicId: number) => void;
  onGenerateAiSubPage: (topicId: number) => void;
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
  streamingEvents,
  generationJobs,
  onGenerateTopic,
  onReferenceUrlChange,
  onDeletePillar,
  onDeleteSubPage,
  onUpdatePageTitle,
  renderStatusPill,
  onAddSubPage,
  onGenerateAiSubPage,
  onCreatePillar,
  onGenerateAiPillar,
  onAddKeyword,
  onDeleteKeyword,
  onSelectPrimaryKeyword,
  onSelectLongtailKeyword,
  onDeselectKeyword,
  aiLoading
}) => {
  const [editingPageId, setEditingPageId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [now, setNow] = useState(() => Date.now());

  React.useEffect(() => {
    if (!isGenerating) return;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [isGenerating]);

  const getPageTone = (status: string) => {
    if (status === 'failed') {
      return {
        shell: 'border-gray-200 bg-white',
        badge: 'bg-white text-gray-700 border border-gray-200',
        progress: 'bg-gray-700',
        icon: <AlertCircle className="h-3.5 w-3.5 text-gray-500" />,
      };
    }
    if (status === 'completed' || status === 'published') {
      return {
        shell: 'border-gray-200 bg-white',
        badge: 'bg-white text-gray-700 border border-gray-200',
        progress: 'bg-gray-900',
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-gray-700" />,
      };
    }
    return {
      shell: 'border-gray-200 bg-white',
      badge: 'bg-white text-gray-700 border border-gray-200',
      progress: 'bg-black',
      icon: <LoaderCircle className="h-3.5 w-3.5 text-gray-700 animate-spin" />,
    };
  };

  const getPageStatusLabel = (status: string) => {
    if (status === 'completed') return 'Draft Ready';
    if (status === 'published') return 'Published';
    if (status === 'failed') return 'Failed';
    if (status === 'pending') return 'Queued';
    return 'Generating';
  };

  const pageProgressCards = React.useMemo(() => {
    const pages = [
      ...(topic.pillarPage ? [{ id: topic.pillarPage.id, title: topic.pillarPage.title, pageType: 'pillar' as const }] : []),
      ...(topic.subPages || []).map((page) => ({ id: page.id, title: page.title, pageType: 'subpage' as const })),
    ];

    return pages
      .map((page) => {
        const pageEvents = streamingEvents.filter((event) => event.pageId === page.id);
        const latestEvent = pageEvents[pageEvents.length - 1];
        const pageJob = generationJobs.get(page.id);
        if (!latestEvent && !pageJob) {
          return null;
        }

        return {
          ...page,
          status: latestEvent?.status || pageJob?.status || 'pending',
          phase: latestEvent?.phase || pageJob?.phase || null,
          progress: typeof latestEvent?.progress === 'number' ? latestEvent.progress : pageJob?.progress || 0,
          message:
            latestEvent?.message ||
            pageJob?.error ||
            (pageJob?.status === 'failed'
              ? 'Generation stopped before content was returned.'
              : pageJob?.status === 'completed'
              ? 'Draft ready for review.'
              : pageJob?.status === 'generating'
              ? 'Preparing your content generation...'
              : 'Queued for generation.'),
          updatedAt: latestEvent?.timestamp || pageJob?.updatedAt || null,
          draftId: pageJob?.draftId,
          wordpressUrl: pageJob?.wordpressUrl || null,
        };
      })
      .filter(Boolean) as Array<{
        id: number;
        title: string;
        pageType: 'pillar' | 'subpage';
        status: string;
        phase: string | null;
        progress: number;
        message: string;
        updatedAt: string | null;
        draftId?: number;
        wordpressUrl?: string | null;
      }>;
  }, [generationJobs, streamingEvents, topic.pillarPage, topic.subPages]);

  const pageProgressById = React.useMemo(
    () => new Map(pageProgressCards.map((card) => [card.id, card])),
    [pageProgressCards]
  );

  const renderInlineProgressPanel = (pageId: number) => {
    const card = pageProgressById.get(pageId);
    if (!card) return null;

    const tone = getPageTone(card.status);
    const lastUpdatedAt = card.updatedAt ? new Date(card.updatedAt).getTime() : null;
    const isDelayed = card.status === 'generating' && lastUpdatedAt !== null && now - lastUpdatedAt >= 7 * 60 * 1000;
    const normalizedProgress =
      card.status === 'failed'
        ? Math.max(card.progress || 0, 10)
        : Math.max(card.progress || 0, card.status === 'completed' || card.status === 'published' ? 100 : 6);
    const visibleMessage = isDelayed
      ? 'Still working. Updates are taking longer than usual.'
      : card.message;

    return (
      <div className={`mt-4 rounded-[16px] border px-3 py-2.5 shadow-[0_4px_14px_rgba(15,23,42,0.03)] transition-all duration-300 ${tone.shell}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {tone.icon}
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">Progress</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge}`}>
                {getPageStatusLabel(card.status)}
              </span>
              {isDelayed && (
                <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  Delayed
                </span>
              )}
              {card.phase && (
                <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {card.phase}
                </span>
              )}
            </div>
          </div>
          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {Math.min(100, normalizedProgress)}%
          </span>
        </div>

        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${tone.progress} ${card.status === 'generating' ? 'animate-pulse' : ''}`}
            style={{ width: `${Math.min(100, normalizedProgress)}%` }}
          />
        </div>

        <div className="mt-2.5 flex items-start gap-2">
          <div className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
          <p className="min-w-0 text-[12px] leading-5 text-gray-500">{visibleMessage}</p>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400">
          <span>
            {card.updatedAt
              ? `Updated ${new Date(card.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : card.status === 'generating'
              ? 'Waiting for the first progress update'
              : 'No update yet'}
          </span>
          <div className="flex items-center gap-2">
            {card.draftId && (
              <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500">
                Draft #{card.draftId}
              </span>
            )}
            {card.wordpressUrl && (
              <a
                href={card.wordpressUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Live page
              </a>
            )}
          </div>
        </div>
      </div>
    );
  };

  const startEditing = (pageId: number, currentTitle: string) => {
    setEditingPageId(pageId);
    setEditingTitle(currentTitle);
  };

  const cancelEditing = () => {
    setEditingPageId(null);
    setEditingTitle("");
  };

  const handleSaveTitle = (pageId: number) => {
    if (editingTitle.trim()) {
      onUpdatePageTitle(pageId, editingTitle.trim());
      setEditingPageId(null);
    }
  };

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
        {topic.pillarPage ? (
          <section>
            <div className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100/50 p-8 relative overflow-hidden group transition-all duration-300 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
               
               {/* Decorative background element */}
               <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-gray-50 to-white rounded-bl-full -mr-10 -mt-10 opacity-50 pointer-events-none"></div>

               <div className="flex items-start justify-between gap-6 relative z-10">
                 <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                         <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-[10px] font-semibold tracking-wide uppercase">Pillar Page</span>
                    </div>
                    {editingPageId === topic.pillarPage.id ? (
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-black/5"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTitle(topic.pillarPage!.id);
                            if (e.key === 'Escape') cancelEditing();
                          }}
                        />
                        <button
                          onClick={() => handleSaveTitle(topic.pillarPage!.id)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-full transition-all"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-full transition-all"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group/title mb-2">
                        <h4 className="text-xl font-medium text-[#1d1d1f] tracking-tight">{topic.pillarPage.title}</h4>
                        <button
                          onClick={() => startEditing(topic.pillarPage!.id, topic.pillarPage!.title)}
                          className="opacity-0 group-hover/title:opacity-100 p-1 text-gray-400 hover:text-black transition-all"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                         {renderStatusPill(topic.pillarPage.id)}
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
               
               {renderInlineProgressPanel(topic.pillarPage.id)}
               {renderKeywords(topic.pillarPage.keywords || [], 'pillar', topic.pillarPage.id)}
            </div>
          </section>
        ) : (
          <section>
            <div className="bg-gray-50 rounded-3xl border border-dashed border-gray-300 p-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="p-3 bg-white rounded-full shadow-sm">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>
              <div>
                <h4 className="text-lg font-medium text-gray-900">Missing Pillar Page</h4>
                <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
                  This topic doesn't have a pillar page. You need one to structure your content cluster.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm mx-auto">
                <button
                  onClick={() => onCreatePillar(topic.id)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 shadow-sm rounded-full text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Manual Create
                </button>
                <button
                  onClick={() => onGenerateAiPillar(topic.id)}
                  disabled={aiLoading === `pillar-${topic.id}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-black text-white shadow-sm rounded-full text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-50"
                >
                  {aiLoading === `pillar-${topic.id}` ? <ButtonSpinner /> : <Sparkles className="h-4 w-4" />}
                  Generate with AI
                </button>
              </div>
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
                        <div className="flex-1 min-w-0">
                          {editingPageId === subPage.id ? (
                            <div className="flex items-center gap-2 mb-1">
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveTitle(subPage.id);
                                  if (e.key === 'Escape') cancelEditing();
                                }}
                              />
                              <button
                                onClick={() => handleSaveTitle(subPage.id)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition-all"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="p-1 text-gray-400 hover:bg-gray-100 rounded-md transition-all"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group/subtitle mb-1">
                              <h5 className="font-medium text-[#1d1d1f] text-[15px]">{subPage.title}</h5>
                              <button
                                onClick={() => startEditing(subPage.id, subPage.title)}
                                className="opacity-0 group-hover/subtitle:opacity-100 p-1 text-gray-400 hover:text-black transition-all"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                             {renderStatusPill(subPage.id)}
                          </div>
                        </div>
                        <button 
                            onClick={() => onDeleteSubPage(subPage.id)}
                            className="opacity-100  p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    {renderInlineProgressPanel(subPage.id)}
                    {renderKeywords(subPage.keywords || [], 'subpage', subPage.id)}
                </div>
            ))}
            
            {/* Compact Add Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                 onClick={() => onAddSubPage(topic.id)}
                 className="group flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 transition-all min-h-[140px]"
              >
                 <div className="h-8 w-8 rounded-full bg-gray-50 group-hover:bg-white border border-gray-100 flex items-center justify-center mb-2 transition-colors shadow-sm">
                   <Plus className="h-4 w-4 text-gray-400 group-hover:text-black transition-colors" />
                 </div>
                 <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-900 transition-colors">Add Manually</span>
              </button>

              <button
                 onClick={() => {
                   console.log('Generate with AI clicked for topic:', topic.id);
                   onGenerateAiSubPage(topic.id);
                 }}
                 disabled={aiLoading === `subpage-${topic.id}`}
                 className="group flex flex-col items-center justify-center p-4 rounded-xl border border-gray-200 bg-black hover:bg-black/90 transition-all disabled:opacity-50 min-h-[140px]"
              >
                 <div className="h-8 w-8 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center mb-2 transition-colors shadow-sm">
                   {aiLoading === `subpage-${topic.id}` ? <ButtonSpinner /> : <Sparkles className="h-4 w-4 text-white" />}
                 </div>
                 <span className="text-xs font-semibold text-white transition-colors">Generate with AI</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
