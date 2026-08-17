import * as React from "react"
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
  FolderOpen,
  Link2,
  Pencil,
  Save,
  Trash2,
  Workflow,
  X,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import type { SymlinkItem, SymlinkMount, SymlinkTree } from "@/lib/api"
import { useLightbox } from "@/components/ui/lightbox"
import { FileManagerView, FolderBadge, type ContentEntry } from "@/components/library/views"
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

  /** 在挂载内新建 MetaPilot 文档（.mpf）：doc 类型（文档）或 canvas 类型（图表）。 */
  async function createMpf(kind: "doc" | "canvas") {
    const isDoc = kind === "doc"
    const name = await prompt({
      title: t(isDoc ? "core.library.newDocTitle" : "core.library.newCanvasTitle"),
      placeholder: t(isDoc ? "core.library.newDocPlaceholder" : "core.library.newCanvasPlaceholder"),
      initialValue: t(isDoc ? "core.library.newDocDefault" : "core.library.newCanvasDefault"),
      confirmText: t("common.create"),
    })
    if (!name?.trim()) return
    const title = name.trim()
    const payload = isDoc
      ? { format: "meta-pilot", formatVersion: 1, type: "doc", name: title, folders: [] }
      : { format: "meta-pilot", formatVersion: 1, type: "canvas", name: title, canvas: { nodes: [], edges: [] } }
    const filename = `${title.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 80)}.mpf`
    try {
      await symlinkWriteFile(mount.id, joinPath(path, filename), JSON.stringify(payload, null, 2))
      await loadTree(path)
      toast.success(t(isDoc ? "core.library.createdDoc" : "core.library.createdCanvas"))
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
  const items = tree?.items ?? []
  const itemById = (id: string) => items.find((i) => i.name === id)
  /** 文件类型标签（badge 显示，如 MD / JSON / 图片） */
  function fileExtLabel(name: string) {
    const i = name.lastIndexOf(".")
    if (i < 0) return t("symlink.file")
    return name.slice(i + 1).toUpperCase()
  }
  const entries: ContentEntry[] = items.map((it) => ({
    id: it.name,
    name: it.name,
    type: it.type === "dir" ? "folder" : "file",
    icon: it.type === "dir" ? (
      <FolderOpen className="size-4 shrink-0 text-primary" />
    ) : (
      <span className="flex shrink-0 items-center">
        <FileTypeIcon name={it.name} />
      </span>
    ),
    badge:
      it.type === "dir" ? (
        <FolderBadge label={t("symlink.folder")} />
      ) : (
        <Badge variant="secondary">{fileExtLabel(it.name)}</Badge>
      ),
    tail: it.type === "file" ? (
      <span className="text-xs text-muted-foreground">{fmtSize(it.size)}</span>
    ) : undefined,
  }))
  const breadcrumbs: React.ReactNode[] = [
    <button
      key="__root__"
      type="button"
      onClick={() => loadTree("")}
      className="shrink-0 font-medium text-primary hover:underline"
    >
      {mount.name}
      {mount.type === "file" ? ` ${t("symlink.singleFile")}` : ""}
    </button>,
    ...crumbs.map((c, i) => {
      const target = crumbs.slice(0, i + 1).join("/")
      return (
        <span key={target} className="flex min-w-0 items-center gap-0.5">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <button type="button" onClick={() => loadTree(target)} className="truncate hover:underline">
            {c}
          </button>
        </span>
      )
    }),
  ]

  // ---- 右侧主区 ----
  return (
    <>
    <div className="min-h-[calc(100vh-240px)] overflow-hidden rounded-lg border">
      {/* 主区：与库一致的文件视图（文件夹 + 文档卡片/列表 + 面包屑导航） */}
      <div className="flex min-w-0 flex-1 flex-col">
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
            <MpfBoundary>
              <MpfViewer mount={mount} path={file.path} />
            </MpfBoundary>
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
            <FileManagerView
              natural={variant === "natural"}
              breadcrumbs={breadcrumbs}
              entries={entries}
              onOpen={(id) => {
                const it = itemById(id)
                if (it) void openItem(it)
              }}
              onContextMenu={
                mount.type !== "file"
                  ? (e, entry) => {
                      e.preventDefault()
                      const it = itemById(entry.id)
                      if (it) setCtxMenu({ item: it, x: e.clientX, y: e.clientY })
                    }
                  : undefined
              }
              search={search}
              onSearch={setSearch}
              view={view}
              onViewChange={setView}
              onRefresh={() => loadTree(path)}
              createActions={
                mount.type !== "file"
                  ? [
                      { label: t("symlink.newFolder"), icon: <FolderOpen className="size-4" />, action: () => void createFolder() },
                      { label: t("core.library.newDoc"), icon: <FileText className="size-4" />, action: () => void createMpf("doc") },
                      { label: t("core.library.newCanvas"), icon: <Workflow className="size-4" />, action: () => void createMpf("canvas") },
                    ]
                  : undefined
              }
              emptyHint={
                search
                  ? t("symlink.noMatch")
                  : mount.type === "file"
                    ? t("symlink.singleFileMount")
                    : t("symlink.emptyDir")
              }
            />
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

/** .mpf 渲染错误边界：结构异常时显示错误提示而非白屏。 */
class MpfBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <p className="p-6 text-sm text-destructive">
          文档渲染失败：{String(this.state.error.message ?? this.state.error)}
        </p>
      )
    }
    return this.props.children
  }
}

/** MetaPilot 文档（.mpf）阅读视图：doc 类型渲染内容大纲 + Markdown；canvas 类型渲染只读概览。 */
interface MpfBlock {
  type: string
  content?: unknown
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
    if (!f) continue
    const sub = firstSection(f.folders ?? [])
    if (sub) return sub
    for (const d of f.documents ?? []) {
      if (!d) continue
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
  const renderFolder = (f: MpfFolder, depth: number): React.ReactNode => {
    if (!f || typeof f !== "object") return null
    return (
      <div key={f.id ?? f.name ?? depth}>
        <p
          className="flex items-center gap-1 truncate px-1 py-0.5 text-xs font-medium text-muted-foreground"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <FolderOpen className="size-3 shrink-0" />
          <span className="truncate">{f.name ?? ""}</span>
        </p>
        {(f.folders ?? []).filter(Boolean).map((sf) => renderFolder(sf, depth + 1))}
        {(f.documents ?? []).filter(Boolean).map((d) => (
          <div key={d.id ?? d.name}>
            <p
              className="flex items-center gap-1 truncate px-1 py-0.5 text-xs font-medium"
              style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
            >
              <FileText className="size-3 shrink-0 text-primary" />
              <span className="truncate">{d.name ?? ""}</span>
            </p>
            {(d.sections ?? []).filter(Boolean).map((s) => {
              const sel = active?.docName === d.name && active?.secName === s.name
              return (
                <button
                  key={s.id ?? s.name}
                  onClick={() => setActive({ docName: d.name ?? "", secName: s.name ?? "", blocks: s.blocks ?? [] })}
                  className={cn(
                    "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs",
                    sel ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  style={{ paddingLeft: `${8 + (depth + 2) * 12}px` }}
                >
                  <Circle className="size-1.5 shrink-0" />
                  <span className="truncate">{s.name ?? ""}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex min-h-[50vh]">
      <aside className="w-56 shrink-0 overflow-y-auto border-r p-2">
        <p className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">{t("symlink.mpfDocOutline")}</p>
        {(parsed.folders ?? []).filter(Boolean).map((f) => renderFolder(f, 0))}
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {active ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {active.docName} · {active.secName}
            </p>
            {active.blocks
              .filter((b) => b && b.type === "markdown" && b.content != null)
              .map((b, i) => (
                <MarkdownBlock key={i} content={String(b.content ?? "")} />
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
