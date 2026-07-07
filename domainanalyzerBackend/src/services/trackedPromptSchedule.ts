import type { PrismaClient } from '../../generated/prisma';
import { prisma } from '../lib/prisma';

export type TrackedPromptScheduleKey =
  | 'every_6_hours'
  | 'every_12_hours'
  | 'daily_0300_utc'
  | 'weekly_monday_0300_utc'
  | 'custom';

export type TrackedPromptSchedule = {
  cadence: 'every_6_hours' | 'every_12_hours' | 'daily' | 'weekly' | 'custom';
  cron: string;
  key: TrackedPromptScheduleKey;
  label: string;
  nextTestAt: Date;
};

type ScheduleDefinition = Omit<TrackedPromptSchedule, 'nextTestAt'> & (
  | { mode: 'interval-hours'; intervalHours: 6 | 12 }
  | { mode: 'daily'; hourUtc: number }
  | { mode: 'weekly'; dayUtc: number; hourUtc: number }
);

type ParsedCronField = {
  restricted: boolean;
  values: Set<number>;
};

export const TRACKED_PROMPT_SCHEDULE_SETTING_KEY = 'tracked_prompt_schedule';

const TRACKED_PROMPT_SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
  {
    key: 'every_6_hours',
    label: 'Every 6 hours',
    cadence: 'every_6_hours',
    cron: '0 */6 * * *',
    mode: 'interval-hours',
    intervalHours: 6,
  },
  {
    key: 'every_12_hours',
    label: 'Every 12 hours',
    cadence: 'every_12_hours',
    cron: '0 */12 * * *',
    mode: 'interval-hours',
    intervalHours: 12,
  },
  {
    key: 'daily_0300_utc',
    label: 'Daily at 03:00 UTC',
    cadence: 'daily',
    cron: '0 3 * * *',
    mode: 'daily',
    hourUtc: 3,
  },
  {
    key: 'weekly_monday_0300_utc',
    label: 'Weekly on Monday at 03:00 UTC',
    cadence: 'weekly',
    cron: '0 3 * * 1',
    mode: 'weekly',
    dayUtc: 1,
    hourUtc: 3,
  },
];

const DEFAULT_SCHEDULE_KEY: TrackedPromptScheduleKey = 'daily_0300_utc';
const OPTION_BY_KEY = new Map(TRACKED_PROMPT_SCHEDULE_DEFINITIONS.map((option) => [option.key, option]));
const CUSTOM_SETTING_TYPE = 'custom';
const MAX_CUSTOM_CRON_LOOKAHEAD_MINUTES = 366 * 24 * 60;

export const TRACKED_PROMPT_SCHEDULE_OPTIONS = TRACKED_PROMPT_SCHEDULE_DEFINITIONS.map(({ key, label, cadence, cron }) => ({
  key,
  label,
  cadence,
  cron,
}));

export const DEFAULT_TRACKED_PROMPT_CRON = OPTION_BY_KEY.get(DEFAULT_SCHEDULE_KEY)!.cron;

function addUtcHours(date: Date, hours: number): Date {
  const next = new Date(date);
  next.setUTCHours(next.getUTCHours() + hours, 0, 0, 0);
  return next;
}

function nextIntervalHourRunAt(intervalHours: 6 | 12, now: Date): Date {
  let candidate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    0,
    0,
    0,
  ));
  if (now.getTime() >= candidate.getTime()) candidate = addUtcHours(candidate, 1);
  while (candidate.getUTCHours() % intervalHours !== 0) {
    candidate = addUtcHours(candidate, 1);
  }
  return candidate;
}

function nextDailyRunAt(hourUtc: number, now: Date): Date {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hourUtc,
    0,
    0,
    0,
  ));
  if (now.getTime() >= next.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function nextWeeklyRunAt(dayUtc: number, hourUtc: number, now: Date): Date {
  const next = nextDailyRunAt(hourUtc, now);
  while (next.getUTCDay() !== dayUtc) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function parseCronField(field: string, min: number, max: number, options: { allowSundaySeven?: boolean } = {}): ParsedCronField {
  const values = new Set<number>();
  const trimmed = field.trim();
  if (!trimmed) throw new Error('Cron fields cannot be empty');

  const addValue = (value: number) => {
    const normalized = options.allowSundaySeven && value === 7 ? 0 : value;
    if (normalized < min || normalized > max) {
      throw new Error(`Cron value ${value} is outside ${min}-${max}`);
    }
    values.add(normalized);
  };

  if (trimmed === '*') {
    for (let value = min; value <= max; value++) addValue(value);
    return { restricted: false, values };
  }

  for (const part of trimmed.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    if (!rangePart || part.split('/').length > 2) throw new Error('Invalid cron range');

    const step = stepPart == null ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step <= 0) throw new Error('Cron step must be a positive integer');

    let start: number;
    let end: number;
    if (rangePart === '*') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const [rawStart, rawEnd] = rangePart.split('-').map(Number);
      if (!Number.isInteger(rawStart) || !Number.isInteger(rawEnd) || rawStart > rawEnd) {
        throw new Error('Invalid cron range');
      }
      start = rawStart;
      end = rawEnd;
    } else {
      const single = Number(rangePart);
      if (!Number.isInteger(single)) throw new Error('Cron values must be numeric');
      start = single;
      end = single;
    }

    for (let value = start; value <= end; value += step) addValue(value);
  }

  if (values.size === 0) throw new Error('Cron field does not select any values');
  return { restricted: true, values };
}

function parseFiveFieldCron(cron: string) {
  const normalized = cron.trim().replace(/\s+/g, ' ');
  const parts = normalized.split(' ');
  if (parts.length !== 5) {
    throw new Error('Use a 5-field cron expression: minute hour day month weekday');
  }

  return {
    cron: normalized,
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6, { allowSundaySeven: true }),
  };
}

function cronMatchesDate(parsed: ReturnType<typeof parseFiveFieldCron>, date: Date): boolean {
  if (!parsed.minute.values.has(date.getUTCMinutes())) return false;
  if (!parsed.hour.values.has(date.getUTCHours())) return false;
  if (!parsed.month.values.has(date.getUTCMonth() + 1)) return false;

  const dayOfMonthMatches = parsed.dayOfMonth.values.has(date.getUTCDate());
  const dayOfWeekMatches = parsed.dayOfWeek.values.has(date.getUTCDay());

  if (parsed.dayOfMonth.restricted && parsed.dayOfWeek.restricted) {
    return dayOfMonthMatches || dayOfWeekMatches;
  }
  if (parsed.dayOfMonth.restricted) return dayOfMonthMatches;
  if (parsed.dayOfWeek.restricted) return dayOfWeekMatches;
  return true;
}

function nextCustomCronRunAt(cron: string, now = new Date()): Date {
  const parsed = parseFiveFieldCron(cron);
  const candidate = new Date(now);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  for (let i = 0; i < MAX_CUSTOM_CRON_LOOKAHEAD_MINUTES; i++) {
    if (cronMatchesDate(parsed, candidate)) return new Date(candidate);
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  throw new Error('Cron does not produce a run in the next 366 days');
}

function customTrackedPromptSchedule(cron: string, now = new Date()): TrackedPromptSchedule {
  const normalized = parseFiveFieldCron(cron).cron;
  return {
    key: 'custom',
    label: 'Custom timing',
    cadence: 'custom',
    cron: normalized,
    nextTestAt: nextCustomCronRunAt(normalized, now),
  };
}

function withNextRun(definition: ScheduleDefinition, now = new Date()): TrackedPromptSchedule {
  const nextTestAt =
    definition.mode === 'interval-hours'
      ? nextIntervalHourRunAt(definition.intervalHours, now)
      : definition.mode === 'weekly'
        ? nextWeeklyRunAt(definition.dayUtc, definition.hourUtc, now)
        : nextDailyRunAt(definition.hourUtc, now);

  const { mode: _mode, intervalHours: _intervalHours, hourUtc: _hourUtc, dayUtc: _dayUtc, ...payload } = definition as any;
  return { ...payload, nextTestAt };
}

function parseSavedCustomSchedule(value: string, now = new Date()): TrackedPromptSchedule | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed?.type !== CUSTOM_SETTING_TYPE || typeof parsed?.cron !== 'string') return null;
    return customTrackedPromptSchedule(parsed.cron, now);
  } catch {
    return null;
  }
}

function serializeScheduleSettingValue(schedule: TrackedPromptSchedule): string {
  if (schedule.key === 'custom') {
    return JSON.stringify({ type: CUSTOM_SETTING_TYPE, cron: schedule.cron });
  }
  return schedule.key;
}

export function resolveTrackedPromptSchedule(key: unknown, now = new Date()): TrackedPromptSchedule | null {
  if (typeof key !== 'string') return null;
  const definition = OPTION_BY_KEY.get(key as TrackedPromptScheduleKey);
  return definition ? withNextRun(definition, now) : parseSavedCustomSchedule(key, now);
}

export function defaultTrackedPromptSchedule(now = new Date()): TrackedPromptSchedule {
  return withNextRun(OPTION_BY_KEY.get(DEFAULT_SCHEDULE_KEY)!, now);
}

export function serializeTrackedPromptSchedule(schedule: TrackedPromptSchedule) {
  return {
    key: schedule.key,
    label: schedule.label,
    cadence: schedule.cadence,
    cron: schedule.cron,
    nextTestAt: schedule.nextTestAt,
  };
}

export async function getTrackedPromptSchedule(
  prismaClient: PrismaClient = prisma,
  now = new Date(),
): Promise<TrackedPromptSchedule> {
  const appSetting = (prismaClient as any).appSetting;
  if (!appSetting?.findUnique) return defaultTrackedPromptSchedule(now);

  const saved = await appSetting.findUnique({
    where: { key: TRACKED_PROMPT_SCHEDULE_SETTING_KEY },
    select: { value: true },
  });
  return resolveTrackedPromptSchedule(saved?.value, now) ?? defaultTrackedPromptSchedule(now);
}

export async function setTrackedPromptSchedule(
  input: unknown,
  prismaClient: PrismaClient = prisma,
  now = new Date(),
): Promise<TrackedPromptSchedule> {
  const scheduleKey = typeof input === 'object' && input !== null ? (input as { scheduleKey?: unknown }).scheduleKey : input;
  const customCron = typeof input === 'object' && input !== null ? (input as { cron?: unknown }).cron : undefined;
  const schedule = scheduleKey === 'custom'
    ? customTrackedPromptSchedule(String(customCron ?? ''), now)
    : resolveTrackedPromptSchedule(scheduleKey, now);
  if (!schedule) {
    throw new Error('Invalid tracked prompt schedule');
  }

  const appSetting = (prismaClient as any).appSetting;
  if (!appSetting?.upsert) return schedule;

  await appSetting.upsert({
    where: { key: TRACKED_PROMPT_SCHEDULE_SETTING_KEY },
    create: {
      key: TRACKED_PROMPT_SCHEDULE_SETTING_KEY,
      value: serializeScheduleSettingValue(schedule),
    },
    update: { value: serializeScheduleSettingValue(schedule) },
  });
  return schedule;
}
