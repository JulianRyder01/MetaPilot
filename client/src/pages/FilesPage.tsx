import { useCallback, useEffect, useState } from "react"
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { api, type SymlinkItem, type SymlinkMount, type SymlinkTree } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { MarkdownBlock } from "@/components/learn/blocks/MarkdownBlock"
import { PluginGate } from "@/components/plugins/PluginGate"

function joinPath(base: string, name: string) {
  return base ? `${base}/${name}` : name
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function FilesPage() {
  const [mounts, setMounts] = useState<SymlinkMount[]>([])
  const [mid, setMid] = useState("")
  const [path, setPath] = useState("")
  const [tree, setTree] = useState<SymlinkTree | null>(null)
  const [file, setFile] = useState<{ path: string; content: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState("")

  const loadMounts = useCallback(async () => {
    const ms = await api.symlinkMounts()
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
    setTree(await api.symlinkTree(mid, p))
  }, [mid])

  useEffect(() => {
    if (mid) loadTree("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid])

  async function openItem(item: SymlinkItem) {
    const p = joinPath(path, item.name)
    if (item.type === "dir") {
      await loadTree(p)
    } else {
      try {
        const f = await api.symlinkReadFile(mid, p)
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
      await api.symlinkWriteFile(mid, file.path, editContent)
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
      await api.symlinkMkdir(mid, joinPath(path, name.trim()))
      await loadTree(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败")
    }
  }

  async function removeItem(item: SymlinkItem) {
    const target = joinPath(path, item.name)
    if (!window.confirm(`删除「${target}」？${item.type === "dir" ? "文件夹将递归删除，不可恢复。" : ""}`)) return
    try {
      await api.symlinkDelete(mid, target)
      await loadTree(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败")
    }
  }

  async function removeMount(id: string) {
    if (!window.confirm("卸载该挂载？不会删除磁盘上的文件。")) return
    await api.symlinkRemoveMount(id)
    setMid("")
    setTree(null)
    setFile(null)
    loadMounts()
  }

  const crumbs = path ? path.split("/").filter(Boolean) : []

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-4 flex items-center gap-2">
        <FolderOpen className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">文件浏览器</h1>
        <p className="ml-2 text-sm text-muted-foreground">
          软链接插件：挂载本机目录，像操作系统一样浏览与读写
        </p>
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
                <p className="px-2 text-xs text-muted-foreground">暂无挂载，点击右上角添加本机目录</p>
              )}
            </div>
            {mounts.length > 0 && (
              <p className="px-2 text-[11px] text-muted-foreground">
                当前挂载根：{mounts.find((m) => m.id === mid)?.root ?? ""}
              </p>
            )}
          </aside>

          {/* 右：目录浏览 */}
          <section className="min-w-0 flex-1">
            {!mid ? (
              <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
                请先挂载一个本机目录
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
                    <Button variant="outline" size="sm" onClick={createFolder}>
                      <Plus className="size-3.5" />
                      新建文件夹
                    </Button>
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
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{item.name}</span>
                          {item.type === "file" && (
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                              {fmtSize(item.size)}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => removeItem(item)}
                          className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                          title="删除"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
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
                      <span className="text-sm font-medium">{file.path}</span>
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

function AddMountDialog({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("")
  const [root, setRoot] = useState("")
  const [open, setOpen] = useState(false)

  async function add() {
    if (!name.trim() || !root.trim()) return
    try {
      await api.symlinkAddMount(name.trim(), root.trim())
      toast.success("挂载成功")
      setName("")
      setRoot("")
      setOpen(false)
      onAdded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "挂载失败")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          添加
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>挂载本机目录</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>显示名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：我的笔记" />
          </div>
          <div className="space-y-1.5">
            <Label>目录路径（Windows/Linux 均支持）</Label>
            <Input
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder={'例如：D:/Documents/notes 或 /home/user/notes'}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={add} disabled={!name.trim() || !root.trim()}>
            挂载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
