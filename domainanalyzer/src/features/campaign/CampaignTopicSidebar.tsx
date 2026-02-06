import React from 'react';
import { Plus, Trash2, Sparkles } from 'lucide-react';
import { Topic, GenerationPageStatus } from '@/types';
import { ButtonSpinner } from '@/components/ui/button-spinner';

interface CampaignTopicSidebarProps {
  topics: Topic[];
  selectedTopicId: number | null;
  onSelectTopic: (topicId: number) => void;
  onAddTopic: (isAi: boolean) => void;
  onDeleteTopic: (topicId: number, title: string) => void;
  aiLoading: string | null;
  syncing: boolean;
  isTopicGenerating: (topic: Topic) => boolean;
}

export const CampaignTopicSidebar: React.FC<CampaignTopicSidebarProps> = ({
  topics,
  selectedTopicId,
  onSelectTopic,
  onAddTopic,
  onDeleteTopic,
  aiLoading,
  syncing,
  isTopicGenerating
}) => {
  return (
    <div className="flex flex-col h-full">
       <div className="px-3 pt-4 pb-2 space-y-2">
        <button
          onClick={() => onAddTopic(true)}
          disabled={syncing || aiLoading === "topic"}
          className="w-full py-2.5 inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-600 justify-center disabled:opacity-60 transition"
        >
          {aiLoading === "topic" ? <ButtonSpinner /> : <Sparkles className="h-3 w-3" />}
          {aiLoading === "topic" ? "Generating..." : "Generate Topic"}
        </button>
        
        <button
          onClick={() => onAddTopic(false)}
          disabled={syncing}
          className="w-full py-2.5 inline-flex items-center gap-2 px-6 py-3 rounded-full border text-gray-700 border-gray-200 bg-white text-sm hover:bg-gray-100 justify-center hover:text-gray-700 hover:shadow-lg transition"
        ><Plus className="h-3.5 w-3.5" />
          Add Manually
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {topics.length > 0 && <div className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Topics</div>}
        
        {topics.map((topic) => {
          const isSelected = selectedTopicId === topic.id;
          const isGenerating = isTopicGenerating(topic);
          
          return (
            <div
              key={topic.id}
              onClick={() => onSelectTopic(topic.id)}
              className={`group flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'bg-[rgba(0,122,255,0.1)] text-[#007AFF]'
                  : 'text-[#1d1d1f] hover:bg-[rgba(0,0,0,0.05)]'
              }`}
            >
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <h4 className={`truncate text-[15px] font-[400] tracking-[-0.022em] ${isSelected ? 'text-[#007AFF]' : 'text-[#1d1d1f]'}`}>
                    {topic.title}
                  </h4>
                  {isGenerating && (
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                  )}
                </div>
                <p className={`text-[11px] mt-0.5 truncate ${isSelected ? 'text-[#007AFF]/70' : 'text-[#86868b]'}`}>
                  {topic.subPages?.length || 0} sub-pages
                </p>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTopic(topic.id, topic.title);
                }}
                className={`opacity-0 group-hover:opacity-100 p-1 rounded-full transition-all ${
                  isSelected 
                    ? 'hover:bg-blue-200 text-blue-600' 
                    : 'hover:bg-gray-200 text-gray-400 hover:text-red-500'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        
        {topics.length === 0 && (
          <div className="text-center py-12 px-4">
            <p className="text-sm text-gray-400 font-light">
              No topics yet. Start by adding one above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
