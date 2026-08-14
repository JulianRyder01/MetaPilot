import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  BookOpen,
  FileText,
  GraduationCap,
  Grid3X3,
  HardDrive,
  Link2,
  List,
  Plus,
  Search,
  Trash2,
  Workflow,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { api, type LibraryMeta, type SymlinkMount } from "@/lib/api"
import { symlinkMounts, symlinkRemoveMount } from "@/plugins/symlink/api"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app"
import { usePluginEnabled } from "@/stores/plugins"
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
import { AddMountDialog } from "@/components/symlink/AddMountDialog"
import { MountBrowser } from "@/components/symlink/MountBrowser"
import { useDialogs } from "@/components/ui/dialog-provider"

const KIND_META: Record<string, { labelKey: string; icon: typeof BookOpen }> = {
  course: { labelKey: "core.library.kindCourse", icon: GraduationCap },
  note: { labelKey: "core.library.kindNote", icon: FileText },
  kb: { labelKey: "core.library.kindKb", icon: BookOpen },
  canvas: { labelKey: "core.library.kindCanvas", icon: Workflow },
}

export default function LibraryHome() {
  const { confirm, prompt } = useDialogs()
  const t = useT()
  const navigate = useNavigate()
  const [libraries, setLibraries] = useState<LibraryMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [mounts, setMounts] = useState<SymlinkMount[]>([])
  const [selectedMountId, setSelectedMountId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const { currentLibraryId, setCurrentLibraryId } = useAppStore()
  const symlinkEnabled = usePluginEnabled("symlink")

  const refresh = useCallback(async () => {
    const list = await api.listLibraries()
    setLibraries(list)
    const { currentLibraryId: cur } = useAppStore.getState()
    if (!cur) setCurrentLibraryId(list[0]?.id ?? null)
  }, [setCurrentLibraryId])

  const loadMounts = useCallback(async () => {
    if (!symlinkEnabled) {
      setMounts([])
      return
    }
    try {
      setMounts(await symlinkMounts())
    } catch {
      setMounts([])
    }
  }, [symlinkEnabled])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    loadMounts()
  }, [loadMounts])

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

  async function removeMount(id: string) {
    const name = mounts.find((m) => m.id === id)?.name ?? t("core.library.unmountNameFallback")
    const ok = await confirm({
      title: t("core.library.unmountTitle"),
      description: t("core.library.unmountDesc", { name }),
      confirmText: t("core.library.unmount"),
    })
    if (!ok) return
    await symlinkRemoveMount(id)
    if (selectedMountId === id) setSelectedMountId(null)
    toast.success(t("core.library.unmounted"))
    loadMounts()
  }

  const current = libraries.find((l) => l.id === currentLibraryId)
  const activeMount = mounts.find((m) => m.id === selectedMountId)

  // 搜索过滤（仅库内文档集）
  const filteredCollections = current
    ? current.collections.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : []

  function selectLibrary(id: string) {
    setCurrentLibraryId(id)
    setSelectedMountId(null)
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
                  lib.id === currentLibraryId && !activeMount
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

        {/* 软链接分区：集成自「软链接」插件；插件禁用时整区隐藏 */}
        {symlinkEnabled && (
          <div className="mt-6 border-t pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Link2 className="size-3.5" />
                软链接
                <Badge variant="outline" className="text-[10px]">{t("core.library.pluginBadge")}</Badge>
              </h2>
              <AddMountDialog onAdded={loadMounts} />
            </div>
            <div className="space-y-1">
              {mounts.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-md px-2 py-1.5",
                    activeMount?.id === m.id ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <button
                    onClick={() => {
                      setSelectedMountId(m.id)
                      setCurrentLibraryId(null)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                    title={`${m.name} → ${m.root}${m.type === "file" ? t("core.library.singleFile") : ""}`}
                  >
                    <HardDrive className="size-3.5 shrink-0 text-primary" />
                    <Link2 className="size-3 shrink-0 text-muted-foreground/60" />
                    <span className="truncate">{m.name}</span>
                  </button>
                  <button
                    onClick={() => removeMount(m.id)}
                    className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    title={t("core.library.unmountTitle")}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {mounts.length === 0 && (
                <p className="px-2 text-xs text-muted-foreground">
                  {t("core.library.noSymlinks")}
                </p>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* 右侧：软链接浏览 或 库内容 */}
      <section className="min-w-0 flex-1">
        {activeMount ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <h1 className="text-xl font-semibold">{activeMount.name}</h1>
              <Badge variant="outline" className="gap-1">
                <Link2 className="size-3" />
                软链接
              </Badge>
              <p className="truncate text-xs text-muted-foreground">{activeMount.root}</p>
            </div>
            <MountBrowser mount={activeMount} />
          </>
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
                    <Badge variant="outline">{t("core.library.collectionCount", { count: current.collectionCount })}</Badge>
                    <Button variant="outline" size="sm" onClick={createCanvasCollection}>
                      <Workflow className="size-4" />
                      {t("core.library.newCanvas")}
                    </Button>
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
                      const meta = KIND_META[col.kind] ?? KIND_META.course
                      const Icon = meta.icon
                      return (
                        <Link key={col.id} to={col.kind === "canvas" ? `/canvas/${col.id}` : `/course/${col.id}`}>
                          <Card className="h-full transition-shadow hover:shadow-md">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2 text-base">
                                <Icon className="size-4 text-primary" />
                                <span className="truncate">{col.name}</span>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                              <Badge variant="secondary">{t(meta.labelKey)}</Badge>
                              <span>{col.kind === "course" ? "core.library.unitChapter" : col.kind === "canvas" ? "core.library.unitCanvas" : "core.library.unitDoc"}</span>
                            </CardContent>
                          </Card>
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredCollections.map((col) => {
                      const meta = KIND_META[col.kind] ?? KIND_META.course
                      const Icon = meta.icon
                      return (
                        <Link
                          key={col.id}
                          to={col.kind === "canvas" ? `/canvas/${col.id}` : `/course/${col.id}`}
                          className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-accent/40"
                        >
                          <Icon className="size-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate font-medium">{col.name}</span>
                          <Badge variant="secondary">{t(meta.labelKey)}</Badge>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {col.kind === "course" ? "core.library.unitChapter" : col.kind === "canvas" ? "core.library.unitCanvas" : "core.library.unitDoc"}
                          </span>
                        </Link>
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
