/** 软链接插件 API 客户端（docs/04 §6）。
 *
 * 端点全部位于 /api/plugins/symlink/*（规范 §4 统一前缀）。
 */
import { request, type SymlinkFsList, type SymlinkMount, type SymlinkTree } from "@/lib/api"

export const symlinkMounts = () => request<SymlinkMount[]>("/plugins/symlink/mounts")

export const symlinkFsRoots = () => request<string[]>("/plugins/symlink/fs/roots")

export const symlinkFsList = (path: string) =>
  request<SymlinkFsList>(`/plugins/symlink/fs/list?path=${encodeURIComponent(path)}`)

export const symlinkAddMount = (name: string, root: string) =>
  request<SymlinkMount>("/plugins/symlink/mounts", { method: "POST", body: JSON.stringify({ name, root }) })

export const symlinkRenameMount = (id: string, name: string) =>
  request<SymlinkMount>(`/plugins/symlink/mounts/${id}`, { method: "PUT", body: JSON.stringify({ name }) })

export const symlinkRemoveMount = (id: string) =>
  request<{ ok: boolean }>(`/plugins/symlink/mounts/${id}`, { method: "DELETE" })

export const symlinkTree = (mid: string, path = "") =>
  request<SymlinkTree>(`/plugins/symlink/mounts/${mid}/tree?path=${encodeURIComponent(path)}`)

export const symlinkReadFile = (mid: string, path: string) =>
  request<{ path: string; content: string }>(
    `/plugins/symlink/mounts/${mid}/file?path=${encodeURIComponent(path)}`,
  )

export const symlinkWriteFile = (mid: string, path: string, content: string) =>
  request<{ ok: boolean; path: string; bytes: number }>(
    `/plugins/symlink/mounts/${mid}/file?path=${encodeURIComponent(path)}`,
    { method: "PUT", body: JSON.stringify({ content }) },
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
