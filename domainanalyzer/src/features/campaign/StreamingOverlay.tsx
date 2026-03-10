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
    <div className="pointer-events-none absolute right-4 top-4 z-30 w-full max-w-[280px]">
      <div className="ml-auto rounded-[20px] border border-gray-200/80 bg-white/90 px-3.5 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.08)] backdrop-blur-md transition-all duration-500 animate-in slide-in-from-top-3 fade-in">
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 flex h-8 w-8 items-center justify-center rounded-2xl bg-black text-white shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">Generating</p>
                <h3 className="mt-0.5 text-[13px] font-medium text-gray-900">Pages are updating</h3>
              </div>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                {pageCount || 0} page{pageCount === 1 ? '' : 's'}
              </span>
            </div>

            <p className="mt-2 text-[12px] leading-5 text-gray-600">{activeMessage}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
