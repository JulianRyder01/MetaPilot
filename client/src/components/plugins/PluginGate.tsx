import { useEffect } from "react"
import { Link } from "react-router-dom"
import { Puzzle } from "lucide-react"

import { usePluginsStore, ensurePluginsLoaded } from "@/stores/plugins"
import { Button } from "@/components/ui/button"

interface Props {
  pluginId: string
  /** 提示文案中的功能名，例如「导入课程包」 */
  hint?: string
  children?: React.ReactNode
  /** 紧凑模式（用于卡片/区块内） */
  compact?: boolean
}

/**
 * 插件依赖门：插件被禁用时展示「需要启用 xx 插件」提示 + 去启用入口，
 * 启用后渲染 children。
 */
export function PluginGate({ pluginId, hint, children, compact }: Props) {
  const plugins = usePluginsStore((s) => s.plugins)
  const plugin = plugins.find((p) => p.id === pluginId)
  const enabled = plugin ? plugin.enabled : true

  useEffect(() => {
    ensurePluginsLoaded()
  }, [])

  if (enabled) {
    return <>{children}</>
  }

  return (
    <div
      className={
        compact
          ? "flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800/50 dark:bg-amber-950/30"
          : "flex flex-col items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-6 py-8 text-center text-sm dark:border-amber-800/50 dark:bg-amber-950/30"
      }
    >
      <Puzzle className="size-5 text-amber-600" />
      <div className="text-foreground">
        需要启用「<span className="font-medium text-amber-700 dark:text-amber-400">{plugin?.name ?? pluginId}</span>
        」插件才可使用{hint ? ` ${hint}` : "此功能"}
      </div>
      <Link to="/plugins">
        <Button size="sm" variant="outline">
          去插件管理页启用
        </Button>
      </Link>
    </div>
  )
}
