"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  FolderPlus,
  Upload,
  FolderOpen,
  HelpCircle,
  UserCircle,
  Folder,
  FileText,
  MoreVertical,
} from "lucide-react";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface FolderItem {
  id: string;
  name: string;
  createdAt: string;
}

interface FileItem {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
  path: string;
  folderId?: string;
}

const KnowledgeBaseSection = () => {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const storageKey = "knowledge-base-data";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as {
        folders: FolderItem[];
        files: FileItem[];
        selectedFolderId?: string | null;
      };
      setFolders(parsed.folders || []);
      setFiles(parsed.files || []);
      setSelectedFolderId(parsed.selectedFolderId || null);
    } catch {
      // ignore invalid saved state
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ folders, files, selectedFolderId })
    );
  }, [folders, files, selectedFolderId]);

  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("Untitled folder");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [showDeleteFolderModal, setShowDeleteFolderModal] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<FolderItem | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);

  const openNewFolderModal = () => {
    setNewFolderName("Untitled folder");
    setShowNewFolderModal(true);
  };

  const handleNewFolder = () => {
    if (!newFolderName?.trim()) {
      return;
    }

    const newFolder: FolderItem = {
      id: createId(),
      name: newFolderName.trim(),
      createdAt: new Date().toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      }),
    };

    setFolders((current) => [newFolder, ...current]);
    setShowNewFolderModal(false);
    setNewFolderName("Untitled folder");
  };

  const cancelNewFolder = () => {
    setShowNewFolderModal(false);
    setNewFolderName("Untitled folder");
  };

  const openRenameFolderModal = (folderId: string, folderName: string) => {
    setEditingFolderId(folderId);
    setRenameFolderName(folderName);
  };

  const handleRenameFolder = () => {
    if (!editingFolderId || !renameFolderName?.trim()) return;

    setFolders((current) =>
      current.map((folder) =>
        folder.id === editingFolderId
          ? { ...folder, name: renameFolderName.trim() }
          : folder
      )
    );
    setEditingFolderId(null);
    setRenameFolderName("");
  };

  const cancelRenameFolder = () => {
    setEditingFolderId(null);
    setRenameFolderName("");
  };

  const openDeleteFolderModal = (folder: FolderItem) => {
    setFolderToDelete(folder);
    setShowDeleteFolderModal(true);
  };

  const handleDeleteFolder = () => {
    if (!folderToDelete) return;

    setFolders((current) => current.filter((item) => item.id !== folderToDelete.id));
    setFiles((current) => current.filter((file) => file.folderId !== folderToDelete.id));
    if (selectedFolderId === folderToDelete.id) {
      setSelectedFolderId(null);
    }
    setFolderToDelete(null);
    setShowDeleteFolderModal(false);
    setOpenFolderMenuId(null);
  };

  const cancelDeleteFolder = () => {
    setFolderToDelete(null);
    setShowDeleteFolderModal(false);
    setOpenFolderMenuId(null);
  };

  React.useEffect(() => {
    if (!openFolderMenuId) return;

    const handleClickOutside = () => setOpenFolderMenuId(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [openFolderMenuId]);

  const handleFileUploadClick = () => fileInputRef.current?.click();
  const handleFolderUploadClick = () => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute("webkitdirectory", "");
    folderInputRef.current.setAttribute("directory", "");
    folderInputRef.current.click();
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || !uploadedFiles.length) return;

    const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
    const newFiles = Array.from(uploadedFiles).map((file) => ({
      id: createId(),
      name: file.name,
      size: formatBytes(file.size),
      uploadedAt: new Date().toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      }),
      path: selectedFolder ? `${selectedFolder.name}/${file.name}` : file.webkitRelativePath || file.name,
      folderId: selectedFolder ? selectedFolder.id : undefined,
    }));

    setFiles((current) => [...newFiles, ...current]);
    setMessage(`${newFiles.length} file${newFiles.length === 1 ? "" : "s"} uploaded.`);
    event.target.value = "";
  };

  const handleFolderFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || !uploadedFiles.length) return;

    const fileArray = Array.from(uploadedFiles);
    const existingFolderMap = new Map(folders.map((folder) => [folder.name.toLowerCase(), folder.id]));
    const newFolders: FolderItem[] = [];

    const newFiles = fileArray.map((file) => {
      const path = file.webkitRelativePath || file.name;
      const rootFolder = path.split("/")[0] || file.name;
      const normalizedRoot = rootFolder.toLowerCase();
      let folderId = existingFolderMap.get(normalizedRoot);
      if (!folderId) {
        const created = {
          id: createId(),
          name: rootFolder,
          createdAt: new Date().toLocaleDateString("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
          }),
        };
        folderId = created.id;
        existingFolderMap.set(normalizedRoot, created.id);
        newFolders.push(created);
      }
      return {
        id: createId(),
        name: file.name,
        size: formatBytes(file.size),
        uploadedAt: new Date().toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        }),
        path,
        folderId,
      };
    });

    setFiles((current) => [...newFiles, ...current]);
    setFolders((current) => [...newFolders, ...current]);
    setMessage(`${fileArray.length} file${fileArray.length === 1 ? "" : "s"} uploaded from folder.`);
    event.target.value = "";
  };

  const moveFileToFolder = (fileId: string, folderId?: string) => {
    setFiles((current) =>
      current.map((item) => {
        if (item.id !== fileId) return item;
        const folder = folders.find((folderItem) => folderItem.id === folderId);
        return {
          ...item,
          folderId,
          path: folder ? `${folder.name}/${item.name}` : item.name,
        };
      })
    );
  };

  const filteredFiles = useMemo(() => {
    const currentFiles = selectedFolderId
      ? files.filter((file) => file.folderId === selectedFolderId)
      : files;

    return currentFiles.filter(
      (file) =>
        file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.path.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [files, searchTerm, selectedFolderId]);

  const filteredFolders = useMemo(() => {
    return folders
      .filter((folder) =>
        folder.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .map((folder) => ({
        ...folder,
        fileCount: files.filter((file) => file.folderId === folder.id).length,
      }));
  }, [folders, files, searchTerm]);

  return (
    <div className="pt-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6  p-6">
          <div className="flex items-center justify-between gap-6">
            <div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">My Drive</h1>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
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
                onClick={openNewFolderModal}
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

        <div className="space-y-6">
          <main className="space-y-6">

            {folders.length > 0 && (
            <div className="p-5 pt-0">
              <div className="flex items-center justify-end gap-3">
                {selectedFolderId ? (
                  <button
                    type="button"
                    onClick={() => setSelectedFolderId(null)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    Back to all folders
                  </button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-5">
                {filteredFolders.length > 0 ? (
                  filteredFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className={`relative  p-4 transition ${
                        selectedFolderId === folder.id
                          ? "border-slate-900 bg-slate-950 text-white rounded-lg"
                          : "border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300 hover:bg-white rounded-lg"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFolderId(folder.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-3xl bg-white text-slate-700 shadow-sm">
                            <Folder className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{folder.name}</p>
                            <p className="mt-1 text-xs text-slate-500 truncate">{folder.fileCount} file{folder.fileCount === 1 ? "" : "s"}</p>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenFolderMenuId((current) =>
                            current === folder.id ? null : folder.id
                          );
                        }}
                        aria-label="Folder menu"
                        className="absolute right-2 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {openFolderMenuId === folder.id && (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          className="absolute right-4 top-16 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              openRenameFolderModal(folder.id, folder.name);
                              setOpenFolderMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              openDeleteFolderModal(folder);
                              setOpenFolderMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-slate-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="col-span-full rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-8 py-10 text-center text-sm text-slate-500">
                    No folders found.
                  </div>
                )}
              </div>
            </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFolderFilesSelected}
            />

            {showNewFolderModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  onClick={cancelNewFolder}
                />
                <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
                  <h3 className="text-xl font-light tracking-tight text-slate-900 mb-6">
                    Create New Folder
                  </h3>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleNewFolder();
                    }}
                    className="space-y-6"
                  >
                    <div>
                      <label className="block text-base font-light text-slate-900 mb-2">
                        Title
                      </label>
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
                        onClick={cancelNewFolder}
                        className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-3 rounded-2xl bg-slate-900 text-white hover:opacity-90"
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

            {editingFolderId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  onClick={cancelRenameFolder}
                />
                <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
                  <h3 className="text-xl font-light tracking-tight text-slate-900 mb-6">
                    Rename Folder
                  </h3>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleRenameFolder();
                    }}
                    className="space-y-6"
                  >
                    <div>
                      <label className="block text-base font-light text-slate-900 mb-2">
                        Folder name
                      </label>
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
                        onClick={cancelRenameFolder}
                        className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-3 rounded-2xl bg-slate-900 text-white hover:opacity-90"
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

            {showDeleteFolderModal && folderToDelete && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  onClick={cancelDeleteFolder}
                />
                <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
                  <h3 className="text-xl font-light tracking-tight text-slate-900 mb-6">
                    Delete Folder
                  </h3>
                  <p className="mb-6 text-sm leading-6 text-slate-600">
                    Are you sure you want to delete "{folderToDelete.name}"? This will remove any files inside it.
                  </p>
                  <div className="flex items-center justify-end gap-4">
                    <button
                      type="button"
                      onClick={cancelDeleteFolder}
                      className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-700 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteFolder}
                      className="px-6 py-3 rounded-2xl bg-red-600 text-white hover:opacity-90"
                    >
                      Delete Folder
                    </button>
                  </div>
                </div>
              </div>
            )}

            {message && (
              <div className="rounded-[30px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {message}
              </div>
            )}

            {folders.length > 0 || files.length > 0 ? (
              <>
                <div className="p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Files</p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-900">
                        {selectedFolderId
                          ? folders.find((folder) => folder.id === selectedFolderId)?.name || "Folder contents"
                          : "Recent files"}
                      </h2>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      Sorted by recent upload
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-4">
                    {filteredFiles.length > 0 ? (
                      filteredFiles.map((file) => (
                        <div
                          key={file.id}
                          className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm transition hover:border-slate-300 hover:bg-white"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-white text-slate-700 shadow-sm">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-slate-900">{file.name}</p>
                              <p className="mt-2 text-sm text-slate-500 truncate">{file.path}</p>
                            </div>
                          </div>

                        </div>
                      ))
                    ) : (
                      <div className="col-span-full rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-8 py-10 text-center text-sm text-slate-500">
                        No files found in this folder yet.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className=" p-10 text-center">
                <div className="mx-auto mb-8 flex h-48 w-48 items-center justify-center rounded-[36px] bg-slate-50 text-slate-400 shadow-sm">
                  <div className="grid h-full w-full place-items-center rounded-3xl border border-dashed border-slate-200 bg-white text-slate-400">
                   <img src="/file-upload.png" alt="Empty drive" className="h-full w-full" />
                  </div>
                </div>
                <h2 className="text-4xl font-semibold text-slate-900">No files yet</h2>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500">
                  Create a folder to organize your documents and help AI generate more professional SEO content.
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseSection;
