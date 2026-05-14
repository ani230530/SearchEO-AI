/**
 * Live smoke test against the real DB. Exercises the anon-wizard backbone
 * end-to-end:
 *   1. issueSession writes a row
 *   2. lookupSession reads it back
 *   3. snapshot host onto the session
 *   4. recordApiSpend persists a row
 *   5. getDailyBudgetStatus aggregates correctly
 *   6. linkSessionToUser materializes a Domain shell
 *   7. Linked sessions are no longer lookupable
 *
 * Cleanup runs in `finally`; on success the DB is left as we found it.
 *
 * Run:
 *   cd domainanalyzerBackend
 *   npx ts-node-dev --transpile-only scripts/smoke-anon-backbone.ts
 */

import { PrismaClient } from '../generated/prisma';
import {
  issueSession,
  linkSessionToUser,
  lookupSession,
} from '../src/services/wizardSessionService';
import {
  getDailyBudgetStatus,
  recordApiSpend,
} from '../src/services/antiAbuseService';

const prisma = new PrismaClient();
const log = (label: string, value: unknown) =>
  console.log(`✓ ${label}:`, value);

(async () => {
  let userId: number | null = null;
  let sessionId: number | null = null;
  let domainId: number | null = null;
  let spendId: number | null = null;
  try {
    // 1. issue
    const { token, sessionId: sid } = await issueSession(prisma, {
      ip: '127.0.0.1',
      userAgent: 'smoke-test',
      fingerprintHash: 'smoke-fp',
    });
    sessionId = sid;
    log('issueSession', { sessionId: sid, tokenLen: token.length });

    // 2. lookup
    const found = await lookupSession(prisma, token);
    if (!found || found.id !== sid) throw new Error('lookup mismatch');
    log('lookupSession', { id: found.id, ip: found.ip });

    // 3. snapshot a host onto the session
    await prisma.wizardSession.update({
      where: { id: sid },
      data: {
        domainHost: 'smoke-anon.example.com',
        domainUrl: 'https://smoke-anon.example.com',
      },
    });
    log('snapshot host', 'smoke-anon.example.com');

    // 4. record an anonymous spend
    await recordApiSpend(prisma, {
      service: 'openrouter',
      sessionId: sid,
      domainHost: 'smoke-anon.example.com',
      costEstimateUsd: 0.0123,
    });
    const recent = await prisma.apiSpendLog.findFirst({
      where: { sessionId: sid },
      orderBy: { id: 'desc' },
    });
    if (!recent) throw new Error('spend not persisted');
    spendId = recent.id;
    log('recordApiSpend', { id: recent.id, cost: recent.costEstimateUsd });

    // 5. daily budget aggregation includes our row
    const status = await getDailyBudgetStatus(prisma, 100);
    if (status.spentUsd < 0.0123) throw new Error('budget did not aggregate');
    log('getDailyBudgetStatus', {
      spent: status.spentUsd,
      anonShedding: status.anonShedding,
    });

    // 6. sacrificial user + link
    const sacrificialEmail = `smoke-${Date.now()}@example.invalid`;
    const u = await prisma.user.create({
      data: {
        email: sacrificialEmail,
        password: '$2a$12$smokesmokesmokesmokesmokesmokesmoke',
        name: 'Smoke User',
      },
    });
    userId = u.id;
    log('create user', {
      id: u.id,
      wizardRunsAllowed: u.wizardRunsAllowed,
    });

    const link = await linkSessionToUser(prisma, sid, u.id);
    if (!link.linked || link.domainsCreated !== 1) {
      throw new Error(`unexpected link result ${JSON.stringify(link)}`);
    }
    domainId = link.primaryDomainId;
    log('linkSessionToUser', link);

    // 7. domain materialized correctly
    const dom = await prisma.domain.findUnique({
      where: {
        userId_host: { userId: u.id, host: 'smoke-anon.example.com' },
      },
    });
    if (!dom) throw new Error('domain not materialized');
    if (dom.isCompanyDomain !== false) {
      throw new Error('domain should NOT be auto-promoted');
    }
    log('domain materialized', {
      id: dom.id,
      isCompanyDomain: dom.isCompanyDomain,
    });

    // 8. session marked linked
    const linked = await prisma.wizardSession.findUnique({
      where: { id: sid },
    });
    if (linked?.linkedUserId !== u.id) throw new Error('session not linked');
    log('session linked', {
      linkedUserId: linked.linkedUserId,
      linkedDomainId: linked.linkedDomainId,
    });

    // 9. linked sessions are not lookupable (cookie no longer authoritative)
    const post = await lookupSession(prisma, token);
    if (post !== null) throw new Error('linked session should reject lookup');
    log('post-link lookup rejected', 'as expected (null)');

    console.log('\n✓✓✓ ALL SMOKE CHECKS PASSED');
  } catch (err) {
    console.error('✗ smoke failed:', err);
    process.exitCode = 1;
  } finally {
    if (spendId !== null)
      await prisma.apiSpendLog.delete({ where: { id: spendId } }).catch(() => {});
    if (domainId !== null)
      await prisma.domain.delete({ where: { id: domainId } }).catch(() => {});
    if (sessionId !== null)
      await prisma.wizardSession
        .delete({ where: { id: sessionId } })
        .catch(() => {});
    if (userId !== null)
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    console.log('cleaned up smoke rows');
    await prisma.$disconnect();
  }
})();
