/** 后端 API 客户端。 */
import { toast } from "@/lib/toast"

import { useSettingsStore } from "@/stores/settings"

export const BASE = "/api"

export class ApiError extends Error {
  status: number
  /** 后端返回的 detail（可能是字符串或对象，如 409 的 {code, keys}） */
  detail?: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
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
    throw new ApiError(
      res.status,
      typeof detail === "string" ? detail : JSON.stringify(detail),
      detail,
    )
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
  updateLibrary: (id: string, data: { name?: string; description?: string; pinned?: boolean; isDefault?: boolean }) =>
    request<Library>(`/libraries/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  /** 设为默认库（唯一）：AI 洞察等插件的默认保存目标 */
  setDefaultLibrary: (id: string) => request<Library>(`/libraries/${id}/default`, { method: "POST" }),
  deleteLibrary: (id: string) => request<{ ok: boolean }>(`/libraries/${id}`, { method: "DELETE" }),
  // 默认保存目标（库 / 软链接统一，全局唯一）：AI 洞察等插件的默认保存位置
  getDefaultTarget: () => request<{ kind: "library" | "symlink"; id: string }>("/default-target"),
  setDefaultTarget: (kind: "library" | "symlink", id: string) =>
    request<{ kind: "library" | "symlink"; id: string }>("/default-target", {
      method: "PUT",
      body: JSON.stringify({ kind, id }),
    }),

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
  // 集合类型（kind）元数据：核心 + 插件声明（kind → 打开路由/图标/文案）
  listCollectionKinds: () => request<Record<string, CollectionKindMeta>>("/collection-kinds"),

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
  /** 置顶（可多个，列表置顶优先） */
  pinned?: boolean
  /** 默认库（唯一，AI 洞察等插件的默认保存目标） */
  isDefault?: boolean
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
  /** Obsidian 节点扩展样式（新版 .canvas 字段）。 */
  styleAttributes?: { textAlign?: "left" | "center" | "right" }
}

export interface CanvasEdge {
  id: string
  fromNode: string
  fromSide?: string
  toNode: string
  toSide?: string
  label?: string
  color?: string
  /** JSON Canvas：起点端点（none 默认 / arrow），与 toEnd 默认相反。 */
  fromEnd?: "none" | "arrow"
  toEnd?: "none" | "arrow"
  /** Obsidian 边扩展样式（新版 .canvas 字段）：连线路径形状。 */
  styleAttributes?: { pathfindingMethod?: "smooth" | "straight" | "square" }
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
  /** 本插件提供的能力 id（plugin.json capabilities 键） */
  capabilities?: string[]
  /** 本插件需要的能力（可选，缺失不阻止启用，对应功能不可用） */
  requires?: string[]
  /** requires 中当前不可用的能力（提供方插件未安装/未启用） */
  missingCapabilities?: string[]
  /** 本插件负责解析的组件块类型（.mpf 解析 requiredPlugin 反查依据） */
  contentTypes?: string[]
  /** 功能列表（前端展示，来自 plugin.json features） */
  features?: string[]
  /** 图标名（lucide 图标名，来自 plugin.json icon；缺失时前端回退通用图标） */
  icon?: string
  /** 是否含前端 UI bundle（frontend/frontend.js，第三方插件运行时动态加载） */
  hasFrontend?: boolean
  /** 前端 bundle 托管地址（hasFrontend 时有效） */
  frontendUrl?: string
  /** 更新历史（roadmap）：[{version, date, summary}]，最新在前 */
  changelog?: { version: string; date?: string; summary: string }[]
}

/** 集合类型（kind）元数据：由核心注册 + 插件声明（GET /api/collection-kinds） */
export interface CollectionKindMeta {
  /** 类型名 i18n key */
  labelKey: string
  /** lucide 图标名 */
  icon: string
  /** 打开路由模板（{id} 占位）；空 = 无独立页（在库详情内查看） */
  openRoute: string
  /** 内容单元标签 i18n key（章节/画布/文档） */
  unitLabelKey: string
  /** 声明该 kind 的插件 id（核心类型无） */
  pluginId?: string
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

/** 知识库来源跳转信息（learn=学习页；symlink=文件浏览器，href 由能力提供方元数据生成） */
export type KbSourceLink =
  | { kind: "learn"; collectionId: string; sectionId: string }
  | { kind: "symlink"; mountId: string; path: string; href?: string }

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
  /** 置顶（可多个，列表置顶优先） */
  pinned?: boolean
  /** 是否为默认保存目标（与库统一，全局唯一） */
  isDefault?: boolean
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

// ==================== AI 统一网关（核心 1.1.1） ====================

export interface AIModelPrice {
  input: number
  cachedInput: number
  output: number
  currency: "$" | "¥"
}

export interface LocalModelStatus {
  kind: "embedding" | "llm" | "rerank"
  model: string
  url: string
  running: boolean
  downloaded: boolean
  downloading: boolean
  downloadError?: string
}

export interface AIConfigPublic {
  provider: string
  baseUrl: string
  apiKey: string
  apiKeyConfigured: boolean
  chatModel: string
  embeddingProvider: string
  embeddingUrl: string
  embeddingModel: string
  localLlmUrl: string
  rerankUrl: string
  localLlmModel: string
  rerankModel: string
  prices: Record<string, AIModelPrice>
  currency: string
  providers: string[]
  currencies: string[]
  defaultCurrency: string
  localModels: LocalModelStatus[]
}

export interface AIUsageSummary {
  range: string
  totalCalls: number
  totalTokens: number
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  totalCost: number
  currency: string
  byModel: {
    model: string
    provider: string
    calls: number
    inputTokens: number
    cachedTokens: number
    outputTokens: number
    cost: number
  }[]
}

export const aiGetConfig = () => request<AIConfigPublic>("/ai/config")

export const aiPutConfig = (data: Record<string, unknown>) =>
  request<AIConfigPublic>("/ai/config", { method: "PUT", body: JSON.stringify(data) })

export const aiUsage = (range = "all") =>
  request<AIUsageSummary>(`/ai/usage?range=${encodeURIComponent(range)}`)

export const aiLocalModels = () => request<LocalModelStatus[]>("/ai/local-models")

export const aiLocalModelDownload = (kind: string, model = "") =>
  request<{ started: boolean; message?: string }>("/ai/local-models/download", {
    method: "POST",
    body: JSON.stringify({ kind, model }),
  })

export const aiLocalModelStart = (kind: string, model = "") =>
  request<{ started: boolean; pid?: number; message?: string; error?: string }>("/ai/local-models/start", {
    method: "POST",
    body: JSON.stringify({ kind, model }),
  })

export const aiLocalModelStop = (kind: string) =>
  request<{ ok: boolean; kind: string }>("/ai/local-models/stop", {
    method: "POST",
    body: JSON.stringify({ kind }),
  })

export const aiTest = () =>
  request<{ ok: boolean; model: string; provider: string; inputTokens: number; outputTokens: number }>(
    "/ai/test",
    { method: "POST" },
  )
