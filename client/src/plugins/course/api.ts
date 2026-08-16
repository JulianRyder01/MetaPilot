/** 课程插件 API 客户端（docs/04 §6：插件 API 集中声明在插件模块）。
 *
 * 端点全部位于 /api/plugins/course/*（规范 §4 统一前缀）。
 */
import { BASE, request, type Collection, type GradeResult, type Progress, type StatsSummary } from "@/lib/api"

export const getProgress = (cid: string) => request<Progress>(`/plugins/course/progress/${cid}`)

export const toggleCompleted = (cid: string, sid: string) =>
  request<{ completed: boolean }>(`/plugins/course/progress/${cid}/toggle/${sid}`, { method: "PUT" })

export const setPosition = (cid: string, documentId: string, sectionId: string) =>
  request<{ ok: boolean }>(`/plugins/course/progress/${cid}/position`, {
    method: "PUT",
    body: JSON.stringify({ documentId, sectionId }),
  })

export const addSession = (data: Record<string, unknown>) =>
  request<Record<string, unknown>>("/plugins/course/stats/sessions", {
    method: "POST",
    body: JSON.stringify(data),
  })

export const statsSummary = (range: string) =>
  request<StatsSummary>(`/plugins/course/stats/summary?range=${range}`)

export const grade = (data: Record<string, unknown>) =>
  request<GradeResult>("/plugins/course/ai/grade", { method: "POST", body: JSON.stringify(data) })

export const importCourse = (file: File, libraryId = "") => {
  const fd = new FormData()
  fd.append("file", file)
  if (libraryId) fd.append("libraryId", libraryId)
  return request<{ libraryId: string; imported: { collectionId: string; name: string }[]; packageId: string }>(
    "/plugins/course/import",
    { method: "POST", body: fd },
  )
}

export const exportCourseUrl = (cid: string) => `${BASE}/plugins/course/${cid}/export`

/** 把文档类集合（笔记/知识库等）转为课程：kind=course + 转换标记（补丁字段）。 */
export const convertCollection = (cid: string) =>
  request<{ ok: boolean; collection: Collection }>(`/plugins/course/collections/${cid}/convert`, {
    method: "POST",
  })
