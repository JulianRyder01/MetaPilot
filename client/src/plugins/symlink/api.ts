/** 软链接插件 API 客户端（docs/04 §6）。
 *
 * 端点全部位于 /api/plugins/symlink/*（规范 §4 统一前缀）。
 */
import { BASE, request, type CanvasEdge, type CanvasNode, type SymlinkFsList, type SymlinkMount, type SymlinkTree } from "@/lib/api"

export const symlinkMounts = () => request<SymlinkMount[]>("/plugins/symlink/mounts")

export const symlinkFsRoots = () => request<string[]>("/plugins/symlink/fs/roots")

export const symlinkFsList = (path: string) =>
  request<SymlinkFsList>(`/plugins/symlink/fs/list?path=${encodeURIComponent(path)}`)

export const symlinkAddMount = (name: string, root: string) =>
  request<SymlinkMount>("/plugins/symlink/mounts", { method: "POST", body: JSON.stringify({ name, root }) })

export const symlinkRenameMount = (id: string, name: string) =>
  request<SymlinkMount>(`/plugins/symlink/mounts/${id}`, { method: "PUT", body: JSON.stringify({ name }) })

/** 置顶 / 取消置顶（可多个） */
export const symlinkPinMount = (id: string, pinned: boolean) =>
  request<SymlinkMount>(`/plugins/symlink/mounts/${id}`, { method: "PUT", body: JSON.stringify({ pinned }) })

/** 设为默认保存目标（全局唯一，与库统一） */
export const symlinkSetDefaultMount = (id: string) =>
  request<{ kind: "symlink"; id: string }>(`/plugins/symlink/mounts/${id}/default`, { method: "POST" })

/** 取消默认保存目标（与置顶相互独立，可单独取消） */
export const symlinkClearDefaultMount = (id: string) =>
  request<{ kind: "symlink"; id: string }>(`/plugins/symlink/mounts/${id}/default`, { method: "DELETE" })

export const symlinkRemoveMount = (id: string) =>
  request<{ ok: boolean }>(`/plugins/symlink/mounts/${id}`, { method: "DELETE" })

export const symlinkTree = (mid: string, path = "") =>
  request<SymlinkTree>(`/plugins/symlink/mounts/${mid}/tree?path=${encodeURIComponent(path)}`)

export const symlinkReadFile = (mid: string, path: string) =>
  request<{ path: string; content: string }>(
    `/plugins/symlink/mounts/${mid}/file?path=${encodeURIComponent(path)}`,
  )

/** 媒体文件（图片/PDF/视频/音频）二进制预览 URL（供 <img>/<iframe>/<video>/<audio> 直接引用）。 */
export const symlinkMediaUrl = (mid: string, path: string) =>
  `${BASE}/plugins/symlink/mounts/${mid}/media?path=${encodeURIComponent(path)}`

/** 在用户本机打开/定位挂载内文件：mode = open（默认方式打开）| reveal（文件管理器中显示）。 */
export const symlinkOpen = (mid: string, path: string, mode: "open" | "reveal") =>
  request<{ ok: boolean; mode: string; path: string }>(`/plugins/symlink/mounts/${mid}/open`, {
    method: "POST",
    body: JSON.stringify({ path, mode }),
  })

export const symlinkWriteFile = (mid: string, path: string, content: string) =>
  request<{ ok: boolean; path: string; bytes: number }>(
    `/plugins/symlink/mounts/${mid}/file?path=${encodeURIComponent(path)}`,
    { method: "PUT", body: JSON.stringify({ content }) },
  )

/** 打开挂载内 .canvas 源文件：后端转为 .mpf canvas 内容（nodes/edges）供图表编辑器编辑（不写源文件）。 */
export const symlinkCanvasOpen = (mid: string, path: string) =>
  request<{ path: string; name: string; canvas: { nodes: CanvasNode[]; edges: CanvasEdge[] } }>(
    `/plugins/symlink/mounts/${mid}/canvas?path=${encodeURIComponent(path)}`,
  )

/** 保存编辑后的图表：后端转回 JSON Canvas 标准格式，写回源 .canvas 文件（未调用则不修改源文件）。 */
export const symlinkCanvasSave = (mid: string, path: string, nodes: CanvasNode[], edges: CanvasEdge[]) =>
  request<{ ok: boolean; path: string; bytes: number }>(
    `/plugins/symlink/mounts/${mid}/canvas?path=${encodeURIComponent(path)}`,
    { method: "PUT", body: JSON.stringify({ nodes, edges }) },
  )

export const symlinkMkdir = (mid: string, path: string) =>
  request<{ ok: boolean; path: string }>(`/plugins/symlink/mounts/${mid}/mkdir`, {
    method: "POST",
    body: JSON.stringify({ path }),
  })

export const symlinkDelete = (mid: string, path: string) =>
  request<{ ok: boolean; path: string }>(
    `/plugins/symlink/mounts/${mid}/path?path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
  )
