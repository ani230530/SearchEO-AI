import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Search, SendHorizonal, X } from "lucide-react";
import type { UIMessage } from "ai";
import { apiGet, apiPost } from "@/services/apiClient";
import { useAgentChat } from "./useAgentChat";
import { MessageList } from "./MessageList";
import { AssistantMark } from "./AssistantMark";

type ThreadResponse = { threadId: number; messages: UIMessage[] };

const SUGGESTIONS = [
  "Show my AI visibility report",
  "What prompts am I tracking?",
  "Which prompts dropped this week?",
  "Open prompt tracking",
];

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<ThreadResponse | null>(null);

  useEffect(() => {
    let alive = true;
    apiGet<ThreadResponse>("/chat/thread")
      .then((r) => { if (alive) setThread(r); })
      .catch(() => { if (alive) setThread({ threadId: 0, messages: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const newChat = async () => {
    setLoading(true);
    try {
      const r = await apiPost<ThreadResponse>("/chat/thread");
      setThread({ threadId: r.threadId, messages: [] });
    } catch {
      /* keep current thread */
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-white to-slate-50/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#2f5fd1] to-[#4f7ef0] text-white shadow-[0_4px_12px_rgba(47,95,209,0.35)]">
            <AssistantMark className="h-[18px] w-[18px]" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
          </span>
          <div className="leading-tight">
            <div className="text-[13.5px] font-semibold text-slate-800">Assistant</div>
            <div className="text-[10.5px] text-slate-400">Your AI visibility copilot</div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={newChat} title="New chat" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={onClose} title="Close" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading || !thread ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
        </div>
      ) : (
        <AgentChat key={thread.threadId} threadId={thread.threadId} initialMessages={thread.messages} />
      )}
    </div>
  );
}

function AgentChat({ threadId, initialMessages }: { threadId: number; initialMessages: UIMessage[] }) {
  const { messages, sendMessage, status } = useAgentChat(threadId, initialMessages);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    void sendMessage({ text: t });
  };

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2f5fd1] to-[#4f7ef0] text-white shadow-[0_10px_30px_rgba(47,95,209,0.4)]">
              <AssistantMark className="h-8 w-8" />
              <span className="absolute inset-0 -z-10 animate-pulse rounded-2xl bg-[#2f5fd1]/25 blur-xl" />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-slate-800">How can I help?</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
                Ask about your AI visibility, prompts, or content — I’ll show the data and can take you there.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="group flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-left text-[12.5px] text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#c5d6f7] hover:shadow-md"
                >
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-[#2f5fd1]" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={messages} status={status} />
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200/80 bg-white/80 p-3 backdrop-blur">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
          className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition-all focus-within:border-[#9bb4ea] focus-within:shadow-[0_0_0_3px_rgba(47,95,209,0.1)]"
        >
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 112)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); }
            }}
            rows={1}
            placeholder="Ask anything…"
            className="max-h-28 flex-1 resize-none bg-transparent py-1 text-[13px] leading-relaxed text-slate-700 outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2f5fd1] to-[#4f7ef0] text-white shadow-[0_4px_12px_rgba(47,95,209,0.3)] transition-all hover:shadow-[0_6px_16px_rgba(47,95,209,0.45)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
          </button>
        </form>
        <p className="mt-1.5 text-center text-[10px] text-slate-300">Enter to send · Shift+Enter for new line</p>
      </div>
    </>
  );
}
