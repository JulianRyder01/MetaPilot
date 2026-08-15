import { useEffect, useMemo, useState } from "react"
import { History, Lock, Puzzle, Trash2 } from "lucide-react"
import * as Lucide from "lucide-react"
import { toast } from "@/lib/toast"

import { api, type PluginInfo } from "@/lib/api"
import { usePluginsStore, ensurePluginsLoaded } from "@/stores/plugins"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StorePanel } from "@/components/plugins/StorePanel"
import { useDialogs } from "@/components/ui/dialog-provider"
import { useT } from "@/i18n"

// 分组展示顺序：用户自定义 → 官方插件 → 官方核心（与后端 /api/plugins 清单顺序一致）
const SOURCE_META: { source: PluginSource; labelKey: string; descKey: string }[] = [
  {
    source: "user",
    labelKey: "sys.plugins.sourceUser",
    descKey: "sys.plugins.sourceUserDesc",
  },
  {
    source: "official",
    labelKey: "sys.plugins.sourceOfficial",
    descKey: "sys.plugins.sourceOfficialDesc",
  },
  {
    source: "core",
    labelKey: "sys.plugins.sourceCore",
    descKey: "sys.plugins.sourceCoreDesc",
  },
]

type PluginSource = "core" | "official" | "user"

/** 插件图标：icon 名为 lucide 图标名（plugin.json 声明），动态解析；未知回退通用 Puzzle */
function pluginIcon(name?: string): typeof Puzzle {
  if (!name) return Puzzle
  const Cmp = (Lucide as unknown as Record<string, unknown>)[name]
  return typeof Cmp === "function" ? (Cmp as typeof Puzzle) : Puzzle
}

export default function PluginsPage() {
  const t = useT()
  const { confirm } = useDialogs()
  const { plugins, loaded, refresh, setEnabled } = usePluginsStore()
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [changelogFor, setChangelogFor] = useState<PluginInfo | null>(null)

  useEffect(() => {
    ensurePluginsLoaded()
    refresh()
  }, [refresh])

  const filtered = useMemo(
    () => (tagFilter ? plugins.filter((p) => p.tags?.includes(tagFilter)) : plugins),
    [plugins, tagFilter],
  )

  // 标签筛选项从已加载插件的 tags 动态生成（不写死白名单，第三方插件可自带任意 tag）
  const allTags = useMemo(
    () => Array.from(new Set(plugins.flatMap((p) => p.tags ?? []))).sort(),
    [plugins],
  )

  async function toggle(id: string, enabled: boolean) {
    try {
      await setEnabled(id, enabled)
      toast.success(enabled ? t("sys.plugins.enabledToast") : t("sys.plugins.disabledToast"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sys.plugins.opFailed"))
    }
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: t("sys.plugins.deleteTitle"),
      description: t("sys.plugins.deleteDesc", { name, id }),
      confirmText: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    try {
      await api.deletePlugin(id)
      toast.success(t("sys.plugins.deletedToast", { name }))
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sys.plugins.deleteFailed"))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Puzzle className="size-6 text-primary" />
          {t("sys.plugins.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("sys.plugins.headerPrefix")}
          <code className="rounded bg-muted px-1">backend/plugins/</code> {t("sys.plugins.headerSuffix")}
        </p>
      </div>

      <Tabs defaultValue="local">
        <TabsList>
          <TabsTrigger value="local">{t("sys.plugins.tabLocal")}</TabsTrigger>
          <TabsTrigger value="store">{t("sys.plugins.tabStore")}</TabsTrigger>
        </TabsList>

        <TabsContent value="local" className="space-y-6">
          {/* tag 筛选栏 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">{t("sys.plugins.filterByTag")}</span>
            <Button
              variant={tagFilter === null ? "secondary" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setTagFilter(null)}
            >
              {t("common.all")}
            </Button>
            {allTags.map((t) => (
              <Button
                key={t}
                variant={tagFilter === t ? "secondary" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
              >
                {t}
              </Button>
            ))}
          </div>

          {!loaded ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            SOURCE_META.map((group) => {
              const groupPlugins = filtered.filter((p) => p.source === group.source)
              if (groupPlugins.length === 0) return null
              return (
                <section key={group.source} className="space-y-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      {group.source === "core" && <Lock className="size-4 text-muted-foreground" />}
                      {t(group.labelKey)}
                    </h2>
                    <p className="text-xs text-muted-foreground">{t(group.descKey)}</p>
                  </div>
                  <div className="space-y-3">
                    {groupPlugins.map((p) => {
                      const Icon = pluginIcon(p.icon)
                      const features = p.features ?? []
                      return (
                        <Card key={p.id}>
                          <CardHeader className="flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Icon className="size-5" />
                              </span>
                              <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                  {p.name}
                                  <Badge variant="outline">v{p.version}</Badge>
                                  {p.author && (
                                    <span className="text-xs font-normal text-muted-foreground">{p.author}</span>
                                  )}
                                </CardTitle>
                                <p className="text-xs text-muted-foreground">{t("sys.plugins.idLabel")} {p.id}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {p.changelog && p.changelog.length > 0 && (
                                <Button variant="outline" size="sm" onClick={() => setChangelogFor(p)}>
                                  <History className="size-3.5" />
                                  {t("sys.plugins.changelogBtn")}
                                </Button>
                              )}
                              {p.removable && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => remove(p.id, p.name)}
                                >
                                  <Trash2 className="size-4" />
                                  {t("common.delete")}
                                </Button>
                              )}
                              <Badge variant={p.enabled ? "success" : "secondary"}>
                                {p.enabled ? t("common.enabled") : t("common.disabled")}
                              </Badge>
                              <Switch
                                checked={p.enabled}
                                disabled={p.locked}
                                onCheckedChange={(v) => toggle(p.id, v)}
                              />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <p className="text-sm text-muted-foreground">{p.description}</p>
                            {p.tags && p.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {p.tags.map((t) => (
                                  <button
                                    key={t}
                                    className={cn(
                                      "rounded-full border px-2 py-0.5 text-xs transition-colors",
                                      tagFilter === t
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
                                    )}
                                    onClick={() => setTagFilter(tagFilter === t ? null : t)}
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>
                            )}
                            {features.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {features.map((f) => (
                                  <Badge key={f} variant="outline" className="text-muted-foreground">
                                    {t(f)}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {p.dependsOn.length > 0 && (
                              <p className="text-xs text-muted-foreground">{t("sys.plugins.dependsOn")}{p.dependsOn.join("、")}</p>
                            )}
                            {p.missingDependencies.length > 0 && (
                              <p className="text-xs text-amber-600">
                                {t("sys.plugins.missingDeps")}{p.missingDependencies.join("、")}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </section>
              )
            })
          )}
        </TabsContent>

        <TabsContent value="store">
          <StorePanel installedIds={plugins.map((p) => p.id)} onChanged={refresh} />
        </TabsContent>
      </Tabs>

      {/* 更新历史（roadmap）对话框 */}
      <ChangelogDialog plugin={changelogFor} onClose={() => setChangelogFor(null)} />
    </div>
  )
}

/** 更新历史对话框：以时间线（roadmap）形式展示插件各版本更新历程，最新在前。 */
function ChangelogDialog({ plugin, onClose }: { plugin: PluginInfo | null; onClose: () => void }) {
  const t = useT()
  const changelog = plugin?.changelog ?? []
  return (
    <Dialog open={plugin !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            {t("sys.plugins.changelogTitle", { name: plugin?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>
            {t("sys.plugins.changelogDesc", { version: plugin?.version ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-96 pr-3">
          {changelog.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("sys.plugins.changelogEmpty")}</p>
          ) : (
            <ol className="relative space-y-5 border-l pl-5">
              {changelog.map((c, i) => {
                const isLatest = i === 0
                return (
                  <li key={c.version} className="relative">
                    {/* 时间线圆点 */}
                    <span
                      className={cn(
                        "absolute -left-[26px] top-1 size-2.5 rounded-full ring-4",
                        isLatest ? "bg-primary ring-primary/15" : "bg-muted-foreground/50 ring-transparent",
                      )}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={isLatest ? "default" : "outline"}>
                        v{c.version}
                        {isLatest && <span className="ml-1 text-[10px] font-normal opacity-80">· {t("sys.plugins.currentVersion")}</span>}
                      </Badge>
                      {c.date && <span className="text-xs text-muted-foreground">{c.date}</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p>
                  </li>
                )
              })}
            </ol>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
