/** 主题插件贡献的「主题选择面板」分区：特色主题列表。
 *
 * 经 PluginFrontend.themeSections 扩展点注册，由核心 ThemeSelector 渲染插槽；
 * 本组件检查自身插件启用状态（未启用时提示引导），主题数据来自 /api/plugins/themes。
 */
import { useEffect } from "react"
import { Link } from "react-router-dom"
import { Check, Palette } from "lucide-react"

import { useThemeStore } from "@/stores/theme"
import { ensurePluginsLoaded, usePluginEnabled } from "@/stores/plugins"
import { useT } from "@/i18n"

export function FeaturedThemes() {
  const t = useT()
  const { themeId, themes, setTheme, fetchThemes } = useThemeStore()
  const enabled = usePluginEnabled("themes")

  useEffect(() => {
    ensurePluginsLoaded()
  }, [])

  // 插件启停变化时都拉取一次主题清单（禁用时 503 静默，保留本地缓存）
  useEffect(() => {
    fetchThemes(true)
  }, [enabled, fetchThemes])

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Palette className="size-3.5" />
        {t("sys.theme.featured")}
      </p>

      {!enabled && (
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
        {themes.map((th) => (
          <ThemeItem
            key={th.id}
            active={themeId === th.id}
            name={th.name}
            description={th.description}
            bg={th.preview.bg}
            primary={th.preview.primary}
            onClick={() => setTheme(th.id)}
          />
        ))}
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
      className="flex items-start gap-2 rounded-md border p-2 text-left transition-colors"
      style={active ? { borderColor: "var(--ring)", background: "var(--accent)" } : undefined}
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
