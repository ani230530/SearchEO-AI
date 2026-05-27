import { apiDelete, apiGet, apiPatch, apiPost } from "@/services/apiClient";

const API_PREFIX = "/knowledge-base";

export interface KnowledgeBaseFolderDto {
  id: number;
  name: string;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseFileDto {
  id: number;
  name: string;
  url: string;
  cloudinaryId: string;
  size: number;
  format: string;
  folderId: number | null;
  createdAt: string;
}

export interface KnowledgeBasePathEntry {
  id: number | null;
  name: string;
}

export interface KnowledgeBaseListing {
  success: boolean;
  currentFolder: {
    id: number;
    name: string;
    parentId: number | null;
  } | null;
  folderId: number | null;
  folders: KnowledgeBaseFolderDto[];
  files: KnowledgeBaseFileDto[];
}

export interface KnowledgeBasePathResponse {
  success: boolean;
  path: KnowledgeBasePathEntry[];
}

export interface KnowledgeBaseUploadSignature {
  success: boolean;
  upload: {
    cloudName: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    folder: string;
    resourceType: string;
    uploadUrl: string;
  };
}

export interface CloudinaryUploadResponse {
  public_id: string;
  secure_url?: string;
  url?: string;
  bytes: number;
  format?: string;
  original_filename?: string;
}

export async function getKnowledgeBaseListing(folderId: number | null = null) {
  const query = folderId === null ? "" : `?folderId=${folderId}`;
  return apiGet<KnowledgeBaseListing>(`${API_PREFIX}${query}`);
}

export async function getKnowledgeBasePath(folderId: number) {
  return apiGet<KnowledgeBasePathResponse>(`${API_PREFIX}/path/${folderId}`);
}

export async function createKnowledgeBaseFolder(name: string, parentId: number | null) {
  return apiPost<{ success: boolean; folder: KnowledgeBaseFolderDto }>(`${API_PREFIX}/folder`, {
    name,
    parentId,
  });
}

export async function renameKnowledgeBaseFolder(id: number, name: string) {
  return apiPatch<{ success: boolean; folder: KnowledgeBaseFolderDto }>(`${API_PREFIX}/folder/${id}`, {
    name,
  });
}

export async function deleteKnowledgeBaseFolder(id: number) {
  return apiDelete<{ success: boolean; message: string; deletedFiles?: number }>(
    `${API_PREFIX}/folder/${id}`
  );
}

export async function renameKnowledgeBaseFile(id: number, name: string) {
  return apiPatch<{ success: boolean; file: KnowledgeBaseFileDto }>(`${API_PREFIX}/file/${id}`, {
    name,
  });
}

export async function deleteKnowledgeBaseFile(id: number) {
  return apiDelete<{ success: boolean; message: string }>(`${API_PREFIX}/file/${id}`);
}

export async function getKnowledgeBaseUploadSignature() {
  return apiGet<KnowledgeBaseUploadSignature>(`${API_PREFIX}/upload-signature`);
}

export async function saveKnowledgeBaseFile(input: {
  name: string;
  url: string;
  cloudinaryId: string;
  size: number;
  format: string;
  folderId: number | null;
}) {
  return apiPost<{ success: boolean; file: KnowledgeBaseFileDto }>(`${API_PREFIX}/file`, input);
}

export function uploadKnowledgeBaseToCloudinary(
  file: File,
  upload: KnowledgeBaseUploadSignature["upload"],
  onProgress: (progress: number) => void
) {
  return new Promise<CloudinaryUploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file);
    formData.append("api_key", upload.apiKey);
    formData.append("timestamp", String(upload.timestamp));
    formData.append("signature", upload.signature);
    formData.append("folder", upload.folder);

    xhr.open("POST", upload.uploadUrl);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
      onProgress(progress);
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Cloudinary upload failed (${xhr.status})`));
        return;
      }

      try {
        const parsed = JSON.parse(xhr.responseText) as CloudinaryUploadResponse;
        resolve(parsed);
      } catch {
        reject(new Error("Cloudinary returned an invalid response"));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Cloudinary upload failed"));
    };

    xhr.send(formData);
  });
}
