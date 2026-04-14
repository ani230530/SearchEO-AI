import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

const WordPressConnection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [wpForm, setWpForm] = useState({ siteUrl: '', username: '', password: '' });
  const [wpIntegrationSaving, setWpIntegrationSaving] = useState(false);
  const [wpIntegrationDeleting, setWpIntegrationDeleting] = useState(false);
  const [hasWordpressIntegration, setHasWordpressIntegration] = useState(false);
  const [wpIntegrationLoading, setWpIntegrationLoading] = useState(false);
  const [wpIntegration, setWpIntegration] = useState({ lastPublishedAt: null });
  const [errors, setErrors] = useState({});

  const fetchWordpressIntegration = useCallback(async () => {
    try {
      setWpIntegrationLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/publish/wordpress`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch WordPress integration');
      }

      const data = await response.json();
      if (data.success) {
        setWpIntegration(data.integration || null);
        setHasWordpressIntegration(!!data.integration);
        setWpForm((prev) => ({
          ...prev,
          siteUrl: data.integration?.siteUrl || '',
          username: data.integration?.username || '',
          password: '',
        }));
      }
    } catch (error) {
      console.error('Error fetching WordPress integration:', error);
      toast({
        title: "WordPress",
        description: "Unable to load WordPress integration details",
        variant: "destructive"
      });
    } finally {
      setWpIntegrationLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchWordpressIntegration();
  }, [fetchWordpressIntegration]);


  const handleSaveWordpressIntegration = async () => {
     const newErrors = {};

  if (!wpForm.siteUrl.trim()) newErrors.siteUrl = "Required";
  if (!wpForm.username.trim()) newErrors.username = "Required";
  if (!hasWordpressIntegration && !wpForm.password.trim()) {
    newErrors.password = "Required";
  }

  setErrors(newErrors);

  if (Object.keys(newErrors).length > 0) return;

    if (!wpForm.siteUrl.trim() || !wpForm.username.trim()) {
      toast({
        title: "Missing Information",
        description: "Site URL and username are required",
        variant: "destructive"
      });
      return;
    }

    if (!hasWordpressIntegration && !wpForm.password.trim()) {
      toast({
        title: "Password Required",
        description: "Enter your WordPress password or application password to connect",
        variant: "destructive"
      });
      return;
    }

    try {
      setWpIntegrationSaving(true);
      const response = await fetch(`${API_BASE_URL}/api/publish/wordpress`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteUrl: wpForm.siteUrl.trim(),
          username: wpForm.username.trim(),
          password: wpForm.password,
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save integration');
      }

      toast({
        title: "WordPress Connected",
        description: "WordPress credentials saved securely",
      });
      setWpForm((prev) => ({ ...prev, password: '' }));
      fetchWordpressIntegration();
    } catch (error) {
      console.error('Error saving WordPress integration:', error);
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Unable to save WordPress credentials",
        variant: "destructive"
      });
    } finally {
      setWpIntegrationSaving(false);
    }
  };

  const handleDisconnectWordpress = async () => {
    try {
      setWpIntegrationDeleting(true);
      const response = await fetch(`${API_BASE_URL}/api/publish/wordpress`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      const data = await response.json();
      if (data.success) {
        setHasWordpressIntegration(false);
        setWpIntegration(null);
        setWpForm({ siteUrl: '', username: '', password: '' });
        toast({
          title: "Disconnected",
          description: "WordPress integration has been removed",
        });
      }
    } catch (error) {
      console.error('Error disconnecting WordPress:', error);
      toast({
        title: "Error",
        description: "Failed to disconnect WordPress integration",
        variant: "destructive"
      });
    } finally {
      setWpIntegrationDeleting(false);
    }
  };

  return (
    <div className="relative w-full">
      {/* Background Layer */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-20" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-20" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 min-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div
          className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-8 hover:shadow-lg"
          style={{ borderWidth: '0.5px' }}
        >
          <div className="mb-2 ">
  <div className="flex items-center gap-2 mb-2">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
<path d="M12 2C6.49 2 2 6.49 2 12C2 17.51 6.49 22 12 22C17.51 22 22 17.51 22 12C22 6.49 17.51 2 12 2ZM3.01 12C3.01 10.7 3.29 9.46 3.79 8.34L8.08 20.09C5.08 18.63 3.01 15.56 3.01 12ZM12 20.99C11.12 20.99 10.27 20.86 9.46 20.62L12.16 12.78L14.92 20.35C14.94 20.39 14.96 20.44 14.98 20.47C14.05 20.81 13.05 20.99 12 20.99ZM13.24 7.78C13.78 7.75 14.27 7.69 14.27 7.69C14.75 7.63 14.7 6.92 14.21 6.95C14.21 6.95 12.75 7.06 11.81 7.06C10.93 7.06 9.44 6.95 9.44 6.95C8.96 6.93 8.9 7.67 9.39 7.7C9.39 7.7 9.85 7.76 10.33 7.79L11.73 11.63L9.76 17.53L6.49 7.78C7.03 7.76 7.52 7.7 7.52 7.7C8 7.64 7.95 6.93 7.46 6.96C7.46 6.96 6 7.07 5.06 7.07C4.89 7.07 4.69 7.07 4.48 7.06C6.1 4.62 8.86 3.01 12 3.01C14.34 3.01 16.47 3.9 18.07 5.37C18.03 5.37 17.99 5.36 17.95 5.36C17.07 5.36 16.44 6.13 16.44 6.96C16.44 7.7 16.87 8.33 17.32 9.07C17.66 9.67 18.06 10.44 18.06 11.55C18.06 12.32 17.76 13.21 17.38 14.46L16.48 17.46L13.24 7.78ZM19.89 7.69C21.0127 9.74575 21.2887 12.1585 20.6593 14.4147C20.0299 16.6709 18.5447 18.5923 16.52 19.77L19.27 11.83C19.78 10.55 19.95 9.52 19.95 8.61C19.95 8.28 19.93 7.97 19.89 7.69Z" fill="#2D4059"/>
</svg>

    <h2
      className="text-2xl font-medium text-gray-900"
      style={{ letterSpacing: "-0.003em" }}
    >
      Connect Your WordPress Site!
    </h2>
  </div>
  <p
    className="text-sm text-neutral-400 font-light "
    style={{ letterSpacing: "0.011em" }}
  >
    To upload it directly to your website, please connect your WordPress account. Once connected, we’ll be able to publish your content with the correct formatting and SEO settings. You remain in full control of what goes live.
  </p>
</div>
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium border uppercase tracking-wider mb-6 ${
              hasWordpressIntegration 
                ? 'bg-green-100 text-green-700 border-green-100' 
                : 'bg-red-100 text-red-700 border-red-100'
            }`}
          >
            {hasWordpressIntegration ? 'Connected' : 'Not Connected'}
          </div>


          {wpIntegrationLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-100 rounded"></div>
              <div className="h-4 bg-gray-100 rounded"></div>
              <div className="h-4 bg-gray-100 rounded w-1/2"></div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block" style={{ letterSpacing: '0.011em' }}>
                  WordPress URL <span className="text-red-700">*</span>
                </label>
                <input
                  type="text"
                  value={wpForm.siteUrl}
                  onChange={(e) => setWpForm((prev) => ({ ...prev, siteUrl: e.target.value }))}
                  placeholder="https://example.org"
                 className={`w-full px-4 py-3 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 font-light ${
    errors.siteUrl ? "border-red-500 focus:ring-red-200" : "border-gray-500 focus:ring-gray-900"
  }`}
  
                  style={{ borderWidth: '0.5px', letterSpacing: '0.011em' }}
                />
                {errors.siteUrl && (
  <p className="text-xs text-red-500 mt-1">{errors.siteUrl}</p>
)}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block" style={{ letterSpacing: '0.011em' }}>
                  Username or Email <span className="text-red-700">*</span>
                </label>
                <input
                  type="text"
                  value={wpForm.username}
                  onChange={(e) => setWpForm((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="admin"
                 className={`w-full px-4 py-3 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 font-light ${
    errors.username ? "border-red-500 focus:ring-red-200" : "border-gray-500 focus:ring-gray-900"
  }`}
                  style={{ borderWidth: '0.5px', letterSpacing: '0.011em' }}
                />
                {errors.username && (
  <p className="text-xs text-red-500 mt-1">{errors.username}</p>
)}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block" style={{ letterSpacing: '0.011em' }}>
                  Application Password <span className="text-red-700">*</span>
                </label>
                <input
                  type="password"
                  value={wpForm.password}
                  onChange={(e) => setWpForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder={hasWordpressIntegration ? 'Enter password to update' : '••••••••'}
                  className={`w-full px-4 py-3 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 font-light ${
    errors.password ? "border-red-500 focus:ring-red-200" : "border-gray-500 focus:ring-gray-900"
  }`}
                  style={{ borderWidth: '0.5px', letterSpacing: '0.011em' }}
                />
                {errors.password && (
  <p className="text-xs text-red-500 mt-1">{errors.password}</p>
)}
                <div className="mt-2 space-y-1.5 text-xs font-light text-gray-500" style={{ letterSpacing: '0.011em' }}>
                  <p>
                    Use a <span className="font-medium text-gray-700">WordPress Application Password</span>, not your normal login password.
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>
                      In your WordPress admin go to{' '}
                      <span className="font-medium text-gray-700">Users → Profile → Application Passwords</span>.
                    </li>
                    <li>Generate a new application password and copy it once.</li>
                    <li>Paste that value here to allow secure REST API publishing.</li>
                  </ul>
                  <p>
                    We encrypt this token before storing it. Leave blank to keep the existing one.
                  </p>
                </div>
              </div>
              {wpIntegration?.lastPublishedAt && (
                <p className="text-xs font-light text-gray-500" style={{ letterSpacing: '0.011em' }}>
                  Last published {new Date(wpIntegration.lastPublishedAt).toLocaleString()}
                </p>
              )}
              <div className="flex flex-wrap gap-3 pt-4">
                <button
                  onClick={handleSaveWordpressIntegration}
                  disabled={wpIntegrationSaving}
                  className="bg-[#2D4059] text-white rounded-md font-medium px-8 py-3 hover:bg-gray-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  style={{ letterSpacing: '-0.022em' }}
                >
                  {wpIntegrationSaving ? 'Saving…' : hasWordpressIntegration ? 'Update Connection' : 'Save Connection'}
                </button>
                {hasWordpressIntegration && (
                  <button
                    onClick={handleDisconnectWordpress}
                    disabled={wpIntegrationDeleting}
                    className="px-8 py-3 rounded-md border border-gray-300 text-gray-700 bg-white text-sm font-medium hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ letterSpacing: '-0.022em' }}
                  >
                    {wpIntegrationDeleting ? 'Removing…' : 'Disconnect'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WordPressConnection;