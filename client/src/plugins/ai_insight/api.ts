/** AI 洞察插件 API 客户端（docs/04 §6）。
 *
 * 端点全部位于 /api/plugins/ai_insight/*（规范 §4 统一前缀）。
 * 数据源多粒度：library（库）/ collection（文档集）/ document（文档）/ symlink（软链接挂载或挂载内路径）。
 */
import { request, type KbEmbeddingStatus, type KbSource, type SymlinkTree } from "@/lib/api"

/** 数据源标识（path 为 symlink 挂载内相对路径，空 = 整个挂载） */
export interface InsightSourceRef {
  type: "library" | "collection" | "document" | "symlink"
  id: string
  path?: string
}

/** 索引状态（含进行中进度） */
export interface InsightStatus {
  indexed: boolean
  sectionCount: number
  vectorDim?: number
  updatedAt?: string
  running?: boolean
  total?: number
  done?: number
  error?: string
}

/** 资源树节点 */
export interface InsightResourceNode {
  id: string
  name: string
  status: InsightStatus
  kind?: string
  docType?: string
  root?: string
  type?: string
  collections?: InsightResourceNode[]
  documents?: InsightResourceNode[]
}

export interface InsightResources {
  libraries: InsightResourceNode[]
  symlinks: InsightResourceNode[]
}

/** 思考模式 */
export type InsightMode = "assist" | "wander" | "reflect"

/** 洞察规划生成类型 */
export type InsightOutput = "canvas" | "course"

/** 对话结果（多源合并检索） */
export interface InsightAskResult {
  answer: string
  sources: KbSource[]
}

/** 洞察规划结果（已创建到库的集合） */
export interface InsightPlanResult {
  kind: InsightOutput
  collectionId: string
  collectionName: string
  libraryId: string
  summary?: string
}

/** embedding 状态（含可选模型清单） */
export interface InsightEmbeddingStatus extends KbEmbeddingStatus {
  models: Record<string, string>
  autoStart: boolean
}

/** 409 NOT_INDEXED 的 detail */
export interface NotIndexedDetail {
  code: "NOT_INDEXED"
  keys: string[]
}

export const insightResources = () => request<InsightResources>("/plugins/ai_insight/resources")

export const insightSymlinkTree = (mountId: string, path = "") =>
  request<SymlinkTree>(
    `/plugins/ai_insight/resources/symlink/${encodeURIComponent(mountId)}/tree?path=${encodeURIComponent(path)}`,
  )

export const insightIndex = (sources: InsightSourceRef[]) =>
  request<{ started: string[] }>("/plugins/ai_insight/index", {
    method: "POST",
    body: JSON.stringify({ sources }),
  })

export const insightStatus = (key: string) =>
  request<InsightStatus>(`/plugins/ai_insight/index/${encodeURIComponent(key)}/status`)

export const insightAsk = (
  sources: InsightSourceRef[],
  mode: InsightMode,
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  topK = 5,
) =>
  request<InsightAskResult>("/plugins/ai_insight/ask", {
    method: "POST",
    body: JSON.stringify({ sources, mode, question, history, topK }),
  })

export const insightPlan = (
  sources: InsightSourceRef[],
  question: string,
  output: InsightOutput,
  libraryId = "",
  topK = 12,
) =>
  request<InsightPlanResult>("/plugins/ai_insight/plan", {
    method: "POST",
    body: JSON.stringify({ sources, question, output, libraryId, topK }),
  })

export const insightEmbeddingStatus = () =>
  request<InsightEmbeddingStatus>("/plugins/ai_insight/embedding-status")

export const insightEmbeddingStart = (model = "") =>
  request<{ started: boolean; pid?: number; message?: string; error?: string }>(
    "/plugins/ai_insight/embedding/start",
    { method: "POST", body: JSON.stringify({ model }) },
  )

export const insightEmbeddingStop = () =>
  request<{ ok: boolean }>("/plugins/ai_insight/embedding/stop", { method: "POST" })
