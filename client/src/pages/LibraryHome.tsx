import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import * as Lucide from "lucide-react"
import {
  BookOpen,
  FileText,
  Grid3X3,
  List,
  Plus,
  Search,
  Trash2,
  Workflow,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { api, type CollectionKindMeta, type LibraryMeta } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app"
import { usePluginsStore } from "@/stores/plugins"
import { allCollectionActions, builtinFrontends, usePluginRuntimeFrontends } from "@/plugins/registry"
import type { CollectionRef } from "@/plugins/types"
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
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ImportDialog } from "@/components/library/ImportDialog"
import { useDialogs } from "@/components/ui/dialog-provider"

const KIND_ICON_FALLBACK = BookOpen

/** 集合类型图标动态解析：kind 元数据 icon（lucide 名），未知回退 BookOpen */
function kindIcon(meta?: CollectionKindMeta) {
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
function kindHref(meta: CollectionKindMeta | undefined, id: string): string {
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
  const [kindMeta, setKindMeta] = useState<Record<string, CollectionKindMeta>>({})
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const { currentLibraryId, setCurrentLibraryId } = useAppStore()

  const refresh = useCallback(async () => {
    const list = await api.listLibraries()
    setLibraries(list)
    const { currentLibraryId: cur } = useAppStore.getState()
    if (!cur) setCurrentLibraryId(list[0]?.id ?? null)
  }, [setCurrentLibraryId])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
    // 集合类型元数据（核心 + 插件声明），渲染图标/名称/打开路由，不写死 kind 映射
    api.listCollectionKinds().then(setKindMeta).catch(() => {})
  }, [refresh])

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
  function convertActionsFor(col: CollectionRef) {
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
    const col = await api.createCollection(currentLibraryId, {
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
    const col = await api.createCollection(currentLibraryId, {
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

  // 搜索过滤（仅库内文档集）
  const filteredCollections = current
    ? current.collections.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : []

  function selectLibrary(id: string) {
    setCurrentLibraryId(id)
  }

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
              <button
                key={lib.id}
                onClick={() => selectLibrary(lib.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                  lib.id === currentLibraryId
                    ? "bg-accent font-medium text-accent-foreground"
                    : "hover:bg-accent/60",
                )}
              >
                <span className="truncate">{lib.name}</span>
                <span className="text-xs text-muted-foreground">{lib.collectionCount}</span>
              </button>
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

      {/* 右侧：库内容 */}
      <section className="min-w-0 flex-1">
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
                    <Badge variant="outline">{t("core.library.collectionCount", { count: current.collectionCount })}</Badge>
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
                      const meta = kindMeta[col.kind]
                      const Icon = kindIcon(meta)
                      const href = kindHref(meta, col.id)
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
                            <Badge variant="secondary">{t(meta?.labelKey ?? "core.library.kindNote")}</Badge>
                            <span>{t(meta?.unitLabelKey ?? "core.library.unitDoc")}</span>
                          </CardContent>
                        </Card>
                      )
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
                      const meta = kindMeta[col.kind]
                      const Icon = kindIcon(meta)
                      const href = kindHref(meta, col.id)
                      const convertActions = convertActionsFor(col)
                      const row = (
                        <div className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-accent/40">
                          <Icon className="size-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate font-medium">{col.name}</span>
                          <Badge variant="secondary">{t(meta?.labelKey ?? "core.library.kindNote")}</Badge>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t(meta?.unitLabelKey ?? "core.library.unitDoc")}
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
                  {search ? t("core.library.noSearchResults") : t("core.library.emptyCollections")}
                </p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">{t("core.library.selectPlaceholder")}</p>
            )}
          </>
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
