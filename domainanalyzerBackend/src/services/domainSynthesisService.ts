import OpenAI from 'openai';
import type { CrawlPolicy, CrawlQualitySummary, DomainContextClaim, DomainContextJson, PageSnapshot } from './domainContextTypes';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY not set in environment variables');
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function trimText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function sanitizeEvidencePages(pages: string[], fallbackPages: string[]): string[] {
  const sanitized = Array.from(new Set((pages || []).filter(Boolean)));
  return sanitized.length > 0 ? sanitized : fallbackPages.slice(0, 2);
}

function buildClaim(text: string, evidencePages: string[], confidence: number): DomainContextClaim {
  return {
    text: text || 'Signal not confidently identified.',
    evidencePages,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
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
  const primaryPages = evidencePages.map((page) => page.url);
  const homepage = pages[0];
  const summary = homepage?.metaDescription || homepage?.title || `Public website for ${domain}`;
  const offerings = pages
    .filter((page) => /services|solutions|products|pricing/i.test(page.url) || /service|solution|product/i.test(page.mainText))
    .slice(0, 3)
    .map((page) => buildClaim(page.title || 'Website offering', [page.url], 0.55));

  return {
    companySummary: buildClaim(summary, primaryPages.slice(0, 2), 0.55),
    offerings: offerings.length > 0 ? offerings : [buildClaim('Offerings need manual review from evidence pages.', primaryPages.slice(0, 2), 0.35)],
    audience: [buildClaim('Audience requires manual confirmation from website messaging.', primaryPages.slice(0, 2), 0.3)],
    geoScope: buildClaim(location || 'No explicit geographic scope detected.', primaryPages.slice(0, 2), location ? 0.5 : 0.25),
    brandEntities: pages
      .slice(0, 3)
      .filter((page) => !!page.title)
      .map((page) => ({
        name: page.title,
        type: 'page_title',
        evidencePages: [page.url],
      })),
    evidencePages,
    missingSignals: ['Structured synthesis fallback used'],
    overallConfidence: 0.4,
  };
}

function buildLegacyContext(contextJson: DomainContextJson): string {
  const sections = [
    `Company Summary: ${contextJson.companySummary.text}`,
    `Evidence: ${contextJson.companySummary.evidencePages.join(', ')}`,
    '',
    `Offerings: ${contextJson.offerings.map((item) => item.text).join('; ') || 'Not confidently identified.'}`,
    `Audience: ${contextJson.audience.map((item) => item.text).join('; ') || 'Not confidently identified.'}`,
    `Geo Scope: ${contextJson.geoScope.text}`,
    `Brand Entities: ${contextJson.brandEntities.map((entity) => entity.name).join(', ') || 'None identified.'}`,
    `Missing Signals: ${contextJson.missingSignals.join(', ') || 'None'}`,
    `Overall Confidence: ${Math.round(contextJson.overallConfidence * 100)}%`,
  ];

  return sections.join('\n').trim();
}

function extractJsonObject(content: string): string | null {
  const match = content.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

export async function synthesizeDomainContext(params: {
  domain: string;
  location?: string;
  pages: PageSnapshot[];
  policy: CrawlPolicy;
  quality: CrawlQualitySummary;
}): Promise<{ contextJson: DomainContextJson; contextText: string; tokenUsage: number }> {
  const { domain, location, pages, policy, quality } = params;
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
      mainText: trimText(page.mainText, 1800),
    }));

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 2200,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at extracting company context from website evidence. Return only JSON. Never invent unsupported facts. Every claim must cite source page URLs from the provided evidence.',
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              task: 'Synthesize domain context from evidence pages.',
              domain,
              location: location || null,
              crawlPolicy: {
                robotsFetched: policy.robotsFetched,
                sitemapCount: policy.sitemaps.length,
                maxPages: policy.maxPages,
              },
              quality,
              pages: curatedPages,
              outputSchema: {
                companySummary: { text: 'string', evidencePages: ['url'], confidence: 0.0 },
                offerings: [{ text: 'string', evidencePages: ['url'], confidence: 0.0 }],
                audience: [{ text: 'string', evidencePages: ['url'], confidence: 0.0 }],
                geoScope: { text: 'string', evidencePages: ['url'], confidence: 0.0 },
                brandEntities: [{ name: 'string', type: 'string', evidencePages: ['url'] }],
                evidencePages: [{ url: 'string', title: 'string', reasons: ['string'] }],
                missingSignals: ['string'],
                overallConfidence: 0.0,
              },
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
        parsed.companySummary?.text || 'Company summary was not confidently identified.',
        sanitizeEvidencePages(parsed.companySummary?.evidencePages || [], fallbackPages),
        parsed.companySummary?.confidence ?? 0.4
      ),
      offerings: (parsed.offerings || []).map((item) =>
        buildClaim(item.text, sanitizeEvidencePages(item.evidencePages || [], fallbackPages), item.confidence ?? 0.4)
      ),
      audience: (parsed.audience || []).map((item) =>
        buildClaim(item.text, sanitizeEvidencePages(item.evidencePages || [], fallbackPages), item.confidence ?? 0.4)
      ),
      geoScope: buildClaim(
        parsed.geoScope?.text || (location ? `Likely serving ${location}` : 'Geographic scope not explicit.'),
        sanitizeEvidencePages(parsed.geoScope?.evidencePages || [], fallbackPages),
        parsed.geoScope?.confidence ?? 0.4
      ),
      brandEntities: (parsed.brandEntities || []).map((entity) => ({
        name: entity.name,
        type: entity.type,
        evidencePages: sanitizeEvidencePages(entity.evidencePages || [], fallbackPages),
      })),
      evidencePages:
        parsed.evidencePages?.map((page) => ({
          url: page.url,
          title: page.title || page.url,
          reasons: Array.isArray(page.reasons) ? page.reasons : ['Used as source evidence'],
        })) || [],
      missingSignals: Array.isArray(parsed.missingSignals) ? parsed.missingSignals : [],
      overallConfidence: Math.max(0, Math.min(1, parsed.overallConfidence ?? 0.5)),
    };

    return {
      contextJson,
      contextText: buildLegacyContext(contextJson),
      tokenUsage: response.usage?.total_tokens || 0,
    };
  } catch (error) {
    const fallback = buildFallbackContext({ pages: curatedPages.length > 0 ? pages : [], domain, location });
    return {
      contextJson: fallback,
      contextText: buildLegacyContext(fallback),
      tokenUsage: 0,
    };
  }
}
