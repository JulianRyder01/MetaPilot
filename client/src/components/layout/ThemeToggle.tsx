import { Moon, Palette, Sun } from "lucide-react"

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

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMode}
        aria-label={mode === "dark" ? "切换到白天模式" : "切换到黑夜模式"}
        title={mode === "dark" ? "切换到白天模式" : "切换到黑夜模式"}
      >
        {mode === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="选择主题" title="选择主题">
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
