import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDirection } from "../sort";

type SortableTableHeaderProps = {
  align?: "left" | "right";
  activeDirection?: SortDirection | null;
  label: string;
  tooltip?: ReactNode;
  onToggleSort?: () => void;
};

export const SortableTableHeader = ({
  align = "left",
  activeDirection = null,
  label,
  tooltip,
  onToggleSort,
}: SortableTableHeaderProps) => {
  const hasSorting = typeof onToggleSort === "function";
  const buttonClass = (active = false) =>
    cn(
      "inline-flex h-5 w-5 items-center justify-center rounded-[4px] border transition-colors",
      active
        ? "border-slate-300 bg-slate-200 text-slate-800"
        : "border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-700",
    );

  return (
    <div className={cn("flex items-center gap-1", align === "right" && "justify-end")}>
      <span>{label}</span>
      {tooltip}
      {hasSorting ? (
        <button
          type="button"
          aria-label={`Toggle sort for ${label}`}
          aria-pressed={activeDirection != null}
          onClick={onToggleSort}
          className={buttonClass(activeDirection != null)}
        >
          {activeDirection === "desc" ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )}
        </button>
      ) : null}
    </div>
  );
};
