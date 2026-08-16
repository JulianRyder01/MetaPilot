import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import * as Lucide from "lucide-react"
import { BookOpen, ChevronRight, FolderTree } from "lucide-react"

import { useT } from "@/i18n"
import { api, type Document, type Folder, type FolderItem, type FolderKindMeta, type Library } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useDialogs } from "@/components/ui/dialog-provider"
import { FileManagerView, FolderBadge, type ContentEntry } from "@/components/library/views"

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
 * （搜索 / 网格列表切换 / 刷新 / 新建文件夹）+ 文件夹/文档网格或列表。
 * 面包屑导航库的文件夹树（顶层文件夹 → 嵌套文件夹 → 文档）；文档点击打开其所属顶层文件夹的内容页。
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

  async function createSubfolder() {
    if (!current || !current.top) return
    const name = await prompt({
      title: t("symlink.newFolder"),
      placeholder: t("symlink.newFolderPlaceholder"),
      confirmText: t("common.create"),
    })
    if (!name?.trim()) return
    const parentId = path.length > 1 ? path[path.length - 1].id : ""
    try {
      await api.createSubFolder(current.top.id, { name: name.trim(), parentId })
      load()
    } catch (e) {
      // 提示由 api 错误信息承载
      console.error(e)
    }
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
    })),
  ]

  return (
    <FileManagerView
      breadcrumbs={breadcrumbs}
      entries={entries}
      onOpen={(id) => {
        const folder = entries.find((e) => e.id === id && e.type === "folder")
        if (folder) {
          const f = current.folders.find((x) => x.id === id)
          if (f) setPath([...(path as Folder[]), f as Folder])
          return
        }
        // 文档：跳转所属顶层文件夹内容页
        if (topHref) navigate(topHref)
      }}
      search={search}
      onSearch={setSearch}
      view={view}
      onViewChange={setView}
      onRefresh={load}
      onCreateFolder={current.top ? createSubfolder : undefined}
      emptyHint={t("core.library.empty")}
    />
  )
}
