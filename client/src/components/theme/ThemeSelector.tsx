import { Moon, Sun } from "lucide-react"

import { useThemeStore } from "@/stores/theme"
import { usePluginsStore } from "@/stores/plugins"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n"
import { builtinFrontends, usePluginRuntimeFrontends } from "@/plugins/registry"

/**
 * 主题选择面板：黑夜/白天模式（核心功能）+ 插件贡献的「特色主题」分区（themes 插件经 themeSections 扩展点注册）。
 * 供右上角主题面板（ThemeToggle）与设置页「外观」卡片复用。
 */
export function ThemeSelector() {
  const t = useT()
  const { mode, setMode } = useThemeStore()
  const plugins = usePluginsStore((s) => s.plugins)
  const dynamic = usePluginRuntimeFrontends()

  // 主题分区扩展点（themes 插件注册特色主题列表）：仅渲染已启用插件的分区
  const themeSections = [...builtinFrontends, ...Object.values(dynamic)].flatMap((p) => {
    const enabled = plugins.find((x) => x.id === p.id)?.enabled ?? true
    return enabled ? (p.themeSections ?? []) : []
  })

  return (
    <div className="space-y-4">
      {/* 黑夜 / 白天（核心） */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t("sys.theme.mode")}</p>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("light")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              mode === "light" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sun className="size-4" />
            {t("sys.theme.light")}
          </button>
          <button
            type="button"
            onClick={() => setMode("dark")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              mode === "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Moon className="size-4" />
            {t("sys.theme.dark")}
          </button>
        </div>
      </div>

      {/* 插件贡献的主题分区（themes 插件：特色主题选装） */}
      {themeSections.map((s) => (
        <s.Component key={s.id} />
      ))}
    </div>
  )
}
