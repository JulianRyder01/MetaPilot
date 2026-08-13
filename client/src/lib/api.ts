/** 后端 API 客户端。 */
import { toast } from "@/lib/toast"

import { useSettingsStore } from "@/stores/settings"

const BASE = "/api"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

  // 进度
  getProgress: (cid: string) => request<Progress>(`/progress/${cid}`),
  toggleCompleted: (cid: string, sid: string) =>
    request<{ completed: boolean }>(`/progress/${cid}/toggle/${sid}`, { method: "PUT" }),
  setPosition: (cid: string, documentId: string, sectionId: string) =>
    request<{ ok: boolean }>(`/progress/${cid}/position`, {
      method: "PUT",
      body: JSON.stringify({ documentId, sectionId }),
    }),

  // 统计
  addSession: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>("/stats/sessions", { method: "POST", body: JSON.stringify(data) }),
  statsSummary: (range: string) => request<StatsSummary>(`/stats/summary?range=${range}`),

  // AI 判题
  grade: (data: Record<string, unknown>) =>
    request<GradeResult>("/ai/grade", { method: "POST", body: JSON.stringify(data) }),

  // 插件
  listPlugins: () => request<PluginInfo[]>("/plugins"),
  setPluginEnabled: (id: string, enabled: boolean) =>
    request<PluginInfo>(`/plugins/${id}/${enabled ? "enable" : "disable"}`, { method: "POST" }),
  importCourse: (file: File, libraryId = "") => {
    const fd = new FormData()
    fd.append("file", file)
    if (libraryId) fd.append("libraryId", libraryId)
    return request<{ libraryId: string; imported: { collectionId: string; name: string }[]; packageId: string }>(
      "/plugins/course/import",
      { method: "POST", body: fd },
    )
  },
  importNote: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return request<{ libraryId: string; collectionId: string; documentId: string; sectionCount: number }>(
      "/plugins/notes/import",
      { method: "POST", body: fd },
    )
  },
  exportCourseUrl: (cid: string) => `${BASE}/plugins/course/${cid}/export`,

  // 知识库插件
  kbStatus: (cid: string) => request<KbStatus>(`/plugins/kb/${cid}/status`),
  kbIndex: (cid: string) =>
    request<{ indexed: boolean; sectionCount: number; vectorDim: number }>(`/plugins/kb/${cid}/index`, {
      method: "POST",
    }),
  kbAsk: (cid: string, question: string, topK = 5) =>
    request<{ answer: string; sources: KbSource[] }>(`/plugins/kb/${cid}/ask`, {
      method: "POST",
      body: JSON.stringify({ question, topK }),
    }),
  kbEmbeddingStatus: () => request<KbEmbeddingStatus>("/plugins/kb/embedding-status"),
  kbEmbeddingStart: () =>
    request<{ started: boolean; pid?: number; message?: string; error?: string }>("/plugins/kb/embedding/start", {
      method: "POST",
    }),

  // 主题插件
  listThemes: () => request<ThemeDef[]>("/plugins/themes"),
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
  perCollection: { collectionId: string; seconds: number }[]
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
  enabled: boolean
  dependsOn: string[]
  missingDependencies: string[]
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

export interface KbSource {
  sectionId: string
  sectionName: string
  docId: string
  docName: string
  collectionName: string
  excerpt: string
  score: number
}

export interface KbEmbeddingStatus {
  provider: string
  url: string
  model: string
  healthy: boolean
  serverRunning: boolean
}
