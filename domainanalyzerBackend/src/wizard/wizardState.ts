/**
 * wizardState — small helper around the WizardState.phases JSON column.
 *
 * Phases JSON shape:  Record<Phase, PhaseStatus>
 * The order of phases is fixed (PHASE_ORDER) and the "next phase to land on"
 * is the first non-completed phase in that order.
 */

import type { PrismaClient } from '../../generated/prisma';
import type { Phase, PhaseStatus } from './types';

/**
 * The five-phase wizard flow:
 *   1. crawl       — fetch + extract pages
 *   2. profile     — synthesize context, infer companySize, embed
 *   3. competitors — discover, verify, score, rank, user picks
 *   4. topics      — auto-generate 5–10 keywords + their prompts in one call
 *   5. run         — fan out user-selected prompts across GPT-4o + Claude + Gemini
 *
 * `select` is part of the topics step (the user only picks prompts; keywords
 * are auto-generated and not user-pickable). `run` covers the AI-query
 * execution that produces AiQueryResult rows.
 */
export const PHASE_ORDER: Phase[] = ['crawl', 'profile', 'competitors', 'topics', 'select', 'run'];

export async function setPhase(
  prisma: PrismaClient,
  domainId: number,
  phase: Phase,
  status: PhaseStatus
): Promise<void> {
  const existing = await prisma.wizardState.findUnique({ where: { domainId } });
  const current = (existing?.phases as Record<string, PhaseStatus> | undefined) ?? {};
  const next = { ...current, [phase]: status };
  if (existing) {
    await prisma.wizardState.update({ where: { domainId }, data: { phases: next as any } });
  } else {
    await prisma.wizardState.create({ data: { domainId, phases: next as any } });
  }
}

export async function readState(
  prisma: PrismaClient,
  domainId: number
): Promise<{ phases: Record<Phase, PhaseStatus>; canResumeAt: Phase | null; selectionDraft: unknown }> {
  const row = await prisma.wizardState.findUnique({ where: { domainId } });
  const phases = ((row?.phases as Record<Phase, PhaseStatus> | undefined) ?? {}) as Record<Phase, PhaseStatus>;
  let canResumeAt: Phase | null = null;
  for (const p of PHASE_ORDER) {
    if (phases[p] !== 'completed') {
      canResumeAt = p;
      break;
    }
  }
  return { phases, canResumeAt, selectionDraft: row?.selectionDraft ?? null };
}
