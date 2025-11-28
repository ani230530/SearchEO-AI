import React from 'react';
import { WordpressIntegration } from '@/types/publish';

interface PublishOverviewCardProps {
  hasWordpressIntegration: boolean;
  wpIntegration: WordpressIntegration | null;
  publishHistoryCount: number;
  publishWordCount: number;
  publishImageCount: number;
  publishStage: 'compose' | 'preview';
  onOpenComposeDrawer: () => void;
  onExitPreview: () => void;
}

const PublishOverviewCard: React.FC<PublishOverviewCardProps> = ({
  hasWordpressIntegration,
  wpIntegration,
  publishHistoryCount,
  publishWordCount,
  publishImageCount,
  publishStage,
  onOpenComposeDrawer,
  onExitPreview,
}) => (
  <div className="rounded-[32px] border border-gray-100/80 bg-white/80 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-8">
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2 font-light">WordPress status</p>
        <h3 className="text-2xl font-light text-black">
          {hasWordpressIntegration ? 'Ready to publish' : 'Not connected'}
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          {wpIntegration?.lastPublishedAt
            ? `Last published ${new Date(wpIntegration.lastPublishedAt).toLocaleString()}`
            : 'No posts have been published yet'}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 rounded-[28px] border border-gray-100/70 bg-white/70 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Recent Posts</p>
          <p className="text-2xl font-semibold text-gray-900">{publishHistoryCount}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Word Count</p>
          <p className="text-2xl font-semibold text-gray-900">{publishWordCount}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Images</p>
          <p className="text-2xl font-semibold text-gray-900">{publishImageCount}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-6">
        <button
          onClick={onOpenComposeDrawer}
          className="px-6 py-3 rounded-full bg-black text-white text-sm font-semibold shadow-lg hover:bg-black/90 transition-colors"
        >
          Publish a page
        </button>
        {publishStage === 'preview' && (
          <button
            onClick={onExitPreview}
            className="px-5 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
          >
            Exit preview
          </button>
        )}
      </div>
    </div>
  </div>
);

export default PublishOverviewCard;


