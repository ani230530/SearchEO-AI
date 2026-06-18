import type { Intent } from './types';
import type { EnrichedContext } from './enrichmentService';
import { callJson, Models } from './llmClient';
import type { PromptCategory } from './topicsService';
import type { PromptSeedSignal } from './promptSignalsService';

export interface HumanAuditPrompt {
  text: string;
  category: PromptCategory;
  intentStage: 'awareness' | 'consideration' | 'decision';
  isBranded: false;
  persona: string | null;
  useCase: string | null;
  constraint: string | null;
  competitorMentioned: string | null;
  keyword: string;
  intent: Intent;
}

export interface HumanPromptValidation {
  pass: boolean;
  failures: string[];
  promptCount: number;
  wordCounts: number[];
  buckets: {
    under7: number;
    sevenTo13: number;
    fourteenTo28: number;
    twentyNineTo55: number;
  };
  targetBrandCount: number;
  duplicateCount: number;
  bannedWordHits: string[];
  competitorPromptCount: number;
  humanMarkerCount: number;
  commercialMarkerCount: number;
  exactAiVisibilityPhraseCount: number;
  topicCoverageCount: number;
  dominantTopicCount: number;
}

export interface PromptDiversityTheme {
  label: string;
  terms: string[];
}

interface RawHumanPrompt {
  prompt?: unknown;
  persona?: unknown;
  intent?: unknown;
  stage?: unknown;
  useCase?: unknown;
  constraint?: unknown;
  keyword?: unknown;
  grounding_anchor_ids?: unknown;
}

interface LlmHumanPromptPayload {
  selected?: RawHumanPrompt[];
  prompts?: RawHumanPrompt[];
  notes?: unknown;
}

export interface GenerateHumanPromptsInput {
  brand: string;
  host: string;
  context: EnrichedContext;
  signals: PromptSeedSignal[];
}

const BANNED_AI_COPY_RE =
  /\b(ensure|effectively|robust|comprehensive|leverage|utilize|optimize|key features|solution|landscape|strategic|seamless|unlock|cutting-edge|transformative|ai-centric|complement|empower|revolutionize|game-changing|holistic)\b/i;

const HUMAN_MARKER_RE =
  /\b(i\b|i'm|im|any\b|anyone|actually|worth|vs|btw|clients?|teams?|developers?|we\b|our\b|budget|price|pricing|guessing|not sure|which one|do people|without paying|too expensive|manual|manually|by hand|my\b|what are you using|is there|do you guys|looking for|does anyone|feels like)\b/i;

const COMMERCIAL_MARKER_RE =
  /\b(tool|tools|option|options|service|services|software|platform|track|tracking|client|clients|agency|team|teams|developer|developers|workflow|pricing|price|budget|cheap|cheaper|affordable|citations?|mentions?|report|reports|dashboard|brand|visibility|llm|chatgpt|perplexity|gemini|google ai|api|scraping|worth|cost|pay|paid|seo|cites?|recommend|recommendations?|compare|comparison|alternative|alternatives|collaboration|repo|repos|repository|repositories|review|reviews|permissions?|pull request|pull requests|security|private|automation|pipeline|ci cd)\b/i;

const TOOL_NAME_RE =
  /\b(semrush|ahrefs|profound|otterlyai|peec ai|brand radar|sistrix|awr|moz|surfer|clearscope|brightedge|authoritas)\b/i;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function compact(value: string | null | undefined, maxWords: number, fallback = ''): string {
  const cleaned = String(value ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\w\s&+./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, maxWords).join(' ') : fallback;
}

function humanCategoryLabel(value: string | null | undefined): string {
  const cleaned = compact(value, 6, 'options')
    .replace(/\b(software|platforms?|tools?|solutions?|services?|systems?|products?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^ai search visibility tracking$/i.test(cleaned)) return 'AI search tracking';
  if (/^ai visibility tracking$/i.test(cleaned)) return 'AI tracking';
  return compact(cleaned, 4, 'options');
}

function cleanKeywordLabel(value: string | null | undefined, fallback = 'buyer questions'): string {
  const cleaned = compact(value, 6, fallback)
    .replace(/\b(tools?|platforms?|software|solutions?|services?|systems?|products?|options?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return compact(cleaned, 4, fallback).toLowerCase();
}

function humanUseCaseLabel(value: string | null | undefined): string {
  const raw = compact(value, 7, 'team workflow');
  const transforms: Array<[RegExp, string]> = [
    [/^collaborate on software projects?$/i, 'software project collaboration'],
    [/^collaborate on (.+)$/i, '$1 collaboration'],
    [/^manage version control for code$/i, 'code version control'],
    [/^manage (.+)$/i, '$1 management'],
    [/^automate (.+)$/i, '$1 automation'],
    [/^integrate with ci\/cd pipelines?$/i, 'CI/CD pipeline automation'],
    [/^integrate with (.+)$/i, '$1 integration'],
    [/^tracking (.+)$/i, '$1 tracking'],
    [/^finding (.+)$/i, '$1 discovery'],
    [/^providing (.+)$/i, '$1'],
    [/^implementing (.+)$/i, '$1'],
    [/^seeking (.+)$/i, '$1'],
  ];
  for (const [pattern, replacement] of transforms) {
    const next = raw.replace(pattern, replacement).replace(/\bworkflows automation\b/i, 'workflow automation').trim();
    if (next !== raw) return compact(next, 6, 'team workflow');
  }
  return raw.replace(/\bworkflows automation\b/i, 'workflow automation');
}

function removeCategoryOverlap(useCase: string, category: string): string {
  const explicit = useCase.replace(/^version control and code collaboration$/i, 'code collaboration').trim();
  if (explicit !== useCase) return explicit;

  let next = useCase;
  const categoryParts = category
    .split(/\s+(?:and|&)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.split(/\s+/).length >= 2);
  for (const part of categoryParts.length ? categoryParts : [category]) {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    next = next
      .replace(new RegExp(`^${escaped}\\s+(?:and\\s+|for\\s+)?`, 'i'), '')
      .replace(new RegExp(`\\s+(?:and\\s+)?${escaped}$`, 'i'), '')
      .trim();
  }
  return next || useCase;
}

function angleLabelFromUseCase(useCase: string | null | undefined, category: string): string {
  const humanFull = humanUseCaseLabel(useCase);
  const withoutOverlap = cleanKeywordLabel(removeCategoryOverlap(humanFull, category), '');
  const human = cleanKeywordLabel(humanFull, '');
  return wordCount(withoutOverlap) >= 2 ? withoutOverlap : human;
}

function regexFromTerms(terms: string[]): RegExp | null {
  const escaped = terms
    .map((term) => compact(term, 5))
    .filter((term) => term.length > 1)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return null;
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanKeywordLabel(value, '');
    const key = normalize(cleaned);
    if (!key || key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function addTheme(
  themes: PromptDiversityTheme[],
  label: string | null | undefined,
  terms: Array<string | null | undefined> = []
): void {
  const cleanedLabel = cleanKeywordLabel(label, '');
  const key = normalize(cleanedLabel);
  if (!key || key.length < 3 || themes.some((theme) => normalize(theme.label) === key)) return;
  const variants = (value: string): string[] => {
    const cleaned = cleanKeywordLabel(value, '');
    const words = normalize(cleaned).split(/\s+/).filter(Boolean);
    const out = [cleaned];
    if (words.length >= 3) {
      out.push(words.slice(0, 2).join(' '));
      out.push(words.slice(1).join(' '));
      out.push(words.slice(-2).join(' '));
    }
    return out;
  };
  const cleanedTerms = uniqueNormalized([
    ...variants(cleanedLabel),
    ...terms.filter((term): term is string => typeof term === 'string'),
  ]);
  if (cleanedTerms.length === 0) return;
  themes.push({ label: cleanedLabel, terms: cleanedTerms });
}

function signalBlob(signals: PromptSeedSignal[]): string {
  return signals
    .slice(0, 30)
    .map((signal) => `${signal.title} ${signal.snippet} ${signal.query}`)
    .join(' ')
    .toLowerCase();
}

export function buildPromptDiversityThemes(input: GenerateHumanPromptsInput): PromptDiversityTheme[] {
  const themes: PromptDiversityTheme[] = [];
  const category = cleanKeywordLabel(humanCategoryLabel(input.context.category), 'buyer questions');
  const productContext = angleLabelFromUseCase(input.context.productContext, category);
  const useCases = uniqueNormalized(input.context.useCases.map((useCase) => angleLabelFromUseCase(useCase, category)));
  const constraints = uniqueNormalized(input.context.constraints.map((constraint) => compact(constraint, 5)));
  const blob = [
    input.context.category,
    input.context.productContext,
    input.context.vertical ?? '',
    ...input.context.useCases,
    ...input.context.constraints,
    signalBlob(input.signals),
  ].join(' ').toLowerCase();

  addTheme(themes, productContext, [input.context.productContext]);
  for (const useCase of useCases) addTheme(themes, useCase);

  if (/\b(version control|code collaboration|git|review|reviews|permission|permissions|pull requests?|access control|approval)\b/i.test(blob)) {
    addTheme(themes, 'reviews and permissions', ['code reviews', 'pull request reviews', 'permissions', 'access control']);
  }
  if (/\b(automation|workflow|ci\/cd|ci cd|pipeline|deploy|deployment)\b/i.test(blob)) {
    addTheme(themes, 'workflow automation', ['automation', 'workflow', 'ci/cd', 'pipeline', 'deployment']);
  }
  if (/\b(security|private repo|private repos|self hosted|self-hosted|compliance|enterprise)\b/i.test(blob)) {
    addTheme(themes, 'security and control', ['security', 'private repos', 'self hosted', 'compliance', 'enterprise']);
  }

  addTheme(themes, category, [input.context.category]);

  if (input.context.competitors.length > 0) {
    addTheme(themes, 'alternatives', ['vs', 'alternative', 'alternatives', 'instead', ...input.context.competitors]);
  }
  addTheme(themes, 'pricing and budget', ['pricing', 'price', 'budget', 'worth', 'paying', 'cost', 'cheaper', 'affordable']);
  for (const constraint of constraints) addTheme(themes, constraint);

  return themes.slice(0, 10);
}

function themeMatchesPrompt(text: string, theme: PromptDiversityTheme): boolean {
  const normalizedPrompt = normalize(text);
  if (!normalizedPrompt) return false;
  return theme.terms.some((term) => {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm || normalizedTerm.length < 2) return false;
    if (normalizedTerm.includes(' ')) return normalizedPrompt.includes(normalizedTerm);
    return new RegExp(`\\b${normalizedTerm}\\w*\\b`, 'i').test(normalizedPrompt);
  });
}

function primaryThemeForPrompt(text: string, themes: PromptDiversityTheme[]): string | null {
  const lower = text.toLowerCase();
  const priorityChecks: Array<{ text: RegExp; label: RegExp }> = [
    { text: /\b(vs|alternatives?|instead of|competitor|gitlab|bitbucket|sourceforge)\b/i, label: /\balternatives?\b/i },
    { text: /\b(workflow|automation|ci\/cd|ci cd|pipeline|deploy|deployment)\b/i, label: /\b(workflow|automation|pipeline|deployment|ci)\b/i },
    { text: /\b(review|reviews|permission|permissions|pull requests?|access control|security|private)\b/i, label: /\b(review|permission|security|private)\b/i },
  ];
  for (const check of priorityChecks) {
    if (!check.text.test(lower)) continue;
    const theme = themes.find((candidate) => check.label.test(candidate.label) || candidate.terms.some((term) => check.label.test(term)));
    if (theme) return theme.label;
  }
  return themes.find((theme) => themeMatchesPrompt(text, theme))?.label ?? null;
}

function topicCoverage(prompts: string[], themes: PromptDiversityTheme[]): {
  topicCoverageCount: number;
  dominantTopicCount: number;
} {
  if (themes.length === 0) return { topicCoverageCount: 0, dominantTopicCount: 0 };
  const counts = new Map<string, number>();
  for (const prompt of prompts) {
    const theme = primaryThemeForPrompt(prompt, themes) ?? 'unmatched';
    counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
  counts.delete('unmatched');
  return {
    topicCoverageCount: counts.size,
    dominantTopicCount: Math.max(0, ...counts.values()),
  };
}

function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

async function callOpenRouterJson<T>(args: {
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
}): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_REFERRER || 'http://localhost:3002',
      'X-Title': 'SearchEO-AI Human Prompt Generator',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.user },
      ],
      response_format: { type: 'json_object' },
      temperature: args.temperature,
      max_tokens: args.maxTokens,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}: ${text.slice(0, 240)}`);
  const content = JSON.parse(text).choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(stripCodeFence(content)) as T;
}

async function callPromptJson<T>(args: {
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
}): Promise<T> {
  try {
    return await callJson<T>({
      model: Models.topics,
      system: args.system,
      user: args.user,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
    });
  } catch (err) {
    if (!process.env.OPENROUTER_API_KEY?.trim()) throw err;
    return callOpenRouterJson<T>(args);
  }
}

function promptTexts(input: Array<string | { prompt?: unknown; text?: unknown }>): string[] {
  return input
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (typeof item.prompt === 'string') return item.prompt.trim();
      if (typeof item.text === 'string') return item.text.trim();
      return '';
    })
    .filter(Boolean);
}

export function validateHumanPromptSet(
  promptsInput: Array<string | { prompt?: unknown; text?: unknown }>,
  opts: {
    targetBrand: string;
    competitors?: string[];
    commercialTerms?: string[];
    diversityThemes?: PromptDiversityTheme[];
  }
): HumanPromptValidation {
  const prompts = promptTexts(promptsInput);
  const wordCounts = prompts.map(wordCount);
  const competitorRe = regexFromTerms(opts.competitors ?? []);
  const targetBrandRe = regexFromTerms([opts.targetBrand]);
  const commercialTermsRe = regexFromTerms(opts.commercialTerms ?? []);
  const { topicCoverageCount, dominantTopicCount } = topicCoverage(prompts, opts.diversityThemes ?? []);

  const targetBrandCount = targetBrandRe ? prompts.filter((p) => targetBrandRe.test(p)).length : 0;
  const duplicateCount = prompts.length - new Set(prompts.map(normalize)).size;
  const bannedWordHits = prompts.filter((p) => BANNED_AI_COPY_RE.test(p));
  const competitorPromptCount = prompts.filter((p) =>
    (competitorRe ? competitorRe.test(p) : false) || TOOL_NAME_RE.test(p)
  ).length;
  const humanMarkerCount = prompts.filter((p) => HUMAN_MARKER_RE.test(p)).length;
  const commercialMarkerCount = prompts.filter((p) =>
    COMMERCIAL_MARKER_RE.test(p) || (commercialTermsRe ? commercialTermsRe.test(p) : false)
  ).length;
  const exactAiVisibilityPhraseCount = prompts.filter((p) => /\bAI visibility\b/i.test(p)).length;
  const buckets = {
    under7: wordCounts.filter((n) => n < 7).length,
    sevenTo13: wordCounts.filter((n) => n >= 7 && n <= 13).length,
    fourteenTo28: wordCounts.filter((n) => n >= 14 && n <= 28).length,
    twentyNineTo55: wordCounts.filter((n) => n >= 29 && n <= 55).length,
  };

  const failures: string[] = [];
  if (prompts.length !== 6) failures.push(`need exactly 6 prompts, got ${prompts.length}`);
  if (targetBrandCount > 0) failures.push('target brand leaked into prompt set');
  if (duplicateCount > 0) failures.push(`${duplicateCount} duplicate prompt(s)`);
  if (bannedWordHits.length > 0) failures.push('AI-polished banned words found');
  if (competitorPromptCount > 3) failures.push('too many competitor/tool-name prompts');
  if (humanMarkerCount < 5) failures.push('need at least five prompts with human texture markers');
  if (commercialMarkerCount < prompts.length) failures.push('every prompt needs buying/audit intent');
  if (exactAiVisibilityPhraseCount > 3) failures.push('exact phrase "AI visibility" appears too often');
  if (buckets.under7 < 1) failures.push('need at least one prompt under 7 words');
  if (buckets.sevenTo13 < 2) failures.push('need at least two prompts from 7-13 words');
  if (buckets.fourteenTo28 < 2) failures.push('need at least two prompts from 14-28 words');
  if (buckets.twentyNineTo55 < 1) failures.push('need at least one prompt from 29-55 words');
  if (wordCounts.some((n) => n > 55)) failures.push('a prompt is longer than 55 words');
  if ((opts.diversityThemes?.length ?? 0) >= 4 && topicCoverageCount < 4) {
    failures.push(`need at least four distinct scraped/product angles, got ${topicCoverageCount}`);
  }
  if (dominantTopicCount > 3) failures.push('too many prompts focus on the same topic angle');

  return {
    pass: failures.length === 0,
    failures,
    promptCount: prompts.length,
    wordCounts,
    buckets,
    targetBrandCount,
    duplicateCount,
    bannedWordHits,
    competitorPromptCount,
    humanMarkerCount,
    commercialMarkerCount,
    exactAiVisibilityPhraseCount,
    topicCoverageCount,
    dominantTopicCount,
  };
}

function stageFromPrompt(text: string): 'awareness' | 'consideration' | 'decision' {
  if (/\b(vs|worth|paying|pricing|cheaper|budget|recommend|best|which one|alternatives?)\b/i.test(text)) return 'decision';
  if (/\b(compare|using|looking for|what are people using|tools?|options?)\b/i.test(text)) return 'consideration';
  return 'awareness';
}

function categoryFromPrompt(text: string): PromptCategory {
  if (/\b(vs|alternative|instead of|competitor|semrush|ahrefs|sistrix|brand radar)\b/i.test(text)) {
    return 'alternatives_to_competitor';
  }
  if (/\b(best|recommend|which|worth|paying|cheaper|budget)\b/i.test(text)) {
    return 'unbranded_recommendation';
  }
  if (/\b(top|leading|popular|trusted)\b/i.test(text)) {
    return 'top_n_listicle';
  }
  return 'problem_statement';
}

function keywordFromPrompt(text: string, fallbackCategory: string, diversityThemes: PromptDiversityTheme[] = []): string {
  const primaryTheme = primaryThemeForPrompt(text, diversityThemes);
  if (primaryTheme) return primaryTheme.toLowerCase();
  if (/\b(citation|cited|cites)\b/i.test(text)) return 'citations';
  if (/\b(price|pricing|budget|cheaper|affordable|paying|worth)\b/i.test(text)) return 'budget fit';
  if (/\b(client|clients|report|reports)\b/i.test(text)) return 'client reporting';
  if (/\b(manual|manually|by hand|workflow)\b/i.test(text)) return 'manual workflow';
  if (/\b(vs|alternative|instead|competitor)\b/i.test(text)) return 'alternatives';
  return compact(fallbackCategory, 3, 'buyer questions').toLowerCase();
}

function findCompetitorMention(text: string, competitors: string[]): string | null {
  for (const competitor of competitors) {
    const compacted = compact(competitor, 5);
    if (!compacted) continue;
    const re = new RegExp(`\\b${compacted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) return compacted.toLowerCase();
  }
  const match = text.match(TOOL_NAME_RE);
  return match?.[0]?.toLowerCase() ?? null;
}

function rawToAuditPrompt(raw: RawHumanPrompt | string, input: GenerateHumanPromptsInput): HumanAuditPrompt | null {
  const text = (typeof raw === 'string' ? raw : typeof raw.prompt === 'string' ? raw.prompt : '').trim();
  if (!text) return null;
  const persona = typeof raw !== 'string' && typeof raw.persona === 'string' ? raw.persona.trim().slice(0, 120) : null;
  const useCase = typeof raw !== 'string' && typeof raw.useCase === 'string' ? raw.useCase.trim().slice(0, 120) : null;
  const constraint = typeof raw !== 'string' && typeof raw.constraint === 'string' ? raw.constraint.trim().slice(0, 120) : null;
  const category = categoryFromPrompt(text);
  const stage = stageFromPrompt(text);
  const diversityThemes = buildPromptDiversityThemes(input);
  const derivedKeyword = keywordFromPrompt(text, input.context.category, diversityThemes);
  return {
    text,
    category,
    intentStage: stage,
    isBranded: false,
    persona: persona || null,
    useCase: useCase || null,
    constraint: constraint || null,
    competitorMentioned: findCompetitorMention(text, input.context.competitors),
    keyword: derivedKeyword ||
      (typeof raw !== 'string' && typeof raw.keyword === 'string' && raw.keyword.trim()
        ? raw.keyword.trim().toLowerCase().slice(0, 80)
        : keywordFromPrompt(text, input.context.category, diversityThemes)),
    intent: stage === 'awareness' ? 'Informational' : 'Commercial',
  };
}

function commercialTerms(input: GenerateHumanPromptsInput): string[] {
  return [
    input.context.category,
    input.context.productContext,
    input.context.vertical ?? '',
    ...input.context.useCases,
    ...input.context.personas,
  ].filter(Boolean);
}

function buildSystemPrompt(): string {
  return [
    'You generate AI visibility audit prompts that sound like real buyers, not AI-written templates.',
    'Return JSON only.',
    '',
    'Use supplied search/community anchors as the voice and topic source.',
    'Preserve real phrasing patterns: anyone else, actually, worth it, pricing, client reports, API vs scraping, manual checks, guessing, vs, current tools, and budget worries.',
    '',
    'Hard contract:',
    'Return {"selected":[{"prompt":"...","persona":"...","intent":"...","stage":"...","grounding_anchor_ids":[1],"why_human":"...","commercial_relevance":1-10}],"notes":"..."}',
    '',
    'Rules:',
    '- EXACTLY 6 prompts.',
    '- NEVER mention the target brand.',
    '- At most 3 prompts may include named existing tools or competitors.',
    '- Avoid these words: ensure, effectively, robust, comprehensive, leverage, utilize, optimize, key features, solution, landscape, strategic, seamless, unlock, cutting-edge, transformative, AI-centric, complement, empower, revolutionize, game-changing, holistic.',
    '- Required length mix: at least 1 under 7 words; at least 2 from 7-13 words; at least 2 from 14-28 words; at least 1 from 29-55 words.',
    '- At least 5 prompts must include human texture: I/my/we/our, anyone, actually, worth it, vs, budget, clients, not sure, too expensive, manually, guessing, looking for.',
    '- Do not use exact phrase "AI visibility" more than 3 times.',
    '- Every prompt must reveal commercial/audit intent: choosing a provider, price, client reporting, citations, brand mentions, API vs scraping, comparison, or manual-work pain.',
    '- Cover different product angles. Do not make all 6 prompts variants of the same keyword.',
    '- Use the coveragePlan labels from the user payload as separate angles; at least 4 different labels must appear across the set.',
    '- Do not make all prompts grammatically perfect. Human is okay. Spammy typo-heavy is not.',
  ].join('\n');
}

function buildUserPayload(input: GenerateHumanPromptsInput, previous?: RawHumanPrompt[], validation?: HumanPromptValidation): string {
  const coveragePlan = buildPromptDiversityThemes(input).map((theme) => ({
    label: theme.label,
    terms: theme.terms.slice(0, 6),
  }));
  return JSON.stringify({
    target: {
      targetBrand: input.brand,
      host: input.host,
      category: input.context.category,
      vertical: input.context.vertical,
      personas: input.context.personas,
      useCases: input.context.useCases,
      constraints: input.context.constraints,
      competitors: input.context.competitors,
      productContext: input.context.productContext,
      priceBand: input.context.priceBand,
      year: input.context.year,
    },
    coveragePlan,
    anchors: input.signals.slice(0, 28).map((signal) => ({
      id: signal.id,
      source: signal.source,
      title: signal.title,
      snippet: signal.snippet,
      host: signal.host,
      query: signal.query,
    })),
    previous,
    localValidationFailures: validation?.failures,
    localWordCounts: validation?.wordCounts,
    instruction: previous
      ? 'Repair the prompt set so local validation passes. Keep the most human-sounding ideas, but spread them across the coveragePlan labels.'
      : 'Create the final 6 prompts grounded in these anchors. Do not copy a full snippet verbatim; preserve the human voice and cover at least 4 coveragePlan labels.',
  });
}

function deterministicFallback(input: GenerateHumanPromptsInput): RawHumanPrompt[] {
  const category = humanCategoryLabel(input.context.category);
  const shortCategory = compact(category, 3, 'options');
  const themes = buildPromptDiversityThemes(input);
  const themeLabels = themes.map((theme) => theme.label);
  const nonIntentLabels = themeLabels.filter((label) => !/^(alternatives|pricing and budget)$/i.test(label));
  const productAngle = nonIntentLabels.find((label) => !normalize(shortCategory).includes(normalize(label))) ??
    (angleLabelFromUseCase(input.context.productContext || input.context.useCases[0], category) || shortCategory);
  const collaborationAngle = nonIntentLabels.find((label) => /\b(collaboration|project|team|code)\b/i.test(label)) ??
    productAngle;
  const workflowAngle = nonIntentLabels.find((label) => /\b(workflow|automation|pipeline|deploy)\b/i.test(label)) ??
    nonIntentLabels[1] ??
    productAngle;
  const controlFallback = /\b(version control|code collaboration|git|repository|repo)\b/i.test(
    `${input.context.category} ${input.context.productContext} ${input.context.useCases.join(' ')}`
  )
    ? 'code reviews and permissions'
    : 'reviews and permissions';
  const controlAngle = nonIntentLabels.find((label) =>
    !/\bversion control\b/i.test(label) && /\b(review|permission|security|private)\b/i.test(label)
  ) ?? controlFallback;
  const shortProductAngle = compact(productAngle, 3, shortCategory);
  const shortCollaborationAngle = compact(collaborationAngle, 4, productAngle);
  const shortWorkflowAngle = compact(workflowAngle, 4, productAngle);
  const shortControlAngle = compact(controlAngle, 4, 'reviews and permissions');
  const persona = compact(input.context.personas[0], 3, 'clients');
  const competitor = compact(input.context.competitors[0], 1, '');
  const secondCompetitor = compact(input.context.competitors[1], 1, '');
  const compare = competitor && secondCompetitor
    ? `${competitor} vs ${secondCompetitor} when ${shortControlAngle} matter - which feels less messy?`
    : `Which ${category} option feels less messy?`;

  return [
    { prompt: `${shortProductAngle} worth it yet?`, persona: 'Budget-conscious buyer', intent: 'price check', stage: 'awareness' },
    { prompt: `Is ${category} worth paying for yet?`, persona, intent: 'budget validation', stage: 'consideration' },
    {
      prompt: `Anyone using ${shortControlAngle} with ${shortCategory}, or are teams still doing this by hand?`,
      persona,
      intent: 'tool discovery',
      stage: 'consideration',
    },
    { prompt: compare, persona: 'Comparison shopper', intent: 'comparison', stage: 'decision' },
    {
      prompt: `I'm comparing ${shortWorkflowAngle} options for ${shortCollaborationAngle}. What are people actually using instead?`,
      persona,
      intent: 'workflow fit',
      stage: 'consideration',
    },
    {
      prompt: `We already have a basic setup for ${shortCollaborationAngle}, but our team keeps asking about ${shortControlAngle}, ${shortWorkflowAngle}, and cost before we switch. Is there a budget-friendly ${category} option people actually trust?`,
      persona,
      intent: 'budget-conscious decision',
      stage: 'decision',
    },
  ];
}

export async function generateHumanAuditPrompts(input: GenerateHumanPromptsInput): Promise<HumanAuditPrompt[]> {
  const system = buildSystemPrompt();
  const diversityThemes = buildPromptDiversityThemes(input);
  let best: RawHumanPrompt[] = [];
  let bestValidation: HumanPromptValidation | null = null;
  let previous: RawHumanPrompt[] | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const payload = await callPromptJson<LlmHumanPromptPayload>({
        system,
        user: buildUserPayload(input, previous, bestValidation ?? undefined),
        temperature: attempt === 0 ? 0.65 : 0.25,
        maxTokens: 3400,
      });
      const selected = Array.isArray(payload.selected)
        ? payload.selected
        : Array.isArray(payload.prompts)
          ? payload.prompts
          : [];
      const validation = validateHumanPromptSet(selected, {
        targetBrand: input.brand,
        competitors: input.context.competitors,
        commercialTerms: commercialTerms(input),
        diversityThemes,
      });
      if (!bestValidation || validation.failures.length < bestValidation.failures.length) {
        best = selected;
        bestValidation = validation;
      }
      if (validation.pass) {
        return selected.map((raw) => rawToAuditPrompt(raw, input)).filter((p): p is HumanAuditPrompt => p !== null);
      }
      previous = selected;
    } catch {
      break;
    }
  }

  const fallback = bestValidation && best.length === 6 ? best : deterministicFallback(input);
  const fallbackValidation = validateHumanPromptSet(fallback, {
    targetBrand: input.brand,
    competitors: input.context.competitors,
    commercialTerms: commercialTerms(input),
    diversityThemes,
  });
  const selected = fallbackValidation.pass ? fallback : deterministicFallback(input);
  return selected.map((raw) => rawToAuditPrompt(raw, input)).filter((p): p is HumanAuditPrompt => p !== null);
}
