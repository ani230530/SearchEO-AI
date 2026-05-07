import { useEffect, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { maskDomainId } from "@/lib/domainUtils";

interface Step5Props {
  domainId: number;
  onError: (msg: string) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3002";

export function Step5RunQueries({ domainId, onError }: Step5Props) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(5);
  const [status, setStatus] = useState("Running AI queries against ChatGPT, Gemini, Claude…");
  const [resultsCount, setResultsCount] = useState(0);
  const [totalExpected, setTotalExpected] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const ctrl = new AbortController();
    let count = 0;
    let total = 0;

    fetchEventSource(`${API_BASE_URL}/api/ai-queries/${domainId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({}),
      signal: ctrl.signal,
      openWhenHidden: true,
      async onopen(response) {
        if (response.ok) return;
        const text = await response.text().catch(() => "");
        throw new Error(text || `Failed (${response.status})`);
      },
      onmessage(ev) {
        switch (ev.event) {
          case "progress":
            try {
              const data = JSON.parse(ev.data);
              const msg: string = data.message ?? "";
              const m = msg.match(/Processing (\d+) queries/);
              if (m) {
                total = parseInt(m[1], 10);
                setTotalExpected(total);
              }
              setStatus(msg || "Working…");
              if (total > 0) {
                setProgress(Math.min(99, Math.round((count / total) * 100)));
              }
            } catch {
              /* ignore */
            }
            break;
          case "result":
            count += 1;
            setResultsCount(count);
            if (total > 0) {
              setProgress(Math.min(99, Math.round((count / total) * 100)));
            } else {
              setProgress((p) => Math.min(95, p + 1));
            }
            break;
          case "complete":
            setProgress(100);
            ctrl.abort();
            setTimeout(() => {
              navigate(`/ai-results/${maskDomainId(domainId)}`);
            }, 500);
            break;
          case "error":
            try {
              const data = JSON.parse(ev.data);
              ctrl.abort();
              onError(data.error || "AI queries failed");
            } catch {
              ctrl.abort();
              onError("AI queries failed");
            }
            break;
        }
      },
      onerror(err) {
        ctrl.abort();
        onError(err instanceof Error ? err.message : "Connection error");
        throw err;
      },
    }).catch(() => {});

    return () => {
      ctrl.abort();
    };
  }, [domainId, navigate, onError]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 text-[#414651]">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-[16px] font-medium">{status}</p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#d6dbe5]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#2D4059] to-[#4C74C2] transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[12px] text-[#717680]">
        <span>
          {totalExpected > 0
            ? `${resultsCount} of ${totalExpected} queries scored`
            : `${resultsCount} queries scored`}
        </span>
        <span>{progress}%</span>
      </div>
      <p className="text-[12px] text-[#717680]">
        AI queries can take 1–3 minutes depending on selection size. You can leave this tab — your
        report will be ready when it completes.
      </p>
    </div>
  );
}
