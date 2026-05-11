import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../services/apiClient';
import { maskDomainId } from '@/lib/domainUtils';
import { AIResultsLayout } from '@/features/ai-results/components/AIResultsLayout';
import { PromptTable, WorksheetPickerModal } from './AIResultsReportPreview';

const WORKSHEET_IMPORT_KEY = 'ai-results/pending-worksheet-import';
const WORKSHEET_TARGET_KEY = 'ai-results/pending-worksheet-target';
const AI_VISIBILITY_LAST_DOMAIN_SLUG = 'ai-visibility:lastDomainSlug';

type DomainOption = {
  id: number;
  url: string;
  createdAt: string;
  host?: string;
  companyName?: string | null;
};

type WorksheetOption = {
  id: string;
  name: string;
  description: string | null;
};

type PromptGapRow = {
  id: string;
  type: 'prompt';
  phrase: string;
  avgSentiment: number;
  mentions: number;
  bestRank: number;
  sov: string;
  competitors: string[];
  competitorCount: number;
  results: any[];
};

const STATIC_ANALYSIS_COMPETITORS = [
  { name: 'semrush.com', score: '4.5 / 5', status: 'Strong' },
  { name: 'ahrefs.com', score: '4.1 / 5', status: 'Strong' },
  { name: 'moz.com', score: '3.6 / 5', status: 'Medium' },
  { name: 'serpstat.com', score: '3.2 / 5', status: 'Low' },
  { name: 'spyfu.com', score: '2.5 / 5', status: 'Low' },
] as const;

const STATIC_ANALYSIS_INSIGHTS = [
  {
    title: 'Ahrefs leads for real-time new/lost backlink detection with the deepest index.',
    detail: 'Mentioned in 38 of 47 AI responses as top recommendation',
  },
  {
    title: 'Semrush is preferred when combining backlink tracking with full SEO audits.',
    detail: 'Co-mentioned with "all-in-one" in 71% of Semrush responses',
  },
  {
    title: 'Moz scores well on beginner-friendliness but lags on index freshness.',
    detail: 'DA metric frequently cited; link freshness flagged as weakness',
  },
  {
    title: 'Moz scores well on beginner-friendliness but lags on index freshness.',
    detail: 'DA metric frequently cited; link freshness flagged as weakness',
  },
] as const;

const STATIC_PROMPT_ROWS: PromptGapRow[] = [
  {
    id: 'prompt-gap-1',
    type: 'prompt',
    phrase: 'How to track competitor backlinks prompts effectively?',
    avgSentiment: 8.4,
    mentions: 47,
    bestRank: 1,
    sov: '88%',
    competitors: ['semrush.com', 'ahrefs.com', 'moz.com'],
    competitorCount: 3,
    results: [],
  },
  {
    id: 'prompt-gap-2',
    type: 'prompt',
    phrase: 'How do AI tools compare for backlink monitoring?',
    avgSentiment: 7.6,
    mentions: 41,
    bestRank: 2,
    sov: '82%',
    competitors: ['semrush.com', 'serpstat.com'],
    competitorCount: 2,
    results: [],
  },
  {
    id: 'prompt-gap-3',
    type: 'prompt',
    phrase: 'Which SEO platform has the strongest prompt coverage?',
    avgSentiment: 7.1,
    mentions: 35,
    bestRank: 3,
    sov: '79%',
    competitors: ['ahrefs.com', 'moz.com'],
    competitorCount: 2,
    results: [],
  },
  {
    id: 'prompt-gap-4',
    type: 'prompt',
    phrase: 'Best workflow for tracking AI citations across competitors',
    avgSentiment: 6.8,
    mentions: 29,
    bestRank: 4,
    sov: '73%',
    competitors: ['spyfu.com', 'semrush.com'],
    competitorCount: 2,
    results: [],
  },
  {
    id: 'prompt-gap-5',
    type: 'prompt',
    phrase: 'How to turn prompt gaps into content opportunities',
    avgSentiment: 6.4,
    mentions: 21,
    bestRank: 5,
    sov: '68%',
    competitors: ['ahrefs.com', 'spyfu.com'],
    competitorCount: 2,
    results: [],
  },
];

function StaticAiResponseAnalysis() {
  return (
    <div className="border-t border-slate-200 bg-white px-4 py-4">
      <h3 className="text-sm font-semibold text-[#2D4059]">AI Response Analysis</h3>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-[#2D4059]">Competitive Ranking - Prompts tracking</h4>
          <div className="mt-4 space-y-4">
            {STATIC_ANALYSIS_COMPETITORS.map((item, index) => {
              const widths = [88, 76, 66, 58, 50];
              const badgeStyles =
                item.status === 'Strong'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : item.status === 'Medium'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700';

              return (
                <div key={item.name} className="grid grid-cols-[88px_minmax(0,1fr)_72px_52px] items-center gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="grid h-5 w-5 place-items-center rounded-sm bg-[#FF642F] text-[10px] font-semibold text-white">
                      {item.name === 'semrush.com' ? 's' : item.name === 'ahrefs.com' ? 'a' : item.name === 'moz.com' ? 'm' : item.name === 'serpstat.com' ? 's' : 's'}
                    </span>
                    <span className="truncate text-xs text-slate-600">{item.name}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200">
                    <div
                      className="h-1.5 rounded-full bg-[#7EA6FF]"
                      style={{ width: `${widths[index]}%` }}
                    />
                  </div>
                  <span className="justify-self-end text-[11px] text-[#7EA6FF]">{item.score}</span>
                  <span className={`justify-self-end rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeStyles}`}>
                    {item.status}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-[#2D4059]">Key Insights - Prompts Tracking</h4>
          <ul className="mt-3 space-y-3">
            {STATIC_ANALYSIS_INSIGHTS.map((item) => (
              <li key={item.title} className="text-sm leading-5 text-[#2D4059]">
                <div className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2D4059]" />
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-0.5 text-xs text-[#7B8494]">{item.detail}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

const AIResultsPromptGaps = () => {
  const navigate = useNavigate();
  const [allDomains, setAllDomains] = useState<DomainOption[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [worksheetOptions, setWorksheetOptions] = useState<WorksheetOption[]>([]);
  const [worksheetOptionsLoading, setWorksheetOptionsLoading] = useState(false);
  const [activeWorksheetId, setActiveWorksheetId] = useState<string | null>(null);
  const [isWorksheetModalOpen, setIsWorksheetModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setWorksheetOptionsLoading(true);
      try {
        const domainsResp = await apiGet<{ domains: DomainOption[] }>('/wizard/domains');
        const domains = Array.isArray(domainsResp?.domains) ? domainsResp.domains : [];
        if (!alive) return;
        setAllDomains(domains);
        const campaignsResp = await apiGet<{ campaigns: Array<{ id: number; title: string; description?: string | null }> }>('/campaigns').catch(
          () => ({ campaigns: [] })
        );
        if (!alive) return;
        setWorksheetOptions(
          (campaignsResp?.campaigns ?? []).map((campaign) => ({
            id: String(campaign.id),
            name: campaign.title,
            description: campaign.description ?? null,
          }))
        );
      } catch (err) {
        console.error('[PromptGaps] Failed to load page data:', err);
      } finally {
        if (alive) setWorksheetOptionsLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, []);

  const promptRows = useMemo(() => STATIC_PROMPT_ROWS, []);

  const selectedCount = selectedRowIds.size;

  const handleToggleRow = useCallback((id: string) => {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleOpenWorksheetModal = useCallback(
    (singleRowId?: string) => {
      if (singleRowId) {
        setSelectedRowIds(new Set([singleRowId]));
      } else if (selectedRowIds.size === 0) {
        return;
      }
      setActiveWorksheetId(null);
      setIsWorksheetModalOpen(true);
    },
    [selectedRowIds]
  );

  const handleWorksheetModalOpenChange = useCallback((open: boolean) => {
    setIsWorksheetModalOpen(open);
    if (!open) setActiveWorksheetId(null);
  }, []);

  const handleAddToWorksheet = useCallback(() => {
    if (!activeWorksheetId) return;

    const rowsById = new Map<string, PromptGapRow>(promptRows.map((row) => [row.id, row]));
    const selectedItemIds = Array.from(selectedRowIds);
    const selectedRows = selectedItemIds
      .map((id) => rowsById.get(id))
      .filter(Boolean)
      .map((row) => ({ id: String(row.id), prompt: row.phrase }));

    const payload = { activeWorksheetId, selectedItemIds, selectedRows };
    sessionStorage.setItem(WORKSHEET_TARGET_KEY, activeWorksheetId);
    sessionStorage.setItem(WORKSHEET_IMPORT_KEY, JSON.stringify(payload));
    localStorage.setItem('activeTab', 'projects');
    setIsWorksheetModalOpen(false);
    navigate('/dashboard');
  }, [activeWorksheetId, navigate, promptRows, selectedRowIds]);

  const handleCreateNewWorksheet = useCallback(async () => {
    const name = window.prompt('Worksheet name?')?.trim();
    if (!name) return;
    try {
      const created = await apiPost<{ campaign?: { id: number; title: string } }>('/campaigns', { title: name });
      const newId = created?.campaign?.id;
      if (!newId) return;
      const newOption: WorksheetOption = { id: String(newId), name, description: null };
      setWorksheetOptions((prev) => [newOption, ...prev]);
      setActiveWorksheetId(null);
      setIsWorksheetModalOpen(false);
      sessionStorage.setItem(WORKSHEET_TARGET_KEY, String(newId));
      localStorage.setItem('activeTab', 'projects');
      navigate('/dashboard');
    } catch (err) {
      console.error('[PromptGaps] Create worksheet failed:', err);
      alert('Failed to create worksheet. Please try again.');
    }
  }, [navigate]);

  const currentDomainSlug = localStorage.getItem(AI_VISIBILITY_LAST_DOMAIN_SLUG) ?? undefined;
  const currentDomain = allDomains.find((domain) => maskDomainId(domain.id) === currentDomainSlug);

  return (
    <AIResultsLayout
      activeItem="competitors"
      allDomains={allDomains}
      currentDomainId={currentDomain?.id}
      currentDomainUrl={currentDomain?.url}
      currentDomainHost={currentDomain?.host}
      currentDomainName={currentDomain?.companyName ?? currentDomain?.host}
      maskedDomainId={currentDomainSlug}
      title="Competitors"
    >
      <section className="flex w-full flex-col bg-white px-4 py-3 sm:px-6">
        <div className="rounded-xl border border-slate-200 bg-white">
          <PromptTable
            data={promptRows}
            selectedRowIds={selectedRowIds}
            onToggleRow={handleToggleRow}
            onOpenWorksheetModal={handleOpenWorksheetModal}
            title="Prompt Gaps Opportunities"
            defaultExpandedId={promptRows[0]?.id ?? null}
            renderExpandedDetails={() => <StaticAiResponseAnalysis />}
            footerActionLabel="View Library"
            footerActionIconSrc="/icons/book-open-01.svg"
            footerActionClassName="bg-[#F9F9F9] text-[#3393F2] hover:bg-[#F3F6FB]"
            footerActionIconClassName="text-[#3393F2]"
          />
        </div>
      </section>

      <WorksheetPickerModal
        open={isWorksheetModalOpen}
        selectedCount={selectedCount}
        activeWorksheetId={activeWorksheetId}
        worksheets={worksheetOptions}
        loading={worksheetOptionsLoading}
        onOpenChange={handleWorksheetModalOpenChange}
        onWorksheetSelect={setActiveWorksheetId}
        onAddToWorksheet={handleAddToWorksheet}
        onCreateNewWorksheet={handleCreateNewWorksheet}
      />
    </AIResultsLayout>
  );
};

export default AIResultsPromptGaps;
