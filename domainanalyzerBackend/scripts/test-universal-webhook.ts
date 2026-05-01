/**
 * End-to-end smoke test for the universal n8n generation webhook.
 *
 * Loads a real worksheet topic + WordPress integration from the prod DB,
 * builds the same payload `routes/campaigns.ts` would build for that topic,
 * posts to N8N_UNIVERSAL_WEBHOOK_URL, and reports what came back.
 *
 * Usage:
 *   pnpm tsx scripts/test-universal-webhook.ts <topicId> [templateType]
 *
 * Defaults templateType to "blog" and includes a minimal blog `topic` field
 * derived from the row's title.
 */

import 'dotenv/config';
import axios from 'axios';
import { PrismaClient } from '../generated/prisma';
import { buildUniversalPayload, TemplateType } from '../src/services/universalGenerationService';
import { decryptToken } from '../src/services/tokenEncryption';

const prisma = new PrismaClient();

const N8N_UNIVERSAL_WEBHOOK_URL =
  process.env.N8N_UNIVERSAL_WEBHOOK_URL ||
  'https://n8n.srv891599.hstgr.cloud/webhook/universal%20workflow';
const N8N_API_KEY = process.env.N8N_API_KEY || '1234';
const N8N_API_KEY_HEADER = process.env.N8N_API_KEY_HEADER || 'key';
const N8N_TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS) || 300000;

const sanitizeDomainHost = (url: string) =>
  url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];

const summarizeContext = (input?: string | null, maxLines = 6, maxChars = 1000) => {
  if (!input) return '';
  const lines = input.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  const limited = lines.slice(0, maxLines).join('\n');
  if (limited.length <= maxChars) return limited;
  return `${limited.slice(0, maxChars)}…`;
};

const maskSecrets = (payload: Record<string, unknown>) => ({
  ...payload,
  Password: payload.Password ? `***(len=${String(payload.Password).length})` : undefined,
});

async function main() {
  const topicIdArg = process.argv[2];
  const templateTypeArg = (process.argv[3] || 'blog') as TemplateType;
  if (!topicIdArg) {
    console.error('Usage: pnpm tsx scripts/test-universal-webhook.ts <topicId> [templateType]');
    process.exit(2);
  }
  const topicId = parseInt(topicIdArg, 10);
  if (Number.isNaN(topicId)) {
    console.error(`Invalid topicId: ${topicIdArg}`);
    process.exit(2);
  }

  console.log(`[smoke] Loading topic ${topicId} from DB…`);
  const topic = await prisma.campaignTopic.findUnique({
    where: { id: topicId },
    include: {
      keywords: true,
      campaign: { include: { domain: true } },
    },
  });

  if (!topic) {
    console.error(`Topic ${topicId} not found.`);
    process.exit(1);
  }

  const primary = topic.keywords.find((k) => (k.aiMetadata as any)?.isPrimary === true);
  if (!primary) {
    console.error(`Topic ${topicId} has no primary keyword. Status would not be Ready.`);
    process.exit(1);
  }
  const longtails = topic.keywords
    .filter((k) => (k.aiMetadata as any)?.isLongtail === true)
    .map((k) => k.term);

  const integration = await prisma.wordpressIntegration.findUnique({
    where: { userId: topic.campaign.domain.userId },
  });
  if (!integration) {
    console.error(`User ${topic.campaign.domain.userId} has no WordPress integration.`);
    process.exit(1);
  }

  let decryptedPassword: string;
  try {
    decryptedPassword = decryptToken(integration.password);
  } catch (err) {
    console.error('Failed to decrypt WordPress password:', err);
    process.exit(1);
  }

  const brandName = sanitizeDomainHost(topic.campaign.domain.url) || 'Brand';
  const brandDescription = summarizeContext(topic.campaign.domain.context);

  // Default minimal template fields per template_type. The blog template
  // needs a `topic` field — we derive it from the row's title.
  const templateFields: Record<string, unknown> =
    templateTypeArg === 'blog' ? { topic: topic.title } : {};

  console.log('[smoke] Building universal payload…');
  const payload = buildUniversalPayload({
    templateType: templateTypeArg,
    projectName: topic.campaign.title,
    projectGoal: topic.campaign.description || 'AI visibility',
    primaryKeyword: primary.term,
    longtailKeywords: longtails,
    brandName,
    brandDescription,
    targetAudience: 'B2B decision makers',
    tone: 'Professional',
    wordCount: 800,
    language: 'en-US',
    cta: 'Book a demo',
    images: 1,
    featuredImage: true,
    wordpress: {
      username: integration.username,
      password: decryptedPassword,
      url: integration.siteUrl,
    },
    templateFields,
  });

  console.log('\n=== Payload (Password redacted) ===');
  console.log(JSON.stringify(maskSecrets(payload), null, 2));

  console.log(`\n[smoke] POST ${N8N_UNIVERSAL_WEBHOOK_URL}`);
  const startedAt = Date.now();
  let response: any;
  try {
    response = await axios.post(N8N_UNIVERSAL_WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        [N8N_API_KEY_HEADER]: N8N_API_KEY,
      },
      timeout: N8N_TIMEOUT_MS,
      validateStatus: () => true, // surface non-2xx for inspection
    });
  } catch (err: any) {
    console.error('\n=== Webhook call FAILED ===');
    console.error('error:', err?.message || err);
    if (err?.response) {
      console.error('status:', err.response.status, err.response.statusText);
      console.error('data:', JSON.stringify(err.response.data, null, 2).slice(0, 4000));
    }
    process.exit(1);
  }

  const elapsed = Date.now() - startedAt;
  console.log(`\n=== Response (${response.status} ${response.statusText}, ${elapsed}ms) ===`);

  // Show headers and body shape compactly.
  const data = response.data;
  if (typeof data === 'string') {
    console.log('Body (string, first 2000 chars):');
    console.log(data.slice(0, 2000));
  } else if (Array.isArray(data)) {
    console.log(`Body (array of ${data.length} items)`);
    const head = data[0] || {};
    console.log('Item[0] keys:', Object.keys(head));
    const htmlContent =
      (head as any)['Html Content'] ?? (head as any).htmlContent ?? (head as any).content;
    if (typeof htmlContent === 'string') {
      console.log(`htmlContent length: ${htmlContent.length}`);
      console.log(`htmlContent[0..240]: ${htmlContent.slice(0, 240)}…`);
    }
    const title = (head as any).Title ?? (head as any).title;
    if (title) console.log(`title: ${title}`);
  } else if (data && typeof data === 'object') {
    console.log('Body keys:', Object.keys(data));
    console.log(JSON.stringify(data, null, 2).slice(0, 4000));
  } else {
    console.log('Body:', data);
  }

  console.log('\n[smoke] Done.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Smoke test crashed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
