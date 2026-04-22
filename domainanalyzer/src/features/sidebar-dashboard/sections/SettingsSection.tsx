import { useState } from "react";
import { SettingsNotificationSection } from "@/features/sidebar-dashboard/sections/settings/SettingsNotificationSection";
import { SettingsPlaceholderSection } from "@/features/sidebar-dashboard/sections/settings/SettingsPlaceholderSection";
import { SettingsPrivacySecuritySection } from "@/features/sidebar-dashboard/sections/settings/SettingsPrivacySecuritySection";
import Profile from "@/pages/Profile";
import { SettingsSubSidebar } from "@/features/sidebar-dashboard/sections/settings/SettingsSubSidebar";
import { SETTINGS_ITEMS, type SettingsSubTab } from "@/features/sidebar-dashboard/sections/settings/types";
import type { SettingsSectionProps } from "@/features/sidebar-dashboard/types";

export function SettingsSection({
  confirmUpdateOpen: _confirmUpdateOpen,
  updateLoading: _updateLoading,
  onCloseConfirm: _onCloseConfirm,
  onConfirmUpdate: _onConfirmUpdate,
  onOpenConfirm: _onOpenConfirm,
}: SettingsSectionProps) {
  void _confirmUpdateOpen;
  void _updateLoading;
  void _onCloseConfirm;
  void _onConfirmUpdate;
  void _onOpenConfirm;

  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>("profile");

  const renderContent = () => {
    switch (activeSubTab) {
      case "profile":
        return <Profile />;
      case "privacy-security":
        return <SettingsPrivacySecuritySection />;
      case "notifications":
        return <SettingsNotificationSection />;
      default:
        return <SettingsPlaceholderSection />;
    }
  };

  return (
    <div className="w-full py-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <SettingsSubSidebar
          activeSubTab={activeSubTab}
          items={SETTINGS_ITEMS}
          onSelect={setActiveSubTab}
        />
        <div className="rounded-xl border border-gray-200 bg-[#f8f8f9] p-4">{renderContent()}</div>
      </div>
    </div>
  );
}
