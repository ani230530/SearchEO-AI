import express, { Request, Response, NextFunction } from 'express';
import { authenticateToken, isAdmin } from '../middleware/auth';
import {
  getUsageByModel,
  getUsageByPrompt,
  getUsageByUser,
  getUsageFilterOptions,
  getUsageLogs,
  getUsageSummary,
  serializeCsvValue,
  type UsageFilters,
} from '../services/usageLedgerService';

const router = express.Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseIntParam(value: unknown): number | undefined {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

function parseStringParam(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function filtersFromQuery(req: Request): UsageFilters {
  return {
    from: parseDate(req.query.from),
    to: parseDate(req.query.to),
    userId: parseIntParam(req.query.userId),
    domainId: parseIntParam(req.query.domainId),
    provider: parseStringParam(req.query.provider),
    feature: parseStringParam(req.query.feature),
    model: parseStringParam(req.query.model),
    status: parseStringParam(req.query.status),
  };
}

router.use(authenticateToken, isAdmin);

router.get('/summary', asyncHandler(async (req, res) => {
  res.json(await getUsageSummary(filtersFromQuery(req)));
}));

router.get('/users', asyncHandler(async (req, res) => {
  res.json({ rows: await getUsageByUser(filtersFromQuery(req)) });
}));

router.get('/prompts', asyncHandler(async (req, res) => {
  res.json({ rows: await getUsageByPrompt(filtersFromQuery(req)) });
}));

router.get('/models', asyncHandler(async (req, res) => {
  res.json({ rows: await getUsageByModel(filtersFromQuery(req)) });
}));

router.get('/filter-options', asyncHandler(async (_req, res) => {
  res.json(await getUsageFilterOptions());
}));

router.get('/logs', asyncHandler(async (req, res) => {
  const page = parseIntParam(req.query.page) ?? 1;
  const pageSize = parseIntParam(req.query.pageSize) ?? 50;
  res.json(await getUsageLogs(filtersFromQuery(req), page, pageSize));
}));

router.get('/export.csv', asyncHandler(async (req, res) => {
  const result = await getUsageLogs(filtersFromQuery(req), 1, 5000);
  const columns = [
    'createdAt',
    'provider',
    'feature',
    'operation',
    'status',
    'userId',
    'domainId',
    'domainHost',
    'runId',
    'promptId',
    'aiQueryResultId',
    'modelRequested',
    'modelUsed',
    'providerGenerationId',
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'cachedTokens',
    'reasoningTokens',
    'costUsd',
    'costSource',
    'latencyMs',
    'httpStatus',
    'errorCode',
    'errorMessage',
  ];
  const lines = [
    columns.join(','),
    ...result.rows.map((row: any) =>
      columns.map((column) => serializeCsvValue(row[column] instanceof Date ? row[column].toISOString() : row[column])).join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="usage-ledger.csv"');
  res.send(lines.join('\n'));
}));

export default router;
