import { useCallback, useEffect, useState } from "react"
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { useT } from "@/i18n"

/**
 * 图片全屏查看器（Lightbox）：点击图片全屏展示，滚轮缩放、按钮缩放/旋转/重置，
 * Esc / 点击遮罩 / 关闭按钮退出。
 */
export function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  const t = useT()
  const [scale, setScale] = useState(1)
  const [rotate, setRotate] = useState(0)
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null)

  const reset = useCallback(() => {
    setScale(1)
    setRotate(0)
    setDrag(null)
  }, [])

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(5, s + 0.25))
      if (e.key === "-") setScale((s) => Math.max(0.25, s - 0.25))
      if (e.key === "0") reset()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, reset])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale((s) => Math.min(5, Math.max(0.25, s + (e.deltaY < 0 ? 0.15 : -0.15))))
  }, [])

  return createPortal(
    <div
      className="bg-background/90 fixed inset-0 z-50 flex flex-col backdrop-blur-sm"
      onWheel={onWheel}
      onClick={() => onClose()}
      role="dialog"
      aria-modal="true"
    >
      {/* 工具栏 */}
      <div className="flex items-center justify-between border-b bg-background/80 px-4 py-2">
        <p className="min-w-0 truncate text-sm text-muted-foreground">{alt ?? src}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setScale((s) => Math.max(0.25, s - 0.25))
            }}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent"
            title={t("lightbox.zoomOut")}
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setScale((s) => Math.min(5, s + 0.25))
            }}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent"
            title={t("lightbox.zoomIn")}
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setRotate((r) => r + 90)
            }}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent"
            title={t("lightbox.rotate")}
          >
            <Maximize2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              reset()
            }}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent"
            title={t("lightbox.reset")}
          >
            <RotateCcw className="size-4" />
          </button>
          <span className="w-px bg-border" />
          <span className="px-1 text-xs tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="ml-1 rounded p-1.5 text-muted-foreground hover:bg-accent"
            title={t("common.close")}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* 图片区：滚轮缩放，按住拖拽平移 */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden p-8"
        onMouseDown={(e) => {
          if (e.button !== 0) return
          setDrag({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 })
          e.preventDefault()
        }}
        onMouseMove={(e) => {
          if (!drag) return
          setDrag({ ...drag, dx: e.clientX - drag.x, dy: e.clientY - drag.y })
        }}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
      >
        <img
          src={src}
          alt={alt ?? ""}
          draggable={false}
          className={cn("max-h-full max-w-full select-none rounded-md shadow-2xl transition-transform", drag && "cursor-grabbing")}
          style={{
            transform: `translate(${drag?.dx ?? 0}px, ${drag?.dy ?? 0}px) scale(${scale}) rotate(${rotate}deg)`,
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={() => reset()}
        />
      </div>
    </div>,
    document.body,
  )
}

/** 可控的图片打开状态：Markdown / 媒体预览共用 */
export function useLightbox() {
  const [img, setImg] = useState<{ src: string; alt?: string } | null>(null)
  const node = img ? <Lightbox src={img.src} alt={img.alt} onClose={() => setImg(null)} /> : null
  return { open: setImg, node }
}
