const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Prisma, PrismaClient } = require('../generated/prisma');

const SHEET_ID = process.env.PROMPT_CATALOG_SHEET_ID || '1n-WdvJDtwBy10SAaIkmBCkyQd5Nkp8q2NZ-yvxbOA2c';
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  const [headers = [], ...body] = rows;
  return body.map((row) => {
    const out = {};
    headers.forEach((header, index) => {
      out[header.trim()] = String(row[index] ?? '').trim();
    });
    return out;
  });
}

async function fetchSheet(sheetName) {
  const response = await fetch(`${BASE_URL}&sheet=${encodeURIComponent(sheetName)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sheetName}: HTTP ${response.status}`);
  }
  return rowsToObjects(parseCsv(await response.text()));
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAlnum(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '');
}

function hostBase(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = raw.startsWith('http') ? new URL(raw) : new URL(`https://${raw}`);
    return normalizeAlnum(url.hostname.replace(/^www\./, '').split('.')[0]);
  } catch {
    return normalizeAlnum(raw.replace(/^www\./, '').split('/')[0].split('.')[0]);
  }
}

function compactWords(value, maxWords, fallback) {
  const words = normalize(value).split(/\s+/).filter(Boolean);
  return (words.slice(0, maxWords).join(' ') || fallback).slice(0, 80);
}

function parseAliases(value) {
  return Array.from(new Set(
    String(value ?? '')
      .split(/[|,;]/)
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function parseDate(value, fallback = new Date()) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function parseQualityScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score : 0;
}

function buildCatalog(nicheRows, promptRows) {
  const nicheByName = new Map();
  const nicheIdMap = new Map();
  const duplicateNiches = [];

  for (const row of nicheRows) {
    if (!row.id || !row.canonicalName) continue;
    const key = normalize(row.canonicalName);
    const aliases = parseAliases(row.aliases);
    const createdAt = parseDate(row.createdAt);
    const updatedAt = parseDate(row.updatedAt, createdAt);
    const current = nicheByName.get(key);

    if (!current) {
      const niche = {
        id: row.id,
        canonicalName: row.canonicalName,
        aliases,
        description: row.description || null,
        createdAt,
        updatedAt,
      };
      nicheByName.set(key, niche);
      nicheIdMap.set(row.id, niche.id);
      continue;
    }

    duplicateNiches.push({
      duplicateId: row.id,
      canonicalId: current.id,
      canonicalName: current.canonicalName,
    });
    current.aliases = Array.from(new Set([...current.aliases, ...aliases]));
    if (!current.description && row.description) current.description = row.description;
    if (createdAt < current.createdAt) current.createdAt = createdAt;
    if (updatedAt > current.updatedAt) current.updatedAt = updatedAt;
    nicheIdMap.set(row.id, current.id);
  }

  const promptByNicheAndText = new Map();
  const prompts = [];
  const duplicatePrompts = [];
  const orphanPrompts = [];

  for (const row of promptRows) {
    if (!row.id || !row.nicheId || !row.prompt) continue;
    const nicheId = nicheIdMap.get(row.nicheId);
    if (!nicheId) {
      orphanPrompts.push({ id: row.id, nicheId: row.nicheId, prompt: row.prompt });
      continue;
    }

    const key = `${nicheId}:${normalize(row.prompt)}`;
    const prompt = {
      id: row.id,
      nicheId,
      prompt: row.prompt,
      intent: row.intent || 'informational',
      source: row.source || null,
      qualityScore: parseQualityScore(row.qualityScore),
      createdAt: parseDate(row.createdAt),
      lastSeenAt: row.lastSeenAt ? parseDate(row.lastSeenAt) : null,
    };

    const existingIndex = promptByNicheAndText.get(key);
    if (existingIndex == null) {
      promptByNicheAndText.set(key, prompts.length);
      prompts.push(prompt);
      continue;
    }

    const existing = prompts[existingIndex];
    duplicatePrompts.push({
      duplicateId: prompt.id,
      keptId: existing.id,
      nicheId,
      prompt: prompt.prompt,
    });
    if (prompt.qualityScore > existing.qualityScore) existing.qualityScore = prompt.qualityScore;
    if (prompt.lastSeenAt && (!existing.lastSeenAt || prompt.lastSeenAt > existing.lastSeenAt)) {
      existing.lastSeenAt = prompt.lastSeenAt;
    }
  }

  return {
    niches: Array.from(nicheByName.values()),
    prompts,
    duplicateNiches,
    duplicatePrompts,
    orphanPrompts,
  };
}

async function tableExists(prisma, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tableName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function syncCatalog(prisma, catalog) {
  if (!(await tableExists(prisma, 'PromptCatalogNiche'))) {
    throw new Error('PromptCatalogNiche table is missing. Run Prisma migrations first.');
  }

  return prisma.$transaction(async (tx) => {
    if (catalog.niches.length > 0) {
      const nicheValues = catalog.niches.map((niche) => Prisma.sql`
        (${niche.id}::uuid, ${niche.canonicalName}, ${JSON.stringify(niche.aliases)}::jsonb, ${niche.description}, ${niche.createdAt}, ${niche.updatedAt})
      `);
      await tx.$executeRaw`
        INSERT INTO "PromptCatalogNiche"
          ("id", "canonicalName", "aliases", "description", "createdAt", "updatedAt")
        VALUES ${Prisma.join(nicheValues)}
        ON CONFLICT ("id") DO UPDATE SET
          "canonicalName" = EXCLUDED."canonicalName",
          "aliases" = EXCLUDED."aliases",
          "description" = EXCLUDED."description",
          "updatedAt" = EXCLUDED."updatedAt"
      `;
    }

    if (catalog.prompts.length > 0) {
      const promptValues = catalog.prompts.map((prompt) => Prisma.sql`
        (${prompt.id}::uuid, ${prompt.nicheId}::uuid, ${prompt.prompt}, ${prompt.intent}, ${prompt.source}, ${prompt.qualityScore}, ${prompt.createdAt}, ${prompt.lastSeenAt})
      `);
      await tx.$executeRaw`
        INSERT INTO "PromptCatalogPrompt"
          ("id", "nicheId", "prompt", "intent", "source", "qualityScore", "createdAt", "lastSeenAt")
        VALUES ${Prisma.join(promptValues)}
        ON CONFLICT ("id") DO UPDATE SET
          "nicheId" = EXCLUDED."nicheId",
          "prompt" = EXCLUDED."prompt",
          "intent" = EXCLUDED."intent",
          "source" = EXCLUDED."source",
          "qualityScore" = EXCLUDED."qualityScore",
          "lastSeenAt" = EXCLUDED."lastSeenAt"
      `;
    }

    const counts = await tx.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM "PromptCatalogNiche") AS niches,
        (SELECT count(*)::int FROM "PromptCatalogPrompt") AS prompts
    `;
    return counts[0];
  }, { maxWait: 10000, timeout: 60000 });
}

function catalogIntentMetadata(sheetIntent) {
  const intent = normalize(sheetIntent);
  if (intent === 'informational') {
    return {
      intent: 'Informational',
      category: 'problem_statement',
      intentStage: 'awareness',
    };
  }
  if (intent === 'alternative') {
    return {
      intent: 'Commercial',
      category: 'alternatives_to_competitor',
      intentStage: 'consideration',
    };
  }
  if (intent === 'comparison') {
    return {
      intent: 'Informational',
      category: 'top_n_listicle',
      intentStage: 'consideration',
    };
  }
  return {
    intent: 'Commercial',
    category: 'unbranded_recommendation',
    intentStage: 'decision',
  };
}

function promptMentionsAlias(prompt, aliases) {
  const promptKey = normalizeAlnum(prompt);
  return aliases.some((alias) => {
    const aliasKey = normalizeAlnum(alias);
    return aliasKey.length >= 3 && promptKey.includes(aliasKey);
  });
}

function competitorMentionFromPrompt(prompt, aliases) {
  const withoutAliases = aliases.reduce((text, alias) => {
    const escaped = String(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`\\b${escaped}\\b`, 'ig'), ' ');
  }, prompt);
  const match = withoutAliases.match(/\b(?:alternatives? to|instead of|similar to|vs)\s+([a-z0-9][a-z0-9 .&+-]{1,60})/i);
  const raw = match?.[1]?.split(/\b(?:for|with|but|under|on|within|that|vs)\b/i)[0];
  const cleaned = raw ? compactWords(raw, 4, '') : '';
  return cleaned || null;
}

function keywordTermForCatalogPrompt(niche, prompt) {
  const base = compactWords(niche.canonicalName, 5, 'catalog prompts');
  const intent = normalize(prompt.intent);
  if (intent === 'alternative') return `${base} alternatives`.slice(0, 80);
  if (intent === 'comparison') return `${base} comparison`.slice(0, 80);
  if (intent === 'recommendation') return `${base} recommendations`.slice(0, 80);
  return base;
}

function domainMatchReason(domain, niche) {
  const aliases = Array.isArray(niche.aliases) ? niche.aliases : [];
  const candidates = [
    hostBase(domain.host),
    hostBase(domain.url),
    normalizeAlnum(domain.host),
    normalizeAlnum(domain.companyName),
  ].filter(Boolean);

  for (const alias of aliases) {
    const aliasKey = normalizeAlnum(alias);
    if (aliasKey.length < 3) continue;
    if (candidates.some((candidate) =>
      candidate === aliasKey ||
      (aliasKey.length >= 4 && candidate.includes(aliasKey)) ||
      (candidate.length >= 4 && aliasKey.includes(candidate))
    )) {
      return `auto:alias:${alias}`;
    }
  }

  if (normalize(domain.industry) && normalize(domain.industry) === normalize(niche.canonicalName)) {
    return 'auto:canonicalName';
  }

  return null;
}

async function syncDomainNicheMappings(prisma, catalog) {
  const domains = await prisma.domain.findMany({
    select: {
      id: true,
      host: true,
      url: true,
      profile: { select: { industry: true } },
      inferred: { select: { companyName: true } },
    },
  });

  const desired = [];
  for (const domain of domains) {
    const comparableDomain = {
      id: domain.id,
      host: domain.host,
      url: domain.url,
      industry: domain.profile?.industry ?? '',
      companyName: domain.inferred?.companyName ?? '',
    };
    for (const niche of catalog.niches) {
      const matchReason = domainMatchReason(comparableDomain, niche);
      if (matchReason) {
        desired.push({
          domainId: domain.id,
          nicheId: niche.id,
          matchReason,
        });
      }
    }
  }

  const desiredKeys = new Set(desired.map((mapping) => `${mapping.domainId}:${mapping.nicheId}`));
  const existingAuto = await prisma.domainPromptCatalogNiche.findMany({
    where: { matchReason: { startsWith: 'auto:' } },
    select: { domainId: true, nicheId: true },
  });

  for (const mapping of existingAuto) {
    const key = `${mapping.domainId}:${mapping.nicheId}`;
    if (desiredKeys.has(key)) continue;
    await prisma.domainPromptCatalogNiche.delete({
      where: { domainId_nicheId: { domainId: mapping.domainId, nicheId: mapping.nicheId } },
    });
  }

  for (const mapping of desired) {
    await prisma.domainPromptCatalogNiche.upsert({
      where: { domainId_nicheId: { domainId: mapping.domainId, nicheId: mapping.nicheId } },
      update: { matchReason: mapping.matchReason },
      create: mapping,
    });
  }

  return prisma.domainPromptCatalogNiche.findMany({
    select: { domainId: true, nicheId: true, matchReason: true },
    orderBy: [{ domainId: 'asc' }, { nicheId: 'asc' }],
  });
}

function promptPayloadFromCatalog(niche, catalogPrompt, keywordId) {
  const aliases = Array.isArray(niche.aliases) ? niche.aliases : [];
  const metadata = catalogIntentMetadata(catalogPrompt.intent);
  return {
    keywordId,
    text: catalogPrompt.prompt,
    intent: metadata.intent,
    source: 'ai',
    category: metadata.category,
    intentStage: metadata.intentStage,
    persona: null,
    useCase: null,
    constraint: null,
    isBranded: promptMentionsAlias(catalogPrompt.prompt, aliases),
    competitorMentioned: competitorMentionFromPrompt(catalogPrompt.prompt, aliases),
    catalogPromptId: catalogPrompt.id,
  };
}

function promptNeedsUpdate(existing, payload) {
  return (
    existing.keywordId !== payload.keywordId ||
    existing.text !== payload.text ||
    existing.intent !== payload.intent ||
    existing.source !== payload.source ||
    existing.category !== payload.category ||
    existing.intentStage !== payload.intentStage ||
    existing.persona !== payload.persona ||
    existing.useCase !== payload.useCase ||
    existing.constraint !== payload.constraint ||
    existing.isBranded !== payload.isBranded ||
    existing.competitorMentioned !== payload.competitorMentioned
  );
}

async function propagateCatalogPromptsToDomains(prisma, catalog) {
  const mappings = await syncDomainNicheMappings(prisma, catalog);
  const nichesById = new Map(catalog.niches.map((niche) => [niche.id, niche]));
  const promptsByNicheId = new Map();
  for (const prompt of catalog.prompts) {
    const arr = promptsByNicheId.get(prompt.nicheId) ?? [];
    arr.push(prompt);
    promptsByNicheId.set(prompt.nicheId, arr);
  }

  const mappingsByDomainId = new Map();
  for (const mapping of mappings) {
    const arr = mappingsByDomainId.get(mapping.domainId) ?? [];
    arr.push(mapping);
    mappingsByDomainId.set(mapping.domainId, arr);
  }

  const summary = {
    mappedDomains: mappingsByDomainId.size,
    mappedDomainNiches: mappings.length,
    promptsInserted: 0,
    promptsLinked: 0,
    promptsUpdated: 0,
    duplicateTextSkipped: 0,
  };

  for (const [domainId, domainMappings] of mappingsByDomainId) {
    const needed = [];
    for (const mapping of domainMappings) {
      const niche = nichesById.get(mapping.nicheId);
      if (!niche) continue;
      for (const prompt of promptsByNicheId.get(mapping.nicheId) ?? []) {
        needed.push({ niche, prompt });
      }
    }
    if (needed.length === 0) continue;

    const existingKeywords = await prisma.keyword.findMany({
      where: { domainId },
      select: { id: true, term: true, intent: true, source: true },
    });
    const keywordByTerm = new Map(existingKeywords.map((keyword) => [normalize(keyword.term), keyword]));

    const keywordTerms = new Map();
    for (const item of needed) {
      const term = keywordTermForCatalogPrompt(item.niche, item.prompt);
      const metadata = catalogIntentMetadata(item.prompt.intent);
      if (!keywordTerms.has(normalize(term))) keywordTerms.set(normalize(term), { term, intent: metadata.intent });
    }

    for (const { term, intent } of keywordTerms.values()) {
      const key = normalize(term);
      if (keywordByTerm.has(key)) continue;
      const created = await prisma.keyword.create({
        data: {
          domainId,
          term,
          intent,
          source: 'ai',
          isSelected: false,
        },
        select: { id: true, term: true, intent: true, source: true },
      });
      keywordByTerm.set(key, created);
    }

    const existingPrompts = await prisma.prompt.findMany({
      where: { domainId },
      select: {
        id: true,
        keywordId: true,
        text: true,
        intent: true,
        source: true,
        category: true,
        intentStage: true,
        persona: true,
        useCase: true,
        constraint: true,
        isBranded: true,
        competitorMentioned: true,
        catalogPromptId: true,
      },
    });
    const byCatalogPromptId = new Map();
    const byText = new Map();
    for (const prompt of existingPrompts) {
      if (prompt.catalogPromptId) byCatalogPromptId.set(prompt.catalogPromptId, prompt);
      const key = normalize(prompt.text);
      if (key && !byText.has(key)) byText.set(key, prompt);
    }

    const createRows = [];
    for (const item of needed) {
      const term = keywordTermForCatalogPrompt(item.niche, item.prompt);
      const keyword = keywordByTerm.get(normalize(term));
      if (!keyword) continue;
      const payload = promptPayloadFromCatalog(item.niche, item.prompt, keyword.id);
      const byCatalog = byCatalogPromptId.get(item.prompt.id);
      if (byCatalog) {
        if (promptNeedsUpdate(byCatalog, payload)) {
          await prisma.prompt.update({
            where: { id: byCatalog.id },
            data: payload,
          });
          summary.promptsUpdated += 1;
        }
        continue;
      }

      const textKey = normalize(item.prompt.prompt);
      const byExistingText = byText.get(textKey);
      if (byExistingText && !byExistingText.catalogPromptId) {
        await prisma.prompt.update({
          where: { id: byExistingText.id },
          data: payload,
        });
        byExistingText.catalogPromptId = item.prompt.id;
        byCatalogPromptId.set(item.prompt.id, byExistingText);
        summary.promptsLinked += 1;
        continue;
      }
      if (byExistingText) {
        summary.duplicateTextSkipped += 1;
        continue;
      }

      createRows.push({
        domainId,
        keywordId: payload.keywordId,
        text: payload.text,
        intent: payload.intent,
        source: payload.source,
        isSelected: false,
        category: payload.category,
        intentStage: payload.intentStage,
        persona: payload.persona,
        useCase: payload.useCase,
        constraint: payload.constraint,
        isBranded: payload.isBranded,
        competitorMentioned: payload.competitorMentioned,
        catalogPromptId: payload.catalogPromptId,
      });
      byText.set(textKey, { ...payload, id: -1 });
      byCatalogPromptId.set(item.prompt.id, { ...payload, id: -1 });
    }

    if (createRows.length > 0) {
      const result = await prisma.prompt.createMany({
        data: createRows,
        skipDuplicates: true,
      });
      summary.promptsInserted += result.count;
    }
  }

  return summary;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const skipDomainSync = process.argv.includes('--skip-domain-sync');
  const [nicheRows, promptRows] = await Promise.all([
    fetchSheet('niches'),
    fetchSheet('prompts'),
  ]);
  const catalog = buildCatalog(nicheRows, promptRows);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    sourceRows: {
      niches: nicheRows.length,
      prompts: promptRows.length,
    },
    upsertRows: {
      niches: catalog.niches.length,
      prompts: catalog.prompts.length,
    },
    duplicateNiches: catalog.duplicateNiches,
    duplicatePrompts: catalog.duplicatePrompts.length,
    orphanPrompts: catalog.orphanPrompts,
  }, null, 2));

  if (!apply) return;

  const prisma = new PrismaClient();
  try {
    const counts = await syncCatalog(prisma, catalog);
    const domainSync = skipDomainSync
      ? { skipped: true }
      : await propagateCatalogPromptsToDomains(prisma, catalog);
    console.log(JSON.stringify({ synced: counts, domainSync }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
