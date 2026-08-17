import { useCallback, useEffect, useRef, useState } from "react"
import {
  Expand,
  FileText,
  GripHorizontal,
  LayoutTemplate,
  Loader2,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  X,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { generateText, judgeInteractive } from "@/plugins/course/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MarkdownBlock } from "./MarkdownBlock"

/**
 * 动态交互 HTML 组件（interactive 块 mode="dynamic"）：iframe 渲染课程包资产，
 * 通过 postMessage 提供四个前端埋点接口（供制作者在 HTML 内调用）：
 *
 * - window.parent.postMessage({ type: "metapilot:context:text", text }, "*")
 *   添加文本到评判上下文（用于最终评判，非子对话）
 * - window.parent.postMessage({ type: "metapilot:context:image", dataUrl }, "*")
 *   添加图片到评判上下文；块配置 multimodal=false 时右上角提示「不支持多模态输入」并丢弃
 * - window.parent.postMessage({ type: "metapilot:generate:text", requestId, prompt, context? }, "*")
 *   AI 生成文本（子对话场景；前端自行维护 context json）。结果经
 *   { type: "metapilot:generate:result", requestId, text, ok, error? } 回传
 * - window.parent.postMessage({ type: "metapilot:finish" }, "*")
 *   结束并提交给 AI 评判（也可点击右下角按钮手动结束）
 *
 * 评判结果（Markdown/Html）经后端生成后：展示为结果页（兼容 Markdown 与 HTML 渲染），
 * 并保存到本交互块的 lastResult 字段（重做交互会覆盖旧结果）。
 */
interface ContextItem {
  type: "text" | "image"
  content: string
}

interface Props {
  collectionId: string
  block: {
    id?: string
    title?: string
    file?: string
    height?: number
    mode?: string
    scenario?: string
    multimodal?: boolean
    lastResult?: { markdown?: string; html?: string; updatedAt?: string }
  }
}

const MIN_H = 200
const MAX_H = 1200

export function DynamicInteractiveBlock({ collectionId, block }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState(block.height ?? 480)
  const [autoMode, setAutoMode] = useState(true)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  // 评判上下文（前端暂存，最终随结束提交一次性发给后端）
  const [context, setContext] = useState<ContextItem[]>([])
  const contextRef = useRef(context)
  contextRef.current = context

  const [judging, setJudging] = useState(false)
  const judgingRef = useRef(false)
  const [showResult, setShowResult] = useState(false)
  const [result, setResult] = useState<{ markdown: string; html: string } | null>(null)
  // 已保存到块的评判结果（本会话内即时可用；重做后覆盖）
  const [savedResult, setSavedResult] = useState<{ markdown: string; html: string } | null>(
    block.lastResult?.markdown || block.lastResult?.html ? block.lastResult! : null,
  )

  const file = block.file ?? ""
  const multimodal = Boolean(block.multimodal)

  // 高度自适应（同源测量）与拖拽（与静态交互块一致）
  const measure = useCallback(() => {
    const frame = frameRef.current
    if (!frame) return
    try {
      const doc = frame.contentDocument
      if (!doc?.body) return
      const h = Math.ceil(doc.body.scrollHeight)
      if (h > 0) setHeight((prev) => (Math.abs(prev - h) > 4 ? Math.max(h + 4, 80) : prev))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!autoMode || expanded) return
    let observer: MutationObserver | null = null
    try {
      const doc = frameRef.current?.contentDocument
      if (doc?.body) {
        observer = new MutationObserver(measure)
        observer.observe(doc.body, { childList: true, subtree: true, attributes: true, characterData: true })
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

  function onDragStart(e: React.PointerEvent) {
    if (expanded) return
    setAutoMode(false)
    dragRef.current = { startY: e.clientY, startH: height }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onDragMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    setHeight(Math.min(MAX_H, Math.max(MIN_H, d.startH + (e.clientY - d.startY))))
  }
  function onDragEnd() {
    dragRef.current = null
  }

  // ---------------- 埋点处理 ----------------

  function addContext(item: ContextItem) {
    setContext((prev) => [...prev, item])
  }

  function handleGenerate(payload: { requestId?: string; prompt?: string; context?: string[] }) {
    const requestId = payload.requestId ?? ""
    const prompt = String(payload.prompt ?? "")
    ;(async () => {
      try {
        const r = await generateText({ prompt, context: payload.context ?? [] })
        frameRef.current?.contentWindow?.postMessage(
          { type: "metapilot:generate:result", requestId, text: r.text, ok: true },
          "*",
        )
      } catch (e) {
        frameRef.current?.contentWindow?.postMessage(
          {
            type: "metapilot:generate:result",
            requestId,
            text: "",
            ok: false,
            error: e instanceof Error ? e.message : t("course.dynamic.generateFailed"),
          },
          "*",
        )
      }
    })()
  }

  async function handleJudge() {
    if (judgingRef.current) return
    judgingRef.current = true
    setJudging(true)
    try {
      const r = await judgeInteractive({
        scenario: block.scenario ?? "",
        context: contextRef.current,
        blockTitle: block.title ?? "",
      })
      const next = { markdown: r.markdown, html: r.html }
      setResult(next)
      setSavedResult(next)
      setShowResult(true)
      // 结果保存到本交互块（lastResult），重做交互会覆盖旧结果
      if (block.id) {
        try {
          await api.updateBlock(block.id, {
            lastResult: { ...next, updatedAt: new Date().toISOString() },
          })
        } catch {
          /* 保存失败不阻断展示 */
        }
      }
      toast.success(t("course.dynamic.judgeDone"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("course.dynamic.judgeFailed"))
    } finally {
      judgingRef.current = false
      setJudging(false)
    }
  }

  // 监听 iframe 埋点消息（仅接受本 iframe 来源）
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const frame = frameRef.current
      if (!frame || e.source !== frame.contentWindow) return
      const data = e.data as Record<string, unknown> | null
      if (!data || typeof data !== "object") return
      switch (data.type) {
        case "metapilot:context:text":
          addContext({ type: "text", content: String(data.text ?? "") })
          break
        case "metapilot:context:image": {
          const dataUrl = String(data.dataUrl ?? "")
          if (!multimodal) {
            toast.warning(t("course.dynamic.noMultimodal"), { duration: 5000 })
            break
          }
          addContext({ type: "image", content: dataUrl })
          break
        }
        case "metapilot:generate:text":
          handleGenerate(data as { requestId?: string; prompt?: string; context?: string[] })
          break
        case "metapilot:finish":
          handleJudge()
          break
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, multimodal])

  if (!file) {
    return <p className="text-sm text-muted-foreground">{t("core.learn.interactiveNoFile")}</p>
  }

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-card",
          expanded && "fixed inset-4 z-50 flex flex-col shadow-2xl",
        )}
      >
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-3.5 text-primary" />
            {block.title ?? t("core.learn.interactiveFallback")}
            <Badge variant="outline" className="text-[10px]">
              {t("course.dynamic.dynamicBadge")}
            </Badge>
          </span>
          <div className="flex items-center gap-1">
            {savedResult && !judging && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => {
                  setResult(savedResult)
                  setShowResult(true)
                }}
              >
                <FileText className="size-3.5" />
                {t("course.dynamic.viewResult")}
              </Button>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={expanded ? t("core.learn.exitFullscreen") : t("core.learn.fullscreen")}
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </div>
        </div>
        <div className={cn("relative", expanded && "flex-1")}>
          <iframe
            ref={frameRef}
            src={`/api/plugins/course/assets/${collectionId}/${file}`}
            onLoad={measure}
            title={block.title ?? t("core.learn.interactiveTitle")}
            className={cn("w-full", expanded && "h-full")}
            style={{ height: expanded ? undefined : height }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
          {/* 右下角：结束并提交给 AI 评判（即使 HTML 未调用埋点接口也可手动结束） */}
          <div className="pointer-events-none absolute bottom-4 right-4 z-20">
            <Button
              size="sm"
              className="pointer-events-auto gap-1.5 shadow-lg"
              onClick={handleJudge}
              disabled={judging}
            >
              {judging ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {judging ? t("course.dynamic.judging") : t("course.dynamic.finishJudge")}
            </Button>
          </div>
        </div>
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

      {/* AI 评判结果展示页（兼容 Markdown 与 HTML 渲染） */}
      {showResult && result && (
        <InteractiveResultView
          title={block.title ?? t("course.dynamic.resultTitle")}
          result={result}
          onClose={() => setShowResult(false)}
        />
      )}
    </>
  )
}

function InteractiveResultView({
  title,
  result,
  onClose,
}: {
  title: string
  result: { markdown: string; html: string }
  onClose: () => void
}) {
  const t = useT()
  const [tab, setTab] = useState<"html" | "markdown">("html")
  return (
    <div className="fixed inset-4 z-[60] flex flex-col overflow-hidden rounded-lg border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <LayoutTemplate className="size-3.5 text-primary" />
          {title} · {t("course.dynamic.resultTitle")}
        </span>
        <div className="flex items-center gap-1">
          <div className="mr-2 flex overflow-hidden rounded-md border">
            <button
              onClick={() => setTab("html")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs",
                tab === "html" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              <LayoutTemplate className="size-3.5" />
              {t("course.dynamic.tabHtml")}
            </button>
            <button
              onClick={() => setTab("markdown")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs",
                tab === "markdown" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              <FileText className="size-3.5" />
              {t("course.dynamic.tabMarkdown")}
            </button>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("course.dynamic.closeResult")}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === "html" && result.html ? (
          <iframe
            srcDoc={result.html}
            sandbox="allow-scripts"
            title={t("course.dynamic.resultHtmlTitle")}
            className="h-full w-full border-0"
          />
        ) : (
          <div className="p-6">
            <MarkdownBlock content={result.markdown} />
          </div>
        )}
      </div>
    </div>
  )
}
