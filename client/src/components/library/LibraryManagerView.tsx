import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import * as Lucide from "lucide-react"
import { BookOpen, CheckSquare, ChevronRight, Copy, FileText, FolderInput, FolderPlus, FolderTree, Trash2, Workflow, X } from "lucide-react"

import { useT } from "@/i18n"
import { toast } from "@/lib/toast"
import { api, type Document, type Folder, type FolderItem, type FolderKindMeta, type Library } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDialogs } from "@/components/ui/dialog-provider"
import { FileManagerView, FolderBadge, type ContentEntry } from "@/components/library/views"
import {
  contextMenuItems,
  EntryContextMenu,
  MoveDialog,
  useBulkOps,
  type OpItem,
} from "@/components/library/entry-menu"

/** 文件夹类型图标（kind 元数据 icon，lucide 名） */
function kindIcon(meta?: FolderKindMeta) {
  if (!meta?.icon) return FolderTree
  const Cmp = (Lucide as unknown as Record<string, unknown>)[meta.icon]
  return typeof Cmp === "function" ? (Cmp as typeof FolderTree) : FolderTree
}

/** 文件夹类型打开路由（kind 元数据 openRoute，{id} 占位；空 = 无独立页） */
function kindHref(meta: FolderKindMeta | undefined, id: string): string {
  return meta?.openRoute ? meta.openRoute.replace("{id}", id) : ""
}

/**
 * 库的文件管理器视图：与软链接文件管理器完全一致的面包屑工具栏
 * （搜索 / 网格列表切换 / 刷新 / 新建文件夹 / 批量选择）+ 文件夹/文档网格或列表。
 * - 顶层集合（kind 有 openRoute 的课程/笔记/图表）正确显示类型图标，点击直达其内容页；
 * - 纯目录文件夹 / 嵌套文件夹点击进入下一层；文档点击打开所属顶层集合的内容页；
 * - 每条目支持右键菜单（打开/重命名/创建副本/移动到/删除）与批量选择模式。
 */
export function LibraryManagerView({ libraryId }: { libraryId: string }) {
  const t = useT()
  const navigate = useNavigate()
  const { prompt } = useDialogs()
  const [lib, setLib] = useState<Library | null>(null)
  const [kindMeta, setKindMeta] = useState<Record<string, FolderKindMeta>>({})
  // 当前文件夹链（path[0] = 顶层文件夹；空 = 库根）
  const [path, setPath] = useState<Folder[]>([])
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  // 多选模式
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // 右键菜单
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: OpItem } | null>(null)

  const ops = useBulkOps({
    onDone: () => {
      load()
    },
  })

  const load = () => {
    api.getLibrary(libraryId).then(setLib).catch(() => setLib(null))
  }

  useEffect(() => {
    setPath([])
    load()
    api.listFolderKinds().then(setKindMeta).catch(() => {})
  }, [libraryId])

  const current = useMemo(() => {
    if (!lib) return null
    if (path.length === 0) {
      // 库根：顶层文件夹（含 kind）
      return { top: null as Folder | null, folders: lib.folders, docs: [] as Document[] }
    }
    const top = path[0]
    const f = path[path.length - 1]
    if (path.length === 1) {
      // 顶层文件夹内：嵌套文件夹 + 直接文档（folderId 为空 = 根级文档）
      return { top, folders: f.folders as FolderItem[], docs: (f.documents ?? []).filter((d) => !d.folderId) }
    }
    // 嵌套文件夹内：子文件夹 + 文档（folderId === 当前）
    return { top, folders: f.folders as FolderItem[], docs: (f.documents ?? []).filter((d) => d.folderId === f.id) }
  }, [lib, path])

  /** 新建文件夹：库根建纯目录顶层（kind=folder）；文件夹内建嵌套文件夹 */
  async function createFolderNow() {
    const name = await prompt({
      title: t("core.library.newFolderTitle"),
      placeholder: t("core.library.newFolderPlaceholder"),
      confirmText: t("common.create"),
    })
    if (!name?.trim()) return
    if (path.length === 0) {
      await api.createFolder(libraryId, { name: name.trim(), kind: "folder" })
    } else {
      await api.createSubFolder(path[0].id, {
        name: name.trim(),
        parentId: path.length > 1 ? path[path.length - 1].id : "",
      })
    }
    load()
  }

  /** 新建文档：库根建 kind=note 顶层；文件夹内建文档到当前文件夹 */
  async function createDocNow() {
    const name = await prompt({
      title: t("core.library.newDocTitle"),
      placeholder: t("core.library.newDocPlaceholder"),
      initialValue: t("core.library.newDocDefault"),
      confirmText: t("common.create"),
    })
    if (!name?.trim()) return
    if (path.length === 0) {
      await api.createFolder(libraryId, { name: name.trim(), kind: "note" })
    } else {
      await api.createDocument(path[0].id, {
        name: name.trim(),
        docType: "study",
        folderId: path.length > 1 ? path[path.length - 1].id : "",
      })
    }
    load()
    toast.success(t("core.library.createdDoc"))
  }

  /** 新建图表（kind=canvas 顶层，仅库根可用） */
  async function createCanvasNow() {
    const name = await prompt({
      title: t("core.library.newCanvasTitle"),
      placeholder: t("core.library.newCanvasPlaceholder"),
      initialValue: t("core.library.newCanvasDefault"),
      confirmText: t("common.create"),
    })
    if (!name?.trim()) return
    await api.createFolder(libraryId, { name: name.trim(), kind: "canvas" })
    load()
    toast.success(t("core.library.createdCanvas"))
  }

  if (!lib || !current) {
    return (
      <div className="space-y-2 rounded-lg border p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const topMeta = current.top ? kindMeta[current.top.kind] : undefined
  const topHref = current.top ? kindHref(topMeta, current.top.id) : ""

  // 面包屑：库名 → 文件夹链
  const breadcrumbs: React.ReactNode[] = [
    <button
      key="__root__"
      type="button"
      onClick={() => setPath([])}
      className={path.length === 0 ? "shrink-0 font-medium text-primary" : "shrink-0 font-medium hover:underline"}
    >
      {lib.name}
    </button>,
    ...path.map((f, i) => (
      <span key={f.id} className="flex min-w-0 items-center gap-0.5">
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={() => setPath(path.slice(0, i + 1))}
          className={
            i === path.length - 1 ? "font-medium text-primary" : "truncate text-foreground hover:underline"
          }
        >
          {f.name}
        </button>
      </span>
    )),
  ]

  // 条目：文件夹（顶层含 kind 图标/徽标）+ 文档
  const entries: ContentEntry[] = [
    ...current.folders.map((f) => {
      const isTop = "kind" in f
      const meta = isTop ? kindMeta[(f as Folder).kind] : undefined
      const Icon = isTop ? kindIcon(meta) : FolderTree
      return {
        id: f.id,
        name: f.name,
        type: "folder" as const,
        icon: <Icon className="size-4 shrink-0 text-primary" />,
        badge: isTop ? (
          <Badge variant="secondary">{t(meta?.labelKey ?? "core.library.kindNote")}</Badge>
        ) : (
          <FolderBadge label={t("symlink.folder")} />
        ),
        // 顶层集合：kind 有独立内容页则点击直达；纯目录/嵌套文件夹进入内部浏览
        href: isTop ? kindHref(meta, f.id) : "",
        kind: isTop ? (f as Folder).kind : undefined,
        parentId: isTop ? undefined : (f as FolderItem).parentId ?? "",
      }
    }),
    ...current.docs.map((d) => ({
      id: d.id,
      name: d.name,
      type: "file" as const,
      icon: <BookOpen className="size-4 shrink-0 text-muted-foreground/70" />,
      badge: d.docType === "quiz" ? (
        <Badge variant="outline">{t("core.library.quiz")}</Badge>
      ) : (
        <Badge variant="secondary">{t("core.library.unitDoc")}</Badge>
      ),
      tail: undefined,
      // 文档打开 = 所属顶层集合内容页
      href: topHref,
      kind: d.docType,
    })),
  ]

  /** 打开：顶层集合有独立页直达；纯目录/嵌套文件夹进入内部；文档打开所属顶层集合内容页 */
  function handleOpen(id: string) {
    if (!current || selectionMode) {
      if (selectionMode) {
        toggleSelect(id)
      }
      return
    }
    if (selectionMode) {
      toggleSelect(id)
      return
    }
    const entry = entries.find((e) => e.id === id)
    if (!entry) return
    if (entry.type === "folder") {
      const f = current.folders.find((x) => x.id === id)
      if (!f) return
      if (entry.href) {
        navigate(entry.href)
      } else {
        setPath([...(path as Folder[]), f as Folder])
      }
      return
    }
    // 文档
    if (entry.href) navigate(entry.href)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function enterSelection() {
    setSelected(new Set())
    setSelectionMode(true)
  }

  function exitSelection() {
    setSelectionMode(false)
    setSelected(new Set())
  }

  /** 右键菜单：构造统一操作对象并打开菜单 */
  function handleContextMenu(e: React.MouseEvent, entry: ContentEntry) {
    e.preventDefault()
    if (!current) return
    if (selectionMode) {
      toggleSelect(entry.id)
      return
    }
    const f = current.folders.find((x) => x.id === entry.id)
    const item: OpItem = {
      id: entry.id,
      name: entry.name,
      type: entry.type === "file" ? "doc" : "kind" in (f ?? {}) ? "top" : "sub",
      kind: entry.kind,
      href: entry.href || undefined,
      libraryId,
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, item })
  }

  // 当前层可操作对象（批量操作/全选）
  const visibleItems: OpItem[] = entries.map((e) => {
    const f = current.folders.find((x) => x.id === e.id)
    return {
      id: e.id,
      name: e.name,
      type: e.type === "file" ? "doc" : "kind" in (f ?? {}) ? "top" : "sub",
      kind: e.kind,
      href: e.href || undefined,
      libraryId,
    }
  })
  const selectedItems = visibleItems.filter((i) => selected.has(i.id))

  const bulkBar = (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-2">
      <span className="text-sm font-medium">{t("core.library.bulkSelectedCount", { count: selected.size })}</span>
      <Button variant="outline" size="sm" className="h-8" onClick={() => setSelected(new Set(visibleItems.map((i) => i.id)))}>
        <CheckSquare className="size-3.5" />
        {t("core.library.selectAll")}
      </Button>
      <span className="flex-1" />
      <Button variant="outline" size="sm" className="h-8" disabled={selectedItems.length === 0} onClick={() => void ops.duplicate(selectedItems)}>
        <Copy className="size-3.5" />
        {t("core.library.duplicate")}
      </Button>
      <Button variant="outline" size="sm" className="h-8" disabled={selectedItems.length === 0} onClick={() => ops.move(selectedItems)}>
        <FolderInput className="size-3.5" />
        {t("core.library.move")}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        className="h-8"
        disabled={selectedItems.length === 0}
        onClick={() => void ops.remove(selectedItems)}
      >
        <Trash2 className="size-3.5" />
        {t("core.library.deleteSelected")}
      </Button>
      <Button variant="ghost" size="sm" className="h-8" onClick={exitSelection}>
        <X className="size-3.5" />
        {t("core.library.exitSelection")}
      </Button>
    </div>
  )

  return (
    <>
      <FileManagerView
        breadcrumbs={breadcrumbs}
        entries={entries}
        onOpen={handleOpen}
        onContextMenu={handleContextMenu}
        search={search}
        onSearch={setSearch}
        view={view}
        onViewChange={setView}
        onRefresh={load}
        createActions={[
          { label: t("core.library.newFolder"), icon: <FolderPlus className="size-4" />, action: () => void createFolderNow() },
          { label: t("core.library.newDoc"), icon: <FileText className="size-4" />, action: () => void createDocNow() },
          ...(path.length === 0
            ? [{ label: t("core.library.newCanvas"), icon: <Workflow className="size-4" />, action: () => void createCanvasNow() }]
            : []),
        ]}
        emptyHint={t("core.library.empty")}
        selectionMode={selectionMode}
        selected={selected}
        onToggleSelect={toggleSelect}
        onEnterSelection={enterSelection}
        onExitSelection={exitSelection}
        bulkBar={selectionMode ? bulkBar : undefined}
      />

      {/* 右键菜单 */}
      {ctxMenu && (
        <EntryContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          title={ctxMenu.item.name}
          items={contextMenuItems(ctxMenu.item, ops, t)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* 移动到弹窗 */}
      <MoveDialog
        open={ops.moveTarget !== null}
        onClose={() => ops.setMoveTarget(null)}
        excludeLibraryIds={ops.moveTarget?.excludeLibraryIds ?? []}
        requireFolder={ops.moveTarget?.requireFolder ?? false}
        onSubmit={ops.submitMove}
      />
    </>
  )
}