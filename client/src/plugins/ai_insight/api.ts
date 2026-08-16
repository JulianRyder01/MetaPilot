/** AI 洞察插件 API 客户端（docs/04 §6）。
 *
 * 端点全部位于 /api/plugins/ai_insight/*（规范 §4 统一前缀）。
 * 数据源多粒度：library（库）/ collection（文档集）/ document（文档）/ symlink（软链接挂载或挂载内路径）。
 */
import { request, ApiError, BASE, type KbEmbeddingStatus, type KbSource, type SymlinkTree } from "@/lib/api"

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

/** 挂载类数据源元数据（label/链接模板来自能力提供方声明，ai_insight 不写死其它插件描述） */
export interface InsightSourceTypeMeta {
  available: boolean
  label: string
  linkTemplate: string
}

export interface InsightResources {
  libraries: InsightResourceNode[]
  symlinks: InsightResourceNode[]
  /** 可用挂载类数据源（如 symlink）的展示元数据，键为数据源类型 */
  sourceTypes?: Record<string, InsightSourceTypeMeta>
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

/** embedding 状态（含可选模型清单与下载说明） */
export interface InsightEmbeddingStatus extends KbEmbeddingStatus {
  models: Record<string, string>
  /** 模型下载说明（后端配置下发，前端不写死具体模型/下载源/耗时） */
  downloadHint?: string
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

/** 洞察规划执行路线的步骤 id（前端按此顺序展示 todo list；展示名由前端词典提供，后端不写死文案） */
export type InsightPlanStepId = "retrieve" | "plan" | "review" | "generate" | "save"

/** /plan/stream 的 SSE 事件（协议由 ai_insight 插件前后端约定） */
export type InsightPlanStreamEvent =
  | { type: "step"; step: InsightPlanStepId; status: "start" | "done" }
  | { type: "think"; step: InsightPlanStepId; content: string }
  | { type: "done"; result: InsightPlanResult }
  | { type: "error"; code?: string; keys?: string[]; message?: string }

/** 洞察规划（SSE 流式）：实时推送执行路线与各轮 AI 思考，onEvent 逐事件回调；
 *  收到 error 事件时抛 ApiError（detail 为该事件）。 */
export function insightPlanStream(
  sources: InsightSourceRef[],
  question: string,
  output: InsightOutput,
  libraryId = "",
  topK = 12,
  onEvent: (evt: InsightPlanStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return fetch(`${BASE}/plugins/ai_insight/plan/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources, question, output, libraryId, topK }),
    signal,
  }).then(async (res) => {
    if (!res.ok) {
      let detail: unknown = res.statusText
      try {
        detail = (await res.json()).detail ?? detail
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail), detail)
    }
    if (!res.body) throw new ApiError(0, "浏览器不支持流式响应（SSE）")
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith("data:")) continue
        const raw = line.slice(5).trim()
        if (!raw) continue
        let evt: InsightPlanStreamEvent
        try {
          evt = JSON.parse(raw) as InsightPlanStreamEvent
        } catch {
          continue
        }
        onEvent(evt)
        if (evt.type === "error") {
          const err = new ApiError(502, evt.message ?? "洞察规划失败")
          err.detail = evt
          // 停止继续读取，避免连接悬挂
          await reader.cancel().catch(() => undefined)
          throw err
        }
      }
    }
  })
}
