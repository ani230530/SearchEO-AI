import type { Intent } from './types';
import type { EnrichedContext } from './enrichmentService';
import { callJson, Models } from './llmClient';
import type { PromptCategory } from './topicsService';
import type { PromptSeedSignal } from './promptSignalsService';
import { callOpenRouterJson as callLoggedOpenRouterJson } from '../services/openRouterClient';

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
  avoidPrompts?: string[];
}

const BANNED_AI_COPY_RE =
  /\b(ensure|effectively|robust|comprehensive|leverage|utilize|optimize|key features|solution|landscape|strategic|seamless|unlock|cutting-edge|transformative|ai-centric|complement|empower|revolutionize|game-changing|holistic)\b/i;

const HUMAN_MARKER_RE =
  /\b(i\b|i'm|im|any\b|anyone|actually|worth|vs|btw|clients?|teams?|developers?|we\b|our\b|budget|price|pricing|guessing|not sure|which one|do people|without paying|too expensive|manual|manually|by hand|my\b|what are you using|is there|are there|do you guys|looking for|does anyone|feels like|best|recommendations?|near me|near\b|who\b|what kind|what type|help with|before hiring|work closely|specializes?|focus more|trying to understand)\b/i;

const COMMERCIAL_MARKER_RE =
  /\b(tool|tools|option|options|service|services|software|platform|provider|providers|company|companies|firm|firms|advisor|advisors|consultant|consultants|agency|agencies|specialist|specialists|planner|planners|track|tracking|client|clients|team|teams|developer|developers|workflow|pricing|price|budget|cheap|cheaper|affordable|fee-only|fiduciary|local|near me|near\b|citations?|mentions?|report|reports|dashboard|brand|visibility|llm|chatgpt|perplexity|gemini|google ai|api|scraping|worth|cost|pay|paid|seo|cites?|recommend|recommendations?|compare|comparison|alternative|alternatives|collaboration|repo|repos|repository|repositories|review|reviews|permissions?|pull request|pull requests|security|private|automation|pipeline|ci cd|hiring|hire|before hiring|specializes?|work with|help with|focus|understands?)\b/i;

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

function uniquePhrases(values: string[], maxWords = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = compact(value, maxWords);
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
  const locations = uniqueNormalized((input.context.locations ?? []).map((location) => compact(location, 5)));
  const blob = [
    input.context.category,
    input.context.productContext,
    input.context.vertical ?? '',
    ...input.context.useCases,
    ...input.context.constraints,
    ...locations,
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
  for (const location of locations) addTheme(themes, location, [`near ${location}`, `in ${location}`, location]);

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
    { text: /\b(near me|near\b|in\b|local|service areas?)\b/i, label: /\b(near|local|maryland|virginia|dc|location|area)\b/i },
    { text: /\b(specializes?|specialists?|understands?|works? with|clients?)\b/i, label: /\b(special|client|persona|use case|retire|federal|team)\b/i },
    { text: /\b(before hiring|what should i ask|help with|trying to understand)\b/i, label: /\b(advice|planning|help|question|buyer)\b/i },
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
  const covered = new Set<string>();
  for (const prompt of prompts) {
    const theme = primaryThemeForPrompt(prompt, themes) ?? 'unmatched';
    counts.set(theme, (counts.get(theme) ?? 0) + 1);
    if (theme !== 'unmatched') covered.add(theme);
    for (const matched of themes.filter((candidate) => themeMatchesPrompt(prompt, candidate))) {
      covered.add(matched.label);
    }
  }
  counts.delete('unmatched');
  return {
    topicCoverageCount: covered.size,
    dominantTopicCount: Math.max(0, ...counts.values()),
  };
}

async function callOpenRouterPromptJson<T>(args: {
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
}): Promise<T> {
  return callLoggedOpenRouterJson<T>({
    model: 'openai/gpt-4o-mini',
    system: args.system,
    user: args.user,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    context: {
      feature: 'prompt_research',
      operation: 'human_prompt_generation_fallback',
    },
  });
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
    return callOpenRouterPromptJson<T>(args);
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
  if (competitorPromptCount > 2) failures.push('too many competitor/tool-name prompts');
  if (humanMarkerCount < 4) failures.push('need at least four prompts with human search phrasing');
  if (commercialMarkerCount < prompts.length) failures.push('every prompt needs buying/audit intent');
  if (exactAiVisibilityPhraseCount > 3) failures.push('exact phrase "AI visibility" appears too often');
  if (wordCounts.filter((n) => n <= 13).length < 4) failures.push('need at least four concise prompts of 13 words or fewer');
  if (buckets.fourteenTo28 < 1) failures.push('need at least one prompt from 14-28 words');
  if (wordCounts.some((n) => n > 28)) failures.push('a prompt is longer than 28 words');
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
  if (/\b(vs|worth|paying|pricing|cheaper|budget|recommend|recommendations?|best|which one|alternatives?|near me|near\b|hire|hiring)\b/i.test(text)) return 'decision';
  if (/\b(compare|using|looking for|what are people using|tools?|options?|services?|firms?|providers?|specializes?|work with|understands?)\b/i.test(text)) return 'consideration';
  return 'awareness';
}

function categoryFromPrompt(text: string): PromptCategory {
  if (/\b(vs|alternative|instead of|competitor|semrush|ahrefs|sistrix|brand radar)\b/i.test(text)) {
    return 'alternatives_to_competitor';
  }
  if (/\b(best|recommend|recommendations?|which|worth|paying|cheaper|budget|near me|near\b|hire|hiring)\b/i.test(text)) {
    return 'unbranded_recommendation';
  }
  if (/\b(top|leading|popular|trusted|firms?|providers?|services?|companies?)\b/i.test(text)) {
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
  if (/\b(near me|near\b|local|maryland|virginia|dc|area)\b/i.test(text)) return 'local recommendations';
  if (/\b(specializes?|understands?|work with|clients?)\b/i.test(text)) return 'specialist fit';
  if (/\b(before hiring|what should i ask|help with)\b/i.test(text)) return 'buyer questions';
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
    ...(input.context.locations ?? []),
  ].filter(Boolean);
}

function buildSystemPrompt(): string {
  return [
    'You generate AI visibility audit prompts that sound like real people asking ChatGPT, Perplexity, or Gemini for recommendations.',
    'Return JSON only.',
    '',
    'Use supplied search/community anchors as the topic source, but write prompts in the style of real buyer discovery queries.',
    'The target style is like:',
    '- Best financial advisors for retirees in Virginia',
    '- What are the best fee-only retirement planning services in Maryland?',
    '- Who specializes in federal employee retirement planning near DC?',
    '- Are there any good independent financial advisors near Ashburn?',
    '- I want someone who can help with retirement, taxes, and estate planning.',
    '- What should I ask a retirement advisor before hiring them?',
    '- What kind of advisor understands federal retirement benefits?',
    '',
    'For non-financial categories, adapt the same structure to the category/service/product being audited.',
    '',
    'Hard contract:',
    'Return {"selected":[{"prompt":"...","persona":"...","intent":"...","stage":"...","grounding_anchor_ids":[1],"why_human":"...","commercial_relevance":1-10}],"notes":"..."}',
    '',
    'Rules:',
    '- EXACTLY 6 prompts.',
    '- NEVER mention the target brand.',
    '- At most 2 prompts may include named existing tools or competitors.',
    '- Avoid these words: ensure, effectively, robust, comprehensive, leverage, utilize, optimize, key features, solution, landscape, strategic, seamless, unlock, cutting-edge, transformative, AI-centric, complement, empower, revolutionize, game-changing, holistic.',
    '- Required length mix: at least 4 prompts of 13 words or fewer; at least 1 prompt from 14-28 words; none above 28 words.',
    '- At least 4 prompts must use natural search phrasing: best, recommendations, who specializes, what kind, near me, near <location>, I want someone/tool/service that can help with, what should I ask before hiring.',
    '- Do not use exact phrase "AI visibility" more than 3 times.',
    '- Every prompt must reveal commercial/audit intent: choosing a provider/tool/service, local fit, specialty fit, comparison, hiring questions, pricing, integrations, citations, mentions, or manual-work pain.',
    '- Cover different product angles. Do not make all 6 prompts variants of the same keyword.',
    '- Use the coveragePlan labels from the user payload as separate angles; at least 4 different labels must appear across the set.',
    '- Prefer concrete nouns over vague SaaS words. Use "firms", "services", "tools", "platforms", "advisors", "providers", or domain-specific equivalents when appropriate.',
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
      locations: input.context.locations ?? [],
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
    existingPromptsToAvoid: (input.avoidPrompts ?? []).slice(0, 30),
    previous,
    localValidationFailures: validation?.failures,
    localWordCounts: validation?.wordCounts,
    requiredStyleFamilies: [
      'category recommendation: Best {category/providers/services/tools} for {persona/use case} in/near {location}',
      'specialist fit: Who specializes in {specific use case / audience / constraint}?',
      'local discovery: Are there any good {category/providers/services/tools} near {location/near me}?',
      'problem fit: I want someone/a tool/a service that can help with {2-3 real jobs-to-be-done}',
      'buyer advice: What should I ask a {category/provider} before hiring/choosing them?',
      'comparison or alternative: {competitor} vs {competitor} / alternatives to {competitor}, only when competitors are supplied',
    ],
    instruction: previous
      ? 'Repair the prompt set so local validation passes. Keep the most human-sounding ideas, but spread them across the coveragePlan labels.'
      : 'Create the final 6 prompts grounded in these anchors. Do not copy a full snippet verbatim; use the requiredStyleFamilies, cover at least 4 coveragePlan labels, and do not repeat any existingPromptsToAvoid.',
  });
}

function pluralizeNounPhrase(value: string): string {
  const cleaned = compact(value, 6, 'providers').toLowerCase();
  if (!cleaned) return 'providers';
  if (/\b(software|wealth management|retirement planning|financial planning|tax planning|estate planning|code collaboration|version control|workflow automation|project management)$/i.test(cleaned)) {
    return cleaned;
  }
  if (/(s|x|z|ch|sh)$/i.test(cleaned)) return cleaned;
  if (/y$/i.test(cleaned) && !/[aeiou]y$/i.test(cleaned)) return `${cleaned.slice(0, -1)}ies`;
  return `${cleaned}s`;
}

function providerPhrase(category: string): { singular: string; plural: string; helper: string } {
  const clean = humanCategoryLabel(category).toLowerCase();
  if (/\b(advisor|planner|wealth|financial|retirement|estate|tax)\b/i.test(clean)) {
    const singular = /\badvisor\b/i.test(clean)
      ? clean
      : /\bplanner\b/i.test(clean)
        ? clean
        : `${clean.replace(/\b(services?|firms?|companies?)\b/gi, '').trim()} advisor`.replace(/\s+/g, ' ').trim();
    return { singular, plural: pluralizeNounPhrase(singular), helper: 'someone' };
  }
  if (/\b(agency|consultant|consulting|firm|lawyer|attorney|accountant|doctor|clinic|hotel|venue|contractor)\b/i.test(clean)) {
    const singular = clean.replace(/\bservices\b/gi, 'service').trim();
    return { singular, plural: pluralizeNounPhrase(singular), helper: 'someone' };
  }
  if (/\b(platform|software|tool|app|devops|version control|code|repository|repo|crm|dashboard)\b/i.test(clean)) {
    const singular = /\b(platform|software|tool|app)\b/i.test(clean) ? clean : `${clean} tool`;
    return { singular, plural: pluralizeNounPhrase(singular), helper: 'a tool' };
  }
  const singular = clean.replace(/\bservices\b/gi, 'service').trim() || 'provider';
  return { singular, plural: pluralizeNounPhrase(singular), helper: 'a service' };
}

function withArticle(phrase: string): string {
  const cleaned = compact(phrase, 7, 'provider');
  if (/^(a|an|the|someone)\b/i.test(cleaned)) return cleaned;
  return /^[aeiou]/i.test(cleaned) ? `an ${cleaned}` : `a ${cleaned}`;
}

function chooseLocations(input: GenerateHumanPromptsInput): { primary: string; secondary: string | null } {
  const candidates = uniquePhrases([
    ...(input.context.locations ?? []),
    ...input.context.constraints.filter((constraint) => /\b(near|in|serves?|serving|area|city|state|county|dc|usa|uk|canada|india|maryland|virginia|california|texas|new york)\b/i.test(constraint)),
  ]);
  const meaningful = candidates.filter((location) => !/^(united states|usa|global|online|remote)$/i.test(location));
  return {
    primary: meaningful[0] ?? 'near me',
    secondary: meaningful.find((location) => normalize(location) !== normalize(meaningful[0] ?? '')) ?? null,
  };
}

function inOrNear(location: string): string {
  if (!location || /^near me$/i.test(location)) return 'near me';
  if (/^(dc|washington dc|new york city|nyc|bay area)$/i.test(location)) return `near ${location}`;
  return `in ${location}`;
}

function nearClause(location: string): string {
  if (!location || /^near me$/i.test(location)) return 'near me';
  return `near ${location}`;
}

function cleanAngle(value: string | null | undefined, fallback: string): string {
  return cleanKeywordLabel(value, fallback)
    .replace(/\b(options?|solutions?|platforms?|software|tools?|services?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

function uniqueAngles(input: GenerateHumanPromptsInput): string[] {
  const category = humanCategoryLabel(input.context.category);
  const raw = [
    ...input.context.useCases.map((useCase) => angleLabelFromUseCase(useCase, category)),
    angleLabelFromUseCase(input.context.productContext, category),
    ...input.context.constraints,
    ...buildPromptDiversityThemes(input).map((theme) => theme.label),
  ];
  const out = uniqueNormalized(raw.map((item) => cleanAngle(item, category)));
  return out.filter((item) => normalize(item) !== normalize(category)).slice(0, 8);
}

function helperRelativePronoun(helper: string): string {
  return /^someone$/i.test(helper) ? 'who' : 'that';
}

function qualifierPhrase(value: string | null | undefined): string {
  const cleaned = compact(value, 4, '');
  if (!cleaned) return '';
  if (/^budget fit$/i.test(cleaned)) return 'budget-friendly';
  if (/\b(fit|workflow|permission|permissions)\b/i.test(cleaned) && !/\b(fee|fiduciary|independent|security|private|federal|local|affordable|enterprise|small)\b/i.test(cleaned)) {
    return '';
  }
  return cleaned;
}

function deterministicFallback(input: GenerateHumanPromptsInput): RawHumanPrompt[] {
  const category = humanCategoryLabel(input.context.category);
  const provider = providerPhrase(category);
  const locations = chooseLocations(input);
  const persona = compact(input.context.personas[0], 4, /\b(platform|software|tool|code|repo|devops|version control)\b/i.test(category) ? 'small teams' : 'clients');
  const angles = uniqueAngles(input);
  const primaryAngle = compact(angles[0], 6, cleanAngle(input.context.productContext, category));
  const secondAngle = compact(angles[1], 6, primaryAngle);
  const thirdAngle = compact(angles[2], 6, secondAngle);
  const specialty = compact(
    angles.find((angle) => /\b(federal|retire|tax|estate|fee|fiduciary|review|permission|security|private|workflow|automation|integration|dfa|dimensional)\b/i.test(angle)) ?? primaryAngle,
    7,
    primaryAngle
  );
  const qualifier = qualifierPhrase(
    input.context.constraints.find((constraint) => /\b(fee|fiduciary|independent|budget|security|private|federal|local|affordable|enterprise|small)\b/i.test(constraint)) ?? '',
  );
  const qualifiedProvider = qualifier
    ? `${qualifier} ${provider.plural}`.replace(/\b(firms|providers|services|tools|platforms)\s+\1\b/gi, '$1')
    : provider.plural;
  const competitor = compact(input.context.competitors[0], 3, '');
  const secondCompetitor = compact(input.context.competitors[1], 3, '');
  const comparison = competitor && secondCompetitor
    ? `${competitor} vs ${secondCompetitor} for ${specialty} - which is better?`
    : `Which ${provider.singular} is best for ${specialty}?`;

  const candidates: RawHumanPrompt[] = [
    { prompt: `Best ${provider.plural} for ${persona} ${inOrNear(locations.primary)}`, persona, intent: 'local recommendation', stage: 'decision' },
    { prompt: `What are the best ${qualifiedProvider} for ${primaryAngle}?`, persona, intent: 'recommendation', stage: 'decision' },
    { prompt: `Who specializes in ${specialty}${locations.secondary ? ` ${nearClause(locations.secondary)}` : ''}?`, persona, intent: 'specialist fit', stage: 'consideration' },
    { prompt: `Are there any good independent ${provider.plural} ${nearClause(locations.primary)}?`, persona, intent: 'local discovery', stage: 'decision' },
    {
      prompt: `I want ${provider.helper} ${helperRelativePronoun(provider.helper)} can help with ${primaryAngle}, ${secondAngle}, and ${thirdAngle}.`,
      persona,
      intent: 'problem fit',
      stage: 'consideration',
    },
    { prompt: `What should I ask before choosing ${withArticle(provider.singular)}?`, persona, intent: 'buyer questions', stage: 'awareness' },
    { prompt: comparison, persona: 'Comparison shopper', intent: 'comparison', stage: 'decision' },
    { prompt: `What kind of ${provider.singular} understands ${specialty}?`, persona, intent: 'specialist fit', stage: 'consideration' },
    { prompt: `Give me recommendations for ${provider.plural} that focus on ${secondAngle}.`, persona, intent: 'recommendation', stage: 'decision' },
    {
      prompt: `Are there ${provider.plural} ${inOrNear(locations.primary)} that focus more on ${primaryAngle} than hype?`,
      persona,
      intent: 'local specialist fit',
      stage: 'decision',
    },
    {
      prompt: `Which ${provider.plural} work closely with ${persona} on ${thirdAngle}?`,
      persona,
      intent: 'client fit',
      stage: 'consideration',
    },
  ];

  const avoid = new Set((input.avoidPrompts ?? []).map(normalize).filter(Boolean));
  const seen = new Set<string>();
  const selected: RawHumanPrompt[] = [];
  for (const candidate of candidates) {
    const text = typeof candidate.prompt === 'string' ? candidate.prompt : '';
    const key = normalize(text);
    if (!key || seen.has(key) || avoid.has(key)) continue;
    seen.add(key);
    selected.push(candidate);
    if (selected.length === 6) break;
  }

  return selected.length === 6 ? selected : candidates.slice(0, 6);
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
      const overlapCount = selected
        .map((raw) => (typeof raw === 'string' ? raw : typeof raw.prompt === 'string' ? raw.prompt : ''))
        .filter((text) => (input.avoidPrompts ?? []).some((existing) => normalize(existing) === normalize(text))).length;
      if (overlapCount > 0) {
        validation.failures.push(`${overlapCount} prompt(s) repeat existing saved prompts`);
        validation.pass = false;
      }
      if (!bestValidation || validation.failures.length < bestValidation.failures.length) {
        best = selected;
        bestValidation = validation;
      }
      if (validation.pass) {
        return selected.map((raw) => rawToAuditPrompt(raw, input)).filter((p): p is HumanAuditPrompt => p !== null);
      }
      previous = selected;
    } catch (err) {
      console.warn('[PROMPTS] human prompt LLM call failed; fallback may be used:', err instanceof Error ? err.message : String(err));
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
  if (!fallbackValidation.pass) {
    console.warn('[PROMPTS] using deterministic fallback after validation failures:', fallbackValidation.failures.join('; '));
  }
  return selected.map((raw) => rawToAuditPrompt(raw, input)).filter((p): p is HumanAuditPrompt => p !== null);
}
