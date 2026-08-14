import { useState } from "react"
import { ChevronDown, Puzzle } from "lucide-react"

import { useT } from "@/i18n"
import type { Block } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface Props {
  block: Block
  pluginId: string
  pluginName: string
}

/**
 * 未渲染组件占位：插件未启用时，此组件无法渲染，显示依赖提示 + 原始数据（可展开）。
 * MetaPilot 是文档库：数据本身始终可见，只是缺少插件时不提供渲染体验。
 */
export function PluginBlockPlaceholder({ block, pluginId, pluginName }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const { id: _id, type, ...data } = block

  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-4 dark:border-amber-700/50 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <Puzzle className="size-4 text-amber-600" />
        <span className="text-sm">
          {t("core.learn.blockDepPrefix")}<code className="rounded bg-muted px-1 text-xs">{type}</code>{t("core.learn.blockDepMid")}
          <span className="font-medium text-amber-700 dark:text-amber-400">{pluginName}</span>
          {t("core.learn.blockDepPlugin")}{pluginId}{t("core.learn.blockDepSuffix")}
        </span>
        <Badge variant="outline" className="ml-auto text-muted-foreground">
          {type === "interactive" ? t("core.learn.interactiveNotRendered") : t("core.learn.quizNotRendered")}
        </Badge>
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {t("core.learn.viewRaw")}
      </button>
      {open && (
        <pre className="mt-2 overflow-x-auto rounded-md bg-background p-3 text-xs leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}
