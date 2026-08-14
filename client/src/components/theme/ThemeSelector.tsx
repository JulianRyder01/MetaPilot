import { useEffect } from "react"
import { Link } from "react-router-dom"
import { Check, Moon, Palette, Sun } from "lucide-react"

import { useThemeStore } from "@/stores/theme"
import { ensurePluginsLoaded, usePluginEnabled } from "@/stores/plugins"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n"

/**
 * 主题选择面板：黑夜/白天模式 + 「主题」插件提供的特色主题。
 * 供右上角主题面板（ThemeToggle）与设置页「外观」卡片复用。
 *
 * - 模式切换是核心功能，不依赖插件；
 * - 主题数据由后端「主题」插件提供（/api/plugins/themes），插件未启用时
 *   提示引导去 /plugins 启用；已缓存的主题仍可切换（本地偏好）。
 */
export function ThemeSelector() {
  const t = useT()
  const { mode, themeId, themes, setMode, setTheme, fetchThemes } = useThemeStore()
  const themesEnabled = usePluginEnabled("themes")

  useEffect(() => {
    ensurePluginsLoaded()
  }, [])

  // 插件启停变化时都拉取一次主题清单（禁用时 503 静默，保留本地缓存）
  useEffect(() => {
    fetchThemes(true)
  }, [themesEnabled, fetchThemes])

  return (
    <div className="space-y-4">
      {/* 黑夜 / 白天 */}
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

      {/* 主题选装 */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Palette className="size-3.5" />
          {t("sys.theme.featured")}
        </p>

        {!themesEnabled && (
          <div className="mb-2 rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
            {t("sys.theme.pluginDisabled")}
            <Link
              to="/plugins"
              className="ml-1 font-medium text-primary underline underline-offset-2"
            >
              {t("sys.plugins.goEnable")}
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <ThemeItem
            active={themeId === null}
            name={t("sys.theme.defaultName")}
            description={t("sys.theme.defaultDesc")}
            bg="#fafafa"
            primary="#8b5cf6"
            onClick={() => setTheme(null)}
          />
          {themes.map((t) => (
            <ThemeItem
              key={t.id}
              active={themeId === t.id}
              name={t.name}
              description={t.description}
              bg={t.preview.bg}
              primary={t.preview.primary}
              onClick={() => setTheme(t.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ThemeItem({
  active,
  name,
  description,
  bg,
  primary,
  onClick,
}: {
  active: boolean
  name: string
  description: string
  bg: string
  primary: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-2 rounded-md border p-2 text-left transition-colors",
        active
          ? "border-ring bg-accent/60 ring-1 ring-ring"
          : "border-border hover:bg-accent/40",
      )}
    >
      <span className="mt-0.5 flex shrink-0 -space-x-1">
        <span className="size-4 rounded-full border border-border" style={{ backgroundColor: bg }} />
        <span className="size-4 rounded-full border border-border" style={{ backgroundColor: primary }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-1 text-sm font-medium">
          {name}
          {active && <Check className="size-3.5 shrink-0 text-primary" />}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-tight text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  )
}
