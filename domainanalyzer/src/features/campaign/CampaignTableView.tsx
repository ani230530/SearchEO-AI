import React, { useMemo, useState, useEffect } from 'react';
import { 
  Topic, 
  CampaignStructure, 
  Keyword, 
  GenerationPageStatus,
} from '../../types';
import { 
  FileText, 
  Layers, 
  ExternalLink, 
  Search, 
  Zap,
  ArrowRight,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Sparkles,
  MoreVertical
} from 'lucide-react';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';

interface PageRow {
  id: number;
  title: string;
  type: 'pillar' | 'subpage';
  topicId: number;
  topicTitle: string;
  keywords: Keyword[];
  publishStatus?: string;
  liveUrl?: string;
  topic: Topic;
}

interface CampaignTableViewProps {
  campaignStructure: CampaignStructure;
  selectedTopicId: number | null;
  onSelectTopic: (topicId: number) => void;
  renderStatusPill: (pageId?: number) => React.ReactNode;
  generationJobs: Map<number, GenerationPageStatus>;
  onGenerateTopic: (topic: Topic) => void;
  // Advanced Action Props
  onUpdatePageTitle: (pageId: number, title: string) => Promise<void>;
  onDeleteSubPage: (subPageId: number) => void;
  onDeletePillarPage: (topicId: number) => void;
  onAddKeyword: (type: 'pillar' | 'subpage', topicId: number, pageId: number, isAI: boolean, keywordType?: 'primary' | 'longtail') => void;
  onDeleteKeyword: (context: { type: 'pillar' | 'subpage'; topicId: number; pageId: number }, keywordId: number) => void;
  onSelectPrimaryKeyword: (keywordId: number) => Promise<void>;
  onSelectLongtailKeyword: (keywordId: number) => Promise<void>;
  aiLoading: string | null;
}

export const CampaignTableView: React.FC<CampaignTableViewProps> = ({
  campaignStructure,
  selectedTopicId,
  onSelectTopic,
  renderStatusPill,
  generationJobs,
  onGenerateTopic,
  onUpdatePageTitle,
  onDeleteSubPage,
  onDeletePillarPage,
  onAddKeyword,
  onDeleteKeyword,
  onSelectPrimaryKeyword,
  onSelectLongtailKeyword,
  aiLoading
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'pillar' | 'subpage'>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const rows: PageRow[] = useMemo(() => {
    const allRows: PageRow[] = [];
    
    const topicsToRender = selectedTopicId 
      ? campaignStructure.topics.filter(t => t.id === selectedTopicId)
      : campaignStructure.topics;

    topicsToRender.forEach(topic => {
      if (topic.pillarPage) {
        allRows.push({
          id: topic.pillarPage.id,
          title: topic.pillarPage.title,
          type: 'pillar',
          topicId: topic.id,
          topicTitle: topic.title,
          keywords: topic.pillarPage.keywords || [],
          publishStatus: topic.pillarPage.publishStatus,
          liveUrl: topic.pillarPage.liveUrl,
          topic: topic
        });
      }
      
      topic.subPages.forEach(subPage => {
        allRows.push({
          id: subPage.id,
          title: subPage.title,
          type: 'subpage',
          topicId: topic.id,
          topicTitle: topic.title,
          keywords: subPage.keywords || [],
          publishStatus: subPage.publishStatus,
          liveUrl: subPage.liveUrl,
          topic: topic
        });
      });
    });
    
    return allRows;
  }, [campaignStructure, selectedTopicId]);

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const matchesSearch = row.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           row.topicTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           row.keywords.some(k => k.term.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesType = filterType === 'all' || row.type === filterType;
      
      return matchesSearch && matchesType;
    });
  }, [rows, searchQuery, filterType]);

  const handleStartEdit = (row: PageRow) => {
    setEditingId(row.id);
    setEditValue(row.title);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editValue.trim() || isUpdating) return;
    setIsUpdating(true);
    try {
      await onUpdatePageTitle(editingId, editValue.trim());
      setEditingId(null);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const sortedKeywords = (keywords: Keyword[]) => {
    return [...keywords].sort((a, b) => {
      if (a.aiMetadata?.isPrimary) return -1;
      if (b.aiMetadata?.isPrimary) return 1;
      if (a.aiMetadata?.isLongtail) return -1;
      if (b.aiMetadata?.isLongtail) return 1;
      return 0;
    });
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-8 pb-4 border-b border-gray-100 space-y-6">
        <div className="flex items-center justify-between">
           <div>
              <h2 className="text-2xl font-light text-gray-900 tracking-tight">
                {selectedTopicId ? (filteredRows[0]?.topicTitle || 'Topic Inventory') : 'Campaign Inventory'}
              </h2>
              <p className="text-sm text-gray-500 font-light mt-1">
                {selectedTopicId ? `Pages within the cluster: ${filteredRows[0]?.topicTitle}` : 'Manage all your cluster pages and content status.'}
              </p>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search pages or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-64 bg-gray-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-black/5 transition-all outline-none font-light"
                />
              </div>
              
              <div className="flex bg-gray-100 p-1 rounded-2xl">
                 <button 
                  onClick={() => setFilterType('all')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-xl transition-all ${filterType === 'all' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                 >All</button>
                 <button 
                  onClick={() => setFilterType('pillar')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-xl transition-all ${filterType === 'pillar' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                 >Pillars</button>
                 <button 
                  onClick={() => setFilterType('subpage')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-xl transition-all ${filterType === 'subpage' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                 >Sub-pages</button>
              </div>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <table className="w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-bold">
              <th className="text-left py-3 px-4 font-bold w-[30%]">Page Details</th>
              {!selectedTopicId && <th className="text-left py-3 px-4 font-bold">Topic Cluster</th>}
              <th className="text-left py-3 px-4 font-bold">Target Keywords</th>
              <th className="text-center py-3 px-4 font-bold w-[120px]">Status</th>
              <th className="text-right py-3 px-4 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="space-y-4">
            {filteredRows.map((row) => (
              <tr 
                key={`${row.type}-${row.id}`}
                className="group bg-white hover:bg-gray-50/50 transition-all duration-300 border border-transparent hover:border-gray-100 rounded-3xl"
              >
                <td className="py-4 px-4 first:rounded-l-3xl border-y border-l group-hover:border-gray-100 border-transparent transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-xl transition-all duration-300",
                      row.type === 'pillar' ? "bg-black text-white" : "bg-gray-100 text-gray-500"
                    )}>
                      {row.type === 'pillar' ? <Layers className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingId === row.id ? (
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            className="bg-white border border-black/10 rounded-lg px-2 py-1 text-sm font-medium w-full outline-none focus:ring-2 focus:ring-black/5"
                          />
                          <button onClick={handleSaveEdit} disabled={isUpdating} className="p-1 hover:text-green-600">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={handleCancelEdit} disabled={isUpdating} className="p-1 hover:text-red-600">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/title">
                          <div className="text-sm font-medium text-gray-900">{row.title}</div>
                          <button 
                            onClick={() => handleStartEdit(row)}

                            className="p-1 opacity-0 group-hover/title:opacity-100 transition-opacity hover:bg-gray-100 rounded"
                          >
                            <Pencil className="h-3 w-3 text-gray-400" />
                          </button>
                        </div>
                      )}
                      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mt-0.5">{row.type}</div>
                    </div>
                  </div>
                </td>
                
                {!selectedTopicId && (
                  <td className="py-4 px-4 border-y group-hover:border-gray-100 border-transparent transition-colors">
                    <div className="text-sm text-gray-600 font-light flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-200"></span>
                      {row.topicTitle}
                    </div>
                  </td>
                )}
                
                <td className="py-4 px-4 border-y group-hover:border-gray-100 border-transparent transition-colors">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {sortedKeywords(row.keywords).map((k) => (
                      <DropdownMenu key={k.id}>
                        <DropdownMenuTrigger asChild>
                          <button className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all border",
                            k.aiMetadata?.isPrimary ? "bg-black text-white border-black" : 
                            k.aiMetadata?.isLongtail ? "bg-blue-50 text-blue-700 border-blue-100" :
                            "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
                          )}>
                            {k.term}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48 rounded-xl border-[#0000001a] shadow-xl">
                          {!k.aiMetadata?.isPrimary && (
                            <DropdownMenuItem onClick={() => onSelectPrimaryKeyword(k.id)} className="text-xs py-2 rounded-lg">
                              Set as Primary
                            </DropdownMenuItem>
                          )}
                          {!k.aiMetadata?.isLongtail && (
                            <DropdownMenuItem onClick={() => onSelectLongtailKeyword(k.id)} className="text-xs py-2 rounded-lg">
                              Set as Longtail
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => onDeleteKeyword({ type: row.type, topicId: row.topicId, pageId: row.id }, k.id)} 
                            className="text-xs py-2 rounded-lg text-red-600 hover:bg-red-50"
                          >
                            Delete Keyword
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ))}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48 rounded-xl border-[#0000001a] shadow-xl">
                        <DropdownMenuItem 
                          onClick={() => onAddKeyword(row.type, row.topicId, row.id, false)}
                          className="text-xs py-2 rounded-lg flex items-center gap-2"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Manually
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => onAddKeyword(row.type, row.topicId, row.id, true)}
                          className="text-xs py-2 rounded-lg flex items-center gap-2 text-blue-600 font-medium"
                          disabled={aiLoading === `keyword-${row.id}`}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {aiLoading === `keyword-${row.id}` ? 'Suggesting...' : 'AI Suggestions'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
                
                <td className="py-4 px-4 text-center border-y group-hover:border-gray-100 border-transparent transition-colors">
                  <div className="flex justify-center scale-90">
                    {renderStatusPill(row.id)}
                  </div>
                </td>
                
                <td className="py-4 px-4 text-right last:rounded-r-3xl border-y border-r group-hover:border-gray-100 border-transparent transition-colors">
                  <div className="flex items-center justify-end gap-2">
                    {row.liveUrl && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a 
                              href={row.liveUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="p-2 text-gray-400 hover:text-black hover:bg-white rounded-xl transition-all shadow-none hover:shadow-sm"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent side="top">View Live Page</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    
                    <button 
                      onClick={() => onSelectTopic(row.topicId)}
                      className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-black hover:text-white text-gray-700 rounded-2xl text-xs font-medium transition-all group/btn"
                    >
                      Configure
                      <ArrowRight className="h-3 w-3 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 text-gray-400 hover:text-black rounded-xl transition-all">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-xl border-[#0000001a] shadow-xl">
                        <DropdownMenuItem 
                          onClick={() => onGenerateTopic(row.topic)}
                          className="text-xs py-2 rounded-lg flex items-center gap-2"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Regenerate Content
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => {
                            if (row.type === 'pillar') {
                              onDeletePillarPage(row.topicId);
                            } else {
                              onDeleteSubPage(row.id);
                            }
                          }}
                          className="text-xs py-2 rounded-lg text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete Page
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
            
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={selectedTopicId ? 4 : 5} className="py-20 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <div className="p-4 bg-gray-50 rounded-full mb-4">
                      <Search className="h-8 w-8 opacity-20" />
                    </div>
                    <p className="text-sm font-light">No pages found matching your search.</p>
                    <button 
                      onClick={() => { setSearchQuery(''); setFilterType('all'); }}
                      className="text-xs text-blue-600 mt-2 hover:underline"
                    >
                      Clear all filters
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="pointer-events-none fixed bottom-0 right-0 w-64 h-64 bg-gradient-to-tl from-gray-50/50 to-transparent rounded-tl-full z-0 opacity-50"></div>
    </div>
  );
};
