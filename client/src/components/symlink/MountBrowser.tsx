import { useCallback, useEffect, useState } from "react"
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Grid3X3,
  Link2,
  List,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "@/lib/toast"

import type { SymlinkItem, SymlinkMount, SymlinkTree } from "@/lib/api"
import {
  symlinkDelete,
  symlinkMkdir,
  symlinkReadFile,
  symlinkTree,
  symlinkWriteFile,
} from "@/plugins/symlink/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownBlock } from "@/components/learn/blocks/MarkdownBlock"
import { useDialogs } from "@/components/ui/dialog-provider"

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

/**
 * 软链接文件浏览器：左侧可折叠目录面板（挂载名 + 路径层级 + 子文件夹），
 * 右侧工具栏（搜索/网格列表切换）+ 文件列表 或 文件编辑器。
 */
export function MountBrowser({ mount }: { mount: SymlinkMount }) {
  const { confirm, prompt } = useDialogs()
  const [path, setPath] = useState("")
  const [tree, setTree] = useState<SymlinkTree | null>(null)
  const [file, setFile] = useState<{ path: string; content: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [collapsed, setCollapsed] = useState(false)

  const loadTree = useCallback(
    async (p: string) => {
      if (!mount) return
      setFile(null)
      setEditing(false)
      setPath(p)
      setTree(await symlinkTree(mount.id, p))
    },
    [mount],
  )

  useEffect(() => {
    loadTree("")
  }, [loadTree])

  // 单文件挂载：根即文件，直接打开
  useEffect(() => {
    if (mount?.type === "file") {
      symlinkReadFile(mount.id, "").then(setFile).catch(() => {})
    }
  }, [mount])

  async function openItem(item: SymlinkItem) {
    const p = mount.type === "file" ? "" : joinPath(path, item.name)
    if (item.type === "dir" && mount.type !== "file") {
      await loadTree(p)
    } else {
      try {
        const f = await symlinkReadFile(mount.id, p)
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
      await symlinkWriteFile(mount.id, file.path, editContent)
      setFile({ ...file, content: editContent })
      setEditing(false)
      toast.success("已保存")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败")
    }
  }

  async function createFolder() {
    const name = await prompt({
      title: "新建文件夹",
      description: "输入新文件夹的名称。",
      placeholder: "例如：章节笔记",
      confirmText: "创建",
    })
    if (!name?.trim()) return
    try {
      await symlinkMkdir(mount.id, joinPath(path, name.trim()))
      await loadTree(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败")
    }
  }

  async function removeItem(item: SymlinkItem) {
    const target = joinPath(path, item.name)
    const ok = await confirm({
      title: "删除文件",
      description: `确定删除「${target}」？${item.type === "dir" ? "文件夹将递归删除，不可恢复。" : ""}`,
      confirmText: "删除",
      destructive: true,
    })
    if (!ok) return
    try {
      await symlinkDelete(mount.id, target)
      await loadTree(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败")
    }
  }

  const crumbs = path ? path.split("/").filter(Boolean) : []
  const dirs = (tree?.items ?? []).filter((i) => i.type === "dir")
  const filteredItems = (tree?.items ?? []).filter((i) =>
    i.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  // ---- 左侧目录面板 ----
  const sidePanel = collapsed ? (
    <div className="flex w-10 shrink-0 flex-col items-center gap-2 border-r py-3">
      <button onClick={() => setCollapsed(false)} className="rounded p-1.5 text-muted-foreground hover:bg-accent" title="展开目录">
        <PanelLeft className="size-4" />
      </button>
      <button onClick={() => loadTree("")} className="rounded p-1.5 text-primary hover:bg-accent" title={mount.name}>
        <Link2 className="size-4" />
      </button>
      {crumbs.map((c, i) => (
        <button
          key={i}
          onClick={() => loadTree(crumbs.slice(0, i + 1).join("/"))}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent"
          title={c}
        >
          <Folder className="size-4" />
        </button>
      ))}
    </div>
  ) : (
    <aside className="flex w-52 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <button
          onClick={() => loadTree("")}
          className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          title={mount.name}
        >
          <Link2 className="size-3.5 shrink-0" />
          <span className="truncate">{mount.name}</span>
        </button>
        <button onClick={() => setCollapsed(true)} className="rounded p-1 text-muted-foreground hover:bg-accent" title="收起目录">
          <PanelLeftClose className="size-3.5" />
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* 路径层级（面包屑，可向上跳转） */}
          <p className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">目录</p>
          <div className="mb-2 space-y-0.5">
            {crumbs.map((c, i) => {
              const target = crumbs.slice(0, i + 1).join("/")
              return (
                <button
                  key={i}
                  onClick={() => loadTree(target)}
                  className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Folder className="size-3 shrink-0" />
                  <span className="truncate">{c}</span>
                </button>
              )
            })}
            {crumbs.length === 0 && (
              <p className="px-1.5 py-0.5 text-xs text-muted-foreground">（根目录）</p>
            )}
          </div>
          {/* 当前目录的子文件夹 */}
          <p className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">文件夹</p>
          <div className="space-y-0.5">
            {dirs.map((d) => (
              <button
                key={d.name}
                onClick={() => openItem(d)}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <FolderOpen className="size-3.5 shrink-0 text-primary" />
                <span className="truncate">{d.name}</span>
              </button>
            ))}
            {dirs.length === 0 && (
              <p className="px-1.5 py-0.5 text-xs text-muted-foreground">无子文件夹</p>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  )

  // ---- 右侧主区 ----
  return (
    <div className="flex min-h-[calc(100vh-240px)] overflow-hidden rounded-lg border">
      {sidePanel}

      {/* 主区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          {/* 面包屑 */}
          <div className="flex min-w-0 items-center gap-0.5 text-sm">
            <button onClick={() => loadTree("")} className="shrink-0 font-medium text-primary hover:underline">
              {mount.name}
            </button>
            {crumbs.map((c, i) => {
              const target = crumbs.slice(0, i + 1).join("/")
              return (
                <span key={i} className="flex min-w-0 items-center gap-0.5">
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <button onClick={() => loadTree(target)} className="truncate hover:underline">
                    {c}
                  </button>
                </span>
              )
            })}
            {mount.type === "file" && <Badge variant="outline" className="ml-1">单文件</Badge>}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {mount.type !== "file" && (
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索..."
                    className="h-8 w-40 pl-7 text-xs"
                  />
                </div>
                <div className="flex items-center rounded-md border">
                  <button
                    onClick={() => setView("grid")}
                    className={cn(
                      "rounded-l-md p-1.5",
                      view === "grid" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    title="网格视图"
                  >
                    <Grid3X3 className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setView("list")}
                    className={cn(
                      "rounded-r-md p-1.5",
                      view === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    title="列表视图"
                  >
                    <List className="size-3.5" />
                  </button>
                </div>
              </>
            )}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => loadTree(path)} title="刷新">
              <RefreshCw className="size-3.5" />
            </Button>
            {mount.type !== "file" && (
              <Button variant="outline" size="sm" className="h-8" onClick={createFolder}>
                <Plus className="size-3.5" />
                新建文件夹
              </Button>
            )}
          </div>
        </div>

        {/* 主体：文件编辑器（选中文件时）或 文件列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {file && !editing && (
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-3 py-1.5">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                <SoftLinkFileIcon />
                <span className="truncate">{file.path || baseName(mount.root)}</span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="outline">预览</Badge>
                {mount.type !== "file" && (
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setFile(null)}>
                    <X className="size-3.5" />
                    返回列表
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-7"
                  onClick={() => {
                    setEditContent(file.content)
                    setEditing(true)
                  }}
                >
                  <Pencil className="size-3.5" />
                  编辑
                </Button>
              </div>
            </div>
          )}

          {file && !editing ? (
            <div className="p-4">
              {file.path.endsWith(".md") || file.path.endsWith(".markdown") ? (
                <MarkdownBlock content={file.content} />
              ) : (
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-xs">{file.content}</pre>
              )}
            </div>
          ) : editing ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
                <span className="text-sm font-medium">编辑：{file?.path || baseName(mount.root)}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(false)}>
                    <X className="size-3.5" />
                    取消
                  </Button>
                  <Button size="sm" className="h-7" onClick={saveFile}>
                    <Save className="size-3.5" />
                    保存
                  </Button>
                </div>
              </div>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-72 flex-1 rounded-none border-0 font-mono text-sm focus-visible:ring-0"
              />
            </div>
          ) : (
            // 文件列表
            <div className="p-3">
              {filteredItems.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {search ? "没有匹配的项目。" : mount.type === "file" ? "（单文件挂载）" : "空目录"}
                </p>
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {filteredItems.map((item) => (
                    <div
                      key={item.name}
                      className="group relative rounded-lg border p-3 transition-colors hover:bg-accent/40"
                    >
                      <button onClick={() => openItem(item)} className="flex w-full flex-col items-center gap-2 text-center">
                        {item.type === "dir" ? (
                          <FolderOpen className="size-8 text-primary" />
                        ) : (
                          <SoftLinkFileIcon />
                        )}
                        <span className="line-clamp-2 w-full break-all text-xs">{item.name}</span>
                        {item.type === "file" && (
                          <span className="text-[10px] text-muted-foreground">{fmtSize(item.size)}</span>
                        )}
                      </button>
                      {mount.type !== "file" && (
                        <button
                          onClick={() => removeItem(item)}
                          className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                          title="删除"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredItems.map((item) => (
                    <div
                      key={item.name}
                      className="group flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent/40"
                    >
                      <button onClick={() => openItem(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        {item.type === "dir" ? (
                          <Folder className="size-4 shrink-0 text-primary" />
                        ) : (
                          <SoftLinkFileIcon />
                        )}
                        <span className="truncate">{item.name}</span>
                        {item.type === "file" && (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{fmtSize(item.size)}</span>
                        )}
                      </button>
                      {mount.type !== "file" && (
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
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
