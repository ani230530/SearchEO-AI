import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { cloudinary } from '../utils/cloudinary';

const router = Router();
const prisma = new PrismaClient();

const DRIVE_ROOT_NAME = 'Home';
const CLOUDINARY_FOLDER_PREFIX = 'knowledge-base';
const CLOUDINARY_RESOURCE_TYPE = 'raw' as const;

type DriveItem =
  | {
      type: 'folder';
      id: number;
      name: string;
      parentId: number | null;
      createdAt: Date;
      updatedAt: Date;
    }
  | {
      type: 'file';
      id: number;
      name: string;
      url: string;
      cloudinaryId: string;
      size: number;
      format: string;
      folderId: number | null;
      createdAt: Date;
    };

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function getUserId(req: Request): number {
  return (req as AuthenticatedRequest).user.userId;
}

function parseOptionalId(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return 'invalid';
  const raw = String(value).trim();
  if (!raw || raw === 'null' || raw === 'undefined') return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return 'invalid';
  return parsed;
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function assertKnowledgeBaseRows(
  rows: Array<{ name: unknown }>,
  itemType: 'folder' | 'file'
): asserts rows is Array<{ name: string }> {
  for (const row of rows) {
    if (typeof row.name !== 'string' || row.name.trim().length === 0) {
      throw new Error(`Knowledge base ${itemType} data is malformed`);
    }
  }
}

function buildFolderDto(folder: any) {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

function buildFileDto(file: any) {
  return {
    id: file.id,
    name: file.name,
    url: file.url,
    cloudinaryId: file.cloudinaryId,
    size: file.size,
    format: file.format,
    folderId: file.folderId,
    createdAt: file.createdAt,
  };
}

function buildCombinedItems(folders: any[], files: any[]): DriveItem[] {
  return [
    ...folders.map(
      (folder) =>
        ({
          type: 'folder',
          ...buildFolderDto(folder),
        }) as DriveItem
    ),
    ...files.map(
      (file) =>
        ({
          type: 'file',
          ...buildFileDto(file),
        }) as DriveItem
    ),
  ];
}

async function getOwnedFolderOrNull(userId: number, folderId: number) {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
  });
  if (!folder || folder.userId !== userId) return null;
  return folder;
}

async function getOwnedFileOrNull(userId: number, fileId: number) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
  });
  if (!file || file.userId !== userId) return null;
  return file;
}

async function collectFolderTree(folderId: number, userId: number) {
  const visited = new Set<number>();
  const folderIds: number[] = [];
  const fileCloudinaryIds: string[] = [];
  const queue: number[] = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    folderIds.push(currentId);

    const [children, files] = await Promise.all([
      prisma.folder.findMany({
        where: { parentId: currentId, userId },
        select: { id: true },
      }),
      prisma.file.findMany({
        where: { folderId: currentId, userId },
        select: { cloudinaryId: true },
      }),
    ]);

    for (const child of children) queue.push(child.id);
    for (const file of files) {
      if (file.cloudinaryId) fileCloudinaryIds.push(file.cloudinaryId);
    }
  }

  return {
    folderIds,
    fileCloudinaryIds: Array.from(new Set(fileCloudinaryIds)),
  };
}

async function buildPath(folderId: number, userId: number) {
  const path: Array<{ id: number; name: string }> = [];
  const seen = new Set<number>();
  let currentId: number | null = folderId;

  while (currentId !== null) {
    if (seen.has(currentId)) {
      throw new Error('Folder hierarchy contains a cycle');
    }
    seen.add(currentId);

    const folder: { id: number; name: string; parentId: number | null; userId: number } | null =
      await prisma.folder.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true, userId: true },
    });

    if (!folder || folder.userId !== userId) return null;

    path.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }

  return path;
}

async function deleteCloudinaryAssets(publicIds: string[]) {
  const unique = Array.from(new Set(publicIds.filter(Boolean)));
  for (const publicId of unique) {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: CLOUDINARY_RESOURCE_TYPE,
    });

    if (result?.result && result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Cloudinary delete failed for ${publicId}`);
    }
  }
}

router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const folderIdInput = parseOptionalId(req.query.folderId);

    if (folderIdInput === 'invalid') {
      return res.status(400).json({
        success: false,
        error: 'folderId must be a positive integer',
      });
    }

    const folderId = folderIdInput;
    let currentFolder: any = null;

    if (folderId !== null) {
      currentFolder = await getOwnedFolderOrNull(userId, folderId);
      if (!currentFolder) {
        return res.status(404).json({
          success: false,
          error: 'Folder not found',
        });
      }
    }

    try {
      const [folders, files] = await Promise.all([
        prisma.folder.findMany({
          where: { userId, parentId: folderId },
          orderBy: { name: 'asc' },
        }),
        prisma.file.findMany({
          where: { userId, folderId },
          orderBy: { name: 'asc' },
        }),
      ]);

      assertKnowledgeBaseRows(folders, 'folder');
      assertKnowledgeBaseRows(files, 'file');

      return res.json({
        success: true,
        currentFolder: currentFolder
          ? {
              id: currentFolder.id,
              name: currentFolder.name,
              parentId: currentFolder.parentId,
            }
          : null,
        folderId,
        folders: folders.map(buildFolderDto),
        files: files.map(buildFileDto),
        items: buildCombinedItems(folders, files),
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Knowledge base ')) {
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }
      throw error;
    }
  })
);

router.post(
  '/folder',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const name = normalizeName((req.body ?? {}).name);
    const parentIdInput = parseOptionalId((req.body ?? {}).parentId);

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Folder name is required',
      });
    }

    if (parentIdInput === 'invalid') {
      return res.status(400).json({
        success: false,
        error: 'parentId must be a positive integer or null',
      });
    }

    if (parentIdInput !== null) {
      const parentFolder = await getOwnedFolderOrNull(userId, parentIdInput);
      if (!parentFolder) {
        return res.status(404).json({
          success: false,
          error: 'Parent folder not found',
        });
      }
    }

    const siblings = await prisma.folder.findMany({
      where: {
        userId,
        parentId: parentIdInput,
      },
      select: { id: true, name: true },
    });

    const duplicate = siblings.some((folder) => folder.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'A folder with that name already exists in this location',
      });
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        userId,
        parentId: parentIdInput,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Folder created successfully',
      folder: buildFolderDto(folder),
    });
  })
);

router.patch(
  '/folder/:id',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const folderId = parseOptionalId(req.params.id);
    const name = normalizeName((req.body ?? {}).name);

    if (folderId === 'invalid' || folderId === null) {
      return res.status(400).json({
        success: false,
        error: 'id must be a positive integer',
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Folder name is required',
      });
    }

    const folder = await getOwnedFolderOrNull(userId, folderId);
    if (!folder) {
      return res.status(404).json({
        success: false,
        error: 'Folder not found',
      });
    }

    const siblings = await prisma.folder.findMany({
      where: { userId, parentId: folder.parentId },
    });
    const duplicate = siblings.some(
      (item) => item.id !== folder.id && item.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'A folder with that name already exists in this location',
      });
    }

    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: { name },
    });

    return res.json({
      success: true,
      message: 'Folder renamed successfully',
      folder: buildFolderDto(updated),
    });
  })
);

router.get(
  '/path/:folderId',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const folderId = parseOptionalId(req.params.folderId);

    if (folderId === 'invalid' || folderId === null) {
      return res.status(400).json({
        success: false,
        error: 'folderId must be a positive integer',
      });
    }

    const path = await buildPath(folderId, userId);
    if (!path) {
      return res.status(404).json({
        success: false,
        error: 'Folder not found',
      });
    }

    return res.json({
      success: true,
      path: [{ id: null, name: DRIVE_ROOT_NAME }, ...path],
    });
  })
);

router.get(
  '/upload-signature',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({
        success: false,
        error: 'Cloudinary configuration is missing',
      });
    }

    const userId = getUserId(req);
    const folder = `${CLOUDINARY_FOLDER_PREFIX}/user-${userId}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
      folder,
      timestamp: String(timestamp),
    };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    return res.json({
      success: true,
      upload: {
        cloudName,
        apiKey,
        timestamp,
        signature,
        folder,
        resourceType: CLOUDINARY_RESOURCE_TYPE,
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${CLOUDINARY_RESOURCE_TYPE}/upload`,
      },
    });
  })
);

router.post(
  '/file',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const body = (req.body ?? {}) as Record<string, any>;
    const url = normalizeName(body.url);
    const publicId = normalizeName(body.publicId ?? body.cloudinaryId);
    const name = normalizeName(body.name) || (publicId.split('/').pop() ?? '');
    const format = normalizeName(body.format);
    const sizeValue = body.size;
    const size =
      typeof sizeValue === 'number'
        ? sizeValue
        : Number.parseInt(String(sizeValue ?? '').trim(), 10);
    const folderIdInput = parseOptionalId(body.folderId);

    if (!url || !publicId || !format || !Number.isInteger(size) || size <= 0) {
      return res.status(400).json({
        success: false,
        error: 'url, publicId, size, and format are required',
      });
    }

    if (folderIdInput === 'invalid') {
      return res.status(400).json({
        success: false,
        error: 'folderId must be a positive integer or null',
      });
    }

    if (folderIdInput !== null) {
      const parentFolder = await getOwnedFolderOrNull(userId, folderIdInput);
      if (!parentFolder) {
        return res.status(404).json({
          success: false,
          error: 'Folder not found',
        });
      }
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'url must be a valid URL',
      });
    }

    const file = await prisma.file.create({
      data: {
        name: name || publicId.split('/').pop() || 'Untitled file',
        url,
        cloudinaryId: publicId,
        size,
        format,
        userId,
        folderId: folderIdInput,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'File saved successfully',
      file: buildFileDto(file),
    });
  })
);

router.patch(
  '/file/:id',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const fileId = parseOptionalId(req.params.id);
    const name = normalizeName((req.body ?? {}).name);

    if (fileId === 'invalid' || fileId === null) {
      return res.status(400).json({
        success: false,
        error: 'id must be a positive integer',
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'File name is required',
      });
    }

    const file = await getOwnedFileOrNull(userId, fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    const siblings = await prisma.file.findMany({
      where: { userId, folderId: file.folderId },
    });
    const duplicate = siblings.some(
      (item) => item.id !== file.id && item.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'A file with that name already exists in this folder',
      });
    }

    const updated = await prisma.file.update({
      where: { id: file.id },
      data: { name },
    });

    return res.json({
      success: true,
      message: 'File renamed successfully',
      file: buildFileDto(updated),
    });
  })
);

router.delete(
  '/:type/:id',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const type = String(req.params.type || '').toLowerCase();
    const id = parseOptionalId(req.params.id);

    if (id === 'invalid' || id === null) {
      return res.status(400).json({
        success: false,
        error: 'id must be a positive integer',
      });
    }

    if (type === 'file') {
      const file = await prisma.file.findFirst({
        where: { id, userId },
      });

      if (!file) {
        return res.status(404).json({
          success: false,
          error: 'File not found',
        });
      }

      await cloudinary.uploader.destroy(file.cloudinaryId, {
        resource_type: CLOUDINARY_RESOURCE_TYPE,
      });

      await prisma.file.delete({
        where: { id: file.id },
      });

      return res.json({
        success: true,
        message: 'File deleted successfully',
      });
    }

    if (type === 'folder') {
      const folder = await getOwnedFolderOrNull(userId, id);
      if (!folder) {
        return res.status(404).json({
          success: false,
          error: 'Folder not found',
        });
      }

      const tree = await collectFolderTree(folder.id, userId);
      await deleteCloudinaryAssets(tree.fileCloudinaryIds);

      await prisma.folder.delete({
        where: { id: folder.id },
      });

      return res.json({
        success: true,
        message: 'Folder deleted successfully',
        deletedFiles: tree.fileCloudinaryIds.length,
      });
    }

    return res.status(400).json({
      success: false,
      error: 'type must be either "file" or "folder"',
    });
  })
);

export default router;
