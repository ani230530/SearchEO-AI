import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { isToolUIPart, getToolName, type UIMessage } from "ai";
import { ToolPart } from "./registry";
import { cn } from "@/lib/utils";

// Premium, robust markdown. GFM is on so tables/lists/strikethrough render;
// every block is styled and tables scroll horizontally so they never break the
// panel width. The agent is told not to dump data tables (the cards do that),
// but if one slips through it still looks clean.
const MD_COMPONENTS = {
  p: ({ children }: any) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  a: ({ children, href }: any) => (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-[#2f5fd1] underline-offset-2 hover:underline">
      {children}
    </a>
  ),
  ul: ({ children }: any) => <ul className="my-1.5 ml-4 list-disc space-y-0.5 marker:text-slate-300">{children}</ul>,
  ol: ({ children }: any) => <ol className="my-1.5 ml-4 list-decimal space-y-0.5 marker:text-slate-400">{children}</ol>,
  li: ({ children }: any) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }: any) => <strong className="font-semibold text-slate-900">{children}</strong>,
  code: ({ inline, children }: any) =>
    inline ? (
      <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-700">{children}</code>
    ) : (
      <code className="block overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[12px] leading-relaxed text-slate-100">{children}</code>
    ),
  table: ({ children }: any) => (
    <div className="my-2 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-slate-50">{children}</thead>,
  th: ({ children }: any) => <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">{children}</th>,
  td: ({ children }: any) => <td className="border-b border-slate-100 px-3 py-2 text-slate-600">{children}</td>,
};

export function MessageList({ messages, status }: { messages: UIMessage[]; status: string }) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <motion.div
          key={m.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
        >
          <div className={cn("space-y-2", m.role === "user" ? "max-w-[85%]" : "w-full")}>
            {m.parts.map((part, i) => {
              if (part.type === "text") {
                if (!part.text) return null;
                return m.role === "user" ? (
                  <div
                    key={i}
                    className="rounded-2xl rounded-br-md bg-gradient-to-br from-[#2f5fd1] to-[#4f7ef0] px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-[0_6px_16px_rgba(47,95,209,0.28)]"
                  >
                    {part.text}
                  </div>
                ) : (
                  <div key={i} className="text-[13px] leading-relaxed text-slate-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                      {part.text}
                    </ReactMarkdown>
                  </div>
                );
              }
              if (isToolUIPart(part)) {
                return <ToolPart key={i} toolName={getToolName(part)} part={part} />;
              }
              return null;
            })}
          </div>
        </motion.div>
      ))}

      {status === "submitted" ? (
        <div className="flex items-center gap-1.5 px-0.5">
          {[0, 1, 2].map((d) => (
            <motion.span
              key={d}
              className="h-1.5 w-1.5 rounded-full bg-slate-300"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
              transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
