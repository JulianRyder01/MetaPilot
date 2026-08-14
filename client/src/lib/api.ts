/** 后端 API 客户端。 */
import { toast } from "@/lib/toast"

import { useSettingsStore } from "@/stores/settings"

export const BASE = "/api"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      detail = data.detail || detail
    } catch {
      /* ignore */
    }
    // 插件未启用导致的 503：按用户设置决定是否弹气泡（sonner 顶部提示，不打断操作）
    if (res.status === 503 && typeof detail === "string" && detail.includes("插件")) {
      if (useSettingsStore.getState().showPluginErrors) {
        toast.error(detail, { duration: 5000 })
      }
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  // 库
  listLibraries: () => request<LibraryMeta[]>("/libraries"),
  createLibrary: (name: string, description = "") =>
    request<Library>("/libraries", { method: "POST", body: JSON.stringify({ name, description }) }),
  getLibrary: (id: string) => request<Library>(`/libraries/${id}`),
  updateLibrary: (id: string, name: string, description: string) =>
    request<Library>(`/libraries/${id}`, { method: "PUT", body: JSON.stringify({ name, description }) }),
  deleteLibrary: (id: string) => request<{ ok: boolean }>(`/libraries/${id}`, { method: "DELETE" }),

  // 文档集（课程）
  getCollection: (id: string) => request<Collection>(`/collections/${id}`),
  createCollection: (libId: string, data: Partial<Collection>) =>
    request<Collection>(`/libraries/${libId}/collections`, { method: "POST", body: JSON.stringify(data) }),
  updateCollection: (id: string, data: Partial<Collection>) =>
    request<Collection>(`/collections/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updateCollectionCanvas: (id: string, nodes: CanvasNode[], edges: CanvasEdge[]) =>
    request<Collection>(`/collections/${id}/canvas`, {
      method: "PUT",
      body: JSON.stringify({ nodes, edges }),
    }),
  deleteCollection: (id: string) => request<{ ok: boolean }>(`/collections/${id}`, { method: "DELETE" }),

  // 文档（章节）
  createDocument: (cid: string, data: { name: string; docType: string; folderId?: string }) =>
    request<Document>(`/collections/${cid}/documents`, { method: "POST", body: JSON.stringify(data) }),
  updateDocument: (id: string, data: { name: string; docType: string; folderId?: string }) =>
    request<Document>(`/documents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDocument: (id: string) => request<{ ok: boolean }>(`/documents/${id}`, { method: "DELETE" }),

  // 文件夹
  createFolder: (cid: string, data: { name: string; parentId?: string }) =>
    request<Folder>(`/collections/${cid}/folders`, { method: "POST", body: JSON.stringify(data) }),
  updateFolder: (id: string, data: { name?: string; parentId?: string }) =>
    request<Folder>(`/folders/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteFolder: (id: string) => request<{ ok: boolean }>(`/folders/${id}`, { method: "DELETE" }),

  // 小节（知识点）
  createSection: (did: string, data: { name: string }) =>
    request<Section>(`/documents/${did}/sections`, { method: "POST", body: JSON.stringify(data) }),
  updateSection: (id: string, data: Partial<Section>) =>
    request<Section>(`/sections/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSection: (id: string) => request<{ ok: boolean }>(`/sections/${id}`, { method: "DELETE" }),

  // 块
  addBlock: (sid: string, data: Record<string, unknown>) =>
    request<Block>(`/sections/${sid}/blocks`, { method: "POST", body: JSON.stringify(data) }),
  updateBlock: (id: string, data: Record<string, unknown>) =>
    request<Block>(`/blocks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBlock: (id: string) => request<{ ok: boolean }>(`/blocks/${id}`, { method: "DELETE" }),

  // 官方核心统计（统计页组件）
  statsCoreVisit: (data: { collectionId: string; documentId: string; documentName?: string; durationSec?: number }) =>
    request<Record<string, unknown>>("/stats/core/visit", { method: "POST", body: JSON.stringify(data) }),
  statsCoreSummary: () => request<StatsCoreSummary>("/stats/core/summary"),
  statsWidgets: () => request<StatsWidget[]>(`/stats/widgets`),

  // 插件
  listPlugins: () => request<PluginInfo[]>("/plugins"),
  setPluginEnabled: (id: string, enabled: boolean) =>
    request<PluginInfo>(`/plugins/${id}/${enabled ? "enable" : "disable"}`, { method: "POST" }),
  deletePlugin: (id: string) => request<{ ok: boolean }>(`/plugins/${id}`, { method: "DELETE" }),

  // MetaPilot 文件（.mpf）
  importMpf: (file: File, libraryId = "") => {
    const fd = new FormData()
    fd.append("file", file)
    if (libraryId) fd.append("libraryId", libraryId)
    return request<{
      type: string
      libraryId: string
      collectionId?: string
      imported?: { collectionId: string }[]
      name?: string
      unresolved: { blockType: string; requiredPlugin: string }[]
    }>("/mpf/import", { method: "POST", body: fd })
  },
  exportMpfUrl: (id: string, kind: "library" | "collection") =>
    `${BASE}/mpf/${kind === "library" ? "libraries" : "collections"}/${id}/export-mpf`,

  // 插件商店（PLUGIN_STORE_URL 配置后可用）
  storeCatalog: () => request<StorePluginItem[]>("/plugins/store/plugins"),
  storeInstall: (id: string) =>
    request<PluginInfo & { installed: boolean }>(`/plugins/store/plugins/${id}/install`, { method: "POST" }),
  storePublish: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return request<{ id: string; name: string; version: string }>("/plugins/store/publish", {
      method: "POST",
      body: fd,
    })
  },
  uploadPlugin: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return request<PluginInfo>("/plugins/upload", { method: "POST", body: fd })
  },
  importNote: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return request<{ libraryId: string; collectionId: string; documentId: string; sectionCount: number }>(
      "/plugins/notes/import",
      { method: "POST", body: fd },
    )
  },
}

// ---------- 类型 ----------

export interface LibraryMeta {
  id: string
  name: string
  description: string
  updatedAt: string
  collectionCount: number
  collections: { id: string; name: string; kind: string }[]
}

export interface Block {
  id: string
  type: string
  [key: string]: unknown
}

export interface Folder {
  id: string
  name: string
  parentId: string
  createdAt?: string
}

export interface Section {
  id: string
  name: string
  refDocId?: string
  blocks: Block[]
}

export interface Document {
  id: string
  name: string
  docType: string
  folderId?: string
  sections: Section[]
}

export interface CanvasNode {
  id: string
  type: "text" | "file" | "link" | "group"
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string
  file?: string
  url?: string
  label?: string
}

export interface CanvasEdge {
  id: string
  fromNode: string
  fromSide?: string
  toNode: string
  toSide?: string
  label?: string
  color?: string
}

export interface Collection {
  id: string
  name: string
  kind: string
  description: string
  author: string
  version: string
  packageId?: string
  documents: Document[]
  folders: Folder[]
  canvas?: { nodes: CanvasNode[]; edges: CanvasEdge[] }
}

export interface Library {
  id: string
  name: string
  description: string
  collections: Collection[]
}

export interface Progress {
  completedSections: string[]
  lastPosition: { documentId: string; sectionId: string } | null
  updatedAt: string | null
}

export interface StatsSummary {
  range: string
  totalSeconds: number
  sessionCount: number
  daily: { date: string; seconds: number }[]
  perCollection: { collectionId: string; name: string; seconds: number }[]
}

export interface StatsWidget {
  id: string
  title: string
  source: string // 插件 id（"core" = 官方核心）
  description: string
  defaultSize: string
}

export interface StatsCoreSummary {
  totalVisits: number
  totalDurationSec: number
  topDocs: { docId: string; name: string; visits: number; totalDurationSec: number }[]
  recentDocs: { docId: string; name: string; at: string; durationSec: number }[]
  heatmap: { byWeekday: number[]; byHour: number[]; byDate: { date: string; count: number }[] }
  totalWords: number
  wordsPerCollection: { id: string; name: string; words: number }[]
}

export interface GradeResult {
  score: number
  feedback: string
  isCorrect: boolean
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author?: string
  source: "core" | "official" | "user"
  tags: string[]
  enabled: boolean
  locked: boolean
  removable: boolean
  dependsOn: string[]
  missingDependencies: string[]
}

/** 插件商店清单项（GET /api/plugins/store/plugins） */
export interface StorePluginItem {
  id: string
  name: string
  version: string
  description: string
  author: string
  source: string
  specVersion: string
  tags: string[]
  size: number
  downloadUrl: string
}

export interface KbStatus {
  indexed: boolean
  sectionCount: number
  vectorDim?: number
  updatedAt?: string
}

/** 主题插件返回的视觉主题（CSS 变量按 light/dark 两套注入） */
export interface ThemeDef {
  id: string
  name: string
  description: string
  preview: { bg: string; primary: string }
  variables: { light: Record<string, string>; dark: Record<string, string> }
}

/** 知识库来源跳转信息（learn=学习页；symlink=文件浏览器） */
export type KbSourceLink =
  | { kind: "learn"; collectionId: string; sectionId: string }
  | { kind: "symlink"; mountId: string; path: string }

export interface KbSource {
  sectionId: string
  sectionName: string
  docId: string
  docName: string
  collectionName: string
  excerpt: string
  score: number
  link?: KbSourceLink
}

export interface KbEmbeddingStatus {
  provider: string
  url: string
  model: string
  healthy: boolean
  serverRunning: boolean
}

export interface SymlinkMount {
  id: string
  name: string
  root: string
  type?: "dir" | "file"
  createdAt?: string
}

export interface SymlinkFsItem {
  name: string
  type: "dir" | "file"
  size: number
  mtime: number
  path: string
}

export interface SymlinkFsList {
  path: string
  parent: string
  items: SymlinkFsItem[]
}

export interface SymlinkItem {
  name: string
  type: "dir" | "file"
  size: number
  mtime: number
}

export interface SymlinkTree {
  path: string
  items: SymlinkItem[]
}
