import { ButtonSpinner } from "@/components/ui/button-spinner";
import type { SettingsSectionProps } from "@/features/sidebar-dashboard/types";

export function SettingsSection({
  confirmUpdateOpen,
  updateLoading,
  onCloseConfirm,
  onConfirmUpdate,
  onOpenConfirm,
}: SettingsSectionProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <div className="bg-white rounded-3xl p-12 border border-gray-200 text-center">
        <h2 className="text-2xl font-light text-black tracking-tight mb-3">
          Domain Settings
        </h2>
        <p className="text-base font-light text-gray-600 mb-8">Update your company domain</p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onOpenConfirm}
            className="px-6 py-3 bg-gray-100 text-gray-900 rounded-full hover:bg-gray-200 transition-all duration-200 text-base font-light"
          >
            Update Company Domain
          </button>
        </div>

        {confirmUpdateOpen && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-xl w-[90%] max-w-sm">
              <h2 className="text-lg font-medium text-gray-800">Remove Company Domain?</h2>
              <p className="text-sm text-gray-500 mt-2">
                This will remove your current company domain and take you to re-enter a new one.
              </p>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={onCloseConfirm}
                  disabled={updateLoading}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    void onConfirmUpdate();
                  }}
                  className="px-4 py-2 rounded-lg text-sm bg-black text-white hover:bg-black/90 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  disabled={updateLoading}
                >
                  {updateLoading ? <ButtonSpinner /> : null}
                  {updateLoading ? "Updating..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
