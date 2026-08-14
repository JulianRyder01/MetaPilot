import { Link, NavLink, Outlet } from "react-router-dom"
import { useEffect, useState } from "react"
import { BookOpen, Globe, Library, Puzzle, Settings2, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useT, LANGS, useI18nStore } from "@/i18n"
import { useThemeStore } from "@/stores/theme"
import { usePluginsStore, ensurePluginsLoaded } from "@/stores/plugins"
import { pluginNavItems } from "@/plugins/registry"
import ThemeToggle from "@/components/layout/ThemeToggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"

interface NavItem {
  to: string
  /** i18n key（渲染时经 t() 取词条） */
  label: string
  icon: LucideIcon
}

// 核心导航：文档库（前置）与系统页（后置）；插件导航（统计/知识库等）由注册表贡献并居中
const leadingNav: NavItem[] = [{ to: "/", label: "nav.library", icon: Library }]
const trailingNav: NavItem[] = [
  { to: "/plugins", label: "nav.plugins", icon: Puzzle },
  { to: "/settings", label: "nav.settings", icon: Settings2 },
]

export default function AppLayout() {
  const plugins = usePluginsStore((s) => s.plugins)
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
  const setLang = useI18nStore((s) => s.setLang)
  const [langOpen, setLangOpen] = useState(false)

  // 应用启动即预拉取主题清单（「主题」插件启用时），让已选主题尽快生效
  useEffect(() => {
    useThemeStore.getState().fetchThemes()
  }, [])

  // 确保插件清单已加载，插件导航按启用状态过滤
  useEffect(() => {
    ensurePluginsLoaded()
  }, [])

  const pluginEnabled = (id: string) => {
    const p = plugins.find((x) => x.id === id)
    return p ? p.enabled : true // 未加载/未知插件默认视为启用
  }

  const navItems: NavItem[] = [
    ...leadingNav,
    ...pluginNavItems.filter((n) => pluginEnabled(n.pluginId)),
    ...trailingNav,
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpen className="size-4" />
            </span>
            MetaPilot
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )
                }
              >
                <item.icon className="size-4" />
                {t(item.label)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu open={langOpen} onOpenChange={setLangOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9" title={t("common.language")}>
                  <Globe className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {LANGS.map((l) => (
                  <DropdownMenuItem key={l.value} onClick={() => setLang(l.value)}>
                    <span className="flex-1">{l.native}</span>
                    {lang === l.value && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
