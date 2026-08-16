import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  ChevronRight,
  Circle,
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
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import type { SymlinkItem, SymlinkMount, SymlinkTree } from "@/lib/api"
import { useLightbox } from "@/components/ui/lightbox"
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
import { Textarea } from "@/components/ui/textarea"
import { MarkdownBlock } from "@/components/learn/blocks/MarkdownBlock"
import { useDialogs } from "@/components/ui/dialog-provider"

function joinPath(base: string, name: string) {
  return base ? `${base}/${name}` : name
}

/** 文件分类：文本（内联编辑）/ 媒体（内联预览）/ MetaPilot 文档（.mpf）/ 其它（仅本地打开） */
type FileKind = "text" | "image" | "pdf" | "video" | "audio" | "mpf" | "other"

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
  if (ext === ".mpf") return "mpf"
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
export function MountBrowser({
  mount,
  variant = "manager",
}: {
  mount: SymlinkMount
  /** natural：自然卡片视图（大卡片网格，与普通库一致）；manager：文件管理器视图（网格/列表切换） */
  variant?: "natural" | "manager"
}) {
  const t = useT()
  const { confirm, prompt } = useDialogs()
  const [path, setPath] = useState("")
  const [tree, setTree] = useState<SymlinkTree | null>(null)
  const [file, setFile] = useState<{ path: string; name: string; kind: FileKind; content?: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
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
      if (kind === "text" || kind === "mpf") {
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
    if (kind === "text" || kind === "mpf") {
      try {
        const f = await symlinkReadFile(mount.id, p)
        setFile({ path: f.path, name: item.name, kind, content: f.content })
        setEditing(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("symlink.readFailed"))
      }
    } else if (kind !== "other") {
      // 媒体文件：走二进制预览端点渲染
      setFile({ path: p, name: item.name, kind })
      setEditing(false)
    } else {
      toast.error(t("symlink.noInlinePreviewHint"))
    }
  }

  /** 在用户本机打开/定位挂载内文件 */
  async function openLocal(p: string, mode: "open" | "reveal") {
    try {
      await symlinkOpen(mount.id, p, mode)
      toast.success(mode === "open" ? t("symlink.openedWithDefault") : t("symlink.revealInFileManager"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("symlink.openFailed"))
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
      toast.success(t("symlink.saved"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("symlink.saveFailed"))
    }
  }

  async function createFolder() {
    const name = await prompt({
      title: t("symlink.newFolder"),
      description: t("symlink.newFolderDesc"),
      placeholder: t("symlink.newFolderPlaceholder"),
      confirmText: t("common.create"),
    })
    if (!name?.trim()) return
    try {
      await symlinkMkdir(mount.id, joinPath(path, name.trim()))
      await loadTree(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("symlink.createFailed"))
    }
  }

  async function removeItem(item: SymlinkItem) {
    setCtxMenu(null)
    const target = joinPath(path, item.name)
    const ok = await confirm({
      title: t("symlink.deleteFile"),
      description:
        t("symlink.deleteConfirmDesc", { target }) + (item.type === "dir" ? t("symlink.deleteDirWarning") : ""),
      confirmText: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    try {
      await symlinkDelete(mount.id, target)
      await loadTree(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("symlink.deleteFailed"))
    }
  }

  const crumbs = path ? path.split("/").filter(Boolean) : []
  const filteredItems = (tree?.items ?? []).filter((i) =>
    i.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  // ---- 右侧主区 ----
  return (
    <>
    <div className="min-h-[calc(100vh-240px)] overflow-hidden rounded-lg border">
      {/* 主区：与库一致的文件视图（文件夹 + 文档卡片/列表 + 面包屑导航） */}
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
            {mount.type === "file" && <Badge variant="outline" className="ml-1">{t("symlink.singleFile")}</Badge>}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {mount.type !== "file" && variant === "manager" && (
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("symlink.searchPlaceholder")}
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
                    title={t("symlink.gridView")}
                  >
                    <Grid3X3 className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setView("list")}
                    className={cn(
                      "rounded-r-md p-1.5",
                      view === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    title={t("symlink.listView")}
                  >
                    <List className="size-3.5" />
                  </button>
                </div>
              </>
            )}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => loadTree(path)} title={t("common.refresh")}>
              <RefreshCw className="size-3.5" />
            </Button>
            {mount.type !== "file" && (
              <Button variant="outline" size="sm" className="h-8" onClick={createFolder}>
                <Plus className="size-3.5" />
                {t("symlink.newFolder")}
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
                <Badge variant="outline">{t(file.kind === "mpf" ? "symlink.mpf" : "common.preview")}</Badge>
                {mount.type !== "file" && (
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setFile(null)}>
                    <X className="size-3.5" />
                    {t("symlink.backToList")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => openLocal(file.path, "reveal")}
                  title={t("symlink.revealInFileManager")}
                >
                  <FolderOpen className="size-3.5" />
                  {t("symlink.reveal")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => openLocal(file.path, "open")}
                  title={t("symlink.openWithDefault")}
                >
                  <ExternalLink className="size-3.5" />
                  {t("common.open")}
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
                    {t("common.edit")}
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
          ) : file && !editing && file.kind === "mpf" ? (
            <MpfViewer mount={mount} path={file.path} />
          ) : file && !editing && file.kind !== "text" ? (
            <MediaViewer mount={mount} file={file} />
          ) : editing ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
                <span className="text-sm font-medium">{t("symlink.editing", { path: file?.path || baseName(mount.root) })}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(false)}>
                    <X className="size-3.5" />
                    {t("common.cancel")}
                  </Button>
                  <Button size="sm" className="h-7" onClick={saveFile}>
                    <Save className="size-3.5" />
                    {t("common.save")}
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
                  {search
                    ? t("symlink.noMatch")
                    : mount.type === "file"
                      ? t("symlink.singleFileMount")
                      : t("symlink.emptyDir")}
                </p>
              ) : variant === "natural" || view === "grid" ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredItems.map((item) => (
                    <div
                      key={item.name}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setCtxMenu({ item, x: e.clientX, y: e.clientY })
                      }}
                      className="group relative rounded-lg border p-4 transition-shadow hover:shadow-md"
                    >
                      <button onClick={() => openItem(item)} className="flex w-full flex-col items-center gap-2 text-center">
                        {item.type === "dir" ? (
                          <FolderOpen className="size-8 text-primary" />
                        ) : (
                          <FileTypeIcon name={item.name} />
                        )}
                        <span className="line-clamp-2 w-full break-all text-xs font-medium">{item.name}</span>
                        {item.type === "dir" ? (
                          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            <Folder className="size-2.5" />
                            {t("symlink.folder")}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">{fmtSize(item.size)}</span>
                        )}
                      </button>
                      {mount.type !== "file" && (
                        <button
                          onClick={() => removeItem(item)}
                          className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                          title={t("common.delete")}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredItems.map((item) => (
                    <div
                      key={item.name}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setCtxMenu({ item, x: e.clientX, y: e.clientY })
                      }}
                      className="group flex items-center gap-3 rounded-lg border px-4 py-3 text-sm hover:bg-accent/40"
                    >
                      <button onClick={() => openItem(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        {item.type === "dir" ? (
                          <Folder className="size-4 shrink-0 text-primary" />
                        ) : (
                          <FileTypeIcon name={item.name} />
                        )}
                        <span className="truncate font-medium">{item.name}</span>
                        {item.type === "file" ? (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{fmtSize(item.size)}</span>
                        ) : (
                          <Badge variant="secondary">{t("symlink.folder")}</Badge>
                        )}
                      </button>
                      {mount.type !== "file" && (
                        <button
                          onClick={() => removeItem(item)}
                          className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                          title={t("common.delete")}
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
            {t("symlink.openWithDefault")}
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => openContextItem(ctxMenu.item, "reveal")}
          >
            <FolderOpen className="size-3.5" />
            {t("symlink.revealInFileManager")}
          </button>
          {mount.type !== "file" && ctxMenu.item.type === "file" && (
            <>
              <div className="bg-border -mx-1 my-1 h-px" />
              <button
                className="text-destructive flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-destructive/10"
                onClick={() => removeItem(ctxMenu.item)}
              >
                <Trash2 className="size-3.5" />
                {t("common.delete")}
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

/** MetaPilot 文档（.mpf）阅读视图：doc 类型渲染内容大纲 + Markdown；canvas 类型渲染只读概览。 */
interface MpfBlock {
  type: string
  content?: string
  [k: string]: unknown
}
interface MpfSection {
  id?: string
  name: string
  blocks: MpfBlock[]
}
interface MpfDocument {
  id?: string
  name: string
  sections?: MpfSection[]
}
interface MpfFolder {
  id?: string
  name: string
  documents?: MpfDocument[]
  folders?: MpfFolder[]
}

function firstSection(folders: MpfFolder[]): { docName: string; secName: string; blocks: MpfBlock[] } | null {
  for (const f of folders) {
    const sub = firstSection(f.folders ?? [])
    if (sub) return sub
    for (const d of f.documents ?? []) {
      const s = (d.sections ?? [])[0]
      if (s) return { docName: d.name, secName: s.name, blocks: s.blocks ?? [] }
    }
  }
  return null
}

function MpfViewer({ mount, path }: { mount: SymlinkMount; path: string }) {
  const t = useT()
  const [parsed, setParsed] = useState<{
    kind: "doc" | "canvas"
    name: string
    folders?: MpfFolder[]
    nodes?: { id: string; type: string; text?: string }[]
    edges?: { id: string; fromNode: string; toNode: string; label?: string }[]
  } | null>(null)
  const [error, setError] = useState("")
  const [active, setActive] = useState<{ docName: string; secName: string; blocks: MpfBlock[] } | null>(null)

  useEffect(() => {
    symlinkReadFile(mount.id, path)
      .then((f) => {
        try {
          const data = JSON.parse(f.content) as { type?: string; name?: string; canvas?: { nodes?: unknown[]; edges?: unknown[] }; folders?: MpfFolder[]; collections?: MpfFolder[] }
          if (data.type === "canvas") {
            setParsed({
              kind: "canvas",
              name: data.name || path,
              nodes: (data.canvas?.nodes ?? []) as { id: string; type: string; text?: string }[],
              edges: (data.canvas?.edges ?? []) as { id: string; fromNode: string; toNode: string; label?: string }[],
            })
          } else if (data.type === "doc") {
            const folders = data.folders ?? data.collections ?? []
            setParsed({ kind: "doc", name: data.name || path, folders })
            setActive(firstSection(folders))
          } else {
            setError(t("symlink.mpfUnknownType"))
          }
        } catch {
          setError(t("symlink.mpfInvalid"))
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("symlink.mpfInvalid")))
  }, [mount, path, t])

  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>
  if (!parsed) return <p className="p-6 text-sm text-muted-foreground">{t("symlink.loadingMpf")}</p>

  if (parsed.kind === "canvas") {
    return (
      <div className="space-y-4 p-4">
        <div>
          <p className="mb-2 text-sm font-medium">{t("symlink.mpfCanvasNodes")}（{parsed.nodes?.length ?? 0}）</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(parsed.nodes ?? []).map((n) => (
              <div key={n.id} className="rounded-md border bg-muted/40 px-3 py-1.5 text-xs">
                <span className="font-medium">{n.text || n.id}</span>
                <span className="text-muted-foreground"> · {n.type}</span>
              </div>
            ))}
            {(parsed.nodes?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">{t("symlink.mpfEmpty")}</p>}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">{t("symlink.mpfCanvasEdges")}（{parsed.edges?.length ?? 0}）</p>
          <div className="space-y-1">
            {(parsed.edges ?? []).map((e) => (
              <p key={e.id} className="rounded-md border bg-muted/40 px-3 py-1.5 text-xs">
                {e.fromNode} → {e.toNode}
                {e.label ? ` · ${e.label}` : ""}
              </p>
            ))}
            {(parsed.edges?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">{t("symlink.mpfEmpty")}</p>}
          </div>
        </div>
      </div>
    )
  }

  // doc：左侧内容大纲 + 右侧小节内容（与库文档一致的阅读方式）
  const renderFolder = (f: MpfFolder, depth: number): React.ReactNode => (
    <div key={f.id ?? f.name}>
      <p
        className="flex items-center gap-1 truncate px-1 py-0.5 text-xs font-medium text-muted-foreground"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <FolderOpen className="size-3 shrink-0" />
        <span className="truncate">{f.name}</span>
      </p>
      {(f.folders ?? []).map((sf) => renderFolder(sf, depth + 1))}
      {(f.documents ?? []).map((d) => (
        <div key={d.id ?? d.name}>
          <p
            className="flex items-center gap-1 truncate px-1 py-0.5 text-xs font-medium"
            style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
          >
            <FileText className="size-3 shrink-0 text-primary" />
            <span className="truncate">{d.name}</span>
          </p>
          {(d.sections ?? []).map((s) => {
            const sel = active?.docName === d.name && active?.secName === s.name
            return (
              <button
                key={s.id ?? s.name}
                onClick={() => setActive({ docName: d.name, secName: s.name, blocks: s.blocks ?? [] })}
                className={cn(
                  "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs",
                  sel ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                style={{ paddingLeft: `${8 + (depth + 2) * 12}px` }}
              >
                <Circle className="size-1.5 shrink-0" />
                <span className="truncate">{s.name}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex min-h-[50vh]">
      <aside className="w-56 shrink-0 overflow-y-auto border-r p-2">
        <p className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">{t("symlink.mpfDocOutline")}</p>
        {(parsed.folders ?? []).map((f) => renderFolder(f, 0))}
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {active ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {active.docName} · {active.secName}
            </p>
            {active.blocks
              .filter((b) => b.type === "markdown" && b.content)
              .map((b, i) => (
                <MarkdownBlock key={i} content={b.content} />
              ))}
            {active.blocks.length === 0 && <p className="text-xs text-muted-foreground">{t("symlink.mpfEmpty")}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("symlink.mpfNoSection")}</p>
        )}
      </div>
    </div>
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
  const t = useT()
  const url = symlinkMediaUrl(mount.id, file.path)
  const { open, node } = useLightbox()
  switch (file.kind) {
    case "image":
      return (
        <div className="flex justify-center p-4">
          <img
            src={url}
            alt={file.name}
            className="max-h-[70vh] max-w-full cursor-zoom-in rounded-md border object-contain transition-shadow hover:shadow-md"
            onClick={() => open({ src: url, alt: file.name })}
          />
          {node}
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
      return <p className="p-4 text-sm text-muted-foreground">{t("symlink.noInlinePreview")}</p>
  }
}
