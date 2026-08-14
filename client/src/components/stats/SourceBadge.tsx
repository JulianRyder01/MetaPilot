import { GraduationCap, Palette, Puzzle, Rocket } from "lucide-react"

import { useSettingsStore } from "@/stores/settings"
import { usePluginsStore, ensurePluginsLoaded } from "@/stores/plugins"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const PLUGIN_ICONS: Record<string, typeof Puzzle> = {
  course: GraduationCap,
  knowledge_base: Rocket,
  themes: Palette,
}

/**
 * 组件来源标记：官方核心（source="core"）不标记；
 * 插件提供的组件在「标记组件来源」开启时显示该插件的图标，悬停可见插件名。
 */
export function SourceBadge({ source }: { source: string }) {
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
          aria-label={`由插件「${name}」提供`}
        >
          <Icon className="size-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {name} 插件提供
      </TooltipContent>
    </Tooltip>
  )
}
