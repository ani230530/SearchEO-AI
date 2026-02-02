import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface StreamingOverlayProps {
  isVisible: boolean;
  messages: Array<{ message: string; timestamp: string }>;
  jobId?: string;
}

export const StreamingOverlay: React.FC<StreamingOverlayProps> = ({
  isVisible,
  messages,
  jobId
}) => {
  const [activeMessage, setActiveMessage] = useState<string>('Initializing...');

  // Auto-scroll messages or show latest
  useEffect(() => {
    if (messages.length > 0) {
      setActiveMessage(messages[messages.length - 1].message);
    }
  }, [messages]);

  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 transition-all duration-500">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-gray-400 animate-pulse" />
            </div>
        </div>
        
        <div className="space-y-2">
            <h3 className="text-xl font-light tracking-tight text-gray-900">
                Generating Content
            </h3>
            <p className="text-sm text-gray-500 font-light">
                {jobId ? `Job ID: ${jobId}` : 'Preparing your campaign...'}
            </p>
        </div>

        <div className="h-12 overflow-hidden relative">
            <div className="animate-in slide-in-from-bottom-4 fade-in duration-300 absolute inset-0 flex items-center justify-center">
                <p className="text-sm font-medium text-black bg-gray-50 px-4 py-2 rounded-full border border-gray-100 shadow-sm">
                    {activeMessage}
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};
