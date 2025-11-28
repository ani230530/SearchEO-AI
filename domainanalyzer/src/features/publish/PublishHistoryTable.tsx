import React from 'react';
import { PublishHistoryEntry } from '@/types/publish';

interface PublishHistoryTableProps {
  entries: PublishHistoryEntry[];
  onRefresh: () => void;
  onNewDraft: () => void;
  onResumeDraft: (entry: PublishHistoryEntry) => void;
}

const PublishHistoryTable: React.FC<PublishHistoryTableProps> = ({
  entries,
  onRefresh,
  onNewDraft,
  onResumeDraft,
}) => {
  const renderRows = () =>
    entries.map((entry) => {
      const readableUrl = entry.wordpressUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const slugPath = entry.slug ? `${entry.slug}` : '';
      const fullUrl = readableUrl && slugPath ? `https://${readableUrl}/${slugPath}` : entry.wordpressUrl;
      const statusLabel = (entry.status || 'queued').toLowerCase();
      const isDraft = statusLabel === 'draft';
      const isGenerating = statusLabel === 'generating';
      const canResume =
        isDraft &&
        entry.response &&
        typeof entry.response === 'object' &&
        ((entry.response as Record<string, any>).htmlContent ||
          (entry.response as Record<string, any>)['Html Content']);

      return (
        <tr key={entry.id} className="border-b border-gray-50">
          <td className="py-4 pr-4">
            <p className="font-medium text-gray-900">
              {entry.title || entry.slug || entry.primaryKeyword || 'Untitled Post'}
            </p>
            {fullUrl && !isDraft && (
              <p className="text-xs text-gray-500 truncate max-w-[220px]">{fullUrl}</p>
            )}
          </td>
          <td className="py-4 pr-4 text-gray-700">{entry.primaryKeyword || '—'}</td>
          <td className="py-4 pr-4">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                isGenerating
                  ? 'bg-blue-100 text-blue-800'
                  : isDraft
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {isGenerating && (
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4A8 8 0 104 12z" />
                </svg>
              )}
              {statusLabel}
            </span>
          </td>
          <td className="py-4 pr-4 text-gray-600">{new Date(entry.createdAt).toLocaleString()}</td>
          <td className="py-4 text-right">
            {isGenerating ? (
              <span className="text-xs text-gray-400">Generating...</span>
            ) : canResume ? (
              <button
                onClick={() => onResumeDraft(entry)}
                className="px-4 py-2 text-xs font-semibold rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Resume draft
              </button>
            ) : fullUrl ? (
              <a
                href={fullUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 text-xs font-semibold rounded-full bg-gray-900 text-white hover:bg-black"
              >
                View live
              </a>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
          </td>
        </tr>
      );
    });

  return (
    <div className="rounded-[32px] border border-gray-100/80 bg-white/85 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-2xl font-light text-black tracking-tight">Drafts & Published Pages</h3>
          <p className="text-sm text-gray-500">Track everything you&apos;ve generated from this workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onRefresh}
            className="px-4 py-2 text-sm rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            onClick={onNewDraft}
            className="px-4 py-2 text-sm rounded-full bg-black text-white hover:bg-black/90 shadow"
          >
            New draft
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-gray-500 border-b border-gray-100">
              <th className="py-3 pr-4">Title</th>
              <th className="py-3 pr-4">Keyword</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Created</th>
              <th className="py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  No drafts or published posts yet. Start by publishing a page.
                </td>
              </tr>
            ) : (
              renderRows()
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PublishHistoryTable;


