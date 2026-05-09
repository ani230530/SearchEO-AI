/**
 * End-to-end wizard runner — drives every endpoint the UI hits, in order,
 * for a single domain. Used to rigorously test the live system with real
 * data after every stack-wide change.
 *
 * Usage:  node scripts/e2e-wizard.cjs <url> [country] [state] [industry]
 *   e.g.  node scripts/e2e-wizard.cjs notion.so US California "Productivity SaaS"
 *
 * Side effects:
 *  - Creates (or reuses) a Domain row for the first user in the DB.
 *  - Writes a CrawlSnapshot, DomainProfile, DomainInferred, WizardState row.
 *  - Generates competitors, keywords, prompts (auto-selects all prompts).
 *  - Fires a real AI run (3 OpenRouter calls per prompt).
 *
 * Output: a structured trace to stdout — every step prints what it called,
 * how long it took, and a sample of what came back.
 */

const jwt = require('jsonwebtoken');
require('dotenv/config');
const { PrismaClient } = require('../generated/prisma');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3002';

(async () => {
  const url = process.argv[2];
  const country = process.argv[3] || 'United States';
  const state = process.argv[4] || '';
  const industry = process.argv[5] || '';

  if (!url) {
    console.error('usage: node scripts/e2e-wizard.cjs <url> [country] [state] [industry]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('No user in DB');
    process.exit(1);
  }
  const SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  const token = jwt.sign({ userId: user.id, email: user.email }, SECRET, { expiresIn: '1h' });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const TAG = `[${url}]`;
  const log = (label, data) => {
    if (typeof data === 'object') {
      console.log(`${TAG} ${label}`);
      console.log(JSON.stringify(data, null, 2).split('\n').map((l) => `  ${l}`).join('\n'));
    } else {
      console.log(`${TAG} ${label} ${data ?? ''}`);
    }
  };

  const tStart = Date.now();
  const phaseTimes = {};
  const time = async (name, fn) => {
    const t0 = Date.now();
    try {
      const out = await fn();
      phaseTimes[name] = Date.now() - t0;
      return out;
    } catch (e) {
      phaseTimes[name] = `${Date.now() - t0}ms (failed: ${e.message})`;
      throw e;
    }
  };

  // ── 1. Validate ──────────────────────────────────────────────────────────
  const validation = await time('1_validate', async () => {
    const res = await fetch(`${BASE}/api/wizard/validate`, {
      method: 'POST', headers: auth, body: JSON.stringify({ url }),
    });
    return res.json();
  });
  log('1_validate', validation);
  if (!validation.ok) {
    log('ABORT', `validate returned ok:false reason: ${validation.reason}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── 2. Crawl + profile (SSE) ─────────────────────────────────────────────
  let domainId = null;
  await time('2_crawl_sse', async () => {
    const res = await fetch(`${BASE}/api/wizard/domain`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        url,
        country: country || undefined,
        state: state || undefined,
        industry: industry || undefined,
        customSeeds: { keywords: [], prompts: [] },
      }),
    });
    if (!res.body) throw new Error('no SSE body');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const events = buf.split('\n\n');
      buf = events.pop() || '';
      for (const ev of events) {
        const dataLine = ev.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        const payload = dataLine.slice(6).trim();
        try {
          const obj = JSON.parse(payload);
          if (obj.type === 'domain_created' && typeof obj.domainId === 'number') {
            domainId = obj.domainId;
            log('2_crawl   domain_created', { domainId: obj.domainId });
          } else if (obj.type === 'progress') {
            log(`2_crawl   progress phase=${obj.phase} ${obj.progress}%`, obj.step ?? '');
          } else if (obj.type === 'complete') {
            log('2_crawl   complete', obj);
            return;
          } else if (obj.type === 'error') {
            throw new Error(obj.error || obj.details || 'crawl failed');
          }
        } catch (e) {
          if (e.message?.includes('failed')) throw e;
        }
      }
    }
  });
  if (!domainId) throw new Error('no domainId from crawl SSE');

  // Inspect the freshly written DomainInferred + CrawlSnapshot
  const inferred = await prisma.domainInferred.findUnique({ where: { domainId } });
  const crawl = await prisma.crawlSnapshot.findFirst({
    where: { domainId }, orderBy: { createdAt: 'desc' },
  });
  log('2_crawl   db_state', {
    pagesScanned: crawl?.pagesScanned,
    rawTextLen: crawl?.rawText?.length ?? 0,
    quality: crawl?.quality,
    inferred: {
      companyName: inferred?.companyName,
      companySize: inferred?.companySize,
      summaryLen: (inferred?.summary ?? '').length,
      products: inferred?.productsJson,
    },
  });

  // ── 3. Competitors ──────────────────────────────────────────────────────
  const compResp = await time('3_competitors', async () => {
    const res = await fetch(`${BASE}/api/wizard/domain/${domainId}/competitors`, {
      method: 'POST', headers: auth, body: '{}',
    });
    return res.json();
  });
  log('3_competitors stats', compResp.stats);
  log('3_competitors top5', (compResp.competitors || []).slice(0, 5).map((c) => ({
    host: c.competitorHost,
    rank: c.rank,
    threat: c.threatLevel,
    similarity: c.similarityScore,
    source: c.source,
    reasoning: (c.reasoning ?? '').slice(0, 100),
  })));

  // Auto-select top 4 competitors (mirrors what the UI defaults to)
  const competitorHosts = (compResp.competitors || []).slice(0, 4).map((c) => c.competitorHost);
  await fetch(`${BASE}/api/wizard/domain/${domainId}/competitors/select`, {
    method: 'POST', headers: auth, body: JSON.stringify({ hosts: competitorHosts }),
  });
  log('3_competitors selected', competitorHosts);

  // ── 4. Topics (6-category generator) ────────────────────────────────────
  const topicsResp = await time('4_topics', async () => {
    const res = await fetch(`${BASE}/api/wizard/domain/${domainId}/topics`, {
      method: 'POST', headers: auth, body: '{}',
    });
    return res.json();
  });
  const items = topicsResp.items || [];
  const keywords = items.filter((i) => i.type === 'keyword');
  const prompts = items.filter((i) => i.type === 'prompt');
  log('4_topics  enriched', topicsResp.enriched);
  log('4_topics  counts', {
    keywords: keywords.length,
    prompts: prompts.length,
    byCategory: prompts.reduce((acc, p) => {
      acc[p.category || 'unknown'] = (acc[p.category || 'unknown'] || 0) + 1;
      return acc;
    }, {}),
  });
  log('4_topics  prompt_quality_check', {
    avgWords: Math.round(prompts.reduce((s, p) => s + p.text.split(/\s+/).length, 0) / Math.max(1, prompts.length)),
    withPersona: prompts.filter((p) => p.persona).length,
    withUseCase: prompts.filter((p) => p.useCase).length,
    withConstraint: prompts.filter((p) => p.constraint).length,
    branded: prompts.filter((p) => p.isBranded).length,
    unbranded: prompts.filter((p) => !p.isBranded).length,
  });
  // 3 sample prompts — one per category if possible
  const samples = {};
  for (const p of prompts) if (!samples[p.category]) samples[p.category] = p;
  log('4_topics  samples', Object.fromEntries(
    Object.entries(samples).map(([cat, p]) => [cat, {
      text: p.text,
      persona: p.persona,
      useCase: p.useCase,
      competitor: p.competitorMentioned,
    }])
  ));

  // ── 5. Select all prompts → fire AI run ─────────────────────────────────
  const promptIds = prompts.slice(0, 6).map((p) => p.id); // cap at 6 to keep run cheap
  await fetch(`${BASE}/api/wizard/domain/${domainId}/select`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ keywordIds: [], promptIds }),
  });
  log('5_run     selected_prompts', promptIds.length);

  await time('5_run_sse', async () => {
    const res = await fetch(`${BASE}/api/wizard/domain/${domainId}/run`, {
      method: 'POST', headers: auth, body: '{}',
    });
    if (!res.body) throw new Error('no SSE body');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let lastEventName = '';
    let progressLogged = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const events = buf.split('\n\n');
      buf = events.pop() || '';
      for (const ev of events) {
        const lines = ev.split('\n');
        const eventName = lines.find((l) => l.startsWith('event: '))?.slice(7).trim();
        const dataLine = lines.find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        try {
          const obj = JSON.parse(dataLine.slice(6).trim());
          if (eventName === 'progress' && obj.message) {
            log('5_run     progress', obj.message);
          } else if (eventName === 'result') {
            // Throttle so we don't spam: log every 3rd result
            if ((++progressLogged) % 3 === 0 || progressLogged === promptIds.length * 3) {
              log(`5_run     result ${obj.completedQueries}/${obj.totalQueries}`,
                obj.currentResult ? `${obj.currentResult.model} presence=${obj.currentResult.presence} overall=${obj.currentResult.overall}` : '');
            }
          } else if (eventName === 'complete') {
            log('5_run     complete summary', {
              presenceRate: obj.summary?.presenceRate,
              avgOverall: obj.summary?.avgOverall,
              avgSentiment: obj.summary?.avgSentiment,
              competitorsMentioned: (obj.summary?.competitors || []).length,
              topCitedDomains: (obj.summary?.topCitedDomains || []).slice(0, 5).map((d) => `${d.host}(${d.count})`),
              perModel: obj.summary?.perModel,
            });
            return;
          } else if (eventName === 'error') {
            throw new Error(obj.error || 'run failed');
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e;
        }
        lastEventName = eventName;
      }
    }
    log('5_run     stream_ended last_event', lastEventName);
  });

  // ── 6. Report ────────────────────────────────────────────────────────────
  const report = await time('6_report', async () => {
    const res = await fetch(`${BASE}/api/wizard/domain/${domainId}/report`, { headers: auth });
    return res.json();
  });
  log('6_report  metrics', report.metrics);
  log('6_report  topPrompts_count', (report.topPrompts || []).length);
  if (report.topPrompts?.length) {
    log('6_report  sample_prompt_with_results', {
      phrase: report.topPrompts[0].phrase,
      sov: report.topPrompts[0].sov,
      mentions: report.topPrompts[0].mentions,
      avgSentiment: report.topPrompts[0].avgSentiment,
      results: (report.topPrompts[0].results || []).map((r) => ({
        model: r.model,
        presence: r.presence,
        overall: r.overall,
        citationCount: (r.citations || []).length,
        sampleCitation: (r.citations || [])[0]?.url ?? null,
      })),
    });
  }

  // ── Final ───────────────────────────────────────────────────────────────
  log('TIMINGS', phaseTimes);
  log('TOTAL', `${Math.round((Date.now() - tStart) / 1000)}s`);
  log('DOMAIN_ID', domainId);
  await prisma.$disconnect();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
