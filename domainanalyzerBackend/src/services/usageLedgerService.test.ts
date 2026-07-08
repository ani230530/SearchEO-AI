import { describe, expect, it } from 'vitest';
import { createPrismaMock } from '../testSupport/prismaMock';
import {
  getUsageByModel,
  getUsageByPrompt,
  getUsageByUser,
  getUsageLogs,
  getUsageSummary,
  recordExternalUsage,
  recordUsageAttempt,
} from './usageLedgerService';

describe('usageLedgerService', () => {
  it('records success, failure, and zero-cost external usage', async () => {
    const prisma = createPrismaMock();
    await recordUsageAttempt(
      {
        provider: 'openrouter',
        feature: 'prompt_tracking',
        operation: 'answer_generation',
        callType: 'chat_completion',
        userId: 7,
        domainId: 3,
        promptId: 11,
        modelRequested: 'openai/gpt-4o-mini',
        metadata: { prompt: 'do not store full prompt', safe: 'ok' },
      },
      {
        status: 'success',
        modelUsed: 'openai/gpt-4o-mini',
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
        costUsd: 0.0025,
        costSource: 'provider_reported',
      },
      prisma
    );

    await recordUsageAttempt(
      {
        provider: 'openrouter',
        feature: 'scorer',
        operation: 'score_response',
        callType: 'chat_completion',
      },
      {
        status: 'failed',
        costUsd: 0,
        costSource: 'none',
        errorCode: 'timeout',
        errorMessage: 'request timed out',
      },
      prisma
    );

    await recordExternalUsage(
      {
        provider: 'pagespeed',
        feature: 'domain_analysis',
        operation: 'pagespeed_lookup',
      },
      {
        status: 'success',
        costUsd: 0,
        costSource: 'none',
      },
      prisma
    );

    const summary = await getUsageSummary({}, prisma);
    expect(summary.totalCalls).toBe(3);
    expect(summary.failedCalls).toBe(1);
    expect(summary.totalCostUsd).toBe(0.0025);
    expect(summary.totalTokens).toBe(140);

    const logs = await getUsageLogs({}, 1, 10, prisma);
    expect(logs.rows.some((row) => row.provider === 'openrouter')).toBe(true);
    expect(logs.rows.some((row) => row.costUsd === 0)).toBe(true);
    expect((logs.rows.find((row) => row.promptId === 11)?.metadata as any)?.prompt).toBe('[redacted]');
  });

  it('returns admin aggregations by user, prompt, and model', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({
      data: { email: 'admin-target@example.com', name: 'Admin Target', password: 'hash' },
    });
    const domain = await prisma.domain.create({
      data: { userId: user.id, url: 'https://example.com', host: 'example.com' },
    });
    const prompt = await prisma.prompt.create({
      data: {
        domainId: domain.id,
        text: 'Which tools help teams compare AI visibility?',
        source: 'ai',
      },
    });

    await recordUsageAttempt(
      {
        provider: 'openrouter',
        feature: 'domain_analysis',
        operation: 'answer_generation',
        callType: 'chat_completion',
        userId: user.id,
        domainId: domain.id,
        domainHost: domain.host,
        promptId: prompt.id,
        modelRequested: 'openai/gpt-4o-mini',
      },
      {
        status: 'success',
        modelUsed: 'openai/gpt-4o-mini',
        totalTokens: 250,
        costUsd: 0.005,
        costSource: 'provider_reported',
      },
      prisma
    );

    const users = await getUsageByUser({}, prisma);
    const prompts = await getUsageByPrompt({}, prisma);
    const models = await getUsageByModel({}, prisma);

    expect(users[0]).toMatchObject({
      userId: user.id,
      email: 'admin-target@example.com',
      totalCostUsd: 0.005,
    });
    expect(prompts[0]).toMatchObject({
      promptId: prompt.id,
      promptText: 'Which tools help teams compare AI visibility?',
      domainHost: 'example.com',
      totalCostUsd: 0.005,
    });
    expect(models[0]).toMatchObject({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      totalTokens: 250,
      totalCostUsd: 0.005,
    });
  });
});
