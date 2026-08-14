import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  ChevronRight,
  ExternalLink,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
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
  symlinkOpen,
  symlinkReadFile,
  symlinkTree,
  symlinkWriteFile,
  symlinkMediaUrl,
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

/** 文件分类：文本（内联编辑）/ 媒体（内联预览）/ 其它（仅本地打开） */
type FileKind = "text" | "image" | "pdf" | "video" | "audio" | "other"

const TEXT_EXT = new Set([
  ".md", ".markdown", ".txt", ".text", ".json", ".yaml", ".yml",
  ".csv", ".tsv", ".log", ".xml", ".html", ".css", ".js", ".ts",
  ".py", ".toml", ".ini", ".conf", ".cfg",
])

const MEDIA_EXT: Record<string, FileKind> = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image",
  ".svg": "image", ".bmp": "image", ".ico": "image",
  ".pdf": "pdf",
  ".mp4": "video", ".webm": "video", ".ogg": "video", ".mov": "video",
  ".mp3": "audio", ".wav": "audio", ".flac": "audio", ".m4a": "audio",
}

function kindOf(name: string): FileKind {
  const i = name.lastIndexOf(".")
  const ext = (i >= 0 ? name.slice(i) : "").toLowerCase()
  if (TEXT_EXT.has(ext)) return "text"
  return MEDIA_EXT[ext] ?? "other"
}

/** 软链接来源的文件图标：按类型区分，统一带 Link2 角标，标识来自软链接插件。 */
function FileTypeIcon({ name }: { name: string }) {
  const kind = kindOf(name)
  const Icon =
    kind === "image" ? FileImage : kind === "video" ? FileVideo : kind === "audio" ? FileAudio : FileText
  return (
    <span className="relative inline-flex shrink-0">
      <Icon className="size-4 text-muted-foreground" />
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
  const [file, setFile] = useState<{ path: string; name: string; kind: FileKind; content?: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [collapsed, setCollapsed] = useState(false)
  /** 右键菜单：在哪个文件上、出现在哪个屏幕坐标 */
  const [ctxMenu, setCtxMenu] = useState<{ item: SymlinkItem; x: number; y: number } | null>(null)

  // 点击/滚轮/键盘/再次右键时关闭右键菜单
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener("click", close)
    window.addEventListener("blur", close)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("blur", close)
      window.removeEventListener("keydown", close)
    }
  }, [ctxMenu])

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

  // 单文件挂载：根即文件，按类型直接打开
  useEffect(() => {
    if (mount?.type === "file") {
      const name = baseName(mount.root)
      const kind = kindOf(name)
      if (kind === "text") {
        symlinkReadFile(mount.id, "")
          .then((f) => setFile({ path: f.path, name, kind, content: f.content }))
          .catch(() => {})
      } else if (kind !== "other") {
        setFile({ path: "", name, kind })
      }
    }
  }, [mount])

  async function openItem(item: SymlinkItem) {
    const p = mount.type === "file" ? "" : joinPath(path, item.name)
    if (item.type === "dir" && mount.type !== "file") {
      await loadTree(p)
      return
    }
    const kind = kindOf(item.name)
    if (kind === "text") {
      try {
        const f = await symlinkReadFile(mount.id, p)
        setFile({ path: f.path, name: item.name, kind, content: f.content })
        setEditing(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "读取失败")
      }
    } else if (kind !== "other") {
      // 媒体文件：走二进制预览端点渲染
      setFile({ path: p, name: item.name, kind })
      setEditing(false)
    } else {
      toast.error("该文件类型不支持内联预览，可右键选择「用默认方式打开」")
    }
  }

  /** 在用户本机打开/定位挂载内文件 */
  async function openLocal(p: string, mode: "open" | "reveal") {
    try {
      await symlinkOpen(mount.id, p, mode)
      toast.success(mode === "open" ? "已调用系统默认方式打开" : "已在文件管理器中定位")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "打开失败")
    }
  }

  function openContextItem(item: SymlinkItem, mode: "open" | "reveal") {
    setCtxMenu(null)
    void openLocal(mount.type === "file" ? "" : joinPath(path, item.name), mode)
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
    setCtxMenu(null)
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
    <>
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
                <FileTypeIcon name={file.name} />
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
                  variant="outline"
                  className="h-7"
                  onClick={() => openLocal(file.path, "reveal")}
                  title="在文件管理器中显示"
                >
                  <FolderOpen className="size-3.5" />
                  定位
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => openLocal(file.path, "open")}
                  title="用系统默认方式打开"
                >
                  <ExternalLink className="size-3.5" />
                  打开
                </Button>
                {file.kind === "text" && (
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={() => {
                      setEditContent(file.content ?? "")
                      setEditing(true)
                    }}
                  >
                    <Pencil className="size-3.5" />
                    编辑
                  </Button>
                )}
              </div>
            </div>
          )}

          {file && !editing && file.kind === "text" ? (
            <div className="p-4">
              {(file.path.endsWith(".md") || file.path.endsWith(".markdown")) && file.content ? (
                <MarkdownBlock content={file.content} />
              ) : (
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-xs">{file.content}</pre>
              )}
            </div>
          ) : file && !editing && file.kind !== "text" ? (
            <MediaViewer mount={mount} file={file} />
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
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setCtxMenu({ item, x: e.clientX, y: e.clientY })
                      }}
                      className="group relative rounded-lg border p-3 transition-colors hover:bg-accent/40"
                    >
                      <button onClick={() => openItem(item)} className="flex w-full flex-col items-center gap-2 text-center">
                        {item.type === "dir" ? (
                          <FolderOpen className="size-8 text-primary" />
                        ) : (
                          <FileTypeIcon name={item.name} />
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
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setCtxMenu({ item, x: e.clientX, y: e.clientY })
                      }}
                      className="group flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent/40"
                    >
                      <button onClick={() => openItem(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        {item.type === "dir" ? (
                          <Folder className="size-4 shrink-0 text-primary" />
                        ) : (
                          <FileTypeIcon name={item.name} />
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
    {ctxMenu &&
      createPortal(
        <div
          className="bg-popover text-popover-foreground z-50 min-w-[12rem] rounded-md border p-1 shadow-md"
          style={{
            position: "fixed",
            left: Math.min(ctxMenu.x, window.innerWidth - 200),
            top: Math.min(ctxMenu.y, window.innerHeight - 160),
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{ctxMenu.item.name}</p>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => openContextItem(ctxMenu.item, "open")}
          >
            <ExternalLink className="size-3.5" />
            用默认方式打开
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => openContextItem(ctxMenu.item, "reveal")}
          >
            <FolderOpen className="size-3.5" />
            在文件管理器中显示
          </button>
          {mount.type !== "file" && ctxMenu.item.type === "file" && (
            <>
              <div className="bg-border -mx-1 my-1 h-px" />
              <button
                className="text-destructive flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-destructive/10"
                onClick={() => removeItem(ctxMenu.item)}
              >
                <Trash2 className="size-3.5" />
                删除
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

/** 媒体文件内联预览：图片 / PDF / 视频 / 音频（数据来自后端二进制端点）。 */
function MediaViewer({
  mount,
  file,
}: {
  mount: SymlinkMount
  file: { path: string; name: string; kind: FileKind }
}) {
  const url = symlinkMediaUrl(mount.id, file.path)
  switch (file.kind) {
    case "image":
      return (
        <div className="flex justify-center p-4">
          <img
            src={url}
            alt={file.name}
            className="max-h-[70vh] max-w-full rounded-md border object-contain"
          />
        </div>
      )
    case "pdf":
      return (
        <div className="p-4">
          <iframe src={url} title={file.name} className="h-[70vh] w-full rounded-md border" />
        </div>
      )
    case "video":
      return (
        <div className="flex justify-center p-4">
          <video src={url} controls className="max-h-[70vh] w-full max-w-3xl rounded-md" />
        </div>
      )
    case "audio":
      return (
        <div className="flex justify-center p-6">
          <audio src={url} controls className="w-full max-w-xl" />
        </div>
      )
    default:
      return <p className="p-4 text-sm text-muted-foreground">该文件类型不支持内联预览</p>
  }
}
