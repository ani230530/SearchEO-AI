"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreVertical,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  createKnowledgeBaseFolder,
  deleteKnowledgeBaseFile,
  deleteKnowledgeBaseFolder,
  getKnowledgeBaseListing,
  getKnowledgeBasePath,
  getKnowledgeBaseUploadSignature,
  renameKnowledgeBaseFile,
  renameKnowledgeBaseFolder,
  saveKnowledgeBaseFile,
  uploadKnowledgeBaseToCloudinary,
  type KnowledgeBaseFileDto,
  type KnowledgeBaseFolderDto,
  type KnowledgeBaseListing,
  type KnowledgeBasePathEntry,
} from "../api/knowledgeBase";

const HOME_PATH: KnowledgeBasePathEntry = { id: null, name: "My Drive" };
const LISTING_ROOT_KEY = "root";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

const PREVIEWABLE_IMAGE_FORMATS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "avif",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "heif",
]);

const getFileExtension = (file: KnowledgeBaseFileDto) => {
  const fromName = file.name.split(".").pop()?.trim().toLowerCase();
  if (fromName) return fromName;
  return file.format.trim().toLowerCase();
};

const isPreviewableImageFile = (file: KnowledgeBaseFileDto) =>
  PREVIEWABLE_IMAGE_FORMATS.has(getFileExtension(file));

const buildCloudinaryPreviewUrl = (url: string) => {
  if (!url.includes("/upload/")) {
    return url;
  }

  return url.replace("/upload/", "/upload/c_fill,w_900,h_640,g_auto,f_auto,q_auto/");
};

const getFileTypeLabel = (file: KnowledgeBaseFileDto) => {
  const extension = getFileExtension(file);
  return extension ? extension.toUpperCase() : "FILE";
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const listingKey = (folderId: number | null) =>
  folderId === null ? LISTING_ROOT_KEY : `folder-${folderId}`;

const safeMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const normalizeDrivePath = (path: KnowledgeBasePathEntry[]) =>
  path.length > 0 ? [HOME_PATH, ...path.slice(1)] : [HOME_PATH];

async function fetchDriveTree(
  folderId: number | null = null,
  cache: Record<string, KnowledgeBaseListing> = {},
  seen = new Set<string>()
): Promise<Record<string, KnowledgeBaseListing>> {
  const key = listingKey(folderId);
  if (seen.has(key)) return cache;
  seen.add(key);

  const listing = await getKnowledgeBaseListing(folderId);
  cache[key] = listing;

  for (const folder of listing.folders) {
    await fetchDriveTree(folder.id, cache, seen);
  }

  return cache;
}

interface UploadJob {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "complete" | "error";
  detail: string;
}

interface UploadTimers {
  removeTimer?: ReturnType<typeof setTimeout>;
}

type FileUploadPlan = {
  file: File;
  displayName: string;
  relativePath: string;
  relativeFolderSegments: string[];
  jobId: string;
  targetFolderId: number | null;
};

const KnowledgeBaseSection = () => {
  const [driveListings, setDriveListings] = useState<Record<string, KnowledgeBaseListing>>({});
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [currentPath, setCurrentPath] = useState<KnowledgeBasePathEntry[]>([HOME_PATH]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("Untitled folder");
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<KnowledgeBaseFolderDto | null>(null);
  const [editingFileId, setEditingFileId] = useState<number | null>(null);
  const [renameFileName, setRenameFileName] = useState("");
  const [fileToDelete, setFileToDelete] = useState<KnowledgeBaseFileDto | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<number | null>(null);
  const [openFileMenuId, setOpenFileMenuId] = useState<number | null>(null);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTimersRef = useRef<Map<string, UploadTimers>>(new Map());

  const refreshListings = async () => {
    const tree = await fetchDriveTree();
    setDriveListings(tree);
  };

  const refreshCurrentPath = async (folderId: number | null) => {
    if (folderId === null) {
      setCurrentPath([HOME_PATH]);
      return;
    }

    const response = await getKnowledgeBasePath(folderId);
    setCurrentPath(normalizeDrivePath(response.path));
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      setIsLoading(true);
      try {
        const tree = await fetchDriveTree();
        if (cancelled) return;
        setDriveListings(tree);
        setCurrentPath([HOME_PATH]);
      } catch (error) {
        if (cancelled) return;
        setNotice({
          type: "error",
          message: safeMessage(error, "Could not load the knowledge base."),
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openFolderMenuId && !openFileMenuId) return;

    const handleClickOutside = () => {
      setOpenFolderMenuId(null);
      setOpenFileMenuId(null);
    };

    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [openFolderMenuId, openFileMenuId]);

  useEffect(() => {
    setOpenFolderMenuId(null);
    setOpenFileMenuId(null);
  }, [searchTerm, selectedFolderId]);

  const folderIndex = useMemo(() => {
    const map = new Map<number, KnowledgeBaseFolderDto>();
    Object.values(driveListings).forEach((listing) => {
      listing.folders.forEach((folder) => {
        map.set(folder.id, folder);
      });
    });
    return map;
  }, [driveListings]);

  const fileIndex = useMemo(() => {
    const map = new Map<number, KnowledgeBaseFileDto>();
    Object.values(driveListings).forEach((listing) => {
      listing.files.forEach((file) => {
        map.set(file.id, file);
      });
    });
    return map;
  }, [driveListings]);

  const folderPathCache = useMemo(() => {
    const cache = new Map<number, KnowledgeBasePathEntry[]>();

    const resolvePath = (folderId: number, stack = new Set<number>()): KnowledgeBasePathEntry[] => {
      if (cache.has(folderId)) {
        return cache.get(folderId)!;
      }

      if (stack.has(folderId)) {
        return [HOME_PATH, { id: folderId, name: folderIndex.get(folderId)?.name ?? "Folder" }];
      }

      const folder = folderIndex.get(folderId);
      if (!folder) {
        return [HOME_PATH];
      }

      stack.add(folderId);
      const parentPath =
        folder.parentId === null ? [HOME_PATH] : resolvePath(folder.parentId, stack);
      const result = [...parentPath, { id: folder.id, name: folder.name }];
      cache.set(folderId, result);
      stack.delete(folderId);
      return result;
    };

    folderIndex.forEach((_, folderId) => {
      resolvePath(folderId);
    });

    return cache;
  }, [folderIndex]);

  const activeListing = driveListings[listingKey(selectedFolderId)];
  const allFolders = Array.from(folderIndex.values());
  const allFiles = Array.from(fileIndex.values());
  const searchQuery = searchTerm.trim().toLowerCase();
  const isSearching = searchQuery.length > 0;

  const visibleFolders = useMemo(() => {
    if (isSearching) {
      return allFolders.filter((folder) => {
        const pathText =
          folderPathCache.get(folder.id)?.map((entry) => entry.name).join(" / ") ?? folder.name;
        return (
          folder.name.toLowerCase().includes(searchQuery) ||
          pathText.toLowerCase().includes(searchQuery)
        );
      });
    }

    return activeListing?.folders ?? [];
  }, [activeListing, allFolders, folderPathCache, isSearching, searchQuery]);

  const visibleFiles = useMemo(() => {
    if (isSearching) {
      return allFiles.filter((file) => {
        const pathText = formatFilePath(file, folderPathCache);
        return (
          file.name.toLowerCase().includes(searchQuery) ||
          pathText.toLowerCase().includes(searchQuery)
        );
      });
    }

    return activeListing?.files ?? [];
  }, [activeListing, allFiles, folderPathCache, isSearching, searchQuery]);

  const folderFileCount = (folderId: number) =>
    driveListings[listingKey(folderId)]?.files.length ?? 0;

  const updateUploadJob = (jobId: string, patch: Partial<UploadJob>) => {
    setUploadJobs((current) =>
      current.map((job) => (job.id === jobId ? { ...job, ...patch } : job))
    );
  };

  const clearUploadJobTimers = (jobId: string) => {
    const timers = uploadTimersRef.current.get(jobId);
    if (!timers) return;

    if (timers.removeTimer) {
      clearTimeout(timers.removeTimer);
    }

    uploadTimersRef.current.delete(jobId);
  };

  const removeUploadJob = (jobId: string) => {
    clearUploadJobTimers(jobId);
    setUploadJobs((current) => current.filter((job) => job.id !== jobId));
  };

  const scheduleUploadRemoval = (jobId: string, delayMs: number) => {
    clearUploadJobTimers(jobId);
    const removeTimer = setTimeout(() => {
      removeUploadJob(jobId);
    }, delayMs);
    uploadTimersRef.current.set(jobId, { removeTimer });
  };

  const dismissUploadTray = () => {
    Array.from(uploadTimersRef.current.keys()).forEach((jobId) => {
      clearUploadJobTimers(jobId);
    });
    setUploadJobs([]);
  };

  const closeNotice = () => setNotice(null);

  const openFolderMenu = (folderId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setOpenFileMenuId(null);
    setOpenFolderMenuId((current) => (current === folderId ? null : folderId));
  };

  const openFileMenu = (fileId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setOpenFolderMenuId(null);
    setOpenFileMenuId((current) => (current === fileId ? null : fileId));
  };

  const handleNavigateToFolder = async (folderId: number | null) => {
    setSelectedFolderId(folderId);
    try {
      if (folderId === null) {
        setCurrentPath([HOME_PATH]);
        return;
      }

      await refreshCurrentPath(folderId);
    } catch (error) {
      setNotice({
        type: "error",
        message: safeMessage(error, "Could not load the folder path."),
      });
    }
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    try {
      await createKnowledgeBaseFolder(trimmed, selectedFolderId);
      setShowNewFolderModal(false);
      setNewFolderName("Untitled folder");
      await refreshListings();
      setNotice({ type: "success", message: `Folder "${trimmed}" created.` });
    } catch (error) {
      setNotice({
        type: "error",
        message: safeMessage(error, "Could not create the folder."),
      });
    }
  };

  const handleRenameFolder = async () => {
    const trimmed = renameFolderName.trim();
    if (!editingFolderId || !trimmed) return;

    try {
      await renameKnowledgeBaseFolder(editingFolderId, trimmed);
      setEditingFolderId(null);
      setRenameFolderName("");
      await refreshListings();
      if (selectedFolderId !== null) {
        await refreshCurrentPath(selectedFolderId);
      }
      setNotice({ type: "success", message: `Folder renamed to "${trimmed}".` });
    } catch (error) {
      setNotice({
        type: "error",
        message: safeMessage(error, "Could not rename the folder."),
      });
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;

    const nextSelectedFolderId = folderToDelete.parentId;
    try {
      await deleteKnowledgeBaseFolder(folderToDelete.id);
      setFolderToDelete(null);
      setSelectedFolderId(nextSelectedFolderId);
      await refreshListings();
      await refreshCurrentPath(nextSelectedFolderId);
      setNotice({
        type: "success",
        message: `Folder "${folderToDelete.name}" deleted.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: safeMessage(error, "Could not delete the folder."),
      });
    }
  };

  const handleRenameFile = async () => {
    const trimmed = renameFileName.trim();
    if (!editingFileId || !trimmed) return;

    try {
      await renameKnowledgeBaseFile(editingFileId, trimmed);
      setEditingFileId(null);
      setRenameFileName("");
      await refreshListings();
      setNotice({ type: "success", message: `File renamed to "${trimmed}".` });
    } catch (error) {
      setNotice({
        type: "error",
        message: safeMessage(error, "Could not rename the file."),
      });
    }
  };

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;

    try {
      await deleteKnowledgeBaseFile(fileToDelete.id);
      setFileToDelete(null);
      await refreshListings();
      setNotice({ type: "success", message: `File "${fileToDelete.name}" deleted.` });
    } catch (error) {
      setNotice({
        type: "error",
        message: safeMessage(error, "Could not delete the file."),
      });
    }
  };

  const folderRegistryKey = (parentId: number | null, name: string) =>
    `${parentId ?? "root"}::${name.trim().toLowerCase()}`;

  const ensureFolderChain = async (
    relativeSegments: string[],
    baseParentId: number | null,
    registry: Map<string, KnowledgeBaseFolderDto>
  ) => {
    let parentId = baseParentId;

    for (const rawSegment of relativeSegments) {
      const segment = rawSegment.trim();
      if (!segment) continue;

      const key = folderRegistryKey(parentId, segment);
      const existing = registry.get(key);
      if (existing) {
        parentId = existing.id;
        continue;
      }

      const created = await createKnowledgeBaseFolder(segment, parentId);
      registry.set(key, created.folder);
      parentId = created.folder.id;
    }

    return parentId;
  };

  const queueUploadJobs = (plans: FileUploadPlan[]) => {
    setUploadJobs((current) => [
      ...plans.map((plan) => ({
        id: plan.jobId,
        name: plan.displayName,
        progress: 0,
        status: "uploading" as const,
        detail: "Queued",
      })),
      ...current,
    ]);
  };

  const performUploadPlan = async (plan: FileUploadPlan): Promise<boolean> => {
    try {
      updateUploadJob(plan.jobId, {
        detail: "Upload in progress",
        progress: 10,
      });

      const signature = await getKnowledgeBaseUploadSignature();
      updateUploadJob(plan.jobId, { detail: "Upload in progress", progress: 20 });

      const uploaded = await uploadKnowledgeBaseToCloudinary(
        plan.file,
        signature.upload,
        (progress) => {
          updateUploadJob(plan.jobId, {
            progress: Math.min(98, Math.max(20, progress)),
            detail: "Upload in progress",
          });
        }
      );

      updateUploadJob(plan.jobId, {
        detail: "Finalizing upload",
        progress: 98,
      });

      const response = await saveKnowledgeBaseFile({
        name: plan.file.name,
        url: uploaded.secure_url ?? uploaded.url ?? "",
        cloudinaryId: uploaded.public_id,
        size: uploaded.bytes ?? plan.file.size,
        format:
          uploaded.format ??
          plan.file.name.split(".").pop()?.toLowerCase() ??
          "raw",
        folderId: plan.targetFolderId,
      });

      if (!response.file) {
        throw new Error("File metadata could not be saved");
      }

      updateUploadJob(plan.jobId, {
        detail: "Upload complete",
        progress: 100,
        status: "complete",
      });
      scheduleUploadRemoval(plan.jobId, 3200);
      return true;
    } catch (error) {
      updateUploadJob(plan.jobId, {
        detail: safeMessage(error, "Upload failed"),
        progress: 100,
        status: "error",
      });
      scheduleUploadRemoval(plan.jobId, 5000);
      return false;
    }
  };

  const prepareAndUploadFiles = async (files: FileList | File[], isFolderUpload: boolean) => {
    const sourceFiles = Array.from(files);
    if (!sourceFiles.length) return;

    const plans: FileUploadPlan[] = sourceFiles.map((file) => {
      const relativePath = file.webkitRelativePath || file.name;
      const relativeSegments = isFolderUpload
        ? relativePath.split("/").filter(Boolean).slice(0, -1)
        : [];
      return {
        file,
        displayName: relativePath,
        relativePath,
        relativeFolderSegments: relativeSegments,
        jobId: createId(),
        targetFolderId: selectedFolderId,
      };
    });

    queueUploadJobs(plans);

    const registry = new Map<string, KnowledgeBaseFolderDto>();
    allFolders.forEach((folder) => {
      registry.set(folderRegistryKey(folder.parentId, folder.name), folder);
    });

    try {
      for (const plan of plans) {
        if (plan.relativeFolderSegments.length > 0) {
          plan.targetFolderId = await ensureFolderChain(
            plan.relativeFolderSegments,
            selectedFolderId,
            registry
          );
        }
      }

      const results = await Promise.all(plans.map((plan) => performUploadPlan(plan)));
      const successCount = results.filter(Boolean).length;
      const failureCount = results.length - successCount;

      await refreshListings();

      if (failureCount === 0) {
        setNotice({
          type: "success",
          message: `${successCount} file${successCount === 1 ? "" : "s"} uploaded${
            isFolderUpload ? " from folder" : ""
          }.`,
        });
      } else {
        setNotice({
          type: "error",
          message: `${successCount} file${successCount === 1 ? "" : "s"} uploaded and ${failureCount} failed.`,
        });
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: safeMessage(error, "Upload failed."),
      });
    }
  };

  const handleFileUploadClick = () => fileInputRef.current?.click();

  const handleFolderUploadClick = () => {
    const input = folderInputRef.current;
    if (!input) return;

    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.click();
  };

  const renderFilePath = (file: KnowledgeBaseFileDto) => {
    const path = file.folderId === null ? [HOME_PATH] : folderPathCache.get(file.folderId) ?? [HOME_PATH];
    return [...path, { id: file.id, name: file.name }].map((entry) => entry.name).join(" / ");
  };

  const hasDriveContent = allFolders.length > 0 || allFiles.length > 0;

  return (
    <div className="relative">
      <div className="max-w-full px-2">
        <div className="mb-6 p-2">
          <div className="flex flex-col gap-4 p-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                My Drive
              </h1>
              <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500"
              >
                {currentPath.map((entry, index) => (
                  <React.Fragment key={`${entry.id ?? "root"}-${index}`}>
                    {index > 0 && <ChevronRight className="h-4 w-4 text-slate-300" />}
                    {entry.id === null ? (
                      <button
                        type="button"
                        onClick={() => void handleNavigateToFolder(null)}
                        className={`rounded-full px-2.5 py-1 transition ${
                          selectedFolderId === null
                            ? "bg-slate-100 font-medium text-slate-900"
                            : "hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        {entry.name}
                      </button>
                    ) : index === currentPath.length - 1 ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-900">
                        {entry.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleNavigateToFolder(entry.id)}
                        className="rounded-full px-2.5 py-1 transition hover:bg-slate-100 hover:text-slate-900"
                      >
                        {entry.name}
                      </button>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-[18rem] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search in drive"
                  className="w-full border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowNewFolderModal(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <FolderPlus className="h-4 w-4" />
                New Folder
              </button>
              <button
                type="button"
                onClick={handleFileUploadClick}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" />
                File Upload
              </button>
              <button
                type="button"
                onClick={handleFolderUploadClick}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <FolderOpen className="h-4 w-4" />
                Upload Folder
              </button>
            </div>
          </div>
        </div>

        {notice && (
          <div
            className={`mb-6 flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm ${
              notice.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            <div className="flex items-start gap-3">
              {notice.type === "error" ? (
                <AlertCircle className="mt-0.5 h-4 w-4" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4" />
              )}
              <p className="leading-6">{notice.message}</p>
            </div>
            <button
              type="button"
              onClick={closeNotice}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-black/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const uploadedFiles = event.target.files;
            if (uploadedFiles && uploadedFiles.length > 0) {
              void prepareAndUploadFiles(uploadedFiles, false);
            }
            event.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const uploadedFiles = event.target.files;
            if (uploadedFiles && uploadedFiles.length > 0) {
              void prepareAndUploadFiles(uploadedFiles, true);
            }
            event.target.value = "";
          }}
        />

        {isLoading ? (
          <div className="rounded-[32px] border border-dashed border-slate-200 bg-slate-50 px-8 py-16 text-center text-sm text-slate-500">
            <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-slate-400" />
            Loading knowledge base...
          </div>
        ) : !hasDriveContent ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-8 flex h-48 w-48 items-center justify-center rounded-[36px] bg-slate-50 text-slate-400 shadow-sm">
              <div className="grid h-full w-full place-items-center rounded-3xl border border-dashed border-slate-200 bg-white text-slate-400">
                <img src="/file-upload.png" alt="Empty drive" className="h-full w-full" />
              </div>
            </div>
            <h2 className="text-4xl font-semibold text-slate-900">No files yet</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500">
              Create a folder to organize your documents and help AI generate more professional SEO
              content.
            </p>
          </div>
        ) : (
          <main className="space-y-6">
            {visibleFolders.length > 0 && (
              <section className="p-5 pt-0">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Folders</p>

                <div className="mt-5 grid gap-4 xl:grid-cols-5">
                  {visibleFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className="relative rounded-[24px] border border-slate-200 bg-slate-50 p-3.5 pr-10 shadow-sm transition hover:border-slate-300 hover:bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => void handleNavigateToFolder(folder.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                            <Folder className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[0.95rem] font-semibold leading-5 text-slate-900">
                              {folder.name}
                            </p>
                            <p className="mt-0.5 truncate text-[0.8rem] text-slate-500">
                              {folderFileCount(folder.id)} file
                              {folderFileCount(folder.id) === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => openFolderMenu(folder.id, event)}
                        aria-label="Folder menu"
                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                      {openFolderMenuId === folder.id && (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          className="absolute right-2 top-12 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFolderId(folder.id);
                              setRenameFolderName(folder.name);
                              setOpenFolderMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFolderToDelete(folder);
                              setOpenFolderMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-slate-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Files</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {isSearching ? "Search across the drive" : "Sorted by recent upload"}
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-4">
                {visibleFiles.length > 0 ? (
                  visibleFiles.map((file) => (
                    <div
                      key={file.id}
                      className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                    >
                      <button
                        type="button"
                        onClick={(event) => openFileMenu(file.id, event)}
                        aria-label="File menu"
                        className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {openFileMenuId === file.id && (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          className="absolute right-3 top-14 z-20 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFileId(file.id);
                              setRenameFileName(file.name);
                              setOpenFileMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFileToDelete(file);
                              setOpenFileMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-slate-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}

                      <div className="p-4">
                        <div className="flex items-center gap-3 pr-10">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {renderFilePath(file)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                          {isPreviewableImageFile(file) ? (
                            <img
                              src={buildCloudinaryPreviewUrl(file.url)}
                              alt={file.name}
                              className="h-44 w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-44 flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 text-slate-400">
                              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
                                <FileText className="h-7 w-7" />
                              </div>
                              <div className="text-center">
                                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">
                                  Preview unavailable
                                </p>
                                <p className="mt-2 text-sm font-medium text-slate-600">
                                  {getFileTypeLabel(file)}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                            {formatBytes(file.size)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                            {formatDate(file.createdAt)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                            {getFileTypeLabel(file)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-8 py-10 text-center text-sm text-slate-500">
                    {isSearching ? "No matches found." : "No files found in this folder yet."}
                  </div>
                )}
              </div>
            </section>
          </main>
        )}
      </div>

      {uploadJobs.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-medium text-slate-700">
              {uploadJobs.filter((job) => job.status === "complete").length > 0 &&
              uploadJobs.every((job) => job.status !== "uploading")
                ? `${uploadJobs.filter((job) => job.status === "complete").length} Upload Complete`
                : "Upload in progress"}
            </p>
            <button
              type="button"
              onClick={dismissUploadTray}
              aria-label="Dismiss upload tray"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-auto">
            {uploadJobs.map((job) => (
              <div key={job.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      job.status === "error"
                        ? "bg-red-50 text-red-500"
                        : job.status === "complete"
                          ? "bg-emerald-50 text-emerald-500"
                          : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    {job.status === "error" ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : job.status === "complete" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-slate-700">{job.name}</p>
                      <span className="flex-none text-xs font-medium text-slate-500">
                        {job.status === "error"
                          ? "Error"
                          : job.status === "complete"
                            ? "Done"
                            : `${Math.round(job.progress)}%`}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          job.status === "complete"
                            ? "bg-emerald-500"
                            : job.status === "error"
                              ? "bg-red-500"
                              : "bg-slate-900"
                        }`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{job.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowNewFolderModal(false);
              setNewFolderName("Untitled folder");
            }}
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
            <h3 className="mb-6 text-xl font-light tracking-tight text-slate-900">
              Create New Folder
            </h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateFolder();
              }}
              className="space-y-6"
            >
              <div>
                <label className="mb-2 block text-base font-light text-slate-900">Title</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="Enter folder name"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewFolderModal(false);
                    setNewFolderName("Untitled folder");
                  }}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-900 px-6 py-3 text-white hover:opacity-90"
                  style={{
                    background: "linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)",
                  }}
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingFolderId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setEditingFolderId(null);
              setRenameFolderName("");
            }}
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
            <h3 className="mb-6 text-xl font-light tracking-tight text-slate-900">Rename Folder</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleRenameFolder();
              }}
              className="space-y-6"
            >
              <div>
                <label className="mb-2 block text-base font-light text-slate-900">Folder name</label>
                <input
                  type="text"
                  value={renameFolderName}
                  onChange={(event) => setRenameFolderName(event.target.value)}
                  placeholder="Enter folder name"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingFolderId(null);
                    setRenameFolderName("");
                  }}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-900 px-6 py-3 text-white hover:opacity-90"
                  style={{
                    background: "linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)",
                  }}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setFolderToDelete(null)}
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
            <h3 className="mb-6 text-xl font-light tracking-tight text-slate-900">Delete Folder</h3>
            <p className="mb-6 text-sm leading-6 text-slate-600">
              Are you sure you want to delete "{folderToDelete.name}"? This will remove any files
              inside it.
            </p>
            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => setFolderToDelete(null)}
                className="rounded-2xl border border-slate-200 px-6 py-3 text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteFolder()}
                className="rounded-2xl bg-red-600 px-6 py-3 text-white hover:opacity-90"
              >
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {editingFileId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setEditingFileId(null);
              setRenameFileName("");
            }}
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
            <h3 className="mb-6 text-xl font-light tracking-tight text-slate-900">Rename File</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleRenameFile();
              }}
              className="space-y-6"
            >
              <div>
                <label className="mb-2 block text-base font-light text-slate-900">File name</label>
                <input
                  type="text"
                  value={renameFileName}
                  onChange={(event) => setRenameFileName(event.target.value)}
                  placeholder="Enter file name"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingFileId(null);
                    setRenameFileName("");
                  }}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-900 px-6 py-3 text-white hover:opacity-90"
                  style={{
                    background: "linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)",
                  }}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setFileToDelete(null)}
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
            <h3 className="mb-6 text-xl font-light tracking-tight text-slate-900">Delete File</h3>
            <p className="mb-6 text-sm leading-6 text-slate-600">
              Are you sure you want to delete "{fileToDelete.name}"? This file will be removed from
              your drive.
            </p>
            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                className="rounded-2xl border border-slate-200 px-6 py-3 text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteFile()}
                className="rounded-2xl bg-red-600 px-6 py-3 text-white hover:opacity-90"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatFilePath(
  file: KnowledgeBaseFileDto,
  folderPathCache: Map<number, KnowledgeBasePathEntry[]>
) {
  const path = file.folderId === null ? [HOME_PATH] : folderPathCache.get(file.folderId) ?? [HOME_PATH];
  return [...path, { id: file.id, name: file.name }].map((entry) => entry.name).join(" / ");
}

export default KnowledgeBaseSection;
