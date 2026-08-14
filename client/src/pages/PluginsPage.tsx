import { useEffect, useMemo, useState } from "react"
import { GraduationCap, Lock, Puzzle, Rocket, Trash2, Palette } from "lucide-react"
import { toast } from "@/lib/toast"

import { api } from "@/lib/api"
import { PLUGIN_TAGS } from "@/plugins/types"
import { usePluginsStore, ensurePluginsLoaded } from "@/stores/plugins"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { StorePanel } from "@/components/plugins/StorePanel"

const PLUGIN_ICONS: Record<string, typeof Puzzle> = {
  course: GraduationCap,
  knowledge_base: Rocket,
  themes: Palette,
}

const PLUGIN_FEATURES: Record<string, string[]> = {
  course: ["课程包导入 / 导出", "章节知识点学习（组件流）", "学习进度与时长统计", "主观题 AI 判分", "动态交互块渲染"],
  knowledge_base: ["向量索引建立", "AI 问答与文档溯源（[来源N] 点击跳转）"],
}

// 分组展示顺序：用户自定义 → 官方插件 → 官方核心（与后端 /api/plugins 清单顺序一致）
const SOURCE_META: { source: PluginSource; label: string; desc: string }[] = [
  {
    source: "user",
    label: "用户自定义插件",
    desc: "可自行开发、从插件商店安装，或上传 zip 安装；可禁用或删除。",
  },
  {
    source: "official",
    label: "官方插件",
    desc: "MetaPilot 官方开发的实用插件，可选用、禁用，不可删除。",
  },
  {
    source: "core",
    label: "官方核心",
    desc: "MetaPilot 本身：文档库浏览与 Markdown 阅读。不允许禁用或删除。",
  },
]

type PluginSource = "core" | "official" | "user"

export default function PluginsPage() {
  const { plugins, loaded, refresh, setEnabled } = usePluginsStore()
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  useEffect(() => {
    ensurePluginsLoaded()
    refresh()
  }, [refresh])

  const filtered = useMemo(
    () => (tagFilter ? plugins.filter((p) => p.tags?.includes(tagFilter)) : plugins),
    [plugins, tagFilter],
  )

  async function toggle(id: string, enabled: boolean) {
    try {
      await setEnabled(id, enabled)
      toast.success(enabled ? "插件已启用" : "插件已禁用")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败")
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`删除插件「${name}」？将物理删除 backend/plugins/${id} 目录，不可恢复。`)) return
    try {
      await api.deletePlugin(id)
      toast.success(`已删除插件「${name}」`)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败")
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Puzzle className="size-6 text-primary" />
          插件管理
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          插件分为用户自定义、官方插件与官方核心三类。插件是后端
          <code className="rounded bg-muted px-1">backend/plugins/</code> 目录下的独立功能包，
          可在「插件商店」浏览安装或上传自制插件。
        </p>
      </div>

      <Tabs defaultValue="local">
        <TabsList>
          <TabsTrigger value="local">本地插件</TabsTrigger>
          <TabsTrigger value="store">插件商店</TabsTrigger>
        </TabsList>

        <TabsContent value="local" className="space-y-6">
          {/* tag 筛选栏 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">按标签筛选：</span>
            <Button
              variant={tagFilter === null ? "secondary" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setTagFilter(null)}
            >
              全部
            </Button>
            {PLUGIN_TAGS.map((t) => (
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
                      {group.label}
                    </h2>
                    <p className="text-xs text-muted-foreground">{group.desc}</p>
                  </div>
                  <div className="space-y-3">
                    {groupPlugins.map((p) => {
                      const Icon = PLUGIN_ICONS[p.id] ?? Puzzle
                      const features = PLUGIN_FEATURES[p.id] ?? []
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
                                <p className="text-xs text-muted-foreground">id: {p.id}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {p.removable && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => remove(p.id, p.name)}
                                >
                                  <Trash2 className="size-4" />
                                  删除
                                </Button>
                              )}
                              <Badge variant={p.enabled ? "success" : "secondary"}>
                                {p.enabled ? "已启用" : "已禁用"}
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
                                    {f}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {p.dependsOn.length > 0 && (
                              <p className="text-xs text-muted-foreground">依赖插件：{p.dependsOn.join("、")}</p>
                            )}
                            {p.missingDependencies.length > 0 && (
                              <p className="text-xs text-amber-600">
                                缺少依赖（需先启用）：{p.missingDependencies.join("、")}
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
    </div>
  )
}
