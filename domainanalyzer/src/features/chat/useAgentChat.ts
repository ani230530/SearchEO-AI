// Wraps the AI SDK useChat for the in-app agent.
//
// All tools execute SERVER-side. "Effect" tools (navigate / openWorksheetPicker
// / startDomainAudit) return a structured intent; the browser performs the
// actual action here as a side effect once the result streams in. Mutating
// tools trigger React-Query invalidation so the live page refreshes. This keeps
// the agent loop entirely server-driven (no fragile client round-trip).

import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { aiResultsKeys } from "@/features/ai-results/queries";
import { maskDomainId, unmaskDomainId } from "@/lib/domainUtils";

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "http://localhost:3002/api";

// Tools that refresh on-page data after they succeed, grouped by area.
const DOMAIN_MUTATIONS = new Set([
  "trackPrompt", "untrackPrompt", "testTrackedNow", "addCustomPrompt", "editPrompt",
  "generateKeywords", "generateTopics", "discoverCompetitors", "addCompetitor",
  "selectCompetitors", "resyncDomain", "restartDomain",
]);
const CAMPAIGN_MUTATIONS = new Set([
  "createWorksheet", "updateWorksheet", "deleteWorksheet", "addTopic", "aiSuggestTopics",
  "updateTopicTitle", "deleteTopic", "addKeyword", "aiSuggestKeywords", "selectPrimaryKeyword",
  "selectLongtailKeyword", "deselectKeyword", "deleteKeyword", "generateContent",
]);
const DOMAINLIST_MUTATIONS = new Set(["deleteDomain", "restartDomain", "resyncDomain"]);
const EFFECT_TOOLS = new Set(["navigate", "openWorksheetPicker", "startDomainAudit"]);

/** Derive the domain id the user is currently viewing from the URL. */
function domainIdFromPath(pathname: string): number | null {
  const m = pathname.match(/\/ai-results\/([^/?#]+)/);
  if (!m) return null;
  const id = unmaskDomainId(m[1]);
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

export function useAgentChat(threadId: number, initialMessages: UIMessage[]) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Live context read by the transport's header/body functions at request time.
  const ctxRef = useRef({ threadId, path: location.pathname, domainId: domainIdFromPath(location.pathname) });
  ctxRef.current = { threadId, path: location.pathname, domainId: domainIdFromPath(location.pathname) };

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE}/chat`,
        headers: () => {
          const h: Record<string, string> = {};
          const token = localStorage.getItem("authToken");
          if (token) h.Authorization = `Bearer ${token}`;
          if (ctxRef.current.domainId != null) h["X-Domain-Id"] = String(ctxRef.current.domainId);
          if (ctxRef.current.path) h["X-Path"] = ctxRef.current.path;
          return h;
        },
        body: () => ({ threadId: ctxRef.current.threadId }),
      }),
    [],
  );

  const chat = useChat({ transport, messages: initialMessages });

  // Run side effects (navigation, query invalidation) once per completed tool.
  const processed = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const m of chat.messages) {
      if (m.role !== "assistant") continue;
      for (const part of m.parts as Array<any>) {
        if (
          typeof part?.type !== "string" ||
          !part.type.startsWith("tool-") ||
          part.state !== "output-available" ||
          !part.toolCallId ||
          processed.current.has(part.toolCallId)
        ) {
          continue;
        }
        const toolName = part.type.slice("tool-".length);
        const out = part.output ?? {};

        // 1) Effect tools → perform the browser action.
        if (EFFECT_TOOLS.has(toolName)) {
          processed.current.add(part.toolCallId);
          const domainId: number | null = out.domainId ?? ctxRef.current.domainId;
          const slug = domainId != null ? maskDomainId(domainId) : null;
          if (toolName === "navigate") {
            let path = "/dashboard";
            switch (out.destination) {
              case "ai-report": path = slug ? `/ai-results/${slug}` : "/dashboard"; break;
              case "prompt-tracking": path = slug ? `/ai-results/${slug}/prompts` : "/dashboard"; break;
              case "competitors": path = "/airesults-competitors-preview"; break;
              case "worksheets": path = out.worksheetId != null ? `/dashboard?tab=projects&campaign=${encodeURIComponent(out.worksheetId)}` : "/dashboard?tab=projects"; break;
              case "gsc": path = "/dashboard?tab=gsc-analytics"; break;
              case "settings": path = "/dashboard?tab=settings"; break;
              default: path = "/dashboard"; break;
            }
            navigate(path);
          } else if (toolName === "openWorksheetPicker") {
            navigate(slug ? `/ai-results/${slug}/prompts` : "/dashboard?tab=projects");
          } else if (toolName === "startDomainAudit") {
            navigate("/audit");
          }
          continue;
        }

        // 2) Mutating tools → refresh affected caches.
        const isMutation = DOMAIN_MUTATIONS.has(toolName) || CAMPAIGN_MUTATIONS.has(toolName) || DOMAINLIST_MUTATIONS.has(toolName);
        if (isMutation) {
          processed.current.add(part.toolCallId);
          if (CAMPAIGN_MUTATIONS.has(toolName)) queryClient.invalidateQueries({ queryKey: aiResultsKeys.campaigns() });
          if (DOMAINLIST_MUTATIONS.has(toolName)) queryClient.invalidateQueries({ queryKey: aiResultsKeys.domains() });
          if (DOMAIN_MUTATIONS.has(toolName)) {
            const domainId: number | null = out.domainId ?? part.input?.domainId ?? ctxRef.current.domainId;
            if (domainId != null) {
              for (const k of ["report", "tracked-prompts", "trends", "runs", "competitors", "competitor-analysis"]) {
                queryClient.invalidateQueries({ queryKey: ["ai-results", k, domainId] });
              }
            }
          }
        }
      }
    }
  }, [chat.messages, navigate, queryClient]);

  return chat;
}
