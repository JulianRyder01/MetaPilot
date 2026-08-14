import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { type SymlinkItem, type SymlinkMount, type SymlinkTree } from "@/lib/api"
import {
  symlinkDelete,
  symlinkMkdir,
  symlinkMounts,
  symlinkReadFile,
  symlinkRemoveMount,
  symlinkTree,
  symlinkWriteFile,
} from "@/plugins/symlink/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MarkdownBlock } from "@/components/learn/blocks/MarkdownBlock"
import { PluginGate } from "@/components/plugins/PluginGate"
import { AddMountDialog } from "@/components/symlink/AddMountDialog"

function joinPath(base: string, name: string) {
  return base ? `${base}/${name}` : name
}

/** 软链接来源的文档图标：文件图标带 Link2 角标，标识来自软链接插件。 */
function SoftLinkFileIcon() {
  return (
    <span className="relative inline-flex shrink-0">
      <FileText className="size-4 text-muted-foreground" />
      <Link2 className="absolute -bottom-1 -right-1.5 size-2.5 rounded-full bg-background text-primary" />
    </span>
  )
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function baseName(p: string) {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

export default function FilesPage() {
  const [params] = useSearchParams()
  const [mounts, setMounts] = useState<SymlinkMount[]>([])
  const [mid, setMid] = useState(params.get("mount") ?? "")
  const [path, setPath] = useState("")
  const [tree, setTree] = useState<SymlinkTree | null>(null)
  const [file, setFile] = useState<{ path: string; content: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState("")

  const loadMounts = useCallback(async () => {
    const ms = await symlinkMounts()
    setMounts(ms)
    if (!mid && ms.length > 0) setMid(ms[0].id)
  }, [mid])

  useEffect(() => {
    loadMounts()
  }, [loadMounts])

  const loadTree = useCallback(async (p: string) => {
    if (!mid) return
    setFile(null)
    setEditing(false)
    setPath(p)
    setTree(await symlinkTree(mid, p))
  }, [mid])

  useEffect(() => {
    if (mid) loadTree("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid])

  async function openItem(item: SymlinkItem) {
    // 挂载根是单个文件时：列表里只有该文件自身，读取用空路径（= 根文件）
    const p = currentMount?.type === "file" ? "" : joinPath(path, item.name)
    if (item.type === "dir" && currentMount?.type !== "file") {
      await loadTree(p)
    } else {
      try {
        const f = await symlinkReadFile(mid, p)
        setFile(f)
        setEditing(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "读取失败")
      }
    }
  }

  async function saveFile() {
    if (!file) return
    try {
      await symlinkWriteFile(mid, file.path, editContent)
      setFile({ ...file, content: editContent })
      setEditing(false)
      toast.success("已保存")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败")
    }
  }

  async function createFolder() {
    const name = window.prompt("新建文件夹名称：")
    if (!name?.trim()) return
    try {
      await symlinkMkdir(mid, joinPath(path, name.trim()))
      await loadTree(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败")
    }
  }

  async function removeItem(item: SymlinkItem) {
    const target = joinPath(path, item.name)
    if (!window.confirm(`删除「${target}」？${item.type === "dir" ? "文件夹将递归删除，不可恢复。" : ""}`)) return
    try {
      await symlinkDelete(mid, target)
      await loadTree(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败")
    }
  }

  async function removeMount(id: string) {
    if (!window.confirm("卸载该挂载？不会删除磁盘上的文件。")) return
    await symlinkRemoveMount(id)
    setMid("")
    setTree(null)
    setFile(null)
    loadMounts()
  }

  const crumbs = path ? path.split("/").filter(Boolean) : []
  const currentMount = mounts.find((m) => m.id === mid)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-4 flex items-center gap-2">
        <FolderOpen className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">文件浏览器</h1>
        <Badge variant="outline" className="gap-1">
          <Link2 className="size-3" />
          软链接插件
        </Badge>
      </div>

      <PluginGate pluginId="symlink" hint="浏览与读写本机目录">
        <div className="flex gap-5">
          {/* 左：挂载列表 */}
          <aside className="w-64 shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">挂载</h2>
              <AddMountDialog
                onAdded={async () => {
                  await loadMounts()
                }}
              />
            </div>
            <div className="space-y-1">
              {mounts.map((m) => (
                <div
                  key={m.id}
                  className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                    mid === m.id ? "bg-accent font-medium" : "hover:bg-accent/60"
                  }`}
                >
                  <button
                    onClick={() => setMid(m.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <HardDrive className="size-4 shrink-0 text-primary" />
                    <Link2 className="size-3 shrink-0 text-muted-foreground/60" />
                    <span className="truncate">{m.name}</span>
                  </button>
                  <button
                    onClick={() => removeMount(m.id)}
                    className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    title="卸载"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {mounts.length === 0 && (
                <p className="px-2 text-xs text-muted-foreground">暂无挂载，点击右上角添加本机文件夹或文件</p>
              )}
            </div>
            {mounts.length > 0 && (
              <p className="px-2 text-[11px] text-muted-foreground">
                当前挂载根：
                {currentMount ? `${currentMount.root}${currentMount.type === "file" ? "（单文件）" : ""}` : ""}
              </p>
            )}
          </aside>

          {/* 右：目录浏览 */}
          <section className="min-w-0 flex-1">
            {!mid ? (
              <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
                请先挂载一个本机文件夹或文件
              </div>
            ) : (
              <>
                {/* 面包屑 + 操作 */}
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <button onClick={() => loadTree("")} className="font-medium text-primary hover:underline">
                    {mounts.find((m) => m.id === mid)?.name ?? "/"}
                  </button>
                  {crumbs.map((c, i) => {
                    const target = crumbs.slice(0, i + 1).join("/")
                    return (
                      <span key={i} className="flex items-center gap-1">
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                        <button onClick={() => loadTree(target)} className="hover:underline">
                          {c}
                        </button>
                      </span>
                    )
                  })}
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => loadTree(path)}>
                      <RefreshCw className="size-3.5" />
                    </Button>
                    {currentMount?.type !== "file" && (
                      <Button variant="outline" size="sm" onClick={createFolder}>
                        <Plus className="size-3.5" />
                        新建文件夹
                      </Button>
                    )}
                  </div>
                </div>

                {/* 文件列表 */}
                <ScrollArea className="h-[calc(100vh-260px)]">
                  <div className="rounded-lg border">
                    {(tree?.items ?? []).map((item) => (
                      <div
                        key={item.name}
                        className="group flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent/40"
                      >
                        <button onClick={() => openItem(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          {item.type === "dir" ? (
                            <Folder className="size-4 shrink-0 text-primary" />
                          ) : (
                            <SoftLinkFileIcon />
                          )}
                          <span className="truncate">{item.name}</span>
                          {item.type === "file" && (
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                              {fmtSize(item.size)}
                            </span>
                          )}
                        </button>
                        {currentMount?.type !== "file" && (
                          <button
                            onClick={() => removeItem(item)}
                            className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                            title="删除"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {tree && tree.items.length === 0 && (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">空目录</p>
                    )}
                  </div>
                </ScrollArea>

                {/* 文件预览 / 编辑 */}
                {file && (
                  <div className="mt-4 rounded-lg border">
                    <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                      <span className="text-sm font-medium">{file.path || (currentMount?.type === "file" ? baseName(currentMount.root) : "")}</span>
                      <div className="flex items-center gap-1">
                        {file.path.endsWith(".md") || file.path.endsWith(".markdown") ? (
                          <Badge variant="outline">Markdown</Badge>
                        ) : null}
                        {editing ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                              <X className="size-3.5" />
                              取消
                            </Button>
                            <Button size="sm" onClick={saveFile}>
                              <Save className="size-3.5" />
                              保存
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditContent(file.content)
                            setEditing(true)
                          }}>
                            <Pencil className="size-3.5" />
                            编辑
                          </Button>
                        )}
                      </div>
                    </div>
                    {editing ? (
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-72 rounded-none border-0 font-mono text-sm focus-visible:ring-0"
                      />
                    ) : file.path.endsWith(".md") || file.path.endsWith(".markdown") ? (
                      <div className="p-4">
                        <MarkdownBlock content={file.content} />
                      </div>
                    ) : (
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-4 text-xs">{file.content}</pre>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </PluginGate>
    </div>
  )
}

