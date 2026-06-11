import type { MouseEventHandler } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type TrackToggleButtonProps = {
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  tracked: boolean;
};

export function TrackToggleButton({
  className,
  disabled = false,
  loading = false,
  onClick,
  tracked,
}: TrackToggleButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-pressed={tracked}
      aria-label={tracked ? "Stop weekly tracking" : "Track weekly"}
      title={tracked ? "Tracking weekly - click to stop" : "Track weekly"}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border text-white shadow-[0_4px_14px_rgba(15,23,42,0.06)] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7f9fe8] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50",
        tracked
          ? "border-[#c8d8f5] bg-[#eef4ff] text-[#3b5d9c] hover:bg-[#e7efff]"
          : "border-[#2D4059] bg-gradient-to-b from-[#2D4059] to-[#4C74C2] text-white hover:from-[#24364d] hover:to-[#4166b3]",

        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : tracked ? (
        <img
          src="/report-icons/pause-circle.svg"
          alt=""
          aria-hidden="true"
          className="h-4 w-4 shrink-0 object-contain"
        />
      ) : (
        <img
          src="/report-icons/target-03.svg"
          alt=""
          aria-hidden="true"
          className="h-4 w-4 shrink-0 object-contain"
        />
      )}
    </button>
  );
}
