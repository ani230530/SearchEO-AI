import { useState } from "react";

export function SettingsPrivacySecuritySection() {
  const [allowResearchData, setAllowResearchData] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const sectionHeadingClass = "text-lg font-medium text-slate-800";
  const sectionSubHeadingClass = "text-base font-medium text-slate-800";
  const sectionItemTitleClass = "text-sm font-medium text-slate-800";
  const sectionItemDescriptionClass = "mt-1 text-sm text-gray-600";

  return (
    <div className="rounded-xl">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className={sectionHeadingClass}>Privacy & Security</h3>
      </div>

      <div className="p-3">
        <div className="overflow-hidden rounded-md bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <p className={sectionSubHeadingClass}>Data Sharing Preferences</p>
          </div>

          <div className="space-y-5 px-4 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={sectionItemTitleClass}>Allow Data Collection for Research</p>
                <p className={sectionItemDescriptionClass}>
                  Share anonymized data for improving the tool.
                </p>
              </div>
              <button
                type="button"
                aria-label="Toggle data collection"
                aria-pressed={allowResearchData}
                onClick={() => setAllowResearchData((prev) => !prev)}
                className={`relative mt-1 h-8 w-16 rounded-full transition ${
                  allowResearchData ? "bg-[#7E9BD7]" : "bg-[#e6e6e6]"
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                    allowResearchData ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={sectionItemTitleClass}>Two-Factor Authentication</p>
                <p className={sectionItemDescriptionClass}>
                  Add an extra layer of security to your account.
                </p>
              </div>
              <button
                type="button"
                aria-label="Toggle two-factor authentication"
                aria-pressed={twoFactorEnabled}
                onClick={() => setTwoFactorEnabled((prev) => !prev)}
                className={`relative mt-1 h-8 w-16 rounded-full transition ${
                  twoFactorEnabled ? "bg-[#7E9BD7]" : "bg-[#e6e6e6]"
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                    twoFactorEnabled ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
