import React from 'react';
import { ArrowLeft, Loader2, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { ButtonSpinner } from '@/components/ui/button-spinner';
import { CampaignTopicSidebar } from '@/features/campaign/CampaignTopicSidebar';
import { CampaignTopicDetail } from '@/features/campaign/CampaignTopicDetail';
import { CampaignTableView } from '@/features/campaign/CampaignTableView';
import CampaignGraph from '@/components/CampaignGraph';
import PublishExperience from '@/features/publish/PublishExperience';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type {
  CampaignAddKeywordContext,
  CampaignDraftStatus,
  CampaignGenerationConfig,
  CampaignSharedPublishStatus,
  CampaignStructureViewProps,
} from './CampaignStructureView';
import type {
  CampaignStructure,
  GenerationPageStatus,
  GenerationStreamingEvent,
  Keyword,
  KeywordTableItem,
  Topic,
} from '@/types';

interface CampaignStructureSurfaceProps {
  campaign: CampaignStructureViewProps['campaign'];
  onBack: CampaignStructureViewProps['onBack'];
  viewMode: CampaignStructureViewProps['viewMode'];
  onViewModeChange: CampaignStructureViewProps['onViewModeChange'];
  sidebarOpen: CampaignStructureViewProps['sidebarOpen'];
  companyDomain: CampaignStructureViewProps['companyDomain'];
  domainContext: CampaignStructureViewProps['domainContext'];
  keywordsTableData: KeywordTableItem[];
  hasWordpressIntegration: CampaignStructureViewProps['hasWordpressIntegration'];
  wpIntegration: CampaignStructureViewProps['wpIntegration'];
  onConfigureWordpress: CampaignStructureViewProps['onConfigureWordpress'];
  onRefreshWordpressIntegration: CampaignStructureViewProps['onRefreshWordpressIntegration'];
  campaignPageIdContext: CampaignStructureViewProps['campaignPageIdContext'];
  sharedPublishStatuses: Map<number, CampaignSharedPublishStatus>;
  campaignStructure: CampaignStructure;
  selectedTopicId: number | null;
  setSelectedTopicId: React.Dispatch<React.SetStateAction<number | null>>;
  selectedTopic: Topic | null;
  aiLoading: string | null;
  syncing: boolean;
  generationJobs: Map<number, GenerationPageStatus>;
  draftStatuses: Map<number, CampaignDraftStatus>;
  selectedTopics: Set<number>;
  jobIdToTopicId: Map<string, number>;
  streamingMessages: Map<string, GenerationStreamingEvent[]>;
  isTopicGenerating: (topic: Topic) => boolean;
  handleAddTopic: (isAi: boolean) => void;
  handleDeleteTopic: (topicId: number, topicTitle: string) => void;
  handleGenerateTopic: (topic: Topic) => void;
  handleUpdateTopicTitle: (topicId: number, title: string) => Promise<void>;
  handleUpdatePillar: (topicId: number, updates: { title?: string; referenceUrl?: string }) => Promise<void>;
  handleDeletePillarPage: (topicId: number) => void;
  handleAddPillarPage: (topicId: number, isAi: boolean) => void;
  triggerAiPillar: (topicId: number) => void;
  handleAddSubPage: (topicId: number, isAi: boolean) => void;
  triggerAiSubPage: (topicId: number) => void;
  handleDeleteSubPage: (subPageId: number) => void;
  handleUpdatePageTitle: (pageId: number, title: string) => Promise<void>;
  renderStatusPill: (pageId?: number) => React.ReactNode;
  handleAddKeyword: (
    type: 'pillar' | 'subpage',
    topicId: number,
    pageId: number,
    isAi: boolean,
    keywordSection?: 'primary' | 'longtail'
  ) => void;
  handleDeleteKeyword: (
    context: { type: 'pillar' | 'subpage'; topicId: number; pageId: number },
    keywordId: number
  ) => void;
  handleSelectPrimaryKeyword: (keywordId: number) => Promise<void>;
  handleSelectLongtailKeyword: (keywordId: number) => Promise<void>;
  handleDeselectKeyword: (keywordId: number) => Promise<void>;
  showAddPillarModal: boolean;
  setShowAddPillarModal: React.Dispatch<React.SetStateAction<boolean>>;
  newPillarTitle: string;
  setNewPillarTitle: React.Dispatch<React.SetStateAction<string>>;
  handleSubmitPillarPage: () => Promise<void>;
  showAddSubPageModal: boolean;
  setShowAddSubPageModal: React.Dispatch<React.SetStateAction<boolean>>;
  newSubPageTitle: string;
  setNewSubPageTitle: React.Dispatch<React.SetStateAction<string>>;
  handleSubmitSubPage: () => Promise<void>;
  generationDrawerOpen: boolean;
  setGenerationDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pendingGenerationTopic: Topic | null;
  generationStep: number;
  setGenerationStep: React.Dispatch<React.SetStateAction<number>>;
  generationConfig: CampaignGenerationConfig;
  setGenerationConfig: React.Dispatch<React.SetStateAction<CampaignGenerationConfig>>;
  handleConfirmGeneration: () => Promise<void>;
  generateTopicLoading: number | null;
  showAddTopicModal: boolean;
  setShowAddTopicModal: React.Dispatch<React.SetStateAction<boolean>>;
  newTopicTitle: string;
  setNewTopicTitle: React.Dispatch<React.SetStateAction<string>>;
  handleSubmitTopic: () => Promise<void>;
  showAddKeywordModal: boolean;
  addKeywordContext: CampaignAddKeywordContext;
  setShowAddKeywordModal: React.Dispatch<React.SetStateAction<boolean>>;
  newKeywordType: 'primary' | 'longtail';
  setNewKeywordType: React.Dispatch<React.SetStateAction<'primary' | 'longtail'>>;
  keywordSearchOpen: boolean;
  setKeywordSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  keywordSearchValue: string;
  setKeywordSearchValue: React.Dispatch<React.SetStateAction<string>>;
  newKeywordTerm: string;
  setNewKeywordTerm: React.Dispatch<React.SetStateAction<string>>;
  newKeywordVolume: string;
  setNewKeywordVolume: React.Dispatch<React.SetStateAction<string>>;
  newKeywordDifficulty: string;
  setNewKeywordDifficulty: React.Dispatch<React.SetStateAction<string>>;
  loadingKeywords: boolean;
  availableKeywords: Keyword[];
  fetchDomainKeywords: (campaignId: number) => Promise<void>;
  handleSubmitKeyword: () => Promise<void>;
  showDeleteModal: boolean;
  deleteLabel: string;
  setShowDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
  deleteAction: (() => void) | null;
  previewPageId: number | null;
  closePreview: () => void;
}

export function CampaignStructureSurface(props: CampaignStructureSurfaceProps) {
  const {
    campaign, onBack, viewMode, onViewModeChange, campaignStructure, selectedTopicId, setSelectedTopicId, selectedTopic,
    handleAddTopic, handleDeleteTopic, aiLoading, syncing, isTopicGenerating, jobIdToTopicId, streamingMessages,
    generationJobs, handleGenerateTopic, handleUpdateTopicTitle, handleUpdatePillar, handleDeletePillarPage,
    handleAddPillarPage, triggerAiPillar, handleAddSubPage, triggerAiSubPage, handleDeleteSubPage, handleUpdatePageTitle,
    renderStatusPill, handleAddKeyword, handleDeleteKeyword, handleSelectPrimaryKeyword, handleSelectLongtailKeyword,
    handleDeselectKeyword, selectedTopics, draftStatuses, showAddPillarModal, setShowAddPillarModal, newPillarTitle,
    setNewPillarTitle, handleSubmitPillarPage, showAddSubPageModal, setShowAddSubPageModal, newSubPageTitle,
    setNewSubPageTitle, handleSubmitSubPage, showAddTopicModal, setShowAddTopicModal, newTopicTitle, setNewTopicTitle,
    handleSubmitTopic, showAddKeywordModal, addKeywordContext, setShowAddKeywordModal, newKeywordType, setNewKeywordType,
    keywordSearchOpen, setKeywordSearchOpen, keywordSearchValue, setKeywordSearchValue, newKeywordTerm, setNewKeywordTerm,
    newKeywordVolume, setNewKeywordVolume, newKeywordDifficulty, setNewKeywordDifficulty, loadingKeywords, availableKeywords,
    fetchDomainKeywords, handleSubmitKeyword, showDeleteModal, deleteLabel, setShowDeleteModal, deleteAction,
    generationDrawerOpen, setGenerationDrawerOpen, pendingGenerationTopic, generationStep, setGenerationStep, generationConfig,
    setGenerationConfig, handleConfirmGeneration, generateTopicLoading, previewPageId, sidebarOpen, companyDomain, domainContext,
    keywordsTableData, hasWordpressIntegration, wpIntegration, onConfigureWordpress, onRefreshWordpressIntegration,
    campaignPageIdContext, sharedPublishStatuses, closePreview
  } = props;

  return (
    <>
    <div className="flex h-[calc(100vh-4rem)] w-full bg-white overflow-hidden">
      {/* 2. Secondary Sidebar: Topic List */}
      {viewMode === 'split' && (
        <div 
          className="w-[280px] border-r border-[#0000001a] flex-shrink-0"
          style={{
            background: 'rgba(255, 255, 255, 0.72)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          }}
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="h-16 flex items-center px-5 border-b border-[#0000001a] flex-shrink-0 z-10">
               <button
                  onClick={onBack}
                  className="mr-3 p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
               >
                 <ArrowLeft className="h-4 w-4" />
               </button>
               <h1 className="font-medium text-gray-900 truncate text-sm" title={campaign.title}>
                 {campaign.title}
               </h1>
            </div>

            <CampaignTopicSidebar
              topics={campaignStructure.topics}
              selectedTopicId={selectedTopicId}
              onSelectTopic={setSelectedTopicId}
              onAddTopic={(isAi) => isAi ? handleAddTopic(true) : handleAddTopic(false)}
              onDeleteTopic={handleDeleteTopic}
              aiLoading={aiLoading}
              syncing={syncing}
              isTopicGenerating={isTopicGenerating}
            />
          </div>
        </div>
      )}

      {/* 3. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50/50 relative">
      
        {/* Content Body */}
        <div className="flex-1 relative overflow-hidden">
            
            {/* Split View: Detail Pane */}
            <div className={`absolute inset-0 bg-gray-50/50 transition-opacity duration-300 overflow-y-auto ${viewMode === 'split' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
               <div className="h-full p-8 max-w-5xl mx-auto">
                 {selectedTopic ? (
                   <CampaignTopicDetail
                     topic={selectedTopic}
                     isGenerating={isTopicGenerating(selectedTopic)}
                     streamingEvents={
                       (jobIdToTopicId.size > 0 
                         ? Array.from(jobIdToTopicId.entries()).find(([_, tid]) => tid === selectedTopicId)?.[0] 
                         : undefined) 
                         ? streamingMessages.get(Array.from(jobIdToTopicId.entries()).find(([_, tid]) => tid === selectedTopicId)![0]) || []
                         : []
                     }
                     jobId={
                       Array.from(jobIdToTopicId.entries()).find(([_, tid]) => tid === selectedTopicId)?.[0]
                     }
                     generationJobs={generationJobs}
                     onGenerateTopic={handleGenerateTopic}
                     onUpdateTopicTitle={handleUpdateTopicTitle}
                     onReferenceUrlChange={(tid, url) => {
                        const t = campaignStructure.topics.find(t => t.id === tid);
                        if(t) handleUpdatePillar(t.pillarPage!.id, { referenceUrl: url });
                     }}
                      onDeletePillar={handleDeletePillarPage}
                      onCreatePillar={(tid) => handleAddPillarPage(tid, false)}
                      onGenerateAiPillar={triggerAiPillar}
                      onAddSubPage={(tid) => handleAddSubPage(tid, false)}
                      onGenerateAiSubPage={triggerAiSubPage}
                      onDeleteSubPage={handleDeleteSubPage}
                      onUpdatePageTitle={handleUpdatePageTitle}
                     renderStatusPill={renderStatusPill}
                     onAddKeyword={handleAddKeyword}
                     onDeleteKeyword={handleDeleteKeyword}
                     onSelectPrimaryKeyword={handleSelectPrimaryKeyword}
                     onSelectLongtailKeyword={handleSelectLongtailKeyword}
                     onDeselectKeyword={handleDeselectKeyword}
                     aiLoading={aiLoading}
                   />
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center text-gray-400">
                     <img className="mt-4 h-50 w-50 mb-4" src="https://res.cloudinary.com/dyxsai3xf/image/upload/v1770815473/WhatsApp_Image_2026-02-11_at_11.48.44_hopxes.jpg" alt="Campaign" />
                     <p>Create/Select your topic to get started.</p>
                   </div>
                 )}
               </div>
            </div>

            {/* Graph View: Full Screen */}
            <div className={`absolute inset-0 bg-white transition-opacity duration-300 ${viewMode === 'graph' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
               <div className="w-full h-full">
                <CampaignGraph
                  campaignStructure={campaignStructure}
                  selectedTopics={selectedTopics}
                  generationJobs={generationJobs}
                  draftStatuses={draftStatuses}
                />
               </div>
            </div>

            {/* Table View: Full Screen */}
            <div className={`absolute inset-0 bg-white transition-opacity duration-300 ${viewMode === 'table' ? 'opacity-100 z-10 font-light' : 'opacity-0 z-0 pointer-events-none'}`}>
               <div className="w-full h-full">
                <CampaignTableView
                  campaignStructure={campaignStructure}
                  selectedTopicId={selectedTopicId}
                  onSelectTopic={(tid) => {
                    setSelectedTopicId(tid);
                    onViewModeChange('split');
                  }}
                  renderStatusPill={renderStatusPill}
                  generationJobs={generationJobs}
                  draftStatuses={draftStatuses}
                  onGenerateTopic={handleGenerateTopic}
                  onUpdatePageTitle={handleUpdatePageTitle}
                  onDeleteSubPage={handleDeleteSubPage}
                  onDeletePillarPage={handleDeletePillarPage}
                  onDeleteTopic={handleDeleteTopic}
                  onCreatePillar={(tid) => handleAddPillarPage(tid, false)}
                  onGenerateAiPillar={triggerAiPillar}
                  onAddSubPage={(tid) => handleAddSubPage(tid, false)}
                  onGenerateAiSubPage={triggerAiSubPage}
                  onAddKeyword={handleAddKeyword}
                  onDeleteKeyword={handleDeleteKeyword}
                  onSelectPrimaryKeyword={handleSelectPrimaryKeyword}
                  onSelectLongtailKeyword={handleSelectLongtailKeyword}
                  onDeselectKeyword={handleDeselectKeyword}
                  aiLoading={aiLoading}
                />

               </div>
            </div>


      </div>
      </div>
{showAddPillarModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
            <h2 className="text-xl font-light text-gray-900 mb-6">Create Pillar Page</h2>
            <input
              type="text"
              placeholder="Pillar Page Title"
              className="w-full p-4 border border-gray-200 rounded-xl mb-6 text-sm focus:ring-2 focus:ring-black/5 focus:border-black outline-none transition-all"
              value={newPillarTitle}
              onChange={(e) => setNewPillarTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitPillarPage();
                if (e.key === 'Escape') setShowAddPillarModal(false);
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAddPillarModal(false)}
                className="px-6 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitPillarPage}
                disabled={!newPillarTitle.trim()}
                className="px-6 py-2.5 bg-black text-white rounded-full hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-lg shadow-black/10"
              >
                Create Pillar
              </button>
            </div>
          </div>
        </div>
      )}
{showAddSubPageModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
            <h2 className="text-xl font-light text-gray-900 mb-6">Add Sub Page</h2>
            <input
              type="text"
              placeholder="Page Title"
              className="w-full p-4 border border-gray-200 rounded-xl mb-6 text-sm focus:ring-2 focus:ring-black/5 focus:border-black outline-none transition-all"
              value={newSubPageTitle}
              onChange={(e) => setNewSubPageTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if(e.key === 'Enter') handleSubmitSubPage();
                if(e.key === 'Escape') setShowAddSubPageModal(false);
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAddSubPageModal(false)}
                className="px-6 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitSubPage}
                disabled={!newSubPageTitle.trim()}
                className="px-6 py-2.5 bg-black text-white rounded-full hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-lg shadow-black/10"
              >
                Add Page
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Manual Add Topic Modal */}
      {showAddTopicModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
           <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 transform transition-all scale-100">
             <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-light text-gray-900">Add New Topic</h2>
                <button 
                  onClick={() => setShowAddTopicModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
             </div>
             
             <div className="space-y-4">
               <div>
                 <label htmlFor="topic-title" className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1.5">
                   Topic Title
                 </label>
                 <input
                   id="topic-title"
                   type="text"
                   value={newTopicTitle}
                   onChange={(e) => setNewTopicTitle(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleSubmitTopic()}
                   className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-gray-900 placeholder:text-gray-300"
                   placeholder="e.g. Sustainable Fashion Trends"
                   autoFocus
                 />
               </div>
               
               <div className="pt-2 flex justify-end gap-3">
                 <button
                   onClick={() => setShowAddTopicModal(false)}
                   className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                 >
                   Cancel
                 </button>
                 <button
                   onClick={handleSubmitTopic}
                   className="px-6 py-2.5 rounded-xl text-sm font-medium bg-black text-white hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
                 >
                   Create Topic
                 </button>
               </div>
             </div>
           </div>
        </div>
      )}

      {showAddKeywordModal && addKeywordContext && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 transform transition-all scale-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-light text-gray-900">Add Keyword</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Adding to <span className="font-medium text-gray-900">{addKeywordContext.type === 'pillar' ? 'Pillar Page' : 'Sub Page'}</span>
                </p>
              </div>
              <button 
                onClick={() => setShowAddKeywordModal(false)}
                className="p-2 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors text-gray-400 hover:text-gray-600"
              >
                <Trash2 className="h-5 w-5 " />
              </button>
            </div>

            {/* Keyword Type Selection */}
            <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
              <button
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  newKeywordType === 'primary' 
                    ? 'bg-white text-black shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setNewKeywordType('primary')}
              >
                Primary
              </button>
              <button
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  newKeywordType === 'longtail' 
                    ? 'bg-white text-black shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setNewKeywordType('longtail')}
              >
                Longtail
              </button>
            </div>

            <div className="space-y-4">
              {/* Searchable Dropdown */}
              <div className="relative">
                <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1.5">
                  Keyword Term
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search or enter custom keyword..."
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 focus:border-black outline-none transition-all"
                    value={keywordSearchOpen ? keywordSearchValue : newKeywordTerm}
                    onChange={(e) => {
                      setKeywordSearchValue(e.target.value);
                      setNewKeywordTerm(e.target.value);
                      setKeywordSearchOpen(true);
                    }}
                    onFocus={() => {
                        setKeywordSearchOpen(true);
                        // Ensure keywords are loaded
                        if (availableKeywords.length === 0) {
                            fetchDomainKeywords(campaign.id);
                        }
                    }}
                  />
                </div>
                
                {/* Dropdown Results */}
                {keywordSearchOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-60 overflow-y-auto z-50 animate-in fade-in zoom-in-95 duration-200">
                    {loadingKeywords ? (
                      <div className="p-8 text-center text-gray-400 flex flex-col items-center">
                        <Loader2 className="h-5 w-5 animate-spin mb-2" />
                        <span className="text-xs">Loading suggestions...</span>
                      </div>
                    ) : (
                      <>
                         {availableKeywords
                          .filter(k => k.term.toLowerCase().includes(keywordSearchValue.toLowerCase()))
                          .slice(0, 50) 
                          .map((k) => (
                            <button
                              key={k.id}
                              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between group transition-colors border-b border-gray-50 last:border-0"
                              onClick={() => {
                                setNewKeywordTerm(k.term);
                                setNewKeywordVolume(k.volume?.toString() || '');
                                setNewKeywordDifficulty(k.difficulty || 'Medium');
                                setKeywordSearchOpen(false);
                              }}
                            >
                              <div>
                                <span className="text-sm text-gray-900 font-medium">{k.term}</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                   <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                      k.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                                      k.difficulty === 'Hard' ? 'bg-red-100 text-red-700' :
                                      'bg-yellow-100 text-yellow-700'
                                   }`}>
                                     {k.difficulty || 'Medium'}
                                   </span>
                                   {k.volume && (
                                     <span className="text-[10px] text-gray-400">
                                       Vol: {k.volume.toLocaleString()}
                                     </span>
                                   )}
                                </div>
                              </div>
                              <Plus className="h-4 w-4 text-gray-300 group-hover:text-black transition-colors" />
                            </button>
                          ))}
                        
                        {/* No results state */}
                        {availableKeywords.filter(k => k.term.toLowerCase().includes(keywordSearchValue.toLowerCase())).length === 0 && (
                          <div className="p-4 text-center">
                            <p className="text-sm text-gray-500 mb-2">No matching keywords found</p>
                            <button
                                onClick={() => setKeywordSearchOpen(false)}
                                className="text-xs text-blue-600 hover:underline font-medium"
                            >
                                Use &quot;{keywordSearchValue}&quot; as custom keyword
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1.5">
                    Volume
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 focus:border-black outline-none transition-all"
                    value={newKeywordVolume}
                    onChange={(e) => setNewKeywordVolume(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1.5">
                    Difficulty
                  </label>
                  <select
                    className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 focus:border-black outline-none transition-all bg-white"
                    value={newKeywordDifficulty}
                    onChange={(e) => setNewKeywordDifficulty(e.target.value)}
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
              <button
                onClick={() => setShowAddKeywordModal(false)}
                className="px-6 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                disabled={keywordSearchOpen}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitKeyword}
                disabled={!newKeywordTerm.trim() || keywordSearchOpen}
                className="px-8 py-2.5 bg-black text-white rounded-full hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-lg shadow-black/10 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Keyword
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[70]">
          <div className="bg-white p-6 rounded-xl shadow-xl w-[90%] max-w-sm">
            <h2 className="text-lg font-medium text-gray-800">Delete {deleteLabel}?</h2>
            <p className="text-sm text-gray-500 mt-2">
              Are you sure you want to delete this {deleteLabel}?
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-lg text-sm bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteAction) deleteAction();
                  setShowDeleteModal(false);
                }}
                className="px-4 py-2 rounded-lg text-sm bg-black text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Generation Config Drawer - Matches Publish Tab Style */}
      <Sheet open={generationDrawerOpen} onOpenChange={setGenerationDrawerOpen}>
        <SheetContent 
          side="right" 
          className="w-full sm:max-w-3xl border-l border-[#e2e4ea] bg-[#f5f6fa] px-10 py-12 overflow-y-auto font-light"
        >
          <div className="space-y-10">
            {/* Header Card */}
            <div className="rounded-[32px] border border-white/80 bg-white/90 px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-1 text-[10px] tracking-[0.35em] uppercase text-gray-500">
                    Content Generation
                  </div>
                  <div>
                    <h3 className="text-[28px] font-light text-gray-900 tracking-tight">
                      {generateTopicLoading === pendingGenerationTopic?.id ? (
                        <span className="flex items-center gap-2">
                          Generating content...
                          <svg className="h-5 w-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4A8 8 0 104 12z" />
                          </svg>
                        </span>
                      ) : (
                        `Step ${generationStep} of 3`
                      )}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Configure options for "{pendingGenerationTopic?.title}"</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((step) => (
                      <span
                        key={`progress-${step}`}
                        className={`h-1.5 w-12 rounded-full transition-all ${
                          step <= generationStep ? 'bg-black/80' : 'bg-black/10'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">
                    Generation flow
                  </p>
                </div>
              </div>
            </div>

            {/* Step 1: Word Count */}
            {generationStep === 1 && (
              <section className="rounded-[36px] border border-white/70 bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] space-y-8">
                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.35em] text-gray-400">Word cadence</span>
                  <h4 className="text-2xl font-light text-gray-900">Dial in the depth and pace.</h4>
                  <p className="text-sm text-gray-500 max-w-2xl">
                    Glide between quick reads and flagship editorials. Every notch subtly changes paragraph
                    length, transitions, and how immersive the narration should feel.
                  </p>
                </div>
                <div className="rounded-[28px] border border-gray-100 bg-gray-50/70 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Projected read time</p>
                      <p className="text-xs text-gray-500">A calm slider tuned for editorial pacing.</p>
                    </div>
                    <div className="inline-flex items-baseline gap-2 rounded-full bg-white px-5 py-1.5 shadow-inner">
                      <span className="text-2xl font-light">{generationConfig.wordCount}</span>
                      <span className="text-xs uppercase tracking-[0.25em] text-gray-500">words</span>
                    </div>
                  </div>
                  <Slider
                    value={[generationConfig.wordCount]}
                    min={400}
                    max={3000}
                    step={100}
                    onValueChange={(vals) => setGenerationConfig(prev => ({ ...prev, wordCount: vals[0] }))}
                    className="py-4"
                  />
                </div>
               <div className="flex justify-end">
  <button 
    onClick={() => setGenerationStep(2)}
    className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-600 disabled:opacity-60 transition"
  >
    Continue to Imagery
  </button>
</div>

              </section>
            )}

            {/* Step 2: Imagery */}
            {generationStep === 2 && (
              <section className="rounded-[36px] border border-white/70 bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] space-y-8">
                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.35em] text-gray-400">Visual elements</span>
                  <h4 className="text-2xl font-light text-gray-900">Set the visual tone.</h4>
                  <p className="text-sm text-gray-500 max-w-2xl">
                    Choose how many images to generate and whether to include a featured hero image.
                  </p>
                </div>
                <div className="rounded-[28px] border border-gray-100 bg-gray-50/70 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Images per article</p>
                      <p className="text-xs text-gray-500">Inline images throughout the content.</p>
                    </div>
                    <div className="inline-flex items-baseline gap-2 rounded-full bg-white px-5 py-1.5 shadow-inner">
                      <span className="text-2xl font-light">{generationConfig.images}</span>
                      <span className="text-xs uppercase tracking-[0.25em] text-gray-500">images</span>
                    </div>
                  </div>
                  <Slider
                    value={[generationConfig.images]}
                    min={0}
                    max={5}
                    step={1}
                    onValueChange={(vals) => setGenerationConfig(prev => ({ ...prev, images: vals[0] }))}
                    className="py-4"
                  />
                </div>
                <div className="flex items-center justify-between p-5 rounded-[28px] border border-gray-100 bg-gray-50/70">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-gray-800">Featured Image</p>
                    <p className="text-xs text-gray-500">Generate a high-quality hero banner</p>
                  </div>
                  <Switch
                    checked={generationConfig.featuredImageEnabled}
                    onCheckedChange={(checked) => setGenerationConfig(prev => ({ ...prev, featuredImageEnabled: checked }))}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setGenerationStep(1)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-700 border border-gray-200 rounded-full text-sm hover:bg-gray-100 hover:text-gray-700  transition"
                  >
                    Back
                  </button>
                  <button 
                    onClick={() => setGenerationStep(3)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-600 disabled:opacity-60 transition"
                  >
                    Continue to Brand
                  </button>
                </div>
              </section>
            )}

            {/* Step 3: Brand Voice */}
            {generationStep === 3 && (
              <section className="rounded-[36px] border border-white/70 bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] space-y-8">
                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.35em] text-gray-400">Brand voice</span>
                  <h4 className="text-2xl font-light text-gray-900">Define your brand's personality.</h4>
                  <p className="text-sm text-gray-500 max-w-2xl">
                    The AI will adapt its writing style to match your brand's tone and values.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.35em] text-gray-400">Brand Name</label>
                    <input
                      type="text"
                      value={generationConfig.brandName}
                      onChange={(e) => setGenerationConfig(prev => ({ ...prev, brandName: e.target.value }))}
                      placeholder="e.g. Acme Corp"
                      className="w-full px-5 py-4 rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-base shadow-inner"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.35em] text-gray-400">Tone & Description (Optional)</label>
                    <textarea
                      value={generationConfig.brandDescription}
                      onChange={(e) => setGenerationConfig(prev => ({ ...prev, brandDescription: e.target.value }))}
                      placeholder="e.g. Professional, authoritative, yet accessible. Focus on Enterprise solutions."
                      rows={4}
                      className="w-full px-5 py-4 rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-base shadow-inner resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setGenerationStep(2)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-700 border border-gray-200 rounded-full text-sm hover:bg-gray-100 hover:text-gray-700  transition"
                  >
                    Back
                  </button>
                  <button 
                    onClick={handleConfirmGeneration}
                    disabled={generateTopicLoading === pendingGenerationTopic?.id}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-600 disabled:opacity-60 transition"
                  >
                    {generateTopicLoading === pendingGenerationTopic?.id ? (
                      <>
                        <ButtonSpinner /> Starting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> Start Generation
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Preview Overlay - Fills content area beside sidebar */}
      {previewPageId && (
        <div 
          className="fixed top-0 right-0 bottom-0 z-[60] bg-[#f5f6fa] flex flex-col"
          style={{ left: sidebarOpen ? '280px' : '96px' }}
        >
          {/* Header with prominent back button */}
          
          {/* Content */}
          <div className="relative flex-1 overflow-hidden bg-gray-50">
            <PublishExperience
              companyDomain={companyDomain}
              domainContext={domainContext}
              keywordsTableData={keywordsTableData}
              hasWordpressIntegration={hasWordpressIntegration}
              wpIntegration={wpIntegration}
              onConfigureWordpress={onConfigureWordpress}
              onRefreshWordpressIntegration={onRefreshWordpressIntegration}
              isActive={true}
              initialDraftId={previewPageId}
              pageId={campaignPageIdContext || undefined}
              disablePreviewOverlay={true}
              sharedPublishStatuses={sharedPublishStatuses}
              onBack={closePreview}
            />
          </div>
        </div>
      )}
    </>
  );
}

