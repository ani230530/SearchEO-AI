import { ChevronRight } from "lucide-react";
import type { SettingsItem, SettingsSubTab } from "@/features/sidebar-dashboard/sections/settings/types";

interface SettingsSubSidebarProps {
  activeSubTab: SettingsSubTab;
  items: SettingsItem[];
  onSelect: (tab: SettingsSubTab) => void;
}

export function SettingsSubSidebar({ activeSubTab, items, onSelect }: SettingsSubSidebarProps) {
  const subSidebarTitleClass = "truncate text-[14px] font-medium text-[#020202]";
  const subSidebarSubtitleClass = "truncate text-[12px] font-medium text-[#7b828d]";

  return (
    <div className="rounded-xl bg-transparent p-1">
      <h3 className="mb-3 px-2 text-2xl font-semibold tracking-tight text-slate-700">
        Account Settings
      </h3>
      <div className="space-y-2">
        {items.map((item) => {
          const isActive = activeSubTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`w-full rounded-lg px-3 py-2 text-left transition ${
                isActive
                  ? "bg-[#F7F7F4] shadow-md ring-1 ring-gray-300/70"
                  : "bg-white shadow-sm hover:bg-[#f9f9f9] hover:shadow-md"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={subSidebarTitleClass}>{item.title}</p>
                  <p className={subSidebarSubtitleClass}>{item.subtitle}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
