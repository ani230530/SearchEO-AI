import { useState } from "react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { SettingsNotificationSection } from "@/features/sidebar-dashboard/sections/settings/SettingsNotificationSection";
import { SettingsPlaceholderSection } from "@/features/sidebar-dashboard/sections/settings/SettingsPlaceholderSection";
import { SettingsPrivacySecuritySection } from "@/features/sidebar-dashboard/sections/settings/SettingsPrivacySecuritySection";
import Profile from "@/pages/Profile";
import { SettingsSubSidebar } from "@/features/sidebar-dashboard/sections/settings/SettingsSubSidebar";
import { SETTINGS_ITEMS, type SettingsSubTab } from "@/features/sidebar-dashboard/sections/settings/types";
import type { SettingsSectionProps } from "@/features/sidebar-dashboard/types";

export function SettingsSection({
  confirmUpdateOpen,
  updateLoading,
  onCloseConfirm,
  onConfirmUpdate,
  onOpenConfirm,
}: SettingsSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>("profile");

  const renderContent = () => {
    switch (activeSubTab) {
      case "profile":
        return <Profile compact />;
      case "integrations":
        return (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="text-xl font-semibold tracking-tight text-slate-800">
              Integration Settings
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Update your tracked domain to start a fresh crawl and analysis.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={onOpenConfirm}
                className="rounded-md bg-[#2D4059] px-4 py-2 text-sm font-medium text-white hover:bg-[#25364b] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={updateLoading}
              >
                {updateLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <ButtonSpinner />
                    Updating...
                  </span>
                ) : (
                  "Update Company Domain"
                )}
              </button>
            </div>
          </div>
        );
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
      {confirmUpdateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-[92%] max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h4 className="text-lg font-semibold text-gray-900">Update Crawled Domain?</h4>
            <p className="mt-2 text-sm text-gray-600">
              This will reset your current domain analysis so you can crawl a new domain.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCloseConfirm}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={updateLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void onConfirmUpdate();
                }}
                className="inline-flex items-center gap-2 rounded-md bg-[#2D4059] px-4 py-2 text-sm font-medium text-white hover:bg-[#25364b] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={updateLoading}
              >
                {updateLoading ? <ButtonSpinner /> : null}
                {updateLoading ? "Updating..." : "Confirm Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
