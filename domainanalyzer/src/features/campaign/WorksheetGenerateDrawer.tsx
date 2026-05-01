import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Sparkles, Wand2 } from 'lucide-react';
import {
  WorksheetTopic,
  TemplateType,
  GenerateTopicPayload,
  GenerateTopicResult,
  generateTopic,
} from './api';

/* ---------- Template field schema ---------- */

type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'email' | 'number';
  placeholder?: string;
  required?: boolean;
};

const TEMPLATE_FIELDS: Record<TemplateType, { required: FieldDef[]; optional: FieldDef[] }> = {
  blog: {
    required: [
      { key: 'topic', label: 'Topic', type: 'text', required: true, placeholder: 'e.g. How AI is changing SEO in 2026' },
    ],
    optional: [
      { key: 'blog_angle', label: 'Blog angle', type: 'text', placeholder: 'How-to / Listicle / Opinion / ...' },
      { key: 'user_outline', label: 'Outline', type: 'textarea' },
      { key: 'internal_links', label: 'Internal links (comma-separated URLs)', type: 'textarea' },
      { key: 'forbidden_words', label: 'Forbidden words', type: 'text' },
    ],
  },
  faq: {
    required: [{ key: 'faq_topic_focus', label: 'FAQ topic focus', type: 'text', required: true }],
    optional: [
      { key: 'num_questions', label: 'Number of questions', type: 'number' },
      { key: 'competitor_faqs', label: 'Competitor FAQs (URLs or notes)', type: 'textarea' },
    ],
  },
  case_study: {
    required: [
      { key: 'client_name', label: 'Client name', type: 'text', required: true },
      { key: 'client_industry', label: 'Client industry', type: 'text', required: true },
      { key: 'challenge', label: 'Challenge', type: 'textarea', required: true },
      { key: 'solution', label: 'Solution', type: 'textarea', required: true },
      { key: 'results_metrics', label: 'Results / metrics', type: 'textarea', required: true },
    ],
    optional: [
      { key: 'client_size', label: 'Client size', type: 'text' },
      { key: 'testimonial_quote', label: 'Testimonial quote', type: 'textarea' },
      { key: 'testimonial_attribution', label: 'Testimonial attribution', type: 'text' },
      { key: 'timeline', label: 'Timeline', type: 'text' },
    ],
  },
  press_release: {
    required: [
      { key: 'announcement_type', label: 'Announcement type', type: 'text', required: true },
      { key: 'announcement_details', label: 'Announcement details', type: 'textarea', required: true },
      { key: 'release_date', label: 'Release date', type: 'date', required: true },
      { key: 'release_city', label: 'Release city', type: 'text', required: true },
      { key: 'release_state_country', label: 'Release state / country', type: 'text', required: true },
      { key: 'spokesperson_name', label: 'Spokesperson name', type: 'text', required: true },
      { key: 'spokesperson_title', label: 'Spokesperson title', type: 'text', required: true },
      { key: 'press_contact_name', label: 'Press contact name', type: 'text', required: true },
      { key: 'press_contact_email', label: 'Press contact email', type: 'email', required: true },
    ],
    optional: [
      { key: 'secondary_quote_name', label: 'Secondary quote name', type: 'text' },
      { key: 'secondary_quote_title', label: 'Secondary quote title', type: 'text' },
      { key: 'press_contact_phone', label: 'Press contact phone', type: 'text' },
      { key: 'embargo', label: 'Embargo', type: 'text' },
      { key: 'embargo_datetime', label: 'Embargo datetime', type: 'text' },
    ],
  },
  landing_page: {
    required: [
      { key: 'offer', label: 'Offer', type: 'textarea', required: true },
      { key: 'unique_value_props', label: 'Unique value props', type: 'textarea', required: true },
      { key: 'primary_cta', label: 'Primary CTA', type: 'text', required: true },
    ],
    optional: [
      { key: 'secondary_cta', label: 'Secondary CTA', type: 'text' },
      { key: 'social_proof', label: 'Social proof', type: 'textarea' },
      { key: 'pain_point', label: 'Pain point', type: 'textarea' },
      { key: 'urgency_element', label: 'Urgency element', type: 'text' },
    ],
  },
  report: {
    required: [
      { key: 'research_question', label: 'Research question', type: 'textarea', required: true },
      { key: 'report_type', label: 'Report type', type: 'text', required: true },
      { key: 'report_title', label: 'Report title', type: 'text', required: true },
      { key: 'report_data', label: 'Report data', type: 'textarea', required: true },
      { key: 'publication_date', label: 'Publication date', type: 'date', required: true },
    ],
    optional: [
      { key: 'chart_data', label: 'Chart data', type: 'textarea' },
      { key: 'methodology', label: 'Methodology', type: 'textarea' },
      { key: 'author_name', label: 'Author name', type: 'text' },
      { key: 'author_title', label: 'Author title', type: 'text' },
    ],
  },
  custom: {
    required: [
      { key: 'custom_content_type_name', label: 'Custom content type name', type: 'text', required: true },
      { key: 'custom_content_purpose', label: 'Custom content purpose', type: 'textarea', required: true },
      { key: 'custom_structure', label: 'Custom structure', type: 'textarea', required: true },
    ],
    optional: [
      { key: 'custom_format_rules', label: 'Custom format rules', type: 'textarea' },
      { key: 'custom_examples', label: 'Custom examples', type: 'textarea' },
    ],
  },
};

const TEMPLATE_LABELS: Record<TemplateType, string> = {
  blog: 'Blog post',
  faq: 'FAQ',
  case_study: 'Case study',
  press_release: 'Press release',
  landing_page: 'Landing page',
  report: 'Report',
  custom: 'Custom',
};

const PROJECT_GOAL_PRESETS = [
  'Generate leads',
  'Brand awareness',
  'AI visibility',
  'Product launch',
  'SEO authority',
  'Thought leadership',
];

const AUDIENCE_PRESETS = [
  'B2B decision makers',
  'B2B technical buyers',
  'Small business owners',
  'Consumers (B2C)',
  'Developers',
  'Marketing professionals',
  'Custom',
];

const TONE_PRESETS = [
  'Professional',
  'Conversational',
  'Authoritative',
  'Friendly',
  'Witty',
  'Inspirational',
  'Custom',
];

/* ---------- localStorage cache for last-used drawer values ---------- */

const CACHE_KEY = 'worksheet-generate-drawer/last-used/v1';

type CachedDefaults = {
  templateType: TemplateType;
  projectGoal: string;
  targetAudience: string;
  customAudienceText: string;
  tone: string;
  customToneText: string;
  wordCount: number;
  language: string;
  cta: string;
  images: number;
  featuredImage: boolean;
  templateFields: Record<string, string>;
};

const DEFAULTS: CachedDefaults = {
  templateType: 'blog',
  projectGoal: PROJECT_GOAL_PRESETS[0],
  targetAudience: AUDIENCE_PRESETS[0],
  customAudienceText: '',
  tone: TONE_PRESETS[0],
  customToneText: '',
  wordCount: 1500,
  language: 'en-US',
  cta: '',
  images: 1,
  featuredImage: true,
  templateFields: {},
};

const loadDefaults = (): CachedDefaults => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
};

const persistDefaults = (snapshot: CachedDefaults) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota — ignore */
  }
};

/* ---------- Component ---------- */

export interface WorksheetGenerateDrawerProps {
  topic: WorksheetTopic | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (result: GenerateTopicResult) => void;
}

export default function WorksheetGenerateDrawer({
  topic,
  open,
  onClose,
  onSuccess,
}: WorksheetGenerateDrawerProps) {
  const cached = useMemo(loadDefaults, []);
  const [templateType, setTemplateType] = useState<TemplateType>(cached.templateType);
  const [projectGoal, setProjectGoal] = useState(cached.projectGoal);
  const [targetAudience, setTargetAudience] = useState(cached.targetAudience);
  const [customAudienceText, setCustomAudienceText] = useState(cached.customAudienceText);
  const [tone, setTone] = useState(cached.tone);
  const [customToneText, setCustomToneText] = useState(cached.customToneText);
  const [wordCount, setWordCount] = useState(cached.wordCount);
  const [language, setLanguage] = useState(cached.language);
  const [cta, setCta] = useState(cached.cta);
  const [images, setImages] = useState(cached.images);
  const [featuredImage, setFeaturedImage] = useState(cached.featuredImage);
  const [templateFields, setTemplateFields] = useState<Record<string, string>>(cached.templateFields);
  const [showOptional, setShowOptional] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill `topic` template field with the worksheet topic title for blog template,
  // since that's what the spec requires and matches user expectation.
  useEffect(() => {
    if (!open || !topic) return;
    setTemplateFields((prev) => {
      if (templateType === 'blog' && !prev.topic) {
        return { ...prev, topic: topic.title };
      }
      return prev;
    });
  }, [open, topic, templateType]);

  // Reset error when re-opened
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  if (!open || !topic) return null;

  const primary = topic.keywords.find((k) => k.isPrimary);
  const longtails = topic.keywords.filter((k) => k.isLongtail);

  const fields = TEMPLATE_FIELDS[templateType];
  const isAudienceCustom = targetAudience.toLowerCase() === 'custom';
  const isToneCustom = tone.toLowerCase() === 'custom';

  const setTemplateField = (key: string, value: string) =>
    setTemplateFields((prev) => ({ ...prev, [key]: value }));

  const handleTemplateChange = (next: TemplateType) => {
    setTemplateType(next);
    // Reset per-template fields but keep `topic` if switching back to blog
    setTemplateFields((prev) => {
      if (next === 'blog' && topic) {
        return { topic: prev.topic || topic.title };
      }
      return {};
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primary) {
      setError('Pick a primary keyword on the worksheet first.');
      return;
    }

    const trimmedFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(templateFields)) {
      const t = (v ?? '').toString().trim();
      if (t) trimmedFields[k] = t;
    }

    const payload: GenerateTopicPayload = {
      template_type: templateType,
      project_goal: projectGoal.trim(),
      target_audience: targetAudience.trim(),
      custom_audience_text: isAudienceCustom ? customAudienceText.trim() || undefined : undefined,
      tone: tone.trim(),
      custom_tone_text: isToneCustom ? customToneText.trim() || undefined : undefined,
      word_count: Number(wordCount) || 800,
      language: language.trim() || 'en-US',
      cta: cta.trim() || undefined,
      images: Number.isFinite(images) ? Math.max(0, Math.round(images)) : 0,
      featured_image: featuredImage,
      template_fields: trimmedFields,
    };

    setSubmitting(true);
    setError(null);

    try {
      const result = await generateTopic(topic.id, payload);
      // Persist for next time
      persistDefaults({
        templateType,
        projectGoal,
        targetAudience,
        customAudienceText,
        tone,
        customToneText,
        wordCount,
        language,
        cta,
        images,
        featuredImage,
        templateFields,
      });
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-8 py-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-gray-500">
              <Wand2 className="h-3 w-3" />
              Generate
            </div>
            <h2 className="mt-3 text-2xl font-light tracking-tight text-gray-900">
              {topic.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Primary: <span className="font-medium text-gray-800">{primary?.term ?? '—'}</span>
              {longtails.length > 0 && (
                <>
                  {' '}
                  · Longtails:{' '}
                  <span className="text-gray-700">{longtails.map((k) => k.term).join(', ')}</span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-y-auto px-8 py-6 space-y-8"
        >
          {/* Template selector */}
          <Section title="Template" hint="Defaults to a blog post. Switch if you need a different format.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(TEMPLATE_LABELS) as TemplateType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => handleTemplateChange(t)}
                  className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
                    templateType === t
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {TEMPLATE_LABELS[t]}
                </button>
              ))}
            </div>
          </Section>

          {/* Template-specific required fields */}
          <Section title={`${TEMPLATE_LABELS[templateType]} details`}>
            {fields.required.map((f) => (
              <FieldInput
                key={f.key}
                def={f}
                value={templateFields[f.key] || ''}
                onChange={(v) => setTemplateField(f.key, v)}
              />
            ))}
          </Section>

          {/* Project basics */}
          <Section title="Project basics">
            <SelectWithFreeform
              label="Project goal"
              value={projectGoal}
              onChange={setProjectGoal}
              presets={PROJECT_GOAL_PRESETS}
            />
            <SelectWithFreeform
              label="Target audience"
              value={targetAudience}
              onChange={(v) => {
                setTargetAudience(v);
                if (v.toLowerCase() !== 'custom') setCustomAudienceText('');
              }}
              presets={AUDIENCE_PRESETS}
            />
            {isAudienceCustom && (
              <TextArea
                label="Custom audience description"
                value={customAudienceText}
                onChange={setCustomAudienceText}
                required
              />
            )}
            <SelectWithFreeform
              label="Tone"
              value={tone}
              onChange={(v) => {
                setTone(v);
                if (v.toLowerCase() !== 'custom') setCustomToneText('');
              }}
              presets={TONE_PRESETS}
            />
            {isToneCustom && (
              <TextArea
                label="Custom tone instructions"
                value={customToneText}
                onChange={setCustomToneText}
                required
              />
            )}
            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="Word count"
                value={wordCount}
                onChange={setWordCount}
                min={100}
                step={100}
              />
              <TextInput
                label="Language"
                value={language}
                onChange={setLanguage}
                placeholder="en-US"
              />
            </div>
            <TextInput label="CTA" value={cta} onChange={setCta} placeholder="e.g. Book a demo" />
          </Section>

          {/* Media */}
          <Section title="Media">
            <div className="grid grid-cols-2 gap-4">
              <NumberInput label="Inline images" value={images} onChange={setImages} min={0} />
              <CheckboxRow
                label="Include featured image"
                checked={featuredImage}
                onChange={setFeaturedImage}
              />
            </div>
          </Section>

          {/* Optional template fields collapsible */}
          {fields.optional.length > 0 && (
            <Section
              title={
                <button
                  type="button"
                  onClick={() => setShowOptional((s) => !s)}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  {showOptional ? '− Hide' : '+ Show'} optional {TEMPLATE_LABELS[templateType]} fields
                </button>
              }
            >
              {showOptional &&
                fields.optional.map((f) => (
                  <FieldInput
                    key={f.key}
                    def={f}
                    value={templateFields[f.key] || ''}
                    onChange={(v) => setTemplateField(f.key, v)}
                  />
                ))}
            </Section>
          )}

          {error && (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="sticky bottom-0 -mx-8 -mb-6 flex items-center justify-end gap-3 border-t border-gray-100 bg-white/95 px-8 py-4 backdrop-blur">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-black text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)' }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {submitting ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function Section({
  title,
  hint,
  children,
}: {
  title: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const common = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    placeholder: def.placeholder,
    required: def.required,
    className:
      'w-full px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-black/20 focus:outline-none',
  };
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">
        {def.label}
        {def.required && <span className="text-red-500"> *</span>}
      </label>
      {def.type === 'textarea' ? (
        <textarea {...common} rows={3} />
      ) : def.type === 'number' ? (
        <input type="number" {...common} />
      ) : def.type === 'date' ? (
        <input type="date" {...common} />
      ) : def.type === 'email' ? (
        <input type="email" {...common} />
      ) : (
        <input type="text" {...common} />
      )}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-black/20 focus:outline-none"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        required={required}
        className="w-full px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-black/20 focus:outline-none"
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-black/20 focus:outline-none"
      />
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 self-end pb-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function SelectWithFreeform({
  label,
  value,
  onChange,
  presets,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets: string[];
}) {
  const isPreset = presets.includes(value);
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="grid grid-cols-1 gap-2">
        <select
          value={isPreset ? value : '__freeform__'}
          onChange={(e) =>
            onChange(e.target.value === '__freeform__' ? value || '' : e.target.value)
          }
          className="w-full px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-black/20 focus:outline-none"
        >
          {presets.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="__freeform__">Other (specify below)</option>
        </select>
        {!isPreset && (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Custom ${label.toLowerCase()}`}
            className="w-full px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-black/20 focus:outline-none"
          />
        )}
      </div>
    </div>
  );
}
