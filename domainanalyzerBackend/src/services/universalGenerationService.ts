/**
 * Universal n8n template payload builder.
 *
 * Constructs the request body sent to N8N_UNIVERSAL_WEBHOOK_URL when a
 * worksheet topic is generated. Field naming follows the human-readable
 * convention required by the n8n template (mixed case, with spaces — see
 * the worksheet template spec).
 */

export type TemplateType =
  | 'blog'
  | 'faq'
  | 'case_study'
  | 'press_release'
  | 'landing_page'
  | 'report'
  | 'custom';

const ALL_TEMPLATE_TYPES: TemplateType[] = [
  'blog',
  'faq',
  'case_study',
  'press_release',
  'landing_page',
  'report',
  'custom',
];

/** Required template-specific fields per the spec. */
const TEMPLATE_REQUIRED_FIELDS: Record<TemplateType, string[]> = {
  blog: ['topic'],
  faq: ['faq_topic_focus'],
  case_study: [
    'client_name',
    'client_industry',
    'challenge',
    'solution',
    'results_metrics',
  ],
  press_release: [
    'announcement_type',
    'announcement_details',
    'release_date',
    'release_city',
    'release_state_country',
    'spokesperson_name',
    'spokesperson_title',
    'press_contact_name',
    'press_contact_email',
  ],
  landing_page: ['offer', 'unique_value_props', 'primary_cta'],
  report: [
    'research_question',
    'report_type',
    'report_title',
    'report_data',
    'publication_date',
  ],
  custom: ['custom_content_type_name', 'custom_content_purpose', 'custom_structure'],
};

/** Optional template-specific fields recognized for passthrough. */
const TEMPLATE_OPTIONAL_FIELDS: Record<TemplateType, string[]> = {
  blog: ['blog_angle', 'user_outline', 'internal_links', 'forbidden_words'],
  faq: ['num_questions', 'competitor_faqs'],
  case_study: ['client_size', 'testimonial_quote', 'testimonial_attribution', 'timeline'],
  press_release: [
    'secondary_quote_name',
    'secondary_quote_title',
    'press_contact_phone',
    'embargo',
    'embargo_datetime',
  ],
  landing_page: ['secondary_cta', 'social_proof', 'pain_point', 'urgency_element'],
  report: ['chart_data', 'methodology', 'author_name', 'author_title'],
  custom: ['custom_format_rules', 'custom_examples'],
};

export const isTemplateType = (value: unknown): value is TemplateType =>
  typeof value === 'string' && (ALL_TEMPLATE_TYPES as string[]).includes(value);

export interface UniversalGenerationInput {
  templateType: TemplateType;
  /** Internal label only — not injected into the content prompt. */
  projectName: string;
  projectGoal: string;
  primaryKeyword: string;
  longtailKeywords: string[];
  brandName: string;
  brandDescription: string;
  /** Either a preset string or `Custom`. When `Custom`, customAudienceText is required. */
  targetAudience: string;
  customAudienceText?: string;
  /** Either a preset string or `Custom`. When `Custom`, customToneText is required. */
  tone: string;
  customToneText?: string;
  wordCount: number;
  language?: string;
  cta?: string;
  /** Number of inline images (n8n field: `Image`). */
  images?: number;
  /** Yes/no flag for the featured image (n8n field: `Featured Image`). */
  featuredImage?: boolean;
  /** WordPress integration (n8n fields: `Username`, `Password`, `wordpress url`). */
  wordpress: {
    username: string;
    password: string;
    url: string;
  };
  /** Free-form template-specific fields (e.g. `topic` for blog). Unknown keys ignored. */
  templateFields?: Record<string, unknown>;
}

export class UniversalPayloadValidationError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'UniversalPayloadValidationError';
  }
}

const trimOrEmpty = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const requireValue = (label: string, value: string) => {
  if (!value) {
    throw new UniversalPayloadValidationError(`${label} is required`);
  }
  return value;
};

const validateGlobals = (input: UniversalGenerationInput) => {
  requireValue('project_name', trimOrEmpty(input.projectName));
  requireValue('project_goal', trimOrEmpty(input.projectGoal));
  requireValue('Primary Keyword', trimOrEmpty(input.primaryKeyword));
  requireValue('Brand Name', trimOrEmpty(input.brandName));
  requireValue('Brand description', trimOrEmpty(input.brandDescription));
  requireValue('target_audience', trimOrEmpty(input.targetAudience));
  requireValue('tone', trimOrEmpty(input.tone));
  if (!Number.isFinite(input.wordCount) || input.wordCount <= 0) {
    throw new UniversalPayloadValidationError('Word Count must be a positive number');
  }
  if (input.targetAudience.toLowerCase() === 'custom' && !trimOrEmpty(input.customAudienceText)) {
    throw new UniversalPayloadValidationError(
      'custom_audience_text is required when target_audience is Custom'
    );
  }
  if (input.tone.toLowerCase() === 'custom' && !trimOrEmpty(input.customToneText)) {
    throw new UniversalPayloadValidationError(
      'custom_tone_text is required when tone is Custom'
    );
  }
};

const validateTemplateFields = (
  templateType: TemplateType,
  fields: Record<string, unknown>
) => {
  const required = TEMPLATE_REQUIRED_FIELDS[templateType];
  const missing = required.filter((key) => !trimOrEmpty(fields[key]));
  if (missing.length > 0) {
    throw new UniversalPayloadValidationError(
      `Missing required template fields for ${templateType}: ${missing.join(', ')}`,
      { missing }
    );
  }
};

const pickTemplateFields = (
  templateType: TemplateType,
  fields: Record<string, unknown>
): Record<string, unknown> => {
  const allowed = new Set([
    ...TEMPLATE_REQUIRED_FIELDS[templateType],
    ...TEMPLATE_OPTIONAL_FIELDS[templateType],
  ]);
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = fields[key];
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }
  return out;
};

/**
 * Build the n8n universal-webhook payload for a worksheet generation.
 * Field naming matches the n8n template spec verbatim.
 */
export function buildUniversalPayload(input: UniversalGenerationInput): Record<string, unknown> {
  if (!isTemplateType(input.templateType)) {
    throw new UniversalPayloadValidationError(
      `Unknown template_type: ${input.templateType}`
    );
  }
  validateGlobals(input);

  const templateFields = pickTemplateFields(input.templateType, input.templateFields ?? {});
  validateTemplateFields(input.templateType, templateFields);

  const payload: Record<string, unknown> = {
    template_type: input.templateType,
    project_name: input.projectName.trim(),
    project_goal: input.projectGoal.trim(),
    'Primary Keyword': input.primaryKeyword.trim(),
    'longtail keywords': input.longtailKeywords
      .map((k) => k.trim())
      .filter(Boolean)
      .join(', '),
    'Brand Name': input.brandName.trim(),
    'Brand description': input.brandDescription.trim(),
    target_audience: input.targetAudience.trim(),
    tone: input.tone.trim(),
    'Word Count': Math.round(input.wordCount),
    language: trimOrEmpty(input.language) || 'en-US',
    Username: input.wordpress.username,
    Password: input.wordpress.password,
    'wordpress url': input.wordpress.url,
    ...templateFields,
  };

  if (input.cta !== undefined) {
    const cta = trimOrEmpty(input.cta);
    if (cta) payload.cta = cta;
  }

  if (input.images !== undefined && Number.isFinite(input.images)) {
    payload.Image = Math.max(0, Math.round(input.images));
  }

  if (input.featuredImage !== undefined) {
    payload['Featured Image'] = input.featuredImage ? 'yes' : 'no';
  }

  if (input.targetAudience.toLowerCase() === 'custom') {
    payload.custom_audience_text = trimOrEmpty(input.customAudienceText);
  }
  if (input.tone.toLowerCase() === 'custom') {
    payload.custom_tone_text = trimOrEmpty(input.customToneText);
  }

  return payload;
}

export const TEMPLATE_FIELDS_SPEC = {
  required: TEMPLATE_REQUIRED_FIELDS,
  optional: TEMPLATE_OPTIONAL_FIELDS,
} as const;
