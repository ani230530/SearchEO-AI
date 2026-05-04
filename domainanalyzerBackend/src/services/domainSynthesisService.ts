import OpenAI from 'openai';
import type { CrawlPolicy, CrawlQualitySummary, DomainContextClaim, DomainContextJson, DomainContextEntity, PageSnapshot } from './domainContextTypes';
import { extractSchemaOrgEntities, type ExtractedSchemaOrg } from './pageExtractionService';

// Use OpenRouter if available (same key as aiQueryService), else direct OpenAI
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENROUTER_API_KEY && !OPENAI_API_KEY) {
  throw new Error('Either OPENROUTER_API_KEY or OPENAI_API_KEY must be set');
}

const synthesisClient = OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    })
  : new OpenAI({ apiKey: OPENAI_API_KEY! });

// Use gpt-4o-mini for extraction (16x cheaper, nearly same quality for structured data)
const SYNTHESIS_MODEL = OPENROUTER_API_KEY ? 'openai/gpt-4o-mini' : 'gpt-4o-mini';

function trimText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function sanitizeEvidencePages(pages: string[] | undefined, fallbackPages: string[]): string[] {
  const sanitized = Array.from(new Set((pages || []).filter(Boolean)));
  return sanitized.length > 0 ? sanitized : fallbackPages.slice(0, 2);
}

function buildClaim(text: string, evidencePages: string[], confidence: number): DomainContextClaim {
  return {
    text: text || 'Not clearly established from website evidence.',
    evidencePages,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

function buildCompactSummary(contextJson: DomainContextJson): string {
  return [
    `Company Summary: ${contextJson.companySummary.text}`,
    `Evidence: ${contextJson.companySummary.evidencePages.join(', ')}`,
    '',
    `Offerings: ${contextJson.offerings.map((item) => item.text).join('; ') || 'Not clearly established from website evidence.'}`,
    `Audience: ${contextJson.audience.map((item) => item.text).join('; ') || 'Not clearly established from website evidence.'}`,
    `Geo Scope: ${contextJson.geoScope.text}`,
    `Brand Entities: ${contextJson.brandEntities.map((entity) => entity.name).join(', ') || 'None identified.'}`,
    `Missing Signals: ${contextJson.missingSignals.join(', ') || 'None'}`,
    `Overall Confidence: ${Math.round(contextJson.overallConfidence * 100)}%`,
  ].join('\n').trim();
}

function buildRichAnalysis(contextJson: DomainContextJson): string {
  return [
    '### Comprehensive Domain Analysis',
    '',
    '#### 1. BUSINESS MODEL ANALYSIS',
    '',
    contextJson.businessModelAnalysis,
    '',
    '#### 2. TARGET AUDIENCE PROFILING',
    '',
    contextJson.targetAudienceProfiling,
    '',
    '#### 3. VALUE PROPOSITION & POSITIONING',
    '',
    contextJson.valuePropositionAndPositioning,
    '',
    '#### 4. SEO & CONTENT STRATEGY INSIGHTS',
    '',
    contextJson.seoAndContentStrategyInsights,
    '',
    '#### 5. COMPETITIVE INTELLIGENCE',
    '',
    contextJson.competitiveIntelligence,
    '',
    '#### 6. MARKET DYNAMICS',
    '',
    contextJson.marketDynamics,
    '',
    '#### 7. LOCATION-BASED SEO ANALYSIS',
    '',
    contextJson.locationBasedSeoAnalysis,
    '',
    '#### 8. SEO OPPORTUNITY ANALYSIS',
    '',
    contextJson.seoOpportunityAnalysis,
  ].join('\n').trim();
}

function extractJsonObject(content: string): string | null {
  const match = content.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function buildFallbackAnalysisSection(label: string): string {
  return `- **${label}**: Not clearly established from website evidence.`;
}

function buildFallbackContext(params: {
  pages: PageSnapshot[];
  domain: string;
  location?: string;
}): DomainContextJson {
  const { pages, domain, location } = params;
  const evidencePages = pages.slice(0, 5).map((page) => ({
    url: page.url,
    title: page.title || page.url,
    reasons: [
      page.contentScore >= 70 ? 'High-content-confidence page' : 'Useful supporting page',
      page.schemaCoverage > 0 ? 'Contains structured data' : 'Contains extractable main content',
    ],
  }));
  const fallbackPages = evidencePages.map((page) => page.url);
  const homepage = pages[0];
  const companySummary = buildClaim(
    homepage?.metaDescription || homepage?.title || `Public website for ${domain}`,
    fallbackPages.slice(0, 2),
    0.5
  );
  const offerings = pages
    .filter((page) => /services|solutions|products|pricing/i.test(page.url) || /service|solution|product/i.test(page.mainText))
    .slice(0, 3)
    .map((page) => buildClaim(page.title || 'Website offering', [page.url], 0.5));
  const audience = [buildClaim('Audience is not clearly established from website evidence.', fallbackPages.slice(0, 2), 0.25)];
  const geoScope = buildClaim(location || 'Geographic scope is not clearly established from website evidence.', fallbackPages.slice(0, 2), location ? 0.5 : 0.25);
  const brandEntities: DomainContextEntity[] = pages
    .slice(0, 3)
    .filter((page) => !!page.title)
    .map((page) => ({
      name: page.title,
      type: 'page_title',
      evidencePages: [page.url],
    }));

  const contextJson: DomainContextJson = {
    companySummary,
    offerings: offerings.length > 0 ? offerings : [buildClaim('Offerings are not clearly established from website evidence.', fallbackPages.slice(0, 2), 0.3)],
    audience,
    geoScope,
    brandEntities,
    businessModelAnalysis: [
      buildFallbackAnalysisSection('Core Business'),
      buildFallbackAnalysisSection('Industry Classification'),
      buildFallbackAnalysisSection('Company Profile'),
      buildFallbackAnalysisSection('Geographic Scope'),
    ].join('\n'),
    targetAudienceProfiling: [
      buildFallbackAnalysisSection('Primary Audience'),
      buildFallbackAnalysisSection('Secondary Audiences'),
      buildFallbackAnalysisSection('Customer Journey'),
      buildFallbackAnalysisSection('Pain Points'),
      buildFallbackAnalysisSection('Decision Factors'),
    ].join('\n'),
    valuePropositionAndPositioning: [
      buildFallbackAnalysisSection('Unique Selling Propositions'),
      buildFallbackAnalysisSection('Brand Positioning'),
      buildFallbackAnalysisSection('Key Benefits'),
      buildFallbackAnalysisSection('Solution Categories'),
      buildFallbackAnalysisSection('Market Positioning'),
    ].join('\n'),
    seoAndContentStrategyInsights: [
      buildFallbackAnalysisSection('Primary Keywords'),
      buildFallbackAnalysisSection('Content Themes'),
      buildFallbackAnalysisSection('Expertise Areas'),
      buildFallbackAnalysisSection('Authority Building'),
      buildFallbackAnalysisSection('Content Gaps'),
    ].join('\n'),
    competitiveIntelligence: [
      buildFallbackAnalysisSection('Direct Competitors'),
      buildFallbackAnalysisSection('Indirect Competitors'),
      buildFallbackAnalysisSection('Market Leaders'),
      buildFallbackAnalysisSection('Competitive Advantages'),
      buildFallbackAnalysisSection('Vulnerability Areas'),
    ].join('\n'),
    marketDynamics: [
      buildFallbackAnalysisSection('Market Size'),
      buildFallbackAnalysisSection('Industry Trends'),
      buildFallbackAnalysisSection('Seasonal Patterns'),
      buildFallbackAnalysisSection('Geographic Considerations'),
    ].join('\n'),
    locationBasedSeoAnalysis: [
      buildFallbackAnalysisSection('Local Market Opportunities'),
      buildFallbackAnalysisSection('Cultural Considerations'),
      buildFallbackAnalysisSection('Location-Specific Keywords'),
      buildFallbackAnalysisSection('Local Search Behavior'),
      buildFallbackAnalysisSection('Competitive Landscape'),
      buildFallbackAnalysisSection('Local SEO Strategy'),
    ].join('\n'),
    seoOpportunityAnalysis: [
      buildFallbackAnalysisSection('Keyword Opportunities'),
      buildFallbackAnalysisSection('Content Opportunities'),
      buildFallbackAnalysisSection('Competitive Gaps'),
      buildFallbackAnalysisSection('Long-tail Opportunities'),
      buildFallbackAnalysisSection('Local SEO'),
    ].join('\n'),
    richAnalysis: '',
    summaryContext: '',
    evidencePages,
    missingSignals: ['Structured synthesis fallback used'],
    overallConfidence: 0.35,
  };

  contextJson.summaryContext = buildCompactSummary(contextJson);
  contextJson.richAnalysis = buildRichAnalysis(contextJson);
  return contextJson;
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export async function synthesizeDomainContext(params: {
  domain: string;
  location?: string;
  pages: PageSnapshot[];
  policy: CrawlPolicy;
  quality: CrawlQualitySummary;
}): Promise<{ contextJson: DomainContextJson; contextText: string; summaryContext: string; tokenUsage: number }> {
  const { domain, location, pages, policy, quality } = params;
  // Pre-extract structured data from JSON-LD across all pages (deterministic, free)
  const allJsonLd = pages.flatMap((p) => p.jsonLd || []);
  const schemaOrgData = extractSchemaOrgEntities(allJsonLd);

  const curatedPages = [...pages]
    .sort((a, b) => b.contentScore - a.contentScore)
    .slice(0, 6)
    .map((page) => ({
      url: page.url,
      title: page.title,
      metaDescription: page.metaDescription,
      headings: page.headings.slice(0, 4),
      schemaCoverage: page.schemaCoverage,
      contentScore: page.contentScore,
      mainText: trimText(page.mainText, 2200),
    }));

  try {
    const response = await synthesisClient.chat.completions.create({
      model: SYNTHESIS_MODEL,
      temperature: 0.2,
      max_tokens: 3200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are an expert business intelligence analyst and SEO strategist.',
            'Analyze the provided website evidence and formulate a comprehensive domain context.',
            'Return only JSON.',
            'Extract the best possible insights from the provided text. Make reasonable analytical inferences even if evidence is partial.',
            'NEVER say "not clearly established" if you can deduce reasonable details from the company summary or offerings.',
            'Each structured claim must cite evidence page URLs from the provided pages.',
            'For the narrative section fields, use markdown bullet lists with exact bold labels matching the requested field names.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              task: 'Produce structured domain context plus a rich 8-section business analysis grounded in page evidence.',
              domain,
              location: location || null,
              // Pre-extracted structured data from JSON-LD (use this as ground truth when available)
              structuredData: {
                organizationName: schemaOrgData.organizationName || null,
                organizationDescription: schemaOrgData.organizationDescription || null,
                address: schemaOrgData.address || null,
                city: schemaOrgData.city || null,
                country: schemaOrgData.country || null,
                products: schemaOrgData.products.length > 0 ? schemaOrgData.products : null,
                services: schemaOrgData.services.length > 0 ? schemaOrgData.services : null,
                socialProfiles: schemaOrgData.socialProfiles.length > 0 ? schemaOrgData.socialProfiles.slice(0, 5) : null,
                priceRange: schemaOrgData.priceRange || null,
                foundingDate: schemaOrgData.foundingDate || null,
                numberOfEmployees: schemaOrgData.numberOfEmployees || null,
              },
              pages: curatedPages,
              outputSchema: {
                companySummary: { text: 'string', evidencePages: ['url'], confidence: 0.0 },
                offerings: [{ text: 'string', evidencePages: ['url'], confidence: 0.0 }],
                audience: [{ text: 'string', evidencePages: ['url'], confidence: 0.0 }],
                geoScope: { text: 'string', evidencePages: ['url'], confidence: 0.0 },
                brandEntities: [{ name: 'string', type: 'string', evidencePages: ['url'] }],
                businessModelAnalysis: [
                  '- **Core Business**: ...',
                  '- **Industry Classification**: ...',
                  '- **Company Profile**: ...',
                  '- **Geographic Scope**: ...',
                ].join('\\n'),
                targetAudienceProfiling: [
                  '- **Primary Audience**: ...',
                  '- **Secondary Audiences**: ...',
                  '- **Customer Journey**: ...',
                  '- **Pain Points**: ...',
                  '- **Decision Factors**: ...',
                ].join('\\n'),
                valuePropositionAndPositioning: [
                  '- **Unique Selling Propositions**: ...',
                  '- **Brand Positioning**: ...',
                  '- **Key Benefits**: ...',
                  '- **Solution Categories**: ...',
                  '- **Market Positioning**: ...',
                ].join('\\n'),
                seoAndContentStrategyInsights: [
                  '- **Primary Keywords**: ...',
                  '- **Content Themes**: ...',
                  '- **Expertise Areas**: ...',
                  '- **Authority Building**: ...',
                  '- **Content Gaps**: ...',
                ].join('\\n'),
                competitiveIntelligence: [
                  '- **Direct Competitors**: ...',
                  '- **Indirect Competitors**: ...',
                  '- **Market Leaders**: ...',
                  '- **Competitive Advantages**: ...',
                  '- **Vulnerability Areas**: ...',
                ].join('\\n'),
                marketDynamics: [
                  '- **Market Size**: ...',
                  '- **Industry Trends**: ...',
                  '- **Seasonal Patterns**: ...',
                  '- **Geographic Considerations**: ...',
                ].join('\\n'),
                locationBasedSeoAnalysis: [
                  '- **Local Market Opportunities**: ...',
                  '- **Cultural Considerations**: ...',
                  '- **Location-Specific Keywords**: ...',
                  '- **Local Search Behavior**: ...',
                  '- **Competitive Landscape**: ...',
                  '- **Local SEO Strategy**: ...',
                ].join('\\n'),
                seoOpportunityAnalysis: [
                  '- **Keyword Opportunities**: ...',
                  '- **Content Opportunities**: ...',
                  '- **Competitive Gaps**: ...',
                  '- **Long-tail Opportunities**: ...',
                  '- **Local SEO**: ...',
                ].join('\\n'),
                evidencePages: [{ url: 'string', title: 'string', reasons: ['string'] }],
                missingSignals: ['string'],
                overallConfidence: 0.0,
              },
              formattingRequirements: [
                'Use the exact field labels shown in the schema examples.',
                'Each section must be a markdown bullet list.',
                'Each bullet must start with "- **Label**: "',
                'Be detailed, highly analytical, and make reasonable inferences. Populate every single field based on the context available.',
              ],
            },
            null,
            2
          ),
        },
      ],
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonPayload = extractJsonObject(content);

    if (!jsonPayload) {
      throw new Error('No JSON returned from context synthesis.');
    }

    const parsed = JSON.parse(jsonPayload) as Partial<DomainContextJson>;
    const fallbackPages = curatedPages.map((page) => page.url);

    const contextJson: DomainContextJson = {
      companySummary: buildClaim(
        parsed.companySummary?.text || 'Company summary is not clearly established from website evidence.',
        sanitizeEvidencePages(parsed.companySummary?.evidencePages, fallbackPages),
        parsed.companySummary?.confidence ?? 0.4
      ),
      offerings: (parsed.offerings || []).map((item) =>
        buildClaim(item.text, sanitizeEvidencePages(item.evidencePages, fallbackPages), item.confidence ?? 0.4)
      ),
      audience: (parsed.audience || []).map((item) =>
        buildClaim(item.text, sanitizeEvidencePages(item.evidencePages, fallbackPages), item.confidence ?? 0.4)
      ),
      geoScope: buildClaim(
        parsed.geoScope?.text || (location ? `Likely serving ${location}` : 'Geographic scope is not clearly established from website evidence.'),
        sanitizeEvidencePages(parsed.geoScope?.evidencePages, fallbackPages),
        parsed.geoScope?.confidence ?? 0.4
      ),
      brandEntities: (parsed.brandEntities || []).map((entity) => ({
        name: entity.name,
        type: entity.type,
        evidencePages: sanitizeEvidencePages(entity.evidencePages, fallbackPages),
      })),
      businessModelAnalysis: normalizeString(parsed.businessModelAnalysis, buildFallbackAnalysisSection('Business Model Analysis')),
      targetAudienceProfiling: normalizeString(parsed.targetAudienceProfiling, buildFallbackAnalysisSection('Target Audience Profiling')),
      valuePropositionAndPositioning: normalizeString(parsed.valuePropositionAndPositioning, buildFallbackAnalysisSection('Value Proposition & Positioning')),
      seoAndContentStrategyInsights: normalizeString(parsed.seoAndContentStrategyInsights, buildFallbackAnalysisSection('SEO & Content Strategy Insights')),
      competitiveIntelligence: normalizeString(parsed.competitiveIntelligence, buildFallbackAnalysisSection('Competitive Intelligence')),
      marketDynamics: normalizeString(parsed.marketDynamics, buildFallbackAnalysisSection('Market Dynamics')),
      locationBasedSeoAnalysis: normalizeString(parsed.locationBasedSeoAnalysis, buildFallbackAnalysisSection('Location-Based SEO Analysis')),
      seoOpportunityAnalysis: normalizeString(parsed.seoOpportunityAnalysis, buildFallbackAnalysisSection('SEO Opportunity Analysis')),
      richAnalysis: '',
      summaryContext: '',
      evidencePages:
        parsed.evidencePages?.map((page) => ({
          url: page.url,
          title: page.title || page.url,
          reasons: Array.isArray(page.reasons) ? page.reasons : ['Used as source evidence'],
        })) || [],
      missingSignals: Array.isArray(parsed.missingSignals) ? parsed.missingSignals : [],
      overallConfidence: Math.max(0, Math.min(1, parsed.overallConfidence ?? 0.5)),
    };

    contextJson.summaryContext = buildCompactSummary(contextJson);
    contextJson.richAnalysis = buildRichAnalysis(contextJson);

    return {
      contextJson,
      contextText: contextJson.richAnalysis,
      summaryContext: contextJson.summaryContext,
      tokenUsage: response.usage?.total_tokens || 0,
    };
  } catch (error) {
    console.error('Synthesis failed:', error);
    const fallback = buildFallbackContext({ pages: curatedPages.length > 0 ? pages : [], domain, location });
    return {
      contextJson: fallback,
      contextText: fallback.richAnalysis,
      summaryContext: fallback.summaryContext,
      tokenUsage: 0,
    };
  }
}
