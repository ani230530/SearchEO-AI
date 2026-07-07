import React from "react";
import type { BlogPostStatus } from "./types";

interface StatusBadgeProps {
  status: BlogPostStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const normalizedStatus = (status || "DRAFT").toUpperCase();

  let styles = "bg-slate-100 text-slate-700 border-slate-200";
  let dotColor = "bg-slate-400";
  let label = "Draft";

  switch (normalizedStatus) {
    case "PUBLISHED":
      styles = "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30";
      dotColor = "bg-emerald-500 animate-pulse";
      label = "Published";
      break;
    case "SCHEDULED":
      styles = "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30";
      dotColor = "bg-amber-500";
      label = "Scheduled";
      break;
    case "ARCHIVED":
      styles = "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30";
      dotColor = "bg-rose-500";
      label = "Archived";
      break;
    default:
      styles = "bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-800";
      dotColor = "bg-slate-400";
      label = "Draft";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${styles}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {label}
    </span>
  );
};
