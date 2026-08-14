import { GraduationCap, Lightbulb, Palette, Puzzle } from "lucide-react"

import { useT } from "@/i18n"
import { useSettingsStore } from "@/stores/settings"
import { usePluginsStore, ensurePluginsLoaded } from "@/stores/plugins"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const PLUGIN_ICONS: Record<string, typeof Puzzle> = {
  course: GraduationCap,
  ai_insight: Lightbulb,
  themes: Palette,
}

/**
 * 组件来源标记：官方核心（source="core"）不标记；
 * 插件提供的组件在「标记组件来源」开启时显示该插件的图标，悬停可见插件名。
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
  const Icon = PLUGIN_ICONS[source] ?? Puzzle
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
