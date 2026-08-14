import { Moon, Palette, Sun } from "lucide-react"

import { useT } from "@/i18n"
import { useThemeStore } from "@/stores/theme"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeSelector } from "@/components/theme/ThemeSelector"

/** 右上角：黑夜/白天模式切换（核心功能）+ 主题选装面板（「主题」插件）。 */
export default function ThemeToggle() {
  const { mode, toggleMode } = useThemeStore()
  const t = useT()

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMode}
        aria-label={mode === "dark" ? t("core.theme.toLight") : t("core.theme.toDark")}
        title={mode === "dark" ? t("core.theme.toLight") : t("core.theme.toDark")}
      >
        {mode === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("core.theme.selectTheme")} title={t("core.theme.selectTheme")}>
            <Palette className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="p-2">
            <ThemeSelector />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
