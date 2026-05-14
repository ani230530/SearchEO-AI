/**
 * Step 2 of the anonymous audit funnel — the teaser.
 *
 * What the user sees: a series of "we did X" cards staged with a few-
 * second progress animation. The work being claimed here is real but
 * intentionally lightweight at the backend (the actual paid wizard steps
 * are deferred to post-signup so we don't hand out 50¢ of LLM calls to
 * anonymous browsers).
 *
 * The blurred chart at the bottom is the wall: it shows the *shape* of
 * the report — model logos, axes, the title — but the numbers are
 * obscured. That's the conversion driver. The "Show me the full report"
 * button advances to the signup wall.
 *
 * Design system: same card tokens as DomainEntryStep. Each preview row
 * uses an icon container in the rounded-xl bg-gray-100 style, with a
 * green CheckCircle when the row is "done" (the orchestrator ticks them
 * up over time).
 */

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  Globe,
  Loader2,
  Lock,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';

import type { DomainSnapshot } from './types';

interface AnalysisPreviewStepProps {
  snapshot: DomainSnapshot;
  /** Fired when the user clicks through the wall, OR when the staged
   *  animation completes and we auto-advance. */
  onContinue: () => void;
}

interface PreviewRow {
  icon: typeof Globe;
  label: string;
  detail: (host: string) => string;
}

const ROWS: PreviewRow[] = [
  {
    icon: Globe,
    label: 'Confirmed your site is reachable',
    detail: (host) => host,
  },
  {
    icon: Search,
    label: 'Scanning key pages for context',
    detail: () => 'Home, About, Pricing, blog',
  },
  {
    icon: Users,
    label: 'Identifying likely competitors',
    detail: () => '5–8 brands in your space',
  },
  {
    icon: Sparkles,
    label: 'Drafting questions across GPT, Claude, Gemini',
    detail: () => '24 prompts × 3 models',
  },
];

/** How long each row spends in "running" state before flipping to done. */
const ROW_DURATION_MS = 800;

export function AnalysisPreviewStep({ snapshot, onContinue }: AnalysisPreviewStepProps) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (stageIndex >= ROWS.length) return;
    const t = setTimeout(() => setStageIndex((i) => i + 1), ROW_DURATION_MS);
    return () => clearTimeout(t);
  }, [stageIndex]);

  const allDone = stageIndex >= ROWS.length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-light text-black tracking-tight">
              Analyzing {snapshot.host}
            </h2>
            <p className="text-sm font-light text-gray-600">
              We&apos;re putting your audit together right now.
            </p>
          </div>
        </div>

        <ul className="space-y-3">
          {ROWS.map((row, i) => {
            const RowIcon = row.icon;
            const done = i < stageIndex;
            const running = i === stageIndex;
            return (
              <li
                key={row.label}
                className="flex items-start gap-3 rounded-2xl border border-gray-100 px-4 py-3 transition-colors"
                style={{
                  background: done
                    ? 'rgba(240, 253, 244, 0.5)'
                    : running
                    ? 'rgba(249, 250, 251, 1)'
                    : 'white',
                }}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    done ? 'bg-green-50' : 'bg-gray-100'
                  }`}
                >
                  {done ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : running ? (
                    <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />
                  ) : (
                    <RowIcon className="h-4 w-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-black">{row.label}</p>
                  <p className="text-xs font-light text-gray-500 truncate">
                    {row.detail(snapshot.host)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* The wall — blurred preview of the report shape. */}
      <div className="relative bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
            <Lock className="h-6 w-6 text-gray-500" />
          </div>
          <div>
            <h3 className="text-xl font-light text-black tracking-tight">
              Your AI Visibility report is ready
            </h3>
            <p className="text-sm font-light text-gray-600">
              Sign up to see how often each model mentions {snapshot.host}.
            </p>
          </div>
        </div>

        {/* Blurred faux-chart that hints at the real report layout. */}
        <div
          aria-hidden="true"
          className="relative mt-4 h-40 rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 via-white to-gray-100 overflow-hidden"
        >
          <div className="absolute inset-0 flex items-end justify-around px-6 pb-6 gap-3 select-none">
            {[0.62, 0.41, 0.78, 0.55, 0.33, 0.7, 0.48].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-[#2D4059]/30"
                style={{ height: `${h * 100}%`, filter: 'blur(6px)' }}
              />
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-light text-gray-700 backdrop-blur-sm bg-white/50 px-4 py-1.5 rounded-full">
              Locked — sign up to view
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onContinue}
          disabled={!allDone}
          className="mt-6 h-12 px-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-[#2D4059] text-md font-medium text-white shadow-md hover:shadow-lg active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {allDone ? 'Sign up to see the report' : 'Preparing your report…'}
          {allDone && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
