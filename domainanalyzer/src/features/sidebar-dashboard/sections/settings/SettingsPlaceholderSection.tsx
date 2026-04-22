interface SettingsPlaceholderSectionProps {
  title?: string;
}

export function SettingsPlaceholderSection({ title = "Coming Soon" }: SettingsPlaceholderSectionProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8">
      <h3 className="text-lg font-medium text-slate-800">{title}</h3>
      <p className="mt-2 text-sm text-gray-600">This section is intentionally empty for now.</p>
    </div>
  );
}
