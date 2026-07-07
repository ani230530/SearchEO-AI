import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Globe2, Loader2, X } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

type WordpressIntegrationResponse = {
  success?: boolean;
  integration?: {
    siteUrl?: string | null;
    username?: string | null;
  } | null;
  error?: string;
};

interface WordpressIntegrationModalProps {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void | Promise<void>;
  submitLabel?: string;
}

export default function WordpressIntegrationModal({
  open,
  onClose,
  onConnected,
  submitLabel = 'Connect WordPress',
}: WordpressIntegrationModalProps) {
  const [siteUrl, setSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasExistingConnection, setHasExistingConnection] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadIntegration = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/publish/wordpress`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
          },
        });
        const data = (await response.json().catch(() => ({}))) as WordpressIntegrationResponse;
        if (!response.ok || data.success === false) {
          throw new Error(data.error || 'Failed to load WordPress integration');
        }
        if (cancelled) return;
        const integration = data.integration ?? null;
        setHasExistingConnection(Boolean(integration));
        setSiteUrl(integration?.siteUrl ?? '');
        setUsername(integration?.username ?? '');
        setPassword('');
      } catch (err) {
        if (!cancelled) {
          setHasExistingConnection(false);
          setError(err instanceof Error ? err.message : 'Failed to load WordPress integration');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadIntegration();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedSiteUrl = siteUrl.trim();
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedSiteUrl || !trimmedUsername) {
      setError('WordPress URL and username are required.');
      return;
    }
    if (!hasExistingConnection && !trimmedPassword) {
      setError('Application password is required for the first connection.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/publish/wordpress`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteUrl: trimmedSiteUrl,
          username: trimmedUsername,
          password: trimmedPassword,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as WordpressIntegrationResponse;
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Failed to save WordPress integration');
      }
      setPassword('');
      await onConnected?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save WordPress credentials');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close WordPress setup"
      />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close WordPress setup"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#2D4059]">
            <Globe2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Connect WordPress</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Add your WordPress site details to publish generated drafts directly from this worksheet.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-800">WordPress URL</span>
            <input
              type="text"
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
              placeholder="https://example.org"
              disabled={loading || saving}
              className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-[#4E76C7] focus:ring-2 focus:ring-[#4E76C7]/20 disabled:bg-slate-50 disabled:text-slate-400"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-800">WordPress Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
              disabled={loading || saving}
              className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-[#4E76C7] focus:ring-2 focus:ring-[#4E76C7]/20 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-800">Application Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={hasExistingConnection ? 'Leave blank to keep current password' : 'Application password'}
              disabled={loading || saving}
              className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-[#4E76C7] focus:ring-2 focus:ring-[#4E76C7]/20 disabled:bg-slate-50 disabled:text-slate-400"
            />
            <span className="mt-1.5 block text-xs leading-5 text-slate-500">
              Use a WordPress application password for safer publishing access.
            </span>
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-10 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || saving}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2D4059] px-4 text-sm font-semibold text-white transition hover:bg-[#24344a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? 'Saving...' : submitLabel}
            {!saving && !loading ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
        </div>
      </form>
    </div>
  );
}
