import type { Dispatch, SetStateAction } from "react";
import { ArrowRight, CheckCircle, ChevronLeft, Database, Globe, Plug } from "lucide-react";

import { IntegrationSkeleton } from "@/features/sidebar-dashboard/components/IntegrationSkeleton";
import { cn } from "@/lib/utils";

type GscProperty = {
  siteUrl: string;
  permissionLevel: string;
};

type WpFormState = {
  siteUrl: string;
  username: string;
  password: string;
};

interface AnalyticsIntegrationSectionProps {
  showWordpressConnectionView: boolean;
  setShowWordpressConnectionView: Dispatch<SetStateAction<boolean>>;
  gscStatusLoading: boolean;
  gscConnected: boolean;
  handleConnectGsc: () => void | Promise<void>;
  gscEmail: string;
  handleDisconnectGsc: () => void | Promise<void>;
  gscLastSynced: string | null;
  gscSelectedProperty: string;
  setGscSelectedProperty: Dispatch<SetStateAction<string>>;
  fetchGscProperties: () => void | Promise<void>;
  gscLoading: boolean;
  gscProperties: GscProperty[];
  handleSelectProperty: (siteUrl: string) => void | Promise<void>;
  googleAnalyticsId: string;
  setGoogleAnalyticsId: Dispatch<SetStateAction<string>>;
  gaSaving: boolean;
  handleSaveGoogleAnalyticsId: () => Promise<void>;
  hasWordpressIntegration: boolean;
  wpIntegrationLoading: boolean;
  wpForm: WpFormState;
  setWpForm: Dispatch<SetStateAction<WpFormState>>;
  handleSaveWordpressIntegration: () => void | Promise<void>;
  wpIntegrationSaving: boolean;
  handleDisconnectWordpress: () => void;
  wpIntegrationDeleting: boolean;
}

export function AnalyticsIntegrationSection({
  showWordpressConnectionView,
  setShowWordpressConnectionView,
  gscStatusLoading,
  gscConnected,
  handleConnectGsc,
  gscEmail,
  handleDisconnectGsc,
  gscLastSynced,
  gscSelectedProperty,
  setGscSelectedProperty,
  fetchGscProperties,
  gscLoading,
  gscProperties,
  handleSelectProperty,
  googleAnalyticsId,
  setGoogleAnalyticsId,
  gaSaving,
  handleSaveGoogleAnalyticsId,
  hasWordpressIntegration,
  wpIntegrationLoading,
  wpForm,
  setWpForm,
  handleSaveWordpressIntegration,
  wpIntegrationSaving,
  handleDisconnectWordpress,
  wpIntegrationDeleting,
}: AnalyticsIntegrationSectionProps) {
  if (showWordpressConnectionView) {
    return (
      <div className="w-full min-w-6xl mx-auto space-y-6">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <button
              onClick={() => setShowWordpressConnectionView(false)}
              className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Integration
            </button>
            <span>/</span>
            <span className="text-gray-900 font-medium">Connect your WordPress site</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <img src="/skill-icons_wordpress.png" alt="" />
                <h2 className="text-2xl font-medium text-gray-900">Connect Your WordPress Site!</h2>
              </div>
              <p className="text-sm text-gray-500 font-light">
                To upload it directly to your website, please connect your WordPress account. Once
                connected, we&apos;ll be able to publish your content with the correct formatting and
                SEO settings. You remain in full control of what goes live.
              </p>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium border uppercase tracking-wider mb-6 ${
                hasWordpressIntegration
                  ? "bg-green-100 text-green-700 border-green-100"
                  : "bg-red-100 text-red-700 border-red-100"
              }`}
            >
              {hasWordpressIntegration ? "Connected" : "Not Connected"}
            </div>

            {wpIntegrationLoading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-gray-100 rounded"></div>
                <div className="h-4 bg-gray-100 rounded"></div>
                <div className="h-4 bg-gray-100 rounded w-1/2"></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-900 mb-2 block">
                    WordPress URL <span className="text-red-700">*</span>
                  </label>
                  <input
                    type="text"
                    value={wpForm.siteUrl}
                    onChange={(e) => setWpForm((prev) => ({ ...prev, siteUrl: e.target.value }))}
                    placeholder="https://example.org"
                    className="w-full px-4 py-3 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 font-light"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-900 mb-2 block">
                    WordPress Username <span className="text-red-700">*</span>
                  </label>
                  <input
                    type="text"
                    value={wpForm.username}
                    onChange={(e) => setWpForm((prev) => ({ ...prev, username: e.target.value }))}
                    placeholder="admin"
                    className="w-full px-4 py-3 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 font-light"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-900 mb-2 block">
                    Application Password <span className="text-red-700">*</span>
                  </label>
                  <input
                    type="password"
                    value={wpForm.password}
                    onChange={(e) => setWpForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder={hasWordpressIntegration ? "Enter password to update" : "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"}
                    className="w-full px-4 py-3 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 font-light"
                  />
                  <p className="text-xs font-light text-gray-500 mt-2">
                    For security, use a WordPress application password instead of your main login
                    password.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={handleSaveWordpressIntegration}
                    disabled={wpIntegrationSaving}
                    className="h-11 px-6 inline-flex items-center justify-center gap-2 rounded-md bg-[#2D4059] text-sm font-medium text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {wpIntegrationSaving
                      ? "Saving..."
                      : hasWordpressIntegration
                        ? "Update Connection"
                        : "Connect WordPress"}
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  {hasWordpressIntegration && (
                    <button
                      onClick={handleDisconnectWordpress}
                      disabled={wpIntegrationDeleting}
                      className="h-11 px-6 rounded-md border border-gray-300 text-gray-700 bg-white text-sm font-medium hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {wpIntegrationDeleting ? "Removing..." : "Disconnect"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (gscStatusLoading) {
    return (
      <div className="w-full min-w-6xl mx-auto space-y-6">
        <IntegrationSkeleton />
      </div>
    );
  }

  return (
    <div className="w-full min-w-6xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  gscConnected ? "bg-green-50" : "bg-gray-100"
                )}
              >
                {gscConnected ? (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <Plug className="h-6 w-6 text-gray-400" />
                )}
              </div>
              <div>
                <h3 className="text-xl font-light text-black tracking-tight">
                  {gscConnected ? "Connected" : "Google Search Console"}
                </h3>
                <p className="text-sm font-light text-gray-600">
                  {gscConnected ? gscEmail : "Not connected"}
                </p>
              </div>
            </div>
            {gscConnected ? (
              <button
                onClick={handleDisconnectGsc}
                className="px-4 py-2 text-sm font-light text-red-600 hover:text-red-700 transition-colors"
              >
                Disconnect
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1 rounded-full text-[10px] font-medium border border-red-100 uppercase tracking-wider">
                Not Connected
              </div>
            )}
          </div>
          <p className="text-sm text-neutral-400 font-light max-w-xl mb-4">
            Connect Google Search Console to analyze your content and SEO automatically.
          </p>
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-gray-100 mb-4">
            <iframe
              className="w-full h-full"
              src="https://www.youtube.com/embed/JnX6_YAflt8?si=EvfXp_9hEyyCSI0m"
              title="Google Search Console Tutorial"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
          {gscConnected ? (
            gscLastSynced && (
              <p className="text-xs font-light text-gray-500 ">
                Last synced: {new Date(gscLastSynced).toLocaleString()}
              </p>
            )
          ) : (
            <button
              onClick={handleConnectGsc}
              className="h-12 px-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-[#2D4059] text-md font-medium text-white shadow-md hover:shadow-lg active:scale-95 transition"
            >
              Connect Google Search Console
              <ArrowRight />
            </button>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <img src="icons8-google-analytics-24.png" alt="" srcSet="" />
              <h3 className="text-xl sm:text-2xl font-light text-black tracking-tight">Google Analytics</h3>
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium border uppercase tracking-wider",
                googleAnalyticsId
                  ? "bg-green-50 text-green-700 border-green-100"
                  : "bg-red-50 text-red-700 border-red-100"
              )}
            >
              {googleAnalyticsId ? "Connected" : "Not Connected"}
            </div>
          </div>

          <p className="text-sm text-neutral-400 font-light max-w-xl mb-4 mt-2">
            Connect Google Analytics, then add your GA4 ID for reporting.
          </p>

          <div className="w-full aspect-video rounded-2xl overflow-hidden border border-gray-100">
            <iframe
              className="w-full h-full"
              src="https://www.youtube.com/embed/pJxNPfwQfHs"
              title="Google Analytics Tutorial"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center py-3">
            <div className="relative flex-1 group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-black transition">
                <Database className="h-4 w-4" />
              </div>

              <input
                type="text"
                value={googleAnalyticsId}
                onChange={(e) => setGoogleAnalyticsId(e.target.value)}
                placeholder="GA4 Property ID (e.g. 123456789)"
                className="w-full h-12 pl-11 pr-4 text-sm rounded-md border border-neutral-200 bg-neutral-50 focus:bg-white focus:border-black/20 focus:ring-4 focus:ring-black/5 outline-none transition-all placeholder:text-neutral-400 font-light"
              />
            </div>

            <button
              onClick={handleSaveGoogleAnalyticsId}
              disabled={gaSaving || !googleAnalyticsId}
              className={cn(
                "h-12 px-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-[#2D4059] text-md font-medium transition",
                googleAnalyticsId && !gaSaving
                  ? "text-white shadow-md hover:shadow-lg active:scale-95"
                  : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
              )}
            >
              {gaSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Syncing
                </>
              ) : (
                "Update Analytics ID"
              )}
              <ArrowRight />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-4 ">
            <div>
              <div className="flex items-center gap-3">
                <img src="/skill-icons_wordpress.png" alt="" srcSet="" />
                <h3 className="text-xl sm:text-2xl font-light text-black tracking-tight">
                  WordPress Publishing
                </h3>
              </div>
              <p className="text-sm text-neutral-400 font-light max-w-xl mb-4 mt-2">
                Securely store credentials to auto-publish generated content
              </p>
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium border uppercase tracking-wider",
                hasWordpressIntegration
                  ? "bg-green-50 text-green-700 border-green-100"
                  : "bg-red-50 text-red-700 border-red-100"
              )}
            >
              {hasWordpressIntegration ? "Connected" : "Not Connected"}
            </div>
          </div>

          {wpIntegrationLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-100 rounded"></div>
              <div className="h-4 bg-gray-100 rounded"></div>
              <div className="h-4 bg-gray-100 rounded w-1/2"></div>
            </div>
          ) : (
            <div>
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-gray-100 mb-4">
                <iframe
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/pJxNPfwQfHs?si=DmLV-gdgqw9TJUdZ"
                  title="WordPress Publishing Tutorial"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
              <button
                onClick={() => setShowWordpressConnectionView(true)}
                className={cn(
                  "h-12 px-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-[#2D4059] text-md font-medium transition text-white shadow-md hover:shadow-lg active:scale-95"
                )}
              >
                Wordpress
                <ArrowRight />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
