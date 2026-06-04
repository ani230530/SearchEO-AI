// Generative-UI registry: maps each tool's output to a premium inline card.
//
// Tool message parts have type `tool-<name>` and a `state`:
//   input-streaming | input-available → running (shimmer)
//   output-available                  → render the card
//   output-error                      → error
// Renderers are presentational; the agent drives actions via its own tools.

import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Layers,
  LineChart,
  ListChecks,
  Loader2,
  Minus,
  Plug,
  Swords,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const RUNNING_LABEL: Record<string, string> = {
  listDomains: "Looking up your domains",
  getDomain: "Loading domain details",
  getDomainReport: "Loading the AI-visibility report",
  getTrackedPrompts: "Loading tracked prompts",
  getPromptHistory: "Loading prompt history",
  getKeywordHistory: "Loading keyword history",
  getRuns: "Loading run history",
  getTrends: "Loading the visibility trend",
  getCompetitors: "Loading competitors",
  getCompetitorAnalysis: "Analyzing competitors",
  listWorksheets: "Loading worksheets",
  getWorksheet: "Loading the worksheet",
  getDraft: "Loading the draft",
  getGenerationStatus: "Checking generation status",
  getGscStatus: "Checking Search Console",
  getGscProperties: "Loading Search Console properties",
  getWordpressStatus: "Checking WordPress",
  generateKeywords: "Generating keywords",
  generateTopics: "Generating prompts",
  discoverCompetitors: "Discovering competitors",
  aiSuggestTopics: "Suggesting topics",
  aiSuggestKeywords: "Suggesting keywords",
  generateContent: "Starting the draft",
  testTrackedNow: "Starting a re-test",
};

function RunningChip({ tool }: { tool: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[12px] text-slate-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2f5fd1]" />
      <span>{RUNNING_LABEL[tool] ?? `Running ${tool}`}…</span>
    </div>
  );
}

function ErrorChip({ text }: { text?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-600">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text || "Something went wrong."}</span>
    </div>
  );
}

function SuccessChip({ text, href }: { text: string; href?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      <span>{text}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-emerald-700 underline-offset-2 hover:underline">
          View <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </motion.div>
  );
}

function InfoChip({ text }: { text: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">{text}</div>;
}

// Premium card chrome.
function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]"
    >
      <div className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-transparent px-3.5 py-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#eef4ff] text-[#2f5fd1]">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{title}</span>
      </div>
      <div className="p-3.5">{children}</div>
    </motion.div>
  );
}

function TrendPill({ delta }: { delta: number | null | undefined }) {
  if (delta == null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
        <Minus className="h-2.5 w-2.5" /> 0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
      {up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {Math.abs(delta)}
    </span>
  );
}

function Stat({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={cn("text-[22px] font-semibold leading-none tracking-[-0.02em]", accent ? "text-[#2f5fd1]" : "text-slate-800")}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function Favicon({ host }: { host?: string }) {
  if (!host) return <Globe className="h-4 w-4 shrink-0 text-slate-400" />;
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
      alt=""
      className="h-4 w-4 shrink-0 rounded"
      onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
    />
  );
}

function Sparkline({ points }: { points: Array<{ v: number }> }) {
  return (
    <div className="h-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
          <defs>
            <linearGradient id="chat-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2f5fd1" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2f5fd1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area dataKey="v" stroke="#2f5fd1" fill="url(#chat-spark)" strokeWidth={2} type="monotone" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Read renderers ───────────────────────────────────────────────────────────

function DomainsList({ output }: { output: any }) {
  const domains: any[] = output?.domains ?? [];
  return (
    <Card icon={<Globe className="h-3 w-3" />} title={`Domains · ${domains.length}`}>
      {domains.length === 0 ? <p className="text-[12px] text-slate-500">No domains yet.</p> : (
        <div className="flex flex-col gap-1">
          {domains.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50">
              <span className="flex min-w-0 items-center gap-2">
                <Favicon host={d.host} />
                <span className="truncate text-[12.5px] font-medium text-slate-700">{d.host}</span>
                {d.isCompanyDomain ? <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600">Company</span> : null}
              </span>
              {d.visibilityScore != null ? <span className="shrink-0 text-[12px] font-semibold text-[#2f5fd1]">{d.visibilityScore}%</span> : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function DomainDetailCard({ output }: { output: any }) {
  return (
    <Card icon={<Building2 className="h-3 w-3" />} title={output?.host || "Domain"}>
      <div className="space-y-1.5 text-[12px]">
        {output?.companyName ? <Row label="Company" value={output.companyName} /> : null}
        {output?.industry ? <Row label="Industry" value={output.industry} /> : null}
        {output?.url ? <Row label="URL" value={output.url} /> : null}
        {output?.summary ? <p className="pt-1 leading-relaxed text-slate-500">{output.summary}</p> : null}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className="min-w-0 truncate text-right text-[12px] font-medium text-slate-700">{value}</span>
    </div>
  );
}

function ReportCard({ output }: { output: any }) {
  const models: any[] = output?.modelPerformance ?? [];
  const prompts: any[] = output?.topPrompts ?? [];
  return (
    <Card icon={<BarChart3 className="h-3 w-3" />} title={`AI Visibility${output?.host ? ` · ${output.host}` : ""}`}>
      <div className="mb-3 flex gap-6">
        <Stat value={`${output?.visibilityScore ?? "—"}%`} label="Visibility" accent />
        <Stat value={`${output?.mentionRate ?? "—"}%`} label="Mention rate" />
      </div>
      {models.length > 0 ? (
        <div className="space-y-1.5">
          {models.map((m) => (
            <div key={m.model} className="flex items-center gap-2.5">
              <span className="w-24 shrink-0 truncate text-[11px] text-slate-500">{m.model}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, m.visibility ?? 0)}%` }} transition={{ duration: 0.5, ease: "easeOut" }} className="h-full rounded-full bg-gradient-to-r from-[#7395dd] to-[#2f5fd1]" />
              </div>
              <span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums text-slate-500">{m.visibility ?? 0}%</span>
            </div>
          ))}
        </div>
      ) : null}
      {prompts.length > 0 ? (
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Top prompts</p>
          <div className="space-y-1">
            {prompts.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-[11.5px] text-slate-600">{p.phrase}</span>
                <span className="shrink-0 text-[11px] font-semibold text-slate-500">{p.sov}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function TrackedPromptsCard({ output }: { output: any }) {
  const prompts: any[] = output?.prompts ?? [];
  return (
    <Card icon={<ListChecks className="h-3 w-3" />} title={`Tracked prompts · ${output?.count ?? prompts.length}`}>
      {prompts.length === 0 ? <p className="text-[12px] text-slate-500">No tracked prompts yet.</p> : (
        <div className="flex flex-col">
          {prompts.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-slate-50 py-1.5 last:border-0">
              <span className="truncate text-[11.5px] leading-snug text-slate-600">{p.phrase}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] font-semibold tabular-nums text-slate-500">{p.sov}</span>
                <TrendPill delta={p.weekTrendDelta} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function HistoryCard({ output }: { output: any }) {
  const points: any[] = (output?.points ?? []).map((p: any, i: number) => ({ x: i, v: p.presenceRate ?? p.visibility ?? 0 }));
  return (
    <Card icon={<LineChart className="h-3 w-3" />} title="Trend">
      {output?.phrase ? <p className="mb-1.5 truncate text-[11.5px] text-slate-600">{output.phrase}</p> : null}
      {points.length < 2 ? <p className="text-[12px] text-slate-500">Not enough runs yet to draw a trend.</p> : <Sparkline points={points} />}
    </Card>
  );
}

function RunsCard({ output }: { output: any }) {
  const runs: any[] = output?.runs ?? [];
  return (
    <Card icon={<Clock className="h-3 w-3" />} title={`Run history · ${runs.length}`}>
      {runs.length === 0 ? <p className="text-[12px] text-slate-500">No runs yet.</p> : (
        <div className="flex flex-col">
          {runs.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-[11.5px] last:border-0">
              <span className="text-slate-600">{r.startedAt ? new Date(r.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : `Run ${r.id}`}</span>
              {r.kind ? <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase text-slate-400">{r.kind}</span> : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CompetitorsCard({ output }: { output: any }) {
  const competitors: any[] = output?.competitors ?? [];
  return (
    <Card icon={<Users className="h-3 w-3" />} title={`Competitors · ${competitors.length}`}>
      {competitors.length === 0 ? <p className="text-[12px] text-slate-500">No competitors yet.</p> : (
        <div className="flex flex-col gap-1">
          {competitors.map((c, i) => (
            <div key={c.id ?? c.host ?? i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50">
              <Favicon host={c.host} />
              <span className="truncate text-[12px] font-medium text-slate-700">{c.host}</span>
              {c.isSelected ? <span className="ml-auto shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600">Selected</span> : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CompetitorAnalysisCard({ output }: { output: any }) {
  const rows: any[] = output?.competitors ?? [];
  const max = Math.max(1, ...rows.map((r) => Number(r.mentions) || 0));
  return (
    <Card icon={<Swords className="h-3 w-3" />} title="Competitor mentions">
      {rows.length === 0 ? <p className="text-[12px] text-slate-500">No competitor mentions yet.</p> : (
        <div className="space-y-1.5">
          {rows.map((c, i) => (
            <div key={c.host ?? i} className="flex items-center gap-2.5">
              <span className="w-28 shrink-0 truncate text-[11px] text-slate-600">{c.host}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-[#e3a08a] to-[#d2694a]" style={{ width: `${Math.round(((Number(c.mentions) || 0) / max) * 100)}%` }} />
              </div>
              <span className="w-7 shrink-0 text-right text-[11px] font-medium tabular-nums text-slate-500">{c.mentions ?? 0}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function WorksheetStructureCard({ output }: { output: any }) {
  const topics: any[] = output?.topics ?? [];
  return (
    <Card icon={<Layers className="h-3 w-3" />} title={output?.title || "Worksheet"}>
      {topics.length === 0 ? <p className="text-[12px] text-slate-500">No topics yet.</p> : (
        <div className="flex flex-col gap-2">
          {topics.map((t) => (
            <div key={t.id} className="rounded-lg bg-slate-50 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] font-medium text-slate-700">{t.title}</span>
                {t.status ? <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] uppercase text-slate-400">{t.status}</span> : null}
              </div>
              {Array.isArray(t.keywords) && t.keywords.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.keywords.map((k: any) => (
                    <span key={k.id} className={cn("rounded-full px-1.5 py-0.5 text-[9.5px]", k.isPrimary ? "bg-blue-100 text-blue-700" : "bg-white text-slate-500")}>{k.term}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function WorksheetsList({ output }: { output: any }) {
  const worksheets: any[] = output?.worksheets ?? [];
  return (
    <Card icon={<FileText className="h-3 w-3" />} title={`Worksheets · ${worksheets.length}`}>
      {worksheets.length === 0 ? <p className="text-[12px] text-slate-500">No worksheets yet.</p> : (
        <div className="flex flex-col gap-1">
          {worksheets.map((w) => (
            <div key={w.id} className="truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-700 transition-colors hover:bg-slate-100">{w.title}</div>
          ))}
        </div>
      )}
    </Card>
  );
}

function DraftCard({ output }: { output: any }) {
  return (
    <Card icon={<FileText className="h-3 w-3" />} title="Draft">
      <p className="text-[13px] font-semibold text-slate-800">{output?.title || "Untitled draft"}</p>
      {output?.metaDescription ? <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">{output.metaDescription}</p> : null}
      <div className="mt-2 flex gap-2 text-[10px] text-slate-400">
        {output?.status ? <span className="rounded-full bg-slate-100 px-2 py-0.5 uppercase">{output.status}</span> : null}
        {output?.wordCount ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{output.wordCount} words</span> : null}
      </div>
    </Card>
  );
}

function GenerationStatusCard({ output }: { output: any }) {
  return (
    <Card icon={<Loader2 className="h-3 w-3" />} title="Generation status">
      <div className="space-y-1.5 text-[12px]">
        <Row label="Status" value={output?.status ?? "—"} />
        {output?.phase ? <Row label="Phase" value={output.phase} /> : null}
        {output?.progress != null ? (
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#2f5fd1]" style={{ width: `${Math.min(100, Number(output.progress) || 0)}%` }} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function IntegrationCard({ icon, title, output }: { icon: React.ReactNode; title: string; output: any }) {
  const connected = !!output?.connected;
  return (
    <Card icon={icon} title={title}>
      <div className="flex items-center gap-2 text-[12px]">
        <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-400" : "bg-slate-300")} />
        <span className="font-medium text-slate-700">{connected ? "Connected" : "Not connected"}</span>
        {output?.siteUrl ? <span className="ml-auto truncate text-[11px] text-slate-400">{output.siteUrl}</span> : null}
        {output?.property ? <span className="ml-auto truncate text-[11px] text-slate-400">{output.property}</span> : null}
      </div>
    </Card>
  );
}

function ListCard({ icon, title, items }: { icon: React.ReactNode; title: string; items: any[] }) {
  return (
    <Card icon={icon} title={title}>
      {items.length === 0 ? <p className="text-[12px] text-slate-500">Nothing to show.</p> : (
        <div className="flex flex-col gap-1">
          {items.map((it, i) => <div key={i} className="truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-700">{String(it)}</div>)}
        </div>
      )}
    </Card>
  );
}

// ── Write success messages ───────────────────────────────────────────────────

function writeChip(toolName: string, output: any): React.ReactNode {
  if (output?.needsConfirmation) return null; // the model asks for confirmation in prose
  const started = (text: string) => <SuccessChip text={text} />;
  switch (toolName) {
    case "trackPrompt": return <SuccessChip text="Now tracking this prompt weekly." />;
    case "untrackPrompt": return <SuccessChip text="Stopped tracking this prompt." />;
    case "createWorksheet": return <SuccessChip text={`Created the “${output?.title ?? "new"}” worksheet.`} />;
    case "updateWorksheet": return <SuccessChip text="Worksheet renamed." />;
    case "deleteWorksheet": return <SuccessChip text="Worksheet deleted." />;
    case "addTopic": return <SuccessChip text={`Added topic “${output?.title ?? ""}”.`} />;
    case "aiSuggestTopics": return started(`Suggested ${output?.suggested ?? 0} topics — see the worksheet.`);
    case "updateTopicTitle": return <SuccessChip text="Topic renamed." />;
    case "deleteTopic": return <SuccessChip text="Topic deleted." />;
    case "addKeyword": return <SuccessChip text={`Added keyword “${output?.term ?? ""}”.`} />;
    case "aiSuggestKeywords": return started(`Suggested ${output?.suggested ?? 0} keywords — see the topic.`);
    case "selectPrimaryKeyword": return <SuccessChip text="Set as the primary keyword." />;
    case "selectLongtailKeyword": return <SuccessChip text="Set as a longtail keyword." />;
    case "deselectKeyword": return <SuccessChip text="Keyword deselected." />;
    case "deleteKeyword": return <SuccessChip text="Keyword deleted." />;
    case "addCustomPrompt": return <SuccessChip text={`Added prompt “${output?.text ?? ""}”.`} />;
    case "editPrompt": return <SuccessChip text="Prompt updated." />;
    case "generateKeywords": return started(`Generated ${output?.generated ?? 0} keywords.`);
    case "generateTopics": return started(`Generated ${output?.generated ?? 0} prompts.`);
    case "discoverCompetitors": return started(`Discovered ${output?.discovered ?? 0} competitors.`);
    case "addCompetitor": return <SuccessChip text={`Added competitor ${output?.added ?? ""}.`} />;
    case "selectCompetitors": return <SuccessChip text={`Selected ${output?.selected ?? 0} competitors.`} />;
    case "resyncDomain": return started("Re-syncing the domain context — running in the background.");
    case "restartDomain": return <SuccessChip text="Domain reset." />;
    case "deleteDomain": return <SuccessChip text="Domain deleted." />;
    case "testTrackedNow":
      return output?.started ? started(`Re-test started${output?.trackedPrompts ? ` for ${output.trackedPrompts} prompts` : ""} — running in the background.`) : null;
    case "generateContent":
      return output?.started ? started("Draft generation started — running in the background.") : null;
    case "publishDraft":
      return output?.published ? <SuccessChip text="Published to WordPress." href={output?.publishedUrl ?? undefined} /> : <ErrorChip text="Publish did not complete." />;
    case "navigate": return <SuccessChip text="Took you there." />;
    case "openWorksheetPicker": return <SuccessChip text="Opened the worksheet area." />;
    case "startDomainAudit": return <SuccessChip text="Opened the add-domain wizard." />;
    default: return null;
  }
}

function renderToolOutput(toolName: string, output: any): React.ReactNode {
  switch (toolName) {
    // reads
    case "listDomains": return <DomainsList output={output} />;
    case "getDomain": return <DomainDetailCard output={output} />;
    case "getDomainReport": return <ReportCard output={output} />;
    case "getTrackedPrompts": return <TrackedPromptsCard output={output} />;
    case "getPromptHistory":
    case "getKeywordHistory":
    case "getTrends": return <HistoryCard output={output} />;
    case "getRuns": return <RunsCard output={output} />;
    case "getCompetitors": return <CompetitorsCard output={output} />;
    case "getCompetitorAnalysis": return <CompetitorAnalysisCard output={output} />;
    case "listWorksheets": return <WorksheetsList output={output} />;
    case "getWorksheet": return <WorksheetStructureCard output={output} />;
    case "getDraft": return <DraftCard output={output} />;
    case "getGenerationStatus": return <GenerationStatusCard output={output} />;
    case "getGscStatus": return <IntegrationCard icon={<Plug className="h-3 w-3" />} title="Search Console" output={output} />;
    case "getWordpressStatus": return <IntegrationCard icon={<Plug className="h-3 w-3" />} title="WordPress" output={output} />;
    case "getGscProperties": return <ListCard icon={<Plug className="h-3 w-3" />} title={`GSC properties · ${(output?.properties ?? []).length}`} items={output?.properties ?? []} />;
    // writes
    default: return writeChip(toolName, output);
  }
}

/** Render any tool UI part based on its state. */
export function ToolPart({ toolName, part }: { toolName: string; part: any }) {
  if (part.state === "output-error") return <ErrorChip text={part.errorText} />;
  if (part.state !== "output-available") return <RunningChip tool={toolName} />;
  const node = renderToolOutput(toolName, part.output);
  return <>{node ?? <InfoChip text="Done." />}</>;
}
