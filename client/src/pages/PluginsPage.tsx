import { useEffect } from "react"
import { GraduationCap, Puzzle, Rocket } from "lucide-react"
import { toast } from "sonner"

import { usePluginsStore, ensurePluginsLoaded } from "@/stores/plugins"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"

const PLUGIN_ICONS: Record<string, typeof Puzzle> = {
  course: GraduationCap,
  knowledge_base: Rocket,
}

const PLUGIN_FEATURES: Record<string, string[]> = {
  course: ["课程包导入 / 导出", "Markdown / Obsidian 笔记导入", "制作与分发新课程"],
  knowledge_base: ["向量索引建立", "AI 问答与文档溯源（[来源N] 点击跳转）"],
}

export default function PluginsPage() {
  const { plugins, loaded, refresh, setEnabled } = usePluginsStore()

  useEffect(() => {
    ensurePluginsLoaded()
    refresh()
  }, [refresh])

  async function toggle(id: string, enabled: boolean) {
    try {
      await setEnabled(id, enabled)
      toast.success(enabled ? "插件已启用" : "插件已禁用")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败")
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
          插件是独立的功能包，位于后端 <code className="rounded bg-muted px-1">backend/plugins/</code> 目录。
          禁用后，依赖它的功能会提示启用；启用/禁用即时生效，无需重启。
        </p>
      </div>

      {!loaded ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {plugins.map((p) => {
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
                        {p.author && <span className="text-xs font-normal text-muted-foreground">{p.author}</span>}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">id: {p.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={p.enabled ? "success" : "secondary"}>
                      {p.enabled ? "已启用" : "已禁用"}
                    </Badge>
                    <Switch
                      checked={p.enabled}
                      onCheckedChange={(v) => toggle(p.id, v)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">{p.description}</p>
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
                    <p className="text-xs text-muted-foreground">
                      依赖插件：{p.dependsOn.join("、")}
                    </p>
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
      )}
    </div>
  )
}
