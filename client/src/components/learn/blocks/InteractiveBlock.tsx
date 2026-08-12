import { useState } from "react"
import { Expand, Maximize2, Minimize2 } from "lucide-react"

import { cn } from "@/lib/utils"

interface Props {
  collectionId: string
  block: {
    title?: string
    file?: string
    height?: number
  }
}

export function InteractiveBlock({ collectionId, block }: Props) {
  const [expanded, setExpanded] = useState(false)
  const file = block.file ?? ""
  const baseHeight = block.height ?? 480

  if (!file) {
    return <p className="text-sm text-muted-foreground">交互块缺少 file 配置</p>
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        expanded && "fixed inset-4 z-50 flex flex-col shadow-2xl",
      )}
    >
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Expand className="size-3.5 text-primary" />
          {block.title ?? "动态交互"}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>
      <iframe
        src={`/api/assets/courses/${collectionId}/${file}`}
        title={block.title ?? "交互演示"}
        className={cn("w-full", expanded ? "flex-1" : "")}
        style={{ height: expanded ? undefined : baseHeight }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  )
}
