import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in environment variables');

const STANDALONE_COMPETITOR_MODEL = 'gpt-4o';
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export type PeerCompetitorType = 'direct' | 'indirect';
export type MarketTier =
  | 'local_smb'
  | 'regional_firm'
  | 'mid_market'
  | 'enterprise'
  | 'global_enterprise';

export interface AnalysisDataSource {
  type: 'llm_estimate';
  provider: 'OpenAI';
  model: string;
  generatedAt: string;
  disclaimer: string;
}

export interface PeerCompetitor {
  name: string;
  domain: string;
  type: PeerCompetitorType;
  marketTier: MarketTier;
  operatesInTargetLocation: boolean;
  marketPresence: string;
  locationEvidence: string;
  peerFitReason: string;
  scaleSimilarity: string;
  estimatedRevenue: string;
  estimatedHeadcount: string;
  estimatedCustomerRevenue: string;
  estimatedAverageProjectCost: string;
  estimatedKeywordCount: number;
  estimatedMonthlyTraffic: number | string;
  dataSource: 'LLM estimate';
  confidence: 'High' | 'Medium' | 'Low';
  keyStrengths: string[];
  weaknesses: string[];
  threatLevel: 'High' | 'Medium' | 'Low';
  recommendations: string[];
}

export interface StandaloneCompetitorAnalysisResult {
  competitors: PeerCompetitor[];
  marketInsights: {
    targetMarket: string;
    targetTier: MarketTier | string;
    totalPeerCompetitors: number;
    marketSummary: string;
    marketLeader: string | null;
    trends: string[];
    opportunities: string[];
  };
  strategicRecommendations: Array<{
    category: string;
    priority: 'High' | 'Medium' | 'Low';
    action: string;
    expectedImpact: string;
    timeline: string;
  }>;
  competitiveAnalysis: {
    analysisType: 'standalone_peer';
    targetPositioning: string;
    samePlayingFieldCriteria: string[];
    excludedMismatchExamples: string[];
    domainAdvantages: string[];
    domainWeaknesses: string[];
    competitiveGaps: string[];
    marketOpportunities: string[];
    threatMitigation: string[];
    dataSource: AnalysisDataSource;
  };
  competitorList: string;
  tokenUsage: number;
}

const MARKET_TIERS: MarketTier[] = [
  'local_smb',
  'regional_firm',
  'mid_market',
  'enterprise',
  'global_enterprise',
];

const ENTERPRISE_CONSULTING_GIANTS = [
  'mckinsey',
  'deloitte',
  'bcg',
  'boston consulting group',
  'bain',
  'accenture',
];

function cleanText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function cleanStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeThreatLevel(value: unknown): 'High' | 'Medium' | 'Low' {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'low') return 'Low';
  return 'Medium';
}

function normalizeConfidence(value: unknown): 'High' | 'Medium' | 'Low' {
  return normalizeThreatLevel(value);
}

function normalizeType(value: unknown): PeerCompetitorType {
  return cleanText(value).toLowerCase() === 'indirect' ? 'indirect' : 'direct';
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = cleanText(value).toLowerCase();
  return ['true', 'yes', 'active', 'operates', 'available'].includes(normalized);
}

function normalizeMarketTier(value: unknown): MarketTier {
  const normalized = cleanText(value).toLowerCase().replace(/[\s-]+/g, '_');
  return MARKET_TIERS.includes(normalized as MarketTier)
    ? normalized as MarketTier
    : 'mid_market';
}

function normalizePositiveNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }

  return 0;
}

function normalizeDomain(input: unknown): string {
  const raw = cleanText(input).replace(/^@/, '');
  if (!raw) return '';

  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  }
}

function extractJsonObject(content: string): any {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || content;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No valid JSON object found in AI response');
  }
  return JSON.parse(jsonMatch[0]);
}

function isEnterpriseConsultingGiant(competitor: PeerCompetitor): boolean {
  const haystack = `${competitor.name} ${competitor.domain}`.toLowerCase();
  return ENTERPRISE_CONSULTING_GIANTS.some((term) => haystack.includes(term));
}

function isEnterpriseTarget(targetTier: string): boolean {
  const normalized = targetTier.toLowerCase();
  return normalized.includes('enterprise') || normalized.includes('global');
}

function getLocationTokens(location: string): string[] {
  const normalized = location.toLowerCase();
  if (!normalized || normalized === 'global') return [];

  return normalized
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !['the', 'and', 'near', 'area', 'region', 'market'].includes(token));
}

function hasTargetLocationEvidence(competitor: PeerCompetitor, location: string): boolean {
  const locationTokens = getLocationTokens(location);
  if (locationTokens.length === 0) return true;

  if (!competitor.operatesInTargetLocation) return false;

  const evidence = `${competitor.marketPresence} ${competitor.locationEvidence}`.toLowerCase();
  if (/(not active|does not operate|not available|exited|discontinued|no longer operates)/i.test(evidence)) {
    return false;
  }

  return locationTokens.some((token) => evidence.includes(token));
}

function normalizeCompetitors(params: {
  value: unknown;
  targetTier: string;
  location: string;
  context: string;
  domain: string;
}): PeerCompetitor[] {
  const { value, targetTier, location, context, domain } = params;
  if (!Array.isArray(value)) return [];

  const competitors: PeerCompetitor[] = [];
  const seen = new Set<string>();
  const allowEnterpriseGiants = isEnterpriseTarget(targetTier);

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const name = cleanText(record.name);
    const domain = normalizeDomain(record.domain);
    if (!name || !domain) continue;

    const competitor: PeerCompetitor = {
      name,
      domain,
      type: normalizeType(record.type),
      marketTier: normalizeMarketTier(record.marketTier),
      operatesInTargetLocation: normalizeBoolean(record.operatesInTargetLocation),
      marketPresence: cleanText(
        record.marketPresence,
        `Active in ${location} or directly serving customers in this target market.`
      ),
      locationEvidence: cleanText(
        record.locationEvidence,
        `Evidence should show current operations or customer availability in ${location}.`
      ),
      peerFitReason: cleanText(
        record.peerFitReason,
        'Comparable business category, customer segment, geography, estimated revenue, headcount, customer revenue, and average project cost.'
      ),
      scaleSimilarity: cleanText(
        record.scaleSimilarity,
        'Similar company scale, buyer consideration set, and average engagement size.'
      ),
      estimatedRevenue: cleanText(record.estimatedRevenue, 'Comparable estimated revenue range'),
      estimatedHeadcount: cleanText(record.estimatedHeadcount, 'Comparable estimated headcount range'),
      estimatedCustomerRevenue: cleanText(record.estimatedCustomerRevenue, 'Comparable customer revenue segment'),
      estimatedAverageProjectCost: cleanText(record.estimatedAverageProjectCost, 'Comparable average project cost range'),
      estimatedKeywordCount: normalizePositiveNumber(record.estimatedKeywordCount),
      estimatedMonthlyTraffic: cleanText(record.estimatedMonthlyTraffic) || normalizePositiveNumber(record.estimatedMonthlyTraffic),
      dataSource: 'LLM estimate',
      confidence: normalizeConfidence(record.confidence),
      keyStrengths: cleanStringArray(record.keyStrengths, ['Relevant peer-market presence']),
      weaknesses: cleanStringArray(record.weaknesses, ['Limited verified public data']),
      threatLevel: normalizeThreatLevel(record.threatLevel),
      recommendations: cleanStringArray(record.recommendations, ['Monitor positioning and service pages']),
    };

    if (!allowEnterpriseGiants && isEnterpriseConsultingGiant(competitor)) {
      continue;
    }

    if (!hasTargetLocationEvidence(competitor, location)) {
      continue;
    }

    const key = competitor.domain || competitor.name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    competitors.push(competitor);

    if (competitors.length >= 10) break;
  }

  return competitors;
}

function normalizeRecommendations(value: unknown): StandaloneCompetitorAnalysisResult['strategicRecommendations'] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 8).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      category: cleanText(record.category, 'Competitive Positioning'),
      priority: normalizeThreatLevel(record.priority),
      action: cleanText(record.action, 'Strengthen positioning against same-tier peer competitors.'),
      expectedImpact: cleanText(record.expectedImpact, 'Improved differentiation and conversion quality.'),
      timeline: cleanText(record.timeline, '30-90 days'),
    };
  });
}

function buildPrompt(params: { domain: string; context: string; location: string }): string {
  return `You are a competitive intelligence analyst. Build a standalone peer competitor analysis for "${params.domain}" using ONLY the domain context and target location below.

Target location: ${params.location}

Domain context:
${params.context}

Critical peer-matching rules:
- Return EXACTLY 10 competitors. The UI requires 10 rows, so do not return fewer than 10.
- Do not stop at 3-5 obvious competitors. Expand to adjacent but still same-tier peers until there are exactly 10.
- Competitors must be in the same playing field: same business category, comparable offering, similar customer segment, relevant geography, and similar company scale/tier.
- Competitors must currently operate in, sell to, or directly serve the target location. Do not include companies that are famous globally but unavailable in the target market.
- For every competitor, set "operatesInTargetLocation" to true only when there is current active availability in the target location.
- The "marketPresence" and "locationEvidence" fields MUST explicitly mention the target location by name and explain why the company is active there.
- If a company does not currently operate in the target location, exclude it and replace it with another same-tier company that does.
- Only choose competitors similar to the target domain in estimated annual revenue, headcount, customer revenue segment, and average project cost or contract value.
- Do not choose a company if its estimated revenue, headcount, customer revenue segment, or average project cost is dramatically larger or smaller than the target.
- Include estimated organic keyword count and estimated monthly user/organic traffic for every competitor. Use realistic ranges or best-effort estimates when exact data is unavailable.
- Determine the target company's likely tier first: local_smb, regional_firm, mid_market, enterprise, or global_enterprise.
- Do NOT list enterprise/global giants for a small or regional company just because they are famous.
- Example: a small consultancy must not have McKinsey, Deloitte, BCG, Bain, or Accenture as competitors unless the target is also enterprise/global consulting tier.
- Prefer realistic peers a buyer would actually compare during vendor selection in the target location.
- If exact figures are unavailable, use clearly labeled estimates/ranges inferred from public positioning, client type, office footprint, case studies, pricing cues, and market presence.

Return ONLY valid JSON in this exact shape:
{
  "targetTier": "local_smb|regional_firm|mid_market|enterprise|global_enterprise",
  "competitors": [
    {
      "name": "Company Name",
      "domain": "competitor.com",
      "type": "direct|indirect",
      "marketTier": "local_smb|regional_firm|mid_market|enterprise|global_enterprise",
      "operatesInTargetLocation": true,
      "marketPresence": "Evidence/rationale that this competitor actively operates in the target location",
      "locationEvidence": "Specific current availability signal for the target location",
      "peerFitReason": "Why this is a realistic same-playing-field competitor",
      "scaleSimilarity": "How estimated revenue/headcount/customer revenue/project cost appear comparable",
      "estimatedRevenue": "Estimated annual revenue range, e.g. $1M-$5M",
      "estimatedHeadcount": "Estimated employee/headcount range, e.g. 10-50",
      "estimatedCustomerRevenue": "Typical customer revenue segment, e.g. SMBs under $10M revenue",
      "estimatedAverageProjectCost": "Estimated average project/contract cost range, e.g. $10k-$50k",
      "estimatedKeywordCount": 12000,
      "estimatedMonthlyTraffic": 250000,
      "confidence": "High|Medium|Low",
      "keyStrengths": ["strength 1", "strength 2", "strength 3"],
      "weaknesses": ["weakness 1", "weakness 2"],
      "threatLevel": "High|Medium|Low",
      "recommendations": ["recommendation 1", "recommendation 2"]
    }
  ],
  "marketInsights": {
    "marketSummary": "Short location-aware peer market summary",
    "marketLeader": "Peer market leader or null",
    "trends": ["trend 1", "trend 2", "trend 3"],
    "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"]
  },
  "strategicRecommendations": [
    {
      "category": "SEO|Content|Positioning|Sales|Product|Local Market",
      "priority": "High|Medium|Low",
      "action": "Specific action",
      "expectedImpact": "Expected impact",
      "timeline": "Timeframe"
    }
  ],
  "competitiveAnalysis": {
    "targetPositioning": "Where the target sits among realistic peers",
    "domainAdvantages": ["advantage 1", "advantage 2"],
    "domainWeaknesses": ["weakness 1", "weakness 2"],
    "competitiveGaps": ["gap 1", "gap 2"],
    "marketOpportunities": ["opportunity 1", "opportunity 2"],
    "threatMitigation": ["strategy 1", "strategy 2"]
  }
}`;
}

export async function analyzeStandalonePeerCompetitors(params: {
  domain: string;
  context: string;
  location?: string | null;
}): Promise<StandaloneCompetitorAnalysisResult> {
  const location = cleanText(params.location, 'Global') || 'Global';
  const generatedAt = new Date().toISOString();
  const response = await openai.chat.completions.create({
    model: STANDALONE_COMPETITOR_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You return strict JSON for realistic same-tier competitor analysis. Never include competitors with obvious scale mismatch.',
      },
      {
        role: 'user',
        content: buildPrompt({
          domain: params.domain,
          context: params.context,
          location,
        }),
      },
    ],
    max_tokens: 5000,
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI service');
  }

  const parsed = extractJsonObject(content);
  const targetTier = cleanText(parsed.targetTier, 'mid_market');
  const competitors = normalizeCompetitors({
    value: parsed.competitors,
    targetTier,
    location,
    context: params.context,
    domain: params.domain,
  });

  if (competitors.length < 10) {
    throw new Error(`AI response included ${competitors.length} valid same-tier competitors; exactly 10 are required`);
  }

  const marketInsightsInput = parsed.marketInsights && typeof parsed.marketInsights === 'object'
    ? parsed.marketInsights as Record<string, unknown>
    : {};
  const competitiveAnalysisInput = parsed.competitiveAnalysis && typeof parsed.competitiveAnalysis === 'object'
    ? parsed.competitiveAnalysis as Record<string, unknown>
    : {};

  return {
    competitors,
    marketInsights: {
      targetMarket: location,
      targetTier,
      totalPeerCompetitors: competitors.length,
      marketSummary: cleanText(marketInsightsInput.marketSummary, `Peer competitor analysis for ${params.domain} in ${location}.`),
      marketLeader: cleanText(marketInsightsInput.marketLeader) || null,
      trends: cleanStringArray(marketInsightsInput.trends),
      opportunities: cleanStringArray(marketInsightsInput.opportunities),
    },
    strategicRecommendations: normalizeRecommendations(parsed.strategicRecommendations),
    competitiveAnalysis: {
      analysisType: 'standalone_peer',
      targetPositioning: cleanText(competitiveAnalysisInput.targetPositioning, 'Positioned against realistic same-tier competitors.'),
      samePlayingFieldCriteria: [
        'Same business category and offering',
        'Similar target customer segment',
        'Active in the target geography with explicit location evidence',
        'Comparable company scale/tier',
        'Comparable estimated revenue, headcount, customer revenue, and average project cost',
        'Comparable brand maturity and market authority',
      ],
      excludedMismatchExamples: [
        'Small consultancies should not be compared with McKinsey, Deloitte, BCG, Bain, or Accenture unless they operate at enterprise/global tier.',
      ],
      domainAdvantages: cleanStringArray(competitiveAnalysisInput.domainAdvantages),
      domainWeaknesses: cleanStringArray(competitiveAnalysisInput.domainWeaknesses),
      competitiveGaps: cleanStringArray(competitiveAnalysisInput.competitiveGaps),
      marketOpportunities: cleanStringArray(competitiveAnalysisInput.marketOpportunities),
      threatMitigation: cleanStringArray(competitiveAnalysisInput.threatMitigation),
      dataSource: {
        type: 'llm_estimate',
        provider: 'OpenAI',
        model: STANDALONE_COMPETITOR_MODEL,
        generatedAt,
        disclaimer: 'Competitor, keyword, traffic, revenue, headcount, customer-revenue, and project-cost values are AI-generated estimates based on domain context and location. Validate with SEO, traffic, and company-data tools before business decisions.',
      },
    },
    competitorList: competitors.map((competitor) => `${competitor.name} (${competitor.domain})`).join('\n'),
    tokenUsage: response.usage?.total_tokens || 0,
  };
}
