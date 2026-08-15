import * as Lucide from "lucide-react"
import { Puzzle } from "lucide-react"

import { useT } from "@/i18n"
import { useSettingsStore } from "@/stores/settings"
import { usePluginsStore, ensurePluginsLoaded } from "@/stores/plugins"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** 插件图标动态解析：icon 元数据为 lucide 图标名（plugin.json 声明），未知回退 Puzzle */
function pluginIcon(name?: string): typeof Puzzle {
  if (!name) return Puzzle
  const Cmp = (Lucide as unknown as Record<string, unknown>)[name]
  return typeof Cmp === "function" ? (Cmp as typeof Puzzle) : Puzzle
}

/**
 * 组件来源标记：官方核心（source="core"）不标记；
 * 插件提供的组件在「标记组件来源」开启时显示该插件的图标（经插件元数据 icon 动态解析），悬停可见插件名。
 */
export function SourceBadge({ source }: { source: string }) {
  const t = useT()
  const showComponentSource = useSettingsStore((s) => s.showComponentSource)
  const plugins = usePluginsStore((s) => s.plugins)

  if (!showComponentSource || !source || source === "core") {
    return null
  }
  ensurePluginsLoaded()
  const plugin = plugins.find((p) => p.id === source)
  const Icon = pluginIcon(plugin?.icon)
  const name = plugin?.name ?? source

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex size-4 items-center justify-center rounded bg-muted text-muted-foreground"
          aria-label={t("core.stats.providedBy", { name })}
        >
          <Icon className="size-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {t("core.stats.providedByTooltip", { name })}
      </TooltipContent>
    </Tooltip>
  )
}
