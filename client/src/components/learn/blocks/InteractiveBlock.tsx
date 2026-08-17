import { useCallback, useEffect, useRef, useState } from "react"
import { Expand, GripHorizontal, Maximize2, Minimize2 } from "lucide-react"

import { useT } from "@/i18n"
import { cn } from "@/lib/utils"
import { DynamicInteractiveBlock } from "./DynamicInteractiveBlock"

interface Props {
  collectionId: string
  block: {
    title?: string
    file?: string
    height?: number
    mode?: string
  }
}

const MIN_H = 200
const MAX_H = 1200

/**
 * 交互块（静态 HTML 资产）：iframe 渲染课程包 interactives/ 下的自包含 HTML。
 *
 * ① 默认自适应内容高度（同源 iframe 直接测量内容 body 高度，MutationObserver + 轮询兜底），
 *    确保默认就能渲染全部内容；底部提供拖拽手柄自由调整高度，拖拽后转为手动模式（不再自动跟随）；
 * ② 支持全屏。
 */
export function InteractiveBlock({ collectionId, block }: Props) {
  // 动态交互 HTML（mode="dynamic"）：四个前端埋点接口 + AI 评判结果页
  if (block.mode === "dynamic") {
    return <DynamicInteractiveBlock collectionId={collectionId} block={block} />
  }

  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState(block.height ?? 480)
  const [autoMode, setAutoMode] = useState(true)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const file = block.file ?? ""

  const measure = useCallback(() => {
    const frame = frameRef.current
    if (!frame) return
    try {
      const doc = frame.contentDocument
      if (!doc?.body) return
      const h = Math.ceil(doc.body.scrollHeight)
      if (h > 0) {
        setHeight((prev) => (Math.abs(prev - h) > 4 ? Math.max(h + 4, 80) : prev))
      }
    } catch {
      // 跨域等无法读取内容时忽略，保持配置高度
    }
  }, [])

  // 自适应内容高度：iframe 加载后监听内容变化（同源可读；轮询兜底 canvas/动画场景）
  useEffect(() => {
    if (!autoMode || expanded) return
    let observer: MutationObserver | null = null
    try {
      const doc = frameRef.current?.contentDocument
      if (doc?.body) {
        observer = new MutationObserver(measure)
        observer.observe(doc.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        })
      }
    } catch {
      /* ignore */
    }
    const poll = window.setInterval(measure, 800)
    return () => {
      observer?.disconnect()
      window.clearInterval(poll)
    }
  }, [autoMode, expanded, file, measure])

  // 拖拽调整高度
  function onDragStart(e: React.PointerEvent) {
    if (expanded) return
    setAutoMode(false)
    dragRef.current = { startY: e.clientY, startH: height }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onDragMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const h = Math.min(MAX_H, Math.max(MIN_H, d.startH + (e.clientY - d.startY)))
    setHeight(h)
  }
  function onDragEnd() {
    dragRef.current = null
  }

  if (!file) {
    return <p className="text-sm text-muted-foreground">{t("core.learn.interactiveNoFile")}</p>
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
          {block.title ?? t("core.learn.interactiveFallback")}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={expanded ? t("core.learn.exitFullscreen") : t("core.learn.fullscreen")}
        >
          {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>
      <iframe
        ref={frameRef}
        src={`/api/plugins/course/assets/${collectionId}/${file}`}
        onLoad={measure}
        title={block.title ?? t("core.learn.interactiveTitle")}
        className={cn("w-full", expanded && "flex-1")}
        style={{ height: expanded ? undefined : height }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
      {!expanded && (
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          title={t("core.learn.resizeHint")}
          className="group flex h-4 cursor-row-resize touch-none select-none items-center justify-center border-t bg-muted/30 hover:bg-accent/60"
        >
          <GripHorizontal className="size-3.5 text-muted-foreground/70 group-hover:text-foreground" />
        </div>
      )}
    </div>
  )
}
