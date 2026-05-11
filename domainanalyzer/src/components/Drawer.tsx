import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  overlayClassName?: string;
  panelClassName?: string;
}

export function Drawer({
  open,
  onOpenChange,
  children,
  className,
  overlayClassName,
  panelClassName,
}: DrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [mounted, onOpenChange, open]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className={cn('fixed inset-0 z-[70]', className)}>
      <div
        aria-hidden="true"
        className={cn('absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]', overlayClassName)}
        onClick={() => onOpenChange(false)}
      />

      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            'relative flex h-full w-full max-w-[812px] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]',
            panelClassName,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Close drawer"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default Drawer;
