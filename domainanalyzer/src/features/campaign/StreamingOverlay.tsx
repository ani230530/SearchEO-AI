import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { GenerationStreamingEvent } from '@/types';

interface StreamingOverlayProps {
  isVisible: boolean;
  events: GenerationStreamingEvent[];
}

export const StreamingOverlay: React.FC<StreamingOverlayProps> = ({
  isVisible,
  events,
}) => {
  const [activeMessage, setActiveMessage] = useState<string>('Initializing...');

  useEffect(() => {
    if (events.length > 0) {
      setActiveMessage(events[events.length - 1].message);
    } else if (isVisible) {
      setActiveMessage('Preparing your content generation...');
    }
  }, [events, isVisible]);

  const pageCount = new Set(events.map((event) => event.pageId).filter((pageId) => typeof pageId === 'number')).size;

  if (!isVisible) return null;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-30 w-full max-w-sm">
      <div className="ml-auto rounded-[24px] border border-gray-200/80 bg-white/88 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur-md transition-all duration-500 animate-in slide-in-from-top-3 fade-in">
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-gray-400">Generation Live</p>
                <h3 className="mt-1 text-sm font-semibold text-gray-900">Content is generating in the background</h3>
              </div>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600">
                {pageCount || 0} page{pageCount === 1 ? '' : 's'}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-gray-700">{activeMessage}</p>
            <p className="mt-2 text-[11px] text-gray-400">Live updates will appear here as each page progresses.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
