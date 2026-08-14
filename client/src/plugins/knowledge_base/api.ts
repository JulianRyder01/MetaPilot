/** 个人知识库插件 API 客户端（docs/04 §6）。
 *
 * 端点全部位于 /api/plugins/knowledge_base/*（规范 §4 统一前缀）。
 */
import { request, type KbEmbeddingStatus, type KbSource, type KbStatus } from "@/lib/api"

export const kbStatus = (cid: string) => request<KbStatus>(`/plugins/knowledge_base/${cid}/status`)

export const kbIndex = (cid: string) =>
  request<{ indexed: boolean; sectionCount: number; vectorDim: number }>(
    `/plugins/knowledge_base/${cid}/index`,
    { method: "POST" },
  )

export const kbAsk = (cid: string, question: string, topK = 5) =>
  request<{ answer: string; sources: KbSource[] }>(`/plugins/knowledge_base/${cid}/ask`, {
    method: "POST",
    body: JSON.stringify({ question, topK }),
  })

export const kbEmbeddingStatus = () => request<KbEmbeddingStatus>("/plugins/knowledge_base/embedding-status")

export const kbEmbeddingStart = () =>
  request<{ started: boolean; pid?: number; message?: string; error?: string }>(
    "/plugins/knowledge_base/embedding/start",
    { method: "POST" },
  )
