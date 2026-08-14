/** 个人知识库插件 API 客户端（docs/04 §6）。
 *
 * 端点全部位于 /api/plugins/knowledge_base/*（规范 §4 统一前缀）。
 * 多数据源：默认库（library_<id>）与软链接挂载（symlink_<id>）。
 */
import { request, type KbEmbeddingStatus, type KbSource, type KbStatus } from "@/lib/api"

/** 数据源标识 */
export interface KbSourceRef {
  type: "library" | "symlink"
  id: string
}

/** 数据源列表项（GET /sources） */
export interface KbSourceItem extends KbSourceRef {
  name: string
  root?: string
  key: string
  status: KbStatus
}

/** 单个数据源索引结果 */
export interface KbIndexResult {
  indexed: boolean
  sectionCount: number
  vectorDim?: number
  error?: string
  source?: KbSourceRef
}

/** embedding 状态（含可选模型清单） */
export interface KbEmbeddingStatusWithModels extends KbEmbeddingStatus {
  models: Record<string, string>
  autoStart: boolean
}

/** 问答结果（多源合并检索） */
export interface KbAskResult {
  answer: string
  sources: KbSource[]
}

export const kbSources = () => request<KbSourceItem[]>("/plugins/knowledge_base/sources")

export const kbIndex = (sources: KbSourceRef[]) =>
  request<{ results: KbIndexResult[] }>("/plugins/knowledge_base/index", {
    method: "POST",
    body: JSON.stringify({ sources }),
  })

export const kbStatus = (key: string) =>
  request<KbStatus>(`/plugins/knowledge_base/index/${encodeURIComponent(key)}/status`)

export const kbAsk = (sources: KbSourceRef[], question: string, topK = 5) =>
  request<KbAskResult>("/plugins/knowledge_base/ask", {
    method: "POST",
    body: JSON.stringify({ sources, question, topK }),
  })

export const kbEmbeddingStatus = () =>
  request<KbEmbeddingStatusWithModels>("/plugins/knowledge_base/embedding-status")

export const kbEmbeddingStart = (model = "") =>
  request<{ started: boolean; pid?: number; message?: string; error?: string }>(
    "/plugins/knowledge_base/embedding/start",
    { method: "POST", body: JSON.stringify({ model }) },
  )

export const kbEmbeddingStop = () =>
  request<{ ok: boolean }>("/plugins/knowledge_base/embedding/stop", { method: "POST" })
