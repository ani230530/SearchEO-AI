import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {topics.length > 0 && <div className="px-3 pt-3 pb-2 text-xs font-medium text-gray-400">Topics</div>}
        
        {topics.map((topic) => {
          const isSelected = selectedTopicId === topic.id;
          const isGenerating = isTopicGenerating(topic);
          
          return (
            <div
              key={topic.id}
              onClick={() => onSelectTopic(topic.id)}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'bg-black text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <h4 className={`font-medium truncate text-sm leading-tight ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                    {topic.title}
                  </h4>
                  {isGenerating && (
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                  )}
                </div>
                <p className={`text-[11px] mt-0.5 truncate ${isSelected ? 'text-gray-400' : 'text-gray-500'}`}>
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
                    ? 'hover:bg-white/20 text-white/70 hover:text-white' 
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
              No topics yet. Start by adding one below.
            </p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-100 bg-white space-y-3">
        <button
          onClick={() => onAddTopic(true)}
          disabled={syncing || aiLoading === "topic"}
          className="w-full py-2.5 bg-black text-white rounded-lg hover:bg-black/90 transition-all text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {aiLoading === "topic" ? <ButtonSpinner /> : <Plus className="h-3.5 w-3.5" />}
          {aiLoading === "topic" ? "Generating..." : "AI Generate Topic"}
        </button>
        
        <button
          onClick={() => onAddTopic(false)}
          disabled={syncing}
          className="w-full py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          Add Manually
        </button>
      </div>
    </div>
  );
};
