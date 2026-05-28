import express from 'express';
import type { Server } from 'http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock, PrismaMock } from '../testSupport/prismaMock';

const state = vi.hoisted(() => ({
  prisma: null as PrismaMock | null,
  destroy: vi.fn(async (_publicId: string, _options?: any) => ({ result: 'ok' as const })),
  sign: vi.fn((_params: any, _secret: string) => 'signed-test'),
}));

vi.mock('../../generated/prisma', () => ({
  PrismaClient: class {
    constructor() {
      if (!state.prisma) state.prisma = createPrismaMock();
      return state.prisma;
    }
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { userId: 1, email: 'owner@example.com' };
    return next();
  },
}));

vi.mock('../utils/cloudinary', () => ({
  cloudinary: {
    utils: {
      api_sign_request: (params: any, secret: string) => state.sign(params, secret),
    },
    uploader: {
      destroy: (publicId: string, options?: any) => state.destroy(publicId, options),
    },
  },
}));

import knowledgeBaseRouter from './knowledgeBase.routes';

let server: Server | null = null;
let baseUrl = '';

function app() {
  const appInstance = express();
  appInstance.use(express.json());
  appInstance.use('/api/knowledge-base', knowledgeBaseRouter);
  return appInstance;
}

async function startServer() {
  const instance = app();
  server = await new Promise<Server>((resolve) => {
    const srv = instance.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to start test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server!.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  server = null;
}

async function request(path: string, init?: RequestInit) {
  return fetch(`${baseUrl}${path}`, init);
}

function resetDb() {
  if (!state.prisma) state.prisma = createPrismaMock();
  for (const store of Object.values(state.prisma.__stores)) {
    store.rows.clear();
  }
  state.destroy.mockReset();
  state.destroy.mockResolvedValue({ result: 'ok' });
  state.sign.mockReset();
  state.sign.mockReturnValue('signed-test');
}

beforeAll(async () => {
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

beforeEach(() => {
  resetDb();
  vi.spyOn(Date, 'now').mockReturnValue(1_710_000_000_000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('knowledgeBase routes', () => {
  it('lists only the authenticated user\'s root items and nested folder items', async () => {
    const prisma = state.prisma!;
    const rootFolder = await prisma.folder.create({
      data: { name: 'Docs', userId: 1, parentId: null },
    });
    const childFolder = await prisma.folder.create({
      data: { name: 'SEO', userId: 1, parentId: rootFolder.id },
    });
    const rootFile = await prisma.file.create({
      data: {
        name: 'root.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/root.pdf',
        cloudinaryId: 'kb/user-1/root',
        size: 100,
        format: 'pdf',
        userId: 1,
        folderId: null,
      },
    });
    await prisma.file.create({
      data: {
        name: 'hidden.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/hidden.pdf',
        cloudinaryId: 'kb/user-2/hidden',
        size: 200,
        format: 'pdf',
        userId: 2,
        folderId: null,
      },
    });
    await prisma.folder.create({
      data: { name: 'Other', userId: 2, parentId: null },
    });

    const rootResponse = await request('/api/knowledge-base');
    const rootJson = await rootResponse.json();
    expect(rootResponse.status).toBe(200);
    expect(rootJson.success).toBe(true);
    expect(rootJson.folders.map((f: any) => f.id)).toEqual([rootFolder.id]);
    expect(rootJson.files.map((f: any) => f.id)).toEqual([rootFile.id]);
    expect(rootJson.items.map((item: any) => item.type)).toEqual(['folder', 'file']);

    const nestedResponse = await request(`/api/knowledge-base?folderId=${childFolder.id}`);
    const nestedJson = await nestedResponse.json();
    expect(nestedResponse.status).toBe(200);
    expect(nestedJson.currentFolder).toEqual({
      id: childFolder.id,
      name: 'SEO',
      parentId: rootFolder.id,
    });
    expect(nestedJson.folders).toEqual([]);
    expect(nestedJson.files).toEqual([]);
  });

  it('returns a clear error when malformed legacy rows would break the root listing', async () => {
    const prisma = state.prisma!;
    prisma.__stores.folder.rows.set(999, {
      id: 999,
      name: null,
      userId: 1,
      parentId: null,
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
      updatedAt: new Date('2026-05-27T00:00:00.000Z'),
    });

    const response = await request('/api/knowledge-base');
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Knowledge base folder data is malformed');
  });

  it('rejects duplicate folder names within the same parent', async () => {
    const prisma = state.prisma!;
    const parent = await prisma.folder.create({
      data: { name: 'Projects', userId: 1, parentId: null },
    });
    await prisma.folder.create({
      data: { name: 'Docs', userId: 1, parentId: parent.id },
    });

    const response = await request('/api/knowledge-base/folder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '  docs  ', parentId: parent.id }),
    });

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/already exists/i);
  });

  it('returns breadcrumbs from Home to the current folder', async () => {
    const prisma = state.prisma!;
    const docs = await prisma.folder.create({
      data: { name: 'Docs', userId: 1, parentId: null },
    });
    const seo = await prisma.folder.create({
      data: { name: 'SEO', userId: 1, parentId: docs.id },
    });

    const response = await request(`/api/knowledge-base/path/${seo.id}`);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.path).toEqual([
      { id: null, name: 'Home' },
      { id: docs.id, name: 'Docs' },
      { id: seo.id, name: 'SEO' },
    ]);
  });

  it('returns a signed Cloudinary upload payload', async () => {
    const response = await request('/api/knowledge-base/upload-signature');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(state.sign).toHaveBeenCalledWith(
      {
        folder: 'knowledge-base/user-1',
        timestamp: '1710000000',
      },
      'test-secret'
    );
    expect(json.upload).toMatchObject({
      cloudName: 'test-cloud',
      apiKey: 'test-key',
      timestamp: 1710000000,
      signature: 'signed-test',
      folder: 'knowledge-base/user-1',
      resourceType: 'raw',
      uploadUrl: 'https://api.cloudinary.com/v1_1/test-cloud/raw/upload',
    });
  });

  it('saves file metadata after a Cloudinary upload', async () => {
    const prisma = state.prisma!;
    const folder = await prisma.folder.create({
      data: { name: 'Docs', userId: 1, parentId: null },
    });

    const response = await request('/api/knowledge-base/file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'guide.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/guide.pdf',
        publicId: 'knowledge-base/user-1/guide',
        size: 2456,
        format: 'pdf',
        folderId: folder.id,
      }),
    });

    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.file).toMatchObject({
      name: 'guide.pdf',
      url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/guide.pdf',
      cloudinaryId: 'knowledge-base/user-1/guide',
      size: 2456,
      format: 'pdf',
      folderId: folder.id,
    });
    expect(state.prisma!.__stores.file.rows.size).toBe(1);
  });

  it('renames a folder when the name is unique in the parent folder', async () => {
    const prisma = state.prisma!;
    const folder = await prisma.folder.create({
      data: { name: 'Docs', userId: 1, parentId: null },
    });

    const response = await request(`/api/knowledge-base/folder/${folder.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Resources' }),
    });

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.folder).toMatchObject({
      id: folder.id,
      name: 'Resources',
      parentId: null,
    });
    expect(state.prisma!.__stores.folder.rows.get(folder.id)?.name).toBe('Resources');
  });

  it('rejects duplicate folder names on rename', async () => {
    const prisma = state.prisma!;
    const parent = await prisma.folder.create({
      data: { name: 'Projects', userId: 1, parentId: null },
    });
    const docs = await prisma.folder.create({
      data: { name: 'Docs', userId: 1, parentId: parent.id },
    });
    await prisma.folder.create({
      data: { name: 'Guides', userId: 1, parentId: parent.id },
    });

    const response = await request(`/api/knowledge-base/folder/${docs.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'guides' }),
    });

    const json = await response.json();
    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/already exists/i);
  });

  it('renames a file without changing its Cloudinary id', async () => {
    const prisma = state.prisma!;
    const file = await prisma.file.create({
      data: {
        name: 'guide.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/guide.pdf',
        cloudinaryId: 'knowledge-base/user-1/guide',
        size: 2456,
        format: 'pdf',
        userId: 1,
        folderId: null,
      },
    });

    const response = await request(`/api/knowledge-base/file/${file.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'guide-updated.pdf' }),
    });

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.file).toMatchObject({
      id: file.id,
      name: 'guide-updated.pdf',
      cloudinaryId: 'knowledge-base/user-1/guide',
    });
    expect(state.prisma!.__stores.file.rows.get(file.id)?.name).toBe('guide-updated.pdf');
    expect(state.prisma!.__stores.file.rows.get(file.id)?.cloudinaryId).toBe(
      'knowledge-base/user-1/guide'
    );
  });

  it('rejects duplicate file names on rename inside the same folder', async () => {
    const prisma = state.prisma!;
    const folder = await prisma.folder.create({
      data: { name: 'Docs', userId: 1, parentId: null },
    });
    const file = await prisma.file.create({
      data: {
        name: 'guide.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/guide.pdf',
        cloudinaryId: 'knowledge-base/user-1/guide',
        size: 2456,
        format: 'pdf',
        userId: 1,
        folderId: folder.id,
      },
    });
    await prisma.file.create({
      data: {
        name: 'other.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/other.pdf',
        cloudinaryId: 'knowledge-base/user-1/other',
        size: 2456,
        format: 'pdf',
        userId: 1,
        folderId: folder.id,
      },
    });

    const response = await request(`/api/knowledge-base/file/${file.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'other.pdf' }),
    });

    const json = await response.json();
    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/already exists/i);
  });

  it('deletes a file from Prisma and Cloudinary', async () => {
    const prisma = state.prisma!;
    const file = await prisma.file.create({
      data: {
        name: 'guide.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/guide.pdf',
        cloudinaryId: 'knowledge-base/user-1/guide',
        size: 2456,
        format: 'pdf',
        userId: 1,
        folderId: null,
      },
    });

    const response = await request(`/api/knowledge-base/file/${file.id}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    expect(state.destroy).toHaveBeenCalledWith('knowledge-base/user-1/guide', {
      resource_type: 'raw',
    });
    expect(state.prisma!.__stores.file.rows.size).toBe(0);
  });

  it('recursively deletes folders, files, and Cloudinary assets', async () => {
    const prisma = state.prisma!;
    const root = await prisma.folder.create({
      data: { name: 'Docs', userId: 1, parentId: null },
    });
    const child = await prisma.folder.create({
      data: { name: 'SEO', userId: 1, parentId: root.id },
    });
    const grandchild = await prisma.folder.create({
      data: { name: 'Guides', userId: 1, parentId: child.id },
    });
    await prisma.file.create({
      data: {
        name: 'root.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/root.pdf',
        cloudinaryId: 'knowledge-base/user-1/root',
        size: 10,
        format: 'pdf',
        userId: 1,
        folderId: root.id,
      },
    });
    await prisma.file.create({
      data: {
        name: 'child.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/child.pdf',
        cloudinaryId: 'knowledge-base/user-1/child',
        size: 10,
        format: 'pdf',
        userId: 1,
        folderId: child.id,
      },
    });
    await prisma.file.create({
      data: {
        name: 'grandchild.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/grandchild.pdf',
        cloudinaryId: 'knowledge-base/user-1/grandchild',
        size: 10,
        format: 'pdf',
        userId: 1,
        folderId: grandchild.id,
      },
    });
    await prisma.file.create({
      data: {
        name: 'other-user.pdf',
        url: 'https://res.cloudinary.com/test-cloud/raw/upload/v1/other.pdf',
        cloudinaryId: 'knowledge-base/user-2/other',
        size: 10,
        format: 'pdf',
        userId: 2,
        folderId: null,
      },
    });

    const response = await request(`/api/knowledge-base/folder/${root.id}`, {
      method: 'DELETE',
    });

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.deletedFiles).toBe(3);
    expect(state.destroy).toHaveBeenCalledTimes(3);
    expect(state.prisma!.__stores.folder.rows.size).toBe(0);
    expect(state.prisma!.__stores.file.rows.size).toBe(1);
    expect(Array.from(state.prisma!.__stores.file.rows.values())[0].cloudinaryId).toBe(
      'knowledge-base/user-2/other'
    );
  });
});
