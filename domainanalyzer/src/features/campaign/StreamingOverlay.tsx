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
    <div className="pointer-events-none absolute right-4 top-4 z-30 w-full max-w-[260px]">
      <div className="ml-auto rounded-[18px] border border-gray-200 bg-white/92 px-3 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] backdrop-blur-md transition-all duration-500 animate-in slide-in-from-top-3 fade-in">
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700">
            <Loader2 className="h-3 w-3 animate-spin" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">Generating</p>
                <h3 className="mt-0.5 text-[12px] font-medium text-gray-900">Pages are updating</h3>
              </div>
              <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500">
                {pageCount || 0} page{pageCount === 1 ? '' : 's'}
              </span>
            </div>

            <p className="mt-1.5 text-[12px] leading-5 text-gray-500">{activeMessage}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
