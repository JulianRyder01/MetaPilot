import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import * as Lucide from "lucide-react"
import { BookOpen, ChevronRight, Folder as FolderIcon, FolderTree } from "lucide-react"

import { useT } from "@/i18n"
import { api, type Document, type Folder, type FolderItem, type FolderKindMeta, type Library } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

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
 * 库的文件管理器视图：面包屑导航库的文件夹树（顶层文件夹 → 嵌套文件夹 → 文档），
 * 与软链接文件管理器同一套交互。文档点击打开其所属顶层文件夹的内容页。
 */
export function LibraryManagerView({ libraryId }: { libraryId: string }) {
  const t = useT()
  const [lib, setLib] = useState<Library | null>(null)
  const [kindMeta, setKindMeta] = useState<Record<string, FolderKindMeta>>({})
  // 当前文件夹链（path[0] = 顶层文件夹；空 = 库根）
  const [path, setPath] = useState<Folder[]>([])

  useEffect(() => {
    setPath([])
    api.getLibrary(libraryId).then(setLib).catch(() => setLib(null))
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

  return (
    <div className="min-h-[calc(100vh-240px)] overflow-hidden rounded-lg border">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 面包屑工具栏 */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-0.5 text-sm">
            <button
              onClick={() => setPath([])}
              className={cn("shrink-0 font-medium hover:underline", path.length === 0 ? "text-primary" : "text-foreground")}
            >
              {lib.name}
            </button>
            {path.map((f, i) => (
              <span key={f.id} className="flex min-w-0 items-center gap-0.5">
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                <button
                  onClick={() => setPath(path.slice(0, i + 1))}
                  className={cn(
                    "truncate hover:underline",
                    i === path.length - 1 ? "font-medium text-primary" : "text-foreground",
                  )}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </div>
          {current.top && (
            <Badge variant="outline" className="ml-auto">
              {t(topMeta?.labelKey ?? "core.library.kindNote")}
            </Badge>
          )}
        </div>

        {/* 内容：文件夹 + 文档 列表 */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {current.folders.map((f) => {
            const isTop = "kind" in f
            const meta = isTop ? kindMeta[(f as Folder).kind] : undefined
            const Icon = isTop ? kindIcon(meta) : FolderIcon
            return (
              <div key={f.id} className="group flex items-center gap-3 rounded-lg border px-4 py-3 text-sm hover:bg-accent/40">
                <button onClick={() => setPath([...(path as Folder[]), f as Folder])} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="truncate font-medium">{f.name}</span>
                  {isTop ? (
                    <Badge variant="secondary">{t(meta?.labelKey ?? "core.library.kindNote")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("symlink.folder")}</Badge>
                  )}
                  <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </button>
              </div>
            )
          })}
          {current.docs.map((d) => (
            <DocRow key={d.id} href={topHref} name={d.name} docType={d.docType} />
          ))}
          {current.folders.length === 0 && current.docs.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("core.library.empty")}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function DocRow({ href, name, docType }: { href: string; name: string; docType: string }) {
  const t = useT()
  const inner = (
    <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
      <BookOpen className="size-4 shrink-0 text-muted-foreground/70" />
      <span className="truncate font-medium">{name}</span>
      {docType === "quiz" && (
        <Badge variant="outline" className="ml-auto text-[10px]">
          {t("core.library.quiz")}
        </Badge>
      )}
    </span>
  )
  return (
    <div className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-accent/40">
      {href ? (
        <Link to={href} className="flex min-w-0 flex-1 items-center gap-2">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  )
}
