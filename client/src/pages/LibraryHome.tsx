import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import * as Lucide from "lucide-react"
import {
  BookOpen,
  ExternalLink,
  FileText,
  FolderTree,
  Grid3X3,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Star,
  Trash2,
  Workflow,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { api, type FolderKindMeta, type LibraryMeta, type SymlinkMount } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app"
import { usePluginsStore } from "@/stores/plugins"
import { allCollectionActions, builtinFrontends, usePluginRuntimeFrontends } from "@/plugins/registry"
import type { FolderRef } from "@/plugins/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ImportDialog } from "@/components/library/ImportDialog"
import { LibraryManagerView } from "@/components/library/LibraryManagerView"
import { MountBrowser } from "@/components/symlink/MountBrowser"
import { symlinkMounts } from "@/plugins/symlink/api"
import { useDialogs } from "@/components/ui/dialog-provider"

const KIND_ICON_FALLBACK = BookOpen

/** 集合类型图标动态解析：kind 元数据 icon（lucide 名），未知回退 BookOpen */
function kindIcon(meta?: FolderKindMeta) {
  if (!meta?.icon) return KIND_ICON_FALLBACK
  const Cmp = (Lucide as unknown as Record<string, unknown>)[meta.icon]
  return typeof Cmp === "function" ? (Cmp as typeof BookOpen) : KIND_ICON_FALLBACK
}

/** 插件操作图标动态解析：icon（lucide 名），未知返回 undefined（不渲染图标） */
function actionIcon(name?: string) {
  if (!name) return undefined
  const Cmp = (Lucide as unknown as Record<string, unknown>)[name]
  return typeof Cmp === "function" ? (Cmp as typeof BookOpen) : undefined
}

/** 集合类型打开路由：kind 元数据 openRoute（{id} 占位）；空 = 无独立页 */
function kindHref(meta: FolderKindMeta | undefined, id: string): string {
  return meta?.openRoute ? meta.openRoute.replace("{id}", id) : ""
}

export default function LibraryHome() {
  const { confirm, prompt } = useDialogs()
  const t = useT()
  const navigate = useNavigate()
  const plugins = usePluginsStore((s) => s.plugins)
  const dynamic = usePluginRuntimeFrontends()
  const [libraries, setLibraries] = useState<LibraryMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [kindMeta, setKindMeta] = useState<Record<string, FolderKindMeta>>({})
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  // 行菜单打开状态：打开期间强制三点按钮可见（Radix modal 会令 :hover 失效，display:none 的 trigger 会被定位到视口左上角）
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  // 显示模式：natural 自然卡片视图（普通库样式）/ manager 文件管理器视图（软链接样式），库与软链接统一
  const [mode, setMode] = useState<"natural" | "manager">("natural")
  const { currentLibraryId, setCurrentLibraryId, currentMountId, setCurrentMountId } = useAppStore()
  // 当前软链接（软链接视为库，在右侧直接浏览；不再跳独立文件浏览器页）
  const [mounts, setMounts] = useState<SymlinkMount[]>([])

  const refresh = useCallback(async () => {
    const list = await api.listLibraries()
    setLibraries(list)
    const { currentLibraryId: cur } = useAppStore.getState()
    if (!cur) setCurrentLibraryId(list[0]?.id ?? null)
    // 软链接挂载列表（右侧浏览当前挂载用）
    try {
      setMounts(await symlinkMounts())
    } catch {
      setMounts([])
    }
  }, [setCurrentLibraryId])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
    // 集合类型元数据（核心 + 插件声明），渲染图标/名称/打开路由，不写死 kind 映射
    api.listFolderKinds().then(setKindMeta).catch(() => {})
  }, [refresh])

  const currentMount = mounts.find((m) => m.id === currentMountId) ?? null

  function selectLibrary(id: string) {
    setCurrentMountId(null) // 切回库视角
    setCurrentLibraryId(id)
  }

  // 「我的库」页分区扩展点（如软链接插件的挂载分区）：仅渲染已启用插件的分区
  const librarySections = [...builtinFrontends, ...Object.values(dynamic)].flatMap((p) => {
    const enabled = plugins.find((x) => x.id === p.id)?.enabled ?? true
    return enabled ? (p.librarySections ?? []) : []
  })

  // 集合创建/转换操作扩展点（如课程插件的「新建课程」/「转为课程」）：仅渲染已启用插件的操作
  const enabledPluginIds = new Set(plugins.filter((p) => p.enabled).map((p) => p.id))
  const collectionActions = allCollectionActions(dynamic).filter((a) => enabledPluginIds.has(a.pluginId))
  const createActions = collectionActions.filter((a) => Boolean(a.createLabel && a.onCreate))

  /** 某集合可执行的插件转换操作（如文档 → 课程） */
  function convertActionsFor(col: FolderRef) {
    return collectionActions.filter(
      (a) => a.convertLabel && a.onConvert && (!a.canConvert || a.canConvert(col)),
    )
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: t("core.library.deleteLibTitle"),
      description: t("core.library.deleteLibDesc"),
      confirmText: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    await api.deleteLibrary(id)
    toast.success(t("core.library.deletedLib"))
    refresh()
  }

  /** 置顶 / 取消置顶（可多个） */
  async function togglePin(lib: LibraryMeta) {
    await api.updateLibrary(lib.id, {
      name: lib.name,
      description: lib.description,
      pinned: !lib.pinned,
    })
    toast.success(t(lib.pinned ? "core.library.unpinnedLib" : "core.library.pinnedLib"))
    refresh()
  }

  /** 设为默认库（唯一）：AI 洞察等插件的默认保存目标 */
  async function setDefault(lib: LibraryMeta) {
    await api.setDefaultLibrary(lib.id)
    toast.success(t("core.library.defaultSet"))
    refresh()
  }

  /** 取消默认库（与置顶相互独立，可单独取消） */
  async function clearDefault(lib: LibraryMeta) {
    await api.clearDefaultLibrary(lib.id)
    toast.success(t("core.library.defaultCleared"))
    refresh()
  }

  /** 重命名库 */
  async function renameLib(lib: LibraryMeta) {
    const name = await prompt({
      title: t("core.library.renameLibTitle"),
      placeholder: t("core.library.namePlaceholder"),
      initialValue: lib.name,
    })
    if (name == null || !name.trim() || name.trim() === lib.name) return
    await api.updateLibrary(lib.id, { name: name.trim() })
    toast.success(t("core.library.renamedLib"))
    refresh()
  }

  /** 在用户本机系统文件管理器中显示 vault 目录（当前库的数据目录） */
  async function revealVault() {
    try {
      await api.revealVault()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.library.revealFailed"))
    }
  }

  /** 在当前库中新建纯目录文件夹（kind=folder，无内容类型），用于组织文档。 */
  async function createFolderCollection() {
    if (!currentLibraryId) return
    const name = await prompt({
      title: t("core.library.newFolderTitle"),
      placeholder: t("core.library.newFolderPlaceholder"),
      initialValue: t("core.library.newFolderDefault"),
    })
    if (name == null) return
    if (!name.trim()) return
    await api.createFolder(currentLibraryId, { name: name.trim(), kind: "folder" })
    toast.success(t("core.library.createdFolder"))
    await refresh()
  }

  /** 在当前库中新建空白文档（kind=note，官方核心），创建后跳转文档编辑页。 */
  async function createNoteCollection() {
    if (!currentLibraryId) return
    const name = await prompt({
      title: t("core.library.newDocTitle"),
      placeholder: t("core.library.newDocPlaceholder"),
      initialValue: t("core.library.newDocDefault"),
    })
    if (name == null) return
    if (!name.trim()) return
    const col = await api.createFolder(currentLibraryId, {
      name: name.trim(),
      kind: "note",
      description: "",
      author: "",
      version: "1.0.0",
    })
    toast.success(t("core.library.createdDoc"))
    await refresh()
    navigate(`/edit/${col.id}`)
  }

  /** 在当前库中新建空白图表（kind=canvas），创建后跳转画布。 */
  async function createCanvasCollection() {
    if (!currentLibraryId) return
    const name = await prompt({
      title: t("core.library.newCanvasTitle"),
      placeholder: t("core.library.newCanvasPlaceholder"),
      initialValue: t("core.library.newCanvasDefault"),
    })
    if (name == null) return
    if (!name.trim()) return
    const col = await api.createFolder(currentLibraryId, {
      name: name.trim(),
      kind: "canvas",
      description: "",
      author: "",
      version: "1.0.0",
    })
    toast.success(t("core.library.createdCanvas"))
    await refresh()
    navigate(`/canvas/${col.id}`)
  }

  const current = libraries.find((l) => l.id === currentLibraryId)

  // 搜索过滤（仅库内文件夹）
  const filteredCollections = current
    ? current.folders.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : []


  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 sm:px-6">
      {/* 左侧：库列表 + 软链接 */}
      <aside className="w-56 shrink-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("core.library.library")}</h2>
          <div className="flex items-center gap-1">
            <ImportDialog onImported={refresh} />
            <NewLibraryDialog onCreated={refresh} />
          </div>
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <div className="space-y-1">
            {libraries.map((lib) => (
              <div
                key={lib.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors",
                  lib.id === currentLibraryId
                    ? "bg-accent font-medium text-accent-foreground"
                    : "hover:bg-accent/60",
                )}
              >
                <button
                  onClick={() => selectLibrary(lib.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
                >
                  <span className="truncate">{lib.name}</span>
                  {lib.pinned && <Pin className="size-3 shrink-0 text-primary" aria-label={t("core.library.pinned")} />}
                  {lib.isDefault && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/15 px-1 py-px text-[10px] font-medium text-primary">
                      <Star className="size-2.5 fill-current" />
                      {t("core.library.defaultLib")}
                    </span>
                  )}
                </button>
                <span className="shrink-0 text-xs text-muted-foreground group-hover:hidden">
                  {lib.folderCount}
                </span>
                <DropdownMenu open={openMenuId === lib.id} onOpenChange={(o) => setOpenMenuId(o ? lib.id : null)}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent",
                        openMenuId === lib.id ? "block" : "hidden group-hover:block",
                      )}
                      aria-label={t("core.library.menuMore")}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => togglePin(lib)}>
                      {lib.pinned ? <Pin className="text-muted-foreground" /> : <Pin className="text-muted-foreground" />}
                      {t(lib.pinned ? "core.library.unpin" : "core.library.pin")}
                    </DropdownMenuItem>
                    {lib.isDefault ? (
                      <DropdownMenuItem onClick={() => clearDefault(lib)}>
                        <Star className="fill-current text-muted-foreground" />
                        {t("core.library.unsetDefault")}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => setDefault(lib)}>
                        <Star className="text-muted-foreground" />
                        {t("core.library.setDefault")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => renameLib(lib)}>
                      <FileText className="text-muted-foreground" />
                      {t("core.library.renameLib")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => revealVault()}>
                      <ExternalLink className="text-muted-foreground" />
                      {t("core.library.revealInExplorer")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => handleDelete(lib.id)}>
                      <Trash2 />
                      {t("common.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {libraries.length === 0 && (
              <p className="px-2 text-sm text-muted-foreground">
                {t("core.library.emptyLibraries")}
              </p>
            )}
          </div>
        )}

        {/* 插件分区扩展点（如软链接插件的挂载分区）：核心不内嵌插件 UI，仅渲染插槽 */}
        {librarySections.map((s) => (
          <s.Component key={s.id} />
        ))}
      </aside>

      {/* 右侧：库内容 / 软链接内容（软链接视为库，直接在此浏览） */}
      <section className="min-w-0 flex-1">
        {/* 显示模式切换：自然卡片视图 / 文件管理器视图（库与软链接共用同一套） */}
        <div className="mb-3 flex items-center justify-end">
          <div className="flex items-center rounded-md border">
            <button
              onClick={() => setMode("natural")}
              className={cn(
                "flex items-center gap-1 rounded-l-md px-2.5 py-1.5 text-xs",
                mode === "natural" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              title={t("core.library.modeNatural")}
            >
              <LayoutGrid className="size-3.5" />
              {t("core.library.modeNatural")}
            </button>
            <button
              onClick={() => setMode("manager")}
              className={cn(
                "flex items-center gap-1 rounded-r-md px-2.5 py-1.5 text-xs",
                mode === "manager" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              title={t("core.library.modeManager")}
            >
              <FolderTree className="size-3.5" />
              {t("core.library.modeManager")}
            </button>
          </div>
        </div>
        {currentMount ? (
          <MountBrowser mount={currentMount} variant={mode === "manager" ? "manager" : "natural"} />
        ) : current && mode === "manager" ? (
          <LibraryManagerView libraryId={current.id} />
        ) : (
        <>
            {/* 库头：搜索 + 视图切换 */}
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="text-xl font-semibold">{current?.name ?? t("nav.library")}</h1>
                  <p className="text-sm text-muted-foreground">{current?.description}</p>
                </div>
                {current && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t("core.library.folderCount", { count: current.folderCount })}</Badge>
                    <Button variant="outline" size="sm" onClick={createFolderCollection}>
                      <FolderTree className="size-4" />
                      {t("core.library.newFolder")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={createNoteCollection}>
                      <FileText className="size-4" />
                      {t("core.library.newDoc")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={createCanvasCollection}>
                      <Workflow className="size-4" />
                      {t("core.library.newCanvas")}
                    </Button>
                    {/* 插件注入的新建按钮（如课程插件的「新建课程」）：仅启用对应插件时显示 */}
                    {createActions.map((a) => {
                      const Icon = actionIcon(a.createIcon)
                      return (
                        <Button
                          key={a.id}
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            a.onCreate?.({
                              libraryId: current.id,
                              refresh,
                              navigate,
                              prompt,
                              confirm,
                            })
                          }
                        >
                          {Icon && <Icon className="size-4" />}
                          {t(a.createLabel ?? "")}
                        </Button>
                      )
                    })}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(current.id)}
                      className="text-muted-foreground"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
              {current && (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("core.library.searchPlaceholder")}
                      className="pl-8"
                    />
                  </div>
                  <div className="flex items-center rounded-md border">
                    <button
                      onClick={() => setView("grid")}
                      className={cn(
                        "rounded-l-md p-1.5",
                        view === "grid" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                      title={t("core.library.gridView")}
                    >
                      <Grid3X3 className="size-4" />
                    </button>
                    <button
                      onClick={() => setView("list")}
                      className={cn(
                        "rounded-r-md p-1.5",
                        view === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                      title={t("core.library.listView")}
                    >
                      <List className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {current ? (
              filteredCollections.length > 0 ? (
                view === "grid" ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredCollections.map((col) => {
                      const isFolder = col.kind === "folder"
                      const meta = kindMeta[col.kind]
                      const Icon = isFolder ? FolderTree : kindIcon(meta)
                      const href = isFolder ? "" : kindHref(meta, col.id)
                      const convertActions = convertActionsFor(col)
                      const card = (
                        <Card className="h-full transition-shadow hover:shadow-md">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                              <Icon className="size-4 text-primary" />
                              <span className="truncate">{col.name}</span>
                              {convertActions.length > 0 && (
                                <span className="ml-auto flex items-center gap-0.5">
                                  {convertActions.map((a) => {
                                    const CvtIcon = actionIcon(a.convertIcon)
                                    return (
                                      <Button
                                        key={a.id}
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-primary"
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          a.onConvert?.(col, { libraryId: current.id, refresh, navigate, prompt, confirm })
                                        }}
                                      >
                                        {CvtIcon && <CvtIcon className="size-3" />}
                                        {t(a.convertLabel ?? "")}
                                      </Button>
                                    )
                                  })}
                                </span>
                              )}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                            <Badge variant="secondary">
                              {isFolder ? t("core.library.folder") : t(meta?.labelKey ?? "core.library.kindNote")}
                            </Badge>
                            <span>
                              {isFolder ? "" : t(meta?.unitLabelKey ?? "core.library.unitDoc")}
                            </span>
                          </CardContent>
                        </Card>
                      )
                      if (isFolder) {
                        // 纯目录文件夹：进入文件管理器视图浏览
                        return (
                          <button key={col.id} type="button" onClick={() => setMode("manager")} className="text-left">
                            {card}
                          </button>
                        )
                      }
                      return href ? (
                        <Link key={col.id} to={href}>
                          {card}
                        </Link>
                      ) : (
                        <div key={col.id}>{card}</div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredCollections.map((col) => {
                      const isFolder = col.kind === "folder"
                      const meta = kindMeta[col.kind]
                      const Icon = isFolder ? FolderTree : kindIcon(meta)
                      const href = isFolder ? "" : kindHref(meta, col.id)
                      const convertActions = convertActionsFor(col)
                      const row = (
                        <div className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-accent/40">
                          <Icon className="size-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {col.name}
                          </span>
                          <Badge variant="secondary">
                            {isFolder ? t("core.library.folder") : t(meta?.labelKey ?? "core.library.kindNote")}
                          </Badge>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {isFolder ? "" : t(meta?.unitLabelKey ?? "core.library.unitDoc")}
                          </span>
                          {convertActions.length > 0 && (
                            <span className="flex shrink-0 items-center gap-0.5">
                              {convertActions.map((a) => {
                                const CvtIcon = actionIcon(a.convertIcon)
                                return (
                                  <Button
                                    key={a.id}
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-primary"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      a.onConvert?.(col, { libraryId: current.id, refresh, navigate, prompt, confirm })
                                    }}
                                  >
                                    {CvtIcon && <CvtIcon className="size-3" />}
                                    {t(a.convertLabel ?? "")}
                                  </Button>
                                )
                              })}
                            </span>
                          )}
                        </div>
                      )
                      if (isFolder) {
                        return (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => setMode("manager")}
                            className="block w-full text-left"
                          >
                            {row}
                          </button>
                        )
                      }
                      return href ? (
                        <Link key={col.id} to={href} className="block">
                          {row}
                        </Link>
                      ) : (
                        <div key={col.id}>{row}</div>
                      )
                    })}
                  </div>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  {search ? t("core.library.noSearchResults") : t("core.library.emptyFolders")}
                </p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">{t("core.library.selectPlaceholder")}</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function NewLibraryDialog({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [open, setOpen] = useState(false)
  const t = useT()

  async function create() {
    if (!name.trim()) return
    await api.createLibrary(name.trim(), description.trim())
    toast.success(t("core.library.createdLib"))
    setName("")
    setDescription("")
    setOpen(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          {t("common.create")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("core.library.newLibTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("common.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("core.library.namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("core.library.descriptionOptional")}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("core.library.descPlaceholder")} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={create} disabled={!name.trim()}>{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
