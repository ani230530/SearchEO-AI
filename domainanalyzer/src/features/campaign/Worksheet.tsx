import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  ChevronDown,
  Command,
  Download,
  Feather,
  Filter,
  FolderOpen,
  Plus,
  Radio,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

type WorksheetRow = {
  id: number;
  topic: string;
  keywords: string[];
};

type WorksheetColumnKey = 'topic' | 'keywords' | 'status' | 'action' | 'more';

const createWorksheetRow = (id: number): WorksheetRow => ({
  id,
  topic: '',
  keywords: [],
});

const getWorksheetStatus = (row: WorksheetRow): 'Not Started' | 'In Progress' | 'Ready' => {
  if (row.topic.trim() && row.keywords.length) return 'Ready';
  if (row.topic.trim() || row.keywords.length) return 'In Progress';
  return 'Not Started';
};

interface WorksheetProps {
  /** Optional context for AI-suggested keywords (campaign title, etc.) */
  titleContext?: string;
  /** Optional pool of seed keywords used for AI suggestions */
  keywordsTableData?: Array<{ keyword?: string }>;
  /** Notified whenever the serialized worksheet description changes */
  onDescriptionChange?: (description: string) => void;
}

export default function Worksheet({
  titleContext = '',
  keywordsTableData = [],
  onDescriptionChange,
}: WorksheetProps) {
  const [worksheetRows, setWorksheetRows] = useState<WorksheetRow[]>(
    Array.from({ length: 8 }, (_, idx) => createWorksheetRow(idx + 1))
  );
  const [worksheetSearch, setWorksheetSearch] = useState('');
  const [addModalRowId, setAddModalRowId] = useState<number | null>(null);
  const [addModalMode, setAddModalMode] = useState<'topic' | 'keywords'>('keywords');
  const [addModalValue, setAddModalValue] = useState('');
  const [worksheetNotice, setWorksheetNotice] = useState('');
  const [deleteRowId, setDeleteRowId] = useState<number | null>(null);
  const [openColumnMenu, setOpenColumnMenu] = useState<WorksheetColumnKey | null>(null);
  const [columnLabels, setColumnLabels] = useState<Record<WorksheetColumnKey, string>>({
    topic: 'Topic',
    keywords: 'Keywords',
    status: 'Status',
    action: 'Action',
    more: 'More',
  });
  const [columnVisibility, setColumnVisibility] = useState<Record<WorksheetColumnKey, boolean>>({
    topic: true,
    keywords: true,
    status: true,
    action: true,
    more: true,
  });
  const [renameColumnKey, setRenameColumnKey] = useState<WorksheetColumnKey | null>(null);
  const [renameColumnValue, setRenameColumnValue] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const keywordSeedPool = useMemo(() => {
    const fromDomainKeywords = (keywordsTableData || [])
      .map((item) => String(item?.keyword || '').trim())
      .filter(Boolean);
    const fromTitle = titleContext.trim()
      ? [
          `${titleContext.trim()} strategy`,
          `${titleContext.trim()} guide`,
          `best ${titleContext.trim()}`,
          `${titleContext.trim()} services`,
        ]
      : [];

    return Array.from(new Set([...fromDomainKeywords, ...fromTitle]));
  }, [keywordsTableData, titleContext]);

  const worksheetRowsFiltered = useMemo(() => {
    const query = worksheetSearch.trim().toLowerCase();
    if (!query) return worksheetRows;
    return worksheetRows.filter((row) => {
      const topicMatch = row.topic.toLowerCase().includes(query);
      const keywordMatch = row.keywords.some((k) => k.toLowerCase().includes(query));
      return topicMatch || keywordMatch;
    });
  }, [worksheetRows, worksheetSearch]);

  const worksheetDescription = useMemo(() => {
    const rows = worksheetRows
      .filter((row) => row.topic.trim() || row.keywords.length > 0)
      .map((row) => ({
        topic: row.topic.trim(),
        keywords: row.keywords,
        status: getWorksheetStatus(row),
      }));

    return JSON.stringify(
      {
        source: 'create-project-worksheet',
        rows,
      },
      null,
      2
    );
  }, [worksheetRows]);

  useEffect(() => {
    onDescriptionChange?.(worksheetDescription);
  }, [worksheetDescription, onDescriptionChange]);

  const updateWorksheetRow = (rowId: number, updater: (row: WorksheetRow) => WorksheetRow) => {
    setWorksheetRows((prev) => prev.map((row) => (row.id === rowId ? updater(row) : row)));
  };

  const handleAddTopic = (rowId: number) => {
    setAddModalMode('topic');
    setAddModalRowId(rowId);
    const existing = worksheetRows.find((row) => row.id === rowId)?.topic || '';
    setAddModalValue(existing);
  };

  const handleAddKeyword = (rowId: number) => {
    setAddModalMode('keywords');
    setAddModalRowId(rowId);
    setAddModalValue('');
  };

  const closeAddModal = () => {
    setAddModalRowId(null);
    setAddModalValue('');
  };

  const handleSubmitAddModal = () => {
    if (addModalRowId === null) return;

    if (addModalMode === 'topic') {
      const value = addModalValue.trim();
      if (!value) return;
      updateWorksheetRow(addModalRowId, (row) => ({ ...row, topic: value }));
      closeAddModal();
      return;
    }

    const incoming = addModalValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!incoming.length) return;

    updateWorksheetRow(addModalRowId, (row) => {
      const existing = new Set(row.keywords.map((item) => item.toLowerCase()));
      const merged = [...row.keywords];
      incoming.forEach((item) => {
        if (!existing.has(item.toLowerCase())) {
          merged.push(item);
          existing.add(item.toLowerCase());
        }
      });
      return { ...row, keywords: merged };
    });

    closeAddModal();
  };

  const handleAiSuggest = (rowId: number) => {
    const row = worksheetRows.find((item) => item.id === rowId);
    if (!row) return;
    const used = new Set(row.keywords.map((item) => item.toLowerCase()));
    const context = `${titleContext} ${row.topic}`.toLowerCase().trim();
    const sorted = [...keywordSeedPool]
      .filter((item) => !used.has(item.toLowerCase()))
      .sort((a, b) => {
        const as = context && a.toLowerCase().includes(context) ? 1 : 0;
        const bs = context && b.toLowerCase().includes(context) ? 1 : 0;
        return bs - as;
      })
      .slice(0, 3);

    if (!sorted.length) return;
    updateWorksheetRow(rowId, (current) => ({
      ...current,
      keywords: [...current.keywords, ...sorted],
    }));
  };

  const handleTopicAiSuggest = (rowId: number) => {
    const row = worksheetRows.find((item) => item.id === rowId);
    if (!row) return;

    const preferred = row.keywords[0] || keywordSeedPool[0] || titleContext.trim();
    if (!preferred) return;

    const topicPhrase = `How to rank for ${preferred}`;
    updateWorksheetRow(rowId, (current) => ({ ...current, topic: topicPhrase }));
  };

  const handleRemoveKeyword = (rowId: number, keywordIndex: number) => {
    updateWorksheetRow(rowId, (row) => ({
      ...row,
      keywords: row.keywords.filter((_, idx) => idx !== keywordIndex),
    }));
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const trimmed = text.trim();
      if (!trimmed) return;

      let importedRows: WorksheetRow[] = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(trimmed) as
          | Array<{ topic?: string; keywords?: string[] }>
          | { rows?: Array<{ topic?: string; keywords?: string[] }> };

        const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
        importedRows = rows.map((row, idx) => ({
          id: idx + 1,
          topic: String(row.topic || '').trim(),
          keywords: Array.isArray(row.keywords)
            ? row.keywords.map((k) => String(k).trim()).filter(Boolean)
            : [],
        }));
      } else {
        const lines = trimmed.split(/\r?\n/).filter(Boolean);
        const dataLines = lines[0]?.toLowerCase().includes('topic') ? lines.slice(1) : lines;
        importedRows = dataLines.map((line, idx) => {
          const [topicPart = '', keywordsPart = ''] = line.split(',');
          const keywords = keywordsPart
            .split('|')
            .map((k) => k.trim())
            .filter(Boolean);

          return {
            id: idx + 1,
            topic: topicPart.trim(),
            keywords,
          };
        });
      }

      const cleanRows = importedRows.filter((row) => row.topic || row.keywords.length);
      if (!cleanRows.length) {
        setWorksheetNotice('No valid rows found in import file.');
        return;
      }

      setWorksheetRows(cleanRows);
      setWorksheetNotice(`Imported ${cleanRows.length} row(s) successfully.`);
    } catch (error) {
      console.error('Failed to import worksheet rows:', error);
      setWorksheetNotice('Import failed. Use JSON or CSV file format.');
    } finally {
      event.target.value = '';
    }
  };

  const handleExportData = () => {
    const payload = worksheetRows.map((row) => ({
      topic: row.topic,
      keywords: row.keywords,
      status: getWorksheetStatus(row),
    }));

    const blob = new Blob([JSON.stringify({ rows: payload }, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `worksheet-export-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setWorksheetNotice('Worksheet exported.');
  };

  const handleConfirmDeleteRow = () => {
    if (deleteRowId === null) return;

    setWorksheetRows((prev) => {
      const next = prev.filter((row) => row.id !== deleteRowId);
      if (next.length === 0) return [createWorksheetRow(1)];
      return next;
    });
    setDeleteRowId(null);
  };

  const handleAddWorksheetRow = () => {
    setWorksheetRows((prev) => {
      const nextId = prev.reduce((maxId, row) => (row.id > maxId ? row.id : maxId), 0) + 1;
      return [...prev, createWorksheetRow(nextId)];
    });
  };

  const handleOpenRenameColumn = (columnKey: WorksheetColumnKey) => {
    setRenameColumnKey(columnKey);
    setRenameColumnValue(columnLabels[columnKey]);
    setOpenColumnMenu(null);
  };

  const handleSubmitRenameColumn = () => {
    if (!renameColumnKey) return;
    const value = renameColumnValue.trim();
    if (!value) return;
    setColumnLabels((prev) => ({ ...prev, [renameColumnKey]: value }));
    setRenameColumnKey(null);
    setRenameColumnValue('');
  };

  const handleDeleteColumn = (columnKey: WorksheetColumnKey) => {
    const visibleCount = Object.values(columnVisibility).filter(Boolean).length;
    if (visibleCount <= 1) {
      setWorksheetNotice('At least one column must remain visible.');
      setOpenColumnMenu(null);
      return;
    }

    setColumnVisibility((prev) => ({ ...prev, [columnKey]: false }));
    setOpenColumnMenu(null);
  };

  return (
    <>
      <div className="w-full rounded-xl ">
        <div className="px-3 sm:px-4 pt-4 pb-3 border-b border-[#d8dce4]">
          <div className="flex items-center gap-3 leading-none">
            <h2 className="text-[32px] font-medium tracking-tight text-gray-800">Worksheet</h2>
          </div>

          <div className="mt-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-5">
              <div className="relative w-full min-w-[360px]">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#818a9a]" />
                <input
                  type="text"
                  value={worksheetSearch}
                  onChange={(e) => setWorksheetSearch(e.target.value)}
                  placeholder="Search Phrases or Keywords..."
                  className="h-9 w-full rounded-md border border-[#bfc6d2] pl-9 pr-3 text-sm text-[#374252] placeholder:text-[#9aa3b2] focus:outline-none focus:ring-1 focus:ring-[#9cb0d9]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                title="Filter"
                aria-label="Filter"
                className="inline-flex items-center gap-2 text-[#4a5568] text-sm font-medium"
              >
                <Filter className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Sort"
                aria-label="Sort"
                className="inline-flex items-center gap-2 text-[#4a5568] text-sm font-medium"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                className="h-9 px-3 rounded-md border border-[#909bb0] text-[#495668] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                Import Data
              </button>
              <button
                type="button"
                onClick={handleExportData}
                className="h-9 px-3 rounded-md border border-[#909bb0] text-[#495668] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Download className="h-4 w-4" />
                Export Data
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                className="hidden"
                onChange={handleImportFileChange}
              />
            </div>
          </div>
          {worksheetNotice && (
            <p className="mt-2 text-xs text-[#58667d]">{worksheetNotice}</p>
          )}
        </div>

        <div className="p-3 sm:p-4">
          <div className="overflow-auto border border-[#c8cfdb]">
            <table className="min-w-[980px] w-full">
              <thead className="bg-[#e6e8eb] border-b border-[#c8cfdb]">
                <tr className="h-10">
                  <th className="w-10 border-r border-[#c8cfdb] px-3 text-left">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-[#8e99ad]" />
                  </th>
                  {columnVisibility.topic && (
                    <th className="relative w-[240px] border-r border-[#c8cfdb] px-4 text-left">
                      <div className="flex items-center justify-between text-[#3f4f69] text-sm tracking-wide">
                        <span className="inline-flex items-center gap-1.5">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="none">
                            <g clipPath="url(#topicIconClip)">
                              <path d="M10.6901 1.81666C10.473 1.71762 10.2371 1.66637 9.99842 1.66637C9.75977 1.66637 9.52389 1.71762 9.30676 1.81666L2.16509 5.06666C2.01721 5.13187 1.89149 5.23866 1.80323 5.37404C1.71496 5.50943 1.66797 5.66755 1.66797 5.82916C1.66797 5.99078 1.71496 6.1489 1.80323 6.28428C1.89149 6.41967 2.01721 6.52646 2.16509 6.59166L9.31509 9.85C9.53223 9.94904 9.7681 10.0003 10.0068 10.0003C10.2454 10.0003 10.4813 9.94904 10.6984 9.85L17.8484 6.6C17.9963 6.53479 18.122 6.428 18.2103 6.29262C18.2986 6.15724 18.3455 5.99911 18.3455 5.8375C18.3455 5.67588 18.2986 5.51776 18.2103 5.38238C18.122 5.247 17.9963 5.1402 17.8484 5.075L10.6901 1.81666Z" stroke="#2D4059" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M1.66602 10C1.66562 10.1594 1.71095 10.3155 1.79662 10.45C1.88228 10.5844 2.0047 10.6914 2.14935 10.7583L9.31602 14.0167C9.53202 14.1145 9.7664 14.1651 10.0035 14.1651C10.2406 14.1651 10.475 14.1145 10.691 14.0167L17.841 10.7667C17.9885 10.7004 18.1136 10.5926 18.2009 10.4564C18.2882 10.3203 18.334 10.1617 18.3327 10" stroke="#2D4059" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M1.66602 14.1667C1.66562 14.326 1.71095 14.4822 1.79662 14.6166C1.88228 14.751 2.0047 14.858 2.14935 14.925L9.31602 18.1833C9.53202 18.2811 9.7664 18.3317 10.0035 18.3317C10.2406 18.3317 10.475 18.2811 10.691 18.1833L17.841 14.9333C17.9885 14.867 18.1136 14.7592 18.2009 14.6231C18.2882 14.487 18.334 14.3284 18.3327 14.1667" stroke="#2D4059" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </g>
                            <defs>
                              <clipPath id="topicIconClip">
                                <rect width="20" height="20" fill="white" />
                              </clipPath>
                            </defs>
                          </svg>
                          {columnLabels.topic}
                        </span>
                        <button type="button" onClick={() => setOpenColumnMenu(openColumnMenu === 'topic' ? null : 'topic')}>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {openColumnMenu === 'topic' && (
                        <div className="absolute right-2 top-10 z-20 w-40 rounded-md border border-gray-200 bg-white shadow-lg">
                          <button type="button" onClick={() => handleOpenRenameColumn('topic')} className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50">Rename</button>
                          <button type="button" onClick={() => handleDeleteColumn('topic')} className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-gray-50">Delete Column</button>
                        </div>
                      )}
                    </th>
                  )}
                  {columnVisibility.keywords && (
                    <th className="relative w-[460px] border-r border-[#c8cfdb] px-4 text-left">
                      <div className="flex items-center justify-between text-[#3f4f69] text-sm tracking-wide">
                        <span className="inline-flex items-center gap-1.5">
                          <Command className="h-4 w-4 text-[#2D4059]" />
                          {columnLabels.keywords}
                        </span>
                        <button type="button" onClick={() => setOpenColumnMenu(openColumnMenu === 'keywords' ? null : 'keywords')}>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {openColumnMenu === 'keywords' && (
                        <div className="absolute right-2 top-10 z-20 w-40 rounded-md border border-gray-200 bg-white shadow-lg">
                          <button type="button" onClick={() => handleOpenRenameColumn('keywords')} className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50">Rename</button>
                          <button type="button" onClick={() => handleDeleteColumn('keywords')} className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-gray-50">Delete Column</button>
                        </div>
                      )}
                    </th>
                  )}
                  {columnVisibility.status && (
                    <th className="relative w-[220px] border-r border-[#c8cfdb] px-4 text-left">
                      <div className="flex items-center justify-between text-[#3f4f69] text-sm tracking-wide">
                        <span className="inline-flex items-center gap-1.5">
                          <Radio className="h-4 w-4 text-[#2D4059]" />
                          {columnLabels.status}
                        </span>
                        <button type="button" onClick={() => setOpenColumnMenu(openColumnMenu === 'status' ? null : 'status')}>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {openColumnMenu === 'status' && (
                        <div className="absolute right-2 top-10 z-20 w-40 rounded-md border border-gray-200 bg-white shadow-lg">
                          <button type="button" onClick={() => handleOpenRenameColumn('status')} className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50">Rename</button>
                          <button type="button" onClick={() => handleDeleteColumn('status')} className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-gray-50">Delete Column</button>
                        </div>
                      )}
                    </th>
                  )}
                  {columnVisibility.action && (
                    <th className="relative w-[220px] px-4 text-left">
                      <div className="flex items-center justify-between text-[#3f4f69] text-sm tracking-wide">
                        <span className="inline-flex items-center gap-1.5">
                          <Feather className="h-4 w-4 text-[#2D4059]" />
                          {columnLabels.action}
                        </span>
                        <button type="button" onClick={() => setOpenColumnMenu(openColumnMenu === 'action' ? null : 'action')}>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {openColumnMenu === 'action' && (
                        <div className="absolute right-2 top-10 z-20 w-40 rounded-md border border-gray-200 bg-white shadow-lg">
                          <button type="button" onClick={() => handleOpenRenameColumn('action')} className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50">Rename</button>
                          <button type="button" onClick={() => handleDeleteColumn('action')} className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-gray-50">Delete Column</button>
                        </div>
                      )}
                    </th>
                  )}
                  {columnVisibility.more && (
                    <th className="relative w-[100px] border-l border-[#c8cfdb] px-4 text-left">
                      <div className="flex items-center justify-between text-[#3f4f69] text-sm tracking-wide">
                        <span className="inline-flex items-center gap-1.5">
                          <FolderOpen className="h-4 w-4 text-[#2D4059]" />
                          {columnLabels.more}
                        </span>
                        <button type="button" onClick={() => setOpenColumnMenu(openColumnMenu === 'more' ? null : 'more')}>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {openColumnMenu === 'more' && (
                        <div className="absolute right-2 top-10 z-20 w-40 rounded-md border border-gray-200 bg-white shadow-lg">
                          <button type="button" onClick={() => handleOpenRenameColumn('more')} className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50">Rename</button>
                          <button type="button" onClick={() => handleDeleteColumn('more')} className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-gray-50">Delete Column</button>
                        </div>
                      )}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {worksheetRowsFiltered.map((row, idx) => {
                  const status = getWorksheetStatus(row);
                  return (
                    <tr key={row.id} className={`h-[86px] border-b border-[#c8cfdb] ${idx % 2 ? 'bg-[#dde3ef]' : 'bg-[#f5f6f8]'}`}>
                      <td className="border-r border-[#c8cfdb] px-3 align-middle">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-[#8e99ad]" />
                      </td>
                      {columnVisibility.topic && (
                        <td className="border-r border-[#c8cfdb] px-4 align-middle">
                          <div className="flex flex-col gap-2">
                            {!row.topic && (
                              <div className="flex items-center justify-center gap-4 text-xs min-h-[60px]">
                                <button
                                  type="button"
                                  onClick={() => handleAddTopic(row.id)}
                                  className="text-[#354b73] hover:text-[#1e2f4f] font-medium"
                                >
                                  + Add Topic
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleTopicAiSuggest(row.id)}
                                  className="inline-flex items-center gap-1 text-[#4c6fae] hover:text-[#34558e] font-medium"
                                >
                                  <Sparkles className="h-3 w-3" />
                                  AI Suggest
                                </button>
                              </div>
                            )}
                            <div className="min-h-[34px] text-[15px] leading-[1.3] text-[#2b3548]">
                              {row.topic ? (
                                <div className="inline-flex max-w-full items-start px-0 py-0">
                                  <p className="whitespace-pre-wrap break-words">{row.topic}</p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      )}
                      {columnVisibility.keywords && (
                        <td className="border-r border-[#c8cfdb] px-4 align-middle">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-center gap-4 text-xs min-h-[34px]">
                              <button type="button" onClick={() => handleAddKeyword(row.id)} className="text-[#354b73] hover:text-[#1e2f4f] font-medium">
                                + Add
                              </button>
                              <button type="button" onClick={() => handleAiSuggest(row.id)} className="inline-flex items-center gap-1 text-[#4c6fae] hover:text-[#34558e] font-medium">
                                <Sparkles className="h-3 w-3" />
                                AI Suggest
                              </button>
                            </div>
                            <div className="min-h-[34px] flex flex-wrap gap-1.5">
                              {row.keywords.length ? (
                                row.keywords.map((keyword, keywordIdx) => (
                                  <span
                                    key={`${row.id}-${keyword}-${keywordIdx}`}
                                    className="inline-flex items-center gap-1 rounded-md border border-[#9db5e0] bg-[#eaf1ff] px-2 py-0.5 text-[11px] text-[#3c5e99]"
                                  >
                                    {keyword}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveKeyword(row.id, keywordIdx)}
                                      className="text-[#6f84ac] hover:text-[#2d4f8b]"
                                      aria-label={`Remove ${keyword}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))
                              ) : null}
                            </div>
                          </div>
                        </td>
                      )}
                      {columnVisibility.status && (
                        <td className="border-r border-[#c8cfdb] px-4 align-middle text-center">
                          <div className="inline-flex items-center gap-2 text-[#636f83] text-xs">
                            <AlertCircle className="h-4 w-4" />
                            {status}
                          </div>
                        </td>
                      )}
                      {columnVisibility.action && (
                        <td className="px-4 align-middle text-center">
                          <button
                            type="button"
                            disabled={status === 'Not Started'}
                            className="h-9 px-5 inline-flex items-center gap-2 rounded-xl border border-[#4E76C7] text-sm font-medium bg-[#f4f8ff] hover:bg-[#eaf1ff] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="15" viewBox="0 0 20 15" fill="none">
                              <path d="M18.125 1.25C18.2908 1.25 18.4497 1.31585 18.5669 1.43306C18.6842 1.55027 18.75 1.70924 18.75 1.875V13.125C18.75 13.2908 18.6842 13.4497 18.5669 13.5669C18.4497 13.6842 18.2908 13.75 18.125 13.75H1.875C1.70924 13.75 1.55027 13.6842 1.43306 13.5669C1.31585 13.4497 1.25 13.2908 1.25 13.125V1.875C1.25 1.70924 1.31585 1.55027 1.43306 1.43306C1.55027 1.31585 1.70924 1.25 1.875 1.25H18.125ZM1.875 0C1.37772 0 0.900805 0.197544 0.549175 0.549175C0.197544 0.900806 0 1.37772 0 1.875L0 13.125C0 13.6223 0.197544 14.0992 0.549175 14.4508C0.900805 14.8025 1.37772 15 1.875 15H18.125C18.6223 15 19.0992 14.8025 19.4508 14.4508C19.8025 14.0992 20 13.6223 20 13.125V1.875C20 1.37772 19.8025 0.900806 19.4508 0.549175C19.0992 0.197544 18.6223 0 18.125 0H1.875Z" fill="url(#paint0_linear_1424_32592)" />
                              <path d="M3.75 8.125C3.75 7.95924 3.81585 7.80027 3.93306 7.68306C4.05027 7.56585 4.20924 7.5 4.375 7.5H15.625C15.7908 7.5 15.9497 7.56585 16.0669 7.68306C16.1842 7.80027 16.25 7.95924 16.25 8.125C16.25 8.29076 16.1842 8.44973 16.0669 8.56694C15.9497 8.68415 15.7908 8.75 15.625 8.75H4.375C4.20924 8.75 4.05027 8.68415 3.93306 8.56694C3.81585 8.44973 3.75 8.29076 3.75 8.125ZM3.75 10.625C3.75 10.4592 3.81585 10.3003 3.93306 10.1831C4.05027 10.0658 4.20924 10 4.375 10H11.875C12.0408 10 12.1997 10.0658 12.3169 10.1831C12.4342 10.3003 12.5 10.4592 12.5 10.625C12.5 10.7908 12.4342 10.9497 12.3169 11.0669C12.1997 11.1842 12.0408 11.25 11.875 11.25H4.375C4.20924 11.25 4.05027 11.1842 3.93306 11.0669C3.81585 10.9497 3.75 10.7908 3.75 10.625ZM3.75 4.375C3.75 4.20924 3.81585 4.05027 3.93306 3.93306C4.05027 3.81585 4.20924 3.75 4.375 3.75H15.625C15.7908 3.75 15.9497 3.81585 16.0669 3.93306C16.1842 4.05027 16.25 4.20924 16.25 4.375V5.625C16.25 5.79076 16.1842 5.94973 16.0669 6.06694C15.9497 6.18415 15.7908 6.25 15.625 6.25H4.375C4.20924 6.25 4.05027 6.18415 3.93306 6.06694C3.81585 5.94973 3.75 5.79076 3.75 5.625V4.375Z" fill="url(#paint1_linear_1424_32592)" />
                              <defs>
                                <linearGradient id="paint0_linear_1424_32592" x1="0" y1="7.5" x2="20" y2="7.5" gradientUnits="userSpaceOnUse">
                                  <stop stopColor="#2D4059" />
                                  <stop offset="1" stopColor="#4E76C7" />
                                </linearGradient>
                                <linearGradient id="paint1_linear_1424_32592" x1="3.75" y1="7.5" x2="16.25" y2="7.5" gradientUnits="userSpaceOnUse">
                                  <stop stopColor="#2D4059" />
                                  <stop offset="1" stopColor="#4E76C7" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <span className="text-blue-800 font-medium">
                              Generate
                            </span>
                          </button>
                        </td>
                      )}
                      {columnVisibility.more && (
                        <td className="border-l border-[#c8cfdb] px-4 align-middle text-center">
                          <button
                            type="button"
                            onClick={() => setDeleteRowId(row.id)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[#d14f4f] hover:bg-[#ffecec]"
                            aria-label="Delete row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={handleAddWorksheetRow}
              className="inline-flex items-center gap-2 rounded-md border border-[#8fa1bf] px-3 py-2 text-xs font-medium text-[#2f4f89] hover:bg-[#ecf3ff]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </button>
          </div>
        </div>
      </div>

      {addModalRowId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeAddModal}
          />
          <div className="relative w-full max-w-xl mx-4 bg-white rounded-xl p-8 border border-gray-100 shadow-xl">
            <h3 className="text-xl font-light text-black tracking-tight mb-2">
              {addModalMode === 'topic' ? 'Add Topic' : 'Add Keywords'}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {addModalMode === 'topic'
                ? 'Enter the topic for this worksheet row.'
                : 'Enter one or multiple keywords separated by commas.'}
            </p>
            <div className="space-y-2 mb-6">
              <label className="block text-base font-light text-black">
                {addModalMode === 'topic' ? 'Topic' : 'Keywords'}
              </label>
              {addModalMode === 'topic' ? (
                <input
                  value={addModalValue}
                  onChange={(e) => setAddModalValue(e.target.value)}
                  placeholder="e.g. How to Rank on Different Digital Channels"
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-black focus:outline-none"
                />
              ) : (
                <textarea
                  value={addModalValue}
                  onChange={(e) => setAddModalValue(e.target.value)}
                  placeholder="e.g. seo audit tool, website seo checker, technical seo report"
                  className="w-full min-h-[120px] px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-black focus:outline-none"
                />
              )}
            </div>
            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={closeAddModal}
                className="px-6 py-3 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitAddModal}
                className="px-6 py-3 bg-black text-white rounded-md hover:opacity-90"
                style={{
                  background: 'linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)',
                }}
              >
                {addModalMode === 'topic' ? 'Add Topic' : 'Add Keywords'}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameColumnKey !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setRenameColumnKey(null);
              setRenameColumnValue('');
            }}
          />
          <div className="relative w-full max-w-md mx-4 bg-white rounded-xl p-8 border border-gray-100 shadow-xl">
            <h3 className="text-xl font-light text-black tracking-tight mb-2">
              Rename Column
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Enter a new column title.
            </p>
            <input
              type="text"
              value={renameColumnValue}
              onChange={(e) => setRenameColumnValue(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-black focus:outline-none mb-6"
              placeholder="Column title"
            />
            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => {
                  setRenameColumnKey(null);
                  setRenameColumnValue('');
                }}
                className="px-6 py-3 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitRenameColumn}
                className="px-6 py-3 bg-black text-white rounded-md hover:opacity-90"
                style={{ background: 'linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRowId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteRowId(null)}
          />
          <div className="relative w-full max-w-md mx-4 bg-white rounded-xl p-8 border border-gray-100 shadow-xl">
            <h3 className="text-xl font-light text-black tracking-tight mb-2">
              Delete Row
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete this row? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => setDeleteRowId(null)}
                className="px-6 py-3 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRow}
                className="px-6 py-3 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
