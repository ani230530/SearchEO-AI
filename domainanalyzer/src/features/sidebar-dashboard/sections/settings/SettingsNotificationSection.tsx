import { useState } from "react";

export function SettingsNotificationSection() {
  const [receiveAlerts, setReceiveAlerts] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [dailyAlerts, setDailyAlerts] = useState(true);
  const [browserNotifications, setBrowserNotifications] = useState(false);
  const [customAlerts, setCustomAlerts] = useState(false);

  const sectionHeadingClass = "text-lg font-medium text-slate-800";
  const sectionSubHeadingClass = "text-base font-medium text-slate-800";
  const sectionItemTitleClass = "text-sm font-medium text-slate-800";
  const sectionItemDescriptionClass = "mt-1 text-sm text-gray-600";

  return (
    <div className="rounded-xl">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className={sectionHeadingClass}>Notification Settings</h3>
      </div>

      <div className="space-y-4 p-3">
        <div className="overflow-hidden rounded-md bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <p className={sectionSubHeadingClass}>Email Notifications</p>
          </div>

          <div className="space-y-5 px-4 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={sectionItemTitleClass}>Receive Alerts</p>
                <p className={sectionItemDescriptionClass}>
                  Stay informed with email alerts for significant changes, reports, or issues.
                </p>
              </div>
              <button
                type="button"
                aria-label="Toggle receive alerts"
                aria-pressed={receiveAlerts}
                onClick={() => setReceiveAlerts((prev) => !prev)}
                className={`relative mt-1 h-8 w-16 rounded-full transition ${
                  receiveAlerts ? "bg-[#8ca4d4]" : "bg-[#e6e6e6]"
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                    receiveAlerts ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div>
              <p className={sectionItemTitleClass}>Frequency Options</p>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={sectionItemTitleClass}>Weekly Summary</p>
                <p className={sectionItemDescriptionClass}>
                  Receive a summary of the week's performance and updates.
                </p>
              </div>
              <button
                type="button"
                aria-label="Toggle weekly summary"
                aria-pressed={weeklySummary}
                onClick={() => setWeeklySummary((prev) => !prev)}
                className={`relative mt-1 h-8 w-16 rounded-full transition ${
                  weeklySummary ? "bg-[#8ca4d4]" : "bg-[#e6e6e6]"
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                    weeklySummary ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={sectionItemTitleClass}>Daily Alerts</p>
                <p className={sectionItemDescriptionClass}>
                  Get a daily summary of key activities, including any critical changes.
                </p>
              </div>
              <button
                type="button"
                aria-label="Toggle daily alerts"
                aria-pressed={dailyAlerts}
                onClick={() => setDailyAlerts((prev) => !prev)}
                className={`relative mt-1 h-8 w-16 rounded-full transition ${
                  dailyAlerts ? "bg-[#8ca4d4]" : "bg-[#e6e6e6]"
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                    dailyAlerts ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-md bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <p className={sectionSubHeadingClass}>Push Notifications</p>
          </div>

          <div className="space-y-5 px-4 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={sectionItemTitleClass}>Enable Browser Notifications</p>
                <p className={sectionItemDescriptionClass}>
                  Receive immediate push notifications to keep you updated in real-time.
                </p>
              </div>
              <button
                type="button"
                aria-label="Toggle browser notifications"
                aria-pressed={browserNotifications}
                onClick={() => setBrowserNotifications((prev) => !prev)}
                className={`relative mt-1 h-8 w-16 rounded-full transition ${
                  browserNotifications ? "bg-[#8ca4d4]" : "bg-[#e6e6e6]"
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                    browserNotifications ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={sectionItemTitleClass}>Custom Alerts</p>
                <p className={sectionItemDescriptionClass}>
                  Get notified for important events, updates, or when your tasks require attention.
                </p>
              </div>
              <button
                type="button"
                aria-label="Toggle custom alerts"
                aria-pressed={customAlerts}
                onClick={() => setCustomAlerts((prev) => !prev)}
                className={`relative mt-1 h-8 w-16 rounded-full transition ${
                  customAlerts ? "bg-[#8ca4d4]" : "bg-[#e6e6e6]"
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                    customAlerts ? "right-1" : "left-1"
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
